// The D rows (13.3), a handful of seeds each: the fast suite. test/slow/differential-slow.test.ts runs many more.
import { describe, expect, it } from "vitest";
import { d01, d02, d03, d04 } from "./diff-lib.js";

describe("D01 random models and random intents (the subject against the pure functions)", () => {
  for (const seed of [1, 2, 3, 4]) it(`seed ${seed}: 40 intents`, async () => { expect(await d01(seed, 40)).toBeGreaterThan(5); });
});
describe("D02 hostile strings over all scalar classes", () => {
  for (const seed of [11, 12, 13, 14, 15]) it(`seed ${seed}`, async () => { await d02(seed); });
});
describe("D03 random states and viewports at the extremes", () => {
  for (const seed of [21, 22, 23]) it(`seed ${seed}: 30 states`, async () => { await d03(seed, 30); });
  it("the refusal of 3.5 occurs on the extreme states (the generator reaches it)", async () => { expect((await d03(31, 60)) + (await d03(32, 60)) + (await d03(33, 60))).toBeGreaterThan(0); });
});
describe("D04 random options: the byte limit and the label budget", () => {
  for (const seed of [41, 42, 43, 44, 45, 46]) it(`seed ${seed}`, async () => { await d04(seed); });
});
