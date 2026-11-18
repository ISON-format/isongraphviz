// Lifecycle of the reference headless renderer (design sections 8.3 and 9; vectors L01-L24).
import { describe, expect, it } from "vitest";
import { createHeadlessRenderer } from "../src/headless/index.js";
import { buildRenderModel } from "../src/model.js";
import { verifyManifest } from "../src/manifest.js";
import { initialState, serializeState } from "../src/state.js";
import { IgrError } from "../src/errors.js";
import type { Renderer, RendererEnvironment, RenderModel, SemanticEvent } from "../src/types.js";
import { errOf, errOfAsync, handModel, igl, o1Scene } from "./helpers.js";

const I1 = { id: "i:1", type: "person" }, ANN = { id: "s:ann", type: "person" };
const E0 = { ord: "0", rel: "KNOWS", src: I1, tgt: ANN };
let O1: RenderModel;
const o1 = async () => (O1 ??= await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json")));
const env = (extra: Partial<RendererEnvironment> = {}): RendererEnvironment => ({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false, ...extra });
const loaded = async (extra: Partial<RendererEnvironment> = {}): Promise<Renderer> => { const r = createHeadlessRenderer(); await r.initialize(env(extra)); await r.loadScene(await o1()); return r; };

describe("L01 happy path and the reference manifest", () => {
  it("initialize, load, dispatch, hitTest, render, probe, export, dispose", async () => {
    const m = await o1();
    const r = createHeadlessRenderer();
    await r.initialize(env());
    await r.loadScene(m);
    expect(r.getState()).toEqual(initialState(m, { width: 900, height: 600 }));
    const ev = r.dispatch({ type: "select", mode: "replace", targets: [{ node: I1 }] });
    expect(ev.map((e) => e.type)).toEqual(["selection-changed"]);
    expect(r.getState().selection.nodes).toEqual([I1]);
    expect(r.hitTest({ x: 32.0, y: 193.5 })).toEqual({ node: I1 });
    await r.render();
    const p = r.probe();
    expect(p.marked.selected.nodes).toEqual([I1]);
    expect(p.fidelity).toEqual({ labels: "none", edge_labels: false, motion: "none", degradations: [] });
    expect((await r.export("scene")).media_type).toBe("application/octet-stream");
    await r.dispose();
  });
  it("the manifest verifies, is headless, declares the visual capabilities HOST_LACKS and scene.apply-delta RESERVED", () => {
    const r = createHeadlessRenderer();
    expect(() => verifyManifest(r.manifest)).not.toThrow();
    expect(r.manifest.renderer.host).toBe("headless");
    expect(r.manifest.capabilities["labels"]).toEqual({ status: "unsupported", reason: "HOST_LACKS" });
    expect(r.manifest.capabilities["scene.apply-delta"]).toEqual({ status: "unsupported", reason: "RESERVED" });
    expect(r.manifest.capabilities["export.scene"]).toEqual({ status: "supported" });
    expect(Object.isFrozen(r.manifest)).toBe(true);
  });
  it("renderer name, version and capacity can be set (for the kit's differently-sized subjects)", () => {
    const r = createHeadlessRenderer({ name: "tiny", version: "1.2.3", capacity: { maxNodes: 2 } });
    expect(r.manifest.renderer).toEqual({ name: "tiny", version: "1.2.3", host: "headless" });
    expect(r.manifest.capacity.maxNodes).toBe(2);
    expect(() => createHeadlessRenderer({ name: "Bad Name" })).toThrow(IgrError);
  });
});

describe("phases (L02-L06)", () => {
  const sync = (r: Renderer) => ({ dispatch: () => r.dispatch({ type: "fit" }), getState: () => r.getState(), hitTest: () => r.hitTest({ x: 0, y: 0 }), probe: () => r.probe() });
  it("L02 before initialize: NOT_INITIALIZED everywhere, setReducedMotion and manifest allowed", async () => {
    const r = createHeadlessRenderer();
    for (const [k, f] of Object.entries(sync(r))) expect(errOf(f), k).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    expect(await errOfAsync(async () => r.loadScene(await o1()))).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    expect(await errOfAsync(() => r.render())).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    expect(await errOfAsync(() => r.export("scene"))).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    expect(errOf(() => r.setReducedMotion(true))).toBe("no error");
    expect(r.manifest).toBeDefined();
  });
  it("L03 initialized but nothing loaded: NOT_LOADED", async () => {
    const r = createHeadlessRenderer();
    await r.initialize(env());
    for (const [k, f] of Object.entries(sync(r))) expect(errOf(f), k).toBe("INVALID_LIFECYCLE/NOT_LOADED");
    expect(await errOfAsync(() => r.render())).toBe("INVALID_LIFECYCLE/NOT_LOADED");
    expect(await errOfAsync(() => r.export("scene"))).toBe("INVALID_LIFECYCLE/NOT_LOADED");
  });
  it("L04 a second initialize", async () => {
    const r = await loaded();
    expect(await errOfAsync(() => r.initialize(env()))).toBe("INVALID_LIFECYCLE/ALREADY_INITIALIZED");
    expect(r.getState().viewport.width).toBe(900); // untouched
  });
  it("L05 dispose is idempotent (also before initialize); L06 everything else fails after dispose except dispose and manifest", async () => {
    const early = createHeadlessRenderer();
    await early.dispose(); await early.dispose();
    const r = await loaded();
    await r.dispose();
    await r.dispose();
    for (const [k, f] of Object.entries(sync(r))) expect(errOf(f), k).toBe("INVALID_LIFECYCLE/DISPOSED");
    expect(await errOfAsync(async () => r.initialize(env()))).toBe("INVALID_LIFECYCLE/DISPOSED");
    expect(await errOfAsync(async () => r.loadScene(await o1()))).toBe("INVALID_LIFECYCLE/DISPOSED");
    expect(await errOfAsync(() => r.render())).toBe("INVALID_LIFECYCLE/DISPOSED");
    expect(await errOfAsync(() => r.export("scene"))).toBe("INVALID_LIFECYCLE/DISPOSED");
    expect(errOf(() => r.setReducedMotion(true))).toBe("INVALID_LIFECYCLE/DISPOSED");
    expect(r.manifest.igr).toBe("IGR/1");
  });
});

describe("loadScene (L07-L10, L22)", () => {
  it("L07 a second load replaces the scene and resets the state; the default viewport uses the current size after a resize", async () => {
    const r = await loaded();
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: I1 }] });
    r.dispatch({ type: "resize", width: 500, height: 400 });
    const other = await handModel([{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b" }]);
    await r.loadScene(other);
    const s = r.getState();
    expect(s.scene_sha256).toBe(other.sceneSha256);
    expect(s.selection).toEqual({ nodes: [], edges: [] });
    expect([s.viewport.width, s.viewport.height]).toEqual([500, 400]);
    expect(s).toEqual(initialState(other, { width: 500, height: 400 }));
  });
  it("loadScene with an initial state restores it exactly", async () => {
    const m = await o1();
    const r = createHeadlessRenderer();
    await r.initialize(env());
    const init = { ...initialState(m, { width: 640, height: 480 }), selection: { nodes: [I1], edges: [E0] }, focus: { node: ANN } };
    await r.loadScene(m, init);
    expect(r.getState()).toEqual(init);
  });
  it("L08 a failed load is atomic: the previous scene and state stay", async () => {
    const m = await o1();
    const r = await loaded();
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: ANN }] });
    const before = JSON.stringify(r.getState());
    const other = await handModel([{ id: "s:a", label: "a" }]);
    expect(await errOfAsync(() => r.loadScene(other, initialState(m, { width: 9, height: 9 })))).toBe("INVALID_STATE/SCENE_MISMATCH"); // L10 too
    expect(await errOfAsync(() => r.loadScene(m, { ...initialState(m, { width: 9, height: 9 }), igr: "IGR/2" } as never))).toBe("INVALID_STATE/UNSUPPORTED_VERSION");
    expect(JSON.stringify(r.getState())).toBe(before);
    expect(r.probe().marked.selected.nodes).toEqual([ANN]);
    expect(await errOfAsync(() => r.loadScene({} as never))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL"); // L09
    expect(JSON.stringify(r.getState())).toBe(before);
  });
  it("L09 an unbranded model: NOT_A_RENDER_MODEL", async () => {
    const m = await o1();
    const r = createHeadlessRenderer();
    await r.initialize(env());
    expect(await errOfAsync(() => r.loadScene(JSON.parse(JSON.stringify(m)) as never))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
  });
  it("L22 a model over the renderer's own capacity is refused before touching anything", async () => {
    const m = await o1();
    const small = createHeadlessRenderer({ capacity: { maxNodes: 1 } });
    await small.initialize(env());
    expect(await errOfAsync(() => small.loadScene(m))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(errOf(() => small.getState())).toBe("INVALID_LIFECYCLE/NOT_LOADED");
    const twoEdges = await handModel([{ id: "s:a", label: "a" }, { id: "s:b", label: "b" }], [{ src: "s:a", tgt: "s:b", rel: "X" }, { src: "s:a", tgt: "s:b", rel: "Y" }]);
    const edgeLimited = createHeadlessRenderer({ capacity: { maxEdges: 1 } });
    await edgeLimited.initialize(env());
    expect(await errOfAsync(() => edgeLimited.loadScene(twoEdges))).toBe("RESOURCE_LIMIT/EDGE_LIMIT");
    const exact = createHeadlessRenderer({ capacity: { maxNodes: 2, maxEdges: 1 } }); // inclusive
    await exact.initialize(env());
    await expect(exact.loadScene(m)).resolves.toBeUndefined();
  });
  it("the initial state is snapshotted at the call: mutating it while the load is pending changes nothing", async () => {
    const m = await o1();
    const r = createHeadlessRenderer();
    await r.initialize(env());
    const init = { ...initialState(m, { width: 640, height: 480 }), selection: { nodes: [I1], edges: [] } };
    const p = r.loadScene(m, init);
    init.selection.nodes.length = 0; init.viewport.zoom = 5;
    await p;
    expect(r.getState().selection.nodes).toEqual([I1]);
    expect(r.getState().viewport.zoom).not.toBe(5);
  });
});

