import { describe, expect, it } from "vitest";
import { bandCosts, buildLimitsEvidence, buildSelection, chooseRenderer, choosePaintOnly, costPoints, withinBudget, FRAME_MS } from "../src/derive.js";
import type { StageRecord } from "../src/harness.js";
import type { WorkloadResult } from "../src/pipeline.js";
import { CAVEATS, REPORT_FORMAT, type Report } from "../src/report.js";
import { summarize } from "../src/stats.js";

const st = (id: string, ms: number, extra: Partial<StageRecord> = {}): StageRecord => ({ id, label: id, outcome: "ok", profile: "default", warmup: 0, reps: 3, ms: summarize([ms, ms, ms]), rssDeltaMb: { median: 1, max: 1 }, ...extra });
const wl = (shape: "sparse" | "dag", size: string, nodes: number, edges: number, stages: StageRecord[]): WorkloadResult => ({
  shape, size, nodes, edges, seed: 1, meta: { maxDegree: 5, meanDegree: 4 }, sourceBytes: 100, sceneBytes: (nodes + edges) * 110, layoutBytes: nodes * 60, generateMs: 1, stages, peakRssMb: 100, heapUsedMb: 10, wallSeconds: 1,
});
const base = (): Report => ({
  report: REPORT_FORMAT, generatedAt: "x", totalSeconds: 1,
  env: { cpuModel: "c", logicalCores: 1, ramGiB: 1, os: "o", osRelease: "1", arch: "x64", node: "v24", v8: "1" },
  config: { sizes: [], shapes: [], seed: 1, plans: {}, ops: 20, heapMb: 1, stageBudgetS: 60, browser: false, smoke: true, workerTimeoutMin: 1 },
  workloads: [], limits: [], selection: { assumptions: [], rows: [], notes: [] }, caveats: [...CAVEATS],
});
const smokeReport = (): Report => {
  const r = base();
  r.workloads.push(wl("sparse", "S", 100, 200, [st("scene-build", 4, { outputBytes: 33000 }), st("layout-fixed", 3, { outputBytes: 6000 }), st("render-model", 3), st("hit-test", 0.07), st("svg", 4, { outputBytes: 90000, metrics: { labels: "full", labelUnits: 900 } })]));
  return r;
};

