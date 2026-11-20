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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonGroupComponent, ButtonGroupOption } from "../../../components/shared/button-group/button-group.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SETTING_PIECES } from "../../../components/shared/setting-object/setting-object.component";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { esfSubscribe } from "../../models/esf-api.models";
import { esfCreateInstanceRequest, esfInstancePidError } from "../../models/esf-security.models";
import { esfCreateAssetRequest } from "../../models/esf-drivers.models";
import { EsfComponentOpen } from "../esf/esf-security/esf-security.component";

/** The Drivers and assets view's two kinds of new one. */
const DRIVER_OR_ASSET: ButtonGroupOption[] = [
  { value: "driver", label: "Driver" },
  { value: "asset", label: "Asset" },
];

/**
 * A new instance of a factory (the Security view's "Create new" — an SSL manager, a keystore), in the side panel: its factory (the
 * unit's that make them, by name over the PID) and its PID, then "Create" — ESF makes it with its defaults, a snapshot taken, and
 * the panel goes on to its settings. Given drivers (the Drivers and assets view's — `EsfComponentOpen.drivers`), it's a driver or
 * an asset (Driver | Asset): a driver of a kind (`factories`), or an asset of a driver (made with its `driver.pid`).
 */
@Component({
  selector: "tb-gm-esf-instance-create",
  templateUrl: "./esf-instance-create.component.html",
  styleUrls: ["./esf-instance-create.component.scss"],
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonGroupComponent, CollapsibleCardComponent, FormActionsComponent, SelectComponent, ...SETTING_PIECES],
})
export class EsfInstanceCreateComponent implements OnChanges {
  @Input() open: EsfComponentOpen | null = null;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly kinds = DRIVER_OR_ASSET;
  /** A driver or an asset (given drivers). */
  kind: "driver" | "asset" = "driver";
  /** A new asset's driver. */
  driver = "";
  factory = "";
  pid = "";
  creating = false;
  /** "Create" was pressed: the checks show. */
  tried = false;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(): void {
    this.kind = "driver";
    this.driver = this.open?.drivers?.[0]?.value ?? "";
    this.factory = this.open?.factories?.[0]?.value ?? "";
    this.pid = "";
    this.tried = false;
    this.creating = false;
  }

  get factories(): TbSelectOption[] {
    return this.open?.factories ?? [];
  }

  /** A driver or an asset to make (the Drivers and assets view's "Create new"). */
  get driverOrAsset(): boolean {
    return !!this.open?.drivers;
  }

  /** An asset to make (of a driver). */
  get asset(): boolean {
    return this.driverOrAsset && this.kind === "asset";
  }

  get drivers(): TbSelectOption[] {
    return this.open?.drivers ?? [];
  }

  get title(): string {
    return `New ${this.driverOrAsset ? this.kind : this.open?.noun || "instance"}`;
  }

  /** What it's made of is picked: a factory, or — an asset — a driver. */
  get ready(): boolean {
    return this.asset ? !!this.driver && !!this.open?.assetFactory : !!this.factory;
  }

  /** What's wrong with the PID, shown once "Create" was pressed or something's typed. */
  get pidError(): string {
    return this.tried || this.pid ? esfInstancePidError(this.pid, this.open?.existing ?? []) : "";
  }

  create(): void {
    const open = this.open;
    this.tried = true;
    if (!open || !this.ready || esfInstancePidError(this.pid, open.existing ?? []) || this.creating) {
      return;
    }
    const pid = this.pid.trim();
    const factory = this.asset ? open.assetFactory! : this.factory;
    const request = this.asset ? esfCreateAssetRequest(pid, factory, this.driver) : esfCreateInstanceRequest(pid, factory);
    this.creating = true;
    esfSubscribe(
      open.client.call("esfCreateFactoryComponent", request),
      this.destroyRef,
      () => {
        this.creating = false;
        this.notify.emit({ tone: "success", message: "Settings applied" });
        open.created?.(pid, factory);
      },
      (reason) => {
        this.creating = false;
        this.notify.emit({ tone: "error", message: `Couldn't create ${pid}: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }
}
