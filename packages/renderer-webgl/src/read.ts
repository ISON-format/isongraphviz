// src/read.ts - the strict plan reader `parseGlPlan` (design 7.2, rules G1-G16). Linear, LF-only, string-aware in its nesting scan, bounded by
// DEFAULT_CV_READ_LIMITS. Each rule is a block of its own, orthogonal to the others, so that every `W` row breaks exactly one rule; `readGlPlan` is the
// same reader with named rules (or all of them) disabled, the tooling of the single-fault property, of row X07 and of the witness honesty row U11.
import { IgrError } from "isongraph-visualize-renderer-core";
import { DEFAULT_CV_READ_LIMITS, DL_COORD_MAX } from "isongraph-visualize-display-list";
import type { WireEdge, WireNode } from "isongraph-visualize-display-list";
import { canonicalJson, nestingOk, utf8Decode } from "./bytes.js";
import { ownData } from "./own.js";
import { GL_FORMAT, GL_SEG, LAYER_PROGRAM, LAYER_STYLE, PROGRAMS, STRIDE, F32_EXACT, type GlProgram } from "./constants.js";
import {
  decodeArrows, decodeDiscs, decodeEdges, makePlan, type ArrowRecord, type DiscRecord, type EdgeRecord, type GlDraw, type GlHeader, type GlPlan, type OmittedEntry, type TextRecord,
} from "./plan.js";

export interface ReadOptions {
  limits?: { maxBytes?: number; maxLineUnits?: number };
  /** Rule ids ("G1".."G16") not to apply; the lexer (line boundaries, JSON syntax) always runs. */
  skip?: readonly string[];
  /** Apply no rule at all (tooling: rows X07, U11). */
  lenient?: boolean;
}

const fail = (rule: string, detail: string): IgrError => new IgrError("INVALID_INPUT", "SCHEMA", undefined, `${rule}: ${detail}`);
const limitError = (detail: string): IgrError => new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", "cv.read", detail);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const HASH = /^[0-9a-f]{64}$/;
const HEADER_KEYS = ["artifact", "ce", "cn", "d", "draws", "ed", "format", "g", "h", "layout", "nd", "nt", "scene", "seg", "sizes", "stride", "w"];

// ---- address and text rules shared with display-list (4.7 D4, D9), restated for the plan ------------------------------------------------------------
const IDENTIFIER = /^[^\s:|"\\]+$/;
const ORD = /^(0|[1-9][0-9]*)$/;
const CANONICAL_INT = /^(0|-?[1-9][0-9]*)$/;
const INT64_MIN = -(1n << 63n), INT64_MAX = (1n << 63n) - 1n;
const keysAre = (o: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(o).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
function validNodeId(id: string): boolean {
  if (id.startsWith("s:")) return true;
  if (!id.startsWith("i:")) return false;
  const digits = id.slice(2);
  if (digits.length > 20 || !CANONICAL_INT.test(digits)) return false;
  const v = BigInt(digits);
  return v >= INT64_MIN && v <= INT64_MAX;
}
const isWireNode = (o: unknown): o is WireNode => isObj(o) && keysAre(o, ["id", "type"]) && typeof o["id"] === "string" && typeof o["type"] === "string" && validNodeId(o["id"]) && IDENTIFIER.test(o["type"]);
const isWireEdge = (o: unknown): o is WireEdge =>
  isObj(o) && keysAre(o, ["ord", "rel", "src", "tgt"]) && typeof o["ord"] === "string" && typeof o["rel"] === "string" && ORD.test(o["ord"]) && IDENTIFIER.test(o["rel"]) && isWireNode(o["src"]) && isWireNode(o["tgt"]);

/** D9 text: a non-empty string of at most 24 UTF-16 units with no TAB, LF, CR, no scalar replaced by `xs` (U+0000-U+0008, U+000B, U+000C, U+000E-U+001F, U+FFFE, U+FFFF), no lone surrogate. */
function validText(s: unknown): boolean {
  if (typeof s !== "string" || s.length === 0 || s.length > 24) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) return false;
    if (c <= 8 || c === 0x0b || c === 0x0c || (c >= 0x0e && c <= 0x1f) || c === 0xfffe || c === 0xffff) return false;
    if (c >= 0xd800 && c <= 0xdbff) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) i++; else return false; }
    else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

