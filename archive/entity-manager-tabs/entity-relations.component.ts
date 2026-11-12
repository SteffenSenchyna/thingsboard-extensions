///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///


import { ChangeDetectorRef, Component, DestroyRef, Input, OnChanges, SimpleChanges, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, forkJoin, of, throwError } from "rxjs";
import { catchError, switchMap } from "rxjs/operators";
import { EntityId, EntityRelation, EntityType, RelationTypeGroup, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { CardComponent } from "../../../components/shared/card/card.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { QUIET_REQUEST, apiMessage } from "../../../components/shared/value-utils";
import { OrganizationNotices } from "../../../components/shared/organization/organization-store";
import { RelationRow } from "./entity-tabs.models";

const WAYS: TbSelectOption[] = [
  { value: "from", label: "Out — this contains / relates to it" },
  { value: "to", label: "In — it contains / relates to this" },
];
const OTHER_TYPES: TbSelectOption[] = [
  { value: EntityType.DEVICE, label: "Device" },
  { value: EntityType.ASSET, label: "Asset" },
  { value: EntityType.CUSTOMER, label: "Customer" },
];
const TYPE_NAMES: Record<string, string> = { DEVICE: "Device", ASSET: "Asset", CUSTOMER: "Customer", INTEGRATION: "Integration", TENANT: "Tenant", DASHBOARD: "Dashboard" };

/**
 * An entity's Relations tab: its relations out (this → the other end) and in
 * (the other end → this) — their type, the other end — each removable
 * (confirmed), and "Add relation": the way, the type ("Contains" first) and
 * the other end, a device / asset / customer by its exact name.
 */
@Component({
  selector: "tb-entity-relations",
  templateUrl: "./entity-relations.component.html",
  styleUrls: ["./entity-relations.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, DataTableComponent, DataTableCellDirective, CardComponent, SelectComponent, ConfirmDialogComponent, TableLinksComponent],
})
export class EntityRelationsComponent implements OnChanges {
  @Input() ctx!: WidgetContext;
  @Input() entityId!: EntityId;
  @Input() notices: OrganizationNotices | null = null;

  rows: RelationRow[] = [];
  loading = true;
  readonly columns: DataTableColumn[] = [
    { key: "way", header: "Way" },
    { key: "type", header: "Type", maxWidth: "110px" },
    { key: "otherName", header: "With", maxWidth: "150px", subtitleKey: "otherTypeName" },
    { key: "remove", header: "", align: "right", sortable: false },
  ];
  readonly ways = WAYS;
  readonly otherTypes = OTHER_TYPES;

  adding = false;
  saving = false;
  removeRow: RelationRow | null = null;

  private readonly fb = inject(FormBuilder);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly form = this.fb.nonNullable.group({
    way: ["from"],
    type: ["Contains", Validators.required],
    otherType: [EntityType.DEVICE as string],
    otherName: ["", Validators.required],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["entityId"]) {
      this.adding = false;
      this.load();
    }
  }

  load(): void {
    this.loading = true;
    const rs = this.ctx.entityRelationService;
    forkJoin([
      rs.findInfoByFrom(this.entityId, QUIET_REQUEST).pipe(catchError(() => of([]))),
      rs.findInfoByTo(this.entityId, QUIET_REQUEST).pipe(catchError(() => of([]))),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([out, into]) => {
        const row = (r: any, direction: "from" | "to"): RelationRow & { otherTypeName: string } => {
          const other = direction === "from" ? r.to : r.from;
          return {
            id: `${direction}|${r.type}|${other.entityType}|${other.id}`,
            direction,
            way: direction === "from" ? "Out" : "In",
            type: r.type,
            otherType: other.entityType,
            otherTypeName: TYPE_NAMES[other.entityType] ?? other.entityType,
            otherId: other.id,
            otherName: (direction === "from" ? r.toName : r.fromName) || other.id,
          };
        };
        this.rows = [...out.map((r) => row(r, "from")), ...into.map((r) => row(r, "to"))];
        this.loading = false;
        this.cd.detectChanges();
      });
  }

  openAdd(): void {
    this.adding = true;
    this.form.reset({ way: "from", type: "Contains", otherType: EntityType.DEVICE, otherName: "" });
  }

  /** The other end, by its exact name: a tenant device / asset, or a customer by its title. */
  private findOther(type: string, name: string): Observable<EntityId> {
    const n = encodeURIComponent(name);
    const url =
      type === EntityType.DEVICE ? `/api/tenant/device?deviceName=${n}` : type === EntityType.ASSET ? `/api/tenant/asset?assetName=${n}` : `/api/tenant/customers?customerTitle=${n}`;
    return this.ctx.http.get<any>(url, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
      switchMap((e) => (e?.id?.id ? of({ entityType: type, id: e.id.id } as EntityId) : throwError(() => new Error(`no ${type.toLowerCase()} named ${name}`)))),
      catchError(() => throwError(() => new Error(`there's no ${(TYPE_NAMES[type] ?? type).toLowerCase()} named ${name}`)))
    );
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving = true;
    this.findOther(v.otherType, v.otherName.trim())
      .pipe(
        switchMap((other) => {
          const relation: EntityRelation = {
            from: v.way === "from" ? this.entityId : other,
            to: v.way === "from" ? other : this.entityId,
            type: v.type.trim(),
            typeGroup: RelationTypeGroup.COMMON,
          };
          return this.ctx.entityRelationService.saveRelation(relation, QUIET_REQUEST);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.adding = false;
          this.notices?.success(`${v.type} relation added`);
          this.load();
        },
        error: (err) => {
          this.saving = false;
          this.notices?.error(`Couldn't add the relation: ${err?.message ?? apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  confirmRemove(): void {
    const r = this.removeRow;
    this.removeRow = null;
    if (!r) {
      return;
    }
    const other = { entityType: r.otherType, id: r.otherId } as EntityId;
    const [from, to] = r.direction === "from" ? [this.entityId, other] : [other, this.entityId];
    this.ctx.entityRelationService
      .deleteRelation(from, r.type, to, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notices?.success(`${r.type} relation removed`);
          this.load();
        },
        error: (err) => this.notices?.error(`Couldn't remove the relation${apiMessage(err)}`),
      });
  }
}
