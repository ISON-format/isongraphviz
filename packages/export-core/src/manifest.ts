// src/manifest.ts - the export manifest `igr-export/1` (design 11.3): an INTEGRITY manifest, IGR-CJ/1 of exactly the listed keys, no free text, no timestamp,
// no graph string. `parseExportManifest` is a strict reader; it never repairs. The single canonical writer is `serializeExportManifest`.
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { EXPORT_FORMAT, HEX64, bytesArg, bytesLimit, exportError, plainEntries, utf8Decode } from "./limits.js";

export type ArtifactName = "layout" | "png" | "scene" | "state" | "svg";
export interface ArtifactEntry { bytes: number; media_type: string; name: ArtifactName; sha256: string }
export interface ExportManifest {
  artifacts: ArtifactEntry[]; export: "igr-export/1"; igr: "IGR/1"; layout_sha256: string; scene_sha256: string; source_sha256: string; state_sha256: string; svg_format?: string;
}
export const MEDIA_TYPES: ReadonlyMap<string, string> = new Map([
  ["layout", "application/octet-stream"], ["png", "image/png"], ["scene", "application/octet-stream"], ["state", "application/octet-stream"], ["svg", "image/svg+xml"],
]);
const NAMES = ["layout", "png", "scene", "state", "svg"];
const MAX_DEPTH = 6;

export const serializeExportManifest = (m: ExportManifest): Uint8Array => canonicalBytesSigned(m as unknown as CJValue);

/** The nesting depth above 6 is refused by a scan that respects strings, before any parse (a bracket bomb is SCHEMA, never a stack error). */
function scanDepth(text: string): void {
  let depth = 0, inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inStr) { if (c === 0x5c) i++; else if (c === 0x22) inStr = false; continue; }
    if (c === 0x22) inStr = true;
    else if (c === 0x5b || c === 0x7b) { if (++depth > MAX_DEPTH) throw exportError("SCHEMA", "manifest", "nesting deeper than 6"); }
    else if (c === 0x5d || c === 0x7d) depth--;
  }
}

/** The strict reader with its size bound (verifyExportBundle passes `maxManifestBytes`; parseExportManifest uses the default). */
export function readManifest(bytes: Uint8Array, maxBytes: number): ExportManifest {
  if (bytes.length > maxBytes) throw bytesLimit("manifest", `the manifest exceeds ${maxBytes} bytes`);
  const text = utf8Decode(bytes);
  if (text === undefined) throw exportError("SCHEMA", "manifest", "not valid UTF-8");
  scanDepth(text);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw exportError("SCHEMA", "manifest", "not JSON"); }
  const top = plainEntries(raw);
  if (top === undefined) throw exportError("SCHEMA", "manifest", "an object expected");
  const allowed = ["artifacts", "export", "igr", "layout_sha256", "scene_sha256", "source_sha256", "state_sha256", "svg_format"];
  for (const k of top.keys()) if (!allowed.includes(k)) throw exportError("SCHEMA", `manifest.${k}`, "unknown key");
  for (const k of allowed.slice(0, 7)) if (!top.has(k)) throw exportError("SCHEMA", `manifest.${k}`, "missing key");
  if (top.get("export") !== EXPORT_FORMAT || top.get("igr") !== "IGR/1") throw exportError("SCHEMA", "manifest", "export and igr must be igr-export/1 and IGR/1");
  for (const k of ["layout_sha256", "scene_sha256", "source_sha256", "state_sha256"]) { const v = top.get(k); if (typeof v !== "string" || !HEX64.test(v)) throw exportError("SCHEMA", `manifest.${k}`, "64 lowercase hex characters expected"); }
  if (top.has("svg_format") && typeof top.get("svg_format") !== "string") throw exportError("SCHEMA", "manifest.svg_format");
  const arr = top.get("artifacts");
  if (!Array.isArray(arr)) throw exportError("SCHEMA", "manifest.artifacts", "an array expected");
  const entries: ArtifactEntry[] = [];
  const names: unknown[] = [];
  for (let i = 0; i < arr.length; i++) {
    const e = plainEntries(arr[i] as unknown);
    const p = `manifest.artifacts[${i}]`;
    if (e === undefined || e.size !== 4 || !["bytes", "media_type", "name", "sha256"].every((k) => e.has(k))) throw exportError("SCHEMA", p, "closed object {bytes, media_type, name, sha256} expected");
    const n = e.get("name"), b = e.get("bytes"), s = e.get("sha256"), mt = e.get("media_type");
    if (typeof n !== "string" || typeof mt !== "string" || typeof s !== "string" || typeof b !== "number" || !Number.isSafeInteger(b) || b < 0 || !HEX64.test(s)) throw exportError("SCHEMA", p);
    if (Object.is(b, -0)) throw exportError("SCHEMA", p, "-0 is not an integer of the canonical form"); // R32-07: not the foreign INVALID_NUMBER of the re-serialisation
    names.push(n);
    entries.push({ bytes: b, media_type: mt, name: n as ArtifactName, sha256: s });
  }
  for (const e of entries) if (!NAMES.includes(e.name)) throw exportError("UNKNOWN_ARTIFACT", "manifest.artifacts", "unknown artifact name");
  for (let i = 1; i < entries.length; i++) if (!(entries[i - 1]!.name < entries[i]!.name)) throw exportError("SCHEMA", "manifest.artifacts", "artifacts must be strictly ascending by name");
  for (const e of entries) if (MEDIA_TYPES.get(e.name) !== e.media_type) throw exportError("SCHEMA", "manifest.artifacts", "media_type differs from design 11.1");
  for (const need of ["layout", "scene", "state"]) if (!entries.some((e) => e.name === need)) throw exportError("SCHEMA", "manifest.artifacts", `${need} must be listed`);
  const hasSvg = entries.some((e) => e.name === "svg");
  if (hasSvg !== top.has("svg_format")) throw exportError("SCHEMA", "manifest.svg_format", "present iff an svg artifact is listed");
  const m: ExportManifest = {
    artifacts: entries, export: EXPORT_FORMAT, igr: "IGR/1", layout_sha256: top.get("layout_sha256") as string, scene_sha256: top.get("scene_sha256") as string,
    source_sha256: top.get("source_sha256") as string, state_sha256: top.get("state_sha256") as string,
  };
  if (hasSvg) m.svg_format = top.get("svg_format") as string;
  const again = serializeExportManifest(m);
  if (again.length !== bytes.length || again.some((x, i) => x !== bytes[i])) throw exportError("NON_CANONICAL", "manifest", "not the canonical bytes");
  return m;
}

export const parseExportManifest = (bytes: Uint8Array): ExportManifest => readManifest(bytesArg(bytes, "manifest"), 1_048_576);
