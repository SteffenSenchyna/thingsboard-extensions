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



import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnInit, Output, ViewChild, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, forkJoin, of } from "rxjs";
import { catchError, map, shareReplay, switchMap } from "rxjs/operators";
import { EntityType, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { DetailCardComponent, DetailRowComponent } from "../../../components/shared/detail-rows/detail-rows.component";
import { NamedAsset, loadOrganizationNames, siteLocationLabel } from "../../../components/shared/organization/site-locations";
import {
  DeviceContext,
  DeviceNote,
  DeviceRef,
  deviceNoteOf,
  loadMobileProfiles,
  placeDevice,
  readDevice,
  readDeviceContext,
  relinkGateway,
} from "../../../components/shared/organization/device-places";

/** One read of a device or an asset: as ThingsBoard holds it, and — a device — its place and gateways. */
interface EntityRead {
  entity: any;
  context: DeviceContext | null;
}
import { ManageActionComponent, ManageCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import { OrganizationNotices } from "../../../components/shared/organization/organization-store";
import { DEFAULT_PROFILE_ICON, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { PanelStop, PanelTrail } from "../../../components/shared/panel-trail/panel-trail";
import { QUIET_REQUEST, apiMessage } from "../../../components/shared/value-utils";
import { ENTITY_PANEL_TABS, ENTITY_TYPE_OF, EntityDraft, EntityKind, EntityOption, EntityRow, deleteEntities, entityNameOf } from "./entity-manager.models";
import { EntityDetailsFormComponent } from "./entity-details-form.component";

/**
 * A device's or an asset's side panel, as a profile's: Details alone — the
 * form (name, label, profile, owner, a device's Site, description), then a
 * device's place and gateways (`tb-detail-rows`: the gateway that created it,
 * the one serving it, a gateway's vehicles, a site it doesn't pick — each
 * device a link, the next stop on the trail) and its Manage card (Delete,
 * confirmed first). Over the form, a note when a device's name or gateway
 * disagrees with where it is (`tb-callout`, {@link deviceNoteOf}): the name
 * to rename it to or the Site to move it to — filled in, the form's Apply
 * saves them — or the gateway serving it to follow (confirmed first). Its
 * place is the backend's to derive: the panel only moves the relations
 * ({@link placeDevice}, {@link relinkGateway}). The Devices and Assets pages open it from a row
 * ({@link open}) or "Create new" ({@link openNew}); a profile's panel from its
 * Devices / Assets tab — then a stop on that page's {@link trail}, after the
 * profile's. It reads the kind's profiles and the customers (its pickers)
 * itself, and says what it saved or deleted ({@link saved}, {@link deleted})
 * for the page to read its list again.
 *
 * ```html
 * <tb-entity-panel #entityPanel [ctx]="ctx" [notices]="notices" [kind]="kind" (saved)="reload()" (deleted)="reload()"></tb-entity-panel>
 * ```
 */
@Component({
  selector: "tb-entity-panel",
  templateUrl: "./entity-panel.component.html",
  styleUrls: ["./entity-panel.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    EntityDetailPanelComponent,
    EntityDetailsFormComponent,
    ManageCardComponent,
    ManageActionComponent,
    ConfirmDialogComponent,
    DetailCardComponent,
    CalloutComponent,
    FoldComponent,
    DetailRowComponent,
  ],
})
export class EntityPanelComponent implements OnInit {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() ctx!: WidgetContext;
  /** Where it reports what it did (the dashboard's toasts). */
  @Input() notices: OrganizationNotices | null = null;
  /** What it shows: a device, or an asset (set as it's made). */
  @Input() kind: EntityKind = "device";
  /** The page's trail, when its panels lead to this one (a profile's tab): an entity's panel is a stop on it. */
  @Input() trail: PanelTrail | null = null;
  /** A device / asset created or saved. */
  @Output() saved = new EventEmitter<void>();
  /** A device / asset deleted (its id). */
  @Output() deleted = new EventEmitter<string>();

  readonly panelTabs = ENTITY_PANEL_TABS;
  isOpen = false;
  /** The one shown — null: a new one. */
  editing: EntityRow | null = null;
  /** The edited one as ThingsBoard holds it (its profile, owner and additional info): the form's start, and what a save keeps. */
  editingEntity: any = null;
  saving = false;
  /** Bumped on every open: the form resets. */
  resetKey = 0;
  /** The pickers: the kind's profiles, the owners (the tenant, then every customer). */
  profileOptions: EntityOption[] = [];
  ownerOptions: EntityOption[] = [];
  /** Delete, asked: the confirmation shows. */
  deleteAsked = false;
  /** A device's place and gateways, read with it (null: an asset, a new one, or still read). */
  context: DeviceContext | null = null;
  /** What its name or gateway disagrees with — the callout over the form (null: they agree). */
  note: DeviceNote | null = null;
  /** The note's Site to move to, as it reads ("Richmond Lab (4R20)"). */
  noteSiteText = "";
  /** The facts card's rows: a label, and the device it names (a link) or a text. */
  facts: { label: string; device: DeviceRef | null; text: string }[] = [];
  /** The Site field's options ("None" first, then the Sites by label and code). */
  siteOptions: EntityOption[] = [];
  /** Follow, asked: the confirmation shows. */
  followAsked = false;
  /** The Organization's Sites (by code, lower case) and the tenant's mobile profiles — read once, a device's context waits for them. */
  private places$: Observable<{ sites: NamedAsset[]; mobile: string[] }> | null = null;
  private siteByCode = new Map<string, NamedAsset>();
  private siteIds = new Set<string>();
  /** The Details form: the note fills its fields. */
  @ViewChild(EntityDetailsFormComponent) private form?: EntityDetailsFormComponent;
  /** Those deleted here: their stops leave the trail. */
  private readonly gone = new Set<string>();
  /** Each one's latest (a save renames it): its stop's name, and what it opens again. */
  private readonly latest = new Map<string, EntityRow>();
  /** What was read of each one shown (as ThingsBoard holds it; a device's context): opened again, it shows at once. */
  private readonly reads = new Map<string, EntityRead>();

  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  get noun(): string {
    return this.kind === "device" ? "device" : "asset";
  }

  /** The one shown, while the panel's open (a table's row lit). */
  get openId(): string | null {
    return this.isOpen && this.editing ? this.editing.id : null;
  }

  /** The panel's header: its profile's icon (a new one: the kind's). */
  get panelIcon(): string {
    return this.editing ? profileIconsOf(this.ctx).of(this.kind, this.editing.profile) : DEFAULT_PROFILE_ICON[this.kind];
  }

  get panelName(): string {
    return this.editing ? entityNameOf(this.editing) : `New ${this.noun}`;
  }

  get panelSubtitle(): string {
    return this.editing ? `${this.editing.profile}${this.editing.site ? " · " + this.editing.site : ""}` : "";
  }

  /** A device's Site field: always (while it's read, "Loading…" as the other fields — nothing pops in once its place is). */
  get showSite(): boolean {
    return this.kind === "device";
  }

  /** Its site isn't its own to pick: a device a gateway created follows the gateway; one in a truck or a room, where that is. */
  get siteLocked(): boolean {
    return !!this.context && (this.context.place.created || this.context.siteViaOther);
  }

  /**
   * The Site field's value: the Site that holds it — locked, the site it's at — as read; before that, the row's (its stored site's code:
   * "" none), so the field shows it at once; null while neither knows.
   */
  get editingSiteId(): string | null {
    const c = this.context;
    if (c) {
      return this.siteLocked ? (this.siteByCode.get(c.place.site.toLowerCase())?.id ?? "") : (c.siteId ?? "");
    }
    if (!this.editing || !this.siteIds.size) {
      return this.editing ? null : "";
    }
    const code = this.editing.site;
    return code ? (this.siteByCode.get(code.toLowerCase())?.id ?? null) : "";
  }

  get followHeading(): string {
    return this.note?.follow ? `Follow ${this.note.follow.name}?` : "";
  }

  get followMessage(): string {
    return this.editing && this.note?.follow ? `${entityNameOf(this.editing)} goes where ${this.note.follow.name} is from now on.` : "";
  }


  /**
   * The form's owner: the edited one's customer, else the tenant — as read; before that, the row's (its owner's title: a customer's by
   * it, else the tenant's own), so the field shows it at once; null while neither knows (the field says "Loading…").
   */
  get editingOwnerId(): string | null {
    if (this.editingEntity) {
      return this.editingEntity.ownerId?.entityType === "CUSTOMER" ? this.editingEntity.ownerId.id : "";
    }
    const owner = this.editing?.owner ?? "";
    if (!owner || this.ownerOptions.length < 2) {
      return null;
    }
    return this.ownerOptions.find((o) => o.value && o.label === owner)?.value ?? "";
  }

  /** The form's profile: as read; before that, the row's (by its name) — null while neither knows. */
  get editingProfileId(): string | null {
    if (this.editingEntity) {
      return (this.kind === "device" ? this.editingEntity.deviceProfileId?.id : this.editingEntity.assetProfileId?.id) ?? "";
    }
    const name = this.editing?.profile ?? "";
    return (name && this.profileOptions.find((o) => o.label === name)?.value) || null;
  }

  get deleteHeading(): string {
    return this.editing ? `Delete ${this.noun} ${entityNameOf(this.editing)}?` : "";
  }

  get deleteMessage(): string {
    return `This deletes it from ThingsBoard for good, with ${
      this.kind === "device" ? "its telemetry, attributes, credentials" : "its telemetry, attributes"
    } and relations. It can't be undone.`;
  }

  ngOnInit(): void {
    this.trail?.join(this, () => this.close());
    // The profiles' icons coming in: the panel's header shows them.
    profileIconsOf(this.ctx)
      .changes.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cd.detectChanges());
    this.loadProfiles();
    this.loadOwners();
    if (this.kind === "device") {
      this.places$ = forkJoin({
        sites: loadOrganizationNames(this.ctx).pipe(
          map((n) => n.sites),
          catchError(() => of([] as NamedAsset[]))
        ),
        mobile: loadMobileProfiles(this.ctx),
      }).pipe(shareReplay(1));
      this.places$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ sites }) => {
        this.siteByCode = new Map(sites.map((x) => [x.code.toLowerCase(), x]));
        this.siteIds = new Set(sites.map((x) => x.id));
        this.siteOptions = [
          { value: "", label: "None" },
          ...[...sites].sort((a, b) => siteLocationLabel(a).localeCompare(siteLocationLabel(b))).map((x) => ({ value: x.id, label: siteLocationLabel(x) })),
        ];
        this.cd.detectChanges();
      });
    }
  }

  /** "Create new": a blank form (no stop — a trail it's on ends). */
  openNew(): void {
    this.trail?.reset(this);
    this.editing = null;
    this.editingEntity = null;
    this.setContext(null);
    this.resetKey++;
    this.isOpen = true;
  }

  /** A device / asset: its panel — a stop on the trail, when there's one — its form starting once it's read. */
  open(row: EntityRow): void {
    const shown = this.latest.get(row.id) ?? row;
    this.trail?.visit(this, this.stopOf(shown));
    // One read before (a stop opened again, from the trail): it shows at once — no "Loading…" — and is read afresh behind it.
    const known = this.reads.get(shown.id) ?? null;
    this.editing = shown;
    this.editingEntity = known?.entity ?? null;
    this.setContext(known?.context ?? null);
    this.resetKey++;
    this.isOpen = true;
    this.read(shown, !!known);
  }

  /**
   * The one shown as ThingsBoard holds it — a device with its place and gateways, read together (the form starts once both are in,
   * its Site among them) — kept for when it's opened again. Read again over what's shown (`quiet`): a failure leaves it as it was.
   */
  private read(shown: EntityRow, quiet: boolean): void {
    // (Typed first: a pipe on a device-or-asset union doesn't resolve.)
    const entity$: Observable<any> = this.kind === "device" ? this.ctx.deviceService.getDevice(shown.id, QUIET_REQUEST) : this.ctx.assetService.getAsset(shown.id, QUIET_REQUEST);
    const read$: Observable<EntityRead | null> =
      this.kind === "device" && this.places$
        ? this.places$.pipe(switchMap(({ mobile }) => readDevice(this.ctx, shown.id, this.siteIds, mobile)))
        : entity$.pipe(map((entity) => ({ entity, context: null })));
    read$
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((r) => {
        // Kept even when another stop is shown by now (moved on before it came in): opened again, it shows at once.
        if (r?.entity) {
          this.reads.set(shown.id, r);
        }
        if (this.editing?.id !== shown.id) {
          return;
        }
        if (!r?.entity) {
          if (!quiet) {
            this.notices?.error(`Couldn't read the ${shown.kind === "device" ? "device" : "asset"}.`);
          }
          return;
        }
        this.setContext(r.context);
        this.editingEntity = r.entity;
        this.cd.detectChanges();
      });
  }

  /** A device the facts card names: its panel in this one's place — the trail's next stop. */
  openDevice(d: DeviceRef): void {
    this.open({ id: d.id, kind: "device", name: d.name, label: d.label, profile: d.profile, owner: d.owner, site: d.site, active: null, createdTime: null, created: "", description: "" });
  }

  /** The note's rename: the name in the Name field (Apply saves it). */
  useName(name: string): void {
    this.form?.setName(name);
  }

  /** The note's Site: in the Site field (Apply moves it). */
  useSite(siteId: string): void {
    this.form?.setSite(siteId);
  }

  /** Follow, confirmed: its Created relation moved to the gateway serving it — it goes where that gateway is. */
  confirmFollow(): void {
    this.followAsked = false;
    const row = this.editing;
    const to = this.note?.follow;
    if (!row || !to) {
      return;
    }
    this.saving = true;
    relinkGateway(this.ctx, row.id, this.context?.creator?.id ?? null, to.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.notices?.success("Device linked to its gateway");
          this.saved.emit();
          this.readAgain(row.id);
        },
        error: (err) => {
          this.saving = false;
          this.notices?.error(`Couldn't link the device to its gateway${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  close(): void {
    this.isOpen = false;
  }

  /** Details' Create / Apply: a new device / asset, or the edited one — and its owner, when it changed. */
  save(draft: EntityDraft): void {
    const kind = this.kind;
    const editing = this.editing;
    const before = this.editingEntity;
    const profileId = kind === "device" ? { entityType: EntityType.DEVICE_PROFILE, id: draft.profileId } : { entityType: EntityType.ASSET_PROFILE, id: draft.profileId };
    const body: any = {
      ...(before ?? {}),
      name: draft.name,
      label: draft.label,
      ...(kind === "device" ? { deviceProfileId: profileId } : { assetProfileId: profileId }),
      additionalInfo: { ...(before?.additionalInfo ?? {}), description: draft.description },
    };
    delete body.type; // the profile id names it
    this.saving = true;
    const save$: Observable<any> = kind === "device" ? this.ctx.deviceService.saveDevice(body, QUIET_REQUEST) : this.ctx.assetService.saveAsset(body, QUIET_REQUEST);
    save$
      .pipe(
        switchMap((saved) => this.moveOwner(kind, saved.id.id, draft.ownerId, before).pipe(map(() => saved))),
        // A device's Site, when it changed: the relations moved — the backend derives its place.
        switchMap((saved) => this.moveSite(saved.id.id, draft.siteId).pipe(map(() => saved))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (saved) => {
          this.saving = false;
          this.notices?.success(`${this.kind === "device" ? "Device" : "Asset"} ${editing ? "saved" : "created"}`);
          if (editing) {
            const profile = this.profileOptions.find((p) => p.value === draft.profileId)?.label ?? editing.profile;
            this.editingEntity = saved;
            this.editing = { ...editing, name: draft.name, label: draft.label, profile, description: draft.description };
            this.latest.set(editing.id, this.editing);
            this.reads.set(editing.id, { entity: saved, context: this.context });
            // Its place and its note again: a rename or a move may have settled it.
            this.readAgain(editing.id);
          } else {
            this.close();
          }
          this.saved.emit();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.notices?.error(/already exists/i.test(msg) ? `A ${this.noun} named ${draft.name} already exists.` : `Couldn't ${editing ? "save" : "create"} the ${this.noun}${msg}`);
          this.cd.detectChanges();
        },
      });
  }

  /** Manage's Delete, confirmed: ThingsBoard deletes it, the panel closes. */
  confirmDelete(): void {
    const row = this.editing;
    this.deleteAsked = false;
    if (!row) {
      return;
    }
    this.saving = true;
    deleteEntities(this.ctx, [row])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([done]) => {
        this.saving = false;
        if (done) {
          this.notices?.success(`${row.kind === "device" ? "Device" : "Asset"} deleted`);
          this.gone.add(row.id);
          this.reads.delete(row.id);
          if (this.editing?.id === row.id) {
            this.close();
          }
          this.deleted.emit(row.id);
        } else {
          this.notices?.error(`Couldn't delete the ${row.kind === "device" ? "device" : "asset"}.`);
        }
        this.cd.detectChanges();
      });
  }

  /** A device's place and gateways (none for an asset), once the Sites and the mobile profiles are in. */
  private contextOf(entity: any): Observable<DeviceContext | null> {
    if (this.kind !== "device" || !this.places$) {
      return of(null);
    }
    return this.places$.pipe(
      switchMap(({ mobile }) => readDeviceContext(this.ctx, entity, this.siteIds, mobile)),
      catchError(() => of(null))
    );
  }

  /** Its context read again (after a save or a follow), its note and facts with it — the form keeps what it holds. */
  private readAgain(id: string): void {
    const entity = this.editingEntity;
    if (!entity || this.kind !== "device") {
      this.cd.detectChanges();
      return;
    }
    this.contextOf(entity)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((context) => {
        if (this.editing?.id === id) {
          this.reads.set(id, { entity, context });
          this.setContext(context);
          this.cd.detectChanges();
        }
      });
  }

  /** The device's context: its note (the callout) and its facts (the card's rows), worked out once. */
  private setContext(context: DeviceContext | null): void {
    this.context = context;
    const row = this.editing;
    const siteText = (code: string) => {
      const site = this.siteByCode.get(code.toLowerCase());
      return site ? siteLocationLabel(site) : code;
    };
    this.note = context && row ? deviceNoteOf({ id: row.id, name: this.editingEntity?.name ?? row.name }, context, this.siteByCode, siteText) : null;
    const moveTo = this.note?.moveTo;
    this.noteSiteText = moveTo ? siteText([...this.siteByCode.values()].find((x) => x.id === moveTo)?.code ?? "") : "";
    const facts: { label: string; device: DeviceRef | null; text: string }[] = [];
    if (context) {
      const p = context.place;
      if (p.created) {
        facts.push({ label: "Gateway", device: context.creator, text: p.gateway || "—" });
      }
      if (context.servedBy && context.servedBy.id !== context.creator?.id) {
        facts.push({ label: "Served by", device: context.servedBy, text: "" });
      }
      const vehicles = [...context.vehicles];
      if (context.namedVehicle && row && context.namedVehicleGatewayId === row.id && !vehicles.some((v) => v.id === context.namedVehicle?.id)) {
        vehicles.push(context.namedVehicle);
      }
      vehicles.forEach((v) => facts.push({ label: "Vehicle", device: v, text: "" }));
    }
    this.facts = facts;
  }

  /** A device's Site to the one picked ("" none; absent: not picked here) — when it changed. */
  private moveSite(id: string, siteId: string | undefined): Observable<unknown> {
    if (this.kind !== "device" || siteId === undefined || siteId === (this.editing ? this.editingSiteId : "")) {
      return of(null);
    }
    return placeDevice(this.ctx, id, siteId || null, this.siteIds);
  }

  /** Its stop on the trail: its profile's icon, "Device · <name>" in the strip's bubble — gone once deleted here. */
  private stopOf(row: EntityRow): PanelStop {
    const icons = profileIconsOf(this.ctx);
    const kind = this.kind;
    const latest = () => this.latest.get(row.id) ?? row;
    return {
      key: `${kind}:${row.id}`,
      get icon() {
        return icons.of(kind, latest().profile);
      },
      kind: kind === "device" ? "Device" : "Asset",
      label: () => (this.gone.has(row.id) ? null : entityNameOf(latest())),
      isOpen: () => this.isOpen && this.editing?.id === row.id,
      open: () => this.open(latest()),
      close: () => this.close(),
    };
  }

  /** The kind's profiles (read once): the form's picker. */
  private loadProfiles(): void {
    const path = this.kind === "device" ? "/api/deviceProfileInfos" : "/api/assetProfileInfos";
    this.ctx.http
      .get<{ data: { id: { id: string }; name: string }[] }>(`${path}?pageSize=1000&page=0&sortProperty=name&sortOrder=ASC`, defaultHttpOptionsFromConfig(QUIET_REQUEST))
      .pipe(
        map((res) => (res?.data ?? []).map((p) => ({ value: p.id.id, label: p.name }))),
        catchError(() => of([] as EntityOption[])),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((list) => {
        this.profileOptions = list;
        this.cd.detectChanges();
      });
  }

  /** The owners the form can pick: the tenant, then every customer. */
  private loadOwners(): void {
    this.ctx.http
      .get<{ data: { id: { id: string }; title: string }[] }>("/api/customers?pageSize=1000&page=0&sortProperty=title&sortOrder=ASC", defaultHttpOptionsFromConfig(QUIET_REQUEST))
      .pipe(
        catchError(() => of({ data: [] as { id: { id: string }; title: string }[] })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        this.ownerOptions = [{ value: "", label: "Tenant (no customer)" }, ...(res?.data ?? []).map((c) => ({ value: c.id.id, label: c.title }))];
        this.cd.detectChanges();
      });
  }

  /** The entity to this owner (ThingsBoard PE) — when it isn't its owner already. */
  private moveOwner(kind: EntityKind, id: string, ownerId: string, before: any): Observable<unknown> {
    // A new one is the tenant's; an edited one, its customer's or the tenant's.
    const current = before?.ownerId?.entityType === "CUSTOMER" ? String(before.ownerId.id) : "";
    if (ownerId === current) {
      return of(null);
    }
    const tenantId = this.ctx.currentUser?.tenantId ?? before?.tenantId?.id;
    const url = ownerId ? `/api/owner/CUSTOMER/${ownerId}/${ENTITY_TYPE_OF[kind]}/${id}` : `/api/owner/TENANT/${tenantId}/${ENTITY_TYPE_OF[kind]}/${id}`;
    return this.ctx.http.post(url, [], defaultHttpOptionsFromConfig(QUIET_REQUEST));
  }
}
