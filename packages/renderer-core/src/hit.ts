// src/hit.ts - normative hit geometry (design section 7.1). Exact BigInt verdicts; floating point may only SKIP a candidate by the stated conservative test.
import { IgrError } from "./errors.js";
import { edgeElement, nodeElement } from "./elements.js";
import { assertModel } from "./model.js";
import { checkState, visibilityOf } from "./state.js";
import type { ElementAddress, RenderModel, SemanticState } from "./types.js";
import { EDGE_HIT_TOLERANCE_PX, NODE_HIT_RADIUS_PX } from "./types.js";
import { quantizeMilli } from "./viewport.js";

const PIX_LIMIT = 2 ** 31;
const MICRO = 1_000_000n;
const NODE_R2 = (BigInt(NODE_HIT_RADIUS_PX) * MICRO) ** 2n;
const EDGE_R2 = (BigInt(EDGE_HIT_TOLERANCE_PX) * MICRO) ** 2n;
/** Pruning margins in pixels: the radius or tolerance plus 1 px for double error (< 0.3 px, design 7.1). */
const NODE_SKIP_PX = NODE_HIT_RADIUS_PX + 1;
const EDGE_SKIP_PX = EDGE_HIT_TOLERANCE_PX + 1;

function coordinate(v: unknown, path: string): number {
  if (typeof v !== "number") throw new IgrError("INVALID_INPUT", "SCHEMA", path, "number expected");
  if (!Number.isFinite(v)) throw new IgrError("INVALID_INPUT", "NOT_FINITE", path);
  if (Math.abs(v) > PIX_LIMIT) throw new IgrError("INVALID_INPUT", "OUT_OF_RANGE", path);
  return v;
}

function hit(model: RenderModel, state: SemanticState, point: { x: number; y: number }, prune: boolean): ElementAddress | undefined {
  assertModel(model);
  if (typeof point !== "object" || point === null) throw new IgrError("INVALID_INPUT", "SCHEMA", "point", "object expected");
  const rawX: unknown = point.x, rawY: unknown = point.y; // each caller property is read once
  const px = coordinate(rawX, "point.x"), py = coordinate(rawY, "point.y");
  const core = checkState(model, state, "strict");
  const vp = core.viewport;
  // P = q(p) x 1000: q once on the raw number (milli-pixels), times 1000 gives micro-pixels, the unit of X, Y and 12 x S.
  const Px = BigInt(quantizeMilli(px)) * 1000n, Py = BigInt(quantizeMilli(py)) * 1000n;
  if (Px < 0n || Py < 0n || Px > BigInt(vp.width) * MICRO || Py > BigInt(vp.height) * MICRO) return undefined; // closed rectangle
  const vis = visibilityOf(model, core.hiddenNodes, core.hiddenEdges);
  const z = BigInt(vp.zoom), cx = BigInt(vp.center_x), cy = BigInt(vp.center_y);
  const halfW = BigInt(vp.width) * 500_000n, halfH = BigInt(vp.height) * 500_000n;
  const X: bigint[] = new Array<bigint>(model.nodes.length), Y: bigint[] = new Array<bigint>(model.nodes.length);
  model.nodes.forEach((n, i) => { if (vis.nodes[i]) { X[i] = (BigInt(n.x) - cx) * z + halfW; Y[i] = (BigInt(n.y) - cy) * z + halfH; } });
  const pxD = Number(Px) / 1e6, pyD = Number(Py) / 1e6;

  // 1. nodes first: smallest squared distance within the closed disc, ties to the lowest index
  let bestNode = -1, bestD = 0n;
  for (let i = 0; i < model.nodes.length; i++) {
    if (!vis.nodes[i]) continue;
    if (prune && (Math.abs(Number(X[i]!) / 1e6 - pxD) > NODE_SKIP_PX || Math.abs(Number(Y[i]!) / 1e6 - pyD) > NODE_SKIP_PX)) continue;
    const dx = X[i]! - Px, dy = Y[i]! - Py;
    const d = dx * dx + dy * dy;
    if (d <= NODE_R2 && (bestNode < 0 || d < bestD)) { bestNode = i; bestD = d; }
  }
  if (bestNode >= 0) return nodeElement(model.nodes[bestNode]!.ref);

  // 2. else edges: distance of the pointer to the segment, compared as exact fractions num/den, ties to the lowest index
  let bestEdge = -1, bestNum = 0n, bestDen = 1n;
  for (let j = 0; j < model.edges.length; j++) {
    if (!vis.edges[j]) continue;
    const e = model.edges[j]!;
    const Ax = X[e.src]!, Ay = Y[e.src]!, Bx = X[e.tgt]!, By = Y[e.tgt]!;
    if (Ax === Bx && Ay === By) continue; // self-loops and coincident endpoints are not pointer-hittable
    if (prune) {
      const ax = Number(Ax) / 1e6, ay = Number(Ay) / 1e6, bx = Number(Bx) / 1e6, by = Number(By) / 1e6;
      if (pxD < Math.min(ax, bx) - EDGE_SKIP_PX || pxD > Math.max(ax, bx) + EDGE_SKIP_PX || pyD < Math.min(ay, by) - EDGE_SKIP_PX || pyD > Math.max(ay, by) + EDGE_SKIP_PX) continue;
    }
    const Dx = Bx - Ax, Dy = By - Ay, L2 = Dx * Dx + Dy * Dy;
    const tn = (Px - Ax) * Dx + (Py - Ay) * Dy;
    if (tn <= 0n || tn >= L2) continue; // rev 3: a candidate edge requires 0 < tn < L2; an endpoint within 6 px is already a node hit
    const cross = (Px - Ax) * Dy - (Py - Ay) * Dx;
    const num = cross * cross, den = L2;
    if (num > EDGE_R2 * den) continue; // closed boundary
    if (bestEdge < 0 || num * bestDen < bestNum * den) { bestEdge = j; bestNum = num; bestDen = den; }
  }
  return bestEdge >= 0 ? edgeElement(model.edges[bestEdge]!.ref) : undefined;
}

/** What the model, state and a pointer (CSS px from the viewport's top-left) hit: a node, else an edge, else nothing. */
export const hitTest = (model: RenderModel, state: SemanticState, point: { x: number; y: number }): ElementAddress | undefined => hit(model, state, point, true);

/** The same verdict without the optional pre-filter (equality is tested over lattices, H24). */
export const hitTestBruteForce = (model: RenderModel, state: SemanticState, point: { x: number; y: number }): ElementAddress | undefined => hit(model, state, point, false);
