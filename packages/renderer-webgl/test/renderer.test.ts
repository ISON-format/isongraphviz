// Design 6.5, 7.8: the manifest, the options, the composition on createHeadlessRenderer, the probe, the registry and the subject beyond the oracle U rows.
import { describe, expect, it } from "vitest";
import { IgrError, verifyManifest } from "isongraph-visualize-renderer-core";
import { buildDisplayList } from "isongraph-visualize-display-list";
import { glManifest, createWebglRenderer, createWebglSubject, glWitness, planGl, serializePlan, parseGlPlan, DEFAULT_GL_LIMITS } from "../src/index.js";
import { composeWebglRenderer } from "../src/renderer.js";
import { MIXED20, O1, O4, SIZE, errOf, initial, loadModel } from "./helpers.js";

const code = (f: () => unknown): string => errOf(f);
const ENV = { host: "headless", size: SIZE, reducedMotion: false } as never;
const text = (b: Uint8Array): string => new TextDecoder().decode(b);
async function errOfAsync(f: () => Promise<unknown>): Promise<string> { try { await f(); return "none"; } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : "other"; } }
async function load(opts?: unknown, m: { scene: string; layout: string } = O1) {
  const r = createWebglRenderer(opts as never);
  await r.initialize(ENV);
  const model = await loadModel(m.scene, m.layout);
  await r.loadScene(model);
  return { r, model };
}

describe("glManifest (7.8)", () => {
  it("passes verifyManifest for both hosts and depends on dl.labels and dl.edgeLabels only (and the capacity)", () => {
    for (const h of ["headless", "dom"] as const) verifyManifest(glManifest(h));
    expect(glManifest("headless", { dl: { edgeLabels: false } }).capabilities["labels.edge"]).toEqual({ status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] });
    expect(glManifest("headless", { dl: { labels: false } }).capabilities["labels.edge"]).toEqual({ status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] });
    expect(glManifest("headless", { dl: { maxDrawnLabelUnits: 7 } }).capabilities).toEqual(glManifest("headless", { dprMilli: 2000, ink: [1, 2, 3], maxDlBytes: 5, maxGlBytes: 6, contextAttributes: { failIfMajorPerformanceCaveat: false } }).capabilities);
  });
  it("declares the honest extras, no accessible DOM, and the GPU claims by host (x-gl.executes, x-gl.context-recovery)", () => {
    const h = glManifest("headless").capabilities as Record<string, unknown>, d = glManifest("dom").capabilities as Record<string, unknown>;
    expect(h["x-gl.context-recovery"]).toEqual({ status: "unsupported", reason: "HOST_LACKS" });
    expect(h["x-gl.executes"]).toEqual({ status: "unsupported", reason: "HOST_LACKS" });
    expect(d["x-gl.context-recovery"]).toEqual({ status: "supported" });
    expect(d["x-gl.executes"]).toEqual({ status: "supported" });
    for (const c of [h, d]) {
      expect(c["a11y.native-dom"]).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
      expect(c["a11y.companion-dom"]).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
      expect(c["x-render.per-element-dom"]).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
      expect(c["x-render.host-text"]).toEqual({ status: "supported" });
      expect(c["x-dl.display-list"]).toEqual({ status: "supported" });
      expect(c["x-dl.pick-drawn"]).toEqual({ status: "supported" });
      expect(c["export.png"]).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
      expect(c["scene.apply-delta"]).toEqual({ status: "unsupported", reason: "RESERVED" });
    }
  });
  it("capacity defaults per host (7.8): 100000 / 200000 / 1048576 headless and 262144 dom", () => {
    expect(glManifest("headless").capacity).toEqual({ maxNodes: 100000, maxEdges: 200000, maxDrawnLabelUnits: 1048576 });
    expect(glManifest("dom").capacity).toEqual({ maxNodes: 100000, maxEdges: 200000, maxDrawnLabelUnits: 262144 });
  });
  it("createWebglRenderer(o).manifest equals glManifest('headless', o); the name defaults to webgl-renderer; a bad host is refused", () => {
    for (const o of [undefined, { name: "x-c" }, { dl: { labels: false } }, { capacity: { maxNodes: 5 } }, { version: "1.2.3" }]) expect(createWebglRenderer(o).manifest).toEqual(glManifest("headless", o));
    expect(glManifest("headless").renderer).toEqual({ name: "webgl-renderer", version: "0.0.0", host: "headless" });
    expect(code(() => glManifest("x" as never))).toBe("INVALID_INPUT/SCHEMA");
  });
});

