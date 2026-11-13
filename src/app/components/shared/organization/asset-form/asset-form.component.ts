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
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../card/card.component";
import { FormActionsComponent } from "../../form-actions/form-actions.component";
import { nameErrorOf, nameValidators } from "../../form-utils";
import { SELECT_EMPTY, SelectComponent, TbSelectOption } from "../../select/select.component";
import { AssetDraft, AssetRow, GOOGLE_CHAT_WEBHOOK } from "../organization.models";
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
  imports: [CommonModule, SharedModule, ReactiveFormsModule, CardComponent, SelectComponent, SecretBoxComponent, FormActionsComponent, TipDirective],
})
export class AssetFormComponent implements OnInit, OnChanges {
  /** A select with nothing picked: dashes — in bulk ("Edit (n)", each left as it is until picked), blank. */
  get pickPlaceholder(): string {
    return this.bulk ? "" : SELECT_EMPTY;
  }

  /** The Google Chat webhook's note, in the info bubble beside its label. */
  readonly chatNote = "Site alarms are posted to this Google Chat space.";
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
    });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.form && (changes["resetKey"] || changes["value"] || changes["bulkCount"])) {
      this.reset();
    } else if (this.form && changes["chatUrl"]) {
      this.takeChatUrl();
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
      },
      { emitEvent: false }
    );
    this.form.markAsPristine();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.cd.markForCheck();
  }

  /** The site's webhook, read after the panel opened: into the field (and what "changed" is measured against) unless it was typed in. */
  private takeChatUrl(): void {
    const c = this.form.controls["googleChatUrl"];
    if (c.dirty) {
      return;
    }
    c.setValue(this.chatUrl ?? "", { emitEvent: false });
    this.baseline = JSON.stringify({ ...JSON.parse(this.baseline || "{}"), googleChatUrl: this.chatUrl ?? "" });
    this.cd.markForCheck();
  }

  /** The other assets' names (the edited asset's own name is its own). */
  private otherNames(): string[] {
    const own = (this.value?.name ?? "").toLowerCase();
    return this.existingNames.filter((n) => n.toLowerCase() !== own);
  }
}
