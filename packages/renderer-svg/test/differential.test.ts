// Design 15.4 D rows (runtime, caller seeds): D01 random models and intent scripts, D02 hostile strings, D03 random states and viewports,
// D04 random limits. A handful of seeds here; test/slow/differential-slow.test.ts runs many more.
import { describe, it } from "vitest";
import { d01, d02, d03, d04 } from "./diff-lib.js";

const FAST_SEEDS = [1, 2, 3];
describe("D01 random models and intent scripts", () => {
  for (const s of FAST_SEEDS) it(`seed ${s}: svg() equals renderSvg of the committed state; RT-A, RT-B, RT-C(a); names and marks equal the accessible model`, async () => { await d01(s, 60); });
});
describe("D02 hostile strings", () => {
  for (const s of FAST_SEEDS) it(`seed ${s}: the document is accepted by readSvg, names equal the xs-substituted names, ids decode, no raw markup`, async () => { await d02(s); });
});
describe("D03 random states and viewports", () => {
  for (const s of FAST_SEEDS) it(`seed ${s}: extreme viewports give only documented errors, equal renders and an accepted document`, async () => { await d03(s); });
});
describe("D04 random limits", () => {
  for (const s of FAST_SEEDS) it(`seed ${s}: refusal iff the length exceeds the limit (also through writeSvg and its sink); elision follows 7.5`, async () => { await d04(s); });
});
