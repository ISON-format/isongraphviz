// Unit tests of demo/playground-lib.mjs, the pure helpers of the playground page (NON-NORMATIVE demo code; see demo/playground.mjs): search matching, neighbour
// sets, hidden-set arithmetic, viewport and minimap arithmetic, drag arithmetic, and the FIXED-layout round trip the page relies on (a moved node gives a valid new
// layout, the original layout bytes stay as they are). They read the sample the page ships (demo/playground-sample.ison); no browser is involved.
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { computeFixedLayout, verifyLayout } from "isongraph-visualize-layout-core";
import { ZOOM_MAX_MILLI, ZOOM_MIN_MILLI, buildRenderModel, effectiveVisibility, fitViewport, initialState, layoutToScreen, reduce, type RenderModel } from "isongraph-visualize-renderer-core";
import { playgroundData } from "../scripts/playground-data.mjs";
import * as L from "../demo/playground-lib.mjs";
import { PKG_DIR, sha256 } from "./helpers.js";

const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));
let model: RenderModel, scene: Uint8Array, layout: Uint8Array;
const nodeIndex = (label: string): number => model.nodes.find((n) => n.label === label)!.index;
const SIZE = { width: 800, height: 520 };

beforeAll(async () => {
  const d = await playgroundData(join(PKG_DIR, "demo", "playground-sample.ison"));
  scene = unb64(d.sceneB64); layout = unb64(d.layoutB64);
  model = await buildRenderModel(scene, layout);
});

describe("the sample (demo/playground-sample.ison)", () => {
  it("has 9 to 30 nodes, at least three types and three relations (people, companies, projects)", () => {
    expect(model.nodes.length).toBeGreaterThanOrEqual(9);
    expect(model.nodes.length).toBeLessThanOrEqual(30);
    expect(model.categories).toEqual(["company", "person", "project"]);
    expect(L.relationCounts(model).length).toBeGreaterThanOrEqual(3);
  });
  it("relationCounts is sorted and counts every edge once", () => {
    const rc = L.relationCounts(model);
    expect(rc.map((r) => r.name)).toEqual([...rc.map((r) => r.name)].sort());
    expect(rc.reduce((s, r) => s + r.count, 0)).toBe(model.edges.length);
  });
});

describe("constants", () => {
  it("the zoom range mirrors renderer-core's", () => {
    expect(L.ZOOM_MIN).toBe(ZOOM_MIN_MILLI);
    expect(L.ZOOM_MAX).toBe(ZOOM_MAX_MILLI);
  });
});

