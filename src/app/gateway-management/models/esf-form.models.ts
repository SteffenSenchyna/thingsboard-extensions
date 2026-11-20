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

// A form of ESF settings, as the ESF views edit them — a component's (Configuration, Network's firewall) or an interface's
// (its NetworkConfigurationService settings): each setting a field built from ESF's own definition, its control in one form
// group; what changed measured against the values loaded, and sent as ESF's properties. A component with a layout of its own
// (`esf-layouts.models.ts`: an SSL manager, a keystore) has its fields named and arranged by it — in cards (`cards`).

import { FormBuilder, FormGroup } from "@angular/forms";
import { TbSelectOption } from "../../components/shared/select/select.component";
import { EsfAttribute, esfBound, EsfComponentConfig, esfFieldError, EsfFieldKind, esfFieldKind, esfFieldValue, EsfProperty, esfPropertyOf, esfShortName } from "./esf.models";
import { esfLabelWithoutUnit, esfSettingLabel, esfUnit } from "./esf-notes.models";
import { EsfComponentFactory } from "./esf-security.models";
import { esfTargetOptions, isEsfTarget } from "./esf-targets.models";
import { EsfLayoutField, esfLayoutOf } from "./esf-layouts.models";
import { EsfScriptIssue, esfScriptIssues, EsfScriptKind, esfScriptKindOf } from "./esf-script.models";
import { esfJavaRegexError, EsfReceivedProperties, esfRegexMatchWarning, isEsfRegexSetting } from "./esf-regex.models";

const NO_ISSUES: EsfScriptIssue[] = [];

/**
 * A script's status at the top of its card — a title alone, always there, so nothing moves as it changes: "No problems", else the
 * worst issue and its line ("Syntax error on line 21"); the issues themselves are marked in the editor's gutter, each on its line.
 */
export interface EsfScriptStatus {
  type: "success" | "warning" | "error";
  title: string;
}

function scriptStatusOf(issues: EsfScriptIssue[]): EsfScriptStatus {
  const first = issues[0];
  return first ? { type: first.level, title: first.line ? `${first.title} on line ${first.line}` : first.title } : { type: "success", title: "No problems" };
}

/** A setting's field: its definition, how it's edited, its control's key in the form, and its label. */
export interface EsfField {
  key: string;
  attr: EsfAttribute;
  kind: EsfFieldKind;
  inputId: string;
  /** Its name over the control (the setting's name, or a shorter one — an interface's settings drop the interface). */
  label: string;
  options: TbSelectOption[];
  min: number | undefined;
  max: number | undefined;
  /** A number's unit, inside its box ("s", "bytes" — `esfUnit`); "" none. */
  unit: string;
  /** A pick of the unit's services (a reference's target — `esf-targets.models.ts`): always a select, a list from data. */
  services: boolean;
  /** Its info bubble's text: its description's short note, or its layout's ("" none). */
  note: string;
  /** A pick's control, where its layout sets it (else by its options — `pickControl`). */
  control?: "buttons" | "radio" | "radio-column" | "select";
  /** A list in one value shown one item a line (a textarea); saved with its separator again. */
  lines: boolean;
  /** What separates a `lines` value's items in ESF ("," or " "). */
  separator: "," | " ";
  /**
   * A GraalVM™ script (a Filter Component's script, a Conditional Component's condition — `esf-script.models.ts`): ThingsBoard's
   * script editor, ESF's checks under it; null any other setting.
   */
  code: EsfScriptKind | null;
  /** A Java regular expression (a Regex Filter's pattern — `esf-regex.models.ts`): checked as Java reads it, what's wrong under it. */
  regex: boolean;
}

/** A row of a laid-out card: a field, and the setting that's its unit (a select beside it), if any. */
export interface EsfFormRow {
  field: EsfField;
  unit: EsfField | null;
}

/** A laid-out form's card: its title and note, the switch heading it (folding its rows open while on), its rows. */
export interface EsfFormCard {
  title: string;
  info: string;
  gate: EsfField | null;
  rows: EsfFormRow[];
}

