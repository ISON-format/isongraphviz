// The D rows of design 13.4 with many more seeds (the fast suite runs a handful).
import { describe, expect, it } from "vitest";
import { d01, d02, d03, d04, d05 } from "../diff-lib.js";

describe("D01 random models and scripts, 40 seeds x 120 intents", () => {
  for (let seed = 100; seed < 140; seed++) it(`seed ${seed}`, async () => { await d01(seed, 120, { maxNodes: 40 }); });
});
describe("D01 with hostile strings, 20 seeds", () => {
  for (let seed = 200; seed < 220; seed++) it(`seed ${seed}`, async () => { await d01(seed, 60, { hostile: true, maxNodes: 20 }); });
});
describe("D02 states around and beyond 2^24, 80 seeds", () => {
  for (let seed = 300; seed < 380; seed++) it(`seed ${seed}`, async () => { await d02(seed); });
});
describe("D03 random labels and options, 60 seeds", () => {
  for (let seed = 400; seed < 460; seed++) it(`seed ${seed}`, async () => { await d03(seed); });
});
describe("D04 the executor against a recording fake, 60 seeds", () => {
  for (let seed = 500; seed < 560; seed++) it(`seed ${seed}`, async () => { await d04(seed); });
});
describe("D05 the exact clip against brute force: 60 seeds x 300 segments", () => {
  for (let seed = 600; seed < 660; seed++) it(`seed ${seed}`, () => { expect(d05(seed, 300)).toBeGreaterThan(0); });
});
