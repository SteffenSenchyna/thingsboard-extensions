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

import { Observable, Subject } from "rxjs";

/**
 * A button a piece puts in a phone's title bar (`tb-nav-rail`'s, across the dashboard's top) — the filters' sheet of a
 * `tb-sidebar-layout`: its icon and name, what a tap does, and the element it belongs to (a title bar shows those inside its own
 * dashboard root: an app nested in Home puts its filters in Home's bar).
 */
export interface PhoneTitleAction {
  id: string;
  icon: string;
  label: string;
  /** Its owner's element: the title bar whose dashboard root holds it shows the button. */
  el: Element;
  run: () => void;
}

const actions = new Set<PhoneTitleAction>();
const changed = new Subject<void>();

/** The phone title bar's buttons put there by the pieces under it (the filters' button). */
export const PHONE_TITLE_ACTIONS = {
  /** A button added or taken away. */
  changes: changed.asObservable() as Observable<void>,
  /** Put a button in the title bar over `action.el`; the returned function takes it out again. */
  add(action: PhoneTitleAction): () => void {
    actions.add(action);
    changed.next();
    return () => {
      if (actions.delete(action)) {
        changed.next();
      }
    };
  },
  /** The buttons put there by pieces inside `root` (a dashboard root's title bar), in the order they came. */
  within(root: Element | null): PhoneTitleAction[] {
    return root ? [...actions].filter((a) => root.contains(a.el)) : [];
  },
};
