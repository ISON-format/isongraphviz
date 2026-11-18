// src/options.ts - SvgOptions and their validation (design 2.1 steps 2 and 3).
import { IgrError } from "isongraph-visualize-renderer-core";
import { DEFAULT_SVG_LIMITS } from "./constants.js";
import { ID_PREFIX } from "./ids.js";

export interface SvgOptions {
  idPrefix?: string;
  style?: boolean;
  labels?: boolean;
  edgeLabels?: boolean;
  xmlDeclaration?: boolean;
  maxDrawnLabelUnits?: number;
  maxSvgBytes?: number;
}

export interface ResolvedOptions {
  idPrefix: string; style: boolean; labels: boolean; edgeLabels: boolean; xmlDeclaration: boolean; maxDrawnLabelUnits: number; maxSvgBytes: number;
}

/** The alphabetical order of 2.1 step 3. */
const KEYS = ["edgeLabels", "idPrefix", "labels", "maxDrawnLabelUnits", "maxSvgBytes", "style", "xmlDeclaration"] as const;
const MAX_LIMIT = 2 ** 31;

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);

function limitNumber(v: unknown, path: string): number {
  if (typeof v !== "number") throw bad("SCHEMA", path, "number expected");
  if (!Number.isFinite(v)) throw bad("NOT_FINITE", path);
  if (!Number.isInteger(v)) throw bad("INVALID_VALUE", path);
  if (v < 0 || v > MAX_LIMIT) throw bad("OUT_OF_RANGE", path);
  return v === 0 ? 0 : v;
}

function flag(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") throw bad("SCHEMA", path, "boolean expected");
  return v;
}

/** Steps 2 and 3 of 2.1: a plain object (or undefined), a subset of the seven keys, each present value valid; each property is read once. */
export function resolveOptions(options: unknown): ResolvedOptions {
  const out: ResolvedOptions = { idPrefix: "igr", style: true, labels: true, edgeLabels: true, xmlDeclaration: false, maxDrawnLabelUnits: DEFAULT_SVG_LIMITS.maxDrawnLabelUnits, maxSvgBytes: DEFAULT_SVG_LIMITS.maxSvgBytes };
  if (options === undefined) return out;
  if (typeof options !== "object" || options === null || Array.isArray(options)) throw bad("SCHEMA", "options", "object expected");
  const proto: unknown = Object.getPrototypeOf(options);
  if (proto !== Object.prototype && proto !== null) throw bad("SCHEMA", "options", "plain object expected");
  const raw: Record<string, unknown> = {};
  const given: string[] = [];
  for (const k of Object.keys(options)) {
    const v: unknown = (options as Record<string, unknown>)[k];
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
      case "idPrefix":
        if (typeof v !== "string") throw bad("SCHEMA", path, "string expected");
        if (!ID_PREFIX.test(v)) throw bad("INVALID_VALUE", path, "does not match /^[a-z][a-z0-9-]{0,31}$/");
        out.idPrefix = v;
        break;
      case "labels": out.labels = flag(v, path); break;
      case "maxDrawnLabelUnits": out.maxDrawnLabelUnits = limitNumber(v, path); break;
      case "maxSvgBytes": out.maxSvgBytes = limitNumber(v, path); break;
      case "style": out.style = flag(v, path); break;
      case "xmlDeclaration": out.xmlDeclaration = flag(v, path); break;
    }
  }
  return out;
}
