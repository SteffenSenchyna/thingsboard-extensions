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

// A deployment package uploaded from the browser to an ESF unit, through the gateway.
//
// ESF's own upload (Deploy v2 `_upload`) is a multipart POST of the file's bytes, which the gateway's Request connector can't
// carry: it sends a request's body as text (gateway 3.8.6 encodes it UTF-8). So the file goes through ESF's command service
// (Command v1), whose request carries a zip as base64 (`zipBytes`) that ESF unzips into the command's working directory before
// running the command — in a shell. The file is sent in pieces (`ESF_UPLOAD_PIECE_BYTES`), each a one-file zip whose command
// writes it at its place in the package (`dd … seek`, so a piece sent twice changes nothing) into a folder of its own under
// /tmp; its size and SHA-256 checked; then ESF installs it from there (`_install`, a `file:` URL — as its own upload does),
// moving the file into its packages folder — the file gone is the install done; the folder removed after.
//
// A piece is 64 KB (87 KB as base64): each call's message stays far under ThingsBoard's MQTT payload limit (262,144 bytes) and
// at the size the instance's firewall already passes (the feedback's screenshots) — the connector puts a request it fails on
// whole into its error reply and an ERROR log line, which the gateway sends back up.

import { firstValueFrom } from "rxjs";
import { EsfCallError } from "./esf.models";
import { EsfClient, EsfCommandResult, parseEsfCommandResult } from "./esf-api.models";

/** The bytes of the file a piece carries. */
export const ESF_UPLOAD_PIECE_BYTES = 64 * 1024;

/** The largest file sent this way (512 pieces): a larger package is installed from a URL. */
export const ESF_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;

/** How long ESF is given to install the package once asked (its file still there after it: it didn't). */
export const ESF_UPLOAD_INSTALL_WAIT_MS = 2 * 60 * 1000;

const POLL_MS = 3000;
const PACKAGE_FILE = "package.dp";

/** A deployment package's name and version, from its manifest. */
export interface EsfPackageFile {
  name: string;
  version: string;
}

// ---- The package's manifest, read in the browser -------------------------------------------------------------------------

/** Not a deployment package (the reason why): the upload doesn't start. */
export class EsfNotAPackage extends Error {}

const u16 = (b: DataView, at: number): number => b.getUint16(at, true);
const u32 = (b: DataView, at: number): number => b.getUint32(at, true);

async function bytesOf(file: Blob, from: number, to: number): Promise<DataView> {
  return new DataView(await file.slice(from, to).arrayBuffer());
}

/** A stored or deflated zip entry's content (deflate through the browser's `DecompressionStream`). */
async function inflate(data: ArrayBuffer, method: number): Promise<Uint8Array> {
  if (method === 0) {
    return new Uint8Array(data);
  }
  if (method !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("unreadable");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A manifest's main headers (its continuation lines — a leading space — joined on). */
function manifestHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n /g, "").split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      break; // the main section ends at the first blank line
    }
    const at = line.indexOf(":");
    if (at > 0) {
      headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return headers;
}

/**
 * A deployment package's name and version (`DeploymentPackage-SymbolicName`, `-Version` in its `META-INF/MANIFEST.MF`): a `.dp` is
 * a jar. Not a zip, no manifest or one naming no package: `EsfNotAPackage`, its reason. null when this browser can't read it (no
 * `DecompressionStream`, a zip64 file) — the upload still goes, ESF judging it.
 */
