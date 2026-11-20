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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { DetailRowComponent, DetailRowsComponent } from "../../../components/shared/detail-rows/detail-rows.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { SecretBoxComponent } from "../../../components/shared/secret-box/secret-box.component";
import { ButtonGroupComponent, PickControl, pickControl, pickNote } from "../../../components/shared/button-group/button-group.component";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { SliderStepperComponent } from "../../../components/shared/slider-stepper/slider-stepper.component";
import { RadioGroupComponent, RadioOption } from "../../../components/shared/radio-group/radio-group.component";
import { SelectComponent } from "../../../components/shared/select/select.component";
import { SkeletonCardComponent } from "../../../components/shared/skeleton-card/skeleton-card.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { EsfClient, EsfConfirm, EsfInterface, esfSubscribe } from "../../models/esf-api.models";
import { IfField, IfForm, IfOption, IfSection, IfTab } from "../../models/esf-interface-form.models";
import { esfInterfaceHardware, esfInterfaceKind, esfInterfaceTabs, ESF_HARDWARE_TAB } from "../../models/esf-interface-tabs.models";
import { ESF_NETWORK_SERVICE } from "../../models/esf-interface.models";
import { EsfComponentConfig, ESF_NETWORK_CONFIG_API, EsfProperty, esfUpdateRequest, parseEsfConfigs } from "../../models/esf.models";

/**
 * A network interface's settings on the ESF unit (the Network view's side panel, an interface row opened), laid out as ESF's own
 * console lays them: the panel's tabs — IPv4, IPv6, Wireless, 802.1x, DHCPv4 & NAT, Advanced, Cellular, … and Hardware, by the
 * interface's type — each a card of its fields in the console's order, a field greyed out where it doesn't apply (a gateway on a
 * LAN interface), a tab that doesn't apply saying when it does. One form over every tab: "Apply changes" sends the settings that
 * changed, in Kura's NetworkConfigurationService. Its configuration is the one the interfaces' table read with their status
 * (`sharedConfig` — every interface's in one reply), else read here once for the gateway, so opening an interface shows at once;
 * read again after an apply.
 */
