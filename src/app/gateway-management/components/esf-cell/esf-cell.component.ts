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
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { SelectComponent } from "../../../components/shared/select/select.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { EsfField, EsfForm } from "../../models/esf-form.models";

/**
 * One setting as a table cell's control (an asset's channels grid — ESF's console's): the shared checkbox, compact floating select,
 * compact number box or cell text box (`form.tb-cell-text-input`), bound to its form's control; a value that's wrong red-edged,
 * ESF's check in its bubble. It takes its cell's width: its column carries the least width (`DataTableColumn.minWidth`).
 */
@Component({
  selector: "tb-gm-esf-cell",
  templateUrl: "./esf-cell.component.html",
  styleUrls: ["./esf-cell.component.scss"],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CheckboxComponent, NumberBoxComponent, SelectComponent, TipDirective],
})
export class EsfCellComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() field!: EsfField;
  @Input() form!: EsfForm;

  get error(): string | null {
    return this.form.errorOf(this.field);
  }
}
