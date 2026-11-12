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

import { Observable, defer, of } from "rxjs";
import { catchError, map, shareReplay, switchMap } from "rxjs/operators";

/**
 * Work run one piece at a time: each starts once the piece before it has
 * ended — however it ended — so two saves of one record never cross. A
 * piece starts when its result is subscribed to (and then runs to its end
 * even if that subscriber leaves).
 */
export class SerialQueue {
  /** The end of the piece queued last (the next one waits for it). */
  private last: Observable<unknown> = of(null);

  run<T>(work: () => Observable<T>): Observable<T> {
    // The piece before this one, taken now: `last` is this piece's own end from the next line on.
    const before = this.last;
    const done = defer(() => before).pipe(
      switchMap(() => work()),
      shareReplay(1)
    );
    this.last = done.pipe(
      map(() => null),
      catchError(() => of(null))
    );
    return done;
  }
}
