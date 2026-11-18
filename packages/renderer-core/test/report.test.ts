// RenderReport, the semantic projection, strict serialization and comparison (design section 11; vectors C01-C08).
import { describe, expect, it } from "vitest";
import { buildReport, checkFidelity, compareProjections, semanticProjection, serializeProjection } from "../src/report.js";
import { buildRenderModel } from "../src/model.js";
import { reduce } from "../src/reduce.js";
import { initialState, serializeState } from "../src/state.js";
import type { CapabilityManifest, RenderModel, RenderReport, SemanticState } from "../src/types.js";
import { verifyManifest } from "../src/manifest.js";
import { dec, errOf, igl, o1Scene } from "./helpers.js";

const I1 = { id: "i:1", type: "person" }, ANN = { id: "s:ann", type: "person" };
const E0 = { ord: "0", rel: "KNOWS", src: I1, tgt: ANN };
const o1 = () => buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
const FULL: RenderReport["fidelity"] = { labels: "full", edge_labels: false, motion: "none", degradations: [] };
const rep = (m: RenderModel, s: SemanticState, f = FULL): RenderReport => buildReport(m, s, f);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("buildReport and semanticProjection", () => {
  it("drawn is every effectively visible element regardless of the viewport; marked mirrors the state", async () => {
    const m = await o1();
    let s = initialState(m, { width: 900, height: 600 });
    s = reduce(m, s, { type: "select", mode: "replace", targets: [{ node: I1 }, { edge: E0 }] }).state;
    s = reduce(m, s, { type: "focus", target: { node: ANN } }).state;
    s = reduce(m, s, { type: "pan", dx: 2 ** 20, dy: 0 }).state; // everything is off screen: culling is invisible
    const r = rep(m, s);
    expect(r.drawn).toEqual({ nodes: [I1, ANN], edges: [E0] });
    expect(r.marked).toEqual({ selected: { nodes: [I1], edges: [E0] }, focus: { node: ANN } });
    expect(r.igr).toBe("IGR/1");
    expect(r.scene_sha256).toBe(m.sceneSha256);
    expect(r.accessible.items).toHaveLength(3);
    expect(r.state).toEqual(s);
  });
  it("a hidden element is not drawn; no focus gives no marked.focus key", async () => {
    const m = await o1();
    const s = reduce(m, initialState(m, { width: 900, height: 600 }), { type: "set-hidden", targets: [{ node: ANN }], hidden: true }).state;
    const r = rep(m, s);
    expect(r.drawn).toEqual({ nodes: [I1], edges: [] });
    expect("focus" in r.marked).toBe(false);
  });
  it("semanticProjection drops fidelity and nothing else", async () => {
    const m = await o1();
    const r = rep(m, initialState(m, { width: 900, height: 600 }));
    const p = semanticProjection(r);
    expect(Object.keys(p).sort()).toEqual(["accessible", "drawn", "igr", "layout_sha256", "marked", "scene_sha256", "state"]);
  });
});

