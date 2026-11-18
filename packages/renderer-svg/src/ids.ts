// src/ids.ts - element ids: the reversible, injective encoding of an ElementAddress (design 7.3). Carries its own UTF-8 and canonical
// string writer (27 section 14: renderer packages depend on renderer-core only).
import { IgrError } from "isongraph-visualize-renderer-core";
import type { ElementAddress } from "isongraph-visualize-renderer-core";

export const ID_PREFIX = /^[a-z][a-z0-9-]{0,31}$/;
export const MAX_ID_HEX_DIGITS = 4_194_304;
const MAX_JSON_DEPTH = 3;
const HEXCHARS = "0123456789abcdef";

const schema = (detail: string): IgrError => new IgrError("INVALID_INPUT", "SCHEMA", undefined, detail);

export function checkPrefix(p: unknown): string {
  if (typeof p !== "string") throw schema("idPrefix: string expected");
  if (!ID_PREFIX.test(p)) throw new IgrError("INVALID_INPUT", "INVALID_VALUE", "idPrefix", "does not match /^[a-z][a-z0-9-]{0,31}$/");
  return p;
}

/** Does the string hold a lone surrogate? */
export function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) i++; else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/** Exact UTF-8 length of a string without lone surrogates (a lone surrogate counts 3, as U+FFFD would). */
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

/** Lowercase hex of the UTF-8 bytes of a string without lone surrogates. */
export function utf8Hex(s: string): string {
  let out = "";
  const push = (b: number): void => { out += HEXCHARS.charAt(b >> 4) + HEXCHARS.charAt(b & 15); };
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(i + 1) - 0xdc00); i++; }
    if (c < 0x80) push(c);
    else if (c < 0x800) { push(0xc0 | (c >> 6)); push(0x80 | (c & 63)); }
    else if (c < 0x10000) { push(0xe0 | (c >> 12)); push(0x80 | ((c >> 6) & 63)); push(0x80 | (c & 63)); }
    else { push(0xf0 | (c >> 18)); push(0x80 | ((c >> 12) & 63)); push(0x80 | ((c >> 6) & 63)); push(0x80 | (c & 63)); }
  }
  return out;
}

