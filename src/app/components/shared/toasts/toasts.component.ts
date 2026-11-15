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

import { ChangeDetectorRef, Component, HostBinding, Input, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/** A toast's tone: the shared status scale, or `info` (the brand blue). */
export type ToastTone = "success" | "warning" | "error" | "info";

export interface ToastOptions {
  tone?: ToastTone;
  /** A bold first line above the message. */
  title?: string;
  /** How long it stays, in ms (0 = until closed). Defaults per tone: 4 s, warnings 6 s, errors 8 s. */
  duration?: number;
}

interface Toast {
  id: number;
  tone: ToastTone;
  icon: string;
  title: string;
  message: string;
  duration: number;
  /** Popped in (the enter animation's class). */
  shown: boolean;
  /** Sliding out (removed after the exit animation). */
  leaving: boolean;
  /** The auto-dismiss timer: what's left of it, and when it last started (paused while hovered). */
  remaining: number;
  startedAt: number;
  timer?: ReturnType<typeof setTimeout>;
}

const DEFAULT_DURATION: Record<ToastTone, number> = { success: 4000, info: 4000, warning: 6000, error: 8000 };
const ICONS: Record<ToastTone, string> = { success: "check_circle", warning: "warning", error: "error", info: "info" };
/** The exit animation's length (keep in step with the SCSS). */
const EXIT_MS = 160;

/**
 * The dashboards' toast notifications — in place of `ctx.show*Toast`, which
 * opens ThingsBoard's own toast in its overlay, outside the dashboard and its
 * light / dark theme. Put one in the dashboard root (beside the confirm
 * dialog) and call it from the component:
 *
 * ```html
 * <tb-ext-toasts #toasts></tb-ext-toasts>
 * ```
 * ```ts
 * @ViewChild("toasts", { static: true }) private toasts!: ToastsComponent;
 * this.toasts.success("Code 593304 revoked");
 * this.toasts.error("Couldn't delete the code asset", "Revoke failed");
 * ```
 *
 * Toasts stack at the dashboard's top-left corner (past the rail — a nested
 * app's, {@link nested}, at its own edge: the host's rail is outside it) (the newest at the
 * bottom), each a card with a tone badge, the message, a close button and a
 * time-left bar; they pop in with the shared popover pop, pause while hovered
 * and slide out when closed or timed out.
 */
@Component({
  selector: "tb-ext-toasts",
  templateUrl: "./toasts.component.html",
  styleUrls: ["./toasts.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class ToastsComponent implements OnDestroy {
  /** In an app opened inside Home (no rail of its own — Home's is outside its root): at its root's edge, not a rail past it. */
  @Input() @HostBinding("class.tbt-nested") nested = false;
  toasts: Toast[] = [];
  private nextId = 1;

  constructor(private cd: ChangeDetectorRef) {}

  show(message: string, opts: ToastOptions = {}): void {
    const tone = opts.tone ?? "info";
    const toast: Toast = {
      id: this.nextId++,
      tone,
      icon: ICONS[tone],
      title: opts.title ?? "",
      message,
      duration: opts.duration ?? DEFAULT_DURATION[tone],
      shown: false,
      leaving: false,
      remaining: 0,
      startedAt: 0,
    };
    this.toasts = [...this.toasts, toast];
    this.cd.detectChanges();
    // Next frame, so the hidden state paints first and the pop-in plays.
    requestAnimationFrame(() => {
      toast.shown = true;
      this.cd.detectChanges();
    });
    if (toast.duration > 0) {
      toast.remaining = toast.duration;
      this.start(toast);
    }
  }

  success(message: string, title?: string): void {
    this.show(message, { tone: "success", title });
  }

  warn(message: string, title?: string): void {
    this.show(message, { tone: "warning", title });
  }

  error(message: string, title?: string): void {
    this.show(message, { tone: "error", title });
  }

  info(message: string, title?: string): void {
    this.show(message, { tone: "info", title });
  }

  /** Slide the toast out, then drop it. */
  dismiss(toast: Toast): void {
    if (toast.leaving) {
      return;
    }
    this.stop(toast);
    toast.leaving = true;
    this.cd.detectChanges();
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t !== toast);
      this.cd.detectChanges();
    }, EXIT_MS);
  }

  /** Hovered: hold the auto-dismiss (and the time-left bar) where it is. */
  pause(toast: Toast): void {
    if (toast.timer) {
      this.stop(toast);
      toast.remaining = Math.max(0, toast.remaining - (Date.now() - toast.startedAt));
    }
  }

  resume(toast: Toast): void {
    if (toast.duration > 0 && !toast.timer && !toast.leaving) {
      this.start(toast);
    }
  }

  trackById(_: number, t: Toast): number {
    return t.id;
  }

  ngOnDestroy(): void {
    this.toasts.forEach((t) => this.stop(t));
  }

  private start(toast: Toast): void {
    toast.startedAt = Date.now();
    toast.timer = setTimeout(() => {
      toast.timer = undefined;
      this.dismiss(toast);
    }, toast.remaining);
  }

  private stop(toast: Toast): void {
    if (toast.timer) {
      clearTimeout(toast.timer);
      toast.timer = undefined;
    }
  }
}
