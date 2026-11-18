// The DOM adapter (13) against a MINIMAL FAKE DOM in Node. This checks the adapter's own logic (mounting, commit, input mapping, errors, disposal);
// it is not a browser test: `npm run smoke:browser` is the (single-engine) smoke run, and no browser qualification is claimed here.
import { describe, expect, it } from "vitest";
import * as domEntry from "../src/dom/index.js";
import { createDomSvgRenderer, type DomSvgRendererOptions } from "../src/dom/index.js";
import { createSvgRenderer, svgManifest } from "../src/index.js";
import { composeSvgRenderer } from "../src/renderer.js";
import type { Intent } from "isongraph-visualize-renderer-core";
import { MIXED20, errOf, errOfAsync, loadModel, o1 } from "./helpers.js";

// ---- a fake DOM just large enough for the adapter -------------------------------------------------------------------------------
class FakeNode {
  nodeType = 1;
  parentNode: FakeNode | null = null;
  children: FakeNode[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, ((e: unknown) => void)[]>();
  style = { cursor: "" };
  textContent = "";
  namespaceURI = "http://www.w3.org/2000/svg";
  rect = { left: 0, top: 0, width: 900, height: 600 };
  constructor(public ownerDocument: FakeDoc, public tag: string) {}
  get childNodes(): FakeNode[] { return this.children; }
  appendChild(n: FakeNode): FakeNode { n.parentNode?.removeChild(n); n.parentNode = this; this.children.push(n); return n; }
  removeChild(n: FakeNode): FakeNode { this.children = this.children.filter((c) => c !== n); n.parentNode = null; return n; }
  insertBefore(n: FakeNode, ref: FakeNode | null): FakeNode { n.parentNode?.removeChild(n); n.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
  replaceChild(n: FakeNode, old: FakeNode): FakeNode { const i = this.children.indexOf(old); this.children[i] = n; n.parentNode = this; old.parentNode = null; return old; }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  contains(n: FakeNode | null): boolean { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  all(): FakeNode[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  closest(sel: string): FakeNode | null {
    const want = sel.split(",").map((s) => s.trim().replace(/^g\./, ""));
    for (let x: FakeNode | null = this; x; x = x.parentNode) if (x.tag === "g" && want.some((w) => (x!.attrs.get("class") ?? "").split(" ").includes(w))) return x;
    return null;
  }
  querySelectorAll(_sel: string): FakeNode[] { return this.all().filter((n) => n.attrs.has("id")); }
  getElementsByTagName(t: string): FakeNode[] { return this.all().filter((n) => n.tag === t); }
  addEventListener(t: string, f: (e: unknown) => void): void { const l = this.listeners.get(t) ?? []; l.push(f); this.listeners.set(t, l); }
  removeEventListener(t: string, f: (e: unknown) => void): void { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((x) => x !== f)); }
  fire(t: string, ev: Record<string, unknown>): void { for (const f of this.listeners.get(t) ?? []) f(ev); }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } { return this.rect; }
  focus(): void { this.ownerDocument.activeElement = this; }
  texts: string[] = [];
}
class FakeDoc {
  activeElement: FakeNode | null = null;
  body = new FakeNode(this, "body");
  malformed = false;
  defaultView = { DOMParser: class { constructor() { /* bound below */ } } as unknown };
  constructor() {
    const doc = this;
    this.defaultView = { DOMParser: class { parseFromString(text: string): { documentElement: FakeNode; getElementsByTagName(t: string): FakeNode[] } { return doc.parse(text); } } };
  }
  createElement(t: string): FakeNode { return new FakeNode(this, t); }
  getElementById(id: string): FakeNode | null { return this.body.all().find((n) => n.attrs.get("id") === id) ?? null; }
  importNode(n: FakeNode): FakeNode { return n; }
  /** Parses the writer's line grammar into a tree (one tag per line). */
  parse(text: string): { documentElement: FakeNode; getElementsByTagName(t: string): FakeNode[] } {
    const root = this.createElement("svg");
    if (this.malformed) { root.namespaceURI = "x"; const err = this.createElement("parsererror"); root.appendChild(err); return { documentElement: root, getElementsByTagName: (t) => (t === "parsererror" ? [err] : []) }; }
    const stack: FakeNode[] = [];
    for (const line of text.split("\n")) {
      if (line === "" || line.startsWith("<?")) continue;
      const close = /^<\/(\w+)>$/.exec(line);
      if (close) { stack.pop(); continue; }
      const m = /^<(\w+)((?: [\w:-]+="[^"]*")*)(\/?)>(.*)$/.exec(line);
      if (!m) continue;
      const n = m[1] === "svg" ? root : this.createElement(m[1]!);
      for (const a of m[2]!.matchAll(/ ([\w:-]+)="([^"]*)"/g)) n.setAttribute(a[1]!, a[2]!);
      if (stack.length > 0 && n !== root) stack[stack.length - 1]!.appendChild(n);
      const inline = m[4]!;
      if (m[3] === "/") continue;
      if (inline.includes("</")) { n.textContent = inline.slice(0, inline.indexOf("</")); continue; }
      if (inline === "" && m[1] !== "defs" && m[1] !== "style") stack.push(n);
      else if (m[1] === "style") stack.push(n);
    }
    return { documentElement: root, getElementsByTagName: () => [] };
  }
}

const env = (host: unknown, extra: Record<string, unknown> = {}) => ({ host, size: { width: 900, height: 600 }, reducedMotion: false, ...extra }) as never;
async function mount(opts?: unknown, extra: Record<string, unknown> = {}) {
  const { model } = await o1();
  const doc = new FakeDoc();
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  const events: string[] = [], errors: unknown[] = [];
  const r = createDomSvgRenderer(opts as never);
  await r.initialize(env(host, { onEvent: (e: { type: string }) => events.push(e.type), onError: (e: unknown) => errors.push(e), ...extra }));
  await r.loadScene(model);
  return { r, host, doc, model, events, errors };
}
const ptr = (target: FakeNode | null, x: number, y: number, extra: Record<string, unknown> = {}) => ({ target, clientX: x, clientY: y, isPrimary: true, button: 0, ...extra });

describe("manifest and mounting (13.1)", () => {
  it("the dom renderer carries the dom manifest and claims no level", async () => {
    const r = createDomSvgRenderer();
    expect(JSON.stringify(r.manifest)).toBe(JSON.stringify(svgManifest("dom")));
    expect(r.manifest.renderer.host).toBe("dom");
  });
  it("env.host must be an Element: a string, the headless token and a plain object are SCHEMA", async () => {
    for (const h of ["headless", {}, null, undefined, 5]) expect(await errOfAsync(() => createDomSvgRenderer().initialize(env(h))), String(h)).toBe("INVALID_INPUT/SCHEMA");
  });
  it("a page that already holds P-title outside the host is INVALID_VALUE", async () => {
    const doc = new FakeDoc();
    const host = doc.createElement("div"), other = doc.createElement("svg");
    other.setAttribute("id", "igr-title");
    doc.body.appendChild(host); doc.body.appendChild(other);
    expect(await errOfAsync(() => createDomSvgRenderer().initialize(env(host)))).toBe("INVALID_INPUT/INVALID_VALUE");
  });
  it("loadScene mounts the document and a status div; the host's own children are restored on dispose", async () => {
    const { model } = await o1();
    const doc = new FakeDoc();
    const host = doc.createElement("div");
    const kept = doc.createElement("p");
    host.appendChild(kept);
    doc.body.appendChild(host);
    const r = createDomSvgRenderer();
    await r.initialize(env(host));
    expect(host.children).toHaveLength(1); // the status div only; the old child is saved
    await r.loadScene(model);
    expect(host.children.map((c) => c.tag)).toEqual(["svg", "div"]);
    expect(host.children[1]!.getAttribute("role")).toBe("status");
    expect(host.children[1]!.getAttribute("aria-live")).toBe("polite");
    expect(host.children[0]!.getAttribute("class")).toBe("igr-svg");
    expect(host.listeners.get("pointerdown")).toHaveLength(1);
    await r.dispose();
    expect(host.children).toEqual([kept]);
    expect(host.listeners.get("pointerdown")).toHaveLength(0);
    expect(host.listeners.get("pointermove")).toHaveLength(0);
    expect(host.style.cursor).toBe("");
  });
  it("there is no focusin handler and no key handler (13.3)", async () => {
    const { host } = await mount();
    expect([...host.listeners.keys()].sort()).toEqual(["pointerdown", "pointermove"]);
  });
});

describe("commit (13.2)", () => {
  it("every dispatch that returns events replaces the document; the status text is the announcements of that call", async () => {
    const { r, host } = await mount();
    const first = host.children[0]!;
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(host.children[0]).not.toBe(first);
    expect(host.children[0]!.all().some((n) => (n.getAttribute("class") ?? "").includes("igr-selected"))).toBe(true);
    expect(host.children[1]!.textContent).toBe("1 selected.");
    r.dispatch({ type: "zoom", factor_milli: 1250 });
    expect(host.children[1]!.textContent).toBe(""); // viewport-changed has no announcement: the previous text is replaced
    r.dispatch({ type: "clear-selection" });
    expect(host.children[1]!.textContent).toBe("0 selected.");
  });
  it("a document the XML parser rejects fails closed: nothing is mounted over the old document and the error is reported (INVALID_INPUT/SCHEMA)", async () => {
    const { r, host, doc, errors } = await mount();
    const before = host.children[0];
    doc.malformed = true;
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect((errors[0] as { code?: string; reason?: string }).code).toBe("INVALID_INPUT");
    expect(host.children[0]).toBe(before);
  });
  it("DOM focus restoration is by id and never becomes a semantic focus intent", async () => {
    const { r, host, doc, events } = await mount();
    const id = host.children[0]!.all().find((n) => n.tag === "g" && n.getAttribute("id")?.startsWith("igr-e-"))!.getAttribute("id")!;
    host.children[0]!.all().find((n) => n.getAttribute("id") === id)!.focus();
    events.length = 0;
    r.dispatch({ type: "pan", dx: 5, dy: 5 });
    expect(doc.activeElement?.getAttribute("id")).toBe(id);
    expect(events.includes("focus-changed")).toBe(false);
    expect(r.getState().focus).toBeUndefined();
  });
});

describe("input mapping (13.3)", () => {
  const nodeG = (host: FakeNode, i: number): FakeNode => host.children[0]!.all().filter((n) => n.tag === "g" && (n.getAttribute("class") ?? "").split(" ").includes("igr-node"))[i]!;
  it("pointerdown on a node element selects it (the id of the target decides)", async () => {
    const { r, host } = await mount();
    const g = nodeG(host, 1);
    const shape = g.children.find((c) => c.tag === "circle")!;
    host.fire("pointerdown", ptr(shape, 400, 400));
    expect(r.getState().selection.nodes).toEqual([{ id: "s:ann", type: "person" }]);
  });
  it("pointerdown on an edge element whose point is within a node's hit radius selects the node (9.3)", async () => {
    const { r, host } = await mount();
    const edge = host.children[0]!.all().find((n) => n.tag === "g" && (n.getAttribute("class") ?? "").split(" ").includes("igr-edge"))!;
    host.fire("pointerdown", ptr(edge.children[0]!, 32, 193.6)); // the centre of i:1
    expect(r.getState().selection.nodes).toEqual([{ id: "i:1", type: "person" }]);
  });
  it("pointerdown on an edge element away from the nodes selects the edge", async () => {
    const { r, host } = await mount();
    const edge = host.children[0]!.all().find((n) => n.tag === "g" && (n.getAttribute("class") ?? "").split(" ").includes("igr-edge"))!;
    host.fire("pointerdown", ptr(edge.children[0]!, 450, 296));
    expect(r.getState().selection.edges).toHaveLength(1);
  });
  it("a press outside every element falls back to hitTest, else clears the selection", async () => {
    const { r, host } = await mount();
    host.fire("pointerdown", ptr(host.children[0]!, 32, 193.5)); // a point on i:1 with the svg as the target
    expect(r.getState().selection.nodes).toEqual([{ id: "i:1", type: "person" }]);
    host.fire("pointerdown", ptr(host.children[0]!, 450, 50));
    expect(r.getState().selection.nodes).toEqual([]);
  });
  it("CSS scaling is undone: the point is scaled by the svg rect", async () => {
    const { r, host } = await mount();
    host.children[0]!.rect = { left: 100, top: 50, width: 450, height: 300 }; // half size
    host.fire("pointerdown", ptr(host.children[0]!, 100 + 16, 50 + 96.75)); // (32, 193.5) in svg units
    expect(r.getState().selection.nodes).toEqual([{ id: "i:1", type: "person" }]);
  });
  it("non-primary pointers, other buttons and a zero-size svg are ignored", async () => {
    const { r, host, events } = await mount();
    events.length = 0;
    host.fire("pointerdown", ptr(host.children[0]!, 32, 193.5, { isPrimary: false }));
    host.fire("pointerdown", ptr(host.children[0]!, 32, 193.5, { button: 2 }));
    host.children[0]!.rect = { left: 0, top: 0, width: 0, height: 600 };
    host.fire("pointerdown", ptr(host.children[0]!, 32, 193.5));
    expect(events).toEqual([]);
    expect(r.getState().selection.nodes).toEqual([]);
  });
  it("handler errors go to onError and the event is dropped", async () => {
    const { host, errors, r } = await mount();
    host.fire("pointerdown", ptr(host.children[0]!, NaN, 5));
    expect(errors).toHaveLength(1);
    expect((errors[0] as { code?: string }).code).toBe("INVALID_INPUT");
    expect(r.getState().selection.nodes).toEqual([]);
  });
  it("pointermove only sets the cursor from the target's element class and makes no model call", async () => {
    const { host } = await mount();
    const g = host.children[0]!.all().find((n) => n.tag === "g" && (n.getAttribute("class") ?? "").split(" ").includes("igr-node"))!;
    host.fire("pointermove", { target: g.children[0] });
    expect(host.style.cursor).toBe("pointer");
    host.fire("pointermove", { target: host.children[0] });
    expect(host.style.cursor).toBe("default");
  });
});

describe("the rest of the Renderer is the core's (12.1)", () => {
  it("svg() returns the document of the committed state; export svg is unsupported; probe has the SVG fidelity", async () => {
    const { r } = await mount();
    expect(r.svg()).toContain("<svg ");
    expect(await errOfAsync(() => r.export("svg"))).toBe("UNSUPPORTED_CAPABILITY/NOT_SUPPORTED");
    expect(r.probe().fidelity.motion).toBe("none");
    expect(r.manifest.capacity).toEqual({ maxDrawnLabelUnits: 262144, maxEdges: 4000, maxNodes: 2000 });
  });
  it("an explicit lowered maxSvgBytes refuses at commit", async () => {
    const { model } = await o1();
    const doc = new FakeDoc();
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    const r = createDomSvgRenderer({ svg: { maxSvgBytes: 100 } });
    await r.initialize(env(host));
    expect(await errOfAsync(() => r.loadScene(model))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
});

describe("audit I-1: the mounted document is the one svg() returns, with the dom defaults bound", () => {
  it("the label budget set only through capacity applies to the mounted document and to svg() alike", async () => {
    const { r, host } = await mount({ capacity: { maxDrawnLabelUnits: 5 } });
    const texts = (r.svg().match(/<text /g) ?? []).length;
    expect(texts).toBe(2); // the labels 1 and ann; the edge label is over the budget of 5
    expect(host.children[0]!.all().filter((n) => n.tag === "text")).toHaveLength(texts);
    expect(r.probe().fidelity.labels).toBe("elided");
  });
  it("mount and svg() agree after every dispatch", async () => {
    const { r, host } = await mount({ svg: { labels: false } });
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(host.children[0]!.all().filter((n) => n.tag === "text")).toHaveLength((r.svg().match(/<text /g) ?? []).length);
  });
});

describe("audit M-2: a failed commit leaves the state consistent and the API honest", () => {
  it("dispatch after the core advanced: the call succeeds, the error goes to onError, the next good commit catches up", async () => {
    const { r, host, doc, errors } = await mount();
    const before = host.children[0];
    doc.malformed = true;
    const events = r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(events).toHaveLength(1);
    expect(r.getState().selection.nodes).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect((errors[0] as { reason?: string }).reason).toBe("SCHEMA");
    expect(host.children[0]).toBe(before); // the old document stays mounted
    doc.malformed = false;
    r.dispatch({ type: "pan", dx: 1, dy: 1 });
    expect(host.children[0]).not.toBe(before);
    expect(host.children[0]!.all().some((n) => (n.getAttribute("class") ?? "").includes("igr-selected"))).toBe(true); // the selection made while stale is shown
  });
  it("loadScene whose commit fails rejects, but the model and state are consistent and a later dispatch recovers", async () => {
    const { model } = await o1();
    const doc = new FakeDoc();
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    const r = createDomSvgRenderer();
    await r.initialize(env(host));
    doc.malformed = true;
    expect(await errOfAsync(() => r.loadScene(model))).toBe("INVALID_INPUT/SCHEMA");
    expect(r.getState().scene_sha256).toBe(model.sceneSha256);
    doc.malformed = false;
    r.dispatch({ type: "pan", dx: 1, dy: 1 });
    expect(host.children.map((c) => c.tag)).toEqual(["svg", "div"]);
  });
  it("two loads in flight both succeed and the last one is mounted", async () => {
    const { model } = await o1();
    const m2 = await loadModel(MIXED20.scene, MIXED20.layout);
    const doc = new FakeDoc();
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    const r = createDomSvgRenderer();
    await r.initialize(env(host));
    const p1 = r.loadScene(model), p2 = r.loadScene(m2);
    await Promise.all([p1, p2]);
    expect(host.children[0]!.all().filter((n) => n.tag === "g" && (n.getAttribute("class") ?? "").split(" ").includes("igr-node"))).toHaveLength(20);
  });
  it("dispose restores the cursor it found, not the empty string", async () => {
    const doc = new FakeDoc();
    const host = doc.createElement("div");
    host.style.cursor = "crosshair";
    doc.body.appendChild(host);
    const r = createDomSvgRenderer();
    await r.initialize(env(host));
    host.style.cursor = "pointer";
    await r.dispose();
    expect(host.style.cursor).toBe("crosshair");
  });
});

// ---- CCR-V11-6 (design 32 18.2): the additive adapter options pointer, liveRegion, focusRestore ------------------------------------
describe("adapter options pointer / liveRegion / focusRestore (CCR-V11-6)", () => {
  const sel: Intent = { type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] };
  const firstG = (host: FakeNode): FakeNode => host.children[0]!.all().find((n) => n.tag === "g" && n.getAttribute("id")?.startsWith("igr-e-"))!;
  const noListeners = (host: FakeNode): boolean => [...host.listeners.values()].every((l) => l.length === 0);

  it("the dom entry exports exactly createDomSvgRenderer (the option type is a type only)", () => {
    expect(Object.keys(domEntry)).toEqual(["createDomSvgRenderer"]);
    const o: DomSvgRendererOptions = { pointer: "none", liveRegion: "none", focusRestore: "none", svg: { labels: false } };
    expect(o.pointer).toBe("none");
  });

  it("the explicit defaults reproduce today's behaviour: status div, both pointer handlers, focus restored by id", async () => {
    const { r, host, doc, events } = await mount({ pointer: "builtin", liveRegion: "builtin", focusRestore: "by-id" });
    expect(host.children.map((c) => c.tag)).toEqual(["svg", "div"]);
    expect(host.children[1]!.getAttribute("role")).toBe("status");
    expect([...host.listeners.keys()].sort()).toEqual(["pointerdown", "pointermove"]);
    r.dispatch(sel);
    expect(host.children[1]!.textContent).toBe("1 selected.");
    const id = firstG(host).getAttribute("id")!;
    firstG(host).focus();
    events.length = 0;
    r.dispatch({ type: "pan", dx: 5, dy: 5 });
    expect(doc.activeElement?.getAttribute("id")).toBe(id);
    expect(doc.activeElement?.parentNode).not.toBeNull(); // the NEW element
  });
  it("the default output is byte-identical with and without the explicit defaults", async () => {
    const a = await mount(), b = await mount({ pointer: "builtin", liveRegion: "builtin", focusRestore: "by-id" });
    expect(b.r.svg()).toBe(a.r.svg());
    expect(JSON.stringify(b.r.manifest)).toBe(JSON.stringify(a.r.manifest));
  });
  it("an own property whose value is undefined is absent (the defaults apply)", async () => {
    const { host } = await mount({ pointer: undefined, liveRegion: undefined, focusRestore: undefined });
    expect(host.children.map((c) => c.tag)).toEqual(["svg", "div"]);
    expect([...host.listeners.keys()].sort()).toEqual(["pointerdown", "pointermove"]);
  });

  it("pointer none: no pointer listener of any kind, no cursor, and a press changes nothing", async () => {
    const { r, host, events } = await mount({ pointer: "none" });
    expect(noListeners(host)).toBe(true);
    expect(host.children.map((c) => c.tag)).toEqual(["svg", "div"]); // the status line is independent
    events.length = 0;
    host.fire("pointerdown", ptr(host.children[0]!, 32, 193.5));
    host.fire("pointermove", { target: firstG(host) });
    expect(events).toEqual([]);
    expect(r.getState().selection.nodes).toEqual([]);
    expect(host.style.cursor).toBe("");
    r.dispatch(sel); // dispatch still works and commits
    expect(r.getState().selection.nodes).toHaveLength(1);
    expect(host.children[1]!.textContent).toBe("1 selected.");
  });
  it("pointer none leaves a host cursor it did not set alone, and dispose restores it", async () => {
    const { model } = await o1();
    const doc = new FakeDoc();
    const host = doc.createElement("div");
    host.style.cursor = "crosshair";
    doc.body.appendChild(host);
    const r = createDomSvgRenderer({ pointer: "none" });
    await r.initialize(env(host));
    await r.loadScene(model);
    expect(host.style.cursor).toBe("crosshair");
    await r.dispose();
    expect(host.style.cursor).toBe("crosshair");
  });

  it("liveRegion none: no status element is created or written, in any state, and the host children are restored on dispose", async () => {
    const { model } = await o1();
    const doc = new FakeDoc();
    const host = doc.createElement("div");
    const kept = doc.createElement("p");
    host.appendChild(kept);
    doc.body.appendChild(host);
    const r = createDomSvgRenderer({ liveRegion: "none" });
    await r.initialize(env(host));
    expect(host.children).toHaveLength(0);
    await r.loadScene(model);
    expect(host.children.map((c) => c.tag)).toEqual(["svg"]);
    r.dispatch(sel);
    r.dispatch({ type: "clear-selection" });
    expect(host.children.map((c) => c.tag)).toEqual(["svg"]);
    expect(host.all().some((n) => n.getAttribute("role") === "status" || n.getAttribute("aria-live") !== null)).toBe(false);
    expect([...host.listeners.keys()].sort()).toEqual(["pointerdown", "pointermove"]); // the pointer handling is independent
    await r.dispose();
    expect(host.children).toEqual([kept]);
  });
  it("liveRegion none: a later load re-mounts the document in place (no status sibling to insert before)", async () => {
    const { r, host, model } = await mount({ liveRegion: "none" });
    await r.loadScene(model);
    expect(host.children.map((c) => c.tag)).toEqual(["svg"]);
  });

  it("focusRestore none: DOM focus is left alone after a commit (no remembered id, no focus() call)", async () => {
    const { r, host, doc, events } = await mount({ focusRestore: "none" });
    const old = firstG(host);
    old.focus();
    expect(doc.activeElement).toBe(old);
    events.length = 0;
    let focusCalls = 0;
    const origFocus = FakeNode.prototype.focus;
    FakeNode.prototype.focus = function (this: FakeNode) { focusCalls++; origFocus.call(this); };
    try { r.dispatch({ type: "pan", dx: 5, dy: 5 }); } finally { FakeNode.prototype.focus = origFocus; }
    expect(focusCalls).toBe(0);
    expect(doc.activeElement).toBe(old); // still the replaced (now detached) element: the adapter did not touch it
    expect(host.contains(old)).toBe(false); // the replaced document is detached
    expect(events.includes("focus-changed")).toBe(false);
    expect(host.children[0]!.all().some((n) => n === doc.activeElement)).toBe(false);
  });
  it("focusRestore none does not read the active element either", async () => {
    const { r, doc } = await mount({ focusRestore: "none" });
    let reads = 0;
    Object.defineProperty(doc, "activeElement", { get() { reads++; return null; }, set() { /* ignored */ }, configurable: true });
    r.dispatch(sel);
    expect(reads).toBe(0);
  });

  it("the three options combine and leave the rest of the options working; the caller's object is not modified", async () => {
    const opts: DomSvgRendererOptions = { pointer: "none", liveRegion: "none", focusRestore: "none", svg: { labels: false } };
    const keys = Object.keys(opts).join();
    const { r, host } = await mount(opts);
    expect(Object.keys(opts).join()).toBe(keys);
    expect(host.children.map((c) => c.tag)).toEqual(["svg"]);
    expect(noListeners(host)).toBe(true);
    expect(host.children[0]!.all().filter((n) => n.tag === "text")).toHaveLength(0); // svg.labels:false still applies
    expect(r.svg()).not.toContain("<text ");
    await r.dispose();
    expect(host.children).toHaveLength(0);
  });
  it("dispose removes whatever was added: no listener, status or mounted document is left, with any combination", async () => {
    for (const o of [undefined, { pointer: "none" }, { liveRegion: "none" }, { focusRestore: "none" }, { pointer: "none", liveRegion: "none", focusRestore: "none" }]) {
      const { r, host } = await mount(o);
      await r.dispose();
      expect(host.children, JSON.stringify(o)).toHaveLength(0);
      expect(noListeners(host), JSON.stringify(o)).toBe(true);
      expect(host.style.cursor).toBe("");
    }
  });

  it("a value outside the set of a known new key is INVALID_INPUT/INVALID_VALUE (any type, any case, the empty string, null)", () => {
    const bads: unknown[] = ["x", "", "NONE", "Builtin", " none", 1, 0, true, false, null, {}, [], ["none"]];
    const good: Record<string, string> = { pointer: "builtin", liveRegion: "builtin", focusRestore: "by-id" };
    for (const k of Object.keys(good)) {
      for (const v of bads) expect(errOf(() => createDomSvgRenderer({ [k]: v } as never)), `${k}=${JSON.stringify(v)}`).toBe("INVALID_INPUT/INVALID_VALUE");
      expect(errOf(() => createDomSvgRenderer({ [k]: good[k] } as never)), k).toBe("none");
    }
    // the value sets are not interchangeable
    expect(errOf(() => createDomSvgRenderer({ pointer: "by-id" } as never))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => createDomSvgRenderer({ focusRestore: "builtin" } as never))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => createDomSvgRenderer({ liveRegion: "by-id" } as never))).toBe("INVALID_INPUT/INVALID_VALUE");
  });
  it("canvasLabel is not an option of the SVG adapter: an unknown key stays SCHEMA", () => {
    expect(errOf(() => createDomSvgRenderer({ canvasLabel: "none" } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("unknown keys stay SCHEMA at the dom wrapper, even beside valid new keys", () => {
    expect(errOf(() => createDomSvgRenderer({ bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createDomSvgRenderer({ pointer: "none", bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => createDomSvgRenderer({ Pointer: "none" } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("non-plain option containers are still the composer's SCHEMA", () => {
    for (const o of [[], "none", 5, null, true, new (class X { pointer = "none"; })()]) expect(errOf(() => createDomSvgRenderer(o as never)), String(o)).toBe("INVALID_INPUT/SCHEMA");
  });
  it("the shared composer and the headless renderer still reject the new keys with SCHEMA", () => {
    for (const k of ["pointer", "liveRegion", "focusRestore", "canvasLabel"]) {
      expect(errOf(() => createSvgRenderer({ [k]: "none" } as never)), `headless ${k}`).toBe("INVALID_INPUT/SCHEMA");
      expect(errOf(() => composeSvgRenderer("dom", { [k]: "none" } as never)), `composer ${k}`).toBe("INVALID_INPUT/SCHEMA");
      expect(errOf(() => composeSvgRenderer("headless", { [k]: "builtin" } as never)), `composer headless ${k}`).toBe("INVALID_INPUT/SCHEMA");
    }
  });
  it("each property is read once (an accessor is called once per key)", () => {
    let n = 0;
    const o = { get pointer() { n++; return "none"; } };
    createDomSvgRenderer(o as never);
    expect(n).toBe(1);
  });
});
