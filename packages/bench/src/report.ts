// src/report.ts - the report: JSON structure, Markdown rendering, the writer, and the marker-based injection used for the committed RESULTS.md. Pure functions over data;
// every number printed comes from the report object, nothing is typed in by hand.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserReport } from "./browser.js";
import type { EnvInfo } from "./env.js";
import type { RunPlan, StageRecord } from "./harness.js";
import type { WorkloadResult } from "./pipeline.js";
import { fmtBytes, fmtMs, type Summary } from "./stats.js";
import type { Shape, SizeSpec } from "./workloads.js";

export const REPORT_FORMAT = "isongraph-visualize-bench/1";

export interface RunConfig {
  sizes: SizeSpec[];
  shapes: Shape[];
  seed: number;
  plans: Record<string, RunPlan>;
  ops: number;
  heapMb: number;
  stageBudgetS: number;
  browser: boolean;
  smoke: boolean;
  workerTimeoutMin: number;
}
export interface WorkerFailure { shape: Shape; size: string; nodes: number; failed: true; reason: string; wallSeconds: number }
export type WorkloadEntry = WorkloadResult | WorkerFailure;
export const isFailure = (e: WorkloadEntry): e is WorkerFailure => (e as WorkerFailure).failed === true;

export interface CompileProbePoint { edges: number; nodes: number; outcome: string; ms?: number }
export interface ForceProbePoint { nodes: number; edges: number; iterations: number; estimatedWork: number; outcome: string; ms?: Summary; error?: string }

export interface LimitRow {
  id: string;
  package: string;
  name: string;
  value: string;
  design: string;
  evidence: string;
  recommendation: "keep" | "raise" | "lower" | "needs more data";
  proposal: string;
}
export interface SelectionRow { elements: string; renderer: string; basis: string; data: string }
export interface SelectionProposal { assumptions: string[]; rows: SelectionRow[]; notes: string[] }

export interface Report {
  report: typeof REPORT_FORMAT;
  generatedAt: string;
  totalSeconds: number;
  env: EnvInfo;
  config: RunConfig;
  workloads: WorkloadEntry[];
  forceProbe?: ForceProbePoint[];
  compileProbe?: CompileProbePoint[];
  browser?: BrowserReport;
  limits: LimitRow[];
  selection: SelectionProposal;
  caveats: string[];
}

export const CAVEATS: readonly string[] = [
  "One machine, one run: every figure is noisy and applies to this machine, this Node version and this Chromium only.",
  "This is a measurement, not a qualification and not a conformance claim; no threshold is asserted anywhere.",
  "Stages marked * ran with per-call limits raised because the package default refused; the refusal is recorded beside it. No default was changed.",
  "RSS growth is read from the operating system around each call and is coarse (the allocator may keep or return pages); read it as an order of magnitude.",
  "Medians are of the measured repetitions only; a single-repetition cell (XL) is a cold run including JIT warm-up.",
  "The workloads are synthetic seeded generators, directed graphs only; they are not downstream fixtures and no delta workload is included (V9 and V13 are blocked).",
];

export const findWorkload = (r: Report, shape: string, size: string): WorkloadResult | undefined =>
  r.workloads.find((w): w is WorkloadResult => !isFailure(w) && w.shape === shape && w.size === size);
export const findStage = (w: WorkloadResult | undefined, id: string): StageRecord | undefined => w?.stages.find((s) => s.id === id);

/** One table cell for a stage: the median in ms, `*` for a raised-limits run, `refused CODE`, `failed`, or a dash. */
export function cell(s: StageRecord | undefined): string {
  if (s === undefined) return "-";
  if (s.outcome === "skipped") return "skipped";
  if (s.outcome === "refused") return `refused ${s.error?.reason ?? s.error?.code ?? ""}`.trim();
  if (s.outcome === "failed") return `failed ${s.error?.code ?? ""}`.trim();
  return `${fmtMs(s.ms!.median)}${s.profile === "raised" ? "*" : ""}`;
}
export const sizeCell = (s: StageRecord | undefined): string => (s?.outcome === "ok" && s.outputBytes !== undefined ? fmtBytes(s.outputBytes) : s?.outcome === "ok" ? "-" : cell(s));

