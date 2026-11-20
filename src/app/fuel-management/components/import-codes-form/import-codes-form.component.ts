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
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AbstractControl, FormBuilder, FormGroup } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { CardComponent } from "../../../components/shared/card/card.component";
import { DataTableColumn } from "../../../components/shared/data-table/data-table.component";
import { DetailTableComponent } from "../../../components/shared/detail-table/detail-table.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { plantsPickedText } from "../../../components/shared/organization/organization.models";
import { SETTING_PIECES } from "../../../components/shared/setting-object/setting-object.component";
import { StationReadinessComponent } from "../station-readiness/station-readiness.component";
import {
  CODE_KINDS,
  CodeKind,
  CodeRoom,
  codeKindLabel,
  IMPORT_PROBLEM_LABELS,
  IMPORT_READY_LABEL,
  ImportCodeLine,
  ImportCodesRequest,
  markImportLimits,
  parseCodeImport,
  PlcRow,
} from "../../models/fuel-management.models";

/**
 * Form for importing a pasted list of access codes: the plants they work at
 * (the plant tree, as the create form's — {@link plantsChange}; the dashboard
 * feeds back the pick's room and PLCs) and a text box the list is pasted
 * into — one code per line, `code, name, type` (User / Vehicle), as
 * {@link parseCodeImport} reads it (its format in the label's info bubble). The
 * preview — a panel's list (`tb-detail-table`) — shows every line grouped by
 * what becomes of it: ready, or why it will be skipped (not 6 digits, no name
 * or type, a repeat, already in use, past the pick's room);
 * the pick's stations show their readiness for the lists in the paste, as in
 * the assign form. Emits {@link submitted} with the ready lines; the dashboard creates
 * them one after another and reports its progress through {@link progress}.
 * The form resets whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-import-codes-form",
  templateUrl: "./import-codes-form.component.html",
  styleUrls: ["./import-codes-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    CalloutComponent,
    CardComponent,
    DetailTableComponent,
    FilterListComponent,
    FormActionsComponent,
    StationReadinessComponent,
    ...SETTING_PIECES,
  ],
})
export class ImportCodesFormComponent implements OnChanges {
  /** The plants they work at (ids), the plant tree to pick them in, and how many plants there are. */
  @Input() plantIds: string[] = [];
  @Input() plantOptions: FilterListOption[] = [];
  @Input() plantTotal = 0;
  /** Codes already in use anywhere — a pasted one among them is skipped. */
  @Input() takenCodes: string[] = [];
  /** Change to reset the form (e.g. each time the panel opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  /** While saving: how many of the codes have been created so far. */
  @Input() progress: { done: number; total: number } | null = null;
  /** The pick's room — lines past it are skipped — and where it is, for the reason. */
  @Input() room: CodeRoom | null = null;
  @Input() scopeName = "";
  /** The pick's PLCs — every code goes to each; their readiness is shown per the selected list. */
  @Input() plcs: PlcRow[] = [];
  @Input() plcsLoading = false;
  @Output() submitted = new EventEmitter<ImportCodesRequest>();
  @Output() cancelled = new EventEmitter<void>();
  /** Other plants were ticked. */
  @Output() plantsChange = new EventEmitter<string[]>();

  /** The paste box's format (its label's info bubble). */
  readonly formatNote = "One code a line: its 6 digits, the holder's name, then User or Vehicle — 123456, Jane Smith, User.";
  /** A preview entry: the holder (else the code), the code, its list — and what becomes of it, the list's groups ("Ready", "Already in use"). */
  readonly previewColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "code", header: "Code" },
    { key: "kind", header: "Type" },
    { key: "status", header: "Status" },
  ];
  /** The paste, parsed ({@link parseCodeImport}) and checked against the market's room. */
  lines: ImportCodeLine[] = [];
  /** {@link lines} as the preview's entries. */
  previewRows: Record<string, unknown>[] = [];
  /** The lists the ready lines go to (users first), for the stations' readiness pills. */
  importKinds: CodeKind[] = ["users"];

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      plants: [[] as string[], (c: AbstractControl) => ((c.value as string[] | null)?.length ? null : { required: true })],
      text: [""],
    });
  }

  /** The plants ticked (ids). */
  get plants(): string[] {
    return this.form.controls["plants"].value as string[];
  }

  /** Under the tree: how many plants are ticked, of all of them. */
  get plantsText(): string {
    return plantsPickedText(this.plants.length, this.plantTotal);
  }

  /** Other plants ticked: the dashboard works out their room and stations. */
  setPlants(ids: string[]): void {
    this.form.controls["plants"].setValue(ids);
    this.plantsChange.emit(ids);
  }

  /** The lines that will be imported. */
  get ready(): ImportCodeLine[] {
    return this.lines.filter((l) => !l.problem);
  }

  /** How many lines the market has no room for, as a sentence (null when every line fits). */
  get limitReason(): string | null {
    const over = this.lines.filter((l) => l.problem === "overLimit").length;
    if (!over || !this.room) {
      return null;
    }
    const where = this.scopeName ? `the stations at ${this.scopeName}` : "the stations";
    return over === 1 ? `1 code won't fit ${where} and will be skipped.` : `${over} codes won't fit ${where} and will be skipped.`;
  }

  get canSubmit(): boolean {
    return this.form.valid && this.ready.length > 0 && !this.saving;
  }

  get submitLabel(): string {
    if (this.saving) {
      return this.progress ? `Importing ${this.progress.done} of ${this.progress.total}…` : "Importing…";
    }
    const n = this.ready.length;
    return n === 1 ? "Import 1 code" : n ? `Import ${n} codes` : "Import codes";
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"]) {
      this.form.reset({ plants: this.plantIds, text: "" }, { emitEvent: false });
    } else if (changes["plantIds"] && this.plantIds !== this.plants) {
      this.form.patchValue({ plants: this.plantIds }, { emitEvent: false });
    }
    this.parse();
  }

  /** The paste box changed (typing, a paste, a drop): refresh the preview right away. */
  onTextInput(): void {
    this.parse();
    this.cd.detectChanges();
  }

  /** A paste lands in the box after the event; read it once it has. */
  onTextPaste(): void {
    setTimeout(() => this.onTextInput());
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    const codes = this.ready.flatMap((l) => (l.kind ? [{ kind: l.kind, code: l.code, name: l.name }] : []));
    this.submitted.emit({ codes });
  }

  /** Re-read the paste: its lines, which of them the market has room for, and the lists they go to. */
  private parse(): void {
    const text = String(this.form.value.text ?? "");
    const lines = parseCodeImport(text, new Set(this.takenCodes));
    this.lines = this.room ? markImportLimits(lines, this.room) : lines;
    this.previewRows = this.lines.map((l) => ({
      id: l.line,
      name: l.name || l.code || "—",
      code: l.code,
      kind: l.kind ? codeKindLabel(l.kind, true) : "",
      status: l.problem ? IMPORT_PROBLEM_LABELS[l.problem] : IMPORT_READY_LABEL,
    }));
    const kinds = CODE_KINDS.map((k) => k.id).filter((kind) => this.ready.some((l) => l.kind === kind));
    const next = kinds.length ? kinds : ["users" as CodeKind];
    if (next.join() !== this.importKinds.join()) {
      this.importKinds = next; // a new array only when the set changes, so the stations card isn't re-fed every check
    }
  }
}
