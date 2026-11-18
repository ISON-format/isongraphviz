// The kit's tier-D model generator (design 13.3b): every seed gives a model the frozen verifiers accept, deterministically.
import { describe, expect, it } from "vitest";
import { generateRandomModel, lcg } from "../src/conformance/generate.js";
import { modelBytes } from "../src/model.js";

describe("generateRandomModel", () => {
  it("200 seeds: all accepted by verifyScene, verifyLayout and bindLayout; sizes within the stated bounds; deterministic", async () => {
    let withEdges = 0, undirected = 0, empty = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const m = await generateRandomModel(seed);
      expect(m.nodes.length).toBeLessThanOrEqual(40);
      expect(m.edges.length).toBeLessThanOrEqual(2 * m.nodes.length);
      expect(new Set(m.nodes.map((n) => n.category)).size).toBeLessThanOrEqual(4);
      for (const n of m.nodes) { expect(Math.abs(n.x)).toBeLessThanOrEqual(1_000_000); expect(n.label).toBe(n.ref.id.slice(2)); }
      if (m.edges.length) withEdges++;
      if (!m.directed) undirected++;
      if (!m.nodes.length) empty++;
      if (seed % 40 === 0) expect(modelBytes(await generateRandomModel(seed))).toEqual(modelBytes(m));
    }
    expect(withEdges).toBeGreaterThan(50);
    expect(undirected).toBeGreaterThan(30);
    expect(empty).toBeGreaterThan(0);
  }, 120_000);
  it("the LCG is the 32-bit generator of IGL/1 7.1", () => {
    const r = lcg(1);
    // state 1 -> 1 x 1664525 + 1013904223 = 1015568748 (mod 2^32): the high bits feed the draws
    expect(r.int(1 << 24)).toBe((1015568748 >>> 8) % (1 << 24));
  });
});
