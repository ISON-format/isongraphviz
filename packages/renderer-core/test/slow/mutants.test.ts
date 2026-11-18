// The mutation matrix: every mutant must fail the check it names, on the mini corpus; the reference must pass (K01 in kit.test.ts).
import { describe, expect, it } from "vitest";
import { announcementFor } from "../../src/a11y.js";
import { reduce } from "../../src/reduce.js";
import { initialState } from "../../src/state.js";
import { buildRenderModel } from "../../src/model.js";
import { MUTANTS, canned, divergesOnRandom, mutatedHit } from "./mutants.js";
import { igl, o1Scene } from "../helpers.js";
import { kit, miniCorpus } from "../kitHelpers.js";

const SEEDS = [5, 6, 7];
describe("K02-K82: every subject-level mutant fails the check it names (no allowance)", () => {
  for (const [id, m] of Object.entries(MUTANTS)) {
    it(`${id} fails ${m.check}`, async () => {
      const corpus = await miniCorpus();
      // the differential tier (D) is skipped here: it dominates the time and no mutant is named CHK-DIFF; K39/K40 below run it
      const rep = await kit(m.subject(), corpus, { seeds: SEEDS, only: corpus.expect.map((r) => r.id).filter((id) => id[0] !== "D") });
      const failed = rep.results.filter((r) => r.verdict === "fail");
      expect(rep.verdict).toBe("fail");
      expect(failed.map((r) => r.check), `${id}: ${JSON.stringify(failed.slice(0, 3))}`).toContain(m.check);
    }, 60_000);
  }
  it("covers exactly the mutants of the design that are subject-level (K54 is checked below, K37/K38 in kit.test.ts, K39/K40 here)", () => {
    const want = ["K02", "K03", "K04", "K05", "K06", "K07", "K08", "K09", "K10", "K11", "K12", "K13", "K14", "K15", "K16", "K17", "K18", "K19", "K20", "K21", "K22", "K23", "K24", "K25", "K26", "K27", "K28", "K29", "K30", "K31", "K32", "K33", "K34", "K35", "K36", "K41", "K42", "K43", "K44", "K45", "K46", "K47", "K48", "K49", "K50", "K51", "K52", "K53", "K55", "K56", "K57", "K58", "K59", "K60", "K61", "K62", "K68", "K69", "K72", "K73", "K74", "K75", "K76", "K78", "K80", "K81", "K82"];
    expect(Object.keys(MUTANTS).sort()).toEqual(want);
  });
});

describe("K39 and K40: only the unseen-seed differential tier catches them", () => {
  it("K39 replays the public vectors: it passes every file-driven vector and fails CHK-DIFF", async () => {
    const corpus = await miniCorpus();
    const rep = await kit(canned(corpus), corpus, { seeds: SEEDS });
    const failed = rep.results.filter((r) => r.verdict === "fail");
    expect(failed.filter((r) => r.check !== "CHK-DIFF").map((r) => `${r.id}:${r.check}:${r.detail}`)).toEqual([]);
    expect(failed.map((r) => r.check)).toContain("CHK-DIFF");
  }, 60_000);
  it("K40 diverges only on random input and fails CHK-DIFF alone", async () => {
    const rep = await kit(divergesOnRandom(), await miniCorpus(), { seeds: SEEDS });
    const failed = rep.results.filter((r) => r.verdict === "fail");
    expect(failed.length).toBeGreaterThan(0);
    expect(new Set(failed.map((r) => r.check))).toEqual(new Set(["CHK-DIFF"]));
  }, 60_000);
});

describe("K54: the announcement uses the effective, not the explicit, hidden count (core-function mutant)", () => {
  it("the A15 expectation of the corpus differs from what the mutated function would announce", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const s0 = initialState(m, { width: 900, height: 600 });
    const r = reduce(m, s0, { type: "set-hidden", targets: [{ node: { id: "s:ann", type: "person" } }], hidden: true });
    const ev = r.events.find((e) => e.type === "visibility-changed")!;
    const mutated = `${r.state.hidden.nodes.length + r.state.hidden.edges.length} hidden.`; // the explicit set only
    expect(announcementFor(ev, m, r.state)).toBe("2 hidden.");
    expect(mutated).toBe("1 hidden.");
    expect(mutated).not.toBe(announcementFor(ev, m, r.state));
  });
});

describe("the hit mutants are faithful copies except for their one change", () => {
  it("mutatedHit with no options equals the reference hitTest over a lattice", async () => {
    const { hitTest } = await import("../../src/hit.js");
    const m = await buildRenderModel(igl("scenes/mixed20.scene.json"), igl("layouts/F04.layout.json"));
    const s = initialState(m, { width: 900, height: 600 });
    for (let x = -3; x <= 903; x += 13.25) for (let y = -3; y <= 603; y += 11.5) expect(JSON.stringify(mutatedHit(m, s, { x, y }, {}) ?? null)).toBe(JSON.stringify(hitTest(m, s, { x, y }) ?? null));
  });
});