/** One item a line → the value ESF keeps, its items joined by their separator. */
const fromLines = (value: unknown, separator: string): string =>
  String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(separator);

/** ESF's value → one item a line (split on commas, or on any whitespace). */
const toLines = (value: unknown, separator: string): string =>
  String(value ?? "")
    .split(separator === " " ? /\s+/ : ",")
    .map((v) => v.trim())
    .filter(Boolean)
    .join("\n");

let formSeq = 0;

/**
 * Its settings' labels (`esfSettingLabel`): less what repeats the component's name — but where two would then read alike,
 * those two in full.
 */
function settingLabels(config: EsfComponentConfig | null, attributes: EsfAttribute[]): string[] {
  const component = config ? `${config.definition?.name ?? ""} ${esfShortName(config.pid)}` : "";
  const short = attributes.map((a) => esfSettingLabel(a, component));
  return short.map((label, i) => (short.indexOf(label) !== short.lastIndexOf(label) ? esfSettingLabel(attributes[i]) : label));
}

/** A form of settings: its fields (in the definition's order), its controls, and the values loaded. */
export class EsfForm {
  readonly fields: EsfField[];
  /** Its layout's cards (an SSL manager's, a keystore's), every field placed in one; null — the fields as a flat list. */
  readonly cards: EsfFormCard[] | null;
  readonly group: FormGroup;
  /** Settings its layout leaves to another view (an asset's channels — the Channels tab's): in no card, never "Other settings". */
  private readonly excluded: (attr: EsfAttribute) => boolean;
  private initial: Record<string, unknown>;
  /** The script fields' last checks, by field (`scriptIssuesOf`). */
  private scriptChecks = new Map<string, { value: unknown; issues: EsfScriptIssue[] }>();
  private status: { issues: EsfScriptIssue[] | null; value: EsfScriptStatus } = { issues: null, value: scriptStatusOf(NO_ISSUES) };
  /**
   * What reaches the component (the Wire graph's: the properties of the records wired into it — `esfWirePropertiesInto`), for its
   * Regex Filter pattern's warning; null — not known (not in a graph, a source whose records aren't known).
   */
  receives: (() => EsfReceivedProperties | null) | null = null;
  /** The pattern fields' last warnings, by field (`warningOf`). */
  private warnings = new Map<string, { key: string; warning: string | null }>();