describe("serializeProjection (strict)", () => {
  it("equals IGR-CJ/1 of the projection with the state serialized strictly", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const text = dec(serializeProjection(m, semanticProjection(rep(m, s))));
    const v = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(v)).toEqual(["accessible", "drawn", "igr", "layout_sha256", "marked", "scene_sha256", "state"]); // sorted keys
    expect(JSON.stringify(v["state"])).toBe(dec(serializeState(m, s)));
    expect(text).not.toContain("fidelity");
  });
  it("K07 a click-ordered selection in the reported state is INVALID_REPORT/NON_CANONICAL (V4: the state does not serialize strictly; the kit turns this into a fail)", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const r = rep(m, s);
    r.state = { ...s, selection: { nodes: [ANN, I1], edges: [] } };
    r.marked = { selected: { nodes: [ANN, I1], edges: [] } };
    expect(errOf(() => serializeProjection(m, semanticProjection(r)))).toBe("INVALID_REPORT/NON_CANONICAL");
  });
  it("INCONSISTENT: drawn not the visible set, marked.selected not the selection, marked.focus not the focus", async () => {
    const m = await o1();
    const s = reduce(m, initialState(m, { width: 900, height: 600 }), { type: "select", mode: "replace", targets: [{ node: I1 }] }).state;
    const bad = (f: (r: RenderReport) => void) => { const r = clone(rep(m, s)); f(r); return errOf(() => serializeProjection(m, semanticProjection(r))); };
    expect(bad((r) => { r.drawn.nodes.pop(); })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r.drawn.nodes.push(r.drawn.nodes[0]!); })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r.drawn.edges = []; })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r.marked.selected = { nodes: [], edges: [] }; })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r.marked.focus = { node: ANN }; })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r.drawn.nodes.reverse(); })).toBe("no error"); // rev 4 (11 V5): drawn is a SET comparison, order is free
    expect(bad((r) => { r.drawn.nodes[0] = { id: "i:9", type: "person" }; })).toBe("INVALID_REPORT/UNRESOLVED_ELEMENT");
  });
  it("version UNSUPPORTED_VERSION, shape SCHEMA; reports carry no SCENE_MISMATCH/LAYOUT_MISMATCH reason (rev 3): a wrong hash is INCONSISTENT here", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const bad = (f: (r: Record<string, unknown>) => void) => { const r = clone(semanticProjection(rep(m, s))) as unknown as Record<string, unknown>; f(r); return errOf(() => serializeProjection(m, r as never)); };
    expect(bad((r) => { r["scene_sha256"] = "0".repeat(64); })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r["layout_sha256"] = "0".repeat(64); })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r["igr"] = "IGR/2"; })).toBe("INVALID_REPORT/UNSUPPORTED_VERSION");
    expect(bad((r) => { r["extra"] = 1; })).toBe("INVALID_REPORT/SCHEMA");
    expect(bad((r) => { delete r["accessible"]; })).toBe("INVALID_REPORT/SCHEMA");
    expect(bad((r) => { r["drawn"] = []; })).toBe("INVALID_REPORT/SCHEMA");
    expect(bad((r) => { (r["accessible"] as Record<string, unknown>)["items"] = "x"; })).toBe("INVALID_REPORT/SCHEMA");
    expect(errOf(() => serializeProjection(m, null as never))).toBe("INVALID_REPORT/SCHEMA");
  });
  it("hostile text (a lone surrogate) is INVALID_REPORT, not an IgsError", async () => {
    const m = await o1();
    const r = rep(m, initialState(m, { width: 900, height: 600 }));
    r.accessible.status = "bad \ud800";
    expect(errOf(() => serializeProjection(m, semanticProjection(r)))).toBe("INVALID_REPORT/SCHEMA");
    const cyc: Record<string, unknown> = {}; cyc["self"] = cyc;
    const r2 = rep(m, initialState(m, { width: 900, height: 600 })) as unknown as Record<string, unknown>;
    (r2["accessible"] as Record<string, unknown>)["items"] = [cyc];
    expect(errOf(() => serializeProjection(m, semanticProjection(r2 as never)))).toBe("INVALID_REPORT/SCHEMA");
  });
});

