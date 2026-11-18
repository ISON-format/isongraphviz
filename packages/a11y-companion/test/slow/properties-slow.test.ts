// The D rows with many more seeds (the fast suite runs a handful): seeds are listed in the test names.
import { describe, it } from "vitest";
import { d04, d05, d06 } from "../diff-lib.js";

describe("D04, 60 seeds x 60 states", () => {
  for (let seed = 100; seed < 160; seed++) it(`seed ${seed}`, async () => { await d04(seed, 60, { maxNodes: 40 }); });
});
describe("D05, 60 seeds x 40 states", () => {
  for (let seed = 200; seed < 260; seed++) it(`seed ${seed}`, async () => { await d05(seed, 40, { maxNodes: 40 }); });
});
describe("D06, 60 seeds x 60 pairs", () => {
  for (let seed = 300; seed < 360; seed++) it(`seed ${seed}`, async () => { await d06(seed, 60, { maxNodes: 40 }); });
});
describe("D04-D06 with hostile ids, 30 seeds", () => {
  for (let seed = 400; seed < 430; seed++) it(`seed ${seed}`, async () => { await d04(seed, 20, { hostile: true, maxNodes: 20 }); await d05(seed, 10, { hostile: true, maxNodes: 20 }); await d06(seed, 20, { hostile: true, maxNodes: 20 }); });
});
