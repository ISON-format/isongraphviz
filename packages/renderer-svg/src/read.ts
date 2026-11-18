// src/read.ts - readSvg: the strict, line-oriented reader of the igr-svg/1 grammar (design 5.6) and the witness (12.4).
// One left-to-right scan per line (literal prefixes and delimiter searches; no regular expression with nested quantifiers), O(length).
import { IgrError } from "isongraph-visualize-renderer-core";
import type { ElementAddress } from "isongraph-visualize-renderer-core";
import { DEFAULT_READ_LIMITS, SVG_FORMAT, THEME_LINES, XML_DECLARATION } from "./constants.js";
import { ID_PREFIX, decodeElementId, utf8Length } from "./ids.js";

export type WireNode = { id: string; type: string };
export type WireEdge = { ord: string; rel: string; src: WireNode; tgt: WireNode };
export interface SvgNode { address: WireNode; id: string; category_class: string; selected: boolean; focused: boolean; tabindex: string; name: string; label?: string; cx: string; cy: string }
export interface SvgEdge { address: WireEdge; id: string; selected: boolean; focused: boolean; tabindex: string; name: string; description: string; d: string; marker: boolean; label?: string; label_x?: string; label_y?: string }
export interface SvgReadout {
  idPrefix: string; width: number; height: number; artifact_sha256: string; scene_sha256: string; layout_sha256: string;
  title: string; desc: string; styled: boolean; directed: boolean; nodes: SvgNode[]; edges: SvgEdge[];
}

const schema = (line: number, detail: string): IgrError => new IgrError("INVALID_INPUT", "SCHEMA", `line ${line}`, detail);
const consistency = (rule: string, detail: string): IgrError => new IgrError("INVALID_INPUT", "SCHEMA", rule, detail);

// ---- entity-aware value decoding -------------------------------------------------------------------------------------------
const TEXT_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", "#10": "\n", "#13": "\r" };
const ATTR_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#9": "\t", "#10": "\n", "#13": "\r" };

/** Decodes a raw TEXT or ATTR value; null when it is outside the language (raw < > forbidden, unlisted entity, raw CR/LF, raw TAB in an attribute, XML-illegal scalar). */
function decodeValue(raw: string, attr: boolean): string | null {
  const table = attr ? ATTR_ENTITIES : TEXT_ENTITIES;
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 0x26) { // &
      const semi = raw.indexOf(";", i + 1);
      if (semi < 0 || semi - i > 6) return null;
      const name = raw.slice(i + 1, semi);
      if (!Object.prototype.hasOwnProperty.call(table, name)) return null;
      out += table[name]!;
      i = semi;
      continue;
    }
    if (c === 0x3c || c === 0x3e || c === 0x0a || c === 0x0d) return null;
    if (attr && (c === 0x09 || c === 0x22)) return null;
    if ((c < 0x20 && c !== 0x09) || c === 0xfffe || c === 0xffff) return null;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < raw.length ? raw.charCodeAt(i + 1) : 0;
      if (d < 0xdc00 || d > 0xdfff) return null;
      out += raw.charAt(i) + raw.charAt(i + 1);
      i++;
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return null;
    out += raw.charAt(i);
  }
  return out;
}

/** NUM of 3.2 (as printed by fmt): no exponent, no plus, no leading zero, no trailing zero after the dot, no -0. */
function isNum(t: string): boolean {
  let i = 0;
  if (t.charAt(0) === "-") i = 1;
  const start = i;
  while (i < t.length && t.charCodeAt(i) >= 48 && t.charCodeAt(i) <= 57) i++;
  const intLen = i - start;
  if (intLen === 0) return false;
  if (intLen > 1 && t.charAt(start) === "0") return false;
  let nonZeroFraction = false;
  if (i < t.length) {
    if (t.charAt(i) !== ".") return false;
    i++;
    const f = i;
    while (i < t.length && t.charCodeAt(i) >= 48 && t.charCodeAt(i) <= 57) i++;
    if (i === f || i !== t.length || t.charAt(i - 1) === "0") return false;
    nonZeroFraction = true;
  }
  if (start === 1 && intLen === 1 && t.charAt(1) === "0" && !nonZeroFraction) return false; // -0
  return true;
}
const isInt = (t: string): boolean => {
  if (t.length === 0 || (t.length > 1 && t.charAt(0) === "0")) return false;
  for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) < 48 || t.charCodeAt(i) > 57) return false;
  return true;
};
const isHex64 = (t: string): boolean => {
  if (t.length !== 64) return false;
  for (let i = 0; i < 64; i++) { const c = t.charCodeAt(i); if (!((c >= 48 && c <= 57) || (c >= 97 && c <= 102))) return false; }
  return true;
};

