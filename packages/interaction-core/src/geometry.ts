// src/geometry.ts - the integer arithmetic of the input layer (design 3.2, 3.4) and the readers of caller-owned plain data.
// `interaction-core` carries its own copies of floorDiv, divRound, isqrt, truncating division and the exact micro-pixel position of 27 6 (renderer-core
// exports none of them but quantizePx; CCR-V11-1). Verdicts are made with BigInt wherever a product can exceed 2^53 (Law 3).
import { IgrError, effectiveVisibility, lookupElement } from "isongraph-visualize-renderer-core";
import type { ElementAddress, ModelEdge, ModelNode, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";


/** floorDiv(a, b) for b > 0: rounds toward minus infinity (BigInt `/` truncates toward zero). */
export function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}
/** divRound(a, b) = floorDiv(2a + b, 2b) for b > 0: round half toward +infinity (divRound(-500, 1000) = 0, divRound(500, 1000) = 1). */
export const divRound = (a: bigint, b: bigint): bigint => floorDiv(2n * a + b, 2n * b);

/** The exact integer square root of a non-negative BigInt (Newton iteration). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Number versions of floorDiv and divRound for |values| below 2^52 (exact: no floating division). */
export function floorDivN(a: number, b: number): number {
  const r = a % b;
  return (a - (r < 0 ? r + b : r)) / b;
}
export const divRoundN = (a: number, b: number): number => floorDivN(2 * a + b, 2 * b);

/** -0 never reaches a serializer (27 3). */
export const noNegZero = (n: number): number => (n === 0 ? 0 : n);

export interface Viewport { center_x: number; center_y: number; width: number; height: number; zoom: number }

/**
 * The pinned micro-pixel position of a layout point (3.4, 27 6, 30 3.3): X = (x - cx) z + w 500000, Y = (y - cy) z + h 500000, in micro-pixels.
 * A differential test asserts |layoutToScreen - X / 10^6| < 10^-6 over generated states.
 */
export function screenMicro(vp: Viewport, x: number, y: number): { X: bigint; Y: bigint } {
  const z = BigInt(vp.zoom);
  return { X: (BigInt(x) - BigInt(vp.center_x)) * z + BigInt(vp.width) * 500_000n, Y: (BigInt(y) - BigInt(vp.center_y)) * z + BigInt(vp.height) * 500_000n };
}

/** ceil(a / b) for b > 0. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return -floorDiv(-a, b);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Readers of caller-owned plain data (27 14: snapshot once, each property read once, a getter is refused)
// ---------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The own enumerable data properties of a plain object (prototype Object.prototype or null) as a Map, each read once; an own property whose value is
 * `undefined` counts as absent. undefined when the value is not a plain object (an array, a class instance, null, a primitive) or when any property is an
 * accessor (an unreadable getter). A Map keeps a key such as `__proto__` an ordinary key.
 */
export function plainEntries(v: unknown): Map<string, unknown> | undefined {
  try {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
    const p = Object.getPrototypeOf(v) as unknown;
    if (p !== Object.prototype && p !== null) return undefined;
    const out = new Map<string, unknown>();
    for (const k of Object.keys(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (d === undefined || d.get !== undefined || d.set !== undefined) return undefined;
      if (d.value !== undefined) out.set(k, d.value as unknown);
    }
    return out;
  } catch { return undefined; }
}

/** Thrown by copyData for a value that is not plain data (a getter, a class instance, a function, nesting beyond the limit). */
export class NotPlainData extends Error {}

/**
 * A deep copy of plain data (strings, finite numbers, booleans, null, arrays, plain objects), each property read once; a getter, an accessor, a function,
 * a symbol, a bigint, a class instance, a hole or nesting deeper than `maxDepth` throws NotPlainData. `undefined` object members are dropped (absent).
 */
export function copyData(v: unknown, maxDepth = 12, depth = 0): unknown {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return v;
  if (typeof v !== "object" || depth >= maxDepth) throw new NotPlainData();
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    const n = v.length;
    for (let i = 0; i < n; i++) {
      const d = Object.getOwnPropertyDescriptor(v, String(i));
      if (d === undefined || d.get !== undefined || d.set !== undefined) throw new NotPlainData();
      out.push(copyData(d.value as unknown, maxDepth, depth + 1));
    }
    return out;
  }
  const entries = plainEntries(v);
  if (entries === undefined) throw new NotPlainData();
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [k, x] of entries) Object.defineProperty(out, k, { value: copyData(x, maxDepth, depth + 1), enumerable: true, writable: true, configurable: true });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The state view: a validated, owned snapshot of the parts of a SemanticState that the input layer reads
// ---------------------------------------------------------------------------------------------------------------------------------------------

