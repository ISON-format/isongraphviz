// The D rows of design 15.5 that belong to a11y-companion (runtime tier), a handful of seeds each: the fast suite. The seeds are the caller's and are listed in
// the test names (recorded); test/slow/properties-slow.test.ts runs many more.
import { describe, expect, it } from "vitest";
import { d04, d05, d06 } from "./diff-lib.js";

describe("D04 (companion items equal buildAccessibleModel items; window invariants)", () => {
  for (const seed of [1, 2, 3, 4, 5]) it(`seed ${seed}: 25 states x 3 windows`, async () => { expect((await d04(seed, 25)).trials).toBe(25); });
  for (const seed of [41, 42]) it(`hostile ids, seed ${seed}`, async () => { await d04(seed, 12, { hostile: true, maxNodes: 15 }); });
});
describe("D05 (the gate passes on built trees and fails with the expected finding on random perturbations)", () => {
  for (const seed of [11, 12, 13, 14]) it(`seed ${seed}`, async () => { const r = await d05(seed, 15); expect(r.perturbed).toBeGreaterThan(20); });
  for (const seed of [43]) it(`hostile ids, seed ${seed}`, async () => { await d05(seed, 10, { hostile: true, maxNodes: 15 }); });
});
describe("D06 (invariant I-C1: plan(prev, next) on the DOM of prev equals the full build of next)", () => {
  for (const seed of [21, 22, 23, 24]) it(`seed ${seed}: 25 pairs`, async () => { await d06(seed, 25); });
  for (const seed of [44]) it(`hostile ids, seed ${seed}`, async () => { await d06(seed, 15, { hostile: true, maxNodes: 15 }); });
});
