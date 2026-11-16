// packages/layout-core/test/core-parity.test.ts - igl-force/1 against the pinned Core called DIRECTLY (not through our wrapper).
// This is the discriminating test for processing order: it fails if the producer's order ever differs from Core's.
import { join } from "node:path";
import { verifyScene } from "isongraph-visualize-scene-core";
import type { Scene } from "isongraph-visualize-scene-core";
import { ISONGraph } from "ison-graph-ts";
import { computeLayout as coreLayout } from "ison-graph-ts/viz";
import { describe, expect, it } from "vitest";
import { computeForceLayout } from "../src/force.js";
import { quantize } from "../src/quantize.js";
import { CORE_CFG, ORACLES, ORACLES_IGL, read } from "./helpers.js";

const idOf = (w: string): number | string => (w.startsWith("i:") ? Number(w.slice(2)) : w.slice(2));

/** Builds a Core graph from the scene with the nodes added in the given order, and lays it out with Core itself. */
function direct(scene: Scene, order: number[], cfg = CORE_CFG) {
  const g = new ISONGraph("g", scene.graph.directed);
  for (const i of order) g.addNode(scene.nodes[i]!.ref.type, idOf(scene.nodes[i]!.ref.id), {});
  for (const e of scene.edges) g.addEdge(e.ref.rel, [e.ref.src.type, idOf(e.ref.src.id)], [e.ref.tgt.type, idOf(e.ref.tgt.id)], {});
  return coreLayout(g, cfg);
}
const orders = (n: number): number[][] => {
  const id = Array.from({ length: n }, (_, i) => i);
  let s = 17; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const shuffled = [...id]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]; }
  return [id, [...id].reverse(), shuffled];
};

async function parity(sceneFile: string, cfg = CORE_CFG) {
  const bytes = read(sceneFile);
  const { scene } = await verifyScene(bytes);
  const ours = await computeForceLayout(bytes, cfg);
  for (const order of orders(scene.nodes.length)) {
    const lay = direct(scene, order, cfg);
    expect(lay.size).toBe(scene.nodes.length);
    for (const n of ours.layout.nodes) {
      const p = lay.get(`${n.ref.type} ${scene.nodes.find((s) => s.ref.id === n.ref.id && s.ref.type === n.ref.type)!.label}`)!;
      expect([n.x, n.y], `${n.ref.type} ${n.ref.id}`).toEqual([quantize(p[0]), quantize(p[1])]);
    }
  }
  return scene;
}

describe("igl-force/1 equals Core called directly, whatever order the nodes are added in", () => {
  it("O1", async () => { await parity(join(ORACLES, "o1-basic.scene.json")); });
  it("O4 (undirected: mirrored pair and a self-loop)", async () => { await parity(join(ORACLES, "o4-undirected.scene.json")); });
  it("Core's 5-node parity graph", async () => { await parity(join(ORACLES_IGL, "scenes/parity5.scene.json")); });
  it("the 20-node mixed-id graph, with default and non-default options", async () => {
    await parity(join(ORACLES_IGL, "scenes/mixed20.scene.json"));
    await parity(join(ORACLES_IGL, "scenes/mixed20.scene.json"), { width: 400, height: 300, iterations: 60, margin: 20, seed: 7 });
  });
  it("the Unicode-order scene (U+FF5E, U+1F600, U+E000, U+10000)", async () => { await parity(join(ORACLES_IGL, "scenes/unicode.scene.json")); });

  it("the Unicode scene is processed in UTF-16 code-unit order - not code-point order, not NodeRef/2 order (the order igl-force/1 is defined by)", async () => {
    const { scene } = await verifyScene(read(join(ORACLES_IGL, "scenes/unicode.scene.json")));
    const lay = direct(scene, [0, 1, 2, 3]);
    const coreOrder = [...lay.keys()];
    const labels = coreOrder.map((k) => k.slice(2));
    const utf16 = [...labels].sort(); // JavaScript default: UTF-16 code units
    const codePoints = [...labels].sort((a, b) => { const x = [...a].map((c) => c.codePointAt(0)!), y = [...b].map((c) => c.codePointAt(0)!); return x[0]! - y[0]!; });
    expect(labels).toEqual(utf16);
    expect(labels).not.toEqual(codePoints);
    expect(labels.map((l) => l.codePointAt(0)!.toString(16))).toEqual(["10000", "1f600", "e000", "ff5e"]);
    // NodeRef/2 (UTF-8 byte) order of the same ids, as stored in the scene, is the code-point order:
    expect(scene.nodes.map((n) => n.ref.id.slice(2).codePointAt(0)!.toString(16))).toEqual(["e000", "ff5e", "10000", "1f600"]);
  });
});
