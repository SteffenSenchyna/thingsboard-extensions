import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import {
  BasicWidgetConfigModule,
  HomeComponentsModule,
  WidgetConfigComponentsModule,
} from "@home/components/public-api";
import { ChartModule } from "primeng/chart";
import { AddMapItemComponent } from "./add-item/add-map-item.component";

@NgModule({
  declarations: [AddMapItemComponent],
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule,
    ChartModule,
    BasicWidgetConfigModule,
    WidgetConfigComponentsModule,
  ],
  exports: [AddMapItemComponent],
})
export class MapActionsModule {}
