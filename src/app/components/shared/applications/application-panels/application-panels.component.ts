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
import { EntityDetailPanelComponent } from "../../entity-detail-panel/entity-detail-panel.component";
import { DeleteCardComponent } from "../../manage-card/manage-card.component";
import { PanelTabComponent } from "../../panel-tab/panel-tab.component";
import { ConfirmDialogComponent } from "../../confirm-dialog/confirm-dialog.component";
import { ApplicationFormComponent } from "../application-form/application-form.component";
import { ApplicationSitesComponent } from "../application-sites/application-sites.component";
import { OrganizationHelpComponent } from "../../organization/organization-help/organization-help.component";
import { ApplicationStore } from "../application-store";

/**
 * The applications' side panel (one to create or edit — and, when the
 * dashboard assigns them to sites, an existing one's Sites) and its delete
 * confirmation, both driven by the {@link ApplicationStore}. Place it in the
 * dashboard root, as every side panel and dialog:
 *
 * ```html
 * <tb-application-panels [store]="apps"></tb-application-panels>
 * ```
 */
@Component({
  selector: "tb-application-panels",
  templateUrl: "./application-panels.component.html",
  styleUrls: ["./application-panels.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    EntityDetailPanelComponent,
    DeleteCardComponent,
    PanelTabComponent,
    ConfirmDialogComponent,
    ApplicationFormComponent,
    ApplicationSitesComponent,
    OrganizationHelpComponent,
  ],
})
export class ApplicationPanelsComponent {
  @Input() store!: ApplicationStore;
  /** The panel's tab (Application / Sites). */
  tab = "application";
}
