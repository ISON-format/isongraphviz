// src/plan.ts - the GPU draw plan igr-gl/1 (design 7.2, 7.3): the pure planner `planGl`, the plan guard rule, the instance encoders and `serializePlan`.
// Every number is an integer below 2^24 (the guard rule), written little-endian with DataView; no float is computed here.
import { IgrError } from "isongraph-visualize-renderer-core";
import { GUARD_MARGIN, buildPickBuffer } from "isongraph-visualize-display-list";
import type { DisplayList, DlRecord, WireEdge, WireNode } from "isongraph-visualize-display-list";
import type { ReplaySource } from "isongraph-visualize-display-list/canvas2d";
import { canonicalJson, utf8Encode } from "./bytes.js";
import { clipSegment } from "./clip.js";
import { DEFAULT_GL_LIMITS, EDGE_EXPAND, F32_EXACT, GL_FORMAT, GL_SEG, LAYER_PROGRAM, NODE_EXPAND, STRIDE, type GlProgram } from "./constants.js";

export interface GlDraw { readonly count: number; readonly first: number; readonly layer: number; readonly program: GlProgram }
/** `[pid, flags]` of an omitted element (7.3). */
export type OmittedEntry = readonly [number, number];
export interface GlHeader {
  readonly artifact: string;
  readonly ce: readonly OmittedEntry[];
  readonly cn: readonly OmittedEntry[];
  readonly d: 0 | 1;
  readonly draws: readonly GlDraw[];
  readonly ed: number;
  readonly format: "igr-gl/1";
  readonly g: number;
  readonly h: number;
  readonly layout: string;
  readonly nd: number;
  readonly nt: number;
  readonly scene: string;
  readonly seg: number;
  readonly sizes: { readonly arrow: number; readonly disc: number; readonly edge: number };
  readonly stride: { readonly arrow: number; readonly disc: number; readonly edge: number };
  readonly w: number;
}
export type TextRecord = readonly ["T", number, number, number, number, string];
export interface GlPlan {
  readonly header: GlHeader;
  /** The element table: nodes (pid 1..nd) then edges (pid nd+1..nd+ed). */
  readonly nodes: readonly WireNode[];
  readonly edges: readonly WireEdge[];
  /** The `T` records of the list, verbatim. */
  readonly texts: readonly TextRecord[];
  readonly buffers: { readonly arrow: Uint8Array; readonly disc: Uint8Array; readonly edge: Uint8Array };
  /** The label runs as a replay source for the 2D layer: `{width: w, height: h, records: the T lines}`. */
  readonly textSource: ReplaySource;
}

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);

// ---- instance encoders --------------------------------------------------------------------------------------------------------------------------
/** An integer below 2^24 as float32 (exact); a value outside that range would be rounded by the GPU format, so it is refused (the guard rule keeps every number inside). */
function f32(v: number): number {
  if (!Number.isInteger(v) || Math.abs(v) >= F32_EXACT) throw bad("OUT_OF_RANGE", "gl.f32", "a plan number must be an integer below 2^24");
  return v + 0; // +0, never -0
}

interface EdgeInst { readonly c: readonly [number, number, number, number, number, number, number, number]; readonly pid: number; readonly kind: number }

function encodeEdges(insts: readonly (EdgeInst & { style: number })[]): Uint8Array {
  const out = new Uint8Array(insts.length * STRIDE.edge);
  const dv = new DataView(out.buffer);
  insts.forEach((s, i) => {
    const o = i * STRIDE.edge;
    for (let k = 0; k < 8; k++) dv.setFloat32(o + 4 * k, f32(s.c[k]!), true);
    dv.setUint32(o + 32, s.pid, true);
    dv.setUint8(o + 36, s.kind);
    dv.setUint8(o + 37, s.style);
  });
  return out;
}

// ---- the planner ---------------------------------------------------------------------------------------------------------------------------------
interface Box { x0: number; y0: number; x1: number; y1: number }
const boxOf = (pts: readonly number[], expand: number): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!);
    y0 = Math.min(y0, pts[i + 1]!); y1 = Math.max(y1, pts[i + 1]!);
  }
  return { x0: x0 - expand, y0: y0 - expand, x1: x1 + expand, y1: y1 + expand };
};
/** "Meets" is closed: two boxes that share a boundary point meet (7.3). */
const meets = (a: Box, b: Box): boolean => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

