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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { CollapsibleCardComponent } from "../../../../components/shared/collapsible-card/collapsible-card.component";
import { CopyBoxComponent } from "../../../../components/shared/copy-box/copy-box.component";
import { DetailCardComponent, DetailRowComponent, DetailRowsComponent } from "../../../../components/shared/detail-rows/detail-rows.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../../components/shared/data-table/data-table.component";
import { SegmentOption } from "../../../../components/shared/segmented-control/segmented-control.component";
import { TimeframePickerComponent } from "../../../../components/shared/timeframe-picker/timeframe-picker.component";
import { SkeletonCardComponent } from "../../../../components/shared/skeleton-card/skeleton-card.component";
import { StatusPillComponent } from "../../../../components/shared/status-pill/status-pill.component";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { fmtNumber } from "../../../../components/shared/value-utils";
import { EsfClient, EsfConfirm, esfSubscribe, parseEsfDebugEnabled, parseEsfProperties } from "../../../models/esf-api.models";

/** The Profile's facts shown in a copy box (an identifier someone pastes elsewhere): the client id and the serial number. */
const COPY_FACTS = new Set(["primaryMacAddress", "serialNumber"]);

/** ESF's Device › Profile page: its cards, each its facts — a framework property (or ESF property, `kura:`) and its label. */
const PROFILE: { title: string; facts: [string, string][] }[] = [
  {
    title: "Device Information",
    facts: [
      ["kuraVersion", "Kura Version"],
      ["primaryMacAddress", "Client ID"],
      ["deviceName", "Display Name"],
      ["kuraWifiTopChannel", "Last Wifi Channel"],
    ],
  },
  {
    title: "Hardware Information",
    facts: [
      ["modelName", "Product"],
      ["modelId", "Model"],
      ["partNumber", "Part Number"],
      ["serialNumber", "Serial Number"],
    ],
  },
  {
    title: "Software Information",
    facts: [
      ["firmwareVersion", "Firmware Version"],
      ["biosVersion", "BIOS Version"],
      ["osVersion", "Operating System Version"],
      ["osName", "Operating System"],
      ["osArch", "OS Architecture"],
    ],
  },
  {
    title: "Java Information",
    facts: [
      ["javaVmName", "Java Virtual Machine"],
      ["javaVmVersion", "Java Virtual Machine Version"],
      ["kura:java.runtime", "Java Runtime"],
      ["osgiFirmwareName", "OSGI Framework"],
      ["osgiFirmwareVersion", "OSGI Framework Version"],
      ["numberOfProcessors", "Number of Processors"],
      ["totalMemory", "Total RAM"],
      ["freeMemory", "Free RAM"],
    ],
  },
];

/**
 * The ESF unit's device, as ESF's console's Device page — its sections a tab each (Profile | Framework properties | ESF properties
 * | Security), one shown at a time (System v1 — `rest.system` — and Security v2 — `rest.security`):
 * its Device, Hardware, Software and Java Information (the framework properties ESF's page shows; its uptime isn't in the REST
 * API), the cards stacked; every framework and ESF property (a name / value table each, searchable — the
 * page's System Properties); and its security: debug mode,
 * and reloading the security policy's and the command line's fingerprints. Its position and tamper detection are the Status
 * view's.
 */
