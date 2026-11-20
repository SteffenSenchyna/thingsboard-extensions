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

// Forms laid out by hand for the components whose flat list of settings reads poorly — the Security view's SSL managers and
// keystores: their settings in cards by what they're for, a switch heading what it turns on (folding its settings open), short
// options as button groups with a note an option a line, a list one item a line, a number beside its unit. The settings and
// their values are still ESF's own definition's (`EsfForm`): a layout only arranges and names them; a setting it doesn't place
// (a newer ESF's) shows in an "Other settings" card, so nothing is ever hidden. By the definition's id — a factory instance's,
// its factory's pid. Checked against ESF 7.6.2's definitions (dev-inf-gw-01, 18 November 2026; the PKCS11 keystore's on its
// instance "scs").

import { TbSelectOption } from "../../components/shared/select/select.component";

/** How a layout shows one setting (anything not given: as the shared form would). */
export interface EsfLayoutField {
  /** The setting's id. */
  id: string;
  label?: string;
  /** Its info bubble's text ("" none). */
  note?: string;
  /** Its options, relabelled or given (a text setting with a few known values: the SSL protocol). */
  options?: TbSelectOption[];
  /** A pick's control: a button group (2–4 short options), a row (or a column) of radios, or a select. */
  control?: "buttons" | "radio" | "radio-column" | "select";
  /** A list in one value shown one item a line (a cipher list, CRL URLs): comma-separated, or as `separator` says. */
  lines?: boolean;
  /** What separates a `lines` value's items in ESF: "," (the default) or " " (whitespace — a PKCS11 module's mechanisms). */
  separator?: "," | " ";
  /** A number whose unit is another setting: that setting a select beside it ("1" "Days"). */
  unitOf?: string;
}

export interface EsfLayoutCard {
  title: string;
  /** The card's info bubble ("" none). */
  info?: string;
  /** A true / false heading the card's settings: its switch, folding them open while on. */
  gate?: EsfLayoutField;
  fields: EsfLayoutField[];
}

export interface EsfLayout {
  cards: EsfLayoutCard[];
  /** Settings another view edits (an asset's channels — its panel's Channels tab): left out of the form's cards. */
  exclude?: (attr: { id: string }) => boolean;
}

const TIME_UNITS: TbSelectOption[] = [
  { value: "SECONDS", label: "Seconds" },
  { value: "MINUTES", label: "Minutes" },
  { value: "HOURS", label: "Hours" },
  { value: "DAYS", label: "Days" },
];

/** An SSL manager (`org.eclipse.kura.ssl.SslManagerService` and its instances). */
const SSL_MANAGER: EsfLayout = {
  cards: [
    {
      title: "Keystores",
      info: "Where its connections' keys and trusted certificates come from",
      fields: [
        { id: "KeystoreService.target", label: "Keystore", note: "Holds this gateway's own keys and certificates" },
        {
          id: "TruststoreKeystoreService.target",
          label: "Truststore",
          note: "Holds the certificates it trusts\nNot found: the keystore is used",
        },
      ],
    },
    {
      title: "TLS",
      fields: [
        {
          id: "ssl.default.protocol",
          label: "Protocol",
          note: "JVM default: the Java runtime's own choice",
          options: [
            { value: "TLSv1.2", label: "TLSv1.2" },
            { value: "TLSv1.3", label: "TLSv1.3" },
            { value: "", label: "JVM default" },
          ],
          control: "buttons",
        },
        { id: "ssl.hostname.verification", label: "Verify hostname", note: "Reject a server whose certificate names another host" },
        { id: "ssl.default.cipherSuites", label: "Cipher suites", note: "One a line\nNone: every cipher the JVM has", lines: true },
      ],
    },
    {
      title: "Revocation check",
      gate: {
        id: "ssl.revocation.check.enabled",
        label: "Revocation check",
        note: "Check each server certificate isn't revoked during the handshake; a revoked one fails it",
      },
      fields: [
        {
          id: "ssl.revocation.mode",
          label: "Mode",
          note:
            "OCSP first: OCSP, then the keystore's CRLs and CRL distribution points\n" +
            "CRLs first: the keystore's CRLs and CRL distribution points, then OCSP\n" +
            "CRLs only: the keystore's CRLs and CRL distribution points",
          options: [
            { value: "PREFER_OCSP", label: "OCSP first" },
            { value: "PREFER_CRL", label: "CRLs first" },
            { value: "CRL_ONLY", label: "CRLs only" },
          ],
          control: "buttons",
        },
        {
          id: "ssl.revocation.soft.fail",
          label: "Soft fail",
          note: "On: a certificate whose status can't be found (no network) is accepted\nOff: it's rejected",
        },
      ],
    },
  ],
};

