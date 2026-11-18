// src/derive.ts - the derived tables of a report: the evidence for every provisional limit or constant named in designs 27-32, with a recommendation, and the
// renderer auto-selection proposal. Computed from the measurements only; every figure in an evidence cell is read from the report, the recommendation is a rule over those
// figures (the rule is stated in the cell). NOTHING here changes a limit: a proposal is text. The reference budgets below are assumptions of this report, not requirements.
import type { StageRecord } from "./harness.js";
import type { WorkloadResult } from "./pipeline.js";
import { isFailure, type LimitRow, type Report, type SelectionProposal, type SelectionRow } from "./report.js";
import { fmtBytes, fmtMs } from "./stats.js";

/** Reference budgets used by the rules (assumptions, stated in the report): one display frame at 60 Hz, a command that still feels immediate, a wait the user notices. */
export const FRAME_MS = 16.7;
export const RESPONSIVE_MS = 100;
export const WAIT_MS = 1000;
const MIB = 1024 * 1024;

export interface Pt { shape: string; size: string; nodes: number; edges: number; w: WorkloadResult; rec: StageRecord }
const works = (r: Report): WorkloadResult[] => r.workloads.filter((w): w is WorkloadResult => !isFailure(w));
export const stageOf = (w: WorkloadResult, id: string): StageRecord | undefined => w.stages.find((s) => s.id === id);
/** Every workload whose stage `id` has figures (outcome ok), in report order. */
export function okPts(r: Report, id: string): Pt[] {
  const out: Pt[] = [];
  for (const w of works(r)) { const rec = stageOf(w, id); if (rec?.outcome === "ok" && rec.ms) out.push({ shape: w.shape, size: w.size, nodes: w.nodes, edges: w.edges, w, rec }); }
  return out;
}
const med = (p: Pt): number => p.rec.ms!.median;
const loc = (p: Pt): string => `${p.shape}/${p.size}`;
const el = (p: Pt): number => p.nodes + p.edges;
const worst = (ps: Pt[]): Pt | undefined => ps.reduce<Pt | undefined>((a, p) => (a === undefined || med(p) > med(a) ? p : a), undefined);
const best = (ps: Pt[]): Pt | undefined => ps.reduce<Pt | undefined>((a, p) => (a === undefined || med(p) < med(a) ? p : a), undefined);
const bySize = (ps: Pt[], size: string): Pt[] => ps.filter((p) => p.size === size);
const sizesByNodes = (r: Report): string[] => { const m = new Map<string, number>(); for (const w of works(r)) m.set(w.size, w.nodes); return [...m.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k); };
const maxNodesOf = (ps: Pt[]): number => ps.reduce((a, p) => Math.max(a, p.nodes), 0);
const ms = (x: number): string => `${fmtMs(x)} ms`;
const num = (n: number): string => n.toLocaleString("en-US");
const NEED: Pick<LimitRow, "recommendation"> = { recommendation: "needs more data" };

/** Per size, the slowest shape: `[size, point]` in ascending size order. */
function worstPerSize(r: Report, id: string): { size: string; p: Pt }[] {
  const ps = okPts(r, id);
  return sizesByNodes(r).flatMap((size) => { const w = worst(bySize(ps, size)); return w ? [{ size, p: w }] : []; });
}
/** The measured bracket where a (worst-shape) median crosses `target`: the largest size at or under it and the smallest size over it. No extrapolation. */
function bracket(r: Report, id: string, target: number): string {
  const series = worstPerSize(r, id);
  if (series.length === 0) return "not measured";
  const under = series.filter((s) => med(s.p) <= target), over = series.filter((s) => med(s.p) > target);
  if (over.length === 0) return `at or under ${ms(target)} at every size measured (largest ${num(series[series.length - 1]!.p.nodes)} nodes)`;
  if (under.length === 0) return `over ${ms(target)} already at the smallest size measured (${num(series[0]!.p.nodes)} nodes)`;
  return `at or under ${ms(target)} up to ${num(under[under.length - 1]!.p.nodes)} nodes, over it from ${num(over[0]!.p.nodes)} nodes`;
}
const series = (r: Report, id: string): string => {
  const s = worstPerSize(r, id);
  return s.length === 0 ? "not measured" : s.map((x) => `${x.size} ${ms(med(x.p))}${x.p.rec.profile === "raised" ? "*" : ""}`).join(", ");
};
const defaultRefusals = (r: Report, id: string): { w: WorkloadResult; rec: StageRecord }[] =>
  works(r).flatMap((w) => { const rec = stageOf(w, id); return rec !== undefined && (rec.defaultOutcome !== undefined || (rec.outcome === "refused" && rec.profile === "default")) ? [{ w, rec }] : []; });
const refusalSummary = (r: Report, id: string): string => {
  const list = defaultRefusals(r, id);
  if (list.length === 0) return "no default refusal in any run";
  const g = new Map<string, Set<string>>();
  for (const { w, rec } of list) { const k = rec.defaultOutcome ?? rec.error!; const key = `${k.code}/${k.reason ?? ""}`; if (!g.has(key)) g.set(key, new Set()); g.get(key)!.add(w.size); }
  return [...g.entries()].map(([k, sizes]) => `${k} at ${[...sizes].join(", ")}`).join("; ");
};
const metricMax = (r: Report, id: string, key: string): number | undefined => {
  let m: number | undefined;
  for (const p of okPts(r, id)) { const v = p.rec.metrics?.[key]; if (typeof v === "number" && (m === undefined || v > m)) m = v; }
  return m;
};
const outMax = (r: Report, id: string, size?: string): { bytes: number; p: Pt } | undefined => {
  let out: { bytes: number; p: Pt } | undefined;
  for (const p of okPts(r, id)) { if (size !== undefined && p.size !== size) continue; const b = p.rec.outputBytes; if (b !== undefined && (out === undefined || b > out.bytes)) out = { bytes: b, p }; }
  return out;
};
const perElement = (r: Report, id: string): { min: number; max: number } | undefined => {
  let min = Infinity, max = 0;
  for (const p of okPts(r, id)) { const b = p.rec.outputBytes; if (b === undefined || el(p) === 0) continue; const v = b / el(p); min = Math.min(min, v); max = Math.max(max, v); }
  return max === 0 ? undefined : { min, max };
};
const sizeRun = (r: Report): string => sizesByNodes(r).join(", ") || "none";
const noData = (r: Report, what: string): Pick<LimitRow, "evidence" | "recommendation" | "proposal"> => ({ evidence: `${what} was not measured in this run (sizes run: ${sizeRun(r)})`, recommendation: "needs more data", proposal: "Run the full benchmark (npm run bench), which includes the sizes and the browser mode this row needs." });

