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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AbstractControl, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
// From the barrel, never a deep path: the bundle may only import what ThingsBoard maps (`@core/public-api`, …) — a deep
// import (`@core/auth/auth.service`) isn't there, and the whole module fails to load.
import { AuthService } from "@core/public-api";
import { User, UnitSystem, UnitSystems } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { CollapsibleCardComponent } from "../collapsible-card/collapsible-card.component";
import { SegmentOption, SegmentedControlComponent } from "../segmented-control/segmented-control.component";
import { SelectComponent, TbSelectOption } from "../select/select.component";
import { SectionNavItem } from "../section-nav/section-nav.component";
import { TbThemeMode } from "../dashboard/dashboard-preferences";
import { formatDateTime } from "../time-format";
import { apiMessage } from "../value-utils";
import { DashboardLoadingComponent, FirstLoads, firstLoadsOf } from "../dashboard-loading/dashboard-loading.component";
import { SecretBoxComponent } from "../secret-box/secret-box.component";
import { GOOGLE_CHAT_WEBHOOK } from "../organization/organization.models";
import { USER_CHAT_URL_KEY } from "../alarm-chat/alarm-chat.models";
import { ownProfileOf } from "../alarm-chat/own-profile";
import { AlarmNotificationsComponent } from "../alarm-subscriptions/alarm-notifications.component";
import { ManageActionComponent, ManageCardComponent } from "../manage-card/manage-card.component";

/** The Settings page's Account section (its section menu's last item). */
export const ACCOUNT_SECTION: SectionNavItem = { id: "account", label: "Account", icon: "account_circle" };

/** A phone number in E.164 format (+ and up to 15 digits), as ThingsBoard's profile takes it. */
const E164 = /^\+[1-9]\d{1,14}$/;
/** ThingsBoard's language when the user picks none ("Auto"). */
const DEFAULT_LANG = "en_US";

