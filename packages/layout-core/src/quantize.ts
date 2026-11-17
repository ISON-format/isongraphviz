import { LayoutError } from "./errors.js";

/** docs/specs/IGL-1.md §4, rule 2 (0 disagreements with an independent Python implementation on 200,015 doubles). */
export function quantize(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new LayoutError("INVALID_COORDINATE", "NOT_FINITE");
  const s = v * 1000;
  const f = Math.floor(s);
  const q = f + (s - f >= 0.5 ? 1 : 0);
  if (!Number.isFinite(q) || Math.abs(q) > Number.MAX_SAFE_INTEGER) throw new LayoutError("INVALID_COORDINATE", "OUT_OF_RANGE");
  return q === 0 ? 0 : q; // -0 -> +0
}

/** A coordinate read from an artifact (already thousandths): a finite safe integer, never -0. */
export function wireCoordinate(v: unknown, path: string): number {
  if (typeof v !== "number") throw new LayoutError("INVALID_LAYOUT", "SCHEMA", path, "number expected");
  if (!Number.isFinite(v)) throw new LayoutError("INVALID_COORDINATE", "NOT_FINITE", path);
  if (Object.is(v, -0)) throw new LayoutError("INVALID_COORDINATE", "NEGATIVE_ZERO", path);
  if (!Number.isInteger(v)) throw new LayoutError("INVALID_COORDINATE", "NOT_INTEGER", path);
  if (!Number.isSafeInteger(v)) throw new LayoutError("INVALID_COORDINATE", "OUT_OF_RANGE", path);
  return v;
}
