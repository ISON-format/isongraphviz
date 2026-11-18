import { describe, expect, it } from "vitest";
import { createRecorder, isLimitRefusal, measure, refusalOf } from "../src/harness.js";

/** A fake clock: every call of fn advances it by the next duration of the list (the last repeats). */
function fake(durations: number[]) {
  let t = 0, i = 0;
  return { now: () => t, run: () => { t += durations[Math.min(i, durations.length - 1)]!; i++; return i; }, calls: () => i };
}

describe("measure", () => {
  it("runs warmup + reps times, records the reps only, keeps the first run's value", async () => {
    const f = fake([5]);
    const m = await measure(() => f.run(), { warmup: 2, reps: 4, now: f.now, gc: () => undefined, rss: () => 0 });
    expect(f.calls()).toBe(6);
    expect(m.ms).toEqual([5, 5, 5, 5]);
    expect(m.value).toBe(1);
    expect(m.warmup).toBe(2);
    expect(m.reps).toBe(4);
    expect(m.coldMs).toBe(5);
  });
  it("the first (cold) run is a measured rep when there is no warmup", async () => {
    const f = fake([9, 3, 3]);
    const m = await measure(() => f.run(), { warmup: 0, reps: 3, now: f.now, gc: () => undefined, rss: () => 0 });
    expect(m.ms).toEqual([9, 3, 3]);
    expect(m.coldMs).toBe(9);
  });
  it("awaits an asynchronous function and times the settled promise", async () => {
    let t = 0;
    const m = await measure(async () => { await Promise.resolve(); t += 7; return "x"; }, { warmup: 0, reps: 2, now: () => t, gc: () => undefined, rss: () => 0 });
    expect(m.ms).toEqual([7, 7]);
    expect(m.value).toBe("x");
  });
  it("the time budget cuts repetitions and warmup but always leaves at least one measured rep", async () => {
    const f = fake([400]);
    const m = await measure(() => f.run(), { warmup: 3, reps: 10, budgetMs: 1000, now: f.now, gc: () => undefined, rss: () => 0 });
    expect(m.ms.length).toBeGreaterThanOrEqual(1);
    expect(f.calls()).toBeLessThanOrEqual(3);
    const slow = fake([5000]);
    const one = await measure(() => slow.run(), { warmup: 3, reps: 10, budgetMs: 1000, now: slow.now, gc: () => undefined, rss: () => 0 });
    expect(one.ms).toEqual([5000]);
    expect(one.warmup).toBe(0);
  });
  it("records the RSS growth of each rep around the call, after a collection", async () => {
    let rss = 100, collections = 0;
    const m = await measure(() => { rss += 10; return 0; }, { warmup: 0, reps: 3, now: () => 0, gc: () => { collections++; }, rss: () => rss });
    expect(m.rssDelta).toEqual([10, 10, 10]);
    expect(collections).toBeGreaterThanOrEqual(3);
  });
  it("an error of the first run propagates", async () => {
    await expect(measure(() => { throw new Error("boom"); }, { warmup: 1, reps: 1, now: () => 0, gc: () => undefined, rss: () => 0 })).rejects.toThrow("boom");
  });
});

