// src/viewport.ts - integer arithmetic of IGR/1 (design sections 3 and 6). Verdicts are made with BigInt, never with floating point.
import { IgrError } from "./errors.js";
import { FIT_PADDING_PX, ZOOM_DEFAULT_MILLI, ZOOM_MAX_MILLI, ZOOM_MIN_MILLI } from "./types.js";

/** floorDiv(a, b) for b > 0 rounds toward minus infinity (BigInt `/` truncates toward zero). */
export function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

/** divRound(a, b) = floorDiv(2a + b, 2b): round half toward +infinity. */
export const divRound = (a: bigint, b: bigint): bigint => floorDiv(2n * a + b, 2n * b);

function finite(v: unknown): number {
  if (typeof v !== "number") throw new IgrError("INVALID_INPUT", "SCHEMA", undefined, "number expected");
  if (!Number.isFinite(v)) throw new IgrError("INVALID_INPUT", "NOT_FINITE");
  return v;
}

/** The single quantizer rule (IGL/1 section 4 rule 2) on an already scaled value: floor, then +1 when the fraction is at least one half. */
function roundHalfUp(s: number): number {
  const f = Math.floor(s);
  const q = f + (s - f >= 0.5 ? 1 : 0);
  return q === 0 ? 0 : q; // never -0
}

/** `q(v)`: v x 1000 (one binary64 multiplication), then the rule. Milli-units of the input unit. */
export const quantizeMilli = (v: number): number => roundHalfUp(finite(v) * 1000);
/** The same rule without the multiplication; the only integer quantizer used for gesture deltas. */
export const quantizePx = (v: number): number => roundHalfUp(finite(v));
/** Hosts reporting fractional sizes convert with max(1, floor(v)) before `resize`. */
export const quantizeSize = (v: number): number => Math.max(1, Math.floor(finite(v)));

/** Why a value is not an integer-typed field: SCHEMA (not a number), NOT_FINITE (NaN/Infinity), INVALID_VALUE (a fraction); undefined if it is an integer. */
export function intReason(v: unknown): "SCHEMA" | "NOT_FINITE" | "INVALID_VALUE" | undefined {
  if (typeof v !== "number") return "SCHEMA";
  if (!Number.isFinite(v)) return "NOT_FINITE";
  if (!Number.isInteger(v)) return "INVALID_VALUE";
  return undefined;
}

export const S = 1_000_000n;
export const clampZoom = (z: bigint): bigint => (z < BigInt(ZOOM_MIN_MILLI) ? BigInt(ZOOM_MIN_MILLI) : z > BigInt(ZOOM_MAX_MILLI) ? BigInt(ZOOM_MAX_MILLI) : z);

/** The default padding of an omitted `fit.padding` and of `initialState`: min(FIT_PADDING_PX, floorDiv(min(w, h) - 1, 2)). Always leaves ax, ay >= 1. */
export const defaultPadding = (width: number, height: number): number =>
  Math.min(FIT_PADDING_PX, Number(floorDiv(BigInt(Math.min(width, height) - 1), 2n)));

export interface Bounds { min_x: number; min_y: number; max_x: number; max_y: number }

/** Section 6 fit over a bounding box (thousandths) of the visible nodes. Caller guarantees w - 2p >= 1 and h - 2p >= 1. */
export function fitBounds(b: Bounds, width: number, height: number, padding: number): { center_x: number; center_y: number; zoom: number } {
  const minX = BigInt(b.min_x), maxX = BigInt(b.max_x), minY = BigInt(b.min_y), maxY = BigInt(b.max_y);
  const ax = BigInt(width) - 2n * BigInt(padding), ay = BigInt(height) - 2n * BigInt(padding);
  const sx = maxX - minX, sy = maxY - minY;
  const cands: bigint[] = [];
  if (sx > 0n) cands.push(floorDiv(ax * S, sx));
  if (sy > 0n) cands.push(floorDiv(ay * S, sy));
  const z = cands.length === 0 ? BigInt(ZOOM_DEFAULT_MILLI) : cands.reduce((a, c) => (c < a ? c : a));
  return { center_x: Number(divRound(minX + maxX, 2n)), center_y: Number(divRound(minY + maxY, 2n)), zoom: Number(clampZoom(z)) };
}

/** Layout (thousandths) to screen: X = (x - cx) z + w 500000 micro-pixels, returned as double pixels for PAINTING only (verdicts use the micro-pixels). */
export function layoutToScreen(viewport: { center_x: number; center_y: number; width: number; height: number; zoom: number }, point: { x: number; y: number }): { x: number; y: number } {
  for (const [k, c] of [["x", point.x], ["y", point.y]] as const) { const r = intReason(c); if (r) throw new IgrError("INVALID_INPUT", r, `point.${k}`); }
  const z = BigInt(viewport.zoom);
  const X = (BigInt(point.x) - BigInt(viewport.center_x)) * z + BigInt(viewport.width) * 500_000n;
  const Y = (BigInt(point.y) - BigInt(viewport.center_y)) * z + BigInt(viewport.height) * 500_000n;
  return { x: Number(X) / 1e6, y: Number(Y) / 1e6 };
}
