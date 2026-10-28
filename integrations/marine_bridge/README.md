# Marine bridge

Forwards live AIS reports for the fleet's tugboats from [aisstream.io](https://aisstream.io)
into ThingsBoard through the MQTT gateway API, so the marine dashboard shows
each vessel's position, speed, course, heading and navigational status.

## How it works

1. On start-up the container reads `OP_SERVICE_ACCOUNT_TOKEN` and resolves two
   secrets from 1Password:
   - `op://thingsboard/marine-bridge/credential` — the aisstream.io API key
   - `op://thingsboard/marine-bridge/gw_token` — the ThingsBoard gateway device token
2. It connects to ThingsBoard over plain MQTT on port 1883 at
   `thingsboard-prd.taile61f39.ts.net`, which is only reachable on the tailnet.
3. It subscribes to aisstream.io for the MMSIs listed in `VESSELS` and forwards
   every message for them:

| AIS message      | Published as                  | Keys                                                        |
|------------------|-------------------------------|-------------------------------------------------------------|
| `PositionReport` | telemetry (`v1/gateway/telemetry`) | `latitude`, `longitude`, `sog`, `cog`, `heading`, `navStatus` |
| `ShipStaticData` | client attributes (`v1/gateway/attributes`) | `shipName`, `mmsi`, `imo`, `callSign`, `shipType`, `destination`, `eta`, `maxDraught`, `length`, `beam` |

The ThingsBoard device name is the vessel's SAP unit number (for example
`10160524E`), so each MMSI is mapped to it in the script. `sog` is speed over
ground in knots, `cog` is course over ground in degrees true, `heading` is true
heading in degrees, and `navStatus` is the AIS navigational status code (0–15).
No timestamp is sent; ThingsBoard stamps values on arrival.

If the connection to aisstream.io drops the bridge reconnects after five seconds.

## Prerequisites

- Docker Engine 24+ with the Compose plugin (`docker compose`).
- The host must be a member of the tailnet, so that
  `thingsboard-prd.taile61f39.ts.net:1883` resolves and is reachable. Check with:

  ```bash
  nc -zv thingsboard-prd.taile61f39.ts.net 1883
  ```

- A 1Password service account token with **read** access to the `thingsboard`
  vault. Create it under 1Password → Developer → Service Accounts and grant it
  the `thingsboard` vault only.
- A ThingsBoard gateway device whose access token is stored in the
  `marine-bridge` item's `gw_token` field. The tugboat devices
  (`10160524E`, `10128770E`, `10128706E`) must already exist; the gateway only
  publishes to them.

## Deploy

All commands run from this folder.

1. Provide the service account token. Nothing else is configured through the
   environment.

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set `OP_SERVICE_ACCOUNT_TOKEN`. The file is git-ignored.

2. Build and start the container.

   ```bash
   docker compose up -d --build
   ```

3. Check that it is receiving reports. Each forwarded message is logged with
   the MMSI, the device name and the vessel label:

   ```bash
   docker compose logs -f
   ```

   A healthy start looks like:

   ```
   stream: {'Message': {'CompressionEnabled': True}, 'MessageType': 'SubscriptionConfirmation'}
   PositionReport 316001731 -> 10128770E [Alison Nicole E]
   ShipStaticData 316003982 -> 10160524E [Kaymar E]
   ```

   Reports arrive every few seconds for a moving tug and every few minutes for a
   moored one, so a quiet log for a couple of minutes is normal.

The container restarts automatically on failure and after a host reboot
(`restart: unless-stopped`). Logs are capped at three files of 10 MB.

## Add or change a vessel

Edit the `VESSELS` map in `marine_bridge.py`. Each entry is the vessel's MMSI
mapped to its ThingsBoard device name and its label:

```python
VESSELS = {
  "316003982": ("10160524E", "Kaymar E"),
}
```

Then rebuild and restart:

```bash
docker compose up -d --build
```

## Operations

| Task                 | Command                                   |
|----------------------|-------------------------------------------|
| Stop                 | `docker compose down`                     |
| Restart              | `docker compose restart`                  |
| Update after a change| `docker compose up -d --build`            |
| Rotate a secret      | Change it in 1Password, then `docker compose restart` |

Rotating the aisstream key or the gateway token needs no rebuild, since both
are read from 1Password at start-up.

## Networking notes

The compose file uses `network_mode: host` so the container uses the host's
Tailscale interface and MagicDNS directly. If host networking is not available
(for example on some Docker Desktop setups), use a bridged network and point
the container's DNS at Tailscale instead:

```yaml
    # replace `network_mode: host` with:
    dns:
      - 100.100.100.100
```

The host must still be on the tailnet. Alternatively run a Tailscale sidecar
container and join the bridge to its network namespace.

## Troubleshooting

| Symptom                                   | Cause / fix                                                                 |
|-------------------------------------------|-----------------------------------------------------------------------------|
| `OP_SERVICE_ACCOUNT_TOKEN environment variable not set` | `.env` missing or empty; see Deploy step 1.                     |
| 1Password authentication error at start   | Token revoked or lacks access to the `thingsboard` vault.                   |
| `TimeoutError: timed out` on MQTT connect | Host is not on the tailnet, or port 1883 is blocked. Check with `nc -zv`.   |
| MQTT connects but devices show nothing    | Gateway token wrong, or the device names in `VESSELS` don't match ThingsBoard. |
| Only `SubscriptionConfirmation` is logged | Normal until a listed vessel transmits; verify the MMSIs if it stays quiet.  |
| `reconnect: …` repeating                  | aisstream.io rejected the subscription (bad API key) or the network dropped. |

## Security

- No secret is baked into the image or stored in the repository. The only
  secret on the host is the 1Password service account token in `.env`.
- The container runs as an unprivileged user and opens no listening ports.
- Grant the service account the `thingsboard` vault only.