describe("reserved delta (L11-L13)", () => {
  it("applySceneDelta rejects UNSUPPORTED_CAPABILITY/RESERVED in every phase except after dispose", async () => {
    const r = createHeadlessRenderer();
    const code = (e: unknown) => (e instanceof IgrError ? `${e.code}/${e.reason}` : "other");
    await expect(r.applySceneDelta({}).catch(code)).resolves.toBe("UNSUPPORTED_CAPABILITY/RESERVED"); // L12 created
    await r.initialize(env());
    await expect(r.applySceneDelta(undefined).catch(code)).resolves.toBe("UNSUPPORTED_CAPABILITY/RESERVED");
    await r.loadScene(await o1());
    await expect(r.applySceneDelta({ add: [] }).catch(code)).resolves.toBe("UNSUPPORTED_CAPABILITY/RESERVED"); // L11 loaded
    await r.dispose();
    await expect(r.applySceneDelta({}).catch(code)).resolves.toBe("INVALID_LIFECYCLE/DISPOSED"); // L13
  });
  it("L25 after dispose() was CALLED (pending or settled) applySceneDelta is DISPOSED, immediately", async () => {
    const r = createHeadlessRenderer();
    await r.initialize(env());
    const settled: string[] = [];
    const d = r.dispose().then(() => settled.push("dispose"));
    const e = await r.applySceneDelta({}).catch((x: IgrError) => `${x.code}/${x.reason}`);
    expect(e).toBe("INVALID_LIFECYCLE/DISPOSED");
    expect(settled).toEqual([]); // rejected immediately, before the pending dispose settled
    await d;
  });
  it("the capability id is in the detail", async () => {
    const e = await createHeadlessRenderer().applySceneDelta({}).catch((x: unknown) => x) as IgrError;
    expect(e.detail).toBe("scene.apply-delta");
  });
});