const table = (head: string[], rows: string[][]): string => {
  const line = (r: string[]): string => `| ${r.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n");
};

const TIME_COLUMNS: [string, string][] = [
  ["scene-build", "scene build"], ["scene-verify", "scene verify"], ["layout-fixed", "layout FIXED"], ["layout-bind", "layout bind"], ["render-model", "render model"],
  ["svg", "SVG string"], ["display-list", "display list"], ["canvas-stream", "Canvas stream"], ["gl-plan", "GL plan"], ["companion-tree", "companion tree"],
  ["companion-gate", "a11y gate"], ["export-bundle", "export bundle"], ["headless", "headless"],
];
const INTERACTION_COLUMNS: [string, string][] = [
  ["hit-test", "hitTest"], ["reduce-pan", "reduce pan"], ["reduce-fit", "reduce fit"], ["reduce-hide-1pct", "reduce hide 1 %"], ["step-pointermove", "step pointermove"],
  ["step-wheel", "step wheel"], ["step-key", "step key"], ["loop-key", "key loop"],
];
const SIDE_COLUMNS: [string, string][] = [
  ["lod-view-flat", "LOD flat"], ["lod-suggest", "LOD suggest"], ["lod-view-collapsed", "LOD collapsed"], ["stable-diff", "diffScenes"], ["stable-update", "stable update"], ["layout-force", "FORCE layout"],
];
const SIZE_COLUMNS: [string, string][] = [
  ["scene-build", "scene"], ["layout-fixed", "layout"], ["svg", "SVG"], ["display-list-serialize", "display list"], ["canvas-stream", "Canvas stream"], ["gl-plan", "GL buffers"],
  ["companion-tree", "tree"], ["export-bundle", "bundle"],
];

const sizesPresent = (r: Report): string[] => [...new Set(r.workloads.map((w) => w.size))];
const shapesPresent = (r: Report, size: string): WorkloadEntry[] => r.workloads.filter((w) => w.size === size);

function timeTable(r: Report, size: string, cols: [string, string][]): string {
  const rows = shapesPresent(r, size).map((w) => {
    if (isFailure(w)) return [w.shape, `worker failed: ${w.reason}`, ...cols.slice(1).map(() => "")];
    return [w.shape, ...cols.map(([id]) => cell(findStage(w, id)))];
  });
  return table(["shape", ...cols.map(([, l]) => l)], rows);
}

function sizeTable(r: Report, size: string): string {
  const rows = shapesPresent(r, size).map((w) => {
    if (isFailure(w)) return [w.shape, "", "", ...SIZE_COLUMNS.map(() => ""), ""];
    return [w.shape, String(w.nodes), String(w.edges), ...SIZE_COLUMNS.map(([id]) => sizeCell(findStage(w, id))), `${w.peakRssMb.toFixed(0)} MiB`];
  });
  return table(["shape", "nodes", "edges", ...SIZE_COLUMNS.map(([, l]) => l), "peak RSS"], rows);
}

function refusalList(r: Report): string[] {
  const out: string[] = [];
  for (const w of r.workloads) {
    if (isFailure(w)) { out.push(`- ${w.shape}/${w.size}: the worker process failed: ${w.reason}`); continue; }
    for (const s of w.stages) {
      if (s.defaultOutcome) out.push(`- ${w.shape}/${w.size} \`${s.id}\`: default limits refused (${s.defaultOutcome.code}/${s.defaultOutcome.reason ?? ""}); ${s.outcome === "ok" ? "measured with raised per-call limits" : `still ${s.outcome} with raised limits (${s.error?.code}/${s.error?.reason ?? ""})`}`);
      else if (s.outcome === "refused") out.push(`- ${w.shape}/${w.size} \`${s.id}\`: refused (${s.error?.code}/${s.error?.reason ?? ""}) ${s.error?.message.split("|").slice(2).join("|").trim() ?? ""}`.trimEnd());
      else if (s.outcome === "failed") out.push(`- ${w.shape}/${w.size} \`${s.id}\`: FAILED (${s.error?.code}) ${s.error?.message ?? ""}`);
    }
  }
  return out;
}