@Component({
  selector: "tb-gm-esf-system",
  templateUrl: "./esf-system.component.html",
  styleUrls: ["./esf-system.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    CalloutComponent,
    CollapsibleCardComponent,
    CopyBoxComponent,
    DetailCardComponent,
    DetailRowComponent,
    DetailRowsComponent,
    DataTableComponent,
    DataTableCellDirective,
    TimeframePickerComponent,
    SkeletonCardComponent,
    StatusPillComponent,
  ],
})
export class EsfSystemComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();

  /** Its sections, one shown at a time (as ESF's Device page's tabs). */
  readonly sections: SegmentOption[] = [
    { id: "profile", label: "Profile" },
    { id: "framework", label: "Framework properties" },
    { id: "esf", label: "ESF properties" },
    { id: "security", label: "Security" },
  ];
  section = "profile";

  /** The Profile's cards, made once both property lists are in (nothing popping in). */
  profile: { title: string; facts: { label: string; value: string; copy: boolean }[] }[] = [];
  frameworkProperties: { key: string; value: string }[] = [];
  kuraProperties: { key: string; value: string }[] = [];
  /** The property tables' columns: its name, its value (both searched). */
  readonly propertyColumns: DataTableColumn[] = [
    { key: "key", phone: "title", header: "Name" },
    { key: "value", phone: "note", header: "Value" },
  ];
  readonly propertySearchKeys = ["key", "value"];
  systemLoading = false;
  systemError = "";

  debugEnabled: boolean | null = null;
  securityError = "";
  /** The action running ("" none). */
  busy = "";

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.loadSystem();
      this.loadSecurity();
    }
  }

  /** The framework and ESF properties, together: the Profile's cards once both are in (an ESF list that can't be read: without it). */
  loadSystem(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.systemLoading = true;
    this.systemError = "";
    let waiting = 2;
    const done = () => {
      if (--waiting > 0 || client !== this.client) {
        return;
      }
      this.systemLoading = false;
      this.profile = this.profileOf();
      this.cd.markForCheck();
    };
    esfSubscribe(
      client.call("esfFrameworkProperties"),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          this.frameworkProperties = parseEsfProperties(reply);
        }
        done();
      },
      (reason) => {
        if (client === this.client) {
          this.systemError = reason;
        }
        done();
      }
    );
    esfSubscribe(
      client.call("esfKuraProperties"),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          this.kuraProperties = parseEsfProperties(reply);
        }
        done();
      },
      () => done()
    );
  }

  /** The Profile's cards from the properties read: each fact the unit has (RAM in kB, as ESF shows it). */
  private profileOf(): { title: string; facts: { label: string; value: string; copy: boolean }[] }[] {
    const framework = new Map(this.frameworkProperties.map((p) => [p.key, p.value]));
    const kura = new Map(this.kuraProperties.map((p) => [p.key, p.value]));
    const valueOf = (key: string): string => {
      if (key === "kura:java.runtime") {
        return [kura.get("java.runtime.name"), kura.get("java.runtime.version")].filter(Boolean).join(" ") || framework.get("javaVersion") || "";
      }
      const v = framework.get(key) ?? "";
      return (key === "totalMemory" || key === "freeMemory") && v && Number.isFinite(Number(v)) ? `${fmtNumber(Number(v), 0)} kB` : v;
    };
    return PROFILE.map((card) => ({
      title: card.title,
      facts: card.facts.map(([key, label]) => ({ label, value: valueOf(key), copy: COPY_FACTS.has(key) })).filter((f) => f.value !== ""),
    })).filter((card) => card.facts.length);
  }

  loadSecurity(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.securityError = "";
    esfSubscribe(
      client.call("esfSecurityDebug"),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          this.debugEnabled = parseEsfDebugEnabled(reply);
          this.cd.markForCheck();
        }
      },
      (reason) => {
        if (client === this.client) {
          this.securityError = reason;
          this.cd.markForCheck();
        }
      }
    );
  }

  trackProperty(_: number, p: { key: string }): string {
    return p.key;
  }

  trackCard(_: number, c: { title: string }): string {
    return c.title;
  }

  trackFact(_: number, f: { label: string }): string {
    return f.label;
  }

  reloadPolicyFingerprint(): void {
    this.act("policy", "esfReloadPolicyFingerprint", {}, "Security policy fingerprint reloaded");
  }

  reloadCommandLineFingerprint(): void {
    this.act("commandLine", "esfReloadCommandLineFingerprint", {}, "Command line fingerprint reloaded");
  }

  private act(key: string, name: string, params: Record<string, string>, done: string, after?: () => void): void {
    if (!this.client || this.busy) {
      return;
    }
    this.busy = key;
    esfSubscribe(
      this.client.call(name, undefined, params),
      this.destroyRef,
      () => {
        this.busy = "";
        this.notify.emit({ tone: "success", message: "Settings applied" });
        after?.();
        this.cd.markForCheck();
      },
      (reason) => {
        this.busy = "";
        this.notify.emit({ tone: "error", message: reason });
        this.cd.markForCheck();
      }
    );
  }
}
