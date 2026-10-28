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

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { WidgetHeaderAction, WidgetHeaderComponent } from "../widget-header/widget-header.component";
import { injectCss, injectScript } from "../cdn-loader";

/** A point to plot on the map. */
export interface MapLocation {
  name: string;
  lat: number;
  lng: number;
  /** Marker glyph for this point; falls back to the card's `markerIcon`. */
  icon?: string;
  /** Custom glyph instead of a Material Symbol: an SVG path (24×24 viewBox), drawn in the marker's text colour. */
  iconPath?: string;
  /** Marker style: `brand` (default, blue) or `neutral` (slate — fixed places such as ports). */
  kind?: "brand" | "neutral";
  /** Identifies the entity behind the marker (returned with `locationAction`). */
  id?: string;
  /** Status pill in the marker's popup (tone = the shared status-pill tones). */
  status?: { label: string; tone: "success" | "warning" | "major" | "error" | "neutral" | "brand"; icon?: string };
  /** Label / value pairs in the marker's popup (a popup opens on click when set). */
  details?: { label: string; value: string }[];
  /** Text of the popup's action link ("Details"); emits `locationAction`. */
  actionLabel?: string;
  /** Heading in degrees (0 = north): draws a compass dial in the popup's top-right corner. */
  heading?: number;
  /** May be dragged to a new position while the card's `editable` mode is on (emits `locationMoved`). */
  draggable?: boolean;
}

/** A marker dropped at a new position in editable mode. */
export interface MapLocationMove {
  location: MapLocation;
  lat: number;
  lng: number;
}

export type MapType = "roadmap" | "satellite" | "hybrid";

/** An extra round control button on the map (stacked under layers / recenter). */
export interface MapControl {
  id: string;
  icon: string;
  tooltip?: string;
  /** Count badge on the icon; hidden when 0 / unset. */
  badge?: number | null;
  /** Brand-tinted (e.g. while the panel it opens is shown). */
  active?: boolean;
}

/** `[[south, west], [north, east]]` in degrees. */
export type MapBounds = [[number, number], [number, number]];

/**
 * Reusable map card: a Leaflet map (loaded lazily from a CDN) with brand-coloured
 * water-drop markers, clustering, a base-layer switcher (Positron / Esri imagery /
 * hybrid), and dark-mode tile inversion for the roadmap. Presentational: it plots
 * the {@link locations} input and emits {@link mapTypeChange}; data fetching and
 * persistence are the host's responsibility.
 */
