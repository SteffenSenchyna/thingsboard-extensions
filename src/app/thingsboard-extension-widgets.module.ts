///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { NgModule } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import addCustomWidgetLocale from "./locale/custom-widget-locale.constant";
import { CommonModule } from "@angular/common";
import { ExamplesModule } from "./components/examples/examples.module";
import { WaterMeteringModule } from "./water-metering/water-metering.module";
import { addLibraryStyles } from "./scss/lib-styles";
import { WidgetComponentsModule } from "@home/components/widget/widget-components.module";

@NgModule({
  declarations: [],
  imports: [CommonModule, WidgetComponentsModule, WaterMeteringModule],
  exports: [ExamplesModule, WaterMeteringModule, WidgetComponentsModule],
})
export class ThingsboardExtensionWidgetsModule {
  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
    addLibraryStyles("tb-extension-css");
  }
}
