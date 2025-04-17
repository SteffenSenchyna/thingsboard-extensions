import { Component, Input, OnDestroy, OnInit } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, Validators } from "@angular/forms";
import {
  AttributeScope,
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
  EntityRelationService,
  StateParams,
} from "@core/public-api";
import { Asset } from "@shared/models/asset.models";
import { Device } from "@shared/models/device.models";
import { forkJoin, mergeMap, Observable, of, Subject, takeUntil } from "rxjs";
import { EntityId } from "@shared/models/id/entity-id";
import { EntityRelation } from "@shared/models/relation.models";

export type QCDeviceType =
  | "QC_Gateway"
  | "QC_RoomSensor"
  | "QC_TemperatureSensor"
  | "QC_DoorSensor"
  | "QC_WindowSensor"
  | "QC_LeakSensor"
  | "QC_SmokeSensor";

export interface AllowedDeviceType {
  name: string;
  type: QCDeviceType;
}

@Component({
  selector: "tb-add-room-action",
  templateUrl: "./add-room.component.html",
  styleUrls: ["./add-room.component.scss"],
})
export class AddRoomComponent
  extends PageComponent
  implements OnInit, OnDestroy
{
  @Input() ctx: WidgetContext;

  @Input() dialogRef: DialogRef;
  public addEntityFormGroup: FormGroup;
  public allowedEntityTypes: EntityType[] = [
    EntityType.ASSET,
    EntityType.DEVICE,
  ];
  public allowedDeviceTypes: AllowedDeviceType[] = [
    { name: "Gateway", type: "QC_Gateway" },
    { name: "Room sensor", type: "QC_RoomSensor" },
    { name: "Temperature sensor", type: "QC_TemperatureSensor" },
    { name: "Door sensor", type: "QC_DoorSensor" },
    { name: "Window sensor", type: "QC_WindowSensor" },
    { name: "Leak sensor", type: "QC_LeakSensor" },
    { name: "Smoke sensor", type: "QC_SmokeSensor" },
  ];
  public readonly entityType = EntityType;
  public readonly entitySearchDirection = EntitySearchDirection;
  private params: StateParams;
  private parentEntityName: string;
  private parentEntityId: EntityId;
  private destroy$ = new Subject<void>();

  constructor(
    protected store: Store<AppState>,
    private fb: FormBuilder,
    private deviceService: DeviceService,
    private assetService: AssetService,
    private attributeService: AttributeService,
    private entityRelationService: EntityRelationService,
  ) {
    super(store);
  }

  ngOnInit(): void {
    this.params = this.ctx.stateController.getStateParams();
    this.parentEntityId = this.params["zone"].entityId;
    this.parentEntityName = this.params["zone"].entityName;

    this.addEntityFormGroup = this.fb.group({
      entityName: ["", [Validators.required]],
      entityType: [EntityType.DEVICE],
      entityLabel: [null],
      type: ["", [Validators.required]],
      attributes: this.fb.group({
        latitude: [null],
        longitude: [null],
        address: [null],
        owner: [null],
        number: [null, [Validators.pattern(/^-?[0-9]+$/)]],
        booleanValue: [null],
      }),
      relations: this.fb.array([]),
    });
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
      }),
    );
  }

  public save(): void {
    this.addEntityFormGroup.markAsPristine();
    this.saveEntityObservable()
      .pipe(
        mergeMap((entity: Asset | Device) =>
          forkJoin([
            this.saveAttributes(entity.id),
            this.saveRelations(entity.id),
          ]),
        ),
        takeUntil(this.destroy$),
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
      return this.attributeService.saveEntityAttributes(
        entityId,
        AttributeScope.SERVER_SCOPE,
        attributesArray,
      );
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
