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

import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { EntityDetailPanelComponent } from "../../entity-detail-panel/entity-detail-panel.component";
import { PanelTabComponent } from "../../panel-tab/panel-tab.component";
import { CardComponent } from "../../card/card.component";
import { ManageActionComponent, ManageCardComponent } from "../../manage-card/manage-card.component";
import { StatusPillComponent } from "../../status-pill/status-pill.component";
import { SegmentOption } from "../../segmented-control/segmented-control.component";
import { ButtonGroupComponent, ButtonGroupOption } from "../../button-group/button-group.component";
import { DetailRowComponent, DetailRowsComponent } from "../../detail-rows/detail-rows.component";
import { ConfirmDialogComponent } from "../../confirm-dialog/confirm-dialog.component";
import { formatDateTime } from "../../time-format";
import { FeedbackStore } from "../feedback-store";
import { FEEDBACK_STATUSES, FeedbackEntry, FeedbackStatus, feedbackStatusOf, feedbackTypeOf } from "../feedback.models";

/**
 * The Feedback page's panel (in the dashboard root, `[store]` the page's): an
 * item — its words; its status (New, Reviewed, Done — `tb-button-group`) with
 * where and what it was sent from; a bug's screenshot (opened full size in a
 * tab of its own) — and Manage: download the screenshot, copy the details,
 * Delete. Its facts are `tb-detail-rows`.
 */
@Component({
  selector: "tb-feedback-panels",
  templateUrl: "./feedback-panels.component.html",
  styleUrls: ["./feedback-panels.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SharedModule,
    EntityDetailPanelComponent,
    PanelTabComponent,
    CardComponent,
    ManageCardComponent,
    ManageActionComponent,
    StatusPillComponent,
    ButtonGroupComponent,
    DetailRowsComponent,
    DetailRowComponent,
    ConfirmDialogComponent,
  ],
})
export class FeedbackPanelsComponent {
  @Input() store?: FeedbackStore;

  readonly tabs: SegmentOption[] = [{ id: "feedback", label: "Feedback" }];
  /** The status's buttons (the settings card's: QC Lab's time zone). */
  readonly statusOptions: ButtonGroupOption[] = FEEDBACK_STATUSES.map((s) => ({ value: s.id, label: s.label }));

  type(e: FeedbackEntry) {
    return feedbackTypeOf(e.item?.type);
  }

  status(e: FeedbackEntry) {
    return feedbackStatusOf(e.status);
  }

  when(ts: number): string {
    return ts ? formatDateTime(ts) : "—";
  }

  setStatus(e: FeedbackEntry, id: string): void {
    this.store?.setStatus(e, id as FeedbackStatus);
  }

  /** The screenshot full size, in a tab of its own (a page can't open a data URL in one: a blob's address). */
  openShot(): void {
    const shot = this.store?.shot;
    if (!shot) {
      return;
    }
    fetch(shot)
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      });
  }
}
