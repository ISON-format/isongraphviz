// src/manifest.ts - capability manifest verification and the degradation matrix (design section 8).
import { IgrError } from "./errors.js";
import type { CapabilityId, CapabilityManifest, CapabilityStatus, Degradation, MandatoryCapability, OptionalCapability } from "./types.js";

export const MANDATORY_CAPABILITIES: readonly MandatoryCapability[] = Object.freeze([
  "scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "labels", "direction-cue", "indicators.non-color", "a11y.model", "state.report", "lifecycle",
] as const);
const OPTIONAL: readonly OptionalCapability[] = ["export.scene", "export.svg", "export.png", "a11y.native-dom", "a11y.companion-dom", "labels.edge", "motion.animated"];
const KNOWN: readonly string[] = [...MANDATORY_CAPABILITIES, ...OPTIONAL, "scene.apply-delta"];
const DEGRADATIONS: readonly string[] = ["EDGE_LABELS_OMITTED", "EDGE_STYLE_SIMPLIFIED", "LABELS_ELIDED"];
const REASONS: readonly string[] = ["RESERVED", "NOT_IMPLEMENTED", "HOST_LACKS"];
const NAME = /^[a-z][a-z0-9._-]*$/;
const VERSION = /^[0-9A-Za-z._+-]+$/;
const XID = /^x-[a-z0-9][a-z0-9._-]*$/;

