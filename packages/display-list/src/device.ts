// src/device.ts - backingSize (design 6.4): the canvas pixel size from the CSS size and the device pixel ratio, shared by both adapters. Pure.
import { IgrError } from "isongraph-visualize-renderer-core";
import { BACKING_AREA_MAX, DPR_MAX_MILLI, DPR_MIN_MILLI, VIEWPORT_MAX_PX } from "./constants.js";
import { divRound, floorDiv, isqrt } from "./num.js";

function integerIn(v: unknown, lo: number, hi: number, path: string): number {
  if (typeof v !== "number") throw new IgrError("INVALID_INPUT", "SCHEMA", path, "number expected");
  if (!Number.isFinite(v)) throw new IgrError("INVALID_INPUT", "NOT_FINITE", path);
  if (!Number.isInteger(v)) throw new IgrError("INVALID_INPUT", "INVALID_VALUE", path);
  if (v < lo || v > hi) throw new IgrError("INVALID_INPUT", "OUT_OF_RANGE", path);
  return v;
}

/**
 * `e = min(dprMilli, floorDiv(16384·1000, max(W, H)), isqrt(floorDiv(2^26·10^6, W·H)))` (the per-side cap and the area cap), then `bw = divRound(W·e, 1000)`,
 * `bh = divRound(H·e, 1000)`. `width`, `height` are integers 1..16384 and `dprMilli` an integer 250..8000; the caps are approximate (a safety bound).
 */
export function backingSize(width: number, height: number, dprMilli: number): { e: number; bw: number; bh: number } {
  const w = integerIn(width, 1, VIEWPORT_MAX_PX, "width"), h = integerIn(height, 1, VIEWPORT_MAX_PX, "height");
  const dpr = integerIn(dprMilli, DPR_MIN_MILLI, DPR_MAX_MILLI, "dprMilli");
  const W = BigInt(w), H = BigInt(h);
  const side = floorDiv(BigInt(VIEWPORT_MAX_PX) * 1000n, W > H ? W : H);
  const area = isqrt(floorDiv(BigInt(BACKING_AREA_MAX) * 1_000_000n, W * H));
  let e = BigInt(dpr);
  if (side < e) e = side;
  if (area < e) e = area;
  return { e: Number(e), bw: Number(divRound(W * e, 1000n)), bh: Number(divRound(H * e, 1000n)) };
}
