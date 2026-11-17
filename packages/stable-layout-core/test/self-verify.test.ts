import { describe, expect, it, vi } from "vitest";

// The producer re-verifies its own output (section 12.1 step 9). A defect in report assembly must surface as INTERNAL, never as bytes.
vi.mock("../src/report.js", async (orig) => {
  const real = await orig<typeof import("../src/report.js")>();
  return { ...real, buildReport: (a: Parameters<typeof real.buildReport>[0]) => { const r = real.buildReport(a); r.aggregate.moved = 99; return r; } };
});

import { computeStableLayout } from "../src/index.js";
import { PLACE_56, SPEC_A, prevDrawing, sceneBytes, stableError } from "./helpers.js";

describe("the producer verifies its own output", () => {
  it("an inconsistent report assembled by a defective builder is INTERNAL, not returned", async () => {
    expect(await stableError(async () => computeStableLayout(await prevDrawing(), await sceneBytes(SPEC_A), { placement: PLACE_56 }))).toMatch(/^INTERNAL\/ROUNDTRIP_MISMATCH/);
  });
});
