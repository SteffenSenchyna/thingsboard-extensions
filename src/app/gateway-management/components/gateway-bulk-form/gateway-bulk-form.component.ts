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

import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { TagPickerComponent, TagPickerOption } from "../../../components/shared/tag-picker/tag-picker.component";
import { KEEP } from "../../models/gateway-utils";

/** What the bulk edit applies to every checked gateway: a field left out is left as it is on each. */
export interface GatewayBulkDraft {
  /** The site that contains them ("" = none). */
  siteId?: string;
  /** Their application tags (the ids), replacing each gateway's own. */
  applications?: string[];
}


/**
 * The gateways' bulk edit (the table's Manage mode, "Edit (n)"): the site that
 * contains them and their application tags, set on every checked gateway at
 * once. The site picker starts blank and the tags untouched — each left so
 * leaves that field as it is on every gateway. Apply emits the draft; the
 * dashboard writes it.
 */
@Component({
  selector: "tb-gm-gateway-bulk-form",
  templateUrl: "./gateway-bulk-form.component.html",
  styleUrls: ["./gateway-bulk-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, FormsModule, CardComponent, SelectComponent, TagPickerComponent],
})
export class GatewayBulkFormComponent implements OnChanges {
  /** How many gateways the edit covers (in the button). */
  @Input() count = 0;
  /** The sites ("" first for none). */
  @Input() siteOptions: TbSelectOption[] = [];
  /** The applications (the Settings page's tags). */
  @Input() applicationOptions: TagPickerOption[] = [];
  /** Bumped to reset the form (on every open). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<GatewayBulkDraft>();
  @Output() cancelled = new EventEmitter<void>();

  siteId = KEEP;
  applications: string[] = [];
  /** The tags were edited (even back to none): they replace each gateway's. */
  applicationsTouched = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"] || changes["count"]) {
      this.reset();
    }
  }

  /** Something to apply: a site picked, or the tags edited. */
  get dirty(): boolean {
    return this.siteId !== KEEP || this.applicationsTouched;
  }

  get submitLabel(): string {
    return this.saving ? "Saving…" : `Apply to ${this.count} gateway${this.count === 1 ? "" : "s"}`;
  }

  onApplicationsChange(ids: string[]): void {
    this.applications = ids;
    this.applicationsTouched = true;
  }

  submit(): void {
    if (!this.dirty || this.saving) {
      return;
    }
    const draft: GatewayBulkDraft = {};
    if (this.siteId !== KEEP) {
      draft.siteId = this.siteId;
    }
    if (this.applicationsTouched) {
      draft.applications = [...this.applications];
    }
    this.submitted.emit(draft);
  }

  private reset(): void {
    this.siteId = KEEP;
    this.applications = [];
    this.applicationsTouched = false;
  }
}