describe("search", () => {
  it("splits a query into lower-case terms", () => {
    expect(L.queryTerms("  Alice   WORKS_at ")).toEqual(["alice", "works_at"]);
    expect(L.queryTerms("   ")).toEqual([]);
  });
  it("an empty query finds nothing", () => {
    const r = L.searchElements(model, "  ");
    expect([r.total, r.items.length, r.all.length]).toEqual([0, 0, 0]);
  });
  it("matches by id (label), case-insensitively, exact before prefix before substring, nodes before edges", () => {
    const r = L.searchElements(model, "ALICE");
    expect(r.items[0]).toMatchObject({ kind: "node", title: "alice", subtitle: "person" });
    expect(r.items.slice(1).every((i) => i.kind === "edge")).toBe(true);
    const e = model.edges[r.items[1]!.index]!;
    expect([model.nodes[e.src]!.label, model.nodes[e.tgt]!.label]).toContain("alice");
  });
  it("matches by type: every node of the type, exactly", () => {
    const r = L.searchElements(model, "Company", { limit: 100 });
    const nodes = r.items.filter((i) => i.kind === "node").map((i) => i.title).sort();
    expect(nodes).toEqual(model.nodes.filter((n) => n.category === "company").map((n) => n.label).sort());
  });
  it("matches an edge by its relation", () => {
    const r = L.searchElements(model, "works_at", { limit: 100 });
    expect(r.items.every((i) => i.kind === "edge" && i.title === "WORKS_AT")).toBe(true);
    expect(r.total).toBe(model.edges.filter((e) => e.ref.rel === "WORKS_AT").length);
  });
  it("every term must match (AND), in any field", () => {
    const r = L.searchElements(model, "alice works_at");
    expect(r.items.length).toBeGreaterThan(0);
    for (const i of r.items) { const e = model.edges[i.index]!; expect(e.ref.rel).toBe("WORKS_AT"); expect([model.nodes[e.src]!.label, model.nodes[e.tgt]!.label]).toContain("alice"); }
    expect(L.searchElements(model, "alice zzzzzz").total).toBe(0);
  });
  it("lists at most `limit` rows (default 8) but reports the full count and returns every match in `all`", () => {
    const r = L.searchElements(model, "e");
    expect(r.items.length).toBe(L.MAX_RESULTS);
    expect(r.total).toBeGreaterThan(L.MAX_RESULTS);
    expect(r.all.length).toBe(r.total);
    expect(L.searchElements(model, "e", { limit: 3 }).items.length).toBe(3);
  });
  it("is deterministic and stable: the same query gives the same order", () => {
    expect(L.searchElements(model, "a", { limit: 100 }).items).toEqual(L.searchElements(model, "a", { limit: 100 }).items);
  });
  it("does not list hidden elements but counts them", () => {
    const state = reduce(model, initialState(model, SIZE), { type: "set-hidden", hidden: true, targets: [{ node: model.nodes[nodeIndex("acme")]!.ref }] }).state;
    const vis = effectiveVisibility(model, state);
    const r = L.searchElements(model, "acme", { vis });
    expect(r.items.some((i) => i.kind === "node")).toBe(false);
    expect(r.hidden).toBeGreaterThanOrEqual(1);
    expect(L.searchElements(model, "acme").total).toBeGreaterThan(r.total);
  });
  it("describeElement and tooltipRows give plain strings for a node and an edge", () => {
    const n = nodeIndex("alice");
    expect(L.describeElement(model, "node", n)).toEqual({ kind: "node", index: n, title: "alice", subtitle: "person" });
    const t = L.tooltipRows(model, "node", n);
    expect(t.heading).toBe("Node alice");
    expect(Object.fromEntries(t.rows)).toMatchObject({ kind: "node", label: "alice", type: "person", id: "s:alice", degree: String(model.nodes[n]!.degree) });
    const e = L.tooltipRows(model, "edge", 0);
    expect(Object.fromEntries(e.rows)).toMatchObject({ kind: "edge", relation: model.edges[0]!.ref.rel });
    for (const [, v] of [...t.rows, ...e.rows]) expect(typeof v).toBe("string");
  });
});

describe("neighbourhood", () => {
  it("a node: itself, its incident edges and the other end of each", () => {
    const a = nodeIndex("alice");
    const nb = L.neighbourhood(model, { kind: "node", index: a });
    const incident = model.edges.filter((e) => e.src === a || e.tgt === a);
    expect([...nb.edges].sort()).toEqual(incident.map((e) => e.index).sort());
    expect([...nb.nodes].sort()).toEqual([...new Set([a, ...incident.flatMap((e) => [e.src, e.tgt])])].sort());
    expect([...nb.incident].sort()).toEqual([...nb.edges].sort());
  });
  it("an edge: itself and its two ends", () => {
    const nb = L.neighbourhood(model, { kind: "edge", index: 0 });
    const e = model.edges[0]!;
    expect([...nb.edges]).toEqual([0]);
    expect([...nb.nodes].sort()).toEqual([e.src, e.tgt].sort());
  });
  it("leaves out what is not visible", () => {
    const a = nodeIndex("alice"), acme = nodeIndex("acme");
    const state = reduce(model, initialState(model, SIZE), { type: "set-hidden", hidden: true, targets: [{ node: model.nodes[acme]!.ref }] }).state;
    const vis = effectiveVisibility(model, state);
    const nb = L.neighbourhood(model, { kind: "node", index: a }, vis);
    expect(nb.nodes.has(acme)).toBe(false);
    for (const j of nb.edges) { const e = model.edges[j]!; expect(e.src === acme || e.tgt === acme).toBe(false); }
    expect(L.neighbourhood(model, { kind: "node", index: acme }, vis).nodes.size).toBe(0);
  });
  it("matchSet holds exactly the matches", () => {
    const s = L.matchSet([{ kind: "node", index: 2 }, { kind: "edge", index: 3 }]);
    expect([...s.nodes, ...s.edges]).toEqual([2, 3]);
    expect(s.incident.size).toBe(0);
  });
});

