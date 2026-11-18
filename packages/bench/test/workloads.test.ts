import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyScene } from "isongraph-visualize-scene-core";
import { bindLayout, verifyLayout } from "isongraph-visualize-layout-core";
import { SHAPES, SIZE_NODES, MAX_EDGES_PER_RELATION, buildArtifacts, generateWorkload, growSource, parseSizes, type Shape } from "../src/workloads.js";

const hex = async (b: Uint8Array): Promise<string> => createHash("sha256").update(b).digest("hex");

describe("workload generators: determinism", () => {
  for (const shape of SHAPES) {
    it(`${shape}: the same seed gives the same source, positions and artifact bytes; another seed differs`, async () => {
      const a = generateWorkload({ shape, nodes: 300, seed: 11 });
      const b = generateWorkload({ shape, nodes: 300, seed: 11 });
      const c = generateWorkload({ shape, nodes: 300, seed: 12 });
      expect(await hex(a.source)).toBe(await hex(b.source));
      expect(a.positions).toEqual(b.positions);
      expect(await hex(a.source)).not.toBe(await hex(c.source));
      const x = await buildArtifacts(a), y = await buildArtifacts(b);
      expect(x.sceneSha256).toBe(y.sceneSha256);
      expect(x.layoutSha256).toBe(y.layoutSha256);
      expect(Buffer.from(x.sceneBytes).equals(Buffer.from(y.sceneBytes))).toBe(true);
      expect(Buffer.from(x.layoutBytes).equals(Buffer.from(y.layoutBytes))).toBe(true);
    });
  }
});

describe("workload generators: valid IGS/1 scenes and IGL/1 FIXED layouts at S", () => {
  for (const shape of SHAPES) {
    it(`${shape}: ${SIZE_NODES.S} nodes pass verifyScene, verifyLayout and bindLayout`, async () => {
      const w = generateWorkload({ shape, nodes: SIZE_NODES.S, seed: 7 });
      const art = await buildArtifacts(w);
      const { scene } = await verifyScene(art.sceneBytes);
      expect(scene.nodes.length).toBe(SIZE_NODES.S);
      expect(scene.edges.length).toBe(w.edges);
      const { layout } = await verifyLayout(art.layoutBytes);
      expect(layout.policy.family).toBe("FIXED");
      expect(layout.nodes.length).toBe(SIZE_NODES.S);
      const bound = await bindLayout(art.sceneBytes, art.layoutBytes);
      expect(bound.sceneSha256).toBe(art.sceneSha256);
      expect(bound.layoutSha256).toBe(art.layoutSha256);
    });
  }
});

const graphOf = (shape: Shape, nodes: number, seed = 5) => generateWorkload({ shape, nodes, seed });

