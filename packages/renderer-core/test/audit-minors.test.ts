// Audit minors 1, 2, 3, 4, 7: cheap, unambiguous hardening.
import { describe, expect, it } from "vitest";
import { announcementFor } from "../src/a11y.js";
import { buildRenderModel } from "../src/model.js";
import { buildReport, checkFidelity, serializeProjection, semanticProjection } from "../src/report.js";
import { initialState } from "../src/state.js";
import { verifyManifest } from "../src/manifest.js";
import { layoutToScreen } from "../src/viewport.js";
import type { CapabilityManifest, RenderReport } from "../src/types.js";
import { errOf, errOfAsync, igl, o1Scene } from "./helpers.js";

const o1 = () => buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
const FULL: RenderReport["fidelity"] = { labels: "full", edge_labels: false, motion: "none", degradations: [] };

describe("minor 1: layoutToScreen", () => {
  it("a fractional or non-numeric coordinate is an IgrError, not a raw RangeError", () => {
    const vp = { center_x: 0, center_y: 0, width: 10, height: 10, zoom: 1000 };
    expect(errOf(() => layoutToScreen(vp, { x: 1.5, y: 0 }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => layoutToScreen(vp, { x: 0, y: NaN }))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(errOf(() => layoutToScreen(vp, { x: "1" as never, y: 0 }))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => layoutToScreen(vp, { x: 1000, y: 0 }))).toBe("no error");
  });
});

describe("minor 2: announcementFor validates its event", () => {
  it("null, unknown type and a non-object focus are INVALID_INPUT, never TypeError", async () => {
    const m = await o1();
    const s = initialState(m, { width: 9, height: 9 });
    expect(errOf(() => announcementFor(null as never, m, s))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => announcementFor({ type: "bogus" } as never, m, s))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => announcementFor({ type: "focus-changed", focus: 5 } as never, m, s))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => announcementFor({ type: "traversal-boundary", end: "middle" } as never, m, s))).toBe("INVALID_INPUT/SCHEMA");
    expect(announcementFor({ type: "viewport-changed", viewport: s.viewport }, m, s)).toBeUndefined();
  });
});

describe("minor 3: a throwing limits getter", () => {
  it("is INVALID_INPUT/UNREADABLE", async () => {
    const limits = { get maxNodes(): number { throw new Error("boom"); } };
    expect(await errOfAsync(() => buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"), { limits }))).toBe("INVALID_INPUT/UNREADABLE");
    const opts = { get limits(): never { throw new Error("boom"); } };
    expect(await errOfAsync(() => buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"), opts as never))).toBe("INVALID_INPUT/UNREADABLE");
  });
});

describe("minor 4: an undefined optional property is absent", () => {
  it("marked.focus: undefined is accepted like an absent focus", async () => {
    const m = await o1();
    const r = buildReport(m, initialState(m, { width: 900, height: 600 }), FULL);
    (r.marked as { focus?: unknown }).focus = undefined;
    expect(() => serializeProjection(m, semanticProjection(r))).not.toThrow();
  });
});

describe("minor 7 (and I-5b): fidelity against the declared capabilities", () => {
  const manifest = (labels: unknown, edge: unknown): CapabilityManifest => verifyManifest({
    igr: "IGR/1", renderer: { name: "x", version: "1", host: "headless" },
    capabilities: Object.fromEntries([...["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "a11y.model", "state.report", "lifecycle"].map((k) => [k, { status: "supported" }]),
      ["labels", labels], ["direction-cue", { status: "unsupported", reason: "HOST_LACKS" }], ["indicators.non-color", { status: "unsupported", reason: "HOST_LACKS" }],
      ["export.scene", { status: "supported" }], ["export.svg", { status: "unsupported", reason: "NOT_IMPLEMENTED" }], ["export.png", { status: "unsupported", reason: "NOT_IMPLEMENTED" }],
      ["a11y.native-dom", { status: "unsupported", reason: "NOT_IMPLEMENTED" }], ["a11y.companion-dom", { status: "unsupported", reason: "NOT_IMPLEMENTED" }], ["labels.edge", edge], ["motion.animated", { status: "unsupported", reason: "NOT_IMPLEMENTED" }], ["scene.apply-delta", { status: "unsupported", reason: "RESERVED" }]]),
    capacity: { maxNodes: 10, maxEdges: 10, maxDrawnLabelUnits: 10 },
  });
  it("labels 'full' or 'elided' need a declared labels capability; edge_labels true needs labels.edge", async () => {
    const m = await o1();
    const s = initialState(m, { width: 9, height: 9 });
    const none = manifest({ status: "unsupported", reason: "HOST_LACKS" }, { status: "unsupported", reason: "NOT_IMPLEMENTED" });
    const some = manifest({ status: "supported" }, { status: "supported" });
    expect(checkFidelity(none, buildReport(m, s, FULL), false)).toMatch(/labels/);
    expect(checkFidelity(none, buildReport(m, s, { ...FULL, labels: "none" }), false)).toBeUndefined();
    expect(checkFidelity(none, buildReport(m, s, { ...FULL, labels: "none", edge_labels: true }), false)).toMatch(/edge_labels/);
    expect(checkFidelity(some, buildReport(m, s, { ...FULL, edge_labels: true }), false)).toBeUndefined();
  });
});
