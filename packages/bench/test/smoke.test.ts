import { describe, expect, it } from "vitest";
import { runWorkload } from "../src/pipeline.js";
import { SHAPES } from "../src/workloads.js";
import { runCompileProbe, runForceProbe } from "../src/force-probe.js";

// The S-size smoke of the whole Node pipeline: it asserts that the pipeline RUNS (every stage has an outcome, none failed, none refused at S), never how fast. No threshold.
describe("S-size pipeline smoke", () => {
  for (const shape of SHAPES) {
    it(`${shape}: every stage runs at 100 nodes under the default limits`, async () => {
      const r = await runWorkload({ shape, size: { name: "S", nodes: 100 }, seed: 3, plan: { warmup: 0, reps: 1, budgetMs: 20_000 }, ops: 5 });
      const bad = r.stages.filter((s) => s.outcome !== "ok");
      expect(bad.map((s) => `${s.id}:${s.outcome}:${s.error?.code ?? s.note ?? ""}`)).toEqual([]);
      for (const id of ["scene-build", "layout-fixed", "render-model", "svg", "display-list", "canvas-stream", "gl-plan", "companion-tree", "companion-gate", "export-bundle", "headless", "hit-test", "step-key", "lod-view-collapsed", "stable-update", "layout-force"]) {
        expect(r.stages.find((s) => s.id === id)?.outcome, id).toBe("ok");
      }
      expect(r.stages.every((s) => s.profile === "default")).toBe(true);
      expect(r.sceneBytes).toBeGreaterThan(0);
      expect(r.layoutBytes).toBeGreaterThan(0);
      expect(r.peakRssMb).toBeGreaterThan(0);
    });
  }
  it("the FORCE probe records an ok point inside the budget and the documented NODE_LIMIT refusal just above it", async () => {
    const pts = await runForceProbe([[60, 5], [2001, 1]], 3);
    expect(pts[0]!.outcome).toBe("ok");
    expect(pts[0]!.ms).toBeDefined();
    expect(pts[1]!.outcome).toBe("refused NODE_LIMIT");
  });
  it("the compile probe records an ok compile and the stack overflow of Core above about 125,000 edges in one relation", async () => {
    const pts = await runCompileProbe([1_000, 130_000]);
    expect(pts[0]!.outcome).toBe("ok");
    expect(pts[1]!.outcome).toContain("RangeError");
  });
});
