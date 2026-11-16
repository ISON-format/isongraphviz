import { describe, expect, it } from "vitest";
import { LayoutError } from "../src/errors.js";
import { validatePolicy } from "../src/policy.js";

const CORE = { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 };
const force = (config: unknown = CORE) => ({ family: "FORCE", algorithm: "igl-force/1", config });
const code = (f: () => unknown) => { try { f(); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason ?? ""}`; throw e; } return "no error"; };

describe("validatePolicy: accepted", () => {
  it("accepts Core's defaults written explicitly and returns an owned copy", () => {
    const input = force({ ...CORE });
    const out = validatePolicy(input);
    expect(out).toEqual({ family: "FORCE", algorithm: "igl-force/1", config: CORE });
    (input.config as Record<string, number>)["seed"] = 1;
    expect(out.config["seed"]).toBe(42);
  });
  it("accepts the boundaries: seed 0 and 2^32-1, iterations 0, margin 0, width 2*margin+1", () => {
    for (const c of [{ ...CORE, seed: 0 }, { ...CORE, seed: 2 ** 32 - 1 }, { ...CORE, iterations: 0 }, { ...CORE, margin: 0 }, { ...CORE, width: 121, height: 121, margin: 60 }]) {
      expect(() => validatePolicy(force(c)), JSON.stringify(c)).not.toThrow();
    }
  });
  it("accepts FIXED with an empty config", () => {
    expect(validatePolicy({ family: "FIXED", algorithm: "igl-fixed/1", config: {} })).toEqual({ family: "FIXED", algorithm: "igl-fixed/1", config: {} });
  });
  it("normalizes -0 to 0", () => {
    expect(Object.is(validatePolicy(force({ ...CORE, seed: -0 })).config["seed"], 0)).toBe(true);
  });
});

describe("validatePolicy: every FORCE key rejects NaN, Infinity, negatives, fractions, strings, null", () => {
  for (const key of ["width", "height", "margin", "iterations", "seed"]) {
    for (const bad of [Number.NaN, Infinity, -1, 1.5, "900", null, undefined, true]) {
      it(`${key} = ${String(bad)}`, () => {
        expect(code(() => validatePolicy(force({ ...CORE, [key]: bad })))).toBe("INVALID_POLICY/INVALID_VALUE");
      });
    }
  }
  it("rejects width/height 0 and values above 2^31-1, seed 2^32", () => {
    for (const c of [{ ...CORE, width: 0 }, { ...CORE, height: 0 }, { ...CORE, width: 2 ** 31 }, { ...CORE, iterations: 2 ** 31 }, { ...CORE, seed: 2 ** 32 }]) {
      expect(code(() => validatePolicy(force(c))), JSON.stringify(c)).toBe("INVALID_POLICY/INVALID_VALUE");
    }
  });
});

describe("validatePolicy: structure", () => {
  it("MARGIN_TOO_LARGE when width <= 2*margin or height <= 2*margin (Core's collapsed-canvas defect)", () => {
    expect(code(() => validatePolicy(force({ ...CORE, width: 100, margin: 60 })))).toBe("INVALID_POLICY/MARGIN_TOO_LARGE");
    expect(code(() => validatePolicy(force({ ...CORE, height: 120, margin: 60 })))).toBe("INVALID_POLICY/MARGIN_TOO_LARGE");
  });
  it("missing and extra config keys, including an x- key", () => {
    const { seed: _s, ...noSeed } = CORE;
    expect(code(() => validatePolicy(force(noSeed)))).toBe("INVALID_POLICY/MISSING_KEY");
    expect(code(() => validatePolicy(force({ ...CORE, radii: {} })))).toBe("INVALID_POLICY/UNKNOWN_KEY");
    expect(code(() => validatePolicy(force({ ...CORE, "x-note": 1 })))).toBe("INVALID_POLICY/UNKNOWN_KEY");
    expect(code(() => validatePolicy({ family: "FIXED", algorithm: "igl-fixed/1", config: { a: 1 } }))).toBe("INVALID_POLICY/UNKNOWN_KEY");
  });
  it("missing or extra policy keys, and non-objects", () => {
    expect(code(() => validatePolicy({ family: "FORCE", algorithm: "igl-force/1" }))).toBe("INVALID_POLICY/MISSING_KEY");
    expect(code(() => validatePolicy({ ...force(), extra: 1 }))).toBe("INVALID_POLICY/UNKNOWN_KEY");
    for (const v of [null, undefined, 5, "x", [], []]) expect(code(() => validatePolicy(v)), String(v)).toBe("INVALID_POLICY/SCHEMA");
    expect(code(() => validatePolicy(force(null)))).toBe("INVALID_POLICY/SCHEMA");
  });
  it("algorithm must belong to the family", () => {
    expect(code(() => validatePolicy({ family: "FORCE", algorithm: "igl-fixed/1", config: CORE }))).toBe("INVALID_POLICY/ALGORITHM_FAMILY_MISMATCH");
    expect(code(() => validatePolicy({ family: "FORCE", algorithm: "igl-force/2", config: CORE }))).toBe("INVALID_POLICY/UNKNOWN_ALGORITHM");
    expect(code(() => validatePolicy({ family: "FORCE", algorithm: 5, config: CORE }))).toBe("INVALID_POLICY/INVALID_VALUE");
  });
  it("named-but-unqualified families are UNSUPPORTED_FAMILY, never a FORCE fallback", () => {
    for (const family of ["HIERARCHICAL", "RADIAL", "COMPOUND", "STABLE"]) {
      expect(code(() => validatePolicy({ family, algorithm: "anything/1", config: {} })), family).toBe("UNSUPPORTED_FAMILY/");
    }
  });
  it("unknown family names (including wrong case) are INVALID_LAYOUT / UNKNOWN_FAMILY", () => {
    for (const family of ["force", "Force", "", "SPRING", 5]) expect(code(() => validatePolicy({ family, algorithm: "igl-force/1", config: CORE })), String(family)).toBe("INVALID_LAYOUT/UNKNOWN_FAMILY");
  });
});

describe("validatePolicy: ownership (each property is read once)", () => {
  it("a config getter that answers differently on a second read cannot change the result", () => {
    let reads = 0;
    const config = { ...CORE };
    Object.defineProperty(config, "seed", { enumerable: true, get: () => (reads++ === 0 ? 42 : 7) });
    expect(validatePolicy(force(config)).config["seed"]).toBe(42);
    expect(reads).toBe(1);
  });
  it("a throwing getter or a revoked Proxy is UNREADABLE, not a raw error", () => {
    const hostile = { ...CORE }; Object.defineProperty(hostile, "seed", { enumerable: true, get: () => { throw new Error("boom"); } });
    expect(code(() => validatePolicy(force(hostile)))).toBe("INVALID_POLICY/UNREADABLE");
    const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
    expect(code(() => validatePolicy(force(proxy)))).toBe("INVALID_POLICY/UNREADABLE");
  });
  it("a toJSON or String-object impostor for a number is rejected", () => {
    expect(code(() => validatePolicy(force({ ...CORE, seed: { toJSON: () => 42 } })))).toBe("INVALID_POLICY/INVALID_VALUE");
    expect(code(() => validatePolicy(force({ ...CORE, seed: new Number(42) })))).toBe("INVALID_POLICY/INVALID_VALUE");
  });
});