  constructor(
    fb: FormBuilder,
    /** The component's configuration (its values). */
    config: EsfComponentConfig | null,
    /** The settings the form edits (all of the definition's, or some). */
    attributes: EsfAttribute[],
    /**
     * The unit's components with their factories (`EsfClient.componentFactories`): a setting naming another service by its pid
     * picks one of them (`esfTargetOptions`); none given, it's text.
     */
    services: EsfComponentFactory[] = [],
    /** Its settings' labels, where the form's own (`esfSettingLabel`) won't do — an asset's channel's (`esfChannelLabel`). */
    labelOf?: (a: EsfAttribute) => string
  ) {
    const seq = ++formSeq;
    const labels = labelOf ? attributes.map(labelOf) : settingLabels(config, attributes);
    const layout = esfLayoutOf(config?.definition?.id);
    const placed = new Map<string, EsfLayoutField>();
    layout?.cards.forEach((c) => [...(c.gate ? [c.gate] : []), ...c.fields].forEach((f) => placed.set(f.id, f)));
    const controls: Record<string, unknown> = {};
    const attrIds = attributes.map((a) => a.id);
    this.fields = attributes.map((attr, i) => {
      const key = `f${i}`;
      const own = placed.get(attr.id);
      const loaded = esfFieldValue(attr, config?.properties[attr.id]);
      const lines = !!own?.lines;
      const separator = own?.separator ?? ",";
      const value = lines ? toLines(loaded, separator) : loaded;
      controls[key] = [value];
      // A setting naming another service (a target filter): a pick of the unit's.
      const targets = isEsfTarget(attr) ? esfTargetOptions(attr, String(value ?? ""), config?.pid ?? "", services) : null;
      // A layout's options (a text setting with known values — the SSL protocol): the value set now kept if it's another.
      const given = own?.options
        ? [...own.options, ...(value && !own.options.some((o) => o.value === value) ? [{ value: String(value), label: String(value) }] : [])]
        : null;
      const kind = targets || given ? "select" : lines ? "textarea" : esfFieldKind(attr);
      const options: TbSelectOption[] = targets ?? given ?? attr.options.map((o) => ({ value: o.value, label: o.label }));
      const unit = kind === "integer" || kind === "decimal" ? esfUnit(attr) : "";
      return {
        key,
        attr,
        kind,
        inputId: `esf-${seq}-${i}`,
        label: own?.label ?? (unit ? esfLabelWithoutUnit(labels[i]) : labels[i]),
        options: kind === "select" && !attr.required && !given ? [{ value: "", label: "None" }, ...options] : options,
        min: esfBound(attr.min) ?? undefined,
        max: esfBound(attr.max) ?? undefined,
        unit: own?.unitOf ? "" : unit,
        services: !!targets,
        note: own?.note ?? attr.note,
        control: own?.control,
        lines,
        separator,
        code: esfScriptKindOf(config?.definition?.id, attr.id, attrIds),
        regex: isEsfRegexSetting(config?.definition?.id, attr.id),
      };
    });
    this.excluded = layout?.exclude ?? (() => false);
    this.cards = layout ? this.layOut(layout.cards) : null;
    this.group = fb.group(controls);
    this.initial = this.group.getRawValue();
  }

  /** Its layout's cards, of its fields; the fields it doesn't place (a newer ESF's settings) a last card, "Other settings". */
  private layOut(cards: { title: string; info?: string; gate?: EsfLayoutField; fields: EsfLayoutField[] }[]): EsfFormCard[] {
    const byId = new Map(this.fields.map((f) => [f.attr.id, f]));
    const used = new Set<string>();
    const take = (id: string | undefined): EsfField | null => {
      const f = id ? byId.get(id) : undefined;
      if (f) {
        used.add(id!);
      }
      return f ?? null;
    };
    const out: EsfFormCard[] = cards.map((c) => {
      const gate = take(c.gate?.id);
      const units = new Set(c.fields.filter((f) => f.unitOf).map((f) => f.unitOf!));
      const rows: EsfFormRow[] = [];
      for (const lf of c.fields.filter((f) => !units.has(f.id))) {
        const field = take(lf.id);
        if (field) {
          rows.push({ field, unit: take(lf.unitOf) });
        }
      }
      return { title: c.title, info: c.info ?? "", gate, rows };
    });
    const rest = this.fields.filter((f) => !used.has(f.attr.id) && !this.excluded(f.attr));
    if (rest.length) {
      out.push({ title: "Other settings", info: "", gate: null, rows: rest.map((field) => ({ field, unit: null })) });
    }
    return out.filter((c) => c.gate || c.rows.length);
  }

  /** Whether a field differs from what was loaded — a password only once something's typed into it. */
  changed(f: EsfField): boolean {
    const value = this.group.controls[f.key]?.value;
    if (f.kind === "password") {
      return value !== "" && value !== null && value !== undefined;
    }
    return JSON.stringify(value ?? null) !== JSON.stringify(this.initial[f.key] ?? null);
  }

  /** What's wrong with a changed field's value (shown under it), else null. */
  errorOf(f: EsfField): string | null {
    const control = this.group.controls[f.key];
    if (!control || !this.changed(f)) {
      return null;
    }
    const error = esfFieldError(f.attr, f.lines ? fromLines(control.value, f.separator) : control.value);
    if (error) {
      return error;
    }
    // A Regex Filter's pattern Java can't compile: ESF would filter nothing.
    if (f.regex) {
      return esfJavaRegexError(String(control.value ?? ""));
    }
    // A script: what ESF won't run past (every issue marked in its editor's gutter).
    return f.code ? (this.scriptIssuesOf(f).find((i) => i.level === "error")?.title ?? null) : null;
  }

