import { describe, expect, it } from "vitest";
import { CONSTRUCTION_UNITS, DEFAULT_FORCE_BUDGET, checkBudget, forceWork, resolveBudget } from "../src/force.js";
import { LayoutError } from "../src/errors.js";

const err = (f: () => unknown) => { try { f(); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason ?? ""}`; throw e; } return "no error"; };

describe("FORCE execution budget (docs/specs/IGL-1.md §7.3)", () => {
  it("the default is the measured one", () => {
    expect(DEFAULT_FORCE_BUDGET).toEqual({ maxNodes: 2000, maxWork: 100_000_000 });
    expect(Object.isFrozen(DEFAULT_FORCE_BUDGET)).toBe(true);
  });
  it("work = iterations x (n(n-1)/2 + 3E + 8n + 4) + 200 x (n + E) for n >= 2, exact in BigInt", () => {
    expect(forceWork(1000, 1999, 170)).toBe(170n * (499500n + 3n * 1999n + 8000n + 4n) + 200n * 2999n);
    expect(forceWork(2, 1, 10)).toBe(10n * (1n + 3n + 16n + 4n) + 200n * 3n);
    expect(CONSTRUCTION_UNITS).toBe(200n);
  });
  it("Core returns immediately for n <= 1, so only construction is charged there", () => {
    expect(forceWork(0, 0, 170)).toBe(0n);
    expect(forceWork(1, 0, 170)).toBe(200n);
    expect(forceWork(1, 0, 2 ** 31 - 1)).toBe(200n);
    expect(err(() => checkBudget(1, 0, 2 ** 31 - 1, DEFAULT_FORCE_BUDGET))).toBe("no error");
  });
  it("does not overflow where doubles would: 2^31 iterations x 2,000 nodes", () => {
    expect(forceWork(2000, 4000, 2 ** 31 - 1)).toBe(BigInt(2 ** 31 - 1) * (1999000n + 12000n + 16000n + 4n) + 200n * 6000n);
  });
  it("a TINY graph with a huge iteration count is refused (Core pays per iteration per node and edge)", () => {
    // n = 2, 1 edge: 24 units per iteration. The first formula charged 2, so 99,999,600 iterations passed and blocked for 13.6 s.
    expect(err(() => checkBudget(2, 1, 99_999_600, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(err(() => checkBudget(2, 1, 4_000_000, DEFAULT_FORCE_BUDGET))).toBe("no error"); // 96,000,600
    expect(err(() => checkBudget(2, 1, 4_200_000, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/WORK_LIMIT"); // 100,800,600
  });
  it("the revised per-iteration charge dominates the measured cost at every recorded point (docs/specs/IGL-1.md §7.3)", () => {
    // [n, E, measured units of 17 ns per iteration, Node 24 and Node 22 maxima]
    const measured: Array<[number, number, number]> = [[2, 0, 7.5], [2, 2, 10.2], [3, 3, 15.0], [5, 5, 35.3], [5, 15, 52.0], [10, 0, 69.5], [10, 20, 116.3], [20, 40, 307.8], [50, 100, 1292.0], [100, 0, 4212.4], [100, 200, 4765.1], [200, 400, 18734.7]];
    for (const [n, e, units] of measured) {
      const charged = Number(forceWork(n, e, 1)) - Number(CONSTRUCTION_UNITS) * (n + e);
      expect(charged, `n=${n} E=${e}`).toBeGreaterThanOrEqual(units);
    }
  });
  it("resolveBudget merges over the default and validates", () => {
    expect(resolveBudget(undefined)).toEqual(DEFAULT_FORCE_BUDGET);
    expect(resolveBudget({ maxNodes: 5 })).toEqual({ maxNodes: 5, maxWork: 100_000_000 });
    expect(resolveBudget({ maxNodes: 5, maxWork: 10 })).toEqual({ maxNodes: 5, maxWork: 10 });
  });
  it("rejects invalid budgets: zero, negative, fractional, NaN, string, unknown key, non-object", () => {
    for (const b of [{ maxNodes: 0 }, { maxWork: -1 }, { maxNodes: 1.5 }, { maxWork: Number.NaN }, { maxNodes: "9" }, { maxNode: 5 }, 5, null]) {
      expect(err(() => resolveBudget(b)), JSON.stringify(b)).toBe("INVALID_POLICY/INVALID_BUDGET");
    }
  });
  it("NODE_LIMIT when n exceeds maxNodes; exactly maxNodes is allowed", () => {
    expect(err(() => checkBudget(3, 0, 0, { maxNodes: 2, maxWork: 1e9 }))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(err(() => checkBudget(2, 0, 0, { maxNodes: 2, maxWork: 1e9 }))).toBe("no error");
  });
  it("WORK_LIMIT when W exceeds maxWork; exactly maxWork is allowed", () => {
    expect(err(() => checkBudget(100, 0, 10_000_000, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    const w = Number(forceWork(100, 200, 170));
    expect(err(() => checkBudget(100, 200, 170, { maxNodes: 2000, maxWork: w }))).toBe("no error");
    expect(err(() => checkBudget(100, 200, 170, { maxNodes: 2000, maxWork: w - 1 }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
  it("Core's default workload passes at 1,000 nodes and fails at 1,100", () => {
    expect(err(() => checkBudget(1000, 2000, 170, DEFAULT_FORCE_BUDGET))).toBe("no error");
    expect(err(() => checkBudget(1100, 2200, 170, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/WORK_LIMIT"); // 105.4M + construction
  });
  it("zero iterations is NOT zero cost: an edge-heavy input is refused by the construction term", () => {
    expect(err(() => checkBudget(2000, 4000, 0, DEFAULT_FORCE_BUDGET))).toBe("no error"); // 200 x 6,000 = 1.2M
    expect(err(() => checkBudget(2000, 400_000, 0, DEFAULT_FORCE_BUDGET))).toBe("no error"); // 200 x 402,000 = 80.4M
    expect(err(() => checkBudget(2000, 500_000, 0, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/WORK_LIMIT"); // 100.4M
    expect(err(() => checkBudget(2000, 1_000_000, 0, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/WORK_LIMIT"); // 200.4M; measured ~2.8 s of construction
    expect(err(() => checkBudget(2001, 0, 0, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
  });
  it("the node limit is checked before the work limit", () => {
    expect(err(() => checkBudget(5000, 0, 2 ** 31 - 1, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
  });
  it("a caller who raises the budget changes nothing about validity, only about permission", () => {
    expect(err(() => checkBudget(3000, 0, 1, { maxNodes: 5000, maxWork: 1e9 }))).toBe("no error");
  });
});
