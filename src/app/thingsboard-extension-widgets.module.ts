///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { NgModule } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import addCustomWidgetLocale from "./locale/custom-widget-locale.constant";
import { CommonModule } from "@angular/common";
import { ExamplesModule } from "./components/examples/examples.module";
import { ShelterModule } from "./shelter/shelter.module";
import { addLibraryStyles } from "./scss/lib-styles";
import { WidgetComponentsModule } from "@home/components/widget/widget-components.module";

@NgModule({
  declarations: [],
  imports: [CommonModule, WidgetComponentsModule, ShelterModule],
  exports: [ExamplesModule, ShelterModule, WidgetComponentsModule],
})
export class ThingsboardExtensionWidgetsModule {
  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
    addLibraryStyles("tb-extension-css");
  }
}
