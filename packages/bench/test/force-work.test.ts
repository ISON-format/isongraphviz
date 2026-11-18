import { describe, expect, it } from "vitest";
import { computeForceLayout } from "isongraph-visualize-layout-core";
import { forceWork } from "../src/force-work.js";
import { buildArtifacts, generateWorkload } from "../src/workloads.js";

describe("forceWork agrees with the producer's refusal boundary", () => {
  it("a budget equal to the estimate is accepted, one below it is refused with WORK_LIMIT", async () => {
    const w = generateWorkload({ shape: "sparse", nodes: 40, seed: 2 });
    const art = await buildArtifacts(w);
    const cfg = { width: 800, height: 600, margin: 40, iterations: 7, seed: 1 };
    const est = Number(forceWork(w.nodeCount, w.edges, cfg.iterations));
    const ok = await computeForceLayout(art.sceneBytes, cfg, { budget: { maxWork: est } });
    expect(ok.layout.policy.family).toBe("FORCE");
    await expect(computeForceLayout(art.sceneBytes, cfg, { budget: { maxWork: est - 1 } })).rejects.toMatchObject({ code: "RESOURCE_LIMIT", reason: "WORK_LIMIT" });
  });
  it("matches the formula by hand for a tiny case", () => {
    expect(forceWork(1000, 2000, 100)).toBe(100n * (499500n + 6000n + 8000n + 4n) + 200n * 3000n);
    expect(forceWork(1, 0, 50)).toBe(200n);
  });
});
