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

import { Component, HostBinding, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { TipDirective } from "../tip/tip.directive";
import { CardComponent } from "../card/card.component";
import { CollapsibleCardComponent } from "../collapsible-card/collapsible-card.component";
import { SkeletonCardComponent } from "../skeleton-card/skeleton-card.component";

/**
 * A detail panel card's facts as label / value rows (a user's last login, a
 * feedback item's page and browser): the rows a table's text size apart, each
 * a {@link DetailRowComponent}.
 *
 * ```html
 * <tb-card>
 *   <tb-detail-rows>
 *     <tb-detail-row label="Received">{{ when }}</tb-detail-row>
 *     <tb-detail-row label="Status"><tb-button-group …></tb-button-group></tb-detail-row>
 *     <tb-detail-row label="Feedback" [stacked]="true" [divider]="true">{{ text }}</tb-detail-row>
 *   </tb-detail-rows>
 * </tb-card>
 * ```
 */
@Component({
  selector: "tb-detail-rows",
  template: `<ng-content></ng-content>`,
  styleUrls: ["./detail-rows.component.scss"],
  standalone: true,
})
export class DetailRowsComponent {}

/**
 * One fact of a {@link DetailRowsComponent}: its label (muted) at the left, the
 * value (projected — text, a link cut with "…", a control) at the right; or,
 * `stacked`, the label over a value the card's width (a block of text). Its
 * `info`, a note on what the fact is: an info icon after the label, the text in
 * its `tbTip` bubble (as a form field's label, `form.tb-label-info`). A
 * `divider` draws a line above it, setting it apart from the rows before;
 * `oneLine` keeps a text value on one line, cut with "…" (an email address).
 */
@Component({
  selector: "tb-detail-row",
  template: `<span class="tbdr-label"
      >{{ label
      }}<span *ngIf="info" class="tbdr-info" tabindex="0" role="img" [attr.aria-label]="info" [tbTip]="info"><mat-icon>info</mat-icon></span></span
    ><span class="tbdr-value"><ng-content></ng-content></span>`,
  styleUrls: ["./detail-row.component.scss"],
  standalone: true,
  imports: [CommonModule, MatIconModule, TipDirective],
})
export class DetailRowComponent {
  @Input() label = "";
  /** A note on what the fact is: an info icon after the label, the text in its bubble ("": none). */
  @Input() info = "";
  @Input() @HostBinding("class.tbdr-stacked") stacked = false;
  @Input() @HostBinding("class.tbdr-divider") divider = false;
  @Input() @HostBinding("class.tbdr-one-line") oneLine = false;
}

/**
 * A detail panel's facts card — the one card of label / value rows every panel shows (a scale's readings, a fuel code's facts, a
 * feedback item's sender): the card shell around {@link DetailRowsComponent}, its rows projected. A `title` heads it (the titled,
 * non-folding card's look — an ESF unit's Profile cards), its `info` an info icon after the title; none: the plain card. While its
 * first read is out, `wireframe` shows a list card's placeholders in its place (`wireframeRows` of them) — never a "Loading…" row.
 *
 * ```html
 * <tb-detail-card>
 *   <tb-detail-row label="Last reading">{{ when }}</tb-detail-row>
 *   <tb-detail-row label="Total" info="The scale's running total">{{ total }} t</tb-detail-row>
 * </tb-detail-card>
 * <tb-detail-card title="Hardware" [wireframe]="loading" [wireframeRows]="6">…</tb-detail-card>
 * ```
 */
@Component({
  selector: "tb-detail-card",
  template: `<tb-skeleton-card *ngIf="wireframe; else card" kind="list" [rows]="wireframeRows"></tb-skeleton-card>
    <ng-template #card>
      <tb-collapsible-card *ngIf="title; else plain" [title]="title" [info]="info" [collapsible]="false" [fill]="fill">
        <ng-container *ngTemplateOutlet="rows"></ng-container>
      </tb-collapsible-card>
      <ng-template #plain>
        <tb-card><ng-container *ngTemplateOutlet="rows"></ng-container></tb-card>
      </ng-template>
    </ng-template>
    <ng-template #rows>
      <tb-detail-rows><ng-content></ng-content></tb-detail-rows>
    </ng-template>`,
  styles: [":host { display: block; }", ":host(.tbdc-fill) { display: flex; flex-direction: column; }", ":host(.tbdc-fill) > tb-collapsible-card { flex: 1 1 auto; }"],
  standalone: true,
  imports: [CommonModule, CardComponent, CollapsibleCardComponent, SkeletonCardComponent, DetailRowsComponent],
})
export class DetailCardComponent {
  /** Never let the browser's native tooltip show on the host (`title` is an input). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** Its heading ("": the plain card, no heading). */
  @Input() title = "";
  /** A note on the heading: an info icon after it. */
  @Input() info = "";
  /** Its first read is out: a list card's placeholders in its place. */
  @Input() wireframe = false;
  /** How many placeholder rows the wireframe shows (about its rows). */
  @Input() wireframeRows = 4;
  /** Fills its parent's height (a titled card in a row of cards of one height — a gateway page's Details): its rows at the top. */
  @Input() @HostBinding("class.tbdc-fill") fill = false;
}

/**
 * One of the things a card lists, each with facts of its own — a station's pumps, an ESF unit's interfaces and cloud connections:
 * its heading (its name, a muted note after it — "P01 Diesel"), anything at the heading's end projected (`[block-actions]`: its
 * state's pill), over its label / value rows ({@link DetailRowComponent}s, projected); a rule above every block but the first. No
 * heading: the rows alone. Inside a titled, non-folding card (`tb-collapsible-card [collapsible]="false"`, "Pumps").
 *
 * ```html
 * <tb-collapsible-card title="Pumps" [collapsible]="false">
 *   <tb-detail-block *ngFor="let p of pumps" [heading]="p.name" [note]="p.fuelType">
 *     <tb-status-pill block-actions [tone]="p.state.tone">{{ p.state.label }}</tb-status-pill>
 *     <tb-detail-row label="Today">{{ p.today }}</tb-detail-row>
 *   </tb-detail-block>
 * </tb-collapsible-card>
 * ```
 */
@Component({
  selector: "tb-detail-block",
  template: `<div *ngIf="heading" class="tbdb-head">
      <span class="tbdb-title"
        ><span class="tbdb-name">{{ heading }}</span><span *ngIf="note" class="tbdb-note">{{ note }}</span></span
      >
      <ng-content select="[block-actions]"></ng-content>
    </div>
    <tb-detail-rows><ng-content></ng-content></tb-detail-rows>`,
  styleUrls: ["./detail-block.component.scss"],
  standalone: true,
  imports: [CommonModule, DetailRowsComponent],
})
export class DetailBlockComponent {
  /** Its name ("P01"; "": no heading, the rows alone). */
  @Input() heading = "";
  /** A muted note after its name ("Diesel"). */
  @Input() note = "";
}