export async function readDeploymentPackage(file: Blob): Promise<EsfPackageFile | null> {
  const notAPackage = "Not a deployment package (.dp)";
  // The end of central directory record: in the last 22 bytes, or before a comment of up to 65,535.
  const tailFrom = Math.max(0, file.size - 22 - 0xffff);
  const tail = await bytesOf(file, tailFrom, file.size);
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    throw new EsfNotAPackage(notAPackage);
  }
  const count = u16(tail, end + 10);
  const dirSize = u32(tail, end + 12);
  const dirAt = u32(tail, end + 16);
  if (dirAt === 0xffffffff || count === 0xffff) {
    return null; // zip64
  }
  const dir = await bytesOf(file, dirAt, dirAt + dirSize);
  const decoder = new TextDecoder();
  for (let at = 0, n = 0; n < count && at + 46 <= dir.byteLength; n++) {
    if (u32(dir, at) !== 0x02014b50) {
      break;
    }
    const method = u16(dir, at + 10);
    const packed = u32(dir, at + 20);
    const nameLength = u16(dir, at + 28);
    const skip = nameLength + u16(dir, at + 30) + u16(dir, at + 32);
    const local = u32(dir, at + 42);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + at + 46, nameLength));
    if (name.toUpperCase() === "META-INF/MANIFEST.MF") {
      const head = await bytesOf(file, local, local + 30);
      const dataAt = local + 30 + u16(head, 26) + u16(head, 28);
      let content: Uint8Array;
      try {
        content = await inflate(await file.slice(dataAt, dataAt + packed).arrayBuffer(), method);
      } catch {
        return null;
      }
      const headers = manifestHeaders(decoder.decode(content));
      const symbolic = (headers["DeploymentPackage-SymbolicName"] ?? "").split(";")[0].trim();
      if (!symbolic) {
        throw new EsfNotAPackage(headers["Bundle-SymbolicName"] ? "A bundle, not a deployment package (.dp)" : notAPackage);
      }
      return { name: symbolic, version: headers["DeploymentPackage-Version"] ?? "" };
    }
    at += 46 + skip;
  }
  throw new EsfNotAPackage(notAPackage);
}

// ---- A piece as a one-file zip ------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip holding one file, stored (a package is a zip already: deflating it again gains nothing). */
export function storedZip(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const crc = crc32(data);
  const local = 30 + nameBytes.length;
  const central = 46 + nameBytes.length;
  const zip = new Uint8Array(local + data.length + central + 22);
  const v = new DataView(zip.buffer);
  const DOS_DATE = 0x0021; // 1 January 1980
  // Local file header, then the data.
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(12, DOS_DATE, true);
  v.setUint32(14, crc, true);
  v.setUint32(18, data.length, true);
  v.setUint32(22, data.length, true);
  v.setUint16(26, nameBytes.length, true);
  zip.set(nameBytes, 30);
  zip.set(data, local);
  // Central directory header.
  const c = local + data.length;
  v.setUint32(c, 0x02014b50, true);
  v.setUint16(c + 4, 20, true);
  v.setUint16(c + 6, 20, true);
  v.setUint16(c + 14, DOS_DATE, true);
  v.setUint32(c + 16, crc, true);
  v.setUint32(c + 20, data.length, true);
  v.setUint32(c + 24, data.length, true);
  v.setUint16(c + 28, nameBytes.length, true);
  zip.set(nameBytes, c + 46);
  // End of central directory record.
  const e = c + central;
  v.setUint32(e, 0x06054b50, true);
  v.setUint16(e + 8, 1, true);
  v.setUint16(e + 10, 1, true);
  v.setUint32(e + 12, central, true);
  v.setUint32(e + 16, c, true);
  return zip;
}

