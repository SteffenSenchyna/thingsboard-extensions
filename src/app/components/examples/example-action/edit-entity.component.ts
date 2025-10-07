import { Component, Input, OnDestroy, OnInit } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, Validators } from "@angular/forms";
import { AliasEntityType, AttributeScope, EntitySearchDirection, EntityType, PageComponent, RelationTypeGroup } from "@shared/public-api";
import { AppState } from "@core/core.state";
import { Store } from "@ngrx/store";
import { WidgetContext } from "@home/models/widget-component.models";
import { DialogRef } from "@angular/cdk/dialog";
import { AssetService, AttributeService, CustomerService, DeviceService, EntityRelationService } from "@core/public-api";
import { Asset } from "@shared/models/asset.models";
import { Device } from "@shared/models/device.models";
import { forkJoin, mergeMap, Observable, of, Subject, takeUntil } from "rxjs";
import { EntityId } from "@shared/models/id/entity-id";
import { EntityRelation } from "@shared/models/relation.models";

@Component({
  selector: "tb-edit-entity-action",
  templateUrl: "./edit-entity.component.html",
  styleUrls: ["./edit-entity.component.scss"],
})
export class EditEntityComponent extends PageComponent implements OnInit, OnDestroy {
  @Input() ctx: WidgetContext;
  @Input() dialogRef: DialogRef;
  @Input() entityId?: EntityId;

  public editEntityFormGroup: FormGroup;
  public readonly entityType = EntityType;
  public readonly entitySearchDirection = EntitySearchDirection;

  private destroy$ = new Subject<void>();
  private attributesCache: Record<string, any> = {};
  private entity: Asset | Device | null = null;

  constructor(
    protected store: Store<AppState>,
    private fb: FormBuilder,
    private deviceService: DeviceService,
    private assetService: AssetService,
    private attributeService: AttributeService,
    private entityRelationService: EntityRelationService,
    private customerService: CustomerService
  ) {
    super(store);
  }

