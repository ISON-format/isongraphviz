// src/harness.ts - the measurement harness: warmup, repetitions, a time budget, RSS growth, and a recorder that turns a stage into a record, including the
// refusals of a package's own limits. No thresholds are asserted anywhere: a stage that is slow or refused is data, not a failure.
import { performance } from "node:perf_hooks";
import { summarize, type Summary } from "./stats.js";

export interface MeasureOptions {
  warmup: number;
  reps: number;
  /** A stage stops adding runs when the runs so far would exceed this; at least one measured rep is always kept. Default 60 000 ms. */
  budgetMs?: number;
  now?: () => number;
  /** Called before every run (not timed). The default calls global.gc when the process was started with --expose-gc. */
  gc?: () => void;
  rss?: () => number;
}
export interface Measured<T> { value: T; ms: number[]; rssDelta: number[]; warmup: number; reps: number; coldMs: number }

const defaultGc = (): void => { const g = (globalThis as { gc?: () => void }).gc; if (typeof g === "function") g(); };
const defaultRss = (): number => process.memoryUsage.rss();

/**
 * Runs `fn` warmup + reps times. The first (cold) run is a warmup when warmup >= 1, else a measured rep. The value of the first run is returned (and kept alive, so that
 * later runs are measured against a baseline that holds it); the values of later runs are dropped after the RSS read. An error of the first run propagates.
 */
export async function measure<T>(fn: () => T | Promise<T>, o: MeasureOptions): Promise<Measured<T>> {
  const now = o.now ?? ((): number => performance.now());
  const gc = o.gc ?? defaultGc, rss = o.rss ?? defaultRss;
  const budget = o.budgetMs ?? 60_000;
  const runs: { ms: number; rss: number }[] = [];
  let first: T | undefined;
  const once = async (keep: boolean): Promise<void> => {
    gc();
    const r0 = rss();
    const t0 = now();
    let v: T | undefined = await fn();
    const dt = now() - t0;
    const r1 = rss();
    if (keep) first = v;
    v = undefined;
    runs.push({ ms: dt, rss: r1 - r0 });
  };
  await once(true);
  const cold = runs[0]!.ms;
  const want = o.warmup + o.reps;
  const afford = Math.max(1, Math.floor(budget / Math.max(cold, 0.01)));
  const total = Math.min(want, afford);
  const warmup = Math.min(o.warmup, Math.max(0, total - 1));
  while (runs.length < total) await once(false);
  const measured = runs.slice(warmup);
  return { value: first as T, ms: measured.map((r) => r.ms), rssDelta: measured.map((r) => r.rss), warmup, reps: measured.length, coldMs: cold };
}

export type Profile = "default" | "raised";
export interface ErrorInfo { code: string; reason?: string; message: string }
export type Outcome = "ok" | "refused" | "failed" | "skipped";
export interface Describe { outputBytes?: number; metrics?: Record<string, number | string | boolean> }

export interface StageRecord {
  id: string;
  label: string;
  outcome: Outcome;
  /** The limits profile of the measured run: the package defaults, or per-call limits raised so that the stage can run at all. */
  profile: Profile;
  /** Present when the default profile refused: what refused. */
  defaultOutcome?: ErrorInfo;
  warmup?: number;
  reps?: number;
  ops?: number;
  coldMs?: number;
  ms?: Summary;
  rssDeltaMb?: { median: number; max: number };
  outputBytes?: number;
  metrics?: Record<string, number | string | boolean>;
  error?: ErrorInfo;
  note?: string;
}

export function isLimitRefusal(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const x = e as { code?: unknown; reason?: unknown };
  return x.code === "RESOURCE_LIMIT" || x.reason === "CORE_EDGE_LIMIT";
}

export function refusalOf(e: unknown): ErrorInfo {
  if (typeof e === "object" && e !== null) {
    const x = e as { code?: unknown; reason?: unknown; message?: unknown; name?: unknown };
    const code = typeof x.code === "string" ? x.code : typeof x.name === "string" ? x.name : "Error";
    const out: ErrorInfo = { code, message: typeof x.message === "string" ? x.message : String(e) };
    if (typeof x.reason === "string") out.reason = x.reason;
    return out;
  }
  return { code: "Error", message: String(e) };
}

export interface StageSpec<T> {
  id: string;
  label: string;
  run: (profile: Profile) => T | Promise<T>;
  describe?: (value: T) => Describe;
  /** Operations per call: every recorded time is divided by this (a per-call latency from a batch). */
  ops?: number;
  /** A refusal under the default profile is the outcome; the raised profile is not tried (FORCE beyond its budget). */
  noRaise?: boolean;
  /** Overrides the run plan for this stage. */
  plan?: Partial<RunPlan>;
}
export interface RunPlan { warmup: number; reps: number; budgetMs: number }

export interface Recorder {
  readonly records: StageRecord[];
  stage<T>(spec: StageSpec<T>): Promise<T | undefined>;
  skip(id: string, label: string, note: string): void;
}

const MB = 1024 * 1024;

export function createRecorder(plan: RunPlan, env: Pick<MeasureOptions, "now" | "gc" | "rss"> = {}): Recorder {
  const records: StageRecord[] = [];
  const finish = <T>(spec: StageSpec<T>, m: Measured<T>, profile: Profile, defaultOutcome: ErrorInfo | undefined): StageRecord => {
    const ops = spec.ops ?? 1;
    const rec: StageRecord = {
      id: spec.id, label: spec.label, outcome: "ok", profile, warmup: m.warmup, reps: m.reps, coldMs: m.coldMs / ops, ms: summarize(m.ms.map((x) => x / ops)),
      rssDeltaMb: { median: summarize(m.rssDelta).median / MB, max: Math.max(...m.rssDelta) / MB },
    };
    if (spec.ops !== undefined) rec.ops = spec.ops;
    if (defaultOutcome) rec.defaultOutcome = defaultOutcome;
    if (spec.describe) { const d = spec.describe(m.value); if (d.outputBytes !== undefined) rec.outputBytes = d.outputBytes; if (d.metrics) rec.metrics = d.metrics; }
    return rec;
  };
  return {
    records,
    async stage<T>(spec: StageSpec<T>): Promise<T | undefined> {
      const mo = { ...plan, ...(spec.plan ?? {}) };
      const opts: MeasureOptions = { warmup: mo.warmup, reps: mo.reps, budgetMs: mo.budgetMs, ...env };
      let def: ErrorInfo | undefined;
      try {
        const m = await measure(() => spec.run("default"), opts);
        records.push(finish(spec, m, "default", undefined));
        return m.value;
      } catch (e1) {
        if (!isLimitRefusal(e1)) {
          records.push({ id: spec.id, label: spec.label, outcome: "failed", profile: "default", error: refusalOf(e1) });
          return undefined;
        }
        def = refusalOf(e1);
        if (spec.noRaise) {
          records.push({ id: spec.id, label: spec.label, outcome: "refused", profile: "default", error: def });
          return undefined;
        }
      }
      try {
        const m = await measure(() => spec.run("raised"), opts);
        records.push(finish(spec, m, "raised", def));
        return m.value;
      } catch (e2) {
        records.push({ id: spec.id, label: spec.label, outcome: isLimitRefusal(e2) ? "refused" : "failed", profile: "raised", defaultOutcome: def, error: refusalOf(e2) });
        return undefined;
      }
    },
    skip(id, label, note) { records.push({ id, label, outcome: "skipped", profile: "default", note }); },
  };
}
