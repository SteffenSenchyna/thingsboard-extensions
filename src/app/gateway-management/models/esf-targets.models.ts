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

// A setting that names another of the unit's services: an OSGi reference's target filter, its id "<Reference>.target" and its
// value "(kura.service.pid=SSLKeystore)" — the SSL manager's keystores, the HTTP service's keystore, a cloud publisher a log
// manager or the diagnostics publish with, the SSL manager a transport, the console or the deployment agent use. ESF says which
// service type a reference takes only in its name ("KeystoreService", "CloudDiagnosticPublisher"), so the services it can name
// are the unit's components of that type, told by their factory's class (`pidsWithFactory`) — or, a component made by no
// factory, by its own pid's.

import { TbSelectOption } from "../../components/shared/select/select.component";
import { EsfAttribute, esfServiceName, esfShortName } from "./esf.models";
import { esfFactoryName } from "./esf-cloud.models";
import { EsfComponentFactory } from "./esf-security.models";

const TARGET_PID = /^\(\s*kura\.service\.pid\s*=\s*([^()=\s]+)\s*\)$/;

/** The service a target filter names by its pid ("(kura.service.pid=SSLKeystore)" → "SSLKeystore"); null for any other filter. */
export function esfTargetPid(filter: string): string | null {
  return TARGET_PID.exec(filter.trim())?.[1] ?? null;
}

/** The target filter naming a service by its pid. */
export function esfTargetFilter(pid: string): string {
  return `(kura.service.pid=${pid})`;
}

/** Whether a setting is a reference's target filter (one text value, its id "<Reference>.target"). */
export function isEsfTarget(attr: EsfAttribute): boolean {
  return /\.target$/.test(attr.id) && attr.type === "STRING" && !attr.options.length && attr.cardinality === 0;
}

/**
 * The service types a reference takes, by its name, each as the classes that make them: a publisher or a subscriber of any kind
 * ("CloudDiagnosticPublisher", "PingPublisher" — a Cloud Publisher, an Event Publisher, a Log Publisher …), a keystore of any kind
 * ("TruststoreKeystoreService" — a filesystem or a PKCS11 one), a data transport (the MQTT one); else its name itself
 * ("SslManagerService", "CloudService", "DataService").
 */
const REFERENCE_TYPES: [RegExp, RegExp][] = [
  [/Publisher$/i, /Publisher$/i],
  [/Subscriber$/i, /Subscriber$/i],
  [/KeystoreService$/i, /KeystoreService/i],
  [/^DataTransportService$/i, /DataTransport$/i],
];

/** The unit's services a target setting can name (its own component left out). */
export function esfTargetServices(attr: EsfAttribute, ownPid: string, services: EsfComponentFactory[]): EsfComponentFactory[] {
  const reference = attr.id.replace(/\.target$/, "");
  const type = REFERENCE_TYPES.find(([name]) => name.test(reference))?.[1] ?? new RegExp(`^${reference.replace(/[^A-Za-z0-9]/g, "")}$`, "i");
  return services.filter((s) => s.pid !== ownPid && type.test(esfShortName(s.factoryPid || s.pid)));
}

/**
 * A target setting's options — each service it can name, its value the filter naming it: by its name over its pid (a component
 * named by its class — "SSL Manager Service", `org.eclipse.kura.ssl.SslManagerService` under it), or a pid given by hand over
 * what made it ("SSLKeystore", "Filesystem Keystore Service Impl"); the one set now first kept even when the unit has no such
 * service ("Not on this unit"). Null — the setting stays a text field — when its value is any other filter, or the unit's
 * services weren't read, or none fits.
 */
export function esfTargetOptions(attr: EsfAttribute, value: string, ownPid: string, services: EsfComponentFactory[]): TbSelectOption[] | null {
  const current = value ? esfTargetPid(value) : null;
  if ((value && !current) || !services.length) {
    return null;
  }
  const fits = esfTargetServices(attr, ownPid, services);
  if (!fits.length) {
    return null;
  }
  const options: TbSelectOption[] = fits
    .map((s) => (/^[A-Z]/.test(esfShortName(s.pid)) && s.pid.includes(".") ? { value: esfTargetFilter(s.pid), label: esfServiceName(s.pid), note: s.pid } : { value: esfTargetFilter(s.pid), label: s.pid, note: s.factoryPid ? esfFactoryName(s.factoryPid) : "" }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  if (current && !fits.some((s) => s.pid === current)) {
    options.unshift({ value, label: current, note: "Not on this unit" });
  }
  return options;
}
