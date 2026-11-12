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

/**
 * A user's own Google Chat alarm notifications ("tell me when this alarm
 * goes off here") — what the dashboards write and the backend reads.
 *
 * The user keeps both on their own profile (its additional info — the one
 * record every user may edit):
 *
 *  - `googleChatUrl`: their Google Chat space's incoming webhook (Settings ›
 *    Account);
 *  - `alarmChat`: what they asked for — `{ <device id>: { <alarm type>:
 *    { severities, chat, email } } }`: the severities that tell them (any
 *    of them — each picked by itself; none picked: every severity) and where
 *    — their Google Chat, their email (their account's address), or both (a device's panel, its Alarms
 *    tab › Notifications). Older entries still read: a severity alone means
 *    Google Chat from that severity up; `severity` in place of `severities`,
 *    from that severity up.
 *
 * The **"Alarm Chat" rule chain** does the rest: it publishes each device's
 * alarms as its server attribute {@link ALARM_RULES_KEY} (a user can't read
 * a device profile's alarm rules), copies a user's `alarmChat` onto the
 * devices as it changes (`alarmChat_<user id>`, so an alarm finds who asked
 * without reading every user) and, when an alarm of a device is created,
 * changes severity or clears, tells each user who asked — a card to their
 * Google Chat, an email, or both — at one of their severities, and only
 * while they can still read the device.
 */

/** The user's additional-info key of their Google Chat webhook. */
export const USER_CHAT_URL_KEY = "googleChatUrl";
/** The user's additional-info key of what they asked to be told. */
export const USER_ALARM_CHAT_KEY = "alarmChat";
/** A device's server attribute: the alarms set up for it — `[{ type, severities }]`, kept by the Alarm Chat chain. */
export const ALARM_RULES_KEY = "alarmRules";

/** The severities an alarm can be raised at, mildest first. */
export const ALARM_CHAT_SEVERITIES = ["WARNING", "MINOR", "MAJOR", "CRITICAL"] as const;
export type AlarmChatSeverity = (typeof ALARM_CHAT_SEVERITIES)[number];

export const ALARM_CHAT_SEVERITY_LABELS: Record<AlarmChatSeverity, string> = {
  WARNING: "Warning",
  MINOR: "Minor",
  MAJOR: "Major",
  CRITICAL: "Critical",
};

/** One alarm's pick: the severities that tell the user — none named: every severity — and where: their Google Chat, their email. */
export interface AlarmChatPick {
  severities: AlarmChatSeverity[];
  chat: boolean;
  email: boolean;
}

/** A severity and every one above it (how a pick was first kept: a threshold). */
const fromSeverity = (severity: AlarmChatSeverity): AlarmChatSeverity[] => ALARM_CHAT_SEVERITIES.slice(ALARM_CHAT_SEVERITIES.indexOf(severity));

/** What a user asked for: a device's alarm types, each with its pick. */
export type AlarmChatSubscriptions = Record<string, Record<string, AlarmChatPick>>;

/** An alarm set up for a device (its {@link ALARM_RULES_KEY} attribute's item): its type and the severities it can be raised at. */
export interface DeviceAlarmRule {
  type: string;
  severities: AlarmChatSeverity[];
}

const isSeverity = (v: unknown): v is AlarmChatSeverity => ALARM_CHAT_SEVERITIES.includes(v as AlarmChatSeverity);

/** A device's alarms from its attribute (a JSON list, or its text): the well-formed ones, by type. */
export function parseAlarmRules(value: unknown): DeviceAlarmRule[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((r): r is { type: string; severities?: unknown } => !!r && typeof r.type === "string" && !!r.type)
    .map((r) => ({
      type: r.type,
      severities: ALARM_CHAT_SEVERITIES.filter((s) => Array.isArray(r.severities) && r.severities.includes(s)),
    }))
    .sort((a, b) => a.type.localeCompare(b.type, undefined, { numeric: true }));
}

/** What a user asked for, from their additional info: the well-formed part of it. */
export function parseAlarmChat(info: Record<string, any> | null | undefined): AlarmChatSubscriptions {
  const raw = info?.[USER_ALARM_CHAT_KEY];
  const out: AlarmChatSubscriptions = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return out;
  }
  for (const [deviceId, types] of Object.entries(raw)) {
    if (!types || typeof types !== "object") {
      continue;
    }
    const kept: Record<string, AlarmChatPick> = {};
    for (const [type, value] of Object.entries(types as Record<string, unknown>)) {
      if (isSeverity(value)) {
        // A severity alone (how a pick was first kept): Google Chat, from it up.
        kept[type] = { severities: fromSeverity(value), chat: true, email: false };
      } else if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        const listed = v["severities"];
        const severities = Array.isArray(listed)
          ? ALARM_CHAT_SEVERITIES.filter((s) => listed.includes(s))
          : isSeverity(v["severity"])
            ? fromSeverity(v["severity"])
            : [];
        // (Told somewhere with no severity named: every severity.)
        if (v["chat"] === true || v["email"] === true) {
          kept[type] = { severities, chat: v["chat"] === true, email: v["email"] === true };
        }
      }
    }
    if (Object.keys(kept).length) {
      out[deviceId] = kept;
    }
  }
  return out;
}

/** {@link subs} with one alarm of one device set to `pick` — null, or told nowhere: not at all (an emptied device leaves). */
export function withAlarmChat(subs: AlarmChatSubscriptions, deviceId: string, type: string, pick: AlarmChatPick | null): AlarmChatSubscriptions {
  const device = { ...(subs[deviceId] ?? {}) };
  if (pick && (pick.chat || pick.email)) {
    device[type] = { severities: ALARM_CHAT_SEVERITIES.filter((s) => pick.severities.includes(s)), chat: pick.chat, email: pick.email };
  } else {
    delete device[type];
  }
  const out = { ...subs };
  if (Object.keys(device).length) {
    out[deviceId] = device;
  } else {
    delete out[deviceId];
  }
  return out;
}
