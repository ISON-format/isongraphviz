// Audit M-7: the strict reader checks the cheap structural rules (G4, G5) against the instance counts BEFORE it decodes any instance, so a hostile file whose draws
// do not cover a huge buffer is refused without allocating an object per instance (before the fix a 40 MB plan needed about 300 MB of RSS first, 6-8x).
import { describe, expect, it } from "vitest";
import { parseGlPlan, readGlPlan, serializePlan } from "../../src/index.js";
import { errOf, readOracle } from "../helpers.js";

describe("the reader does not amplify memory before G4/G5", () => {
  it("a 40 MB edge buffer with no draws is refused by G5 with a small growth of the resident set", () => {
    const base = readGlPlan(readOracle("plan/G03.glplan"), { lenient: true }); // the empty plan
    const n = 1_000_000; // 40 MB of edge instances
    const hostile = serializePlan({ ...base, header: { ...base.header, sizes: { ...base.header.sizes, edge: n * 40 } }, buffers: { ...base.buffers, edge: new Uint8Array(n * 40) } });
    expect(hostile.length).toBeGreaterThan(40_000_000);
    const before = process.memoryUsage().rss;
    expect(errOf(() => parseGlPlan(hostile))).toBe("INVALID_INPUT/SCHEMA");
    const growth = process.memoryUsage().rss - before;
    console.log(`[reader-memory] RSS growth ${(growth / 1e6).toFixed(0)} MB for a ${(hostile.length / 1e6).toFixed(0)} MB hostile plan`);
    expect(growth).toBeLessThan(150_000_000);
  });
});
