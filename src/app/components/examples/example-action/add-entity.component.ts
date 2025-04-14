import { Component, Inject, Input, OnDestroy, OnInit } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, Validators } from "@angular/forms";
import {
  AttributeScope,
  DialogComponent,
  EntitySearchDirection,
  EntityType,
  RelationTypeGroup,
} from "@shared/public-api";
import { AppState } from "@core/core.state";
import { Store } from "@ngrx/store";
import { WidgetContext } from "@home/models/widget-component.models";
import {
  AssetService,
  AttributeService,
  DeviceService,
  EntityRelationService,
} from "@core/public-api";
import { Asset } from "@shared/models/asset.models";
import { Device } from "@shared/models/device.models";
import { forkJoin, mergeMap, Observable, of, Subject, takeUntil } from "rxjs";
import { EntityId } from "@shared/models/id/entity-id";
import { EntityRelation } from "@shared/models/relation.models";
import { Router } from "@angular/router";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { AddEntityDialogData } from "../example-table/example-table.component";

@Component({
  selector: "tb-add-entity-action",
  templateUrl: "./add-entity.component.html",
  styleUrls: ["./add-entity.component.scss"],
})

/**
 * Component for adding a new entity. Provides form controls for entity details,
 * attributes, and relations. Handles form submission and cancellation.
 */
export class AddEntityComponent
  extends DialogComponent<AddEntityComponent, void>
  implements OnInit, OnDestroy
{
  @Input() ctx: WidgetContext;

  // @Input() dialogRef: DialogRef;
  public addEntityFormGroup: FormGroup;
  public allowedEntityTypes: EntityType[] = [
    EntityType.ASSET,
    EntityType.DEVICE,
  ];
  public readonly entityType = EntityType;
  public readonly entitySearchDirection = EntitySearchDirection;
  public step: number = 1;
  private destroy$ = new Subject<void>();

  /**
   * Constructor injecting required dependencies.
   * @param store - Application state store.
   * @param fb - Form builder for creating reactive forms.
   * @param router
   * @param dialogRef
   * @param deviceService - Service to manage device related operations.
   * @param assetService - Service to manage asset related operations.
   * @param attributeService - Service for saving entity attributes.
   * @param entityRelationService - Service for managing entity relations.
   * @param data - Data passed to the dialog.
   */
  constructor(
    protected store: Store<AppState>,
    private fb: FormBuilder,
    protected router: Router,
    public dialogRef: MatDialogRef<AddEntityComponent, void>,
    private deviceService: DeviceService,
    private assetService: AssetService,
    private attributeService: AttributeService,
    private entityRelationService: EntityRelationService,
    @Inject(MAT_DIALOG_DATA) public data: AddEntityDialogData
  ) {
    super(store, router, dialogRef);
    this.ctx = this.data.ctx;
  }

  /**
   * Initializes the component and creates the entity form group.
   */
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

  /**
   * Cleanup and release subscriptions.
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Getter for entity relations form array.
   * @returns The form array of relations.
   */
  public relations(): FormArray {
    return this.addEntityFormGroup.get("relations") as FormArray;
  }

  /**
   * Removes a relation from the form array at the specified index.
   * @param index - Index of the relation to be removed.
   */
  public removeRelation(index: number): void {
    this.relations().removeAt(index);
    this.relations().markAsDirty();
  }

  /**
   * Adds a new relation group to the form array.
   */
  public addRelation(): void {
    this.relations().push(
      this.fb.group({
        relatedEntity: [null, [Validators.required]],
        relationType: [null, [Validators.required]],
        direction: [null, [Validators.required]],
      })
    );
  }

  /**
   * Checks if the form is valid.
   * @returns True if the form is valid, false otherwise.
   */
  public save(): void {
    this.addEntityFormGroup.markAsPristine();
    this.saveEntityObservable()
      .pipe(
        mergeMap((entity: Asset | Device) =>
          forkJoin([
            this.saveAttributes(entity.id),
            this.saveRelations(entity.id),
          ])
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.ctx.updateAliases();
        this.dialogRef.close(null);
      });
  }

  /**
   * Saves the entity along with its attributes and relations.
   * Marks form as pristine after submission.
   */
  public next(): void {
    this.addEntityFormGroup.markAsPristine();
    this.saveEntityObservable()
      .pipe(
        mergeMap((entity: Asset | Device) =>
          forkJoin([
            this.saveAttributes(entity.id),
            this.saveRelations(entity.id),
          ])
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.ctx.updateAliases();
        this.dialogRef.close(null);
      });
  }

  /**
   * Closes the dialog without saving the entity.
   */
  public cancel(): void {
    this.dialogRef.close(null);
  }

  /**
   * Saves the entity using assetService or deviceService based on entity type.
   * @returns Observable of the saved entity.
   */
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

  /**
   * Saves entity attributes if provided.
   * @param entityId - Identifier of the saved entity.
   * @returns Observable that resolves after the save operation.
   */
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
        attributesArray
      );
    }
    return of([]);
  }

  /**
   * Saves entity relations.
   * @param entityId - Identifier of the saved entity.
   * @returns Observable of saved entity relations.
   */
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
