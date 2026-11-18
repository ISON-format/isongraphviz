// src/pick.ts - the pick buffer igr-pick/1, its strict reader and pickDrawn (design 5.1, 5.2).
import { IgrError, hitTest, quantizePx, serializeState } from "isongraph-visualize-renderer-core";
import type { RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { buildDisplayList } from "./build.js";
import { canonicalJson } from "./canon.js";
import { utf8Encode } from "./utf8.js";
import { DEFAULT_CV_READ_LIMITS, DL_COORD_MAX, EDGE_PICK_TOLERANCE, PICK_FORMAT, PICK_SEG, POINT_LIMIT } from "./constants.js";
import { elementBounds } from "./bounds.js";
import { flattenRoute } from "./geometry.js";
import { readLines, resolveReadLimits, schemaError } from "./lines.js";
import { utf8Decode } from "./utf8.js";
import type { DisplayList, ElementAddress } from "./types.js";
import type { ElementBox } from "./bounds.js";

export interface PickBuffer {
  readonly nd: number;
  readonly ed: number;
  readonly nodes: readonly { pid: number; x: number; y: number }[];
  readonly edges: readonly { pid: number; points: readonly number[] }[];
}

/** buildPickBuffer(list): a pure function of a list; the polyline of every drawn edge and the centre of every drawn node. */
export function buildPickBuffer(list: DisplayList): PickBuffer {
  const nodes: { pid: number; x: number; y: number }[] = [];
  const edges: { pid: number; points: number[] }[] = [];
  for (const r of list.records) {
    if (r[0] === "N") nodes.push({ pid: r[1], x: r[4] as number, y: r[5] as number });
    else if (r[0] === "E") edges.push({ pid: r[1], points: flattenRoute(r[3] as number, r.slice(4) as number[]) });
  }
  return { nd: list.nodes.length, ed: list.edges.length, nodes, edges };
}

export function serializePickBuffer(pb: PickBuffer): Uint8Array {
  let text = canonicalJson(["P", PICK_FORMAT, pb.nd, pb.ed]) + "\n";
  for (const n of pb.nodes) text += canonicalJson(["pn", n.pid, n.x, n.y]) + "\n";
  for (const e of pb.edges) text += canonicalJson(["pe", e.pid, ...e.points]) + "\n";
  return utf8Encode(text);
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const inBound = (v: unknown): v is number => isInt(v) && v >= -DL_COORD_MAX && v <= DL_COORD_MAX;

/** The strict reader of the pick buffer format (same rules as 4.7: LF only, canonical, bounded). */
export function parsePickBuffer(bytes: Uint8Array, limits?: { maxBytes?: number; maxLineUnits?: number }): PickBuffer {
  const lines = readLines(bytes, resolveReadLimits(limits, DEFAULT_CV_READ_LIMITS), "cv.read");
  let nd = -1, ed = -1;
  const nodes: { pid: number; x: number; y: number }[] = [];
  const edges: { pid: number; points: number[] }[] = [];
  let stage = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, no = i + 1;
    let rec: unknown;
    try { rec = JSON.parse(line); } catch { throw schemaError(no, "a JSON syntax error"); }
    if (!Array.isArray(rec) || typeof rec[0] !== "string") throw schemaError(no, "a record is an array whose first member is its kind");
    const kind: string = rec[0];
    if (no === 1) {
      if (kind !== "P" || rec.length !== 4 || rec[1] !== PICK_FORMAT || !isInt(rec[2]) || !isInt(rec[3]) || rec[2] < 0 || rec[3] < 0) throw schemaError(no, 'the first record is ["P","igr-pick/1",ND,ED]');
      nd = rec[2]; ed = rec[3];
    } else if (kind === "pn") {
      if (stage > 0) throw schemaError(no, "pn records come before pe records");
      if (rec.length !== 4 || !isInt(rec[1]) || !inBound(rec[2]) || !inBound(rec[3])) throw schemaError(no, "a pn record is [pn,pid,x,y]");
      if (rec[1] !== nodes.length + 1) throw schemaError(no, "the pn pids are 1..ND ascending");
      nodes.push({ pid: rec[1], x: rec[2], y: rec[3] });
    } else if (kind === "pe") {
      stage = 1;
      if (rec.length < 6 || !rec.slice(1).every(isInt) || !rec.slice(2).every(inBound)) throw schemaError(no, "a pe record is [pe,pid,x0,y0,...]");
      const pts = rec.length - 2;
      if (pts !== 4 && pts !== 2 * (PICK_SEG + 1)) throw schemaError(no, "a polyline has 2 or 17 points");
      if (rec[1] !== nd + edges.length + 1) throw schemaError(no, "the pe pids are ND+1..ND+ED ascending");
      edges.push({ pid: rec[1], points: rec.slice(2) as number[] });
    } else throw schemaError(no, "an unknown record kind");
    let canonical: string;
    try { canonical = canonicalJson(rec); } catch { throw schemaError(no, "the record has no canonical text"); }
    if (canonical !== line) throw schemaError(no, "the line is not canonical");
  }
  if (nd < 0) throw schemaError(0, "the header is missing");
  if (nodes.length !== nd || edges.length !== ed) throw schemaError(lines.length, "the numbers of pn and pe records equal ND and ED");
  return { nd, ed, nodes, edges };
}

// ---- pickDrawn ----------------------------------------------------------------------------------------------------------------

const POINT_KEYS = ["x", "y"] as const;
function readPoint(p: unknown): { x: number; y: number } {
  if (typeof p !== "object" || p === null || Array.isArray(p)) throw new IgrError("INVALID_INPUT", "SCHEMA", "point", "object expected");
  const own = Object.keys(p);
  if (own.length !== 2 || !own.includes("x") || !own.includes("y")) throw new IgrError("INVALID_INPUT", "SCHEMA", "point", "exactly the members x and y");
  const out = { x: 0, y: 0 };
  for (const k of POINT_KEYS) {
    const v: unknown = (p as Record<string, unknown>)[k];
    if (typeof v !== "number") throw new IgrError("INVALID_INPUT", "SCHEMA", `point.${k}`, "number expected");
    if (!Number.isFinite(v)) throw new IgrError("INVALID_INPUT", "NOT_FINITE", `point.${k}`);
    if (Math.abs(v) > POINT_LIMIT) throw new IgrError("INVALID_INPUT", "OUT_OF_RANGE", `point.${k}`);
    out[k] = v;
  }
  return out;
}

/** The smallest squared distance from P to a polyline, as an exact fraction num/den (5.2 step 2). */
function polylineDistance(px: bigint, py: bigint, pts: readonly number[]): { num: bigint; den: bigint } {
  let bestNum = -1n, bestDen = 1n;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const s0x = BigInt(pts[i]!), s0y = BigInt(pts[i + 1]!), dx = BigInt(pts[i + 2]!) - s0x, dy = BigInt(pts[i + 3]!) - s0y;
    const l2 = dx * dx + dy * dy;
    const wx = px - s0x, wy = py - s0y;
    let num: bigint, den: bigint;
    if (l2 === 0n) { num = wx * wx + wy * wy; den = 1n; }
    else {
      const tn = wx * dx + wy * dy;
      if (tn <= 0n) { num = wx * wx + wy * wy; den = 1n; }
      else if (tn >= l2) { const vx = px - (s0x + dx), vy = py - (s0y + dy); num = vx * vx + vy * vy; den = 1n; }
      else { const cross = wx * dy - wy * dx; num = cross * cross; den = l2; }
    }
    if (bestNum < 0n || num * bestDen < bestNum * den) { bestNum = num; bestDen = den; }
  }
  return { num: bestNum, den: bestDen };
}