export type Element = ModelNode | ModelEdge;
export const isEdge = (e: Element): e is ModelEdge => "src" in e;

/** The effective visibility (27 4.1), the focus and the viewport of a state that passed the full 27 4.2 validation; arrays are indexed by scene order. */
export interface View {
  readonly model: RenderModel;
  readonly nodes: readonly boolean[];
  readonly edges: readonly boolean[];
  readonly focus: Element | undefined;
  readonly viewport: Viewport;
}

/**
 * Reads a state once: snapshots it as plain data (a getter is refused: INVALID_INPUT/UNREADABLE), validates it with the full 27 4.2 rules (the IgrError
 * propagates unchanged; a model that is not a render model is INVALID_INPUT/NOT_A_RENDER_MODEL) and derives the view. O(state).
 */
export function readView(model: RenderModel, state: unknown): View {
  let snap: SemanticState;
  try { snap = copyData(state) as SemanticState; } catch (e) {
    if (e instanceof NotPlainData) throw new IgrError("INVALID_INPUT", "UNREADABLE", "state", "a property could not be read");
    throw e;
  }
  const vis = effectiveVisibility(model, snap);
  let focus: Element | undefined;
  const f = snap.focus;
  if (f !== undefined) focus = lookupElement(model, "node" in f ? f.node : f.edge);
  const v = snap.viewport;
  return { model, nodes: vis.nodes, edges: vis.edges, focus, viewport: { center_x: v.center_x, center_y: v.center_y, width: v.width, height: v.height, zoom: v.zoom } };
}

export const isDrawn = (v: View, e: Element): boolean => (isEdge(e) ? v.edges[e.index] === true : v.nodes[e.index] === true);
/** The drawn element a wire address names in the model, or undefined (absent, hidden, or not an address). */
export function drawnElement(v: View, wire: unknown): Element | undefined {
  const e = lookupElement(v.model, wire);
  return e !== undefined && isDrawn(v, e) ? e : undefined;
}
const copyNode = (r: { id: string; type: string }): { id: string; type: string } => ({ id: r.id, type: r.type });
/** A fresh wire address of an element (a node `{id, type}`, an edge `{ord, rel, src, tgt}`). */
export function wireOf(e: Element): { id: string; type: string } | { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } } {
  return isEdge(e) ? { ord: e.ref.ord, rel: e.ref.rel, src: copyNode(e.ref.src), tgt: copyNode(e.ref.tgt) } : copyNode(e.ref);
}
/** The ElementAddress (`{node}` or `{edge}`) of an element. */
export const addressOf = (e: Element): ElementAddress => (isEdge(e) ? { edge: wireOf(e) as never } : { node: wireOf(e) as never });
/** The ObjectRef {address (wire), artifact_sha256} of an element (5.5). */
export const objectRef = (model: RenderModel, e: Element): { address: unknown; artifact_sha256: string } => ({ address: wireOf(e), artifact_sha256: model.artifactSha256 });
/** The drawn elements in traversal order (27 5.3): visible nodes in scene order, then visible edges in scene order. */
export function traversal(v: View): Element[] {
  const out: Element[] = [];
  for (const n of v.model.nodes) if (v.nodes[n.index]) out.push(n);
  for (const e of v.model.edges) if (v.edges[e.index]) out.push(e);
  return out;
}
export const sameElement = (a: Element, b: Element): boolean => a === b || (isEdge(a) === isEdge(b) && a.index === b.index);
