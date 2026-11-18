// Design 3.1 and 3.2: integer arithmetic (floorDiv, divRound, isqrt), the m-px rounding, and the micro-pixel screen position.
import { describe, expect, it } from "vitest";
import { layoutToScreen } from "isongraph-visualize-renderer-core";
import { divRound, floorDiv, isqrt, mpx, screenMicro } from "../src/num.js";

describe("floorDiv, divRound", () => {
  it("floorDiv rounds toward minus infinity", () => {
    expect(floorDiv(7n, 2n)).toBe(3n);
    expect(floorDiv(-7n, 2n)).toBe(-4n);
    expect(floorDiv(-6n, 2n)).toBe(-3n);
    expect(floorDiv(0n, 5n)).toBe(0n);
  });
  it("divRound rounds half toward +infinity", () => {
    expect(divRound(-1500n, 1000n)).toBe(-1n);
    expect(divRound(-500n, 1000n)).toBe(0n);
    expect(divRound(500n, 1000n)).toBe(1n);
    expect(divRound(-501n, 1000n)).toBe(-1n);
    expect(divRound(1499n, 1000n)).toBe(1n);
    expect(divRound(1500n, 1000n)).toBe(2n);
  });
});

describe("isqrt", () => {
  it("is the exact floor of the square root", () => {
    for (const [n, r] of [[0n, 0n], [1n, 1n], [2n, 1n], [3n, 1n], [4n, 2n], [15n, 3n], [16n, 4n], [743940434338291856n, 862519816n]] as const) expect(isqrt(n)).toBe(r);
  });
  it("is exact beyond 2^53 and around perfect squares", () => {
    for (const r of [94906265n, 10n ** 12n + 7n, 2n ** 60n + 1n, 10n ** 30n]) {
      expect(isqrt(r * r)).toBe(r);
      expect(isqrt(r * r - 1n)).toBe(r - 1n);
      expect(isqrt(r * r + 2n * r)).toBe(r);
      expect(isqrt(r * r + 2n * r + 1n)).toBe(r + 1n);
    }
  });
  it("rejects a negative argument", () => { expect(() => isqrt(-1n)).toThrow(); });
});

describe("mpx (3.2: m(v) = divRound(v, 1000), one rounding from the micro-pixel value)", () => {
  it("rounds half up and never yields a negative zero", () => {
    expect(mpx(499n)).toBe(0);
    expect(mpx(500n)).toBe(1);
    expect(mpx(-500n)).toBe(0);
    expect(Object.is(mpx(-499n), 0)).toBe(true);
    expect(mpx(-501n)).toBe(-1);
    expect(mpx(1500n)).toBe(2);
    expect(mpx(-1500n)).toBe(-1);
  });
});

describe("screenMicro (3.3: X = (x - cx) z + w 500000, exact)", () => {
  const vp = { center_x: 383554, center_y: 134563, width: 900, height: 600, zoom: 1000 };
  it("agrees with layoutToScreen of renderer-core over a lattice", () => {
    for (const [x, y] of [[0, 0], [383554, 134563], [-5, 99], [10 ** 9, -(10 ** 9)], [1234567, 7654321]] as const) {
      const m = screenMicro(vp, x, y);
      const d = layoutToScreen(vp, { x, y });
      expect(Number(m.x) / 1e6).toBe(d.x);
      expect(Number(m.y) / 1e6).toBe(d.y);
    }
  });
  it("is exact beyond 2^53", () => {
    const big = screenMicro({ center_x: 0, center_y: 0, width: 1, height: 1, zoom: 100000 }, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER);
    expect(big.x).toBe(BigInt(Number.MAX_SAFE_INTEGER) * 100000n + 500000n);
    expect(big.y).toBe(-BigInt(Number.MAX_SAFE_INTEGER) * 100000n + 500000n);
  });
});