function resolveLimits(limits: unknown): number {
  if (limits === undefined) return DEFAULT_GL_LIMITS.maxGlBytes;
  if (typeof limits !== "object" || limits === null || Array.isArray(limits)) throw bad("SCHEMA", "limits", "object expected");
  const raw = limits as Record<string, unknown>;
  for (const k of Object.keys(raw)) if (raw[k] !== undefined && k !== "maxBytes") throw bad("SCHEMA", `limits.${k}`, "unknown limit");
  const v = raw["maxBytes"];
  if (v === undefined) return DEFAULT_GL_LIMITS.maxGlBytes;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw bad("INVALID_VALUE", "limits.maxBytes");
  return v;
}

/**
 * planGl(list): the plan of a display list (7.2) with the guard rule of 7.3. Layers 1-7 become draws over three instance buffers; the element table and the
 * label runs travel with them. Throws `RESOURCE_LIMIT/BYTES_LIMIT` (`path: "gl"`) if the whole plan exceeds `maxBytes` (inclusive).
 */
export function planGl(list: DisplayList, limits?: { maxBytes?: number }): GlPlan {
  const maxBytes = resolveLimits(limits);
  const w = list.width, h = list.height;
  const gb: Box = { x0: -GUARD_MARGIN, y0: -GUARD_MARGIN, x1: 1000 * w + GUARD_MARGIN, y1: 1000 * h + GUARD_MARGIN };
  const cn: OmittedEntry[] = [], ce: OmittedEntry[] = [];
  const edgeInstances = new Map<number, (EdgeInst & { flags: number })[]>();
  const edgeOrder: number[] = [];
  const arrows: { pid: number; v: readonly [number, number, number, number, number, number] }[] = [];
  const nodes: { pid: number; kcls: number; flags: number; x: number; y: number }[] = [];
  let pickEdges: ReadonlyMap<number, readonly number[]> | undefined;
  const polyline = (pid: number): readonly number[] => {
    if (pickEdges === undefined) pickEdges = new Map(buildPickBuffer(list).edges.map((e) => [e.pid, e.points]));
    return pickEdges.get(pid)!;
  };
  const emitted = new Set<number>();

  for (const r of list.records) {
    if (r[0] === "E") {
      const pid = r[1], flags = r[2] as number, form = r[3] as number;
      const q = r.slice(4) as number[];
      if (!meets(boxOf(q, EDGE_EXPAND), gb)) { ce.push([pid, flags]); continue; }
      const insts: (EdgeInst & { flags: number })[] = [];
      if (q.every((v) => Math.abs(v) < F32_EXACT)) {
        const c: [number, number, number, number, number, number, number, number] =
          form === 0 ? [q[0]!, q[1]!, 0, 0, 0, 0, q[2]!, q[3]!]
            : form === 1 ? [q[0]!, q[1]!, q[2]!, q[3]!, 0, 0, q[4]!, q[5]!]
              : [q[0]!, q[1]!, q[2]!, q[3]!, q[4]!, q[5]!, q[6]!, q[7]!];
        insts.push({ c, pid, kind: form, flags });
      } else {
        const p = polyline(pid);
        for (let i = 0; i + 3 < p.length; i += 2) {
          const s = clipSegment([p[i]!, p[i + 1]!], [p[i + 2]!, p[i + 3]!], w, h, GUARD_MARGIN);
          if (s !== undefined) insts.push({ c: [s[0], s[1], 0, 0, 0, 0, s[2], s[3]], pid, kind: 0, flags });
        }
      }
      if (insts.length === 0) { ce.push([pid, flags]); continue; }
      edgeInstances.set(pid, insts);
      edgeOrder.push(pid);
      emitted.add(pid);
    } else if (r[0] === "A") {
      const v = r.slice(2) as number[];
      arrows.push({ pid: r[1], v: [v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, v[5]!] });
    } else if (r[0] === "N") {
      const x = r[4] as number, y = r[5] as number;
      if (x < gb.x0 - NODE_EXPAND || x > gb.x1 + NODE_EXPAND || y < gb.y0 - NODE_EXPAND || y > gb.y1 + NODE_EXPAND) cn.push([r[1], r[3] as number]);
      else nodes.push({ pid: r[1], kcls: r[2] as number, flags: r[3] as number, x, y });
    }
  }

  // edge buffer: layer 1 (selected), 2 (focused), 3 (all), each in record order
  const edgeLayer = (flag: number): (EdgeInst & { style: number })[] => {
    const out: (EdgeInst & { style: number })[] = [];
    for (const pid of edgeOrder) for (const s of edgeInstances.get(pid)!) if (flag === 0 || (s.flags & flag) !== 0) out.push({ ...s, style: flag === 1 ? 0 : flag === 2 ? 1 : 2 });
    return out;
  };
  const l1 = edgeLayer(1), l2 = edgeLayer(2), l3 = edgeLayer(0);
  const edgeBuf = encodeEdges([...l1, ...l2, ...l3]);

  // arrow buffer: layer 4
  const arrowKept = arrows.filter((a) => emitted.has(a.pid) && meets(boxOf(a.v, 0), gb));
  const arrowBuf = new Uint8Array(arrowKept.length * STRIDE.arrow);
  const adv = new DataView(arrowBuf.buffer);
  arrowKept.forEach((a, i) => {
    const o = i * STRIDE.arrow;
    for (let k = 0; k < 6; k++) adv.setFloat32(o + 4 * k, f32(a.v[k]!), true);
    adv.setUint32(o + 24, a.pid, true);
  });

  // disc buffer: layers 5 (selected rings), 6 (focused rings), 7 (discs)
  const d5 = nodes.filter((n) => (n.flags & 1) !== 0), d6 = nodes.filter((n) => (n.flags & 2) !== 0);
  const discs = [...d5.map((n) => ({ n, style: 0, cat: 0 })), ...d6.map((n) => ({ n, style: 1, cat: 0 })), ...nodes.map((n) => ({ n, style: 2, cat: n.kcls }))];
  const discBuf = new Uint8Array(discs.length * STRIDE.disc);
  const ddv = new DataView(discBuf.buffer);
  discs.forEach((s, i) => {
    const o = i * STRIDE.disc;
    ddv.setFloat32(o, f32(s.n.x), true);
    ddv.setFloat32(o + 4, f32(s.n.y), true);
    ddv.setUint32(o + 8, s.n.pid, true);
    ddv.setUint8(o + 12, s.style);
    ddv.setUint8(o + 13, s.cat);
  });

  const draws: GlDraw[] = [];
  const add = (layer: number, first: number, count: number): void => { if (count > 0) draws.push({ count, first, layer, program: LAYER_PROGRAM[layer]! }); };
  add(1, 0, l1.length); add(2, l1.length, l2.length); add(3, l1.length + l2.length, l3.length);
  add(4, 0, arrowKept.length);
  add(5, 0, d5.length); add(6, d5.length, d6.length); add(7, d5.length + d6.length, nodes.length);

  const texts = list.records.filter((r): r is TextRecord => r[0] === "T") as TextRecord[];
  const header: GlHeader = {
    artifact: list.artifactSha256, ce, cn, d: list.directed ? 1 : 0, draws, ed: list.edges.length, format: GL_FORMAT, g: GUARD_MARGIN, h, layout: list.layoutSha256,
    nd: list.nodes.length, nt: texts.length, scene: list.sceneSha256, seg: GL_SEG,
    sizes: { arrow: arrowBuf.length, disc: discBuf.length, edge: edgeBuf.length }, stride: { ...STRIDE }, w,
  };
  const plan = makePlan(header, list.nodes, list.edges, texts, { arrow: arrowBuf, disc: discBuf, edge: edgeBuf });
  const total = planLength(plan);
  if (total > maxBytes) throw new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", "gl", "the plan exceeds maxBytes");
  return plan;
}

