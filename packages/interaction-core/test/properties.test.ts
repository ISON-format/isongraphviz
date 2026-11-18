// The D rows of design 15.5 (runtime tier) and the reducer properties I1-I5 of 5.7, a handful of seeds each: the fast suite. The seeds are the caller's
// and are listed in the test names (recorded); test/slow/properties-slow.test.ts runs many more.
import { describe, expect, it } from "vitest";
import { d01, d02, d03 } from "./diff-lib.js";

describe("D01 (I1, closed loop): every intent the machine emits is accepted by the real reducer", () => {
  for (const seed of [1, 2, 3, 4, 5]) it(`seed ${seed}: 150 events`, async () => { const r = await d01(seed, 150); expect(r.events).toBe(150); expect(r.intents).toBeGreaterThan(5); });
  for (const seed of [41, 42]) it(`hostile ids, seed ${seed}: 80 events`, async () => { await d01(seed, 80, { hostile: true, maxNodes: 15 }); });
});
describe("D02 (I2 pan telescoping, I3 no mutation and round trip, I4 ranges)", () => {
  for (const seed of [11, 12, 13, 14]) it(`seed ${seed}`, async () => { const r = await d02(seed, 120); expect(r.events).toBe(120); });
});
describe("D03 (spatial navigation against the brute force of 7.2, and I5 the reveal)", () => {
  for (const seed of [21, 22, 23, 24, 25, 26]) it(`seed ${seed}: 40 trials`, async () => { const r = await d03(seed, 40); expect(r.events).toBeGreaterThan(5); });
});
