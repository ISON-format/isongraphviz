// src/derive.ts — deriveView: (verified scene, bound layout, LODState) -> View (design 29 sections 4, 5, 7, 8 and 11).
import { bindLayout } from "isongraph-visualize-layout-core";
import { canonicalBytesSigned, compareUtf8, sha256Hex, snapshotBytes, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { aggregatePreimage, idFromHex } from "./aggregate.js";
import { checkConservation } from "./conservation.js";
import { LODError } from "./errors.js";
import { paintGroups } from "./laminar.js";
import { MAX_EDGES, MAX_INPUT_BYTES, MAX_NODES, MAX_STATE_BYTES, resolveBudget, type BudgetOptions } from "./limits.js";
import { indexScene, keyOfRef } from "./sceneinfo.js";
import { verifyStateBytes } from "./state.js";
import type { Aggregate, AggregateEdge, Elided, LODState, LabelLevel, RelCount, View, ViewEdge, ViewNode, ViewRef, ViewResult, WireNodeRef } from "./types.js";
import { Meter, assertWithinTerms, ceilDiv, classTerms, shaBlocks, utf8Len, workDeriveView, type WorkClass, type WorkInputs } from "./work.js";

/** Test seams (never used by the public API): pass observers and fault injection for the INTERNAL paths. */
export interface DeriveHooks {
  pass?: (name: string) => void;
  sha256?: (bytes: Uint8Array) => Promise<string>;
  mutateView?: (view: View) => void;
  bumpTicks?: (m: Meter) => void;
}

export interface DeriveDetail {
  result: ViewResult;
  ticks: Record<WorkClass, number>;
  terms: Record<WorkClass, bigint>;
  W: bigint;
  inputs: WorkInputs;
}

const LEVELS: readonly LabelLevel[] = ["hidden", "short", "full"];

/** Section 8: level = max(tz, min(td, tz + 1)) over integers; no glyph, string length, font or pixel is consulted. */
export function labelLevel(d: number, zoom: number, p: { full_degree: number; full_zoom_milli: number; short_degree: number; short_zoom_milli: number }): LabelLevel {
  const tz = zoom >= p.full_zoom_milli ? 2 : zoom >= p.short_zoom_milli ? 1 : 0;
  const td = d >= p.full_degree ? 2 : d >= p.short_degree ? 1 : 0;
  return LEVELS[Math.max(tz, Math.min(td, tz + 1))]!;
}

/** floor((2*sum + k) / (2k)) in exact integer arithmetic, floor toward minus infinity. */
function anchorCoord(sum: bigint, k: number): number {
  const a = 2n * sum + BigInt(k), b = 2n * BigInt(k);
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return Number(q);
}

export function serializeView(view: View): Uint8Array {
  try { return canonicalBytesSigned(view as unknown as CJValue); }
  catch (e) {
    const reason = e instanceof Error && "reason" in e ? String((e as { reason: unknown }).reason) : "INVALID_VALUE";
    throw new LODError("INVALID_LOD", reason, undefined, "view outside the IGL-CJ/1 domain");
  }
}

interface Bundle { a: number; b: number; count: number; rels: Map<number, number> }

export async function deriveViewDetailed(sceneBytes: Uint8Array, layoutBytes: Uint8Array, stateBytes: Uint8Array, options?: BudgetOptions, hooks?: DeriveHooks): Promise<DeriveDetail> {
  // step 1: snapshot inputs (synchronous), validate the budget
  const sBytes = snapshotBytes(sceneBytes);
  const lBytes = snapshotBytes(layoutBytes);
  const stBytes = snapshotBytes(stateBytes);
  const budget = resolveBudget(options);
  // step 2: sizes only, before any parse
  if (sBytes.length + lBytes.length + stBytes.length > MAX_INPUT_BYTES) throw new LODError("RESOURCE_LIMIT", "INPUT_BYTES");
  if (stBytes.length > MAX_STATE_BYTES) throw new LODError("RESOURCE_LIMIT", "STATE_BYTES");
  const meter = new Meter();
  const sha = hooks?.sha256 ?? sha256Hex;

  // step 3: the state (stages 1-6), then its hash
  const state: LODState = verifyStateBytes(stBytes);
  const Hs = stBytes.length;
  meter.add("stateBytes", 3 * ceilDiv(Hs, 64)); // parse, canonical re-serialization, comparison
  const stateSha256 = await sha(stBytes);
  meter.add("stateHash", shaBlocks(Hs));

  // step 4: scene and layout, bound to each other by V2's rules (unbudgeted)
  const bound = await bindLayout(sBytes, lBytes);
  const { scene, layout } = bound;
  const n = scene.nodes.length, m = scene.edges.length;

  // step 5: limits, state binding, member and pin resolution
  if (n > Math.min(budget.maxNodes, MAX_NODES)) throw new LODError("RESOURCE_LIMIT", "NODE_LIMIT");
  if (m > Math.min(budget.maxEdges, MAX_EDGES)) throw new LODError("RESOURCE_LIMIT", "EDGE_LIMIT");
  if (state.scene_sha256 !== bound.sceneSha256) throw new LODError("STATE_MISMATCH", "SCENE");
  if (state.layout_sha256 !== bound.layoutSha256) throw new LODError("STATE_MISMATCH", "LAYOUT");

  const info = indexScene(scene, meter);
  const G = state.collapsed.length;
  const groupIdx: number[][] = [];
  let M = 0;
  for (let g = 0; g < G; g++) {
    const ms = state.collapsed[g]!.members;
    const out = new Array<number>(ms.length);
    for (let i = 0; i < ms.length; i++) {
      const k = keyOfRef(ms[i]!);
      const at = info.index.get(k);
      meter.add("members", 1);
      meter.add("keys", ceilDiv(utf8Len(k), 64));
      if (at === undefined) throw new LODError("UNRESOLVED_NODE", "MEMBER", `$.collapsed[${g}].members[${i}]`);
      out[i] = at;
    }
    M += ms.length;
    groupIdx.push(out);
  }
  const T = state.pinned.length;
  const pinnedFlag = new Uint8Array(n);
  for (let i = 0; i < T; i++) {
    const k = keyOfRef(state.pinned[i]!);
    const at = info.index.get(k);
    meter.add("pins", 1); // the key length of a pin lookup is NOT charged: the formula has no such term (design finding DD-2)
    if (at === undefined) throw new LODError("UNRESOLVED_NODE", "PINNED", `$.pinned[${i}]`);
    pinnedFlag[at] = 1;
  }

  // step 6: W in BigInt; the aggregate-id preimage sizes are computable now (no hashing)
  const refJsonLen = new Map<number, number>();
  let Hids = 0;
  for (let g = 0; g < G; g++) {
    const ix = groupIdx[g]!;
    let len = 32 + (ix.length - 1) + 84; // `{"agg":"IGLOD-AGG/1","members":[` + separators + `],"scene_sha256":"<64>"}`
    for (const v of ix) {
      let l = refJsonLen.get(v);
      if (l === undefined) {
        const r = scene.nodes[v]!.ref;
        l = utf8Len(`{"id":${JSON.stringify(r.id)},"type":${JSON.stringify(r.type)}}`);
        refJsonLen.set(v, l);
      }
      len += l;
      meter.add("members", 1);
    }
    Hids += len;
  }
  const inputs: WorkInputs = { Hs, n, m, M, T, G, R: info.rels.length, Lrel: info.Lrel, Lkey: info.Lkey, Hids, Hscene: sBytes.length, Hlayout: lBytes.length };
  const W = workDeriveView(inputs);
  if (W > BigInt(budget.maxWork)) throw new LODError("RESOURCE_LIMIT", "WORK_LIMIT");

  // step 7: the LOD passes
  hooks?.pass?.("ids");
  const painting = paintGroups(groupIdx, n, (k) => meter.add("members", k));
  const ids = new Array<string>(G);
  const seenIds = new Set<string>();
  for (let g = 0; g < G; g++) {
    const members: WireNodeRef[] = state.collapsed[g]!.members;
    const pre = aggregatePreimage(state.scene_sha256, members);
    meter.add("members", members.length);
    meter.add("idHash", ceilDiv(pre.length, 64)); // ceil(L/64), NOT the SHA-256 block count: see design finding DD-1 (the printed bound ceil((L+9)/64) <= L/64 + 1 is false for some L)
    const id = idFromHex(await sha(pre));
    if (seenIds.has(id)) throw new LODError("INTERNAL", "ID_COLLISION", undefined, id);
    seenIds.add(id);
    ids[g] = id;
  }

  hooks?.pass?.("reps");
  const hiddenCount = new Int32Array(G);
  for (let g = 0; g < G; g++) {
    if (painting.parent[g]! >= 0) continue;
    let h = 0;
    for (const v of groupIdx[g]!) if (!pinnedFlag[v]) h++;
    hiddenCount[g] = h;
  }
  // emitted aggregates: top groups that hide at least one node, ranked by id ascending (rank n + j)
  const emitted: number[] = [];
  for (let g = 0; g < G; g++) if (painting.parent[g]! < 0 && hiddenCount[g]! > 0) emitted.push(g);
  emitted.sort((x, y) => { meter.add("aggSort"); return ids[x]! < ids[y]! ? -1 : ids[x]! > ids[y]! ? 1 : 0; });
  const A = emitted.length;
  const objCount = n + A;
  const aggObj = new Int32Array(G).fill(-1);
  emitted.forEach((g, j) => { aggObj[g] = n + j; });
  const rep = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    meter.add("nodes");
    const o = painting.owner[v]!;
    if (pinnedFlag[v] || o < 0) { rep[v] = v; continue; }
    const t = aggObj[painting.root[o]!]!;
    rep[v] = t < 0 ? v : t;
  }

  hooks?.pass?.("edges");
  // relation order: distinct relation strings sorted by UTF-8 bytes (once); every rel_counts list is then ordered by integer rank
  const R = info.rels.length;
  const relLen = info.rels.map(utf8Len);
  const relOrder = Array.from({ length: R }, (_, i) => i).sort((a, b) => { meter.add("relSort", 1 + ceilDiv(relLen[a]!, 64) + ceilDiv(relLen[b]!, 64)); return compareUtf8(info.rels[a]!, info.rels[b]!); });
  const relRank = new Int32Array(R);
  relOrder.forEach((r, i) => { relRank[r] = i; });
  const cmpRel = (a: number, b: number): number => { meter.add("itemSort"); return relRank[a]! - relRank[b]!; };
  const relList = (mp: Map<number, number>): RelCount[] => [...mp.entries()].sort((x, y) => cmpRel(x[0], y[0])).map(([r, c]) => ({ count: c, rel: info.rels[r]! }));

  const visibleEdges: number[] = [];
  const bundles = new Map<number, Bundle>();
  const internalCount = new Int32Array(A);
  const internalRels: Array<Map<number, number>> = Array.from({ length: A }, () => new Map());
  const stride = objCount === 0 ? 1 : objCount;
  for (let e = 0; e < m; e++) {
    meter.add("edges");
    const u = info.src[e]!, v = info.tgt[e]!;
    const ru = rep[u]!, rv = rep[v]!;
    const rel = info.relOf[e]!;
    if (ru === u && rv === v) { visibleEdges.push(e); continue; }
    if (ru === rv) {
      const j = ru - n;
      internalCount[j]!++;
      internalRels[j]!.set(rel, (internalRels[j]!.get(rel) ?? 0) + 1);
      continue;
    }
    let a = ru, b = rv;
    if (!info.directed && a > b) { a = rv; b = ru; }
    const key = a * stride + b;
    let bd = bundles.get(key);
    if (bd === undefined) { bd = { a, b, count: 0, rels: new Map() }; bundles.set(key, bd); }
    bd.count++;
    bd.rels.set(rel, (bd.rels.get(rel) ?? 0) + 1);
  }
  const bundleList = [...bundles.values()].sort((x, y) => { meter.add("itemSort"); return x.a - y.a || x.b - y.b; });

  // items: visible scene edges (kind 0) and bundles (kind 1); vdeg is computed before any cap
  const nVis = visibleEdges.length, nItems = nVis + bundleList.length;
  const iKind = new Uint8Array(nItems), iA = new Int32Array(nItems), iB = new Int32Array(nItems), iS = new Int32Array(nItems), iT = new Int32Array(nItems);
  for (let i = 0; i < nVis; i++) { const e = visibleEdges[i]!; iKind[i] = 0; iA[i] = e; iB[i] = 0; iS[i] = info.src[e]!; iT[i] = info.tgt[e]!; meter.add("edges"); }
  for (let j = 0; j < bundleList.length; j++) { const i = nVis + j, b = bundleList[j]!; iKind[i] = 1; iA[i] = b.a; iB[i] = b.b; iS[i] = b.a; iT[i] = b.b; }
  const vdeg = new Int32Array(objCount);
  for (let i = 0; i < nItems; i++) { vdeg[iS[i]!]!++; if (iT[i] !== iS[i]) vdeg[iT[i]!]!++; if (i < nVis) meter.add("edges"); }

  hooks?.pass?.("cap");
  const keep = new Uint8Array(nItems).fill(1);
  const policy = state.edge_policy;
  const elidedEdges = new Int32Array(objCount);
  let elided: Elided | undefined;
  let removedSelfLoops = 0;
  if (policy !== undefined && nItems > policy.max_view_edges) {
    const order = Array.from({ length: nItems }, (_, i) => i).sort((x, y) => {
      meter.add("itemSort");
      return (vdeg[iS[x]!]! + vdeg[iT[x]!]!) - (vdeg[iS[y]!]! + vdeg[iT[y]!]!) || iKind[x]! - iKind[y]! || iA[x]! - iA[y]! || iB[x]! - iB[y]!;
    });
    keep.fill(0);
    if (policy.keep_forest) {
      const parent = new Int32Array(objCount);
      for (let o = 0; o < objCount; o++) parent[o] = o;
      const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
      let forest = 0;
      const isForest = new Uint8Array(nItems);
      for (const i of order) {
        const a = find(iS[i]!), b = find(iT[i]!);
        if (a !== b) { parent[a] = b; isForest[i] = 1; keep[i] = 1; forest++; }
      }
      let room = Math.max(0, policy.max_view_edges - forest);
      for (const i of order) if (!isForest[i] && room > 0) { keep[i] = 1; room--; }
    } else {
      for (let k = 0; k < policy.max_view_edges; k++) keep[order[k]!] = 1;
    }
    let items = 0, sceneEdges = 0;
    const relAcc = new Map<number, number>();
    for (let i = 0; i < nItems; i++) {
      if (keep[i]) continue;
      meter.add("edges");
      items++;
      if (iKind[i] === 0) { sceneEdges++; const r = info.relOf[iA[i]!]!; relAcc.set(r, (relAcc.get(r) ?? 0) + 1); }
      else {
        const b = bundleList[i - nVis]!;
        sceneEdges += b.count;
        for (const [r, c] of b.rels) relAcc.set(r, (relAcc.get(r) ?? 0) + c);
      }
      elidedEdges[iS[i]!]!++;
      if (iT[i] !== iS[i]) elidedEdges[iT[i]!]!++; else removedSelfLoops++;
    }
    if (items > 0) elided = { items, rel_counts: relList(relAcc), scene_edges: sceneEdges };
  }

  hooks?.pass?.("labels");
  const lp = state.label_policy;
  const zoom = state.zoom_milli;
  const px = new Array<number>(n), py = new Array<number>(n);
  const lay = layout.nodes;
  for (let v = 0; v < n; v++) { px[v] = lay[v]!.x; py[v] = lay[v]!.y; }
  const nodes: ViewNode[] = [];
  for (let v = 0; v < n; v++) {
    meter.add("nodes");
    if (rep[v] !== v) continue;
    const r = scene.nodes[v]!.ref;
    const node: ViewNode = { ref: { id: r.id, type: r.type }, x: px[v]!, y: py[v]!, label_level: pinnedFlag[v] ? "full" : labelLevel(vdeg[v]!, zoom, lp) };
    if (elidedEdges[v]! > 0) node.elided_edges = elidedEdges[v]!;
    nodes.push(node);
  }
  const children: string[][] = Array.from({ length: G }, () => []);
  for (let g = 0; g < G; g++) if (painting.parent[g]! >= 0) children[painting.parent[g]!]!.push(ids[g]!);
  const refOfObj = (o: number): ViewRef => (o < n ? { id: scene.nodes[o]!.ref.id, type: scene.nodes[o]!.ref.type } : { agg: ids[emitted[o - n]!]! });
  const aggregates: Aggregate[] = emitted.map((g, j) => {
    const hidden: WireNodeRef[] = [], exposed: WireNodeRef[] = [];
    let sx = 0n, sy = 0n;
    for (const v of groupIdx[g]!) {
      meter.add("members");
      const r = scene.nodes[v]!.ref;
      if (pinnedFlag[v]) exposed.push({ id: r.id, type: r.type });
      else { hidden.push({ id: r.id, type: r.type }); sx += BigInt(px[v]!); sy += BigInt(py[v]!); }
    }
    const o = n + j;
    const kids = children[g]!.sort((x, y) => { meter.add("aggSort"); return x < y ? -1 : x > y ? 1 : 0; });
    const a: Aggregate = {
      id: ids[g]!, hidden, member_count: groupIdx[g]!.length, anchor: { x: anchorCoord(sx, hidden.length), y: anchorCoord(sy, hidden.length) },
      internal_edges: { count: internalCount[j]!, rel_counts: relList(internalRels[j]!) },
      label_level: labelLevel(Math.max(vdeg[o]!, groupIdx[g]!.length), zoom, lp),
    };
    if (exposed.length > 0) a.exposed = exposed;
    if (kids.length > 0) a.children = kids;
    const label = state.collapsed[g]!.label;
    if (label !== undefined) a.label = label;
    if (elidedEdges[o]! > 0) a.elided_edges = elidedEdges[o]!;
    return a;
  });
  const edges: ViewEdge[] = [];
  for (let i = 0; i < nVis; i++) {
    if (!keep[i]) continue;
    meter.add("edges");
    const r = scene.edges[iA[i]!]!.ref;
    edges.push({ ref: { ord: r.ord, rel: r.rel, src: { id: r.src.id, type: r.src.type }, tgt: { id: r.tgt.id, type: r.tgt.type } } });
  }
  const aggregate_edges: AggregateEdge[] = [];
  for (let j = 0; j < bundleList.length; j++) {
    if (!keep[nVis + j]) continue;
    const b = bundleList[j]!;
    aggregate_edges.push({ src: refOfObj(b.a), tgt: refOfObj(b.b), count: b.count, rel_counts: relList(b.rels) });
  }
  const view: View = {
    address_scheme: "igs-addr/1", igview: "IGLOD-VIEW/1", scale: 1000, scene_sha256: bound.sceneSha256, layout_sha256: bound.layoutSha256, state_sha256: stateSha256,
    directed: info.directed, nodes, aggregates, edges, aggregate_edges,
  };
  if (elided !== undefined) view.elided = elided;

  hooks?.pass?.("serialize");
  hooks?.mutateView?.(view);
  hooks?.pass?.("conservation");
  checkConservation(view, n, m, removedSelfLoops);
  const viewBytes = serializeView(view);
  meter.add("serialize", ceilDiv(viewBytes.length, 8));
  hooks?.pass?.("hash");
  const viewSha256 = await sha(viewBytes);
  meter.add("viewHash", shaBlocks(viewBytes.length));

  hooks?.bumpTicks?.(meter);
  const terms = classTerms(inputs);
  assertWithinTerms(meter, terms);
  return { result: { view, viewBytes, viewSha256, stateSha256 }, ticks: { ...meter.ticks }, terms, W, inputs };
}

export async function deriveView(sceneBytes: Uint8Array, layoutBytes: Uint8Array, stateBytes: Uint8Array, options?: BudgetOptions): Promise<ViewResult> {
  return (await deriveViewDetailed(sceneBytes, layoutBytes, stateBytes, options)).result;
}