/** Assembles a plan from its parts (the planner and the reader share it): the text source is derived, never stored twice. */
export function makePlan(header: GlHeader, nodes: readonly WireNode[], edges: readonly WireEdge[], texts: readonly TextRecord[], buffers: GlPlan["buffers"]): GlPlan {
  return { header, nodes, edges, texts, buffers, textSource: { width: header.w, height: header.h, records: texts as readonly DlRecord[] } };
}

// ---- bytes ---------------------------------------------------------------------------------------------------------------------------------------
/** The header object as JSON data (key order is the canonical writer's). */
export const headerData = (h: GlHeader): unknown => ({
  artifact: h.artifact, ce: h.ce.map((e) => [...e]), cn: h.cn.map((e) => [...e]), d: h.d, draws: h.draws.map((d) => ({ ...d })), ed: h.ed, format: h.format, g: h.g, h: h.h,
  layout: h.layout, nd: h.nd, nt: h.nt, scene: h.scene, seg: h.seg, sizes: { ...h.sizes }, stride: { ...h.stride }, w: h.w,
});

function textSections(plan: GlPlan): Uint8Array {
  let text = canonicalJson(headerData(plan.header)) + "\n";
  for (const n of plan.nodes) text += canonicalJson(["n", n]) + "\n";
  for (const e of plan.edges) text += canonicalJson(["e", e]) + "\n";
  for (const t of plan.texts) text += canonicalJson(t) + "\n";
  return utf8Encode(text);
}

