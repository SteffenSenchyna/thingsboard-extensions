#!/usr/bin/env python3
"""
Bridge AIS position reports from aisstream.io into ThingsBoard via the MQTT
gateway API. Secrets come from 1Password (OP_SERVICE_ACCOUNT_TOKEN in .env).
"""

import asyncio, json, os, websockets, paho.mqtt.client as mqtt
from onepassword.client import Client

TB_HOST = "iota.prd.cfops.biz"
OP_AIS_KEY = "op://thingsboard/marine-bridge/credential"
OP_GATEWAY_TOKEN = "op://thingsboard/marine-bridge/gw_token"

# AIS MMSI -> ThingsBoard device name (the vessel's SAP unit number).
VESSELS = {
  "316003982": "10160524E",  # KAYMAR
  "316001731": "10128770E",  # ALISON NICOLE 1
  "316005416": "10128706E",  # JOSE NARVAEZ
}


async def get_1password_secrets():
  """Resolve the AIS key and gateway token from 1Password."""
  token = os.getenv("OP_SERVICE_ACCOUNT_TOKEN")
  if not token:
    raise ValueError("OP_SERVICE_ACCOUNT_TOKEN environment variable not set")
  client = await Client.authenticate(
    auth=token.strip(),
    integration_name="production",
    integration_version="v1.0.0",
  )
  ais_key = await client.secrets.resolve(OP_AIS_KEY)
  gateway_token = await client.secrets.resolve(OP_GATEWAY_TOKEN)
  return ais_key.strip(), gateway_token.strip()


def connect_gateway(gateway_token):
  m = mqtt.Client()
  m.username_pw_set(gateway_token)
  m.tls_set()
  m.connect(TB_HOST, 8883)
  m.loop_start()
  return m


async def run():
  ais_key, gateway_token = await get_1password_secrets()
  m = connect_gateway(gateway_token)
  while True:
    try:
      async with websockets.connect("wss://stream.aisstream.io/v0/stream") as ws:
        await ws.send(json.dumps({
          "APIKey": ais_key,
          "BoundingBoxes": [[[-90, -180], [90, 180]]],
          "FiltersShipMMSI": list(VESSELS),
          "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
        }))
        async for raw in ws:
          msg = json.loads(raw)
          meta = msg["MetaData"]
          device = VESSELS.get(str(meta["MMSI"]))
          if not device:
            continue
          m.publish("v1/gateway/connect", json.dumps({"device": device}))
          if msg["MessageType"] == "PositionReport":
            p = msg["Message"]["PositionReport"]
            # No "ts": ThingsBoard stamps the values on arrival.
            m.publish("v1/gateway/telemetry", json.dumps({device: [{
              "latitude": p["Latitude"], "longitude": p["Longitude"],
              "sog": p["Sog"], "cog": p["Cog"], "heading": p["TrueHeading"],
              "navStatus": p["NavigationalStatus"],
            }]}))
          else:
            s = msg["Message"]["ShipStaticData"]
            e = s["Eta"]
            m.publish("v1/gateway/attributes", json.dumps({device: {
              "shipName": meta["ShipName"].strip(),
              "mmsi": meta["MMSI"], "imo": s["ImoNumber"], "callSign": s["CallSign"],
              "shipType": s["Type"], "destination": s["Destination"].strip(),
              "eta": f'{e["Month"]:02d}-{e["Day"]:02d} {e["Hour"]:02d}:{e["Minute"]:02d}',
              "maxDraught": s["MaximumStaticDraught"],
              "length": s["Dimension"]["A"] + s["Dimension"]["B"],
              "beam": s["Dimension"]["C"] + s["Dimension"]["D"],
            }}))
    except Exception as ex:
      print("reconnect:", ex)
      await asyncio.sleep(5)


if __name__ == "__main__":
  asyncio.run(run())
