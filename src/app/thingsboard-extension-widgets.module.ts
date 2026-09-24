///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { NgModule } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import addCustomWidgetLocale from "./locale/custom-widget-locale.constant";
import { CommonModule } from "@angular/common";
import { ExamplesModule } from "./components/examples/examples.module";
import { WaterMeteringModule } from "./water-metering/water-metering.module";
import { QcLabMonitoringModule } from "./qc-lab-monitoring/qc-lab-monitoring.module";
import { FuelManagementModule } from "./fuel-management/fuel-management.module";
import { addLibraryStyles } from "./scss/lib-styles";
import { provideTbTooltipDefaults } from "./components/shared/tooltip-defaults";
import { WidgetComponentsModule } from "@home/components/widget/widget-components.module";

@NgModule({
  declarations: [],
  // One-second show delay for every matTooltip in every dashboard of this bundle.
  providers: [provideTbTooltipDefaults()],
  imports: [CommonModule, WidgetComponentsModule, WaterMeteringModule, QcLabMonitoringModule, FuelManagementModule],
  exports: [ExamplesModule, WaterMeteringModule, QcLabMonitoringModule, FuelManagementModule, WidgetComponentsModule],
})
export class ThingsboardExtensionWidgetsModule {
  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
    addLibraryStyles("tb-extension-css");
  }
}
