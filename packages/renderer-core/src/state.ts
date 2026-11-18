// src/state.ts - SemanticState: canonical form, verification and its check order (design section 4.2).
import { canonicalBytesSigned, decodeNodeId, hasLoneSurrogate, IDENTIFIER, sha256Hex, snapshotBytes, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { IgrError } from "./errors.js";
import { copyEdgeRef, copyNodeRef, edgeElement, isPlainObject, nodeElement } from "./elements.js";
import { resolveLimits } from "./limits.js";
import { assertModel, lookupElement } from "./model.js";
import type { ElementAddress, ModelEdge, RenderLimits, RenderModel, SemanticState, ViewportState, WireEdgeAddress, WireNodeRef } from "./types.js";
import { VIEWPORT_MAX_PX, ZOOM_DEFAULT_MILLI, ZOOM_MAX_MILLI, ZOOM_MIN_MILLI } from "./types.js";
import { defaultPadding, fitBounds, intReason } from "./viewport.js";

const bad = (reason: string, path?: string, detail?: string): IgrError => new IgrError("INVALID_STATE", reason, path, detail);
const HEX64 = /^[0-9a-f]{64}$/;
const ORD = /^(0|[1-9][0-9]*)$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Index form of a valid state: what the reducer works on. Index lists are strictly ascending. */
export interface StateCore {
  focus?: { edge: boolean; index: number };
  hiddenNodes: number[]; hiddenEdges: number[];
  selNodes: number[]; selEdges: number[];
  viewport: ViewportState;
}
export type CheckMode = "strict" | "normalize";

// ---------------------------------------------------------------------------------------------------------------------------
// Step 1: schema walk. First failure wins; at every object: unknown keys, then missing keys, then the remaining keys ascending.
// ---------------------------------------------------------------------------------------------------------------------------
export interface Raw {
  focus?: { node: WireNodeRef } | { edge: WireEdgeAddress };
  hidden: { nodes: WireNodeRef[]; edges: WireEdgeAddress[] }; selection: { nodes: WireNodeRef[]; edges: WireEdgeAddress[] };
  scene: string; layout: string; viewport: ViewportState;
}
export interface Ctx { rejectNegZero: boolean; /** address patterns are checked (default true); a report checks shape only */ patterns?: boolean; /** the value of `igr` is judged elsewhere (a report: V2) */ deferVersion?: boolean }

function closed(v: unknown, path: string, allowed: readonly string[], required: readonly string[]): Record<string, unknown> {
  if (!isObj(v)) throw bad("SCHEMA", path, "object expected");
  const keys = Object.keys(v);
  for (const k of keys) if (!allowed.includes(k)) throw bad("UNKNOWN_FIELD", `${path}.${k}`);
  for (const k of required) if (!keys.includes(k)) throw bad("MISSING_FIELD", `${path}.${k}`);
  return v;
}

function safeInt(v: unknown, path: string, ctx: Ctx): number {
  if (typeof v !== "number") throw bad("SCHEMA", path, "number expected");
  if (!Number.isSafeInteger(v)) throw bad("INVALID_NUMBER", path);
  if (Object.is(v, -0)) { if (ctx.rejectNegZero) throw bad("NON_CANONICAL", path, "negative zero"); return 0; }
  return v;
}

function hash(v: unknown, path: string): string {
  if (typeof v !== "string") throw bad("SCHEMA", path, "string expected");
  if (!HEX64.test(v)) throw bad("INVALID_HASH", path);
  return v;
}

function node(v: unknown, path: string, ctx: Ctx): WireNodeRef {
  const o = closed(v, path, ["id", "type"], ["id", "type"]); // the key rule of every object: unknown first, then missing
  const id: unknown = o["id"], type: unknown = o["type"];
  if (typeof id !== "string") throw bad("SCHEMA", `${path}.id`, "string expected");
  if (ctx.patterns !== false) { try { decodeNodeId(id); } catch { throw bad("INVALID_VALUE", `${path}.id`, "tagged id expected"); } }
  if (typeof type !== "string") throw bad("SCHEMA", `${path}.type`, "string expected");
  if (ctx.patterns !== false && !IDENTIFIER.test(type)) throw bad("INVALID_VALUE", `${path}.type`);
  return { id, type };
}

function edge(v: unknown, path: string, ctx: Ctx): WireEdgeAddress {
  const o = closed(v, path, ["ord", "rel", "src", "tgt"], ["ord", "rel", "src", "tgt"]);
  const ord: unknown = o["ord"], rel: unknown = o["rel"];
  if (typeof ord !== "string") throw bad("SCHEMA", `${path}.ord`, "string expected");
  if (ctx.patterns !== false && !ORD.test(ord)) throw bad("INVALID_VALUE", `${path}.ord`);
  if (typeof rel !== "string") throw bad("SCHEMA", `${path}.rel`, "string expected");
  if (ctx.patterns !== false && !IDENTIFIER.test(rel)) throw bad("INVALID_VALUE", `${path}.rel`);
  const src = node(o["src"], `${path}.src`, ctx);
  const tgt = node(o["tgt"], `${path}.tgt`, ctx);
  return { ord, rel, src, tgt };
}

function array<T>(v: unknown, path: string, each: (x: unknown, p: string) => T): T[] {
  if (!Array.isArray(v)) throw bad("SCHEMA", path, "array expected");
  return v.map((x: unknown, i) => each(x, `${path}[${i}]`));
}

function elementSet(v: unknown, path: string, ctx: Ctx): { nodes: WireNodeRef[]; edges: WireEdgeAddress[] } {
  const o = closed(v, path, ["edges", "nodes"], ["edges", "nodes"]);
  const edges = array(o["edges"], `${path}.edges`, (x, p) => edge(x, p, ctx));
  const nodes = array(o["nodes"], `${path}.nodes`, (x, p) => node(x, p, ctx));
  return { nodes, edges };
}

export function schema(v: unknown, ctx: Ctx): Raw {
  const top = closed(v, "$", ["focus", "hidden", "igr", "layout_sha256", "scene_sha256", "selection", "viewport"], ["hidden", "igr", "layout_sha256", "scene_sha256", "selection", "viewport"]);
  const has = (k: string) => Object.keys(top).includes(k);
  let focus: Raw["focus"];
  if (has("focus")) {
    const f = closed(top["focus"], "$.focus", ["node", "edge"], []);
    const keys = Object.keys(f);
    if (keys.length !== 1) throw bad("SCHEMA", "$.focus", "exactly one of node or edge");
    focus = keys[0] === "node" ? { node: node(f["node"], "$.focus.node", ctx) } : { edge: edge(f["edge"], "$.focus.edge", ctx) };
  }
  const hidden = elementSet(top["hidden"], "$.hidden", ctx);
  const igr: unknown = top["igr"];
  if (typeof igr !== "string") throw bad("SCHEMA", "$.igr", "string expected");
  if (igr !== "IGR/1" && !ctx.deferVersion) throw bad("UNSUPPORTED_VERSION", "$.igr");
  const layout = hash(top["layout_sha256"], "$.layout_sha256");
  const scene = hash(top["scene_sha256"], "$.scene_sha256");
  const selection = elementSet(top["selection"], "$.selection", ctx);
  const vp = closed(top["viewport"], "$.viewport", ["center_x", "center_y", "height", "width", "zoom"], ["center_x", "center_y", "height", "width", "zoom"]);
  const center_x = safeInt(vp["center_x"], "$.viewport.center_x", ctx);
  const center_y = safeInt(vp["center_y"], "$.viewport.center_y", ctx);
  const height = safeInt(vp["height"], "$.viewport.height", ctx);
  if (height < 1 || height > VIEWPORT_MAX_PX) throw bad("INVALID_VIEWPORT", "$.viewport.height");
  const width = safeInt(vp["width"], "$.viewport.width", ctx);
  if (width < 1 || width > VIEWPORT_MAX_PX) throw bad("INVALID_VIEWPORT", "$.viewport.width");
  const zoom = safeInt(vp["zoom"], "$.viewport.zoom", ctx);
  if (zoom < ZOOM_MIN_MILLI || zoom > ZOOM_MAX_MILLI) throw bad("INVALID_VIEWPORT", "$.viewport.zoom");
  const out: Raw = { hidden, selection, scene, layout, viewport: { center_x, center_y, width, height, zoom } };
  if (focus) out.focus = focus;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Effective visibility
// ---------------------------------------------------------------------------------------------------------------------------
export interface EffectiveVisibility { nodes: boolean[]; edges: boolean[] }

/** visible[i] is true when node/edge i is effectively visible: not in the explicit hidden set, and (for an edge) with both endpoints visible. */
export function visibilityOf(model: RenderModel, hiddenNodes: readonly number[], hiddenEdges: readonly number[]): EffectiveVisibility {
  const nodes = model.nodes.map(() => true), edges = model.edges.map(() => true);
  for (const i of hiddenNodes) nodes[i] = false;
  for (const j of hiddenEdges) edges[j] = false;
  model.edges.forEach((e, j) => { if (!nodes[e.src] || !nodes[e.tgt]) edges[j] = false; });
  return { nodes, edges };
}

/** Derived, never serialized: which elements are effectively visible (true), by scene-order index. */
export function effectiveVisibility(model: RenderModel, state: SemanticState): EffectiveVisibility {
  assertModel(model);
  const core = checkState(model, state, "strict", { rejectNegZero: true });
  return visibilityOf(model, core.hiddenNodes, core.hiddenEdges);
}

// ---------------------------------------------------------------------------------------------------------------------------
// Steps 2-5 on the walked value, then the index form
// ---------------------------------------------------------------------------------------------------------------------------
export function build(model: RenderModel, raw: Raw, mode: CheckMode, skipBinding = false): StateCore {
  // 2. binding (a report is validated without it, 11)
  if (!skipBinding) {
    if (raw.scene !== model.sceneSha256) throw bad("SCENE_MISMATCH");
    if (raw.layout !== model.layoutSha256) throw bad("LAYOUT_MISMATCH");
  }
  // 3. integrity: every address resolves (all of them), then no element twice in a set. Document key order: focus, hidden, selection.
  const nodeIdx = (a: WireNodeRef, path: string): number => { const e = lookupElement(model, a); if (!e || "src" in e) throw bad("UNRESOLVED_ELEMENT", path); return e.index; };
  const edgeIdx = (a: WireEdgeAddress, path: string): number => { const e = lookupElement(model, a) as ModelEdge | undefined; if (!e || !("src" in e)) throw bad("UNRESOLVED_ELEMENT", path); return e.index; };
  let focus: StateCore["focus"];
  if (raw.focus) focus = "node" in raw.focus ? { edge: false, index: nodeIdx(raw.focus.node, "$.focus.node") } : { edge: true, index: edgeIdx(raw.focus.edge, "$.focus.edge") };
  const hiddenEdges = raw.hidden.edges.map((a, i) => edgeIdx(a, `$.hidden.edges[${i}]`));
  const hiddenNodes = raw.hidden.nodes.map((a, i) => nodeIdx(a, `$.hidden.nodes[${i}]`));
  const selEdges = raw.selection.edges.map((a, i) => edgeIdx(a, `$.selection.edges[${i}]`));
  const selNodes = raw.selection.nodes.map((a, i) => nodeIdx(a, `$.selection.nodes[${i}]`));
  const sets: [number[], string][] = [[hiddenEdges, "$.hidden.edges"], [hiddenNodes, "$.hidden.nodes"], [selEdges, "$.selection.edges"], [selNodes, "$.selection.nodes"]];
  if (mode === "strict") {
    for (const [s, p] of sets) if (new Set(s).size !== s.length) throw bad("DUPLICATE_ELEMENT", p);
    // 4. ordering
    for (const [s, p] of sets) for (let i = 1; i < s.length; i++) if (s[i]! <= s[i - 1]!) throw bad("NON_CANONICAL", p, "not strictly ascending in scene order");
  } else {
    for (const [s] of sets) { const u = [...new Set(s)].sort((a, b) => a - b); for (let i = 0; i < u.length; i++) s[i] = u[i]!; s.length = u.length; }
  }
  // 5. consistency
  const vis = visibilityOf(model, hiddenNodes, hiddenEdges);
  if (selNodes.some((i) => !vis.nodes[i]) || selEdges.some((j) => !vis.edges[j])) throw bad("SELECTED_HIDDEN");
  if (focus && !(focus.edge ? vis.edges[focus.index] : vis.nodes[focus.index])) throw bad("FOCUS_HIDDEN");
  const core: StateCore = { hiddenNodes, hiddenEdges, selNodes, selEdges, viewport: { ...raw.viewport } };
  if (focus) core.focus = focus;
  return core;
}

/** Steps 1-5 on a value (steps 1(ii)-5 of 4.2). `strict` demands sorted unique sets; `normalize` sorts and de-duplicates instead. */
export function checkState(model: RenderModel, value: unknown, mode: CheckMode, ctx: Ctx = { rejectNegZero: true }): StateCore {
  const snap = snapshotValue(value);
  if (loneSurrogateAnywhere(snap)) throw bad("INVALID_STRING"); // step 1(i): a lone surrogate in any string or key
  return build(model, schema(snap, ctx), mode);
}

/** The element-set and viewport value of a core, as a fresh SemanticState. */
export function stateFromCore(model: RenderModel, core: StateCore): SemanticState {
  const st: SemanticState = {
    hidden: { nodes: core.hiddenNodes.map((i) => copyNodeRef(model.nodes[i]!.ref)), edges: core.hiddenEdges.map((j) => copyEdgeRef(model.edges[j]!.ref)) },
    igr: "IGR/1", layout_sha256: model.layoutSha256, scene_sha256: model.sceneSha256,
    selection: { nodes: core.selNodes.map((i) => copyNodeRef(model.nodes[i]!.ref)), edges: core.selEdges.map((j) => copyEdgeRef(model.edges[j]!.ref)) },
    viewport: { ...core.viewport },
  };
  if (core.focus) st.focus = core.focus.edge ? { edge: copyEdgeRef(model.edges[core.focus.index]!.ref) } : { node: copyNodeRef(model.nodes[core.focus.index]!.ref) };
  return st;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Snapshotting caller-owned objects: every property is read exactly once into plain data.
// ---------------------------------------------------------------------------------------------------------------------------
const NOT_DATA = Symbol("not-data");
export function snapshotValue(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v === undefined) return undefined;
  if (depth > 8) throw bad("SCHEMA", undefined, "nesting too deep");
  try {
    if (Array.isArray(v)) {
      const n = v.length;
      const out: unknown[] = new Array<unknown>(n);
      for (let i = 0; i < n; i++) out[i] = snapshotValue(v[i] as unknown, depth + 1);
      return out;
    }
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const k of Object.keys(v)) { const x = v[k]; if (x === undefined) continue; /* an undefined optional value is absent (rev 4, 4.1) */ Object.defineProperty(out, k, { value: snapshotValue(x, depth + 1), enumerable: true, writable: true, configurable: true }); }
      return out;
    }
  } catch (e) {
    if (e instanceof IgrError) throw e;
    throw new IgrError("INVALID_INPUT", "UNREADABLE", undefined, "a property could not be read");
  }
  return NOT_DATA; // a function, symbol, bigint, class instance...: a wrong JSON type wherever it is found (SCHEMA), after the unknown-key check of its object
}

