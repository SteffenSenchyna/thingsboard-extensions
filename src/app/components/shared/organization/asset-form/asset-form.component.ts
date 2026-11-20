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

import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../card/card.component";
import { CollapsibleCardComponent } from "../../collapsible-card/collapsible-card.component";
import { SettingObjectComponent } from "../../setting-object/setting-object.component";
import { CheckboxComponent } from "../../checkbox/checkbox.component";
import { NumberBoxComponent } from "../../number-box/number-box.component";
import { FormActionsComponent } from "../../form-actions/form-actions.component";
import { nameErrorOf, nameValidators } from "../../form-utils";
import { SELECT_EMPTY, SelectComponent, TbSelectOption } from "../../select/select.component";
import { AssetDraft, AssetRow, GOOGLE_CHAT_WEBHOOK, WATCHDOG_DAYS } from "../organization.models";
import { SecretBoxComponent } from "../../secret-box/secret-box.component";
import { TipDirective } from "../../tip/tip.directive";

/** A bulk picker's value while untouched: no choice (the picker shows blank), each site's own value kept. */
const KEEP = "__keep__";


/**
 * The asset form (the Settings page's Organization: "Create new" on a list,
 * or a row to edit): the asset's name (unique in its list) and its label — a
 * site's product line and market too, a product line's parent product line
 * (any line but itself and those under it). A new one's Cancel / Create always
 * show; editing, Cancel / Apply show once the form differs from the asset,
 * Cancel reverting. In bulk (several sites checked, "Edit (n)") only the
 * pickers show, each blank until set (blank: that link stays as it is on
 * every site); several product lines ("Edit (n)" too), the parent picker
 * alone, likewise. Save emits the draft; the Organization store creates or
 * updates the asset(s).
 */
@Component({
  selector: "tb-asset-form",
  templateUrl: "./asset-form.component.html",
  styleUrls: ["./asset-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    ReactiveFormsModule,
    CardComponent,
    CollapsibleCardComponent,
    SettingObjectComponent,
    CheckboxComponent,
    NumberBoxComponent,
    SelectComponent,
    SecretBoxComponent,
    FormActionsComponent,
    TipDirective,
  ],
})
export class AssetFormComponent implements OnInit, OnChanges {
  /** A select with nothing picked: blank — in bulk ("Edit (n)", each left as it is until picked) too. */
  get pickPlaceholder(): string {
    return SELECT_EMPTY;
  }

