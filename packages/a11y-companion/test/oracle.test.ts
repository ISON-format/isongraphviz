// Conformance test (design 15, 16 (2)): the rows of fixtures/oracles-ia that belong to a11y-companion, tier-aware.
//   core rows   C (20), P (11), Q (4), G (36), M (5): byte equality (trees, plans, logs, gate reports, composed manifests) or the stated error code
//   diff rows   D04-D06: runtime rows run by test/properties.test.ts (seeds from the caller); only their bookkeeping is checked here
//   K rows      mutants: test code with empty cells, run by scripts/mutate.mjs (test/slow/mutants.test.ts)
// Rows of the other families belong to interaction-core (E, I, V, L, B) and export-core (X, H) and are not run here.
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
  it("EXPECT.tsv has the 410 ids with the group counts of design 15.8", () => {
    expect(corpus.rows.length).toBe(410);
    const n = (g: string): number => corpus.rows.filter((r) => r.group === g).length;
    expect({ C: n("C"), P: n("P"), Q: n("Q"), G: n("G"), M: n("M"), D: n("D"), K: n("K") }).toEqual({ C: 20, P: 11, Q: 4, G: 36, M: 5, D: 6, K: 128 });
  });
});

for (const g of ["C", "P", "Q", "G", "M"]) {
  describe(`oracle rows, family ${g}, tier core`, () => {
    for (const row of corpus.rows.filter((r) => r.group === g)) {
      it(`${row.id}${row.error ? ` -> ${row.error}` : ""}`, async () => { await runRow(impl, corpus, row); });
    }
  });
}

describe("tier bookkeeping", () => {
  it("the rows of the package are exactly the core rows of C, P, Q, G, M; D04-D06 are the runtime tier; K rows are empty", () => {
    const mine = corpus.rows.filter((r) => GROUPS.has(r.group));
    expect(mine.length).toBe(20 + 11 + 4 + 36 + 5);
    expect(mine.every((r) => r.tier === "core")).toBe(true);
    for (const id of DIFF_ROWS) { const r = corpus.byId.get(id)!; expect(r.tier).toBe("diff"); expect(r.input + r.expected + r.error).toBe(""); }
    for (const r of corpus.rows.filter((x) => x.group === "K")) { expect(r.tier).toBe(""); expect(r.input + r.expected + r.error + r.scene + r.layout).toBe(""); }
  });
  it("no row of this package is an accepted row (design 15.3): every row names an expected file or an error", () => {
    expect(corpus.rows.filter((r) => GROUPS.has(r.group) && r.expected === "" && r.error === "").map((r) => r.id)).toEqual([]);
  });
});
