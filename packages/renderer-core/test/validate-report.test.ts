// Rev 4, design 11: validateReport V1-V5 (no binding, no hash comparison), compareProjections order, serializeProjection (rows C14-C21).
import { describe, expect, it } from "vitest";
import { buildReport, compareProjections, semanticProjection, serializeProjection } from "../src/report.js";
import { buildRenderModel } from "../src/model.js";
import { reduce } from "../src/reduce.js";
import { initialState } from "../src/state.js";
import type { RenderModel, RenderReport } from "../src/types.js";
import { errOf, igl, o1Scene } from "./helpers.js";

const I1 = { id: "i:1", type: "person" }, ANN = { id: "s:ann", type: "person" };
const FULL: RenderReport["fidelity"] = { labels: "full", edge_labels: false, motion: "none", degradations: [] };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
let M: RenderModel;
const o1 = async () => (M ??= await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json")));
const rep = async (): Promise<RenderReport> => { const m = await o1(); return buildReport(m, initialState(m, { width: 900, height: 600 }), FULL); };
const named = (list: [string, unknown][]) => list.map(([renderer, report]) => ({ renderer, report: report as RenderReport }));
const cmp = async (list: [string, unknown][]) => { await o1(); return errOf(() => compareProjections(M, named(list))); };
const hex = "0".repeat(64);

describe("V1-V5 order and codes (first failure wins)", () => {
  it("V1 SCHEMA: keys, types, element sets, address shapes, accessible, fidelity, state step-1 rules (viewport range and hash shape included)", async () => {
    const base = await rep();
    const bad = async (f: (r: Record<string, any>) => void) => { const r = clone(base) as unknown as Record<string, any>; f(r); return cmp([["a", base], ["b", r]]); };
    expect(await bad((r) => { r["extra"] = 1; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { delete r["fidelity"]; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["igr"] = 5; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["scene_sha256"] = "XYZ"; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["drawn"] = { nodes: [] }; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["drawn"].nodes[0] = { id: "i:1" }; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["drawn"].nodes[0] = { id: 5, type: "person" }; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["marked"] = { focus: { node: I1 } }; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["marked"].focus = { node: I1, edge: {} }; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["accessible"].items[0].position = "1"; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["accessible"].items[0].address = I1; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["fidelity"].edge_labels = "no"; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["state"].viewport.zoom = 0; })).toBe("INVALID_REPORT/SCHEMA"); // C21
    expect(await bad((r) => { r["state"].layout_sha256 = "bad"; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["state"]["x-a"] = 1; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { delete r["state"].viewport; })).toBe("INVALID_REPORT/SCHEMA");
    expect(await bad((r) => { r["state"].selection.nodes = [{ id: "s:\ud800", type: "person" }]; })).toBe("INVALID_REPORT/SCHEMA"); // a lone surrogate in the state is a step-1 failure: SCHEMA inside a report
  });
  it("V1 does not pattern-check address content; V2 judges the version of the report and of its state", async () => {
    const base = await rep();
    const odd = clone(base); odd.drawn.nodes[0] = { id: "not a tagged id", type: "per son" };
    expect(await cmp([["a", base], ["b", odd]])).toBe("INVALID_REPORT/UNRESOLVED_ELEMENT"); // shape ok, names nothing (V3), not SCHEMA
    const v = clone(base); v.igr = "IGR/2" as never;
    expect(await cmp([["a", base], ["b", v]])).toBe("INVALID_REPORT/UNSUPPORTED_VERSION");
    const sv = clone(base); (sv.state as { igr: string }).igr = "IGR/2";
    expect(await cmp([["a", base], ["b", sv]])).toBe("INVALID_REPORT/UNSUPPORTED_VERSION");
    const both = clone(base) as unknown as Record<string, any>; both["igr"] = "IGR/2"; both["extra"] = 1;
    expect(await cmp([["a", base], ["b", both]])).toBe("INVALID_REPORT/SCHEMA"); // V1 before V2
  });
  it("V3 resolves addresses in the order state, drawn, marked, accessible.items", async () => {
    const m = await o1();
    const withSel = buildReport(m, reduce(m, initialState(m, { width: 900, height: 600 }), { type: "select", mode: "replace", targets: [{ node: I1 }] }).state, FULL);
    const ghost = { id: "i:9", type: "person" };
    const mk = (f: (r: RenderReport) => void) => { const r = clone(withSel); f(r); return r; };
    expect(await cmp([["a", mk((r) => { r.state.selection.nodes = [ghost]; r.drawn.nodes = [ghost]; })]])).toBe("INVALID_REPORT/UNRESOLVED_ELEMENT");
    expect(await cmp([["a", mk((r) => { r.accessible.items[0]!.address = { node: ghost }; })]])).toBe("INVALID_REPORT/UNRESOLVED_ELEMENT");
    // a V5 problem does not hide a V3 problem: V3 first
    expect(await cmp([["a", mk((r) => { r.drawn.nodes.pop(); r.accessible.items[0]!.address = { node: ghost }; })]])).toBe("INVALID_REPORT/UNRESOLVED_ELEMENT");
  });
  it("V4 NON_CANONICAL: duplicate, selected or focused element hidden (C19); V5 INCONSISTENT after", async () => {
    const m = await o1();
    const s0 = initialState(m, { width: 900, height: 600 });
    const r = buildReport(m, reduce(m, s0, { type: "select", mode: "replace", targets: [{ node: I1 }] }).state, FULL);
    const hiddenSel = clone(r); hiddenSel.state.hidden.nodes = [I1];
    expect(await cmp([["a", hiddenSel]])).toBe("INVALID_REPORT/NON_CANONICAL"); // C19, though drawn also mismatches (V5)
    const dup = clone(r); dup.state.selection.nodes = [I1, I1];
    expect(await cmp([["a", dup]])).toBe("INVALID_REPORT/NON_CANONICAL");
    const lacks = clone(r); lacks.drawn.nodes.pop();
    expect(await cmp([["a", lacks]])).toBe("INVALID_REPORT/INCONSISTENT");
  });
  it("V5: drawn and marked.selected are compared as sets (a duplicate, a missing or an extra element is INCONSISTENT; order is free)", async () => {
    const base = await rep();
    const dup = clone(base); dup.drawn.nodes.push(I1);
    expect(await cmp([["a", dup]])).toBe("INVALID_REPORT/INCONSISTENT");
    const rev = clone(base); rev.drawn.nodes.reverse();
    expect(await cmp([["a", rev]])).toBe("no error");
    const sel = clone(base); sel.marked.selected.nodes = [ANN];
    expect(await cmp([["a", sel]])).toBe("INVALID_REPORT/INCONSISTENT");
  });
  it("entries are validated in listed order: the first invalid entry throws", async () => {
    const base = await rep();
    const v2 = clone(base); v2.igr = "IGR/2" as never;
    const sc = clone(base) as unknown as Record<string, unknown>; delete sc["accessible"];
    expect(await cmp([["a", v2], ["b", sc]])).toBe("INVALID_REPORT/UNSUPPORTED_VERSION");
    expect(await cmp([["a", sc], ["b", v2]])).toBe("INVALID_REPORT/SCHEMA");
  });
});

describe("compareProjections: validation, then hashes, then the comparison (C14-C17, C20)", () => {
  it("C14/C15 validation precedes the hash check; C06 hashes consistently changed are comparable:false", async () => {
    const base = await rep();
    const hashed = clone(base); hashed.scene_sha256 = hex; hashed.state.scene_sha256 = hex;
    const lacks = clone(base); lacks.drawn.nodes.pop();
    expect(await cmp([["a", base], ["b", hashed], ["c", lacks]])).toBe("INVALID_REPORT/INCONSISTENT");
    const ghost = clone(base); ghost.drawn.nodes[0] = { id: "i:9", type: "person" };
    expect(await cmp([["a", base], ["b", hashed], ["c", ghost]])).toBe("INVALID_REPORT/UNRESOLVED_ELEMENT");
    expect(compareProjections(M, named([["a", base], ["b", hashed]]))).toEqual({ comparable: false });
  });
  it("C16 a stale state.scene_sha256 with the right top-level hashes is an ordinary difference", async () => {
    const base = await rep();
    const stale = clone(base); stale.state.scene_sha256 = "f".repeat(64);
    expect(compareProjections(M, named([["a", base], ["b", stale]]))).toEqual({ agree: false, differences: [{ path: "state.scene_sha256", renderers: ["b"] }] });
  });
  it("C17 drawn in another order is a path difference at the elements that differ", async () => {
    const base = await rep();
    const rev = clone(base); rev.drawn.nodes.reverse();
    expect(compareProjections(M, named([["a", base], ["b", rev]]))).toEqual({ agree: false, differences: [{ path: "drawn.nodes[0].id", renderers: ["b"] }, { path: "drawn.nodes[1].id", renderers: ["b"] }] });
  });
  it("C20 five reports, tied largest groups: the group with the earliest-listed member is the reference", async () => {
    const base = await rep();
    const mk = (s: string) => { const r = clone(base); r.accessible.status = s; return r; };
    expect(compareProjections(M, named([["a", mk("Z")], ["b", mk("X")], ["c", mk("X")], ["d", mk("Y")], ["e", mk("Y")]]))).toEqual({ agree: false, differences: [{ path: "accessible.status", renderers: ["a", "d", "e"] }] });
  });
  it("an undefined optional value (marked.focus) is absent", async () => {
    const base = await rep();
    const u = clone(base) as unknown as Record<string, any>; u["marked"].focus = undefined;
    expect(compareProjections(M, named([["a", base], ["b", u]]))).toEqual({ agree: true, differences: [] });
  });
});

describe("serializeProjection (C18)", () => {
  it("validates like a report, then requires the top-level hashes AND the state's hashes to equal the model's", async () => {
    const m = await o1();
    const base = await rep();
    const bad = (f: (r: RenderReport) => void) => { const r = clone(base); f(r); return errOf(() => serializeProjection(m, semanticProjection(r))); };
    expect(bad((r) => { r.scene_sha256 = hex; })).toBe("INVALID_REPORT/INCONSISTENT"); // C18
    expect(bad((r) => { r.state.layout_sha256 = hex; })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r.drawn.nodes.pop(); })).toBe("INVALID_REPORT/INCONSISTENT");
    expect(bad((r) => { r.state.viewport.zoom = 0; })).toBe("INVALID_REPORT/SCHEMA");
    expect(errOf(() => serializeProjection(m, base as never))).toBe("INVALID_REPORT/SCHEMA"); // a report has fidelity: not a projection
    expect(bad(() => undefined)).toBe("no error");
  });
});
