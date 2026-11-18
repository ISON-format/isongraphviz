// src/model.ts - ingestion boundary, RenderModel, address index (design section 2).
import { resolveInSource } from "isongraph-visualize-scene-core";
import type { ObjectRef, ResolvedIdentity } from "isongraph-visualize-scene-core";
import { bindLayout } from "isongraph-visualize-layout-core";
import { canonicalBytesSigned, compareUtf8, nodeKey, nodeRefFromWire, snapshotBytes, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { IgrError } from "./errors.js";
import { copyEdgeRef, copyNodeRef, edgeAddressKey, elementKey, nodeAddressKey, readElementAddress, readWireEdge, readWireNode } from "./elements.js";
import { resolveLimits } from "./limits.js";
import type { ElementAddress, ModelEdge, ModelNode, RenderLimits, RenderModel } from "./types.js";
import { IgsError } from "isongraph-visualize-scene-core";

export { elementKey };

const BRAND = Symbol.for("isongraph.igr.model/1");
/** Private accessor key: returns a fresh copy of the verified canonical scene bytes. Registered globally so another bundled copy of this package reads it too. */
const SCENE_BYTES = Symbol.for("isongraph.igr.model.sceneBytes/1");
const HEX64 = /^[0-9a-f]{64}$/;
const tag = (v: unknown): string => Object.prototype.toString.call(v);

/** Brand and shape check (design 2.1): a guard against accident, not a trust token. */
export function isRenderModel(v: unknown): v is RenderModel {
  try {
    if (typeof v !== "object" || v === null) return false;
    const m = v as Record<PropertyKey, unknown>;
    if (!Object.prototype.hasOwnProperty.call(m, BRAND) || m[BRAND] !== true) return false;
    if (m["igr_model"] !== "igr-model/1" || m["scale"] !== 1000 || typeof m["directed"] !== "boolean") return false;
    for (const h of ["artifactSha256", "sceneSha256", "layoutSha256"]) if (typeof m[h] !== "string" || !HEX64.test(m[h] as string)) return false;
    if (!Object.isFrozen(m)) return false;
    for (const a of ["nodes", "edges", "categories"]) if (!Array.isArray(m[a]) || !Object.isFrozen(m[a])) return false;
    const d = Object.getOwnPropertyDescriptor(m, SCENE_BYTES); // an accessor returning a copy: never invoked here
    if (!d || typeof d.get !== "function") return false;
    return true;
  } catch { return false; }
}

export function assertModel(model: unknown): asserts model is RenderModel {
  if (!isRenderModel(model)) throw new IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL");
}

interface Index { nodes: Map<string, ModelNode>; edges: Map<string, ModelEdge> }
const indexes = new WeakMap<object, Index>();

/** Built once at model creation; a model from another bundled copy is indexed lazily from its own frozen arrays. */
function indexOf(model: RenderModel): Index {
  let ix = indexes.get(model);
  if (!ix) {
    ix = { nodes: new Map(model.nodes.map((n) => [nodeAddressKey(n.ref), n] as const)), edges: new Map(model.edges.map((e) => [edgeAddressKey(e.ref), e] as const)) };
    indexes.set(model, ix);
  }
  return ix;
}

/** Strict, non-throwing lookup of an exact-shape wire address (design 2.2). Anything else: undefined. */
export function lookupElement(model: RenderModel, address: unknown): ModelNode | ModelEdge | undefined {
  try {
    const ix = indexOf(model);
    const n = readWireNode(address);
    if (n) return ix.nodes.get(nodeAddressKey(n));
    const e = readWireEdge(address);
    if (e) return ix.edges.get(edgeAddressKey(e));
  } catch { /* a hostile address cannot name an element */ }
  return undefined;
}

/** Resolve an ElementAddress (already shape-checked) to its element. */
export function resolveElement(model: RenderModel, a: ElementAddress): ModelNode | ModelEdge | undefined {
  const ix = indexOf(model);
  return "node" in a ? ix.nodes.get(nodeAddressKey(a.node)) : ix.edges.get(edgeAddressKey(a.edge));
}

const deepFreeze = <T>(v: T): T => {
  if (typeof v === "object" && v !== null && !ArrayBuffer.isView(v) && !Object.isFrozen(v)) {
    for (const k of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, k)!; if (!d.get) deepFreeze(d.value); }
    Object.freeze(v);
  }
  return v;
};