describe("compareProjections (C01-C08)", () => {
  const named = (list: [string, RenderReport][]) => list.map(([renderer, report]) => ({ renderer, report }));
  it("C01 identical reports agree; C02 differing fidelity only agrees", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    expect(compareProjections(m, named([["a", rep(m, s)], ["b", rep(m, s)]]))).toEqual({ agree: true, differences: [] });
    const elided = rep(m, s, { labels: "elided", edge_labels: true, motion: "full", degradations: ["LABELS_ELIDED"] });
    expect(compareProjections(m, named([["svg", rep(m, s)], ["canvas", elided]]))).toEqual({ agree: true, differences: [] });
  });
  it("C03 a different focus gives four named paths (marked.focus, state.focus, the focused flag and the status text)", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const withFocus = reduce(m, s, { type: "focus", target: { node: I1 } }).state;
    expect(compareProjections(m, named([["a", rep(m, s)], ["b", rep(m, withFocus)]]))).toEqual({ agree: false, differences: [
      { path: "accessible.items[0].focused", renderers: ["b"] }, { path: "accessible.status", renderers: ["b"] }, { path: "marked.focus", renderers: ["b"] }, { path: "state.focus", renderers: ["b"] }] });
    // a report whose state differs from its marks is INCONSISTENT (rev 3: every report is validated first)
    const b = clone(rep(m, s)); b.state = withFocus;
    expect(errOf(() => compareProjections(m, named([["a", rep(m, s)], ["b", b]])))).toBe("INVALID_REPORT/INCONSISTENT");
  });
  it("C03b a consistent focus difference shows at marked.focus and state.focus (and the accessible flags), sorted by path", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const r = compareProjections(m, named([["a", rep(m, s)], ["b", rep(m, reduce(m, s, { type: "focus", target: { node: I1 } }).state)]]));
    if ("comparable" in r) throw new Error("comparable expected");
    expect(r.agree).toBe(false);
    const paths = r.differences.map((d) => d.path);
    expect(paths).toEqual([...paths].sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y))));
    expect(paths).toContain("marked.focus");
    expect(paths).toContain("state.focus");
    expect(paths).toContain("accessible.items[0].focused");
    expect(paths).toContain("accessible.status");
  });
  it("C04 a different hidden set (drawn follows): arrays of different length differ at the array path", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const hidden = reduce(m, s, { type: "set-hidden", targets: [{ node: ANN }], hidden: true }).state;
    const r = compareProjections(m, named([["a", rep(m, s)], ["b", rep(m, hidden)]]));
    if ("comparable" in r) throw new Error("x");
    expect(r.differences.map((d) => d.path)).toEqual(["accessible.items", "accessible.status", "drawn.edges", "drawn.nodes", "state.hidden.nodes"]);
    expect(r.differences.every((d) => d.renderers.join() === "b")).toBe(true);
  });
  it("C05 different accessible text: the deepest path", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const b = clone(rep(m, s)); b.accessible.items[1]!.name = "person Ann";
    expect(compareProjections(m, named([["a", rep(m, s)], ["b", b]]))).toEqual({ agree: false, differences: [{ path: "accessible.items[1].name", renderers: ["b"] }] });
  });
  it("C06 hashes that differ from the model are not comparable, a result and not an error (the state hash is changed consistently too)", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const b = clone(rep(m, s)); b.scene_sha256 = "0".repeat(64); b.state.scene_sha256 = "0".repeat(64);
    expect(compareProjections(m, named([["a", rep(m, s)], ["b", b]]))).toEqual({ comparable: false });
    const c = clone(rep(m, s)); c.layout_sha256 = "0".repeat(64); c.state.layout_sha256 = "0".repeat(64);
    expect(compareProjections(m, named([["a", rep(m, s)], ["c", c]]))).toEqual({ comparable: false });
  });
  it("C07 entries may carry a manifest, which is ignored", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const e = [{ renderer: "x", report: rep(m, s), manifest: { anything: 1 } as never }, { renderer: "y", report: rep(m, s), manifest: { other: 2 } as never }];
    expect(compareProjections(m, e)).toEqual({ agree: true, differences: [] });
  });
  it("C09-C13 an invalid report throws INVALID_REPORT before anything is compared", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const withSel = reduce(m, s, { type: "select", mode: "replace", targets: [{ node: I1 }, { node: ANN }] }).state;
    const pair = (b: RenderReport) => named([["a", rep(m, withSel)], ["b", b]]);
    const lacks = clone(rep(m, withSel)); lacks.drawn.nodes.pop();
    expect(errOf(() => compareProjections(m, pair(lacks)))).toBe("INVALID_REPORT/INCONSISTENT"); // C09
    const ghost = clone(rep(m, withSel)); ghost.marked.selected.nodes[0] = { id: "i:9", type: "person" };
    expect(errOf(() => compareProjections(m, pair(ghost)))).toBe("INVALID_REPORT/UNRESOLVED_ELEMENT"); // C10
    const noAcc = clone(rep(m, withSel)) as unknown as Record<string, unknown>; delete noAcc["accessible"];
    expect(errOf(() => compareProjections(m, pair(noAcc as never)))).toBe("INVALID_REPORT/SCHEMA"); // C11
    const v2 = clone(rep(m, withSel)) as unknown as Record<string, unknown>; v2["igr"] = "IGR/2";
    expect(errOf(() => compareProjections(m, pair(v2 as never)))).toBe("INVALID_REPORT/UNSUPPORTED_VERSION"); // C12
    const unsorted = clone(rep(m, withSel)); unsorted.state.selection.nodes.reverse(); unsorted.marked.selected.nodes.reverse();
    expect(errOf(() => compareProjections(m, pair(unsorted)))).toBe("INVALID_REPORT/NON_CANONICAL"); // C13: a state that does not serialize strictly
  });
  it("C08 three reports: the odd renderer is named; the majority is the reference; names are sorted; a tie takes the first-listed value", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const odd = clone(rep(m, s)); odd.accessible.status = "x";
    expect(compareProjections(m, named([["a", rep(m, s)], ["b", rep(m, s)], ["c", odd]]))).toEqual({ agree: false, differences: [{ path: "accessible.status", renderers: ["c"] }] });
    expect(compareProjections(m, named([["c", odd], ["b", rep(m, s)], ["a", rep(m, s)]]))).toEqual({ agree: false, differences: [{ path: "accessible.status", renderers: ["c"] }] });
    expect(compareProjections(m, named([["a", odd], ["b", rep(m, s)]]))).toEqual({ agree: false, differences: [{ path: "accessible.status", renderers: ["b"] }] });
    const odd2 = clone(rep(m, s)); odd2.accessible.status = "y";
    const three = compareProjections(m, named([["z", odd], ["m", odd2], ["a", rep(m, s)]]));
    expect(three).toEqual({ agree: false, differences: [{ path: "accessible.status", renderers: ["a", "m"] }] }); // all three differ: reference is the first-listed value
  });
  it("a value present in one report and absent in another differs at that key", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const withFocus = reduce(m, s, { type: "focus", target: { node: I1 } }).state;
    const a = rep(m, s);
    const b = clone(rep(m, s)); b.state = withFocus; b.marked.focus = { node: I1 };
    const r = compareProjections(m, named([["a", a], ["b", b]]));
    if ("comparable" in r) throw new Error("x");
    expect(r.differences.find((d) => d.path === "marked.focus")).toEqual({ path: "marked.focus", renderers: ["b"] });
  });
  it("invalid input: an empty list, a non-array, an invalid state are errors; identical renderer names are not supported input", async () => {
    const m = await o1();
    expect(errOf(() => compareProjections(m, [] as never))).toBe("INVALID_REPORT/SCHEMA");
    expect(errOf(() => compareProjections(m, "x" as never))).toBe("INVALID_REPORT/SCHEMA");
    const s = initialState(m, { width: 900, height: 600 });
    const b = clone(rep(m, s)); b.state.selection = { nodes: [ANN, I1], edges: [] };
    expect(errOf(() => compareProjections(m, named([["a", rep(m, s)], ["b", b]])))).toBe("INVALID_REPORT/NON_CANONICAL");
  });
});

