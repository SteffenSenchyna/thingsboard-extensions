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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription } from "rxjs";
import { DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { TableManage } from "../../../components/shared/data-table/table-manage";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import {
  ESF_FIREWALL_SECTIONS,
  esfFirewallDraft,
  EsfFirewallRule,
  esfFirewallRuleText,
  EsfFirewallSection,
  EsfFirewallSectionDef,
  esfFirewallShown,
  esfFirewallValue,
  parseEsfFirewallRules,
} from "../../models/esf-firewall.models";
import { EsfFirewallRuleOpen } from "../esf-firewall-rule/esf-firewall-rule.component";


/**
 * ESF's firewall settings (the Network view's FirewallConfigurationService, and its IPv6 twin) as one card: its title row's
 * pickers (the timeframe picker's look) choosing the firewall — IPv4 | IPv6, `components` — and its rules — Open ports | Port
 * forwarding | NAT — over a table of them, a rule a row, its columns its fields (those no rule sets left out). "Create new", or a
 * row, opens the rule's form in the side panel (`ruleOpen`: the dashboard's, as ESF's entry forms — "Add" puts it last, "Save" in
 * its place); Manage's "Delete (n)" takes the checked ones out. All change the settings form's draft — the setting's control, its
 * rules as Kura writes them — so the form's "Apply changes" sends them, and its Cancel puts them back.
 */
@Component({
  selector: "tb-gm-esf-firewall",
  templateUrl: "./esf-firewall.component.html",
  styleUrls: ["./esf-firewall.component.scss"],
  standalone: true,
  imports: [CommonModule, DataTableComponent, TableLinksComponent, TimeframePickerComponent],
})
export class EsfFirewallComponent implements OnChanges {
  /** The settings form. */
  @Input() form!: FormGroup;
  /** Each firewall setting's control in it. */
  @Input() keys: Partial<Record<EsfFirewallSection, string>> = {};
  /** The IPv6 firewall's (its networks and addresses IPv6). */
  @Input() ipv6 = false;
  /** The card's title. */
  @Input() title = "Firewall";
  /** The firewalls to pick from (IPv4 | IPv6 — the title row's first picker; none: no picker) and the one shown. */
  @Input() components: SegmentOption[] = [];
  @Input() component = "";
  /** The firewall picked is being read: its rows' placeholders. */
  @Input() loading = false;
  @Output() componentChange = new EventEmitter<string>();
  /** A rule to open in the side panel: "Create new", or a row clicked (the dashboard's panel, its form). */
  @Output() ruleOpen = new EventEmitter<EsfFirewallRuleOpen>();

  @ViewChild("table") table?: DataTableComponent;
  readonly manage = new TableManage(() => this.table, () => this.rules.length);

  options: SegmentOption[] = [];
  section: EsfFirewallSection = "openPorts";
  def: EsfFirewallSectionDef = ESF_FIREWALL_SECTIONS[0];
  rules: EsfFirewallRule[] = [];
  rows: Record<string, string>[] = [];
  columns: DataTableColumn[] = [];

  /** The row whose rule is open in the side panel (lit); "" none. */
  openKey = "";

  private valueSub: Subscription | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["keys"] || changes["form"]) {
      // No firewall read yet (the other one picked, being read): every kind of rule stays on the picker, the one picked kept.
      const loaded = Object.keys(this.keys).length > 0;
      this.options = ESF_FIREWALL_SECTIONS.filter((s) => !loaded || this.keys[s.id]).map((s) => ({ id: s.id, label: s.label }));
      const first = this.options.find((o) => o.id === this.section) ?? this.options[0];
      this.show((first?.id as EsfFirewallSection) ?? "openPorts");
    }
  }

  get emptyText(): string {
    return this.section === "openPorts" ? "No open ports" : this.section === "portForwarding" ? "No port forwards" : "No NAT rules";
  }

  selectSection(id: string): void {
    if (id !== this.section) {
      this.show(id as EsfFirewallSection);
    }
  }

  /** "Create new": a new rule's form in the side panel, its defaults ESF's; "Add" puts it last in the draft. */
  startAdd(): void {
    this.manage.end();
    const def = this.def;
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(esfFirewallDraft(def, this.ipv6))) {
      values[key] = String(value);
    }
    this.openKey = "";
    this.ruleOpen.emit(this.ruleFor(def, values, true, def.newLabel, (v) => this.write([...this.rulesOf(def), { key: "", raw: esfFirewallRuleText(def, v), values: {}, valid: true }], def)));
  }

  /** A row clicked: its rule's form in the side panel; "Save" puts it back in its place. A rule that doesn't parse opens nothing. */
  openRow(row: Record<string, any>): void {
    const rule = this.rules.find((r) => r.key === row["key"]);
    if (!rule?.valid) {
      return;
    }
    const def = this.def;
    this.openKey = rule.key;
    this.ruleOpen.emit(
      this.ruleFor(def, { ...rule.values }, false, def.fields.map((f) => esfFirewallShown(f, rule.values[f.key] ?? "")).filter(Boolean).slice(0, 2).join(" · "), (v) =>
        this.write(
          this.rulesOf(def).map((r) => (r.key === rule.key ? { ...r, raw: esfFirewallRuleText(def, v) } : r)),
          def
        )
      )
    );
  }

  /** Manage's "Delete (n)": the checked rules out of the setting's draft. */
  deleteSelected(): void {
    const gone = new Set(this.manage.selected.map((r) => r["key"] as string));
    this.manage.end();
    this.write(this.rules.filter((r) => !gone.has(r.key)));
  }


  // ---- The rules ------------------------------------------------------------------------------------------------------------

  /** A setting's rules shown, followed as the form's draft changes (an add, a delete, the form's Cancel). */
  private show(section: EsfFirewallSection): void {
    this.section = section;
    this.def = ESF_FIREWALL_SECTIONS.find((s) => s.id === section) ?? ESF_FIREWALL_SECTIONS[0];
    this.openKey = "";
    this.manage.end();
    this.valueSub?.unsubscribe();
    const control = this.keys[section] ? this.form?.controls[this.keys[section]!] : undefined;
    this.read(control?.value);
    this.valueSub =
      control?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
        this.read(value);
        this.cd.markForCheck();
      }) ?? null;
  }

  private read(value: unknown): void {
    this.rules = parseEsfFirewallRules(this.def, value);
    const fields = this.def.fields.filter((f) => f.always || this.rules.some((r) => r.valid && r.values[f.key]));
    // A phone's condensed table: a rule's first field its name, its next two named under it (the rule's form has the rest).
    this.columns = fields.map((f, i) => ({
      key: f.key,
      header: f.label,
      emphasis: i === 0 ? "strong" : undefined,
      nowrap: true,
      phone: i === 0 ? "title" : i < 3 ? "meta" : "hide",
    }));
    this.rows = this.rules.map((r) => {
      const row: Record<string, string> = { key: r.key };
      if (r.valid) {
        fields.forEach((f) => (row[f.key] = esfFirewallShown(f, r.values[f.key] ?? "")));
      } else {
        // A rule that doesn't parse: its text as it is, in the first column.
        row[fields[0].key] = r.raw;
      }
      return row;
    });
    this.manage.keep(new Set(this.rules.map((r) => r.key)), "key");
  }

  /** A setting's rules as the draft has them now. */
  private rulesOf(def: EsfFirewallSectionDef): EsfFirewallRule[] {
    const control = this.keys[def.id] ? this.form?.controls[this.keys[def.id]!] : undefined;
    return parseEsfFirewallRules(def, control?.value);
  }

  /** A rule for the side panel: what saving it does — into its setting's draft (the one it was opened on). */
  private ruleFor(
    def: EsfFirewallSectionDef,
    values: Record<string, string>,
    isNew: boolean,
    title: string,
    save: (values: Record<string, string>) => void
  ): EsfFirewallRuleOpen {
    return {
      def,
      ipv6: this.ipv6,
      values,
      isNew,
      title,
      subtitle: `${this.title}${this.components.length > 1 ? ` ${this.components.find((c) => c.id === this.component)?.label ?? ""}` : ""} · ${def.label}`,
      save: (v) => {
        save(v);
        this.openKey = "";
      },
      closed: () => {
        this.openKey = "";
        this.cd.markForCheck();
      },
    };
  }

  /** The current setting's rules into the draft (its control, dirty). */
  private write(rules: EsfFirewallRule[], def: EsfFirewallSectionDef = this.def): void {
    const control = this.keys[def.id] ? this.form?.controls[this.keys[def.id]!] : undefined;
    control?.setValue(esfFirewallValue(rules));
    control?.markAsDirty();
  }

}