describe("export (L14-L16)", () => {
  it("L14 a declared-unsupported format is NOT_SUPPORTED; L15 a string that is no format is UNKNOWN_FORMAT", async () => {
    const r = await loaded();
    expect(await errOfAsync(() => r.export("svg"))).toBe("UNSUPPORTED_CAPABILITY/NOT_SUPPORTED");
    expect(await errOfAsync(() => r.export("png"))).toBe("UNSUPPORTED_CAPABILITY/NOT_SUPPORTED");
    for (const f of ["gif", "", "SCENE"]) expect(await errOfAsync(() => r.export(f as never)), String(f)).toBe("INVALID_INPUT/UNKNOWN_FORMAT");
    for (const f of [5, null, undefined, {}]) expect(await errOfAsync(() => r.export(f as never)), String(f)).toBe("INVALID_INPUT/SCHEMA"); // rev 3: a non-string argument
    expect(await errOfAsync(async () => { const c = createHeadlessRenderer(); await c.initialize(env()); await c.export("gif" as never); })).toBe("INVALID_LIFECYCLE/NOT_LOADED"); // the phase is checked before the format
  });
  it("L16 export('scene') returns a copy of the scene bytes and never mutates the state", async () => {
    const r = await loaded();
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: I1 }] });
    const before = JSON.stringify(r.getState());
    const a = await r.export("scene");
    expect(a.format).toBe("scene");
    expect(a.bytes).toEqual(o1Scene());
    a.bytes.fill(0);
    const b = await r.export("scene");
    expect(b.bytes).toEqual(o1Scene()); // the model's own bytes are never exposed
    expect(JSON.stringify(r.getState())).toBe(before);
  });
});

