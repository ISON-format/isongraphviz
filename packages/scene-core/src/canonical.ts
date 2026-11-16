// packages/scene-core/src/canonical.ts
import { IgsError } from "./errors.js";

export type CJValue = string | boolean | number | CJValue[] | { [key: string]: CJValue };

export function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/** RFC 8785 string form. JSON.stringify output equals it for strings without lone surrogates (lowercase \u00xx, DEL and U+2028 literal). */
function quote(s: string): string {
  if (hasLoneSurrogate(s)) throw new IgsError("INVALID_SCENE", "INVALID_STRING");
  return JSON.stringify(s);
}

function serialize(v: CJValue, signed: boolean): string {
  if (typeof v === "string") return quote(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v) || (!signed && v < 0) || Object.is(v, -0)) throw new IgsError("INVALID_SCENE", "INVALID_NUMBER");
    return String(v);
  }
  if (Array.isArray(v)) return `[${v.map((x) => serialize(x, signed)).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v).sort(); // default sort = UTF-16 code units = RFC 8785 key order
    const parts = keys.map((k) => {
      const item = v[k];
      if (item === undefined) throw new IgsError("INVALID_SCENE", "INVALID_VALUE", k);
      return `${quote(k)}:${serialize(item, signed)}`;
    });
    return `{${parts.join(",")}}`;
  }
  throw new IgsError("INVALID_SCENE", "INVALID_VALUE");
}

/** IGS-CJ/1. Unchanged: no negative numbers. */
export function canonicalize(v: CJValue): string { return serialize(v, false); }
/** IGL-CJ/1: IGS-CJ/1 plus negative safe integers (never -0). Deliberately a separate name; scenes must never use it. */
export function canonicalizeSigned(v: CJValue): string { return serialize(v, true); }
export const canonicalBytes = (v: CJValue): Uint8Array => new TextEncoder().encode(canonicalize(v));
export const canonicalBytesSigned = (v: CJValue): Uint8Array => new TextEncoder().encode(canonicalizeSigned(v));

export interface CJLimits { signed: boolean; maxDepth: number }
export interface CJViolation { reason: "INVALID_STRING" | "INVALID_NUMBER" | "TOO_DEEP" | "INVALID_VALUE"; path: string }
/** First violation of the canonical value domain, or null. Never throws. `maxDepth` nested arrays/objects are allowed. */
export function cjViolation(v: unknown, path: string, limits: CJLimits, depth = 0): CJViolation | null {
  if (typeof v === "string") return hasLoneSurrogate(v) ? { reason: "INVALID_STRING", path } : null;
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isSafeInteger(v) && (limits.signed || v >= 0) && !Object.is(v, -0) ? null : { reason: "INVALID_NUMBER", path };
  if (Array.isArray(v)) {
    if (depth >= limits.maxDepth) return { reason: "TOO_DEEP", path };
    for (let i = 0; i < v.length; i++) { const r = cjViolation(v[i], `${path}[${i}]`, limits, depth + 1); if (r) return r; }
    return null;
  }
  if (typeof v === "object" && v !== null) {
    if (depth >= limits.maxDepth) return { reason: "TOO_DEEP", path };
    for (const [k, x] of Object.entries(v)) { const r = cjViolation(x, `${path}.${k}`, limits, depth + 1); if (r) return r; }
    return null;
  }
  return { reason: "INVALID_VALUE", path };
}
