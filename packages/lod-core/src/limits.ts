// src/limits.ts — hard limits and the default budget of design 29 section 11. PROVISIONAL: proposed, unmeasured.
import { LODError } from "./errors.js";

export interface LodBudget { maxNodes: number; maxEdges: number; maxWork: number }

export const MAX_INPUT_BYTES = 268_435_456;
export const MAX_STATE_BYTES = 33_554_432;
export const MAX_NODES = 100_000;
export const MAX_EDGES = 500_000;
export const MAX_GROUPS = 20_000;
export const MAX_MEMBER_ENTRIES = 500_000;
export const MAX_AGG_DEPTH = 16;
export const MAX_LABEL_UNITS = 256;
export const MAX_RULES = 8;
export const MAX_WORK_HARD = 1_000_000_000;
/** Visits when copying a caller-owned object graph (builders, suggestGroups specs); a shared subobject counts at every visit. Proposed, unmeasured. */
export const MAX_CALLER_VISITS = 4_194_304;
export const INT31_MAX = 2_147_483_647;

export const LOD_HARD_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  MAX_INPUT_BYTES, MAX_STATE_BYTES, MAX_NODES, MAX_EDGES, MAX_GROUPS, MAX_MEMBER_ENTRIES, MAX_AGG_DEPTH, MAX_LABEL_UNITS, MAX_RULES, MAX_WORK_HARD, MAX_CALLER_VISITS,
});

/** Proposed, unmeasured. */
export const DEFAULT_LOD_BUDGET: Readonly<LodBudget> = Object.freeze({ maxNodes: 20_000, maxEdges: 100_000, maxWork: 100_000_000 });

const HARD: Readonly<LodBudget> = { maxNodes: MAX_NODES, maxEdges: MAX_EDGES, maxWork: MAX_WORK_HARD };
const KEYS = ["maxNodes", "maxEdges", "maxWork"] as const;

export interface BudgetOptions { budget?: Partial<LodBudget> }

/**
 * Reads the caller-owned options ONCE (synchronously) and returns the effective budget.
 * An unknown key, a non-positive-safe-integer value or a value above a hard limit is INVALID_POLICY/INVALID_BUDGET; nothing is clamped.
 */
export function resolveBudget(options: BudgetOptions | undefined): LodBudget {
  const out: LodBudget = { ...DEFAULT_LOD_BUDGET };
  if (options === undefined) return out;
  if (typeof options !== "object" || options === null) throw new LODError("INVALID_POLICY", "INVALID_BUDGET", "options");
  const b = Object.prototype.hasOwnProperty.call(options, "budget") ? (options as { budget?: unknown }).budget : undefined;
  if (b === undefined) return out;
  if (typeof b !== "object" || b === null || Array.isArray(b)) throw new LODError("INVALID_POLICY", "INVALID_BUDGET", "options.budget");
  const o = b as Record<string, unknown>;
  const own = Object.keys(o);
  for (const k of own) if (!(KEYS as readonly string[]).includes(k)) throw new LODError("INVALID_POLICY", "INVALID_BUDGET", `options.budget.${k}`, "unknown key");
  for (const k of KEYS) {
    if (!own.includes(k)) continue;
    const v = o[k];
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) throw new LODError("INVALID_POLICY", "INVALID_BUDGET", `options.budget.${k}`, "positive safe integer expected");
    if (v > HARD[k]) throw new LODError("INVALID_POLICY", "INVALID_BUDGET", `options.budget.${k}`, "above the hard limit");
    out[k] = v;
  }
  return out;
}
