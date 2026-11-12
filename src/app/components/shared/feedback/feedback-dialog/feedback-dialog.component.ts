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

import { ChangeDetectorRef, Component, DestroyRef, ElementRef, Input, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, throwError, timer } from "rxjs";
import { catchError, map, retry, switchMap } from "rxjs/operators";
import { WidgetContext } from "@home/models/widget-component.models";
import { ConfirmDialogComponent } from "../../confirm-dialog/confirm-dialog.component";
import { SegmentOption } from "../../segmented-control/segmented-control.component";
import { TimeframePickerComponent } from "../../timeframe-picker/timeframe-picker.component";
import { ToastsComponent } from "../../toasts/toasts.component";
import { ownProfileOf } from "../../alarm-chat/own-profile";
import { apiMessage } from "../../value-utils";
import { RECORD_MAX_CHARS, captureScreen, encodeShot } from "../feedback-capture";
import {
  FEEDBACK_OUTBOX_KEY,
  FEEDBACK_TYPES,
  FeedbackDialogState,
  FeedbackItem,
  FeedbackType,
  appBuild,
  feedbackOf,
  feedbackOutbox,
  safeUrl,
} from "../feedback.models";

/** How long Send waits for a bug's screenshot still being taken: then it goes without. */
const SHOT_WAIT_MS = 15_000;

/**
 * The Send feedback dialog (the rail's "Send feedback" opens it —
 * `feedbackOf(ctx).show()`), placed once in the dashboard root (a nested app
 * leaves it to Home's): its kind — Bug, Idea, Other — and the words. A bug
 * goes with a screenshot of the dashboard behind the dialog, taken as it opens
 * (in the background, while the words are typed). Sent through the user's own
 * record (`feedbackOutbox`, saved and taken out again at once); the "Feedback"
 * rule chain keeps it on the Feedback asset.
 */
@Component({
  selector: "tb-feedback-dialog",
  templateUrl: "./feedback-dialog.component.html",
  styleUrls: ["./feedback-dialog.component.scss"],
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent, TimeframePickerComponent],
})
export class FeedbackDialogComponent implements OnInit {
  @Input() ctx!: WidgetContext;
  /** The dashboard's toasts: "Feedback sent", or why it wasn't. */
  @Input() notices?: ToastsComponent;

  state!: FeedbackDialogState;
  readonly typeOptions: SegmentOption[] = FEEDBACK_TYPES.map((t) => ({ id: t.id, label: t.label }));
  type: FeedbackType = "bug";
  text = "";
  sending = false;
  /** The screenshot being taken (from the dialog's opening): the dashboard drawn, made a picture at send time. */
  private shot: Promise<HTMLCanvasElement | null> | null = null;

