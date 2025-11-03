import { Component, Input, OnDestroy, OnInit } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, Validators } from "@angular/forms";
import { AttributeScope, BaseData, EntitySearchDirection, EntityType, PageComponent, RelationTypeGroup } from "@shared/public-api";
import { AppState } from "@core/core.state";
import { Store } from "@ngrx/store";
import { WidgetContext } from "@home/models/widget-component.models";
import { DialogRef } from "@angular/cdk/dialog";
import { AssetService, CustomerService, AttributeService, DeviceService, EntityRelationService } from "@core/public-api";
import { Asset } from "@shared/models/asset.models";
import { Device } from "@shared/models/device.models";
import { forkJoin, mergeMap, Observable, of, Subject, takeUntil } from "rxjs";
import { EntityId } from "@shared/models/id/entity-id";
import { EntityRelation } from "@shared/models/relation.models";
import { GeocodingService } from "../../../services/geocoding.service";

@Component({
  selector: "tb-add-entity-action",
  templateUrl: "./add-entity.component.html",
  styleUrls: ["./add-entity.component.scss"],
})
export class AddEntityComponent extends PageComponent implements OnInit, OnDestroy {
  @Input() ctx: WidgetContext;
  @Input() dialogRef: DialogRef;
  @Input() title?: string;

  public addEntityFormGroup: FormGroup;
  public allowedEntityTypes: EntityType[] = [EntityType.ASSET, EntityType.DEVICE];
  public readonly entityType = EntityType;
  public readonly entitySearchDirection = EntitySearchDirection;
  public isGeocoding = false;
  protected readonly EntityType = EntityType;
  private destroy$ = new Subject<void>();

  constructor(
    protected store: Store<AppState>,
    private fb: FormBuilder,
    private deviceService: DeviceService,
    private assetService: AssetService,
    private attributeService: AttributeService,
    private entityRelationService: EntityRelationService,
    private customerService: CustomerService,
    private geocodingService: GeocodingService
  ) {
    super(store);
  }

  ngOnInit(): void {
    this.addEntityFormGroup = this.fb.group({
      entityName: ["", [Validators.required]],
      entityType: [EntityType.ASSET],
      entityLabel: [null],
      type: ["Plant", [Validators.required]],
      ownerId: [null],
      attributes: this.fb.group({
        latitude: [null],
        longitude: [null],
        address: [null],
        isActive: [true],
      }),
      relations: this.fb.array([]),
    });
  }

  onOwnerChanged(entity: BaseData<EntityId> | null) {
    const id = entity?.id?.id ?? null;
    if (id) {
      this.addEntityFormGroup.patchValue({ ownerId: id });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public relations(): FormArray {
    return this.addEntityFormGroup.get("relations") as FormArray;
  }

  public removeRelation(index: number): void {
    this.relations().removeAt(index);
    this.relations().markAsDirty();
  }

  public addRelation(): void {
    this.relations().push(
      this.fb.group({
        relatedEntity: [null, [Validators.required]],
        relationType: [null, [Validators.required]],
        direction: [null, [Validators.required]],
      })
    );
  }

  public save(): void {
    this.addEntityFormGroup.markAsPristine();
    this.saveEntityObservable()
      .pipe(
        mergeMap((entity: Asset | Device) => forkJoin([this.saveAttributes(entity.id), this.saveRelations(entity.id)])),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.ctx.updateAliases();
        this.dialogRef.close(null);
      });
  }

  public cancel(): void {
    this.dialogRef.close(null);
  }

  async geocodeAddress(): Promise<void> {
    this.isGeocoding = true;
    try {
      const address = this.addEntityFormGroup.get("attributes.address")?.value?.trim();
      if (!address) return;

      const coords = await this.geocodingService.geocodeAddress(address);
      if (coords) {
        this.addEntityFormGroup.patchValue({
          attributes: {
            latitude: coords.lat,
            longitude: coords.lon,
          },
        });
      }
    } finally {
      this.isGeocoding = false;
    }
  }

  private saveEntityObservable(): Observable<Asset | Device> {
    const formValues = this.addEntityFormGroup.value;
    const entity = {
      name: formValues.entityName,
      type: formValues.type,
      label: formValues.entityLabel,
    };
    if (formValues.entityType === EntityType.ASSET) {
      return this.assetService.saveAsset(entity);
    } else if (formValues.entityType === EntityType.DEVICE) {
      return this.deviceService.saveDevice(entity);
    }
  }

  private saveAttributes(entityId: EntityId): Observable<any> {
    const attributes = this.addEntityFormGroup.get("attributes").value;
    const attributesArray = [];
    for (const key in attributes) {
      if (attributes[key] !== null) {
        attributesArray.push({ key, value: attributes[key] });
      }
    }
    if (attributesArray.length > 0) {
      return this.attributeService.saveEntityAttributes(entityId, AttributeScope.SERVER_SCOPE, attributesArray);
    }
    return of([]);
  }

  private saveRelations(entityId: EntityId): Observable<EntityRelation[]> {
    const relations = this.addEntityFormGroup.get("relations").value;
    const tasks: Observable<EntityRelation>[] = [];
    for (const newRelation of relations) {
      const relation: EntityRelation = {
        type: newRelation.relationType,
        typeGroup: RelationTypeGroup.COMMON,
        to: null,
        from: null,
      };

      if (newRelation.direction === EntitySearchDirection.FROM) {
        relation.to = newRelation.relatedEntity;
        relation.from = entityId;
      } else {
        relation.to = entityId;
        relation.from = newRelation.relatedEntity;
      }
      tasks.push(this.entityRelationService.saveRelation(relation));
    }

    if (tasks.length > 0) {
      return forkJoin(tasks);
    }
    return of([]);
  }
}
