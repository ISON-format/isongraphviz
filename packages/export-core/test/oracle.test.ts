// Conformance test (design 15, 16 (2)): the rows of fixtures/oracles-ia that belong to export-core, tier-aware: X (25) and H (7), core tier, byte equality or
// the stated error code. The accepted row X10 claims no bytes (design 15.3). K rows are mutants (scripts/mutate.mjs); D rows belong to a11y-companion and
// interaction-core. Rows of the other families are not run here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as ex from "../src/index.js";
import { ORACLE_DIGEST, ORACLE_DIR, sha256 } from "./helpers.js";
import { GROUPS, loadCorpus, runRow, type Impl } from "./oracle/runner.js";

const impl = ex as unknown as Impl;
const corpus = loadCorpus(ORACLE_DIR);

describe("the corpus is the pinned one", () => {
  it("every file of SHA256SUMS has the listed digest, and the digest of SHA256SUMS is the reference one", () => {
    const lines = readFileSync(join(ORACLE_DIR, "SHA256SUMS"), "utf8").split("\n").filter((l) => l !== "");
    for (const l of lines) { const m = /^([0-9a-f]{64}) \*(.+)$/.exec(l)!; expect(sha256(corpus.read(m[2]!)), m[2]).toBe(m[1]); }
    expect(sha256(corpus.read("SHA256SUMS"))).toBe(ORACLE_DIGEST);
  });
  it("EXPECT.tsv has the group counts of design 15.8 for X and H", () => {
    const n = (g: string): number => corpus.rows.filter((r) => r.group === g).length;
    expect({ X: n("X"), H: n("H") }).toEqual({ X: 25, H: 7 });
  });
});
for (const g of ["X", "H"]) {
  describe(`oracle rows, family ${g}, tier core`, () => {
    for (const row of corpus.rows.filter((r) => r.group === g)) it(`${row.id}${row.error ? ` -> ${row.error}` : ""}`, async () => { await runRow(impl, corpus, row); });
  });
}
describe("tier bookkeeping", () => {
  it("the rows of the package are the core rows of X and H; the only accepted row (no bytes claimed) is X10", () => {
    const mine = corpus.rows.filter((r) => GROUPS.has(r.group));
    expect(mine.length).toBe(32);
    expect(mine.every((r) => r.tier === "core")).toBe(true);
    expect(mine.filter((r) => r.expected === "" && r.error === "").map((r) => r.id)).toEqual(["X10"]);
  });
});
