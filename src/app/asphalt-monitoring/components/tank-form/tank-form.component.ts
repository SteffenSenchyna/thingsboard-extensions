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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SETTING_PIECES } from "../../../components/shared/setting-object/setting-object.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { ButtonGroupComponent } from "../../../components/shared/button-group/button-group.component";
import { RadioGroupComponent, RadioOption } from "../../../components/shared/radio-group/radio-group.component";
import { fmtNumber } from "../../../components/shared/value-utils";
import {
  CAPACITY_UNITS,
  DIMENSION_UNITS,
  LIQUID_TYPES,
  MEASUREMENT_SYSTEMS,
  MeasurementSystem,
  TANK_DIMENSIONS,
  TANK_SHAPE,
  TankFormValue,
  emptyTankDetails,
  tankCapacity,
} from "../../models/asphalt-monitoring.models";

const opts = (values: string[]): TbSelectOption[] => values.map((v) => ({ value: v, label: v }));

/** Each system's units as options, made once (the button groups get the same list every check). */
const DIMENSION_UNIT_OPTIONS: Record<MeasurementSystem, TbSelectOption[]> = { Metric: opts(DIMENSION_UNITS.Metric), Imperial: opts(DIMENSION_UNITS.Imperial) };
const CAPACITY_UNIT_OPTIONS: Record<MeasurementSystem, TbSelectOption[]> = { Metric: opts(CAPACITY_UNITS.Metric), Imperial: opts(CAPACITY_UNITS.Imperial) };

/** How the sensor measures, each explained (the radio group's info icons). */
const LEVEL_OPTIONS: RadioOption[] = [
  { id: "Remaining space", label: "Remaining space", info: "The sensor measures down from above the tank to the product. Its gap to the full level is needed." },
  { id: "Fill height", label: "Fill height", info: "The sensor reports the product's height in the tank." },
];

/**
 * The tank form — "New tank" (a new device + its attributes) and a tank's
 * Settings tab (the same fields, prefilled). Its cards: the device (serial
 * number + label, "add" only), the tank (a vertical cylinder: measurement
 * system, dimension units, height and diameter, the capacity unit and the
 * capacity worked out from them), the sensor (level measurement type, the sensor gap for
 * "Remaining space", its measurement system and reading units) and the
 * product — collapsible cards, as in the shared device-settings card.
 *
 * "edit" sits inside the tank's `tb-device-settings-card` (which has the
 * device's name, label and note) and has no buttons of its own: it reports
 * {@link dirtyChange} / {@link validChange}, and the card's floating Cancel /
 * Apply call {@link submit} or bump {@link resetKey}.
 */