export interface Picker { pick(point: { x: number; y: number }): ElementAddress | undefined; bounds(): ElementBox[] }

/** The picker over a list that was built from this very model and state (internal constructor: the renderers bind it by construction). */
export function pickerFromList(model: RenderModel, state: SemanticState, list: DisplayList): Picker {
  const pb = buildPickBuffer(list);
  const tol2 = BigInt(EDGE_PICK_TOLERANCE) * BigInt(EDGE_PICK_TOLERANCE);
  const W = list.width * 1000, H = list.height * 1000;
  // the bounding box of each polyline expanded by the tolerance: an exact prune (integers below 2^53 are exact doubles)
  const boxes = pb.edges.map((e) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < e.points.length; i += 2) {
      x0 = Math.min(x0, e.points[i]!); x1 = Math.max(x1, e.points[i]!);
      y0 = Math.min(y0, e.points[i + 1]!); y1 = Math.max(y1, e.points[i + 1]!);
    }
    return [x0 - EDGE_PICK_TOLERANCE, y0 - EDGE_PICK_TOLERANCE, x1 + EDGE_PICK_TOLERANCE, y1 + EDGE_PICK_TOLERANCE] as const;
  });
  return {
    pick(point: { x: number; y: number }): ElementAddress | undefined {
      const p = readPoint(point);
      const Pm = { x: quantizePx(p.x * 1000), y: quantizePx(p.y * 1000) };
      // 0. the closed viewport, on the quantized point
      if (Pm.x < 0 || Pm.y < 0 || Pm.x > W || Pm.y > H) return undefined;
      // 1. nodes first, by delegation to the frozen function
      const h = hitTest(model, state, p);
      if (h !== undefined && "node" in h) return h;
      // 2. edges by drawn route
      let best = -1, bestNum = 0n, bestDen = 1n;
      const bx = BigInt(Pm.x), by = BigInt(Pm.y);
      for (let j = 0; j < pb.edges.length; j++) {
        const b = boxes[j]!;
        if (Pm.x < b[0] || Pm.x > b[2] || Pm.y < b[1] || Pm.y > b[3]) continue;
        const d = polylineDistance(bx, by, pb.edges[j]!.points);
        if (d.num > tol2 * d.den) continue; // closed boundary
        if (best < 0 || d.num * bestDen < bestNum * d.den) { best = j; bestNum = d.num; bestDen = d.den; }
      }
      if (best < 0) return undefined;
      const e = list.edges[best]!;
      return { edge: { ord: e.ord, rel: e.rel, src: { id: e.src.id, type: e.src.type }, tgt: { id: e.tgt.id, type: e.tgt.type } } };
    },
    bounds: () => elementBounds(list),
  };
}

/**
 * createPicker(model, state): computes the geometry itself, so a picker can never be paired with a list of another state or hidden set (5.2). The same
 * coordinate check as buildDisplayList applies. Validation: the model, the state (serializeState); then each `pick(point)` validates its point.
 */
export function createPicker(model: RenderModel, state: SemanticState): Picker {
  const list = buildDisplayList(model, state);
  const snapshot = JSON.parse(utf8Decode(serializeState(model, state))!) as SemanticState;
  return pickerFromList(model, snapshot, list);
}