type Row = (r: Report) => LimitRow;
const row = (base: Pick<LimitRow, "id" | "package" | "name" | "value" | "design">, f: (r: Report) => Pick<LimitRow, "evidence" | "recommendation" | "proposal">): Row => (r) => ({ ...base, ...f(r) });

function browserPoints(r: Report, profile?: number): { elements: number; label: string; c: NonNullable<Report["browser"]>["profiles"][number]["cases"][number] }[] {
  const prof = r.browser?.profiles[profile ?? 0];
  return (prof?.cases ?? []).map((c) => ({ elements: c.nodes + c.edges, label: `${c.shape}/${c.size}`, c }));
}
const maxOf = <T,>(xs: T[], f: (x: T) => number): T | undefined => xs.reduce<T | undefined>((a, x) => (a === undefined || f(x) > f(a) ? x : a), undefined);

const ROWS: Row[] = [
  row({ id: "rc-nodes-edges", package: "renderer-core", name: "maxNodes / maxEdges (RenderLimits)", value: "20,000 / 40,000", design: "27 s15" }, (r) => {
    const rm = okPts(r, "render-model");
    if (rm.length === 0) return noData(r, "buildRenderModel");
    const acc = rm.filter((p) => p.rec.profile === "default");
    const top = maxOf(acc, (p) => p.nodes + p.edges / 1e6);
    const hitMax = worst(okPts(r, "hit-test").filter((p) => p.nodes === maxNodesOf(okPts(r, "hit-test"))));
    const reachedCap = top !== undefined && top.nodes >= 20_000;
    return {
      evidence: `default refusals: ${refusalSummary(r, "render-model")}. Largest accepted under default limits: ${top ? `${loc(top)} (${num(top.nodes)} nodes, ${num(top.edges)} edges) in ${ms(med(top))}` : "none"}. buildRenderModel worst shape per size: ${series(r, "render-model")}. hitTest per call: ${series(r, "hit-test")}.`,
      recommendation: reachedCap ? "keep" : "needs more data",
      proposal: reachedCap
        ? `Keep as safety caps: the whole pipeline ran ${hitMax && hitMax.nodes > 20_000 ? `to ${num(hitMax.nodes)} nodes (raised per-call limits)` : "to the cap"}. Interactivity is the binding concern, not memory: the per-call hitTest worst shape is ${bracket(r, "hit-test", FRAME_MS)}; a host that needs one-frame events above that should hit-test in a worker.`
        : "No run reached the 20,000-node cap with default limits; measure N20000 before ruling.",
    };
  }),
  row({ id: "rc-bytes", package: "renderer-core", name: "maxSceneBytes / maxLayoutBytes", value: "8 MiB / 4 MiB", design: "27 s15" }, (r) => {
    const sb = perElement(r, "scene-build");
    if (!sb || !outMax(r, "layout-fixed")) return noData(r, "scene and layout sizes");
    const capElements = 20_000 + 40_000;
    const sceneAtCaps = sb.max * capElements;
    const layoutPerNode = (() => { let m = 0; for (const w of works(r)) if (w.layoutBytes) m = Math.max(m, w.layoutBytes / w.nodes); return m; })();
    const layoutNeed = layoutPerNode * 20_000;
    const sceneOk = sceneAtCaps <= 8 * MIB, layoutOk = layoutNeed <= 4 * MIB;
    return {
      evidence: `scene bytes per element (node or edge): ${sb.min.toFixed(0)} to ${sb.max.toFixed(0)}; the 20,000 + 40,000 element caps would need up to ${fmtBytes(sceneAtCaps)} against 8 MiB. Layout bytes per node up to ${layoutPerNode.toFixed(0)}: ${fmtBytes(layoutNeed)} at 20,000 nodes against 4 MiB. Default refusals: ${refusalSummary(r, "render-model")}.`,
      recommendation: sceneOk && layoutOk ? "keep" : "raise",
      proposal: sceneOk && layoutOk ? "Keep: the byte caps are consistent with the node and edge caps." : `Raise to what the caps need${sceneOk ? "" : ` (maxSceneBytes about ${fmtBytes(Math.ceil(sceneAtCaps / MIB) * MIB)})`}${layoutOk ? "" : ` (maxLayoutBytes about ${fmtBytes(Math.ceil(layoutNeed / MIB) * MIB)})`}, or lower maxEdges; today the byte cap refuses before the edge cap for edge-heavy scenes.`,
    };
  }),
  row({ id: "rc-labels-targets-state", package: "renderer-core", name: "maxTotalLabelUnits, maxIntentTargets, maxStateBytes", value: "4,194,304 / 60,000 / 8 MiB", design: "27 s15" }, (r) => {
    const hide = okPts(r, "reduce-hide-1pct"), init = okPts(r, "initial-state");
    const p = maxOf(hide.filter((h) => typeof h.rec.metrics?.["stateBytes"] === "number"), (h) => h.nodes);
    if (!p) return noData(r, "state size under a hidden set");
    const t = p.rec.metrics!["targets"] as number, b = p.rec.metrics!["stateBytes"] as number;
    const base = init.find((i) => i.shape === p.shape && i.size === p.size)?.rec.outputBytes ?? 0;
    const per = (b - base) / t;
    const cap = Math.floor((8 * MIB) / per);
    return {
      evidence: `a hidden set of ${num(t)} nodes (${loc(p)}) adds ${per.toFixed(0)} bytes per target to the serialized state (${fmtBytes(base)} to ${fmtBytes(b)}); 8 MiB holds about ${num(cap)} targets, against maxIntentTargets 60,000 (= 20,000 nodes + 40,000 edges). Drawn label units at the largest size: ${metricMax(r, "svg", "labelUnits") ?? "n/a"} (the model's own label total is not a separate stage).`,
      recommendation: cap >= 60_000 ? "keep" : "raise",
      proposal: cap >= 60_000 ? "Keep: a state holding the largest permitted target set fits in maxStateBytes." : `maxStateBytes would have to be about ${fmtBytes(Math.ceil(per * 60_000))} to hold 60,000 targets.`,
    };
  }),
  row({ id: "rc-constants", package: "renderer-core", name: "NODE_HIT_RADIUS_PX 12, EDGE_HIT_TOLERANCE_PX 6, ZOOM_MIN/MAX/DEFAULT, FIT_PADDING_PX 32, VIEWPORT_MAX_PX 16,384", value: "constants", design: "27 s3" }, (r) => ({
    evidence: `These are ergonomic and geometric choices, not performance quantities. What the benchmark can say: hitTest costs ${series(r, "hit-test")} per call (worst shape) with the 12 px / 6 px radii; the pruning margins (13 px / 7 px) keep the cost O(N + E) whatever the radii.`,
    ...NEED, proposal: "No change from performance evidence. Decide the radii and zoom range with a usability pass on real devices (V11 revisit); a larger radius changes no cost class.",
  })),
  row({ id: "force-budget", package: "layout-core", name: "FORCE budget maxNodes / maxWork; per-relation edge cap; key length", value: "2,000 / 100,000,000; 50,000; 1,024 units", design: "IGL-1 s7.3 (code)" }, (r) => {
    const pts = (r.forceProbe ?? []).filter((p) => p.ms !== undefined);
    if (pts.length === 0) return noData(r, "the FORCE probe");
    const rates = pts.map((p) => p.ms!.median / (p.estimatedWork / 1e6));
    const lo = Math.min(...rates), hi = Math.max(...rates);
    const atBudget = pts.reduce((a, p) => (p.estimatedWork > a.estimatedWork ? p : a));
    const projected = (rates.reduce((a, b) => a + b, 0) / rates.length) * 100; // ms for 1e8 units at the mean rate
    const refusals = (r.forceProbe ?? []).filter((p) => p.ms === undefined).map((p) => `${p.nodes} nodes x ${p.iterations}: ${p.outcome}`).join("; ");
    return {
      evidence: `${pts.length} points inside the budget: ${lo.toFixed(2)} to ${hi.toFixed(2)} ms per million work units; the largest (${num(atBudget.nodes)} nodes x ${atBudget.iterations} iterations, ${num(atBudget.estimatedWork)} units) took ${ms(atBudget.ms!.median)}; at the mean rate the full 100,000,000 units would take about ${ms(projected)}. Refused as documented: ${refusals || "none probed"}. At L and XL the default refuses with NODE_LIMIT (${refusalSummary(r, "layout-force")}).`,
      recommendation: projected <= 10_000 ? "keep" : "lower",
      proposal: projected <= 10_000 ? `Keep: the work model tracks wall time within a factor ${(hi / lo).toFixed(1)} across the points and the whole budget costs seconds, not minutes; FORCE above 2,000 nodes stays refused (use FIXED, V3 or a layered layout for large graphs).` : "The budget costs more than 10 s at the measured rate; lower maxWork.",
    };
  }),
  row({ id: "compile-edges", package: "scene-core (through Core 1.4.1)", name: "edges per relation in compileScene (no limit in scene-core); layout-core guards FORCE at MAX_PHYSICAL_EDGES_PER_RELATION 50,000", value: "none; 50,000 for FORCE", design: "IGL-1 s7.1; not in 27-32" }, (r) => {
    const pts = r.compileProbe ?? [];
    if (pts.length === 0) return noData(r, "the compileScene edge-list probe");
    const ok = pts.filter((p) => p.outcome === "ok"), bad = pts.filter((p) => p.outcome !== "ok");
    const topOk = ok.length === 0 ? undefined : Math.max(...ok.map((p) => p.edges)), lowBad = bad.length === 0 ? undefined : Math.min(...bad.map((p) => p.edges));
    return {
      evidence: `compileScene with every edge in ONE relation (${num(pts[0]!.nodes)} nodes): compiled up to ${topOk === undefined ? "none" : num(topOk)} edges; ${lowBad === undefined ? "no failure in the points probed" : `failed from ${num(lowBad)} edges with ${bad[0]!.outcome.replace("failed ", "")}`}. A stack overflow (a RangeError), not a RESOURCE_LIMIT: no code of the contract is returned. The generators of this package split relations at 60,000 edges for that reason.`,
      recommendation: "needs more data",
      proposal: `Proposal, not applied (IGS/1 behaviour is frozen): a guard that refuses with RESOURCE_LIMIT below the overflow${topOk === undefined ? "" : ` (the measured limit is between ${num(topOk)} and ${lowBad === undefined ? "n/a" : num(lowBad)} edges on this Node and stack size, and depends on both)`}, as layout-core already does for FORCE at 50,000. One engine and one stack size were measured; the threshold itself needs the other supported Node version and a second machine.`,
    };
  }),
  row({ id: "stable-budget", package: "stable-layout-core", name: "DEFAULT_STABLE_BUDGET (maxNodes, maxEdges, bytes, maxWork)", value: "20,000 / 100,000 / 16 MiB / 64 MiB report / 50,000,000 work", design: "28 s12" }, (r) => {
    const up = okPts(r, "stable-update");
    if (up.length === 0) return noData(r, "computeStableLayout");
    const dRef = defaultRefusals(r, "stable-update");
    const acc = up.filter((p) => p.rec.profile === "default");
    const top = maxOf(acc, (p) => p.nodes);
    const works2 = up.filter((p) => typeof p.rec.metrics?.["work"] === "number");
    const rate = works2.length === 0 ? undefined : works2.map((p) => med(p) / ((p.rec.metrics!["work"] as number) / 1e6));
    return {
      evidence: `incremental update (+1 % nodes): ${series(r, "stable-update")}; default refusals: ${refusalSummary(r, "stable-update")}; largest accepted under default budget: ${top ? `${loc(top)} in ${ms(med(top))}` : "none"}. Meter work vs wall time: ${rate ? `${Math.min(...rate).toFixed(0)} to ${Math.max(...rate).toFixed(0)} ms per million meter units, so the default maxWork of 50,000,000 would correspond to about ${ms(Math.max(...rate) * 50)} of wall time` : "n/a"}; no run was refused by maxWork. The meter counts the placement model only, not verification or JSON work, so it is far from a clock. A scene at exactly 20,000 nodes plus the 1 % added nodes exceeds maxNodes: the refusal at N20000 is that boundary.`,
      recommendation: dRef.length === 0 && top && top.nodes >= 20_000 ? "keep" : dRef.length > 0 && top && top.nodes >= 10_000 ? "keep" : "needs more data",
      proposal: dRef.length === 0 ? "Keep: no default refusal up to the largest size run." : `Keep the node and edge caps; the default refused ${refusalSummary(r, "stable-update")}. Where the refusal is the byte or work cap and the raised run succeeded in ${ms(med(worst(up.filter((p) => p.rec.profile === "raised")) ?? up[0]!))} (worst shape), raise that cap only for headless hosts.`,
    };
  }),
  row({ id: "lod-budget", package: "lod-core", name: "DEFAULT_LOD_BUDGET and hard limits (MAX_NODES 100,000, MAX_EDGES 500,000, MAX_GROUPS 20,000, MAX_MEMBER_ENTRIES 500,000, MAX_WORK_HARD 10^9)", value: "20,000 / 100,000 / 10^8 work", design: "29 s11" }, (r) => {
    const v = okPts(r, "lod-view-collapsed");
    if (v.length === 0) return noData(r, "deriveView");
    return {
      evidence: `deriveView with collapsed groups: ${series(r, "lod-view-collapsed")}; flat view: ${series(r, "lod-view-flat")}; suggestGroups: ${series(r, "lod-suggest")}. Default refusals: ${refusalSummary(r, "lod-view-collapsed")}; refusals even when raised to the hard limits: ${works(r).flatMap((w) => { const s = stageOf(w, "lod-view-collapsed"); return s && s.outcome === "refused" && s.profile === "raised" ? [`${w.shape}/${w.size} ${s.error?.reason ?? s.error?.code}`] : []; }).join(", ") || "none"}. Largest view derived: ${(() => { const p = maxOf(v, (x) => x.nodes); return p ? `${loc(p)} in ${ms(med(p))}` : "n/a"; })()}.`,
      recommendation: v.some((p) => p.nodes >= 20_000) ? "keep" : "needs more data",
      proposal: "Keep: the default budget refused only above its own node and edge caps, and the hard limits (MAX_NODES, MAX_EDGES) refused the one workload beyond them even with the budget raised to the hard limits; the raised runs below the hard limits all succeeded.",
    };
  }),
  row({ id: "svg-bytes", package: "renderer-svg", name: "maxSvgBytes (headless default; adapter default)", value: "64 MiB; 8 MiB (dom)", design: "30 s4, 12.2" }, (r) => {
    const o = outMax(r, "svg");
    const pe = perElement(r, "svg");
    if (!o || !pe) return noData(r, "the SVG size");
    const fit64 = Math.floor((64 * MIB) / pe.max), fit8 = Math.floor((8 * MIB) / pe.max);
    return {
      evidence: `SVG bytes per element ${pe.min.toFixed(0)} to ${pe.max.toFixed(0)}; the largest document ${fmtBytes(o.bytes)} (${loc(o.p)}). 64 MiB holds about ${num(fit64)} elements and 8 MiB about ${num(fit8)} at the worst density. Default refusals of renderSvg: ${refusalSummary(r, "svg")}. exportBundle (its SVG cannot be raised through ExportOptions): ${refusalSummary(r, "export-bundle")}.`,
      recommendation: "keep",
      proposal: `Keep 64 MiB as a headless safety cap (it binds at about ${num(fit64)} elements, past the 20,000 + 40,000 caps). The 8 MiB adapter default corresponds to about ${num(fit8)} elements; see the DOM capacity row for the time side.`,
    };
  }),
  row({ id: "svg-labels", package: "renderer-svg / display-list", name: "maxDrawnLabelUnits (headless 1,048,576; dom 262,144)", value: "1,048,576; 262,144", design: "30 s4; 31 s11.4" }, (r) => {
    const full = okPts(r, "svg-full-labels"), s = okPts(r, "svg");
    if (s.length === 0) return noData(r, "the SVG labels");
    const elided = works(r).filter((w) => { const rec = stageOf(w, "svg"); return rec?.metrics?.["labels"] === "elided"; });
    const dens = s.filter((p) => p.rec.metrics?.["labels"] === "full" && typeof p.rec.metrics?.["labelUnits"] === "number").map((p) => (p.rec.metrics!["labelUnits"] as number) / el(p));
    const perEl = dens.length === 0 ? undefined : Math.max(...dens);
    const lu = metricMax(r, "svg", "labelUnits");
    const ratio = full.map((p) => { const base = s.find((q) => q.shape === p.shape && q.size === p.size); return base ? med(p) / med(base) : undefined; }).filter((x): x is number => x !== undefined);
    return {
      evidence: `labels elided by the default budget at: ${elided.length === 0 ? "no run" : elided.map((w) => `${w.shape}/${w.size}`).join(", ")}; most label units drawn ${lu === undefined ? "n/a" : num(lu)}; label units per element (runs with every label drawn) up to ${perEl === undefined ? "n/a" : perEl.toFixed(1)}, so 1,048,576 covers about ${perEl === undefined ? "n/a" : num(Math.floor(1_048_576 / perEl))} elements and 262,144 about ${perEl === undefined ? "n/a" : num(Math.floor(262_144 / perEl))}. Drawing every label (budget raised) costs ${ratio.length === 0 ? "n/a (never needed)" : `${Math.min(...ratio).toFixed(2)} to ${Math.max(...ratio).toFixed(2)} times the default render`}.`,
      recommendation: "keep",
      proposal: "Keep: under the default limits no measured run elided a label (the SVG byte cap refuses first at the sizes where the label budget would bind); the adapter figure is a quarter of the headless one by design and is judged by the DOM insertion times in the capacity row.",
    };
  }),
  row({ id: "svg-dom-capacity", package: "renderer-svg", name: "DOM adapter capacity maxNodes / maxEdges", value: "2,000 / 4,000", design: "30 s12.2" }, (r) => {
    const pts = browserPoints(r, 0);
    if (pts.length === 0) return noData(r, "the real SVG DOM insertion (browser mode)");
    const rows = pts.filter((p) => p.c.svg?.insertMs !== undefined).sort((a, b) => a.elements - b.elements);
    const t = (p: (typeof rows)[number]): number => p.c.svg!.insertMs!.median;
    const lower = [...rows].reverse().find((p) => p.elements <= 6000), upper = rows.find((p) => p.elements > 6000);
    const interp = lower && upper ? t(lower) + ((t(upper) - t(lower)) * (6000 - lower.elements)) / (upper.elements - lower.elements) : undefined;
    const under = rows.filter((p) => t(p) <= RESPONSIVE_MS), over = rows.filter((p) => t(p) > RESPONSIVE_MS);
    const upTo = under.length === 0 ? 0 : Math.max(...under.map((p) => p.elements));
    const sizesWorst = sizesByNodes(r).map((size) => { const w = maxOf(rows.filter((p) => p.c.size === size), t); return w ? `${size} worst ${w.label} ${num(w.elements)} elements ${ms(t(w))}` : undefined; }).filter((x): x is string => x !== undefined);
    return {
      evidence: `real DOM insertion plus style and layout of the SVG (Chromium, ${r.browser!.profiles[0]!.name}), per size: ${sizesWorst.join("; ")}. The adapter capacity is 2,000 nodes + 4,000 edges = 6,000 elements; the measured points around it: ${lower ? `${lower.label} ${num(lower.elements)} el ${ms(t(lower))}` : "none below"} and ${upper ? `${upper.label} ${num(upper.elements)} el ${ms(t(upper))}` : "none above"}; linear interpolation at 6,000 elements ${interp === undefined ? "n/a" : ms(interp)}. Insertions at or under ${ms(RESPONSIVE_MS)} reach ${num(upTo)} elements (at the largest such point).`,
      recommendation: interp === undefined ? "needs more data" : interp <= RESPONSIVE_MS ? "keep" : "lower",
      proposal: interp === undefined ? "No measured points on both sides of the cap." : interp <= RESPONSIVE_MS ? `Keep: the 6,000-element cap is where a whole-document re-insertion is still about ${ms(interp)} (interpolated), and the next measured point above it is ${upper ? ms(t(upper)) : "n/a"}; a higher DOM cap would move commits over the responsive budget.` : "At the cap the full re-insertion exceeds the responsive budget; lower the DOM capacity or select Canvas earlier.",
    };
  }),
  row({ id: "canvas-capacity", package: "renderer-canvas", name: "capacity maxNodes / maxEdges", value: "20,000 / 40,000", design: "31 s11.4" }, (r) => {
    const pts = browserPoints(r, 0).filter((p) => p.c.canvas?.syncMs !== undefined).sort((a, b) => a.elements - b.elements);
    if (pts.length === 0) return noData(r, "the real Canvas 2D paint (browser mode)");
    const t = (p: (typeof pts)[number]): number => p.c.canvas!.syncMs!.median;
    const perSize = sizesByNodes(r).map((size) => { const w = maxOf(pts.filter((p) => p.c.size === size), t); return w ? `${size} worst ${w.label} ${num(w.elements)} el ${ms(t(w))}` : undefined; }).filter((x): x is string => x !== undefined);
    const atCap = maxOf(pts.filter((p) => p.elements <= 60_000), (p) => p.elements);
    const dlAt = atCap ? worst(okPts(r, "display-list").filter((p) => p.size === atCap.c.size)) : undefined;
    return {
      evidence: `Canvas 2D replay plus flush (Chromium ${r.browser!.profiles[0]!.name}), per size: ${perSize.join("; ")}. The cap is 60,000 elements (20,000 + 40,000); the largest measured point at or under it is ${atCap ? `${atCap.label} ${num(atCap.elements)} el ${ms(t(atCap))}` : "none"}, and the display list for that size (worst shape) takes ${dlAt ? ms(med(dlAt)) : "n/a"} to build.`,
      recommendation: atCap && atCap.elements >= 30_000 ? (t(atCap) <= WAIT_MS ? "keep" : "lower") : "needs more data",
      proposal: atCap && atCap.elements >= 30_000 ? `Keep as a safety cap: at the cap a commit costs about ${ms(t(atCap) + (dlAt ? med(dlAt) : 0))} (paint plus list build), usable for a static view or a slow pan, not for 60 Hz; see the selection table for where WebGL pays off.` : "No browser point near the 60,000-element cap; measure N20000 in the browser.",
    };
  }),
  row({ id: "webgl-capacity", package: "renderer-webgl", name: "capacity maxNodes / maxEdges; maxGlBytes", value: "100,000 / 200,000; 256 MiB", design: "31 s7.2, 11.4" }, (r) => {
    const gp = okPts(r, "gl-plan");
    if (gp.length === 0) return noData(r, "planGl");
    const big = maxOf(gp, (p) => p.nodes)!;
    const ob = outMax(r, "gl-plan");
    const profileLine = (i: number): string => {
      const pts = browserPoints(r, i).filter((p) => p.c.webgl?.syncMs !== undefined).sort((a, b) => a.elements - b.elements);
      const top = maxOf(pts, (p) => p.elements);
      const prof = r.browser?.profiles[i];
      return top && prof ? `${prof.gl.software ? "software" : "hardware"} GL ${top.label} ${num(top.elements)} el draw+sync ${ms(top.c.webgl!.syncMs!.median)}` : "n/a";
    };
    return {
      evidence: `planGl worst shape per size: ${series(r, "gl-plan")}; the largest plan ${ob ? `${fmtBytes(ob.bytes)} (${loc(ob.p)})` : "n/a"} against the 256 MiB ceiling; ${loc(big)} planned with ${big.rec.profile === "raised" ? "raised" : "default"} limits. Browser, largest point: ${profileLine(0)}; ${profileLine(1)}. XL was run in Node only (the plan is built and measured, not drawn).`,
      recommendation: big.nodes >= 100_000 ? "keep" : "needs more data",
      proposal: big.nodes >= 100_000 ? "Keep: the plan builds at 100,000 nodes within the 256 MiB ceiling; the frame cost at that size is not measured in a browser here (the XL plan was not drawn), so the 100,000 / 200,000 capacity stays a safety cap, not a performance claim." : "XL not reached; measure before ruling.",
    };
  }),
  row({ id: "dl-bytes", package: "display-list", name: "maxDlBytes; DEFAULT_DL_READ_LIMITS; DEFAULT_CV_READ_LIMITS", value: "64 MiB; 64 MiB / 16,777,216 units; 256 MiB", design: "31 s4" }, (r) => {
    const o = outMax(r, "display-list-serialize"), cs = outMax(r, "canvas-stream");
    if (!o) return noData(r, "the display list size");
    const pe = perElement(r, "display-list-serialize");
    const refused = refusalSummary(r, "display-list-serialize");
    const beyondCaps = defaultRefusals(r, "display-list-serialize").every(({ w }) => w.nodes > 20_000 || w.edges > 40_000);
    return {
      evidence: `serialized list ${pe ? `${pe.min.toFixed(0)} to ${pe.max.toFixed(0)} bytes per element` : ""}; largest ${fmtBytes(o.bytes)} (${loc(o.p)}); recorded Canvas stream largest ${cs ? fmtBytes(cs.bytes) : "n/a"}. Default refusals of serializeDisplayList: ${refused}. Reading it back (parseDisplayList): ${series(r, "display-list-parse")}.`,
      recommendation: beyondCaps && (pe?.max ?? 0) * 60_000 <= 64 * MIB ? "keep" : "raise",
      proposal: beyondCaps && (pe?.max ?? 0) * 60_000 <= 64 * MIB ? `Keep: a list at the 20,000 + 40,000 caps is about ${fmtBytes((pe?.max ?? 0) * 60_000)}, inside 64 MiB; the default refused only workloads beyond the node or edge caps (${refused}).` : `A list at the 20,000 + 40,000 caps would be about ${fmtBytes((pe?.max ?? 0) * 60_000)} against 64 MiB, or the default refused a workload within the caps (${refused}): raise to what the caps need.`,
    };
  }),
  row({ id: "readers", package: "renderer-svg / display-list / renderer-webgl", name: "reader bounds (DEFAULT_READ_LIMITS, DL and plan read limits)", value: "64 MiB, 16,777,216 line units", design: "30 s14.5; 31 s4" }, (r) => {
    const a = series(r, "svg-read"), b = series(r, "display-list-parse"), c = series(r, "gl-plan-parse");
    if (a === "not measured" && b === "not measured") return noData(r, "the readers");
    return {
      evidence: `readSvg: ${a}; parseDisplayList: ${b}; parseGlPlan: ${c}. Default refusals: svg ${refusalSummary(r, "svg-read")}; list ${refusalSummary(r, "display-list-parse")}; plan ${refusalSummary(r, "gl-plan-parse")}.`,
      recommendation: "keep",
      proposal: "Keep: the readers are conformance-time tools, linear in length; their bounds are safety caps against hostile input, not performance levers.",
    };
  }),
  row({ id: "companion", package: "a11y-companion", name: "COMPANION_FULL_MAX 500, COMPANION_WINDOW 200, maxTreeBytes 16 MiB, maxPlanBytes 16 MiB, window count 5,000", value: "500 / 200 / 16 MiB / 16 MiB / 5,000", design: "32 s9.3, 14.1" }, (r) => {
    const t = okPts(r, "companion-tree");
    if (t.length === 0) return noData(r, "the companion tree");
    const all = okPts(r, "companion-tree-all");
    const per = all.length === 0 ? undefined : all.map((p) => med(p) / el(p) * 1000);
    const items500 = per ? (Math.max(...per) * 500) / 1000 : undefined;
    return {
      evidence: `windowed tree (200 items above 500 elements): ${series(r, "companion-tree")}; its gate: ${series(r, "companion-gate")}. Full tree (window all): ${series(r, "companion-tree-all")}${per ? `, about ${Math.min(...per).toFixed(1)} to ${Math.max(...per).toFixed(1)} microseconds per element, so 500 items cost about ${ms(items500!)}` : ""}; refusals of window all: ${refusalSummary(r, "companion-tree-all")}. Tree bytes at the largest size: ${(() => { const o = outMax(r, "companion-tree"); return o ? fmtBytes(o.bytes) : "n/a"; })()}.`,
      recommendation: items500 !== undefined && items500 <= RESPONSIVE_MS ? "keep" : "needs more data",
      proposal: "Keep 500 and 200: a full build at 500 elements is far under the responsive budget; the windowed tree still costs O(N + E) to derive (the accessible model is built over every element), which is the real scaling term, not the window size. A host above the caps should rebuild the tree off the paint path.",
    };
  }),
  row({ id: "export", package: "export-core", name: "DEFAULT_EXPORT_LIMITS (maxArtifactBytes 256 MiB, maxPngBytes 64 MiB, maxManifestBytes 1 MiB)", value: "256 MiB / 64 MiB / 1 MiB", design: "32 s3.3, 14.1" }, (r) => {
    const b = outMax(r, "export-bundle") ?? outMax(r, "export-bundle-nosvg");
    if (!b) return noData(r, "exportBundle");
    return {
      evidence: `exportBundle: ${series(r, "export-bundle")}; largest bundle ${fmtBytes(b.bytes)} (${loc(b.p)}). Refusals: bundle ${refusalSummary(r, "export-bundle")}; verifyExportBundle ${refusalSummary(r, "export-verify")}. Note: exportBundle always renders the SVG with default svg limits (ExportOptions cannot raise maxSvgBytes) and verifyExportBundle rebuilds the model with default RenderLimits (no option), so both stop where those defaults stop. PNG bytes were not measured (no PNG is produced in Node).`,
      recommendation: "needs more data",
      proposal: "Keep the artifact caps; PNG and manifest caps are unmeasured. Propose (as an API question, not done here) that exportBundle and verifyExportBundle accept svg and render limits, since they refuse scenes the other stages accept.",
    };
  }),
  row({ id: "interaction", package: "interaction-core", name: "DRAG_THRESHOLD_MILLI 4000, LONG_PRESS_MS 500, WHEEL_NOTCH_MILLI, WHEEL_MAX_NOTCHES 8, ZOOM_STEP_IN/OUT, PAN_STEP_PX 32, REVEAL_MARGIN_PX 24, COORD_MAX_MILLI, DEFAULT_MAX_TARGETS 60,000", value: "constants", design: "32 s3.3" }, (r) => {
    const mv = series(r, "step-pointermove"), wh = series(r, "step-wheel"), k = series(r, "step-key"), lp = series(r, "loop-key");
    if (mv === "not measured") return noData(r, "the gesture machine");
    return {
      evidence: `gesture machine per event (worst shape): pointermove ${mv}; wheel ${wh}; ArrowRight (graph navigation) ${k}; key then reduce loop ${lp}. Pointer and wheel events cost microseconds at every size; keyboard navigation is O(N + E) and crosses one frame (${ms(FRAME_MS)}) ${bracket(r, "step-key", FRAME_MS)}.`,
      ...NEED,
      proposal: "The thresholds and steps are ergonomic constants: no performance evidence moves them. Keep as provisional until a usability pass; for hosts above the bracket, run keyboard navigation off the main thread.",
    };
  }),
  row({ id: "dl-coords-device", package: "display-list", name: "DL_COORD_MAX 2^40, VIEWPORT_MAX_PX 16,384, BACKING_AREA_MAX 2^26, DPR 0.25 to 8", value: "constants", design: "31 s3.5, 6.4" }, (r) => ({
    evidence: `Measured only at a 1280 x 800 viewport, device pixel ratio 1 (${r.browser ? "browser mode ran" : "browser mode not run"}); large canvases (16,384 px, 2^26 backing pixels) and DPR 2 to 8 were not measured.`,
    ...NEED, proposal: "No change proposed. Measure Canvas and WebGL at large backing sizes and DPR 2 before ruling; the backing-store cost scales with pixels, which this run does not vary.",
  })),
];

