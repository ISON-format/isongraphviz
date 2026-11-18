// src/text.ts - the drawn label (design 3.4(e), 4.4(g)): xs, the flat label and dl(s) (30 7.1, 7.5(a) by reference, without XML escaping).

export const LABEL_MAX_UNITS = 24;
const ELLIPSIS = "…";

/** Is the scalar keepable (30 7.1)? The scalars XML 1.0 cannot carry are substituted (D-DRAW). */
const keep = (c: number): boolean =>
  c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);

/** xs(s): per Unicode scalar keep the legal ones and replace every other one (and any lone surrogate) by U+FFFD. */
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

/** The label with TAB, LF, CR replaced by a space, after xs (4.4(g), first half). */
export function flatLabel(s: string): string {
  let t = "";
  for (let i = 0; i < s.length; i++) { const c = s.charAt(i); t += c === "\t" || c === "\n" || c === "\r" ? " " : c; }
  return xs(t);
}

/** dl(s): the flat label truncated to at most 24 UTF-16 units: the longest prefix of whole scalars of at most 23 units plus the ellipsis. */
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
