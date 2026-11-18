// The DOM adapter (design 6.7, 8.2) against a MINIMAL FAKE DOM in Node. This checks the adapter's own logic (mounting, commit, input mapping, refusals,
// disposal); it is not a browser test: `npm run smoke:browser` is the single-engine smoke run, and no browser qualification is claimed here.
import { describe, expect, it } from "vitest";
import { createRecordingContext } from "isongraph-visualize-display-list/canvas2d";
import { createDomCanvasRenderer } from "../src/dom/index.js";
import { canvasManifest, createCanvasRenderer } from "../src/index.js";
import { LOOPS2, O1, O4, errOfAsync, loadModel, o1, readState } from "./helpers.js";

// ---- a fake DOM just large enough for the adapter -------------------------------------------------------------------------------------
class FakeNode {
  nodeType = 1;
  parentNode: FakeNode | null = null;
  children: FakeNode[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, ((e: unknown) => void)[]>();
  style: Record<string, string> = {};
  textContent = "";
  width = 300;
  height = 150;
  rect = { left: 0, top: 0, width: 900, height: 600 };
  rec = createRecordingContext();
  noContext = false;
  constructor(public ownerDocument: FakeDoc, public tag: string) {}
  get childNodes(): FakeNode[] { return this.children; }
  appendChild(n: FakeNode): FakeNode { n.parentNode?.removeChild(n); n.parentNode = this; this.children.push(n); return n; }
  removeChild(n: FakeNode): FakeNode { this.children = this.children.filter((c) => c !== n); n.parentNode = null; return n; }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  addEventListener(t: string, f: (e: unknown) => void): void { const l = this.listeners.get(t) ?? []; l.push(f); this.listeners.set(t, l); }
  removeEventListener(t: string, f: (e: unknown) => void): void { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((x) => x !== f)); }
  fire(t: string, ev: Record<string, unknown>): void { for (const f of this.listeners.get(t) ?? []) f(ev); }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } { return this.rect; }
  getContext(type: string): unknown { return type === "2d" && !this.noContext ? this.rec.ctx : null; }
}
class FakeDoc {
  body = new FakeNode(this, "body");
  defaultView = { devicePixelRatio: 1 };
  createElement(t: string): FakeNode { return new FakeNode(this, t); }
}

const env = (host: unknown, extra: Record<string, unknown> = {}) => ({ host, size: { width: 900, height: 600 }, reducedMotion: false, ...extra }) as never;
const text = (b: Uint8Array): string => new TextDecoder().decode(b);
const withoutMarkers = (s: string): string => s.split("\n").filter((l) => !l.startsWith('["#"')).join("\n");

async function mount(opts?: unknown, extra: Record<string, unknown> = {}, model?: { scene: string; layout: string }) {
  const doc = new FakeDoc();
  const host = doc.body;
  const events: unknown[] = [];
  const errors: unknown[] = [];
  const r = createDomCanvasRenderer(opts as never);
  await r.initialize(env(host, { onEvent: (e: unknown) => events.push(e), onError: (e: unknown) => errors.push(e), ...extra }));
  const m = await loadModel((model ?? O1).scene, (model ?? O1).layout);
  await r.loadScene(m);
  const canvas = host.children[0]!;
  return { doc, host, r, canvas, status: host.children[1]!, events, errors, model: m };
}
const press = (host: FakeNode, x: number, y: number, extra: Record<string, unknown> = {}): void => host.children[0]!.fire("pointerdown", { isPrimary: true, button: 0, clientX: x, clientY: y, ...extra });

