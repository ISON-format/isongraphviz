// A minimal fake DOM and a fake WebGL2 context for the adapter tests (test code; nothing here is imported by src/).
import { createRecordingContext } from "isongraph-visualize-display-list/canvas2d";
import { createDomWebglRenderer } from "../src/dom/index.js";
import { createFakeGl, type FakeGl } from "./fake-gl.js";
import { O1, loadModel } from "./helpers.js";

// ---- a fake DOM just large enough for the adapter ---------------------------------------------------------------------------------------
export interface World { log: string[]; softwareOnly: boolean; vertexPrecision: number; drawingBuffer: { w: number; h: number } | undefined; noLabelContext: boolean; gls: FakeGl[] }
export class FakeNode {
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
  gl: FakeGl | null | undefined;
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
  getContext(type: string, attrs?: { failIfMajorPerformanceCaveat?: boolean }): unknown {
    const w = this.ownerDocument.world;
    if (type === "2d") return w.noLabelContext ? null : this.rec.ctx;
    if (type !== "webgl2") return null;
    if (w.softwareOnly && attrs?.failIfMajorPerformanceCaveat !== false) return null; // a software-only machine refuses the strict request
    if (this.gl === undefined) {
      this.gl = createFakeGl({ log: w.log, vertexPrecision: w.vertexPrecision, drawingBuffer: () => (w.drawingBuffer ? [w.drawingBuffer.w, w.drawingBuffer.h] : [this.width, this.height]) });
      w.gls.push(this.gl);
    }
    return this.gl;
  }
}
export class FakeDoc {
  body = new FakeNode(this, "body");
  defaultView = { devicePixelRatio: 1 };
  world: World = { log: [], softwareOnly: false, vertexPrecision: 23, drawingBuffer: undefined, noLabelContext: false, gls: [] };
  createElement(t: string): FakeNode { return new FakeNode(this, t); }
}


export const env = (host: unknown, extra: Record<string, unknown> = {}) => ({ host, size: { width: 900, height: 600 }, reducedMotion: false, ...extra }) as never;

export async function mountFake(opts?: unknown, tweak?: (d: FakeDoc) => void, extra: Record<string, unknown> = {}, model?: { scene: string; layout: string }) {
  const doc = new FakeDoc();
  tweak?.(doc);
  const host = doc.body;
  const events: unknown[] = [];
  const errors: unknown[] = [];
  const r = createDomWebglRenderer(opts as never);
  await r.initialize(env(host, { onEvent: (e: unknown) => events.push(e), onError: (e: unknown) => errors.push(e), ...extra }));
  const m = await loadModel((model ?? O1).scene, (model ?? O1).layout);
  await r.loadScene(m);
  const wrapper = host.children[0]!;
  const glCanvas = wrapper.children[0]!;
  const gl = doc.world.gls[doc.world.gls.length - 1]!;
  /** A primary press on the GL canvas (the listener's element, 5.3). */
  const press = (x: number, y: number, ev: Record<string, unknown> = {}): void => glCanvas.fire("pointerdown", { isPrimary: true, button: 0, clientX: x, clientY: y, ...ev });
  return { doc, host, r, wrapper, glCanvas, labelCanvas: wrapper.children[1]!, status: host.children[1]!, events, errors, model: m, gl, log: doc.world.log, press };
}
