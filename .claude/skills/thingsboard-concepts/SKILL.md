---
name: thingsboard-concepts
description: "Canonical reference for core ThingsBoard concepts — tenants, customers, devices, assets, device and asset profiles, entity ownership, time series vs. attributes (with attribute scopes), and relations. Use when working with ThingsBoard entities and you need the ground-truth definitions of how they are structured and connected: designing a solution, pulling or importing entities, or reasoning about profiles, telemetry, attributes, or relations."
user-invocable: false
---

# ThingsBoard Concepts

A brief reference on core ThingsBoard concepts — how entities are structured and connected.

## Entities

- **Tenant:** The top-level entity representing an organization or isolated environment. All data within a tenant is completely isolated from other tenants.
- **Customer:** A sub-entity within a tenant, typically representing an end-user, client, or organizational unit that the tenant serves.
- **Device:** A physical or virtual device that sends telemetry data to the platform.
- **Asset:** A logical entity used to group or represent real-world objects such as buildings, production lines, or regions.
- **Device Profile:** A template that defines shared behavior and characteristics for devices of the same type.
- **Asset Profile:** A template that defines shared behavior and characteristics for assets of the same type.

## Entity Ownership

Devices and assets can be owned by either the tenant or a customer. By default, all entities are owned by the tenant. When an entity is assigned to a customer, that customer becomes its owner.

## Profiles

Every device has a device profile, and every asset has an asset profile. The system comes with two predefined profiles named "default" — one for devices and one for assets. These are ordinary profiles provided for convenience, commonly used by devices and assets that haven't been assigned to a more specific profile yet.

One device profile can be marked as the tenant's default — new devices automatically use it when no profile is specified. Usually this is the predefined "default" profile, though any profile can serve this role. Asset profiles work the same way.

Keep in mind that the default profile is not a reliable way to identify a category of devices or assets, since unrelated types often end up sharing it.

## Entity Data

Entities can have two types of data associated with them: **time series** and **attributes**.

**Time series:**
- A sequence of values recorded over time, each with a timestamp.
- Used for data that changes frequently and where historical values matter (e.g., temperature readings, power consumption, sensor measurements).

**Attributes:**
- Simple key-value pairs that store only the most recent (latest) value.
- No historical data — when an attribute is updated, the previous value is replaced.
- Used for relatively static properties or configuration (e.g., device serial number, calibration values).
- Each attribute has a **scope**: **client**, **shared**, or **server** (also referred to as client-side, shared, or server-side attributes).

## Relations

Relations define directional connections between two entities within a tenant. They model real-world relationships like ownership, containment, or management hierarchies.

A relation consists of:
- **From entity:** The source entity of the relation (parent).
- **To entity:** The target entity of the relation (child).
- **Type:** A customizable label describing the relationship (e.g., "Contains", "Manages", "locatedIn").

Relations are directional — the FROM side is the **parent** entity, the TO side is the **child** entity. A relation FROM asset A TO device B is different from a relation FROM device B TO asset A.

Relations enable hierarchical data organization, cross-entity queries, and dynamic entity groupings.
