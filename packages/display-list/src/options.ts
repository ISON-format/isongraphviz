// src/options.ts - DlOptions and their validation (design 4.5, steps 2 and 3).
import { IgrError } from "isongraph-visualize-renderer-core";
import { DEFAULT_DL_LIMITS, LIMIT_MAX } from "./constants.js";

export interface DlOptions { labels?: boolean; edgeLabels?: boolean; maxDrawnLabelUnits?: number }
export interface ResolvedDlOptions { labels: boolean; edgeLabels: boolean; maxDrawnLabelUnits: number }

/** Alphabetical order of the validation (4.5 step 3). */
const KEYS = ["edgeLabels", "labels", "maxDrawnLabelUnits"] as const;

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);

function limitNumber(v: unknown, path: string): number {
  if (typeof v !== "number") throw bad("SCHEMA", path, "number expected");
  if (!Number.isFinite(v)) throw bad("NOT_FINITE", path);
  if (!Number.isInteger(v)) throw bad("INVALID_VALUE", path);
  if (v < 0 || v > LIMIT_MAX) throw bad("OUT_OF_RANGE", path);
  return v === 0 ? 0 : v;
}

function flag(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") throw bad("SCHEMA", path, "boolean expected");
  return v;
}

/** True for a plain data object (Object.prototype or null prototype). Never throws. */
export function isPlain(v: unknown): v is Record<string, unknown> {
  try {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
    const p: unknown = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  } catch { return false; }
}

/** Steps 2 and 3 of 4.5: a plain object (or undefined), a subset of the three keys, each present value valid. Each property is read once. */
export function resolveDlOptions(options: unknown): ResolvedDlOptions {
  const out: ResolvedDlOptions = { labels: true, edgeLabels: true, maxDrawnLabelUnits: DEFAULT_DL_LIMITS.maxDrawnLabelUnits };
  if (options === undefined) return out;
  if (!isPlain(options)) throw bad("SCHEMA", "options", "plain object expected");
  const raw: Record<string, unknown> = {};
  const given: string[] = [];
  for (const k of Object.keys(options)) {
    const v: unknown = options[k];
    if (v === undefined) continue; // an own property whose value is undefined is absent
    given.push(k);
    raw[k] = v;
  }
  for (const k of given) if (!(KEYS as readonly string[]).includes(k)) throw bad("SCHEMA", `options.${k}`, "unknown option");
  for (const k of KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    const path = `options.${k}`;
    switch (k) {
      case "edgeLabels": out.edgeLabels = flag(v, path); break;
      case "labels": out.labels = flag(v, path); break;
      case "maxDrawnLabelUnits": out.maxDrawnLabelUnits = limitNumber(v, path); break;
    }
  }
  return out;
}
