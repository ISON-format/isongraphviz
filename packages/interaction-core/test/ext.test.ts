// The ext: rows (test/oracle/ext.ts): checks the corpus does not observe, found by the independent audit of stage A1 (reviews/32-code-audit-a1.md). They are not
// oracle rows and claim no corpus bytes. The same checks run against the extra mutants X01... of the mutation harness.
import { describe, it } from "vitest";
import * as ia from "../src/index.js";
import { ORACLE_DIR } from "./helpers.js";
import { EXT, runExt } from "./oracle/ext.js";
import { loadCorpus, type Impl } from "./oracle/runner.js";

const impl = ia as unknown as Impl;
const corpus = loadCorpus(ORACLE_DIR);
describe("ext rows", () => {
  for (const row of EXT) {
    it(`${row.id}: ${row.what}`, async () => {
      const all = await runExt(impl, corpus);
      const r = all.find((x) => x.id === row.id)!;
      if (!r.ok) throw new Error(r.detail);
    });
  }
});