describe("fidelity is checked only against the manifest (section 11)", () => {
  const manifest = (labels: unknown): CapabilityManifest => verifyManifest({
    igr: "IGR/1", renderer: { name: "x", version: "1", host: "dom" },
    capabilities: Object.fromEntries([...["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "direction-cue", "indicators.non-color", "a11y.model", "state.report", "lifecycle"].map((k) => [k, { status: "supported" }]),
      ["labels", labels], ["export.scene", { status: "supported" }], ["export.svg", { status: "unsupported", reason: "NOT_IMPLEMENTED" }], ["export.png", { status: "unsupported", reason: "NOT_IMPLEMENTED" }],
      ["a11y.native-dom", { status: "supported" }], ["a11y.companion-dom", { status: "unsupported", reason: "NOT_IMPLEMENTED" }], ["labels.edge", { status: "supported" }], ["motion.animated", { status: "supported" }], ["scene.apply-delta", { status: "unsupported", reason: "RESERVED" }]]),
    capacity: { maxNodes: 10, maxEdges: 10, maxDrawnLabelUnits: 10 },
  });
  it("K29 elided labels need LABELS_ELIDED; K30 motion full is invalid under reduced motion; degradations must be declared", async () => {
    const m = await o1();
    const s = initialState(m, { width: 900, height: 600 });
    const plain = manifest({ status: "supported" }), elidable = manifest({ status: "degraded", degradations: ["LABELS_ELIDED"] });
    expect(checkFidelity(plain, rep(m, s), false)).toBeUndefined();
    expect(checkFidelity(plain, rep(m, s, { ...FULL, labels: "elided" }), false)).toMatch(/LABELS_ELIDED/);
    expect(checkFidelity(elidable, rep(m, s, { ...FULL, labels: "elided", degradations: ["LABELS_ELIDED"] }), false)).toBeUndefined();
    expect(checkFidelity(plain, rep(m, s, { ...FULL, degradations: ["LABELS_ELIDED"] }), false)).toMatch(/degradations/);
    expect(checkFidelity(plain, rep(m, s, { ...FULL, motion: "full" }), true)).toMatch(/motion/);
    expect(checkFidelity(plain, rep(m, s, { ...FULL, motion: "full" }), false)).toBeUndefined();
  });
});
