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
 * A stop on the trail: a side panel open on an entity (a plant, an access
 * group, a user, a role, …).
 */
export interface PanelStop {
  /** What it is, once on the trail: "group:<id>". */
  key: string;
  /** Its icon on the strip (the panel header's). */
  icon: string;
  /** What kind of thing it is, in the strip's bubble: "Access group". */
  kind: string;
  /** Its name as it now is; null once it's gone (deleted) — it leaves the strip. */
  label: () => string | null;
  /** Its panel is the one open. */
  isOpen: () => boolean;
  /** Open its panel again — on `tab`, the one it was left on. */
  open: (tab?: string) => void;
  /** Close its panel (its stop closed with no other to go to). */
  close: () => void;
}

/** The most stops a trail holds (the strip's height): past it, the oldest one not in use goes. */
export const PANEL_TRAIL_MAX = 8;

/**
 * The side panels opened one from another — a plant's panel, a group from
 * its Groups tab, a member from the group — kept so the user can go back and
 * forth (`tb-panel-trail`: the strip on the open panel's edge, as UniFi's).
 *
 * One trail a dashboard, shared by the stores whose panels lead to each
 * other. Each store joins with what closes its panels and, first thing as a
 * panel opens — before it closes anything, the trail reads what's open —
 * tells the trail: {@link visit} for an entity's panel, {@link reset} for one
 * that's no stop (a blank form, a bulk edit). The trail then closes the other
 * stores' panels, so only one shows.
 *
 * A panel opened while none is (a table's row) starts a new trail; closing
 * the panel ends it. Nothing is tracked on close: which stop is open is asked
 * of the stops ({@link PanelStop.isOpen}).
 */
export class PanelTrail {
  /** The stops, in the order they were first opened. */
  stops: PanelStop[] = [];
  private readonly closers = new Map<object, () => void>();
  /** The tab each stop was left on. */
  private readonly tabs = new Map<string, string>();

  /** A store's panels join the trail: `close` shuts them when another store's panel opens. */
  join(owner: object, close: () => void): void {
    this.closers.set(owner, close);
  }

  /** The stop whose panel is open; null: none of the trail's is. */
  get active(): PanelStop | null {
    return this.stops.find((s) => s.isOpen()) ?? null;
  }

  /**
   * A panel opens on an entity: a stop after those there (its own place, if
   * it's one of them) — or, with no panel of the trail open, the first of a
   * new trail. Call it before closing anything.
   */
  visit(owner: object, stop: PanelStop): void {
    const from = this.active;
    let stops = from ? this.stops : [];
    if (!from) {
      this.tabs.clear();
    }
    this.closeOthers(owner);
    const at = stops.findIndex((s) => s.key === stop.key);
    if (at >= 0) {
      stops = stops.map((s, i) => (i === at ? stop : s));
    } else {
      stops = [...stops, stop];
      while (stops.length > PANEL_TRAIL_MAX) {
        const oldest = stops.findIndex((s) => s !== from && s !== stop);
        this.tabs.delete(stops[oldest].key);
        stops.splice(oldest, 1);
      }
    }
    this.stops = stops;
  }

  /** A panel that's no stop opens (a blank form, a bulk edit): the trail ends. Call it before closing anything. */
  reset(owner: object): void {
    this.stops = [];
    this.tabs.clear();
    this.closeOthers(owner);
  }

  /** A stop's panel shows this tab: where it opens again. */
  noteTab(key: string, tab: string): void {
    if (this.stops.some((s) => s.key === key)) {
      this.tabs.set(key, tab);
    }
  }

  /** A stop picked on the strip: its panel, on the tab it was left on. */
  select(stop: PanelStop): void {
    if (!stop.isOpen()) {
      stop.open(this.tabs.get(stop.key));
    }
  }

  /**
   * A stop closed on the strip: off the trail — the open one's place taken
   * by the stop before it (else the one after; the last one: its panel
   * closes).
   */
  remove(stop: PanelStop): void {
    const at = this.stops.findIndex((s) => s.key === stop.key);
    if (at < 0) {
      return;
    }
    if (stop.isOpen()) {
      const others = this.stops.filter((s, i) => i !== at && s.label() !== null);
      const before = this.stops.slice(0, at).filter((s) => s.label() !== null);
      const next = before[before.length - 1] ?? others[0];
      if (next) {
        // Opened while this one still shows: the trail goes on.
        next.open(this.tabs.get(next.key));
      } else {
        stop.close();
      }
    }
    this.tabs.delete(stop.key);
    this.stops = this.stops.filter((s) => s.key !== stop.key);
  }

  private closeOthers(owner: object): void {
    this.closers.forEach((close, other) => {
      if (other !== owner) {
        close();
      }
    });
  }
}