  @ViewChild("textBox") private textBox?: ElementRef<HTMLTextAreaElement>;

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly cd: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.state = feedbackOf(this.ctx);
    this.state.opened.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.start());
  }

  get canSend(): boolean {
    return !this.sending && !!this.text.trim();
  }

  setType(id: string): void {
    this.type = (FEEDBACK_TYPES.find((t) => t.id === id)?.id ?? "other") as FeedbackType;
  }

  cancel(): void {
    if (!this.sending) {
      this.state.close();
    }
  }

  /** Opened: a blank form on Bug, the screenshot started, the words' box focused (after the dialog's own focus on Cancel). */
  private start(): void {
    this.type = "bug";
    this.text = "";
    this.sending = false;
    this.shot = this.takeScreenshot();
    this.cd.markForCheck();
    setTimeout(() => this.textBox?.nativeElement.focus());
  }

  /** The dashboard root (this dialog's parent), the dialog left out; started after the dialog has shown. */
  private takeScreenshot(): Promise<HTMLCanvasElement | null> {
    const root = this.host.nativeElement.parentElement;
    if (!root) {
      return Promise.resolve(null);
    }
    const self = this.host.nativeElement;
    return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))
      .then(() => captureScreen(root, (el) => el === self))
      .catch((err) => {
        console.warn("Feedback: no screenshot", err);
        return null;
      });
  }

  /** Send: a bug once its screenshot is in (or given up on); the dialog closes once the record took it. */
  send(): void {
    if (!this.canSend) {
      return;
    }
    this.sending = true;
    const type = this.type;
    const text = this.text.trim();
    const shot =
      type === "bug" && this.shot
        ? Promise.race([this.shot, new Promise<null>((resolve) => setTimeout(() => resolve(null), SHOT_WAIT_MS))])
        : Promise.resolve(null);
    // "Sending…" shows first: making the picture holds the page a moment.
    shot.then((canvas) => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve))).then(() => this.post(type, text, canvas)));
  }

  /**
   * The item into the user's record, a bug's screenshot made as large as the
   * room the record leaves ({@link RECORD_MAX_CHARS}: its other keys, the
   * item, a margin) — none when there's too little.
   */
  private post(type: FeedbackType, text: string, canvas: HTMLCanvasElement | null): void {
    const draft = this.item(type, text, type === "bug" ? "attached" : "none");
    ownProfileOf(this.ctx)
      .load()
      .pipe(
        map((user) => {
          const others = { ...((user.additionalInfo as Record<string, unknown> | undefined) ?? {}) };
          delete others[FEEDBACK_OUTBOX_KEY];
          const room = RECORD_MAX_CHARS - JSON.stringify(others).length - JSON.stringify({ [FEEDBACK_OUTBOX_KEY]: feedbackOutbox(draft, null) }).length - 400;
          const screenshot = type === "bug" && canvas ? encodeShot(canvas, room) : null;
          return { item: { ...draft, screenshot: type !== "bug" ? "none" : screenshot ? "attached" : "failed" } as FeedbackItem, screenshot };
        }),
        switchMap(({ item, screenshot }) =>
          this.save(feedbackOutbox(item, screenshot)).pipe(
            // Refused with the screenshot (the record changed meanwhile, the firewall): the words alone.
            catchError((err) => (screenshot ? this.save(feedbackOutbox({ ...item, screenshot: "failed" }, null)) : throwError(() => err)))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.sending = false;
          this.state.close();
          this.notices?.success("Thanks — it's with the administrators.", "Feedback sent");
          this.clearOutbox();
          this.cd.markForCheck();
        },
        error: (err) => {
          this.sending = false;
          this.notices?.error(`Feedback not sent${apiMessage(err)}`);
          this.cd.markForCheck();
        },
      });
  }

  /** The item in the user's record (the chain takes it from there). */
  private save(outbox: Record<string, string>): Observable<unknown> {
    return ownProfileOf(this.ctx).update((info) => {
      info[FEEDBACK_OUTBOX_KEY] = outbox;
    });
  }

  /** …and out of it again (the record never keeps it): tried a few times; still there, the next save of the record would send it again. */
  private clearOutbox(): void {
    ownProfileOf(this.ctx)
      .update((info) => {
        delete info[FEEDBACK_OUTBOX_KEY];
      })
      .pipe(retry({ count: 3, delay: (_, n) => timer(1000 * n) }))
      .subscribe({ error: (err) => console.warn("Feedback: the outbox stayed in the user's record", err) });
  }

  private item(type: FeedbackType, text: string, screenshot: FeedbackItem["screenshot"]): FeedbackItem {
    const user = this.ctx.currentUser as { firstName?: string; lastName?: string; sub?: string } | undefined;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.sub || "";
    const ratio = window.devicePixelRatio || 1;
    return {
      v: 1,
      type,
      text,
      sentAt: Date.now(),
      name,
      app: this.state.app,
      title: document.title,
      url: safeUrl(location.href),
      build: appBuild(),
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}×${window.innerHeight}${ratio !== 1 ? ` @${ratio}x` : ""}`,
      theme: this.host.nativeElement.closest(".dark") ? "dark" : "light",
      screenshot,
    };
  }
}
