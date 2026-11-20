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

import { ChangeDetectorRef, Component, DestroyRef, HostBinding, Input, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription, forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { AttributeScope, EntityType, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../data-table/data-table.component";
import { SeverityBoxesComponent } from "../severity-boxes/severity-boxes.component";
import { CalloutComponent } from "../callout/callout.component";
import { TipDirective } from "../tip/tip.directive";
import { FoldComponent } from "../fold/fold.component";
import { FormActionsComponent } from "../form-actions/form-actions.component";
import { RoundToggleComponent } from "../round-toggle/round-toggle.component";
import { QUIET_REQUEST, apiMessage } from "../value-utils";
import { openAccountSettings } from "../dashboard/dashboard-url-state";
import { ownProfileOf } from "../alarm-chat/own-profile";
import {
  ALARM_CHAT_SEVERITIES,
  ALARM_RULES_KEY,
  AlarmChatPick,
  AlarmChatSeverity,
  DeviceAlarmRule,
  USER_ALARM_CHAT_KEY,
  USER_CHAT_URL_KEY,
  parseAlarmChat,
  parseAlarmRules,
  withAlarmChat,
} from "../alarm-chat/alarm-chat.models";

/** Where the list says its picks were saved, or why not (the dashboard's toasts). */
export interface AlarmSubscriptionNotices {
  success(message: string): void;
  error(message: string): void;
}

/** A pick in the making: where to tell, and at which severities (as its boxes show them — every one of its alarm's lit: every severity). */
interface DraftPick {
  severities: AlarmChatSeverity[];
  chat: boolean;
  email: boolean;
}

/** An alarm's row: its pick as made (not yet applied), beside what's saved. */
interface AlarmSubscriptionRow extends DraftPick {
  id: string;
  type: string;
  /** The devices its pick is saved for: the device's own alarm — the device; its members' — every member. */
  deviceIds: string[];
  /** Its members' alarm: what they are, muted after its type ("Pumps"); "" the device's own. */
  tag: string;
  /** The severities the alarm can reach (its boxes). */
  levels: AlarmChatSeverity[];
  /** The pick as saved on the user's profile (what Cancel goes back to). */
  saved: DraftPick;
}

/** Two picks tell the same: nowhere both, or the same places at the same severities. */
function samePick(a: DraftPick, b: DraftPick): boolean {
  const told = (p: DraftPick) => p.chat || p.email;
  return told(a) || told(b) ? a.chat === b.chat && a.email === b.email && a.severities.join() === b.severities.join() : true;
}

/**
 * A device's alarms, each with where the signed-in user is told when it goes
 * off — two round toggles: their Google Chat (the bell) and their email (the
 * envelope) — and, once told somewhere, the alarm's severities as boxes under
 * it: any of them, each by itself — the lit ones tell them; with none lit
 * (as it starts) every severity does. A compact list (the
 * panels' own), the Notifications view of a device's alarm list
 * (`tb-alarm-list` shows it for the device it's given) — and a form, as the
 * panels' others: the picks are a draft until "Apply changes" (Cancel puts
 * them back), the buttons showing while something changed. The alarms are
 * the device's `alarmRules` attribute (kept by the Alarm Chat rule chain);
 * the picks are saved — in one go — on the user's own profile (`alarmChat`),
 * which the chain follows. A bell turned on with no webhook on their profile
 * folds a warning open above the list, with the way to Settings › Account.
 *
 * Given `memberIds` (the devices it manages — a fuel station's pumps, whose alarms propagate to it), their alarms follow the
 * device's own, each once by its type, `memberLabel` muted after it ("Pumps"): a pick there is saved for every member (shown as the
 * members' picks together — told where any is, at any severity one is).
 *
 * ```html
 * <tb-alarm-subscriptions [ctx]="ctx" [deviceId]="device.id" [notices]="toasts"></tb-alarm-subscriptions>
 * <tb-alarm-subscriptions [ctx]="ctx" [deviceId]="plc.id" [memberIds]="pumpIds" memberLabel="Pumps" [notices]="toasts"></tb-alarm-subscriptions>
 * ```
 */
@Component({
  selector: "tb-alarm-subscriptions",
  templateUrl: "./alarm-subscriptions.component.html",
  styleUrls: ["./alarm-subscriptions.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DataTableComponent, DataTableCellDirective, SeverityBoxesComponent, CalloutComponent, FoldComponent, FormActionsComponent, RoundToggleComponent, TipDirective],
})
export class AlarmSubscriptionsComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() ctx!: WidgetContext;
  /** The device whose alarms these are. */
  @Input() deviceId: string | null = null;
  @Input() notices: AlarmSubscriptionNotices | null = null;
  /** The devices it manages too (a station's pumps): their alarms after its own, a pick saved for each of them. */
  @Input() memberIds: readonly string[] = [];
  /** What its members are, muted after their alarms' types ("Pumps"). */
  @Input() memberLabel = "";

  readonly columns: DataTableColumn[] = [{ key: "entry", header: "" }];
  rows: AlarmSubscriptionRow[] = [];
  loading = false;
  /** The picks are being saved. */
  saving = false;
  private rules: DeviceAlarmRule[] = [];
  /** Each member's alarms, by its id. */
  private memberRules = new Map<string, DeviceAlarmRule[]>();
  /** The members read (their ids, joined): a new list of the same members reads nothing again. */
  private membersKey = "";
  private reading?: Subscription;

  constructor(
    private readonly cd: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    const membersKey = this.memberIds.join(",");
    if (changes["deviceId"] || changes["ctx"] || membersKey !== this.membersKey) {
      this.membersKey = membersKey;
      this.load();
    }
  }

  /** The device's alarms and the user's picks, read together. */
  private load(): void {
    this.reading?.unsubscribe();
    this.rules = [];
    this.memberRules = new Map();
    this.rows = [];
    const id = this.deviceId;
    const members = [...this.memberIds];
    const rulesOf = (deviceId: string) =>
      this.ctx.attributeService
        .getEntityAttributes({ entityType: EntityType.DEVICE, id: deviceId }, AttributeScope.SERVER_SCOPE, [ALARM_RULES_KEY], QUIET_REQUEST)
        .pipe(catchError(() => of([])));
    if (!this.ctx || !id) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.reading = forkJoin({
      attrs: rulesOf(id),
      // Its members' alarms (a station's pumps'), each its own read — none: nothing to read.
      members: members.length ? forkJoin(members.map((m) => rulesOf(m))) : of([] as any[][]),
      // (An unreadable profile: the list still shows, every alarm told nowhere.)
      user: ownProfileOf(this.ctx)
        .load()
        .pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ attrs, members: memberAttrs }) => {
        this.loading = false;
        this.rules = parseAlarmRules(attrs.find((a) => a.key === ALARM_RULES_KEY)?.value);
        members.forEach((m, i) => this.memberRules.set(m, parseAlarmRules((memberAttrs[i] ?? []).find((a: any) => a.key === ALARM_RULES_KEY)?.value)));
        this.build();
        this.cd.markForCheck();
      });
  }

  /** The rows from the device's alarms — then its members' — and the user's picks as last saved. */
  private build(): void {
    const subs = parseAlarmChat(ownProfileOf(this.ctx).info);
    const own = (this.deviceId && subs[this.deviceId]) || {};
    // The device's alarms — and any the user has a pick for that it no longer lists (a rule removed, a device they can't read
    // any more): still shown, to turn off.
    const listed = new Set(this.rules.map((r) => r.type));
    const rules: DeviceAlarmRule[] = [...this.rules, ...Object.keys(own).filter((type) => !listed.has(type)).map((type) => ({ type, severities: [] }))];
    const ownRows = rules.map((rule) => this.rowOf(rule, [own[rule.type]].filter((p): p is AlarmChatPick => !!p), [this.deviceId!], ""));
    // Its members' alarms, each type once (a station's pumps share theirs): the severities any reaches, the picks they have.
    const members = [...this.memberRules.keys()];
    const byType = new Map<string, DeviceAlarmRule>();
    for (const m of members) {
      const picked = Object.keys(subs[m] ?? {}).map((type) => ({ type, severities: [] as AlarmChatSeverity[] }));
      for (const rule of [...(this.memberRules.get(m) ?? []), ...picked]) {
        const seen = byType.get(rule.type);
        byType.set(rule.type, { type: rule.type, severities: ALARM_CHAT_SEVERITIES.filter((s) => rule.severities.includes(s) || !!seen?.severities.includes(s)) });
      }
    }
    const memberRows = [...byType.values()].map((rule) =>
      this.rowOf(rule, members.map((m) => subs[m]?.[rule.type]).filter((p): p is AlarmChatPick => !!p), members, this.memberLabel)
    );
    this.rows = [...ownRows, ...memberRows];
  }

  /**
   * An alarm's row: its boxes the severities it reaches (and any picked), its pick as saved — several devices' (its members'),
   * together: told where any is, at the severities any is (one with none named: all of them).
   */
  private rowOf(rule: DeviceAlarmRule, picks: AlarmChatPick[], deviceIds: string[], tag: string): AlarmSubscriptionRow {
    // Every severity when the rule names none (an alarm raised by a rule chain).
    const ruleLevels = rule.severities.length ? rule.severities : [...ALARM_CHAT_SEVERITIES];
    // (A pick of a severity the alarm no longer has stays among its boxes.)
    const levels = ALARM_CHAT_SEVERITIES.filter((s) => ruleLevels.includes(s) || picks.some((p) => p.severities.includes(s)));
    const told = picks.filter((p) => p.chat || p.email);
    // Its boxes as they show: those picked — none named (every severity), or none told yet: all of them, lit.
    const severities = !told.length || told.some((p) => !p.severities.length) ? [...levels] : levels.filter((s) => told.some((p) => p.severities.includes(s)));
    const saved: DraftPick = { severities, chat: told.some((p) => p.chat), email: told.some((p) => p.email) };
    return { id: `${tag}:${rule.type}`, type: rule.type, deviceIds, tag, levels, ...saved, saved };
  }

  /** Something was picked that isn't saved (the form's buttons show). */
  get dirty(): boolean {
    return this.rows.some((row) => !samePick(row, row.saved));
  }

  /** An alarm is told in Google Chat, but the user's profile has no webhook to post to: the warning above the list shows. */
  get needsWebhook(): boolean {
    return !!this.ctx && this.rows.some((row) => row.chat) && !ownProfileOf(this.ctx).info[USER_CHAT_URL_KEY];
  }

  /** The warning's link: the user's own settings (the Account section, where the webhook is set). */
  openAccount(): void {
    openAccountSettings(this.ctx);
  }

  /** A toggle: the alarm told (or no longer) in the user's Google Chat or by email — told again with no box lit: all of them, lit. */
  toggle(row: AlarmSubscriptionRow, channel: "chat" | "email"): void {
    row[channel] = !row[channel];
    if (row[channel] && !row.severities.length) {
      row.severities = [...row.levels];
    }
  }

  /** The severities' boxes after a click: told at those lit — the last one put out: told nowhere (both toggles off). */
  setSeverities(row: AlarmSubscriptionRow, severities: string[]): void {
    row.severities = ALARM_CHAT_SEVERITIES.filter((s) => severities.includes(s));
    if (!row.severities.length) {
      row.chat = false;
      row.email = false;
    }
  }

  /** Cancel: the picks as saved. */
  cancel(): void {
    this.rows.forEach((row) => Object.assign(row, { ...row.saved, severities: [...row.saved.severities] }));
  }

  /** "Apply changes": every changed pick of the device saved on the user's profile, in one go (a failure says so; the picks stay as made). */
  apply(): void {
    const changed = this.rows.filter((row) => !samePick(row, row.saved));
    if (!this.deviceId || !changed.length || this.saving) {
      return;
    }
    // Every one of its alarm's boxes lit: saved as none named — every severity (one the alarm gains later too).
    const stored = (row: AlarmSubscriptionRow): AlarmChatSeverity[] => (row.levels.every((s) => row.severities.includes(s)) ? [] : [...row.severities]);
    const picks = changed.map((row) => ({
      row,
      pick: { severities: stored(row), chat: row.chat, email: row.email } as DraftPick,
      shown: { severities: [...row.severities], chat: row.chat, email: row.email } as DraftPick,
    }));
    this.saving = true;
    ownProfileOf(this.ctx)
      .update((info) => {
        let next = parseAlarmChat(info);
        // (One told nowhere: removed.)
        // (A member's alarm: saved for every member.)
        picks.forEach(({ row, pick }) => row.deviceIds.forEach((id) => (next = withAlarmChat(next, id, row.type, pick))));
        if (Object.keys(next).length) {
          info[USER_ALARM_CHAT_KEY] = next;
        } else {
          delete info[USER_ALARM_CHAT_KEY];
        }
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          picks.forEach(({ row, shown }) => (row.saved = shown));
          this.notices?.success("Notifications saved");
          this.cd.markForCheck();
        },
        error: (err) => {
          this.saving = false;
          this.notices?.error(`Couldn't save the notifications${apiMessage(err)}`);
          this.cd.markForCheck();
        },
      });
  }
}
