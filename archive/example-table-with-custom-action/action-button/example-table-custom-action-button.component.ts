import { Component, Inject, Input, OnDestroy, OnInit } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, Validators } from "@angular/forms";
import {
  AttributeScope,
  DatasourceType,
  DialogComponent,
  EntitySearchDirection,
  EntityType,
  RelationTypeGroup,
  widgetType,
} from "@shared/public-api";
import { AppState } from "@core/core.state";
import { Store } from "@ngrx/store";
import { WidgetContext } from "@home/models/widget-component.models";
import {
  AssetService,
  AttributeService,
  DeviceService,
  EntityRelationService,
  IWidgetSubscription,
  SubscriptionInfo,
  WidgetSubscription,
} from "@core/public-api";
import { Asset } from "@shared/models/asset.models";
import { Device } from "@shared/models/device.models";
import { forkJoin, mergeMap, Observable, of, Subject } from "rxjs";
import { EntityId } from "@shared/models/id/entity-id";
import { EntityRelation } from "@shared/models/relation.models";
import { Router } from "@angular/router";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { TableAddEntityDialogData } from "../table/example-table-custom-action.component";

@Component({
  selector: "tb-example-table-custom-action-button",
  templateUrl: "./example-table-custom-action-button.component.html",
  styleUrls: ["./example-table-custom-action-button.component.scss"],
})
export class ExampleTableCustomActionButtonComponent
  extends DialogComponent<ExampleTableCustomActionButtonComponent, void>
  implements OnInit, OnDestroy
{
  @Input() ctx: WidgetContext;

  // @Input() dialogRef: DialogRef;

  private destroy$ = new Subject<void>();

  public addEntityFormGroup: FormGroup;
  public allowedEntityTypes: EntityType[] = [
    EntityType.ASSET,
    EntityType.DEVICE,
  ];
  public readonly entityType = EntityType;
  public readonly entitySearchDirection = EntitySearchDirection;

  public step = 1;
  public currentEntity: Asset | Device;
  public hasLocation = false;
  public locationSubscription: IWidgetSubscription;

  constructor(
    protected store: Store<AppState>,
    private fb: FormBuilder,
    protected router: Router,
    public dialogRef: MatDialogRef<
      ExampleTableCustomActionButtonComponent,
      void
    >,
    private deviceService: DeviceService,
    private assetService: AssetService,
    private attributeService: AttributeService,
    private entityRelationService: EntityRelationService,
    @Inject(MAT_DIALOG_DATA) public data: TableAddEntityDialogData,
  ) {
    super(store, router, dialogRef);
    this.ctx = this.data.ctx;
  }

  ngOnInit(): void {
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
    attributesArray.push(
      { key: "xPos", value: 0.5 },
      { key: "yPos", value: 0.5 },
    );
    return this.attributeService.saveEntityAttributes(
      entityId,
      AttributeScope.SERVER_SCOPE,
      attributesArray,
    );
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

  public next(): void {
    this.addEntityFormGroup.markAsPristine();
    this.saveEntityObservable()
      .pipe(
        mergeMap((entity) => {
          this.currentEntity = entity;
          return forkJoin([
            this.saveAttributes(entity.id),
            this.createLocationSubscription(),
          ]);
        }),
      )
      .subscribe((result) => {
        this.locationSubscription = result[1];
        this.step = 2;
      });
  }

  private createLocationSubscription() {
    const subscriptionInfo: SubscriptionInfo = {
      type: DatasourceType.entity,
      entityType: this.currentEntity.id.entityType,
      entityId: this.currentEntity.id.id,
      attributes: [{ name: "xPos" }, { name: "yPos" }],
    };
    const options = {
      callbacks: {
        onDataUpdated: (subscription) => {
          this.checkHasLocation(subscription.data);
        },
      },
    };
    return this.ctx.subscriptionApi.createSubscriptionFromInfo(
      widgetType.latest,
      [subscriptionInfo],
      options,
      false,
      true,
    );
  }

  private checkHasLocation(data) {
    let hasLocation = false;
    if (data.length === 2) {
      let xPos, yPos;
      for (let i = 0; i < data.length; i++) {
        let datasourceData = data[i];
        if (datasourceData.dataKey.name === "xPos") {
          xPos = datasourceData.data[0][1];
        } else if (datasourceData.dataKey.name === "yPos") {
          yPos = datasourceData.data[0][1];
        }
      }
      hasLocation = true;
    }
    this.hasLocation = hasLocation;
  }

  public cancel(): void {
    this.dialogRef.close(null);
  }

  public submit() {
    this.cancelLocationSubscription();
    this.ctx.updateAliases();
    this.dialogRef.close(null);
  }

  private cancelLocationSubscription() {
    if (this.locationSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.locationSubscription.id);
      this.locationSubscription = null;
    }
  }
}
