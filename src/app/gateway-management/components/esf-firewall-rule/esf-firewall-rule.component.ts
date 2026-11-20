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

import { Component, EventEmitter, HostBinding, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { ButtonGroupComponent, fitsButtonGroup } from "../../../components/shared/button-group/button-group.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { esfFirewallFieldError, EsfFirewallField, EsfFirewallSectionDef } from "../../models/esf-firewall.models";

/** A firewall rule opened in the side panel: its kind of rule, its values, and what saving it does to the table's draft. */
export interface EsfFirewallRuleOpen {
  def: EsfFirewallSectionDef;
  ipv6: boolean;
  /** Its fields' values (a checkbox's as "true" / "false"). */
  values: Record<string, string>;
  /** A new rule (the table's "Create new"), else one of its rows. */
  isNew: boolean;
  /** The panel's title and subtitle ("New open port"; "Firewall IPv4 · Open ports"). */
  title: string;
  subtitle: string;
  /** Its values into the table's draft (added last, or in the row's place). */
  save: (values: Record<string, string>) => void;
  /** The panel closed (the row it was opened from no longer lit). */
  closed: () => void;
}

/**
 * A firewall rule's form (the side panel, as ESF's console's "New … Entry" / "Update … Entry" forms): its fields in ESF's order
 * with its names and help — a port or range, a protocol, a network as address/prefix, interfaces (a permitted or an unpermitted
 * one, not both), a MAC, masquerading as a checkbox — each checked as ESF checks it. "Add" / "Save" puts it in the firewall table's
 * draft; the table's "Apply changes" sends it to the unit.
 */
@Component({
  selector: "tb-gm-esf-firewall-rule",
  templateUrl: "./esf-firewall-rule.component.html",
  styleUrls: ["./esf-firewall-rule.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, FormsModule, ButtonGroupComponent, CheckboxComponent, CollapsibleCardComponent, FormActionsComponent, SelectComponent, TipDirective],
})
export class EsfFirewallRuleComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() rule: EsfFirewallRuleOpen | null = null;
  @Output() submitted = new EventEmitter<Record<string, string>>();
  @Output() cancelled = new EventEmitter<void>();

  values: Record<string, string> = {};
  protocols: TbSelectOption[] = [];
  /** Its protocols few and short (TCP | UDP …): a button group, else a select. */
  protocolButtons = false;
  /** "Add" / "Save" was pressed: every field's error shows. */
  tried = false;
  private initial: Record<string, string> = {};

  ngOnChanges(): void {
    this.values = { ...(this.rule?.values ?? {}) };
    this.initial = { ...this.values };
    this.protocols = (this.rule?.def.protocols ?? []).map((p) => ({ value: p, label: p.toUpperCase() }));
    this.protocolButtons = fitsButtonGroup(this.protocols);
    this.tried = false;
  }

  get fields(): EsfFirewallField[] {
    return this.rule?.def.fields ?? [];
  }

  get dirty(): boolean {
    return this.fields.some((f) => this.values[f.key] !== this.initial[f.key]);
  }

  /** A field's error: once "Add" / "Save" was pressed, or once it's changed. */
  errorOf(f: EsfFirewallField): string {
    if (!this.rule || !this.isEnabled(f) || (!this.tried && this.values[f.key] === this.initial[f.key])) {
      return "";
    }
    return esfFirewallFieldError(f, this.values[f.key] ?? "", this.rule.ipv6);
  }

  /** ESF's permitted / unpermitted interface: one set greys the other out. */
  isEnabled(f: EsfFirewallField): boolean {
    return !f.excludedBy || !(this.values[f.excludedBy] ?? "").trim();
  }

  submit(): void {
    this.tried = true;
    if (!this.rule || this.fields.some((f) => this.isEnabled(f) && esfFirewallFieldError(f, this.values[f.key] ?? "", this.rule!.ipv6))) {
      return;
    }
    const values: Record<string, string> = {};
    for (const f of this.fields) {
      values[f.key] = this.isEnabled(f) ? (this.values[f.key] ?? "").trim() : "";
    }
    this.submitted.emit(values);
  }

  inputId(f: EsfFirewallField): string {
    return `esf-fw-rule-${f.key}`;
  }

  trackField(_: number, f: EsfFirewallField): string {
    return f.key;
  }
}
