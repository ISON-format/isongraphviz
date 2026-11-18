// src/limits.ts - validation of host RenderLimits (execution controls, never content: Law 10).
import { IgrError } from "./errors.js";
import { DEFAULT_RENDER_LIMITS, type RenderLimits } from "./types.js";

const KEYS = Object.keys(DEFAULT_RENDER_LIMITS) as (keyof RenderLimits)[];

/** An owned, complete copy of the limits. Each caller property is read once. Unknown key: SCHEMA; non-number: SCHEMA; NaN/Infinity: NOT_FINITE; fraction: INVALID_VALUE; negative or beyond 2^53-1: OUT_OF_RANGE. */
export function resolveLimits(partial?: unknown): RenderLimits {
  const out: RenderLimits = { ...DEFAULT_RENDER_LIMITS };
  if (partial === undefined) return out;
  if (typeof partial !== "object" || partial === null || Array.isArray(partial)) throw new IgrError("INVALID_INPUT", "SCHEMA", "limits", "object expected");
  let own: string[];
  try { own = Object.keys(partial); } catch { throw new IgrError("INVALID_INPUT", "UNREADABLE", "limits", "could not be read"); }
  for (const k of own) if (!(KEYS as string[]).includes(k)) throw new IgrError("INVALID_INPUT", "SCHEMA", `limits.${k}`, "unknown limit");
  for (const k of KEYS) {
    let v: unknown;
    try { v = (partial as Record<string, unknown>)[k]; } catch { throw new IgrError("INVALID_INPUT", "UNREADABLE", `limits.${k}`, "a property could not be read"); }
    if (v === undefined) continue;
    if (typeof v !== "number") throw new IgrError("INVALID_INPUT", "SCHEMA", `limits.${k}`, "number expected");
    if (!Number.isFinite(v)) throw new IgrError("INVALID_INPUT", "NOT_FINITE", `limits.${k}`);
    if (!Number.isInteger(v)) throw new IgrError("INVALID_INPUT", "INVALID_VALUE", `limits.${k}`);
    if (v < 0 || v > Number.MAX_SAFE_INTEGER) throw new IgrError("INVALID_INPUT", "OUT_OF_RANGE", `limits.${k}`);
    out[k] = v === 0 ? 0 : v;
  }
  return out;
}
