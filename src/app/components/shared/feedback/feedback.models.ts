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

import { Subject } from "rxjs";
import { WidgetContext } from "@home/models/widget-component.models";
import { NavRailItem } from "../nav-rail/nav-rail.component";
import { SectionNavItem } from "../section-nav/section-nav.component";
import { StatusPillTone } from "../status-pill/status-pill.component";
import type { DataTableColumn } from "../data-table/data-table.component";

/**
 * Feedback from the dashboards (the rail's "Send feedback"): what a user sends
 * goes into their own record — the one record every user may save — as
 * `feedbackOutbox`, and out again at once; the "Feedback" rule chain posts it
 * as time series of the tenant's Feedback asset, with the sender read from
 * the user (`feedbackFrom`, `feedbackEmail`). Home's Settings › Feedback lists
 * them; their review state is the asset's server attribute `feedbackReview`.
 */

/** The user record's additional info key the item travels in. */
export const FEEDBACK_OUTBOX_KEY = "feedbackOutbox";
/** The tenant's asset that keeps them (the chain posts to it by id; the page finds it by name). */
export const FEEDBACK_ASSET_NAME = "Feedback";
/** Its time series: the item (base64 of its JSON), a bug's screenshot (a data URL), who sent it (the chain's). */
export const FEEDBACK_KEY = "feedback";
export const FEEDBACK_SHOT_KEY = "feedbackShot";
export const FEEDBACK_FROM_KEY = "feedbackFrom";
export const FEEDBACK_EMAIL_KEY = "feedbackEmail";
/** Its server attribute: each item's review, by its time. */
export const FEEDBACK_REVIEW_KEY = "feedbackReview";

/** The Settings page's section (Home's, tenant administrators') — its own icon, not "Send feedback"'s (both are in Home's rail). */
export const FEEDBACK_SECTION: SectionNavItem = { id: "feedback", label: "Feedback", icon: "reviews" };

/**
 * The rail's "Send feedback" (in its second group, before the theme toggle — `dashboardRailItems`): its id in `bottomClick` — not
 * the Feedback section's ("feedback"): the rail lights every item whose id is the page's.
 */
export const FEEDBACK_RAIL_ID = "sendFeedback";
export const FEEDBACK_RAIL_ITEM: NavRailItem = { id: FEEDBACK_RAIL_ID, icon: "feedback", label: "Send feedback" };

export type FeedbackType = "bug" | "idea" | "other";
export const FEEDBACK_TYPES: { id: FeedbackType; label: string; icon: string }[] = [
  { id: "bug", label: "Bug", icon: "bug_report" },
  { id: "idea", label: "Idea", icon: "lightbulb" },
  { id: "other", label: "Other", icon: "chat_bubble" },
];
export const feedbackTypeOf = (id: unknown) => FEEDBACK_TYPES.find((t) => t.id === id) ?? FEEDBACK_TYPES[2];

export type FeedbackStatus = "new" | "reviewed" | "done";
export const FEEDBACK_STATUSES: { id: FeedbackStatus; label: string; tone: StatusPillTone }[] = [
  { id: "new", label: "New", tone: "warning" },
  { id: "reviewed", label: "Reviewed", tone: "neutral" },
  { id: "done", label: "Done", tone: "success" },
];
export const feedbackStatusOf = (id: unknown) => FEEDBACK_STATUSES.find((s) => s.id === id) ?? FEEDBACK_STATUSES[0];

/** What a user sends (the item's JSON): their words and where they were. */
export interface FeedbackItem {
  v: 1;
  type: FeedbackType;
  text: string;
  /** When they sent it (their clock; the asset keeps the server's). */
  sentAt: number;
  /** Their name as the dashboard knew it (the sender itself is the chain's `feedbackFrom`). */
  name: string;
  /** The app it was sent from ("Home", "Fuel", "QC Lab", …: the dashboard's, a nested app's on Home); none — sent before it was kept. */
  app?: string;
  /** The page: its title and address (the dashboard's state in it). */
  title: string;
  url: string;
  /** The extension's build ("2026-11-12 14:05 b3e6aa1"; "development": the dev bundle). */
  build: string;
  /** The browser (its user agent), the window's size and the theme. */
  userAgent: string;
  viewport: string;
  theme: "light" | "dark";
  /** A bug's screenshot: sent with it, or why not ("failed": it couldn't be taken). */
  screenshot: "attached" | "failed" | "none";
}

/** An item as the Feedback page reads it. */
export interface FeedbackEntry {
  /** Its time on the asset (its id). */
  ts: number;
  item: FeedbackItem | null;
  /** The sender (the user's id and email, the chain's). */
  fromId: string;
  email: string;
  status: FeedbackStatus;
  /** Who set its status, and when. */
  reviewedBy: string;
  reviewedAt: number;
}

export interface FeedbackReview {
  status: FeedbackStatus;
  by?: string;
  at?: number;
}

/** The record's outbox: the item (base64 of its JSON — the instance's firewall refuses text that reads like an injection) and a bug's screenshot. */
export function feedbackOutbox(item: FeedbackItem, screenshot: string | null): Record<string, string> {
  return { [FEEDBACK_KEY]: encodeBase64(JSON.stringify(item)), ...(screenshot ? { [FEEDBACK_SHOT_KEY]: screenshot } : {}) };
}

