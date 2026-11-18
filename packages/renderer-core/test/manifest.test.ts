// Capability manifest and graceful degradation (design section 8; vectors P01-P20).
import { describe, expect, it } from "vitest";
import { MANDATORY_CAPABILITIES, verifyManifest } from "../src/manifest.js";
import type { CapabilityManifest } from "../src/types.js";
import { errOf } from "./helpers.js";

type Caps = Record<string, unknown>;
/** A valid headless manifest (visual capabilities HOST_LACKS), as the reference renderer declares. */
const headless = (): Record<string, any> => ({
  igr: "IGR/1", renderer: { name: "ref-headless", version: "0.0.0", host: "headless" },
  capabilities: {
    "scene.load": { status: "supported" }, viewport: { status: "supported" }, "hit-test": { status: "supported" }, selection: { status: "supported" },
    focus: { status: "supported" }, visibility: { status: "supported" }, labels: { status: "unsupported", reason: "HOST_LACKS" },
    "direction-cue": { status: "unsupported", reason: "HOST_LACKS" }, "indicators.non-color": { status: "unsupported", reason: "HOST_LACKS" },
    "a11y.model": { status: "supported" }, "state.report": { status: "supported" }, lifecycle: { status: "supported" },
    "export.scene": { status: "supported" }, "export.svg": { status: "unsupported", reason: "NOT_IMPLEMENTED" }, "export.png": { status: "unsupported", reason: "NOT_IMPLEMENTED" },
    "a11y.native-dom": { status: "unsupported", reason: "NOT_IMPLEMENTED" }, "a11y.companion-dom": { status: "unsupported", reason: "NOT_IMPLEMENTED" },
    "labels.edge": { status: "unsupported", reason: "NOT_IMPLEMENTED" }, "motion.animated": { status: "unsupported", reason: "NOT_IMPLEMENTED" },
    "scene.apply-delta": { status: "unsupported", reason: "RESERVED" },
  },
  capacity: { maxNodes: 20000, maxEdges: 40000, maxDrawnLabelUnits: 4096 },
});
const dom = (): Record<string, any> => {
  const m = headless();
  m["renderer"].host = "dom";
  for (const c of ["labels", "direction-cue", "indicators.non-color"]) m["capabilities"][c] = { status: "supported" };
  return m;
};
const caps = (m: Record<string, any>): Caps => m["capabilities"];
const verdict = (m: unknown) => errOf(() => verifyManifest(m));
const edit = (base: () => Record<string, any>, f: (m: Record<string, any>) => void): Record<string, any> => { const m = base(); f(m); return m; };

describe("accepted manifests (P01-P04)", () => {
  it("P01 headless with the visual capabilities HOST_LACKS", () => { expect(verdict(headless())).toBe("no error"); });
  it("P02 dom with LABELS_ELIDED, P04 headless declaring labels supported", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["labels"] = { status: "degraded", degradations: ["LABELS_ELIDED"] }; }))).toBe("no error");
    expect(verdict(edit(headless, (m) => { caps(m)["labels"] = { status: "supported" }; }))).toBe("no error");
    expect(verdict(dom())).toBe("no error");
  });
  it("P03 an x- capability with any status, any degradation set", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["x-vendor.zoom"] = { status: "degraded", degradations: ["EDGE_LABELS_OMITTED", "LABELS_ELIDED"] }; }))).toBe("no error");
    expect(verdict(edit(dom, (m) => { caps(m)["x-a"] = { status: "unsupported", reason: "NOT_IMPLEMENTED" }; }))).toBe("no error");
    expect(verdict(edit(dom, (m) => { caps(m)["x-0._-"] = { status: "supported" }; }))).toBe("no error");
  });
  it("degradations are allowed where the matrix says: direction-cue, labels.edge, optional unsupported", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["direction-cue"] = { status: "degraded", degradations: ["EDGE_STYLE_SIMPLIFIED"] }; }))).toBe("no error");
    expect(verdict(edit(dom, (m) => { caps(m)["labels.edge"] = { status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] }; }))).toBe("no error");
    expect(verdict(edit(dom, (m) => { caps(m)["labels.edge"] = { status: "supported" }; caps(m)["export.svg"] = { status: "supported" }; caps(m)["motion.animated"] = { status: "supported" }; }))).toBe("no error");
  });
  it("returns a verified, frozen, equal copy that does not alias the input", () => {
    const input = dom();
    const out: CapabilityManifest = verifyManifest(input);
    expect(JSON.parse(JSON.stringify(out))).toEqual(input);
    expect(out).not.toBe(input);
    expect(Object.isFrozen(out)).toBe(true);
    input["capacity"].maxNodes = 1;
    expect(out.capacity.maxNodes).toBe(20000);
  });
  it("the mandatory list has the twelve ids of the design", () => {
    expect([...MANDATORY_CAPABILITIES].sort()).toEqual(["a11y.model", "direction-cue", "focus", "hit-test", "indicators.non-color", "labels", "lifecycle", "scene.load", "selection", "state.report", "viewport", "visibility"]);
  });
});

