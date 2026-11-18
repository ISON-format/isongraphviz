// Section 3: integer arithmetic (floorDiv, divRound, isqrt, fmt) and the micro-pixel screen position.
import { describe, expect, it } from "vitest";
import { divRound, fmt, floorDiv, isqrt, screenMicro } from "../src/num.js";
import { layoutToScreen } from "isongraph-visualize-renderer-core";

describe("3.1 floorDiv, divRound", () => {
  it("floorDiv rounds toward minus infinity", () => {
    expect(floorDiv(7n, 2n)).toBe(3n);
    expect(floorDiv(-7n, 2n)).toBe(-4n);
    expect(floorDiv(-6n, 2n)).toBe(-3n);
    expect(floorDiv(0n, 5n)).toBe(0n);
  });
  it("divRound rounds half toward +infinity (the three examples of 3.1)", () => {
    expect(divRound(-1500n, 1000n)).toBe(-1n);
    expect(divRound(-500n, 1000n)).toBe(0n);
    expect(divRound(500n, 1000n)).toBe(1n);
    expect(divRound(-501n, 1000n)).toBe(-1n);
    expect(divRound(1499n, 1000n)).toBe(1n);
    expect(divRound(1500n, 1000n)).toBe(2n);
  });
});

describe("3.1 isqrt", () => {
  it("exact floor of the square root", () => {
    for (const [n, r] of [[0n, 0n], [1n, 1n], [2n, 1n], [3n, 1n], [4n, 2n], [15n, 3n], [16n, 4n], [743940434338291856n, 862519816n]] as const) expect(isqrt(n)).toBe(r);
  });
  it("is exact beyond 2^53 and at perfect squares +- 1", () => {
    for (const r of [94906265n, 94906266n, 10n ** 12n + 7n, 2n ** 60n + 1n, 10n ** 30n]) {
      expect(isqrt(r * r)).toBe(r);
      expect(isqrt(r * r - 1n)).toBe(r - 1n);
      expect(isqrt(r * r + 2n * r)).toBe(r);
      expect(isqrt(r * r + 2n * r + 1n)).toBe(r + 1n);
    }
  });
  it("rejects a negative argument", () => { expect(() => isqrt(-1n)).toThrow(); });
});

describe("3.2 fmt", () => {
  it("the examples of 3.2", () => {
    expect(fmt(32071558n)).toBe("32.072");
    expect(fmt(193600160n)).toBe("193.6");
    expect(fmt(450000000n)).toBe("450");
    expect(fmt(1500n)).toBe("0.002");
    expect(fmt(-1500n)).toBe("-0.001");
    expect(fmt(-500n)).toBe("0");
    expect(fmt(500n)).toBe("0.001");
    expect(fmt(-32071558n)).toBe("-32.072");
  });
  it("never prints -0, an exponent, a plus sign or a trailing dot", () => {
    for (const v of [0n, -1n, -499n, -500n, 499n, 1000n, -1000n, 999999n, 1000000n]) {
      const t = fmt(v);
      expect(t).not.toBe("-0");
      expect(t).toMatch(/^(0|-?[1-9][0-9]*|-?(0|[1-9][0-9]*)\.[0-9]*[1-9])$/);
    }
    expect(fmt(-499n)).toBe("0");
    expect(fmt(1000n)).toBe("0.001");
    expect(fmt(-1000n)).toBe("-0.001");
  });
  it("is unbounded: all digits of 2^53-scale coordinates", () => {
    expect(fmt(45035996720739000n)).toBe("45035996720.739");
    expect(fmt(-(10n ** 22n))).toBe("-" + "1" + "0".repeat(16));
  });
});

describe("3.3 screenMicro and 3.4 the differential against layoutToScreen", () => {
  it("X = (x - cx)*z + w*500000 exactly", () => {
    const vp = { center_x: 383554, center_y: 134563, width: 900, height: 600, zoom: 1994 };
    expect(screenMicro(vp, 7, 9)).toEqual({ x: (7n - 383554n) * 1994n + 450000000n, y: (9n - 134563n) * 1994n + 300000000n });
  });
  it("agrees with layoutToScreen within 1e-6 px over generated states", () => {
    let s = 12345;
    const next = (m: number) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s % m; };
    for (let i = 0; i < 400; i++) {
      const vp = { center_x: next(2_000_001) - 1_000_000, center_y: next(2_000_001) - 1_000_000, width: 1 + next(2000), height: 1 + next(2000), zoom: 10 + next(100_000) };
      const x = next(4_000_001) - 2_000_000, y = next(4_000_001) - 2_000_000;
      const m = screenMicro(vp, x, y);
      const d = layoutToScreen(vp, { x, y });
      expect(Math.abs(Number(m.x) / 1e6 - d.x)).toBeLessThan(1e-6);
      expect(Math.abs(Number(m.y) / 1e6 - d.y)).toBeLessThan(1e-6);
    }
  });
});
