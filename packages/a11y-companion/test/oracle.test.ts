// Conformance test (design 15, 16 (2)): the rows of fixtures/oracles-ia that belong to a11y-companion, tier-aware.
//   core rows   C (20), P (11), Q (4), G (132: G01-G44 and the R32-14 / R32-15 rows G45-G140), M (5): byte equality (trees, plans, logs, gate reports, composed manifests) or the stated error code
//   diff rows   D04-D06: runtime rows run by test/properties.test.ts (seeds from the caller); only their bookkeeping is checked here
//   K rows      mutants: test code with empty cells, run by scripts/mutate.mjs (test/slow/mutants.test.ts)
// Rows of the other families belong to interaction-core (E, I, V, L, B) and export-core (X, H) and are not run here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as ia from "../src/index.js";
import { ORACLE_DIGEST, ORACLE_DIR, sha256 } from "./helpers.js";
import { DIFF_ROWS, GROUPS, errKey, loadCorpus, nonEmpty, runAll, runRow, same, type Corpus, type Impl } from "./oracle/runner.js";

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
  it("EXPECT.tsv has the 1163 ids with the group counts of design 15.8", () => {
    expect(corpus.rows.length).toBe(1163);
    const n = (g: string): number => corpus.rows.filter((r) => r.group === g).length;
    expect({ C: n("C"), P: n("P"), Q: n("Q"), G: n("G"), M: n("M"), D: n("D"), K: n("K") }).toEqual({ C: 20, P: 11, Q: 4, G: 132, M: 5, D: 6, K: 346 });
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
    expect(mine.length).toBe(20 + 11 + 4 + 132 + 5);
    expect(mine.every((r) => r.tier === "core")).toBe(true);
    for (const id of DIFF_ROWS) { const r = corpus.byId.get(id)!; expect(r.tier).toBe("diff"); expect(r.input + r.expected + r.error).toBe(""); }
    for (const r of corpus.rows.filter((x) => x.group === "K")) { expect(r.tier).toBe(""); expect(r.input + r.expected + r.error + r.scene + r.layout).toBe(""); }
  });
  it("no row of this package is an accepted row (design 15.3): every row names an expected file or an error", () => {
    expect(corpus.rows.filter((r) => GROUPS.has(r.group) && r.expected === "" && r.error === "").map((r) => r.id)).toEqual([]);
  });
});

// The rulings R32-14 (ITEM_DUPLICATE once per repeated position value) and R32-15 (an ill-typed tree field is INVALID_TREE/SCHEMA before any check) of 2026-11-21:
// rows G45-G140. Non-vacuity: the rows are found by their id range and by the form of their input (a gate input with a `tree` path), counted, and each one is
// observed to reach runAccessibilityGate; the error rows are observed to throw INVALID_TREE/SCHEMA out of it, the report rows to return the stored bytes.
describe("the R32-14 and R32-15 rows (G45-G140) are executed, not skipped", () => {
  const isNew = (r: { group: string; id: string }): boolean => r.group === "G" && Number(r.id.slice(1)) >= 45;
  const rows = corpus.rows.filter(isNew);
  const isGateInput = (r: { input: string }): boolean => { const j = JSON.parse(r.input) as Record<string, unknown>; return typeof j["tree"] === "string" && typeof j["state"] === "string"; };
  it("there are 96 rows of the gate-input form: 15 R32-14 rows, 68 error rows INVALID_TREE/SCHEMA, 13 other report rows", () => {
    expect(nonEmpty(rows, "R32-14/R32-15 rows")).toHaveLength(96);
    expect(rows.every(isGateInput)).toBe(true);
    expect(rows.filter((r) => r.error === "INVALID_TREE/SCHEMA")).toHaveLength(68);
    expect(rows.filter((r) => r.error === "")).toHaveLength(28);
    expect(rows.filter((r) => r.error !== "" && r.error !== "INVALID_TREE/SCHEMA")).toEqual([]);
    expect(rows.filter((r) => r.error === "").every((r) => r.expected === `gates/${r.id}.gate.json`)).toBe(true);
  });
  it("every row reaches runAccessibilityGate once; error rows throw INVALID_TREE/SCHEMA there; report rows return the stored bytes", async () => {
    const seen: { id: string; threw: string | undefined; bytes?: Uint8Array }[] = [];
    let current = "";
    const spy = {
      ...impl,
      runAccessibilityGate: (g: never): unknown => {
        try { const r = impl.runAccessibilityGate(g); seen.push({ id: current, threw: undefined, bytes: impl.serializeGateReport(r as never) }); return r; }
        catch (e) { seen.push({ id: current, threw: errKey(e) }); throw e; }
      },
    } as Impl;
    for (const row of rows) { current = row.id; await runRow(spy, corpus, row); }
    expect(seen.map((x) => x.id)).toEqual(rows.map((r) => r.id));
    for (const row of rows) {
      const o = seen.find((x) => x.id === row.id)!;
      if (row.error !== "") expect(o.threw, row.id).toBe(row.error);
      else { expect(o.threw, row.id).toBeUndefined(); same(o.bytes!, corpus.read(row.expected), row.id); }
    }
  });
  it("a runner that finds no rows fails (the guard is not vacuous)", async () => {
    expect(() => nonEmpty([], "x")).toThrow(/no rows/);
    const empty: Corpus = { ...corpus, rows: [], byId: new Map() };
    await expect(runAll(impl, empty)).rejects.toThrow(/no rows/);
    expect(await runAll(impl, corpus)).not.toHaveLength(0);
  });
});
