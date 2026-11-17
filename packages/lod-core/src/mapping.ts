// src/mapping.ts — identity mapping between scene nodes and view objects, aggregate-edge resolution, conservation of a given view (design 29 sections 4, 7.4, 9, 11).
import { verifyScene } from "isongraph-visualize-scene-core";
import type { Scene } from "isongraph-visualize-scene-core";
import { compareNodeRef, nodeRefFromWire, sha256Hex, snapshotBytes } from "isongraph-visualize-scene-core/primitives";
import { aggregatePreimage, idFromHex, isAggregateId } from "./aggregate.js";
import { checkConservation } from "./conservation.js";
import { LODError } from "./errors.js";
import { MAX_EDGES, MAX_NODES, resolveBudget, type BudgetOptions } from "./limits.js";
import { indexScene, keyOfRef } from "./sceneinfo.js";
import type { AggregateEdge, View, ViewRef, WireEdgeAddress, WireNodeRef } from "./types.js";
import { utf8Len, workView } from "./work.js";

const schema = (path: string, detail: string): LODError => new LODError("INVALID_LOD", "SCHEMA", path, detail);
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

function exactKeys(o: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Rec {
  if (!isRec(o)) throw schema(path, "object expected");
  const keys = Object.keys(o);
  for (const k of keys) if (!required.includes(k) && !optional.includes(k)) throw schema(`${path}.${k}`, "unknown key");
  for (const k of required) if (!Object.prototype.hasOwnProperty.call(o, k)) throw schema(`${path}.${k}`, "missing key");
  return o;
}
const str = (v: unknown, path: string): string => { if (typeof v !== "string") throw schema(path, "string expected"); return v; };
const num = (v: unknown, path: string): number => { if (typeof v !== "number" || !Number.isSafeInteger(v)) throw schema(path, "integer expected"); return v; };
const arr = (v: unknown, path: string): unknown[] => { if (!Array.isArray(v)) throw schema(path, "array expected"); return v; };

function wireRef(v: unknown, path: string): WireNodeRef {
  const o = exactKeys(v, path, ["id", "type"]);
  return { id: str(o["id"], `${path}.id`), type: str(o["type"], `${path}.type`) };
}
function viewRef(v: unknown, path: string): ViewRef {
  if (isRec(v) && Object.prototype.hasOwnProperty.call(v, "agg")) return { agg: str(exactKeys(v, path, ["agg"])["agg"], `${path}.agg`) };
  return wireRef(v, path);
}
function relCounts(v: unknown, path: string): void {
  arr(v, path).forEach((r, i) => { const o = exactKeys(r, `${path}[${i}]`, ["count", "rel"]); num(o["count"], `${path}[${i}].count`); str(o["rel"], `${path}[${i}].rel`); });
}

/** The shape check of a caller-supplied View (section 4): every key with the right JSON type, exact key sets, ViewRefs exactly {id,type} or {agg}. Nothing else is validated. */
export function checkViewShape(v: unknown): View {
  const o = exactKeys(v, "view", ["address_scheme", "aggregate_edges", "aggregates", "directed", "edges", "igview", "layout_sha256", "nodes", "scale", "scene_sha256", "state_sha256"], ["elided"]);
  str(o["address_scheme"], "view.address_scheme"); str(o["igview"], "view.igview"); num(o["scale"], "view.scale");
  str(o["layout_sha256"], "view.layout_sha256"); str(o["scene_sha256"], "view.scene_sha256"); str(o["state_sha256"], "view.state_sha256");
  if (typeof o["directed"] !== "boolean") throw schema("view.directed", "boolean expected");
  arr(o["nodes"], "view.nodes").forEach((n, i) => {
    const p = `view.nodes[${i}]`;
    const r = exactKeys(n, p, ["label_level", "ref", "x", "y"], ["elided_edges"]);
    wireRef(r["ref"], `${p}.ref`); num(r["x"], `${p}.x`); num(r["y"], `${p}.y`); str(r["label_level"], `${p}.label_level`);
    if ("elided_edges" in r) num(r["elided_edges"], `${p}.elided_edges`);
  });
  arr(o["aggregates"], "view.aggregates").forEach((a, i) => {
    const p = `view.aggregates[${i}]`;
    const r = exactKeys(a, p, ["anchor", "hidden", "id", "internal_edges", "label_level", "member_count"], ["children", "elided_edges", "exposed", "label"]);
    const an = exactKeys(r["anchor"], `${p}.anchor`, ["x", "y"]); num(an["x"], `${p}.anchor.x`); num(an["y"], `${p}.anchor.y`);
    arr(r["hidden"], `${p}.hidden`).forEach((h, j) => wireRef(h, `${p}.hidden[${j}]`));
    if ("exposed" in r) arr(r["exposed"], `${p}.exposed`).forEach((h, j) => wireRef(h, `${p}.exposed[${j}]`));
    if ("children" in r) arr(r["children"], `${p}.children`).forEach((c, j) => str(c, `${p}.children[${j}]`));
    str(r["id"], `${p}.id`); str(r["label_level"], `${p}.label_level`); num(r["member_count"], `${p}.member_count`);
    if ("label" in r) str(r["label"], `${p}.label`);
    if ("elided_edges" in r) num(r["elided_edges"], `${p}.elided_edges`);
    const ie = exactKeys(r["internal_edges"], `${p}.internal_edges`, ["count", "rel_counts"]);
    num(ie["count"], `${p}.internal_edges.count`); relCounts(ie["rel_counts"], `${p}.internal_edges.rel_counts`);
  });
  arr(o["edges"], "view.edges").forEach((e, i) => {
    const p = `view.edges[${i}]`;
    const r = exactKeys(exactKeys(e, p, ["ref"])["ref"], `${p}.ref`, ["ord", "rel", "src", "tgt"]);
    str(r["ord"], `${p}.ref.ord`); str(r["rel"], `${p}.ref.rel`); wireRef(r["src"], `${p}.ref.src`); wireRef(r["tgt"], `${p}.ref.tgt`);
  });
  arr(o["aggregate_edges"], "view.aggregate_edges").forEach((b, i) => {
    const p = `view.aggregate_edges[${i}]`;
    const r = exactKeys(b, p, ["count", "rel_counts", "src", "tgt"]);
    num(r["count"], `${p}.count`); relCounts(r["rel_counts"], `${p}.rel_counts`); viewRef(r["src"], `${p}.src`); viewRef(r["tgt"], `${p}.tgt`);
  });
  if ("elided" in o) {
    const r = exactKeys(o["elided"], "view.elided", ["items", "rel_counts", "scene_edges"]);
    num(r["items"], "view.elided.items"); num(r["scene_edges"], "view.elided.scene_edges"); relCounts(r["rel_counts"], "view.elided.rel_counts");
  }
  return v as View;
}

/** A ViewRef given to a function (not part of a view): {id,type} with a decodable id, or {agg} with a well-formed aggregate id. */
function argRef(v: unknown, path: string, allowAgg: boolean): ViewRef {
  if (isRec(v) && Object.prototype.hasOwnProperty.call(v, "agg")) {
    if (!allowAgg) throw schema(path, "a scene node reference expected");
    const a = str(exactKeys(v, path, ["agg"])["agg"], `${path}.agg`);
    if (!isAggregateId(a)) throw new LODError("INVALID_LOD", "INVALID_ID", `${path}.agg`);
    return { agg: a };
  }
  const r = wireRef(v, path);
  try { nodeRefFromWire(r); } catch { throw schema(`${path}.id`, "not a tagged id"); }
  return r;
}

const key = (r: WireNodeRef): string => keyOfRef(r);
const sortRefs = (rs: WireNodeRef[]): WireNodeRef[] => {
  let dec: Array<{ r: WireNodeRef; d: ReturnType<typeof nodeRefFromWire> }>;
  try { dec = rs.map((r) => ({ r, d: nodeRefFromWire(r) })); } catch { throw schema("view", "a reference whose id is not a tagged id"); }
  return dec.sort((a, b) => compareNodeRef(a.d, b.d)).map((x) => x.r);
};

/** An owned, shape-checked copy of a caller view (each property read once). */
function ownedView(view: unknown): View {
  let owned: unknown;
  try { owned = structuredClone(view); } catch { throw schema("view", "not a plain object"); }
  return checkViewShape(owned);
}

export function projectToView(view: View, refs: readonly WireNodeRef[]): ViewRef[] {
  const v = ownedView(view);
  if (!Array.isArray(refs)) throw schema("refs", "array expected");
  const owned = Array.from(refs).map((r, i) => argRef(r, `refs[${i}]`, false) as WireNodeRef);
  const nodePos = new Map<string, number>();
  v.nodes.forEach((n, i) => nodePos.set(key(n.ref), i));
  const aggOf = new Map<string, string>();
  for (const a of v.aggregates) for (const h of a.hidden) aggOf.set(key(h), a.id);
  const nodes = new Set<number>(), aggs = new Set<string>();
  for (const r of owned) {
    const k = key(r);
    const p = nodePos.get(k);
    if (p !== undefined) { nodes.add(p); continue; }
    const a = aggOf.get(k);
    if (a === undefined) throw new LODError("UNRESOLVED_NODE", "PROJECTION", undefined, `${r.type} ${r.id}`);
    aggs.add(a);
  }
  // sorted explicitly (NodeRef/2 for scene nodes, then ids ascending), whatever the order of the view's arrays
  const out: ViewRef[] = sortRefs([...nodes].map((i) => ({ id: v.nodes[i]!.ref.id, type: v.nodes[i]!.ref.type })));
  for (const a of [...aggs].sort()) out.push({ agg: a });
  return out;
}

export function resolveFromView(view: View, refs: readonly ViewRef[]): WireNodeRef[] {
  const v = ownedView(view);
  if (!Array.isArray(refs)) throw schema("refs", "array expected");
  const owned = Array.from(refs).map((r, i) => argRef(r, `refs[${i}]`, true));
  const visible = new Set(v.nodes.map((n) => key(n.ref)));
  const aggs = new Map(v.aggregates.map((a) => [a.id, a] as const));
  const out = new Map<string, WireNodeRef>();
  for (const r of owned) {
    if ("agg" in r) {
      const a = aggs.get(r.agg);
      if (a === undefined) throw new LODError("NOT_IN_VIEW", "AGGREGATE", undefined, r.agg);
      for (const h of a.hidden) out.set(key(h), { id: h.id, type: h.type });
    } else {
      if (!visible.has(key(r))) throw new LODError("NOT_IN_VIEW", "NODE", undefined, `${r.type} ${r.id}`);
      out.set(key(r), { id: r.id, type: r.type });
    }
  }
  return sortRefs([...out.values()]);
}

// ---------------------------------------------------------------- entry points that also need the scene

interface Prepared { scene: Scene; sceneSha256: string; view: View; V: number }

/** The shared prefix of resolveAggregateEdge and checkViewConservation: view shape, budget shape, verifyScene, node and edge limits, the view's scene hash. */
async function prepare(sceneBytes: Uint8Array, view: View, options: BudgetOptions | undefined, extra?: (v: View) => void): Promise<{ p: Prepared; maxWork: number }> {
  const input = snapshotBytes(sceneBytes); // synchronous, first
  const v = ownedView(view);
  extra?.(v);
  const budget = resolveBudget(options);
  const { scene, sceneSha256 } = await verifyScene(input);
  if (scene.nodes.length > Math.min(budget.maxNodes, MAX_NODES)) throw new LODError("RESOURCE_LIMIT", "NODE_LIMIT");
  if (scene.edges.length > Math.min(budget.maxEdges, MAX_EDGES)) throw new LODError("RESOURCE_LIMIT", "EDGE_LIMIT");
  if (v.scene_sha256 !== sceneSha256) throw new LODError("STATE_MISMATCH", "SCENE");
  let V = v.nodes.length + v.edges.length + v.aggregate_edges.length;
  for (const b of v.aggregate_edges) V += b.rel_counts.length;
  for (const a of v.aggregates) V += a.hidden.length + (a.exposed?.length ?? 0) + a.internal_edges.rel_counts.length;
  if (v.elided !== undefined) V += v.elided.rel_counts.length;
  return { p: { scene, sceneSha256, view: v, V }, maxWork: budget.maxWork };
}

const sameRef = (a: ViewRef, b: ViewRef): boolean => ("agg" in a ? "agg" in b && a.agg === b.agg : !("agg" in b) && a.id === b.id && a.type === b.type);

/** The scene edges behind one aggregate edge of a view, re-derived from the view's representatives, in scene order. */
export async function resolveAggregateEdge(sceneBytes: Uint8Array, view: View, edge: AggregateEdge, options?: BudgetOptions): Promise<WireEdgeAddress[]> {
  let target: { src: ViewRef; tgt: ViewRef } | undefined;
  const { p, maxWork } = await prepare(sceneBytes, view, options, () => {
    if (!isRec(edge)) throw schema("edge", "object expected");
    const e = edge as unknown as Rec;
    const own = (k: string): unknown => (Object.prototype.hasOwnProperty.call(e, k) ? e[k] : undefined);
    target = { src: argRef(own("src"), "edge.src", true), tgt: argRef(own("tgt"), "edge.tgt", true) };
  });
  const { scene, view: v } = p;
  const info = indexScene(scene);
  const W = workView({ n: info.n, m: info.m, V: p.V, Lkey: info.Lkey, Hidsp: 0, Gp: 0 }, false);
  if (W > BigInt(maxWork)) throw new LODError("RESOURCE_LIMIT", "WORK_LIMIT");
  const found = v.aggregate_edges.find((b) => sameRef(b.src, target!.src) && sameRef(b.tgt, target!.tgt));
  if (found === undefined) throw new LODError("NOT_IN_VIEW", "EDGE");

  const n = info.n;
  const aggIds = v.aggregates.map((a) => a.id).sort();
  const aggRank = new Map(aggIds.map((id, j) => [id, n + j] as const));
  const rep = new Int32Array(n).fill(-1); // -1: the node is in neither nodes[] nor any hidden list
  for (const nd of v.nodes) { const i = info.index.get(key(nd.ref)); if (i !== undefined) rep[i] = i; }
  for (const a of v.aggregates) for (const h of a.hidden) { const i = info.index.get(key(h)); if (i !== undefined) rep[i] = aggRank.get(a.id)!; }
  const rankOf = (r: ViewRef): number | undefined => ("agg" in r ? aggRank.get(r.agg) : info.index.get(key(r)));
  let ta = rankOf(found.src), tb = rankOf(found.tgt);
  if (ta === undefined || tb === undefined) throw new LODError("NOT_IN_VIEW", "EDGE");
  if (!info.directed && ta > tb) { const t = ta; ta = tb; tb = t; }
  const out: WireEdgeAddress[] = [];
  for (let e = 0; e < info.m; e++) {
    const u = info.src[e]!, w = info.tgt[e]!;
    const ru = rep[u]!, rv = rep[w]!;
    if (ru < 0 || rv < 0) continue;
    if (ru === u && rv === w) continue; // a visible scene edge
    if (ru === rv) continue; // internal
    let a = ru, b = rv;
    if (!info.directed && a > b) { a = rv; b = ru; }
    if (a === ta && b === tb) { const r = scene.edges[e]!.ref; out.push({ ord: r.ord, rel: r.rel, src: { id: r.src.id, type: r.src.type }, tgt: { id: r.tgt.id, type: r.tgt.type } }); }
  }
  return out;
}

const noScene = (detail: string): never => { throw new LODError("INTERNAL", "CONSERVATION", undefined, detail); };

/** Law 4 needs the SCENE: every node reference of the view (visible, hidden, exposed), every visible-edge address and every bundle endpoint must name an object of this scene or of this view. */
function tieViewToScene(v: View, scene: Scene, nodeIndex: ReadonlyMap<string, number>): void {
  const visible = new Set<string>();
  for (const n of v.nodes) { const k = key(n.ref); if (!nodeIndex.has(k)) noScene(`C-nodes: visible node ${k} is not in the scene`); visible.add(k); }
  for (const a of v.aggregates) {
    for (const h of a.hidden) { const k = key(h); if (!nodeIndex.has(k)) noScene(`C-nodes: hidden node ${k} is not in the scene`); }
    for (const e of a.exposed ?? []) { const k = key(e); if (!nodeIndex.has(k)) noScene(`C-nodes: exposed node ${k} is not in the scene`); }
  }
  const sceneEdges = new Set(scene.edges.map((e) => JSON.stringify([key(e.ref.src), e.ref.rel, key(e.ref.tgt), e.ref.ord])));
  const seenEdges = new Set<string>();
  for (const e of v.edges) {
    const k = JSON.stringify([key(e.ref.src), e.ref.rel, key(e.ref.tgt), e.ref.ord]);
    if (!sceneEdges.has(k)) noScene(`C-edges: visible edge ${k} is not in the scene`);
    if (seenEdges.has(k)) noScene(`C-edges: visible edge ${k} listed twice`);
    seenEdges.add(k);
    if (!visible.has(key(e.ref.src)) || !visible.has(key(e.ref.tgt))) noScene(`C-edges: visible edge ${k} has an endpoint that is not a visible node`);
  }
  const aggIds = new Set(v.aggregates.map((a) => a.id));
  for (const b of v.aggregate_edges) {
    for (const r of [b.src, b.tgt]) {
      if ("agg" in r) { if (!aggIds.has(r.agg)) noScene(`C-edges: bundle endpoint ${r.agg} is not an aggregate of the view`); }
      else if (!visible.has(key(r))) noScene(`C-edges: bundle endpoint ${key(r)} is not a visible node`);
    }
  }
}

/** Checks C-nodes, C-edges, C-elided (the inequality form) and C-ids of a given view against the scene. Throws LODError (INTERNAL/CONSERVATION). */
export async function checkViewConservation(sceneBytes: Uint8Array, view: View, options?: BudgetOptions): Promise<void> {
  const { p, maxWork } = await prepare(sceneBytes, view, options);
  const { scene, view: v } = p;
  const info = indexScene(scene);
  let Hids = 0;
  for (const a of v.aggregates) {
    let len = 32 + (a.hidden.length + (a.exposed?.length ?? 0) - 1) + 84;
    for (const r of [...a.hidden, ...(a.exposed ?? [])]) len += utf8Len(`{"id":${JSON.stringify(r.id)},"type":${JSON.stringify(r.type)}}`);
    Hids += len;
  }
  const W = workView({ n: info.n, m: info.m, V: p.V, Lkey: info.Lkey, Hidsp: Hids, Gp: v.aggregates.length }, true);
  if (W > BigInt(maxWork)) throw new LODError("RESOURCE_LIMIT", "WORK_LIMIT");
  tieViewToScene(v, scene, info.index);
  checkConservation(v, info.n, info.m);
  for (const a of v.aggregates) {
    let leaves: WireNodeRef[];
    try { leaves = sortRefs([...a.hidden, ...(a.exposed ?? [])]); }
    catch { throw new LODError("INTERNAL", "CONSERVATION", undefined, `C-ids: ${a.id} has a malformed member reference`); }
    const id = idFromHex(await sha256Hex(aggregatePreimage(p.sceneSha256, leaves)));
    if (id !== a.id) throw new LODError("INTERNAL", "CONSERVATION", undefined, `C-ids: ${a.id} != ${id}`);
  }
}
