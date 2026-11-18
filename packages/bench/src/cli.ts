// src/cli.ts - the benchmark driver: one child process per workload, the FORCE probe, the optional browser mode, then the report. Asserts nothing.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserCase } from "./browser.js";
import { collectEnv } from "./env.js";
import { parseOptions, type Options } from "./options.js";
import { CAVEATS, REPORT_FORMAT, isFailure, writeReport, type CompileProbePoint, type ForceProbePoint, type Report, type WorkerFailure } from "./report.js";
import { finalizeDerived } from "./derive.js";
import type { WorkloadResult } from "./pipeline.js";
import type { Shape, SizeSpec } from "./workloads.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const WORKER = join(here, "..", "scripts", "worker.mjs");

function runWorker(args: string[], o: Options, timeoutMs: number): Promise<{ code: number | null; signal: string | null; tail: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--expose-gc", `--max-old-space-size=${o.heapMb}`, WORKER, ...args], { stdio: ["ignore", "inherit", "pipe"] });
    let tail = "";
    child.stderr.on("data", (d: Buffer) => { process.stderr.write(d); tail = (tail + d.toString("utf8")).slice(-4000); });
    const timer = setTimeout(() => { tail += "\n[driver] worker killed after the time limit"; child.kill(); }, timeoutMs);
    child.on("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal, tail }); });
  });
}

const reasonOf = (r: { code: number | null; signal: string | null; tail: string }): string => {
  if (/heap out of memory|Allocation failed|JavaScript heap/i.test(r.tail)) return "out of memory (V8 heap limit reached)";
  if (/killed after the time limit/.test(r.tail)) return "killed after the worker time limit";
  return `exit code ${r.code ?? "none"}${r.signal ? `, signal ${r.signal}` : ""}`;
};

/** Re-runs only the probes and merges them into an existing out/report.json (the measurements of the workloads are kept). */
async function mergeProbes(o: Options): Promise<number> {
  const path = join(o.outDir, "report.json");
  if (!existsSync(path)) throw new Error(`--merge-probes needs ${path}`);
  const r = JSON.parse(readFileSync(path, "utf8")) as Report;
  const tmp = join(o.outDir, "tmp");
  mkdirSync(tmp, { recursive: true });
  const outFile = join(tmp, "compile-probe.json");
  const w = await runWorker(["--kind", "compile-probe", "--smoke", o.smoke ? "1" : "0", "--out", outFile], o, o.workerTimeoutMin * 60_000);
  if (w.code !== 0 || !existsSync(outFile)) throw new Error(`compile probe worker failed: ${reasonOf(w)}`);
  r.compileProbe = JSON.parse(readFileSync(outFile, "utf8")) as CompileProbePoint[];
  rmSync(tmp, { recursive: true, force: true });
  finalizeDerived(r);
  writeReport(r, o.outDir);
  process.stderr.write(`[bench] merged the compile probe into ${path}
`);
  return 0;
}

