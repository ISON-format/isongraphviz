// Conformance test: every `gl:` row of fixtures/oracles-gl through the implementation, tier-aware (design 13.2, 13.4, 14 (2)). The SHA256SUMS of the
// corpus is verified first. K rows are the mutation matrix (scripts/mutate.mjs, test/slow/mutants.test.ts); D rows are runtime tests.
import { describe, expect, it } from "vitest";
import * as dl from "isongraph-visualize-display-list";
import * as cv from "isongraph-visualize-display-list/canvas2d";
import * as gl from "../src/index.js";
import { composeWebglRenderer } from "../src/renderer.js";
import { ORACLE_DIR, ORACLE_DIGEST } from "./helpers.js";
import { FUNCTION_GROUPS, HEAVY, loadOracle, runRow, sumsDigest, verifySums, type GlImpl } from "./oracle/runner.js";

const impl: GlImpl = { ...gl, composeWebglRenderer, dl: { ...dl, ...cv } } as unknown as GlImpl;
const oracle = loadOracle(ORACLE_DIR);

describe("the corpus", () => {
  it("SHA256SUMS verifies and its digest is the reference digest e7717091...", () => {
    expect(verifySums(ORACLE_DIR)).toEqual([]);
    expect(sumsDigest(ORACLE_DIR)).toBe(ORACLE_DIGEST);
  });
  it("has 371 ids", () => { expect(oracle.rows.length).toBe(371); });
});

for (const t of ["core", "both", "subject"]) {
  describe(`gl: function rows, tier ${t}`, () => {
    for (const row of oracle.rows.filter((r) => FUNCTION_GROUPS.has(r.group) && r.tier === t && !HEAVY.has(r.id))) {
      it(`${row.id}${row.error ? ` -> ${row.error}` : ""}`, async () => { await runRow(impl, oracle, row); });
    }
  });
}
