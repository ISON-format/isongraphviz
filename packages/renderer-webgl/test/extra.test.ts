// The extra rows of test/oracle/ext.ts against src (the harness runs them against the mutants, audit M-11).
import { describe, expect, it } from "vitest";
import * as dl from "isongraph-visualize-display-list";
import * as cv from "isongraph-visualize-display-list/canvas2d";
import * as gl from "../src/index.js";
import { composeWebglRenderer } from "../src/renderer.js";
import { readOracle } from "./helpers.js";
import { runExtra } from "./oracle/ext.js";
import type { GlImpl } from "./oracle/runner.js";

const impl = { ...gl, composeWebglRenderer, dl: { ...dl, ...cv } } as unknown as GlImpl;

describe("extra rows", () => {
  it("every ext row passes", async () => {
    const rows = await runExtra(impl, readOracle("plan/G01.glplan"));
    expect(rows.map((r) => r.id)).toEqual(["ext:A01", "ext:A06", "ext:A15", "ext:A16", "ext:A17", "ext:A22", "ext:A33", "ext:F1", "ext:F2", "ext:F3", "ext:C1", "ext:C2", "ext:C3"]);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });
});
