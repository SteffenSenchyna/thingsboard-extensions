import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnInit, Renderer2, SecurityContext, TemplateRef, ViewChild, ViewEncapsulation } from "@angular/core";
import * as echarts from "echarts/core";
import { EChartsOption, SeriesOption } from "echarts";
import { WidgetContext } from "@home/models/widget-component.models";
import { BarChart, CustomChart, LineChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, MarkLineComponent, PolarComponent, RadarComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import {
  ColorProcessor,
  ColorSettings,
  LegendConfig,
  LegendData,
  LegendKey,
  WidgetSettings,
  WidgetTimewindow,
  constantColor,
  LegendPosition,
  WidgetTypeParameters,
  ComponentStyle,
} from "@shared/public-api";
import { CallbackDataParams, XAXisOption, YAXisOption } from "echarts/types/dist/shared";
import { WidgetComponent } from "@home/components/widget/widget.component";
import { DomSanitizer } from "@angular/platform-browser";
import { formatValue, isDefinedAndNotNull } from "@core/public-api";
import { calculateAxisSize, measureAxisNameSize } from "@home/components/public-api";
import { ECharts } from "@home/components/widget/lib/chart/echarts-widget.models";
import tinycolor from "tinycolor2";
import { LinearGradientObject } from "zrender/lib/graphic/LinearGradient";
import { Observable } from "rxjs";

interface ChartCardSettings extends WidgetSettings {
  showLegend: boolean;
  legendConfig: LegendConfig;
  label: string;
  icon: string;
  iconColor: ColorSettings;
}

export const chartCardDefaultSettings: ChartCardSettings = {
  showLegend: false,
  legendConfig: {
    position: LegendPosition.top,
    sortDataKeys: true,
    showMin: false,
    showMax: false,
    showAvg: false,
    showTotal: false,
    showLatest: false,
    valueFormat: undefined,
  },
  label: "",
  icon: "thermostat",
  iconColor: constantColor("var(--tb-primary-500)"),
};

@Component({
  selector: "tb-chart-card",
  templateUrl: "./chart-card.component.html",
  styleUrls: ["./chart-card.component.scss"],
  encapsulation: ViewEncapsulation.None,
})
export class ChartCardComponent implements OnInit, AfterViewInit {
  @ViewChild("echartContainer", { static: false })
  echartContainer: ElementRef<HTMLElement>;

  @Input()
  ctx: WidgetContext;

  @Input()
  widgetTitlePanel: TemplateRef<any>;
  public value = "-";
  public label = "";
  public legendConfig: LegendConfig;
  public legendClass: string;
  public legendData: LegendData;
  public legendKeys: Array<LegendKey>;
  public showLegend: boolean;
  public iconName: string;
  public iconColorProcessor: ColorProcessor;
  backgroundStyle$: Observable<ComponentStyle>;
  overlayStyle: ComponentStyle = {};
  padding: string;
  private myChart: ECharts;
  private shapeResize$: ResizeObserver;
  private xAxis: XAXisOption;
  private yAxis: YAXisOption;
  private option: EChartsOption;
  private settings: ChartCardSettings;

  constructor(private renderer: Renderer2, private sanitizer: DomSanitizer, public widgetComponent: WidgetComponent, private cd: ChangeDetectorRef) {}

  //Core logic
  ngOnInit(): void {
    this.ctx.$scope.echartWidget = this;
    this.initEchart();
    this.settings = this.ctx.settings as ChartCardSettings;
    console.log("Widget Context:", this.ctx);
    const defaults = chartCardDefaultSettings;
    this.label = (this.settings.label ?? defaults.label) || this.ctx.datasources[0].dataKeys[0].label;
    this.iconName = this.settings.icon ?? defaults.icon;
    this.iconColorProcessor = ColorProcessor.fromSettings(this.settings.iconColor ?? defaults.iconColor);
    this.initLegend();
  }

  ngAfterViewInit(): void {
    this.myChart = echarts.init(this.echartContainer.nativeElement, null, {
      renderer: "svg",
    });
    this.initResize();

    this.xAxis = this.setupXAxis();
    this.yAxis = this.setupYAxis();
    this.option = {
      ...this.setupAnimationSettings(),
      formatter: (params: CallbackDataParams[]) => this.setupTooltipElement(params),
      backgroundColor: "transparent",
      darkMode: false,
      tooltip: {
        show: true,
        trigger: "axis",
        confine: true,
        padding: [8, 12],
        appendTo: "body",
        backgroundColor: "rgba(255, 255, 255, 0.76)",
        extraCssText: "backdrop-filter: blur(4px);",
        textStyle: {
          fontFamily: "Roboto",
          fontSize: 12,
          fontWeight: "normal",
          lineHeight: 16,
        },
      },
      grid: [
        {
          bottom: 0,
          left: 0,
          right: 0,
          top: 10,
          show: false,
          containLabel: false,
        },
      ],
      xAxis: [this.xAxis],
      yAxis: [this.yAxis],
      series: this.setupChartLines(),
      dataZoom: [],
    };

    this.myChart.setOption(this.option);
    this.updateAxisOffset(false);
  }

  public onInit(): void {}

  public onDataUpdated() {
    this.onResize();

    // rebuild and set series
    const linesData = Object.values(this.ctx.data).map((ds) => ({
      data: ds.data.map(([ts, value]) => ({ name: ts, value: [ts, value] })),
    }));
    this.option.series = linesData;

    // update the time window bounds
    const allTimestamps = linesData.flatMap((s) => (s.data as any[]).map((p) => p.name as number));
    if (allTimestamps.length) {
      this.xAxis.min = Math.min(...allTimestamps);
      this.xAxis.max = Math.max(...allTimestamps);
    }

    // refresh legend if needed
    if (this.showLegend) {
      this.legendData = this.ctx.defaultSubscription.legendData;
    }

    // gather the latest numeric value of each series
    const latestValues = Object.values(this.ctx.data)
      .map((ds) => {
        const len = ds.data.length;
        return len ? ds.data[len - 1][1] : null;
      })
      .filter((v) => typeof v === "number") as number[];

    if (latestValues.length) {
      // compute average when more than one, or just take the single value
      const sum = latestValues.reduce((acc, v) => acc + v, 0);
      const avg = sum / latestValues.length;

      // use the first dataKey’s units/decimals as fallback
      const dk = this.ctx.datasources[0].dataKeys[0];
      const decimals = isDefinedAndNotNull(dk.decimals) ? dk.decimals : this.ctx.decimals;
      const units = isDefinedAndNotNull(dk.units) ? dk.units : this.ctx.units;

      this.value = formatValue(avg, decimals, units, false);
    } else {
      this.value = "-";
    }

    this.myChart.setOption(this.option);
    this.updateAxisOffset();
    this.cd.detectChanges();
  }

  public toggleSeries(legendKey: LegendKey) {
    const name = legendKey.dataKey.label;
    this.myChart.dispatchAction({
      type: "legendToggleSelect",
      name,
    });
    const idx = legendKey.dataIndex;
    this.legendData.data[idx].hidden = !this.legendData.data[idx].hidden;
    this.cd.detectChanges();
  }

  private initLegend(): void {
    this.showLegend = this.ctx.settings.showLegend;
    if (this.showLegend) {
      this.legendConfig = this.ctx.settings.legendConfig;
      this.legendData = this.ctx.defaultSubscription.legendData;
      this.legendKeys = this.legendData.keys;
      this.legendClass = `legend-${this.legendConfig.position}`;
      if (this.legendConfig.sortDataKeys) {
        this.legendKeys = this.legendData.keys.sort((key1, key2) => key1.dataKey.label.localeCompare(key2.dataKey.label));
      } else {
        this.legendKeys = this.legendData.keys;
      }
    }
  }

  //Support logic
  private updateAxisOffset(lazy = true): void {
    const leftOffset = calculateAxisSize(this.myChart, this.yAxis.mainType, this.yAxis.id as string);
    const leftNameSize = measureAxisNameSize(this.myChart, this.yAxis.mainType, this.yAxis.id as string, this.yAxis.name);
    const bottomOffset = calculateAxisSize(this.myChart, this.xAxis.mainType, this.xAxis.id as string);
    const bottomNameSize = measureAxisNameSize(this.myChart, this.yAxis.mainType, this.yAxis.id as string, this.yAxis.name);
    const newGridLeft = leftOffset + leftNameSize;
    const newGridBottom = bottomOffset + bottomNameSize;
    if (this.option.grid[0].left !== newGridLeft || this.option.grid[0].bottom !== newGridBottom) {
      this.option.grid[0].left = newGridLeft;
      this.yAxis.nameGap = leftOffset;
      this.option.grid[0].bottom = newGridBottom;
      this.xAxis.nameGap = bottomOffset;
      this.myChart.setOption(this.option, {
        replaceMerge: ["yAxis", "xAxis", "grid"],
        lazyUpdate: lazy,
      });
    }
  }

  private updateXAxisTimeWindow = (option: XAXisOption, timeWindow: WidgetTimewindow) => {
    option.min = timeWindow.minTime;
    option.max = timeWindow.maxTime;
  };

  private initEchart(): void {
    echarts.use([TooltipComponent, GridComponent, VisualMapComponent, DataZoomComponent, MarkLineComponent, LineChart, CustomChart, LabelLayout, CanvasRenderer, SVGRenderer]);
  }

  private initResize(): void {
    this.shapeResize$ = new ResizeObserver(() => {
      this.onResize();
    });
    this.shapeResize$.observe(this.echartContainer.nativeElement);
  }

  private onResize() {
    this.myChart.resize();
  }

  private setupTooltipElement(params: CallbackDataParams[]): HTMLElement {
    const tooltipElement: HTMLElement = this.renderer.createElement("div");
    this.renderer.setStyle(tooltipElement, "display", "flex");
    this.renderer.setStyle(tooltipElement, "flex-direction", "column");
    this.renderer.setStyle(tooltipElement, "align-items", "flex-start");
    this.renderer.setStyle(tooltipElement, "gap", "16px");
    if (params.length) {
      const tooltipItemsElement: HTMLElement = this.renderer.createElement("div");
      this.renderer.setStyle(tooltipItemsElement, "display", "flex");
      this.renderer.setStyle(tooltipItemsElement, "flex-direction", "column");
      this.renderer.setStyle(tooltipItemsElement, "align-items", "flex-start");
      this.renderer.setStyle(tooltipItemsElement, "gap", "4px");

      this.renderer.appendChild(tooltipItemsElement, this.setTooltipDate(params));

      for (const [i, param] of params.entries()) {
        this.renderer.appendChild(tooltipItemsElement, this.constructTooltipSeriesElement(param, i));
      }

      this.renderer.appendChild(tooltipElement, tooltipItemsElement);
    }
    return tooltipElement;
  }

  private constructTooltipSeriesElement(param: CallbackDataParams, index: number): HTMLElement {
    const labelValueElement: HTMLElement = this.renderer.createElement("div");
    this.renderer.setStyle(labelValueElement, "display", "flex");
    this.renderer.setStyle(labelValueElement, "flex-direction", "row");
    this.renderer.setStyle(labelValueElement, "align-items", "center");
    this.renderer.setStyle(labelValueElement, "align-self", "stretch");
    this.renderer.setStyle(labelValueElement, "gap", "12px");
    const labelElement: HTMLElement = this.renderer.createElement("div");
    this.renderer.setStyle(labelElement, "display", "flex");
    this.renderer.setStyle(labelElement, "align-items", "center");
    this.renderer.setStyle(labelElement, "gap", "8px");
    this.renderer.appendChild(labelValueElement, labelElement);
    const circleElement: HTMLElement = this.renderer.createElement("div");
    this.renderer.setStyle(circleElement, "width", "8px");
    this.renderer.setStyle(circleElement, "height", "8px");
    this.renderer.setStyle(circleElement, "border-radius", "50%");
    this.renderer.setStyle(circleElement, "background", param.color);
    this.renderer.appendChild(labelElement, circleElement);
    const labelTextElement: HTMLElement = this.renderer.createElement("div");
    this.renderer.setProperty(labelTextElement, "innerHTML", this.sanitizer.sanitize(SecurityContext.HTML, param.seriesName));
    this.renderer.setStyle(labelTextElement, "font-family", "Roboto");
    this.renderer.setStyle(labelTextElement, "font-size", "12px");
    this.renderer.setStyle(labelTextElement, "font-style", "normal");
    this.renderer.setStyle(labelTextElement, "font-weight", 400);
    this.renderer.setStyle(labelTextElement, "line-height", "16px");
    this.renderer.setStyle(labelTextElement, "color", "rgba(0, 0, 0, 0.76)");
    this.renderer.appendChild(labelElement, labelTextElement);
    const decimals = isDefinedAndNotNull(this.ctx.data[index].dataKey.decimals) ? this.ctx.data[index].dataKey.decimals : this.ctx.decimals;
    const units = isDefinedAndNotNull(this.ctx.data[index].dataKey.units) ? this.ctx.data[index].dataKey.units : this.ctx.units;
    const value = formatValue(param.value[1], decimals, units, false);
    const valueElement: HTMLElement = this.renderer.createElement("div");
    this.renderer.setProperty(valueElement, "innerHTML", this.sanitizer.sanitize(SecurityContext.HTML, value));
    this.renderer.setStyle(valueElement, "flex", "1");
    this.renderer.setStyle(valueElement, "text-align", "end");
    this.renderer.setStyle(valueElement, "font-family", "Roboto");
    this.renderer.setStyle(valueElement, "font-size", "12px");
    this.renderer.setStyle(valueElement, "font-style", "normal");
    this.renderer.setStyle(valueElement, "font-weight", 500);
    this.renderer.setStyle(valueElement, "line-height", "16px");
    this.renderer.setStyle(valueElement, "color", "rgba(0, 0, 0, 0.76)");
    this.renderer.appendChild(labelValueElement, valueElement);
    return labelValueElement;
  }

  private setTooltipDate(params: CallbackDataParams[]): HTMLElement {
    const dateElement: HTMLElement = this.renderer.createElement("div");
    this.renderer.appendChild(dateElement, this.renderer.createText(new Date(params[0].value[0]).toLocaleString("en-GB")));
    this.renderer.setStyle(dateElement, "font-family", "Roboto");
    this.renderer.setStyle(dateElement, "font-size", "11px");
    this.renderer.setStyle(dateElement, "font-style", "normal");
    this.renderer.setStyle(dateElement, "font-weight", "400");
    this.renderer.setStyle(dateElement, "line-height", "16px");
    this.renderer.setStyle(dateElement, "color", "rgba(0, 0, 0, 0.76)");
    return dateElement;
  }

  private setupAnimationSettings(): object {
    return {
      animation: true,
      animationDelay: 0,
      animationDelayUpdate: 0,
      animationDuration: 500,
      animationDurationUpdate: 300,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      animationThreshold: 2000,
    };
  }

  private setupChartLines(): SeriesOption[] {
    const series: SeriesOption[] = [];
    for (const [index, dataKey] of this.ctx.datasources[0].dataKeys.entries()) {
      series.push({
        id: index,
        name: dataKey.label,
        type: "line",
        showSymbol: false,
        symbol: "circle",
        symbolSize: 6,
        smooth: true,
        step: false,
        stackStrategy: "all",
        data: [],
        lineStyle: {
          color: dataKey.color,
        },
        itemStyle: {
          color: dataKey.color,
        },
        areaStyle: {
          origin: "start",
          color: this.createLinearOpacityGradient(dataKey.color, {
            start: 50,
            end: 10,
          }),
        },
      });
    }
    return series;
  }

  private createLinearOpacityGradient = (color: string, gradient: { start: number; end: number }): LinearGradientObject => ({
    type: "linear",
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      {
        offset: 0,
        color: tinycolor(color)
          .setAlpha(gradient.start / 100)
          .toRgbString(), // color at 0%
      },
      {
        offset: 1,
        color: tinycolor(color)
          .setAlpha(gradient.end / 100)
          .toRgbString(), // color at 100%
      },
    ],
    global: false,
  });

  private setupYAxis(): YAXisOption {
    return {
      type: "value",
      position: "left",
      mainType: "yAxis",
      id: "yAxis",
      offset: 0,
      name: "",
      nameLocation: "middle",
      nameRotate: 90,
      alignTicks: true,
      scale: true,
      show: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    };
  }

  private setupXAxis(): XAXisOption {
    return {
      id: "xAxis",
      mainType: "xAxis",
      show: false,
      type: "time",
      position: "bottom",
      name: "",
      offset: 0,
      nameLocation: "middle",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
      axisPointer: {
        shadowStyle: {
          color: "rgba(210,219,238,0.2)",
        },
      },
      min: this.ctx.defaultSubscription.timeWindow.minTime,
      max: this.ctx.defaultSubscription.timeWindow.maxTime,
    };
  }
}