export function buildLimitsEvidence(r: Report): LimitRow[] { return ROWS.map((f) => f(r)); }

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Renderer auto-selection proposal
// ---------------------------------------------------------------------------------------------------------------------------------------------

export interface CostPoint { label: string; elements: number; svg?: number; canvas?: number; webgl?: number; svgPaint?: number; canvasPaint?: number; webglPaint?: number }

/** Per-commit cost (ms) for each renderer at each browser point of a profile: the Node-side build plus the browser-side paint, medians (and the paint alone). */
export function costPoints(r: Report, profileIndex: number): CostPoint[] {
  const prof = r.browser?.profiles[profileIndex];
  if (!prof) return [];
  const out: CostPoint[] = [];
  for (const c of prof.cases) {
    const w = works(r).find((x) => x.shape === c.shape && x.size === c.size);
    if (!w) continue;
    const m = (id: string): number | undefined => stageOf(w, id)?.ms?.median;
    const svgBuild = m("svg"), dl = m("display-list"), plan = m("gl-plan");
    const pt: CostPoint = { label: `${c.shape}/${c.size}`, elements: c.nodes + c.edges };
    if (svgBuild !== undefined && c.svg?.insertMs) { pt.svg = svgBuild + c.svg.insertMs.median; pt.svgPaint = c.svg.insertMs.median; }
    if (dl !== undefined && c.canvas?.syncMs) { pt.canvas = dl + c.canvas.syncMs.median; pt.canvasPaint = c.canvas.syncMs.median; }
    if (dl !== undefined && plan !== undefined && c.webgl?.syncMs && c.webgl.labelsMs) { pt.webgl = dl + plan + c.webgl.syncMs.median + c.webgl.labelsMs.median; pt.webglPaint = c.webgl.syncMs.median + c.webgl.labelsMs.median; }
    out.push(pt);
  }
  return out.sort((a, b) => a.elements - b.elements);
}

