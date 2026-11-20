# ESF through a ThingsBoard IoT Gateway Request connector

The ThingsBoard IoT Gateway runs on the Eurotech ESF unit itself (Everyware
Software Framework, Eurotech's Eclipse Kura), so in ThingsBoard **the unit is
the gateway's own device**. `request-connector.json` is the gateway's **ESF
connector**: a Request connector pointed at the unit's own REST APIs. It keeps
the unit's **twin** (its configuration, snapshots, cloud connections, inventory
and properties) as the gateway device's client attributes, and carries the
Gateways dashboard's calls: connector RPCs sent to the gateway's device, which
read what the twin doesn't hold and make every change.

Status: written from the ESF and gateway docs and the gateway's source
(`thingsboard_gateway/`, master). Not yet run against an ESF unit. See "To
verify on a unit" below.

## How a call reaches ESF

1. The dashboard sends a two-way RPC to the **gateway's device**, with method
   `request_<call>` (for example `request_esfGetConfig`).
2. The gateway treats a method starting with a connector type as a connector
   RPC. It hands it to its **first Request connector**, so a gateway runs the
   ESF connector as its only Request connector.
3. The Request connector makes the HTTP call the RPC's params describe:
   `requestUrlExpression`, `httpMethod`, `httpHeaders`, `timeout`,
   `responseTimeout`, and `requestValueExpression` (`${params.body}`, the body
   sent as JSON). It replies with ESF's JSON, or `{"error": "<reason> (code:
   <status>)"}`.

The dashboard takes each call's URL, method, headers and timeouts from the
connector's own `serverSideRpc` entry of that name. Those entries are only a
description of the calls; their `deviceNameFilter` is unused. Edit a call's URL
or timeouts there. The file is generated from the dashboard's call catalog
(`ESF_CALLS` in `src/app/gateway-management/models/esf.models.ts`), so the two
stay the same: change the catalog, then regenerate the file.

## The unit's twin

The connector's `mapping` polls the unit's REST APIs on the unit itself and
keeps what it reads in ThingsBoard, as Kapua keeps a Kura unit's configuration.
Each poll's values go to the gateway's own device as **client attributes**,
sent only when they changed (report strategy `ON_CHANGE`; everything again once
a day, `ttl` 86400 s, and after the gateway restarts):

| Attribute | What | Poll |
|---|---|---|
| `esf.cfg.<pid>` | a component's settings (`properties`, each `{type, value}`; passwords as ESF gives them, `"placeholder"`) | 60 s |
| `esf.def.<pid>` | a component's definition (the settings' names, types, choices) | 1 h |
| `esf.components` | the components' pids (what's there now: a deleted component's attributes stay) | 60 s |
| `esf.snapshots` | the snapshot ids (a new one with each configuration change made with a snapshot) | 30 s |
| `esf.cloud.endpoints`, `esf.cloud.pubsub` | the cloud connections with their state, their publishers and subscribers | 60 s |
| `esf.bundles` | the OSGi bundles | 5 min |
| `esf.props.framework`, `esf.props.kura` | the framework's and ESF's properties | 1 h |

ESF lists some things in another order on each read: the components with their
factories (`pidsWithFactory`) and the publishers and subscribers. The first
stays a live read; `esf.cloud.pubsub` (about 1 KB) is sent on every poll. The
framework's properties are mapped whole (`${$}`), with the `ts` the connector
adds, so they're sent every hour.

The configurations are read whole, one GET of about 320 KB on a ReliaGATE
10-14 with 54 components (its definitions about 250 KB of it, the largest
component's 39 KB; the settings 68 KB, the largest 9 KB), then sent one
attribute a component. The network and cloud APIs' component settings are the
same components', so `esf.cfg.<pid>` covers the Network and Cloud connections
views too.

- **The device:** the converter names it `currentThingsBoardGateway`, the
  gateway's reserved name for its own device: the gateway sends that data to
  `v1/devices/me`, the gateway device itself, so the same connector works on
  every unit. The gateway also connects a device of that name the first time,
  one for the whole tenant, which receives nothing else. A sub-device named as
  the gateway itself would take over the gateway's own session (ThingsBoard
  allows one session a device).
- **Not in the twin, read live:** network status (byte counters and Wi-Fi
  scans change on every read), the position, the components with their
  factories, the containers and images (ESF answers 500 while its Container
  Orchestration is off, which would log an error each poll), the system
  packages (148 KB), and the replies that are a bare JSON list (packages,
  users, keystores, permissions: the JSON converter makes one message of each
  list item).
