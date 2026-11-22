// Conformance test: every `dl:` function row of fixtures/oracles-dl (design 13.3, 14 (2)), tier-aware. The row logic is test/oracle/runner.ts (shared
// with the mutation harness). Tier `core` rows are a function on bytes; tier `both` rows are also run by the renderer package against its renderer
// (packages/renderer-canvas/test/oracle.test.ts); tier `subject` rows (U, D) belong to the renderer package and to test/differential.test.ts.
import { describe, expect, it } from "vitest";
import * as dl from "../src/index.js";
import * as cv from "../src/canvas2d/index.js";
import { ORACLE_DIGEST, ORACLE_DIR } from "./helpers.js";
import { FUNCTION_GROUPS, loadOracle, parseInput, runRow, sumsDigest, verifySums, type Impl } from "./oracle/runner.js";

const impl: Impl = { ...dl, ...cv };
const oracle = loadOracle(ORACLE_DIR);

describe("corpus integrity (13.1, 13.7)", () => {
  it("SHA256SUMS verifies every file it lists", () => { expect(verifySums(ORACLE_DIR)).toEqual([]); });
  it("the SHA256SUMS digest is the reference digest of design 13.7 (a regenerated corpus fails here, loudly)", () => {
    expect(sumsDigest(ORACLE_DIR)).toBe(ORACLE_DIGEST);
    console.log(`[oracles-dl] SHA256SUMS digest ${ORACLE_DIGEST} (draft corpus, not frozen; the claim stays claimable: false)`);
  });
  it("540 ids: G 11, N 17, X 13, Y 20, O 17, F 5, S 64, P 16, B 4, C 25, Z 7, R 63, U 21, D 6, K 251", () => {
    const by = new Map<string, number>();
    for (const r of oracle.rows) by.set(r.group, (by.get(r.group) ?? 0) + 1);
    expect(oracle.rows.length).toBe(540);
    expect(Object.fromEntries(by)).toEqual({ G: 11, N: 17, X: 13, Y: 20, O: 17, F: 5, S: 64, P: 16, B: 4, C: 25, Z: 7, R: 63, U: 21, D: 6, K: 251 });
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

// The D13 rows (R31-05; S44-S64) are checked against the corpus itself, not against the code: the expected line of each single-fault rejection is the line of
// the second record that carries the focus bit, re-derived here from the file; the controls hold at most one; the two precedence rows (S56, S57) name a
// line that is NOT the second focus record's (a record rule outranks D13, A-59). So an expectation edited to fit a reader fails here.
describe("D13 rows (S44-S64) are consistent with their files", () => {
  const focusLines = (file: string): number[] => oracle.text(file).split("\n").filter((l) => l !== "").flatMap((l, i) => {
    const r = JSON.parse(l) as unknown[];
    return (r[0] === "E" && (r[2] as number) >= 2) || (r[0] === "N" && (r[3] as number) >= 2) ? [i + 1] : [];
  });
  const d13 = oracle.rows.filter((r) => r.group === "S" && Number(r.id.slice(1)) >= 44);
  it("S44-S64 are 21 rows: 15 rejections (14 + S64) with an expect_line and 6 accepted controls", () => {
    expect(d13.map((r) => r.id)).toEqual(Array.from({ length: 21 }, (_, i) => `S${44 + i}`));
    expect(d13.filter((r) => r.error !== "").length).toBe(15);
    expect(d13.filter((r) => r.error === "").map((r) => r.id)).toEqual(["S58", "S59", "S60", "S61", "S62", "S63"]);
  });
  it("every single-fault rejection names the line of its second focus-bearing record; the precedence rows do not", () => {
    for (const r of d13.filter((x) => x.error !== "")) {
      const inp = parseInput(r) as { file: string; expect_line: number };
      expect(r.error, r.id).toBe("INVALID_INPUT/SCHEMA");
      const f = focusLines(inp.file);
      expect(f.length, r.id).toBeGreaterThanOrEqual(2);
      if (r.id === "S56" || r.id === "S57") expect(inp.expect_line, r.id).not.toBe(f[1]);
      else expect(inp.expect_line, r.id).toBe(f[1]);
    }
  });
  it("every control has at most one focus-bearing record", () => {
    for (const r of d13.filter((x) => x.error === "")) expect(focusLines((parseInput(r)["file"] as string | undefined) ?? r.input).length, r.id).toBeLessThanOrEqual(1);
  });
});

describe("tier bookkeeping", () => {
  it("the function rows are exactly the core and both rows (U and D are not function rows; K rows have no tier)", () => {
    expect(rows.filter((r) => r.tier !== "core" && r.tier !== "both")).toEqual([]);
    expect(oracle.rows.filter((r) => !FUNCTION_GROUPS.has(r.group) && r.tier !== "subject" && r.group !== "K")).toEqual([]);
  });
});
