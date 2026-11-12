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

import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { InfoIconComponent } from "../../../components/shared/info-icon/info-icon.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { addDevicesFromTemplate, ConnectorType, connectorTypeLabel, DeviceFieldPattern, DeviceTemplate, expandPattern, getAtPath } from "../../models/gateway-management.models";

/** The device block's fields that usually differ per device (a Modbus slave's host / unit id): offered as the varying fields when a template is picked. */
const VARYING_FIELD_KEYS = ["host", "unitId", "address", "url"];

/** Devices added to a configuration: its new JSON, the template they came from, and the device blocks themselves (as appended to its list). */
export interface TemplateDevicesAdded {
  json: string;
  template: DeviceTemplate;
  devices: Record<string, any>[];
}

/**
 * "Add devices from a template" for a connector's configuration (the connector
 * form, and the connector dialog's quick edit): a template of the connector's
 * type, a name pattern — "[01-03]" numbers the devices — and the fields that
 * differ per device; Add appends the devices to the configuration's device
 * list and emits the new JSON ({@link added}) for the host to put in its box.
 * A name the list already holds (or one the pattern gives twice) isn't added
 * again: the field says which, and Add waits for names that are free.
 * With {@link showEmpty} a type with no templates says so; otherwise nothing
 * shows for it.
 */