export function browserSection(b: BrowserReport): string {
  const parts: string[] = [`Chromium ${b.version} (headless, ${b.viewport.width}x${b.viewport.height}, device pixel ratio 1), ${b.reps} repetitions after ${b.warmup} warmup. ${b.notes.join(" ")}`];
  for (const p of b.profiles) {
    const gl = `${p.gl.renderer ?? "no WebGL2"}${p.gl.software === null ? "" : p.gl.software ? " (SOFTWARE rendering)" : " (hardware GPU)"}`;
    parts.push(`### Browser profile \`${p.name}\`: GL ${gl}`);
    const rows = p.cases.map((c) => [
      `${c.shape}/${c.size}`, `${c.nodes + c.edges}`,
      c.svg?.insertMs ? fmtMs(c.svg.insertMs.median) : c.errors.find((e) => e.renderer === "svg") ? "failed" : "-",
      c.svg?.toFrameMs ? fmtMs(c.svg.toFrameMs.median) : "-",
      c.svgElements !== undefined ? String(c.svgElements) : "-",
      c.canvas?.replayMs ? fmtMs(c.canvas.replayMs.median) : c.errors.find((e) => e.renderer === "canvas") ? "failed" : "-",
      c.canvas?.syncMs ? fmtMs(c.canvas.syncMs.median) : "-",
      c.webgl?.issueMs ? fmtMs(c.webgl.issueMs.median) : c.errors.find((e) => e.renderer === "webgl") ? "failed" : "-",
      c.webgl?.syncMs ? fmtMs(c.webgl.syncMs.median) : "-",
      c.webgl?.labelsMs ? fmtMs(c.webgl.labelsMs.median) : "-",
    ]);
    parts.push(table(["workload", "elements", "SVG insert+layout", "SVG to frame", "SVG DOM nodes", "Canvas replay (JS)", "Canvas replay+flush", "WebGL issue (JS)", "WebGL draw+sync", "WebGL label layer"], rows));
    for (const c of p.cases) for (const e of c.errors) parts.push(`- ${c.shape}/${c.size} ${e.renderer}: ${e.message}`);
  }
  return parts.join("\n\n");
}

export function limitsTable(rows: readonly LimitRow[]): string {
  return table(["limit or constant", "package", "value", "design", "measured evidence", "recommendation", "proposal (no limit changed)"],
    rows.map((l) => [l.name, l.package, l.value, l.design, l.evidence, l.recommendation, l.proposal]));
}
export function selectionTable(s: SelectionProposal): string {
  return [
    ...s.assumptions.map((a) => `- Assumption: ${a}`), "",
    table(["elements (nodes + edges)", "renderer", "basis", "data behind it"], s.rows.map((r) => [r.elements, r.renderer, r.basis, r.data])),
    "", ...s.notes.map((n) => `- ${n}`),
  ].join("\n");
}

/** The headline tables (environment, medians per size, output sizes, refusals) - the part that RESULTS.md embeds between markers. */
export function headlineMarkdown(r: Report): string {
  const e = r.env;
  const b = r.browser;
  const envLines = [
    `- CPU: ${e.cpuModel}, ${e.logicalCores} logical cores; RAM ${e.ramGiB} GiB; OS ${e.os} ${e.osRelease} ${e.arch}`,
    `- Node ${e.node} (V8 ${e.v8}); heap limit per worker ${r.config.heapMb} MiB`,
    b ? `- Chromium ${b.version}; GL profiles: ${b.profiles.map((p) => `${p.name} = ${p.gl.renderer ?? "none"} (${p.gl.software === null ? "unknown" : p.gl.software ? "software" : "hardware"})`).join("; ")}` : "- Chromium: not run in this report",
    `- Seed ${r.config.seed}; sizes ${r.config.sizes.map((s) => `${s.name}=${s.nodes}`).join(", ")}; shapes ${r.config.shapes.join(", ")}`,
    `- Repetitions (warmup + measured): ${Object.entries(r.config.plans).map(([k, p]) => `${k} ${p.warmup}+${p.reps}`).join(", ")}; per-stage time budget ${r.config.stageBudgetS} s; run took ${Math.round(r.totalSeconds)} s`,
  ].join("\n");
  const sections: string[] = [envLines];
  for (const size of sizesPresent(r)) {
    const spec = r.config.sizes.find((s) => s.name === size);
    sections.push(`### Size ${size} (${spec?.nodes ?? "?"} nodes): pipeline medians, ms\n\n${timeTable(r, size, TIME_COLUMNS)}`);
    sections.push(`Interaction and side stages, ms (interaction stages are per call):\n\n${timeTable(r, size, [...INTERACTION_COLUMNS, ...SIDE_COLUMNS])}`);
    sections.push(`Output sizes and peak process RSS:\n\n${sizeTable(r, size)}`);
  }
  const refusals = refusalList(r);
  sections.push(`### Refusals and failures\n\n${refusals.length === 0 ? "None." : refusals.join("\n")}`);
  return sections.join("\n\n");
}

