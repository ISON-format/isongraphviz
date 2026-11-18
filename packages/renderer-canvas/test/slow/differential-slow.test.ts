// The D rows of design 13.3 with many more seeds (the fast suite runs a handful).
import { describe, it } from "vitest";
import { d01, d02, d03, d04 } from "../diff-lib.js";

describe("D01 random models and intents, 40 seeds x 120 intents", () => {
  for (let seed = 100; seed < 140; seed++) it(`seed ${seed}`, async () => { await d01(seed, 120, { maxNodes: 40 }); });
});
describe("D01 with hostile strings, 20 seeds", () => {
  for (let seed = 200; seed < 220; seed++) it(`seed ${seed}`, async () => { await d01(seed, 60, { hostile: true, maxNodes: 20 }); });
});
describe("D02 hostile strings, 80 seeds", () => {
  for (let seed = 300; seed < 380; seed++) it(`seed ${seed}`, async () => { await d02(seed); });
});
describe("D03 extreme states, 20 seeds x 80 states", () => {
  for (let seed = 400; seed < 420; seed++) it(`seed ${seed}`, async () => { await d03(seed, 80); });
});
describe("D04 random options, 60 seeds", () => {
  for (let seed = 500; seed < 560; seed++) it(`seed ${seed}`, async () => { await d04(seed); });
});