describe("limits evidence", () => {
  it("a smoke report (S only, no browser) gives one row per limit, no undefined or NaN, and 'needs more data' where a size is missing", () => {
    const rows = buildLimitsEvidence(smokeReport());
    expect(rows.length).toBeGreaterThanOrEqual(18);
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toMatch(/undefined|NaN|Infinity/);
      expect(["keep", "raise", "lower", "needs more data"]).toContain(row.recommendation);
    }
    const byId = new Map(rows.map((x) => [x.id, x]));
    for (const id of ["rc-nodes-edges", "rc-bytes", "force-budget", "compile-edges", "stable-budget", "lod-budget", "svg-bytes", "svg-labels", "svg-dom-capacity", "canvas-capacity", "webgl-capacity", "dl-bytes", "companion", "export", "interaction"]) expect(byId.has(id), id).toBe(true);
    expect(byId.get("svg-dom-capacity")!.recommendation).toBe("needs more data");
    expect(byId.get("rc-nodes-edges")!.recommendation).toBe("needs more data"); // the 20,000-node cap was not reached
  });
  it("names every limit the designs 27 to 32 mark provisional (at least by its name)", () => {
    const text = buildLimitsEvidence(smokeReport()).map((x) => x.name).join(" | ");
    for (const name of ["maxNodes", "maxSceneBytes", "maxTotalLabelUnits", "maxIntentTargets", "maxStateBytes", "FORCE budget", "DEFAULT_STABLE_BUDGET", "DEFAULT_LOD_BUDGET", "maxSvgBytes", "maxDrawnLabelUnits", "DOM adapter capacity", "maxDlBytes", "maxGlBytes", "COMPANION_FULL_MAX", "maxTreeBytes", "maxPlanBytes", "DEFAULT_EXPORT_LIMITS", "DRAG_THRESHOLD_MILLI", "NODE_HIT_RADIUS_PX"]) expect(text, name).toContain(name);
  });
  it("with the 20,000-node cap reached and per-call hitTest rising past a frame, the node cap is kept and the bracket is stated", () => {
    const r = smokeReport();
    r.workloads.push(wl("sparse", "L", 10_000, 20_000, [st("render-model", 900), st("hit-test", 6), st("scene-build", 1000, { outputBytes: 3_300_000 }), st("layout-fixed", 500, { outputBytes: 600_000 })]));
    r.workloads.push(wl("sparse", "N20000", 20_000, 40_000, [st("render-model", 2000), st("hit-test", 12), st("scene-build", 2000, { outputBytes: 6_600_000 }), st("layout-fixed", 900, { outputBytes: 1_200_000 })]));
    r.workloads.push(wl("sparse", "XL", 100_000, 200_000, [st("render-model", 9000, { profile: "raised", defaultOutcome: { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT", message: "m" } }), st("hit-test", 60, { profile: "default" })]));
    const row = buildLimitsEvidence(r).find((x) => x.id === "rc-nodes-edges")!;
    expect(row.recommendation).toBe("keep");
    expect(row.evidence).toContain("NODE_LIMIT at XL");
    expect(row.proposal).toContain("up to 20,000 nodes");
    expect(row.proposal).toContain("over it from 100,000");
    const bytes = buildLimitsEvidence(r).find((x) => x.id === "rc-bytes")!;
    expect(bytes.recommendation).toBe("keep");
  });
  it("a byte density that would not fit the caps is a 'raise'", () => {
    const r = smokeReport();
    (r.workloads[0] as WorkloadResult).stages[0] = st("scene-build", 4, { outputBytes: (100 + 200) * 300 });
    const row = buildLimitsEvidence(r).find((x) => x.id === "rc-bytes")!;
    expect(row.recommendation).toBe("raise");
  });
  it("FORCE probe points give a keep when the whole budget costs seconds", () => {
    const r = smokeReport();
    r.forceProbe = [
      { nodes: 1000, edges: 2000, iterations: 100, estimatedWork: 50_000_000, outcome: "ok", ms: summarize([900, 910, 920]) },
      { nodes: 2000, edges: 4000, iterations: 24, estimatedWork: 48_000_000, outcome: "ok", ms: summarize([1000, 1010, 990]) },
      { nodes: 2001, edges: 4002, iterations: 10, estimatedWork: 20_000_000, outcome: "refused NODE_LIMIT" },
    ];
    const row = buildLimitsEvidence(r).find((x) => x.id === "force-budget")!;
    expect(row.recommendation).toBe("keep");
    expect(row.evidence).toContain("NODE_LIMIT");
  });
});

const browserReport = (): Report => {
  const r = base();
  const mk = (size: string, nodes: number, edges: number, svg: number, dl: number, plan: number): WorkloadResult => wl("sparse", size, nodes, edges, [st("svg", svg), st("display-list", dl), st("gl-plan", plan)]);
  r.workloads.push(mk("S", 100, 200, 3, 2, 1), mk("M", 1000, 2000, 30, 20, 10), mk("L", 10_000, 20_000, 300, 200, 100));
  const c = (size: string, nodes: number, edges: number, ins: number, cv: number, gl: number) => ({
    shape: "sparse", size, nodes, edges, errors: [], svgElements: nodes + edges,
    svg: { insertMs: summarize([ins]), toFrameMs: summarize([ins + 20]) }, canvas: { replayMs: summarize([cv / 2]), syncMs: summarize([cv]) }, webgl: { issueMs: summarize([0.1]), syncMs: summarize([gl]), labelsMs: summarize([1]) },
  });
  const cases = [c("S", 100, 200, 5, 4, 8), c("M", 1000, 2000, 45, 30, 50), c("L", 10_000, 20_000, 600, 300, 120)];
  r.browser = { engine: "chromium", version: "1", userAgent: "u", headless: true, viewport: { width: 1280, height: 800 }, reps: 3, warmup: 1, notes: [], profiles: [
    { name: "default-gl", launchArgs: [], gl: { webgl2: true, renderer: "SwiftShader", software: true }, cases },
    { name: "angle-d3d11", launchArgs: [], gl: { webgl2: true, renderer: "Intel", software: false }, cases },
  ] };
  return r;
};

describe("renderer selection proposal", () => {
  it("costPoints adds the Node build to the browser paint, per renderer, ascending in elements", () => {
    const pts = costPoints(browserReport(), 0);
    expect(pts.map((p) => p.elements)).toEqual([300, 3000, 30_000]);
    expect(pts[0]!.svg).toBe(3 + 5);
    expect(pts[0]!.canvas).toBe(2 + 4);
    expect(pts[0]!.webgl).toBe(2 + 1 + 8 + 1);
  });
  it("withinBudget is a prefix rule over the element counts", () => {
    const pts = [{ label: "a", elements: 10, svg: 5 }, { label: "b", elements: 100, svg: 50 }, { label: "c", elements: 1000, svg: 500 }, { label: "d", elements: 10000, svg: 20 }];
    expect(withinBudget(pts, "svg", 100)).toBe(100);
    expect(withinBudget(pts, "svg", FRAME_MS)).toBe(10);
    expect(withinBudget(pts, "svg", 1)).toBe(0);
  });
  it("without browser data there are no rows, only a note", () => {
    const s = buildSelection(smokeReport());
    expect(s.rows).toEqual([]);
    expect(s.notes.join(" ")).toContain("browser mode was not run");
  });
  it("bandCosts takes the median per element band; chooseRenderer prefers SVG then Canvas inside the tie factor", () => {
    const b = bandCosts(browserReport());
    expect(b.map((x) => x.band)).toEqual(["0 to under 1,000", "1,000 to under 5,000", "20,000 to under 50,000"]);
    expect(b[0]!.svg).toBe(3 + 5);
    expect(b[0]!.webglHardware).toBe(2 + 1 + 8 + 1);
    expect(chooseRenderer({ band: "x", points: 1, svg: 10, canvas: 9, webglWorst: 20 })).toBe("SVG (DOM)");
    expect(chooseRenderer({ band: "x", points: 1, svg: 100, canvas: 50, webglWorst: 70 })).toBe("Canvas 2D");
    expect(chooseRenderer({ band: "x", points: 1, svg: 100, canvas: 90, webglWorst: 10 })).toBe("WebGL2");
    expect(chooseRenderer({ band: "x", points: 1 })).toBeUndefined();
    expect(chooseRenderer({ band: "x", points: 1, svg: 12, canvas: 2, webglWorst: 3 })).toBe("SVG (DOM)"); // under one frame everything is equal: the preference wins
    expect(choosePaintOnly({ band: "x", points: 1, paintSvg: 400, paintCanvas: 200, paintWebglHardware: 50, paintWebglSoftware: 500 })).toBe("WebGL2 (hardware GL only)");
    expect(choosePaintOnly({ band: "x", points: 1, paintSvg: 400, paintCanvas: 200, paintWebglSoftware: 50 })).toBe("Canvas 2D");
  });
  it("with browser data it proposes ascending ranges from the three renderers, states the assumptions and no NaN", () => {
    const s = buildSelection(browserReport());
    expect(s.rows.length).toBe(3);
    for (const row of s.rows) expect(["SVG (DOM)", "Canvas 2D", "WebGL2"]).toContain(row.renderer);
    expect(s.notes.join(" ")).toContain("Proposed thresholds");
    expect(s.assumptions.join(" ")).toContain("Reference budgets");
    expect(s.notes.join(" ")).toContain("Proposal only");
    expect(JSON.stringify(s)).not.toMatch(/undefined|NaN|Infinity/);
  });
});