  /**
   * What a field's value won't do, though it's valid (shown under it, Apply not held): a Regex Filter's pattern matching none of the
   * properties reaching it (`esfRegexMatchWarning`) — its RETAIN emitting empty records, its REMOVE taking nothing out.
   */
  warningOf(f: EsfField): string | null {
    if (!f.regex || !this.receives) {
      return null;
    }
    const pattern = String(this.group.controls[f.key]?.value ?? "");
    const received = this.receives();
    const key = `${pattern}\u0000${received ? `${received.names.join("\u0001")}\u0000${received.shown.join("\u0001")}` : ""}`;
    const last = this.warnings.get(f.key);
    if (last?.key === key) {
      return last.warning;
    }
    const warning = esfRegexMatchWarning(pattern, received);
    this.warnings.set(f.key, { key, warning });
    return warning;
  }

  /** The form has a GraalVM™ script (its card shows the script's status at its top). */
  get hasScript(): boolean {
    return this.fields.some((f) => !!f.code);
  }

  /** The script's status (`EsfScriptStatus`): its first script field's — the same object while its issues are the same. */
  get scriptStatus(): EsfScriptStatus {
    const field = this.fields.find((f) => f.code);
    const issues = field ? this.scriptIssuesOf(field) : NO_ISSUES;
    if (issues !== this.status.issues) {
      this.status = { issues, value: scriptStatusOf(issues) };
    }
    return this.status.value;
  }

  /** What ESF would make of a script field as it stands (`esfScriptIssues`), checked again only as its value changes. */
  scriptIssuesOf(f: EsfField): EsfScriptIssue[] {
    if (!f.code) {
      return NO_ISSUES;
    }
    const value = this.group.controls[f.key]?.value;
    const last = this.scriptChecks.get(f.key);
    if (last && last.value === value) {
      return last.issues;
    }
    const issues = esfScriptIssues(f.code, value);
    this.scriptChecks.set(f.key, { value, issues });
    return issues;
  }

  get dirty(): boolean {
    return this.fields.some((f) => this.changed(f));
  }

  get invalid(): boolean {
    return this.fields.some((f) => this.errorOf(f) !== null);
  }

  /**
   * What it holds now is what the unit has (applied — the Wire graph's Apply): its values its new start, so nothing reads as
   * changed; a password typed cleared ("Unchanged" again).
   */
  markSaved(): void {
    for (const f of this.fields) {
      if (f.kind === "password") {
        this.group.controls[f.key]?.setValue("", { emitEvent: false });
      }
    }
    this.initial = this.group.getRawValue();
  }

  /** Put the fields back as they were loaded. */
  reset(): void {
    this.group.reset(this.initial);
  }

  /** The changed settings as ESF's properties (an update sends only these). */
  changes(): Record<string, EsfProperty> {
    return this.propertiesOf(this.fields.filter((x) => this.changed(x)));
  }

  /**
   * Every setting as ESF's properties (something new, sent whole — a new channel of an asset), a password only once something's
   * typed into it.
   */
  values(): Record<string, EsfProperty> {
    return this.propertiesOf(this.fields.filter((f) => f.kind !== "password" || this.changed(f)));
  }

  /** Every field whose value is wrong, changed or not (something new: all of it is sent). */
  get anyInvalid(): boolean {
    return this.fields.some((f) => {
      const control = this.group.controls[f.key];
      return !!control && esfFieldError(f.attr, f.lines ? fromLines(control.value, f.separator) : control.value) !== null;
    });
  }

  private propertiesOf(fields: EsfField[]): Record<string, EsfProperty> {
    const properties: Record<string, EsfProperty> = {};
    for (const f of fields) {
      const value = this.group.controls[f.key].value;
      properties[f.attr.id] = esfPropertyOf(f.attr, f.lines ? fromLines(value, f.separator) : value);
    }
    return properties;
  }
}
