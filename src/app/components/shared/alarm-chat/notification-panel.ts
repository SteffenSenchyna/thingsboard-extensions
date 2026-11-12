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

import { WidgetContext } from "@home/models/widget-component.models";

const KEY = "__tbExtNotificationPanel";

/** The widget's notifications panel (one, placed in the dashboard root): what the Account page's table opens it on. */
export function notificationPanelOf(ctx: WidgetContext): NotificationPanelState {
  const host = ctx as unknown as Record<string, NotificationPanelState | undefined>;
  return (host[KEY] ??= new NotificationPanelState());
}

/**
 * The notifications panel's state: open or not, and the device whose
 * notifications it shows — set where a row is clicked (the Account page's
 * Notifications table), read where the panel is (`tb-alarm-notification-panel`,
 * in the dashboard root).
 */
export class NotificationPanelState {
  open = false;
  /** The device shown (kept while the panel slides out). */
  deviceId: string | null = null;
  /** Its name, the panel's title. */
  name = "";

  show(deviceId: string, name: string): void {
    this.deviceId = deviceId;
    this.name = name;
    this.open = true;
  }

  close(): void {
    this.open = false;
  }
}
