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

import { ChangeDetectorRef, Component, DoCheck, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { CardComponent } from "../../card/card.component";
import { FormActionsComponent } from "../../form-actions/form-actions.component";
import { NO_LEAD_TRAIL_SPACES, nameErrorOf, nameValidators, uniqueNameValidator } from "../../form-utils";
import { CheckboxComponent } from "../../checkbox/checkbox.component";
import { IconBadgeComponent } from "../../icon-badge/icon-badge.component";
import { RadioGroupComponent, RadioOption } from "../../radio-group/radio-group.component";
import { SelectComponent, TbSelectOption } from "../../select/select.component";
import { TagPickerComponent, TagPickerOption } from "../../tag-picker/tag-picker.component";
import { AssetRow, productLineLabel, siteOptionLabel } from "../../organization/organization.models";
import { ACCESS_ROLE_ICONS, AccessAction, AccessRole, AccessRoleDraft, AccessRoleTargets, BUILT_IN_ROLES } from "../access.models";
import { AccessLevelActionsComponent } from "../access-level-actions/access-level-actions.component";
import { AccessStartAppOption } from "../access-group-form/access-group-form.component";

/** A start app among the "Opens on" choices: `app:<its id>` (a dashboard's is its id, Home's ""). */
const START_PREFIX = "app:";

/** Where a role applies, for one kind of item: every one (new ones too), the ones picked, or none. */
type TargetMode = "all" | "some" | "none";

/** Where a role applies, for one kind of item: all (new ones too), some (picked) or none — its radios. */
const MODE_OPTIONS: RadioOption[] = [
  { id: "all", label: "All" },
  { id: "some", label: "Some" },
  { id: "none", label: "None" },
];

/** The kinds of scope items a role applies to (its form's "Applies"). */
interface TargetKind {
  key: "productLines" | "markets" | "sites";
  label: string;
  options: TagPickerOption[];
}

const ICON_OPTIONS: TbSelectOption[] = ACCESS_ROLE_ICONS.map((i) => ({ value: i.id, label: i.label }));

/**
 * A role's form (Access › Roles, its panel): its name, its default groups'
 * name ("Viewers"), its icon and description; what its members may do (the
 * actions grid, editable); the applications and the "Opens on" its groups
 * start from (a group's own, when it sets them, win); and where it applies —
 * regional, and every product line, market and plant, some of them or none:
 * each has a default group of it. Create / Cancel always show for a new
 * role; editing one, Cancel / Apply show once it differs. A default role
 * ({@link AccessRole.default}) shows as it is: every field disabled, no
 * buttons. Save emits the draft; the access store saves the roles and
 * applies this one.
 */
@Component({
  selector: "tb-access-role-form",
  templateUrl: "./access-role-form.component.html",
  styleUrls: ["./access-role-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CardComponent,
    CheckboxComponent,
    IconBadgeComponent,
    RadioGroupComponent,
    SelectComponent,
    TagPickerComponent,
    AccessLevelActionsComponent,
    FormActionsComponent,
  ],
})
export class AccessRoleFormComponent implements OnInit, OnChanges, DoCheck {
  /** The role being edited (null: a new one). */
  @Input() value: AccessRole | null = null;
  /** The other roles' names and group names — each is unique. */
  @Input() existingNames: string[] = [];
  /** The Organization's lists (where it applies). */
  @Input() productLines: AssetRow[] = [];
  @Input() markets: AssetRow[] = [];
  @Input() sites: AssetRow[] = [];
  /** The applications (the apps' choices). */
  @Input() appOptions: TagPickerOption[] = [];
  /** The dashboards (the home's choices; "None" first). */
  @Input() dashboardOptions: TbSelectOption[] = [];
  /** Home's apps (the start app's choices). */
  @Input() startApps: AccessStartAppOption[] = [];
  @Input() resetKey = 0;
  @Input() saving = false;
  /** Its apply under way ("Applying… 3 / 12"). */
  @Input() progress: { done: number; total: number } | null = null;
  @Output() submitted = new EventEmitter<AccessRoleDraft>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  readonly iconOptions = ICON_OPTIONS;
  readonly modeOptions = MODE_OPTIONS;
  /** Each kind of item, with its choices (rebuilt when the lists change). */
  kinds: TargetKind[] = [];
  /** "Opens on": Home, Home's apps ("Home › QC Lab"), then the dashboards. */
  opensOnOptions: TbSelectOption[] = [];
  private baseline = "";
  private seen: unknown[] = [];

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      label: ["", nameValidators(() => this.existingNames)],
      plural: ["", [Validators.pattern(NO_LEAD_TRAIL_SPACES), uniqueNameValidator(() => this.existingNames)]],
      icon: ["badge"],
      description: [""],
      actions: [[] as AccessAction[]],
      appIds: [[] as string[]],
      runningApps: [false],
      opensOn: [""],
      regional: [false],
      productLinesMode: ["none" as TargetMode],
      productLines: [[] as string[]],
      marketsMode: ["none" as TargetMode],
      markets: [[] as string[]],
      sitesMode: ["none" as TargetMode],
      sites: [[] as string[]],
    });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.form && (changes["resetKey"] || changes["value"])) {
      this.reset();
    }
  }

  ngDoCheck(): void {
    const inputs = [this.productLines, this.markets, this.sites, this.dashboardOptions, this.startApps];
    if (inputs.every((x, i) => x === this.seen[i])) {
      return;
    }
    this.seen = inputs;
    const byName = (a: TagPickerOption, b: TagPickerOption) => a.label.localeCompare(b.label, undefined, { numeric: true });
    this.kinds = [
      {
        key: "productLines",
        label: "Product lines",
        // A product line's row after the lines above it ("Building Materials › ACM › AAT"), its chip by its name ("AAT").
        options: this.productLines.map((l) => ({ id: l.id, label: productLineLabel(l, this.productLines), chipLabel: l.name })).sort(byName),
      },
      { key: "markets", label: "Markets", options: this.markets.map((m) => ({ id: m.id, label: m.name })).sort(byName) },
      { key: "sites", label: "Plants", options: this.sites.map((x) => ({ id: x.id, label: siteOptionLabel(x) })).sort(byName) },
    ];
    const dashboards = this.dashboardOptions.filter((o) => !!o.value);
    this.opensOnOptions = [
      { value: "", label: "Home" },
      ...this.startApps.filter((a) => !!a.applicationId).map((a) => ({ value: `${START_PREFIX}${a.id}`, label: `Home › ${a.label}` })),
      ...dashboards,
    ];
  }

  get creating(): boolean {
    return !this.value;
  }

  /** A default role: shown, not edited. */
  get locked(): boolean {
    return !!this.value?.default;
  }

  get dirty(): boolean {
    return !!this.form && JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get canSubmit(): boolean {
    return !this.locked && this.form.valid && !this.saving && (this.creating || this.dirty);
  }

  get submitLabel(): string {
    if (this.saving) {
      return this.progress?.total ? `Applying… ${this.progress.done} / ${this.progress.total}` : "Saving…";
    }
    return this.creating ? "Create role" : "Apply changes";
  }

  /** Its default groups' name: the one typed, else the role's name with an "s". */
  get pluralText(): string {
    return String(this.form.controls["plural"].value ?? "").trim() || this.pluralOf(String(this.form.controls["label"].value ?? "").trim());
  }

  get actions(): AccessAction[] {
    return this.form.controls["actions"].value as AccessAction[];
  }

  get icon(): string {
    return String(this.form.controls["icon"].value || "badge");
  }

  mode(key: TargetKind["key"]): TargetMode {
    return this.form.controls[`${key}Mode`].value as TargetMode;
  }

  picked(key: TargetKind["key"]): string[] {
    return this.form.controls[key].value as string[];
  }

  error(control: "label" | "plural"): string | null {
    return nameErrorOf(this.form.controls[control], "Another role has this name.");
  }

  setActions(actions: AccessAction[]): void {
    this.setValue("actions", actions);
  }

  /** A list picker's picks (the tag picker isn't a form control). */
  setList(control: "appIds" | TargetKind["key"], ids: string[]): void {
    this.setValue(control, ids);
  }

  setRegional(on: boolean): void {
    this.setValue("regional", on);
  }

  setRunningApps(on: boolean): void {
    this.setValue("runningApps", on);
  }

  cancel(): void {
    if (this.creating) {
      this.cancelled.emit();
    } else {
      this.reset();
    }
  }

  submit(): void {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const label = String(v.label).trim();
    const opensOn = String(v.opensOn ?? "");
    const targets = (key: TargetKind["key"]): AccessRoleTargets => {
      const m = this.mode(key);
      return { all: m === "all", ids: m === "some" ? [...this.picked(key)] : [] };
    };
    this.submitted.emit({
      label,
      plural: this.pluralText,
      icon: this.icon,
      description: String(v.description ?? "").trim(),
      actions: [...this.actions],
      appIds: [...v.appIds],
      runningApps: !!v.runningApps,
      startApp: opensOn.startsWith(START_PREFIX) ? opensOn.slice(START_PREFIX.length) : "",
      homeDashboardId: opensOn.startsWith(START_PREFIX) ? "" : opensOn,
      appliesTo: { regional: !!v.regional, productLines: targets("productLines"), markets: targets("markets"), sites: targets("sites") },
    });
  }

  private setValue(control: string, value: unknown): void {
    const c = this.form.controls[control];
    c.setValue(value);
    c.markAsDirty();
  }

  private reset(): void {
    // A new role starts as a viewer does, applying nowhere until picked.
    const r = this.value;
    const base = r ?? { ...BUILT_IN_ROLES[0], label: "", plural: "", icon: "badge", description: "" };
    const mode = (t: AccessRoleTargets | undefined): TargetMode => (!r || !t ? "none" : t.all ? "all" : t.ids.length ? "some" : "none");
    this.form.reset(
      {
        label: base.label,
        // Its default groups' name: kept empty while it's the name with an "s" (it follows the name).
        plural: r && r.plural !== this.pluralOf(r.label) ? r.plural : "",
        icon: base.icon,
        description: base.description,
        actions: [...base.actions],
        appIds: [...(r?.appIds ?? [])],
        runningApps: !!r?.runningApps,
        opensOn: r?.startApp ? `${START_PREFIX}${r.startApp}` : (r?.homeDashboardId ?? ""),
        regional: !!r?.appliesTo.regional,
        productLinesMode: mode(r?.appliesTo.productLines),
        productLines: [...(r?.appliesTo.productLines.ids ?? [])],
        marketsMode: mode(r?.appliesTo.markets),
        markets: [...(r?.appliesTo.markets.ids ?? [])],
        sitesMode: mode(r?.appliesTo.sites),
        sites: [...(r?.appliesTo.sites.ids ?? [])],
      },
      { emitEvent: false }
    );
    if (this.locked) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.cd.markForCheck();
  }

  private pluralOf(label: string): string {
    return label ? `${label}s` : "";
  }
}
