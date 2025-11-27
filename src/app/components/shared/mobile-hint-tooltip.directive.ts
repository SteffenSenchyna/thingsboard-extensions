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

import { Directive, HostListener, ElementRef, AfterViewInit } from "@angular/core";

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: "[tb-hint-tooltip-icon]",
  standalone: true,
})
export class MobileHintTooltipDirective implements AfterViewInit {
  private iconElement: HTMLElement | null = null;

  constructor(private el: ElementRef) {}

  ngAfterViewInit() {
    // Find the mat-icon within the host element
    setTimeout(() => {
      this.iconElement = this.el.nativeElement.querySelector(".tb-hint-tooltip-icon");
    });
  }

  @HostListener("click", ["$event"])
  onClick(event: MouseEvent) {
    // Check if the click was on the icon
    if (this.iconElement && event.target === this.iconElement) {
      // Trigger a mouseenter event to show the tooltip
      const mouseEnterEvent = new MouseEvent("mouseenter", {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      this.iconElement.dispatchEvent(mouseEnterEvent);

      // Auto-hide after 3 seconds
      setTimeout(() => {
        if (this.iconElement) {
          const mouseLeaveEvent = new MouseEvent("mouseleave", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          this.iconElement.dispatchEvent(mouseLeaveEvent);
        }
      }, 3000);
    }
  }
}