describe("filters (set-hidden)", () => {
  it("desiredHidden: every node of a hidden type and every edge of a hidden relation", () => {
    const d = L.desiredHidden(model, new Set(["company"]), new Set(["KNOWS"]));
    expect(d.nodes).toEqual(model.nodes.filter((n) => n.category === "company").map((n) => n.index));
    expect(d.edges).toEqual(model.edges.filter((e) => e.ref.rel === "KNOWS").map((e) => e.index));
    expect(L.desiredHidden(model, new Set(), new Set())).toEqual({ nodes: [], edges: [] });
  });
  it("diffHidden gives what to show and what to hide", () => {
    expect(L.diffHidden({ nodes: [1, 2], edges: [5] }, { nodes: [2, 3], edges: [] })).toEqual({ show: { nodes: [1], edges: [5] }, hide: { nodes: [3], edges: [] } });
    expect(L.diffHidden({ nodes: [], edges: [] }, { nodes: [], edges: [] })).toEqual({ show: { nodes: [], edges: [] }, hide: { nodes: [], edges: [] } });
  });
  it("applying the diff through the reducer hides the type, the edges of those nodes follow (effective visibility), and countHidden counts them", () => {
    const want = L.desiredHidden(model, new Set(["project"]), new Set());
    const d = L.diffHidden({ nodes: [], edges: [] }, want);
    const targets = d.hide.nodes.map((i) => ({ node: model.nodes[i]!.ref }));
    const st = reduce(model, initialState(model, SIZE), { type: "set-hidden", hidden: true, targets }).state;
    const c = L.countHidden(effectiveVisibility(model, st));
    expect(c.nodes).toBe(want.nodes.length);
    expect(c.edges).toBe(model.edges.filter((e) => want.nodes.includes(e.src) || want.nodes.includes(e.tgt)).length);
    expect([c.totalNodes, c.totalEdges]).toEqual([model.nodes.length, model.edges.length]);
  });
});

