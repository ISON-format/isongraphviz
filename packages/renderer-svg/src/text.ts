// src/text.ts - XML-safe substitution, escapes and the drawn label (design sections 7.1, 7.2, 7.5a). Strings only; no locale, no Intl.

export const LABEL_MAX_UNITS = 24;
const ELLIPSIS = "…";

/** Is the scalar keepable in XML 1.0 (7.1)? */
const keep = (c: number): boolean =>
  c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);

/** xs(s): per Unicode scalar, keep the XML-legal scalars and replace every other one (and any lone surrogate) by U+FFFD (7.1, D-XML). */
export function xs(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { out += s.charAt(i) + s.charAt(i + 1); i++; continue; }
    }
    out += c >= 0xd800 && c <= 0xdfff ? "�" : keep(c) ? s.charAt(i) : "�";
  }
  return out;
}

/** TEXT(s) (7.2): xs, then & < > and LF, CR; TAB stays literal. */
export function TEXT(s: string): string {
  let out = "";
  for (const ch of xs(s)) {
    out += ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "\n" ? "&#10;" : ch === "\r" ? "&#13;" : ch;
  }
  return out;
}

/** ATTR(s) (7.2): xs, then & < > " and TAB, LF, CR. */
export function ATTR(s: string): string {
  let out = "";
  for (const ch of xs(s)) {
    out += ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : ch === "\t" ? "&#9;" : ch === "\n" ? "&#10;" : ch === "\r" ? "&#13;" : ch;
  }
  return out;
}

/** The label with TAB, LF, CR replaced by a space, after xs (7.5a, first half). */
export function flatLabel(s: string): string {
  let t = "";
  for (let i = 0; i < s.length; i++) { const c = s.charAt(i); t += c === "\t" || c === "\n" || c === "\r" ? " " : c; }
  return xs(t);
}

/** dl(s) (7.5a): flat label, truncated to at most 24 UTF-16 units: the longest prefix of whole scalars of at most 23 units plus the ellipsis. */
export function dl(s: string): string {
  const t = flatLabel(s);
  if (t.length <= LABEL_MAX_UNITS) return t;
  let out = "";
  for (const ch of t) {
    if (out.length + ch.length > LABEL_MAX_UNITS - 1) break;
    out += ch;
  }
  return out + ELLIPSIS;
}
