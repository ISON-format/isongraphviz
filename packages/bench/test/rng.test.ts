import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng.js";

describe("seeded random source", () => {
  it("the same seed gives the same sequence, another seed another", () => {
    const a = createRng(42), b = createRng(42), c = createRng(43);
    const xs = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 50 }, () => c.next())).not.toEqual(xs);
  });
  it("next is in [0, 1) and int is in [0, n)", () => {
    const r = createRng(1);
    for (let i = 0; i < 2000; i++) {
      const x = r.next();
      expect(x >= 0 && x < 1).toBe(true);
      const k = r.int(7);
      expect(Number.isInteger(k) && k >= 0 && k < 7).toBe(true);
    }
  });
  it("pins the first values of seed 1 (627 is the published first value of mulberry32 seed 1; the rest are regression anchors)", () => {
    const r = createRng(1);
    expect([r.int(1000), r.int(1000), r.int(1000), r.int(1000)]).toEqual([627, 2, 527, 981]);
  });
  it("the Irwin-Hall bump is bounded and centred", () => {
    const r = createRng(9);
    let sum = 0;
    for (let i = 0; i < 4000; i++) { const g = r.bump(); expect(g >= -1 && g <= 1).toBe(true); sum += g; }
    expect(Math.abs(sum / 4000)).toBeLessThan(0.05);
  });
});
