// src/pipeline.ts - one workload through every stage of the Node pipeline, each stage measured by the harness. Public APIs of the committed packages only.
// A stage first runs under the packages' DEFAULT limits; if a limit refuses, the refusal is recorded and the stage is measured again with per-call limits raised
// (the stage record says which profile the figures are from). Nothing here changes a limit of any package.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene, verifyScene } from "isongraph-visualize-scene-core";
import { bindLayout, computeFixedLayout, computeForceLayout, verifyLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel, hitTest, initialState, reduce, serializeState } from "isongraph-visualize-renderer-core";
import type { Intent, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { readSvg, renderSvgDetailed, writeSvg } from "isongraph-visualize-renderer-svg";
import { buildDisplayList, parseDisplayList, serializeDisplayList } from "isongraph-visualize-display-list";
import type { DisplayList } from "isongraph-visualize-display-list";
import { recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";
import { parseGlPlan, planGl, serializePlan } from "isongraph-visualize-renderer-webgl";
import type { GlPlan } from "isongraph-visualize-renderer-webgl";
import { buildCompanionTree, planCompanionUpdate, runAccessibilityGate, serializeCompanionTree, serializePlan as serializeCompanionPlan } from "isongraph-visualize-a11y-companion";
import { exportBundle, renderHeadless, verifyExportBundle } from "isongraph-visualize-export-core";
import { createMachine, step } from "isongraph-visualize-interaction-core";
import type { MachineState, Output } from "isongraph-visualize-interaction-core";
import { deriveView, emptyState, replaceGroups, serializeLODState, suggestGroups } from "isongraph-visualize-lod-core";
import type { RuleSpec } from "isongraph-visualize-lod-core";
import { RECOMMENDED_PLACEMENT, computeStableLayout, diffScenes } from "isongraph-visualize-stable-layout-core";
import { forceWork } from "./force-work.js";
import { createRecorder, type Profile, type RunPlan, type StageRecord } from "./harness.js";
import { createRng } from "./rng.js";
import { generateWorkload, growSource, type Shape, type SizeSpec, type Workload, type WorkloadMeta } from "./workloads.js";

export const VIEW = Object.freeze({ width: 1280, height: 800 });
const BIG = 2 ** 31;
/** Per-call limits used only when the default limits refuse: large enough for the stage to run, never a statement about what a default should be. */
export const RAISED = Object.freeze({
  render: { maxSceneBytes: BIG, maxLayoutBytes: BIG, maxNodes: 10_000_000, maxEdges: 10_000_000, maxTotalLabelUnits: BIG, maxStateBytes: BIG, maxIntentTargets: 10_000_000 },
  svg: { maxSvgBytes: BIG, maxDrawnLabelUnits: BIG },
  bytes: BIG,
  tree: { maxTreeBytes: BIG },
  exportLimits: { maxArtifactBytes: 2 ** 40, maxPngBytes: 2 ** 40, maxManifestBytes: 2 ** 40 },
  lod: { maxNodes: 100_000, maxEdges: 500_000, maxWork: 1_000_000_000 },
  stable: { maxNodes: 10_000_000, maxEdges: 10_000_000, maxSceneBytes: BIG, maxLayoutBytes: BIG, maxReportBytes: BIG, maxWork: 10 ** 13 },
});

export interface WorkloadResult {
  shape: Shape;
  size: string;
  nodes: number;
  edges: number;
  seed: number;
  meta: WorkloadMeta;
  sourceBytes: number;
  sceneBytes?: number;
  layoutBytes?: number;
  generateMs: number;
  stages: StageRecord[];
  peakRssMb: number;
  heapUsedMb: number;
  wallSeconds: number;
  /** Directory with the artifacts for the browser mode, when requested. */
  artifactDir?: string;
}
export interface PipelineOptions {
  shape: Shape;
  size: SizeSpec;
  seed: number;
  plan: RunPlan;
  /** Operations per call of the interaction stages. */
  ops: number;
  artifactDir?: string;
  log?: (line: string) => void;
}

const MB = 1024 * 1024;
const text = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : String(n));

export async function runWorkload(o: PipelineOptions): Promise<WorkloadResult> {
  const wall0 = performance.now();
  const log = o.log ?? ((): void => undefined);
  const rec = createRecorder(o.plan);
  const g0 = performance.now();
  const w: Workload = generateWorkload({ shape: o.shape, nodes: o.size.nodes, seed: o.seed });
  const generateMs = performance.now() - g0;
  log(`${o.shape}/${o.size.name}: ${text(w.nodeCount)} nodes, ${text(w.edges)} edges, source ${(w.source.length / MB).toFixed(1)} MiB`);
  const heavy: Partial<RunPlan> = o.size.nodes >= 10_000 ? { warmup: 0, reps: Math.min(o.plan.reps, 3) } : {};
  const veryHeavy: Partial<RunPlan> = o.size.nodes >= 10_000 ? { warmup: 0, reps: 2 } : {};
  const result: WorkloadResult = {
    shape: o.shape, size: o.size.name, nodes: w.nodeCount, edges: w.edges, seed: o.seed, meta: w.meta, sourceBytes: w.source.length, generateMs, stages: rec.records,
    peakRssMb: 0, heapUsedMb: 0, wallSeconds: 0,
  };
  const done = (): WorkloadResult => {
    result.peakRssMb = process.resourceUsage().maxRSS / 1024;
    result.heapUsedMb = process.memoryUsage().heapUsed / MB;
    result.wallSeconds = (performance.now() - wall0) / 1000;
    return result;
  };
  const note = (): void => { const r = rec.records[rec.records.length - 1]; if (r) log(`  ${r.id.padEnd(24)} ${r.outcome}${r.profile === "raised" ? " (raised limits)" : ""}${r.ms ? ` median ${r.ms.median.toFixed(2)} ms` : ""}${r.error ? ` ${r.error.code}/${r.error.reason ?? ""}` : ""}`); };
  const stage: typeof rec.stage = async (s) => { const v = await rec.stage(s); note(); return v; };

  // ---- scene and layout ----
  const compiled = await stage({
    id: "scene-build", label: "compileScene: ISON text to IGS/1 scene", plan: heavy, run: () => compileScene(w.source, "ison-v1"),
    describe: (c) => ({ outputBytes: c.sceneBytes.length, metrics: { sourceBytes: w.source.length } }),
  });
  if (!compiled) { rec.skip("rest", "every later stage", "the scene did not compile"); return done(); }
  const sceneBytes = compiled.sceneBytes;
  result.sceneBytes = sceneBytes.length;
  await stage({ id: "scene-verify", label: "verifyScene", plan: heavy, run: () => verifyScene(sceneBytes), describe: (v) => ({ metrics: { nodes: v.scene.nodes.length, edges: v.scene.edges.length } }) });
  const laid = await stage({
    id: "layout-fixed", label: "computeFixedLayout (FIXED family, explicit positions)", plan: heavy, run: () => computeFixedLayout(sceneBytes, w.positions),
    describe: (l) => ({ outputBytes: l.layoutBytes.length }),
  });
  if (!laid) { rec.skip("rest", "every later stage", "the layout was not produced"); return done(); }
  const layoutBytes = laid.layoutBytes;
  result.layoutBytes = layoutBytes.length;
  await stage({ id: "layout-verify", label: "verifyLayout", plan: heavy, run: () => verifyLayout(layoutBytes) });
  await stage({ id: "layout-bind", label: "bindLayout (verifies both, binds them)", plan: heavy, run: () => bindLayout(sceneBytes, layoutBytes) });

  // FORCE: the real family, only through its documented budget (2,000 nodes, 100,000,000 work units); beyond it the refusal is the evidence.
  const side = Math.max(600, Math.round(60 * Math.sqrt(w.nodeCount)));
  const forceCfg = { width: side, height: side, margin: 40, iterations: 100, seed: 42 };
  await stage({
    id: "layout-force", label: "computeForceLayout (igl-force/1, 100 iterations, default budget)", noRaise: true, plan: { warmup: 1, reps: 3, budgetMs: 40_000 },
    run: () => computeForceLayout(sceneBytes, forceCfg),
    describe: (l) => ({ outputBytes: l.layoutBytes.length, metrics: { estimatedWork: Number(forceWork(w.nodeCount, w.edges, forceCfg.iterations)) } }),
  });

  // ---- render model, state ----
  const modelPlan = heavy;
  const model: RenderModel | undefined = await stage({
    id: "render-model", label: "buildRenderModel (verify, bind, index)", plan: modelPlan,
    run: (p: Profile) => buildRenderModel(sceneBytes, layoutBytes, p === "raised" ? { limits: RAISED.render } : undefined),
    describe: (m) => ({ metrics: { nodes: m.nodes.length, edges: m.edges.length } }),
  });
  if (!model) { rec.skip("rest", "every later stage", "no render model"); return done(); }
  const raisedModel = rec.records.find((r) => r.id === "render-model")!.profile === "raised";
  const limitsOpt = raisedModel ? RAISED.render : undefined;
  const state: SemanticState | undefined = await stage({
    id: "initial-state", label: "initialState (fit the bounds into 1280x800)", run: () => initialState(model, VIEW),
    describe: (s) => ({ outputBytes: serializeState(model, s).length }),
  });
  if (!state) { rec.skip("rest", "every later stage", "no state"); return done(); }

  // ---- SVG ----
  const svgRes = await stage({
    id: "svg", label: "renderSvgDetailed (the SVG document as a string)", plan: veryHeavy,
    run: (p) => renderSvgDetailed(model, state, p === "raised" ? RAISED.svg : undefined),
    describe: (r) => ({ outputBytes: r.bytes, metrics: { labels: r.fidelity.labels, edgeLabels: r.fidelity.edge_labels, labelUnits: r.label_units } }),
  });
  if (o.artifactDir && svgRes) { mkdirSync(o.artifactDir, { recursive: true }); writeFileSync(join(o.artifactDir, "svg.txt"), svgRes.svg); }
  const svgFidelity = svgRes?.fidelity.labels;
  if (!svgRes) {
    await stage({
      id: "svg-stream", label: "writeSvg (streaming writer, bytes counted, nothing retained)", plan: veryHeavy,
      run: (p) => { let bytes = 0; writeSvg(model, state, p === "raised" ? RAISED.svg : undefined, (line) => { bytes += Buffer.byteLength(line); }); return bytes; },
      describe: (b) => ({ outputBytes: b }),
    });
  }
  if (svgRes && svgFidelity !== "full" && w.nodeCount <= 100_000) {
    await stage({
      id: "svg-full-labels", label: "renderSvgDetailed with the label budget raised (every label drawn)", plan: { warmup: 0, reps: 2 }, noRaise: true,
      run: () => renderSvgDetailed(model, state, RAISED.svg),
      describe: (r) => ({ outputBytes: r.bytes, metrics: { labels: r.fidelity.labels, edgeLabels: r.fidelity.edge_labels, labelUnits: r.label_units } }),
    });
  }

  if (svgRes) {
    await stage({
      id: "svg-read", label: "readSvg (the independent reader of the SVG document)", plan: veryHeavy,
      run: (p) => readSvg(svgRes.svg, p === "raised" ? { maxBytes: BIG, maxLineUnits: BIG } : undefined),
      describe: (r) => ({ metrics: { nodes: r.nodes.length, edges: r.edges.length } }),
    });
  }

  // ---- display list, Canvas stream, WebGL plan ----
  let list: DisplayList | undefined = await stage({
    id: "display-list", label: "buildDisplayList", plan: veryHeavy, run: () => buildDisplayList(model, state),
    describe: (l) => ({ metrics: { records: l.records.length, textRecords: l.records.reduce((c, r) => (r[0] === "T" ? c + 1 : c), 0) } }),
  });
  if (list) {
    const dlBytes = await stage({
      id: "display-list-serialize", label: "serializeDisplayList (igr-dl/1 text bytes)", plan: veryHeavy,
      run: (p) => serializeDisplayList(list!, p === "raised" ? { maxBytes: RAISED.bytes } : undefined), describe: (b) => ({ outputBytes: b.length }),
    });
    if (o.artifactDir && dlBytes) writeFileSync(join(o.artifactDir, "dl.bin"), dlBytes);
    if (dlBytes) {
      await stage({
        id: "display-list-parse", label: "parseDisplayList (the strict reader)", plan: veryHeavy,
        run: (p) => parseDisplayList(dlBytes, p === "raised" ? { maxBytes: BIG, maxLineUnits: BIG } : undefined), describe: (l) => ({ metrics: { records: l.records.length } }),
      });
    }
    await stage({
      id: "canvas-stream", label: "recordCanvasCalls (the Canvas replay into a recorded stream)", plan: veryHeavy, run: () => recordCanvasCalls(list!),
      describe: (b) => ({ outputBytes: b.length }),
    });
    const plan: GlPlan | undefined = await stage({
      id: "gl-plan", label: "planGl (instance buffers and draws)", plan: veryHeavy, run: (p) => planGl(list!, p === "raised" ? { maxBytes: RAISED.bytes } : undefined),
      describe: (pl) => ({ outputBytes: pl.buffers.edge.length + pl.buffers.disc.length + pl.buffers.arrow.length, metrics: { edgeBytes: pl.buffers.edge.length, discBytes: pl.buffers.disc.length, arrowBytes: pl.buffers.arrow.length } }),
    });
    if (plan) {
      const planBytes = await stage({ id: "gl-plan-serialize", label: "serializePlan (igr-gl/1 bytes)", plan: veryHeavy, run: () => serializePlan(plan), describe: (b) => ({ outputBytes: b.length }) });
      if (o.artifactDir && planBytes) writeFileSync(join(o.artifactDir, "plan.bin"), planBytes);
      if (planBytes) {
        await stage({
          id: "gl-plan-parse", label: "parseGlPlan (the strict reader)", plan: veryHeavy,
          run: (p) => parseGlPlan(planBytes, p === "raised" ? { maxBytes: BIG, maxLineUnits: BIG } : undefined), describe: (pl) => ({ metrics: { draws: pl.header.draws.length } }),
        });
      }
    } else rec.skip("gl-plan-serialize", "serializePlan", "no plan");
    list = undefined;
  } else {
    for (const [id, label] of [["display-list-serialize", "serializeDisplayList"], ["canvas-stream", "recordCanvasCalls"], ["gl-plan", "planGl"], ["gl-plan-serialize", "serializePlan"]] as const) rec.skip(id, label, "no display list");
  }
  if (o.artifactDir) writeFileSync(join(o.artifactDir, "meta.json"), JSON.stringify({ shape: o.shape, size: o.size.name, nodes: w.nodeCount, edges: w.edges, width: VIEW.width, height: VIEW.height }));

  // ---- accessibility companion ----
  const tree = await stage({
    id: "companion-tree", label: "buildCompanionTree (window auto: 200 items, or all up to 500)", plan: heavy,
    run: (p) => buildCompanionTree(model, state, p === "raised" ? RAISED.tree : undefined),
    describe: (t) => ({ outputBytes: serializeCompanionTree(t).length, metrics: { items: t.items.length, setSize: t.list.set_size } }),
  });
  if (tree) {
    await stage({
      id: "companion-plan", label: "planCompanionUpdate (full build ops)", plan: heavy, run: () => planCompanionUpdate(undefined, tree),
      describe: (ops) => ({ outputBytes: serializeCompanionPlan(ops).length, metrics: { ops: ops.length } }),
    });
    await stage({
      id: "companion-gate", label: "runAccessibilityGate (listed checks, companion composition)", plan: heavy,
      run: () => runAccessibilityGate({ model, state, tree, fidelity: { motion: "none" }, reducedMotion: true }),
      describe: (g) => ({ metrics: { verdict: g.verdict, checks: g.checks.length } }),
    });
  } else { rec.skip("companion-plan", "planCompanionUpdate", "no tree"); rec.skip("companion-gate", "runAccessibilityGate", "no tree"); }
  if (w.nodeCount <= 20_000) {
    await stage({
      id: "companion-tree-all", label: "buildCompanionTree with window all (every element an item)", plan: veryHeavy,
      run: (p) => buildCompanionTree(model, state, { window: "all", ...(p === "raised" ? RAISED.tree : {}) }),
      describe: (t) => ({ outputBytes: serializeCompanionTree(t).length, metrics: { items: t.items.length } }),
    });
  } else rec.skip("companion-tree-all", "buildCompanionTree window all", "not attempted above 20,000 nodes (hundreds of thousands of items)");

  // ---- export, headless ----
  const bundle = await stage({
    id: "export-bundle", label: "exportBundle (layout, scene, state, SVG, hashes, manifest)", plan: veryHeavy, noRaise: false,
    run: (p) => exportBundle(model, state, layoutBytes, p === "raised" ? { limits: RAISED.exportLimits } : undefined),
    describe: (b) => ({ outputBytes: [...b.files.values()].reduce((s, f) => s + f.length, 0) + b.manifestBytes.length, metrics: { files: b.files.size } }),
  });
  if (!bundle) {
    await stage({
      id: "export-bundle-nosvg", label: "exportBundle with svg: false", plan: veryHeavy,
      run: (p) => exportBundle(model, state, layoutBytes, { svg: false, ...(p === "raised" ? { limits: RAISED.exportLimits } : {}) }),
      describe: (b) => ({ outputBytes: [...b.files.values()].reduce((s, f) => s + f.length, 0) + b.manifestBytes.length, metrics: { files: b.files.size } }),
    });
  } else {
    await stage({ id: "export-verify", label: "verifyExportBundle (hashes, model rebuild, SVG re-render)", plan: veryHeavy, noRaise: true, run: () => verifyExportBundle(bundle.files, bundle.manifestBytes) });
  }
  await stage({
    id: "headless", label: "renderHeadless (state, svg, display-list, canvas-stream, readout, tree)", plan: veryHeavy,
    run: (p) => renderHeadless({ sceneBytes, layoutBytes, size: VIEW, outputs: ["state", "svg", "display-list", "canvas-stream", "readout", "tree"], ...(p === "raised" ? { limits: RAISED.render, svg: RAISED.svg } : {}) }),
    describe: (r) => ({ outputBytes: [...r.files.values()].reduce((s, f) => s + f.length, 0), metrics: { files: r.files.size } }),
  });

  // ---- reducer, hit test, gesture machine ----
  const rng = createRng(o.seed + 99);
  const points = Array.from({ length: o.ops }, () => ({ x: rng.next() * VIEW.width, y: rng.next() * VIEW.height }));
  const pick = Math.max(1, Math.floor(w.nodeCount / 100));
  const hideTargets = model.nodes.filter((_, i) => i % pick === 0).map((n) => ({ node: n.ref }));
  const ioPlan: Partial<RunPlan> = { warmup: 1, reps: Math.min(o.plan.reps, 5), budgetMs: 20_000 };
  await stage({ id: "hit-test", label: "hitTest at a pointer position (mean of a batch)", ops: o.ops, plan: ioPlan, run: () => { let hits = 0; for (const p of points) if (hitTest(model, state, p) !== undefined) hits++; return hits; } });
  const reduceOnce = (intent: Intent, lim = limitsOpt): SemanticState => reduce(model, state, intent, lim).state;
  await stage({ id: "reduce-pan", label: "reduce: pan", ops: o.ops, plan: ioPlan, run: () => { let s = state; for (let i = 0; i < o.ops; i++) s = reduce(model, s, { type: "pan", dx: 3, dy: 2 }, limitsOpt).state; return s; } });
  await stage({ id: "reduce-focus-step", label: "reduce: focus-step", ops: o.ops, plan: ioPlan, run: () => { let s = state; for (let i = 0; i < o.ops; i++) s = reduce(model, s, { type: "focus-step", delta: 1 }, limitsOpt).state; return s; } });
  await stage({ id: "reduce-fit", label: "reduce: fit", ops: 1, plan: ioPlan, run: () => reduceOnce({ type: "fit" }) });
  await stage({
    id: "reduce-hide-1pct", label: "reduce: set-hidden over 1 % of the nodes (cascade to incident edges)", ops: 1, plan: ioPlan, run: () => reduceOnce({ type: "set-hidden", targets: hideTargets, hidden: true }),
    describe: (st) => ({ metrics: { targets: hideTargets.length, stateBytes: serializeState(model, st).length } }),
  });
  const xy = (v: number): number => Math.round(v * 1000);
  const empty = { x: xy(2), y: xy(2) };
  await stage({
    id: "step-pointermove", label: "step: pointermove during a pan gesture (state fixed)", ops: o.ops + 1, plan: ioPlan,
    run: () => {
      let m: MachineState = createMachine();
      m = step(m, { type: "pointerdown", t: 0, id: 1, ptype: "mouse", button: 0, x: empty.x, y: empty.y, mods: 0 }, model, state).machine;
      for (let i = 1; i <= o.ops; i++) m = step(m, { type: "pointermove", t: i * 8, id: 1, x: empty.x + i * 3000, y: empty.y + i * 2000, mods: 0 }, model, state).machine;
      return m;
    },
  });
  await stage({
    id: "step-wheel", label: "step: wheel notch (state fixed)", ops: o.ops, plan: ioPlan,
    run: () => { let m: MachineState = createMachine(); for (let i = 0; i < o.ops; i++) m = step(m, { type: "wheel", t: i * 16, x: xy(640), y: xy(400), dy: -100_000, unit: 0, mods: 0 }, model, state).machine; return m; },
  });
  await stage({
    id: "step-key", label: "step: ArrowRight (graph navigation, state fixed)", ops: o.ops, plan: ioPlan,
    run: () => { let m: MachineState = createMachine(); for (let i = 0; i < o.ops; i++) m = step(m, { type: "key", t: i * 16, key: "ArrowRight", mods: 0 }, model, state).machine; return m; },
  });
  await stage({
    id: "loop-key", label: "event loop: ArrowRight through step, then the intents through reduce (state evolves)", ops: o.ops, plan: ioPlan,
    run: () => {
      let m: MachineState = createMachine(), s = state;
      for (let i = 0; i < o.ops; i++) {
        const r = step(m, { type: "key", t: i * 16, key: "ArrowRight", mods: 0 }, model, s);
        m = r.machine;
        for (const out of r.outputs as Output[]) if (out.kind === "intent") s = reduce(model, s, out.intent, limitsOpt).state;
      }
      return s;
    },
  });

  // ---- V8 LOD aggregate ----
  const sceneSha = compiled.sceneSha256, layoutSha = laid.layoutSha256;
  const rules: RuleSpec[] = o.shape === "groups" ? [{ rule: "components/1", min_size: 10 }] : [{ rule: "pendant-fold/1", min_leaves: 2 }];
  const budget = (p: Profile): { budget?: { maxNodes: number; maxEdges: number; maxWork: number } } => (p === "raised" ? { budget: RAISED.lod } : {});
  const flat = emptyState({ sceneSha256: sceneSha, layoutSha256: layoutSha, label_policy: { full_degree: 5, full_zoom_milli: 2000, short_degree: 3, short_zoom_milli: 1000 }, zoom_milli: 1000 });
  const flatBytes = serializeLODState(flat);
  await stage({
    id: "lod-view-flat", label: "deriveView with no collapsed group (label levels only)", plan: heavy, run: (p) => deriveView(sceneBytes, layoutBytes, flatBytes, budget(p)),
    describe: (v) => ({ outputBytes: v.viewBytes.length, metrics: { nodes: v.view.nodes.length, edges: v.view.edges.length } }),
  });
  const catalog = await stage({
    id: "lod-suggest", label: `suggestGroups (${rules[0]!.rule})`, plan: heavy, run: (p) => suggestGroups(sceneBytes, rules, budget(p)),
    describe: (c) => ({ metrics: { groups: c.groups.length, members: c.groups.reduce((s, g) => s + g.members.length, 0) } }),
  });
  if (catalog) {
    const collapsedBytes = serializeLODState(replaceGroups(flat, catalog.groups));
    await stage({
      id: "lod-view-collapsed", label: "deriveView with the suggested groups collapsed (aggregate view)", plan: heavy, run: (p) => deriveView(sceneBytes, layoutBytes, collapsedBytes, budget(p)),
      describe: (v) => ({ outputBytes: v.viewBytes.length, metrics: { nodes: v.view.nodes.length, aggregates: v.view.aggregates.length, aggregateEdges: v.view.aggregate_edges.length, edges: v.view.edges.length } }),
    });
  } else rec.skip("lod-view-collapsed", "deriveView collapsed", "no group catalog");

  // ---- V3 stable layout (two ordinary scene versions; not a delta) ----
  const grow = Math.max(1, Math.round(w.nodeCount / 100));
  const nextCompiled = await compileScene(growSource(w, grow, o.seed + 5), "ison-v1");
  const prev = { sceneBytes, layoutBytes };
  const sb = (p: Profile): { budget?: typeof RAISED.stable } => (p === "raised" ? { budget: RAISED.stable } : {});
  await stage({
    id: "stable-diff", label: "diffScenes (previous, next)", plan: heavy, run: (p) => diffScenes(sceneBytes, nextCompiled.sceneBytes, sb(p)),
    describe: (d) => ({ metrics: { nodesAdded: d.nodes.added.length, edgesAdded: d.edges.added.length } }),
  });
  await stage({
    id: "stable-update", label: `computeStableLayout, incremental (+${grow} nodes, one edge each)`, plan: heavy,
    run: (p) => computeStableLayout(prev, nextCompiled.sceneBytes, { placement: RECOMMENDED_PLACEMENT, ...sb(p) }),
    describe: (r) => ({ outputBytes: r.layout.layoutBytes.length, metrics: { mode: r.mode, work: r.stats.work, placed: r.stats.placed, waves: r.stats.waves, reportBytes: r.reportBytes.length } }),
  });
  await stage({
    id: "stable-cold", label: "computeStableLayout, cold start (FORCE, default budget)", noRaise: true, plan: { warmup: 1, reps: 3, budgetMs: 40_000 },
    run: () => computeStableLayout(null, sceneBytes, { coldStart: forceCfg }),
    describe: (r) => ({ outputBytes: r.layout.layoutBytes.length, metrics: { mode: r.mode } }),
  });
  return done();
}
