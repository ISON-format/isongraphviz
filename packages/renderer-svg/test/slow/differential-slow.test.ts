// The D rows with many seeds (caller seeds, design 15.4): the same bodies as test/differential.test.ts.
import { describe, it } from "vitest";
import { d01, d02, d03, d04 } from "../diff-lib.js";

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i);
describe("D01 (slow)", () => { for (const s of SEEDS) it(`seed ${s}`, async () => { await d01(s, 200); }); });
describe("D02 (slow)", () => { for (const s of SEEDS) it(`seed ${s}`, async () => { await d02(s); }); });
describe("D03 (slow)", () => { for (const s of SEEDS) it(`seed ${s}`, async () => { await d03(s); }); });
describe("D04 (slow)", () => { for (const s of SEEDS) it(`seed ${s}`, async () => { await d04(s); }); });
