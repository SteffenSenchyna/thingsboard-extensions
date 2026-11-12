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
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { of } from "rxjs";
import { catchError } from "rxjs/operators";
import { AttributeScope, EntityId, EntityType, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { CardComponent } from "../../../components/shared/card/card.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { QUIET_REQUEST, apiMessage } from "../../../components/shared/value-utils";
import { OrganizationNotices } from "../../../components/shared/organization/organization-store";
import { KeyValueRow, displayValue, keyValueRow, parseInputValue } from "./entity-tabs.models";

const SCOPES: SegmentOption[] = [
  { id: AttributeScope.SERVER_SCOPE, label: "Server", icon: "dns", tooltip: "Server attributes" },
  { id: AttributeScope.SHARED_SCOPE, label: "Shared", icon: "share", tooltip: "Shared attributes" },
  { id: AttributeScope.CLIENT_SCOPE, label: "Client", icon: "devices", tooltip: "Client attributes (the device's own: read-only)" },
];

/**
 * An entity's Attributes tab: a scope (Server | Shared | Client — an asset has
 * server attributes alone), its attributes (key, value, when), and — server and
 * shared — "Add attribute", a row to edit its value, Delete (confirmed). A
 * value typed in is stored as JSON when it parses (a number, true / false, an
 * object), else as the text.
 */
@Component({
  selector: "tb-entity-attributes",
  templateUrl: "./entity-attributes.component.html",
  styleUrls: ["./entity-attributes.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, DataTableComponent, SegmentedControlComponent, CardComponent, ConfirmDialogComponent, TableLinksComponent],
})
export class EntityAttributesComponent implements OnChanges {
  @Input() ctx!: WidgetContext;
  @Input() entityId!: EntityId;
  @Input() notices: OrganizationNotices | null = null;

  scope: AttributeScope = AttributeScope.SERVER_SCOPE;
  rows: KeyValueRow[] = [];
  loading = true;
  readonly columns: DataTableColumn[] = [
    { key: "key", header: "Key", maxWidth: "150px" },
    { key: "value", header: "Value", maxWidth: "170px" },
    { key: "when", header: "Updated", sortKey: "ts" },
  ];

  /** The editor: "add" (a new key) or the key edited; null when closed. */
  editing: string | null = null;
  readonly keyControl = new FormControl("", { nonNullable: true, validators: [Validators.required] });
  readonly valueControl = new FormControl("", { nonNullable: true });
  saving = false;
  deleteKey: string | null = null;

  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  get scopes(): SegmentOption[] {
    return this.entityId?.entityType === EntityType.DEVICE ? SCOPES : SCOPES.slice(0, 1);
  }

  /** The device's own (client) attributes are read-only here. */
  get editable(): boolean {
    return this.scope !== AttributeScope.CLIENT_SCOPE;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["entityId"]) {
      this.scope = AttributeScope.SERVER_SCOPE;
      this.closeEditor();
      this.load();
    }
  }

  selectScope(id: string): void {
    this.scope = id as AttributeScope;
    this.closeEditor();
    this.load();
  }

  load(): void {
    this.loading = true;
    this.ctx.attributeService
      .getEntityAttributes(this.entityId, this.scope, undefined, QUIET_REQUEST)
      .pipe(
        catchError(() => of([])),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((attrs) => {
        this.rows = attrs.map((a) => keyValueRow(a.key, a.value, a.lastUpdateTs)).sort((a, b) => a.key.localeCompare(b.key));
        this.loading = false;
        this.cd.detectChanges();
      });
  }

  openAdd(): void {
    this.editing = "add";
    this.keyControl.reset("");
    this.keyControl.enable();
    this.valueControl.reset("");
  }

  openRow(row: Record<string, any>): void {
    if (!this.editable) {
      return;
    }
    const r = row as KeyValueRow;
    this.editing = r.key;
    this.keyControl.reset(r.key);
    this.keyControl.disable();
    this.valueControl.reset(typeof r.raw === "string" ? r.raw : displayValue(r.raw));
  }

  closeEditor(): void {
    this.editing = null;
  }

  get canSave(): boolean {
    return !this.saving && !!this.keyControl.value.trim() && (this.editing === "add" || this.valueControl.dirty);
  }

  save(): void {
    if (!this.canSave) {
      return;
    }
    const key = this.keyControl.value.trim();
    this.saving = true;
    this.ctx.attributeService
      .saveEntityAttributes(this.entityId, this.scope, [{ key, value: parseInputValue(this.valueControl.value) }], QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.notices?.success(`${key} saved`);
          this.closeEditor();
          this.load();
        },
        error: (err) => {
          this.saving = false;
          this.notices?.error(`Couldn't save ${key}${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  confirmDelete(): void {
    const key = this.deleteKey;
    this.deleteKey = null;
    if (!key) {
      return;
    }
    this.ctx.attributeService
      .deleteEntityAttributes(this.entityId, this.scope, [{ key, value: null }], QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notices?.success(`${key} deleted`);
          this.closeEditor();
          this.load();
        },
        error: (err) => this.notices?.error(`Couldn't delete ${key}${apiMessage(err)}`),
      });
  }
}