describe("refusals", () => {
  const err = (code: string, reason?: string) => Object.assign(new Error("x"), { code, reason });
  it("recognises RESOURCE_LIMIT and the Core edge limit as refusals, nothing else", () => {
    expect(isLimitRefusal(err("RESOURCE_LIMIT", "NODE_LIMIT"))).toBe(true);
    expect(isLimitRefusal(err("UNSUPPORTED_SCENE", "CORE_EDGE_LIMIT"))).toBe(true);
    expect(isLimitRefusal(err("INVALID_INPUT", "SCHEMA"))).toBe(false);
    expect(isLimitRefusal(new RangeError("Invalid string length"))).toBe(false);
    expect(isLimitRefusal("text")).toBe(false);
  });
  it("describes an error by code, reason and message", () => {
    expect(refusalOf(err("RESOURCE_LIMIT", "NODE_LIMIT"))).toMatchObject({ code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" });
    expect(refusalOf(new RangeError("Invalid string length"))).toMatchObject({ code: "RangeError", message: "Invalid string length" });
  });
});

describe("the recorder's stage", () => {
  const plan = { warmup: 0, reps: 2, budgetMs: 10_000 };
  const quiet = { now: () => 0, gc: () => undefined, rss: () => 0 };
  it("an ok stage records the summary, the output bytes and returns the value", async () => {
    const rec = createRecorder(plan, quiet);
    const v = await rec.stage({ id: "a", label: "A", run: () => 42, describe: () => ({ outputBytes: 7, metrics: { n: 1 } }) });
    expect(v).toBe(42);
    expect(rec.records).toHaveLength(1);
    expect(rec.records[0]).toMatchObject({ id: "a", outcome: "ok", profile: "default", outputBytes: 7, metrics: { n: 1 } });
    expect(rec.records[0]!.ms?.n).toBe(2);
  });
  it("a limit refusal under the default profile is recorded and the raised profile is measured", async () => {
    const rec = createRecorder(plan, quiet);
    const profiles: string[] = [];
    const v = await rec.stage({
      id: "b", label: "B",
      run: (p) => { profiles.push(p); if (p === "default") throw Object.assign(new Error("lim"), { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" }); return "ok"; },
    });
    expect(v).toBe("ok");
    expect(rec.records[0]).toMatchObject({ outcome: "ok", profile: "raised", defaultOutcome: { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" } });
    expect(profiles[0]).toBe("default");
    expect(profiles.includes("raised")).toBe(true);
  });
  it("noRaise records the refusal as the outcome and does not run the raised profile", async () => {
    const rec = createRecorder(plan, quiet);
    const v = await rec.stage({ id: "c", label: "C", noRaise: true, run: () => { throw Object.assign(new Error("lim"), { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" }); } });
    expect(v).toBeUndefined();
    expect(rec.records[0]).toMatchObject({ outcome: "refused", error: { code: "RESOURCE_LIMIT", reason: "NODE_LIMIT" } });
  });
  it("another error is a failure, not a refusal", async () => {
    const rec = createRecorder(plan, quiet);
    const v = await rec.stage({ id: "d", label: "D", run: () => { throw new RangeError("Invalid string length"); } });
    expect(v).toBeUndefined();
    expect(rec.records[0]).toMatchObject({ outcome: "failed", error: { code: "RangeError" } });
  });
  it("a refusal under both profiles is recorded as refused with the raised error", async () => {
    const rec = createRecorder(plan, quiet);
    const v = await rec.stage({ id: "e", label: "E", run: () => { throw Object.assign(new Error("lim"), { code: "RESOURCE_LIMIT", reason: "HARD" }); } });
    expect(v).toBeUndefined();
    expect(rec.records[0]).toMatchObject({ outcome: "refused", defaultOutcome: { code: "RESOURCE_LIMIT" }, error: { reason: "HARD" } });
  });
  it("skip records a skipped stage with its reason", () => {
    const rec = createRecorder(plan, quiet);
    rec.skip("f", "F", "needs the render model");
    expect(rec.records[0]).toMatchObject({ id: "f", outcome: "skipped", note: "needs the render model" });
  });
  it("ops divides every time by the number of operations per call", async () => {
    let t = 0;
    const rec = createRecorder({ warmup: 0, reps: 2, budgetMs: 10_000 }, { now: () => t, gc: () => undefined, rss: () => 0 });
    await rec.stage({ id: "g", label: "G", ops: 10, run: () => { t += 50; return 0; } });
    expect(rec.records[0]!.ms?.median).toBe(5);
    expect(rec.records[0]!.ops).toBe(10);
  });
});
