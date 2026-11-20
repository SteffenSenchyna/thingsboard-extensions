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
 * Edits a page holds and hasn't applied (the ESF Wire graph's draft and its components' settings): what would be lost if the page
 * went now. A page registers what tells it (`dirty`) and how it asks (`ask(proceed)` — its own themed dialog, "Leave without
 * applying?", `proceed` on its confirm); what moves the page away asks first (`guardLeave`: the rail's pages, a page's own back, another
 * gateway); closing or reloading the tab while any is dirty gets the browser's own warning (`beforeunload` — its text the browser's).
 *
 * ```ts
 * const off = registerUnsaved({ dirty: () => this.dirty, ask: (proceed) => this.confirm.emit({ …, run: proceed }) });
 * this.destroyRef.onDestroy(off);
 * ```
 */
export interface UnsavedGuard {
  dirty: () => boolean;
  ask: (proceed: () => void) => void;
}

const guards = new Set<UnsavedGuard>();
let unloadHooked = false;

/** A page's unapplied edits, asked about before it goes; the returned function takes them off (the page destroyed). */
export function registerUnsaved(guard: UnsavedGuard): () => void {
  guards.add(guard);
  if (!unloadHooked) {
    unloadHooked = true;
    window.addEventListener("beforeunload", (e) => {
      if ([...guards].some((g) => g.dirty())) {
        e.preventDefault();
        e.returnValue = ""; // older browsers' way of asking
      }
    });
  }
  return () => guards.delete(guard);
}

/** A move away from the page: at once with nothing unapplied, else once the page holding the edits is told to drop them. */
export function guardLeave(proceed: () => void): void {
  const holding = [...guards].find((g) => g.dirty());
  if (holding) {
    holding.ask(proceed);
  } else {
    proceed();
  }
}
