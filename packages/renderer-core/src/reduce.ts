// src/reduce.ts - intents, the pure reducer, events (design section 5) and the viewport transitions of section 6.
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { IgrError } from "./errors.js";
import { copyEdgeRef, copyNodeRef } from "./elements.js";
import { resolveLimits } from "./limits.js";
import { assertModel, lookupElement } from "./model.js";
import { checkState, stateFromCore, visibilityOf, type StateCore } from "./state.js";
import type { ModelEdge, ModelNode, ObjectRef, RenderLimits, RenderModel, SemanticEvent, SemanticState, ViewportState } from "./types.js";
import { VIEWPORT_MAX_PX, ZOOM_MAX_MILLI, ZOOM_MIN_MILLI } from "./types.js";
import { S, clampZoom, defaultPadding, divRound, fitBounds, intReason, type Bounds } from "./viewport.js";

const inv = (reason: string, path?: string, detail?: string): IgrError => new IgrError("INVALID_INTENT", reason, path, detail);
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const PIX_LIMIT = 2 ** 31;

/** IGR-CJ/1 of the event array; vectors store expected_events this way. */
export const serializeEvents = (events: readonly SemanticEvent[]): Uint8Array => canonicalBytesSigned(events as unknown as CJValue);

// ---------------------------------------------------------------------------------------------------------------------------
// Intent parsing: a closed, validated, owned copy. Each caller property is read exactly once.
// ---------------------------------------------------------------------------------------------------------------------------
/** A target whose CONTAINER was checked (exactly one key, node or edge, holding an object); the address inside is a snapshot, judged only by resolution. */
interface RawTarget { edge: boolean; inner: unknown }
type Mode = "replace" | "add" | "remove" | "toggle";
type Parsed =
  | { k: "select"; mode: Mode; targets: RawTarget[] }
  | { k: "clear-selection" }
  | { k: "focus"; target?: RawTarget }
  | { k: "focus-step"; delta: 1 | -1 } | { k: "focus-first" } | { k: "focus-last" }
  | { k: "set-hidden"; targets: RawTarget[]; hidden: boolean }
  | { k: "pan"; dx: number; dy: number }
  | { k: "zoom"; factor: number; anchor?: { x: number; y: number } }
  | { k: "fit"; padding?: number }
  | { k: "set-viewport"; center_x: number; center_y: number; zoom: number }
  | { k: "resize"; width: number; height: number };

const SPECS = new Map<string, { req: string[]; opt: string[] }>([
  ["select", { req: ["mode", "targets"], opt: [] }], ["clear-selection", { req: [], opt: [] }], ["focus", { req: [], opt: ["target"] }],
  ["focus-step", { req: ["delta"], opt: [] }], ["focus-first", { req: [], opt: [] }], ["focus-last", { req: [], opt: [] }],
  ["set-hidden", { req: ["targets", "hidden"], opt: [] }], ["pan", { req: ["dx", "dy"], opt: [] }],
  ["zoom", { req: ["factor_milli"], opt: ["anchor"] }], ["fit", { req: [], opt: ["padding"] }],
  ["set-viewport", { req: ["center_x", "center_y", "zoom"], opt: [] }], ["resize", { req: ["width", "height"], opt: [] }],
]);

/** Integer within [min, max] (OUT_OF_RANGE outside); non-number SCHEMA, NaN/Infinity NOT_FINITE, fraction INVALID_VALUE. */
function int(v: unknown, path: string, min: number, max: number): number {
  const r = intReason(v);
  if (r) throw inv(r, path);
  const n = v as number;
  if (n < min || n > max) throw inv("OUT_OF_RANGE", path);
  return n === 0 ? 0 : n;
}

/** A plain-data snapshot of an address, each property read once; never throws (hostile structure is cut off and will not resolve). */
function snapshotInner(v: unknown, depth = 0): unknown {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null || v === undefined) return v;
  if (depth > 4 || typeof v !== "object") return undefined;
  try {
    if (Array.isArray(v)) return v.slice(0, 16).map((x: unknown) => snapshotInner(x, depth + 1));
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const k of Object.keys(v).slice(0, 32)) Object.defineProperty(out, k, { value: snapshotInner((v as Record<string, unknown>)[k], depth + 1), enumerable: true, writable: true, configurable: true });
    return out;
  } catch { return undefined; }
}