@Component({
  selector: "tb-gm-esf-interface",
  templateUrl: "./esf-interface.component.html",
  styleUrls: ["./esf-interface.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    FormsModule,
    ButtonGroupComponent,
    CalloutComponent,
    CheckboxComponent,
    CollapsibleCardComponent,
    DetailRowComponent,
    DetailRowsComponent,
    FormActionsComponent,
    NumberBoxComponent,
    RadioGroupComponent,
    SecretBoxComponent,
    SelectComponent,
    SkeletonCardComponent,
    SliderStepperComponent,
    TipDirective,
  ],
})
export class EsfInterfaceComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The gateway's ESF calls. */
  @Input() client: EsfClient | null = null;
  /** The interface, as the unit's status has it (its id names its settings; its type picks its tabs). */
  @Input() iface: EsfInterface | null = null;
  /** The panel's tab shown. */
  @Input() tab = "";
  /** The network configuration the interfaces' table read with their status: the form starts from it (null: read here). */
  @Input() sharedConfig: EsfComponentConfig | null = null;
  /** The gateway's name (the toasts name it). */
  @Input() gatewayName = "";
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  /** Its settings were applied (the interfaces' status may have changed). */
  @Output() applied = new EventEmitter<void>();
  /** "Apply changes" asks first, as ESF's console does (the dashboard's themed dialog). */
  @Output() confirm = new EventEmitter<EsfConfirm>();

  readonly hardwareTab = ESF_HARDWARE_TAB;
  config: EsfComponentConfig | null = null;
  loading = false;
  error = "";
  saving = false;
  form: IfForm | null = null;
  /** The Hardware tab's facts (from the unit's status). */
  hardware: { label: string; value: string }[] = [];

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      // Another gateway: its configuration — the table's read, else read here.
      this.config = this.sharedConfig;
      if (this.config) {
        this.build();
      } else {
        this.load();
      }
    } else if (changes["sharedConfig"] && this.sharedConfig && this.sharedConfig !== this.config && !this.form?.dirty && !this.saving) {
      // The table read it again (an apply, a refresh): the form follows, unless something's being edited.
      this.config = this.sharedConfig;
      this.build();
    } else if (changes["iface"]) {
      this.build();
    }
  }

  /** The tab shown, if it's one of the form's. */
  get shownTab(): IfTab | null {
    return this.form?.tabs.find((t) => t.id === this.tab) ?? null;
  }

  /** The network configuration read (again): every interface's settings. */
  load(): void {
    const client = this.client;
    this.error = "";
    if (!client) {
      this.build();
      return;
    }
    this.loading = true;
    esfSubscribe(
      client.call(ESF_NETWORK_CONFIG_API.getConfig, { pids: [ESF_NETWORK_SERVICE] }),
      this.destroyRef,
      (reply) => {
        if (client !== this.client) {
          return;
        }
        this.loading = false;
        this.config = parseEsfConfigs(reply).find((c) => c.pid === ESF_NETWORK_SERVICE) ?? null;
        if (!this.config) {
          this.error = "The unit returned no network configuration.";
        }
        this.build();
        this.cd.markForCheck();
      },
      (reason) => {
        if (client === this.client) {
          this.loading = false;
          this.error = reason;
          this.cd.markForCheck();
        }
      }
    );
  }

  /**
   * "Apply changes": confirmed first — as ESF's console warns, the unit may be unreachable for a moment, or take another address —
   * then the changed settings to the unit (a snapshot taken after); the configuration read again.
   */
  apply(): void {
    const form = this.form;
    if (!form || !form.dirty || form.invalid || this.saving || !this.client) {
      return;
    }
    const changes = form.changes();
    const name = this.iface?.name || form.iface;
    if (!Object.keys(changes).length) {
      form.reset();
      return;
    }
    this.confirm.emit({
      heading: `Apply ${name}'s network settings?`,
      message:
        "The unit may be unreachable for a few seconds — the gateway too — and, depending on the change, take another IP address.",
      confirmLabel: "Apply changes",
      danger: false,
      run: () => this.send(changes, name),
    });
  }

  private send(changes: Record<string, EsfProperty>, name: string): void {
    if (!this.client || this.saving) {
      return;
    }
    this.saving = true;
    this.cd.markForCheck();
    esfSubscribe(
      this.client.call(ESF_NETWORK_CONFIG_API.updateConfig, esfUpdateRequest(ESF_NETWORK_SERVICE, changes)),
      this.destroyRef,
      () => {
        this.saving = false;
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.applied.emit();
        this.load();
      },
      (reason) => {
        this.saving = false;
        this.notify.emit({ tone: "error", message: `Couldn't save ${name}: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  reset(): void {
    this.form?.reset();
  }

  /** A number box's value into the form, as text (none: ""). */
  onNumber(f: IfField, value: number | null): void {
    this.onValue(f, value === null || value === undefined ? "" : String(value));
  }

  /** How a pick shows: a radio group (its options explained — on one row, or one a line), a button group (2–4 short ones) or a select. */
  pick(f: IfField): PickControl {
    return pickControl(this.form.optionsOf(f));
  }

  /** A field's note: its own, else — a button group's options explained — theirs, an option a line. */
  noteOf(f: IfField): string {
    return f.note || (f.kind === "select" ? pickNote(this.form.optionsOf(f)) : "");
  }

  /** The pick's control, a radio group either way it's laid out. */
  pickKind(f: IfField): "radio" | "buttons" | "select" {
    const pick = this.pick(f);
    return pick === "radio-column" ? "radio" : pick;
  }

  /** A pick's options as the radio group's, made once for each list (the group gets the same array every check). */
  radioOptions(f: IfField): RadioOption[] {
    const list = this.form.optionsOf(f);
    let radios = this.radioLists.get(list);
    if (!radios) {
      radios = list.map((o) => ({ id: o.value, label: o.label, info: o.info }));
      this.radioLists.set(list, radios);
    }
    return radios;
  }

  private readonly radioLists = new WeakMap<IfOption[], RadioOption[]>();

  inputId(f: IfField): string {
    return `esf-if-${this.form?.iface ?? ""}-${f.key}`;
  }

  /** A card's title: its own, else its tab's label. */
  sectionTitle(t: IfTab, s: IfSection): string {
    return s.title || t.label;
  }

  /** A card of facts the unit reports only (the modem's, the antenna's): label / value rows, not fields. */
  allStatic(s: IfSection): boolean {
    return s.fields.every((f) => f.kind === "static");
  }

  /** A field's value changed: set, and what that does to the others (the console's rules). */
  onValue(f: IfField, value: string | null): void {
    this.form?.set(f, value ?? "");
  }

  trackSection(i: number): number {
    return i;
  }

  trackField(_: number, f: IfField): string {
    return f.key;
  }

  trackLabel(_: number, row: { label: string }): string {
    return row.label;
  }

  /** The interface's form from the configuration read, and its Hardware facts from its status. */
  private build(): void {
    const iface = this.iface;
    this.form = iface && this.config ? new IfForm(esfInterfaceTabs(iface), iface.id, this.config, iface.raw, esfInterfaceKind(iface) === "loopback") : null;
    const usb = iface ? this.config?.properties[`net.interface.${iface.id}.usb.devicePath`]?.value : undefined;
    this.hardware = iface ? esfInterfaceHardware(iface, typeof usb === "string" ? usb : "") : [];
  }
}
