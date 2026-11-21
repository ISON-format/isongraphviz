// Conformance test, renderer side: the `both` rows of fixtures/oracles-dl run against the Canvas renderer, and every `subject` row (U) (design 13.3, 14 (2)).
// The function side of the same rows is packages/display-list/test/oracle.test.ts. Heavy rows (the kit run over the IGR/1 corpus, U10-U12) run in
// test/slow/oracle-heavy.test.ts.
import { describe, expect, it } from "vitest";
import * as dl from "isongraph-visualize-display-list";
import * as cv from "isongraph-visualize-display-list/canvas2d";
import { canvasManifest, createCanvasRenderer, createCanvasSubject } from "../src/index.js";
import { ORACLE_DIR } from "./helpers.js";
import { HEAVY, RENDERER_GROUPS, loadOracle, runRow, type RendererImpl } from "./oracle/runner.js";

const impl: RendererImpl = { canvasManifest, createCanvasRenderer, createCanvasSubject, fn: { ...dl, ...cv } } as unknown as RendererImpl;
const oracle = loadOracle(ORACLE_DIR);

const rows = oracle.rows.filter((r) => RENDERER_GROUPS.has(r.group) && (r.tier === "both" || r.group === "U") && !HEAVY.has(r.id));
for (const t of ["both", "subject"]) {
  describe(`dl: renderer rows, tier ${t}`, () => {
    for (const row of rows.filter((r) => r.tier === t)) {
      it(`${row.id}${row.error ? ` -> ${row.error}` : ""}`, async () => { await runRow(impl, oracle, row); });
    }
  });
}

describe("tier bookkeeping", () => {
  it("the renderer rows are the `both` rows (function and subject) and the `subject` rows U01-U09, U13-U21 (U10-U12 are heavy, D rows are runtime)", () => {
    expect(rows.filter((r) => r.tier === "both").length).toBe(oracle.rows.filter((r) => r.tier === "both" && RENDERER_GROUPS.has(r.group)).length);
    expect(rows.filter((r) => r.tier === "subject").map((r) => r.id)).toEqual(["U01", "U02", "U03", "U04", "U05", "U06", "U07", "U08", "U09", "U13", "U14", "U15", "U16", "U17", "U18", "U19", "U20", "U21"]);
    expect([...HEAVY]).toEqual(["U10", "U11", "U12"]);
  });
});
