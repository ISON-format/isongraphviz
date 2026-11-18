// src/worker.ts - one child process per workload (or the FORCE probe): isolates memory, so that RSS figures are per workload and a crash (heap exhaustion) costs one
// entry of the report, not the run. Writes its result as JSON to the file named by --out; progress goes to stderr.
import { writeFileSync } from "node:fs";
import { COMPILE_EDGE_POINTS, COMPILE_EDGE_POINTS_SMOKE, FORCE_POINTS, FORCE_POINTS_SMOKE, runCompileProbe, runForceProbe } from "./force-probe.js";
import { runWorkload } from "./pipeline.js";
import { SHAPES, type Shape } from "./workloads.js";

export async function workerMain(argv: readonly string[]): Promise<void> {
  const a = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) a.set(argv[i]!, argv[i + 1] ?? "");
  const need = (k: string): string => { const v = a.get(k); if (v === undefined) throw new Error(`worker: missing ${k}`); return v; };
  const out = need("--out");
  const log = (l: string): void => { process.stderr.write(`${l}\n`); };
  if (need("--kind") === "compile-probe") {
    writeFileSync(out, JSON.stringify(await runCompileProbe(a.get("--smoke") === "1" ? COMPILE_EDGE_POINTS_SMOKE : COMPILE_EDGE_POINTS, log)));
    return;
  }
  if (need("--kind") === "force-probe") {
    const points = a.get("--smoke") === "1" ? FORCE_POINTS_SMOKE : FORCE_POINTS;
    writeFileSync(out, JSON.stringify(await runForceProbe(points, Number(need("--seed")), log)));
    return;
  }
  const shape = need("--shape") as Shape;
  if (!SHAPES.includes(shape)) throw new Error(`worker: unknown shape ${shape}`);
  const [sizeName, nodes] = need("--size").split(":");
  const result = await runWorkload({
    shape, size: { name: sizeName!, nodes: Number(nodes) }, seed: Number(need("--seed")),
    plan: { warmup: Number(need("--warmup")), reps: Number(need("--reps")), budgetMs: Number(need("--budget-ms")) }, ops: Number(need("--ops")),
    ...(a.has("--artifact-dir") ? { artifactDir: a.get("--artifact-dir")! } : {}), log,
  });
  if (a.has("--artifact-dir")) result.artifactDir = a.get("--artifact-dir")!;
  writeFileSync(out, JSON.stringify(result));
}
