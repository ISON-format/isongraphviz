import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCKS, applyToResults, generatedBlocks, rebuild } from "../src/results.js";
import { CAVEATS, REPORT_FORMAT, compactMarkdown, refusalGroups, type Report } from "../src/report.js";
import type { StageRecord } from "../src/harness.js";
import type { WorkloadResult } from "../src/pipeline.js";
import { summarize } from "../src/stats.js";

const st = (id: string, ms: number, extra: Partial<StageRecord> = {}): StageRecord => ({ id, label: id, outcome: "ok", profile: "default", warmup: 0, reps: 3, ms: summarize([ms, ms, ms]), rssDeltaMb: { median: 1, max: 1 }, ...extra });
const wl = (shape: "sparse" | "dag", size: string, nodes: number, stages: StageRecord[]): WorkloadResult => ({
  shape, size, nodes, edges: nodes * 2, seed: 1, meta: { maxDegree: 5, meanDegree: 4 }, sourceBytes: 100, sceneBytes: 1000, layoutBytes: 500, generateMs: 1, stages, peakRssMb: 100, heapUsedMb: 10, wallSeconds: 1,
});
const refused = (id: string): StageRecord => ({ id, label: id, outcome: "ok", profile: "raised", ms: summarize([5]), rssDeltaMb: { median: 1, max: 1 }, defaultOutcome: { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT", message: "m" } });
const report = (): Report => ({
  report: REPORT_FORMAT, generatedAt: "2026-01-01T00:00:00.000Z", totalSeconds: 3,
  env: { cpuModel: "Test CPU", logicalCores: 4, ramGiB: 8, os: "TestOS", osRelease: "1", arch: "x64", node: "v24.0.0", v8: "13" },
  config: { sizes: [{ name: "S", nodes: 100 }, { name: "XL", nodes: 100000 }], shapes: ["sparse", "dag"], seed: 1, plans: { S: { warmup: 1, reps: 3, budgetMs: 60000 }, XL: { warmup: 0, reps: 2, budgetMs: 60000 } }, ops: 20, heapMb: 1024, stageBudgetS: 60, browser: false, smoke: false, workerTimeoutMin: 5 },
  workloads: [
    wl("sparse", "S", 100, [st("scene-build", 4), st("render-model", 3), st("svg", 5)]),
    wl("dag", "S", 100, [st("scene-build", 4), st("render-model", 3)]),
    wl("sparse", "XL", 100000, [st("scene-build", 400), refused("render-model")]),
    wl("dag", "XL", 100000, [st("scene-build", 400), refused("render-model")]),
  ],
  limits: [], selection: { assumptions: [], rows: [], notes: [] }, caveats: [...CAVEATS],
});

const template = (): string => `# Results\n\nhand text\n\n${BLOCKS.map((b) => `<!-- BEGIN GENERATED ${b} -->\nold ${b}\n<!-- END GENERATED ${b} -->\n`).join("\nbetween\n\n")}\nclosing hand text\n`;

describe("compact tables and grouped refusals", () => {
  it("groups the same refusal across shapes and lists the sizes once", () => {
    const lines = refusalGroups(report());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("`render-model`: default refused RESOURCE_LIMIT/NODE_LIMIT");
    expect(lines[0]).toContain("XL (all shapes)");
  });
  it("the compact tables have one block per size and the raised mark", () => {
    const md = compactMarkdown(report());
    expect(md).toContain("#### S (100 nodes)");
    expect(md).toContain("#### XL (100000 nodes)");
    expect(md).toContain("5.000*");
  });
});

describe("RESULTS.md refresh", () => {
  it("replaces every generated block, keeps the hand text, and is idempotent", () => {
    const r = report();
    r.limits = [{ id: "x", package: "p", name: "maxX", value: "1", design: "27", evidence: "e", recommendation: "keep", proposal: "none" }];
    const out = applyToResults(template(), r);
    expect(out).toContain("hand text");
    expect(out).toContain("between");
    expect(out).toContain("closing hand text");
    expect(out).not.toContain("old environment");
    expect(out).toContain("Test CPU");
    expect(out).toContain("maxX");
    expect(out).toContain("The browser mode was not run.");
    expect(applyToResults(out, r)).toBe(out);
    expect(Object.keys(generatedBlocks(r)).sort()).toEqual([...BLOCKS].sort());
  });
  it("rebuild re-derives, rewrites the report files and the results file, with LF only", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-results-"));
    try {
      const rp = join(dir, "report.json"), res = join(dir, "RESULTS.md");
      writeFileSync(rp, JSON.stringify(report()));
      writeFileSync(res, template());
      const r = rebuild(rp, res);
      expect(r.limits.length).toBeGreaterThanOrEqual(18);
      const md = readFileSync(res, "utf8");
      expect(md.includes("\r")).toBe(false);
      expect(md).toContain("Test CPU");
      expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("# ISONGraphVisualize benchmark report");
      expect((JSON.parse(readFileSync(rp, "utf8")) as Report).limits.length).toBe(r.limits.length);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
