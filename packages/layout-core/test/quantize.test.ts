import { describe, expect, it } from "vitest";
import { LayoutError } from "../src/errors.js";
import { quantize, wireCoordinate } from "../src/quantize.js";

const code = (f: () => unknown) => { try { f(); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason}`; throw e; } return "no error"; };

describe("quantize (docs/specs/IGL-1.md §4)", () => {
  it("rounds ordinary coordinates (values from the O1 evidence run)", () => {
    expect(quantize(173.9612052509673)).toBe(173961);
    expect(quantize(81.2025957008565)).toBe(81203);
    expect(quantize(450)).toBe(450000);
    expect(quantize(0.5)).toBe(500);
  });
  it("rounds exact ties up, toward +infinity, for both signs", () => {
    expect([0.0005, 0.0015, -0.0005, -0.0015].map(quantize)).toEqual([1, 2, 0, -1]);
  });
  it("rounds just below and above a tie the expected way", () => {
    expect([0.0004, 0.0006, -0.0004, -0.0006].map(quantize)).toEqual([0, 1, 0, -1]);
  });
  it("normalizes negative zero to +0", () => {
    for (const v of [-0, -0.0004, 1e-9, -1e-9]) expect(Object.is(quantize(v), 0), String(v)).toBe(true);
  });
  it("rejects non-finite and non-number inputs as NOT_FINITE", () => {
    for (const v of [Number.NaN, Infinity, -Infinity, "1", null, undefined, 1n]) expect(code(() => quantize(v)), String(v)).toBe("INVALID_COORDINATE/NOT_FINITE");
  });
  it("the safe-integer boundary is a binary64 fact: the decimal 9007199254740.991 is not a double", () => {
    // The nearest double is 9007199254740.990234375 (spacing 2^-9 at this magnitude); times 1000 it rounds to ...990, not ...991.
    expect(9007199254740.991).toBe(9007199254740.990234375);
    expect(quantize(9007199254740.991)).toBe(9007199254740990);
    expect(quantize(9007199254740.99)).toBe(9007199254740990);
    // The next double up has a product of exactly 2^53 and is refused, so ...990 is the largest accepted quantum on this grid.
    expect(9007199254740.992).toBe(9007199254740.9921875);
    expect(code(() => quantize(9007199254740.992))).toBe("INVALID_COORDINATE/OUT_OF_RANGE");
    expect(code(() => quantize(1e300))).toBe("INVALID_COORDINATE/OUT_OF_RANGE");
    expect(code(() => quantize(-9007199254740.992))).toBe("INVALID_COORDINATE/OUT_OF_RANGE");
    expect(quantize(-9007199254740.99)).toBe(-9007199254740990);
  });
  // The shortcut floor(s + 0.5) is wrong above 2^52 thousandths (docs/specs/IGL-1.md §4 names it as wrong).
  // There s is an exact integer and s + 0.5 is not representable: it rounds to even, which moves odd integers (and, for negatives, even ones).
  it("is NOT floor(s + 0.5): the frozen formula and the shortcut differ near 4.5e12 layout units, in both signs", () => {
    const shortcut = (v: number): number => Math.floor(v * 1000 + 0.5);
    const v = 4503599627370.497;
    expect(v * 1000).toBe(4503599627370497);          // an exact integer in binary64 (above 2^52 the spacing is 1)
    expect(quantize(v)).toBe(4503599627370497);       // IGL/1: f = s, s - f = 0 < 0.5, so q = s
    expect(shortcut(v)).toBe(4503599627370498);       // the incorrect shortcut: s + 0.5 ties to even and moves an odd integer
    expect(quantize(-v)).toBe(-4503599627370497);
    expect(shortcut(-v)).toBe(-4503599627370496);
    expect(quantize(v)).not.toBe(shortcut(v));
  });
  it("is the same formula on 10,000 generated doubles (guards against a library round())", () => {
    let s = 99;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 10000; i++) {
      const v = (rnd() - 0.5) * Math.pow(10, Math.floor(rnd() * 9) - 3);
      const x = v * 1000, f = Math.floor(x);
      expect(quantize(v)).toBe((f + (x - f >= 0.5 ? 1 : 0)) || 0);
    }
  });
});

describe("wireCoordinate", () => {
  it("accepts finite safe integers, negative included", () => {
    expect([0, 5, -5, 9007199254740991, -9007199254740991].map((v) => wireCoordinate(v, "$"))).toEqual([0, 5, -5, 9007199254740991, -9007199254740991]);
  });
  it("names the precise reason for each defect", () => {
    expect(code(() => wireCoordinate(-0, "$"))).toBe("INVALID_COORDINATE/NEGATIVE_ZERO");
    expect(code(() => wireCoordinate(1.5, "$"))).toBe("INVALID_COORDINATE/NOT_INTEGER");
    expect(code(() => wireCoordinate(Infinity, "$"))).toBe("INVALID_COORDINATE/NOT_FINITE");
    expect(code(() => wireCoordinate(Number.NaN, "$"))).toBe("INVALID_COORDINATE/NOT_FINITE");
    expect(code(() => wireCoordinate(9007199254740992, "$"))).toBe("INVALID_COORDINATE/OUT_OF_RANGE");
    expect(code(() => wireCoordinate(1e21, "$"))).toBe("INVALID_COORDINATE/OUT_OF_RANGE");
  });
  it("a non-number is a SCHEMA error, not a coordinate error", () => {
    expect(code(() => wireCoordinate("1", "$"))).toBe("INVALID_LAYOUT/SCHEMA");
    expect(code(() => wireCoordinate(null, "$"))).toBe("INVALID_LAYOUT/SCHEMA");
  });
  it("carries the path", () => {
    try { wireCoordinate(1.5, "$.nodes[3].x"); } catch (e) { expect((e as LayoutError).path).toBe("$.nodes[3].x"); }
  });
  it("matches the Python quantizer on the recorded cross-check (see docs/specs/IGL-1.md §4)", () => {
    // The 200,015-value cross-language comparison is a recorded evidence run; this pins two of its constructed ties.
    expect(quantize(0.0005)).toBe(1);
    expect(quantize(-0.0015)).toBe(-1);
  });
});