/** Refusals and failures grouped by stage and reason, sizes listed once: the compact form for RESULTS.md. */
export function refusalGroups(r: Report): string[] {
  const groups = new Map<string, Map<string, Set<string>>>();
  const add = (key: string, size: string, shape: string): void => {
    if (!groups.has(key)) groups.set(key, new Map());
    const g = groups.get(key)!;
    if (!g.has(size)) g.set(size, new Set());
    g.get(size)!.add(shape);
  };
  const lines: string[] = [];
  for (const w of r.workloads) {
    if (isFailure(w)) { lines.push(`- ${w.shape}/${w.size}: the worker process failed: ${w.reason}`); continue; }
    for (const s of w.stages) {
      if (s.defaultOutcome) add(`\`${s.id}\`: default refused ${s.defaultOutcome.code}/${s.defaultOutcome.reason ?? ""}; ${s.outcome === "ok" ? "measured with raised per-call limits" : `still ${s.outcome} when raised (${s.error?.code}/${s.error?.reason ?? ""})`}`, w.size, w.shape);
      else if (s.outcome === "refused") add(`\`${s.id}\`: refused ${s.error?.code}/${s.error?.reason ?? ""} (no raised run)`, w.size, w.shape);
      else if (s.outcome === "failed") add(`\`${s.id}\`: FAILED ${s.error?.code}: ${s.error?.message ?? ""}`, w.size, w.shape);
    }
  }
  for (const [key, bySz] of groups) lines.push(`- ${key} at ${[...bySz.entries()].map(([sz, shapes]) => `${sz} (${shapes.size === r.config.shapes.length ? "all shapes" : [...shapes].join(", ")})`).join("; ")}`);
  return lines;
}

const COMPACT_COLUMNS: [string, string][] = [
  ["scene-build", "scene build"], ["layout-bind", "layout bind"], ["render-model", "render model"], ["svg", "SVG string"], ["display-list", "display list"], ["canvas-stream", "Canvas stream"],
  ["gl-plan", "GL plan"], ["companion-tree", "tree"], ["export-bundle", "export"], ["hit-test", "hitTest/call"], ["step-key", "step key/call"], ["lod-view-collapsed", "LOD view"], ["stable-update", "stable update"],
];

export function environmentMarkdown(r: Report): string {
  const e = r.env, b = r.browser;
  return [
    `- CPU: ${e.cpuModel}, ${e.logicalCores} logical cores; RAM ${e.ramGiB} GiB; OS ${e.os} ${e.osRelease} ${e.arch}`,
    `- Node ${e.node} (V8 ${e.v8}); heap limit per worker ${r.config.heapMb} MiB`,
    b ? `- Chromium ${b.version} headless; GL profiles: ${b.profiles.map((p) => `\`${p.name}\` = ${p.gl.renderer ?? "none"} (${p.gl.software === null ? "unknown" : p.gl.software ? "software rendering" : "hardware GPU"})`).join("; ")}` : "- Chromium: not run in this report",
    `- Seed ${r.config.seed}; sizes ${r.config.sizes.map((s) => `${s.name} = ${s.nodes} nodes`).join(", ")}; shapes ${r.config.shapes.join(", ")}`,
    `- Repetitions (warmup + measured): ${Object.entries(r.config.plans).map(([k, p]) => `${k} ${p.warmup}+${p.reps}`).join(", ")}; per-stage time budget ${r.config.stageBudgetS} s; the run took ${Math.round(r.totalSeconds)} s`,
  ].join("\n");
}

/** The medians per size for the stages that matter, plus the output sizes: the compact tables of RESULTS.md. */
export function compactMarkdown(r: Report): string {
  const parts: string[] = [];
  for (const size of sizesPresent(r)) {
    const spec = r.config.sizes.find((x) => x.name === size);
    parts.push(`#### ${size} (${spec?.nodes ?? "?"} nodes): medians, ms (\`*\` = raised per-call limits)

${timeTable(r, size, COMPACT_COLUMNS)}`);
    parts.push(`Output sizes and process peak RSS:

${sizeTable(r, size)}`);
  }
  const refusals = refusalGroups(r);
  parts.push(`#### Refusals and failures

