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

import { Component, HostBinding, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { WidgetContext } from "@home/models/widget-component.models";
import { EntityDetailPanelComponent } from "../entity-detail-panel/entity-detail-panel.component";
import { PanelTabComponent } from "../panel-tab/panel-tab.component";
import { SegmentOption } from "../segmented-control/segmented-control.component";
import { NotificationPanelState, notificationPanelOf } from "../alarm-chat/notification-panel";
import { AlarmSubscriptionNotices, AlarmSubscriptionsComponent } from "./alarm-subscriptions.component";

const TABS: SegmentOption[] = [{ id: "notifications", label: "Notifications", icon: "notifications", tooltip: "Notifications" }];

/**
 * The side panel with one device's alarm notifications — the same form as
 * the device's own panel has (its Alarms tab › Notifications:
 * `tb-alarm-subscriptions`) — opened from the Account page's Notifications
 * table (a row: `notificationPanelOf(ctx).show(…)`). Placed once in the
 * dashboard root of a dashboard with an Account page, beside its other panels.
 *
 * ```html
 * <tb-alarm-notification-panel [ctx]="ctx" [notices]="toasts"></tb-alarm-notification-panel>
 * ```
 */
@Component({
  selector: "tb-alarm-notification-panel",
  template: `<tb-entity-detail-panel
    [open]="state.open"
    icon="notifications"
    [name]="state.name"
    subtitle="Notifications"
    [tabs]="tabs"
    [dismissible]="true"
    (closed)="state.close()"
  >
    <tb-panel-tab tab-content>
      <tb-alarm-subscriptions *ngIf="state.deviceId" [ctx]="ctx" [deviceId]="state.deviceId" [notices]="notices"></tb-alarm-subscriptions>
    </tb-panel-tab>
  </tb-entity-detail-panel>`,
  styles: [":host { display: contents; }"],
  standalone: true,
  imports: [CommonModule, EntityDetailPanelComponent, PanelTabComponent, AlarmSubscriptionsComponent],
})
export class AlarmNotificationPanelComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() ctx!: WidgetContext;
  @Input() notices: AlarmSubscriptionNotices | null = null;
  readonly tabs = TABS;

  get state(): NotificationPanelState {
    return notificationPanelOf(this.ctx);
  }
}