/** Bytes as base64 (in slices: a spread of the whole would pass too many arguments). */
export function base64Of(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

async function sha256Of(file: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) {
    return null; // not a secure page
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomName(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- The upload ---------------------------------------------------------------------------------------------------------

/** Where an upload is: its folder made, its pieces sent (`sent` of `pieces`), checked, installed. */
export type EsfUploadPhase = "preparing" | "sending" | "checking" | "installing" | "done";

/** A refusal of the command service, said plainly: its password wrong (400) or the service off (503). */
function commandRefusal(err: unknown): unknown {
  if (err instanceof EsfCallError && err.status === 400) {
    return new Error("ESF's command service refused the password");
  }
  if (err instanceof EsfCallError && err.status === 503) {
    return new Error("ESF's command service is off (Configuration › Command Service: Enable)");
  }
  return err;
}

/** A failure worth one more try (a timeout, the gateway's own error): not an answer of ESF's (an HTTP status). */
const retriable = (err: unknown): boolean => !(err instanceof EsfCallError && err.status !== null);

/**
 * One package uploaded through the command service: `send` (its folder, its pieces, the check), `install` (ESF asked, then
 * waited for — the file moved out), `cleanUp` (its folder removed — always, whatever happened). `stop` ends it after the piece
 * being sent.
 */
export class EsfPackageUpload {
  readonly dir = `/tmp/tb-upload-${randomName()}`;
  readonly url = `file://${this.dir}/${PACKAGE_FILE}`;
  readonly pieces: number;
  sent = 0;
  phase: EsfUploadPhase = "preparing";
  private stopped = false;
  private made = false;

  constructor(
    private readonly client: EsfClient,
    private readonly file: File,
    private readonly password: string
  ) {
    this.pieces = Math.max(1, Math.ceil(file.size / ESF_UPLOAD_PIECE_BYTES));
  }

  /** Stop after the piece being sent (the page left, Cancel). */
  stop(): void {
    this.stopped = true;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Its folder made, every piece written into the package, its size and SHA-256 checked against the file's. */
  async send(progress: () => void): Promise<void> {
    this.phase = "preparing";
    progress();
    await this.run(`mkdir -p ${this.dir}`, "/tmp");
    this.made = true;
    this.phase = "sending";
    for (let i = 0; i < this.pieces; i++) {
      if (this.stopped) {
        throw new Error("Stopped");
      }
      const from = i * ESF_UPLOAD_PIECE_BYTES;
      const piece = new Uint8Array(await this.file.slice(from, from + ESF_UPLOAD_PIECE_BYTES).arrayBuffer());
      const part = `part-${String(i).padStart(5, "0")}`;
      const zipBytes = base64Of(storedZip(part, piece));
      // In its place in the package (a piece sent twice writes the same bytes again), then gone.
      await this.run(`dd if=${part} of=${PACKAGE_FILE} bs=${ESF_UPLOAD_PIECE_BYTES} seek=${i} conv=notrunc && rm -f ${part}`, this.dir, { zipBytes });
      this.sent = i + 1;
      progress();
    }
    this.phase = "checking";
    progress();
    const [check, hash] = await Promise.all([this.run(`wc -c < ${PACKAGE_FILE}; sha256sum ${PACKAGE_FILE} 2>/dev/null || true`, this.dir), sha256Of(this.file)]);
    const [sizeLine = "", hashLine = ""] = check.stdout.trim().split(/\s*\n\s*/);
    if (Number(sizeLine.trim()) !== this.file.size) {
      throw new Error(`The file on the unit isn't whole (${sizeLine.trim() || "?"} of ${this.file.size} bytes)`);
    }
    const unitHash = hashLine.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (hash && /^[0-9a-f]{64}$/.test(unitHash) && unitHash !== hash) {
      throw new Error("The file on the unit doesn't match the one sent (its SHA-256)");
    }
  }

  /** ESF asked to install it from the unit's disk, then waited for: true once it has moved the file into its packages folder. */
  async install(): Promise<boolean> {
    this.phase = "installing";
    await firstValueFrom(this.client.call("esfInstallPackage", { url: this.url }));
    const until = Date.now() + ESF_UPLOAD_INSTALL_WAIT_MS;
    while (Date.now() < until && !this.stopped) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const left = await this.run(`test -e ${PACKAGE_FILE} && echo waiting || echo moved`, this.dir).catch(() => null);
      if (left?.stdout.trim() === "moved") {
        this.phase = "done";
        return true;
      }
    }
    return false;
  }

  /**
   * Its folder removed (whatever's left in it); a failure only logged — /tmp is cleared at the unit's next start anyway. Left
   * alone when the page stopped waiting while ESF may still be installing from it (ESF moves the file out once it's done: taken
   * from under it, the install wouldn't be recorded for the unit's next start).
   */
  async cleanUp(): Promise<void> {
    if (!this.made || (this.stopped && this.phase === "installing")) {
      return;
    }
    await this.run(`rm -rf ${this.dir}`, "/tmp").catch((err) => console.warn("ESF upload: couldn't remove", this.dir, err));
  }

  /** A command run by ESF's command service (in a shell), its exit code 0 — else its error. One more try where it may not have run. */
  private async run(command: string, workingDirectory: string, extra: Record<string, unknown> = {}): Promise<EsfCommandResult> {
    const body: Record<string, unknown> = { command, workingDirectory, ...extra };
    if (this.password) {
      body["password"] = this.password;
    }
    let result: EsfCommandResult;
    try {
      result = await this.call(body);
    } catch (err) {
      if (!retriable(err) || this.stopped) {
        throw commandRefusal(err);
      }
      result = await this.call(body).catch((again) => {
        throw commandRefusal(again);
      });
    }
    if (result.timedOut) {
      throw new Error(`"${command.split(" ")[0]}" timed out on the unit`);
    }
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim().split("\n").pop() || `"${command.split(" ")[0]}" failed on the unit (exit code ${result.exitCode ?? "?"})`);
    }
    return result;
  }

  private async call(body: Record<string, unknown>): Promise<EsfCommandResult> {
    return parseEsfCommandResult(await firstValueFrom(this.client.call("esfCommand", body)));
  }
}