describe("viewport and minimap arithmetic", () => {
  it("viewportRect maps to the corners of the viewport under layoutToScreen", () => {
    const v = { center_x: 123_456, center_y: -98_765, width: 640, height: 400, zoom: 1500 };
    const r = L.viewportRect(v);
    const tl = layoutToScreen(v, { x: Math.round(r.x0), y: Math.round(r.y0) }), br = layoutToScreen(v, { x: Math.round(r.x1), y: Math.round(r.y1) });
    expect(tl.x).toBeCloseTo(0, 1); expect(tl.y).toBeCloseTo(0, 1);
    expect(br.x).toBeCloseTo(640, 1); expect(br.y).toBeCloseTo(400, 1);
  });
  it("minimapWorld always contains the node bounds and the viewport rectangle", () => {
    const state = initialState(model, SIZE);
    for (const zoom of [10, 300, state.viewport.zoom, 20_000]) {
      const v = { ...state.viewport, zoom, center_x: state.viewport.center_x + 50_000 };
      const w = L.minimapWorld(model.bounds, v), r = L.viewportRect(v), b = model.bounds!;
      expect(w.x0).toBeLessThanOrEqual(Math.min(r.x0, b.min_x)); expect(w.y0).toBeLessThanOrEqual(Math.min(r.y0, b.min_y));
      expect(w.x1).toBeGreaterThanOrEqual(Math.max(r.x1, b.max_x)); expect(w.y1).toBeGreaterThanOrEqual(Math.max(r.y1, b.max_y));
    }
  });
  it("minimapTransform keeps the aspect ratio, stays inside the box with its padding and round-trips", () => {
    const world = { x0: -5000, y0: -2000, x1: 95_000, y1: 48_000 };
    const T = L.minimapTransform(world, 220, 120, 8);
    const a = T.toMini(world.x0, world.y0), b = T.toMini(world.x1, world.y1);
    expect(Math.min(a.x, b.x)).toBeGreaterThanOrEqual(8 - 1e-9); expect(Math.max(a.x, b.x)).toBeLessThanOrEqual(212 + 1e-9);
    expect(Math.min(a.y, b.y)).toBeGreaterThanOrEqual(8 - 1e-9); expect(Math.max(a.y, b.y)).toBeLessThanOrEqual(112 + 1e-9);
    expect((b.x - a.x) / (b.y - a.y)).toBeCloseTo((world.x1 - world.x0) / (world.y1 - world.y0), 6);
    const m = T.toMini(12_345, 6_789), back = T.fromMini(m.x, m.y);
    expect(back.x).toBeCloseTo(12_345, 6); expect(back.y).toBeCloseTo(6_789, 6);
    expect(T.toMini((world.x0 + world.x1) / 2, (world.y0 + world.y1) / 2)).toEqual({ x: 110, y: 60 });
  });
  it("minimapTransform copes with a degenerate (single-point) world", () => {
    const T = L.minimapTransform({ x0: 5, y0: 5, x1: 5, y1: 5 }, 100, 80, 6);
    expect(Number.isFinite(T.scale) && T.scale > 0).toBe(true);
    expect(T.toMini(5, 5)).toEqual({ x: 50, y: 40 });
  });
  it("centreOn gives integers and keeps the zoom; a click in the minimap maps to the viewport centre", () => {
    const v = { center_x: 1, center_y: 2, width: 800, height: 520, zoom: 1234 };
    expect(L.centreOn(v, 100.4, -50.6)).toEqual({ center_x: 100, center_y: -51, zoom: 1234 });
    const T = L.minimapTransform(L.minimapWorld(model.bounds, v), 220, 114, 8);
    const p = T.fromMini(110, 57), c = L.centreOn(v, p.x, p.y);
    const st = reduce(model, initialState(model, SIZE), { type: "set-viewport", ...c }).state;
    expect([st.viewport.center_x, st.viewport.center_y]).toEqual([c.center_x, c.center_y]);
  });
  it("viewportForBox: the largest zoom that fits (clamped), centred, integers; a single point takes maxZoom", () => {
    const box = { x0: 0, y0: 0, x1: 200_000, y1: 100_000 };
    const t = L.viewportForBox(box, { width: 800, height: 600 }, 50, 100_000);
    expect(t).toEqual({ center_x: 100_000, center_y: 50_000, zoom: Math.floor((700 * 1e6) / 200_000) });
    const one = L.viewportForBox({ x0: 7, y0: 9, x1: 7, y1: 9 }, { width: 800, height: 600 });
    expect(one).toEqual({ center_x: 7, center_y: 9, zoom: 2000 });
    expect(L.viewportForBox({ x0: 0, y0: 0, x1: 1e12, y1: 1e12 }, SIZE).zoom).toBe(L.ZOOM_MIN);
    expect(Number.isInteger(L.viewportForBox({ x0: 0.5, y0: 0.5, x1: 1001.5, y1: 3 }, SIZE).center_x)).toBe(true);
  });
  it("viewportForBox over the whole graph equals the reducer's fit at the same padding", () => {
    const state = initialState(model, SIZE);
    const b = model.bounds!;
    const mine = L.viewportForBox({ x0: b.min_x, y0: b.min_y, x1: b.max_x, y1: b.max_y }, SIZE, 32, L.ZOOM_MAX);
    const fit = fitViewport(model, state, 32);
    expect(mine.center_x).toBe(fit.center_x); expect(mine.center_y).toBe(fit.center_y);
    expect(Math.abs(mine.zoom - fit.zoom)).toBeLessThanOrEqual(1);
  });
  it("selectionPoints and boxOf: nodes, both ends of edges, each once", () => {
    const e = model.edges[0]!;
    const pts = L.selectionPoints(model, [e.src], [0]);
    expect(pts.length).toBe(e.src === e.tgt ? 1 : 2);
    const box = L.boxOf(pts)!;
    expect(box.x0).toBe(Math.min(model.nodes[e.src]!.x, model.nodes[e.tgt]!.x));
    expect(L.boxOf([])).toBeUndefined();
  });
  it("zoomPercent and shortHash", () => {
    expect(L.zoomPercent(1000)).toBe("100%"); expect(L.zoomPercent(944)).toBe("94%");
    expect(L.shortHash("0123456789abcdef")).toBe("0123456789ab");
  });
});

