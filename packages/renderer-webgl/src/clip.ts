// src/clip.ts - exact integer clipping of the plan guard rule (design 7.3): Liang-Barsky on bigint fractions against the guard box.
import { divRound } from "./bytes.js";

/** A fraction with a positive denominator. */
interface Frac { n: bigint; d: bigint }
const less = (a: Frac, b: Frac): boolean => a.n * b.d < b.n * a.d;

/**
 * Clips the segment P0 -> P1 (integers, milli-pixels) to the closed box [-g, w1000 + g] x [-g, h1000 + g] by the rule of 7.3 and returns the clipped end
 * points S, E, or `undefined` when the segment is rejected or its clipped part is a single point. Pairs `(p, q)`: left `(-dx, P0x + G)`, right
 * `(dx, 1000W + G - P0x)`, top `(-dy, P0y + G)`, bottom `(dy, 1000H + G - P0y)`; `p = 0` with `q < 0` rejects, `p < 0` raises `t0`, `p > 0` lowers `t1`;
 * `t0 > t1` rejects; each end is `P0 + divRound(d * t)` with the rounding of 27 3.
 */
export function clipSegment(p0: readonly [number, number], p1: readonly [number, number], width: number, height: number, margin: number): [number, number, number, number] | undefined {
  const x0 = BigInt(p0[0]), y0 = BigInt(p0[1]);
  const dx = BigInt(p1[0]) - x0, dy = BigInt(p1[1]) - y0;
  const g = BigInt(margin);
  let t0: Frac = { n: 0n, d: 1n }, t1: Frac = { n: 1n, d: 1n };
  const sides: readonly (readonly [bigint, bigint])[] = [
    [-dx, x0 + g], [dx, BigInt(1000 * width) + g - x0], [-dy, y0 + g], [dy, BigInt(1000 * height) + g - y0],
  ];
  for (const [p, q] of sides) {
    if (p === 0n) {
      if (q < 0n) return undefined;
      continue;
    }
    const r: Frac = p < 0n ? { n: -q, d: -p } : { n: q, d: p };
    if (p < 0n) { if (less(t0, r)) t0 = r; }
    else if (less(r, t1)) t1 = r;
  }
  if (less(t1, t0)) return undefined;
  const sx = x0 + divRound(dx * t0.n, t0.d), sy = y0 + divRound(dy * t0.n, t0.d);
  const ex = x0 + divRound(dx * t1.n, t1.d), ey = y0 + divRound(dy * t1.n, t1.d);
  if (sx === ex && sy === ey) return undefined;
  return [Number(sx), Number(sy), Number(ex), Number(ey)];
}
