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

import { Component, HostBinding, Input, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { TipDirective } from "../tip/tip.directive";

/**
 * A settings card's body (the settings card's object cards — QC Lab's
 * Calibration, Alarm reporting, Threshold alarm): its objects and fields one
 * under another, the form's field gap between them; a `tb-setting-divider`
 * between two objects.
 *
 * ```html
 * <tb-collapsible-card title="Threshold alarm" [info]="note">
 *   <tb-setting-stack [formGroup]="form">
 *     <tb-setting-object [open]="form.value.ch1On">
 *       <tb-ext-switch gate label="Channel 1" [heading]="true" formControlName="ch1On"></tb-ext-switch>
 *       <tb-setting-field label="Min threshold"><tb-slider-stepper formControlName="ch1Min"></tb-slider-stepper></tb-setting-field>
 *     </tb-setting-object>
 *     <tb-setting-divider></tb-setting-divider>
 *     …
 *   </tb-setting-stack>
 * </tb-collapsible-card>
 * ```
 */
@Component({
  selector: "tb-setting-stack",
  template: "<ng-content></ng-content>",
  styleUrls: ["./setting-stack.component.scss"],
  standalone: true,
})
export class SettingStackComponent {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
}

/** The rule between two objects of a {@link SettingStackComponent} ("Channel 1" | "Channel 2"). */
@Component({
  selector: "tb-setting-divider",
  template: "",
  styleUrls: ["./setting-divider.component.scss"],
  standalone: true,
})
export class SettingDividerComponent {}

/**
 * One setting of a settings card (a channel's calibration, a limit): its
 * switch heading it — projected `[gate]`, anything beside it `[gate-extra]`
 * (the bulk editor's "Disable") — and its fields (the content), folding open
 * while it's on ({@link open}) with the collapsible cards' grid-track
 * animation, kept mounted (`inert` while folded), their overflow let out once
 * open (a field's bubble isn't clipped). Without a switch (`gated` false) its
 * fields always show, under its plain {@link label} if any. The fields sit
 * flat under the switch, or ({@link flat} false) indented past a thin rule
 * centred under it.
 */
@Component({
  selector: "tb-setting-object",
  templateUrl: "./setting-object.component.html",
  styleUrls: ["./setting-object.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class SettingObjectComponent implements OnChanges {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** Headed by a switch (projected `[gate]`); false — a plain {@link label}, its fields always open. */
  @Input() gated = true;
  /** A setting without a switch: its name over its fields. */
  @Input() label = "";
  /** Its fields shown (its switch on); always, without one. */
  @Input() open = false;
  /** Its fields flat under the switch (QC Lab's cards); false — indented past a rule centred under it. */
  @Input() flat = true;

  /** Its fold has finished opening: its fields' overflow let out (an open one at first never animates — settled at once). */
  settled = false;
  private seeded = false;

  get shown(): boolean {
    return !this.gated || this.open;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.seeded && (changes["open"] || changes["gated"])) {
      this.seeded = true;
      this.settled = this.shown;
    }
  }

  onTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName === "grid-template-rows") {
      this.settled = this.shown;
    }
  }
}

/**
 * A setting's field: its name over its control (the content) — a shared control (`tb-select`, `tb-button-group`,
 * `tb-slider-stepper`, `tb-copy-box`, `tb-filter-list [field]`) or a native `<input>` / `<textarea>`, which it gives the
 * forms' text box (`form.tb-text-input`; red-edged while there's an {@link error}). Its note an info icon after the name
 * (`info`, in the dashboards' bubble); under the control its {@link hint} ("9 of 32 plants selected"), or its error in
 * the hint's place.
 */
@Component({
  selector: "tb-setting-field",
  template: `<label *ngIf="label" class="tbsf-label" [attr.for]="inputId || null"
      >{{ label }}<span *ngIf="info" class="tbsf-info" tabindex="0" role="img" [attr.aria-label]="info" [tbTip]="info"
        ><mat-icon>info</mat-icon></span
      ></label
    ><ng-content></ng-content
    ><span *ngIf="error || hint" class="tbsf-hint" [class.tbsf-error]="!!error">{{ error || hint }}</span>`,
  styleUrls: ["./setting-field.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, TipDirective],
})
export class SettingFieldComponent {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() label = "";
  /** Its note, in the info icon's bubble after its name — never helper text under the field. */
  @Input() info = "";
  /** The control's id: its name a `<label for>` it (a native input's). */
  @Input() inputId = "";
  /** A line under the control (a count of what's picked). */
  @Input() hint = "";
  /** Why its value can't be saved — in the hint's place, the text box red-edged. */
  @Input() error: string | null = "";

  @HostBinding("class.tbsf-invalid") get invalid(): boolean {
    return !!this.error;
  }
}

/**
 * A section of a settings card under its heading ("Pump 2", "New pump" — the shared section heading, as a heading
 * switch's and a folding section's), anything at the heading's end projected `[section-action]` (a pump's "Remove").
 */
@Component({
  selector: "tb-setting-section",
  template: `<div *ngIf="heading" class="tbss-head"
      ><span class="tbss-heading">{{ heading }}</span><ng-content select="[section-action]"></ng-content></div
    ><ng-content></ng-content>`,
  styleUrls: ["./setting-section.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class SettingSectionComponent {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** Its heading — none: its objects alone. */
  @Input() heading = "";
}

/**
 * A short note in a settings card, its icon before it ("Creates agg-3h32-pump-01, shown as P01.") — small muted text
 * (`form.tb-info-line`); `icon=""` a line alone ("No pumps on this station").
 */
@Component({
  selector: "tb-setting-note",
  template: `<mat-icon *ngIf="icon">{{ icon }}</mat-icon><span class="tbsn-text"><ng-content></ng-content></span>`,
  styleUrls: ["./setting-note.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class SettingNoteComponent {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** Its icon (a Material icon's name); "" — none. */
  @Input() icon = "info";
}

/** A settings card's true / false settings (`tb-ext-checkbox`), two a row. */
@Component({
  selector: "tb-setting-checks",
  template: "<ng-content></ng-content>",
  styleUrls: ["./setting-checks.component.scss"],
  standalone: true,
})
export class SettingChecksComponent {}

/**
 * Short fields side by side (two button groups — a unit and a clock): the first at the left, the last at the right, wrapping.
 * `even`: its fields share the row in equal columns (two selects, two numbers — a tank's height and diameter).
 */
@Component({
  selector: "tb-setting-row",
  template: "<ng-content></ng-content>",
  styleUrls: ["./setting-row.component.scss"],
  standalone: true,
})
export class SettingRowComponent {
  @Input() @HostBinding("class.tbsr-even") even = false;
}

/** Every piece of a settings card, for a component's `imports`. */
export const SETTING_PIECES = [
  SettingStackComponent,
  SettingDividerComponent,
  SettingSectionComponent,
  SettingObjectComponent,
  SettingFieldComponent,
  SettingNoteComponent,
  SettingChecksComponent,
  SettingRowComponent,
] as const;