describe("dispatch (L17, L20, L21, L23)", () => {
  it("L17 an invalid resize is INVALID_INTENT and changes nothing", async () => {
    const r = await loaded();
    const before = JSON.stringify(r.getState());
    expect(errOf(() => r.dispatch({ type: "resize", width: 0, height: 10 }))).toBe("INVALID_INTENT/OUT_OF_RANGE");
    expect(JSON.stringify(r.getState())).toBe(before);
  });
  it("L21 each event reaches onEvent exactly once, in order, after the commit; the same events are returned", async () => {
    const got: { e: SemanticEvent; selected: number }[] = [];
    let r!: Renderer;
    r = createHeadlessRenderer();
    await r.initialize(env({ onEvent: (e) => got.push({ e, selected: r.getState().selection.nodes.length }) }));
    await r.loadScene(await o1());
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: I1 }, { node: ANN }] });
    const ev = r.dispatch({ type: "set-hidden", targets: [{ node: ANN }], hidden: true });
    expect(got.map((g) => g.e.type)).toEqual(["selection-changed", "visibility-changed", "selection-changed"]);
    expect(ev.map((e) => e.type)).toEqual(["visibility-changed", "selection-changed"]);
    expect(got.slice(1).map((g) => g.e)).toEqual([...ev]);
    expect(got[0]!.selected).toBe(2); // state is committed before delivery
  });
  it("L21 a throwing onEvent goes to onError and leaves the state and later events alone", async () => {
    const errors: unknown[] = [];
    const seen: string[] = [];
    const r = createHeadlessRenderer();
    await r.initialize(env({ onEvent: (e) => { seen.push(e.type); throw new Error("listener failed"); }, onError: (e) => errors.push(e) }));
    await r.loadScene(await o1());
    const ev = r.dispatch({ type: "select", mode: "replace", targets: [{ node: I1 }, { node: ANN }] });
    r.dispatch({ type: "focus", target: { node: I1 } });
    expect(ev).toHaveLength(1);
    expect(r.getState().selection.nodes).toHaveLength(2);
    expect(seen).toEqual(["selection-changed", "focus-changed"]);
    expect(errors).toHaveLength(2);
    expect((errors[0] as Error).message).toBe("listener failed");
    // a throwing onError is swallowed too
    const r2 = createHeadlessRenderer();
    await r2.initialize(env({ onEvent: () => { throw new Error("a"); }, onError: () => { throw new Error("b"); } }));
    await r2.loadScene(await o1());
    expect(() => r2.dispatch({ type: "select", mode: "add", targets: [{ node: I1 }] })).not.toThrow();
  });
  it("L20 dispatch from inside onEvent is REENTRANT (and is routed to onError, state unaffected)", async () => {
    let r!: Renderer;
    const errors: unknown[] = [];
    r = createHeadlessRenderer();
    await r.initialize(env({ onEvent: () => { r.dispatch({ type: "clear-selection" }); }, onError: (e) => errors.push(e) }));
    await r.loadScene(await o1());
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: I1 }] });
    expect(errors).toHaveLength(1);
    expect(`${(errors[0] as IgrError).code}/${(errors[0] as IgrError).reason}`).toBe("INVALID_LIFECYCLE/REENTRANT");
    expect(r.getState().selection.nodes).toEqual([I1]);
    // after the listener returns, dispatch works again
    expect(() => r.dispatch({ type: "pan", dx: 1, dy: 1 })).not.toThrow();
  });
  it("L23 setReducedMotion takes effect mid-session; the report never claims motion under reduced motion", async () => {
    const r = await loaded({ reducedMotion: false });
    expect(r.probe().fidelity.motion).toBe("none");
    r.setReducedMotion(true);
    expect(r.probe().fidelity.motion).toBe("none");
    expect(errOf(() => r.setReducedMotion("yes" as never))).toBe("INVALID_INPUT/SCHEMA");
  });
});

