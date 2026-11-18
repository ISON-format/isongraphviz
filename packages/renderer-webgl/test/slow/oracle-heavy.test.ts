// Heavy oracle rows: the IGR/1 kit run over fixtures/oracles-igr with createWebglSubject (U10, level 0/1/2), the witness honesty double (U11) and the
// CHK-CAP check with non-default options (U12).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as dl from "isongraph-visualize-display-list";
import * as cv from "isongraph-visualize-display-list/canvas2d";
import * as gl from "../../src/index.js";
import { composeWebglRenderer } from "../../src/renderer.js";
import { ORACLE_DIR, REPO_DIR } from "../helpers.js";
import { HEAVY, loadOracle, runHeavy, type GlImpl } from "../oracle/runner.js";

const impl = { ...gl, composeWebglRenderer, dl: { ...dl, ...cv } } as unknown as GlImpl;
const oracle = loadOracle(ORACLE_DIR);
const IGR = join(REPO_DIR, "fixtures", "oracles-igr");

describe("heavy oracle rows", () => {
  for (const id of [...HEAVY].sort()) {
    it(`${id}`, async () => { await runHeavy(impl, oracle, oracle.byId.get(id)!, IGR); });
  }
  it("U10 detail: the full IGR/1 run through createWebglSubject is not a fail, level 2, not claimable", async () => {
    const { runConformance } = await import("isongraph-visualize-renderer-core");
    const { loadCorpus } = await import("isongraph-visualize-renderer-core/conformance/node");
    const rep = await runConformance(gl.createWebglSubject() as never, await loadCorpus(IGR), { seeds: [7] });
    expect(rep.results.filter((r) => r.verdict === "fail")).toEqual([]);
    expect(rep.partial).toBe(false);
    expect(rep.level).toBe(2);
    expect(rep.claimable).toBe(false);
    expect(rep.checked).toContain("CHK-W");
    console.log(`[kit] rows_run ${rep.rows_run}/${rep.rows_required}, level ${rep.level}, verdict ${rep.verdict}, kit ${rep.kit_digest}, corpus_digest_pinned ${rep.corpus_digest_pinned}`);
  });
});
