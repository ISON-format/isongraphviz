// src/limits.ts - the format string, the limits and the small shared helpers of export-core (design 11, 14.1). No `node:*`, no DOM.
import { IaError } from "isongraph-visualize-interaction-core";

export const EXPORT_FORMAT = "igr-export/1";
export const SVG_FORMAT_NAME = "igr-svg/1";
/** PROVISIONAL, UNMEASURED safety caps (design 3.3, 14.1). */
export const DEFAULT_EXPORT_LIMITS: Readonly<{ maxArtifactBytes: 268_435_456; maxPngBytes: 67_108_864; maxManifestBytes: 1_048_576 }> = Object.freeze({ maxArtifactBytes: 268_435_456, maxPngBytes: 67_108_864, maxManifestBytes: 1_048_576 } as const);
export type ExportLimits = { maxArtifactBytes: number; maxPngBytes: number; maxManifestBytes: number };

export const exportError = (reason: string, path?: string, detail?: string): IaError => new IaError("INVALID_EXPORT", reason, path, detail);
export const bytesLimit = (path: string, detail: string): IaError => new IaError("RESOURCE_LIMIT", "BYTES_LIMIT", path, detail);
export const HEX64 = /^[0-9a-f]{64}$/;

/** Own data: a plain object (Object.prototype or null prototype) as a Map, each property read once; a getter or an exotic object gives undefined. */
export function plainEntries(v: unknown): Map<string, unknown> | undefined {
  try {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
    const p = Object.getPrototypeOf(v) as unknown;
    if (p !== Object.prototype && p !== null) return undefined;
    const out = new Map<string, unknown>();
    for (const k of Object.keys(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (d === undefined || d.get !== undefined || d.set !== undefined) return undefined;
      if (d.value !== undefined) out.set(k, d.value as unknown);
    }
    return out;
  } catch { return undefined; }
}

/** The limits option: unknown key INVALID_CONFIG/SCHEMA, a non-integer NOT_INTEGER, outside 0..2^31 OUT_OF_RANGE. */
export function readLimits(v: unknown, base: ExportLimits): ExportLimits {
  const out = { ...base };
  if (v === undefined) return out;
  const m = plainEntries(v);
  if (m === undefined) throw new IaError("INVALID_CONFIG", "SCHEMA", "limits");
  for (const [k, x] of m) {
    if (k !== "maxArtifactBytes" && k !== "maxPngBytes" && k !== "maxManifestBytes") throw new IaError("INVALID_CONFIG", "SCHEMA", `limits.${k}`);
    if (typeof x !== "number") throw new IaError("INVALID_CONFIG", "SCHEMA", `limits.${k}`);
    if (!Number.isInteger(x)) throw new IaError("INVALID_CONFIG", "NOT_INTEGER", `limits.${k}`);
    if (x < 0 || x > 2 ** 40) throw new IaError("INVALID_CONFIG", "OUT_OF_RANGE", `limits.${k}`);
    out[k] = x;
  }
  return out;
}

/** A REAL copy of the bytes: `Uint8Array.prototype.slice` of a Node `Buffer` is a view of the same memory (audit I-1), `new Uint8Array(x)` always copies. */
export const copyBytes = (b: Uint8Array): Uint8Array => new Uint8Array(b);
/** A binary argument: a Uint8Array (a Buffer included), else INVALID_INPUT/SCHEMA (fail closed, never a raw TypeError). Returns a real copy. */
export function bytesArg(v: unknown, path: string): Uint8Array {
  if (!(v instanceof Uint8Array)) throw new IaError("INVALID_INPUT", "SCHEMA", path, "a Uint8Array expected");
  return copyBytes(v);
}

/** Sentinel of copyData: not plain data (a getter, a class instance, a function, too deep). */
export const NOT_PLAIN: unique symbol = Symbol("not-plain");
/** An owned deep copy of plain JSON-like data, each property read once; objects keep a null prototype; NOT_PLAIN for anything else or nesting beyond maxDepth. */
export function copyData(v: unknown, maxDepth: number): unknown {
  if (maxDepth < 0) return NOT_PLAIN;
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (let i = 0; i < v.length; i++) {
      const d = Object.getOwnPropertyDescriptor(v, String(i));
      if (d === undefined || d.get !== undefined || d.set !== undefined) return NOT_PLAIN;
      const c = copyData(d.value as unknown, maxDepth - 1);
      if (c === NOT_PLAIN) return NOT_PLAIN;
      out.push(c);
    }
    return out;
  }
  const m = plainEntries(v);
  if (m === undefined) return NOT_PLAIN;
  const out = Object.create(null) as Record<string, unknown>;
  for (const [k, x] of m) { const c = copyData(x, maxDepth - 1); if (c === NOT_PLAIN) return NOT_PLAIN; Object.defineProperty(out, k, { value: c, enumerable: true, writable: true, configurable: true }); }
  return out;
}

/** UTF-8 of a string with the semantics of TextEncoder: a lone surrogate becomes U+FFFD (EF BF BD). Two passes: the output is allocated once. */
export function utf8Encode(s: string): Uint8Array {
  const cp = (i: number): { c: number; n: number } => {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) return { c: 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(i + 1) - 0xdc00), n: 2 };
    return { c: c >= 0xd800 && c <= 0xdfff ? 0xfffd : c, n: 1 };
  };
  let len = 0;
  for (let i = 0; i < s.length;) { const { c, n } = cp(i); len += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; i += n; }
  const out = new Uint8Array(len);
  let at = 0;
  for (let i = 0; i < s.length;) {
    const { c, n } = cp(i);
    i += n;
    if (c < 0x80) out[at++] = c;
    else if (c < 0x800) { out[at++] = 0xc0 | (c >> 6); out[at++] = 0x80 | (c & 63); }
    else if (c < 0x10000) { out[at++] = 0xe0 | (c >> 12); out[at++] = 0x80 | ((c >> 6) & 63); out[at++] = 0x80 | (c & 63); }
    else { out[at++] = 0xf0 | (c >> 18); out[at++] = 0x80 | ((c >> 12) & 63); out[at++] = 0x80 | ((c >> 6) & 63); out[at++] = 0x80 | (c & 63); }
  }
  return out;
}
/** Strict UTF-8 decoding: undefined on an overlong form, a surrogate, a value above U+10FFFF or a truncated sequence. */
export function utf8Decode(b: Uint8Array): string | undefined {
  let out = "";
  for (let i = 0; i < b.length;) {
    const c = b[i]!;
    let cp: number, n: number, min: number;
    if (c < 0x80) { out += String.fromCharCode(c); i++; continue; }
    if (c >= 0xc2 && c <= 0xdf) { n = 1; cp = c & 0x1f; min = 0x80; } else if (c >= 0xe0 && c <= 0xef) { n = 2; cp = c & 0x0f; min = 0x800; } else if (c >= 0xf0 && c <= 0xf4) { n = 3; cp = c & 0x07; min = 0x10000; } else return undefined;
    for (let k = 1; k <= n; k++) { const x = b[i + k]; if (x === undefined || (x & 0xc0) !== 0x80) return undefined; cp = (cp << 6) | (x & 0x3f); }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return undefined;
    out += String.fromCodePoint(cp);
    i += n + 1;
  }
  return out;
}
export const hex = (b: Uint8Array): string => { let s = ""; for (const x of b) s += (x < 16 ? "0" : "") + x.toString(16); return s; };
