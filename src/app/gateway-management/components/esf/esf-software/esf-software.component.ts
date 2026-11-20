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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonGroupComponent, ButtonGroupOption } from "../../../../components/shared/button-group/button-group.component";
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { CollapsibleCardComponent } from "../../../../components/shared/collapsible-card/collapsible-card.component";
import { FileFieldComponent, fileSizeText } from "../../../../components/shared/file-field/file-field.component";
import { InfoIconComponent } from "../../../../components/shared/info-icon/info-icon.component";
import { SecretBoxComponent } from "../../../../components/shared/secret-box/secret-box.component";
import { SkeletonCardComponent } from "../../../../components/shared/skeleton-card/skeleton-card.component";
import { SegmentOption } from "../../../../components/shared/segmented-control/segmented-control.component";
import { TimeframePickerComponent } from "../../../../components/shared/timeframe-picker/timeframe-picker.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../../components/shared/data-table/data-table.component";
import { StatusPillComponent, StatusPillTone } from "../../../../components/shared/status-pill/status-pill.component";
import { TableLinkComponent, TableLinksComponent } from "../../../../components/shared/table-links/table-links.component";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { ESF_RPC, parseEsfConfigs } from "../../../models/esf.models";
import { EsfBundle, EsfClient, EsfConfirm, EsfContainer, EsfPackage, esfReason, esfSubscribe, EsfSystemPackage, parseEsfBundles, parseEsfContainers, parseEsfImages, parseEsfPackages, parseEsfSystemPackages, parseEsfManagedContainers } from "../../../models/esf-api.models";
import { ESF_UPLOAD_MAX_BYTES, EsfNotAPackage, EsfPackageFile, EsfPackageUpload, readDeploymentPackage } from "../../../models/esf-upload.models";

/** A list read from the unit: its rows, whether it's being read, why it couldn't be. */
interface Listed<T> {
  rows: T[];
  loading: boolean;
  error: string;
}

const listed = <T>(): Listed<T> => ({ rows: [], loading: false, error: "" });

/** ESF's Container Orchestration service: off, ESF's inventory answers containers and images with a 500. */
export const ESF_CONTAINER_SERVICE = "org.eclipse.kura.container.orchestration.provider.ContainerOrchestrationService";

/** The ThingsBoard gateway's own container on the unit (its compose file's `container_name`): never stopped from here. */
export const ESF_GATEWAY_CONTAINER = "tb-gateway";

/** A bundle's or a container's state as its pill's tone: active / running green, a failure red, the rest neutral. */
export function runTone(state: string): StatusPillTone {
  const s = state.toUpperCase();
  if (s === "ACTIVE" || s === "RUNNING") {
    return "success";
  }
  return s === "FAILED" || s === "ERROR" ? "error" : "neutral";
}

/**
 * The ESF unit's software (Deploy v2 — `rest.deploy` — and Inventory v1 — `rest.inventory`), a tab a section (Packages | Bundles |
 * Containers | Images | System packages, one shown at a time): its deployment packages (install
 * one from a URL; uninstall, confirmed), its bundles (start / stop, a stop confirmed), its containers (start / stop) and images
 * (delete, confirmed), and — read when its tab first opens, a long list — its system packages. Containers and images are read only while ESF's
 * Container Orchestration service is on; off, one note says so, its "Open in Configuration" opening that service's settings.
 * The gateway's own container is never stopped from here (it would cut the unit off).
 */
@Component({
  selector: "tb-gm-esf-software",
  templateUrl: "./esf-software.component.html",
  styleUrls: ["./esf-software.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonGroupComponent,
    CalloutComponent,
    CollapsibleCardComponent,
    DataTableComponent,
    DataTableCellDirective,
    FileFieldComponent,
    InfoIconComponent,
    SecretBoxComponent,
    TimeframePickerComponent,
    SkeletonCardComponent,
    StatusPillComponent,
    TableLinkComponent,
    TableLinksComponent,
  ],
})
export class EsfSoftwareComponent implements OnChanges, OnDestroy {
  /** Where ESF's console sends one for a package: the Eclipse Marketplace's Kura and ESF packages. */
  readonly marketplaceUrl = "https://marketplace.eclipse.org/taxonomy/term/4397%2C4396/title";

