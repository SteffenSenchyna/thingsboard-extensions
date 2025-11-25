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

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from "@angular/core";
import { FormGroup, FormControl } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { getAlarmConditionOptions } from "../../../models/public-api";
import { Subject } from "rxjs";
import { takeUntil, debounceTime } from "rxjs/operators";

@Component({
  selector: "tb-ts302-channel-alarm-form",
  templateUrl: "./ts302-channel-alarm-form.component.html",
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TS302ChannelAlarmFormComponent implements OnInit, OnDestroy {
  @Input() channelNumber: number;
  @Input() temperatureAlarmConfig: FormGroup;
  @Input() mutationAlarmConfig: FormGroup;
  @Input() syncEnabled = false;

  @Output() alarmConfigChange = new EventEmitter<any>();

  alarmConditionOptions = getAlarmConditionOptions();

  private destroy$ = new Subject<void>();

  get temperatureAlarmEnableControl(): FormControl<boolean> {
    return this.temperatureAlarmConfig?.get("enable") as FormControl<boolean>;
  }

  get mutationAlarmEnableControl(): FormControl<boolean> {
    return this.mutationAlarmConfig?.get("enable") as FormControl<boolean>;
  }

  ngOnInit() {
    // Always watch for changes, but only emit when sync is enabled
    // Watch for changes in temperature alarm config
    this.temperatureAlarmConfig.valueChanges
      .pipe(
        debounceTime(50),
        takeUntil(this.destroy$)
      )
      .subscribe((value) => {
        if (this.syncEnabled) {
          this.alarmConfigChange.emit({
            type: 'temperature',
            value: value
          });
        }
      });

    // Watch for changes in mutation alarm config
    this.mutationAlarmConfig.valueChanges
      .pipe(
        debounceTime(50),
        takeUntil(this.destroy$)
      )
      .subscribe((value) => {
        if (this.syncEnabled) {
          this.alarmConfigChange.emit({
            type: 'mutation',
            value: value
          });
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