/** The Appearance's themes: light, dark, or the device's own setting (followed as it changes). */
const THEME_OPTIONS: SegmentOption[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

/** Where the section reports a save (the dashboard's toasts). */
export interface AccountNotices {
  success(message: string): void;
  error(message: string): void;
}

/**
 * The Settings page's Account: the signed-in user's profile, as ThingsBoard's
 * Profile page edits it — email, first and last name, phone (E.164), language
 * and unit system ("Auto": none set; no home dashboard: every user of the
 * access owner lands on the default home, Home, which the access writes) —
 * saved the way that page saves it (the user, then ThingsBoard's own state: the user's details, the
 * language, the unit system and the session token) — through the widget's one
 * copy of the record (`ownProfileOf`), only what the form changed, on the
 * record as it now is (a notification saved since the page opened is kept) —
 * and, of the
 * dashboards' own, the user's Google Chat webhook: where the alarms they
 * asked to be told of are posted (a device's Alarms tab picks them; masked,
 * kept in their additional info as `googleChatUrl`). Under it every alarm
 * notification they've set, in one table (`tb-alarm-notifications`), then the Appearance:
 * the dashboard's theme — light, dark or the system's — which the dashboard
 * keeps in the user's settings (its `DashboardTheme`).
 *
 * ```html
 * <tb-account-settings *ngIf="settingsSection === 'account'" [ctx]="ctx" [notices]="toasts" [theme]="theme.mode"
 *                      (themeChange)="theme.set($event)"></tb-account-settings>
 * ```
 */
@Component({
  selector: "tb-account-settings",
  templateUrl: "./account-settings.component.html",
  styleUrls: ["./account-settings.component.scss"],
  standalone: true,
  imports: [
    DashboardLoadingComponent,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CollapsibleCardComponent,
    SegmentedControlComponent,
    SelectComponent,
    SecretBoxComponent,
    AlarmNotificationsComponent,
    ManageCardComponent,
    ManageActionComponent,
  ],
})
export class AccountSettingsComponent implements OnInit {
  /** The loading page: the account the first time it shows (kept on the widget context: the component is made anew per visit). */
  get firstLoads(): FirstLoads {
    return firstLoadsOf(this.ctx);
  }

  @Input() ctx!: WidgetContext;
  @Input() notices: AccountNotices | null = null;
  /** The user's theme (the dashboard's `DashboardTheme.mode`). */
  @Input() theme: TbThemeMode = "system";
  @Output() themeChange = new EventEmitter<TbThemeMode>();

  readonly themeOptions = THEME_OPTIONS;

  form: FormGroup;
  /** The user as last loaded / saved (what the form resets to). */
  user: User | null = null;
  loading = true;
  saving = false;
  languageOptions: TbSelectOption[] = [];
  unitSystemOptions: TbSelectOption[] = [];

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {
    this.form = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      firstName: [""],
      lastName: [""],
      phone: ["", Validators.pattern(E164)],
      language: [""],
      unitSystem: [""],
      googleChatUrl: ["", (c: AbstractControl) => (!c.value || GOOGLE_CHAT_WEBHOOK.test(String(c.value).trim()) ? null : { webhook: true })],
    });
  }

  /** When the user last signed in ("Nov 9, 8:30 PM"); "" until known. */
  get lastLogin(): string {
    const ts = Number(this.user?.additionalInfo?.lastLoginTs);
    return ts ? formatDateTime(ts) : "";
  }

  get emailError(): string | null {
    const c = this.form.controls["email"];
    if (!c.touched) {
      return null;
    }
    return c.hasError("required") ? "An email is required." : c.hasError("email") ? "That's not a valid email." : null;
  }

  get phoneError(): string | null {
    const c = this.form.controls["phone"];
    return c.touched && c.hasError("pattern") ? "Use E.164 format: + and the number, e.g. +15062345678." : null;
  }

  get chatError(): string | null {
    const c = this.form.controls["googleChatUrl"];
    return c.touched && c.hasError("webhook") ? "A Google Chat space's webhook: https://chat.googleapis.com/v1/spaces/…/messages?key=…" : null;
  }

  get canSave(): boolean {
    return !!this.user && this.form.valid && this.form.dirty && !this.saving;
  }

  /** Sign out: ThingsBoard's own (its top bar's user menu — hidden on a phone, where this is the way out). */
  signOut(): void {
    this.ctx.$injector.get(AuthService).logout();
  }

  ngOnInit(): void {
    const t = (key: string, fallback: string) => {
      const text = this.ctx.translate.instant(key);
      return text && text !== key ? text : fallback;
    };
    // ThingsBoard's languages and unit systems, by its own names ("Auto": none set).
    this.languageOptions = [
      { value: "", label: t("language.auto", "Auto") },
      ...this.ctx.translate.getLangs().map((lang) => ({ value: lang, label: t(`language.locales.${lang}`, lang) })),
    ];
    this.unitSystemOptions = [
      { value: "", label: t("unit.unit-system-type.AUTO", "Auto") },
      ...UnitSystems.map((u) => ({ value: u, label: t(`unit.unit-system-type.${u}`, u) })),
    ];
    this.loadUser();
  }

  /** Back to the user as saved (the newest: the widget's copy). */
  cancel(): void {
    const user = ownProfileOf(this.ctx).user ?? this.user;
    if (user) {
      this.userLoaded(user);
    }
  }

  /**
   * Save the profile as ThingsBoard's page does, then bring ThingsBoard's own
   * state up to date. Only the fields changed here, set on the newest record
   * (the widget's copy — its saves one at a time): never the copy the page
   * read as it opened, whose version a notification or a feedback item saved
   * since has left behind.
   */
  save(): void {
    if (!this.canSave || !this.user) {
      return;
    }
    const v = this.form.value;
    const changed = (name: string) => this.form.controls[name].dirty;
    const text = (value: unknown) => String(value ?? "").trim();
    // An additional info key set, or removed when empty ("Auto", no webhook).
    const setInfo = (info: Record<string, any>, key: string, value: string) => {
      if (value) {
        info[key] = value;
      } else {
        delete info[key];
      }
    };
    this.saving = true;
    // (Their home dashboard as it is: the access keeps it.)
    ownProfileOf(this.ctx)
      .save((user) => {
        const info = user.additionalInfo as Record<string, any>;
        if (changed("email")) {
          user.email = text(v.email);
        }
        if (changed("firstName")) {
          user.firstName = text(v.firstName);
        }
        if (changed("lastName")) {
          user.lastName = text(v.lastName);
        }
        if (changed("phone")) {
          user.phone = text(v.phone);
        }
        if (changed("language")) {
          setInfo(info, "lang", text(v.language));
        }
        if (changed("unitSystem")) {
          setInfo(info, "unitSystem", text(v.unitSystem));
        }
        // Where their alarm notifications are posted (none: nowhere).
        if (changed("googleChatUrl")) {
          setInfo(info, USER_CHAT_URL_KEY, text(v.googleChatUrl));
        }
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving = false;
          this.userLoaded(saved);
          // ThingsBoard's own state, as its profile page leaves it (the user's details: the save itself), the language, the units, the session.
          // "[Settings] Change Language": ThingsBoard's own action (not in its public API).
          this.ctx.store?.dispatch({ type: "[Settings] Change Language", payload: { userLang: saved.additionalInfo?.lang || DEFAULT_LANG } } as any);
          this.ctx.unitService?.setUnitSystem(saved.additionalInfo?.unitSystem as UnitSystem);
          this.ctx.authService?.refreshJwtToken(false);
          this.notices?.success("Profile saved");
          this.cd.markForCheck();
        },
        error: (err) => {
          this.saving = false;
          this.notices?.error(`Couldn't save your profile${apiMessage(err)}`);
          this.cd.markForCheck();
        },
      });
  }

  private loadUser(): void {
    const id = this.ctx.currentUser?.userId;
    if (!id) {
      this.loading = false;
      return;
    }
    // Read again (not the widget's kept copy): the page shows the profile as it now is — and the kept copy follows.
    ownProfileOf(this.ctx)
      .load(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.loading = false;
          this.userLoaded(user);
          this.cd.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.cd.markForCheck();
        },
      });
  }

  /** The form from the user (as ThingsBoard's page fills it). */
  private userLoaded(user: User): void {
    this.user = user;
    const info: Record<string, any> = user.additionalInfo ?? {};
    this.form.reset(
      {
        email: user.email ?? "",
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
        language: info["lang"] || "",
        unitSystem: info["unitSystem"] || "",
        googleChatUrl: info[USER_CHAT_URL_KEY] || "",
      },
      { emitEvent: false }
    );
  }
}