  /** The Google Chat webhook's note, in the info bubble beside its label. */
  readonly chatNote = "Site alarms are posted to this Google Chat space.";
  /** The alarm watchdog's note (the site's critical alarm emails), in the info bubble after its switch. */
  readonly criticalNote = "Alerts managers of stale critical alarms";
  /** What the asset is called ("product line", "market", "site") — in the texts. */
  @Input() noun = "asset";
  /** The asset being edited (null: a new one). */
  @Input() value: AssetRow | null = null;
  /** A site: its product line and market pickers (relations to the site), with their options ("" first for none). */
  @Input() withLinks = false;
  @Input() productLineOptions: TbSelectOption[] = [];
  @Input() marketOptions: TbSelectOption[] = [];
  /** A product line: its parent picker ("" first for none). */
  @Input() withParent = false;
  @Input() parentOptions: TbSelectOption[] = [];
  /** A site: its Google Chat card — the webhook its alarms post to (`chatUrl`: as stored; null while it's read). */
  @Input() withChat = false;
  @Input() chatUrl: string | null = null;
  /** A site: its alarm watchdog (critical alarm emails), on or off — as stored; null while it's read. */
  @Input() criticalEmail: boolean | null = null;
  /** A site: its alarm watchdog's days, as stored (unset: the default); null while it's read. */
  @Input() criticalDays: number | null = null;
  /** Bulk: the pickers alone, for this many sites, each blank until set. */
  @Input() bulkCount = 0;
  /** The list's existing names — a name must be unique. */
  @Input() existingNames: string[] = [];
  /** Bumped to reset the form (on every open). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AssetDraft>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  /** The values as last reset: what "changed" is measured against. */
  private baseline = "";

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ["", nameValidators(() => this.otherNames())],
      label: [""],
      productLineId: [""],
      marketId: [""],
      parentId: [""],
      googleChatUrl: ["", (c: AbstractControl) => (!c.value || GOOGLE_CHAT_WEBHOOK.test(String(c.value).trim()) ? null : { webhook: true })],
      criticalAlarmEmail: [false],
      criticalAlarmDays: [
        WATCHDOG_DAYS.default,
        [Validators.required, Validators.min(WATCHDOG_DAYS.min), Validators.max(WATCHDOG_DAYS.max), Validators.pattern(/^\d+$/)],
      ],
    });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.form && (changes["resetKey"] || changes["value"] || changes["bulkCount"])) {
      this.reset();
    } else if (this.form && (changes["chatUrl"] || changes["criticalEmail"] || changes["criticalDays"])) {
      this.takeSiteSettings();
    }
  }

  get bulk(): boolean {
    return this.bulkCount > 0;
  }

  /** A new asset (not an edit of one); bulk counts as one (its buttons always show). */
  get creating(): boolean {
    return !this.value;
  }

  /** The form's values differ from the asset's (the Cancel / Apply buttons show, Apply enables). */
  get dirty(): boolean {
    return !!this.form && JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get submitLabel(): string {
    if (this.saving) {
      return "Saving…";
    }
    if (this.bulk) {
      return `Apply to ${this.bulkCount} ${this.noun}${this.bulkCount === 1 ? "" : "s"}`;
    }
    return this.creating ? `Create ${this.noun}` : "Apply changes";
  }

  /** Discard the edits: back to the asset's values (a new one: close). */
  cancel(): void {
    if (this.creating) {
      this.cancelled.emit();
    } else {
      this.reset();
    }
  }

  get nameError(): string | null {
    return nameErrorOf(this.form.controls["name"], `There's a ${this.noun} with this name already.`);
  }

  /** The site's webhook is still being read (an edit's — a new site has none). */
  get chatLoading(): boolean {
    return this.withChat && !this.creating && this.chatUrl === null;
  }

  get chatError(): string | null {
    const c = this.form.controls["googleChatUrl"];
    return c.touched && c.hasError("webhook") ? "A Google Chat space's webhook: https://chat.googleapis.com/v1/spaces/…/messages?key=…" : null;
  }

  /** The watchdog is ticked: its threshold folds open under it. */
  get watchdogOn(): boolean {
    return this.form.controls["criticalAlarmEmail"].value === true;
  }

  /** The days' bounds, for the number box. */
  readonly watchdogDays = WATCHDOG_DAYS;

  /** The threshold's unit, in its box after the number: "day" for 1, else "days". */
  get daysUnit(): string {
    return Number(this.form.controls["criticalAlarmDays"].value) === 1 ? "day" : "days";
  }

  get daysError(): string | null {
    const c = this.form.controls["criticalAlarmDays"];
    return c.touched && c.invalid ? `${WATCHDOG_DAYS.min} to ${WATCHDOG_DAYS.max} days` : null;
  }

  get canSubmit(): boolean {
    if (this.bulk) {
      return !this.saving && this.dirty;
    }
    return this.form.valid && !this.saving && (this.creating || this.dirty);
  }

  submit(): void {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const draft: AssetDraft = { name: String(v.name).trim(), label: String(v.label ?? "").trim() };
    // Bulk: a parent picker left blank stays out of the draft.
    if (this.withParent && v.parentId !== KEEP) {
      draft.parentId = String(v.parentId ?? "");
    }
    if (this.withChat && !this.bulk && !this.chatLoading) {
      draft.googleChatUrl = String(v.googleChatUrl ?? "").trim();
      draft.criticalAlarmEmail = v.criticalAlarmEmail === true;
      draft.criticalAlarmDays = Number(v.criticalAlarmDays);
    }
    if (this.withLinks) {
      // Bulk: a picker left blank stays out of the draft.
      if (v.productLineId !== KEEP) {
        draft.productLineId = String(v.productLineId ?? "");
      }
      if (v.marketId !== KEEP) {
        draft.marketId = String(v.marketId ?? "");
      }
    }
    this.submitted.emit(draft);
  }

  private reset(): void {
    const link = (id: string | null | undefined) => (this.bulk ? KEEP : (id ?? ""));
    this.form.reset(
      {
        name: this.value?.name ?? "",
        label: this.value?.label ?? "",
        productLineId: link(this.value?.productLineId),
        marketId: link(this.value?.marketId),
        parentId: link(this.value?.parentId),
        googleChatUrl: this.chatUrl ?? "",
        criticalAlarmEmail: this.criticalEmail === true,
        criticalAlarmDays: this.criticalDays ?? WATCHDOG_DAYS.default,
      },
      { emitEvent: false }
    );
    this.lockWhileRead();
    this.form.markAsPristine();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.cd.markForCheck();
  }

  /**
   * The site's webhook and alarm watchdog (on, its days), read after the panel opened: into their fields (and what
   * "changed" is measured against) unless they were changed meanwhile.
   */
  private takeSiteSettings(): void {
    const base = JSON.parse(this.baseline || "{}");
    const stored: Record<string, unknown> = {
      googleChatUrl: this.chatUrl ?? "",
      criticalAlarmEmail: this.criticalEmail === true,
      criticalAlarmDays: this.criticalDays ?? WATCHDOG_DAYS.default,
    };
    Object.entries(stored).forEach(([key, value]) => {
      const control = this.form.controls[key];
      if (!control.dirty) {
        control.setValue(value, { emitEvent: false });
        base[key] = value;
      }
    });
    this.baseline = JSON.stringify(base);
    this.lockWhileRead();
    this.cd.markForCheck();
  }

  /** The watchdog waits for the site's stored values (its "off" can't be told apart from not read yet). */
  private lockWhileRead(): void {
    ["criticalAlarmEmail", "criticalAlarmDays"].forEach((key) => {
      const control = this.form.controls[key];
      if (this.chatLoading) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    });
  }

  /** The other assets' names (the edited asset's own name is its own). */
  private otherNames(): string[] {
    const own = (this.value?.name ?? "").toLowerCase();
    return this.existingNames.filter((n) => n.toLowerCase() !== own);
  }
}
