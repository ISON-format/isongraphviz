// Conformance test: every row of fixtures/oracles-svg (design 15.7 (2)), tier-aware. The row logic is test/oracle/runner.ts (shared with the
// mutation harness). Heavy rows (the kit run over the IGR/1 corpus U10-U12, the 4 MB id T28) run in test/slow/oracle-heavy.test.ts.
import { describe, expect, it } from "vitest";
import * as impl from "../src/index.js";
import { HEAVY, loadOracle, runRow, sumsDigest, verifySums, type Impl } from "./oracle/runner.js";
import { ORACLE_DIR } from "./helpers.js";

const oracle = loadOracle(ORACLE_DIR);
const tier = (id: string): string => oracle.byId.get(id)!.tier;

describe("corpus integrity (15.3)", () => {
  it("SHA256SUMS verifies every file it lists", () => {
    expect(verifySums(ORACLE_DIR)).toEqual([]);
    console.log(`[oracles-svg] SHA256SUMS digest ${sumsDigest(ORACLE_DIR)} (draft corpus, not pinned)`);
  });
  it("249 ids: G 10, N 16, X 15, Y 17, O 22, F 6, T 32, U 13, D 4, K 114", () => {
    const by = new Map<string, number>();
    for (const r of oracle.rows) by.set(r.group, (by.get(r.group) ?? 0) + 1);
    expect(oracle.rows.length).toBe(249);
    expect(Object.fromEntries(by)).toEqual({ G: 10, N: 16, X: 15, Y: 17, O: 22, F: 6, T: 32, U: 13, D: 4, K: 114 });
  });
  it("tiers: D rows subject, K rows empty; every document row is core, both or (U) subject", () => {
    for (const r of oracle.rows) {
      if (r.group === "D") expect(r.tier).toBe("subject");
      else if (r.group === "K") expect(r.tier).toBe("");
      else expect(["core", "both", "subject"]).toContain(r.tier);
    }
  });
});

const rows = oracle.rows.filter((r) => r.group !== "K" && r.group !== "D" && !HEAVY.has(r.id));
for (const t of ["core", "both", "subject"]) {
  describe(`oracle rows, tier ${t}`, () => {
    for (const row of rows.filter((r) => r.tier === t)) {
      it(`${row.id}${row.error ? ` -> ${row.error}` : ""}`, async () => {
        await runRow(impl as unknown as Impl, oracle, row);
      });
    }
  });
}

describe("tier bookkeeping", () => {
  it("every run row has a tier", () => { for (const r of rows) expect(tier(r.id)).not.toBe(""); });
});