- **In the dashboard:** `EsfClient` answers the reads the twin covers from
  the attributes, in ESF's own reply shapes, when the gateway's ESF connector
  carries these polls. Reads are then immediate, and work while the gateway
  is offline. A value not reported yet is read from the unit, and so is every
  read for 5.5 minutes after a change is sent, until every poll it shows in
  has run again.
- **The stray device:** remove its `Created` relation from the gateway that
  made it (the first unit with the twin), or it counts in that gateway's
  created devices and takes on its site, market and product line.
- **Desired state** (a change set through a shared attribute and applied by a
  rule chain's persistent RPC, so an offline unit gets it when it reconnects)
  is the next step, not built. The connector's own `attributeUpdates` isn't
  used for it: it applies only the first key of an update, sends no result
  back, has a 1 s default timeout, and drops changes made while the gateway
  was offline.

The polls are defined once, in `ESF_TWIN_POLLS`
(`src/app/gateway-management/models/esf-twin.models.ts`). `node
scripts/esf-connector.mjs` writes them into this file's `mapping`
(`--check` says whether it's up to date).

## The calls

The 65 calls, by the ESF permission each needs:

| Permission | ESF API | Calls |
|---|---|---|
| `rest.configuration` | Configuration v2 | list components (and each with its factory: the containers ESF itself runs), list the factories, make or delete a factory's instance (the Security view's SSL managers and keystores, the Drivers and assets view's drivers and assets, a snapshot taken), read / update a component's configuration, list snapshots, take a snapshot, roll back to one (from ESF 7.6.3 also `kura.admin`) |
| `rest.network.configuration` | Network Configuration v1 | list components, read / update a network component's configuration |
| `rest.network.status` | Network Status v1 | every interface's status |
| `rest.cloudconnection` | Cloud Connection v1 | list endpoints, publishers and subscribers, and the factories; connect, disconnect, is connected; a connection's stack components; read / update their settings; create and delete connections and publishers / subscribers |
| `rest.deploy` | Deploy v2 | list packages, install from a URL (or a file uploaded through the command service, from its `file:` path on the unit), uninstall |
| `rest.inventory` | Inventory v1 | bundles (start / stop), containers (start / stop), images (delete), system packages |
| `rest.keystores` | Keystores v1 | every keystore's certificates and keys (the Security view's Certificates), or one keystore's — read keystore by keystore when the whole read fails (ESF answers 500 for all while one keystore can't be opened: a PKCS11 module whose library isn't on the unit) |
| `rest.system` | System v1 | framework and ESF properties |
| `rest.position` | Position v1 | position, GNSS fix, GNSS time |
| `rest.tamper.detection` | Tamper Detection v1 | services, status, reset |
| `rest.security` | Security v2 | debug mode; reload the security policy / command line fingerprints |
| `rest.identity` | Identity v2 | users, defined permissions; create, update, delete a user |
| `rest.command` | Command v1 | run a command; carry an uploaded package to the unit, a piece a call (its zip in `zipBytes`) |
| `rest.assets` | Assets | assets, their channels (an asset's Data tab; the Drivers and assets table's channel counts); read, write |
| `rest.wires.admin` | WIRE-V1 | the kinds of Wire component (their factories, then their definitions: ports and settings), the Wire graph put whole (its topology and new components), deleted |

Not covered: adding or deleting a certificate (Keystores v1's writes), `rest.onboarding` (no REST API page for it
in ESF's documentation index), and applying a security policy. For an asset or tamper
call, the RPC's params also carry the path parameter (`asset`, `pid`, `name`).

### An update's body

```json
{
  "configs": [
    {
      "pid": "org.eclipse.kura.cloud.app.command.CommandCloudApp",
      "properties": {
        "command.enable": { "type": "BOOLEAN", "value": true },
        "command.timeout": { "type": "INTEGER", "value": 60 }
      }
    }
  ],
  "takeSnapshot": true
}
```

Each property carries its type: `STRING`, `LONG`, `DOUBLE`, `FLOAT`, `INTEGER`,
`BYTE`, `CHAR`, `BOOLEAN`, `SHORT` or `PASSWORD`, with arrays as JSON arrays.
Only the changed settings need sending; ESF keeps the rest. `takeSnapshot`
saves a rollback point on the unit. Rolling back (`POST
…/snapshots/byId/_rollback`, `{"id": <snapshot id>}`) needs `kura.admin` from
ESF 7.6.3: without it ESF answers 403, and the dashboard says so.

## In the Gateways dashboard

Every gateway's page (the "Details" button) has an **ESF** group in its menu,
under the ThingsBoard group, by Eurotech's logo:

- **No ESF connector yet:** "Add ESF connector" opens the add-connector panel
  started from this connector's configuration (`ESF_CONNECTOR_CONFIG` in
  `src/app/gateway-management/models/esf.models.ts`; keep the two the same).
  Check it, then add it.
- **With the connector:** each entry under ESF is a view:
  - **Configuration:** pick a component, edit its settings in the form built
    from ESF's own definition, then "Apply changes". Only the changed settings
    are sent, and ESF takes a snapshot after.
  - **Snapshots:** the unit's snapshots, newest first. "Take snapshot" saves the
    configuration as it is; a row's "Rollback" (confirmed) puts the whole
    configuration back to it.
  - **Network:** the interfaces' status; a row opens that interface's settings
    in a side panel laid out as ESF's own console's Network page: tabs by the
    interface's type (IPv4, IPv6, Wireless, 802.1x, DHCPv4 & NAT, Cellular,
    GPS, Antenna, Advanced, Hardware), the console's fields, labels and rules
    in each, one "Apply changes" over all of them (only the changed
    `net.interface.<id>.…` settings are sent). Not here, as they need calls
    the REST APIs don't have: the Wi-Fi network scan, the keystore pickers of
    802.1x (typed in instead), the DHCP leases list and Renew DHCP Lease.
    Under the interfaces, the firewall: one card, IPv4 | IPv6 and Open ports |
    Port forwarding | NAT in its title row, over a table of the rules.
    "Create new", or a row, opens the rule's form in a side panel (ESF's entry
    form's fields and checks); its "Add" / "Save" and Manage's "Delete (n)"
    change the draft, "Apply changes" sends it. A rule is Kura's string:
    fields separated by `,`, ending in `#`; rules separated by `;`.
  - **Cloud connections:** as ESF's Cloud Connections page: one table, each
    connection then its publishers and subscribers, marked by their type's
    icon (Service PID, Type, Status, Factory PID). A row opens its settings
    in a side panel (a connection's a tab per stack component: CloudService,
    DataService, MqttDataTransport, …), with a Manage card under its own
    settings: Connect / Disconnect and Delete. "Create new" makes a connection
    or a publisher / subscriber from the unit's factories; Manage deletes.
  - **Software:** a tab group across the top (Packages, Bundles, Containers,
    Images, System packages) shows one section at a time: deployment packages (install from a URL or a file, uninstall), bundles,
    containers and images, and the system packages on request. ESF lists
    containers and images only while its Container Orchestration service is
    on; off, its inventory answers both with a 500, so the view checks the
    service first and offers "Open in Configuration" to turn it on. The
    gateway's own container (`tb-gateway`) is never stopped from here.
  - **Status:** as ESF's Status page: Cloud Services (each connection's
    account, broker URL, client ID, status, user name), the Cellular /
    Ethernet / Wireless settings of each interface, the position, and tamper
    detection (reset).
  - **Device:** as ESF's Device page, a tab group across the top (Profile,
    Framework properties, ESF properties, Security): Device, Hardware, Software and
    Java Information, every framework and ESF property (a searchable name /
    value table each), debug
    mode and the fingerprint reloads. ESF's uptime isn't in its REST API.
  - **Users:** as ESF's Identities page: a table of the unit's users; a row
    opens the user in a side panel (password authentication, a password
    change at next login, a new password, its permissions ticked, Delete);
    "Create new" adds one there; Manage deletes.
  - **Command:** run a command, see its exit code and output.
  - **A package from a file:** ESF's own upload (Deploy v2 `_upload`) is a
    multipart POST of the file's bytes, which this connector can't send (gateway
    3.8.6 encodes a request's body as UTF-8 text). So the Software view sends the
    `.dp` through the command service instead: a folder under `/tmp`, then the file
    in 64 KB pieces, each a one-file zip in `zipBytes` (ESF unzips it into the
    working directory, then runs the command in a shell: `dd … seek=<n>
    conv=notrunc`), its size and SHA-256 checked, then `_install` with its `file:`
    URL. ESF moves the file into its packages folder; the folder is removed after.
    It needs the command service enabled (`command.enable`) and its password, and
    `rest.command` and `rest.deploy` on the gateway's ESF user.
  - **Assets:** an asset's channels, read them, write one.
  - **Wire graph:** the Wire Graph Service's graph drawn: each Wire component
    a box where ESF's Wires composer placed it (ESF's drawing enlarged 1.6×,
    boxes, places and its 20-unit grid alike, so it lines up with ESF's), each wire from an output port
    to an input port routed as ESF's (out, at 45°, in; rounded bends). A box's click shows that component's
    settings under the graph, across the view, as ESF's console does (an
    asset: its channels' table too, as in Drivers and assets) — every
    component's settings read once with the graph, and one Cancel | Apply for
    the graph and all the settings edited under it. A GraalVM™ Filter's script
    (and a Conditional's condition) is edited in ThingsBoard's script editor,
    with ESF's checks under it. With
    `rest.wires.admin` it's edited as the composer edits it: a palette of the
    kinds by ESF's names (Emitters, Receivers, Emitters and receivers — the
    WireAsset kind too) and of the assets not in the graph; a kind dragged
    onto the canvas (or clicked) is named in a dialog (a WireAsset given its
    driver), then placed where it was dropped, its
    settings shown at once from its kind's defaults and sent with the graph;
    boxes dragged in grid steps; wires drawn by clicking an output port, then
    an input port; a box or a wire picked, its delete popping up over it. "Apply changes" puts the whole graph in one call
    (`PUT …/wire/v1/graph/snapshot`, all or nothing: the topology and each new
    component by its `service.factoryPid` with its changed settings, a new
    asset with its `driver.pid`);
    ESF deletes a component taken out of the graph, but an asset, which stays
    in Drivers and assets (the Delete component confirm says which, so Apply
    asks nothing again). A Regex Filter's pattern is checked as Java reads
    it before Apply: one Java can't compile would filter nothing (ESF passes
    every envelope through), so the field says what's wrong and Apply waits.
    A valid pattern that matches none of the properties reaching the filter
    (a Timer's `TIMER`, an asset's channels) is warned of under the field;
    Apply goes ahead.
    Cancel drops the draft; Download and Delete graph
    under it. Without the
    permission the graph is read only and says why. Configuration leaves the
    Wire Graph Service and the graph's components out.

  Anything destructive (uninstall, stop, delete, disconnect, reset, rollback)
  asks first. The view you open reads first; the others are then read in the
  background, one at a time, and every view stays loaded while you're on the
  gateway, so moving between them shows them at once. Refresh, or an action,
  reads a view again.