export function loneSurrogateAnywhere(root: unknown): boolean {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === "string") { if (hasLoneSurrogate(v)) return true; }
    else if (Array.isArray(v)) { for (const x of v) stack.push(x); }
    else if (typeof v === "object" && v !== null) {
      for (const k of Object.keys(v)) { if (hasLoneSurrogate(k)) return true; stack.push((v as Record<string, unknown>)[k]); }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------------------------------
/** STRICT writer: validates, never reorders, throws INVALID_STATE on any violation. */
export function serializeState(model: RenderModel, state: SemanticState): Uint8Array {
  assertModel(model);
  return canonicalBytesSigned(stateFromCore(model, checkState(model, state, "strict", { rejectNegZero: true })) as unknown as CJValue);
}

/** Host-side: sorts and de-duplicates sets by scene order, otherwise validates. */
export function normalizeState(model: RenderModel, state: SemanticState): SemanticState {
  assertModel(model);
  return stateFromCore(model, checkState(model, state, "normalize", { rejectNegZero: true }));
}

/** Strict reader; checks in the order of design 4.2: size limit, schema, binding, integrity, ordering, consistency, canonical bytes. */
export function parseState(model: RenderModel, bytes: Uint8Array, limits?: Partial<RenderLimits>): SemanticState {
  assertModel(model);
  const input = snapshotBytes(bytes);
  const lim = resolveLimits(limits);
  if (input.length > lim.maxStateBytes) throw new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT");
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) throw bad("INVALID_ENCODING", undefined, "byte-order mark");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input); } catch { throw bad("INVALID_ENCODING", undefined, "not valid UTF-8"); }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw bad("SCHEMA", undefined, "not JSON"); }
  if (loneSurrogateAnywhere(parsed)) throw bad("INVALID_STRING");
  const core = build(model, schema(parsed, { rejectNegZero: false }), "strict");
  const state = stateFromCore(model, core);
  const again = canonicalBytesSigned(state as unknown as CJValue);
  if (again.length !== input.length || again.some((b, i) => b !== input[i])) throw bad("NON_CANONICAL");
  return state;
}

