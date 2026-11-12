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


import { ChangeDetectorRef, Component, DestroyRef, Input, OnChanges, SimpleChanges, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { of } from "rxjs";
import { catchError } from "rxjs/operators";
import { SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { CardComponent } from "../../../components/shared/card/card.component";
import { SecretBoxComponent } from "../../../components/shared/secret-box/secret-box.component";
import { QUIET_REQUEST, apiMessage } from "../../../components/shared/value-utils";
import { OrganizationNotices } from "../../../components/shared/organization/organization-store";

const TYPE_NAMES: Record<string, string> = {
  ACCESS_TOKEN: "Access token",
  X509_CERTIFICATE: "X.509 certificate",
  MQTT_BASIC: "MQTT basic",
  LWM2M_CREDENTIALS: "LwM2M",
};

/** A new access token: 20 letters and digits (ThingsBoard's own length), from the browser's random source. */
function newToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/**
 * A device's Credentials tab: its access token — masked, copyable, edited or
 * regenerated, then saved (the device connects with the new one from then on).
 * Another kind of credentials (X.509, MQTT basic, LwM2M) is named, edited in
 * ThingsBoard's own device page.
 */
@Component({
  selector: "tb-ext-device-credentials",
  templateUrl: "./device-credentials.component.html",
  styleUrls: ["./device-credentials.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, CardComponent, SecretBoxComponent],
})
export class DeviceCredentialsComponent implements OnChanges {
  @Input() ctx!: WidgetContext;
  @Input() deviceId = "";
  @Input() notices: OrganizationNotices | null = null;

  loading = true;
  saving = false;
  credentials: any = null;
  readonly token = new FormControl("", { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\S+$/)] });

  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  get typeName(): string {
    const t = this.credentials?.credentialsType;
    return TYPE_NAMES[t] ?? t ?? "";
  }

  get isToken(): boolean {
    return this.credentials?.credentialsType === "ACCESS_TOKEN";
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["deviceId"] && this.deviceId) {
      this.load();
    }
  }

  private load(): void {
    this.loading = true;
    this.ctx.deviceService
      .getDeviceCredentials(this.deviceId, false, QUIET_REQUEST)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((c) => {
        this.credentials = c;
        this.token.reset(c?.credentialsType === "ACCESS_TOKEN" ? String(c.credentialsId ?? "") : "");
        this.loading = false;
        this.cd.detectChanges();
      });
  }

  regenerate(): void {
    this.token.setValue(newToken());
    this.token.markAsDirty();
  }

  discard(): void {
    this.token.reset(String(this.credentials?.credentialsId ?? ""));
  }

  save(): void {
    if (this.token.invalid || !this.token.dirty || this.saving) {
      return;
    }
    this.saving = true;
    this.ctx.deviceService
      .saveDeviceCredentials({ ...this.credentials, credentialsId: this.token.value.trim() }, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving = false;
          this.credentials = saved;
          this.token.reset(String(saved.credentialsId ?? ""));
          this.notices?.success("Access token saved — the device connects with the new one");
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.notices?.error(`Couldn't save the access token${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }
}
