import { sep } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOptions, planFor } from "../src/options.js";

describe("command line and environment options", () => {
  it("defaults: all shapes, S M L N20000 XL, the per-size plans, the full out directory", () => {
    const o = parseOptions([], {});
    expect(o.sizes.map((s) => s.name)).toEqual(["S", "M", "L", "N20000", "XL"]);
    expect(o.shapes).toEqual(["sparse", "dag", "dense", "hubs", "hierarchy", "groups"]);
    expect(o.smoke).toBe(false);
    expect(o.browser).toBe(false);
    expect(o.outDir.endsWith("out")).toBe(true);
    expect(o.seed).toBe(20261118);
  });
  it("--smoke means S only with a short plan, its own out directory, no browser", () => {
    const o = parseOptions(["--smoke"], {});
    expect(o.sizes).toEqual([{ name: "S", nodes: 100 }]);
    expect(o.smoke).toBe(true);
    expect(o.plans["S"]!.reps).toBeLessThanOrEqual(5);
    expect(o.outDir.split(sep).join("/").endsWith("out/smoke")).toBe(true);
    expect(o.browser).toBe(false);
  });
  it("flags override the environment, which overrides the defaults", () => {
    const env = { BENCH_SIZES: "S,M", BENCH_SHAPES: "dag,hubs", BENCH_REPS: "4", BENCH_BROWSER: "1", BENCH_SEED: "7" };
    const a = parseOptions([], env);
    expect(a.sizes.map((s) => s.name)).toEqual(["S", "M"]);
    expect(a.shapes).toEqual(["dag", "hubs"]);
    expect(a.plans["S"]!.reps).toBe(4);
    expect(a.browser).toBe(true);
    expect(a.seed).toBe(7);
    const b = parseOptions(["--sizes", "M", "--shapes", "sparse", "--reps", "2", "--warmup", "0", "--seed", "9"], env);
    expect(b.sizes.map((s) => s.name)).toEqual(["M"]);
    expect(b.shapes).toEqual(["sparse"]);
    expect(b.plans["M"]).toMatchObject({ reps: 2, warmup: 0 });
    expect(b.seed).toBe(9);
  });
  it("refuses an unknown flag, an unknown shape, a bad number", () => {
    expect(() => parseOptions(["--nope"], {})).toThrow(/unknown option/);
    expect(() => parseOptions(["--shapes", "cube"], {})).toThrow(/unknown shape/);
    expect(() => parseOptions(["--reps", "0"], {})).toThrow();
    expect(() => parseOptions(["--sizes"], {})).toThrow();
  });
  it("--merge-probes and --no-force-probe are flags", () => {
    expect(parseOptions(["--merge-probes"], {}).mergeProbes).toBe(true);
    expect(parseOptions([], {}).mergeProbes).toBe(false);
    expect(parseOptions(["--no-force-probe"], {}).forceProbe).toBe(false);
  });
  it("planFor maps a node count to the plan of its tier", () => {
    expect(planFor(100).reps).toBeGreaterThan(planFor(10_000).reps);
    expect(planFor(100_000).warmup).toBe(0);
    expect(planFor(20_000)).toEqual(planFor(10_000));
  });
});