export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<number> {
  const o = parseOptions(argv, env);
  const t0 = Date.now();
  mkdirSync(o.outDir, { recursive: true });
  if (o.mergeProbes) return mergeProbes(o);
  const tmp = join(o.outDir, "tmp");
  mkdirSync(tmp, { recursive: true });
  const log = (l: string): void => { process.stderr.write(`[bench] ${l}\n`); };
  log(`sizes ${o.sizes.map((s) => `${s.name}=${s.nodes}`).join(",")}; shapes ${o.shapes.join(",")}; out ${o.outDir}${o.browser ? "; browser mode on" : ""}`);
  const workloads: (WorkloadResult | WorkerFailure)[] = [];
  const browserCases: BrowserCase[] = [];
  for (const size of o.sizes as SizeSpec[]) {
    const plan = o.plans[size.name]!;
    for (const shape of o.shapes as Shape[]) {
      const outFile = join(tmp, `${shape}-${size.name}.json`);
      const artifactDir = o.browser && size.nodes <= o.browserMaxNodes ? join(tmp, `artifacts-${shape}-${size.name}`) : undefined;
      const args = ["--kind", "workload", "--shape", shape, "--size", `${size.name}:${size.nodes}`, "--seed", String(o.seed), "--warmup", String(plan.warmup), "--reps", String(plan.reps), "--budget-ms", String(plan.budgetMs), "--ops", String(o.ops), "--out", outFile, ...(artifactDir ? ["--artifact-dir", artifactDir] : [])];
      const start = Date.now();
      const r = await runWorker(args, o, o.workerTimeoutMin * 60_000);
      if (r.code === 0 && existsSync(outFile)) {
        const res = JSON.parse(readFileSync(outFile, "utf8")) as WorkloadResult;
        workloads.push(res);
        if (artifactDir && existsSync(join(artifactDir, "meta.json"))) browserCases.push({ shape, size: size.name, nodes: res.nodes, edges: res.edges, dir: artifactDir });
      } else {
        const f: WorkerFailure = { shape, size: size.name, nodes: size.nodes, failed: true, reason: reasonOf(r), wallSeconds: (Date.now() - start) / 1000 };
        workloads.push(f);
        log(`WORKER FAILED ${shape}/${size.name}: ${f.reason}`);
      }
    }
  }
  let forceProbe: ForceProbePoint[] | undefined;
  if (o.forceProbe) {
    const outFile = join(tmp, "force-probe.json");
    const r = await runWorker(["--kind", "force-probe", "--seed", String(o.seed), "--smoke", o.smoke ? "1" : "0", "--out", outFile], o, o.workerTimeoutMin * 60_000);
    if (r.code === 0 && existsSync(outFile)) forceProbe = JSON.parse(readFileSync(outFile, "utf8")) as ForceProbePoint[];
    else log(`FORCE probe worker failed: ${reasonOf(r)}`);
  }
  let compileProbe: CompileProbePoint[] | undefined;
  if (o.forceProbe) {
    const outFile = join(tmp, "compile-probe.json");
    const r = await runWorker(["--kind", "compile-probe", "--smoke", o.smoke ? "1" : "0", "--out", outFile], o, o.workerTimeoutMin * 60_000);
    if (r.code === 0 && existsSync(outFile)) compileProbe = JSON.parse(readFileSync(outFile, "utf8")) as CompileProbePoint[];
    else log(`compile probe worker failed: ${reasonOf(r)}`);
  }
  const report: Report = {
    report: REPORT_FORMAT, generatedAt: new Date().toISOString(), totalSeconds: 0, env: collectEnv(),
    config: { sizes: o.sizes, shapes: o.shapes, seed: o.seed, plans: o.plans, ops: o.ops, heapMb: o.heapMb, stageBudgetS: o.stageBudgetS, browser: o.browser, smoke: o.smoke, workerTimeoutMin: o.workerTimeoutMin },
    workloads, limits: [], selection: { assumptions: [], rows: [], notes: [] }, caveats: [...CAVEATS],
  };
  if (forceProbe) report.forceProbe = forceProbe;
  if (compileProbe) report.compileProbe = compileProbe;
  if (o.browser && browserCases.length > 0) {
    const { runBrowser } = await import("./browser.js");
    try {
      const reps = Math.max(3, Math.min(10, o.plans["S"]?.reps ?? 5)), warmup = 2;
      report.browser = await runBrowser(browserCases, { reps, warmup, log });
    } catch (e) {
      log(`browser mode failed: ${e instanceof Error ? e.message : String(e)}`);
      report.caveats.push(`The browser mode failed to run: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
  if (!o.keepArtifacts) rmSync(tmp, { recursive: true, force: true });
  finalizeDerived(report);
  report.totalSeconds = (Date.now() - t0) / 1000;
  const { jsonPath, mdPath } = writeReport(report, o.outDir);
  const failed = workloads.filter(isFailure).length;
  log(`done in ${report.totalSeconds.toFixed(1)} s: ${jsonPath}, ${mdPath}${failed > 0 ? `; ${failed} workload(s) failed` : ""}`);
  return 0;
}