function containerOf(x: unknown, path: string): RawTarget {
  let key: string | undefined, inner: unknown;
  try {
    if (typeof x !== "object" || x === null || Array.isArray(x)) throw inv("SCHEMA", path, "an element address container expected");
    const keys = Object.keys(x);
    if (keys.length !== 1 || (keys[0] !== "node" && keys[0] !== "edge")) throw inv("SCHEMA", path, "exactly one key, node or edge");
    key = keys[0];
    inner = (x as Record<string, unknown>)[key];
  } catch (e) { if (e instanceof IgrError) throw e; throw inv("SCHEMA", path, "a property could not be read"); }
  if (typeof inner !== "object" || inner === null || Array.isArray(inner)) throw inv("SCHEMA", `${path}.${key}`, "an object expected");
  return { edge: key === "edge", inner: snapshotInner(inner) };
}

function targetsOf(v: unknown, path: string): RawTarget[] {
  if (!Array.isArray(v)) throw inv("SCHEMA", path, "array expected");
  const n = v.length;
  const out: RawTarget[] = [];
  for (let i = 0; i < n; i++) out.push(containerOf(v[i] as unknown, `${path}[${i}]`));
  return out;
}

const stringUnits = (v: unknown): number => {
  if (typeof v === "string") return v.length;
  if (typeof v !== "object" || v === null) return 0;
  let n = 0;
  for (const x of Object.values(v)) n += stringUnits(x);
  return n;
};

/** TARGET_LIMIT: the target count first, then the total UTF-16 length of every string inside every target, both before de-duplication. */
function checkTargetLimit(targets: readonly RawTarget[], path: string, lim: RenderLimits): void {
  if (targets.length > lim.maxIntentTargets) throw new IgrError("RESOURCE_LIMIT", "TARGET_LIMIT", path);
  let units = 0;
  for (const x of targets) units += stringUnits(x.inner);
  if (units > lim.maxSceneBytes) throw new IgrError("RESOURCE_LIMIT", "TARGET_LIMIT", path);
}

