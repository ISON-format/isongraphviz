// src/options.ts - the command line and the environment of the benchmark driver. Pure (the caller passes argv and env), so it is testable.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunPlan } from "./harness.js";
import { SHAPES, parseSizes, type Shape, type SizeSpec } from "./workloads.js";

export interface Options {
  sizes: SizeSpec[];
  shapes: Shape[];
  seed: number;
  plans: Record<string, RunPlan>;
  ops: number;
  heapMb: number;
  stageBudgetS: number;
  workerTimeoutMin: number;
  browser: boolean;
  browserMaxNodes: number;
  forceProbe: boolean;
  mergeProbes: boolean;
  keepArtifacts: boolean;
  smoke: boolean;
  outDir: string;
}

/** The repetition plan of a tier, by node count (the harness's time budget may cut it further). */
export function planFor(nodes: number, budgetMs = 60_000): RunPlan {
  if (nodes <= 200) return { warmup: 3, reps: 15, budgetMs };
  if (nodes <= 2_000) return { warmup: 2, reps: 9, budgetMs };
  if (nodes <= 30_000) return { warmup: 1, reps: 5, budgetMs };
  return { warmup: 0, reps: 2, budgetMs };
}

const PKG = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const int = (name: string, v: string | undefined, min: number): number => {
  const n = Number(v);
  if (v === undefined || !Number.isInteger(n) || n < min) throw new Error(`${name} expects an integer of at least ${min}`);
  return n;
};

export function parseOptions(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): Options {
  const flags = new Map<string, string | true>();
  const valued = new Set(["--sizes", "--shapes", "--reps", "--warmup", "--ops", "--seed", "--heap-mb", "--stage-budget-s", "--worker-timeout-min", "--out", "--browser-max-nodes"]);
  const boolean = new Set(["--smoke", "--browser", "--no-force-probe", "--keep-artifacts", "--merge-probes"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (boolean.has(a)) flags.set(a, true);
    else if (valued.has(a)) { const v = argv[++i]; if (v === undefined || v.startsWith("--")) throw new Error(`${a} expects a value`); flags.set(a, v); }
    else throw new Error(`unknown option ${a}`);
  }
  const get = (flag: string, envName: string): string | undefined => { const f = flags.get(flag); return typeof f === "string" ? f : env[envName]; };
  const smoke = flags.has("--smoke");
  const sizesText = get("--sizes", "BENCH_SIZES") ?? (smoke ? "S" : "S,M,L,20000,XL");
  const sizes = parseSizes(sizesText);
  const shapeText = get("--shapes", "BENCH_SHAPES");
  const shapes = shapeText === undefined ? [...SHAPES] : shapeText.split(",").map((s) => s.trim()).filter((s) => s !== "").map((s) => { if (!(SHAPES as readonly string[]).includes(s)) throw new Error(`unknown shape ${JSON.stringify(s)}`); return s as Shape; });
  if (shapes.length === 0) throw new Error("no shape given");
  const stageBudgetS = get("--stage-budget-s", "BENCH_STAGE_BUDGET_S") === undefined ? 60 : int("--stage-budget-s", get("--stage-budget-s", "BENCH_STAGE_BUDGET_S"), 1);
  const repsText = get("--reps", "BENCH_REPS"), warmText = get("--warmup", "BENCH_WARMUP");
  const reps = repsText === undefined ? undefined : int("--reps", repsText, 1);
  const warmup = warmText === undefined ? undefined : int("--warmup", warmText, 0);
  const plans: Record<string, RunPlan> = {};
  for (const s of sizes) {
    const p = planFor(s.nodes, stageBudgetS * 1000);
    if (smoke && warmup === undefined && reps === undefined) { p.warmup = 1; p.reps = 5; }
    plans[s.name] = { warmup: warmup ?? p.warmup, reps: reps ?? p.reps, budgetMs: p.budgetMs };
  }
  const seedText = get("--seed", "BENCH_SEED");
  const outText = get("--out", "BENCH_OUT");
  return {
    sizes, shapes, seed: seedText === undefined ? 20261118 : int("--seed", seedText, 0), plans,
    ops: get("--ops", "BENCH_OPS") === undefined ? 20 : int("--ops", get("--ops", "BENCH_OPS"), 1),
    heapMb: get("--heap-mb", "BENCH_HEAP_MB") === undefined ? 16384 : int("--heap-mb", get("--heap-mb", "BENCH_HEAP_MB"), 512),
    stageBudgetS,
    workerTimeoutMin: get("--worker-timeout-min", "BENCH_WORKER_TIMEOUT_MIN") === undefined ? 60 : int("--worker-timeout-min", get("--worker-timeout-min", "BENCH_WORKER_TIMEOUT_MIN"), 1),
    browser: flags.has("--browser") || env["BENCH_BROWSER"] === "1",
    browserMaxNodes: get("--browser-max-nodes", "BENCH_BROWSER_MAX_NODES") === undefined ? 20_000 : int("--browser-max-nodes", get("--browser-max-nodes", "BENCH_BROWSER_MAX_NODES"), 2),
    forceProbe: !flags.has("--no-force-probe"),
    mergeProbes: flags.has("--merge-probes"),
    keepArtifacts: flags.has("--keep-artifacts"),
    smoke,
    outDir: outText === undefined ? (smoke ? join(PKG, "out", "smoke") : join(PKG, "out")) : resolve(outText),
  };
}