@Component({
  selector: "tb-asphalt-tank-form",
  templateUrl: "./tank-form.component.html",
  styleUrls: ["./tank-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, CardComponent, CollapsibleCardComponent, SelectComponent, FormActionsComponent, NumberBoxComponent, ButtonGroupComponent, RadioGroupComponent, ...SETTING_PIECES],
})
export class TankFormComponent implements OnInit, OnChanges {
  /** "add": a blank form with its own Cancel / "Create tank" (tb-form-actions); "edit": prefilled from {@link value}, saved by the parent. */
  @Input() mode: "add" | "edit" = "add";
  /** The tank being edited (ignored on "add"). A new value while the form has edits is held until the next reset. */
  @Input() value: TankFormValue | null = null;
  /** Bumped to reset the form (on every open, and to discard edits). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<TankFormValue>();
  @Output() cancelled = new EventEmitter<void>();
  /** "edit": the form has unsaved edits / can be saved (the shared card's Apply). */
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() validChange = new EventEmitter<boolean>();

  readonly systemOptions = opts(MEASUREMENT_SYSTEMS);
  readonly levelOptions = LEVEL_OPTIONS;
  readonly liquidOptions = opts(LIQUID_TYPES);
  /** Every tank is a vertical cylinder: its height and diameter. */
  readonly dimensions = TANK_DIMENSIONS;

  form!: FormGroup;
  /** The capacity worked out from the dimensions (null until they're all in). */
  capacity: number | null = null;

  constructor(private fb: FormBuilder, private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ["", Validators.required],
      label: ["", Validators.required],
      liquidType: ["", Validators.required],
      tankMeasurementSystem: ["Metric", Validators.required],
      tankDimensionUnits: ["cm", Validators.required],
      height: [null],
      diameter: [null],
      tankCapacityOutput: ["L", Validators.required],
      levelMeasurement: ["", Validators.required],
      sensorGap: [null],
      sensorMeasurementSystem: ["Metric", Validators.required],
      sensorDimensionUnits: ["mm", Validators.required],
    });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.recalculate();
      this.emitState();
    });
    // A measurement system picks its first units.
    this.form
      .get("tankMeasurementSystem")!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s: MeasurementSystem) => {
        this.form.patchValue({ tankDimensionUnits: DIMENSION_UNITS[s][0], tankCapacityOutput: CAPACITY_UNITS[s][0] }, { emitEvent: false });
        this.recalculate();
      });
    this.form
      .get("sensorMeasurementSystem")!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s: MeasurementSystem) => this.form.patchValue({ sensorDimensionUnits: DIMENSION_UNITS[s][0] }, { emitEvent: false }));
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    // A fresh value (the tank reloaded on new telemetry) never wipes edits in progress.
    if (changes["resetKey"] || changes["mode"] || (changes["value"] && !this.form.dirty)) {
      this.reset();
    }
  }

  /** Whether the form has unsaved edits. */
  get dirty(): boolean {
    return !!this.form?.dirty;
  }

  /** The form can be saved (as {@link canSubmit}, whatever the parent's saving state). */
  get valid(): boolean {
    return this.form.valid && this.capacity !== null && (!this.needsSensorGap || this.sensorGapValid);
  }

  /** Tell the parent the form's state — deferred, so it never changes a value the parent just checked. */
  private emitState(): void {
    const dirty = this.form.dirty;
    const valid = this.valid;
    setTimeout(() => {
      this.dirtyChange.emit(dirty);
      this.validChange.emit(valid);
    });
  }

  /** The dimension-unit options of the tank's measurement system. */
  get dimensionUnitOptions(): TbSelectOption[] {
    return DIMENSION_UNIT_OPTIONS[this.system("tankMeasurementSystem")];
  }

  get capacityUnitOptions(): TbSelectOption[] {
    return CAPACITY_UNIT_OPTIONS[this.system("tankMeasurementSystem")];
  }

  get sensorUnitOptions(): TbSelectOption[] {
    return DIMENSION_UNIT_OPTIONS[this.system("sensorMeasurementSystem")];
  }

  get dimensionUnit(): string {
    return this.form.get("tankDimensionUnits")?.value ?? "";
  }

  get sensorUnit(): string {
    return this.form.get("sensorDimensionUnits")?.value ?? "";
  }

  /** The capacity line under its units: what the tank holds, or — its size not in yet — where it comes from. */
  get capacityText(): string {
    return this.capacity === null
      ? "Its capacity comes from its height and diameter."
      : `Holds ${fmtNumber(this.capacity, 2)} ${this.form.get("tankCapacityOutput")?.value ?? ""}`;
  }

  /** "Remaining space" measures down from the sensor: the gap above the full level is needed. */
  get needsSensorGap(): boolean {
    return this.form.get("levelMeasurement")?.value === "Remaining space";
  }

  get canSubmit(): boolean {
    return this.valid && !this.saving;
  }

  private get sensorGapValid(): boolean {
    const g = this.form.get("sensorGap")?.value;
    return g !== null && g !== "" && Number(g) >= 0 && Number(g) <= 999;
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    const v = this.form.getRawValue();
    const sizeMeasure: TankFormValue["details"]["sizeMeasure"] = { height: Number(v.height), diameter: Number(v.diameter) };
    this.submitted.emit({
      name: String(v.name).trim(),
      label: String(v.label).trim(),
      details: {
        // Editing: the settings card's Product card saves the product ("" is left out of the save).
        liquidType: this.mode === "add" ? v.liquidType : "",
        tankShape: TANK_SHAPE,
        tankMeasurementSystem: v.tankMeasurementSystem,
        tankDimensionUnits: v.tankDimensionUnits,
        sizeMeasure,
        tankCapacityOutput: v.tankCapacityOutput,
        tankCapacity: this.capacity,
        levelMeasurement: v.levelMeasurement,
        sensorGap: this.needsSensorGap ? Number(v.sensorGap) : null,
        sensorMeasurementSystem: v.sensorMeasurementSystem,
        sensorDimensionUnits: v.sensorDimensionUnits,
      },
    });
  }

  private system(control: string): MeasurementSystem {
    const s = this.form.get(control)?.value;
    return s === "Imperial" ? "Imperial" : "Metric";
  }

  private reset(): void {
    const v = this.mode === "edit" && this.value ? this.value : null;
    const d = v?.details ?? emptyTankDetails;
    this.form.reset(
      {
        name: v?.name ?? "",
        label: v?.label ?? "",
        liquidType: d.liquidType,
        tankMeasurementSystem: d.tankMeasurementSystem,
        tankDimensionUnits: d.tankDimensionUnits,
        height: d.sizeMeasure.height ?? null,
        diameter: d.sizeMeasure.diameter ?? null,
        tankCapacityOutput: d.tankCapacityOutput,
        levelMeasurement: d.levelMeasurement,
        sensorGap: d.sensorGap,
        sensorMeasurementSystem: d.sensorMeasurementSystem,
        sensorDimensionUnits: d.sensorDimensionUnits,
      },
      { emitEvent: false }
    );
    // The name names the device; it stays once the device exists. The product
    // is edited in the settings card's Product card, not here.
    const liquidType = this.form.get("liquidType")!;
    if (this.mode === "edit") {
      this.form.get("name")!.disable({ emitEvent: false });
      liquidType.clearValidators();
    } else {
      this.form.get("name")!.enable({ emitEvent: false });
      liquidType.setValidators(Validators.required);
    }
    liquidType.updateValueAndValidity({ emitEvent: false });
    this.recalculate();
    this.emitState();
    this.cd.markForCheck();
  }

  private recalculate(): void {
    const v = this.form.getRawValue();
    this.capacity = tankCapacity(v.height, v.diameter, v.tankDimensionUnits, v.tankCapacityOutput);
  }
}
