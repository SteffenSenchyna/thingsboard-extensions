import { Component } from "@angular/core";
import { FormBuilder, FormGroup } from "@angular/forms";
import { Store } from "@ngrx/store";
import { LegendPosition, LegendConfig, WidgetSettings, WidgetSettingsComponent, ColorSettings, constantColor } from "@shared/public-api";
import { AppState } from "@core/core.state";

interface ChartCardSettings extends WidgetSettings {
  showLegend: boolean;
  legendConfig: LegendConfig;
  label: string;
  icon: string;
  iconColor: ColorSettings;
}

@Component({
  selector: "tb-chart-card-settings",
  templateUrl: "./chart-card-settings.component.html",
  styleUrls: [],
})
export class ChartCardSettingsComponent extends WidgetSettingsComponent {
  public chartCardConfigForm: FormGroup;

  constructor(protected store: Store<AppState>, private fb: FormBuilder) {
    super(store);
  }

  protected defaultSettings(): ChartCardSettings {
    return {
      showLegend: false,
      legendConfig: {
        position: LegendPosition.top,
        sortDataKeys: true,
        showMin: true,
        showMax: true,
        showAvg: true,
        showTotal: true,
        showLatest: true,
      },
      label: "",
      icon: "thermostat",
      iconColor: constantColor("#5469FF"),
    };
  }

  protected onSettingsSet(settings: ChartCardSettings): void {
    this.chartCardConfigForm = this.fb.group({
      showLegend: [settings.showLegend, []],
      legendConfig: [settings.legendConfig, []],
      label: [settings.label, []],
      icon: [settings.icon, []],
      iconColor: [settings.iconColor, []],
    });
  }

  protected settingsForm(): FormGroup {
    return this.chartCardConfigForm;
  }
}
