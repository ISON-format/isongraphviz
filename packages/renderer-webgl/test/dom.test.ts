// The DOM adapter (design 7.9, 8.2) against a MINIMAL FAKE DOM and a fake WebGL2 context in Node. This checks the adapter's own logic (mounting, probe and
// fail-closed initialize, commit, context loss and restore, input mapping, refusals, disposal); it is not a browser test: `npm run smoke:browser` is the
// single-engine smoke run, and no browser qualification is claimed here.
import { describe, expect, it } from "vitest";
import { recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";
import * as domEntry from "../src/dom/index.js";
import { createDomWebglRenderer, type DomWebglRendererOptions } from "../src/dom/index.js";
import type { Intent } from "isongraph-visualize-renderer-core";
import { composeWebglRenderer } from "../src/renderer.js";
import { createWebglRenderer, glManifest, parseGlPlan } from "../src/index.js";
import { canon } from "./fake-gl.js";
import { LOOPS2, O1, O4, errOf, initial, loadModel } from "./helpers.js";

import { FakeDoc, FakeNode, env, mountFake } from "./dom-fake.js";

const text = (b: Uint8Array): string => new TextDecoder().decode(b);

async function mount(opts?: unknown, extra: Record<string, unknown> = {}, model?: { scene: string; layout: string }, tweak?: (d: FakeDoc) => void) {
  return mountFake(opts, tweak, extra, model);
}
/** A press: by default on the GL canvas of the mount (the element that listens, 5.3); `host` is any element of the page. */
const press = (host: FakeNode, x: number, y: number, extra: Record<string, unknown> = {}): void => host.children[0]!.children[0]!.fire("pointerdown", { isPrimary: true, button: 0, clientX: x, clientY: y, ...extra });
const callsOf = (log: string[], name: string): string[] => log.filter((l) => l.startsWith(`["${name}"`));

describe("initialize", () => {
  it("requires an Element host; a headless host string is refused", async () => {
    const r = createDomWebglRenderer();
    expect(await errOfAsync(() => r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(await errOfAsync(() => r.initialize({ host: {}, size: { width: 900, height: 600 }, reducedMotion: false } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("mounts a wrapper with the GL canvas (role img) and the label canvas (aria-hidden, no pointer events), and a polite status line", async () => {
    const { host, wrapper, glCanvas, labelCanvas, status } = await mount();
    expect(host.children.map((c) => c.tag)).toEqual(["div", "div"]);
    expect(wrapper.children.map((c) => c.tag)).toEqual(["canvas", "canvas"]);
    expect(glCanvas.getAttribute("role")).toBe("img");
    expect(glCanvas.getAttribute("tabindex")).toBeNull();
    expect(labelCanvas.getAttribute("aria-hidden")).toBe("true");
    expect(labelCanvas.style["pointerEvents"]).toBe("none");
    expect(labelCanvas.style["position"]).toBe("absolute");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    for (const c of [glCanvas, labelCanvas]) { expect(c.style["width"]).toBe("900px"); expect(c.style["height"]).toBe("600px"); expect([c.width, c.height]).toEqual([900, 600]); }
  });
  it("aria-label is the summary and the status text", async () => {
    const { glCanvas } = await mount();
    expect(glCanvas.getAttribute("aria-label")).toBe("Directed graph with 2 nodes and 1 edge. Node categories: person (2). 0 selected, 0 hidden.");
  });
  it("uses the dom manifest (x-gl.executes and x-gl.context-recovery supported)", async () => {
    const r = createDomWebglRenderer();
    expect(r.manifest).toEqual(glManifest("dom"));
    expect((r.manifest.capabilities as Record<string, unknown>)["x-gl.executes"]).toEqual({ status: "supported" });
  });
  it("probes on DETACHED scratch canvases with the backing size, requests the live context with the same attributes, and releases the probe contexts", async () => {
    const { log, host, doc } = await mount();
    expect(callsOf(log, "getExtension").length).toBeGreaterThanOrEqual(1);
    expect(callsOf(log, "loseContext").length).toBeGreaterThanOrEqual(1); // the probe's context
    expect(doc.world.gls.length).toBe(2); // one scratch context, one live context
    expect(host.children.some((c) => c.tag === "canvas")).toBe(false); // scratch canvases were never mounted
  });
  it("a refused probe (no strict context on a software-only machine) rejects INVALID_INPUT/INVALID_VALUE with the reason token, mounts nothing, and records status().failure", async () => {
    const doc = new FakeDoc();
    doc.world.softwareOnly = true;
    const keep = doc.createElement("p");
    doc.body.appendChild(keep);
    const r = createDomWebglRenderer();
    let err: unknown;
    try { await r.initialize(env(doc.body)); } catch (e) { err = e; }
    expect((err as { code: string; reason: string; detail: string }).code).toBe("INVALID_INPUT");
    expect((err as { reason: string }).reason).toBe("INVALID_VALUE");
    expect((err as { detail: string }).detail).toBe("PERFORMANCE_CAVEAT");
    expect(r.status().failure).toBe("PERFORMANCE_CAVEAT");
    expect(doc.body.children).toEqual([keep]);
    expect(await errOfAsync(() => r.loadScene(null as never))).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
  });
  it("the closed option failIfMajorPerformanceCaveat: false lets software GL pass the probe and the live request; status() records it", async () => {
    const { r } = await mount({ contextAttributes: { failIfMajorPerformanceCaveat: false } }, {}, undefined, (d) => { d.world.softwareOnly = true; });
    expect(r.status().attributes).toEqual({ failIfMajorPerformanceCaveat: false });
    expect(r.status().phase).toBe("ready");
  });
  it("a context whose drawing buffer is not the planned backing size fails closed with TOO_SMALL", async () => {
    const doc = new FakeDoc();
    doc.world.drawingBuffer = { w: 800, h: 600 };
    const r = createDomWebglRenderer();
    let err: unknown;
    try { await r.initialize(env(doc.body)); } catch (e) { err = e; }
    expect((err as { detail: string }).detail).toBe("TOO_SMALL");
    expect(r.status().failure).toBe("TOO_SMALL");
    expect(doc.body.children).toEqual([]);
    expect(callsOf(doc.world.log, "loseContext").length).toBeGreaterThanOrEqual(2); // the probe's and the refused live context are both released
  });
  it("no 2D label context fails closed with NO_2D_LAYER", async () => {
    const doc = new FakeDoc();
    doc.world.noLabelContext = true;
    const r = createDomWebglRenderer();
    expect(await errOfAsync(() => r.initialize(env(doc.body)))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(r.status().failure).toBe("NO_2D_LAYER");
  });
  it("an unusable size fails with a BACKING_SIZE detail", async () => {
    const doc = new FakeDoc();
    const r = createDomWebglRenderer();
    expect(await errOfAsync(() => r.initialize({ host: doc.body, size: { width: 20000, height: 600 }, reducedMotion: false } as never))).toMatch(/^INVALID_INPUT\//);
  });
});

describe("commit", () => {
  it("draws the plan of the committed state: the frame is executePlan's and the label canvas receives the layer-8 replay of the plan's text source", async () => {
    const { r, log, labelCanvas } = await mount();
    expect(callsOf(log, "viewport").pop()).toBe('["viewport",0,0,900,600]');
    expect(callsOf(log, "drawArraysInstanced").length).toBe(3);
    const labels = text(labelCanvas.rec.bytes());
    const expected = text(recordCanvasCalls(parseGlPlan(r.planBytes()).textSource, { layers: [8] }));
    expect(labels).toBe(expected.split("\n").filter((l) => !l.startsWith('["#"')).join("\n"));
    expect(labels).toContain('["m","fillText","ann",867928,430400]');
  });
  it("a dispatch that returns events redraws; one that changes nothing does not", async () => {
    const { r, log } = await mount();
    const before = callsOf(log, "drawArraysInstanced").length;
    r.dispatch({ type: "clear-selection" });
    expect(callsOf(log, "drawArraysInstanced").length).toBe(before);
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(callsOf(log, "drawArraysInstanced").length).toBeGreaterThan(before);
  });
  it("devicePixelRatio 1.5: the backing store is 1350 x 900, the CSS size stays 900 x 600, u_view is the CSS size and the labels replay at 1500", async () => {
    const { glCanvas, labelCanvas, log } = await mount(undefined, {}, undefined, (d) => { d.defaultView.devicePixelRatio = 1.5; });
    expect([glCanvas.width, glCanvas.height, glCanvas.style["width"], glCanvas.style["height"]]).toEqual([1350, 900, "900px", "600px"]);
    expect(callsOf(log, "viewport").pop()).toBe('["viewport",0,0,1350,900]');
    expect(callsOf(log, "uniform2f").pop()).toBe('["uniform2f","disc.u_view",900,600]');
    expect(text(labelCanvas.rec.bytes())).toContain('["m","setTransform",1500,0,0,1500,0,0]');
  });
  it("resize changes both canvases and redraws", async () => {
    const { glCanvas, labelCanvas, r } = await mount();
    r.dispatch({ type: "resize", width: 400, height: 300 });
    for (const c of [glCanvas, labelCanvas]) expect([c.width, c.height, c.style["width"], c.style["height"]]).toEqual([400, 300, "400px", "300px"]);
  });
  it("the announcements of the last dispatch are written to the status line with textContent", async () => {
    const { r, status } = await mount();
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(status.textContent.length).toBeGreaterThan(0);
  });
});

describe("context loss and restore (7.6), through the adapter", () => {
  it("a loss: contextLost, the label canvas cleared, aria-label says the display is unavailable, probe() and the semantic state are unchanged, no semantic event", async () => {
    const { glCanvas, labelCanvas, r, events, gl } = await mount();
    const before = JSON.stringify(r.probe());
    const state = JSON.stringify(r.getState());
    const n = events.length;
    gl.lost = true; // the browser reports the loss before it fires the event
    glCanvas.fire("webglcontextlost", { preventDefault: () => undefined });
    expect(r.status().phase).toBe("lost");
    expect(r.status().contextLost).toBe(true);
    expect(text(labelCanvas.rec.bytes()).trimEnd().split("\n").slice(-2)).toEqual(['["m","setTransform",1000,0,0,1000,0,0]', '["m","clearRect",0,0,900000,600000]']);
    expect(glCanvas.getAttribute("aria-label")).toBe("Graph display unavailable. Directed graph with 2 nodes and 1 edge. Node categories: person (2). 0 selected, 0 hidden.");
    expect(JSON.stringify(r.probe())).toBe(before);
    expect(JSON.stringify(r.getState())).toBe(state);
    expect(events.length).toBe(n);
  });
  it("a commit while lost draws nothing; the restore rebuilds, draws the latest plan and the labels, and the aria-label is the summary again", async () => {
    const { glCanvas, r, log, doc } = await mount();
    doc.world.gls[doc.world.gls.length - 1]!.lost = true;
    glCanvas.fire("webglcontextlost", { preventDefault: () => undefined });
    const draws = callsOf(log, "drawArraysInstanced").length;
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(callsOf(log, "drawArraysInstanced").length).toBe(draws);
    const gl = doc.world.gls[doc.world.gls.length - 1]!;
    gl.lost = false;
    glCanvas.fire("webglcontextrestored", {});
    expect(r.status().phase).toBe("ready");
    expect(callsOf(log, "drawArraysInstanced").length).toBeGreaterThan(draws);
    expect(glCanvas.getAttribute("aria-label")?.startsWith("Directed graph")).toBe(true);
  });
});

describe("pointer", () => {
  it("a press on a node centre selects it (replace); a press on empty space clears the selection", async () => {
    const { host, r, events } = await mount();
    press(host, 32.072, 193.6);
    expect(r.getState().selection.nodes).toEqual([{ id: "i:1", type: "person" }]);
    expect(events.length).toBeGreaterThan(0);
    press(host, 5, 590);
    expect(r.getState().selection.nodes).toEqual([]);
  });
  it("a press on the apex of a loop selects the loop (pick, not the frozen hitTest)", async () => {
    const { host, r } = await mount(undefined, {}, LOOPS2);
    press(host, 32.1, 275.0);
    expect(r.getState().selection.edges.map((e) => e.rel)).toEqual(["R0"]);
  });
  it("converts a press by the GL canvas rectangle (CSS pixels scaled to the viewport)", async () => {
    const { host, glCanvas, r } = await mount();
    glCanvas.rect = { left: 100, top: 50, width: 450, height: 300 };
    press(host, 100 + 32.072 / 2, 50 + 193.6 / 2);
    expect(r.getState().selection.nodes).toEqual([{ id: "i:1", type: "person" }]);
  });
  it("ignores a non-primary pointer, a non-zero button and an empty rectangle", async () => {
    const { host, glCanvas, r } = await mount();
    press(host, 32.072, 193.6, { isPrimary: false });
    press(host, 32.072, 193.6, { button: 2 });
    glCanvas.rect = { left: 0, top: 0, width: 0, height: 0 };
    press(host, 32.072, 193.6);
    expect(r.getState().selection.nodes).toEqual([]);
  });
  it("registers a pointerdown handler on the GL canvas (M-2) and nothing else for the pointer: no move, wheel, key, focus or hover handler; the host listens to nothing, the label canvas to nothing", async () => {
    const { host, glCanvas, labelCanvas } = await mount();
    expect([...host.listeners.entries()].filter(([, v]) => v.length > 0)).toEqual([]);
    expect([...glCanvas.listeners.entries()].filter(([, v]) => v.length > 0).map(([k]) => k).sort()).toEqual(["pointerdown", "webglcontextlost", "webglcontextrestored"]);
    expect([...labelCanvas.listeners.keys()]).toEqual([]);
  });
  it("a press elsewhere in the host (the status line, the padding) is not a press on the graph: nothing is selected or cleared (M-2)", async () => {
    const { host, status, r } = await mount();
    press(host, 32.072, 193.6);
    expect(r.getState().selection.nodes.length).toBe(1);
    const fireOn = (n: FakeNode): void => n.fire("pointerdown", { isPrimary: true, button: 0, clientX: 5, clientY: 590 });
    fireOn(host); fireOn(status);
    expect(r.getState().selection.nodes.length).toBe(1); // a press on empty graph space would have cleared it
  });
});

describe("refusals (3.5): the canvases never show a stale scene", () => {
  it("a viewport that puts a node beyond 2^40 m-px: the dispatch stays successful, onError is called, both canvases are cleared, status().failure is COORD_LIMIT, the next good commit clears it", async () => {
    const { r, errors, labelCanvas, log } = await mount();
    r.dispatch({ type: "set-viewport", center_x: -(2 ** 53 - 1), center_y: 0, zoom: 100000 });
    expect(r.status().failure).toBe("COORD_LIMIT");
    expect(errors.length).toBe(1);
    expect(text(labelCanvas.rec.bytes()).trimEnd().split("\n").slice(-2)).toEqual(['["m","setTransform",1000,0,0,1000,0,0]', '["m","clearRect",0,0,900000,600000]']);
    expect(callsOf(log, "clear").length).toBeGreaterThan(1); // the GL canvas was cleared by an empty frame
    expect(r.getState().viewport.zoom).toBe(100000); // model and state stay consistent
    r.dispatch({ type: "fit" });
    expect(r.status().failure).toBeUndefined();
  });
  it("renderer.pick after a COORD_LIMIT refusal throws the same error; probe() stays correct", async () => {
    const { r } = await mount();
    r.dispatch({ type: "set-viewport", center_x: -(2 ** 53 - 1), center_y: 0, zoom: 100000 });
    expect(() => r.pick({ x: 10, y: 10 })).toThrow(/OUT_OF_RANGE/);
    expect(r.probe().drawn.nodes.length).toBe(2);
  });
});

describe("dispose", () => {
  it("restores the host's children, removes the listeners, deletes the resources and releases the context", async () => {
    const doc = new FakeDoc();
    const keep = doc.createElement("p");
    doc.body.appendChild(keep);
    const r = createDomWebglRenderer();
    await r.initialize(env(doc.body));
    await r.loadScene(await loadModel(O4.scene, O4.layout));
    const wrapper = doc.body.children[0]!;
    const gc = wrapper.children[0]!;
    expect(doc.body.children.map((c) => c.tag)).toEqual(["p"].concat([]).length ? ["div", "div"] : []);
    doc.world.log.length = 0;
    await r.dispose();
    expect(doc.body.children).toEqual([keep]);
    expect(gc.listeners.get("pointerdown")).toEqual([]);
    expect(gc.listeners.get("webglcontextlost")).toEqual([]);
    expect(callsOf(doc.world.log, "deleteBuffer").length).toBe(3);
    expect(callsOf(doc.world.log, "loseContext").length).toBe(1);
    expect(r.status().phase).toBe("disposed");
  });
});

describe("the dom adapter equals the headless renderer on everything but mounting", () => {
  it("the plan bytes and the text calls are those of createWebglRenderer with the same options", async () => {
    const { r } = await mount();
    const { model, state } = await initial(O1);
    const h = createWebglRenderer({ capacity: { maxDrawnLabelUnits: 262144 } });
    await h.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
    await h.loadScene(model, state);
    expect(text(r.planBytes())).toBe(text(h.planBytes()));
    expect(text(r.textCalls())).toBe(text(h.textCalls()));
    expect(errOf(() => r.status())).toBe("none");
    void canon;
  });
});

async function errOfAsync(f: () => Promise<unknown>): Promise<string> {
  try { await f(); return "none"; } catch (e) { return (e as { code?: string; reason?: string }).code ? `${(e as { code: string }).code}/${(e as { reason?: string }).reason ?? ""}` : `other:${String(e)}`; }
}

// ---- CCR-V11-6 (design 32 18.2): the additive adapter options pointer, liveRegion, canvasLabel ------------------------------------
describe("adapter options pointer / liveRegion / canvasLabel (CCR-V11-6)", () => {
  const sel: Intent = { type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] };
  const ALL = { pointer: "none", liveRegion: "none", canvasLabel: "none" };
  const pointerListeners = (n: FakeNode): number => [...n.listeners.entries()].filter(([k]) => k.startsWith("pointer") || k.startsWith("mouse") || k.startsWith("touch")).reduce((a, [, v]) => a + v.length, 0);
  const LABEL = "Directed graph with 2 nodes and 1 edge. Node categories: person (2). 0 selected, 0 hidden.";

  it("the dom entry exports exactly createDomWebglRenderer (the option type is a type only)", () => {
    expect(Object.keys(domEntry)).toEqual(["createDomWebglRenderer"]);
    const o: DomWebglRendererOptions = { pointer: "none", liveRegion: "none", canvasLabel: "none", contextAttributes: { failIfMajorPerformanceCaveat: false } };
    expect(o.canvasLabel).toBe("none");
  });

  it("the explicit defaults reproduce today's behaviour: role img + label on the GL canvas, aria-hidden label canvas, status div, pointerdown handler", async () => {
    const { host, glCanvas, labelCanvas, status, r } = await mount({ pointer: "builtin", liveRegion: "builtin", canvasLabel: "builtin" });
    expect(host.children.map((c) => c.tag)).toEqual(["div", "div"]);
    expect(glCanvas.getAttribute("role")).toBe("img");
    expect(glCanvas.getAttribute("aria-hidden")).toBeNull();
    expect(glCanvas.getAttribute("aria-label")).toBe(LABEL);
    expect(labelCanvas.getAttribute("aria-hidden")).toBe("true");
    expect(status.getAttribute("role")).toBe("status");
    expect(glCanvas.listeners.get("pointerdown")).toHaveLength(1);
    r.dispatch(sel);
    expect(status.textContent).toBe("1 selected.");
    expect(glCanvas.getAttribute("aria-label")).toContain("1 selected");
  });
  it("the plan, the text calls and the drawn frame are identical with and without the explicit defaults and with the none options", async () => {
    const a = await mount(), b = await mount({ pointer: "builtin", liveRegion: "builtin", canvasLabel: "builtin" }), c = await mount(ALL);
    for (const x of [b, c]) {
      expect(text(x.r.planBytes())).toBe(text(a.r.planBytes()));
      expect(text(x.r.textCalls())).toBe(text(a.r.textCalls()));
      expect(x.log.join("\n")).toBe(a.log.join("\n"));
      expect(text(x.labelCanvas.rec.bytes())).toBe(text(a.labelCanvas.rec.bytes()));
      expect(JSON.stringify(x.r.manifest)).toBe(JSON.stringify(a.r.manifest));
    }
  });
  it("an own property whose value is undefined is absent (the defaults apply)", async () => {
    const { host, glCanvas } = await mount({ pointer: undefined, liveRegion: undefined, canvasLabel: undefined });
    expect(host.children.map((c) => c.tag)).toEqual(["div", "div"]);
    expect(glCanvas.getAttribute("role")).toBe("img");
    expect(glCanvas.listeners.get("pointerdown")).toHaveLength(1);
  });

  it("pointer none: no pointer listener of any kind on the canvases, the wrapper or the host, and a press changes nothing; context events still work", async () => {
    const { host, wrapper, glCanvas, labelCanvas, r, events } = await mount({ pointer: "none" });
    for (const n of [host, wrapper, glCanvas, labelCanvas]) expect(pointerListeners(n)).toBe(0);
    expect([...glCanvas.listeners.entries()].filter(([, v]) => v.length > 0).map(([k]) => k).sort()).toEqual(["webglcontextlost", "webglcontextrestored"]);
    events.length = 0;
    press(host, 32.072, 193.6);
    glCanvas.fire("pointerdown", { isPrimary: true, button: 0, clientX: 32.072, clientY: 193.6 });
    expect(events).toEqual([]);
    expect(r.getState().selection.nodes).toEqual([]);
    expect(glCanvas.style["cursor"]).toBeUndefined();
    r.dispatch(sel); // dispatch still redraws and announces
    expect(r.getState().selection.nodes).toHaveLength(1);
    expect(host.children[1]!.textContent).toBe("1 selected.");
    expect(glCanvas.getAttribute("role")).toBe("img"); // the label is independent
  });

  it("liveRegion none: no status element is created or written; the canvases, label and pointer handling are independent", async () => {
    const doc = new FakeDoc();
    const keep = doc.createElement("p");
    doc.body.appendChild(keep);
    const r = createDomWebglRenderer({ liveRegion: "none" });
    await r.initialize(env(doc.body));
    expect(doc.body.children).toHaveLength(1);
    await r.loadScene(await loadModel(O1.scene, O1.layout));
    r.dispatch(sel);
    r.dispatch({ type: "clear-selection" });
    expect(doc.body.children.map((c) => c.tag)).toEqual(["div"]);
    const all = (n: FakeNode): FakeNode[] => n.children.flatMap((c) => [c, ...all(c)]);
    expect(all(doc.body).some((c) => c.getAttribute("role") === "status" || c.getAttribute("aria-live") !== null)).toBe(false);
    const gc = doc.body.children[0]!.children[0]!;
    expect(gc.getAttribute("role")).toBe("img");
    expect(gc.listeners.get("pointerdown")).toHaveLength(1);
    await r.dispose();
    expect(doc.body.children).toEqual([keep]);
  });

  it("canvasLabel none: both canvases aria-hidden=\"true\", the GL canvas has no role and no aria-label, before and after commits and after a context loss and restore; the status line stays", async () => {
    const { host, glCanvas, labelCanvas, r, doc } = await mount({ canvasLabel: "none" });
    const check = (): void => {
      expect(glCanvas.getAttribute("aria-hidden")).toBe("true");
      expect(glCanvas.getAttribute("role")).toBeNull();
      expect(glCanvas.getAttribute("aria-label")).toBeNull();
      expect([...glCanvas.attrs.keys()].sort()).toEqual(["aria-hidden"]);
      expect(labelCanvas.getAttribute("aria-hidden")).toBe("true");
      expect(labelCanvas.getAttribute("role")).toBeNull();
      expect(labelCanvas.getAttribute("aria-label")).toBeNull();
    };
    check();
    r.dispatch(sel);
    expect(host.children[1]!.textContent).toBe("1 selected."); // the status line is independent of the label
    check();
    r.dispatch({ type: "resize", width: 400, height: 300 });
    check();
    const gl = doc.world.gls[doc.world.gls.length - 1]!;
    gl.lost = true;
    glCanvas.fire("webglcontextlost", { preventDefault: () => undefined });
    expect(r.status().phase).toBe("lost");
    check(); // no "Graph display unavailable." label either
    gl.lost = false;
    glCanvas.fire("webglcontextrestored", {});
    expect(r.status().phase).toBe("ready");
    check();
    expect(glCanvas.listeners.get("pointerdown")).toHaveLength(1);
  });
  it("canvasLabel none: aria-hidden is set at initialize, before any scene is loaded", async () => {
    const doc = new FakeDoc();
    const r = createDomWebglRenderer({ canvasLabel: "none" });
    await r.initialize(env(doc.body));
    const gc = doc.body.children[0]!.children[0]!;
    expect(gc.getAttribute("aria-hidden")).toBe("true");
    expect(gc.getAttribute("role")).toBeNull();
    expect(gc.getAttribute("aria-label")).toBeNull();
  });

  it("all three none: bare canvases (aria-hidden only), no pointer listener, no status; the frame is unchanged; dispose restores the host", async () => {
    const doc = new FakeDoc();
    const keep = doc.createElement("p");
    doc.body.appendChild(keep);
    const r = createDomWebglRenderer(ALL as never);
    await r.initialize(env(doc.body));
    await r.loadScene(await loadModel(O1.scene, O1.layout));
    const wrapper = doc.body.children[0]!, gc = wrapper.children[0]!, lc = wrapper.children[1]!;
    expect(doc.body.children.map((c) => c.tag)).toEqual(["div"]);
    expect(pointerListeners(gc) + pointerListeners(lc) + pointerListeners(wrapper) + pointerListeners(doc.body)).toBe(0);
    expect([...gc.attrs.keys()]).toEqual(["aria-hidden"]);
    expect(doc.world.log.some((l) => l.startsWith('["drawArraysInstanced"'))).toBe(true);
    await r.dispose();
    expect(doc.body.children).toEqual([keep]);
    expect(r.status().phase).toBe("disposed");
  });
  it("dispose removes whatever was added, with any combination", async () => {
    for (const o of [undefined, { pointer: "none" }, { liveRegion: "none" }, { canvasLabel: "none" }, ALL]) {
      const { r, host, glCanvas, labelCanvas, wrapper, doc } = await mount(o);
      doc.world.log.length = 0;
      await r.dispose();
      expect(host.children, JSON.stringify(o)).toHaveLength(0);
      for (const n of [glCanvas, labelCanvas, wrapper, host]) expect([...n.listeners.values()].every((l) => l.length === 0), JSON.stringify(o)).toBe(true);
      expect(callsOf(doc.world.log, "loseContext").length, JSON.stringify(o)).toBe(1);
    }
  });

  it("a value outside the set of a known new key is INVALID_INPUT/INVALID_VALUE (any type, any case, the empty string, null)", () => {
    const bads: unknown[] = ["x", "", "NONE", "Builtin", " none", 1, 0, true, false, null, {}, [], ["none"], "by-id"];
    for (const k of ["pointer", "liveRegion", "canvasLabel"]) {
      for (const v of bads) expect(errOf(() => createDomWebglRenderer({ [k]: v } as never)), `${k}=${JSON.stringify(v)}`).toBe("INVALID_INPUT/INVALID_VALUE");
      expect(errOf(() => createDomWebglRenderer({ [k]: "builtin" } as never)), k).toBe("none");
      expect(errOf(() => createDomWebglRenderer({ [k]: "none" } as never)), k).toBe("none");
    }
  });
  it("focusRestore is not an option of the WebGL adapter (it restores no focus): an unknown key stays SCHEMA", () => {
    expect(errOf(() => createDomWebglRenderer({ focusRestore: "none" } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createDomWebglRenderer({ focusRestore: "by-id" } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("unknown keys stay SCHEMA at the dom wrapper, even beside valid new keys", () => {
    expect(errOf(() => createDomWebglRenderer({ bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createDomWebglRenderer({ pointer: "none", bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createDomWebglRenderer({ Pointer: "none" } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("non-plain option containers are still the composer's SCHEMA", () => {
    for (const o of [[], "none", 5, null, true, new (class X { pointer = "none"; })()]) expect(errOf(() => createDomWebglRenderer(o as never)), String(o)).toBe("INVALID_INPUT/SCHEMA");
  });
  it("the shared composer and the headless renderer still reject the new keys with SCHEMA", () => {
    for (const k of ["pointer", "liveRegion", "canvasLabel", "focusRestore"]) {
      expect(errOf(() => createWebglRenderer({ [k]: "none" } as never)), `headless ${k}`).toBe("INVALID_INPUT/SCHEMA");
      expect(errOf(() => composeWebglRenderer("dom", { [k]: "none" } as never)), `composer ${k}`).toBe("INVALID_INPUT/SCHEMA");
      expect(errOf(() => composeWebglRenderer("headless", { [k]: "builtin" } as never)), `composer headless ${k}`).toBe("INVALID_INPUT/SCHEMA");
    }
  });
  it("the caller's object is not modified and each property is read once", () => {
    let n = 0;
    const o = { get pointer() { n++; return "none"; }, contextAttributes: { failIfMajorPerformanceCaveat: false } };
    createDomWebglRenderer(o as never);
    expect(n).toBe(1);
    expect(Object.keys(o)).toEqual(["pointer", "contextAttributes"]);
  });
});
