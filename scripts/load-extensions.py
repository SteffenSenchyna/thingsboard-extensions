#!/usr/bin/env python3
"""
Upload ThingsBoard JS Extension Module using 1Password for credentials
"""

import asyncio
import os
import requests
import base64
from onepassword.client import Client


async def get_1password_secrets():
  """Retrieve credentials from 1Password using async client"""
  token = os.getenv("OP_SERVICE_ACCOUNT_TOKEN")

  if not token:
    raise ValueError("OP_SERVICE_ACCOUNT_TOKEN environment variable not set")

  # Remove any whitespace or newlines
  token = token.strip()

  try:
    # Connect to 1Password
    client = await Client.authenticate(
      auth=token,
      integration_name="production",
      integration_version="v1.0.0"
    )

    # Retrieve secrets
    username = await client.secrets.resolve("op://thingsboard/prd-service-account/username")
    password = await client.secrets.resolve("op://thingsboard/prd-service-account/credential")
    url = await client.secrets.resolve("op://thingsboard/prd-service-account/url")

    return username, password, url
  except Exception as e:
    print(f"1Password authentication failed: {e}")
    raise


def login_to_thingsboard(base_url, username, password):
  """Login to ThingsBoard and get JWT token"""
  login_url = f"{base_url}/api/auth/login"

  payload = {
    "username": username,
    "password": password
  }

  response = requests.post(login_url, json=payload)
  response.raise_for_status()

  data = response.json()
  return data['token']


def get_all_extension_modules(base_url, token):
  """Get all JS_MODULE EXTENSION resources from ThingsBoard"""
  all_resources = []
  page = 0
  page_size = 100

  headers = {
    "X-Authorization": f"Bearer {token}"
  }

  while True:
    list_url = f"{base_url}/api/resource?pageSize={page_size}&page={page}&resourceType=JS_MODULE&resourceSubType=EXTENSION"

    try:
      response = requests.get(list_url, headers=headers)
      response.raise_for_status()
      result = response.json()

      data = result.get('data', [])
      all_resources.extend(data)

      # Check if there are more pages
      if not result.get('hasNext', False):
        break

      page += 1
    except Exception as e:
      print(f"Error fetching extension modules: {e}")
      break

  return all_resources


def check_existing_resource(base_url, token, resource_key):
  """Check if a resource with the given key already exists"""
  print(f"Searching for extension module with key: '{resource_key}'")

  resources = get_all_extension_modules(base_url, token)

  print(f"Found {len(resources)} extension module(s):")
  for resource in resources:
    current_key = resource.get('resourceKey')
    title = resource.get('title')
    file_name = resource.get('fileName')
    tenant_id = resource.get('tenantId', {}).get('id')
    print(f"  - Key: '{current_key}' | Title: '{title}' | File: '{file_name}' | Tenant: {tenant_id}")

    if current_key == resource_key:
      resource_id = resource.get('id', {}).get('id')
      print(f"  ✓ MATCH FOUND - Will update resource ID: {resource_id}")
      return resource_id, resource

  print(f"✗ No existing extension module found with key: '{resource_key}'")
  return None, None


def upload_js_resource(base_url, token, file_path):
  """Upload JS resource module to ThingsBoard"""
  upload_url = f"{base_url}/api/resource"

  headers = {
    "X-Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
  }

  # Read the JS file and encode as base64
  with open(file_path, 'rb') as f:
    js_content = f.read()

  base64_content = base64.b64encode(js_content).decode('utf-8')
  filename = os.path.basename(file_path)
  # Resource key is the filename (with .js extension)
  resource_key = filename

  existing_id, existing_resource = check_existing_resource(base_url, token, resource_key)

  # Prepare the resource payload
  payload = {
    "title": filename.replace('.js', ''),  # Title without .js extension
    "resourceType": "JS_MODULE",
    "resourceSubType": "EXTENSION",
    "resourceKey": resource_key,  # Use filename as resource key
    "data": base64_content,
    "fileName": filename
  }

  # If updating existing resource, include the ID and preserve tenant
  if existing_id:
    print(f"\n→ Updating existing resource")
    print(f"  ID: {existing_id}")
    payload["id"] = {
      "id": existing_id,
      "entityType": "TB_RESOURCE"
    }
    # Preserve the tenant ID
    if existing_resource and existing_resource.get('tenantId'):
      payload["tenantId"] = existing_resource.get('tenantId')
  else:
    print(f"\n→ Creating new resource with key: '{resource_key}'")

  try:
    response = requests.post(upload_url, headers=headers, json=payload)

    # Print response details for debugging
    print(f"\nResponse Status: {response.status_code}")
    if response.status_code != 200:
      print(f"Response Body: {response.text}")

    response.raise_for_status()
    return response.json()
  except requests.exceptions.HTTPError as e:
    print(f"HTTP Error: {e}")
    print(f"Response content: {response.text if response else 'No response'}")
    raise


async def main():
  # Configuration
  js_file_path = "target/generated-resources/thingsboard-extension-widgets.js"

  try:
    # Get credentials from 1Password
    print("=" * 70)
    print("ThingsBoard Extension Module Upload")
    print("=" * 70)
    print("\nRetrieving credentials from 1Password...")
    username, password, base_url = await get_1password_secrets()

    print(f"Logging in to ThingsBoard at {base_url}...")
    token = login_to_thingsboard(base_url, username, password)
    print("✓ Login successful!\n")

    print(f"File to upload: {js_file_path}\n")

    result = upload_js_resource(base_url, token, js_file_path)

    print("\n" + "=" * 70)
    print("✓ UPLOAD SUCCESSFUL!")
    print("=" * 70)
    print(f"  Resource ID: {result.get('id', {}).get('id', 'N/A')}")
    print(f"  Resource Key: {result.get('resourceKey', 'N/A')}")
    print(f"  Title: {result.get('title', 'N/A')}")
    print(f"  File Name: {result.get('fileName', 'N/A')}")
    print(f"  ETag: {result.get('etag', 'N/A')[:16]}...")
    print("=" * 70)

  except Exception as e:
    print("\n" + "=" * 70)
    print("✗ ERROR")
    print("=" * 70)
    print(f"{e}")
    print("=" * 70)
    raise


if __name__ == "__main__":
  asyncio.run(main())
