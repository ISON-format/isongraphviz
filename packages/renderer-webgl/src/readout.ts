// src/readout.ts - the readout and the level-2 witness of a plan, from the plan alone (design 9.3, 7.8). Neither reads a probe() or a model.
import { IgrError } from "isongraph-visualize-renderer-core";
import { assembleReadout } from "isongraph-visualize-display-list";
import type { ElementAddress, Readout, ReadoutParts, WireEdge, WireNode } from "isongraph-visualize-display-list";
import type { WitnessReport } from "isongraph-visualize-display-list/canvas2d";
import { decodeArrows, decodeDiscs, decodeEdges, type GlPlan } from "./plan.js";

const bad = (detail: string): IgrError => new IgrError("INVALID_INPUT", "SCHEMA", "plan", detail);
const cpn = (n: WireNode): WireNode => ({ id: n.id, type: n.type });
const cpe = (e: WireEdge): WireEdge => ({ ord: e.ord, rel: e.rel, src: cpn(e.src), tgt: cpn(e.tgt) });

interface Accounted {
  /** Node pids drawn (a layer-7 instance or a cn entry), in ascending pid order, and the centre of each (undefined when omitted). */
  nodes: Map<number, { x: number; y: number } | undefined>;
  edges: Set<number>;
  selectedNodes: Set<number>; focusedNodes: Set<number>; selectedEdges: Set<number>; focusedEdges: Set<number>; arrows: Set<number>;
}

/** What the plan accounts for, by layer and by the omitted entries (7.8): a pid outside the table, or a node pid in an edge layer, is `INVALID_INPUT/SCHEMA`. */
function account(plan: GlPlan): Accounted {
  const nd = plan.header.nd, ed = plan.header.ed;
  const a: Accounted = { nodes: new Map(), edges: new Set(), selectedNodes: new Set(), focusedNodes: new Set(), selectedEdges: new Set(), focusedEdges: new Set(), arrows: new Set() };
  const nodePid = (pid: number): number => { if (pid < 1 || pid > nd || pid > plan.nodes.length) throw bad(`a node pid outside the table: ${pid}`); return pid; };
  const edgePid = (pid: number): number => { if (pid < nd + 1 || pid > nd + ed || pid - nd > plan.edges.length) throw bad(`an edge pid outside the table: ${pid}`); return pid; };
  let layerAt = 0;
  const edges = decodeEdges(plan.buffers.edge), discs = decodeDiscs(plan.buffers.disc), arrows = decodeArrows(plan.buffers.arrow);
  const byProgram = { edge: edges, disc: discs, arrow: arrows };
  for (const d of plan.header.draws) {
    layerAt = d.layer;
    for (let i = d.first; i < d.first + d.count; i++) {
      if (d.program === "edge") {
        const e = byProgram.edge[i];
        if (e === undefined) continue;
        const pid = edgePid(e.pid);
        if (layerAt === 1) a.selectedEdges.add(pid); else if (layerAt === 2) a.focusedEdges.add(pid); else a.edges.add(pid);
      } else if (d.program === "arrow") {
        const r = byProgram.arrow[i];
        if (r !== undefined) edgePid(r.pid);
      } else {
        const s = byProgram.disc[i];
        if (s === undefined) continue;
        const pid = nodePid(s.pid);
        if (layerAt === 5) a.selectedNodes.add(pid); else if (layerAt === 6) a.focusedNodes.add(pid); else a.nodes.set(pid, { x: s.x, y: s.y });
      }
    }
  }
  for (const [pid, flags] of plan.header.cn) {
    nodePid(pid);
    if (!a.nodes.has(pid)) a.nodes.set(pid, undefined);
    if (flags & 1) a.selectedNodes.add(pid);
    if (flags & 2) a.focusedNodes.add(pid);
  }
  for (const [pid, flags] of plan.header.ce) {
    edgePid(pid);
    a.edges.add(pid);
    if (flags & 1) a.selectedEdges.add(pid);
    if (flags & 2) a.focusedEdges.add(pid);
  }
  return a;
}

/**
 * readoutFromGl(plan) (9.3): elements from layer 7 (nodes) and layer 3 (edges) plus the omitted ones in `cn`, `ce`; marks from layers 5, 6 (nodes) and 1, 2
 * (edges) and from the flags of the omitted entries; node centres from the layer-7 instances (an omitted node has none and is far); `arrows` is every drawn
 * edge iff the header's `d` is 1; labels from the plan's `T` lines.
 */
export function readoutFromGl(plan: GlPlan): Readout {
  const nd = plan.header.nd;
  const a = account(plan);
  const nodePids = [...a.nodes.keys()].sort((x, y) => x - y), edgePids = [...a.edges].sort((x, y) => x - y);
  const nodeAt = (pid: number): WireNode => plan.nodes[pid - 1]!;
  const edgeAt = (pid: number): WireEdge => plan.edges[pid - nd - 1]!;
  const labelNodes: ReadoutParts["labelNodes"] = [], labelEdges: ReadoutParts["labelEdges"] = [];
  for (const t of plan.texts) {
    const pid = t[1];
    if (pid >= 1 && pid <= nd) labelNodes.push({ address: nodeAt(pid), text: t[5] });
    else if (pid > nd && pid - nd <= plan.edges.length) labelEdges.push({ address: edgeAt(pid), text: t[5] });
    else throw bad(`a text record for a pid outside the table: ${pid}`);
  }
  // focus is one element (27 4.1; G12 refuses a plan with two): a plan read without its rules that nevertheless names two reports none, never an arbitrary one
  let focus: ElementAddress | undefined;
  if (a.focusedEdges.size + a.focusedNodes.size === 1) {
    for (const pid of a.focusedEdges) focus = { edge: edgeAt(pid) };
    for (const pid of a.focusedNodes) focus = { node: nodeAt(pid) };
  }
  return assembleReadout({
    scene_sha256: plan.header.scene, layout_sha256: plan.header.layout, width: plan.header.w, height: plan.header.h,
    nodes: nodePids.map((pid) => { const c = a.nodes.get(pid); return { address: nodeAt(pid), x: c === undefined ? Infinity : c.x, y: c === undefined ? Infinity : c.y }; }),
    edges: edgePids.map(edgeAt),
    selectedNodes: [...a.selectedNodes].sort((x, y) => x - y).map(nodeAt), selectedEdges: [...a.selectedEdges].sort((x, y) => x - y).map(edgeAt),
    ...(focus === undefined ? {} : { focus }),
    arrows: plan.header.d === 1 ? edgePids.map(edgeAt) : [],
    labelNodes, labelEdges,
  });
}

/**
 * glWitness(plan) (7.8): `{backend: "igr-gl/1", elements, texts: []}` from the plan alone. A node is drawn iff its pid has an instance in layer 7 or is in `cn`,
 * an edge iff its pid has an instance in layer 3 or is in `ce`; addresses come from the plan's own table, in table order. `texts` is empty by design.
 */
export function glWitness(plan: GlPlan): WitnessReport {
  const nd = plan.header.nd;
  const a = account(plan);
  return {
    backend: "igr-gl/1",
    elements: {
      nodes: plan.nodes.filter((_, i) => a.nodes.has(i + 1)).map(cpn),
      edges: plan.edges.filter((_, i) => a.edges.has(nd + i + 1)).map(cpe),
    },
    texts: [],
  };
}