// ---- tags --------------------------------------------------------------------------------------------------------------------
interface Tag { name: string; closing: boolean; selfClose: boolean; attrs: [string, string][]; text?: string; line: number }

/** Parses one physical line that is a start tag, an end tag, a self-closing tag or a whole text element `<n a="v">TEXT</n>`. */
function parseTag(s: string, line: number): Tag {
  if (s.charAt(0) !== "<") throw schema(line, "a line must start with a tag");
  if (s.charAt(1) === "/") {
    if (s.charAt(s.length - 1) !== ">" || s.indexOf(">") !== s.length - 1) throw schema(line, "malformed end tag");
    return { name: s.slice(2, s.length - 1), closing: true, selfClose: false, attrs: [], line };
  }
  let i = 1;
  while (i < s.length && s.charAt(i) !== " " && s.charAt(i) !== ">" && s.charAt(i) !== "/") i++;
  const name = s.slice(1, i);
  if (name === "" || name === "?xml" || name.charAt(0) === "!" || name.charAt(0) === "?") throw schema(line, "unexpected markup declaration");
  const attrs: [string, string][] = [];
  for (;;) {
    if (s.charAt(i) === " ") {
      const eq = s.indexOf('="', i + 1);
      if (eq < 0) throw schema(line, "malformed attribute");
      const an = s.slice(i + 1, eq);
      const close = s.indexOf('"', eq + 2);
      if (close < 0) throw schema(line, "unterminated attribute value");
      attrs.push([an, s.slice(eq + 2, close)]);
      i = close + 1;
      continue;
    }
    if (s.charAt(i) === "/") { if (s.slice(i) !== "/>") throw schema(line, "malformed self-closing tag"); return { name, closing: false, selfClose: true, attrs, line }; }
    if (s.charAt(i) === ">") {
      const rest = s.slice(i + 1);
      if (rest === "") return { name, closing: false, selfClose: false, attrs, line };
      const end = `</${name}>`;
      if (!rest.endsWith(end)) throw schema(line, "an element must be complete on one line");
      return { name, closing: false, selfClose: false, attrs, text: rest.slice(0, rest.length - end.length), line };
    }
    throw schema(line, "malformed tag");
  }
}

/** The attributes of a tag in exactly the given order; an unlisted or missing attribute is outside the language. */
function attrsInOrder(t: Tag, names: readonly string[]): string[] {
  if (t.attrs.length !== names.length) throw schema(t.line, `<${t.name}> must carry exactly the attributes ${names.join(", ")}`);
  const out: string[] = [];
  for (let k = 0; k < names.length; k++) {
    if (t.attrs[k]![0] !== names[k]) throw schema(t.line, `unexpected attribute ${JSON.stringify(t.attrs[k]![0])}`);
    out.push(t.attrs[k]![1]);
  }
  return out;
}
const attrText = (raw: string, line: number): string => { const d = decodeValue(raw, true); if (d === null) throw schema(line, "attribute value outside the language"); return d; };
const bodyText = (raw: string | undefined, line: number): string => { const d = decodeValue(raw ?? "", false); if (d === null || raw === undefined) throw schema(line, "text outside the language"); return d; };

// ---- the reader --------------------------------------------------------------------------------------------------------------
export interface ReadLimits { maxBytes?: number; maxLineUnits?: number }

