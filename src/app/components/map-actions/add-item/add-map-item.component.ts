import { Component, Input, OnDestroy, OnInit } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, Validators } from "@angular/forms";
import {
  AttributeScope,
  EntityInfo,
  EntitySearchDirection,
  EntityType,
  PageComponent,
  RelationTypeGroup,
} from "@shared/public-api";
import { AppState } from "@core/core.state";
import { Store } from "@ngrx/store";
import { WidgetContext } from "@home/models/widget-component.models";
import { DialogRef } from "@angular/cdk/dialog";
import {
  AssetService,
  AttributeService,
  DeviceService,
  EntityService,
  EntityRelationService,
} from "@core/public-api";
import { Asset } from "@shared/models/asset.models";
import { Device } from "@shared/models/device.models";
import { forkJoin, mergeMap, Observable, of, Subject, takeUntil } from "rxjs";
import { EntityId } from "@shared/models/id/entity-id";
import { EntityRelation } from "@shared/models/relation.models";

@Component({
  selector: "tb-add-map-item",
  templateUrl: "./add-map-item.component.html",
  styleUrl: "./add-map-item.component.scss",
})
export class AddMapItemComponent
  extends PageComponent
  implements OnInit, OnDestroy
{
  @Input() ctx: WidgetContext & { mapInstance: any };

  @Input() dialogRef: DialogRef;
  @Input() shape: string;
  @Input() coords: any;

  public addEntityFormGroup: FormGroup;
  public allowedEntityTypes: EntityType[] = [
    EntityType.ASSET,
    EntityType.DEVICE,
  ];
  public readonly entityType = EntityType;
  public readonly entitySearchDirection = EntitySearchDirection;
  private destroy$ = new Subject<void>();
  private zoneId: EntityInfo;

  constructor(
    protected store: Store<AppState>,
    private fb: FormBuilder,
    private deviceService: DeviceService,
    private assetService: AssetService,
    private attributeService: AttributeService,
    private entityRelationService: EntityRelationService,
    private entityService: EntityService
  ) {
    super(store);
  }

  ngOnInit(): void {
    this.addEntityFormGroup = this.fb.group({
      entityName: ["", [Validators.required]],
      entityType: [EntityType.ASSET],
      entityLabel: [null],
      type: ["QC_Room", [Validators.required]],
      attributes: this.fb.group({
        latitude: [null],
        longitude: [null],
        address: [null],
        owner: [null],
        number: [null, [Validators.pattern(/^-?[0-9]+$/)]],
        booleanValue: [null],
      }),
    });
    const stateParams = this.ctx.stateController.getStateParams();
    console.log("stateParams:", stateParams);
    const entityAliases = this.ctx.aliasController.getEntityAliases();
    console.log("Available aliases:", entityAliases);
    const zoneEntry = Object.entries(entityAliases).find(
      ([key, aliasDef]) => aliasDef.alias === "zone"
    );
    const zoneAliasId = zoneEntry ? zoneEntry[0] : null;
    console.log("zoneAliasId resolved from alias list:", zoneAliasId);
    this.ctx.aliasController
      .getAliasInfo(zoneAliasId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((info) => {
        this.zoneId = info.currentEntity;
        console.log("Resolved zoneId:", this.zoneId);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public save(): void {
    this.addEntityFormGroup.markAsPristine();
    this.saveEntityObservable()
      .pipe(
        mergeMap((entity: Asset) =>
          forkJoin([
            this.saveAttributes(entity.id),
            this.saveRelation(entity.id),
          ])
        ),
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

  private saveEntityObservable(): Observable<Asset | Device> {
    const formValues = this.addEntityFormGroup.value;
    const baseEntity = {
      name: formValues.entityName,
      type: formValues.type,
      label: formValues.entityLabel,
    };
    return this.getCustomerId().pipe(
      mergeMap((ownerId) => {
        const entity = {
          ...baseEntity,
          customerId: ownerId,
        };
        if (formValues.entityType === EntityType.ASSET) {
          return this.assetService.saveAsset(entity);
        } else {
          return this.deviceService.saveDevice(entity);
        }
      })
    );
  }

  private saveAttributes(entityId: EntityId): Observable<any> {
    const formAttrs = this.addEntityFormGroup.get("attributes").value;
    const attributesArray: Array<{ key: string; value: any }> = [];
    if (this.shape === "Marker") {
      // @ts-ignore
      const mapType = (this.ctx as any).mapInstance.type();
      const latKey = mapType === "image" ? "xPos" : "latitude";
      const lonKey = mapType === "image" ? "yPos" : "longitude";
      attributesArray.push({ key: latKey, value: this.coords.x });
      attributesArray.push({ key: lonKey, value: this.coords.y });
    } else if (this.shape === "Rectangle" || this.shape === "Polygon") {
      attributesArray.push({ key: "perimeter", value: this.coords });
    } else if (this.shape === "Circle") {
      attributesArray.push({ key: "circle", value: this.coords });
    }
    for (const key in formAttrs) {
      const val = formAttrs[key];
      if (val !== null && val !== undefined) {
        attributesArray.push({ key, value: val });
      }
    }
    if (attributesArray.length > 0) {
      return this.attributeService.saveEntityAttributes(
        entityId,
        AttributeScope.SERVER_SCOPE,
        attributesArray
      );
    }
    return of([]);
  }

  private saveRelation(entityId: EntityId): Observable<EntityRelation[]> {
    const tasks: Observable<EntityRelation>[] = [];
    if (this.zoneId && entityId) {
      const relation: EntityRelation = {
        type: "Contains",
        typeGroup: RelationTypeGroup.COMMON,
        from: {
          id: this.zoneId.id,
          entityType: this.zoneId.entityType,
        },
        to: entityId,
      };
      tasks.push(this.entityRelationService.saveRelation(relation));
    }
    if (tasks.length > 0) {
      return forkJoin(tasks);
    }
    return of([]);
  }

  private getCustomerId() {
    const customerAliasId =
      this.ctx.aliasController.getEntityAliasId("customer");
    return this.ctx.aliasController.getAliasInfo(customerAliasId).pipe(
      this.ctx.rxjs.map((info) => ({
        id: info.currentEntity.id,
        entityType: info.currentEntity.entityType,
      }))
    );
  }
}
