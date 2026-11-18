// Audit I-6: unit tests that kill the auditor's core mutants M01-M14 (the oracle corpus cannot be edited here; new rows will be requested).
// M01 and M02 survived both the corpus and the earlier tests; the others are at-limit and tie cases made explicit below.
import { describe, expect, it } from "vitest";
import { buildRenderModel } from "../src/model.js";
import { initialState, serializeState } from "../src/state.js";
import { reduce } from "../src/reduce.js";
import { createHeadlessRenderer } from "../src/headless/index.js";
import { quantizeMilli, quantizePx } from "../src/viewport.js";
import { hitTest } from "../src/hit.js";
import { parseState } from "../src/state.js";
import { summaryText, graphSummary } from "../src/a11y.js";
import { enc, errOf, errOfAsync, handModel, igl, o1Scene } from "./helpers.js";

describe("M01: fit centre uses divRound, not truncating division", () => {
  it("a bounding box with an odd positive coordinate sum centres on the rounded-up half", async () => {
    // x thousandths 1 and 2 (sum 3): divRound(3, 2) = 2, truncation gives 1; y thousandths 3 and 4 (sum 7): 4 versus 3
    const m = await handModel([{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [], { positions: [[0.001, 0.003], [0.002, 0.004]] });
    expect(m.bounds).toEqual({ min_x: 1, min_y: 3, max_x: 2, max_y: 4 });
    const s = initialState(m, { width: 900, height: 600 });
    expect([s.viewport.center_x, s.viewport.center_y]).toEqual([2, 4]);
    const moved = reduce(m, s, { type: "set-viewport", center_x: 0, center_y: 0, zoom: 1000 }).state;
    expect(reduce(m, moved, { type: "fit" }).state.viewport).toMatchObject({ center_x: 2, center_y: 4 });
  });
});

describe("M02: SELECTED_HIDDEN is judged before FOCUS_HIDDEN", () => {
  it("a state that violates both reports the selection", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const base = initialState(m, { width: 900, height: 600 });
    const both = { ...base, selection: { nodes: [{ id: "i:1", type: "person" }], edges: [] }, focus: { node: { id: "i:1", type: "person" } }, hidden: { nodes: [{ id: "i:1", type: "person" }], edges: [] } };
    expect(errOf(() => serializeState(m, both))).toBe("INVALID_STATE/SELECTED_HIDDEN");
    const bytes = enc(JSON.stringify({ focus: both.focus, hidden: both.hidden, igr: "IGR/1", layout_sha256: base.layout_sha256, scene_sha256: base.scene_sha256, selection: both.selection, viewport: base.viewport }));
    expect(errOf(() => parseState(m, bytes))).toBe("INVALID_STATE/SELECTED_HIDDEN");
  });
});

describe("M03-M14: at-limit and tie cases", () => {
  it("M03 an empty graph has no categories clause", async () => {
    const m = await buildRenderModel(igl("scenes/empty.scene.json"), igl("layouts/F07.layout.json"));
    expect(summaryText(graphSummary(m))).toBe("Directed graph with 0 nodes and 0 edges.");
  });
  it("M04 a model exactly at the renderer's capacity is accepted (inclusive), one over is refused", async () => {
    const m = await handModel([{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b" }]);
    const at = createHeadlessRenderer({ capacity: { maxNodes: 2, maxEdges: 1 } });
    await at.initialize({ host: "headless", size: { width: 9, height: 9 }, reducedMotion: false });
    await expect(at.loadScene(m)).resolves.toBeUndefined();
    const over = createHeadlessRenderer({ capacity: { maxNodes: 1, maxEdges: 1 } });
    await over.initialize({ host: "headless", size: { width: 9, height: 9 }, reducedMotion: false });
    expect(await errOfAsync(() => over.loadScene(m))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
  });
  it("M05 a pointer coordinate of exactly 2^31 is accepted, one beyond is OUT_OF_RANGE", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const s = initialState(m, { width: 900, height: 600 });
    expect(errOf(() => hitTest(m, s, { x: 2 ** 31, y: -(2 ** 31) }))).toBe("no error");
    expect(errOf(() => hitTest(m, s, { x: 2 ** 31 + 1, y: 0 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("M06 a lone surrogate escape in a state is INVALID_STRING", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const good = new TextDecoder().decode(serializeState(m, initialState(m, { width: 900, height: 600 })));
    expect(errOf(() => parseState(m, enc(good.replace('"igr":"IGR/1"', '"igr":"IGR/1\\ud800"'))))).toBe("INVALID_STATE/INVALID_STRING");
  });
  it("M08 select with exactly the text budget is accepted, one less is TARGET_LIMIT", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const s = initialState(m, { width: 900, height: 600 });
    const t = [{ node: { id: "i:1", type: "person" } }];
    expect(errOf(() => reduce(m, s, { type: "select", mode: "add", targets: t }, { maxSceneBytes: 9 }))).toBe("no error");
    expect(errOf(() => reduce(m, s, { type: "select", mode: "add", targets: t }, { maxSceneBytes: 8 }))).toBe("RESOURCE_LIMIT/TARGET_LIMIT");
  });
  it("M12 a state exactly at maxStateBytes is accepted, one byte less is BYTES_LIMIT", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const b = serializeState(m, initialState(m, { width: 900, height: 600 }));
    expect(errOf(() => parseState(m, b, { maxStateBytes: b.length }))).toBe("no error");
    expect(errOf(() => parseState(m, b, { maxStateBytes: b.length - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("M13 the quantizer rounds a .5 milli tie up on both scales, on both signs", () => {
    expect(quantizeMilli(0.0625)).toBe(63); // 62.5
    expect(quantizeMilli(-0.0625)).toBe(-62); // -62.5
    expect(quantizeMilli(0.0005)).toBe(1);
    expect(quantizePx(0.5)).toBe(1);
    expect(quantizePx(-0.5)).toBe(0);
    expect(quantizePx(2.5)).toBe(3);
  });
});

describe("audit N-4: N4-N8 (fresh mutants of the re-check)", () => {
  it("N7 categories are ordered by UTF-8 bytes, not UTF-16 code units (a BMP character above U+E000 against an astral one)", async () => {
    const bmp = "\uff5e", astral = "\u{1F600}"; // UTF-8: EF BD 9E < F0 9F 98 80; UTF-16: FF5E > D83D
    const m = await handModel([{ id: "s:a", type: astral, category: astral, label: "a" }, { id: "s:b", type: bmp, category: bmp, label: "b" }]);
    expect([...m.categories]).toEqual([bmp, astral]);
    expect(summaryText(graphSummary(m))).toContain(`Node categories: ${bmp} (1), ${astral} (1).`);
  });
  it("N4 duplicate degradations are SCHEMA; unsorted too", async () => {
    const { verifyManifest } = await import("../src/manifest.js");
    const caps: Record<string, unknown> = Object.fromEntries(["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "a11y.model", "state.report", "lifecycle", "export.scene", "labels", "direction-cue", "indicators.non-color"].map((k) => [k, { status: "supported" }]));
    for (const k of ["export.svg", "export.png", "a11y.native-dom", "a11y.companion-dom", "labels.edge", "motion.animated"]) caps[k] = { status: "unsupported", reason: "NOT_IMPLEMENTED" };
    caps["scene.apply-delta"] = { status: "unsupported", reason: "RESERVED" };
    const man = (d: string[]) => ({ igr: "IGR/1", renderer: { name: "m", version: "1", host: "dom" }, capabilities: { ...caps, "x-a": { status: "degraded", degradations: d } }, capacity: { maxNodes: 1, maxEdges: 1, maxDrawnLabelUnits: 1 } });
    expect(errOf(() => verifyManifest(man(["LABELS_ELIDED", "LABELS_ELIDED"])))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(errOf(() => verifyManifest(man(["LABELS_ELIDED", "EDGE_LABELS_OMITTED"])))).toBe("INVALID_MANIFEST/SCHEMA");
    expect(errOf(() => verifyManifest(man(["EDGE_LABELS_OMITTED", "LABELS_ELIDED"])))).toBe("no error");
  });
  it("N5 an edge ord with leading zeros is INVALID_VALUE in a state", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const base = initialState(m, { width: 900, height: 600 });
    const e = { ord: "01", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } };
    expect(errOf(() => serializeState(m, { ...base, selection: { nodes: [], edges: [e] } }))).toBe("INVALID_STATE/INVALID_VALUE");
    expect(errOf(() => serializeState(m, { ...base, selection: { nodes: [], edges: [{ ...e, ord: "0" }] } }))).toBe("no error");
  });
  it("N6 a fractional host limit is INVALID_INPUT/INVALID_VALUE (every limit key)", async () => {
    for (const k of ["maxSceneBytes", "maxLayoutBytes", "maxNodes", "maxEdges", "maxTotalLabelUnits", "maxStateBytes", "maxIntentTargets"]) {
      expect(await errOfAsync(() => buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"), { limits: { [k]: 2.5 } }))).toBe("INVALID_INPUT/INVALID_VALUE");
    }
  });
  it("N8 the viewport size bound is inclusive in a state: 16384 accepted, 16385 and 0 rejected", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    const base = initialState(m, { width: 900, height: 600 });
    const w = (width: number) => errOf(() => serializeState(m, { ...base, viewport: { ...base.viewport, width } }));
    expect([w(16384), w(1), w(16385), w(0)]).toEqual(["no error", "no error", "INVALID_STATE/INVALID_VIEWPORT", "INVALID_STATE/INVALID_VIEWPORT"]);
  });
});
