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

import { Observable, of, throwError } from "rxjs";
import { catchError, finalize, shareReplay, switchMap, tap } from "rxjs/operators";
import { ActionAuthUpdateUserDetails, defaultHttpOptionsFromConfig } from "@core/public-api";
import { User } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { QUIET_REQUEST } from "../value-utils";
import { SerialQueue } from "./serial-queue";

const KEY = "__tbExtOwnProfile";

/**
 * A user's record saved — posted as it is, never through ThingsBoard's
 * `userService.saveUser`: this extension is typed against the open-source
 * service (user, activation mail, request options), while the instance runs
 * the PE one, whose third argument is the user's groups — the request's
 * options then land in the URL ("entityGroupId=[object Object]") and the
 * save is refused (400).
 */
export function saveUserRecord(ctx: WidgetContext, user: User): Observable<User> {
  return ctx.http.post<User>("/api/user?sendActivationMail=false", user, defaultHttpOptionsFromConfig(QUIET_REQUEST));
}

/** The signed-in user's own record, one for the widget (the Account page and the alarm notifications share it). */
export function ownProfileOf(ctx: WidgetContext): OwnProfile {
  const host = ctx as unknown as Record<string, OwnProfile | undefined>;
  return (host[KEY] ??= new OwnProfile(ctx));
}

/**
 * The signed-in user's own record (ThingsBoard's user — what its Profile
 * page edits): read once, then kept as last saved, so every save goes out
 * on the record's newest version. Saves run one at a time, each on what the
 * one before left; one that finds the record changed elsewhere reads it
 * again and tries once more.
 */
export class OwnProfile {
  /** The user as last read or saved; null until read. */
  user: User | null = null;
  private reading?: Observable<User>;
  /** The saves, one at a time. */
  private readonly saves = new SerialQueue();

  constructor(private readonly ctx: WidgetContext) {}

  /** The user's additional info as last known ({} until read). */
  get info(): Record<string, any> {
    return (this.user?.additionalInfo as Record<string, any> | undefined) ?? {};
  }

  /** The user, read once (`fresh`: read again). */
  load(fresh = false): Observable<User> {
    if (this.user && !fresh) {
      return of(this.user);
    }
    const id = this.ctx.currentUser?.userId;
    if (!id) {
      return throwError(() => new Error("no user"));
    }
    this.reading ??= this.ctx.userService.getUser(id, QUIET_REQUEST).pipe(
      tap((user) => (this.user = user)),
      finalize(() => (this.reading = undefined)),
      shareReplay(1)
    );
    return this.reading;
  }

  /** The record saved elsewhere (the Account page's own save): kept as the newest. */
  set(user: User): void {
    this.user = user;
  }

  /**
   * The user's additional info changed and saved: `change` gets a copy to
   * edit. After the save before it; on a record changed elsewhere, read
   * again and once more.
   */
  update(change: (info: Record<string, any>) => void): Observable<User> {
    const attempt = (fresh: boolean): Observable<User> =>
      this.load(fresh).pipe(
        switchMap((user) => {
          const additionalInfo: Record<string, any> = { ...((user.additionalInfo as Record<string, any> | undefined) ?? {}) };
          change(additionalInfo);
          return saveUserRecord(this.ctx, { ...user, additionalInfo } as User);
        }),
        tap((saved) => this.saved(saved))
      );
    return this.saves.run(() => attempt(false).pipe(catchError((err) => (err?.status === 409 ? attempt(true) : throwError(() => err)))));
  }

  /** The saved record kept, and ThingsBoard's own state brought up to it (as its Profile page leaves it). */
  private saved(saved: User): void {
    this.user = saved;
    this.ctx.store?.dispatch(
      new ActionAuthUpdateUserDetails({
        userDetails: {
          additionalInfo: { ...saved.additionalInfo },
          authority: saved.authority,
          createdTime: saved.createdTime,
          tenantId: saved.tenantId,
          customerId: saved.customerId,
          email: saved.email,
          phone: saved.phone,
          firstName: saved.firstName,
          id: saved.id,
          lastName: saved.lastName,
        } as User,
      })
    );
  }
}