/** The one ingestion function: snapshot, byte limits, bindLayout (errors propagate unchanged), count and label limits, derive. */
export async function buildRenderModel(sceneBytes: Uint8Array, layoutBytes: Uint8Array, options?: { limits?: Partial<RenderLimits> }): Promise<RenderModel> {
  const s = snapshotBytes(sceneBytes); // both snapshots and the options read happen before the first await
  const l = snapshotBytes(layoutBytes);
  if (options !== undefined && (typeof options !== "object" || options === null)) throw new IgrError("INVALID_INPUT", "SCHEMA", "options", "object expected");
  let rawLimits: unknown;
  try { rawLimits = options === undefined ? undefined : options.limits; } catch { throw new IgrError("INVALID_INPUT", "UNREADABLE", "options.limits", "a property could not be read"); }
  const limits = resolveLimits(rawLimits);
  if (s.length > limits.maxSceneBytes || l.length > limits.maxLayoutBytes) throw new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT");
  const bound = await bindLayout(s, l);
  const { scene, layout } = bound;
  if (scene.nodes.length > limits.maxNodes) throw new IgrError("RESOURCE_LIMIT", "NODE_LIMIT");
  if (scene.edges.length > limits.maxEdges) throw new IgrError("RESOURCE_LIMIT", "EDGE_LIMIT");
  let units = 0;
  for (const n of scene.nodes) units += n.label.length + n.category.length;
  for (const e of scene.edges) units += e.label.length;
  if (units > limits.maxTotalLabelUnits) throw new IgrError("RESOURCE_LIMIT", "LABEL_LIMIT");

  const pos = new Map(layout.nodes.map((n) => [nodeKey(nodeRefFromWire(n.ref)), n] as const));
  const byKey = new Map<string, number>();
  const nodes: ModelNode[] = scene.nodes.map((n, index) => {
    const key = nodeKey(nodeRefFromWire(n.ref));
    byKey.set(key, index);
    const p = pos.get(key)!; // bindLayout proved the sets equal
    return { index, ref: copyNodeRef(n.ref), category: n.category, label: n.label, x: p.x, y: p.y, degree: 0 };
  });
  const degree = new Array<number>(nodes.length).fill(0);
  const edges: ModelEdge[] = scene.edges.map((e, index) => {
    const src = byKey.get(nodeKey(nodeRefFromWire(e.ref.src)))!, tgt = byKey.get(nodeKey(nodeRefFromWire(e.ref.tgt)))!;
    degree[src]!++;
    if (tgt !== src) degree[tgt]!++; // a self-loop counts once
    return { index, ref: copyEdgeRef(e.ref), label: e.label, src, tgt };
  });
  nodes.forEach((n, i) => { n.degree = degree[i]!; });
  const categories = [...new Set(nodes.map((n) => n.category))].sort(compareUtf8);
  const model: Record<string, unknown> = {
    igr_model: "igr-model/1", artifactSha256: scene.source.artifact_sha256, sceneSha256: bound.sceneSha256, layoutSha256: bound.layoutSha256,
    directed: scene.graph.directed, scale: 1000, nodes, edges, categories,
  };
  if (nodes.length > 0) {
    // a single pass: never spread a node-sized array into a call (the argument limit makes that a RangeError)
    let min_x = nodes[0]!.x, max_x = min_x, min_y = nodes[0]!.y, max_y = min_y;
    for (const n of nodes) { if (n.x < min_x) min_x = n.x; if (n.x > max_x) max_x = n.x; if (n.y < min_y) min_y = n.y; if (n.y > max_y) max_y = n.y; }
    model["bounds"] = { min_x, min_y, max_x, max_y };
  }
  const privateBytes = new Uint8Array(s); // private copy; a non-empty Uint8Array cannot be frozen, so it is only ever handed out as a copy
  Object.defineProperty(model, SCENE_BYTES, { get: () => new Uint8Array(privateBytes), enumerable: false });
  Object.defineProperty(model, BRAND, { value: true, enumerable: false });
  return deepFreeze(model) as unknown as RenderModel;
}

/** A fresh copy of the verified canonical scene bytes of this model (mutating it changes nothing). */
export function modelSceneBytes(model: RenderModel): Uint8Array {
  assertModel(model);
  return (model as unknown as Record<symbol, Uint8Array>)[SCENE_BYTES]!;
}

/** IGR-CJ/1 bytes of the derivation (design 2.2, Appendix A.1). Conformance only. */
export function modelBytes(model: RenderModel): Uint8Array {
  assertModel(model);
  const v: Record<string, CJValue> = {
    artifact_sha256: model.artifactSha256, categories: [...model.categories], directed: model.directed,
    edges: model.edges.map((e) => ({ label: e.label, ref: copyEdgeRef(e.ref) as unknown as CJValue, src: e.src, tgt: e.tgt })),
    igr_model: model.igr_model, layout_sha256: model.layoutSha256,
    nodes: model.nodes.map((n) => ({ category: n.category, degree: n.degree, label: n.label, ref: copyNodeRef(n.ref) as unknown as CJValue, x: n.x, y: n.y })),
    scale: model.scale, scene_sha256: model.sceneSha256,
  };
  if (model.bounds) v["bounds"] = { ...model.bounds };
  return canonicalBytesSigned(v);
}

/** ObjectRef of an element: exactly the artifact hash and the address (IGS/1 section 9). UNRESOLVED_ADDRESS (IgsError) if absent. */
export function selectionReference(model: RenderModel, address: ElementAddress): ObjectRef {
  assertModel(model);
  const a = readElementAddress(address);
  if (!a) throw new IgrError("INVALID_INPUT", "SCHEMA", "address", "ElementAddress expected");
  const found = resolveElement(model, a);
  if (!found) throw new IgsError("UNRESOLVED_ADDRESS", undefined, undefined, JSON.stringify(a));
  return { artifact_sha256: model.artifactSha256, address: "src" in found.ref ? copyEdgeRef(found.ref) : copyNodeRef(found.ref) };
}

/** = resolveInSource(sourceBytes, selectionReference(...)); SOURCE_MISMATCH / UNRESOLVED_ADDRESS pass through. */
export function resolveSelection(model: RenderModel, address: ElementAddress, sourceBytes: Uint8Array): Promise<ResolvedIdentity> {
  return resolveInSource(sourceBytes, selectionReference(model, address));
}