function resolveLimits(limits: unknown): { maxBytes: number; maxLineUnits: number } {
  const out = { maxBytes: DEFAULT_READ_LIMITS.maxBytes as number, maxLineUnits: DEFAULT_READ_LIMITS.maxLineUnits as number };
  if (limits === undefined) return out;
  if (typeof limits !== "object" || limits === null || Array.isArray(limits)) throw new IgrError("INVALID_INPUT", "SCHEMA", "limits", "object expected");
  for (const k of Object.keys(limits)) {
    const v: unknown = (limits as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (k !== "maxBytes" && k !== "maxLineUnits") throw new IgrError("INVALID_INPUT", "SCHEMA", `limits.${k}`, "unknown limit");
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new IgrError("INVALID_INPUT", "SCHEMA", `limits.${k}`, "non-negative integer expected");
    out[k] = v;
  }
  return out;
}

const CAT_CLASSES = ["igr-k0", "igr-k1", "igr-k2", "igr-k3", "igr-k4", "igr-k5", "igr-k6", "igr-k7", "igr-kx"];

/** Strict reader of the igr-svg/1 grammar (5.6). Throws INVALID_INPUT/SCHEMA (with the line in `path`) or RESOURCE_LIMIT/BYTES_LIMIT. */
export function readSvg(svg: string, limits?: ReadLimits): SvgReadout {
  if (typeof svg !== "string") throw new IgrError("INVALID_INPUT", "SCHEMA", "svg", "string expected");
  const lim = resolveLimits(limits);
  if (utf8Length(svg) > lim.maxBytes) throw new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", "svg", "document longer than maxBytes");
  // split on LF only (U+2028, U+2029, U+0085 are not line breaks); every line, including the last, ends with LF
  const lines: string[] = [];
  let from = 0;
  for (;;) {
    const at = svg.indexOf("\n", from);
    if (at < 0) break;
    if (at - from > lim.maxLineUnits) throw new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", "svg", "a line is longer than maxLineUnits");
    lines.push(svg.slice(from, at));
    from = at + 1;
  }
  if (svg.length - from > lim.maxLineUnits) throw new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", "svg", "a line is longer than maxLineUnits");
  if (from !== svg.length) throw schema(lines.length + 1, "the document must end with LF");
  if (lines.length === 0) throw schema(1, "empty document");

  let at = 0;
  const peek = (): string | undefined => lines[at];
  const next = (what: string): { s: string; n: number } => {
    if (at >= lines.length) throw schema(lines.length, `unexpected end of document, expected ${what}`);
    const s = lines[at]!;
    at++;
    if (s === "") throw schema(at, "blank line");
    if (s.indexOf("\r") >= 0) throw schema(at, "CR is not allowed");
    if (s.charAt(0) === " " || s.charAt(0) === "\t") throw schema(at, "indentation is not allowed");
    return { s, n: at };
  };
  const nextTag = (what: string): Tag => { const l = next(what); return parseTag(l.s, l.n); };

  // ---- head
  const first = peek();
  if (first !== undefined && first.startsWith("<?")) { const l = next("declaration"); if (l.s !== XML_DECLARATION) throw schema(l.n, "only the declaration <?xml version=\"1.0\" encoding=\"UTF-8\"?> is allowed"); }
  const root = nextTag("<svg>");
  if (root.name !== "svg" || root.closing || root.selfClose || root.text !== undefined) throw schema(root.line, "the root element must be <svg>");
  const rv = attrsInOrder(root, ["xmlns", "class", "width", "height", "viewBox", "role", "aria-roledescription", "aria-labelledby", "aria-describedby", "data-igr-svg", "data-igr-artifact", "data-igr-scene", "data-igr-layout"]);
  if (rv[0] !== "http://www.w3.org/2000/svg" || rv[1] !== "igr-svg" || rv[5] !== "graphics-document" || rv[6] !== "graph") throw schema(root.line, "root attributes outside the language");
  if (rv[9] !== SVG_FORMAT) throw schema(root.line, `unknown data-igr-svg ${JSON.stringify(rv[9])}`);
  if (!isHex64(rv[10]!) || !isHex64(rv[11]!) || !isHex64(rv[12]!)) throw schema(root.line, "a hash must be 64 lowercase hex digits");
  if (!isInt(rv[2]!) || !isInt(rv[3]!)) throw schema(root.line, "width and height must be plain integers");
  const width = Number(rv[2]), height = Number(rv[3]);
  const labelledby = rv[7]!, describedby = rv[8]!, viewBox = rv[4]!;
  if (!labelledby.endsWith("-title")) throw schema(root.line, "aria-labelledby must end with -title");
  const P = labelledby.slice(0, labelledby.length - 6);
  if (!ID_PREFIX.test(P)) throw schema(root.line, "the document prefix is not a valid idPrefix");

  const titleTag = nextTag("<title>");
  if (titleTag.name !== "title" || titleTag.closing || titleTag.selfClose) throw schema(titleTag.line, "expected the root <title>");
  const titleId = attrsInOrder(titleTag, ["id"])[0]!;
  const titleRaw = titleTag.text ?? "";
  const title = bodyText(titleTag.text, titleTag.line);
  const descTag = nextTag("<desc>");
  if (descTag.name !== "desc" || descTag.closing || descTag.selfClose) throw schema(descTag.line, "expected the root <desc>");
  const descId = attrsInOrder(descTag, ["id"])[0]!;
  const descRaw = descTag.text ?? "";
  const desc = bodyText(descTag.text, descTag.line);

  let styled = false;
  let tag = nextTag("<style>, <defs> or the node group");
  if (tag.name === "style" && !tag.closing) {
    if (tag.attrs.length !== 0 || tag.selfClose || tag.text !== undefined) throw schema(tag.line, "<style> takes no attributes");
    styled = true;
    const body: string[] = [];
    for (;;) {
      const l = next("</style>");
      if (l.s === "</style>") break;
      body.push(l.s);
    }
    if (body.length !== THEME_LINES.length || body.some((b, i) => b !== THEME_LINES[i])) throw schema(tag.line, "the <style> body must equal the 19 lines of the fixed theme");
    tag = nextTag("<defs> or the node group");
  }
  let markerId: string | undefined;
  let directed = false;
  if (tag.name === "defs" && !tag.closing) {
    // the whole defs element is one line; parse it by its fixed literal text around the marker id
    const l = lines[at - 1]!;
    const pre = '<defs><marker id="';
    const post = '" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path class="igr-arrow" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>';
    if (!l.startsWith(pre)) throw schema(tag.line, "defs outside the language");
    const q = l.indexOf('"', pre.length);
    if (q < 0 || l.slice(q) !== post) throw schema(tag.line, "defs outside the language");
    markerId = l.slice(pre.length, q);
    directed = true;
    tag = nextTag("the node group");
  }

  // ---- the two groups (the order is the business of W7)
  const nodes: SvgNode[] = [];
  const edges: SvgEdge[] = [];
  const groupOrder: string[] = [];
  const ringState: { sel: boolean; foc: boolean; circlesAgree: boolean }[] = [];
  const haloState: { sel: boolean; foc: boolean; same: boolean }[] = [];
  const markers: (string | undefined)[] = [];
  const nodeTitles: string[] = [];
  const edgeTitles: string[] = [];
  let closed = false;
  for (;;) {
    if (tag.name === "svg" && tag.closing) { closed = true; break; }
    if (tag.name !== "g" || tag.closing || tag.selfClose || tag.text !== undefined) throw schema(tag.line, "expected a group or </svg>");
    const cls = attrsInOrder(tag, ["class"])[0]!;
    if (cls !== "igr-nodes" && cls !== "igr-edges") throw schema(tag.line, "unknown group");
    groupOrder.push(cls);
    for (;;) {
      const t = nextTag("an element or </g>");
      if (t.name === "g" && t.closing) break;
      if (t.name !== "g" || t.selfClose || t.text !== undefined) throw schema(t.line, "expected an element <g id=...> or </g>");
      if (cls === "igr-nodes") readNode(t); else readEdge(t);
    }
    tag = nextTag("a group or </svg>");
  }
  if (!closed || at !== lines.length) throw schema(at, "content after </svg>");

  function readNode(t: Tag): void {
    const [id, klass, role, rd, label, tab] = attrsInOrder(t, ["id", "class", "role", "aria-roledescription", "aria-label", "tabindex"]) as [string, string, string, string, string, string];
    if (role !== "graphics-symbol" || rd !== "node") throw schema(t.line, "node role attributes outside the language");
    const toks = klass.split(" ");
    if (toks[0] !== "igr-node" || toks[1] === undefined || !CAT_CLASSES.includes(toks[1])) throw schema(t.line, "node class outside the language");
    let k = 2, selected = false, focused = false;
    if (toks[k] === "igr-selected") { selected = true; k++; }
    if (toks[k] === "igr-focused") { focused = true; k++; }
    if (k !== toks.length) throw schema(t.line, "node class outside the language");
    if (tab !== "0" && tab !== "-1") throw schema(t.line, "tabindex must be 0 or -1");
    const name = attrText(label, t.line);
    const ti = nextTag("<title>");
    if (ti.name !== "title" || ti.closing || ti.selfClose) throw schema(ti.line, "expected <title>");
    attrsInOrder(ti, []);
    const titleText = bodyText(ti.text, ti.line);
    let ringSel = false, ringFoc = false;
    const circles: [string, string][] = [];
    let c = nextTag("a circle");
    const circle = (cc: Tag, klassWant: string, r: string): [string, string] => {
      if (cc.name !== "circle" || !cc.selfClose) throw schema(cc.line, "expected a circle");
      const [kk, cx, cy, rr] = attrsInOrder(cc, ["class", "cx", "cy", "r"]) as [string, string, string, string];
      if (kk !== klassWant || rr !== r || !isNum(cx) || !isNum(cy)) throw schema(cc.line, "circle outside the language");
      return [cx, cy];
    };
    if (c.name === "circle" && c.attrs[0]?.[1] === "igr-ring-sel") { ringSel = true; circles.push(circle(c, "igr-ring-sel", "14")); c = nextTag("a circle"); }
    if (c.name === "circle" && c.attrs[0]?.[1] === "igr-ring-foc") { ringFoc = true; circles.push(circle(c, "igr-ring-foc", "18")); c = nextTag("a circle"); }
    const shape = circle(c, "igr-shape", "10");
    circles.push(shape);
    let lab: string | undefined;
    let t2 = nextTag("<text> or </g>");
    if (t2.name === "text") {
      if (t2.selfClose || t2.closing) throw schema(t2.line, "text outside the language");
      const [kk, x, y, anchor] = attrsInOrder(t2, ["class", "x", "y", "text-anchor"]) as [string, string, string, string];
      if (kk !== "igr-label" || anchor !== "middle" || !isNum(x) || !isNum(y)) throw schema(t2.line, "text outside the language");
      lab = bodyText(t2.text, t2.line);
      t2 = nextTag("</g>");
    }
    if (t2.name !== "g" || !t2.closing) throw schema(t2.line, "expected </g>");
    const address = decodeElementId(P, id) as { node: WireNode } | { edge: WireEdge } | undefined;
    nodes.push({ address: (address && "node" in address ? address.node : { id: "", type: "" }), id, category_class: toks[1], selected, focused, tabindex: tab, name, ...(lab !== undefined ? { label: lab } : {}), cx: shape[0], cy: shape[1] });
    nodeTitles.push(titleText);
    ringState.push({ sel: ringSel, foc: ringFoc, circlesAgree: circles.every((q) => q[0] === shape[0] && q[1] === shape[1]) });
  }

  function readEdge(t: Tag): void {
    const [id, klass, role, rd, label, tab] = attrsInOrder(t, ["id", "class", "role", "aria-roledescription", "aria-label", "tabindex"]) as [string, string, string, string, string, string];
    if (role !== "graphics-symbol" || rd !== "edge") throw schema(t.line, "edge role attributes outside the language");
    const toks = klass.split(" ");
    let k = 1, selected = false, focused = false;
    if (toks[0] !== "igr-edge") throw schema(t.line, "edge class outside the language");
    if (toks[k] === "igr-selected") { selected = true; k++; }
    if (toks[k] === "igr-focused") { focused = true; k++; }
    if (k !== toks.length) throw schema(t.line, "edge class outside the language");
    if (tab !== "0" && tab !== "-1") throw schema(t.line, "tabindex must be 0 or -1");
    const name = attrText(label, t.line);
    const ti = nextTag("<title>");
    if (ti.name !== "title" || ti.closing || ti.selfClose) throw schema(ti.line, "expected <title>");
    attrsInOrder(ti, []);
    const titleText = bodyText(ti.text, ti.line);
    const de = nextTag("<desc>");
    if (de.name !== "desc" || de.closing || de.selfClose) throw schema(de.line, "expected <desc>");
    attrsInOrder(de, []);
    const description = bodyText(de.text, de.line);
    const pathD = (pt: Tag, klassWant: string, marker: boolean): { d: string; marker?: string } => {
      if (pt.name !== "path" || !pt.selfClose) throw schema(pt.line, "expected a path");
      const names = marker && pt.attrs.length === 3 ? ["class", "d", "marker-end"] : ["class", "d"];
      const v = attrsInOrder(pt, names);
      if (v[0] !== klassWant) throw schema(pt.line, "path class outside the language");
      checkD(v[1]!, pt.line);
      return v[2] !== undefined ? { d: v[1]!, marker: v[2] } : { d: v[1]! };
    };
    let p = nextTag("a path");
    let haloSel: string | undefined, haloFoc: string | undefined;
    if (p.name === "path" && p.attrs[0]?.[1] === "igr-halo-sel") { haloSel = pathD(p, "igr-halo-sel", false).d; p = nextTag("a path"); }
    if (p.name === "path" && p.attrs[0]?.[1] === "igr-halo-foc") { haloFoc = pathD(p, "igr-halo-foc", false).d; p = nextTag("a path"); }
    const line = pathD(p, "igr-line", true);
    const pick = pathD(nextTag("the pick path"), "igr-pick", false);
    let lab: string | undefined, lx: string | undefined, ly: string | undefined;
    let t2 = nextTag("<text> or </g>");
    if (t2.name === "text") {
      if (t2.selfClose || t2.closing) throw schema(t2.line, "text outside the language");
      const [kk, x, y, anchor] = attrsInOrder(t2, ["class", "x", "y", "text-anchor"]) as [string, string, string, string];
      if (kk !== "igr-elabel" || anchor !== "middle" || !isNum(x) || !isNum(y)) throw schema(t2.line, "text outside the language");
      lab = bodyText(t2.text, t2.line); lx = x; ly = y;
      t2 = nextTag("</g>");
    }
    if (t2.name !== "g" || !t2.closing) throw schema(t2.line, "expected </g>");
    const address = decodeElementId(P, id) as { node: WireNode } | { edge: WireEdge } | undefined;
    edges.push({ address: (address && "edge" in address ? address.edge : { ord: "", rel: "", src: { id: "", type: "" }, tgt: { id: "", type: "" } }), id, selected, focused, tabindex: tab, name, description, d: line.d, marker: line.marker !== undefined,
      ...(lab !== undefined ? { label: lab, label_x: lx!, label_y: ly! } : {}) });
    edgeTitles.push(titleText);
    markers.push(line.marker);
    haloState.push({ sel: haloSel !== undefined, foc: haloFoc !== undefined, same: (haloSel === undefined || haloSel === line.d) && (haloFoc === undefined || haloFoc === line.d) && pick.d === line.d });
  }

  function checkD(d: string, line: number): void {
    const tk = d.split(" ");
    const need = tk[3] === "L" ? 6 : tk[3] === "Q" ? 8 : tk[3] === "C" ? 10 : -1;
    if (tk[0] !== "M" || tk.length !== need) throw schema(line, "path data outside the language");
    for (let i = 0; i < tk.length; i++) if (i !== 0 && i !== 3 && !isNum(tk[i]!)) throw schema(line, "path data outside the language");
  }

  return finish();

  function finish(): SvgReadout {
    // W7: all nodes precede all edges, one group of each (already forced by the line grammar in a reader built like the design's; explicit here)
    if (groupOrder.length !== 2 || groupOrder[0] !== "igr-nodes" || groupOrder[1] !== "igr-edges") throw consistency("W7", "the node group must come first, then the edge group");

    // W1: ids start with P-n- / P-e-, decode to a well-formed address of the right kind, and never repeat
    const seen = new Set<string>();
    for (const n of nodes) {
      if (!n.id.startsWith(P + "-n-")) throw consistency("W1", `node id ${n.id.slice(0, 40)} does not start with ${P}-n-`);
      if (decodeElementId(P, n.id) === undefined) throw consistency("W1", "a node id does not decode");
      if (seen.has(n.id)) throw consistency("W1", "duplicate id");
      seen.add(n.id);
    }
    for (const e of edges) {
      if (!e.id.startsWith(P + "-e-")) throw consistency("W1", `edge id ${e.id.slice(0, 40)} does not start with ${P}-e-`);
      if (decodeElementId(P, e.id) === undefined) throw consistency("W1", "an edge id does not decode");
      if (seen.has(e.id)) throw consistency("W1", "duplicate id");
      seen.add(e.id);
    }

    // W2: the title, desc and marker ids agree with aria-labelledby, aria-describedby and marker-end
    if (titleId !== P + "-title" || descId !== describedby || describedby !== P + "-desc") throw consistency("W2", "title/desc ids disagree with aria-labelledby/aria-describedby");
    if (directed && markerId !== P + "-arrow") throw consistency("W2", "the marker id must be P-arrow");
    for (const m of markers) if (m !== undefined && m !== `url(#${P}-arrow)`) throw consistency("W2", "marker-end must be url(#P-arrow)");

    // W3: every edge has a marker-end or none has; a marker-end implies defs
    const withMarker = markers.filter((m) => m !== undefined).length;
    if (withMarker !== 0 && withMarker !== markers.length) throw consistency("W3", "marker-end on some edges only");
    if (withMarker > 0 && !directed) throw consistency("W3", "marker-end without defs");

    // W4: a ring (halo) is present iff the class says selected (focused); circles of one node share a centre
    nodes.forEach((n, i) => { const r = ringState[i]!; if (r.sel !== n.selected || r.foc !== n.focused || !r.circlesAgree) throw consistency("W4", "ring/class mismatch or circles with different centres"); });
    edges.forEach((e, j) => { const h = haloState[j]!; if (h.sel !== e.selected || h.foc !== e.focused) throw consistency("W4", "halo/class mismatch"); });

    // W5: exactly one tabindex 0 when there is at least one element, none otherwise
    const zeros = nodes.filter((n) => n.tabindex === "0").length + edges.filter((e) => e.tabindex === "0").length;
    if (zeros !== (nodes.length + edges.length > 0 ? 1 : 0)) throw consistency("W5", "exactly one tabindex 0 is required");

    // W6: the <title> text of an element equals its aria-label
    nodes.forEach((n, i) => { if (nodeTitles[i] !== n.name) throw consistency("W6", "title differs from aria-label"); });
    edges.forEach((e, j) => { if (edgeTitles[j] !== e.name) throw consistency("W6", "title differs from aria-label"); });

    // W8: the raw desc and title texts
    if (!isStatus(descRaw)) throw consistency("W8", "the root desc is not '<n> selected, <m> hidden.[ Focus: ...]'");
    if (!(titleRaw.startsWith("Directed graph with ") || titleRaw.startsWith("Undirected graph with "))) throw consistency("W8", "the root title does not begin with '(Un)directed graph with '");

    // W9: width and height equal the viewBox size and lie in 1..16384
    if (viewBox !== `0 0 ${width} ${height}` || width < 1 || width > 16384 || height < 1 || height > 16384) throw consistency("W9", "width/height/viewBox disagree or are out of range");

    // W10: the halo, line and pick paths of one edge have the same d
    edges.forEach((_e, j) => { if (!haloState[j]!.same) throw consistency("W10", "halo, line and pick paths differ"); });

    return { idPrefix: P, width, height, artifact_sha256: rv[10]!, scene_sha256: rv[11]!, layout_sha256: rv[12]!, title, desc, styled, directed, nodes, edges };
  }
}

/** `^\d+ selected, \d+ hidden\.( Focus: .+\.)?$` by hand (no backtracking). */
function isStatus(t: string): boolean {
  let i = 0;
  const digits = (): boolean => { const s = i; while (i < t.length && t.charCodeAt(i) >= 48 && t.charCodeAt(i) <= 57) i++; return i > s; };
  if (!digits()) return false;
  const mid = " selected, ";
  if (!t.startsWith(mid, i)) return false;
  i += mid.length;
  if (!digits()) return false;
  if (!t.startsWith(" hidden.", i)) return false;
  i += 8;
  if (i === t.length) return true;
  const f = " Focus: ";
  if (!t.startsWith(f, i)) return false;
  i += f.length;
  return t.length - i >= 2 && t.charAt(t.length - 1) === ".";
}

/** The kit's WitnessReport of a document (12.4): wire refs in document order and the decoded aria-labels. */
export function svgWitness(svg: string): { backend: string; elements: { nodes: WireNode[]; edges: WireEdge[] }; texts: { address: ElementAddress; text: string }[] } {
  const r = readSvg(svg);
  return {
    backend: SVG_FORMAT,
    elements: { nodes: r.nodes.map((n) => n.address), edges: r.edges.map((e) => e.address) },
    texts: [...r.nodes.map((n) => ({ address: { node: n.address } as ElementAddress, text: n.name })), ...r.edges.map((e) => ({ address: { edge: e.address } as ElementAddress, text: e.name }))],
  };
}
