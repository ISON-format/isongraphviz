import { describe, expect, it } from "vitest";
import { CONSTRUCTION_UNITS, DEFAULT_FORCE_BUDGET, checkBudget, forceWork, resolveBudget } from "../src/force.js";
import { LayoutError } from "../src/errors.js";

const err = (f: () => unknown) => { try { f(); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason ?? ""}`; throw e; } return "no error"; };

describe("FORCE execution budget (design 7.3; numbers from igl-evidence/budget-measurement)", () => {
  it("the default is the measured one", () => {
    expect(DEFAULT_FORCE_BUDGET).toEqual({ maxNodes: 2000, maxWork: 100_000_000 });
    expect(Object.isFrozen(DEFAULT_FORCE_BUDGET)).toBe(true);
  });
  it("work = iterations x (n(n-1)/2 + edges) + 200 x (nodes + edges), exact in BigInt", () => {
    expect(forceWork(1000, 1999, 170)).toBe(170n * (499500n + 1999n) + 200n * 2999n);
    expect(forceWork(0, 0, 170)).toBe(0n);
    expect(forceWork(1, 0, 170)).toBe(200n);
    expect(forceWork(2, 1, 10)).toBe(10n * (1n + 1n) + 200n * 3n);
    expect(CONSTRUCTION_UNITS).toBe(200n);
  });
  it("does not overflow where doubles would: 2^31 iterations x 2,000 nodes", () => {
    expect(forceWork(2000, 4000, 2 ** 31 - 1)).toBe(BigInt(2 ** 31 - 1) * (1999000n + 4000n) + 200n * 6000n);
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
    expect(err(() => checkBudget(1100, 2200, 170, DEFAULT_FORCE_BUDGET))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
  it("zero iterations is NOT zero cost (owner re-review): an edge-heavy input is refused by the construction term", () => {
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
