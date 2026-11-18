// src/canon.ts - the package's own canonical writer (design 4.2): IGS-CJ/1 strings, object keys in UTF-16 order, integers only.
import { IgrError } from "isongraph-visualize-renderer-core";

const bad = (reason: string, detail: string): IgrError => new IgrError("INVALID_INPUT", reason, undefined, detail);
const HEX = "0123456789abcdef";

/** A JSON string literal as IGS/1 5.4 writes it: `"` and `\` escaped, U+0000-U+001F as `\b \t \n \f \r` or `\u00xx` (lower-case hex), every other scalar literal. */
export function canonicalString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += "\\\\";
    else if (c < 0x20) {
      out += c === 8 ? "\\b" : c === 9 ? "\\t" : c === 10 ? "\\n" : c === 12 ? "\\f" : c === 13 ? "\\r" : "\\u00" + HEX.charAt(c >> 4) + HEX.charAt(c & 15);
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d < 0xdc00 || d > 0xdfff) throw bad("SCHEMA", "a lone surrogate cannot be written");
      out += s.charAt(i) + s.charAt(i + 1);
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) throw bad("SCHEMA", "a lone surrogate cannot be written");
    else out += s.charAt(i);
  }
  return out + '"';
}

/** The canonical text of a JSON value: no whitespace, keys in UTF-16 order, integers in decimal (never -0, never a fraction or exponent). */
export function canonicalJson(v: unknown): string {
  if (typeof v === "string") return canonicalString(v);
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw bad("SCHEMA", "an integer within the safe range expected");
    return v === 0 ? "0" : String(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === null) return "null";
  if (Array.isArray(v)) {
    let out = "[";
    for (let i = 0; i < v.length; i++) out += (i === 0 ? "" : ",") + canonicalJson(v[i]);
    return out + "]";
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    let out = "{";
    for (let i = 0; i < keys.length; i++) out += (i === 0 ? "" : ",") + canonicalString(keys[i]!) + ":" + canonicalJson(o[keys[i]!]);
    return out + "}";
  }
  throw bad("SCHEMA", "not JSON data");
}

/** The exact UTF-8 length of a string without a lone surrogate (a lone one counts as U+FFFD, 3 bytes). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
