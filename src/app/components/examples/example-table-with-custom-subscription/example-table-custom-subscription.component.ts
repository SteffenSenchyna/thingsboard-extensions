import { Component, Input, OnInit } from "@angular/core";
import { WidgetContext } from "@home/models/widget-component.models";
import { formatValue, WidgetSubscriptionOptions } from "@core/public-api";
import {
  AliasFilterType,
  BooleanOperation,
  DataKeyType,
  Datasource,
  DatasourceType,
  EntityKeyType,
  EntityKeyValueType,
  EntityType,
  FilterPredicateType,
  widgetType,
} from "@shared/public-api";

@Component({
  selector: "tb-example-table-custom-subscription",
  templateUrl: "./example-table-custom-subscription.component.html",
  styleUrls: ["./example-table-custom-subscription.component.scss"],
})
export class ExampleTableCustomSubscriptionComponent implements OnInit {
  @Input() ctx: WidgetContext;

  public tableValues: { [key: string]: any } = {};

  ngOnInit(): void {
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        dataKeys: [
          {
            decimals: 0,
            label: "Temperature",
            name: "temperature",
            settings: {},
            type: DataKeyType.attribute,
          },
        ],
        entityFilter: {
          type: AliasFilterType.entityType,
          entityType: EntityType.DEVICE,
        },
        keyFilters: [
          {
            key: {
              key: "active",
              type: EntityKeyType.ATTRIBUTE,
            },
            predicate: {
              operation: BooleanOperation.EQUAL,
              type: FilterPredicateType.BOOLEAN,
              value: {
                defaultValue: true,
              },
            },
            valueType: EntityKeyValueType.BOOLEAN,
          },
        ],
      },
    ];

    const options: WidgetSubscriptionOptions = {
      type: widgetType.latest,
      datasources,
      callbacks: {
        onDataUpdated: () => {
          this.onDataUpdated();
        },
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .subscribe((subscription) => {
        this.ctx.defaultSubscription = subscription;
        this.ctx.data = subscription.data;
        this.ctx.datasources = subscription.datasources;
      });
  }

  private onDataUpdated() {
    for (const key of this.ctx.data) {
      if (key.data.length) {
        const rowName: string = key.datasource.entity.name;
        this.tableValues[rowName] = formatValue(key.data[0][1], 2, "°C", false);
      }
    }
    this.ctx.detectChanges();
  }
}