The gateway has to be connected for any of this to work.

## Setting up the ESF unit

The config-management repository (`ab-na-wcan-rmx-performance-config-mgmt`) does
all of this with its `tbgw-esf-connector` playbook (roles `esf_credentials`, `esf_admin_password`, `esf_gateway_user`,
`esf_rest_auth` and `tb_gateway_esf_connector`); see its README. By hand:

1. **Turn on basic authentication for REST.** In ESF's REST service settings
   (`org.eclipse.kura.internal.rest.provider.RestService`), set "Basic
   Authentication Enabled" (`auth.basic.enabled`) to true. "Password
   Authentication Enabled" (`auth.password.enabled`) must stay true. From ESF
   7.5.0 basic auth is off by default, and the Request connector can only send
   basic auth.
2. **Create a dedicated identity**, `tb_gateway` (ESF identity names take no
   dashes; its credentials are in 1Password, `op://prd/esf tb-gateway`),
   with the
   permissions of the calls (the table above): `rest.configuration`,
   `rest.network.configuration`, `rest.network.status`, `rest.cloudconnection`,
   `rest.deploy`, `rest.inventory`, `rest.system`, `rest.position`,
   `rest.tamper.detection`, `rest.security`, `rest.identity`, `rest.command`,
   `rest.assets`, `rest.keystores` and `rest.wires.admin` (those the unit
   defines; without `rest.keystores` the Security view's Certificates says so;
   without `rest.wires.admin` the Wire graph is read only). Never give it `kura.admin`.
   Clear any forced password change on it, because that blocks password logins.
