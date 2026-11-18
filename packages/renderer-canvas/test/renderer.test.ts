// Design 6.5, 6.6: the manifest, the options, the composition on createHeadlessRenderer, the probe, the registry and the subject beyond the oracle U rows.
import { describe, expect, it } from "vitest";
import { IgrError, verifyManifest } from "isongraph-visualize-renderer-core";
import { canvasStreamWitness } from "isongraph-visualize-display-list/canvas2d";
import { buildDisplayList } from "isongraph-visualize-display-list";
import { canvasManifest, createCanvasRenderer, createCanvasSubject } from "../src/index.js";
import { composeCanvasRenderer } from "../src/renderer.js";
import { MIXED20, O1, O4, SIZE, errOf, errOfAsync, initial, loadModel, readState } from "./helpers.js";

const code = (f: () => unknown): string => errOf(f);
const ENV = { host: "headless", size: SIZE, reducedMotion: false } as never;
async function load(opts?: unknown, m: { scene: string; layout: string } = O1) {
  const r = createCanvasRenderer(opts as never);
  await r.initialize(ENV);
  const model = await loadModel(m.scene, m.layout);
  await r.loadScene(model);
  return { r, model };
}

describe("canvasManifest (6.5)", () => {
  it("passes verifyManifest for both hosts and depends on dl.labels and dl.edgeLabels only (and the capacity)", () => {
    for (const h of ["headless", "dom"] as const) verifyManifest(canvasManifest(h));
    expect((canvasManifest("headless", { dl: { edgeLabels: false } }).capabilities["labels.edge"])).toEqual({ status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] });
    expect((canvasManifest("headless", { dl: { labels: false } }).capabilities["labels.edge"])).toEqual({ status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] });
    expect(canvasManifest("headless", { dl: { maxDrawnLabelUnits: 7 } }).capabilities).toEqual(canvasManifest("headless", { dprMilli: 2000, ink: [1, 2, 3], maxDlBytes: 5 }).capabilities);
  });
  it("declares the honest extras and no accessible DOM (8.4, CCR-3)", () => {
    const c = canvasManifest("dom").capabilities as Record<string, unknown>;
    expect(c["a11y.native-dom"]).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
    expect(c["a11y.companion-dom"]).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
    expect(c["x-render.per-element-dom"]).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
    expect(c["x-render.host-text"]).toEqual({ status: "supported" });
    expect(c["x-dl.display-list"]).toEqual({ status: "supported" });
    expect(c["x-dl.pick-drawn"]).toEqual({ status: "supported" });
    expect(c["direction-cue"]).toEqual({ status: "supported" });
    expect(c["indicators.non-color"]).toEqual({ status: "supported" });
    expect(c["labels"]).toEqual({ status: "degraded", degradations: ["LABELS_ELIDED"] });
    expect(c["export.png"]).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
    expect(c["scene.apply-delta"]).toEqual({ status: "unsupported", reason: "RESERVED" });
  });
  it("capacity defaults per host (6.5): 20000 / 40000 / 1048576 headless and 262144 dom", () => {
    expect(canvasManifest("headless").capacity).toEqual({ maxNodes: 20000, maxEdges: 40000, maxDrawnLabelUnits: 1048576 });
    expect(canvasManifest("dom").capacity).toEqual({ maxNodes: 20000, maxEdges: 40000, maxDrawnLabelUnits: 262144 });
  });
  it("createCanvasRenderer(o).manifest equals canvasManifest('headless', o) for the same options", () => {
    for (const o of [undefined, { name: "x-c" }, { dl: { labels: false } }, { capacity: { maxNodes: 5 } }, { version: "1.2.3" }]) expect(createCanvasRenderer(o).manifest).toEqual(canvasManifest("headless", o));
  });
  it("renderer.name defaults to canvas-renderer, version to 0.0.0; a host other than headless or dom is refused", () => {
    expect(canvasManifest("headless").renderer).toEqual({ name: "canvas-renderer", version: "0.0.0", host: "headless" });
    expect(code(() => canvasManifest("x" as never))).toBe("INVALID_INPUT/SCHEMA");
  });
});

