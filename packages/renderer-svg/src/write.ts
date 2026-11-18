// src/write.ts - renderSvg, renderSvgDetailed, writeSvg (design sections 2, 5, 6, 7, 8, 14.2). Streams the document line by line.
import {
  IgrError, effectiveVisibility, graphSummary, isRenderModel, lookupElement, serializeState, statusText, summaryText,
} from "isongraph-visualize-renderer-core";
import type { ModelEdge, ModelNode, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { ELABEL_DY, LABEL_DY, NODE_R, RING_FOC, RING_SEL, SVG_FORMAT, THEME_LINES, XML_DECLARATION } from "./constants.js";
import { degenerate, distance, isDegenerate, parallel, selfLoop, straight, type EdgeGeom, type Pt } from "./geometry.js";
import { elementDomId, utf8Decode, utf8Length } from "./ids.js";
import { fmt, screenMicro } from "./num.js";
import { resolveOptions, type SvgOptions } from "./options.js";
import { ATTR, TEXT, dl, flatLabel } from "./text.js";

export interface SvgFidelity { labels: "full" | "elided" | "none"; edge_labels: boolean }
export interface SvgRenderResult { svg: string; fidelity: SvgFidelity; label_units: number; bytes: number }

const E6 = 1_000_000n;
const CATS = ["igr-k0", "igr-k1", "igr-k2", "igr-k3", "igr-k4", "igr-k5", "igr-k6", "igr-k7"] as const;

/** The label pass of 7.5 (b)-(d): which `<text>` elements exist, the unit total and the fidelity. Also used by `probe()` (12.3) without the byte limit. */
export interface LabelPlan { nodeText: (string | undefined)[]; edgeText: (string | undefined)[]; fidelity: SvgFidelity; units: number }

export function planLabels(model: RenderModel, nodeVisible: readonly boolean[], edgeVisible: readonly boolean[], labels: boolean, edgeLabels: boolean, maxUnits: number): LabelPlan {
  const nodeText: (string | undefined)[] = new Array<string | undefined>(model.nodes.length).fill(undefined);
  const edgeText: (string | undefined)[] = new Array<string | undefined>(model.edges.length).fill(undefined);
  if (!labels) return { nodeText, edgeText, fidelity: { labels: "none", edge_labels: false }, units: 0 };
  let units = 0, elided = false, stopped = false;
  const consider = (label: string): string | undefined => {
    const text = dl(label);
    if (text === "") return undefined; // an empty drawn label is neither counted nor does it stop the walk
    if (stopped || units + text.length > maxUnits) { stopped = true; elided = true; return undefined; }
    units += text.length;
    if (text !== flatLabel(label)) elided = true;
    return text;
  };
  for (const n of model.nodes) if (nodeVisible[n.index]) nodeText[n.index] = consider(n.label);
  if (edgeLabels) for (const e of model.edges) if (edgeVisible[e.index]) edgeText[e.index] = consider(e.label);
  return { nodeText, edgeText, fidelity: { labels: elided ? "elided" : "full", edge_labels: edgeLabels }, units };
}

const limitError = (): IgrError => new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", "svg", "the document would exceed maxSvgBytes");

/** The streaming writer (14.2). Every `sink` call delivers one physical line including its LF; the line that would exceed `maxSvgBytes` is not delivered. */
export function writeSvg(model: RenderModel, state: SemanticState, options: SvgOptions | undefined, sink: (line: string) => void): Omit<SvgRenderResult, "svg"> {
  if (typeof sink !== "function") throw new IgrError("INVALID_INPUT", "SCHEMA", "sink", "function expected");
  if (!isRenderModel(model)) throw new IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL");
  const o = resolveOptions(options);
  const snapText = utf8Decode(serializeState(model, state)); // validates (INVALID_STATE passes through) and snapshots in one step
  const s = JSON.parse(snapText!) as SemanticState;
  const vp = s.viewport;
  const vis = effectiveVisibility(model, s);

  // ---- index structures (O(N + E)) ------------------------------------------------------------------------------------
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
  for (const n of model.nodes) if (vis.nodes[n.index]) { const m = screenMicro(vp, n.x, n.y); pos[n.index] = { x: m.x, y: m.y }; }

  // tab stop (8.3): the focused element, else the first visible node, else the first visible edge
  let tabNode = -1, tabEdge = -1;
  if (focusNode >= 0) tabNode = focusNode;
  else if (focusEdge >= 0) tabEdge = focusEdge;
  else {
    for (const n of model.nodes) if (vis.nodes[n.index]) { tabNode = n.index; break; }
    if (tabNode < 0) for (const e of model.edges) if (vis.edges[e.index]) { tabEdge = e.index; break; }
  }

  // edge classes (6.2): loop ranks per node, degenerate edges, groups of parallel edges with ranks in scene order
  const KIND_LOOP = 1, KIND_DEGENERATE = 2, KIND_STRAIGHT = 3, KIND_PARALLEL = 4;
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

  // ---- emission --------------------------------------------------------------------------------------------------------
  let total = 0;
  const emit = (line: string): void => {
    const len = utf8Length(line) + 1;
    if (total + len > o.maxSvgBytes) throw limitError();
    total += len;
    sink(line + "\n");
  };

  const P = o.idPrefix;
  if (o.xmlDeclaration) emit(XML_DECLARATION);
  emit(`<svg xmlns="http://www.w3.org/2000/svg" class="igr-svg" width="${vp.width}" height="${vp.height}" viewBox="0 0 ${vp.width} ${vp.height}" role="graphics-document" aria-roledescription="graph" aria-labelledby="${P}-title" aria-describedby="${P}-desc" data-igr-svg="${SVG_FORMAT}" data-igr-artifact="${model.artifactSha256}" data-igr-scene="${model.sceneSha256}" data-igr-layout="${model.layoutSha256}">`);
  emit(`<title id="${P}-title">${TEXT(summaryText(graphSummary(model)))}</title>`);
  emit(`<desc id="${P}-desc">${TEXT(statusText(model, s))}</desc>`);
  if (o.style) {
    emit("<style>");
    for (const line of THEME_LINES) emit(line);
    emit("</style>");
  }
  if (model.directed) emit(`<defs><marker id="${P}-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path class="igr-arrow" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>`);

  const emitNodes = (): void => {
    emit('<g class="igr-nodes">');
    for (const n of model.nodes) {
      if (!vis.nodes[n.index]) continue;
      const c = catIndex.get(n.category)!;
      const sel = selNode.has(n.index), foc = focusNode === n.index;
      const X = fmt(pos[n.index]!.x), Y = fmt(pos[n.index]!.y);
      const name = `${n.category} ${n.label}`;
      emit(`<g id="${elementDomId(P, { node: n.ref })}" class="igr-node ${c < 8 ? CATS[c]! : "igr-kx"}${sel ? " igr-selected" : ""}${foc ? " igr-focused" : ""}" role="graphics-symbol" aria-roledescription="node" aria-label="${ATTR(name)}" tabindex="${tabNode === n.index ? "0" : "-1"}">`);
      emit(`<title>${TEXT(name)}</title>`);
      if (sel) emit(`<circle class="igr-ring-sel" cx="${X}" cy="${Y}" r="${RING_SEL}"/>`);
      if (foc) emit(`<circle class="igr-ring-foc" cx="${X}" cy="${Y}" r="${RING_FOC}"/>`);
      emit(`<circle class="igr-shape" cx="${X}" cy="${Y}" r="${NODE_R}"/>`);
      const text = plan.nodeText[n.index];
      if (text !== undefined) emit(`<text class="igr-label" x="${X}" y="${fmt(pos[n.index]!.y + BigInt(LABEL_DY) * E6)}" text-anchor="middle">${TEXT(text)}</text>`);
      emit("</g>");
    }
    emit("</g>");
  };


  const emitEdges = (): void => {
    emit('<g class="igr-edges">');
    for (const e of model.edges) {
      if (!vis.edges[e.index]) continue;
      const sel = selEdge.has(e.index), foc = focusEdge === e.index;
      const A = pos[e.src]!, B = pos[e.tgt]!;
      const k = kind[e.index]!;
      const g: EdgeGeom = k === KIND_LOOP ? selfLoop(A.x, A.y, rank[e.index]!)
        : k === KIND_DEGENERATE ? degenerate(A, B)
        : k === KIND_STRAIGHT ? straight(A, B)
        : parallel(A, B, pos[Math.min(e.src, e.tgt)]!, pos[Math.max(e.src, e.tgt)]!, rank[e.index]!, groupSize[e.index]!);
      emit(`<g id="${elementDomId(P, { edge: e.ref })}" class="igr-edge${sel ? " igr-selected" : ""}${foc ? " igr-focused" : ""}" role="graphics-symbol" aria-roledescription="edge" aria-label="${ATTR(e.label)}" tabindex="${tabEdge === e.index ? "0" : "-1"}">`);
      emit(`<title>${TEXT(e.label)}</title>`);
      emit(`<desc>${TEXT(`${model.nodes[e.src]!.label} ${e.ref.rel} ${model.nodes[e.tgt]!.label}`)}</desc>`);
      if (sel) emit(`<path class="igr-halo-sel" d="${g.d}"/>`);
      if (foc) emit(`<path class="igr-halo-foc" d="${g.d}"/>`);
      emit(`<path class="igr-line" d="${g.d}"${model.directed ? ` marker-end="url(#${P}-arrow)"` : ""}/>`);
      emit(`<path class="igr-pick" d="${g.d}"/>`);
      const text = plan.edgeText[e.index];
      if (text !== undefined) emit(`<text class="igr-elabel" x="${fmt(g.ax)}" y="${fmt(g.ay - BigInt(ELABEL_DY) * E6)}" text-anchor="middle">${TEXT(text)}</text>`);
      emit("</g>");
    }
    emit("</g>");
  };
  emitNodes();
  emitEdges();
  emit("</svg>");
  return { fidelity: plan.fidelity, label_units: plan.units, bytes: total };
}

/** The longest string the engine can hold (V8: 2^29 - 24 UTF-16 units); a document past it cannot be joined, so it is refused like any other over-limit document. */
export const MAX_JOIN_UNITS = 2 ** 29 - 24;

/** Collects the lines and joins them once (about twice the document in memory, 14.2); only IgrError escapes, even for a raised maxSvgBytes. */
export function collectSvg(model: RenderModel, state: SemanticState, options: SvgOptions | undefined, maxUnits: number = MAX_JOIN_UNITS): SvgRenderResult {
  const lines: string[] = [];
  let units = 0;
  const r = writeSvg(model, state, options, (line) => {
    units += line.length;
    if (units > maxUnits) throw limitError();
    lines.push(line);
  });
  let svg: string;
  try { svg = lines.join(""); } catch { throw limitError(); }
  return { svg, fidelity: r.fidelity, label_units: r.label_units, bytes: r.bytes };
}

/** The document and its fidelity. */
export function renderSvgDetailed(model: RenderModel, state: SemanticState, options?: SvgOptions): SvgRenderResult {
  return collectSvg(model, state, options);
}

export function renderSvg(model: RenderModel, state: SemanticState, options?: SvgOptions): string {
  return renderSvgDetailed(model, state, options).svg;
}