function parseIntent(raw: unknown, lim: RenderLimits, vp: ViewportState): Parsed {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw inv("SCHEMA", "intent", "object expected");
  let keys: string[];
  const v: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  try {
    keys = Object.keys(raw);
    const typeValue: unknown = keys.includes("type") ? (raw as Record<string, unknown>)["type"] : undefined; // an own undefined counts as absent
    if (typeValue === undefined) throw inv("SCHEMA", "intent.type", "missing"); // R46: {} is SCHEMA
    v["type"] = typeValue;
    if (typeof typeValue !== "string") throw inv("UNKNOWN_TYPE", "intent.type", "a known type string expected"); // {"type":5} is UNKNOWN_TYPE
    const spec = SPECS.get(typeValue);
    if (!spec) throw inv("UNKNOWN_TYPE", "intent.type", typeValue);
    for (const k of keys) if (k !== "type" && !spec.req.includes(k) && !spec.opt.includes(k)) throw inv("SCHEMA", `intent.${k}`, "unknown field");
    for (const k of [...spec.req, ...spec.opt]) {
      if (!keys.includes(k)) { if (spec.req.includes(k)) throw inv("SCHEMA", `intent.${k}`, "missing"); continue; }
      const x = (raw as Record<string, unknown>)[k]; // read once
      if (x === undefined) { if (spec.req.includes(k)) throw inv("SCHEMA", `intent.${k}`, "missing"); continue; }
      v[k] = x;
    }
  } catch (e) {
    if (e instanceof IgrError) throw e;
    throw inv("SCHEMA", "intent", "a property could not be read");
  }
  switch (v["type"]) {
    case "select": {
      const mode = v["mode"];
      if (typeof mode !== "string") throw inv("SCHEMA", "intent.mode");
      if (mode !== "replace" && mode !== "add" && mode !== "remove" && mode !== "toggle") throw inv("INVALID_VALUE", "intent.mode");
      const targets = targetsOf(v["targets"], "intent.targets");
      checkTargetLimit(targets, "intent.targets", lim);
      return { k: "select", mode, targets };
    }
    case "clear-selection": return { k: "clear-selection" };
    case "focus": return v["target"] === undefined ? { k: "focus" } : { k: "focus", target: containerOf(v["target"], "intent.target") };
    case "focus-step": {
      const r = intReason(v["delta"]);
      if (r) throw inv(r, "intent.delta");
      if (v["delta"] !== 1 && v["delta"] !== -1) throw inv("INVALID_VALUE", "intent.delta");
      return { k: "focus-step", delta: v["delta"] };
    }
    case "focus-first": return { k: "focus-first" };
    case "focus-last": return { k: "focus-last" };
    case "set-hidden": {
      const targets = targetsOf(v["targets"], "intent.targets");
      if (typeof v["hidden"] !== "boolean") throw inv("SCHEMA", "intent.hidden", "boolean expected");
      checkTargetLimit(targets, "intent.targets", lim);
      return { k: "set-hidden", targets, hidden: v["hidden"] };
    }
    case "pan": return { k: "pan", dx: int(v["dx"], "intent.dx", -PIX_LIMIT, PIX_LIMIT), dy: int(v["dy"], "intent.dy", -PIX_LIMIT, PIX_LIMIT) };
    case "zoom": {
      const factor = int(v["factor_milli"], "intent.factor_milli", 1, 1_000_000);
      if (v["anchor"] === undefined) return { k: "zoom", factor };
      const a = v["anchor"];
      if (typeof a !== "object" || a === null || Array.isArray(a)) throw inv("SCHEMA", "intent.anchor", "object expected");
      let ax: unknown, ay: unknown;
      try {
        const ks = Object.keys(a);
        if (ks.length !== 2 || !ks.includes("x") || !ks.includes("y")) throw inv("SCHEMA", "intent.anchor", "exactly x and y");
        ax = (a as Record<string, unknown>)["x"]; ay = (a as Record<string, unknown>)["y"];
      } catch (e) { if (e instanceof IgrError) throw e; throw inv("SCHEMA", "intent.anchor", "unreadable"); }
      return { k: "zoom", factor, anchor: { x: int(ax, "intent.anchor.x", -PIX_LIMIT, PIX_LIMIT), y: int(ay, "intent.anchor.y", -PIX_LIMIT, PIX_LIMIT) } };
    }
    case "fit": {
      if (v["padding"] === undefined) return { k: "fit" };
      const r = intReason(v["padding"]);
      if (r) throw inv(r, "intent.padding");
      const p = v["padding"] as number;
      if (p < 0) throw inv("INVALID_VALUE", "intent.padding", "negative");
      if (p > VIEWPORT_MAX_PX) throw inv("OUT_OF_RANGE", "intent.padding");
      if (vp.width - 2 * p < 1 || vp.height - 2 * p < 1) throw inv("OUT_OF_RANGE", "intent.padding", "width - 2 padding and height - 2 padding must be at least 1"); // part of the field check (5.2 step 3)
      return { k: "fit", padding: p === 0 ? 0 : p };
    }
    case "set-viewport": return {
      k: "set-viewport", center_x: int(v["center_x"], "intent.center_x", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      center_y: int(v["center_y"], "intent.center_y", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), zoom: int(v["zoom"], "intent.zoom", ZOOM_MIN_MILLI, ZOOM_MAX_MILLI),
    };
    default: return { k: "resize", width: int(v["width"], "intent.width", 1, VIEWPORT_MAX_PX), height: int(v["height"], "intent.height", 1, VIEWPORT_MAX_PX) };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------------------------------------------------------
const safeNumber = (v: bigint, path: string): number => { if (v < -SAFE || v > SAFE) throw inv("OUT_OF_RANGE", path); return Number(v); };

function visibleBounds(model: RenderModel, vis: boolean[]): Bounds | undefined {
  let b: Bounds | undefined;
  model.nodes.forEach((n, i) => {
    if (!vis[i]) return;
    if (!b) b = { min_x: n.x, min_y: n.y, max_x: n.x, max_y: n.y };
    else { b.min_x = Math.min(b.min_x, n.x); b.min_y = Math.min(b.min_y, n.y); b.max_x = Math.max(b.max_x, n.x); b.max_y = Math.max(b.max_y, n.y); }
  });
  return b;
}

/** Section 6 fit over effectively visible nodes only. No visible node: the viewport is returned unchanged. */
function fitCore(model: RenderModel, core: StateCore, padding: number | undefined): ViewportState {
  const v = core.viewport;
  const p = padding ?? defaultPadding(v.width, v.height);
  if (v.width - 2 * p < 1 || v.height - 2 * p < 1) throw inv("OUT_OF_RANGE", "intent.padding", "width - 2 padding and height - 2 padding must be at least 1");
  const b = visibleBounds(model, visibilityOf(model, core.hiddenNodes, core.hiddenEdges).nodes);
  if (!b) return { ...v };
  return { ...fitBounds(b, v.width, v.height, p), width: v.width, height: v.height };
}

/** Public form of the fit transition; errors are those of the `fit` intent. */
export function fitViewport(model: RenderModel, state: SemanticState, padding?: number): ViewportState {
  assertModel(model);
  const core = checkState(model, state, "strict");
  if (padding !== undefined) {
    const r = intReason(padding);
    if (r) throw inv(r, "padding");
    if (padding < 0) throw inv("INVALID_VALUE", "padding");
    if (padding > VIEWPORT_MAX_PX) throw inv("OUT_OF_RANGE", "padding");
  }
  return fitCore(model, core, padding);
}

type Elt = { edge: boolean; index: number };
const sameSet = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const sameFocus = (a?: Elt, b?: Elt): boolean => (a === undefined || b === undefined ? a === b : a.edge === b.edge && a.index === b.index);

/** lookupElement is strict: a malformed address names nothing. The container kind must match what was found. */
function resolveRaw(model: RenderModel, t: RawTarget): ModelNode | ModelEdge | undefined {
  const e = lookupElement(model, t.inner);
  if (!e || ("src" in e.ref) !== t.edge) return undefined;
  return e;
}

function resolveAll(model: RenderModel, targets: readonly RawTarget[]): { nodes: number[]; edges: number[] } {
  const found = targets.map((t, i) => { const e = resolveRaw(model, t); if (!e) throw inv("UNRESOLVED_ELEMENT", `intent.targets[${i}]`); return e; });
  const nodes = new Set<number>(), edges = new Set<number>();
  for (const e of found) { if ("src" in e.ref) edges.add(e.index); else nodes.add(e.index); }
  return { nodes: [...nodes], edges: [...edges] };
}
const sorted = (s: Iterable<number>): number[] => [...s].sort((a, b) => a - b);

function apply(model: RenderModel, core: StateCore, p: Parsed): { core: StateCore; boundary?: "start" | "end" } {
  const next: StateCore = { ...core, hiddenNodes: [...core.hiddenNodes], hiddenEdges: [...core.hiddenEdges], selNodes: [...core.selNodes], selEdges: [...core.selEdges], viewport: { ...core.viewport } };
  if (core.focus) next.focus = { ...core.focus }; else delete next.focus;
  const vis = visibilityOf(model, core.hiddenNodes, core.hiddenEdges);
  switch (p.k) {
    case "select": {
      const t = resolveAll(model, p.targets); // every target must resolve, judged before visibility
      if (p.mode !== "remove" && (t.nodes.some((i) => !vis.nodes[i]) || t.edges.some((j) => !vis.edges[j]))) throw inv("ELEMENT_HIDDEN", "intent.targets");
      const n = new Set(core.selNodes), e = new Set(core.selEdges);
      if (p.mode === "replace") { n.clear(); e.clear(); }
      for (const i of t.nodes) { if (p.mode === "remove") n.delete(i); else if (p.mode === "toggle") { if (n.has(i)) n.delete(i); else n.add(i); } else n.add(i); }
      for (const j of t.edges) { if (p.mode === "remove") e.delete(j); else if (p.mode === "toggle") { if (e.has(j)) e.delete(j); else e.add(j); } else e.add(j); }
      next.selNodes = sorted(n); next.selEdges = sorted(e);
      return { core: next };
    }
    case "clear-selection": next.selNodes = []; next.selEdges = []; return { core: next };
    case "focus": {
      if (!p.target) { delete next.focus; return { core: next }; }
      const el = resolveRaw(model, p.target);
      if (!el) throw inv("UNRESOLVED_ELEMENT", "intent.target");
      const isEdge = "src" in el.ref;
      if (!(isEdge ? vis.edges[el.index] : vis.nodes[el.index])) throw inv("ELEMENT_HIDDEN", "intent.target");
      next.focus = { edge: isEdge, index: el.index };
      return { core: next };
    }
    case "focus-first": case "focus-last": case "focus-step": {
      const order: Elt[] = [];
      model.nodes.forEach((_, i) => { if (vis.nodes[i]) order.push({ edge: false, index: i }); });
      model.edges.forEach((_, j) => { if (vis.edges[j]) order.push({ edge: true, index: j }); });
      if (order.length === 0) return { core: next };
      if (p.k === "focus-first") { next.focus = order[0]!; return { core: next }; }
      if (p.k === "focus-last") { next.focus = order[order.length - 1]!; return { core: next }; }
      let at = core.focus ? order.findIndex((o) => o.edge === core.focus!.edge && o.index === core.focus!.index) : -1;
      if (at < 0) { next.focus = p.delta === 1 ? order[0]! : order[order.length - 1]!; return { core: next }; }
      at += p.delta;
      if (at < 0) return { core: next, boundary: "start" };
      if (at >= order.length) return { core: next, boundary: "end" };
      next.focus = order[at]!;
      return { core: next };
    }
    case "set-hidden": {
      const t = resolveAll(model, p.targets);
      const n = new Set(core.hiddenNodes), e = new Set(core.hiddenEdges);
      for (const i of t.nodes) { if (p.hidden) n.add(i); else n.delete(i); }
      for (const j of t.edges) { if (p.hidden) e.add(j); else e.delete(j); }
      next.hiddenNodes = sorted(n); next.hiddenEdges = sorted(e);
      const v2 = visibilityOf(model, next.hiddenNodes, next.hiddenEdges);
      next.selNodes = next.selNodes.filter((i) => v2.nodes[i]);
      next.selEdges = next.selEdges.filter((j) => v2.edges[j]);
      if (next.focus && !(next.focus.edge ? v2.edges[next.focus.index] : v2.nodes[next.focus.index])) delete next.focus; // unhiding restores nothing
      return { core: next };
    }
    case "pan": {
      const z = BigInt(core.viewport.zoom);
      next.viewport.center_x = safeNumber(BigInt(core.viewport.center_x) - divRound(BigInt(p.dx) * S, z), "center_x");
      next.viewport.center_y = safeNumber(BigInt(core.viewport.center_y) - divRound(BigInt(p.dy) * S, z), "center_y");
      return { core: next };
    }
    case "zoom": {
      const z = BigInt(core.viewport.zoom);
      const z2 = clampZoom(divRound(z * BigInt(p.factor), 1000n));
      if (p.anchor) {
        const u = 2n * BigInt(p.anchor.x) - BigInt(core.viewport.width), vv = 2n * BigInt(p.anchor.y) - BigInt(core.viewport.height);
        next.viewport.center_x = safeNumber(BigInt(core.viewport.center_x) + divRound(u * S, 2n * z) - divRound(u * S, 2n * z2), "center_x");
        next.viewport.center_y = safeNumber(BigInt(core.viewport.center_y) + divRound(vv * S, 2n * z) - divRound(vv * S, 2n * z2), "center_y");
      }
      next.viewport.zoom = Number(z2);
      return { core: next };
    }
    case "fit": next.viewport = fitCore(model, core, p.padding); return { core: next };
    case "set-viewport": next.viewport = { ...core.viewport, center_x: p.center_x, center_y: p.center_y, zoom: p.zoom }; return { core: next };
    case "resize": next.viewport = { ...core.viewport, width: p.width, height: p.height }; return { core: next };
  }
}

const objectRef = (model: RenderModel, isEdge: boolean, index: number): ObjectRef =>
  ({ artifact_sha256: model.artifactSha256, address: isEdge ? copyEdgeRef(model.edges[index]!.ref) : copyNodeRef(model.nodes[index]!.ref) });
const refsOf = (model: RenderModel, nodes: readonly number[], edges: readonly number[]): ObjectRef[] =>
  [...nodes.map((i) => objectRef(model, false, i)), ...edges.map((j) => objectRef(model, true, j))];

/**
 * Pure, synchronous, all-or-nothing. Never mutates its arguments; reads each caller-owned property once.
 * Events in the order visibility, selection, focus, viewport, boundary; none when nothing changed (except traversal-boundary).
 */
export function reduce(model: RenderModel, state: SemanticState, intent: unknown, limits?: Partial<RenderLimits>): { state: SemanticState; events: SemanticEvent[] } {
  assertModel(model);
  const lim = resolveLimits(limits);
  const core = checkState(model, state, "strict");
  const parsed = parseIntent(intent, lim, core.viewport);
  const { core: next, boundary } = apply(model, core, parsed);
  const events: SemanticEvent[] = [];
  if (!sameSet(core.hiddenNodes, next.hiddenNodes) || !sameSet(core.hiddenEdges, next.hiddenEdges)) events.push({ type: "visibility-changed", hidden: refsOf(model, next.hiddenNodes, next.hiddenEdges) });
  if (!sameSet(core.selNodes, next.selNodes) || !sameSet(core.selEdges, next.selEdges)) events.push({ type: "selection-changed", selection: refsOf(model, next.selNodes, next.selEdges) });
  if (!sameFocus(core.focus, next.focus)) events.push(next.focus ? { type: "focus-changed", focus: objectRef(model, next.focus.edge, next.focus.index) } : { type: "focus-changed" });
  const a = core.viewport, b = next.viewport;
  if (a.center_x !== b.center_x || a.center_y !== b.center_y || a.width !== b.width || a.height !== b.height || a.zoom !== b.zoom) events.push({ type: "viewport-changed", viewport: { ...b } });
  if (boundary) events.push({ type: "traversal-boundary", end: boundary });
  return { state: stateFromCore(model, next), events };
}