/** Capabilities that supported-only: any other status is MANDATORY_UNSUPPORTED / MANDATORY_DEGRADED. */
const STRICT = new Set(["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "a11y.model", "state.report", "lifecycle"]);
/** Allowed degradations of the capabilities that list any. */
const ALLOWED_DEGRADATIONS = new Map<string, readonly string[]>([["labels", ["LABELS_ELIDED"]], ["direction-cue", ["EDGE_STYLE_SIMPLIFIED"]], ["labels.edge", ["EDGE_LABELS_OMITTED"]]]);
/** Visual capabilities: `HOST_LACKS` is allowed only for these and only when the host is "headless". */
const VISUAL = new Set(["labels", "direction-cue", "indicators.non-color"]); // exactly these three (rev 4, 8.1/8.2); labels.edge is not visual
/** Mandatory capabilities that may be unsupported only through HOST_LACKS on a headless host. */
const MANDATORY_VISUAL = new Set(["labels", "direction-cue", "indicators.non-color"]);

const bad = (reason: string, path?: string, detail?: string): IgrError => new IgrError("INVALID_MANIFEST", reason, path, detail);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Closed object: exactly these keys (SCHEMA otherwise); returns an owned shallow copy; every property is read once. */
function exact(v: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!isObj(v)) throw bad("SCHEMA", path, "object expected");
  const own = Object.keys(v);
  if (own.length !== keys.length || !keys.every((k) => own.includes(k))) throw bad("SCHEMA", path, `exactly the keys ${keys.join(", ")}`);
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = v[k];
  return out;
}

function verifyStatus(id: string, raw: unknown, host: "dom" | "headless"): CapabilityStatus {
  const path = `capabilities.${id}`;
  if (!isObj(raw)) throw bad("SCHEMA", path, "object expected");
  const status: unknown = raw["status"];
  let s: CapabilityStatus;
  if (status === "supported") { exact(raw, ["status"], path); s = { status: "supported" }; }
  else if (status === "degraded") {
    const d = exact(raw, ["status", "degradations"], path)["degradations"];
    if (!Array.isArray(d) || d.length === 0) throw bad("SCHEMA", path, "a non-empty degradations array");
    const list: string[] = [];
    for (let i = 0; i < d.length; i++) { const x: unknown = d[i]; if (typeof x !== "string") throw bad("SCHEMA", `${path}.degradations[${i}]`); list.push(x); }
    for (const x of list) if (!DEGRADATIONS.includes(x)) throw bad("UNKNOWN_DEGRADATION", path, x);
    for (let i = 1; i < list.length; i++) if (list[i]! <= list[i - 1]!) throw bad("SCHEMA", path, "degradations must be sorted and unique");
    s = { status: "degraded", degradations: list as Degradation[] };
  } else if (status === "unsupported") {
    const reason = exact(raw, ["status", "reason"], path)["reason"];
    if (typeof reason !== "string" || !REASONS.includes(reason)) throw bad("SCHEMA", `${path}.reason`);
    s = { status: "unsupported", reason: reason as "RESERVED" | "NOT_IMPLEMENTED" | "HOST_LACKS" };
  } else throw bad("SCHEMA", `${path}.status`);

  const x = id.startsWith("x-");
  if (s.status === "unsupported" && s.reason === "RESERVED" && id !== "scene.apply-delta") throw bad("RESERVED_CAPABILITY", path);
  if (id === "scene.apply-delta") {
    if (!(s.status === "unsupported" && s.reason === "RESERVED")) throw bad("RESERVED_CAPABILITY", path);
    return s;
  }
  if (s.status === "unsupported" && s.reason === "HOST_LACKS" && !x && !(host === "headless" && VISUAL.has(id))) throw bad("HOST_LACKS_NOT_ALLOWED", path);
  if (x) return s;
  if (STRICT.has(id)) {
    if (s.status === "unsupported") throw bad("MANDATORY_UNSUPPORTED", path);
    if (s.status === "degraded") throw bad("MANDATORY_DEGRADED", path);
    return s;
  }
  if (MANDATORY_VISUAL.has(id) && s.status === "unsupported" && s.reason !== "HOST_LACKS") throw bad("MANDATORY_UNSUPPORTED", path);
  if (id === "indicators.non-color" && s.status === "degraded") throw bad("MANDATORY_DEGRADED", path); // only supported (or HOST_LACKS on a headless host) is allowed, whatever degradation it names
  if (s.status === "degraded") {
    const allowed = ALLOWED_DEGRADATIONS.get(id) ?? [];
    if (s.degradations.some((d) => !allowed.includes(d))) throw bad("DEGRADATION_NOT_ALLOWED", path);
  }
  return s;
}

const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;

/** Verifies a manifest of an unknown source and returns a deep-frozen owned copy. Throws INVALID_MANIFEST. */
export function verifyManifest(manifest: unknown): CapabilityManifest {
  let top: Record<string, unknown>;
  try {
    top = exact(manifest, ["capabilities", "capacity", "igr", "renderer"], "manifest");
    if (typeof top["igr"] !== "string") throw bad("SCHEMA", "manifest.igr", "string expected");
    if (top["igr"] !== "IGR/1") throw bad("UNSUPPORTED_VERSION", "manifest.igr");
    const r = exact(top["renderer"], ["host", "name", "version"], "manifest.renderer");
    if (r["host"] !== "dom" && r["host"] !== "headless") throw bad("SCHEMA", "manifest.renderer.host");
    if (typeof r["name"] !== "string" || !NAME.test(r["name"])) throw bad("INVALID_NAME", "manifest.renderer.name");
    if (typeof r["version"] !== "string" || !VERSION.test(r["version"])) throw bad("INVALID_NAME", "manifest.renderer.version");
    const host: "dom" | "headless" = r["host"];
    const c = exact(top["capacity"], ["maxDrawnLabelUnits", "maxEdges", "maxNodes"], "manifest.capacity");
    for (const k of ["maxNodes", "maxEdges", "maxDrawnLabelUnits"]) { if (typeof c[k] !== "number") throw bad("SCHEMA", `manifest.capacity.${k}`, "number expected"); if (!positive(c[k])) throw bad("INVALID_LIMITS", `manifest.capacity.${k}`); }
    if (!isObj(top["capabilities"])) throw bad("SCHEMA", "manifest.capabilities", "object expected");
    const raw = top["capabilities"];
    const keys = Object.keys(raw);
    for (const k of KNOWN) if (!keys.includes(k)) throw bad("MISSING_CAPABILITY", `manifest.capabilities.${k}`);
    for (const k of keys) if (!KNOWN.includes(k) && !XID.test(k)) throw bad("UNKNOWN_CAPABILITY", `manifest.capabilities.${k}`); // a malformed x- id is unknown
    const caps: Record<string, CapabilityStatus> = {};
    for (const k of [...keys].sort()) caps[k] = verifyStatus(k, raw[k], host); // ascending key order (UTF-16)
    const out: CapabilityManifest = {
      igr: "IGR/1", renderer: { name: r["name"], version: r["version"] as string, host },
      capabilities: caps as Record<CapabilityId, CapabilityStatus>,
      capacity: { maxNodes: c["maxNodes"] as number, maxEdges: c["maxEdges"] as number, maxDrawnLabelUnits: c["maxDrawnLabelUnits"] as number },
    };
    return deepFreeze(out);
  } catch (e) {
    if (e instanceof IgrError) throw e;
    throw bad("SCHEMA", "manifest", "a property could not be read");
  }
}

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]); Object.freeze(v); }
  return v;
}
