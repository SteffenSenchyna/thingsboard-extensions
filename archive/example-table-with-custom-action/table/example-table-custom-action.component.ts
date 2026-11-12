import { Component, Input, OnInit } from "@angular/core";
import { WidgetContext } from "@home/models/widget-component.models";
import {
  EntityService,
  formatValue,
  isDefinedAndNotNull,
} from "@core/public-api";
import { DataKey, EntityType } from "@shared/public-api";
import { CustomDialogService } from "@home/components/widget/dialog/custom-dialog.service";
import { MatDialog } from "@angular/material/dialog";

import { catchError, map, Observable, of, throwError } from "rxjs";
import { ExampleTableCustomActionButtonComponent } from "../action-button/example-table-custom-action-button.component";

enum FormatKey {
  DECIMALS = "decimals",
  UNITS = "units",
}

export interface TableAddEntityDialogData {
  ctx: WidgetContext;
}

@Component({
  selector: "tb-example-table-custom-action",
  templateUrl: "example-table-custom-action.component.html",
  styleUrls: ["example-table-custom-action.component.scss"],
})
export class ExampleTableCustomActionComponent implements OnInit {
  @Input() ctx: WidgetContext;

  public tableValues: { [key: string]: any } = {};
  public entityName: string;
  public subTypes: Array<string>;
  private includeSubTypes = ["QC_", "WC_"];

  constructor(
    private dialog: MatDialog,
    private customDialogService: CustomDialogService,
    private entityService: EntityService,
  ) {}

  ngOnInit(): void {
    this.ctx.$scope.exampleTableComponent = this;
    this.entityName = this.ctx.datasources[0].entityName;
  }

  public onDataUpdated(): void {
    for (const key of this.ctx.data) {
      if (key.data.length) {
        const rowName: string = key.dataKey.label;
        const rowValue: string = formatValue(
          key.data[0][1],
          this.getFormatInfo<number>(key.dataKey, FormatKey.DECIMALS),
          this.getFormatInfo<string>(key.dataKey, FormatKey.UNITS),
          false,
        );
        this.tableValues[rowName] = rowValue;
      }
    }
    this.ctx.detectChanges();
  }

  public openForm() {
    return this.dialog
      .open<
        ExampleTableCustomActionButtonComponent,
        TableAddEntityDialogData,
        void
      >(ExampleTableCustomActionButtonComponent, {
        disableClose: true,
        panelClass: ["tb-dialog", "tb-fullscreen-dialog"],
        data: {
          ctx: this.ctx,
        },
      })
      .afterClosed();
  }

  getSubTypes(): Observable<Array<string>> {
    // if (!this.subTypes) {
    const subTypesObservable = this.entityService.getEntitySubtypesObservable(
      EntityType.DEVICE,
    );
    if (subTypesObservable) {
      const excludeSubTypesSet = new Set(this.includeSubTypes);
      subTypesObservable
        .pipe(
          catchError(() => of([] as Array<string>)),
          map((subTypes) => {
            const filteredSubTypes: Array<string> = [];
            subTypes.forEach(
              (subType) =>
                subType.startsWith("QC_") && filteredSubTypes.push(subType),
            );
            return filteredSubTypes;
          }),
          // share({
          //   connector: () => new ReplaySubject(1),
          //   resetOnError: false,
          //   resetOnComplete: false,
          //   resetOnRefCountZero: false,
          // })
        )
        .subscribe((res) => (this.subTypes = res));
    } else {
      return throwError(null);
    }
    // }
    // return this.subTypes;
  }

  private getFormatInfo<T>(dataKey: DataKey, formatKey: FormatKey): T {
    let formatInfo = this.ctx[formatKey] as T;
    if (isDefinedAndNotNull(dataKey[formatKey])) {
      formatInfo = dataKey[formatKey] as T;
    }

    return formatInfo;
  }
}
