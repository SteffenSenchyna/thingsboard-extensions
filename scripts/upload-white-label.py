#!/usr/bin/env python3
"""
Save the white-labeling custom CSS (target/white-labeling/custom.css, built from
white-labeling/custom-css.scss) as the tenant's ThingsBoard white-labeling
"Custom CSS", leaving every other white-labeling setting as it is.

Credentials come from 1Password, as for load-extensions.py.
"""

import asyncio
import importlib.util
from pathlib import Path

import requests

CSS_PATH = Path("target/white-labeling/custom.css")

# load-extensions.py's 1Password and login helpers (its name has a hyphen, so load it by path).
_spec = importlib.util.spec_from_file_location("load_extensions", Path(__file__).with_name("load-extensions.py"))
load_extensions = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(load_extensions)


async def main():
  css = CSS_PATH.read_text()

  print("Retrieving credentials from 1Password...")
  username, password, base_url = await load_extensions.get_1password_secrets()
  print(f"Logging in to ThingsBoard at {base_url}...")
  token = load_extensions.login_to_thingsboard(base_url, username, password)
  headers = {"X-Authorization": f"Bearer {token}"}

  # The tenant's own white-labeling settings (not merged with the system's), to change only their custom CSS.
  response = requests.get(f"{base_url}/api/whiteLabel/currentWhiteLabelParams", headers=headers)
  response.raise_for_status()
  params = response.json()

  if (params.get("customCss") or "") == css:
    print("Custom CSS is already up to date.")
    return

  previous = len(params.get("customCss") or "")
  params["customCss"] = css
  response = requests.post(f"{base_url}/api/whiteLabel/whiteLabelParams", headers=headers, json=params)
  response.raise_for_status()
  saved = response.json().get("customCss") or ""
  if saved != css:
    raise RuntimeError("ThingsBoard saved a different custom CSS than the one sent.")
  print(f"✓ Custom CSS saved ({previous} → {len(css)} characters). Reload ThingsBoard to see it.")


if __name__ == "__main__":
  asyncio.run(main())