/** Strict UTF-8 decoding of bytes: undefined on an overlong form, a surrogate, a value above U+10FFFF or a truncated sequence. */
export function utf8Decode(b: Uint8Array): string | undefined {
  let out = "";
  const n = b.length;
  let i = 0;
  while (i < n) {
    const x = b[i]!;
    let cp: number, need: number, min: number;
    if (x < 0x80) { out += String.fromCharCode(x); i++; continue; }
    if (x >= 0xc2 && x <= 0xdf) { cp = x & 0x1f; need = 1; min = 0x80; }
    else if (x >= 0xe0 && x <= 0xef) { cp = x & 0x0f; need = 2; min = 0x800; }
    else if (x >= 0xf0 && x <= 0xf4) { cp = x & 0x07; need = 3; min = 0x10000; }
    else return undefined;
    if (i + need >= n) return undefined; // truncated sequence
    for (let k = 1; k <= need; k++) {
      const y = b[i + k]!;
      if ((y & 0xc0) !== 0x80) return undefined;
      cp = (cp << 6) | (y & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return undefined;
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}

function quote(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += "\\\\";
    else if (c === 8) out += "\\b";
    else if (c === 9) out += "\\t";
    else if (c === 10) out += "\\n";
    else if (c === 12) out += "\\f";
    else if (c === 13) out += "\\r";
    else if (c < 0x20) out += "\\u00" + HEXCHARS.charAt(c >> 4) + HEXCHARS.charAt(c & 15);
    else out += s.charAt(i);
  }
  return out + '"';
}

const nodeJson = (id: string, type: string): string => `{"id":${quote(id)},"type":${quote(type)}}`;

const isRecord = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const keysAre = (o: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};
/** The canonical JSON text of a wire node or edge address of the given kind; undefined when it is not of exactly that shape (strings only, no lone surrogate). */
function canonicalWire(kind: "n" | "e", w: unknown): string | undefined {
  const str = (v: unknown): v is string => typeof v === "string" && !hasLoneSurrogate(v);
  const wireNode = (v: unknown): string | undefined => {
    if (!isRecord(v) || !keysAre(v, ["id", "type"])) return undefined;
    const id = v["id"], type = v["type"];
    return str(id) && str(type) ? nodeJson(id, type) : undefined;
  };
  if (kind === "n") return wireNode(w);
  if (!isRecord(w) || !keysAre(w, ["ord", "rel", "src", "tgt"])) return undefined;
  const ord = w["ord"], rel = w["rel"], src = wireNode(w["src"]), tgt = wireNode(w["tgt"]);
  if (!str(ord) || !str(rel) || src === undefined || tgt === undefined) return undefined;
  return `{"ord":${quote(ord)},"rel":${quote(rel)},"src":${src},"tgt":${tgt}}`;
}

/** elementDomId(P, address) = P "-n-" | "-e-" hex(UTF-8(canonical JSON of the wire address)) (7.3). */
export function elementDomId(idPrefix: string, address: ElementAddress): string {
  const p = checkPrefix(idPrefix);
  if (!isRecord(address)) throw schema("ElementAddress expected");
  const keys = Object.keys(address);
  if (keys.length !== 1) throw schema("ElementAddress expected: exactly one of node, edge");
  const kind = keys[0] === "node" ? "n" : keys[0] === "edge" ? "e" : undefined;
  if (kind === undefined) throw schema("ElementAddress expected: exactly one of node, edge");
  const json = canonicalWire(kind, (address as Record<string, unknown>)[keys[0]!]);
  if (json === undefined) throw schema("malformed wire address");
  return p + "-" + kind + "-" + utf8Hex(json);
}

/** Maximum nesting of braces and brackets outside strings (a scan, no parse). */
function jsonDepth(t: string): number {
  let depth = 0, max = 0, inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t.charAt(i);
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") { depth++; if (depth > max) max = depth; }
    else if (c === "}" || c === "]") depth--;
  }
  return max;
}

const hexVal = (c: number): number => (c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : -1);

/** decodeElementId(P, id) (7.3): strict, O(length), undefined for everything that is not the canonical id of an address; a non-string argument is SCHEMA. */
export function decodeElementId(idPrefix: string, id: string): ElementAddress | undefined {
  if (typeof idPrefix !== "string" || typeof id !== "string") throw schema("string expected");
  if (!ID_PREFIX.test(idPrefix)) return undefined;
  const head = idPrefix + "-";
  if (!id.startsWith(head) || id.length < head.length + 2 || id.charAt(head.length + 1) !== "-") return undefined;
  const k = id.charAt(head.length);
  if (k !== "n" && k !== "e") return undefined;
  const digits = id.length - (head.length + 2);
  if (digits === 0 || digits % 2 !== 0 || digits > MAX_ID_HEX_DIGITS) return undefined;
  const bytes = new Uint8Array(digits / 2);
  for (let i = 0, j = head.length + 2; i < bytes.length; i++, j += 2) {
    const hi = hexVal(id.charCodeAt(j)), lo = hexVal(id.charCodeAt(j + 1));
    if (hi < 0 || lo < 0) return undefined;
    bytes[i] = hi * 16 + lo;
  }
  const text = utf8Decode(bytes);
  if (text === undefined || jsonDepth(text) > MAX_JSON_DEPTH) return undefined;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return undefined; }
  const canon = canonicalWire(k, value);
  if (canon === undefined || canon !== text) return undefined;
  const w = value as Record<string, unknown>;
  if (k === "n") return { node: { id: w["id"] as string, type: w["type"] as string } };
  const s = w["src"] as Record<string, string>, t = w["tgt"] as Record<string, string>;
  return { edge: { ord: w["ord"] as string, rel: w["rel"] as string, src: { id: s["id"]!, type: s["type"]! }, tgt: { id: t["id"]!, type: t["type"]! } } };
}
