// src/options.ts - WebglRendererOptions and their validation (design 6.5, 7.8, 11.2): top-level keys in alphabetical order, first failure wins, all INVALID_INPUT.
import { IgrError } from "isongraph-visualize-renderer-core";
import type { CapabilityManifest } from "isongraph-visualize-renderer-core";
import { DEFAULT_DL_LIMITS, resolveDlOptions } from "isongraph-visualize-display-list";
import type { DlOptions } from "isongraph-visualize-display-list";
import { resolveReplayOptions } from "isongraph-visualize-display-list/canvas2d";
import { DEFAULT_GL_LIMITS } from "./constants.js";
import { ownData } from "./own.js";

export type Host = "headless" | "dom";
export interface WebglRendererOptions {
  name?: string;
  version?: string;
  capacity?: Partial<CapabilityManifest["capacity"]>;
  /** The one closed WebGL attribute option (7.7, 11.2): a boolean, default true; the smoke seam that lets software GL pass. */
  contextAttributes?: { failIfMajorPerformanceCaveat?: boolean };
  dl?: DlOptions;
  maxDlBytes?: number;
  maxGlBytes?: number;
  dprMilli?: number;
  ink?: readonly [number, number, number];
}
export interface ResolvedWebglOptions {
  name: string;
  version: string;
  capacity: { maxNodes: number; maxEdges: number; maxDrawnLabelUnits: number };
  failIfMajorPerformanceCaveat: boolean;
  /** The resolved list options: the one label budget value of 6.5 is applied. */
  dl: { labels: boolean; edgeLabels: boolean; maxDrawnLabelUnits: number };
  maxDlBytes: number;
  maxGlBytes: number;
  dprMilli: number;
  ink: readonly [number, number, number];
}

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);
const LIMIT_MAX = 2 ** 31;
const NAME = /^[a-z][a-z0-9._-]*$/;
const VERSION = /^[0-9A-Za-z._+-]+$/;

/** Capacity defaults per host (7.8, owner decision 12): PROVISIONAL and UNMEASURED. */
export const HOST_DEFAULTS: Record<Host, { maxNodes: number; maxEdges: number; maxDrawnLabelUnits: number }> = {
  headless: { maxNodes: 100_000, maxEdges: 200_000, maxDrawnLabelUnits: 1_048_576 },
  dom: { maxNodes: 100_000, maxEdges: 200_000, maxDrawnLabelUnits: 262_144 },
};

const KEYS = ["capacity", "contextAttributes", "dl", "dprMilli", "ink", "maxDlBytes", "maxGlBytes", "name", "version"] as const;

function numberClass(v: unknown, path: string): number {
  if (typeof v !== "number") throw bad("SCHEMA", path, "number expected");
  if (!Number.isFinite(v)) throw bad("NOT_FINITE", path);
  if (!Number.isInteger(v)) throw bad("INVALID_VALUE", path);
  return v;
}

/** Validates the options for a host and fixes the one label-budget value (the one-value rule of 30 12.2: one given value applies to both, a conflict is INVALID_VALUE). */
export function resolveRendererOptions(host: Host, options: unknown): ResolvedWebglOptions {
  const d = HOST_DEFAULTS[host];
  const snapshot = options === undefined ? {} : ownData(options, "options");
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(snapshot)) {
    const v = snapshot[k];
    if (v === undefined) continue;
    if (!(KEYS as readonly string[]).includes(k)) throw bad("SCHEMA", `options.${k}`, "unknown option");
    raw[k] = v;
  }
  const out: ResolvedWebglOptions = {
    name: "webgl-renderer", version: "0.0.0", capacity: { ...d }, failIfMajorPerformanceCaveat: true, dl: { labels: true, edgeLabels: true, maxDrawnLabelUnits: d.maxDrawnLabelUnits },
    maxDlBytes: DEFAULT_DL_LIMITS.maxDlBytes, maxGlBytes: DEFAULT_GL_LIMITS.maxGlBytes, dprMilli: 1000, ink: [34, 34, 34],
  };
  let capUnits: number | undefined, dlUnits: number | undefined;
  for (const k of KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    const path = `options.${k}`;
    switch (k) {
      case "capacity": {
        const cap = ownData(v, path);
        for (const m of Object.keys(cap)) if (cap[m] !== undefined && !["maxNodes", "maxEdges", "maxDrawnLabelUnits"].includes(m)) throw bad("SCHEMA", `${path}.${m}`, "unknown capacity member");
        for (const m of ["maxNodes", "maxEdges", "maxDrawnLabelUnits"] as const) {
          if (cap[m] === undefined) continue;
          const n = numberClass(cap[m], `${path}.${m}`);
          if (n < 1 || n > Number.MAX_SAFE_INTEGER || (m === "maxDrawnLabelUnits" && n > LIMIT_MAX)) throw bad("OUT_OF_RANGE", `${path}.${m}`);
          if (m === "maxDrawnLabelUnits") capUnits = n; else out.capacity[m] = n;
        }
        break;
      }
      case "contextAttributes": {
        const ca = ownData(v, path);
        for (const m of Object.keys(ca)) if (ca[m] !== undefined && m !== "failIfMajorPerformanceCaveat") throw bad("SCHEMA", `${path}.${m}`, "unknown attribute");
        const f = ca["failIfMajorPerformanceCaveat"];
        if (f !== undefined) {
          if (typeof f !== "boolean") throw bad("SCHEMA", `${path}.failIfMajorPerformanceCaveat`, "boolean expected");
          out.failIfMajorPerformanceCaveat = f;
        }
        break;
      }
      case "dl": {
        const snap = ownData(v, path); // read once: the one budget value comes from this copy
        const r = resolveDlOptions(snap);
        out.dl.labels = r.labels; out.dl.edgeLabels = r.edgeLabels;
        dlUnits = snap["maxDrawnLabelUnits"] === undefined ? undefined : r.maxDrawnLabelUnits;
        break;
      }
      case "dprMilli": out.dprMilli = resolveReplayOptions({ dprMilli: v }).dprMilli; break;
      case "ink": out.ink = resolveReplayOptions({ ink: v }).ink; break;
      case "maxDlBytes": case "maxGlBytes": {
        const n = numberClass(v, path);
        if (n < 0 || n > LIMIT_MAX) throw bad("OUT_OF_RANGE", path);
        out[k] = n;
        break;
      }
      case "name": case "version":
        if (typeof v !== "string") throw bad("SCHEMA", path, "string expected");
        if (!(k === "name" ? NAME : VERSION).test(v)) throw bad("INVALID_VALUE", path, "does not match the manifest pattern");
        out[k] = v;
        break;
    }
  }
  if (capUnits !== undefined && dlUnits !== undefined && capUnits !== dlUnits) throw bad("INVALID_VALUE", "options.capacity.maxDrawnLabelUnits", "must equal dl.maxDrawnLabelUnits");
  const units = capUnits ?? dlUnits ?? d.maxDrawnLabelUnits;
  // the one value is also the manifest's capacity, which must be positive (27 8.3): a RENDERER with a label budget of 0 is refused like V5 and V6 (design rev 5, 6.5);
  // the list builder and planGl called directly accept 0
  if (units < 1) throw bad("OUT_OF_RANGE", "options.dl.maxDrawnLabelUnits", "the label budget of a renderer must be positive");
  out.dl.maxDrawnLabelUnits = units;
  out.capacity.maxDrawnLabelUnits = units;
  return out;
}
