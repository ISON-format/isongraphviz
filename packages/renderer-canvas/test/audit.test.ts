// The findings of the independent audit of step 1 (reviews/31-code-audit-step1.md) that live in renderer-canvas, each a failing test first: M-3 (the picker uses
// the renderer's own list), M-4 (renderer options are read once, accessors refused), M-6 (the pointer listener is the canvas's), M-7 (devicePixelRatio is
// quantized with quantizePx). The rows ext:M3 and ext:B10 are in test/oracle/runner.ts (runExtra) and run in the mutation harness too.
import { describe, expect, it } from "vitest";
import { createRecordingContext } from "isongraph-visualize-display-list/canvas2d";
import { canvasManifest, createCanvasRenderer } from "../src/index.js";
import { createDomCanvasRenderer } from "../src/dom/index.js";
import { O1, errOf, loadModel } from "./helpers.js";

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
  getContext(type: string): unknown { return type === "2d" ? this.rec.ctx : null; }
}
class FakeDoc {
  body = new FakeNode(this, "body");
  defaultView = { devicePixelRatio: 1 };
  createElement(t: string): FakeNode { return new FakeNode(this, t); }
}
const env = (host: unknown, extra: Record<string, unknown> = {}) => ({ host, size: { width: 900, height: 600 }, reducedMotion: false, ...extra }) as never;

describe("M-6: the pointer listener is the canvas's, not the host's", () => {
  it("a press on the host outside the canvas (its padding, the status line) changes nothing; a press on the canvas selects", async () => {
    const doc = new FakeDoc();
    const r = createDomCanvasRenderer();
    await r.initialize(env(doc.body));
    await r.loadScene(await loadModel(O1.scene, O1.layout));
    const canvas = doc.body.children[0]!;
    r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    doc.body.fire("pointerdown", { isPrimary: true, button: 0, clientX: -5000, clientY: -5000 });
    doc.body.children[1]!.fire("pointerdown", { isPrimary: true, button: 0, clientX: -5000, clientY: -5000 });
    expect(r.getState().selection.nodes).toEqual([{ id: "i:1", type: "person" }]);
    canvas.fire("pointerdown", { isPrimary: true, button: 0, clientX: 450, clientY: 40 });
    expect(r.getState().selection.nodes).toEqual([]);
    expect([...doc.body.listeners.values()].every((l) => l.length === 0)).toBe(true);
    expect([...canvas.listeners.entries()].filter(([, v]) => v.length > 0).map(([k]) => k)).toEqual(["pointerdown"]);
    await r.dispose();
    expect(canvas.listeners.get("pointerdown")).toEqual([]);
  });
});

describe("M-7: devicePixelRatio is quantized with quantizePx (design 6.4) and clamped to 250..8000", () => {
  for (const [ratio, bw] of [[1.0004, 900], [1.0006, 901], [1.5, 1350], [1.2345, 1112], [0.1, 225], [100, 7200]] as const) {
    it(`ratio ${ratio}`, async () => {
      const doc = new FakeDoc();
      doc.defaultView.devicePixelRatio = ratio;
      const r = createDomCanvasRenderer();
      await r.initialize(env(doc.body));
      expect(doc.body.children[0]!.width).toBe(bw);
    });
  }
  it("a ratio that is not a number is 1", async () => {
    const doc = new FakeDoc();
    (doc.defaultView as { devicePixelRatio: unknown }).devicePixelRatio = "2";
    const r = createDomCanvasRenderer();
    await r.initialize(env(doc.body));
    expect(doc.body.children[0]!.width).toBe(900);
  });
});

describe("M-4: renderer options are read once; an accessor is refused (27 14)", () => {
  const code = (o: unknown): string => errOf(() => canvasManifest("headless", o as never));
  it("a getter on the options, on capacity or on dl is SCHEMA", () => {
    expect(code({ get name() { return "x"; } })).toBe("INVALID_INPUT/SCHEMA");
    expect(code({ capacity: { get maxNodes() { return 7; } } })).toBe("INVALID_INPUT/SCHEMA");
    expect(code({ dl: { get maxDrawnLabelUnits() { return 5; } } })).toBe("INVALID_INPUT/SCHEMA");
    expect(code({ capacity: JSON.parse('{"__proto__": 1}') })).toBe("INVALID_INPUT/SCHEMA");
  });
  it("plain data options give the manifest of the data", () => {
    expect(canvasManifest("headless", { dl: { maxDrawnLabelUnits: 5 }, capacity: { maxNodes: 7 } }).capacity).toEqual({ maxNodes: 7, maxEdges: 40000, maxDrawnLabelUnits: 5 });
  });
});

describe("M-3 (DOM): the pointer step picks from the renderer's own list", () => {
  it("a labels:false dom renderer picks on a state whose default-option label would be beyond 2^40 (no error)", async () => {
    const doc = new FakeDoc();
    const errors: unknown[] = [];
    const r = createDomCanvasRenderer({ dl: { labels: false } });
    await r.initialize(env(doc.body, { onError: (e: unknown) => errors.push(e) }));
    const far = await loadModel("../oracles-dl/scenes/far-u.scene.json", "../oracles-dl/layouts/far-u.layout.json");
    const base = (r as unknown as { getState(): never }).getState;
    void base;
    await r.loadScene(far, { hidden: { nodes: [], edges: [] }, igr: "IGR/1", layout_sha256: far.layoutSha256, scene_sha256: far.sceneSha256, selection: { nodes: [], edges: [] }, viewport: { center_x: 450000, center_y: 300000 + 1000 - 2 ** 40, width: 900, height: 600, zoom: 1000 } });
    doc.body.children[0]!.fire("pointerdown", { isPrimary: true, button: 0, clientX: 10, clientY: 10 });
    expect(errors).toEqual([]);
    const plain = createCanvasRenderer();
    await plain.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
    await expect(plain.loadScene(far, r.getState())).resolves.toBeUndefined();
    expect(() => plain.displayList()).toThrow(/OUT_OF_RANGE/);
  });
});
