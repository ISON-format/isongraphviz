// src/build.ts - buildDisplayList and dryLabelPass (design 4.4, 4.5). A pure function of the model, the state and three options.
import { IgrError, effectiveVisibility, isRenderModel, lookupElement, serializeState } from "isongraph-visualize-renderer-core";
import type { ModelEdge, ModelNode, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { DL_COORD_MAX, DL_FORMAT, ELABEL_DY, LABEL_DY } from "./constants.js";
import { arrowhead, degenerate, distance, isDegenerate, parallel, selfLoop, straight, type Pt, type Route } from "./geometry.js";
import { planLabels } from "./labels.js";
import { utf8Decode } from "./utf8.js";
import { mpxBig, screenMicro } from "./num.js";
import { resolveDlOptions, type DlOptions, type ResolvedDlOptions } from "./options.js";
import type { DisplayList, DlFidelity, DlRecord, WireEdge, WireNode } from "./types.js";

const E6 = 1_000_000n;
const MAX = BigInt(DL_COORD_MAX);

/** The validated inputs of 4.5 steps 1-4: a render model, resolved options, and a state snapshot that passed `serializeState`. */
interface Prepared { model: RenderModel; options: ResolvedDlOptions; state: SemanticState }

function prepare(model: RenderModel, state: SemanticState, options: unknown): Prepared {
  if (!isRenderModel(model)) throw new IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL", "model");
  const resolved = resolveDlOptions(options);
  const snapshot = JSON.parse(utf8Decode(serializeState(model, state))!) as SemanticState; // validates (INVALID_STATE passes through) and snapshots
  return { model, options: resolved, state: snapshot };
}

/** The label pass of 4.4(g) alone: no geometry, no coordinate check, no byte limit. Used by `probe()` (6.5). */
export function dryLabelPass(model: RenderModel, state: SemanticState, options?: DlOptions): DlFidelity {
  const p = prepare(model, state, options);
  const vis = effectiveVisibility(p.model, p.state);
  return planLabels(p.model, vis.nodes, vis.edges, p.options.labels, p.options.edgeLabels, p.options.maxDrawnLabelUnits).fidelity;
}

const KIND_LOOP = 1, KIND_DEGENERATE = 2, KIND_STRAIGHT = 3, KIND_PARALLEL = 4;

/** buildDisplayList(model, state, options) (4.4, 4.5). Every failure is an IgrError; no partial list is ever returned. */
export function buildDisplayList(model: RenderModel, state: SemanticState, options?: DlOptions): DisplayList {
  const { options: o, state: s } = prepare(model, state, options);
  const vp = s.viewport;
  const vis = effectiveVisibility(model, s);

  // ---- index structures (O(N + E)) ----------------------------------------------------------------------------------------
  const selNode = new Set<number>(), selEdge = new Set<number>();
  for (const r of s.selection.nodes) selNode.add((lookupElement(model, r) as ModelNode).index);
  for (const r of s.selection.edges) selEdge.add((lookupElement(model, r) as ModelEdge).index);
  let focusNode = -1, focusEdge = -1;
  if (s.focus !== undefined) {
    if ("node" in s.focus) focusNode = (lookupElement(model, s.focus.node) as ModelNode).index;
    else focusEdge = (lookupElement(model, s.focus.edge) as ModelEdge).index;
  }
  const catIndex = new Map<string, number>();
  model.categories.forEach((c, i) => catIndex.set(c, i));
  const pos: (Pt | undefined)[] = new Array<Pt | undefined>(model.nodes.length).fill(undefined);
  const pid: number[] = new Array<number>(model.nodes.length + model.edges.length).fill(0);
  let nd = 0, ed = 0;
  for (const n of model.nodes) if (vis.nodes[n.index]) { pos[n.index] = screenMicro(vp, n.x, n.y); pid[n.index] = ++nd; }
  for (const e of model.edges) if (vis.edges[e.index]) ed++;

  // ---- edge classes (30 6.2): loop ranks per node, degenerate edges, groups of parallel edges with ranks in scene order ---------------------
  const kind = new Uint8Array(model.edges.length);
  const rank = new Int32Array(model.edges.length);
  const groupSize = new Int32Array(model.edges.length);
  const loopCount = new Int32Array(model.nodes.length);
  const groups = new Map<string, number[]>();
  for (const e of model.edges) {
    if (!vis.edges[e.index]) continue;
    if (e.src === e.tgt) { kind[e.index] = KIND_LOOP; rank[e.index] = loopCount[e.src]!++; continue; }
    const A = pos[e.src]!, B = pos[e.tgt]!;
    if (isDegenerate(distance(A, B))) { kind[e.index] = KIND_DEGENERATE; continue; }
    const key = e.src < e.tgt ? `${e.src}:${e.tgt}` : `${e.tgt}:${e.src}`;
    const g = groups.get(key);
    if (g) g.push(e.index); else groups.set(key, [e.index]);
    kind[e.index] = KIND_STRAIGHT;
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.forEach((j, p) => { kind[j] = KIND_PARALLEL; rank[j] = p; groupSize[j] = list.length; });
  }

  const plan = planLabels(model, vis.nodes, vis.edges, o.labels, o.edgeLabels, o.maxDrawnLabelUnits);

  // ---- records -------------------------------------------------------------------------------------------------------------------
  let overflow = false;
  /** m(v) as a number; a value beyond DL_COORD_MAX is recorded and refused after the whole list is computed (3.5). */
  const m = (v: bigint): number => { const r = mpxBig(v); if (r > MAX || r < -MAX) overflow = true; return Number(r); };
  const mb = (v: bigint): bigint => { const r = mpxBig(v); if (r > MAX || r < -MAX) overflow = true; return r; };

  const nodes: WireNode[] = [], edges: WireEdge[] = [];
  for (const n of model.nodes) if (vis.nodes[n.index]) nodes.push({ id: n.ref.id, type: n.ref.type });
  const records: DlRecord[] = [];
  const edgeLabelAt: ({ x: number; y: number; edge: number } | undefined)[] = [];
  let edgePid = nd;
  for (const e of model.edges) {
    if (!vis.edges[e.index]) continue;
    edges.push({ ord: e.ref.ord, rel: e.ref.rel, src: { id: e.ref.src.id, type: e.ref.src.type }, tgt: { id: e.ref.tgt.id, type: e.ref.tgt.type } });
    pid[model.nodes.length + e.index] = ++edgePid;
    const A = pos[e.src]!, B = pos[e.tgt]!;
    const k = kind[e.index]!;
    const g: Route = k === KIND_LOOP ? selfLoop(A.x, A.y, rank[e.index]!)
      : k === KIND_DEGENERATE ? degenerate(A, B)
      : k === KIND_STRAIGHT ? straight(A, B)
      : parallel(A, B, pos[e.src < e.tgt ? e.src : e.tgt]!, pos[e.src < e.tgt ? e.tgt : e.src]!, rank[e.index]!, groupSize[e.index]!);
    const flags = (selEdge.has(e.index) ? 1 : 0) + (focusEdge === e.index ? 2 : 0);
    const big: bigint[] = [];
    for (const p of g.pts) { big.push(mb(p.x), mb(p.y)); }
    records.push(["E", edgePid, flags, g.form, ...big.map(Number)]);
    if (model.directed) {
      const n = big.length;
      const [px, py] = g.form === 0 ? [big[0]!, big[1]!] : [big[n - 4]!, big[n - 3]!]; // form 0: the first point; forms 1, 2: the control point before the end
      const a = arrowhead(big[n - 2]!, big[n - 1]!, px, py);
      for (const v of a) if (v > MAX || v < -MAX) overflow = true;
      records.push(["A", edgePid, ...a.map(Number)]);
    }
    const text = plan.edgeText[e.index];
    if (text !== undefined) edgeLabelAt[e.index] = { x: m(g.ax), y: m(g.ay - BigInt(ELABEL_DY) * E6), edge: edgePid };
  }
  for (const n of model.nodes) {
    if (!vis.nodes[n.index]) continue;
    const p = pos[n.index]!;
    const c = catIndex.get(n.category)!;
    const flags = (selNode.has(n.index) ? 1 : 0) + (focusNode === n.index ? 2 : 0);
    records.push(["N", pid[n.index]!, (c < 8 ? c : 8), flags, m(p.x), m(p.y)]);
  }
  for (const n of model.nodes) {
    const text = plan.nodeText[n.index];
    if (text === undefined) continue;
    const p = pos[n.index]!;
    records.push(["T", pid[n.index]!, 0, m(p.x), m(p.y + BigInt(LABEL_DY) * E6), text]);
  }
  for (const e of model.edges) {
    const at = edgeLabelAt[e.index];
    if (at !== undefined) records.push(["T", at.edge, 1, at.x, at.y, plan.edgeText[e.index]!]);
  }
  if (overflow) throw new IgrError("INVALID_INPUT", "OUT_OF_RANGE", "dl.coord", "a display-list coordinate exceeds 2^40 milli-pixels");
  return {
    format: DL_FORMAT, width: vp.width, height: vp.height, directed: model.directed,
    artifactSha256: model.artifactSha256, sceneSha256: model.sceneSha256, layoutSha256: model.layoutSha256, nodes, edges, records,
  };
}