3. **Check the REST port.** The docs give both "443 and 4443" and "empty (all
   ports)" as the default for "Allowed Ports". The connector uses 443. Write
   `https://127.0.0.1:<port>` in `host` if ESF's REST service answers elsewhere.
4. **HTTPS certificate.** ESF's certificate names the unit, not `127.0.0.1`,
   and is usually self-signed, so `SSLVerify` stays `false`. The traffic never
   leaves the unit.

## The gateway's container

The gateway runs in Docker on the unit with `network_mode: host`: the container
shares the unit's network, so `127.0.0.1` is the unit itself, and the gateway
reaches ThingsBoard over the unit's own connection. Give the container the ESF
user's credentials, so ThingsBoard never stores them. The playbook writes them
into a `docker-compose.override.yml` beside the gateway's compose file, which
Compose merges in on every `up`:

```yaml
services:
  tb-gateway:
    environment:
      REQUEST_BASIC_USERNAME: "tb_gateway"
      REQUEST_BASIC_PASSWORD: "…"
```

The gateway (3.8.3 and later) reads them for every Request connector whose
`security.type` is `basic`, in place of the connector's `username` /
`password`, which are only the fallback, so the connector in ThingsBoard can
carry an empty password. The ESF connector needs **gateway 3.8.4 or later**:
that release added RPC to the Request connector (the dashboard's calls) and
made remote configuration work on self-provisioned gateways, so a connector
added from ThingsBoard reaches them at all (release notes; #2121, #2139).

Add the connector from ThingsBoard (the dashboard's "Add ESF connector", or
the playbook), not only in the gateway's own files: with remote configuration
on, the device's shared `active_connectors` list wins, and the gateway deletes
any connector it doesn't name from its `tb_gateway.json` when it reconnects.

The playbook's role carries a copy of `request-connector.json`
(`roles/tb_gateway_esf_connector/files/esf-request-connector.json`): copy it
there again when this file is regenerated.

## To verify on a unit

- The REST port, and the ESF version (whether basic auth is off by default).
- What the gateway hands back for a connector RPC: gateway 3.8 answers
  `[{"success": true, "result": <ESF's body>, "status": <ESF's HTTP status>}]`
  (seen on dev-inf-gw-01), `success` true even when ESF refused the call. The
  dashboard treats a status of 400 or more as a failure and shows ESF's
  reason; a 401 means ESF refused the gateway's login.
- What `PUT …/_update` returns on success: an empty body (verified, below).
- Verified on dev-inf-gw-01 (ESF 7.6.2, 18 November 2026): making a factory's instance (`esfCreateFactoryComponent`,
  `{ configs: [{ pid, factoryPid, properties: {} }], takeSnapshot: true }` — a Filesystem keystore, its defaults: its file
  `/tmp/keystore.ks`) and deleting it (`esfDeleteFactoryComponents`, `{ pids, takeSnapshot: true }`) each answer an empty body.
- Verified on dev-inf-gw-01 (ESF 7.6.2, 18 November 2026), Drivers and assets: a Modbus driver (`properties: {}`) and a Wire asset
  of it (`properties: { "driver.pid": { type: "STRING", value } }`) made; an update (`esfUpdateConfig`, only the settings
  changed — the asset's description, a channel's `T1#memory.address` and `T1#+enabled`, the driver's IP) keeps every setting it
  doesn't send, and one sending a channel's settings whole adds the channel; both deleted. Each answers an empty body.
  The Channels tab's "Create new" (every setting at ESF's default, under the new name, `+name` the name): two channels added
  to a throwaway asset with none, one shaped as another Modbus asset's channel, one as its own.
- Verified on dev-inf-gw-01 (19 November 2026), a channel deleted: an update merges with the asset's settings, so a channel
  left out stays; sent with each of its settings' values null, ESF drops them (Kura's `DTOUtil` keeps the null, its dictionary
  leaves it out) — a throwaway asset's X1 deleted, its X2 and its driver kept; the asset then deleted.
- The gateway version in use matches the source behaviour: connector RPCs to
  the first Request connector, `${params.body}` sent as JSON, the timeouts.

## Why not MQTT

ESF's MQTT request/response handlers (`$EDC/<account>/<client-id>/CONF-V2/...`)
use Kura protobuf payloads, with no JSON option in the docs. The gateway's MQTT
connector would need a custom protobuf converter in both directions.

## Sources

- ESF: `rest-service`, `configuration-v2-rest-apis-and-conf-v2-request-handler`,
  `mqtt-namespace`, `cloud-service`, `raw-mqtt-cloud-connection`, and the deploy,
  command, network and identity REST pages, under
  https://esf.eurotech.com/docs/.
- ThingsBoard IoT Gateway: https://thingsboard.io/docs/iot-gateway/config/request/,
  https://thingsboard.io/docs/iot-gateway/features/reserved-rpc/ and
  https://thingsboard.io/docs/iot-gateway/features/remote-configuration/.
- Gateway source (thingsboard/thingsboard-gateway, master):
  `connectors/request/request_connector.py`,
  `connectors/request/json_request_downlink_converter.py`,
  `gateway/entities/rpc_request.py`, `gateway/tb_gateway_service.py` and
  `tb_utility/tb_utility.py`.
