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

import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy } from "@angular/core";

/** Frames to wait for ThingsBoard's editor to mount (it loads Ace lazily the first time). */
const WAIT_FRAMES = 600;

/** A mark of the host's own checks in the editor's gutter: its line (1 first), how bad, what it says. */
export interface ScriptEditorMark {
  line: number;
  level: "error" | "warning";
  text: string;
}

/**
 * Lint options ThingsBoard's script editor sends its Ace worker none of — JSHint's style advice off where a script (ESF's own default,
 * a GraalJS one) is written so on purpose: no semicolons (`asi`), `new Array()` / `new Object()` (W009, W010), `map['key']` for a
 * record's dotted property names (W069). Ace's worker mixes them into its own, so ThingsBoard's — sent as it starts — stay.
 */
const WORKER_OPTIONS = { asi: true, "-W009": true, "-W010": true, "-W069": true };

/**
 * Settings for ThingsBoard's script editor (`tb-js-func`) it has no inputs for, applied to its Ace editor once it mounts — and again
 * as its mode changes (a new worker): the worker's lint options (`WORKER_OPTIONS`), and the host's own checks' marks in the gutter
 * beside the worker's (an ESF script's — `marks`), each with what it says on hover.
 *
 * ```html
 * <tb-js-func tbScriptEditor [marks]="marks" formControlName="…"></tb-js-func>
 * ```
 */
@Directive({
  selector: "tb-js-func[tbScriptEditor]",
  standalone: true,
})
export class ScriptEditorDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() marks: ScriptEditorMark[] = [];
  /**
   * The host checks the syntax itself (an ESF script's — as the browser parses it, its line and a plain message): the worker's
   * errors — JSHint's guesses ("Missing ';' before statement") — left out of the gutter; its warnings stay.
   */
  @Input() ownSyntax = false;
  /**
   * The editor's completers, replacing ThingsBoard's set (Ace's snippets, its words of the text, the keywords, its own): the host's
   * alone — an ESF script's, ESF's bindings by what's before the word. null keeps ThingsBoard's.
   */
  @Input() completers: unknown[] | null = null;

  private frame = 0;
  private stopped = false;
  private editor: any = null;
  /** The worker's own marks (the last it set), the host's put beside them. */
  private workerMarks: any[] = [];
  /** The marks being set here: the change they make isn't the worker's. */
  private painting = false;

  constructor(
    private el: ElementRef<HTMLElement>,
    private zone: NgZone
  ) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.waitForEditor(WAIT_FRAMES));
  }

  ngOnChanges(): void {
    this.paint();
  }

  ngOnDestroy(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
  }

  /** Ace keeps its editor on its container element (`env.editor`); it's there once ThingsBoard has created it. */
  private waitForEditor(framesLeft: number): void {
    if (this.stopped || framesLeft <= 0) {
      return;
    }
    const container = this.el.nativeElement.querySelector(".ace_editor") as (HTMLElement & { env?: { editor?: any } }) | null;
    const editor = container?.env?.editor;
    if (!editor?.session) {
      this.frame = requestAnimationFrame(() => this.waitForEditor(framesLeft - 1));
      return;
    }
    this.editor = editor;
    if (this.completers) {
      editor.completers = this.completers;
    }
    const session = editor.session;
    session.on("changeAnnotation", () => {
      if (!this.painting) {
        this.workerMarks = (session.getAnnotations() ?? []).filter((a: { tbOwn?: boolean }) => !a.tbOwn);
        this.paint();
      }
    });
    // A new mode brings a new worker (ThingsBoard sets its highlighting so): its options again, once it's up.
    session.on("changeMode", () => setTimeout(() => this.sendOptions()));
    this.sendOptions();
    this.workerMarks = (session.getAnnotations() ?? []).filter((a: { tbOwn?: boolean }) => !a.tbOwn);
    this.paint();
  }

  private sendOptions(): void {
    this.editor?.session?.$worker?.send?.("changeOptions", [WORKER_OPTIONS]);
  }

  /** The worker's marks and the host's, together in the gutter. */
  private paint(): void {
    const session = this.editor?.session;
    if (!session) {
      return;
    }
    const own = this.marks.map((m) => ({ row: Math.max(0, m.line - 1), column: 0, text: m.text, type: m.level, tbOwn: true }));
    const worker = this.ownSyntax ? this.workerMarks.filter((a: { type?: string }) => a.type !== "error") : this.workerMarks;
    this.painting = true;
    try {
      session.setAnnotations([...worker, ...own]);
    } finally {
      this.painting = false;
    }
  }
}
