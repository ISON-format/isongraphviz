// src/bytes.ts - the package's own byte helpers (design 4.2, 4.6, 12): the canonical JSON writer, UTF-8 encode and strict decode by hand (the core entry has
// no TextEncoder or TextDecoder and no node:* import), the LF-only line lexer of every reader, and the numeric helpers of the integer plan. display-list
// carries the same text for its own readers; it exports none of it, and a renderer imports no internals of a library.
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

/** The exact UTF-8 length of a string (a lone surrogate counts as U+FFFD, 3 bytes). */
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

/** The UTF-8 bytes of a string; a lone surrogate is written as U+FFFD (as TextEncoder does). */
export function utf8Encode(s: string): Uint8Array {
  const out = new Uint8Array(utf8Length(s));
  let at = 0;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) {
      c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(i + 1) - 0xdc00);
      i++;
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out[at++] = c;
    else if (c < 0x800) { out[at++] = 0xc0 | (c >> 6); out[at++] = 0x80 | (c & 0x3f); }
    else if (c < 0x10000) { out[at++] = 0xe0 | (c >> 12); out[at++] = 0x80 | ((c >> 6) & 0x3f); out[at++] = 0x80 | (c & 0x3f); }
    else { out[at++] = 0xf0 | (c >> 18); out[at++] = 0x80 | ((c >> 12) & 0x3f); out[at++] = 0x80 | ((c >> 6) & 0x3f); out[at++] = 0x80 | (c & 0x3f); }
  }
  return out;
}

/** Strict UTF-8 decoding: `undefined` for a truncated, overlong, surrogate or out-of-range sequence. A BOM is kept as U+FEFF. */
export function utf8Decode(b: Uint8Array): string | undefined {
  const parts: string[] = [];
  let chunk = "";
  const n = b.length;
  let i = 0;
  while (i < n) {
    const x = b[i]!;
    let cp: number, need: number, min: number;
    if (x < 0x80) { chunk += String.fromCharCode(x); i++; }
    else {
      if (x >= 0xc2 && x <= 0xdf) { cp = x & 0x1f; need = 1; min = 0x80; }
      else if (x >= 0xe0 && x <= 0xef) { cp = x & 0x0f; need = 2; min = 0x800; }
      else if (x >= 0xf0 && x <= 0xf4) { cp = x & 0x07; need = 3; min = 0x10000; }
      else return undefined;
      if (i + need >= n) return undefined;
      for (let k = 1; k <= need; k++) {
        const y = b[i + k]!;
        if ((y & 0xc0) !== 0x80) return undefined;
        cp = (cp << 6) | (y & 0x3f);
      }
      if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return undefined;
      chunk += String.fromCodePoint(cp);
      i += need + 1;
    }
    if (chunk.length >= 8192) { parts.push(chunk); chunk = ""; }
  }
  parts.push(chunk);
  return parts.join("");
}

/** floorDiv(a, b) for b > 0 rounds toward minus infinity (bigint `/` truncates toward zero). */
export function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}
/** divRound(a, b) = floorDiv(2a + b, 2b), b > 0: round half toward +infinity (27 3). */
export const divRound = (a: bigint, b: bigint): bigint => floorDiv(2n * a + b, 2n * b);

/** The nesting depth of a line is at most 3, measured by a scan that skips string content (a quote opens a string, a backslash escapes the next character). */
export function nestingOk(line: string, max = 3): boolean {
  let depth = 0, inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++;
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) inString = true;
    else if (c === 0x5b || c === 0x7b) { if (++depth > max) return false; }
    else if (c === 0x5d || c === 0x7d) depth--;
  }
  return true;
}
