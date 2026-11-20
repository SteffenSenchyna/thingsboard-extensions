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

// A setting's tooltip, from the description ESF gives it. ESF's descriptions run from a restated name ("The MQTT port" for "MQTT
// port") to a paragraph, most opening with the same filler ("Specifies the …", "If set to true, …", "Whether or not to …"). A
// tooltip is worth its icon only when it says more than the setting's name does, in as few words as it can: the description's
// first sentence, its filler dropped, cut back at a clause when long (never mid-sentence with "…") — and none at all when all it
// has left is the name again.

/** A note past this many characters loses its asides, then its last clauses. */
const NOTE_MAX = 120;

/** A word longer than this (a path, a hash, a URL) is shortened in the middle. */
const NOTE_WORD_MAX = 32;

/** A word shortened in the middle ("/var/lib/docker/overlay2/ea45…/merged"): its start and end kept. */
const shortWord = (word: string) => (word.length > NOTE_WORD_MAX ? `${word.slice(0, 18)}…${word.slice(-10)}` : word);

/** Words that say nothing of a setting (a description made only of these and its name's words says nothing new). */
const FILLER = new Set(
  (
    "the a an of to for in on at by be is are was will would should can this that these it its if or and not no with as from when where " +
    "which whether wheter either used use using uses value values parameter property option setting attribute field component service " +
    "instance feature specified defined desired selected given current currently default true false set sets enable enables enabled " +
    "disable disables disabled allow allows specify specifies define defines determine determines configure configures select " +
    "required associated related new any all each per via into than then also only such have has do does list one on off"
  ).split(" ")
);

/** Words that are worth a tooltip on their own: a unit, a format. */
const TELLING = new Set(
  "ms millisecond milliseconds sec second seconds minute minutes hour hours day days byte bytes kb mb gb degree degrees meter meters dbm percent cron json xml regex optional comma".split(
    " "
  )
);

/** A text's words: lower case, camelCase and dotted names apart, plurals as singulars ("dnsServers" → dns, server). */
function wordsOf(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/ipv([46])/g, "ip$1")
    .split(/[^a-z0-9%/]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Two words that are one ("auth" / "authentication", "open" / "opened", "publisher" / "publishing"). */
function sameWord(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.startsWith(short)) {
    return true;
  }
  let shared = 0;
  while (shared < short.length && short[shared] === long[shared]) {
    shared++;
  }
  return shared >= 6;
}

/** Whether a note only says its setting's name again: no word of its own, or one that tells nothing in a note of a few words. */
function restatesName(note: string, known: string[], squashedName: string): boolean {
  // Its letters alone, in the name's ("PdP type" in …pdpType).
  const squashed = note.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (squashed && squashedName.includes(squashed)) {
    return true;
  }
  const content = wordsOf(note).filter((w) => !FILLER.has(w));
  const added = content.filter((w) => !known.some((k) => sameWord(k, w)));
  if (!added.length) {
    return true;
  }
  const telling = (w: string) => TELLING.has(w) || /[0-9/%]/.test(w);
  return added.length === 1 && content.length <= 4 && !telling(added[0]);
}