describe("renderer options (6.5): alphabetical order, first failure wins", () => {
  it("a non-object or an unknown key is SCHEMA (also the V7 keys)", () => {
    for (const o of [[], "x", 1, null]) expect(code(() => createCanvasRenderer(o as never)), String(o)).toBe("INVALID_INPUT/SCHEMA");
    for (const k of ["contextAttributes", "maxGlBytes", "bogus", "svg"]) expect(code(() => createCanvasRenderer({ [k]: {} } as never)), k).toBe("INVALID_INPUT/SCHEMA");
  });
  it("each option in alphabetical order: capacity, dl, dprMilli, ink, maxDlBytes, name, version", () => {
    const run = (o: unknown): string => code(() => createCanvasRenderer(o as never));
    expect(run({ capacity: { maxNodes: "x" }, dl: { bogus: 1 } })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ capacity: { maxNodes: 1.5 } })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ capacity: { maxNodes: 0 } })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ capacity: { maxEdges: NaN } })).toBe("INVALID_INPUT/NOT_FINITE");
    expect(run({ capacity: { bogus: 1 } })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ dl: { maxDrawnLabelUnits: NaN }, dprMilli: 1 })).toBe("INVALID_INPUT/NOT_FINITE");
    expect(run({ dprMilli: 0, ink: "red" })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ ink: [1, 2, 300], maxDlBytes: -1 })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ ink: [1, 2], maxDlBytes: -1 })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ maxDlBytes: 2 ** 31 + 1, name: "X" })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ maxDlBytes: 2 ** 31 })).toBe("none");
    expect(run({ maxDlBytes: 0 })).toBe("none");
    expect(run({ name: "Bad Name", version: 1 })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ name: 1 })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ version: "" })).toBe("INVALID_INPUT/INVALID_VALUE");
  });
  it("the one label-budget value: one given value applies to both, a conflict is INVALID_VALUE", () => {
    expect(canvasManifest("headless", { dl: { maxDrawnLabelUnits: 9 } }).capacity.maxDrawnLabelUnits).toBe(9);
    expect(canvasManifest("headless", { capacity: { maxDrawnLabelUnits: 9 } }).capacity.maxDrawnLabelUnits).toBe(9);
    expect(code(() => canvasManifest("headless", { capacity: { maxDrawnLabelUnits: 9 }, dl: { maxDrawnLabelUnits: 8 } }))).toBe("INVALID_INPUT/INVALID_VALUE");
    // a list may be built with a budget of 0 (O05) but the renderer's capacity is the same number and must be positive: an input error, never INVALID_MANIFEST
    expect(code(() => canvasManifest("headless", { dl: { maxDrawnLabelUnits: 0 } }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("the composed renderer uses the one budget for its list", async () => {
    const { r } = await load({ capacity: { maxDrawnLabelUnits: 4 } });
    expect(r.displayList().records.filter((x) => x[0] === "T").map((x) => x[5])).toEqual(["1", "ann"]);
  });
});

describe("the renderer is the headless reference plus three differences", () => {
  it("every Renderer method but manifest and probe().fidelity behaves as the inner reference", async () => {
    const { r } = await load();
    expect(r.getState().viewport.width).toBe(900);
    expect(r.hitTest({ x: 32.072, y: 193.6 })).toEqual({ node: { id: "i:1", type: "person" } });
    const ev = r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(ev.map((e) => e.type)).toEqual(["selection-changed"]);
    expect((await r.export("scene")).media_type).toBe("application/octet-stream");
    expect(await errOfAsync(() => r.applySceneDelta({}))).toBe("UNSUPPORTED_CAPABILITY/RESERVED");
  });
  it("probe() reports honestly: fidelity from the dry label pass, motion none; drawn and marked are the inner renderer's", async () => {
    const { r } = await load({ dl: { maxDrawnLabelUnits: 4 } });
    const f = r.probe().fidelity;
    expect(f).toEqual({ labels: "elided", edge_labels: true, motion: "none", degradations: ["LABELS_ELIDED"] });
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(r.probe().marked.selected.nodes).toEqual([{ id: "i:1", type: "person" }]);
  });
  it("probe() never throws for geometry: a state beyond 2^40 gives a report while displayList() refuses", async () => {
    const far = await loadModel("../oracles-dl/scenes/far-u.scene.json", "../oracles-dl/layouts/far-u.layout.json");
    const state = readState("states/N14.state.json");
    const r = createCanvasRenderer();
    await r.initialize(ENV);
    await r.loadScene(far, state);
    expect(r.probe().drawn.nodes.length).toBe(1);
    expect(code(() => r.displayList())).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(code(() => r.canvasCalls())).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(code(() => r.pick({ x: 1, y: 1 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("displayList(), canvasCalls(), pick() and elementBounds() raise the lifecycle error getState() raises", async () => {
    const r = createCanvasRenderer();
    for (const f of [() => r.displayList(), () => r.displayListBytes(), () => r.canvasCalls(), () => r.pick({ x: 1, y: 1 }), () => r.elementBounds()]) expect(code(f)).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    await r.initialize(ENV);
    expect(code(() => r.displayList())).toBe("INVALID_LIFECYCLE/NOT_LOADED");
    await r.loadScene(await loadModel(O1.scene, O1.layout));
    await r.dispose();
    expect(code(() => r.displayList())).toBe("INVALID_LIFECYCLE/DISPOSED");
  });
  it("status() follows the lifecycle", async () => {
    const r = createCanvasRenderer();
    expect(r.status()).toEqual({ phase: "created" });
    await r.initialize(ENV);
    expect(r.status().phase).toBe("initialized");
    await r.loadScene(await loadModel(O1.scene, O1.layout));
    expect(r.status().phase).toBe("ready");
    await r.dispose();
    expect(r.status().phase).toBe("disposed");
  });
  it("the list and the stream are those of the pure functions for the committed state; the stream uses dprMilli and ink", async () => {
    const { r, model } = await load({ dprMilli: 2000, ink: [10, 20, 30] });
    const { state } = await initial(O1);
    expect(new TextDecoder().decode(r.canvasCalls())).toContain('["m","setTransform",2000,0,0,2000,0,0]');
    expect(new TextDecoder().decode(r.canvasCalls())).toContain("rgb(10,20,30)");
    expect(r.displayList()).toEqual(buildDisplayList(model, state));
  });
  it("the registry keeps the model of the committed (scene, layout) pair and evicts the others once their loads settle", async () => {
    const c = composeCanvasRenderer("headless");
    await c.renderer.initialize(ENV);
    await c.renderer.loadScene(await loadModel(O1.scene, O1.layout));
    expect(c.registrySize()).toBe(1);
    await c.renderer.loadScene(await loadModel(O4.scene, O4.layout));
    expect(c.registrySize()).toBe(1);
    await c.renderer.loadScene(await loadModel(MIXED20.scene, MIXED20.layout));
    expect(c.registrySize()).toBe(1);
    expect(c.renderer.displayList().nodes.length).toBe(20);
    await c.renderer.dispose();
    expect(c.registrySize()).toBe(0);
  });
});

describe("pick and hitTest are two separate verdicts (5.2, 10.1)", () => {
  it("they agree on a node, and differ on a self-loop: pick finds it, hitTest does not", async () => {
    const { r } = await load(undefined, O4);
    const onLoop = { x: 867.928, y: 381.4 };
    expect(r.pick(onLoop)).toMatchObject({ edge: { rel: "R" } });
    expect(r.hitTest(onLoop)).toBeUndefined();
    const node = { x: 867.928, y: 406.4 };
    expect(r.pick(node)).toEqual(r.hitTest(node));
  });
});

describe("the subject (6.6)", () => {
  it("its witness reads the stream: the elements of the stream equal those of the report", async () => {
    const s = createCanvasSubject();
    const r = await s.create({ host: "headless" } as never);
    await r.initialize(ENV);
    await r.loadScene(await loadModel(MIXED20.scene, MIXED20.layout));
    const w = await s.witness!(r);
    const rep = r.probe();
    expect(w.elements.nodes).toEqual(rep.drawn.nodes);
    expect(w.elements.edges).toEqual(rep.drawn.edges);
    expect(w.texts).toEqual([]);
    const { model, state } = await initial(MIXED20);
    expect(w).toEqual(canvasStreamWitness((r as unknown as { canvasCalls(): Uint8Array }).canvasCalls(), buildDisplayList(model, state)));
  });
  it("create returns an uninitialized renderer and the witness refuses a foreign renderer", async () => {
    const s = createCanvasSubject();
    const r = await s.create({ host: "headless" } as never);
    expect(code(() => r.getState())).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    await expect(s.witness!({} as never)).rejects.toBeInstanceOf(IgrError);
    expect(s.manifest).toEqual(canvasManifest("headless"));
  });
});
