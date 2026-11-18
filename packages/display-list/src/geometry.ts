// src/geometry.ts - edge geometry (design 3.1, 4.4(c)-(e); 30 section 6 by reference). Everything is bigint micro-pixels until the m-px rounding.
import { ARROW_HALF, ARROW_LEN, DEGENERATE, LOOP_END, PAR_STEP, PICK_SEG, TRIM } from "./constants.js";
import { divRound, isqrt } from "./num.js";

export interface Pt { x: bigint; y: bigint }
/** A route in micro-pixels: the points in record order and the label anchor (30 6.4-6.6). */
export interface Route { form: 0 | 1 | 2; pts: Pt[]; ax: bigint; ay: bigint }

const E6 = 1_000_000n;
const TRIM_UPX = BigInt(TRIM) * E6;
const DEGENERATE_UPX = BigInt(DEGENERATE) * E6;

/** Distance between two screen points: the floor of the exact square root (30 6.2). */
export const distance = (a: Pt, b: Pt): bigint => isqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));

/** 30 6.2: degenerate when the floor distance is at most 24 px. */
export const isDegenerate = (len: bigint): boolean => len <= DEGENERATE_UPX;

/** trim(P, Q, t) (30 6.3): the point P + (Q - P) t / |Q - P| with divRound and the exact floor root; |Q - P| > 0 is guaranteed by the callers. */
export function trim(P: Pt, Q: Pt, t: bigint): Pt {
  const qx = Q.x - P.x, qy = Q.y - P.y;
  const lam = isqrt(qx * qx + qy * qy);
  return { x: P.x + divRound(qx * t, lam), y: P.y + divRound(qy * t, lam) };
}

/** Straight: both ends stop 12 px from the centres; the anchor is the midpoint of the trimmed points. */
export function straight(A: Pt, B: Pt): Route {
  const a = trim(A, B, TRIM_UPX), b = trim(B, A, TRIM_UPX);
  return { form: 0, pts: [a, b], ax: divRound(a.x + b.x, 2n), ay: divRound(a.y + b.y, 2n) };
}

/** Degenerate: untrimmed, anchor at the midpoint of the centres. */
export function degenerate(A: Pt, B: Pt): Route {
  return { form: 0, pts: [A, B], ax: divRound(A.x + B.x, 2n), ay: divRound(A.y + B.y, 2n) };
}

/** Parallel: rank p of k edges of the group {lo, hi}; A, B are this edge's own ends, Slo and Shi the centres of the lower- and higher-index node. */
export function parallel(A: Pt, B: Pt, Slo: Pt, Shi: Pt, p: number, k: number): Route {
  const Fx = Shi.x - Slo.x, Fy = Shi.y - Slo.y;
  const Lf = isqrt(Fx * Fx + Fy * Fy);
  const off = BigInt(2 * p - (k - 1)) * BigInt(PAR_STEP) * E6;
  const Mx = divRound(A.x + B.x, 2n), My = divRound(A.y + B.y, 2n);
  const C: Pt = { x: Mx + divRound(-Fy * off, Lf), y: My + divRound(Fx * off, Lf) };
  const a = trim(A, C, TRIM_UPX), b = trim(B, C, TRIM_UPX);
  return { form: 1, pts: [a, C, b], ax: divRound(a.x + 2n * C.x + b.x, 4n), ay: divRound(a.y + 2n * C.y + b.y, 4n) };
}

/** Self-loop: rank r among the visible loops of the same node, centre (X, Y). */
export function selfLoop(X: bigint, Y: bigint, r: number): Route {
  const R = BigInt(r);
  const u = 8n + 4n * R, h = 24n + 12n * R;
  const e = BigInt(LOOP_END);
  const s: Pt = { x: X - e * E6, y: Y - e * E6 }, t: Pt = { x: X + e * E6, y: Y - e * E6 };
  const c1: Pt = { x: X - (e + u) * E6, y: Y - (e + h) * E6 }, c2: Pt = { x: X + (e + u) * E6, y: Y - (e + h) * E6 };
  return { form: 2, pts: [s, c1, c2, t], ax: X, ay: Y - (25n + 9n * R) * E6 };
}

/**
 * The arrowhead triangle of 4.4(e), on the milli-pixel points of an `E` record. T is the tip (the last point), P the point before it in the
 * record; a zero direction points along +x. Returns [tx, ty, b1x, b1y, b2x, b2y]. Each divRound is computed on its own (b2 is not the mirror of b1).
 */
export function arrowhead(tx: bigint, ty: bigint, px: bigint, py: bigint): [bigint, bigint, bigint, bigint, bigint, bigint] {
  let dx = tx - px, dy = ty - py;
  if (dx === 0n && dy === 0n) { dx = 1n; dy = 0n; }
  const lam = isqrt(dx * dx + dy * dy);
  const len = BigInt(ARROW_LEN), half = BigInt(ARROW_HALF);
  const bcx = tx - divRound(dx * len, lam), bcy = ty - divRound(dy * len, lam);
  return [tx, ty, bcx + divRound(-dy * half, lam), bcy + divRound(dx * half, lam), bcx + divRound(dy * half, lam), bcy + divRound(-dx * half, lam)];
}

/** The 17-point (or 2-point) polyline of an E record (5.1): flattening in integers, `divRound` per coordinate. Points are interleaved x, y. */
export function flattenRoute(form: number, c: readonly number[]): number[] {
  if (form === 0) return [c[0]!, c[1]!, c[2]!, c[3]!];
  const out: number[] = [];
  const n = BigInt(PICK_SEG);
  for (let k = 0n; k <= n; k++) {
    const u = n - k;
    for (let axis = 0; axis < 2; axis++) {
      if (form === 1) {
        out.push(Number(divRound(u * u * BigInt(c[axis]!) + 2n * k * u * BigInt(c[2 + axis]!) + k * k * BigInt(c[4 + axis]!), 256n)));
      } else {
        out.push(Number(divRound(u * u * u * BigInt(c[axis]!) + 3n * u * u * k * BigInt(c[2 + axis]!) + 3n * u * k * k * BigInt(c[4 + axis]!) + k * k * k * BigInt(c[6 + axis]!), 4096n)));
      }
    }
  }
  return out;
}