describe("renderer options (6.5, 7.8): alphabetical order, first failure wins", () => {
  const run = (o: unknown): string => code(() => createWebglRenderer(o as never));
  it("a non-object or an unknown key is SCHEMA", () => {
    for (const o of [[], "x", 1, null]) expect(run(o), String(o)).toBe("INVALID_INPUT/SCHEMA");
    for (const k of ["bogus", "svg"]) expect(run({ [k]: {} }), k).toBe("INVALID_INPUT/SCHEMA");
  });
  it("each option in alphabetical order: capacity, contextAttributes, dl, dprMilli, ink, maxDlBytes, maxGlBytes, name, version", () => {
    expect(run({ capacity: { maxNodes: "x" }, contextAttributes: { a: 1 } })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ capacity: { maxNodes: 1.5 } })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ capacity: { maxNodes: 0 } })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ capacity: { maxEdges: NaN } })).toBe("INVALID_INPUT/NOT_FINITE");
    expect(run({ contextAttributes: { failIfMajorPerformanceCaveat: "no" }, dl: { x: 1 } })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ contextAttributes: { failIfMajorPerformanceCaveat: null } })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ contextAttributes: { antialias: true } })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ contextAttributes: [] })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ contextAttributes: { failIfMajorPerformanceCaveat: false } })).toBe("none");
    expect(run({ dl: { maxDrawnLabelUnits: NaN }, dprMilli: 1 })).toBe("INVALID_INPUT/NOT_FINITE");
    expect(run({ dprMilli: 0, ink: "red" })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ ink: [1, 2, 300], maxDlBytes: -1 })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ ink: [1, 2], maxDlBytes: -1 })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ ink: ["a", 0, 0] })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ maxDlBytes: 2 ** 31 + 1, maxGlBytes: -1 })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ maxGlBytes: 2 ** 31 + 1, name: "X" })).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(run({ maxGlBytes: 2 ** 31, maxDlBytes: 0 })).toBe("none");
    expect(run({ maxGlBytes: 1.5 })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ name: "Bad Name", version: 1 })).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(run({ name: 1 })).toBe("INVALID_INPUT/SCHEMA");
    expect(run({ version: "" })).toBe("INVALID_INPUT/INVALID_VALUE");
  });
  it("the one label-budget value: one given value applies to both, a conflict is INVALID_VALUE; a renderer with a budget of 0 is refused (rev 5; the builder accepts it)", () => {
    expect(glManifest("headless", { dl: { maxDrawnLabelUnits: 9 } }).capacity.maxDrawnLabelUnits).toBe(9);
    expect(glManifest("headless", { capacity: { maxDrawnLabelUnits: 9 } }).capacity.maxDrawnLabelUnits).toBe(9);
    expect(code(() => glManifest("headless", { capacity: { maxDrawnLabelUnits: 9 }, dl: { maxDrawnLabelUnits: 8 } }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(code(() => glManifest("headless", { dl: { maxDrawnLabelUnits: 0 } }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("the composed renderer uses the one budget for its list and its plan", async () => {
    const { r } = await load({ capacity: { maxDrawnLabelUnits: 4 } });
    expect(r.displayList().records.filter((x) => x[0] === "T").map((x) => x[5])).toEqual(["1", "ann"]);
    expect(r.plan().texts.map((t) => t[5])).toEqual(["1", "ann"]);
  });
  it("maxGlBytes bounds the plan: a plan one byte over is refused with RESOURCE_LIMIT/BYTES_LIMIT, one exactly at the limit is accepted", async () => {
    const full = (await load()).r.planBytes().length;
    expect(DEFAULT_GL_LIMITS.maxGlBytes).toBe(268_435_456);
    expect((await load({ maxGlBytes: full })).r.planBytes().length).toBe(full);
    const small = await load({ maxGlBytes: full - 1 });
    expect(code(() => small.r.planBytes())).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(code(() => small.r.plan())).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(code(() => small.r.displayList())).toBe("none"); // a list is not a plan
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
    expect(r.probe().fidelity).toEqual({ labels: "elided", edge_labels: true, motion: "none", degradations: ["LABELS_ELIDED"] });
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(r.probe().marked.selected.nodes).toEqual([{ id: "i:1", type: "person" }]);
  });
  it("probe() never throws for geometry: a state beyond 2^40 gives a report while displayList(), plan() and pick() refuse", async () => {
    const { r } = await load();
    r.dispatch({ type: "set-viewport", center_x: -(2 ** 53 - 1), center_y: 0, zoom: 100000 });
    expect(r.probe().drawn.nodes.length).toBe(2);
    for (const f of [() => r.displayList(), () => r.plan(), () => r.planBytes(), () => r.textCalls(), () => r.pick({ x: 1, y: 1 })]) expect(code(f)).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("displayList(), plan(), planBytes(), textCalls(), pick() and elementBounds() raise the lifecycle error getState() raises", async () => {
    const r = createWebglRenderer();
    for (const f of [() => r.displayList(), () => r.plan(), () => r.planBytes(), () => r.textCalls(), () => r.pick({ x: 1, y: 1 }), () => r.elementBounds()]) expect(code(f)).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    await r.initialize(ENV);
    expect(code(() => r.plan())).toBe("INVALID_LIFECYCLE/NOT_LOADED");
    await r.loadScene(await loadModel(O1.scene, O1.layout));
    await r.dispose();
    expect(code(() => r.plan())).toBe("INVALID_LIFECYCLE/DISPOSED");
  });
  it("status() follows the lifecycle, records the closed attribute option and reports no context loss on a headless renderer", async () => {
    const r = createWebglRenderer({ contextAttributes: { failIfMajorPerformanceCaveat: false } });
    expect(r.status()).toEqual({ phase: "created", contextLost: false, attributes: { failIfMajorPerformanceCaveat: false } });
    await r.initialize(ENV);
    expect(r.status().phase).toBe("ready");
    await r.dispose();
    expect(r.status().phase).toBe("disposed");
    expect(createWebglRenderer().status().attributes).toEqual({ failIfMajorPerformanceCaveat: true });
  });
  it("the plan and the text calls are those of the pure functions for the committed state; the text calls use dprMilli and ink and layer 8 only", async () => {
    const { r, model } = await load({ dprMilli: 2000, ink: [10, 20, 30] });
    const { state } = await initial(O1);
    const calls = text(r.textCalls());
    expect(calls).toContain('["m","setTransform",2000,0,0,2000,0,0]');
    expect(calls).toContain("rgb(10,20,30)");
    expect(calls).not.toContain('"arc"');
    expect(text(r.planBytes())).toBe(text(serializePlan(planGl(buildDisplayList(model, state)))));
    expect(text(serializePlan(parseGlPlan(r.planBytes())))).toBe(text(r.planBytes()));
  });
  it("the registry keeps the model of the committed (scene, layout) pair and evicts the others once their loads settle", async () => {
    const c = composeWebglRenderer("headless");
    await c.renderer.initialize(ENV);
    await c.renderer.loadScene(await loadModel(O1.scene, O1.layout));
    expect(c.registrySize()).toBe(1);
    await c.renderer.loadScene(await loadModel(O4.scene, O4.layout));
    expect(c.registrySize()).toBe(1);
    await c.renderer.loadScene(await loadModel(MIXED20.scene, MIXED20.layout));
    expect(c.registrySize()).toBe(1);
    expect(c.renderer.plan().nodes.length).toBe(20);
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

describe("the subject (7.8)", () => {
  it("its witness reads the plan: the elements of the plan equal those of the report", async () => {
    const s = createWebglSubject();
    const r = await s.create({ host: "headless" } as never);
    await r.initialize(ENV);
    await r.loadScene(await loadModel(MIXED20.scene, MIXED20.layout));
    const w = await s.witness!(r);
    const rep = r.probe();
    expect(w.elements.nodes).toEqual(rep.drawn.nodes);
    expect(w.elements.edges).toEqual(rep.drawn.edges);
    expect(w.texts).toEqual([]);
    expect(w).toEqual(glWitness((r as unknown as { plan(): ReturnType<typeof planGl> }).plan()));
    expect(w.backend).toBe("igr-gl/1");
  });
  it("create returns an uninitialized renderer and the witness refuses a foreign renderer", async () => {
    const s = createWebglSubject();
    const r = await s.create({ host: "headless" } as never);
    expect(code(() => r.getState())).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    await expect(s.witness!({} as never)).rejects.toBeInstanceOf(IgrError);
    expect(s.manifest).toEqual(glManifest("headless"));
  });
});
