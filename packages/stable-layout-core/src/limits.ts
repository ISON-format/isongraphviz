// 28-STABLE-LAYOUT-DESIGN.md sections 2.2, 12 and 13: constants, budget resolution, options reading, the work meter.
import { StableLayoutError } from "./errors.js";

export interface StableBudget { maxNodes: number; maxEdges: number; maxSceneBytes: number; maxLayoutBytes: number; maxReportBytes: number; maxWork: number }

/** Proposals, not measurements (OWNER DECISION 4): provisional and unmeasured until the measurement task of section 17 has run. */
export const DEFAULT_STABLE_BUDGET: Readonly<StableBudget> = Object.freeze({
  maxNodes: 20_000, maxEdges: 100_000, maxSceneBytes: 16_777_216, maxLayoutBytes: 16_777_216, maxReportBytes: 67_108_864, maxWork: 50_000_000,
});
export const MAX_NODE_KEY_UNITS = 2048;
export const MAX_REL_UNITS = 2048;
export const COORD_LIMIT = 2 ** 50;

const BUDGET_KEYS: readonly (keyof StableBudget)[] = ["maxNodes", "maxEdges", "maxSceneBytes", "maxLayoutBytes", "maxReportBytes", "maxWork"];
const invalidBudget = (path?: string): StableLayoutError => new StableLayoutError("INVALID_REQUEST", "INVALID_BUDGET", path);
export const unreadable = (e: unknown): StableLayoutError => new StableLayoutError("INVALID_REQUEST", "UNREADABLE", undefined, e instanceof Error ? e.message : String(e));
/** Runs a read of caller-owned memory: anything a hostile Proxy, getter or Symbol.toStringTag throws becomes INVALID_REQUEST / UNREADABLE (design 2.2). */
export function guard<T>(f: () => T): T {
  try { return f(); } catch (e) { if (e instanceof StableLayoutError) throw e; throw unreadable(e); }
}
const isPlain = (v: unknown): v is Record<string, unknown> => guard(() => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p: unknown = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
});

/**
 * An owned copy of a caller-supplied option object (ForceConfig, ForceBudget): own enumerable properties, each read once, synchronously, into a
 * fresh null-prototype object. Anything that is not an object is returned as it is (the consumer refuses it); validation stays with the consumer.
 */
export function snapshotPlain(v: unknown): unknown {
  return guard(() => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return v;
    const out = Object.create(null) as Record<string, unknown>;
    for (const k of Object.keys(v)) out[k] = (v as Record<string, unknown>)[k];
    return out;
  });
}

/** `budget` must be a plain object (an array is not) with known keys and positive safe integers; each property is read once. */
export function resolveBudget(b: unknown): StableBudget {
  const out: StableBudget = { ...DEFAULT_STABLE_BUDGET };
  if (b === undefined) return out;
  if (!isPlain(b)) throw invalidBudget("budget");
  let keys: string[];
  const values = new Map<string, unknown>();
  try {
    keys = Object.keys(b);
    for (const k of keys) values.set(k, b[k]);
  } catch (e) { throw unreadable(e); }
  for (const k of keys) if (!(BUDGET_KEYS as readonly string[]).includes(k)) throw invalidBudget(`budget.${k}`);
  for (const k of BUDGET_KEYS) {
    const v = values.get(k);
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) throw invalidBudget(`budget.${k}`);
    out[k] = v;
  }
  return out;
}

const UNSUPPORTED = ["relax", "groups", "viewport"] as const;

/**
 * Reads an options object once. An option is present iff its value is !== undefined; an own enumerable key outside `allowed`
 * (the reserved names `relax`, `groups`, `viewport` count as listed) is UNKNOWN_KEY; a reserved name that is present is
 * UNSUPPORTED_OPTION with the name as detail. Unknown keys are judged before reserved names.
 */
export function readOptions(options: unknown, allowed: readonly string[]): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (options === undefined) return out;
  if (guard(() => typeof options !== "object" || options === null || Array.isArray(options))) throw new StableLayoutError("INVALID_REQUEST", "SCHEMA", "options", "object expected");
  const o = options as Record<string, unknown>;
  const known = new Set<string>([...allowed, ...UNSUPPORTED]);
  const values = new Map<string, unknown>();
  try {
    for (const k of Object.keys(o)) values.set(k, o[k]);
  } catch (e) { throw unreadable(e); }
  for (const k of values.keys()) if (!known.has(k)) throw new StableLayoutError("INVALID_REQUEST", "UNKNOWN_KEY", `options.${k}`);
  for (const k of UNSUPPORTED) if (values.get(k) !== undefined) throw new StableLayoutError("INVALID_REQUEST", "UNSUPPORTED_OPTION", `options.${k}`, k);
  for (const [k, v] of values) if (v !== undefined) out.set(k, v);
  return out;
}

/** In-loop work meter (section 12.3): test W + c > maxWork BEFORE charging; on refusal W is unchanged. */
export class Meter {
  private w = 0;
  constructor(readonly maxWork: number) {}
  get work(): number { return this.w; }
  charge(c: number): void {
    if (this.w + c > this.maxWork) throw new StableLayoutError("RESOURCE_LIMIT", "WORK_LIMIT", undefined, `work ${this.w + c} > ${this.maxWork}`);
    this.w += c;
  }
}