/** A keystore's CRL management, as both keystore kinds have it (where an empty store path puts the file, each its own). */
const crlCard = (storeNote: string): EsfLayoutCard => ({
  title: "CRL management",
  gate: {
    id: "crl.management.enabled",
    label: "CRL management",
    note: "Keep a local cache of CRLs, downloaded from its trusted certificates' distribution points and the URLs below",
  },
  fields: [
    { id: "crl.urls", label: "CRL URLs", note: "HTTP distribution points beside its certificates' own, one a line", lines: true },
    {
      id: "crl.update.interval",
      label: "Update every",
      note: "Downloads them again this often, besides each CRL's own next update\nAt least 30 seconds",
      unitOf: "crl.update.interval.time.unit",
    },
    { id: "crl.update.interval.time.unit", options: TIME_UNITS },
    { id: "crl.check.interval", label: "Check every", note: "How often the cached CRLs are checked, and updated if needed", unitOf: "crl.check.interval.time.unit" },
    { id: "crl.check.interval.time.unit", options: TIME_UNITS },
    { id: "crl.store.path", label: "Store path", note: storeNote },
    { id: "verify.crl", label: "Verify CRLs", note: "Keep only CRLs signed by a certificate this keystore trusts" },
  ],
});

/** A keystore file (`FilesystemKeystoreServiceImpl`). */
const FILESYSTEM_KEYSTORE: EsfLayout = {
  cards: [
    {
      title: "Keystore",
      info: "A Java keystore file on the unit",
      fields: [
        { id: "keystore.path", label: "Path", note: "Created there if it doesn't exist" },
        { id: "keystore.password", label: "Password" },
        { id: "randomize.password", label: "Randomize password", note: "Replaced with a random one at its next use, then off again" },
      ],
    },
    crlCard("Empty: the keystore's path with .crl added"),
  ],
};

/** A PKCS11 module exposed as a keystore (`PKCS11KeystoreServiceImpl` — a hardware security module, a smart card). */
const PKCS11_KEYSTORE: EsfLayout = {
  cards: [
    {
      title: "PKCS11 module",
      info: "A hardware security module or smart card, through its PKCS11 library",
      fields: [
        { id: "library.path", label: "Library path", note: "The module's shared library, such as /lib/libmypkcs11.so" },
        { id: "pin", label: "PIN" },
        { id: "slot", label: "Slot", note: "Empty: not given\nGive at most one of Slot and Slot list index" },
        { id: "slot.list.index", label: "Slot list index", note: "Empty: not given\nGive at most one of Slot and Slot list index" },
      ],
    },
    {
      title: "Provider",
      info: "The Java PKCS11 provider's configuration (Oracle's PKCS11 reference guide)",
      fields: [
        {
          id: "enabled.mechanisms",
          label: "Enabled mechanisms",
          note: "One a line, such as CKM_RSA_PKCS\nOnly these are used\nNone: every mechanism the module has",
          lines: true,
          separator: " ",
        },
        {
          id: "disabled.mechanisms",
          label: "Disabled mechanisms",
          note: "One a line\nThese aren't used\nIgnored while enabled mechanisms are listed",
          lines: true,
          separator: " ",
        },
        { id: "attributes", label: "Attributes", note: "Added to the provider's configuration as written" },
      ],
    },
    crlCard("Empty: a file in ESF's security folder"),
  ],
};

/**
 * A Wire asset (`org.eclipse.kura.asset`): one card — its description, then what it emits. Its driver (`driver.pid`) isn't one of
 * them: ESF's console doesn't let it change (the asset's channels are its driver's), so it's only named — in the view, over the
 * asset; its channels' settings (`<channel>#…`) are the channels' table's.
 */
const WIRE_ASSET: EsfLayout = {
  exclude: (attr) => attr.id.includes("#") || attr.id === "driver.pid",
  cards: [
    {
      title: "Asset",
      info: "Its description, and what it sends on in a Wire graph",
      fields: [
        { id: "asset.desc", label: "Description" },
        {
          id: "timestamp.mode",
          label: "Timestamps",
          options: [
            { value: "NO_TIMESTAMPS", label: "None", note: "No timestamps" },
            { value: "PER_CHANNEL", label: "Per channel", note: "Each channel's own, from the driver" },
            { value: "SINGLE_ASSET_GENERATED", label: "From the asset", note: "One: the time the asset made the envelope" },
            { value: "SINGLE_DRIVER_GENERATED_MAX", label: "Driver's latest", note: "One: the newest of the channels' times" },
            { value: "SINGLE_DRIVER_GENERATED_MIN", label: "Driver's earliest", note: "One: the oldest of the channels' times" },
          ],
          control: "radio",
        },
        { id: "emit.all.channels", label: "Emit all channels", note: "On a listened channel's change, all channels' values, not only its" },
        { id: "emit.on.change", label: "Emit on change", note: "Only a value that changed since the last read" },
        { id: "emit.errors", label: "Emit errors", note: "A channel's read error as its value" },
        { id: "emit.connection.errors", label: "Emit connection errors", note: "The driver's connection errors too" },
        { id: "emit.empty.envelopes", label: "Emit empty envelopes", note: "An envelope even when no channel has a value to send" },
      ],
    },
  ],
};

const LAYOUTS: Record<string, EsfLayout> = {
  "org.eclipse.kura.asset": WIRE_ASSET,
  "org.eclipse.kura.ssl.SslManagerService": SSL_MANAGER,
  "org.eclipse.kura.core.keystore.FilesystemKeystoreServiceImpl": FILESYSTEM_KEYSTORE,
  "org.eclipse.kura.core.keystore.PKCS11KeystoreServiceImpl": PKCS11_KEYSTORE,
};

/** A component's layout, by its definition's id; null — the shared form's flat list. */
export function esfLayoutOf(definitionId: string | undefined): EsfLayout | null {
  return (definitionId && LAYOUTS[definitionId]) || null;
}
