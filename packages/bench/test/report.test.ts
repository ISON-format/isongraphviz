import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cell, findStage, findWorkload, headlineMarkdown, injectGenerated, renderMarkdown, writeReport, CAVEATS, REPORT_FORMAT, type Report } from "../src/report.js";
import type { StageRecord } from "../src/harness.js";
import type { WorkloadResult } from "../src/pipeline.js";
import { summarize } from "../src/stats.js";

const ok = (id: string, ms: number[], extra: Partial<StageRecord> = {}): StageRecord => ({ id, label: id, outcome: "ok", profile: "default", warmup: 1, reps: ms.length, ms: summarize(ms), rssDeltaMb: { median: 1.5, max: 2 }, ...extra });
const wl = (shape: "sparse" | "dag", size: string, stages: StageRecord[]): WorkloadResult => ({
  shape, size, nodes: 100, edges: 200, seed: 1, meta: { maxDegree: 9, meanDegree: 4 }, sourceBytes: 1000, sceneBytes: 5000, layoutBytes: 4000, generateMs: 1, stages, peakRssMb: 120, heapUsedMb: 30, wallSeconds: 2,
});
const report = (): Report => ({
  report: REPORT_FORMAT, generatedAt: "2026-01-01T00:00:00.000Z", totalSeconds: 12.4,
  env: { cpuModel: "Test CPU", logicalCores: 8, ramGiB: 16, os: "TestOS", osRelease: "1.0", arch: "x64", node: "v24.0.0", v8: "13.0" },
  config: { sizes: [{ name: "S", nodes: 100 }], shapes: ["sparse", "dag"], seed: 1, plans: { S: { warmup: 1, reps: 3, budgetMs: 60000 } }, ops: 20, heapMb: 8192, stageBudgetS: 60, browser: false, smoke: true, workerTimeoutMin: 30 },
  workloads: [
    wl("sparse", "S", [
      ok("scene-build", [4, 5, 6], { outputBytes: 5000 }), ok("svg", [10, 12, 11], { outputBytes: 2048 }), ok("render-model", [3, 3, 3], { profile: "raised", defaultOutcome: { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT", message: "m" } }),
      { id: "layout-force", label: "force", outcome: "refused", profile: "default", error: { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT", message: "RESOURCE_LIMIT | NODE_LIMIT | 100 nodes > 50" } },
    ]),
    { shape: "dag", size: "S", nodes: 100, failed: true, reason: "out of memory", wallSeconds: 3 },
  ],
  limits: [{ id: "x", package: "p", name: "maxX", value: "1", design: "27", evidence: "e", recommendation: "keep", proposal: "none" }],
  selection: { assumptions: ["a"], rows: [{ elements: "<= 10", renderer: "SVG", basis: "b", data: "d" }], notes: ["n"] },
  caveats: [...CAVEATS],
});

describe("report cells", () => {
  it("shows the median, * for raised limits, the refusal reason, and dashes", () => {
    expect(cell(ok("a", [10, 20, 30]))).toBe("20.00");
    expect(cell(ok("a", [5], { profile: "raised" }))).toBe("5.000*");
    expect(cell({ id: "a", label: "a", outcome: "refused", profile: "default", error: { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT", message: "" } })).toBe("refused NODE_LIMIT");
    expect(cell({ id: "a", label: "a", outcome: "failed", profile: "default", error: { code: "RangeError", message: "" } })).toBe("failed RangeError");
    expect(cell({ id: "a", label: "a", outcome: "skipped", profile: "default" })).toBe("skipped");
    expect(cell(undefined)).toBe("-");
  });
  it("finds a workload and a stage", () => {
    const r = report();
    expect(findWorkload(r, "sparse", "S")?.nodes).toBe(100);
    expect(findWorkload(r, "dag", "S")).toBeUndefined();
    expect(findStage(findWorkload(r, "sparse", "S"), "svg")?.outputBytes).toBe(2048);
  });
});

describe("Markdown rendering", () => {
  it("contains the environment, the medians, the refusal list and the failed worker, and no NaN or undefined", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("Test CPU");
    expect(md).toContain("Node v24.0.0");
    expect(md).toMatch(/\| sparse \| .*5\.000/);
    expect(md).toContain("11.00"); // the median of the svg stage [10, 12, 11]
    expect(md).toContain("12.00"); // its p95 in the stage detail
    expect(md).toContain("refused NODE_LIMIT");
    expect(md).toContain("default limits refused (RESOURCE_LIMIT/NODE_LIMIT)");
    expect(md).toContain("worker failed: out of memory");
    expect(md).not.toMatch(/NaN|undefined/);
  });
  it("the headline block alone is stable and includes the size tables", () => {
    const h = headlineMarkdown(report());
    expect(h).toContain("### Size S (100 nodes)");
    expect(h).toContain("2.00 KiB");
  });
});

describe("report writer", () => {
  it("writes report.json (round trips) and report.md, with LF line ends only", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-report-"));
    try {
      const r = report();
      const { jsonPath, mdPath } = writeReport(r, join(dir, "out"));
      expect(JSON.parse(readFileSync(jsonPath, "utf8"))).toEqual(r);
      const md = readFileSync(mdPath, "utf8");
      expect(md.includes("\r")).toBe(false);
      expect(readFileSync(jsonPath, "utf8").includes("\r")).toBe(false);
      expect(md.endsWith("\n")).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("marker injection", () => {
  const doc = "intro\n<!-- BEGIN GENERATED a -->\nold\n<!-- END GENERATED a -->\noutro\n";
  it("replaces between the markers, keeps the rest, and is idempotent", () => {
    const once = injectGenerated(doc, "a", "new line\n\n");
    expect(once).toBe("intro\n<!-- BEGIN GENERATED a -->\nnew line\n<!-- END GENERATED a -->\noutro\n");
    expect(injectGenerated(once, "a", "new line")).toBe(once);
  });
  it("throws when a marker is missing or out of order", () => {
    expect(() => injectGenerated("nothing", "a", "x")).toThrow();
    expect(() => injectGenerated("<!-- END GENERATED a -->\n<!-- BEGIN GENERATED a -->", "a", "x")).toThrow();
    expect(() => injectGenerated(doc, "b", "x")).toThrow();
  });
});
