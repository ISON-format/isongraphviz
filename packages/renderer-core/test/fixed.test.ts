// Integer-domain helpers (IGR/1 design §3): floorDiv, divRound, the single quantizer at two scales.
import { describe, expect, it } from "vitest";
import { divRound, floorDiv, quantizeMilli, quantizePx, quantizeSize } from "../src/viewport.js";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { compileScene } from "isongraph-visualize-scene-core";
import { ORACLES, read } from "./helpers.js";
import { join } from "node:path";

describe("floorDiv", () => {
  it("rounds toward minus infinity for b > 0 (BigInt / truncates toward zero)", () => {
    expect(floorDiv(7n, 2n)).toBe(3n);
    expect(floorDiv(-7n, 2n)).toBe(-4n);
    expect(floorDiv(-6n, 2n)).toBe(-3n);
    expect(floorDiv(0n, 5n)).toBe(0n);
    expect(floorDiv(-1n, 1000n)).toBe(-1n);
  });
});

describe("divRound = floorDiv(2a + b, 2b): ties go toward +infinity", () => {
  it("matches the design examples", () => {
    expect(divRound(7n, 2n)).toBe(4n);
    expect(divRound(-7n, 2n)).toBe(-3n);
    expect(divRound(-5n, 2n)).toBe(-2n);
  });
  it("matches Appendix A numbers", () => {
    expect(divRound(767108n, 2n)).toBe(383554n);
    expect(divRound(10n * 1_000_000n, 1994n)).toBe(5015n);
    expect(divRound(-7n * 1_000_000n, 1994n)).toBe(-3511n);
  });
  it("is exact for non-tie values on both signs", () => {
    for (let a = -50n; a <= 50n; a++) for (const b of [1n, 3n, 7n, 10n]) {
      const exact = Number(a) / Number(b);
      const got = Number(divRound(a, b));
      expect(Math.abs(got - exact) <= 0.5 + 1e-12).toBe(true);
    }
  });
});

describe("quantizeMilli (q) is IGL/1 section 4 rule 2 applied once", () => {
  it("examples of the design", () => {
    expect(quantizeMilli(0.0625)).toBe(63);
    expect(quantizeMilli(-0.0625)).toBe(-62);
    expect(quantizeMilli(12)).toBe(12000);
    expect(quantizeMilli(12 + 2 ** -10)).toBe(12001);
    expect(quantizeMilli(12 + 2 ** -11)).toBe(12000);
  });
  it("never returns -0", () => { expect(Object.is(quantizeMilli(-0), 0)).toBe(true); });
  it("agrees with computeFixedLayout on a sweep of doubles (differential against layout-core)", async () => {
    const o1 = await compileScene(read(join(ORACLES, "o1-basic.source.ison")), "ison-v1");
    const vals = [0, 0.0005, -0.0005, 0.0004999, 1.0005, -1.0005, 173.961, -81.2035, 1e6 + 0.0625, -(2 ** -11), 2 ** -10, 12 + 2 ** -11, 99999.9995];
    for (const v of vals) {
      const r = await computeFixedLayout(o1.sceneBytes, [{ ref: { id: "i:1", type: "person" }, x: v, y: 0 }, { ref: { id: "s:ann", type: "person" }, x: 0, y: 0 }]);
      const node = (JSON.parse(new TextDecoder().decode(r.layoutBytes)) as { nodes: { ref: { id: string }; x: number }[] }).nodes.find((n) => n.ref.id === "i:1")!;
      expect(quantizeMilli(v), String(v)).toBe(node.x);
    }
  });
});

describe("quantizePx and quantizeSize", () => {
  it("quantizePx is the same rule without the multiplication", () => {
    expect(quantizePx(2.5)).toBe(3);
    expect(quantizePx(-2.5)).toBe(-2);
    expect(quantizePx(2.4999)).toBe(2);
    expect(quantizePx(-0.2)).toBe(0);
    expect(Object.is(quantizePx(-0), 0)).toBe(true);
  });
  it("quantizeSize(v) = max(1, floor(v))", () => {
    expect(quantizeSize(900.9)).toBe(900);
    expect(quantizeSize(0.2)).toBe(1);
    expect(quantizeSize(-5)).toBe(1);
    expect(quantizeSize(16384.5)).toBe(16384);
  });
  it("reject non-finite input with INVALID_INPUT/NOT_FINITE", () => {
    for (const f of [() => quantizePx(NaN), () => quantizeSize(Infinity), () => quantizeMilli(-Infinity)]) {
      try { f(); throw new Error("no throw"); } catch (e) { expect((e as { code?: string }).code).toBe("INVALID_INPUT"); expect((e as { reason?: string }).reason).toBe("NOT_FINITE"); }
    }
  });
});