describe("FIFO, BUSY (L18, L19) and environment (L24)", () => {
  it("L18 initialize, loadScene, render, export, dispose issued without awaiting are processed in call order", async () => {
    const m = await o1();
    const r = createHeadlessRenderer();
    const order: string[] = [];
    const calls = [
      r.initialize(env()).then(() => order.push("initialize")),
      r.loadScene(m).then(() => order.push("loadScene")),
      r.render().then(() => order.push("render")),
      r.export("scene").then(() => order.push("export")),
      r.dispose().then(() => order.push("dispose")),
    ];
    await Promise.all(calls);
    expect(order).toEqual(["initialize", "loadScene", "render", "export", "dispose"]);
  });
  it("L18 a failing call does not poison the queue", async () => {
    const m = await o1();
    const r = createHeadlessRenderer();
    const a = r.loadScene(m).catch((e: IgrError) => e.reason); // before initialize: fails
    const b = r.initialize(env());
    const c = r.loadScene(m);
    expect(await a).toBe("NOT_INITIALIZED");
    await Promise.all([b, c]);
    expect(r.getState().scene_sha256).toBe(m.sceneSha256);
  });
  it("L19 while any asynchronous call is pending, dispatch, getState, hitTest and probe throw BUSY; manifest and setReducedMotion work", async () => {
    const m = await o1();
    const r = createHeadlessRenderer();
    const p1 = r.initialize(env());
    for (const f of [() => r.dispatch({ type: "fit" }), () => r.getState(), () => r.hitTest({ x: 0, y: 0 }), () => r.probe()]) expect(errOf(f)).toBe("INVALID_LIFECYCLE/BUSY");
    expect(errOf(() => r.setReducedMotion(true))).toBe("no error");
    expect(r.manifest.igr).toBe("IGR/1");
    await p1;
    const p2 = r.loadScene(m);
    expect(errOf(() => r.dispatch({ type: "fit" }))).toBe("INVALID_LIFECYCLE/BUSY");
    expect(errOf(() => r.probe())).toBe("INVALID_LIFECYCLE/BUSY");
    await p2;
    expect(errOf(() => r.dispatch({ type: "fit" }))).toBe("no error");
    const p3 = r.render();
    expect(errOf(() => r.getState())).toBe("INVALID_LIFECYCLE/BUSY");
    await p3;
    const p4 = r.export("scene");
    expect(errOf(() => r.hitTest({ x: 0, y: 0 }))).toBe("INVALID_LIFECYCLE/BUSY");
    await p4;
    const p5 = r.dispose();
    expect(errOf(() => r.getState())).toBe("INVALID_LIFECYCLE/BUSY");
    await p5;
    expect(errOf(() => r.getState())).toBe("INVALID_LIFECYCLE/DISPOSED");
  });
  it("rev 3: BUSY takes precedence over every phase error, DISPOSED included; applySceneDelta is never BUSY and never queued", async () => {
    const r = await loaded();
    await r.dispose();
    const p = r.render().catch((e: IgrError) => e.reason); // rejected at processing time, but pending until then
    expect(errOf(() => r.getState())).toBe("INVALID_LIFECYCLE/BUSY");
    expect(await p).toBe("DISPOSED");
    expect(errOf(() => r.getState())).toBe("INVALID_LIFECYCLE/DISPOSED");
    const q = createHeadlessRenderer();
    const init = q.initialize(env());
    const delta = await q.applySceneDelta({}).catch((e: IgrError) => `${e.code}/${e.reason}`);
    expect(delta).toBe("UNSUPPORTED_CAPABILITY/RESERVED"); // not BUSY although initialize is pending
    await init;
  });
  it("rev 3: a failed initialize leaves the phase created and a later valid initialize is allowed; initialize after dispose is DISPOSED", async () => {
    const r = createHeadlessRenderer();
    expect(await errOfAsync(() => r.initialize(env({ size: { width: 0, height: 1 } })))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    await expect(r.initialize(env())).resolves.toBeUndefined();
    await r.dispose();
    expect(await errOfAsync(() => r.initialize(env()))).toBe("INVALID_LIFECYCLE/DISPOSED");
  });
  it("L24 an invalid size at initialize is INVALID_INPUT and leaves the renderer uninitialized", async () => {
    const r = createHeadlessRenderer();
    expect(await errOfAsync(() => r.initialize(env({ size: { width: 0, height: 10 } })))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(await errOfAsync(() => r.initialize(env({ size: { width: 10, height: 16385 } })))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(await errOfAsync(() => r.initialize(env({ size: { width: 1.5, height: 10 } })))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(await errOfAsync(() => r.initialize({ ...env(), size: null } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(await errOfAsync(() => r.initialize({ ...env(), reducedMotion: "no" } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(await errOfAsync(() => r.initialize({ ...env(), onEvent: 5 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(await errOfAsync(() => r.initialize(null as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => r.getState())).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
    await expect(r.initialize(env({ size: { width: 1, height: 1 } }))).resolves.toBeUndefined();
  });
  it("the environment is snapshotted at the call and each property is read once", async () => {
    const e = env();
    let reads = 0;
    Object.defineProperty(e, "reducedMotion", { get() { reads++; return false; }, enumerable: true });
    const r = createHeadlessRenderer();
    const p = r.initialize(e);
    e.size.width = 5; // after the call: no effect
    await p;
    await r.loadScene(await o1());
    expect(r.getState().viewport.width).toBe(900);
    expect(reads).toBe(1);
  });
  it("invalid limits in the environment are refused at initialize", async () => {
    const r = createHeadlessRenderer();
    expect(await errOfAsync(() => r.initialize(env({ limits: { maxNodes: -1 } })))).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("environment limits apply to the intents (TARGET_LIMIT) of this renderer only", async () => {
    const r = await loaded({ limits: { maxIntentTargets: 1 } });
    expect(errOf(() => r.dispatch({ type: "select", mode: "add", targets: [{ node: I1 }, { node: ANN }] }))).toBe("RESOURCE_LIMIT/TARGET_LIMIT");
  });
});

describe("independence of renderers", () => {
  it("two renderers hold independent state", async () => {
    const a = await loaded(), b = await loaded();
    a.dispatch({ type: "select", mode: "replace", targets: [{ node: I1 }] });
    expect(b.getState().selection.nodes).toEqual([]);
  });
  it("getState returns a copy: mutating it changes nothing", async () => {
    const r = await loaded();
    const s = r.getState();
    s.selection.nodes.push(I1); s.viewport.zoom = 5;
    expect(r.getState().selection.nodes).toEqual([]);
    expect(r.getState().viewport.zoom).not.toBe(5);
  });
});

describe("rev 5 (9): loadScene does not apply maxStateBytes to an initial state (an object has no bytes)", () => {
  it("a state larger than maxStateBytes still loads; the limit is for parseState bytes only", async () => {
    const m = await o1();
    const init = { ...initialState(m, { width: 640, height: 480 }), selection: { nodes: [I1], edges: [E0] } };
    const len = serializeState(m, init).length;
    const r = createHeadlessRenderer();
    await r.initialize(env({ limits: { maxStateBytes: len - 1 } }));
    await expect(r.loadScene(m, init)).resolves.toBeUndefined();
    expect(r.getState()).toEqual(init);
  });
});
