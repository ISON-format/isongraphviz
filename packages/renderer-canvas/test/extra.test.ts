// The extra rows of test/oracle/runner.ts (ext:...): behaviour of this implementation that no corpus row separates (renderer-core answers with the same
// code), pinned so that a mutant of the check cannot hide behind the defence in depth. They run here and in the mutation matrix.
import { describe, expect, it } from "vitest";
import * as dl from "isongraph-visualize-display-list";
import * as cv from "isongraph-visualize-display-list/canvas2d";
import { canvasManifest, createCanvasRenderer, createCanvasSubject } from "../src/index.js";
import { AUDIT_ROWS } from "../../display-list/test/audit-rows.js";
import { ORACLE_DIR } from "./helpers.js";
import { loadOracle, runExtra, type RendererImpl } from "./oracle/runner.js";

const impl = { canvasManifest, createCanvasRenderer, createCanvasSubject, fn: { ...dl, ...cv } } as unknown as RendererImpl;

describe("extra rows", () => {
  it("every ext row passes", async () => {
    const rows = await runExtra(impl, loadOracle(ORACLE_DIR));
    expect(rows.map((r) => r.id)).toEqual(["ext:K154", ...AUDIT_ROWS.map((r) => r.id), "ext:M4", "ext:M3", "ext:B10"]);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });
});
