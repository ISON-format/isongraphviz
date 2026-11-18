// src/lasso.ts - igr-lasso/1 (design 8): the elements inside a milli-pixel rectangle, and the shared micro-pixel core of the pointer lasso and the keyboard marquee.
import type { ElementAddress, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { COORD_MAX_MILLI } from "./events.js";
import { IaError } from "./errors.js";
import { addressOf, plainEntries, readView, screenMicro, type View } from "./geometry.js";

/**
 * The drawn elements inside the closed micro-pixel rectangle [X0, X1] x [Y0, Y1] (X0 <= X1, Y0 <= Y1): the nodes whose exact screen centre (3.4) lies inside
 * (closed), in scene order, then every drawn edge both of whose endpoint nodes are inside (a self-loop: its node), in scene order (8.1). Hidden elements
 * never appear.
 */
export function lassoTargetsMicro(v: View, X0: bigint, Y0: bigint, X1: bigint, Y1: bigint): ElementAddress[] {
  const inside: boolean[] = new Array<boolean>(v.model.nodes.length).fill(false);
  const out: ElementAddress[] = [];
  for (const n of v.model.nodes) {
    if (!v.nodes[n.index]) continue;
    const p = screenMicro(v.viewport, n.x, n.y);
    if (X0 <= p.X && p.X <= X1 && Y0 <= p.Y && p.Y <= Y1) { inside[n.index] = true; out.push(addressOf(n)); }
  }
  for (const e of v.model.edges) if (v.edges[e.index] && inside[e.src] && inside[e.tgt]) out.push(addressOf(e));
  return out;
}

/** The rectangle of an event or a call: four integers within the event coordinate domain, a wrong shape SCHEMA, a non-integer NOT_INTEGER, OUT_OF_RANGE beyond 2^39. */
function readRect(rect: unknown): { x0: number; y0: number; x1: number; y1: number } {
  const e = plainEntries(rect);
  if (e === undefined || e.size !== 4 || !["x0", "y0", "x1", "y1"].every((k) => e.has(k))) throw new IaError("INVALID_INPUT", "SCHEMA", "rect", "exactly x0, y0, x1, y1");
  const num = (k: string): number => {
    const v = e.get(k);
    if (typeof v !== "number") throw new IaError("INVALID_INPUT", "SCHEMA", `rect.${k}`, "number expected");
    if (!Number.isInteger(v)) throw new IaError("INVALID_INPUT", "NOT_INTEGER", `rect.${k}`);
    if (Math.abs(v) > COORD_MAX_MILLI) throw new IaError("INVALID_INPUT", "OUT_OF_RANGE", `rect.${k}`);
    return v === 0 ? 0 : v;
  };
  return { x0: num("x0"), y0: num("y0"), x1: num("x1"), y1: num("y1") };
}

/**
 * lassoTargets(model, state, rect) (8.1): `rect` is {x0, y0, x1, y1} in integer milli-pixels of the rendered surface, either corner order. It is normalized
 * and scaled to micro-pixels; the result is the ElementAddress list of 8.1. IaError INVALID_INPUT for a bad rectangle; the errors of the state propagate.
 */
export function lassoTargets(model: RenderModel, state: SemanticState, rect: { x0: number; y0: number; x1: number; y1: number }): ElementAddress[] {
  const r = readRect(rect);
  const v = readView(model, state);
  const [a, b] = r.x0 <= r.x1 ? [r.x0, r.x1] : [r.x1, r.x0];
  const [c, d] = r.y0 <= r.y1 ? [r.y0, r.y1] : [r.y1, r.y0];
  return lassoTargetsMicro(v, BigInt(a) * 1000n, BigInt(c) * 1000n, BigInt(b) * 1000n, BigInt(d) * 1000n);
}
