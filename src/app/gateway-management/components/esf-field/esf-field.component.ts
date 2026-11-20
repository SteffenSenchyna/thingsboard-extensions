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

import { Component, HostBinding, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ReactiveFormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { SecretBoxComponent } from "../../../components/shared/secret-box/secret-box.component";
import { ButtonGroupComponent, PickControl, pickControl } from "../../../components/shared/button-group/button-group.component";
import { RadioGroupComponent, RadioOption } from "../../../components/shared/radio-group/radio-group.component";
import { SelectComponent } from "../../../components/shared/select/select.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { EsfField, EsfForm } from "../../models/esf-form.models";
import { ESF_SCRIPT_COMPLETERS, EsfScriptIssue } from "../../models/esf-script.models";
import { ResizeBoxComponent } from "../../../components/shared/resize-box/resize-box.component";
import { ScriptEditorDirective, ScriptEditorMark } from "../../../components/shared/code-editor/script-editor.directive";

/**
 * One ESF setting in a form (`EsfForm`): by its kind — true / false a checkbox with its name beside it (a draft's value, sent
 * with "Apply changes": never a switch, which says it acts at once), else its name over a select of its options, a number in
 * its bounds, a masked password ("Unchanged" while empty), text, or a list as comma-separated values — its description in the
 * info bubble beside its name, what's wrong with a changed value under it.
 */
@Component({
  selector: "tb-gm-esf-field",
  templateUrl: "./esf-field.component.html",
  styleUrls: ["./esf-field.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    ReactiveFormsModule,
    ButtonGroupComponent,
    CheckboxComponent,
    NumberBoxComponent,
    RadioGroupComponent,
    ResizeBoxComponent,
    ScriptEditorDirective,
    SecretBoxComponent,
    SelectComponent,
    TipDirective,
  ],
})
export class EsfFieldComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() field!: EsfField;
  @Input() form!: EsfForm;
  /**
   * In a form across its page (the ESF Drivers and assets view's): a pick of a few options too long for a button group, but that one
   * row of radios fits, is that row (`pickControl`'s `wide`) — the room the form has, used.
   */
  @Input() wide = false;

  get error(): string | null {
    return this.form.errorOf(this.field);
  }

  /** What its valid value won't do (a Regex Filter's pattern matching nothing it receives): under it in the warning tone. */
  get warning(): string | null {
    return this.form.warningOf(this.field);
  }

  /** A script's editor: ESF's completions alone, by what's before the word; no function arguments (it's a script, not a function's body). */
  readonly completers = ESF_SCRIPT_COMPLETERS;
  readonly noArgs: string[] = [];
  private marked: { issues: EsfScriptIssue[]; marks: ScriptEditorMark[] } = { issues: [], marks: [] };

  /** The script's issues (the form's check — `scriptIssuesOf`), as marks in the editor's gutter beside its worker's: where they are told. */
  get scriptMarks(): ScriptEditorMark[] {
    const issues = this.form.scriptIssuesOf(this.field);
    if (issues !== this.marked.issues) {
      // Every issue in the gutter — one without a line of its own (the script's: "Emits nothing") on the first.
      const marks = issues.map((i) => ({ line: i.line ?? 1, level: i.level, text: `${i.title}: ${i.detail}` }));
      this.marked = { issues, marks };
    }
    return this.marked.marks;
  }

  /**
   * How a pick shows: as its layout says (`EsfField.control`); a pick of the unit's services a select (a list from data); else by its
   * options — a button group (2–4 short), a radio row (a wide form's few longer, or a few explained), a select.
   */
  get pick(): PickControl {
    if (this.field.control) {
      return this.field.control;
    }
    return this.field.services ? "select" : pickControl(this.radios, this.wide);
  }

  /** The options as radios (an option's note its info icon) — made once a list (never a fresh array each check). */
  get radios(): RadioOption[] {
    let radios = RADIOS.get(this.field.options);
    if (!radios) {
      radios = this.field.options.map((o) => ({ id: o.value, label: o.label, info: o.note || undefined }));
      RADIOS.set(this.field.options, radios);
    }
    return radios;
  }
}

const RADIOS = new WeakMap<object, RadioOption[]>();