// ---- the lexer: sections by line prefix ---------------------------------------------------------------------------------------------------------
const PREFIX = { n: '["n",', e: '["e",', T: '["T",' } as const;
const startsWith = (b: Uint8Array, at: number, s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};
function indexOfLf(b: Uint8Array, from: number): number {
  for (let i = from; i < b.length; i++) if (b[i] === 0x0a) return i;
  return -1;
}

interface Line { text: string; no: number }

/** Decodes one line (no LF) and applies the line-boundary rules (D1) of 4.7: valid UTF-8, no CR, no blank line, no indentation, bounded, nesting at most 3. */
function lexLine(b: Uint8Array, from: number, to: number, no: number, maxLineUnits: number): Line {
  const text = utf8Decode(b.subarray(from, to));
  if (text === undefined) throw new IgrError("INVALID_INPUT", "SCHEMA", `line ${no}`, "not valid UTF-8");
  if (text.length > maxLineUnits) throw limitError(`line ${no} exceeds maxLineUnits`);
  if (text.endsWith("\r")) throw new IgrError("INVALID_INPUT", "SCHEMA", `line ${no}`, "a CR before the LF");
  if (text.length === 0) throw new IgrError("INVALID_INPUT", "SCHEMA", `line ${no}`, "a blank line");
  if (text.charAt(0) === " " || text.charAt(0) === "\t") throw new IgrError("INVALID_INPUT", "SCHEMA", `line ${no}`, "an indented line");
  if (!nestingOk(text)) throw new IgrError("INVALID_INPUT", "SCHEMA", `line ${no}`, "nesting deeper than 3");
  return { text, no };
}
function parseJson(line: Line): unknown {
  try { return JSON.parse(line.text) as unknown; } catch { throw new IgrError("INVALID_INPUT", "SCHEMA", `line ${line.no}`, "a JSON syntax error"); }
}
const canonicalOf = (v: unknown): string | undefined => { try { return canonicalJson(v); } catch { return undefined; } };

/** The read limits (audit M-6): the defaults overlaid with the caller's; a non-object is `SCHEMA`, an unknown key `SCHEMA`, a value that is not a non-negative safe integer `INVALID_VALUE` (a NaN bound would silently disable the limit). */
function resolveReadLimits(limits: unknown): { maxBytes: number; maxLineUnits: number } {
  const out = { maxBytes: DEFAULT_CV_READ_LIMITS.maxBytes as number, maxLineUnits: DEFAULT_CV_READ_LIMITS.maxLineUnits as number };
  if (limits === undefined) return out;
  const raw = ownData(limits, "limits");
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (v === undefined) continue;
    if (k !== "maxBytes" && k !== "maxLineUnits") throw new IgrError("INVALID_INPUT", "SCHEMA", `limits.${k}`, "unknown limit");
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new IgrError("INVALID_INPUT", "INVALID_VALUE", `limits.${k}`);
    out[k] = v;
  }
  return out;
}

// ---- the reader ----------------------------------------------------------------------------------------------------------------------------------
/**
 * The reader with its rules selectable: `parseGlPlan` is `readGlPlan(bytes, {limits})`. A rule that is skipped is skipped completely, including the canonical
 * text comparison of the lines it owns (header: G1, table lines: G13, text lines: G14), so that each `W` row can be isolated.
 */