@Component({
  selector: "tb-map-card",
  templateUrl: "./map-card.component.html",
  styleUrls: ["./map-card.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, WidgetHeaderComponent],
})
export class MapCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  /**
   * Strip the native `title` attribute off the host: `title` is set as an @Input
   * via `title="…"`, but it is also a global HTML attribute, so the browser would
   * otherwise render its own tooltip with that text on hover.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() title = "Map";
  @Input() icon = "location_on";
  /** Message shown when there are no locations to plot. */
  /** Overlay text while there are no locations; "" shows the bare map instead. */
  @Input() emptyText = "No locations";
  /** Material icon rendered inside each marker pin. */
  @Input() markerIcon = "water_drop";
  /** Pan the map to a marker when the pointer hovers it. */
  @Input() panOnHover = true;
  /** Show every marker's name label all the time (not only on hover). */
  @Input() permanentLabels = false;
  /** Zoom levels to back off from the tightest fit around the markers (0 = tight fit). */
  @Input() fitZoomOut = 0;
  /** Height of the map canvas (any CSS length). */
  @Input() mapHeight = "320px";
  @Input() locations: MapLocation[] = [];
  /**
   * Home area: the view shown before any marker arrives and the "recenter"
   * fallback when there are none (default: the whole world).
   */
  @Input() homeBounds: MapBounds | null = null;
  @Input() dark = false;
  @Input() mapType: MapType = "roadmap";
  /**
   * CARTO basemaps API key for the Roadmap (Positron) tiles. CARTO watermarks
   * keyless tiles "API KEY REQUIRED"; pass the key from the widget settings
   * (never hard-code it — the repository is public).
   */
  @Input() cartoApiKey = "";
  /** Header action icon buttons (e.g. a close button when shown in a dialog). */
  @Input() headerActions: WidgetHeaderAction[] = [];
  /** Hide the card header (icon + title) and show the bare map. */
  @Input() showHeader = true;
  /** Extra controls in the map's control stack; clicks emit `controlClick`. */
  @Input() controls: MapControl[] = [];
  @Output() controlClick = new EventEmitter<string>();
  /** Reposition mode: `draggable` locations can be dragged; a drop emits `locationMoved`. */
  @Input() editable = false;
  @Output() locationMoved = new EventEmitter<MapLocationMove>();
  @Output() mapTypeChange = new EventEmitter<MapType>();
  /** The popup's action link was clicked (the location it belongs to). */
  @Output() locationAction = new EventEmitter<MapLocation>();
  @Output() headerActionClick = new EventEmitter<string>();

  @ViewChild("mapContainer") mapContainer?: ElementRef<HTMLElement>;
  @ViewChild("mapLayers") mapLayersEl?: ElementRef<HTMLElement>;

  mapPanelOpen = false;
  mapError = false;
  mapEmpty = false;
  readonly mapTypes: { id: MapType; label: string; thumb: string }[] = [
    { id: "roadmap", label: "Roadmap", thumb: this.cartoTileUrl("4/3/5.png", "a") },
    { id: "satellite", label: "Satellite", thumb: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/3" },
    { id: "hybrid", label: "Hybrid", thumb: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/3" },
  ];

  /**
   * CARTO Positron tile URL. With a key: the keyed `basemaps.cartocdn.com`
   * raster endpoint (`?key=`); without one: the legacy keyless subdomain
   * endpoint (which CARTO watermarks "API KEY REQUIRED").
   */
  private cartoTileUrl(path: string, subdomain = "{s}"): string {
    return this.cartoApiKey
      ? `https://basemaps.cartocdn.com/rastertiles/light_all/${path}?key=${encodeURIComponent(this.cartoApiKey)}`
      : `https://${subdomain}.basemaps.cartocdn.com/light_all/${path}`;
  }

  private L: any;
  private map: any;
  private markerLayer: any;
  /** Live markers by location key — updated in place so an open popup survives a reload. */
  private markers = new Map<string, any>();
  private baseLayers: Record<string, any> = {};
  private mapReady = false;
  /** A fit was requested while the canvas had no size — redo it on the next invalidateSize(). */
  private pendingFit = false;
  /** The initial fit to the markers has been done (the view is the user's from then on). */
  private fitted = false;

  constructor(private readonly zone: NgZone, private readonly cd: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.mapReady) {
      return;
    }
    if (changes["locations"] || changes["editable"]) {
      // Draggability is fixed at creation, so an editable change rebuilds the markers.
      this.renderMarkers(!!changes["editable"]);
    }
    if (changes["cartoApiKey"]) {
      // Swap the roadmap layer (and its layer-picker thumbnail) for the keyed endpoint.
      this.baseLayers["roadmap"]?.remove();
      this.createBaseLayers();
    }
    if (changes["mapType"] || changes["cartoApiKey"]) {
      this.applyMapBaseLayer();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  /** Re-measure the map after it has been shown/resized. */
  invalidateSize(): void {
    const remeasure = () => {
      if (!this.map) {
        return;
      }
      this.zone.runOutsideAngular(() => {
        // No pan animation: the markers and their labels must land in their
        // final place in this same frame, not drift there over a few frames.
        this.map.invalidateSize({ animate: false, pan: false });
        // A view fitted while the canvas was hidden (0×0) is meaningless — redo
        // it now that the map has a size, so every marker is in view.
        if (this.pendingFit) {
          this.pendingFit = false;
          if (!this.fitToMarkers(false)) {
            this.showHome(false);
          }
        }
      });
    };
    // Already laid out (the caller flushed change detection): re-measure now,
    // before the browser paints, so nothing shows at the stale 0×0 geometry.
    // Otherwise wait a tick for the container to get its size.
    if (this.map && !this.hidden) {
      remeasure();
    } else {
      setTimeout(remeasure, 0);
    }
  }

  /** True while the canvas has no size (hidden view / closed card). */
  private get hidden(): boolean {
    const el = this.mapContainer?.nativeElement;
    return !el || el.clientWidth === 0 || el.clientHeight === 0;
  }

  trackByControlId(_: number, c: MapControl): string {
    return c.id;
  }

  toggleMapPanel(): void {
    this.mapPanelOpen = !this.mapPanelOpen;
  }

  /** Recenter the map to its original view that shows all markers. */
  recenter(): void {
    if (!this.mapReady || !this.map) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      if (!this.fitToMarkers()) {
        this.showHome(); // no markers → the home area (or the world)
      }
    });
  }

  /** Show the home bounds, or the default world view without any. */
  private showHome(animate = true): void {
    this.pendingFit = this.hidden;
    if (this.homeBounds) {
      this.map.fitBounds(this.homeBounds, { padding: [24, 24], animate });
    } else {
      this.map.setView([20, 0], 2, { animate });
    }
  }

  selectMapType(type: MapType): void {
    if (this.mapType === type) {
      return;
    }
    this.mapType = type;
    this.applyMapBaseLayer();
    this.mapTypeChange.emit(type);
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    if (this.mapPanelOpen && this.mapLayersEl && !this.mapLayersEl.nativeElement.contains(event.target as Node)) {
      this.mapPanelOpen = false;
    }
  }

  private async initMap(): Promise<void> {
    try {
      this.L = await this.loadLeaflet();
    } catch {
      this.mapError = true;
      this.cd.detectChanges();
      return;
    }
    if (!this.mapContainer) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.map = this.L.map(this.mapContainer!.nativeElement, { zoomControl: true, attributionControl: true });
      this.showHome(false);
      this.createBaseLayers();
      this.applyMapBaseLayer();
      this.markerLayer = this.L.markerClusterGroup
        ? this.L.markerClusterGroup({
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 17,
            maxClusterRadius: 50,
            animate: true,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: false,
            chunkedLoading: true,
            iconCreateFunction: (cluster: any) =>
              this.L.divIcon({
                html: '<div class="tbm-cluster-inner">' + cluster.getChildCount() + "</div>",
                className: "tbm-cluster",
                iconSize: [28, 28],
              }),
          })
        : this.L.layerGroup();
      this.markerLayer.addTo(this.map);
      this.mapReady = true;
      this.renderMarkers();
    });
  }

  private createBaseLayers(): void {
    const L = this.L;
    // The layer picker's roadmap thumbnail follows the (possibly keyed) tile endpoint.
    this.mapTypes[0].thumb = this.cartoTileUrl("4/3/5.png", "a");
    this.baseLayers = {
      // Roadmap — CARTO Positron.
      roadmap: L.tileLayer(this.cartoTileUrl("{z}/{x}/{y}{r}.png"), {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: "© OpenStreetMap, © CARTO",
      }),
      // Satellite — Esri World Imagery.
      satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "© Esri",
      }),
      // Hybrid — Esri imagery + place/boundary labels.
      hybrid: L.layerGroup(
        [
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
          }),
        ],
        { attribution: "© Esri" },
      ),
    };
  }

  /** Show only the base layer matching the current mapType. No-op if not ready. */
  private applyMapBaseLayer(): void {
    if (!this.map || !this.baseLayers[this.mapType]) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      Object.keys(this.baseLayers).forEach((key) => {
        const layer = this.baseLayers[key];
        if (key === this.mapType) {
          if (!this.map.hasLayer(layer)) {
            layer.addTo(this.map);
          }
        } else if (this.map.hasLayer(layer)) {
          layer.remove();
        }
      });
    });
  }

  /**
   * Sync the markers with {@link locations}. Existing markers (matched by `id`,
   * else kind + name) are moved / restyled in place — a rebuild would close the
   * open popup and re-show the hidden name label on every position update.
   */
  private renderMarkers(rebuild = false): void {
    if (!this.mapReady || !this.map || !this.L) {
      return;
    }
    if (rebuild) {
      this.markerLayer.clearLayers();
      this.markers.clear();
    }

    const locs = (this.locations ?? []).filter((l) => isFinite(l.lat) && isFinite(l.lng));
    this.mapEmpty = locs.length === 0;
    this.cd.detectChanges();

    // Fit the view to the markers ONCE — on the first render that has any — so
    // later position updates redraw the pins without disturbing where the user
    // has panned / zoomed (the recenter button refits on demand). Positioned
    // first (instant), then the markers are added, so the cluster doesn't
    // animate them from the old zoom into place. Hidden (no size): remember to
    // refit once invalidateSize() runs.
    if (locs.length && !this.fitted) {
      this.fitted = true;
      this.pendingFit = this.hidden;
      this.fitToMarkers(false);
    }

    const seen = new Set<string>();
    for (const loc of locs) {
      let key = loc.id ?? `${loc.kind ?? "brand"}:${loc.name}`;
      for (let n = 2; seen.has(key); n++) {
        key = `${loc.id ?? `${loc.kind ?? "brand"}:${loc.name}`}#${n}`; // duplicate ids / names
      }
      seen.add(key);
      const marker = this.markers.get(key);
      if (marker) {
        this.updateMarker(marker, loc);
      } else {
        this.markers.set(key, this.createMarker(loc));
      }
    }
    for (const [key, marker] of this.markers) {
      if (!seen.has(key)) {
        this.markerLayer.removeLayer(marker);
        this.markers.delete(key);
      }
    }
  }

  /** Brand (or neutral) circle (28px) with a white glyph, anchored bottom-centre; `key` identifies the style. */
  private iconFor(loc: MapLocation): { icon: any; key: string } {
    const glyph = loc.icon || this.markerIcon;
    const kind = loc.kind ?? "brand";
    const draggable = this.editable && !!loc.draggable;
    const key = `${kind}:${draggable ? "drag:" : ""}${loc.iconPath ? "path:" + loc.iconPath : glyph}`;
    // A custom path glyph, else the Material Symbol.
    const glyphHtml = loc.iconPath
      ? `<svg class="tbm-marker-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="${loc.iconPath.replace(/"/g, "")}" fill="currentColor"/></svg>`
      : `<span class="material-icons tbm-marker-icon">${glyph}</span>`;
    const icon = this.L.divIcon({
      className: `tbm-marker tbm-marker--${kind}${draggable ? " tbm-marker--draggable" : ""}`,
      html: `<span class="tbm-marker-pin">${glyphHtml}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      tooltipAnchor: [0, -30],
    });
    return { icon, key };
  }

  private createMarker(loc: MapLocation): any {
    const { icon, key } = this.iconFor(loc);
    const draggable = this.editable && !!loc.draggable;
    const marker = this.L.marker([loc.lat, loc.lng], { icon, draggable }).bindTooltip(loc.name, {
      className: "tbm-tooltip",
      direction: "top",
      permanent: this.permanentLabels,
    });
    marker.tbLoc = loc; // the handlers read the latest location
    marker.tbIconKey = key;
    if (this.panOnHover) {
      marker.on("mouseover", () => this.map.panTo(marker.getLatLng()));
    }
    if (draggable) {
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        this.zone.run(() => this.locationMoved.emit({ location: marker.tbLoc, lat, lng }));
      });
    }
    this.syncPopup(marker, loc);
    marker.addTo(this.markerLayer);
    return marker;
  }

  /** Move / restyle an existing marker and refresh its label and popup — the popup stays open if it was. */
  private updateMarker(marker: any, loc: MapLocation): void {
    marker.tbLoc = loc;
    const at = marker.getLatLng();
    if (at.lat !== loc.lat || at.lng !== loc.lng) {
      marker.setLatLng([loc.lat, loc.lng]); // the cluster group re-files it and reopens its popup
    }
    const { icon, key } = this.iconFor(loc);
    if (key !== marker.tbIconKey) {
      marker.setIcon(icon);
      marker.tbIconKey = key;
    }
    if (marker.getTooltip()?.getContent() !== loc.name) {
      marker.setTooltipContent(loc.name);
    }
    this.syncPopup(marker, loc);
  }

  /** Bind (or refresh) the click popup: status pill, label/value grid and an action link. */
  private syncPopup(marker: any, loc: MapLocation): void {
    if (!(loc.details?.length || loc.status)) {
      if (marker.getPopup()) {
        marker.unbindPopup();
      }
      return;
    }
    const html = this.popupHtml(loc);
    const popup = marker.getPopup();
    if (popup) {
      if (popup.getContent() !== html) {
        marker.setPopupContent(html);
        if (popup.isOpen()) {
          this.wirePopupAction(marker); // the content was re-rendered
        }
      }
      return;
    }
    marker.bindPopup(html, { className: "tbm-popup", closeButton: false, offset: [0, -22], minWidth: 260, maxWidth: 300 });
    marker.on("popupopen", () => {
      marker.closeTooltip(); // the name label would sit under the popup
      this.wirePopupAction(marker);
    });
    marker.on("popupclose", () => {
      if (this.permanentLabels) {
        marker.openTooltip();
      }
    });
  }

  /** The popup's action link closes it and emits the marker's current location. */
  private wirePopupAction(marker: any): void {
    const action = marker.getPopup()?.getElement()?.querySelector(".tbm-popup-action");
    action?.addEventListener("click", () => {
      marker.closePopup();
      this.zone.run(() => this.locationAction.emit(marker.tbLoc));
    });
  }

  /** Popup markup for a location — every text goes through escapeHtml. */
  private popupHtml(loc: MapLocation): string {
    const esc = (s: string) =>
      String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
    const status = loc.status
      ? `<span class="tbm-pill tbm-pill--${esc(loc.status.tone)}">${loc.status.icon ? `<span class="material-icons">${esc(loc.status.icon)}</span>` : ""}${esc(loc.status.label)}</span>`
      : "";
    // Compass: ring with a north tick and a needle rotated to the heading (red tip).
    // Compass dial (iOS style, transparent): tick ring, N/E/S/W, a centre
    // crosshair and a red pointer on the rim at the heading. North stays up;
    // the marks take the popup's text colour so they read in both themes.
    const compass = (deg: number) => {
      const c = 32;
      const ticks: string[] = [];
      for (let a = 0; a < 360; a += 6) {
        const major = a % 30 === 0;
        const r1 = major ? 23 : 25.5;
        const rad = (a * Math.PI) / 180;
        ticks.push(
          `<line x1="${(c + r1 * Math.sin(rad)).toFixed(2)}" y1="${(c - r1 * Math.cos(rad)).toFixed(2)}" x2="${(c + 28 * Math.sin(rad)).toFixed(2)}" y2="${(c - 28 * Math.cos(rad)).toFixed(2)}" stroke-width="${major ? 1.6 : 1}" stroke-opacity="${major ? 0.9 : 0.4}"/>`,
        );
      }
      const letter = (t: string, x: number, y: number) =>
        `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" fill="currentColor">${t}</text>`;
      return (
        `<svg class="tbm-compass" viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">` +
        `<g stroke="currentColor">${ticks.join("")}</g>` +
        letter("N", c, 15) +
        letter("E", 49, c) +
        letter("S", c, 49) +
        letter("W", 15, c) +
        `<circle cx="${c}" cy="${c}" r="7" fill="currentColor" fill-opacity="0.1"/>` +
        `<g stroke="currentColor" stroke-opacity="0.6" stroke-width="1"><line x1="${c - 6}" y1="${c}" x2="${c + 6}" y2="${c}"/><line x1="${c}" y1="${c - 6}" x2="${c}" y2="${c + 6}"/></g>` +
        `<path d="M32 1.5 L36 8.5 L28 8.5 Z" fill="#ff3b30" transform="rotate(${Math.round(deg)} ${c} ${c})"/>` +
        `</svg>`
      );
    };
    const rows = (loc.details ?? [])
      .map((d) => {
        return `<div><div class="tbm-popup-label">${esc(d.label)}</div><div class="tbm-popup-value">${esc(d.value)}</div></div>`;
      })
      .join("");
    const action = loc.actionLabel
      ? `<button type="button" class="tbm-popup-action">${esc(loc.actionLabel)}<span class="material-icons">arrow_forward</span></button>`
      : "";
    // Header: name + status pill on the left, the compass (when a heading is
    // known) in the top-right corner; then the readings; then the action link.
    const dial = loc.heading != null && isFinite(loc.heading) ? compass(loc.heading) : "";
    return (
      `<div class="tbm-popup-head"><div class="tbm-popup-id"><div class="tbm-popup-title">${esc(loc.name)}</div>${status}</div>${dial}</div>` +
      (rows ? `<div class="tbm-popup-grid">${rows}</div>` : "") +
      action
    );
  }

  /** Fit the view to all markers. Returns false when there are none to fit. */
  private fitToMarkers(animate = true): boolean {
    const pts = (this.locations ?? [])
      .map((l) => [l.lat, l.lng] as [number, number])
      .filter((p) => isFinite(p[0]) && isFinite(p[1]));
    if (pts.length === 1) {
      this.map.setView(pts[0], 15 - this.fitZoomOut, { animate });
      return true;
    }
    if (pts.length > 1) {
      const bounds = this.L.latLngBounds(pts);
      // The zoom fitBounds would pick, backed off by fitZoomOut levels.
      const zoom = this.map.getBoundsZoom(bounds, false, this.L.point(24, 24)) - this.fitZoomOut;
      this.map.setView(bounds.getCenter(), zoom, { animate });
      return true;
    }
    return false;
  }

  /** Load Leaflet + the markercluster plugin from CDN once. */
  private async loadLeaflet(): Promise<any> {
    const w = window as any;
    if (!w.L) {
      injectCss("tb-ext-leaflet-css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
      await injectScript("tb-ext-leaflet-js", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
    }
    if (w.L && !w.L.markerClusterGroup) {
      injectCss("tb-ext-cluster-css", "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css");
      await injectScript("tb-ext-cluster-js", "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js");
    }
    return w.L;
  }
}
