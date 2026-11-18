// src/utf8.ts - UTF-8 encode and strict decode by hand: the core entries use no TextEncoder or TextDecoder (the lib is ES2022 without DOM) and no node:* import.
import { utf8Length } from "./canon.js";

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
