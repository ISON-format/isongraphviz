// The findings of the independent audit of step 1 (reviews/31-code-audit-step1.md): each row is a failing test first, then the fix. The row bodies are in
// test/audit-rows.ts (shared with the mutation harness of renderer-canvas, which runs them against scratch mutants as the extra rows `ext:`).
import { describe, expect, it } from "vitest";
import * as dl from "../src/index.js";
import * as cv from "../src/canvas2d/index.js";
import { AUDIT_ROWS } from "./audit-rows.js";
import { readOracleText } from "./helpers.js";

const fn = { ...dl, ...cv };

describe("audit rows (ext:)", () => {
  for (const row of AUDIT_ROWS) it(row.id, async () => { await row.run(fn, { text: readOracleText }); });
  it("the ids are unique", () => { expect(new Set(AUDIT_ROWS.map((r) => r.id)).size).toBe(AUDIT_ROWS.length); });
});
