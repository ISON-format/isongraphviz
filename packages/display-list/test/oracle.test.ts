// Conformance test: every `dl:` function row of fixtures/oracles-dl (design 13.3, 14 (2)), tier-aware. The row logic is test/oracle/runner.ts (shared
// with the mutation harness). Tier `core` rows are a function on bytes; tier `both` rows are also run by the renderer package against its renderer
// (packages/renderer-canvas/test/oracle.test.ts); tier `subject` rows (U, D) belong to the renderer package and to test/differential.test.ts.
import { describe, expect, it } from "vitest";
import * as dl from "../src/index.js";
import * as cv from "../src/canvas2d/index.js";
import { ORACLE_DIGEST, ORACLE_DIR } from "./helpers.js";
import { FUNCTION_GROUPS, loadOracle, runRow, sumsDigest, verifySums, type Impl } from "./oracle/runner.js";

const impl: Impl = { ...dl, ...cv };
const oracle = loadOracle(ORACLE_DIR);

describe("corpus integrity (13.1, 13.7)", () => {
  it("SHA256SUMS verifies every file it lists", () => { expect(verifySums(ORACLE_DIR)).toEqual([]); });
  it("the SHA256SUMS digest is the reference digest of design 13.7 (a regenerated corpus fails here, loudly)", () => {
    expect(sumsDigest(ORACLE_DIR)).toBe(ORACLE_DIGEST);
    console.log(`[oracles-dl] SHA256SUMS digest ${ORACLE_DIGEST} (draft corpus, not frozen; the claim stays claimable: false)`);
  });
  it("458 ids: G 11, N 17, X 13, Y 20, O 17, F 5, S 43, P 16, B 4, C 25, Z 7, R 51, U 17, D 6, K 206", () => {
    const by = new Map<string, number>();
    for (const r of oracle.rows) by.set(r.group, (by.get(r.group) ?? 0) + 1);
    expect(oracle.rows.length).toBe(458);
    expect(Object.fromEntries(by)).toEqual({ G: 11, N: 17, X: 13, Y: 20, O: 17, F: 5, S: 43, P: 16, B: 4, C: 25, Z: 7, R: 51, U: 17, D: 6, K: 206 });
  });
  it("tiers: D rows subject, K rows empty, every other row core, both or (U) subject", () => {
    for (const r of oracle.rows) {
      if (r.group === "K") expect(r.tier, r.id).toBe("");
      else if (r.group === "D") expect(r.tier, r.id).toBe("subject");
      else expect(["core", "both", "subject"], r.id).toContain(r.tier);
    }
  });
});

const rows = oracle.rows.filter((r) => FUNCTION_GROUPS.has(r.group));
for (const t of ["core", "both"]) {
  describe(`dl: function rows, tier ${t}`, () => {
    for (const row of rows.filter((r) => r.tier === t)) {
      it(`${row.id}${row.error ? ` -> ${row.error}` : ""}`, async () => { await runRow(impl, oracle, row); });
    }
  });
}

describe("tier bookkeeping", () => {
  it("the function rows are exactly the core and both rows (U and D are not function rows; K rows have no tier)", () => {
    expect(rows.filter((r) => r.tier !== "core" && r.tier !== "both")).toEqual([]);
    expect(oracle.rows.filter((r) => !FUNCTION_GROUPS.has(r.group) && r.tier !== "subject" && r.group !== "K")).toEqual([]);
  });
});
