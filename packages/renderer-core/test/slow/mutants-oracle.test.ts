// Audit I-6/I-7: the mutation matrix against the INDEPENDENT oracle corpus (fixtures/oracles-igr, read only), requiring the NAMED check to fail.
// Rev 5: every mutant must be caught by its NAMED check; there is no known-gap allowance.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCorpus } from "../../src/conformance/node.js";
import { runConformance } from "../../src/conformance/run.js";
import type { Corpus } from "../../src/conformance/corpus.js";
import { FIXTURES } from "../helpers.js";
import { referenceSubject } from "../kitHelpers.js";
import { MUTANTS, canned, divergesOnRandom } from "./mutants.js";

const DIR = join(FIXTURES, "oracles-igr");
const present = existsSync(join(DIR, "SHA256SUMS")) && existsSync(join(DIR, "EXPECT.tsv"));
const SEEDS = [1, 2, 3];

let cached: Promise<{ corpus: Corpus; pin: string }> | undefined;
const oracle = (): Promise<{ corpus: Corpus; pin: string }> => (cached ??= (async () => {
  const corpus = await loadCorpus(DIR);
  return { corpus, pin: createHash("sha256").update(corpus.sums).digest("hex") };
})());

describe.skipIf(!present)("mutation matrix on fixtures/oracles-igr: the named check must fail", () => {
  it("the reference passes at level 1 with 0 failures", async () => {
    const { corpus, pin } = await oracle();
    const rep = await runConformance(referenceSubject(), corpus, { seeds: SEEDS });
    expect(rep.results.filter((r) => r.verdict === "fail")).toEqual([]);
    expect(rep.level).toBe(1);
    expect(rep.partial).toBe(false);
    expect(rep.corpus_digest_pinned).toBe(false); // no caller input can pin: only the (still undefined) compiled-in constant
    expect(rep.claimable).toBe(false);
    const smuggled = await runConformance(referenceSubject(), corpus, { seeds: SEEDS, pinnedDigest: pin, requiredIds: ["M01"] } as never);
    expect(smuggled.corpus_digest_pinned).toBe(false);
    expect(smuggled.rows_required).toBe(354);
  }, 120_000);

  for (const [id, m] of Object.entries(MUTANTS)) {
    it(`${id} fails ${m.check}`, async () => {
      const { corpus, pin } = await oracle();
      // the differential tier (D) is skipped here: it dominates the time and no mutant is named CHK-DIFF; K39/K40 below run it
      const rep = await runConformance(m.subject(), corpus, { seeds: SEEDS, only: corpus.expect.map((r) => r.id).filter((id) => id[0] !== "D" && id[0] !== "K") });
      const checks = new Set(rep.results.filter((r) => r.verdict === "fail").map((r) => r.check));
      expect(rep.verdict, `${id} must at least fail the corpus`).toBe("fail");
      expect(checks.has(m.check as never), `${id} named ${m.check}, failed ${[...checks].join(",")}`).toBe(true);
    }, 120_000);
  }

  it("K39 (canned replay) and K40 (random-only divergence) fail only the differential tier", async () => {
    const { corpus, pin } = await oracle();
    for (const s of [canned(corpus), divergesOnRandom()]) {
      const rep = await runConformance(s, corpus, { seeds: SEEDS });
      expect(new Set(rep.results.filter((r) => r.verdict === "fail").map((r) => r.check))).toEqual(new Set(["CHK-DIFF"]));
    }
  }, 120_000);
});