  ngOnInit(): void {
    this.editEntityFormGroup = this.fb.group({
      entityName: ["", [Validators.required]],
      entityType: [EntityType.DEVICE],
      entityLabel: [null],
      type: ["", [Validators.required]],

      // customer selection and display
      customerId: [null], // used to assign/unassign on save
      attributes: this.fb.group({
        latitude: [null],
        longitude: [null],
        address: [null],

        ownerName: [{ value: null, disabled: true }], // read-only; resolved via CustomerService
        number: [null, [Validators.pattern(/^-?[0-9]+$/)]],
        booleanValue: [null],
      }),

      relations: this.fb.array([]),
    });

    if (this.entityId) this.loadEntity();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public relations(): FormArray {
    return this.editEntityFormGroup.get("relations") as FormArray;
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
    this.editEntityFormGroup.markAsPristine();

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

  private loadEntity(): void {
    const id = this.entityId;
    const type = id?.entityType;
    if (!id || !type) {
      this.dialogRef.close({ error: "Missing entityId or entityType" });
      return;
    }

    forkJoin([
      this.entityRelationService.findInfoByFrom(id),
      this.entityRelationService.findInfoByTo(id),
      this.attributeService.getEntityAttributes(id, AttributeScope.SERVER_SCOPE),
      this.getEntityByType(type, id.id),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([relsFrom, relsTo, attrs, ent]: any[]) => {
        this.getAttributes(attrs);
        this.getRelations(relsFrom, relsTo);
        this.entity = ent;
        this.editEntityFormGroup.patchValue(
          {
            entityName: ent?.name ?? "",
            entityType: type,
            entityLabel: ent?.label ?? null,
            type: ent?.type ?? "",
            attributes: this.attributesCache,
          },
          { emitEvent: false }
        );
        this.getOwner();
      });
  }

  private getEntityByType(type: EntityType | AliasEntityType, id: string) {
    if (type === EntityType.DEVICE) {
      return this.deviceService.getDevice(id);
    } else if (type === EntityType.ASSET) {
      return this.assetService.getAsset(id);
    }
    return of(null);
  }

  private getAttributes(kvs: Array<{ key: string; value: any }>) {
    this.attributesCache = {};
    const attrGroup = this.editEntityFormGroup.get("attributes") as FormGroup;
    for (const { key, value } of kvs) {
      this.attributesCache[key] = value;
      const ctrl = attrGroup.get(key);
      if (ctrl) ctrl.setValue(value, { emitEvent: false });
    }
  }

  private getRelations(relsFrom: any[], relsTo: any[]) {
    this.relations().clear();

    for (const r of relsFrom) {
      this.relations().push(
        this.fb.group({
          relatedEntity: [r.to, [Validators.required]],
          relationType: [r.type, [Validators.required]],
          direction: [EntitySearchDirection.FROM, [Validators.required]],
        })
      );
    }

    for (const r of relsTo) {
      this.relations().push(
        this.fb.group({
          relatedEntity: [r.from, [Validators.required]],
          relationType: [r.type, [Validators.required]],
          direction: [EntitySearchDirection.TO, [Validators.required]],
        })
      );
    }

    this.relations().markAsPristine();
  }

  private saveEntityObservable(): Observable<Asset | Device> {
    const v = this.editEntityFormGroup.value;
    this.entity.name = v.entityName;
    this.entity.type = v.type;
    this.entity.label = v.entityLabel;
    if (v.entityType === EntityType.ASSET) {
      return this.assetService.saveAsset(this.entity as Asset);
    } else if (v.entityType === EntityType.DEVICE) {
      return this.deviceService.saveDevice(this.entity as Device);
    }
    return of(null as any);
  }

  private saveAttributes(entityId: EntityId): Observable<any> {
    const attributes = this.editEntityFormGroup.get("attributes")?.value ?? {};
    const attributesArray: Array<{ key: string; value: any }> = [];

    for (const key in attributes) {
      if (key === "ownerName") continue;
      const val = attributes[key];
      if (val !== null && val !== undefined) {
        attributesArray.push({ key, value: val });
      }
    }

    if (attributesArray.length > 0) {
      return this.attributeService.saveEntityAttributes(entityId, AttributeScope.SERVER_SCOPE, attributesArray);
    }
    return of([]);
  }

  private saveRelations(entityId: EntityId): Observable<EntityRelation[]> {
    const rels = this.editEntityFormGroup.get("relations")?.value ?? [];
    const tasks: Observable<EntityRelation>[] = [];

    for (const newRelation of rels) {
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

  // private saveCustomerAssignment(): Observable<any> {
  //   if (!this.entityId) return of(null);
  //
  //   const desiredId: string | null = this.editEntityFormGroup.get("customerId")?.value ?? null;
  //   const currentId: string | null = this.currentCustomerId;
  //
  //   if (desiredId === currentId) return of(null);
  //
  //   const et = this.entityId.entityType;
  //   const eid = this.entityId.id;
  //
  //   if (et === EntityType.DEVICE) {
  //     return desiredId ? this.deviceService.assignDeviceToCustomer(desiredId, eid) : this.deviceService.unassignDeviceFromCustomer(eid);
  //   } else if (et === EntityType.ASSET) {
  //     return desiredId ? this.assetService.assignAssetToCustomer(desiredId, eid) : this.assetService.unassignAssetFromCustomer(eid);
  //   }
  //   return of(null);
  // }

  private getOwner() {
    const ctrl = this.editEntityFormGroup.get("attributes.ownerName");
    const customerId = this.entity.customerId.id;
    this.customerService
      .getCustomer(customerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => {
          const name = c?.title || c?.name || null;
          ctrl?.setValue(name, { emitEvent: false });
          this.ctx.detectChanges?.(true);
        },
        error: () => {
          ctrl?.setValue(null, { emitEvent: false });
        },
      });
  }
}