describe("rejected manifests (P05-P20)", () => {
  it("P05 a missing capability, P06 an unknown non-x- id", () => {
    expect(verdict(edit(dom, (m) => { delete caps(m)["viewport"]; }))).toBe("INVALID_MANIFEST/MISSING_CAPABILITY");
    expect(verdict(edit(dom, (m) => { delete caps(m)["scene.apply-delta"]; }))).toBe("INVALID_MANIFEST/MISSING_CAPABILITY");
    expect(verdict(edit(dom, (m) => { caps(m)["telepathy"] = { status: "supported" }; }))).toBe("INVALID_MANIFEST/UNKNOWN_CAPABILITY");
    expect(verdict(edit(dom, (m) => { caps(m)["X-upper"] = { status: "supported" }; }))).toBe("INVALID_MANIFEST/UNKNOWN_CAPABILITY");
  });
  it("P07 a mandatory capability unsupported, P08 degraded", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["hit-test"] = { status: "unsupported", reason: "NOT_IMPLEMENTED" }; }))).toBe("INVALID_MANIFEST/MANDATORY_UNSUPPORTED");
    expect(verdict(edit(dom, (m) => { caps(m)["lifecycle"] = { status: "degraded", degradations: ["LABELS_ELIDED"] }; }))).toBe("INVALID_MANIFEST/MANDATORY_DEGRADED");
    expect(verdict(edit(dom, (m) => { caps(m)["labels"] = { status: "unsupported", reason: "NOT_IMPLEMENTED" }; }))).toBe("INVALID_MANIFEST/MANDATORY_UNSUPPORTED");
  });
  it("P09 scene.apply-delta supported, P10 degraded, P11 unsupported with another reason: RESERVED_CAPABILITY", () => {
    for (const s of [{ status: "supported" }, { status: "degraded", degradations: ["LABELS_ELIDED"] }, { status: "unsupported", reason: "NOT_IMPLEMENTED" }, { status: "unsupported", reason: "HOST_LACKS" }]) {
      expect(verdict(edit(dom, (m) => { caps(m)["scene.apply-delta"] = s; })), JSON.stringify(s)).toBe("INVALID_MANIFEST/RESERVED_CAPABILITY");
    }
  });
  it("P11 an optional capability unsupported with NOT_IMPLEMENTED is fine", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["export.png"] = { status: "unsupported", reason: "NOT_IMPLEMENTED" }; }))).toBe("no error");
  });
  it("P12 an unknown degradation, P13 export.svg degraded, P14 labels with EDGE_LABELS_OMITTED", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["labels"] = { status: "degraded", degradations: ["BLURRY"] }; }))).toBe("INVALID_MANIFEST/UNKNOWN_DEGRADATION");
    expect(verdict(edit(dom, (m) => { caps(m)["x-a"] = { status: "degraded", degradations: ["BLURRY"] }; }))).toBe("INVALID_MANIFEST/UNKNOWN_DEGRADATION");
    expect(verdict(edit(dom, (m) => { caps(m)["export.svg"] = { status: "degraded", degradations: ["LABELS_ELIDED"] }; }))).toBe("INVALID_MANIFEST/DEGRADATION_NOT_ALLOWED");
    expect(verdict(edit(dom, (m) => { caps(m)["labels"] = { status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] }; }))).toBe("INVALID_MANIFEST/DEGRADATION_NOT_ALLOWED");
    expect(verdict(edit(dom, (m) => { caps(m)["indicators.non-color"] = { status: "degraded", degradations: ["LABELS_ELIDED"] }; }))).toBe("INVALID_MANIFEST/MANDATORY_DEGRADED"); // P22 (rev 4, 8.1 7c): whatever degradation it names
    expect(verdict(edit(dom, (m) => { caps(m)["direction-cue"] = { status: "degraded", degradations: ["LABELS_ELIDED"] }; }))).toBe("INVALID_MANIFEST/DEGRADATION_NOT_ALLOWED");
  });
  it("degradations must be sorted, unique and non-empty", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["x-a"] = { status: "degraded", degradations: [] }; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { caps(m)["x-a"] = { status: "degraded", degradations: ["LABELS_ELIDED", "EDGE_LABELS_OMITTED"] }; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { caps(m)["x-a"] = { status: "degraded", degradations: ["LABELS_ELIDED", "LABELS_ELIDED"] }; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { caps(m)["x-a"] = { status: "degraded", degradations: "LABELS_ELIDED" }; }))).toBe("INVALID_MANIFEST/SCHEMA");
  });
  it("P15 HOST_LACKS on a dom host or on a non-visual capability", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["labels"] = { status: "unsupported", reason: "HOST_LACKS" }; }))).toBe("INVALID_MANIFEST/HOST_LACKS_NOT_ALLOWED");
    expect(verdict(edit(headless, (m) => { caps(m)["export.svg"] = { status: "unsupported", reason: "HOST_LACKS" }; }))).toBe("INVALID_MANIFEST/HOST_LACKS_NOT_ALLOWED");
    expect(verdict(edit(headless, (m) => { caps(m)["a11y.model"] = { status: "unsupported", reason: "HOST_LACKS" }; }))).toBe("INVALID_MANIFEST/HOST_LACKS_NOT_ALLOWED");
    expect(verdict(edit(headless, (m) => { caps(m)["labels.edge"] = { status: "unsupported", reason: "HOST_LACKS" }; }))).toBe("INVALID_MANIFEST/HOST_LACKS_NOT_ALLOWED"); // P23: the visual set is exactly labels, direction-cue, indicators.non-color
    expect(verdict(edit(headless, (m) => { caps(m)["x-a"] = { status: "unsupported", reason: "HOST_LACKS" }; }))).toBe("no error"); // P26
    expect(verdict(edit(dom, (m) => { caps(m)["x-a"] = { status: "unsupported", reason: "HOST_LACKS" }; }))).toBe("no error");
  });
  it("P16 an unknown igr major", () => {
    expect(verdict(edit(dom, (m) => { m["igr"] = "IGR/2"; }))).toBe("INVALID_MANIFEST/UNSUPPORTED_VERSION");
    expect(verdict(edit(dom, (m) => { m["igr"] = 1; }))).toBe("INVALID_MANIFEST/SCHEMA");
  });
  it("P17 capacity 0, fractional, negative, unsafe, missing", () => {
    for (const v of [0, 1.5, -1, 2 ** 53, NaN]) expect(verdict(edit(dom, (m) => { m["capacity"].maxNodes = v; })), String(v)).toBe("INVALID_MANIFEST/INVALID_LIMITS");
    for (const v of ["9", "5", null, true, [], {}]) expect(verdict(edit(dom, (m) => { m["capacity"].maxNodes = v; })), String(v)).toBe("INVALID_MANIFEST/SCHEMA"); // P24: not a number
    expect(verdict(edit(dom, (m) => { delete m["capacity"].maxEdges; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { m["capacity"].extra = 1; }))).toBe("INVALID_MANIFEST/SCHEMA");
  });
  it("P18 a bad x- id pattern is an UNKNOWN id (rev 3, 8.1 step 6)", () => {
    for (const id of ["x-", "x-A", "x-Bad", "x--a", "x- a", "x-é", "x-a/b"]) expect(verdict(edit(dom, (m) => { caps(m)[id] = { status: "supported" }; })), id).toBe("INVALID_MANIFEST/UNKNOWN_CAPABILITY");
  });
  it("rev 3 order of verification: top keys, igr, renderer (host, name, version), capacity, missing, unknown, then each capability in ascending key order", () => {
    const both = (m: Record<string, any>) => { m["igr"] = "IGR/2"; m["renderer"].host = "x"; };
    expect(verdict(edit(dom, both))).toBe("INVALID_MANIFEST/UNSUPPORTED_VERSION");
    expect(verdict(edit(dom, (m) => { m["renderer"].host = "x"; m["renderer"].name = "Bad"; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { m["renderer"].name = "Bad"; m["capacity"].maxNodes = 0; }))).toBe("INVALID_MANIFEST/INVALID_NAME");
    expect(verdict(edit(dom, (m) => { m["capacity"].maxNodes = 0; delete caps(m)["viewport"]; }))).toBe("INVALID_MANIFEST/INVALID_LIMITS");
    expect(verdict(edit(dom, (m) => { delete caps(m)["viewport"]; caps(m)["telepathy"] = { status: "supported" }; }))).toBe("INVALID_MANIFEST/MISSING_CAPABILITY");
    expect(verdict(edit(dom, (m) => { caps(m)["telepathy"] = { status: "supported" }; caps(m)["viewport"] = { status: "maybe" }; }))).toBe("INVALID_MANIFEST/UNKNOWN_CAPABILITY");
    // ascending key order: "export.png" < "hit-test"
    expect(verdict(edit(dom, (m) => { caps(m)["hit-test"] = { status: "unsupported", reason: "NOT_IMPLEMENTED" }; caps(m)["export.png"] = { status: "degraded", degradations: ["LABELS_ELIDED"] }; }))).toBe("INVALID_MANIFEST/DEGRADATION_NOT_ALLOWED");
    // within a capability: shape, then known degradations, then the status rules
    expect(verdict(edit(dom, (m) => { caps(m)["viewport"] = { status: "degraded", degradations: ["BLURRY"] }; }))).toBe("INVALID_MANIFEST/UNKNOWN_DEGRADATION");
    expect(verdict(edit(dom, (m) => { caps(m)["viewport"] = { status: "degraded", degradations: [] }; }))).toBe("INVALID_MANIFEST/SCHEMA");
  });
  it("P19 a bad renderer name or version", () => {
    for (const n of ["Bad", "1abc", "", "a b", "é", "a/b"]) expect(verdict(edit(dom, (m) => { m["renderer"].name = n; })), n).toBe("INVALID_MANIFEST/INVALID_NAME");
    for (const v of ["", "1 0", "é", "1/0"]) expect(verdict(edit(dom, (m) => { m["renderer"].version = v; })), v).toBe("INVALID_MANIFEST/INVALID_NAME");
    expect(verdict(edit(dom, (m) => { m["renderer"].name = "a.b_c-d9"; m["renderer"].version = "1.0.0-rc.1+build_5"; }))).toBe("no error");
    expect(verdict(edit(dom, (m) => { m["renderer"].host = "browser"; }))).toBe("INVALID_MANIFEST/SCHEMA");
  });
  it("P20 RESERVED on a non-reserved capability", () => {
    expect(verdict(edit(dom, (m) => { caps(m)["export.png"] = { status: "unsupported", reason: "RESERVED" }; }))).toBe("INVALID_MANIFEST/RESERVED_CAPABILITY");
    expect(verdict(edit(dom, (m) => { caps(m)["x-a"] = { status: "unsupported", reason: "RESERVED" }; }))).toBe("INVALID_MANIFEST/RESERVED_CAPABILITY");
    expect(verdict(edit(dom, (m) => { caps(m)["viewport"] = { status: "unsupported", reason: "RESERVED" }; }))).toBe("INVALID_MANIFEST/RESERVED_CAPABILITY");
  });
  it("schema failures: not objects, extra or missing keys, bad status shapes", () => {
    for (const m of [null, undefined, 5, "x", [], {}]) expect(verdict(m), JSON.stringify(m)).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { m["extra"] = 1; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { delete m["capacity"]; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { m["capabilities"] = []; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { caps(m)["viewport"] = { status: "maybe" }; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { caps(m)["viewport"] = { status: "supported", extra: 1 }; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { caps(m)["export.svg"] = { status: "unsupported" }; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { caps(m)["export.svg"] = { status: "unsupported", reason: "LATER" }; }))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(verdict(edit(dom, (m) => { caps(m)["viewport"] = "supported"; }))).toBe("INVALID_MANIFEST/SCHEMA");
  });
  it("a hostile manifest (getter that throws, wrong prototype) is INVALID_MANIFEST/SCHEMA, never another error", () => {
    const m = dom();
    Object.defineProperty(m["capacity"], "maxNodes", { get() { throw new Error("boom"); }, enumerable: true });
    expect(verdict(m)).toBe("INVALID_MANIFEST/SCHEMA");
  });
});
