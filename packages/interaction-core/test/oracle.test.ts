// Conformance test (design 15, 16 (2)): the rows of fixtures/oracles-ia that belong to interaction-core, tier-aware.
//   core rows   E (59), I (48), V (40), L (8), B (110): byte equality (transcripts, token list, default table) or the stated error code
//   diff rows   D01-D03: runtime rows run by test/properties.test.ts (seeds from the caller); only their bookkeeping is checked here
//   K rows      mutants: test code with empty cells, run by scripts/mutate.mjs (test/slow/mutants.test.ts)
// Rows of the other families (C, P, Q, G, X, M, H) belong to a11y-companion and export-core and are not run here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as ia from "../src/index.js";
import { ORACLE_DIGEST, ORACLE_DIR, sha256 } from "./helpers.js";
import { DIFF_ROWS, GROUPS, loadCorpus, runRow, type Impl } from "./oracle/runner.js";

const impl = ia as unknown as Impl;
const corpus = loadCorpus(ORACLE_DIR);

describe("the corpus is the pinned one", () => {
  it("every file of SHA256SUMS has the listed digest, and the digest of SHA256SUMS is the reference one", () => {
    const lines = readFileSync(join(ORACLE_DIR, "SHA256SUMS"), "utf8").split("\n").filter((l) => l !== "");
    expect(lines.length).toBeGreaterThan(400);
    for (const l of lines) {
      const m = /^([0-9a-f]{64}) \*(.+)$/.exec(l)!;
      expect(sha256(corpus.read(m[2]!)), m[2]).toBe(m[1]);
    }
    expect(sha256(corpus.read("SHA256SUMS"))).toBe(ORACLE_DIGEST);
  });
  it("EXPECT.tsv has the 730 ids with the group counts of design 15.8", () => {
    expect(corpus.rows.length).toBe(730);
    const n = (g: string): number => corpus.rows.filter((r) => r.group === g).length;
    expect({ E: n("E"), I: n("I"), V: n("V"), L: n("L"), B: n("B"), D: n("D"), K: n("K") }).toEqual({ E: 59, I: 48, V: 40, L: 8, B: 110, D: 6, K: 200 });
  });
});

for (const g of ["E", "I", "V", "L", "B"]) {
  describe(`oracle rows, family ${g}, tier core`, () => {
    for (const row of corpus.rows.filter((r) => r.group === g)) {
      it(`${row.id}${row.error ? ` -> ${row.error}` : ""}`, async () => { await runRow(impl, corpus, row); });
    }
  });
}

describe("tier bookkeeping", () => {
  it("the rows of the package are exactly the core rows of E, I, V, L, B; D rows are the runtime tier; K rows are empty", () => {
    const mine = corpus.rows.filter((r) => GROUPS.has(r.group));
    expect(mine.length).toBe(59 + 48 + 40 + 8 + 110);
    expect(mine.every((r) => r.tier === "core")).toBe(true);
    for (const id of DIFF_ROWS) { const r = corpus.byId.get(id)!; expect(r.tier).toBe("diff"); expect(r.input + r.expected + r.error).toBe(""); }
    for (const r of corpus.rows.filter((x) => x.group === "K")) { expect(r.tier).toBe(""); expect(r.input + r.expected + r.error + r.scene + r.layout).toBe(""); }
  });
  it("the 16 accepted rows named by design 15.3 and the 13 accepted gap rows B14-B26 claim no bytes; the accepted rows of this package are E01, E24-E32, E44, E56, E60, E73, B02, B14-B26", () => {
    const accepted = corpus.rows.filter((r) => GROUPS.has(r.group) && r.expected === "" && r.error === "").map((r) => r.id);
    expect(accepted).toEqual(["E01", "E24", "E25", "E26", "E27", "E28", "E29", "E30", "E31", "E32", "E44", "E56", "E60", "E73", "B02", ...Array.from({ length: 13 }, (_, i) => `B${14 + i}`)]);
  });
});
