// src/geometry.ts - edge geometry (design section 6). Everything is bigint micro-pixels until fmt; no floating point.
import { DEGENERATE, LOOP_END, PAR_STEP, TRIM } from "./constants.js";
import { divRound, fmt, isqrt } from "./num.js";

export interface Pt { x: bigint; y: bigint }
export interface EdgeGeom {
  /** The path data D (5.2). */
  d: string;
  /** The label anchor in micro-pixels (6.4-6.6); the label is drawn 4 px above it (6.7). */
  ax: bigint; ay: bigint;
}

const E6 = 1_000_000n;
const TRIM_UPX = BigInt(TRIM) * E6;
const DEGENERATE_UPX = BigInt(DEGENERATE) * E6;

const p2 = (p: Pt): string => `${fmt(p.x)} ${fmt(p.y)}`;

/** Distance between two screen points: the floor of the exact square root (6.2). */
export const distance = (a: Pt, b: Pt): bigint => isqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));

/** 6.2 (b): degenerate when the floor distance is at most 24 px. */
export const isDegenerate = (len: bigint): boolean => len <= DEGENERATE_UPX;

/** trim(P, Q, t) (6.3): the point P + (Q - P) t / |Q - P| with divRound and the exact floor root; |Q - P| > 0 is guaranteed by the callers. */
export function trim(P: Pt, Q: Pt, t: bigint): Pt {
  const qx = Q.x - P.x, qy = Q.y - P.y;
  const lam = isqrt(qx * qx + qy * qy);
  return { x: P.x + divRound(qx * t, lam), y: P.y + divRound(qy * t, lam) };
}

/** 6.4 straight: both ends stop 12 px from the centres. */
export function straight(A: Pt, B: Pt): EdgeGeom {
  const a = trim(A, B, TRIM_UPX), b = trim(B, A, TRIM_UPX);
  return { d: `M ${p2(a)} L ${p2(b)}`, ax: divRound(a.x + b.x, 2n), ay: divRound(a.y + b.y, 2n) };
}

/** 6.4 degenerate: untrimmed, anchor at the midpoint of the centres. */
export function degenerate(A: Pt, B: Pt): EdgeGeom {
  return { d: `M ${p2(A)} L ${p2(B)}`, ax: divRound(A.x + B.x, 2n), ay: divRound(A.y + B.y, 2n) };
}

/** 6.5 parallel: rank p of k edges of the group {lo, hi}; A, B are this edge's own ends, Slo and Shi the centres of the lower- and higher-index node. */
export function parallel(A: Pt, B: Pt, Slo: Pt, Shi: Pt, p: number, k: number): EdgeGeom {
  const Fx = Shi.x - Slo.x, Fy = Shi.y - Slo.y;
  const Lf = isqrt(Fx * Fx + Fy * Fy);
  const off = BigInt(2 * p - (k - 1)) * BigInt(PAR_STEP) * E6;
  const Mx = divRound(A.x + B.x, 2n), My = divRound(A.y + B.y, 2n);
  const C: Pt = { x: Mx + divRound(-Fy * off, Lf), y: My + divRound(Fx * off, Lf) };
  const a = trim(A, C, TRIM_UPX), b = trim(B, C, TRIM_UPX);
  return { d: `M ${p2(a)} Q ${p2(C)} ${p2(b)}`, ax: divRound(a.x + 2n * C.x + b.x, 4n), ay: divRound(a.y + 2n * C.y + b.y, 4n) };
}

/** 6.6 self-loop: rank r among the visible loops of the same node, centre (X, Y). */
export function selfLoop(X: bigint, Y: bigint, r: number): EdgeGeom {
  const R = BigInt(r);
  const u = 8n + 4n * R, h = 24n + 12n * R;
  const e = BigInt(LOOP_END);
  const s: Pt = { x: X - e * E6, y: Y - e * E6 }, t: Pt = { x: X + e * E6, y: Y - e * E6 };
  const c1: Pt = { x: X - (e + u) * E6, y: Y - (e + h) * E6 }, c2: Pt = { x: X + (e + u) * E6, y: Y - (e + h) * E6 };
  return { d: `M ${p2(s)} C ${p2(c1)} ${p2(c2)} ${p2(t)}`, ax: X, ay: Y - (25n + 9n * R) * E6 };
}