/** The largest element count, over the points of a series, whose cost stays within `budget` for every point at or below it (a prefix rule); 0 when none. */
export function withinBudget(points: CostPoint[], key: "svg" | "canvas" | "webgl", budget: number): number {
  let ok = 0;
  for (const p of points) { const v = p[key]; if (v === undefined) continue; if (v <= budget) ok = p.elements; else break; }
  return ok;
}

/** Element-count bands of the proposal: [lo, hi), in elements (nodes + edges). */
export const BANDS: readonly (readonly [number, number])[] = [[0, 1_000], [1_000, 5_000], [5_000, 20_000], [20_000, 50_000], [50_000, 100_000], [100_000, Infinity]];
const bandName = ([lo, hi]: readonly [number, number]): string => (hi === Infinity ? `${num(lo)} and above` : `${num(lo)} to under ${num(hi)}`);
const medianOf = (xs: number[]): number | undefined => { if (xs.length === 0) return undefined; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const PREFERENCE = ["SVG (DOM)", "Canvas 2D", "WebGL2"] as const;
/** A renderer within this factor of the cheapest in a band is considered equal; the first of PREFERENCE (native DOM semantics, then the simpler paint path) wins. */
export const TIE_FACTOR = 1.25;

export interface BandCosts { band: string; points: number; svg?: number; canvas?: number; webglSoftware?: number; webglHardware?: number; webglWorst?: number; paintSvg?: number; paintCanvas?: number; paintWebglSoftware?: number; paintWebglHardware?: number }

/** Per band, the median over the browser points in the band of each renderer's per-commit cost. SVG and Canvas use the first profile; WebGL is shown per GL profile. */
export function bandCosts(r: Report): BandCosts[] {
  const profs = (r.browser?.profiles ?? []).map((_, i) => costPoints(r, i));
  if (profs.length === 0) return [];
  const pick = (pts: CostPoint[], band: readonly [number, number], k: keyof CostPoint): number | undefined => medianOf(pts.filter((p) => p.elements >= band[0] && p.elements < band[1]).map((p) => p[k]).filter((x): x is number => typeof x === "number"));
  const swIdx = r.browser!.profiles.findIndex((p) => p.gl.software === true), hwIdx = r.browser!.profiles.findIndex((p) => p.gl.software === false);
  const out: BandCosts[] = [];
  for (const band of BANDS) {
    const n = profs[0]!.filter((p) => p.elements >= band[0] && p.elements < band[1]).length;
    if (n === 0) continue;
    const row: BandCosts = { band: bandName(band), points: n };
    const set = <K extends keyof BandCosts>(k: K, v: number | undefined): void => { if (v !== undefined) (row as unknown as Record<string, number>)[k] = v; };
    set("svg", pick(profs[0]!, band, "svg")); set("canvas", pick(profs[0]!, band, "canvas")); set("paintSvg", pick(profs[0]!, band, "svgPaint")); set("paintCanvas", pick(profs[0]!, band, "canvasPaint"));
    if (swIdx >= 0) { set("webglSoftware", pick(profs[swIdx]!, band, "webgl")); set("paintWebglSoftware", pick(profs[swIdx]!, band, "webglPaint")); }
    if (hwIdx >= 0) { set("webglHardware", pick(profs[hwIdx]!, band, "webgl")); set("paintWebglHardware", pick(profs[hwIdx]!, band, "webglPaint")); }
    const gl = [row.webglSoftware, row.webglHardware].filter((x): x is number => x !== undefined);
    if (gl.length > 0) row.webglWorst = Math.max(...gl);
    out.push(row);
  }
  return out;
}

export function chooseRenderer(b: BandCosts): (typeof PREFERENCE)[number] | undefined {
  const costs: [(typeof PREFERENCE)[number], number | undefined][] = [["SVG (DOM)", b.svg], ["Canvas 2D", b.canvas], ["WebGL2", b.webglWorst]];
  const have = costs.filter((c): c is [(typeof PREFERENCE)[number], number] => c[1] !== undefined);
  if (have.length === 0) return undefined;
  // under one frame every renderer is equal for practical purposes: the first of the preference list that is under a frame wins
  const cheap = have.find((c) => c[1] <= FRAME_MS);
  if (cheap) return cheap[0];
  const min = Math.min(...have.map((c) => c[1]));
  return have.find((c) => c[1] <= min * TIE_FACTOR)![0];
}

/** The same choice on the paint alone (the artifact reused, not rebuilt): WebGL2 counts only on the hardware GL stack, and says so. */
export function choosePaintOnly(b: BandCosts): string | undefined {
  const costs: [string, number | undefined][] = [["SVG (DOM)", b.paintSvg], ["Canvas 2D", b.paintCanvas], ["WebGL2 (hardware GL only)", b.paintWebglHardware]];
  const have = costs.filter((c): c is [string, number] => c[1] !== undefined);
  if (have.length === 0) return undefined;
  const cheap = have.find((c) => c[1] <= FRAME_MS);
  if (cheap) return cheap[0];
  const min = Math.min(...have.map((c) => c[1]));
  return have.find((c) => c[1] <= min * TIE_FACTOR)![0];
}

export function buildSelection(r: Report): SelectionProposal {
  const assumptions = [
    "Per-commit cost = the Node/V8 build time of the renderer's artifact (renderSvg; buildDisplayList; buildDisplayList + planGl) plus the browser-side paint (SVG DOM insert + style + layout; Canvas replay + flush; WebGL draw + sync + 2D label layer), medians. Every commit rebuilds everything: the packages have no incremental or cached path. Paint-only cost = the browser-side part alone, which is what an artifact reused across commits would cost.",
    `Per band of element counts (nodes + edges) the cost is the median over the browser points in the band (all shapes). Under one frame every renderer is treated as equal and the first of SVG, Canvas, WebGL wins (native DOM semantics, then the simpler path); above it a renderer within ${TIE_FACTOR} times of the cheapest is a tie with the same preference. WebGL is judged on the worse of the two GL stacks for the per-commit view and on the hardware stack only for the paint-only view.`,
    `Reference budgets (assumptions of this report): one frame ${FRAME_MS} ms; a responsive command ${RESPONSIVE_MS} ms; a visible wait ${WAIT_MS} ms.`,
    "Chromium only, one machine; two GL stacks (default headless GL, software SwiftShader here; ANGLE on Direct3D 11, this machine's integrated GPU). Pixels, text quality and accessibility are outside the table: SVG carries native DOM semantics, Canvas and WebGL need the companion tree.",
  ];
  const bands = bandCosts(r);
  if (bands.length === 0) {
    return { assumptions, rows: [], notes: ["The browser mode was not run: no selection thresholds can be proposed. Node-side build times are in the limits table. Run `npm run bench:browser` (or `npm run bench`)."] };
  }
  const f = (x: number | undefined): string => (x === undefined ? "n/a" : ms(x));
  const rows: SelectionRow[] = [];
  const choices: { band: BandCosts; commit: string | undefined; paint: string | undefined }[] = [];
  for (const b of bands) {
    const commit = chooseRenderer(b), paint = choosePaintOnly(b);
    choices.push({ band: b, commit, paint });
    const minHere = Math.min(...[b.svg, b.canvas, b.webglWorst].filter((x): x is number => x !== undefined));
    rows.push({
      elements: b.band, renderer: commit ?? "no data",
      basis: `per commit (rebuild + paint) the cheapest is ${ms(minHere)}${minHere <= RESPONSIVE_MS ? ", within the responsive budget" : minHere <= WAIT_MS ? ", over the responsive budget but within the wait budget" : ", over the wait budget"}; paint-only view: ${paint ?? "no data"}`,
      data: `per commit: SVG ${f(b.svg)}, Canvas ${f(b.canvas)}, WebGL software GL ${f(b.webglSoftware)}, WebGL hardware GL ${f(b.webglHardware)}; paint only: SVG ${f(b.paintSvg)}, Canvas ${f(b.paintCanvas)}, WebGL software ${f(b.paintWebglSoftware)}, WebGL hardware ${f(b.paintWebglHardware)}; ${b.points} point${b.points === 1 ? "" : "s"}`,
    });
  }
  const notes: string[] = [];
  const lowOf = (b: BandCosts): string => num(Number(b.band.split(" ")[0]!.replace(/,/g, "")));
  const firstNotSvg = choices.find((c) => c.commit !== "SVG (DOM)");
  const firstWebgl = choices.find((c) => c.commit === "WebGL2");
  const firstPaintWebgl = choices.find((c) => c.paint?.startsWith("WebGL2"));
  notes.push(`Proposed thresholds (elements = nodes + edges), per commit with a rebuild: ${firstNotSvg ? `SVG below ${lowOf(firstNotSvg.band)} elements, Canvas 2D above it` : "SVG in every band measured"}${firstWebgl ? `; WebGL2 from the band ${firstWebgl.band.band}` : "; WebGL2 never wins the per-commit cost in any band measured, because planGl adds to the display-list build"}. With a reused artifact${firstPaintWebgl ? `, WebGL2 on hardware GL wins the paint from the band ${firstPaintWebgl.band.band}` : ", WebGL2 does not win the paint in any band"}; on software GL it is not faster than Canvas, so WebGL should be offered only after probeWebgl with failIfMajorPerformanceCaveat accepts a real GPU.`);
  const firstSlow = choices.find((c) => Math.min(...[c.band.svg, c.band.canvas, c.band.webglWorst].filter((x): x is number => x !== undefined)) > RESPONSIVE_MS);
  notes.push(firstSlow ? `From the band ${firstSlow.band.band} the cheapest renderer already exceeds ${ms(RESPONSIVE_MS)} per commit, because every commit rebuilds the artifact in JS: a selection threshold cannot make large views responsive; only an incremental or cached path can.` : `No band exceeds ${ms(RESPONSIVE_MS)} per commit for the cheapest renderer.`);
  const maxEl = Math.max(...(r.browser!.profiles[0]?.cases ?? []).map((c) => c.nodes + c.edges), 0);
  notes.push(`Largest browser point: ${num(maxEl)} elements. Above it nothing was drawn in a browser; the Node-side plan builds up to ${num(Math.max(...okPts(r, "gl-plan").map((p) => el(p)), 0))} elements.`);
  notes.push("Proposal only: the packages contain no auto-selection code and no threshold. Any threshold adopted must cite this table as its evidence (PlanMap hard stop: 'Renderer thresholds require benchmark evidence'); a second machine and engine would be needed before it is more than a proposal.");
  return { assumptions, rows, notes };
}

export function finalizeDerived(r: Report): void {
  r.limits = buildLimitsEvidence(r);
  r.selection = buildSelection(r);
}
