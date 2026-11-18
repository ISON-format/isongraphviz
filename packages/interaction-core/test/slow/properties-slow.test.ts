// The D rows with many more seeds (the fast suite runs a handful): seeds are listed in the test names.
import { describe, it } from "vitest";
import { d01, d02, d03 } from "../diff-lib.js";

describe("D01 closed loop, 60 seeds x 300 events", () => {
  for (let seed = 100; seed < 160; seed++) it(`seed ${seed}`, async () => { await d01(seed, 300, { maxNodes: 40 }); });
});
describe("D01 with hostile ids, 30 seeds", () => {
  for (let seed = 200; seed < 230; seed++) it(`seed ${seed}`, async () => { await d01(seed, 150, { hostile: true, maxNodes: 20 }); });
});
describe("D02 I2, I3, I4, 60 seeds x 300 events", () => {
  for (let seed = 300; seed < 360; seed++) it(`seed ${seed}`, async () => { await d02(seed, 300); });
});
describe("D03 spatial brute force and I5, 60 seeds x 120 trials", () => {
  for (let seed = 400; seed < 460; seed++) it(`seed ${seed}`, async () => { await d03(seed, 120); });
});