/** A description's sentences: each up to a full stop followed by a capital — but not after "e.g.", "i.e." or "etc.". */
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  const end = /[.!?]\s+(?=[A-Z("'])/g;
  let from = 0;
  for (let match = end.exec(text); match; match = end.exec(text)) {
    const head = text.slice(from, match.index + 1);
    if (!/\b(e\.g|i\.e|etc|vs|approx|eg)\.$/i.test(head)) {
      out.push(head.trim());
      from = match.index + match[0].length;
    }
  }
  out.push(text.slice(from).trim());
  return out.filter(Boolean);
}

/** A sentence that only names the default ("Default: Hiz.", "It defaults to /dev/rtc0."): the field shows its value. */
const DEFAULT_ONLY = /^(?:default\b|defaults?\b|it defaults\b|the default\b)/i;

/** ESF's filler, and what's left in its place — applied in order, each once. */
const REWRITES: [RegExp, string][] = [
  // Asides that tell nothing of the setting: its default, where to read more.
  [/\s*\((?:default(?:s)?(?: set)?(?: to)?:?|for more information)[^()]*\)/gi, ""],
  [/,?\s*(?:see|refer to)\b[^.]*\bfor more (?:details|information)\b/gi, ""],
  // ESF's diagnostics, a set of the same settings a metric — each naming its metric again, as its setting's name does.
  [/^Number of cycles alerts related to "[^"]*" need to persist before being published/i, "Cycles an alert must persist before it is published"],
  [/^Threshold value in (\S+) for the "[^"]*" (warning|critical) threshold/i, "$2 threshold, in $1"],
  [/^Threshold value for the "[^"]*" (warning|critical) threshold/i, "$1 threshold"],
  [/^Enables publishing (diagnostic metrics|alerts on tamper event) for "[^"]*"/i, "Publishes its $1"],
  [/^The code to be used for (?:tamper event )?alerts (?:related to|for) "[^"]*"/i, "Code of its alerts"],
  [/^(?:The )?session inactivity interval, sessions will expire if no request is performed for the amount of time specified by this parameter in seconds/i, "Sessions expire after this many seconds without a request"],
  // What the description does, said of the setting itself.
  [/^Specif(?:ies|y),? as an OSGi target filter, the pid of the /i, "OSGi filter for the "],
  [/^The pid \(kura\.service\.pid\) of the desired /i, "Service PID of the "],
  [/^This (?:parameter|property|attribute|option|setting|field|value) (?=specifies|defines|allows|determines|indicates|controls|configures|sets)/i, ""],
  [/^This (?:parameter|property|attribute|option|setting|field|value) (?:is|will be) /i, ""],
  [/^(?:Specif(?:ies|y)|Defines?|Determines?) (?:if|whether|wheter)(?: or not)? /i, "Whether "],
  [/^Defines? for how much time /i, "How long "],
  [/^Al+ows to (?:specify|configure|define|set|perform|enable\/disable) /i, ""],
  [/^(?:Specif(?:ies|y)|Defines?|Determines|Indicates|Configures?|Controls|Selects?|Manages|Introduces|Option to select)\s+/i, ""],
  [/^If (?:set to true|enabled),?\s+/i, "When on, "],
  [/^If set to false,?\s+/i, "When off, "],
  [/^Set to true to /i, "On to "],
  [/^Whether or not /i, "Whether "],
  [/ (?:is|are) enabled or not\b/gi, " is on"],
  [/ or not\b/gi, ""],
  // Longer ways of saying "used".
  [/ (?:that|which) will be used /gi, " used "],
  [/ to be used? /gi, " used "],
  [/ to be (applied|enforced|transferred|published|monitored) /gi, " $1 "],
  [/ that have to be published\b/gi, " published"],
  [/ in order to /gi, " to "],
  // The setting's own interface goes without saying.
  [/ (?:to use )?(?:for|on|over) this interface\b/gi, ""],
  [/^A comma[- ]sep[ae]rated /i, "Comma-separated "],
  [/^Enables? or disables? (?:the )?/i, ""],
  [/^(?:the|an?) (?=["'<(A-Za-z])/i, ""],
  // Shorter words for the same.
  [/\bthis component will\b/gi, "it will"],
  [/ is not able to /gi, " can't "],
  [/ in case of /gi, " on "],
  [/ the amount of time /gi, " the time "],
  [/ (?:that|which) (?:is|are) /gi, " "],
];

/**
 * ESF's longest descriptions — a paragraph where a line would do — as that line, by a phrase of theirs (the wording rules can't
 * shorten a sentence that's all substance). Each says what ESF's own text says, no more: read against it before changing one.
 */
const CURATED: [RegExp, string][] = [
  [/maintain a local CRL cache by periodically downloading/i, "Keeps a local cache of the CRLs downloaded from their HTTP distribution points"],
  [/list of HTTP CRL distribution points that will be considered/i, "More HTTP CRL distribution points, beside those in the keystore's trusted certificates"],
  [/time interval for forcing the update of cached CRLs/i, "How often cached CRLs are updated, beside at their next update date (30 seconds at least)"],
  [/downloaded CRLs will be stored only if signed/i, "Stores a downloaded CRL only if signed by one of this keystore's trusted certificates"],
  [/If it is enabled and the gateway is not able to verify the revocation status of a client certificate/i, "When on, a client certificate whose revocation status can't be verified is rejected"],
  [/If it is not enabled and the gateway is not able to determine the revocation status of a server certificate/i, "When off, a server certificate whose revocation status can't be determined is rejected"],
  [/WatchdogService monitors CriticalComponents/i, "Reboots the system if a critical component hangs"],
  [/calling \/services\/session\/v1\/certificate to create a session will not be necessary/i, "When on, a valid HTTPS client certificate authenticates a request directly, no session created first"],
  [/all files in the configuration directory will be deleted and recreated/i, "On: the whole directory is recreated when a file differs from this configuration\nOff: only the changed files"],
  [/content of the configuration files will not be modified if they already exist/i, "When off, configuration files already in the directory are left as they are"],
  [/With some GPS receivers GPSD does not report/i, "Seconds without a position update after which the GPS fix counts as lost (0: never)"],
  [/periodic checkpoints to ensure data consistency/i, "Seconds between two checkpoints (no effect on an in-memory database)"],
  [/support running periodic defragmentation/i, "Minutes between two defragmentations, 0 for none (no effect on an in-memory database)"],
  [/manages connections using a connection pool/i, "The most connections the pool holds"],
  [/If set to PER_CHANNEL, the component will emit a driver-generated timestamp/i, "A timestamp per channel, or one per request: the asset's own, or the newest or oldest of the driver's"],
  [/include a channel value in the output emitted in Kura Wires only if it is different/i, "When on, a channel's value is emitted only when it changed since the last read or event"],
  [/values of all READ or READ_WRITE channels should be emitted/i, "On: a channel event emits every readable channel's value\nOff: only that channel's"],
  [/If set to ONCE, a single alert will be published/i, "Once: an alert when the threshold is passed and one when back to normal\nPeriodic: alerts while above it"],
  [/overlayfs filesystems should be monitored/i, "When off, overlayfs filesystems raise no alerts or diagnostics, and their settings are hidden"],
  [/storing in a file an identifier \(cursor\) of the last log entry read/i, "File keeping the last log entry read, to resume from it after a restart (empty: read from the start each time)"],
  [/Enables the recovery feature on connection failure/i, "Reboots the device after the set number of failed connection retries (needs the Watchdog service on)"],
  [/message with a priority equal to or less than this threshold will cause/i, "A message of this priority number or lower reconnects and sends, whatever the connection schedule"],
  [/relative path that the user will be redirected to when accessing/i, "Relative path a user opening http(s)://gateway-ip/ is sent to"],
  [/If set to WRITE_SINGLE_REGISTER or WRITE_MULTIPLE_REGISTERS/i, "The function that writes registers\nAuto: single for a lone register, multiple for contiguous ones"],
  [/If set to WRITE_SINGLE_COIL or WRITE_MULTIPLE_COILS/i, "The function that writes coils\nAuto: single for a lone coil, multiple for contiguous ones"],
  [/Announce to TCP sessions running over the tunnel/i, "Largest UDP packet, in bytes, that TCP sessions over the tunnel are told to fit in (0: the default)"],
  [/driver will use the hostname, port, and server name parameters specified in the configuration instead/i, "When on, the hostname, port and server name set here are used, not those in the server's endpoint descriptions"],
  [/format to be used for channel name for subtree subscriptions/i, "Browse path: the source node's path from the subscription root\nNode ID: its node id"],
  [/Priority level 0 \(highest\) should be used sparingly/i, "0 is the highest: keep it for messages that must go with the least delay"],
  [/Age in seconds of completed messages/i, "Seconds after which completed messages are deleted (5 at least)"],
  [/Absolute path of the PKCS or JKS keystore that contains the OPC-UA/i, "Absolute path of the PKCS or JKS keystore with the client certificate, its key and the trusted server certificates"],
  [/defers the snapshot updates required for persisting changes made through UserAdmin/i, "Milliseconds after the last UserAdmin change before the snapshot is updated"],
  [/If set to a non empty list, (REST API|Web Console) access will be allowed only on the specified ports/i, "Ports $1 access is allowed on (empty: every port)"],
  [/Whether or not to sync the clock and if so, the frequency in seconds/i, "Seconds between clock syncs\n0: once at startup\nBelow 0: never"],
  [/the Privileged Command Executor Service will be used to run the commands/i, "On: commands run with the privileged executor\nOff: the unprivileged one"],
  [/Rate of publishing of the diagnostic messages with the current system resource values/i, "Health monitor polls between two diagnostic messages (1: every poll)"],
  [/Rate at which MQTT round trip measurement is performed/i, "Health monitor polls between two MQTT round trip measurements"],
  [/set of log entry filters that will be applied by the low level journald implementation/i, "Filters applied by journald itself: less flexible than the LogReader's, but fewer entries reach the framework"],
  [/Introduces a pause between consecutive log entry reads from the journal/i, "Milliseconds between two log entry reads from the journal (0: none)"],
  [/size of the cache used for the Context Cache Feature/i, "Messages kept from just before a matching log entry, published with it for context"],
  [/Manages the default subscriptions to the gateway management MQTT topics/i, "When off, the gateway can't be managed remotely"],
  [/Timeouts the in-flight messages congestion condition/i, "Seconds of in-flight message congestion before a forced disconnect and reconnect (0: never)"],
  [/CRON expression that specifies the instants when the gateway should perform a connection attempt/i, "CRON expression of when the gateway connects (used with Enable Connection Schedule)"],
  [/Crontab like string defining the periodicity of the reboot/i, "Cron-like schedule: seconds minutes hours day-of-month month day-of-week (one of the two days must be ?)"],
  [/Define if the user is required to perform the hardening process/i, "When off, the hardening process is skipped"],
  [/list of DeploymentHook associations in the form/i, "Associations as <request_type>=<hook_pid>: a request's request.type and a DeploymentHook's service PID"],
  [/Interval in CRON expression/i, "CRON expression (needed with the CRON type)"],
  [/The value of this attribute will replace the '#account-name' token/i, "Replaces the #account-name token in publishing topics"],
];

/** A long note's clause that can go: what follows a comma or a dash and only adds to what's said. */
const CLAUSE =
  /(?:[,;]| —| -) (?:where|which|while|this|these|it|in addition|otherwise|so that|expressed|specifying|named|regardless|even if|for example|either)\b| such that\b|\s\(/g;

/** A note opening on its condition ("If the device can't connect, …"): its main clause comes last, so its end can't go. */
const CONDITIONAL = /^(?:if|unless|while|in case|when(?! o(?:n|ff),))\b/i;

/** One sentence as a note: ESF's filler dropped, no full stop; long, its trailing clauses dropped and its long words shortened. */
function tidy(sentence: string): string {
  let note = sentence;
  for (const [filler, instead] of REWRITES) {
    note = note.replace(filler, instead);
  }
  note = note.replace(/\s+/g, " ").replace(/\s+\)/g, ")").replace(/[\s.,;:]+$/, "").trim();
  if (note.length > NOTE_MAX) {
    note = note.split(" ").map(shortWord).join(" ");
  }
  if (note.length > NOTE_MAX && !CONDITIONAL.test(note)) {
    // Its last clause boundary within the limit (past a third of it): the note ends there.
    let at = -1;
    CLAUSE.lastIndex = 0;
    for (let m = CLAUSE.exec(note); m && m.index <= NOTE_MAX; m = CLAUSE.exec(note)) {
      if (m.index > NOTE_MAX / 3) {
        at = m.index;
      }
    }
    if (at > 0) {
      note = note.slice(0, at).replace(/[\s,;:—-]+$/, "");
    }
  }
  return note;
}

/** The sentences of a description a note is looked for in (its opening ones: the rest is detail). */
const NOTE_SENTENCES = 3;

/**
 * A setting's tooltip from its description: its first sentence that says more than the setting's name (`name`, `id`) and its
 * component's (`context`) already do — ESF's filler dropped ("Specifies the …", "If set to true, …" → "When on, …", "(default:
 * …)", ", see … for more details"), no full stop; past {@link NOTE_MAX} characters, its trailing clauses dropped at a comma or a
 * dash (never cut mid-sentence), a very long word (a path) shortened in the middle. "" — no tooltip — when none of its opening
 * sentences says anything new ("The MQTT port." for "MQTT port"; "Default: Hiz.").
 */
export function esfShortNote(text: string, name = "", id = "", context = ""): string {
  const whole = text.replace(/\s+/g, " ").trim();
  for (const [phrase, line] of CURATED) {
    const match = phrase.exec(whole);
    if (match) {
      return line.replace("$1", match[1] ?? "");
    }
  }
  const known = wordsOf(`${name} ${id} ${context}`);
  const squashedName = `${name} ${id}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const sentence of sentencesOf(whole).slice(0, NOTE_SENTENCES)) {
    if (DEFAULT_ONLY.test(sentence)) {
      continue;
    }
    const note = tidy(sentence);
    if (note && !restatesName(note, known, squashedName)) {
      return note.charAt(0).toUpperCase() + note.slice(1);
    }
  }
  return "";
}

// ---- units -------------------------------------------------------------------------------------------------------------------

/**
 * Units ESF's definitions don't name, by the setting's id: the Kura cloud stack's (a connection's MqttDataTransport, DataService) —
 * their descriptions say a timeout or a size without its unit.
 */
const KNOWN_UNITS: Record<string, string> = {
  "keep-alive": "s",
  timeout: "s",
  "connect.retry-interval": "s",
  "disconnect.quiesce-timeout": "s",
  "store.housekeeper-interval": "s",
  "store.purge-age": "s",
  "store.capacity": "messages",
  "in-flight-messages.max-number": "messages",
  "in-flight-messages.congestion-timeout": "s",
  "rate.limit.average": "messages",
  "rate.limit.burst.size": "messages",
  "maximum.payload.size": "bytes",
};

/** A unit its description or name gives ("Frequency in seconds …", "(ms)"), the first that matches; a rate ("per second") none. */
const UNIT_PHRASES: [RegExp, string][] = [
  [/\bmessages? per second\b/i, "msg/s"],
  [/\bper (second|minute|hour)\b/i, ""],
  [/\bmilliseconds?\b|\bin ms\b|\(ms\)|\bmsecs?\b/i, "ms"],
  [/\bseconds?\b|\(s\)|\(secs?\)|\bin secs?\b/i, "s"],
  [/\bminutes?\b|\(min\)|\(mins\)/i, "min"],
  [/\bhours?\b|\(h\)/i, "h"],
  [/\bkilobytes?\b|\bKB\b/, "KB"],
  [/\bmegabytes?\b|\bMB\b/, "MB"],
  // Bytes only as a unit ("… in bytes", "(bytes)", "number of bytes") — never a word of the text ("the register or byte").
  [/\bin bytes\b|\(bytes?\)|\bnumber of bytes\b|\bsize in bytes\b/i, "bytes"],
  [/\bdBm\b/, "dBm"],
  [/\bpercent(age)?\b|%/i, "%"],
];

const NUMBER_TYPES = new Set(["LONG", "INTEGER", "SHORT", "BYTE", "DOUBLE", "FLOAT"]);

/**
 * A number setting's unit, shown inside its box ("s", "ms", "bytes"): the cloud stack's known ones by id, else the first its name or
 * description gives; "" for none, and for anything not a number.
 */
export function esfUnit(attr: { id: string; type: string; name: string; description: string }): string {
  if (!NUMBER_TYPES.has(attr.type)) {
    return "";
  }
  if (attr.id in KNOWN_UNITS) {
    return KNOWN_UNITS[attr.id];
  }
  const text = `${attr.name} ${attr.description}`;
  return UNIT_PHRASES.find(([phrase]) => phrase.test(text))?.[1] ?? "";
}

/** A setting's name without the unit its box now shows ("Keep Alive (seconds)", "Refresh Rate Seconds" → "Keep Alive", "Refresh Rate"). */
export function esfLabelWithoutUnit(name: string): string {
  const bare = name.replace(/\s*[([](?:in\s+)?(?:s|secs?|seconds?|ms|msecs?|milliseconds?|mins?|minutes?|h|hours?|bytes?|KB|MB|dBm|%)[)\]]\s*$/i, "").trim();
  // A name ending with its unit as a word ("Refresh Rate Seconds", "Timeout in Seconds"): the unit dropped — never leaving one
  // word that needs it ("Max Bytes").
  const m = /^(.+?)\s+(in\s+)?(?:seconds?|secs?|milliseconds?|millis|ms|minutes?|mins?|hours?|bytes?)$/i.exec(bare);
  return (m && (m[2] || /\s/.test(m[1])) ? m[1] : bare) || name;
}


/**
 * Words a setting's or a service's name writes in capitals or its own way ("qos" → "QoS", "ip4" → "IPv4"), and the few it
 * shortens, written out ("hwclock" → "Hardware Clock").
 */
export const ESF_WORDS: Record<string, string> = {
  aide: "AIDE", api: "API", apn: "APN", ca: "CA", cpu: "CPU", crt: "CRT", cups: "CUPS", db: "DB", dhcp: "DHCP", dhcpv6: "DHCPv6",
  dns: "DNS", eol: "EOL", esf: "ESF", eui64: "EUI64", fs: "FS", fss: "FSS", gps: "GPS", gpsd: "GPSD", hw: "HW", http: "HTTP",
  https: "HTTPS", icmp: "ICMP", id: "ID", io: "IO", iot: "IoT", ip: "IP", ip4: "IPv4", ip6: "IPv6", ipv4: "IPv4", ipv6: "IPv6",
  jvm: "JVM", mqtt: "MQTT", mtu: "MTU", nat: "NAT", ntp: "NTP", opc: "OPC", opcua: "OPC UA", osgi: "OSGi", pdp: "PDP", pid: "PID",
  ppp: "PPP", qos: "QoS", rest: "REST", rst: "RST", rtc: "RTC", rtu: "RTU", scep: "SCEP", ssh: "SSH", sshd: "SSHD", ssid: "SSID",
  ssl: "SSL", tcp: "TCP", tls: "TLS", udp: "UDP", uri: "URI", url: "URL", vpn: "VPN", wifi: "Wi-Fi", wins: "WINS",
  tc: "TC", "802.1x": "802.1X", gpio: "GPIO",
  addr: "Address", baudrate: "Baud Rate", conf: "Configuration", conn: "Connection", databits: "Data Bits", desc: "Description",
  est: "Estimate", flowcontrolin: "Flow Control In", flowcontrolout: "Flow Control Out", hwclock: "Hardware Clock",
  iface: "Interface", mssfix: "MSS Fix", proc: "Process", procname: "Process Name", scaleoffset: "Scale Offset",
  stopbits: "Stop Bits", typ: "Type",
};

/** Words a title leaves in lower case past its first. */
const TITLE_SMALL_WORDS = new Set(["an", "and", "at", "by", "for", "in", "of", "on", "or", "per", "the", "to", "with"]);

/** Settings whose id, written out, still doesn't say what they do: their label, by id. */
const CURATED_LABELS: Record<string, string> = {
  "fail2ban.kura.enabled": "Protect ESF Services",
  "fail2ban.sshd.enabled": "Protect SSH",
  "flooding.protection.enabled": "Protect IPv4",
  "flooding.protection.enabled.ipv6": "Protect IPv6",
  "flooding.protection.conn.limit": "Connections per IP",
  "flooding.protection.limit": "TCP Limit",
  "flooding.protection.limit.burst": "TCP Limit Burst",
};

/** A device's or an interface's own name in a setting's id ("eth0", "mmcblk0", "3-1.1"): kept as it is. */
const DEVICE_NAME = /^(?:[a-z]+\d+|\d+(?:-\d+)+(?:\.\d+)*)$/;

/**
 * A name's words in title case, as ESF writes the names it gives ("RTC File Name"): ESF_WORDS' own way, small words lower, a
 * device's name ("eth0") as it is.
 */
export function esfTitleWords(words: string[]): string {
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (lower in ESF_WORDS) {
        return ESF_WORDS[lower];
      }
      if (DEVICE_NAME.test(w)) {
        return w;
      }
      return i > 0 && TITLE_SMALL_WORDS.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * A name's words: its dotted, dashed, underscored and camelCase parts apart ("cipherSuites" → "cipher", "Suites") — but a
 * modem's port name ("3-1.1"), whole.
 */
function nameWords(name: string): string[] {
  const parts: string[] = [];
  for (const part of name.split(".").filter(Boolean)) {
    const last = parts[parts.length - 1];
    if (last !== undefined && /^\d+(?:-\d+)+(?:\.\d+)*$/.test(last) && /^\d+$/.test(part)) {
      parts[parts.length - 1] = `${last}.${part}`;
    } else {
      parts.push(part);
    }
  }
  return parts.flatMap((part) =>
    DEVICE_NAME.test(part) || /^802-1x$/i.test(part)
      ? [part.replace(/^802-1x$/i, "802.1x")]
      : part
          .replace(/[_-]+/g, " ")
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
          .split(/\s+/)
          .filter(Boolean)
  );
}

/**
 * A setting's label. ESF gives many settings no name but their id ("clock.ntp.host", "Broker-url"); those are written out in
 * its names' title case ("NTP Host", "Broker URL"), less the leading parts that only repeat their component's name — the card's
 * title ("clock." in the ClockService, "flooding.protection." in the Flooding Protection Service; `component` its name and
 * pid). A Wire asset's channel setting keeps its channel's name ("MyArray#value.type" → "MyArray · Value Type"); a few ids
 * that still say little have a label written for them (`CURATED_LABELS`). A name ESF writes with spaces is its own.
 */
export function esfSettingLabel(attr: { id: string; name: string }, component = ""): string {
  const name = attr.name || attr.id;
  if (/\s/.test(name)) {
    return name;
  }
  if (name === attr.id && attr.id in CURATED_LABELS) {
    return CURATED_LABELS[attr.id];
  }
  const hash = name.indexOf("#");
  if (hash > 0) {
    return `${name.slice(0, hash)} · ${esfTitleWords(nameWords(name.slice(hash + 1)))}`;
  }
  const own = component.toLowerCase().replace(/[^a-z0-9]/g, "");
  let parts = name.split(".").filter(Boolean);
  while (parts.length > 1 && parts[0].length >= 3 && own.includes(parts[0].toLowerCase().replace(/[^a-z0-9]/g, ""))) {
    parts = parts.slice(1);
  }
  return esfTitleWords(nameWords(parts.join("."))) || name;
}