  /** "Eclipse Marketplace": in a new tab, nothing of this page passed to it. */
  openMarketplace(): void {
    window.open(this.marketplaceUrl, "_blank", "noopener");
  }

  @Input() client: EsfClient | null = null;
  /**
   * Whether its view shows (it's kept, hidden, while another is): shown again with the container management found off — turned
   * on meanwhile in Configuration, say — it checks again, so the containers and images come without a reload.
   */
  @Input() shown = false;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();
  /** "Open in Configuration": a component's settings (the Configuration view, on it). */
  @Output() openComponent = new EventEmitter<string>();

  readonly containerService = ESF_CONTAINER_SERVICE;

  /** Its sections, one shown at a time. */
  readonly sections: SegmentOption[] = [
    { id: "packages", label: "Packages" },
    { id: "bundles", label: "Bundles" },
    { id: "containers", label: "Containers" },
    { id: "images", label: "Images" },
    { id: "system", label: "System packages" },
  ];
  section = "packages";

  readonly packageColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Package", emphasis: "strong" },
    { key: "version", phone: "sub", header: "Version", emphasis: "muted", nowrap: true },
    { key: "action", phone: "trail", header: "", align: "right" },
  ];
  readonly bundleColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Bundle", emphasis: "strong" },
    { key: "version", phone: "sub", header: "Version", emphasis: "muted" },
    { key: "state", phone: "sub", header: "State" },
    { key: "action", phone: "trail", header: "", align: "right" },
  ];
  readonly containerColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Container", emphasis: "strong" },
    { key: "version", phone: "sub", header: "Image", emphasis: "muted" },
    { key: "state", phone: "sub", header: "State" },
    // ESF's console's "Framework Managed": a container ESF itself runs (a Container Instance of its name), or one started outside it.
    { key: "managed", phone: "sub", header: "Framework managed", emphasis: "muted", nowrap: true },
    { key: "action", phone: "trail", header: "", align: "right" },
  ];
  readonly imageColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Image", emphasis: "strong" },
    { key: "version", phone: "sub", header: "Tag", emphasis: "muted", nowrap: true },
    { key: "action", phone: "trail", header: "", align: "right" },
  ];
  readonly systemColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Package", emphasis: "strong" },
    { key: "version", phone: "sub", header: "Version", emphasis: "muted" },
    { key: "type", phone: "trail", header: "Type", emphasis: "muted", nowrap: true },
  ];

  packages = listed<EsfPackage>();
  bundles = listed<EsfBundle & { tone: StatusPillTone }>();
  containers = listed<EsfContainer & { tone: StatusPillTone; key: string; managed: string }>();
  images = listed<EsfPackage & { key: string }>();
  systemPackages = listed<EsfSystemPackage & { key: string }>();
  /** The system packages were asked for (their card opened). */
  systemRequested = false;
  /** ESF's container management: on, off, or not known yet / unknown (then the lists are read and say what they find). */
  containerEngine: "on" | "off" | "unknown" | "checking" = "checking";

  /** Where a package is installed from: a URL ESF fetches (or a path on the unit), or a file of this computer's, uploaded. */
  readonly installSources: ButtonGroupOption[] = [
    { value: "url", label: "URL" },
    { value: "file", label: "File" },
  ];
  installSource: "url" | "file" = "url";
  installUrl = "";
  /** The file picked, its package (from its manifest — null: not known), or why it can't be sent. */
  installFile: File | null = null;
  installPackage: EsfPackageFile | null = null;
  installFileError = "";
  /** The file is being read (its manifest). */
  readingFile = false;
  /** ESF's command service's password: the file goes to the unit through it. */
  commandPassword = "";
  installing = false;
  /** The file being uploaded (its pieces, its phase), while it is. */
  upload: EsfPackageUpload | null = null;
  /** The row an action is running for ("" none). */
  busyKey = "";

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnDestroy(): void {
    this.upload?.stop();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      // Another unit: an upload to the last one stops after its piece (its folder removed).
      this.upload?.stop();
      this.systemRequested = false;
      this.systemPackages = listed();
      this.loadPackages();
      this.loadBundles();
      this.checkContainerEngine();
    } else if (changes["shown"] && this.shown && this.containerEngine === "off") {
      this.checkContainerEngine();
    }
  }

  /** Whether ESF's Container Orchestration service is on: its containers and images are read only then. */
  checkContainerEngine(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.containerEngine = "checking";
    esfSubscribe(
      client.call(ESF_RPC.getConfig, { pids: [ESF_CONTAINER_SERVICE] }),
      this.destroyRef,
      (reply) => {
        if (client !== this.client) {
          return;
        }
        const config = parseEsfConfigs(reply).find((c) => c.pid === ESF_CONTAINER_SERVICE);
        const enabled = config?.properties["enabled"]?.value;
        this.containerEngine = enabled === false || enabled === "false" ? "off" : config ? "on" : "unknown";
        if (this.containerEngine !== "off") {
          this.loadContainers();
          this.loadImages();
        }
        this.cd.markForCheck();
      },
      () => {
        // Not readable (no rest.configuration, say): the lists are read and say what they find.
        if (client === this.client) {
          this.containerEngine = "unknown";
          this.loadContainers();
          this.loadImages();
          this.cd.markForCheck();
        }
      }
    );
  }

  loadPackages(): void {
    this.read("esfPackages", (reply) => parseEsfPackages(reply), (l) => (this.packages = l), this.packages);
  }

  loadBundles(): void {
    this.read("esfBundles", (reply) => parseEsfBundles(reply).map((b) => ({ ...b, tone: runTone(b.state) })), (l) => (this.bundles = l), this.bundles);
  }

  loadContainers(): void {
    this.read(
      "esfContainers",
      (reply) => parseEsfContainers(reply).map((c) => ({ ...c, tone: runTone(c.state), key: `${c.name}|${c.version}`, managed: this.managedOf(c.name) })),
      (l) => (this.containers = l),
      this.containers
    );
    this.loadManagedContainers();
  }

  /** The containers ESF itself runs (its Container Instance components): known, each row's "Framework managed" says so. */
  private managedContainers: Set<string> | null = null;

  /** A container's "Framework managed": Yes / No, "" while not known (the components' list unread, or refused). */
  private managedOf(name: string): string {
    return this.managedContainers ? (this.managedContainers.has(name) ? "Yes" : "No") : "";
  }

  /** The components with their factories: which containers ESF runs — the rows shown marked as it comes. */
  private loadManagedContainers(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    esfSubscribe(
      client.call("esfComponentFactories"),
      this.destroyRef,
      (reply) => {
        if (client !== this.client) {
          return;
        }
        this.managedContainers = parseEsfManagedContainers(reply);
        this.containers = { ...this.containers, rows: this.containers.rows.map((r) => ({ ...r, managed: this.managedOf(r.name) })) };
        this.cd.markForCheck();
      },
      () => undefined
    );
  }

  loadImages(): void {
    this.read("esfImages", (reply) => parseEsfImages(reply).map((i) => ({ ...i, key: `${i.name}|${i.version}` })), (l) => (this.images = l), this.images);
  }

  /** A read that got no answer in time (ThingsBoard's "Request timeout"): the unit was too slow, not refused. */
  timedOut(reason: string): boolean {
    return /time ?out/i.test(reason);
  }

  /** A section picked; the system packages (a long list) read the first time theirs is. */
  selectSection(id: string): void {
    this.section = id;
    // Containers or images with the management found off: it may be on by now (Configuration) — checked again.
    if ((id === "containers" || id === "images") && this.containerEngine === "off") {
      this.checkContainerEngine();
    }
    if (id === "system" && !this.systemRequested) {
      this.systemRequested = true;
      this.loadSystemPackages();
    }
  }

  loadSystemPackages(): void {
    this.read(
      "esfSystemPackages",
      (reply) => parseEsfSystemPackages(reply).map((p) => ({ ...p, key: `${p.type}|${p.name}` })),
      (l) => (this.systemPackages = l),
      this.systemPackages
    );
  }

  /** Install can go: a URL typed, or a file picked that's a package (read, small enough). */
  get canInstall(): boolean {
    if (this.installing) {
      return false;
    }
    return this.installSource === "url" ? !!this.installUrl.trim() : !!this.installFile && !this.installFileError && !this.readingFile;
  }

  /** Install's running words: uploading (its pieces counted), checking the file on the unit, installing. */
  get installBusyLabel(): string {
    const phase = this.upload?.phase;
    return phase === "preparing" || phase === "sending" ? "Uploading" : phase === "checking" ? "Checking" : "Installing";
  }

  get installProgress(): string {
    const u = this.upload;
    return u && u.phase === "sending" ? `${u.sent} / ${u.pieces}` : "";
  }

  /** An upload can be cancelled until ESF is asked to install it (then its file is ESF's). */
  get canCancelUpload(): boolean {
    const phase = this.upload?.phase;
    return !!this.upload && !this.upload.isStopped && (phase === "preparing" || phase === "sending" || phase === "checking");
  }

  /** A file picked: read as a deployment package (its manifest: its name and version), or why it can't be sent. */
  async fileChanged(file: File | null): Promise<void> {
    this.installFile = file;
    this.installPackage = null;
    this.installFileError = "";
    if (!file) {
      return;
    }
    if (file.size > ESF_UPLOAD_MAX_BYTES) {
      this.installFileError = `${fileSizeText(file.size)}: larger than a file sent through the gateway can be (${fileSizeText(ESF_UPLOAD_MAX_BYTES)}) — install it from a URL`;
      return;
    }
    this.readingFile = true;
    try {
      const read = await readDeploymentPackage(file);
      if (this.installFile === file) {
        this.installPackage = read;
      }
    } catch (err) {
      if (this.installFile === file) {
        this.installFileError = err instanceof EsfNotAPackage ? err.message : "Couldn't read the file";
      }
    } finally {
      this.readingFile = false;
      this.cd.markForCheck();
    }
  }

  cancelUpload(): void {
    this.upload?.stop();
    this.cd.markForCheck();
  }

  /**
   * "Install": a deployment package from a URL ESF fetches (a path on the unit as a `file:` one) — ESF installs it in the
   * background — or a file picked, uploaded through ESF's command service, then installed and waited for.
   */
  install(): void {
    if (this.installSource === "file") {
      void this.uploadFile();
      return;
    }
    const typed = this.installUrl.trim();
    const url = typed.startsWith("/") ? `file:${typed}` : typed;
    if (!url || !this.client || this.installing) {
      return;
    }
    this.installing = true;
    esfSubscribe(
      this.client.call("esfInstallPackage", { url }),
      this.destroyRef,
      () => {
        this.installing = false;
        this.installUrl = "";
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.loadPackages();
      },
      (reason) => {
        this.installing = false;
        this.notify.emit({ tone: "error", message: `Couldn't install the package: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  /** The file uploaded in pieces (`EsfPackageUpload`), installed, waited for; its folder on the unit removed whatever happened. */
  private async uploadFile(): Promise<void> {
    const file = this.installFile;
    const client = this.client;
    if (!file || !client || !this.canInstall) {
      return;
    }
    const upload = new EsfPackageUpload(client, file, this.commandPassword);
    const what = this.installPackage ? `${this.installPackage.name} ${this.installPackage.version}`.trim() : file.name;
    this.upload = upload;
    this.installing = true;
    this.cd.markForCheck();
    try {
      await upload.send(() => this.cd.markForCheck());
      const installed = await upload.install();
      if (upload.isStopped) {
        return;
      }
      if (installed) {
        this.notify.emit({ tone: "success", message: "Settings applied" });
        if (this.installFile === file) {
          this.installFile = null;
          this.installPackage = null;
        }
      } else {
        this.notify.emit({ tone: "warning", message: `ESF hasn't installed ${what}: see the unit's log` });
      }
    } catch (err) {
      this.notify.emit(
        upload.isStopped ? { tone: "info", message: "Upload cancelled" } : { tone: "error", message: `Couldn't install ${what}: ${err instanceof Error ? err.message : esfReason(err)}` }
      );
    } finally {
      await upload.cleanUp();
      if (this.upload === upload) {
        this.upload = null;
        this.installing = false;
        this.loadPackages();
      }
      this.cd.markForCheck();
    }
  }

  askUninstall(p: EsfPackage): void {
    this.confirm.emit({
      heading: "Uninstall package?",
      message: `${p.name} ${p.version} will be uninstalled from the unit.`,
      confirmLabel: "Uninstall",
      danger: true,
      run: () => this.act(p.name, "esfUninstallPackage", undefined, { name: p.name }, `${p.name} uninstall requested`, () => this.loadPackages()),
    });
  }

  toggleBundle(b: EsfBundle): void {
    const stop = b.state.toUpperCase() === "ACTIVE";
    const run = () => this.act(b.name, stop ? "esfStopBundle" : "esfStartBundle", { name: b.name }, {}, `${b.name} ${stop ? "stopped" : "started"}`, () => this.loadBundles());
    if (stop) {
      this.confirm.emit({ heading: "Stop bundle?", message: `${b.name} will stop until it's started again.`, confirmLabel: "Stop", danger: true, run });
    } else {
      run();
    }
  }

  toggleContainer(c: EsfContainer & { key: string; tone: StatusPillTone }): void {
    const stop = c.tone === "success";
    if (stop && c.name === ESF_GATEWAY_CONTAINER) {
      this.notify.emit({
        tone: "warning",
        message: `${c.name} runs the ThingsBoard gateway: stopping it would cut the unit off, with no way to start it again from here.`,
      });
      return;
    }
    const run = () =>
      this.act(c.key, stop ? "esfStopContainer" : "esfStartContainer", { name: c.name, version: c.version }, {}, `${c.name} ${stop ? "stopped" : "started"}`, () =>
        this.loadContainers()
      );
    if (stop) {
      this.confirm.emit({ heading: "Stop container?", message: `${c.name} will stop until it's started again.`, confirmLabel: "Stop", danger: true, run });
    } else {
      run();
    }
  }

  askDeleteImage(i: EsfPackage & { key: string }): void {
    this.confirm.emit({
      heading: "Delete image?",
      message: `The image ${i.name}:${i.version} will be deleted from the unit.`,
      confirmLabel: "Delete",
      danger: true,
      run: () => this.act(i.key, "esfDeleteImage", { name: i.name, version: i.version }, {}, `${i.name}:${i.version} deleted`, () => this.loadImages()),
    });
  }

  /** An action on one row: its call, a toast either way, its list read again after. */
  private act(key: string, name: string, body: unknown, params: Record<string, string>, done: string, reload: () => void): void {
    if (!this.client || this.busyKey) {
      return;
    }
    this.busyKey = key;
    esfSubscribe(
      this.client.call(name, body, params),
      this.destroyRef,
      () => {
        this.busyKey = "";
        this.notify.emit({ tone: "success", message: "Settings applied" });
        reload();
      },
      (reason) => {
        this.busyKey = "";
        this.notify.emit({ tone: "error", message: reason });
        this.cd.markForCheck();
      }
    );
  }

  /** A list's read: its rows on the reply, its reason on failure (the rows already shown kept while it's read again). */
  private read<T>(name: string, parse: (reply: unknown) => T[], set: (l: Listed<T>) => void, current: Listed<T>): void {
    const client = this.client;
    if (!client) {
      return;
    }
    set({ ...current, loading: true, error: "" });
    esfSubscribe(
      client.call(name),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          set({ rows: parse(reply), loading: false, error: "" });
          this.cd.markForCheck();
        }
      },
      (reason) => {
        if (client === this.client) {
          set({ rows: [], loading: false, error: reason });
          this.cd.markForCheck();
        }
      }
    );
  }
}
