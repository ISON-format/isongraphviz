// The D rows (13.4), a handful of seeds each: the fast suite. test/slow/differential-slow.test.ts runs many more.
import { describe, expect, it } from "vitest";
import { d01, d02, d03, d04, d05 } from "./diff-lib.js";

describe("D01 random models and scripts (plan, reader, readout against the list)", () => {
  for (const seed of [1, 2, 3, 4]) it(`seed ${seed}: 40 intents`, async () => { expect(await d01(seed, 40)).toBeGreaterThan(5); });
});
describe("D02 states around and beyond 2^24 (the guard rule's lemma)", () => {
  for (const seed of [11, 12, 13, 14]) it(`seed ${seed}`, async () => { await d02(seed); });
  it("the generator reaches the rule: omitted nodes, omitted edges and clipped segments occur", async () => {
    let clipped = 0, nodes = 0, edges = 0;
    for (const seed of [21, 22, 23, 24, 25, 26, 27, 28]) { const r = await d02(seed); clipped += r.clipped; nodes += r.omittedNodes; edges += r.omittedEdges; }
    expect(nodes).toBeGreaterThan(0);
    expect(edges).toBeGreaterThan(0);
    expect(clipped).toBeGreaterThan(0);
  });
});
describe("D03 random labels and options leave the buffers unchanged", () => {
  for (const seed of [31, 32, 33, 34, 35, 36]) it(`seed ${seed}`, async () => { await d03(seed); });
});
describe("D04 the executor against a recording fake", () => {
  for (const seed of [41, 42, 43, 44, 45, 46, 47, 48]) it(`seed ${seed}`, async () => { await d04(seed); });
});
describe("D05 the exact clip against a brute-force reference", () => {
  for (const seed of [51, 52, 53]) it(`seed ${seed}: 60 segments`, () => { expect(d05(seed, 60)).toBeGreaterThan(0); });
});