describe("workload generators: the shapes are what they say", () => {
  it("every shape yields exactly the requested node count, unique finite positions' refs, no self-loops and no duplicate pair", () => {
    for (const shape of SHAPES) for (const n of [2, 3, 50, 1000]) {
      const w = graphOf(shape, n);
      expect(w.nodeCount).toBe(n);
      expect(w.positions.length).toBe(n);
      const refs = new Set(w.positions.map((p) => `${p.ref.type}|${p.ref.id}`));
      expect(refs.size).toBe(n);
      for (const p of w.positions) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      const seen = new Set<number>();
      for (let e = 0; e < w.edges; e++) {
        const a = w.edgeSrc[e]!, b = w.edgeTgt[e]!;
        expect(a).not.toBe(b);
        expect(a >= 0 && a < n && b >= 0 && b < n).toBe(true);
        const k = a * n + b;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });
  it("sparse: two edges per node", () => { const w = graphOf("sparse", 1000); expect(w.edges).toBe(2000); });
  it("dag: acyclic (Kahn), about two edges per node, layered positions", () => {
    const w = graphOf("dag", 1000);
    const indeg = new Int32Array(w.nodeCount), out: number[][] = Array.from({ length: w.nodeCount }, () => []);
    for (let e = 0; e < w.edges; e++) { indeg[w.edgeTgt[e]!]!++; out[w.edgeSrc[e]!]!.push(w.edgeTgt[e]!); }
    const queue: number[] = []; for (let i = 0; i < w.nodeCount; i++) if (indeg[i] === 0) queue.push(i);
    let seen = 0;
    while (queue.length > 0) { const v = queue.pop()!; seen++; for (const t of out[v]!) if (--indeg[t]! === 0) queue.push(t); }
    expect(seen).toBe(w.nodeCount);
    expect(w.edges / w.nodeCount).toBeGreaterThan(1.5);
    expect(w.edges / w.nodeCount).toBeLessThan(2.5);
    for (let e = 0; e < w.edges; e++) expect(w.positions[w.edgeSrc[e]!]!.x).toBeLessThan(w.positions[w.edgeTgt[e]!]!.x);
    expect(w.meta.layers).toBeGreaterThan(10);
  });
  it("dense: mean degree at least 12", () => { const w = graphOf("dense", 1000); expect(w.meta.meanDegree).toBeGreaterThanOrEqual(12); });
  it("hubs: the largest degree is far above the mean (heavy tail)", () => {
    const w = graphOf("hubs", 2000);
    expect(w.meta.maxDegree).toBeGreaterThan(8 * w.meta.meanDegree);
    expect(w.meta.meanDegree).toBeGreaterThan(3);
  });
  it("hierarchy: a tree with n-1 edges, one parent per non-root, connected and acyclic", () => {
    const w = graphOf("hierarchy", 1000);
    expect(w.edges).toBe(999);
    const parent = new Int32Array(w.nodeCount).fill(-1);
    for (let e = 0; e < w.edges; e++) { expect(parent[w.edgeTgt[e]!]).toBe(-1); parent[w.edgeTgt[e]!] = w.edgeSrc[e]!; }
    let roots = 0;
    for (let i = 0; i < w.nodeCount; i++) {
      if (parent[i] === -1) { roots++; continue; }
      let v = i, steps = 0;
      while (parent[v] !== -1) { v = parent[v]!; if (++steps > w.nodeCount) throw new Error("cycle"); }
    }
    expect(roots).toBe(1);
    expect(w.meta.depth).toBeGreaterThan(3);
  });
  it("groups: several categories, most edges inside a cluster", () => {
    const w = graphOf("groups", 1000);
    expect(new Set(w.types).size).toBeGreaterThanOrEqual(6);
    expect(w.meta.clusters).toBeGreaterThanOrEqual(20);
    expect(w.meta.intraEdgeFraction).toBeGreaterThan(0.9);
  });
  it("a node count below 2 and an unknown shape are refused", () => {
    expect(() => generateWorkload({ shape: "sparse", nodes: 1, seed: 1 })).toThrow();
    expect(() => generateWorkload({ shape: "nope" as Shape, nodes: 10, seed: 1 })).toThrow();
  });
});

describe("relation splitting (Core overflows the stack above about 125,000 edges in one relation)", () => {
  it("no relation holds more than MAX_EDGES_PER_RELATION edges; small workloads keep their single relation", () => {
    const big = generateWorkload({ shape: "dense", nodes: 9000, seed: 4 });
    expect(big.edges).toBeGreaterThan(MAX_EDGES_PER_RELATION);
    expect(big.rels.length).toBe(Math.ceil(big.edges / MAX_EDGES_PER_RELATION));
    const counts = new Array<number>(big.rels.length).fill(0);
    for (const r of big.edgeRel) counts[r]!++;
    for (const c of counts) expect(c).toBeLessThanOrEqual(MAX_EDGES_PER_RELATION);
    expect(generateWorkload({ shape: "dag", nodes: 500, seed: 4 }).rels).toEqual(["FEEDS"]);
  });
});

describe("size selection", () => {
  it("parses names and plain node counts, in order, once", () => {
    expect(parseSizes("S,M")).toEqual([{ name: "S", nodes: 100 }, { name: "M", nodes: 1000 }]);
    expect(parseSizes("S, 250,S")).toEqual([{ name: "S", nodes: 100 }, { name: "N250", nodes: 250 }]);
    expect(() => parseSizes("")).toThrow();
    expect(() => parseSizes("Q")).toThrow();
    expect(() => parseSizes("1")).toThrow();
  });
});

describe("growSource (a second scene version for the stable-layout update, not a delta format)", () => {
  it("appends new nodes of a new category, each attached to one existing node; deterministic; compiles", async () => {
    const w = generateWorkload({ shape: "hubs", nodes: 200, seed: 3 });
    const a = growSource(w, 5, 17), b = growSource(w, 5, 17), c = growSource(w, 5, 18);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
    const { compileScene } = await import("isongraph-visualize-scene-core");
    const grown = await compileScene(a, "ison-v1");
    const { scene } = await verifyScene(grown.sceneBytes);
    expect(scene.nodes.length).toBe(205);
    expect(scene.edges.length).toBe(w.edges + 5);
  });
  it("refuses a non-positive count", () => {
    const w = generateWorkload({ shape: "sparse", nodes: 10, seed: 3 });
    expect(() => growSource(w, 0, 1)).toThrow();
  });
});
