// src/canvas2d/witness.ts - the level-2 witness (design 6.6) and the stream readout (9.3). Both read a recorded stream, never a probe() or a model.
import { IgrError } from "isongraph-visualize-renderer-core";
import { assembleReadout, type Readout, type ReadoutParts } from "../readout.js";
import type { DisplayList, ElementAddress, WireEdge, WireNode } from "../types.js";
import { painted, readStream, type StreamSection } from "./stream.js";
import type { WitnessReport } from "./types.js";

const cpn = (n: WireNode): WireNode => ({ id: n.id, type: n.type });
const cpe = (e: WireEdge): WireEdge => ({ ord: e.ord, rel: e.rel, src: cpn(e.src), tgt: cpn(e.tgt) });

/**
 * canvasStreamWitness(stream, list): the kit's WitnessReport `{backend: "igr-cv/1", elements, texts: []}`. A node is drawn iff its marker section in layer 7
 * holds a fill and a stroke, an edge iff its section in layer 3 holds a stroke; the elements are wire addresses in table order. `texts` is empty by design.
 * It checks the presence of a painting call only; no geometry is witnessed.
 */
export function canvasStreamWitness(stream: Uint8Array, list: DisplayList): WitnessReport {
  const sections = readStream(stream, list);
  const nd = list.nodes.length;
  const nodes = new Set<number>(), edges = new Set<number>();
  for (const s of sections) {
    if (!painted(s)) continue;
    if (s.layer === 7) nodes.add(s.pid);
    else if (s.layer === 3) edges.add(s.pid);
  }
  return {
    backend: "igr-cv/1",
    elements: {
      nodes: list.nodes.filter((_, i) => nodes.has(i + 1)).map(cpn),
      edges: list.edges.filter((_, i) => edges.has(nd + i + 1)).map(cpe),
    },
    texts: [],
  };
}

const arcCentre = (s: StreamSection): { x: number; y: number } => {
  const c = s.calls.find((k) => k.method === "arc");
  const x = c?.args[0], y = c?.args[1];
  if (typeof x !== "number" || typeof y !== "number") throw new IgrError("INVALID_INPUT", "SCHEMA", `line ${s.line}`, "a painted disc has an arc call with a centre");
  return { x, y };
};

/**
 * readoutFromCanvasStream(stream, list) (9.3): elements by painted markers (layer 7 nodes, layer 3 edges); `selected` from layers 1 and 5, `focused` from 2
 * and 6; node centres from the arc arguments of layer 7; arrows from layer 4; label text from the fillText of layer 8 (the role of a text is `pid <= ND`).
 * A marker whose section holds no painting call contributes nothing.
 */
export function readoutFromCanvasStream(stream: Uint8Array, list: DisplayList): Readout {
  const sections = readStream(stream, list);
  const nd = list.nodes.length;
  const nodes: ReadoutParts["nodes"] = [], edges: WireEdge[] = [], selectedNodes: WireNode[] = [], selectedEdges: WireEdge[] = [], arrows: WireEdge[] = [];
  const labelNodes: ReadoutParts["labelNodes"] = [], labelEdges: ReadoutParts["labelEdges"] = [];
  let focus: ElementAddress | undefined;
  const nodeAt = (pid: number): WireNode => list.nodes[pid - 1]!;
  const edgeAt = (pid: number): WireEdge => list.edges[pid - nd - 1]!;
  for (const s of sections) {
    if (s.layer === 8) {
      const t = s.calls.find((k) => k.method === "fillText");
      if (t === undefined || typeof t.args[0] !== "string") continue;
      if (s.pid <= nd) labelNodes.push({ address: nodeAt(s.pid), text: t.args[0] });
      else labelEdges.push({ address: edgeAt(s.pid), text: t.args[0] });
      continue;
    }
    if (!painted(s)) continue;
    switch (s.layer) {
      case 1: selectedEdges.push(edgeAt(s.pid)); break;
      case 2: focus = { edge: edgeAt(s.pid) }; break;
      case 3: edges.push(edgeAt(s.pid)); break;
      case 4: arrows.push(edgeAt(s.pid)); break;
      case 5: selectedNodes.push(nodeAt(s.pid)); break;
      case 6: focus = { node: nodeAt(s.pid) }; break;
      case 7: nodes.push({ address: nodeAt(s.pid), ...arcCentre(s) }); break;
    }
  }
  return assembleReadout({
    scene_sha256: list.sceneSha256, layout_sha256: list.layoutSha256, width: list.width, height: list.height,
    nodes, edges, selectedNodes, selectedEdges, ...(focus === undefined ? {} : { focus }), arrows, labelNodes, labelEdges,
  });
}