@Component({
  selector: "tb-gm-template-devices",
  templateUrl: "./template-devices.component.html",
  styleUrls: ["./template-devices.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, FormsModule, FoldComponent, InfoIconComponent, SelectComponent],
})
export class TemplateDevicesComponent implements OnChanges {
  /** The tenant's device templates (those of {@link type} are offered). */
  @Input() templates: DeviceTemplate[] = [];
  /** The connector's type. */
  @Input() type: ConnectorType | null = null;
  /** The connector's configuration as it stands: the JSON text the devices are added to. */
  @Input() configJson = "";
  /** Bumped by the host when its form resets: the block folds and clears. */
  @Input() resetKey = 0;
  /** A type with no templates: say so (a section of its own) instead of showing nothing. */
  @Input() showEmpty = false;
  @Output() added = new EventEmitter<TemplateDevicesAdded>();

  /** The fields' info tooltips: how a pattern is written, and how the per-device values use one. */
  readonly namesInfo =
    "One name, or a pattern for several. [01-03] numbers a range (leading zeros kept), [a-c] runs letters, [1,5,9] lists values. scale-[01-03] gives scale-01, scale-02 and scale-03.";
  readonly valuesInfo =
    "A field of the device (a dot path, such as host) and its value. One value goes to every device; a pattern gives one each, in order, such as 192.168.1.[101-103]. A pattern must give as many values as there are devices.";

  /** The block is unfolded. */
  open = false;
  /** The template picked (its id; among those of the connector's type). */
  templateId = "";
  /** The device names: one, or a pattern ("scale-[01-03]"). */
  pattern = "";
  /** The fields that differ per device: a key in the block and its value(s). */
  fields: DeviceFieldPattern[] = [];
  /** What the last Add did (or why it couldn't). */
  message = "";
  error = false;
  /** {@link clashes}, kept for the inputs it was worked out from (change detection asks often; the configuration is parsed once per change). */
  private clashKey = "";
  private clashList: string[] = [];
  private clashRepeated = false;

  constructor(private cd: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"] && !changes["resetKey"].firstChange) {
      this.open = false;
      this.pattern = "";
      this.message = "";
    }
    if (changes["templates"] || changes["type"] || changes["resetKey"]) {
      this.syncTemplate();
    }
  }

  /** The templates of the connector's type. */
  get typeTemplates(): DeviceTemplate[] {
    return this.type ? this.templates.filter((t) => t.type === this.type) : [];
  }

  get templateOptions(): TbSelectOption[] {
    return this.typeTemplates.map((t) => ({ value: t.id, label: t.name }));
  }

  get template(): DeviceTemplate | null {
    return this.typeTemplates.find((t) => t.id === this.templateId) ?? null;
  }

  get typeLabel(): string {
    return this.type ? connectorTypeLabel(this.type) : "these";
  }

  /** How many devices the name pattern gives (0: none yet, or a pattern that can't be read). */
  get deviceCount(): number {
    const pattern = this.pattern.trim();
    if (!pattern) {
      return 0;
    }
    try {
      return expandPattern(pattern).filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  /**
   * The names the pattern gives that can't be added: those the configuration's
   * device list already holds (by the template's name field), or — none of
   * those — those the pattern itself gives more than once.
   */
  get clashes(): string[] {
    const template = this.template;
    const key = `${template?.id ?? ""}|${this.pattern}|${this.configJson}`;
    if (key === this.clashKey) {
      return this.clashList;
    }
    this.clashKey = key;
    this.clashList = [];
    this.clashRepeated = false;
    let names: string[] = [];
    try {
      names = expandPattern(this.pattern.trim()).filter(Boolean);
    } catch {
      names = [];
    }
    if (!template || !names.length) {
      return this.clashList;
    }
    const existing = new Set<string>();
    try {
      const list = getAtPath(JSON.parse(String(this.configJson ?? "")), template.listPath);
      if (Array.isArray(list)) {
        for (const device of list) {
          if (device && typeof device === "object") {
            existing.add(String(getAtPath(device, template.nameKey) ?? ""));
          }
        }
      }
    } catch {
      // The box isn't valid JSON: Add says so.
    }
    const taken = [...new Set(names.filter((n) => existing.has(n)))];
    if (taken.length) {
      this.clashList = taken;
    } else {
      this.clashList = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
      this.clashRepeated = this.clashList.length > 0;
    }
    return this.clashList;
  }

  /** What's wrong with the clashing names, in words ("" for none). */
  get clashText(): string {
    const names = this.clashes;
    if (!names.length) {
      return "";
    }
    const shown = names.slice(0, 3).map((n) => `"${n}"`);
    const listed = names.length > 3 ? `${shown.join(", ")} and ${names.length - 3} more` : shown.join(", ");
    if (this.clashRepeated) {
      return `${listed} ${names.length === 1 ? "is" : "are"} given more than once.`;
    }
    return `${listed} ${names.length === 1 ? "is" : "are"} already in the configuration.`;
  }

  /** The devices just added are, of course, in the configuration now: said plainly, not as an error. */
  private get justAdded(): boolean {
    return !!this.message && !this.error;
  }

  /** Under the pattern: how many devices it names, or what went wrong ("" while it's empty — the label's info icon says how to write one). */
  get patternHint(): string {
    const pattern = this.pattern.trim();
    if (!pattern) {
      return "";
    }
    try {
      const n = expandPattern(pattern).filter(Boolean).length;
      return this.clashText || (n === 1 ? "1 device" : `${n} devices`);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  get patternError(): boolean {
    return !!this.pattern.trim() && (this.deviceCount === 0 || (this.clashes.length > 0 && !this.justAdded));
  }

  /** A template, at least one name, and every name free. */
  get canAdd(): boolean {
    return !!this.template && this.deviceCount > 0 && !this.clashes.length;
  }

  get addLabel(): string {
    const n = this.deviceCount;
    return n ? `Add ${n} device${n === 1 ? "" : "s"}` : "Add devices";
  }

  onTemplate(id: string): void {
    this.templateId = id;
    this.seedFields();
    this.message = "";
  }

  onPattern(pattern: string): void {
    this.pattern = pattern;
    this.message = "";
  }

  addField(): void {
    this.fields = [...this.fields, { key: "", pattern: "" }];
  }

  removeField(index: number): void {
    this.fields = this.fields.filter((_, i) => i !== index);
  }

  trackByIndex(index: number): number {
    return index;
  }

  /** The devices into the configuration: the template's block per name, the varying fields set, appended to its device list. */
  add(): void {
    const template = this.template;
    if (!template) {
      return;
    }
    if (this.clashes.length) {
      this.message = this.clashText;
      this.error = true;
      return;
    }
    let config: Record<string, any>;
    try {
      const parsed = JSON.parse(String(this.configJson ?? ""));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error();
      }
      config = parsed;
    } catch {
      this.message = "Fix the configuration JSON first.";
      this.error = true;
      return;
    }
    try {
      const { config: next, added } = addDevicesFromTemplate(config, template, this.pattern, this.fields);
      this.message = `Added ${added} device${added === 1 ? "" : "s"} to the configuration.`;
      this.error = false;
      if (added > 0) {
        // Appended to the template's device list: the last `added` entries are the new ones.
        const list = getAtPath(next, template.listPath);
        const devices = Array.isArray(list) ? (list.slice(-added) as Record<string, any>[]) : [];
        this.added.emit({ json: JSON.stringify(next, null, 2), template, devices });
      }
    } catch (e) {
      this.message = e instanceof Error ? e.message : String(e);
      this.error = true;
    }
    this.cd.markForCheck();
  }

  /** The picked template must be of the connector's type: else the first of its type (or none). */
  private syncTemplate(): void {
    if (!this.typeTemplates.some((t) => t.id === this.templateId)) {
      this.templateId = this.typeTemplates[0]?.id ?? "";
      this.seedFields();
    }
  }

  /** The varying fields for the template: its block's host / unit id / … with their values (one for all until edited). */
  private seedFields(): void {
    const t = this.template;
    this.fields = t
      ? VARYING_FIELD_KEYS.filter((k) => typeof t.device[k] === "string" || typeof t.device[k] === "number").map((k) => ({ key: k, pattern: String(t.device[k]) }))
      : [];
  }
}