describe("drag arithmetic", () => {
  it("pixelsToMilli is the inverse of the screen mapping: a node moved by it moves by the pointer's pixels on screen", () => {
    const st = initialState(model, SIZE);
    const n = model.nodes[nodeIndex("bob")]!;
    const before = layoutToScreen(st.viewport, { x: n.x, y: n.y });
    for (const [dx, dy] of [[60, 40], [-13, 7], [0, 0], [1, -1]] as const) {
      const p = L.dragPosition({ x: n.x, y: n.y }, dx, dy, st.viewport.zoom);
      const after = layoutToScreen(st.viewport, p);
      expect(after.x - before.x).toBeCloseTo(dx, 0);
      expect(after.y - before.y).toBeCloseTo(dy, 0);
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    }
    expect(Object.is(L.pixelsToMilli(0, 0, 1000).dx, 0)).toBe(true);
  });
  it("the displacement scales with the zoom: twice the zoom, half the layout distance", () => {
    expect(L.pixelsToMilli(100, 0, 1000).dx).toBe(100_000);
    expect(L.pixelsToMilli(100, 0, 2000).dx).toBe(50_000);
  });
  it("nudgeDelta moves one axis by 16 px of layout", () => {
    expect(L.nudgeDelta("right", 1000)).toEqual({ dx: 16_000, dy: 0 });
    expect(L.nudgeDelta("left", 1000)).toEqual({ dx: -16_000, dy: 0 });
    expect(L.nudgeDelta("up", 500)).toEqual({ dx: 0, dy: -32_000 });
    expect(L.nudgeDelta("down", 500, 8)).toEqual({ dx: 0, dy: 16_000 });
  });
});

describe("a dragged layout is a NEW valid FIXED layout; the original bytes are untouched", () => {
  it("fixedPositions with no move reproduces every position, in model order", () => {
    const pos = L.fixedPositions(model, new Map());
    expect(pos.map((p) => p.ref)).toEqual(model.nodes.map((n) => ({ id: n.ref.id, type: n.ref.type })));
    expect(pos.map((p) => Math.round(p.x * 1000))).toEqual(model.nodes.map((n) => n.x));
  });
  it("computeFixedLayout of those positions verifies, and a model built from it holds every node where it was but the moved one", async () => {
    const before = sha256(layout);
    const bob = nodeIndex("bob");
    const to = L.dragPosition({ x: model.nodes[bob]!.x, y: model.nodes[bob]!.y }, 60, 40, initialState(model, SIZE).viewport.zoom);
    const r = await computeFixedLayout(scene, L.fixedPositions(model, new Map([[bob, to]])));
    const v = await verifyLayout(r.layoutBytes);
    expect(v.layoutSha256).toBe(r.layoutSha256);
    expect(r.layout.policy.family).toBe("FIXED");
    const m2 = await buildRenderModel(scene, r.layoutBytes);
    expect(m2.sceneSha256).toBe(model.sceneSha256);
    expect(m2.layoutSha256).not.toBe(model.layoutSha256);
    m2.nodes.forEach((n, i) => {
      if (i === bob) expect([n.x, n.y]).toEqual([to.x, to.y]);
      else expect([n.x, n.y]).toEqual([model.nodes[i]!.x, model.nodes[i]!.y]);
    });
    expect(sha256(layout)).toBe(before); // the original layout bytes were not touched
    expect(model.layoutSha256).toBe((await verifyLayout(layout)).layoutSha256);
  });
  it("the state carries to the new model by address: only layout_sha256 changes", async () => {
    let st = initialState(model, SIZE);
    st = reduce(model, st, { type: "select", mode: "replace", targets: [{ node: model.nodes[nodeIndex("carol")]!.ref }] }).state;
    st = reduce(model, st, { type: "set-hidden", hidden: true, targets: [{ node: model.nodes[nodeIndex("apollo")]!.ref }] }).state;
    st = reduce(model, st, { type: "focus", target: { node: model.nodes[nodeIndex("alice")]!.ref } }).state;
    st = reduce(model, st, { type: "zoom", factor_milli: 1250 }).state;
    const r = await computeFixedLayout(scene, L.fixedPositions(model, new Map([[0, { x: 1, y: 2 }]])));
    const m2 = await buildRenderModel(scene, r.layoutBytes);
    const carried = { ...st, layout_sha256: m2.layoutSha256 };
    const again = reduce(m2, carried, { type: "pan", dx: 0, dy: 0 }).state; // a state the new model accepts
    expect(again.selection).toEqual(st.selection);
    expect(again.hidden).toEqual(st.hidden);
    expect(again.focus).toEqual(st.focus);
    expect(again.viewport).toEqual(st.viewport);
  });
});
