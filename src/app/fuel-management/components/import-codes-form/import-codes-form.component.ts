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
import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { CardComponent } from "../../../components/shared/card/card.component";
import { DataTableColumn } from "../../../components/shared/data-table/data-table.component";
import { DetailTableComponent } from "../../../components/shared/detail-table/detail-table.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
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
 * Form for importing a pasted list of access codes into one market: the market
 * (a dropdown — changing it emits {@link marketChange}), their scope — every
 * site of the market, or one site ({@link siteChange}; the dashboard feeds back
 * the scope's room and PLCs) — and a text box the list is pasted
 * into — one code per line, `code, name, type` (User / Vehicle), as
 * {@link parseCodeImport} reads it (its format in the label's info bubble). The
 * preview — a panel's list (`tb-detail-table`) — shows every line grouped by
 * what becomes of it: ready, or why it will be skipped (not 6 digits, no name
 * or type, a repeat, already in use, past the scope's room);
 * the market's stations show their readiness for the lists in the paste, as in
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
    FormActionsComponent,
    SelectComponent,
    StationReadinessComponent,
    TipDirective,
  ],
})
export class ImportCodesFormComponent implements OnChanges {
  /** The market the codes go to, and the markets to pick from. */
  @Input() marketId: string | null = null;
  @Input() marketOptions: TbSelectOption[] = [];
  /** The codes' scope: one site ("" = every site of the market), and the market's sites to pick from ("All sites" first). */
  @Input() siteId = "";
  @Input() siteOptions: TbSelectOption[] = [];
  /** Codes already in use anywhere — a pasted one among them is skipped. */
  @Input() takenCodes: string[] = [];
  /** Change to reset the form (e.g. each time the panel opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  /** While saving: how many of the codes have been created so far. */
  @Input() progress: { done: number; total: number } | null = null;
  /** The scope's room — lines past it are skipped — and its name for the reason. */
  @Input() room: CodeRoom | null = null;
  @Input() scopeName = "";
  /** The scope's PLCs — every code goes to each; their readiness is shown per the selected list. */
  @Input() plcs: PlcRow[] = [];
  @Input() plcsLoading = false;
  @Output() submitted = new EventEmitter<ImportCodesRequest>();
  @Output() cancelled = new EventEmitter<void>();
  /** Another market was picked. */
  @Output() marketChange = new EventEmitter<string>();
  /** Another scope was picked: a site's id, "" for every site. */
  @Output() siteChange = new EventEmitter<string>();

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

  // DestroyRef passed explicitly: in the extension bundle, takeUntilDestroyed()
  // without one throws NG0203 at runtime (no injection context).
  constructor(
    private fb: FormBuilder,
    private destroyRef: DestroyRef,
    private cd: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      market: [null as string | null, Validators.required],
      site: [""],
      text: [""],
    });
    this.form.controls["market"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id: string | null) => {
      if (id && id !== this.marketId) {
        this.marketChange.emit(id);
      }
    });
    this.form.controls["site"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id: string | null) => {
      if ((id ?? "") !== this.siteId) {
        this.siteChange.emit(id ?? "");
      }
    });
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
    const where = this.scopeName ? `${this.scopeName}'s stations` : "the stations";
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
      this.form.reset({ market: this.marketId, site: this.siteId, text: "" }, { emitEvent: false });
    } else if (changes["marketId"] || changes["siteId"]) {
      this.form.patchValue({ market: this.marketId, site: this.siteId }, { emitEvent: false });
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
