// src/force-probe.ts - the FORCE family measured only inside (and at) its documented budget: 2,000 nodes and 100,000,000 work units. Points beyond the budget are
// there to record the refusal, not to be run. The work column uses the producer's documented formula (src/force-work.ts).
import { compileScene } from "isongraph-visualize-scene-core";
import { computeForceLayout } from "isongraph-visualize-layout-core";
import { forceWork } from "./force-work.js";
import { createRecorder } from "./harness.js";
import type { CompileProbePoint, ForceProbePoint } from "./report.js";
import { buildArtifacts, generateWorkload } from "./workloads.js";

export const FORCE_POINTS: readonly (readonly [number, number])[] = [[250, 100], [500, 100], [1000, 50], [1000, 100], [1000, 170], [1500, 60], [2000, 24], [2000, 50], [2001, 10]];
export const FORCE_POINTS_SMOKE: readonly (readonly [number, number])[] = [[100, 100], [250, 100], [2001, 10]];

export async function runForceProbe(points: readonly (readonly [number, number])[], seed: number, log: (l: string) => void = () => undefined): Promise<ForceProbePoint[]> {
  const out: ForceProbePoint[] = [];
  for (const [nodes, iterations] of points) {
    const w = generateWorkload({ shape: "sparse", nodes, seed });
    const art = await buildArtifacts(w);
    const side = Math.max(600, Math.round(60 * Math.sqrt(nodes)));
    const cfg = { width: side, height: side, margin: 40, iterations, seed: 42 };
    const rec = createRecorder({ warmup: 1, reps: 3, budgetMs: 60_000 });
    await rec.stage({ id: "force", label: "force", noRaise: true, run: () => computeForceLayout(art.sceneBytes, cfg) });
    const r = rec.records[0]!;
    const p: ForceProbePoint = { nodes, edges: w.edges, iterations, estimatedWork: Number(forceWork(nodes, w.edges, iterations)), outcome: r.outcome === "ok" ? "ok" : `${r.outcome} ${r.error?.reason ?? r.error?.code ?? ""}`.trim() };
    if (r.ms) p.ms = r.ms;
    out.push(p);
    log(`force probe ${nodes} nodes x ${iterations}: ${p.outcome}${p.ms ? ` median ${p.ms.median.toFixed(1)} ms` : ""}`);
  }
  return out;
}

export const COMPILE_EDGE_POINTS: readonly number[] = [60_000, 100_000, 120_000, 125_000, 130_000, 160_000];
export const COMPILE_EDGE_POINTS_SMOKE: readonly number[] = [1_000, 130_000];

/** compileScene on a scene whose edges all sit in ONE relation: where does Core's unguarded edge list overflow the stack? (a RangeError, not a RESOURCE_LIMIT). */
export async function runCompileProbe(points: readonly number[], log: (l: string) => void = () => undefined): Promise<CompileProbePoint[]> {
  const out: CompileProbePoint[] = [];
  const nodes = 20_000;
  for (const edges of points) {
    const lines: string[] = ["nodes.p", "id"];
    for (let i = 0; i < nodes; i++) lines.push(String(i));
    lines.push("", "edges.E", "source target");
    let c = 0;
    for (let i = 0; i < nodes && c < edges; i++) for (let k = 1; k < 20 && c < edges; k++) { lines.push(`:p:${i} :p:${(i + k * 7) % nodes}`); c++; }
    const bytes = new TextEncoder().encode(`${lines.join("\n")}\n`);
    const t0 = performance.now();
    let point: CompileProbePoint;
    try { await compileScene(bytes, "ison-v1"); point = { edges, nodes, outcome: "ok", ms: performance.now() - t0 }; }
    catch (e) { point = { edges, nodes, outcome: `failed ${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message.slice(0, 60) : String(e)}` }; }
    out.push(point);
    log(`compile probe ${edges} edges in one relation: ${point.outcome}`);
  }
  return out;
}
