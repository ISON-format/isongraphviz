// The renderer object (12.1), the manifest (12.2), probe (12.3), the subject (12.5).
import { describe, expect, it } from "vitest";
import { verifyManifest, type Renderer, type RendererEnvironment } from "isongraph-visualize-renderer-core";
import { createHeadlessRenderer } from "isongraph-visualize-renderer-core/headless";
import { createSvgRenderer, createSvgSubject, renderSvg, svgManifest, svgWitness } from "../src/index.js";
import { composeSvgRenderer } from "../src/renderer.js";
import { MIXED20, O1, SIZE, errOf, errOfAsync, loadModel, o1 } from "./helpers.js";

const env = (o: Partial<RendererEnvironment> = {}): RendererEnvironment => ({ host: "headless", size: SIZE, reducedMotion: false, ...o });
const key = (m: unknown): string => JSON.stringify(m);

describe("svgManifest (12.2)", () => {
  it("both hosts pass verifyManifest; the default name is svg-renderer; version 0.0.0", () => {
    for (const h of ["headless", "dom"] as const) {
      const m = svgManifest(h);
      expect(() => verifyManifest(m)).not.toThrow();
      expect(m.renderer).toEqual({ host: h, name: "svg-renderer", version: "0.0.0" });
    }
  });
  it("capability statuses", () => {
    const m = svgManifest("headless");
    const s = (id: string) => (m.capabilities as Record<string, unknown>)[id];
    for (const id of ["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "direction-cue", "indicators.non-color", "a11y.model", "state.report", "lifecycle", "export.scene", "labels.edge"]) expect(s(id), id).toEqual({ status: "supported" });
    expect(s("labels")).toEqual({ status: "degraded", degradations: ["LABELS_ELIDED"] });
    for (const id of ["export.svg", "export.png", "motion.animated", "a11y.companion-dom", "a11y.native-dom"]) expect(s(id), id).toEqual({ status: "unsupported", reason: "NOT_IMPLEMENTED" });
    expect(s("scene.apply-delta")).toEqual({ status: "unsupported", reason: "RESERVED" });
    expect(svgManifest("dom").capabilities["a11y.native-dom"]).toEqual({ status: "supported" });
  });
  it("capacity defaults per host (headless 20000/40000/1048576; dom 2000/4000/262144)", () => {
    expect(svgManifest("headless").capacity).toEqual({ maxNodes: 20_000, maxEdges: 40_000, maxDrawnLabelUnits: 1_048_576 });
    expect(svgManifest("dom").capacity).toEqual({ maxNodes: 2_000, maxEdges: 4_000, maxDrawnLabelUnits: 262_144 });
  });
  it("labels.edge degrades to EDGE_LABELS_OMITTED for labels: false or edgeLabels: false only; style does not matter (A-29)", () => {
    const edge = (o: unknown) => svgManifest("headless", o as never).capabilities["labels.edge"];
    expect(edge({ svg: { labels: false } })).toEqual({ status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] });
    expect(edge({ svg: { edgeLabels: false } })).toEqual({ status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] });
    expect(edge({ svg: { style: false } })).toEqual({ status: "supported" });
    expect(key(svgManifest("headless", { svg: { style: false } }))).toBe(key(svgManifest("headless")));
    const m = svgManifest("headless", { svg: { style: false } });
    expect(m.capabilities["direction-cue"]).toEqual({ status: "supported" });
    expect(m.capabilities["indicators.non-color"]).toEqual({ status: "supported" });
  });
  it("renderer.manifest equals svgManifest(host, options) byte for byte for every option set (K106)", () => {
    for (const o of [undefined, {}, { name: "x-svg" }, { version: "1.2.3" }, { capacity: { maxNodes: 5 } }, { svg: { edgeLabels: false } }, { svg: { labels: false } }, { svg: { idPrefix: "p" } },
      { capacity: { maxDrawnLabelUnits: 77, maxNodes: 5 }, name: "x-svg", svg: { edgeLabels: false } }, { svg: { maxDrawnLabelUnits: 9 } }]) {
      expect(key(createSvgRenderer(o as never).manifest), JSON.stringify(o)).toBe(key(svgManifest("headless", o as never)));
      expect(key(createSvgSubject(o as never).manifest)).toBe(key(svgManifest("headless", o as never)));
    }
  });
  it("one value for the label budget: either alone applies to both; both must agree (K108)", () => {
    expect(svgManifest("headless", { capacity: { maxDrawnLabelUnits: 7 } }).capacity.maxDrawnLabelUnits).toBe(7);
    expect(svgManifest("headless", { svg: { maxDrawnLabelUnits: 9 } }).capacity.maxDrawnLabelUnits).toBe(9);
    expect(svgManifest("headless", { capacity: { maxDrawnLabelUnits: 9 }, svg: { maxDrawnLabelUnits: 9 } }).capacity.maxDrawnLabelUnits).toBe(9);
    const conflict = { capacity: { maxDrawnLabelUnits: 5 }, svg: { maxDrawnLabelUnits: 6 } };
    expect(errOf(() => svgManifest("headless", conflict))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => createSvgRenderer(conflict))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => createSvgSubject(conflict))).toBe("INVALID_INPUT/INVALID_VALUE");
  });
  it("invalid options are refused at create with the codes of renderSvg", () => {
    for (const [o, c] of [[{ svg: { bogus: 1 } }, "SCHEMA"], [{ svg: { idPrefix: "1a" } }, "INVALID_VALUE"], [{ svg: { style: "yes" } }, "SCHEMA"], [{ svg: { maxSvgBytes: NaN } }, "NOT_FINITE"],
      [{ svg: { maxDrawnLabelUnits: 1.5 } }, "INVALID_VALUE"], [{ svg: { maxSvgBytes: -1 } }, "OUT_OF_RANGE"], [{ bogus: 1 }, "SCHEMA"], [[], "SCHEMA"], [{ capacity: { bogus: 1 } }, "SCHEMA"]] as const)
      expect(errOf(() => createSvgRenderer(o as never)), JSON.stringify(o)).toBe(`INVALID_INPUT/${c}`);
    expect(errOf(() => svgManifest("web" as never))).toBe("INVALID_INPUT/SCHEMA");
  });
});

