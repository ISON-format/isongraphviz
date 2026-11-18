// Design 4.5: DlOptions and the validation order (keys, then alphabetical, first failure wins, all IgrError).
import { describe, expect, it } from "vitest";
import { IgrError } from "isongraph-visualize-renderer-core";
import { resolveDlOptions } from "../src/options.js";

const code = (f: () => unknown): string => {
  try { f(); return "ok"; } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${String(e)}`; }
};

describe("resolveDlOptions", () => {
  it("defaults: labels and edge labels on, the default budget", () => {
    expect(resolveDlOptions(undefined)).toEqual({ labels: true, edgeLabels: true, maxDrawnLabelUnits: 1_048_576 });
    expect(resolveDlOptions({})).toEqual({ labels: true, edgeLabels: true, maxDrawnLabelUnits: 1_048_576 });
  });
  it("accepts each key", () => {
    expect(resolveDlOptions({ labels: false, edgeLabels: false, maxDrawnLabelUnits: 7 })).toEqual({ labels: false, edgeLabels: false, maxDrawnLabelUnits: 7 });
    expect(resolveDlOptions({ maxDrawnLabelUnits: 0 }).maxDrawnLabelUnits).toBe(0);
    expect(resolveDlOptions({ maxDrawnLabelUnits: 2 ** 31 }).maxDrawnLabelUnits).toBe(2 ** 31);
  });
  it("an own property whose value is undefined is absent", () => { expect(resolveDlOptions({ labels: undefined, bogus: undefined })).toEqual({ labels: true, edgeLabels: true, maxDrawnLabelUnits: 1_048_576 }); });
  it("rejects a non-plain options value", () => {
    for (const o of [[], null, 1, "x", () => 0, new Map()]) expect(code(() => resolveDlOptions(o)), String(o)).toBe("INVALID_INPUT/SCHEMA");
  });
  it("rejects an unknown key before looking at values", () => { expect(code(() => resolveDlOptions({ labels: "yes", bogus: 1 }))).toBe("INVALID_INPUT/SCHEMA"); });
  it("a wrong JSON type, including null, is SCHEMA", () => {
    for (const k of ["edgeLabels", "labels"]) for (const v of ["yes", 1, null, [], {}]) expect(code(() => resolveDlOptions({ [k]: v })), `${k}=${String(v)}`).toBe("INVALID_INPUT/SCHEMA");
    for (const v of ["5", null, true, []]) expect(code(() => resolveDlOptions({ maxDrawnLabelUnits: v }))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("numeric classes: NOT_FINITE, INVALID_VALUE, OUT_OF_RANGE", () => {
    expect(code(() => resolveDlOptions({ maxDrawnLabelUnits: NaN }))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(code(() => resolveDlOptions({ maxDrawnLabelUnits: Infinity }))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(code(() => resolveDlOptions({ maxDrawnLabelUnits: 1.5 }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(code(() => resolveDlOptions({ maxDrawnLabelUnits: -1 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(code(() => resolveDlOptions({ maxDrawnLabelUnits: 2 ** 31 + 1 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("alphabetical order: edgeLabels, labels, maxDrawnLabelUnits", () => {
    expect(code(() => resolveDlOptions({ labels: "yes", maxDrawnLabelUnits: NaN }))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => resolveDlOptions({ maxDrawnLabelUnits: NaN, edgeLabels: 3 }))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("reads each caller property once", () => {
    let reads = 0;
    const o = { get labels(): boolean { reads++; return false; } };
    resolveDlOptions(o);
    expect(reads).toBe(1);
  });
});