export function readGlPlan(bytes: Uint8Array, options: ReadOptions = {}): GlPlan {
  if (!(bytes instanceof Uint8Array)) throw new IgrError("INVALID_INPUT", "SCHEMA", "plan", "bytes expected");
  const { maxBytes, maxLineUnits } = resolveReadLimits(options.limits);
  if (bytes.length > maxBytes) throw limitError("the input exceeds maxBytes");
  const skipped = new Set(options.skip ?? []);
  const on = (rule: string): boolean => options.lenient !== true && !skipped.has(rule);

  // header line
  const hEnd = indexOfLf(bytes, 0);
  if (hEnd < 0) throw new IgrError("INVALID_INPUT", "SCHEMA", "line 1", "the header line has no LF");
  const hLine = lexLine(bytes, 0, hEnd, 1, maxLineUnits);
  const hv = parseJson(hLine);
  if (!isObj(hv)) throw new IgrError("INVALID_INPUT", "SCHEMA", "line 1", "the header is an object");
  const hd = hv as Record<string, unknown>;

  // G1: the header line is canonical JSON with exactly the keys, the format, seg, g, stride, w, h, d and the hashes
  if (on("G1")) {
    if (!keysAre(hd, HEADER_KEYS)) throw fail("G1", "the header has exactly the keys of 7.2");
    if (canonicalOf(hd) !== hLine.text) throw fail("G1", "the header line is not canonical JSON");
    if (hd["format"] !== GL_FORMAT) throw fail("G1", "format must be igr-gl/1");
    if (hd["seg"] !== GL_SEG) throw fail("G1", "seg must be 16");
    if (hd["g"] !== 256000) throw fail("G1", "g must be 256000");
    const st = hd["stride"];
    if (!isObj(st) || !keysAre(st, ["arrow", "disc", "edge"]) || st["arrow"] !== STRIDE.arrow || st["disc"] !== STRIDE.disc || st["edge"] !== STRIDE.edge) throw fail("G1", "stride must be {arrow: 28, disc: 16, edge: 40}");
    if (!isInt(hd["w"]) || hd["w"] < 1 || hd["w"] > 16384 || !isInt(hd["h"]) || hd["h"] < 1 || hd["h"] > 16384) throw fail("G1", "w and h are integers 1..16384");
    if (hd["d"] !== 0 && hd["d"] !== 1) throw fail("G1", "d is 0 or 1");
    for (const k of ["artifact", "layout", "scene"]) if (typeof hd[k] !== "string" || !HASH.test(hd[k] as string)) throw fail("G1", `${k} is 64 lowercase hex digits`);
    for (const k of ["nd", "ed", "nt"]) if (!isInt(hd[k]) || (hd[k] as number) < 0) throw fail("G1", `${k} is a non-negative integer`);
    const sz = hd["sizes"];
    if (!isObj(sz) || !keysAre(sz, ["arrow", "disc", "edge"]) || !PROGRAMS.every((p) => isInt(sz[p]) && (sz[p] as number) >= 0)) throw fail("G1", "sizes is {arrow, disc, edge} of non-negative integers");
  }
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const nd = num(hd["nd"]), ed = num(hd["ed"]), nt = num(hd["nt"]);
  const sizesObj = isObj(hd["sizes"]) ? hd["sizes"] : {};
  const size = (p: GlProgram): number => Math.max(0, Math.floor(num(sizesObj[p])));

  // the table and the label runs: lines whose prefix is ["n", ["e", ["T"; the rest are the buffers
  let pos = hEnd + 1, no = 1;
  const nLines: Line[] = [], eLines: Line[] = [], tLines: Line[] = [];
  const order: ("n" | "e" | "T")[] = [];
  for (;;) {
    const kind = pos >= bytes.length ? undefined : startsWith(bytes, pos, PREFIX.n) ? "n" : startsWith(bytes, pos, PREFIX.e) ? "e" : startsWith(bytes, pos, PREFIX.T) ? "T" : undefined;
    if (kind === undefined) break;
    const end = indexOfLf(bytes, pos);
    if (end < 0) throw new IgrError("INVALID_INPUT", "SCHEMA", `line ${no + 1}`, "a line without LF");
    no++;
    const line = lexLine(bytes, pos, end, no, maxLineUnits);
    (kind === "n" ? nLines : kind === "e" ? eLines : tLines).push(line);
    order.push(kind);
    pos = end + 1;
  }
  const rest = bytes.length - pos;

  // G2: sizes equal the lengths of the buffers and nothing follows them
  if (on("G2") && rest !== size("edge") + size("disc") + size("arrow")) throw fail("G2", "sizes do not equal the length of the buffer section");

  // the three buffers: edge, disc, arrow back to back, each the slice its size names (possibly shorter when G2 is not applied)
  const slices: Record<GlProgram, Uint8Array> = { arrow: new Uint8Array(0), disc: new Uint8Array(0), edge: new Uint8Array(0) };
  let off = pos;
  for (const p of ["edge", "disc", "arrow"] as const) {
    const end = Math.min(bytes.length, off + size(p));
    slices[p] = bytes.slice(off, end);
    off = end;
  }

  // G3: each section's length is a multiple of the constant stride
  if (on("G3")) for (const p of PROGRAMS) if (slices[p].length % STRIDE[p] !== 0) throw fail("G3", `the ${p} buffer is not a multiple of ${STRIDE[p]} bytes`);
  // the instance counts come from the slice lengths: the cheap structural rules G4 and G5 run BEFORE any instance is decoded (audit M-7: a hostile file is refused
  // without allocating an object per instance)
  const count: Record<GlProgram, number> = { arrow: Math.floor(slices.arrow.length / STRIDE.arrow), disc: Math.floor(slices.disc.length / STRIDE.disc), edge: Math.floor(slices.edge.length / STRIDE.edge) };

  // G4: draws in strictly ascending layer order 1..7, the program of the layer, count >= 1
  const rawDraws = Array.isArray(hd["draws"]) ? (hd["draws"] as unknown[]) : [];
  if (on("G4")) {
    if (!Array.isArray(hd["draws"])) throw fail("G4", "draws is an array");
    let prev = 0;
    for (const d of rawDraws) {
      if (!isObj(d) || !keysAre(d, ["count", "first", "layer", "program"]) || !isInt(d["count"]) || !isInt(d["first"]) || !isInt(d["layer"])) throw fail("G4", "a draw is {count, first, layer, program}");
      if (d["layer"] < 1 || d["layer"] > 7 || d["layer"] <= prev) throw fail("G4", "draws are in strictly ascending layer order 1..7");
      prev = d["layer"];
      if (d["program"] !== LAYER_PROGRAM[d["layer"]]) throw fail("G4", "the program of a draw is the program of its layer");
      if (d["count"] < 1) throw fail("G4", "a draw has count >= 1");
    }
  }
  const draws: GlDraw[] = rawDraws.filter(isObj).map((d) => ({ count: num(d["count"]), first: num(d["first"]), layer: num(d["layer"]), program: d["program"] as GlProgram }));

  // G5: within a program the draws are contiguous and cover its buffer exactly (a draw's program is read from its layer)
  if (on("G5")) {
    const next: Record<GlProgram, number> = { arrow: 0, disc: 0, edge: 0 };
    for (const d of draws) {
      const p = LAYER_PROGRAM[d.layer];
      if (p === undefined) continue;
      if (d.first !== next[p]) throw fail("G5", `a draw of layer ${d.layer} does not start where the previous draw of its program ends`);
      next[p] = d.first + d.count;
      if (next[p] > count[p]) throw fail("G5", `a draw of layer ${d.layer} ends beyond its buffer`);
    }
    for (const p of PROGRAMS) if (next[p] !== count[p]) throw fail("G5", `the draws do not cover the ${p} buffer exactly`);
  }

  const edges: EdgeRecord[] = decodeEdges(slices.edge), discs: DiscRecord[] = decodeDiscs(slices.disc), arrows: ArrowRecord[] = decodeArrows(slices.arrow);

  // the layer of every instance, from the draws (an instance outside every draw has no layer: the layer-dependent rules skip it)
  const layerOf: Record<GlProgram, (number | undefined)[]> = { arrow: new Array<number | undefined>(count.arrow), disc: new Array<number | undefined>(count.disc), edge: new Array<number | undefined>(count.edge) };
  for (const d of draws) {
    const p = LAYER_PROGRAM[d.layer];
    if (p === undefined) continue;
    for (let i = Math.max(0, d.first); i < Math.min(count[p], d.first + d.count); i++) layerOf[p][i] = d.layer;
  }

  // G6: every float is finite, not -0, integer-valued, |v| < 2^24
  if (on("G6")) {
    const floats = (vs: readonly number[]): void => { for (const v of vs) if (!Number.isFinite(v) || Object.is(v, -0) || !Number.isInteger(v) || Math.abs(v) >= F32_EXACT) throw fail("G6", "a float must be a finite integer below 2^24 and not -0"); };
    edges.forEach((e) => floats(e.c)); discs.forEach((s) => floats([s.x, s.y])); arrows.forEach((a) => floats(a.v));
  }

  // G7: kind 0..2, style 0..2 and equal to the layer's, cat 0..8 (0 for rings)
  if (on("G7")) {
    edges.forEach((e, i) => {
      if (e.kind > 2) throw fail("G7", "kind is 0..2");
      const l = layerOf.edge[i];
      if (e.style > 2 || (l !== undefined && e.style !== LAYER_STYLE[l])) throw fail("G7", "the style of an edge instance is 0..2 and equals its layer's");
    });
    discs.forEach((s, i) => {
      const l = layerOf.disc[i];
      if (s.style > 2 || (l !== undefined && s.style !== LAYER_STYLE[l])) throw fail("G7", "the style of a disc instance is 0..2 and equals its layer's");
      if (s.cat > 8 || (s.style !== 2 && s.cat !== 0)) throw fail("G7", "cat is 0..8, and 0 for a ring");
    });
  }
  // G8: padding is zero
  if (on("G8") && (edges.some((e) => e.pad !== 0) || discs.some((s) => s.pad !== 0))) throw fail("G8", "padding fields are zero");
  // G9: pid >= 1
  if (on("G9") && (edges.some((e) => e.pid < 1) || discs.some((s) => s.pid < 1) || arrows.some((a) => a.pid < 1))) throw fail("G9", "pid >= 1");
  // G10: the control points a kind does not use are zero
  if (on("G10")) {
    for (const e of edges) {
      const c = e.c;
      if (e.kind === 0 && (c[2] !== 0 || c[3] !== 0 || c[4] !== 0 || c[5] !== 0)) throw fail("G10", "a line has zero control points");
      if (e.kind === 1 && (c[4] !== 0 || c[5] !== 0)) throw fail("G10", "a quadratic has a zero second control point");
    }
  }

  // per-layer pid lists
  const pidsOf = (layer: number): number[] => {
    const p = LAYER_PROGRAM[layer]!;
    const out: number[] = [];
    (p === "edge" ? edges : p === "disc" ? discs : arrows).forEach((s, i) => { if (layerOf[p][i] === layer) out.push(s.pid); });
    return out;
  };
  const byLayer: number[][] = [[], ...[1, 2, 3, 4, 5, 6, 7].map(pidsOf)];
  // G11: pids non-decreasing within layers 1-3 and strictly ascending within 4-7; a repeated pid is a chain of kind-0 instances only
  if (on("G11")) {
    for (let l = 1; l <= 7; l++) {
      const p = byLayer[l]!;
      for (let i = 1; i < p.length; i++) {
        if (l >= 4 ? p[i]! <= p[i - 1]! : p[i]! < p[i - 1]!) throw fail("G11", `the pids of layer ${l} are not ordered`);
      }
    }
    for (let l = 1; l <= 3; l++) {
      const idx: number[] = [];
      edges.forEach((_, i) => { if (layerOf.edge[i] === l) idx.push(i); });
      for (let k = 1; k < idx.length; k++) {
        const a = edges[idx[k - 1]!]!, b = edges[idx[k]!]!;
        if (a.pid === b.pid && (a.kind !== 0 || b.kind !== 0)) throw fail("G11", "a form-1 or form-2 instance is never repeated");
      }
    }
  }
  const entries = (v: unknown): OmittedEntry[] => (Array.isArray(v) ? (v as unknown[]).filter((e): e is [number, number] => Array.isArray(e) && e.length === 2).map((e) => [num(e[0]), num(e[1])] as const) : []);
  const cn = entries(hd["cn"]), ce = entries(hd["ce"]);
  // G12: the pids of layers 1, 2 and 4 are a subset of layer 3's, those of layers 5 and 6 a subset of layer 7's, and at most one element is focused: the pids of
  // layers 2 and 6 together with the cn/ce entries whose flags & 2 is set number at most one (design rev 5, 7.2; focus is one element, 27 4.1)
  if (on("G12")) {
    const sub = (l: number, of: number): void => { const s = new Set(byLayer[of]); for (const pid of byLayer[l]!) if (!s.has(pid)) throw fail("G12", `a pid of layer ${l} is not in layer ${of}`); };
    sub(1, 3); sub(2, 3); sub(4, 3); sub(5, 7); sub(6, 7);
    const focused = new Set<number>([...byLayer[2]!, ...byLayer[6]!, ...[...cn, ...ce].filter((e) => (e[1] & 2) !== 0).map((e) => e[0])]);
    if (focused.size > 1) throw fail("G12", "at most one element is focused");
  }

  // G13: the table: exactly nd `n` lines then ed `e` lines, well-formed canonical addresses, no repeats; layer pids within range (lower bound: G9)
  const nodes: WireNode[] = [], tableEdges: WireEdge[] = [];
  if (on("G13")) {
    if (nLines.length !== nd || eLines.length !== ed) throw fail("G13", "the table has exactly nd n lines and ed e lines");
    const lastN = order.lastIndexOf("n"), firstE = order.indexOf("e");
    if (firstE >= 0 && lastN > firstE) throw fail("G13", "the n lines come before the e lines");
    const seen = new Set<string>();
    for (const line of [...nLines, ...eLines]) {
      const v = parseJson(line);
      const isN = line.text.startsWith(PREFIX.n);
      if (!Array.isArray(v) || v.length !== 2 || !(isN ? isWireNode(v[1]) : isWireEdge(v[1]))) throw fail("G13", `line ${line.no}: a well-formed address`);
      if (canonicalOf(v) !== line.text) throw fail("G13", `line ${line.no}: the line is not canonical`);
      const key = (isN ? "n" : "e") + canonicalJson(v[1]);
      if (seen.has(key)) throw fail("G13", `line ${line.no}: an address repeats`);
      seen.add(key);
      (isN ? nodes : tableEdges).push(v[1] as never);
    }
    for (const l of [5, 6, 7]) for (const pid of byLayer[l]!) if (pid > nd) throw fail("G13", `a pid of layer ${l} is above nd`);
    for (const l of [1, 2, 3, 4]) for (const pid of byLayer[l]!) if (pid < nd + 1 || pid > nd + ed) throw fail("G13", `a pid of layer ${l} is outside nd+1..nd+ed`);
  } else {
    for (const line of nLines) { const v = parseJson(line); if (Array.isArray(v)) nodes.push(v[1] as never); }
    for (const line of eLines) { const v = parseJson(line); if (Array.isArray(v)) tableEdges.push(v[1] as never); }
  }

  // G14: exactly nt text lines obeying D9 (n_t = nd)
  const texts: TextRecord[] = [];
  if (on("G14")) {
    if (tLines.length !== nt) throw fail("G14", "nt differs from the number of T lines");
    const lastTable = Math.max(order.lastIndexOf("n"), order.lastIndexOf("e")), firstT = order.indexOf("T");
    if (firstT >= 0 && lastTable > firstT) throw fail("G14", "the T lines come after the table");
    const seen = new Set<number>();
    let lastRole = 0, lastPid = 0;
    for (const line of tLines) {
      const v = parseJson(line);
      if (!Array.isArray(v) || v.length !== 6 || v[0] !== "T" || !isInt(v[1]) || !isInt(v[2]) || !isInt(v[3]) || !isInt(v[4]) || !validText(v[5])) throw fail("G14", `line ${line.no}: a T record is ["T",pid,role,x,y,"TEXT"] with a valid text`);
      if (v[1] < 1 || v[1] > nd + ed) throw fail("G14", `line ${line.no}: the pid exists`);
      if (v[2] !== (v[1] <= nd ? 0 : 1)) throw fail("G14", `line ${line.no}: role is 0 iff pid <= nd`);
      if (Math.abs(v[3]) > DL_COORD_MAX || Math.abs(v[4]) > DL_COORD_MAX) throw fail("G14", `line ${line.no}: a coordinate beyond 2^40`);
      if (seen.has(v[1])) throw fail("G14", `line ${line.no}: two T records for one pid`);
      seen.add(v[1]);
      if (v[2] < lastRole || (v[2] === lastRole && v[1] <= lastPid)) throw fail("G14", `line ${line.no}: T records are ordered role 0 then role 1, ascending pid`);
      lastRole = v[2]; lastPid = v[1];
      if (canonicalOf(v) !== line.text) throw fail("G14", `line ${line.no}: the line is not canonical`);
      texts.push(v as unknown as TextRecord);
    }
  } else {
    for (const line of tLines) { const v = parseJson(line); if (Array.isArray(v)) texts.push(v as unknown as TextRecord); }
  }

  // G15: cn and ce are ascending, unique, within their ranges, entries [pid, flags] with flags 0..3, disjoint from the pids emitted in layers 7 and 3
  if (on("G15")) {
    const check = (name: string, raw: unknown, list: readonly OmittedEntry[], lo: number, hi: number, layer: number): void => {
      if (!Array.isArray(raw)) throw fail("G15", `${name} is an array`);
      let prev = 0;
      const emittedPids = new Set(byLayer[layer]);
      raw.forEach((e: unknown, i) => {
        if (!Array.isArray(e) || e.length !== 2 || !isInt(e[0]) || !isInt(e[1]) || e[1] < 0 || e[1] > 3) throw fail("G15", `${name}: an entry is [pid, flags] with flags 0..3`);
        const pid = list[i]![0];
        if (pid <= prev) throw fail("G15", `${name} is ascending and unique`);
        prev = pid;
        if (pid < lo || pid > hi) throw fail("G15", `${name}: a pid outside ${lo}..${hi}`);
        if (emittedPids.has(pid)) throw fail("G15", `${name}: a pid that is also emitted in layer ${layer}`);
      });
    };
    check("cn", hd["cn"], cn, 1, nd, 7);
    check("ce", hd["ce"], ce, nd + 1, nd + ed, 3);
  }

  // G16: coverage: every pid 1..nd by a layer-7 instance or a cn entry, every pid nd+1..nd+ed by a layer-3 instance or a ce entry
  if (on("G16")) {
    const n7 = new Set([...byLayer[7]!, ...cn.map((e) => e[0])]), e3 = new Set([...byLayer[3]!, ...ce.map((e) => e[0])]);
    for (let pid = 1; pid <= nd; pid++) if (!n7.has(pid)) throw fail("G16", `node pid ${pid} is neither drawn nor listed in cn`);
    for (let pid = nd + 1; pid <= nd + ed; pid++) if (!e3.has(pid)) throw fail("G16", `edge pid ${pid} is neither drawn nor listed in ce`);
  }

  const header = hd as unknown as GlHeader;
  return makePlan(
    { ...header, draws, cn, ce, nd, ed, nt, sizes: { arrow: size("arrow"), disc: size("disc"), edge: size("edge") } } as GlHeader,
    nodes, tableEdges, texts, slices,
  );
}

/** The strict reader (7.2): `INVALID_INPUT/SCHEMA` with `detail` naming the rule, or `RESOURCE_LIMIT/BYTES_LIMIT` (`path: "cv.read"`). `serializePlan(parseGlPlan(b))` equals `b`. */
export function parseGlPlan(bytes: Uint8Array, limits?: { maxBytes?: number; maxLineUnits?: number }): GlPlan {
  return readGlPlan(bytes, limits === undefined ? {} : { limits });
}
