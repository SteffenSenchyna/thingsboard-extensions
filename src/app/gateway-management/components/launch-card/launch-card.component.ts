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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { GATEWAY_INSTALL_HELP } from "../../models/gateway-management.models";

/**
 * How to start the gateway (ThingsBoard's "Launch command"): install Docker
 * Compose, download the docker-compose file ThingsBoard generates for this
 * device (its credentials and this platform's address in it), run it.
 */
@Component({
  selector: "tb-gm-launch-card",
  templateUrl: "./launch-card.component.html",
  styleUrls: ["./launch-card.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CollapsibleCardComponent, CopyBoxComponent],
})
export class LaunchCardComponent {
  @Input() ctx!: WidgetContext;
  @Input() gatewayId = "";
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();

  readonly installHelp = GATEWAY_INSTALL_HELP;
  readonly command = "docker compose up -d";
  downloading = false;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  download(): void {
    if (!this.gatewayId || this.downloading) {
      return;
    }
    this.downloading = true;
    this.ctx.deviceService
      .downloadGatewayDockerComposeFile(this.gatewayId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.downloading = false;
          this.cd.detectChanges();
        },
        error: (err) => {
          this.downloading = false;
          const msg = err?.error?.message || err?.message;
          this.notify.emit({ tone: "error", message: `Couldn't download the docker-compose file${msg ? `: ${msg}` : "."}` });
          this.cd.detectChanges();
        },
      });
  }
}