${refusals.length === 0 ? "None." : refusals.join("\n")}`);
  return parts.join("\n\n");
}

export function forceProbeMarkdown(points: readonly ForceProbePoint[]): string {
  return table(["nodes", "edges", "iterations", "estimated work units", "outcome", "median ms", "ms per million units"],
    points.map((p) => [String(p.nodes), String(p.edges), String(p.iterations), String(p.estimatedWork), p.outcome, p.ms ? fmtMs(p.ms.median) : "-", p.ms ? fmtMs(p.ms.median / (p.estimatedWork / 1e6)) : "-"]));
}

export function compileProbeMarkdown(points: readonly CompileProbePoint[]): string {
  return table(["nodes", "edges in one relation", "outcome", "ms"], points.map((p) => [String(p.nodes), String(p.edges), p.outcome, p.ms === undefined ? "-" : fmtMs(p.ms)]));
}

export function renderMarkdown(r: Report): string {
  const parts: string[] = [
    `# ISONGraphVisualize benchmark report (${REPORT_FORMAT})`,
    `Generated ${r.generatedAt}. ${r.caveats.map((c) => `${c}`).join(" ")}`,
    "## Environment and measurements", headlineMarkdown(r),
  ];
  if (r.forceProbe && r.forceProbe.length > 0) parts.push("## FORCE budget probe (real family, within its documented budget)", forceProbeMarkdown(r.forceProbe));
  if (r.compileProbe && r.compileProbe.length > 0) parts.push("## compileScene edge-list probe (one relation)", compileProbeMarkdown(r.compileProbe));
  if (r.browser) parts.push("## Browser mode", browserSection(r.browser));
  parts.push("## Limits and constants: evidence and recommendations (no limit was changed)", limitsTable(r.limits));
  parts.push("## Renderer auto-selection: proposal", selectionTable(r.selection));
  parts.push("## Stage detail (every stage, every workload)");
  for (const w of r.workloads) {
    if (isFailure(w)) { parts.push(`### ${w.shape}/${w.size}\n\nWorker failed: ${w.reason}`); continue; }
    const rows = w.stages.map((s) => [
      s.id, s.outcome + (s.profile === "raised" ? " (raised)" : ""), s.ms ? fmtMs(s.ms.median) : "-", s.ms ? fmtMs(s.ms.p95) : "-", s.ms ? fmtMs(s.ms.min) : "-", s.ms ? fmtMs(s.ms.max) : "-",
      s.reps !== undefined ? `${s.warmup}+${s.reps}` : "-", s.rssDeltaMb ? s.rssDeltaMb.median.toFixed(1) : "-", s.outputBytes !== undefined ? fmtBytes(s.outputBytes) : "-",
      s.metrics ? Object.entries(s.metrics).map(([k, v]) => `${k}=${String(v)}`).join(" ") : (s.note ?? ""),
    ]);
    parts.push(`### ${w.shape}/${w.size}: ${w.nodes} nodes, ${w.edges} edges, peak RSS ${w.peakRssMb.toFixed(0)} MiB, ${w.wallSeconds.toFixed(1)} s\n\n${table(["stage", "outcome", "median ms", "p95", "min", "max", "warmup+reps", "RSS delta MiB (median)", "output", "metrics"], rows)}`);
  }
  return `${parts.join("\n\n")}\n`;
}

export function writeReport(r: Report, dir: string): { jsonPath: string; mdPath: string } {
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, "report.json"), mdPath = join(dir, "report.md");
  writeFileSync(jsonPath, `${JSON.stringify(r, null, 1)}\n`);
  writeFileSync(mdPath, renderMarkdown(r));
  return { jsonPath, mdPath };
}

/** Replaces what lies between `<!-- BEGIN GENERATED id -->` and `<!-- END GENERATED id -->` (the markers stay). Throws when a marker is missing or out of order. */
export function injectGenerated(doc: string, id: string, content: string): string {
  const begin = `<!-- BEGIN GENERATED ${id} -->`, end = `<!-- END GENERATED ${id} -->`;
  const a = doc.indexOf(begin), b = doc.indexOf(end);
  if (a < 0 || b < 0 || b < a) throw new Error(`markers for ${id} are missing or out of order`);
  return `${doc.slice(0, a + begin.length)}\n${content.replace(/\n+$/, "")}\n${doc.slice(b)}`;
}