describe("lifecycle of svg() (12.1)", () => {
  it("NOT_INITIALIZED, NOT_LOADED, BUSY while a load is pending, ok, DISPOSED", async () => {
    const { model } = await o1();
    const r = createSvgRenderer();
    expect(errOf(() => r.svg())).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    await r.initialize(env());
    expect(errOf(() => r.svg())).toBe("INVALID_LIFECYCLE/NOT_LOADED");
    const p = r.loadScene(model);
    expect(errOf(() => r.svg())).toBe("INVALID_LIFECYCLE/BUSY");
    await p;
    expect(r.svg()).toBe(renderSvg(model, r.getState(), { maxDrawnLabelUnits: 1_048_576 }));
    await r.dispose();
    expect(errOf(() => r.svg())).toBe("INVALID_LIFECYCLE/DISPOSED");
  });
  it("svg() renders the committed state, not the previous one (K104); a rejected dispatch leaves it unchanged", async () => {
    const { model } = await o1();
    const r = createSvgRenderer();
    await r.initialize(env());
    await r.loadScene(model);
    const before = r.svg();
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    const after = r.svg();
    expect(after).not.toBe(before);
    expect(after).toContain("igr-selected");
    expect(errOf(() => r.dispatch({ type: "bogus" } as never))).toMatch(/^INVALID_INTENT/);
    expect(r.svg()).toBe(after);
  });
  it("called from inside onEvent it returns the committed state's document", async () => {
    const { model } = await o1();
    const seen: string[] = [];
    const r = createSvgRenderer();
    await r.initialize(env({ onEvent: () => { seen.push(r.svg()); } }));
    await r.loadScene(model);
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("igr-selected");
  });
  it("the model follows the state's hash pair: a later load, a failed load and two models in turn", async () => {
    const a = await loadModel(O1.scene, O1.layout), b = await loadModel(MIXED20.scene, MIXED20.layout);
    const r = createSvgRenderer();
    await r.initialize(env());
    await r.loadScene(a);
    expect(r.svg()).toContain("Directed graph with 2 nodes");
    await r.loadScene(b);
    expect(r.svg()).toContain("20 nodes");
    expect(await errOfAsync(() => r.loadScene({} as never))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
    expect(r.svg()).toContain("20 nodes");
    const small = createSvgRenderer({ capacity: { maxNodes: 1 } });
    await small.initialize(env());
    await small.loadScene(await loadModel("../oracles-igl/scenes/single.scene.json", "../oracles-igl/layouts/F08.layout.json"));
    expect(await errOfAsync(() => small.loadScene(a))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(small.svg()).toContain("1 node");
  });
  it("two loads in flight: the later one is current once both settle", async () => {
    const a = await loadModel(O1.scene, O1.layout), b = await loadModel(MIXED20.scene, MIXED20.layout);
    const r = createSvgRenderer();
    await r.initialize(env());
    const p1 = r.loadScene(a), p2 = r.loadScene(b);
    expect(errOf(() => r.svg())).toBe("INVALID_LIFECYCLE/BUSY");
    await Promise.all([p1, p2]);
    expect(r.svg()).toContain("20 nodes");
  });
});

describe("delegation: every method behaves as the headless reference except manifest, probe().fidelity and svg() (12.1)", () => {
  it("the same sequence of calls gives the same results and errors", async () => {
    const { model } = await o1();
    const a: Renderer = createSvgRenderer({ name: "n-a" }), b: Renderer = createHeadlessRenderer({ name: "n-a" });
    const out: string[][] = [[], []];
    const run = async (r: Renderer, log: string[]): Promise<void> => {
      const step = async (f: () => unknown): Promise<void> => { try { const v = await f(); log.push(JSON.stringify(v ?? null)); } catch (e) { log.push(`ERR ${(e as { code?: string; reason?: string }).code}/${(e as { reason?: string }).reason}`); } };
      await step(() => r.getState());
      await step(() => r.initialize(env()));
      await step(() => r.initialize(env()));
      await step(() => r.getState());
      await step(() => r.loadScene(model));
      await step(() => r.dispatch({ type: "focus-step", delta: 1 }));
      await step(() => r.dispatch({ type: "select", mode: "toggle", targets: [{ node: { id: "s:ann", type: "person" } }] }));
      await step(() => r.dispatch({ type: "zoom", factor_milli: 1250 }));
      await step(() => r.dispatch({ type: "pan", dx: NaN, dy: 0 }));
      await step(() => r.hitTest({ x: 32, y: 193.5 }));
      await step(() => r.hitTest({ x: NaN, y: 0 }));
      await step(() => r.setReducedMotion(true));
      await step(() => r.setReducedMotion("x" as never));
      await step(async () => { const e = await r.export("scene"); return { f: e.format, m: e.media_type, n: e.bytes.length }; });
      await step(() => r.export("svg"));
      await step(() => r.export("png"));
      await step(() => r.export("SVG" as never));
      await step(() => r.applySceneDelta({}));
      await step(() => r.render());
      const rep = r.probe();
      log.push(JSON.stringify({ ...rep, fidelity: null }));
      await step(() => r.dispose());
      await step(() => r.getState());
      await step(() => r.applySceneDelta({}));
    };
    await run(a, out[0]!);
    await run(b, out[1]!);
    expect(out[0]).toEqual(out[1]);
  });
  it("the three differences: manifest, probe().fidelity, svg()", async () => {
    const { model } = await o1();
    const r = createSvgRenderer();
    await r.initialize(env());
    await r.loadScene(model);
    expect(r.probe().fidelity).toEqual({ labels: "full", edge_labels: true, motion: "none", degradations: [] });
    expect(typeof r.svg).toBe("function");
    expect(Object.keys(r).sort()).toEqual([...Object.keys(createHeadlessRenderer())].concat("svg").sort());
  });
});

describe("probe().fidelity (12.3)", () => {
  it("full, elided (LABELS_ELIDED), labels:false (none, EDGE_LABELS_OMITTED), edgeLabels:false; motion none always", async () => {
    const { model } = await o1();
    const long = await loadModel("../oracles-igl/scenes/keybound.scene.json", "../oracles-igl/layouts/F13.layout.json");
    const fid = async (o: unknown, m = model, reduced = false) => { const r = createSvgRenderer(o as never); await r.initialize(env({ reducedMotion: reduced })); await r.loadScene(m); return r.probe().fidelity; };
    expect(await fid(undefined)).toEqual({ labels: "full", edge_labels: true, motion: "none", degradations: [] });
    expect(await fid(undefined, long)).toEqual({ labels: "elided", edge_labels: true, motion: "none", degradations: ["LABELS_ELIDED"] });
    expect(await fid({ svg: { labels: false } })).toEqual({ labels: "none", edge_labels: false, motion: "none", degradations: ["EDGE_LABELS_OMITTED"] });
    expect(await fid({ svg: { edgeLabels: false } })).toEqual({ labels: "full", edge_labels: false, motion: "none", degradations: ["EDGE_LABELS_OMITTED"] });
    expect((await fid({ svg: { edgeLabels: false } }, long)).degradations).toEqual(["EDGE_LABELS_OMITTED", "LABELS_ELIDED"]);
    expect((await fid(undefined, model, true)).motion).toBe("none");
  });
  it("agrees with renderSvgDetailed and never raises a size limit (that is svg())", async () => {
    const { model } = await o1();
    const r = createSvgRenderer({ svg: { maxSvgBytes: 100 } });
    await r.initialize(env());
    await r.loadScene(model);
    expect(() => r.probe()).not.toThrow();
    expect(errOf(() => r.svg())).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    await expect(r.render()).resolves.toBeUndefined();
  });
  it("the report is the inner one: drawn, marked, accessible carry no D-XML substitution", async () => {
    const m = await loadModel("scenes/illegal.scene.json", "layouts/illegal.layout.json");
    const r = createSvgRenderer();
    await r.initialize(env());
    await r.loadScene(m);
    expect(r.probe().accessible.items.some((i) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/.test(i.name))).toBe(true);
    expect(r.svg()).toContain("�");
  });
});

describe("createSvgSubject (12.5)", () => {
  it("create returns an uninitialized renderer; the witness reads the document", async () => {
    const { model } = await o1();
    const sub = createSvgSubject();
    const r = await sub.create({ host: "headless" } as never);
    expect(errOf(() => r.getState())).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    await r.initialize(env());
    await r.loadScene(model);
    const w = await sub.witness!(r);
    expect(w).toEqual(svgWitness((r as unknown as { svg(): string }).svg()));
    expect(w.elements.nodes).toEqual(r.probe().drawn.nodes);
  });
  it("a renderer without svg() is SCHEMA", async () => {
    const sub = createSvgSubject();
    expect(await errOfAsync(() => sub.witness!(createHeadlessRenderer()))).toBe("INVALID_INPUT/SCHEMA");
  });
});

describe("audit M-1: the one label-budget value is range-checked at creation (12.2: 0..2^31)", () => {
  it("capacity.maxDrawnLabelUnits above 2^31 is refused at creation, not at every svg()", () => {
    expect(errOf(() => createSvgRenderer({ capacity: { maxDrawnLabelUnits: 2 ** 40 } }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => svgManifest("headless", { capacity: { maxDrawnLabelUnits: 2 ** 31 + 1 } }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => createSvgSubject({ capacity: { maxDrawnLabelUnits: -5 } }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => createSvgRenderer({ capacity: { maxDrawnLabelUnits: 2 ** 31 } }))).toBe("none");
  });
  it("R30-31-01: a renderer label budget of 0 is INVALID_INPUT/OUT_OF_RANGE (the code V6 and V7 use), from capacity or from svg", () => {
    for (const o of [{ capacity: { maxDrawnLabelUnits: 0 } }, { svg: { maxDrawnLabelUnits: 0 } }, { capacity: { maxDrawnLabelUnits: 0 }, svg: { maxDrawnLabelUnits: 0 } }]) {
      expect(errOf(() => createSvgRenderer(o)), JSON.stringify(o)).toBe("INVALID_INPUT/OUT_OF_RANGE");
      expect(errOf(() => svgManifest("headless", o)), JSON.stringify(o)).toBe("INVALID_INPUT/OUT_OF_RANGE");
      expect(errOf(() => svgManifest("dom", o)), JSON.stringify(o)).toBe("INVALID_INPUT/OUT_OF_RANGE");
      expect(errOf(() => createSvgSubject(o)), JSON.stringify(o)).toBe("INVALID_INPUT/OUT_OF_RANGE");
    }
    expect(errOf(() => createSvgRenderer({ capacity: { maxDrawnLabelUnits: 1 } }))).toBe("none");
  });
  it("R30-31-01: renderSvg called directly still accepts a budget of 0 (a document with no drawn labels)", async () => {
    const { model, state } = await o1();
    expect(() => renderSvg(model, state, { maxDrawnLabelUnits: 0 })).not.toThrow();
  });
  it("a renderer that can be created can render: svg() never fails with OUT_OF_RANGE", async () => {
    const { model } = await o1();
    const r = createSvgRenderer({ capacity: { maxDrawnLabelUnits: 2 ** 31 } });
    await r.initialize(env());
    await r.loadScene(model);
    expect(() => r.svg()).not.toThrow();
  });
});

describe("audit M-8: renderer options are plain objects", () => {
  it("a class instance (prototype getters) as options, capacity or svg is SCHEMA", () => {
    class Opts { get name(): string { return "x"; } }
    expect(errOf(() => createSvgRenderer(new Opts() as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createSvgRenderer({ capacity: new Opts() } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createSvgRenderer({ svg: new Opts() } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createSvgRenderer(Object.create(null) as never))).toBe("none");
  });
});

describe("audit M-5: the wrapper registry (12.1 eviction rule), observed through the internal composeSvgRenderer", () => {
  it("holds one entry per unsettled load plus the current one; a failed load leaves the current; dispose() clears it", async () => {
    const a = await loadModel(O1.scene, O1.layout), b = await loadModel(MIXED20.scene, MIXED20.layout);
    const small = await loadModel("../oracles-igl/scenes/single.scene.json", "../oracles-igl/layouts/F08.layout.json");
    const c = composeSvgRenderer("headless", { capacity: { maxNodes: 5 } });
    await c.renderer.initialize(env());
    expect(c.registrySize()).toBe(0);
    await c.renderer.loadScene(a);
    expect(c.registrySize()).toBe(1);
    const p = c.renderer.loadScene(small);
    expect(c.registrySize()).toBe(2); // pending entries live until they settle
    await p;
    expect(c.registrySize()).toBe(1); // the settled load made `small` current; `a` was dropped
    expect(await errOfAsync(() => c.renderer.loadScene(b))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(c.registrySize()).toBe(1); // the rejected load's entry is dropped; the current stays
    expect(c.renderer.svg()).toContain("1 node");
    await c.renderer.dispose();
    expect(c.registrySize()).toBe(0);
  });
});
