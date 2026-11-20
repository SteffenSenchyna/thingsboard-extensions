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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { CollapsibleCardComponent } from "../../../../components/shared/collapsible-card/collapsible-card.component";
import { SecretBoxComponent } from "../../../../components/shared/secret-box/secret-box.component";
import { StatusPillComponent } from "../../../../components/shared/status-pill/status-pill.component";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { formatDateTime } from "../../../../components/shared/time-format";
import { EsfClient, EsfCommandResult, esfSubscribe, parseEsfCommandResult } from "../../../models/esf-api.models";

/**
 * A command run on the ESF unit (Command v1, `rest.command`): the command line, its working directory and the Command
 * service's password (if it has one); "Run" and, under it, the result — its exit code (or that it timed out) and what it
 * printed, in the gateway RPC results' look (styles/_reply.scss). The unit runs it as ESF does, with ESF's own rights.
 */
@Component({
  selector: "tb-gm-esf-command",
  templateUrl: "./esf-command.component.html",
  styleUrls: ["./esf-command.component.scss"],
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, CollapsibleCardComponent, SecretBoxComponent, StatusPillComponent],
})
export class EsfCommandComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();

  command = "";
  workingDirectory = "";
  password = "";
  running = false;
  result: EsfCommandResult | null = null;
  /** The command the result is for, and when its reply came back. */
  ran = "";
  ranAt = "";
  /** What it printed, a box each (output, then errors); none when it printed nothing. */
  outputs: { key: "stdout" | "stderr"; label: string; text: string }[] = [];
  /** The box just copied (its mark a check for a moment). */
  copied: "stdout" | "stderr" | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.result = null;
      this.outputs = [];
    }
  }

  run(): void {
    const command = this.command.trim();
    if (!command || !this.client || this.running) {
      return;
    }
    this.running = true;
    const body: Record<string, unknown> = { command };
    if (this.workingDirectory.trim()) {
      body["workingDirectory"] = this.workingDirectory.trim();
    }
    if (this.password) {
      body["password"] = this.password;
    }
    esfSubscribe(
      this.client.call("esfCommand", body),
      this.destroyRef,
      (reply) => {
        this.running = false;
        this.result = parseEsfCommandResult(reply);
        this.ran = command;
        this.ranAt = formatDateTime(Date.now());
        this.outputs = [
          { key: "stdout" as const, label: "Output", text: this.result.stdout },
          { key: "stderr" as const, label: "Errors", text: this.result.stderr },
        ].filter((o) => !!o.text);
        this.copied = null;
        this.cd.markForCheck();
      },
      (reason) => {
        this.running = false;
        this.notify.emit({ tone: "error", message: `Couldn't run the command: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  /** A click on an output's box: its text to the clipboard (its mark a check for a moment), unless the click ended a selection in it. */
  copy(out: { key: "stdout" | "stderr"; text: string }): void {
    if (window.getSelection()?.toString()) {
      return;
    }
    navigator.clipboard?.writeText(out.text).then(() => {
      this.copied = out.key;
      this.cd.detectChanges();
      setTimeout(() => {
        if (this.copied === out.key) {
          this.copied = null;
          this.cd.detectChanges();
        }
      }, 1500);
    });
  }
}
