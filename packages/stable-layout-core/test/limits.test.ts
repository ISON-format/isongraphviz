import { LayoutError } from "isongraph-visualize-layout-core";
import { describe, expect, it } from "vitest";
import { StableLayoutError } from "../src/errors.js";
import { COORD_LIMIT, DEFAULT_STABLE_BUDGET, MAX_NODE_KEY_UNITS, MAX_REL_UNITS, Meter, readOptions, resolveBudget } from "../src/limits.js";

const err = (f: () => unknown): StableLayoutError => {
  try { f(); } catch (e) { if (e instanceof StableLayoutError) return e; throw e; }
  throw new Error("no error thrown");
};
const cr = (f: () => unknown): string => { const e = err(f); return `${e.code}/${e.reason ?? ""}`; };
const code = (f: () => unknown): string => { const e = err(f); return `${e.code}/${e.reason ?? ""}${e.reason === "UNSUPPORTED_OPTION" ? `/${e.detail}` : ""}`; };

describe("StableLayoutError", () => {
  it("has code, reason, path and detail, joined with ' | ' in the message, and is not a LayoutError", () => {
    const e = new StableLayoutError("RESOURCE_LIMIT", "WORK_LIMIT", "budget", "x");
    expect([e.code, e.reason, e.path, e.detail]).toEqual(["RESOURCE_LIMIT", "WORK_LIMIT", "budget", "x"]);
    expect(e.message).toBe("RESOURCE_LIMIT | WORK_LIMIT | budget | x");
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(LayoutError);
    expect(new LayoutError("RESOURCE_LIMIT", "WORK_LIMIT")).not.toBeInstanceOf(StableLayoutError);
    expect(new StableLayoutError("INTERNAL").message).toBe("INTERNAL");
  });
});

describe("constants", () => {
  it("are the specified ones", () => {
    expect(DEFAULT_STABLE_BUDGET).toEqual({ maxNodes: 20_000, maxEdges: 100_000, maxSceneBytes: 16_777_216, maxLayoutBytes: 16_777_216, maxReportBytes: 67_108_864, maxWork: 50_000_000 });
    expect(Object.isFrozen(DEFAULT_STABLE_BUDGET)).toBe(true);
    expect(MAX_NODE_KEY_UNITS).toBe(2048);
    expect(MAX_REL_UNITS).toBe(2048);
    expect(COORD_LIMIT).toBe(2 ** 50);
  });
});

describe("resolveBudget", () => {
  it("returns the defaults (a copy) for undefined and merges a partial budget", () => {
    const d = resolveBudget(undefined);
    expect(d).toEqual(DEFAULT_STABLE_BUDGET);
    expect(d).not.toBe(DEFAULT_STABLE_BUDGET);
    expect(resolveBudget({ maxWork: 5 })).toEqual({ ...DEFAULT_STABLE_BUDGET, maxWork: 5 });
    expect(resolveBudget({ maxNodes: undefined })).toEqual(DEFAULT_STABLE_BUDGET);
  });
  it("refuses everything that is not a plain object of positive safe integers (TL09)", () => {
    for (const bad of [null, [], [1], "x", 5, true, () => 1]) expect(code(() => resolveBudget(bad))).toBe("INVALID_REQUEST/INVALID_BUDGET");
    for (const v of [0, -1, 1.5, NaN, Infinity, 2 ** 53, "5", null, true]) expect(code(() => resolveBudget({ maxNodes: v }))).toBe("INVALID_REQUEST/INVALID_BUDGET");
    expect(code(() => resolveBudget({ maxNode: 5 }))).toBe("INVALID_REQUEST/INVALID_BUDGET");
    expect(code(() => resolveBudget({ maxWork: 5, extra: 1 }))).toBe("INVALID_REQUEST/INVALID_BUDGET");
    expect(resolveBudget({ maxWork: Number.MAX_SAFE_INTEGER }).maxWork).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("reports an unreadable getter as UNREADABLE and reads each property once", () => {
    const boom = { get maxWork(): number { throw new Error("boom"); } };
    expect(code(() => resolveBudget(boom))).toBe("INVALID_REQUEST/UNREADABLE");
    let reads = 0;
    const once = { get maxWork(): number { reads++; return 7; } };
    expect(resolveBudget(once).maxWork).toBe(7);
    expect(reads).toBe(1);
  });
});

describe("Meter (section 12.3)", () => {
  it("accumulates and exposes W", () => {
    const m = new Meter(10);
    m.charge(3); m.charge(7);
    expect(m.work).toBe(10);
  });
  it("tests W + c > maxWork BEFORE charging: refuses, leaves W unchanged, and the boundary is inclusive", () => {
    const m = new Meter(10);
    m.charge(9);
    const e = err(() => m.charge(2));
    expect(`${e.code}/${e.reason}`).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(m.work).toBe(9);
    m.charge(1);
    expect(m.work).toBe(10);
    expect(code(() => m.charge(1))).toContain("WORK_LIMIT");
    expect(m.work).toBe(10);
  });
});

describe("readOptions", () => {
  const allowed = ["budget", "placement"];
  it("treats undefined as no options and refuses non-objects and arrays", () => {
    expect(readOptions(undefined, allowed)).toEqual(new Map());
    for (const bad of [null, [], 5, "x", true]) expect(cr(() => readOptions(bad, allowed))).toBe("INVALID_REQUEST/SCHEMA");
  });
  it("an option is present iff its value is !== undefined; an unknown own key is UNKNOWN_KEY", () => {
    const m = readOptions({ budget: undefined, placement: 1 }, allowed);
    expect([...m.keys()]).toEqual(["placement"]);
    expect(code(() => readOptions({ nope: 1 }, allowed))).toBe("INVALID_REQUEST/UNKNOWN_KEY");
    expect(code(() => readOptions({ nope: undefined }, allowed))).toBe("INVALID_REQUEST/UNKNOWN_KEY");
  });
  it("relax, groups and viewport are UNSUPPORTED_OPTION with the option name as detail, when present (TC07)", () => {
    const all = ["budget", "relax", "groups", "viewport"];
    for (const k of ["relax", "groups", "viewport"]) expect(code(() => readOptions({ [k]: {} }, all))).toBe(`INVALID_REQUEST/UNSUPPORTED_OPTION/${k}`);
    expect(readOptions({ relax: undefined }, all).size).toBe(0);
    expect(code(() => readOptions({ relax: 1, nope: 1 }, all))).toBe("INVALID_REQUEST/UNKNOWN_KEY"); // unknown key is judged first
  });
  it("reads each property once and maps a throwing getter or Proxy to UNREADABLE", () => {
    let reads = 0;
    const o = { get budget(): number { reads++; return 1; } };
    expect(readOptions(o, allowed).get("budget")).toBe(1);
    expect(reads).toBe(1);
    expect(code(() => readOptions({ get budget(): number { throw new Error("x"); } }, allowed))).toBe("INVALID_REQUEST/UNREADABLE");
    const p = new Proxy({}, { ownKeys() { throw new Error("x"); } });
    expect(code(() => readOptions(p, allowed))).toBe("INVALID_REQUEST/UNREADABLE");
  });
});