export async function stateSha256(model: RenderModel, state: SemanticState): Promise<string> {
  return sha256Hex(serializeState(model, state));
}

/** Initial state: nothing selected or hidden, no focus; viewport fitted to all nodes (an empty scene: centre 0,0 at ZOOM_DEFAULT). */
export function initialState(model: RenderModel, size: { width: number; height: number }): SemanticState {
  assertModel(model);
  const { width, height } = readSize(size);
  const core: StateCore = { hiddenNodes: [], hiddenEdges: [], selNodes: [], selEdges: [], viewport: { center_x: 0, center_y: 0, width, height, zoom: ZOOM_DEFAULT_MILLI } };
  if (model.bounds) core.viewport = { ...fitBounds(model.bounds, width, height, defaultPadding(width, height)), width, height };
  return stateFromCore(model, core);
}

/** A size read once from a caller object: integers 1...VIEWPORT_MAX_PX, else INVALID_INPUT. */
export function readSize(size: unknown): { width: number; height: number } {
  if (typeof size !== "object" || size === null) throw new IgrError("INVALID_INPUT", "SCHEMA", "size", "object expected");
  const w: unknown = (size as Record<string, unknown>)["width"], h: unknown = (size as Record<string, unknown>)["height"];
  for (const [k, v] of [["width", w], ["height", h]] as const) {
    const r = intReason(v);
    if (r) throw new IgrError("INVALID_INPUT", r, `size.${k}`);
    if ((v as number) < 1 || (v as number) > VIEWPORT_MAX_PX) throw new IgrError("INVALID_INPUT", "OUT_OF_RANGE", `size.${k}`);
  }
  return { width: w as number, height: h as number };
}

/** All effectively visible nodes in scene order, then all effectively visible edges in scene order. */
export function traversalOrder(model: RenderModel, state: SemanticState): ElementAddress[] {
  assertModel(model);
  return traversalOfCore(model, checkState(model, state, "strict", { rejectNegZero: true }));
}

export function traversalOfCore(model: RenderModel, core: StateCore): ElementAddress[] {
  const vis = visibilityOf(model, core.hiddenNodes, core.hiddenEdges);
  const out: ElementAddress[] = [];
  model.nodes.forEach((n, i) => { if (vis.nodes[i]) out.push(nodeElement(n.ref)); });
  model.edges.forEach((e, j) => { if (vis.edges[j]) out.push(edgeElement(e.ref)); });
  return out;
}

/** A deep copy of a (valid) state: plain data only. */
export const cloneState = (s: SemanticState): SemanticState => JSON.parse(JSON.stringify(s)) as SemanticState;