function planLength(plan: GlPlan): number {
  return textSections(plan).length + plan.buffers.edge.length + plan.buffers.disc.length + plan.buffers.arrow.length;
}

/** The plan bytes (7.2): the header line, the element table, the label runs, then the `edge`, `disc` and `arrow` buffers back to back. */
export function serializePlan(plan: GlPlan): Uint8Array {
  const head = textSections(plan);
  const { edge, disc, arrow } = plan.buffers;
  const out = new Uint8Array(head.length + edge.length + disc.length + arrow.length);
  out.set(head, 0);
  out.set(edge, head.length);
  out.set(disc, head.length + edge.length);
  out.set(arrow, head.length + edge.length + disc.length);
  return out;
}

// ---- decoders (for the readout, the witness, the reader and the tests) ----------------------------------------------------------------------------
export interface EdgeRecord { readonly c: readonly number[]; readonly pid: number; readonly kind: number; readonly style: number; readonly pad: number }
export interface DiscRecord { readonly x: number; readonly y: number; readonly pid: number; readonly style: number; readonly cat: number; readonly pad: number }
export interface ArrowRecord { readonly v: readonly number[]; readonly pid: number }

export function decodeEdges(b: Uint8Array): EdgeRecord[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: EdgeRecord[] = [];
  for (let o = 0; o + STRIDE.edge <= b.length; o += STRIDE.edge) {
    out.push({ c: Array.from({ length: 8 }, (_, k) => dv.getFloat32(o + 4 * k, true)), pid: dv.getUint32(o + 32, true), kind: dv.getUint8(o + 36), style: dv.getUint8(o + 37), pad: dv.getUint16(o + 38, true) });
  }
  return out;
}
export function decodeDiscs(b: Uint8Array): DiscRecord[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: DiscRecord[] = [];
  for (let o = 0; o + STRIDE.disc <= b.length; o += STRIDE.disc) {
    out.push({ x: dv.getFloat32(o, true), y: dv.getFloat32(o + 4, true), pid: dv.getUint32(o + 8, true), style: dv.getUint8(o + 12), cat: dv.getUint8(o + 13), pad: dv.getUint16(o + 14, true) });
  }
  return out;
}
export function decodeArrows(b: Uint8Array): ArrowRecord[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: ArrowRecord[] = [];
  for (let o = 0; o + STRIDE.arrow <= b.length; o += STRIDE.arrow) {
    out.push({ v: Array.from({ length: 6 }, (_, k) => dv.getFloat32(o + 4 * k, true)), pid: dv.getUint32(o + 24, true) });
  }
  return out;
}
