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

export function canonicalize(v: CJValue): string {
  if (typeof v === "string") return quote(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v) || v < 0 || Object.is(v, -0)) throw new IgsError("INVALID_SCENE", "INVALID_NUMBER");
    return String(v);
  }
  if (Array.isArray(v)) return `[${v.map((x) => canonicalize(x)).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v).sort(); // default sort = UTF-16 code units = RFC 8785 key order
    const parts = keys.map((k) => {
      const item = v[k];
      if (item === undefined) throw new IgsError("INVALID_SCENE", "INVALID_VALUE", k);
      return `${quote(k)}:${canonicalize(item)}`;
    });
    return `{${parts.join(",")}}`;
  }
  throw new IgsError("INVALID_SCENE", "INVALID_VALUE");
}

export const canonicalBytes = (v: CJValue): Uint8Array => new TextEncoder().encode(canonicalize(v));