/** A stored item read back; null when it can't be. */
export function decodeFeedbackItem(value: unknown): FeedbackItem | null {
  if (typeof value !== "string" || !value) {
    return null;
  }
  try {
    const item = JSON.parse(decodeBase64(value));
    return item && typeof item === "object" ? (item as FeedbackItem) : null;
  } catch {
    return null;
  }
}

function encodeBase64(text: string): string {
  let binary = "";
  new TextEncoder().encode(text).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function decodeBase64(value: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
}

/**
 * The bundle's build, stamped by `install.js` (`yarn build`) in this
 * placeholder's place — the same length, so the source map still lines up;
 * the dev bundle keeps it: "development".
 */
const BUILD_STAMP = "__TB_EXT_BUILD_STAMP____________________";

export function appBuild(): string {
  const stamp = BUILD_STAMP.trim();
  return stamp.startsWith("__TB_EXT_BUILD") ? "development" : stamp;
}

/** A query parameter that carries a credential (ThingsBoard's `accessToken` / `refreshToken` in a dashboard link, a key, a secret). */
const SECRET_PARAM = /token|secret|password|passwd|api[-_]?key|^key$|auth/i;

/**
 * The page's address without its credentials: a dashboard opened from a link
 * keeps the user's sign-in tokens in its address, and feedback is read by
 * others — the dashboard's state and the rest stay.
 */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    [...u.searchParams.keys()].filter((k) => SECRET_PARAM.test(k)).forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return url.replace(/([?&])[^=&#]*(token|secret|password|key)[^=&#]*=[^&#]*/gi, "$1").replace(/[?&]+(?=&|#|$)/g, "");
  }
}

/** "Chrome 142 · macOS": the browser and system a user agent names, for the page's list. */
export function browserOf(userAgent: string): string {
  const ua = userAgent || "";
  const browser =
    /Edg\/(\d+)/.exec(ua)?.[1] !== undefined
      ? `Edge ${/Edg\/(\d+)/.exec(ua)?.[1]}`
      : /Firefox\/(\d+)/.test(ua)
        ? `Firefox ${/Firefox\/(\d+)/.exec(ua)?.[1]}`
        : /Chrome\/(\d+)/.test(ua)
          ? `Chrome ${/Chrome\/(\d+)/.exec(ua)?.[1]}`
          : /Version\/(\d+).*Safari/.test(ua)
            ? `Safari ${/Version\/(\d+)/.exec(ua)?.[1]}`
            : "Browser";
  const system = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return system ? `${browser} · ${system}` : browser;
}

/** The widget's Send feedback dialog (one, `tb-feedback-dialog` in the dashboard root): what the rail's item opens. */
export function feedbackOf(ctx: WidgetContext): FeedbackDialogState {
  const host = ctx as unknown as Record<string, FeedbackDialogState | undefined>;
  return (host[KEY] ??= new FeedbackDialogState());
}

const KEY = "__tbExtFeedbackDialog";

/** The dialog's state: open or not, and the app it was opened in; each opening is announced (the dialog starts its screenshot then). */
export class FeedbackDialogState {
  open = false;
  /** The app the user is in ("Home", "Fuel", …): the item's `app`. */
  app = "";
  readonly opened = new Subject<void>();

  /** Opened from the rail of `app` (the dashboard's own; Home's: the nested app open, else "Home"). */
  show(app: string): void {
    if (!this.open) {
      this.app = app;
      this.open = true;
      this.opened.next();
    }
  }

  close(): void {
    this.open = false;
  }
}

// -- Settings › Feedback's filters and columns -------------------------------------------------------------------------

/** What the Feedback page's filters match on: its status, kind, the app it was sent from, its sender's product line and market. */
export type FeedbackFacet = "statuses" | "types" | "apps" | "productLines" | "markets";
export const FEEDBACK_FACETS: FeedbackFacet[] = ["statuses", "types", "apps", "productLines", "markets"];

/** The Feedback page's filters (`tb-feedback-filters`): the search, and each facet's picks (none: any; "" — none of it). */
export interface FeedbackFilter {
  searchTerms: string[];
  searchText: string;
  /** What the table searches for (the box's terms and its text). */
  search: string[];
  statuses: string[];
  types: string[];
  apps: string[];
  productLines: string[];
  markets: string[];
}

export const NO_FEEDBACK_FILTER: FeedbackFilter = { searchTerms: [], searchText: "", search: [], statuses: [], types: [], apps: [], productLines: [], markets: [] };

/** The Feedback table's columns (its "Customize columns"): the product line and market are the sender's — by code, the label on hover. */
export const FEEDBACK_COLUMNS: DataTableColumn[] = [
  { key: "received", header: "Received", nowrap: true, sortValue: (row) => row["ts"] },
  { key: "type", header: "Type", sortValue: (row) => row["typeLabel"] },
  { key: "from", header: "From", emphasis: "strong", maxWidth: "180px", tooltipKey: "email" },
  { key: "text", header: "Feedback", truncate: true },
  { key: "app", header: "Application", nowrap: true },
  { key: "productLine", header: "Product line", emphasis: "muted", tooltipKey: "productLineLabel" },
  { key: "market", header: "Market", emphasis: "muted", tooltipKey: "marketLabel" },
  { key: "where", header: "Page", emphasis: "muted", maxWidth: "160px", tooltipKey: "url" },
  { key: "status", header: "Status", sortValue: (row) => row["statusRank"] },
];
