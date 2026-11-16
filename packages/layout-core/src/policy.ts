import { LayoutError } from "./errors.js";
import type { FamilyName, Policy } from "./types.js";

export const QUALIFIED_ALGORITHM = { FORCE: "igl-force/1", FIXED: "igl-fixed/1" } as const;
const ALL_FAMILIES: readonly string[] = ["FORCE", "FIXED", "HIERARCHICAL", "RADIAL", "COMPOUND", "STABLE"];
const UNQUALIFIED: readonly string[] = ["HIERARCHICAL", "RADIAL", "COMPOUND", "STABLE"];
const KNOWN_ALGORITHMS = new Set<string>(Object.values(QUALIFIED_ALGORITHM));
const FORCE_KEYS = ["height", "iterations", "margin", "seed", "width"];
const MAX_I32 = 2 ** 31 - 1;
const MAX_U32 = 2 ** 32 - 1;

const bad = (reason: string, path?: string, detail?: string): LayoutError => new LayoutError("INVALID_POLICY", reason, path, detail);

/** Reads every own enumerable property exactly once. */
function readOnce(o: unknown, path: string): Map<string, unknown> {
  if (typeof o !== "object" || o === null || Array.isArray(o)) throw bad("SCHEMA", path, "object expected");
  const m = new Map<string, unknown>();
  for (const k of Object.keys(o)) m.set(k, (o as Record<string, unknown>)[k]);
  return m;
}

function integer(m: Map<string, unknown>, key: string, min: number, max: number): number {
  const v = m.get(key);
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw bad("INVALID_VALUE", `policy.config.${key}`);
  return v + 0; // -0 -> 0
}

function validate(input: unknown): Policy {
  const top = readOnce(input, "policy");
  for (const k of top.keys()) if (k !== "algorithm" && k !== "config" && k !== "family") throw bad("UNKNOWN_KEY", `policy.${k}`);
  for (const k of ["algorithm", "config", "family"]) if (!top.has(k)) throw bad("MISSING_KEY", `policy.${k}`);

  const family = top.get("family");
  if (typeof family !== "string" || !ALL_FAMILIES.includes(family)) throw new LayoutError("INVALID_LAYOUT", "UNKNOWN_FAMILY", "policy.family");
  if (UNQUALIFIED.includes(family)) throw new LayoutError("UNSUPPORTED_FAMILY", undefined, "policy.family", family);
  const algorithm = top.get("algorithm");
  if (typeof algorithm !== "string") throw bad("INVALID_VALUE", "policy.algorithm");
  if (algorithm !== QUALIFIED_ALGORITHM[family as "FORCE" | "FIXED"]) throw bad(KNOWN_ALGORITHMS.has(algorithm) ? "ALGORITHM_FAMILY_MISMATCH" : "UNKNOWN_ALGORITHM", "policy.algorithm", algorithm);

  const cfg = readOnce(top.get("config"), "policy.config");
  if (family === "FIXED") {
    for (const k of cfg.keys()) throw bad("UNKNOWN_KEY", `policy.config.${k}`);
    return { family: "FIXED", algorithm, config: {} };
  }
  for (const k of cfg.keys()) if (!FORCE_KEYS.includes(k)) throw bad("UNKNOWN_KEY", `policy.config.${k}`);
  for (const k of FORCE_KEYS) if (!cfg.has(k)) throw bad("MISSING_KEY", `policy.config.${k}`);
  const width = integer(cfg, "width", 1, MAX_I32);
  const height = integer(cfg, "height", 1, MAX_I32);
  const margin = integer(cfg, "margin", 0, MAX_I32);
  const iterations = integer(cfg, "iterations", 0, MAX_I32);
  const seed = integer(cfg, "seed", 0, MAX_U32);
  if (width <= 2 * margin || height <= 2 * margin) throw bad("MARGIN_TOO_LARGE", "policy.config.margin");
  return { family: family as FamilyName, algorithm, config: { height, iterations, margin, seed, width } };
}

export function validatePolicy(input: unknown): Policy {
  try {
    return validate(input);
  } catch (e) {
    if (e instanceof LayoutError) throw e;
    throw bad("UNREADABLE", undefined, e instanceof Error ? e.message : String(e));
  }
}
