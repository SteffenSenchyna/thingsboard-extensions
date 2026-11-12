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

import { AfterViewInit, Directive, ElementRef, Input, OnDestroy } from "@angular/core";

/** Frames to wait for ThingsBoard's editor to mount (it loads Ace lazily the first time). */
const WAIT_FRAMES = 600;

/**
 * Settings for ThingsBoard's `tb-json-content` editor it has no inputs for,
 * applied to its Ace editor once it mounts: long lines scroll sideways instead
 * of wrapping (`wrap` false — the default), as a configuration file reads.
 *
 * ```html
 * <tb-json-content tbJsonEditor formControlName="…"></tb-json-content>
 * ```
 */
@Directive({
  selector: "tb-json-content[tbJsonEditor]",
  standalone: true,
})
export class JsonEditorDirective implements AfterViewInit, OnDestroy {
  /** Wrap long lines (ThingsBoard's default) rather than scrolling sideways. */
  @Input() wrap = false;

  private frame = 0;
  private stopped = false;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    this.waitForEditor(WAIT_FRAMES);
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
    const container = this.el.nativeElement.querySelector("#tb-json-input") as (HTMLElement & { env?: { editor?: any } }) | null;
    const editor = container?.env?.editor;
    if (editor) {
      this.apply(editor);
      return;
    }
    this.frame = requestAnimationFrame(() => this.waitForEditor(framesLeft - 1));
  }

  private apply(editor: any): void {
    editor.session?.setUseWrapMode?.(this.wrap);
    editor.setOption?.("wrap", this.wrap ? "free" : "off");
  }
}