describe("initialize", () => {
  it("requires an Element host; a headless host string is refused", async () => {
    const r = createDomCanvasRenderer();
    expect(await errOfAsync(() => r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(await errOfAsync(() => r.initialize({ host: {}, size: { width: 900, height: 600 }, reducedMotion: false } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("mounts one canvas (role img) and a polite status line, and sizes the canvas through the CSSOM", async () => {
    const { host, canvas, status } = await mount();
    expect(host.children.map((c) => c.tag)).toEqual(["canvas", "div"]);
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.style["width"]).toBe("900px");
    expect(canvas.style["height"]).toBe("600px");
    expect([canvas.width, canvas.height]).toEqual([900, 600]);
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(canvas.getAttribute("tabindex")).toBeNull();
  });
  it("aria-label is the summary and the status text", async () => {
    const { canvas } = await mount();
    expect(canvas.getAttribute("aria-label")).toBe("Directed graph with 2 nodes and 1 edge. Node categories: person (2). 0 selected, 0 hidden.");
  });
  it("uses the dom manifest", async () => {
    const r = createDomCanvasRenderer();
    expect(r.manifest).toEqual(canvasManifest("dom"));
    expect(r.manifest.renderer.host).toBe("dom");
  });
  it("getContext('2d') returning null fails closed: INVALID_INPUT/INVALID_VALUE with a NO_2D_CONTEXT detail, the host untouched", async () => {
    const doc = new FakeDoc();
    const host = doc.body;
    const keep = doc.createElement("p");
    host.appendChild(keep);
    const orig = doc.createElement.bind(doc);
    doc.createElement = (t: string) => { const n = orig(t); if (t === "canvas") n.noContext = true; return n; };
    const r = createDomCanvasRenderer();
    let err: unknown;
    try { await r.initialize(env(host)); } catch (e) { err = e; }
    expect((err as { code: string; reason: string; detail: string }).code).toBe("INVALID_INPUT");
    expect((err as { reason: string }).reason).toBe("INVALID_VALUE");
    expect((err as { detail: string }).detail.startsWith("NO_2D_CONTEXT")).toBe(true);
    expect(host.children).toEqual([keep]);
    expect(await errOfAsync(() => r.loadScene(null as never))).toBe("INVALID_LIFECYCLE/NOT_INITIALIZED");
  });
  it("an unusable size fails with a BACKING_SIZE detail", async () => {
    const doc = new FakeDoc();
    const r = createDomCanvasRenderer();
    expect(await errOfAsync(() => r.initialize({ host: doc.body, size: { width: 20000, height: 600 }, reducedMotion: false } as never))).toMatch(/^INVALID_INPUT\//);
  });
});

describe("commit", () => {
  it("replays the whole frame: the 2D calls equal the stream of the renderer (the markers aside)", async () => {
    const { canvas, r } = await mount();
    const calls = text(canvas.rec.bytes());
    expect(calls).toBe(withoutMarkers(text(r.canvasCalls())));
    expect(calls.startsWith('["m","setTransform",1000,0,0,1000,0,0]\n["m","clearRect",0,0,900000,600000]\n')).toBe(true);
  });
  it("a dispatch that returns events repaints; one that changes nothing does not", async () => {
    const { canvas, r } = await mount();
    const before = canvas.rec.bytes().length;
    r.dispatch({ type: "clear-selection" }); // nothing selected: no event
    expect(canvas.rec.bytes().length).toBe(before);
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(canvas.rec.bytes().length).toBeGreaterThan(before);
    expect(text(canvas.rec.bytes())).toContain('["m","arc",32072,193600,14000,0,"TAU"]');
  });
  it("devicePixelRatio 1.5: the backing store is 1350 x 900 and the transform 1500", async () => {
    const doc = new FakeDoc();
    doc.defaultView.devicePixelRatio = 1.5;
    const r = createDomCanvasRenderer();
    await r.initialize(env(doc.body));
    await r.loadScene(await loadModel(O1.scene, O1.layout));
    const canvas = doc.body.children[0]!;
    expect([canvas.width, canvas.height, canvas.style["width"], canvas.style["height"]]).toEqual([1350, 900, "900px", "600px"]);
    expect(text(canvas.rec.bytes())).toContain('["m","setTransform",1500,0,0,1500,0,0]');
  });
  it("resize changes the canvas size and repaints", async () => {
    const { canvas, r } = await mount();
    r.dispatch({ type: "resize", width: 400, height: 300 });
    expect([canvas.width, canvas.height, canvas.style["width"], canvas.style["height"]]).toEqual([400, 300, "400px", "300px"]);
  });
  it("the announcements of the last dispatch are written to the status line with textContent", async () => {
    const { r, status } = await mount();
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(status.textContent.length).toBeGreaterThan(0);
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
  it("converts a press by the canvas rectangle (CSS pixels scaled to the viewport)", async () => {
    const { host, canvas, r } = await mount();
    canvas.rect = { left: 100, top: 50, width: 450, height: 300 }; // the canvas is shown at half size, offset
    press(host, 100 + 32.072 / 2, 50 + 193.6 / 2);
    expect(r.getState().selection.nodes).toEqual([{ id: "i:1", type: "person" }]);
  });
  it("ignores a non-primary pointer, a non-zero button and an empty rectangle", async () => {
    const { host, canvas, r } = await mount();
    press(host, 32.072, 193.6, { isPrimary: false });
    press(host, 32.072, 193.6, { button: 2 });
    canvas.rect = { left: 0, top: 0, width: 0, height: 0 };
    press(host, 32.072, 193.6);
    expect(r.getState().selection.nodes).toEqual([]);
  });
  it("registers a pointerdown handler and nothing else (no move, wheel, key, focus or hover handler)", async () => {
    const { host } = await mount();
    expect([...host.children[0]!.listeners.entries()].filter(([, v]) => v.length > 0).map(([k]) => k)).toEqual(["pointerdown"]);
  });
});

describe("refusals (3.5): the canvas never shows a stale scene", () => {
  it("a state beyond 2^40 m-px: the load rejects, the canvas is cleared, status().failure is COORD_LIMIT, onError is called", async () => {
    const doc = new FakeDoc();
    const errors: unknown[] = [];
    const r = createDomCanvasRenderer();
    await r.initialize(env(doc.body, { onError: (e: unknown) => errors.push(e) }));
    const m = await loadModel("scenes/far-u.scene.json".replace(/^/, "../oracles-dl/"), "layouts/far-u.layout.json".replace(/^/, "../oracles-dl/"));
    await expect(r.loadScene(m, readState("states/N14.state.json"))).rejects.toMatchObject({ code: "INVALID_INPUT", reason: "OUT_OF_RANGE" });
    expect(r.status().failure).toBe("COORD_LIMIT");
    expect(errors.length).toBeGreaterThan(0);
    const canvas = doc.body.children[0]!;
    expect(text(canvas.rec.bytes()).trimEnd().split("\n").slice(-2)).toEqual(['["m","setTransform",1000,0,0,1000,0,0]', '["m","clearRect",0,0,900000,600000]']);
    expect(r.getState().viewport.center_x).toBe(-1099511177777); // model and state stay consistent
  });
  it("a dispatch that crosses the limit is reported, the canvas cleared; the next good commit clears the failure", async () => {
    const doc = new FakeDoc();
    const errors: unknown[] = [];
    const r = createDomCanvasRenderer();
    await r.initialize(env(doc.body, { onError: (e: unknown) => errors.push(e) }));
    const m = await loadModel("../oracles-dl/scenes/far-u.scene.json", "../oracles-dl/layouts/far-u.layout.json");
    await r.loadScene(m, readState("states/N13.state.json"));
    expect(r.status().failure).toBeUndefined();
    r.dispatch({ type: "set-viewport", center_x: -1099511177777, center_y: 0, zoom: 1000 });
    expect(r.status().failure).toBe("COORD_LIMIT");
    expect(errors.length).toBe(1);
    r.dispatch({ type: "set-viewport", center_x: -1099511177776, center_y: 0, zoom: 1000 });
    expect(r.status().failure).toBeUndefined();
  });
  it("renderer.pick after a COORD_LIMIT refusal throws the same error; probe() stays correct", async () => {
    const doc = new FakeDoc();
    const r = createDomCanvasRenderer();
    await r.initialize(env(doc.body, { onError: () => undefined }));
    const m = await loadModel("../oracles-dl/scenes/far-u.scene.json", "../oracles-dl/layouts/far-u.layout.json");
    await expect(r.loadScene(m, readState("states/N14.state.json"))).rejects.toBeTruthy();
    expect(() => r.pick({ x: 10, y: 10 })).toThrow(/OUT_OF_RANGE/);
    expect(r.probe().drawn.nodes.length).toBe(1);
  });
});

describe("dispose", () => {
  it("restores the host's children, removes the listener and the canvas", async () => {
    const doc = new FakeDoc();
    const keep = doc.createElement("p");
    doc.body.appendChild(keep);
    const r = createDomCanvasRenderer();
    await r.initialize(env(doc.body));
    await r.loadScene(await loadModel(O4.scene, O4.layout));
    expect(doc.body.children.map((c) => c.tag)).toEqual(["canvas", "div"]);
    const canvas = doc.body.children[0]!;
    await r.dispose();
    expect(doc.body.children).toEqual([keep]);
    expect(canvas.listeners.get("pointerdown")).toEqual([]);
    expect(r.status().phase).toBe("disposed");
  });
});

describe("the dom adapter equals the headless renderer on everything but mounting", () => {
  it("the list and the stream are those of createCanvasRenderer with the same options", async () => {
    const { r } = await mount();
    const { model, state } = await o1();
    const h = createCanvasRenderer({ capacity: { maxDrawnLabelUnits: 262144 } });
    await h.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
    await h.loadScene(model, state);
    expect(text(r.displayListBytes())).toBe(text(h.displayListBytes()));
    expect(text(r.canvasCalls())).toBe(text(h.canvasCalls()));
  });
});
