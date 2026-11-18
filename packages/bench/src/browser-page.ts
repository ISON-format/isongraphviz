// src/browser-page.ts - the page script of the optional browser mode (bundled by esbuild into an IIFE; it runs in Chromium, not in Node). It measures the real DOM
// insertion of the SVG document, the Canvas 2D replay of the display list and the WebGL2 draw of the plan, for artifacts the Node pass wrote.
// It reads no clock for anything but durations and decides nothing about pass or fail.
import { parseDisplayList } from "isongraph-visualize-display-list";
import { replayCanvas } from "isongraph-visualize-display-list/canvas2d";
import { contextAttributes, createGlResources, executePlan, parseGlPlan } from "isongraph-visualize-renderer-webgl";

const now = (): number => performance.now();
const raf = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));
const bytesOf = async (url: string): Promise<Uint8Array> => new Uint8Array(await (await fetch(url)).arrayBuffer());
const hostOf = (w: number, h: number): HTMLElement => {
  const host = document.getElementById("host")!;
  host.replaceChildren();
  host.style.cssText = `width:${w}px;height:${h}px;overflow:hidden;position:relative;background:#fff`;
  return host;
};

interface Series { [name: string]: number[] }
const push = (s: Series, k: string, v: number): void => { (s[k] ??= []).push(v); };

const api = {
  env(): Record<string, unknown> {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return { webgl2: false, userAgent: navigator.userAgent };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
    return { webgl2: true, userAgent: navigator.userAgent, renderer, vendor, version: String(gl.getParameter(gl.VERSION)), debugExtension: ext !== null, dpr: window.devicePixelRatio };
  },
  async svg(url: string, w: number, h: number, warmup: number, reps: number): Promise<Series & { elements: number[] }> {
    const text = await (await fetch(url)).text();
    const out: Series = {};
    let elements = 0;
    for (let i = 0; i < warmup + reps; i++) {
      const host = hostOf(w, h);
      void host.offsetHeight;
      await raf();
      const t0 = now();
      host.innerHTML = text;
      void host.getBoundingClientRect();
      const t1 = now();
      await raf();
      await raf();
      const t2 = now();
      if (i === 0) elements = host.querySelectorAll("*").length;
      if (i >= warmup) { push(out, "insertMs", t1 - t0); push(out, "toFrameMs", t2 - t0); }
    }
    return { ...out, elements: [elements] };
  },
  async canvas(url: string, w: number, h: number, warmup: number, reps: number): Promise<Series> {
    const list = parseDisplayList(await bytesOf(url));
    const host = hostOf(w, h);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    host.append(c);
    const ctx = c.getContext("2d")!;
    const out: Series = {};
    for (let i = 0; i < warmup + reps; i++) {
      await raf();
      const t0 = now();
      replayCanvas(list, ctx as never, { dprMilli: 1000 });
      const t1 = now();
      ctx.getImageData(0, 0, 1, 1);
      const t2 = now();
      await raf();
      const t3 = now();
      if (i >= warmup) { push(out, "replayMs", t1 - t0); push(out, "syncMs", t2 - t0); push(out, "toFrameMs", t3 - t0); }
    }
    return out;
  },
  async webgl(url: string, w: number, h: number, warmup: number, reps: number): Promise<Series & { contextLost: number[] }> {
    const plan = parseGlPlan(await bytesOf(url));
    const host = hostOf(w, h);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    host.append(c);
    const gl = c.getContext("webgl2", contextAttributes(false) as WebGLContextAttributes);
    if (!gl) throw new Error("no webgl2 context");
    const labels = document.createElement("canvas");
    labels.width = w; labels.height = h;
    const lctx = labels.getContext("2d")!;
    const res = createGlResources(gl as never);
    const px = new Uint8Array(4);
    const out: Series = {};
    for (let i = 0; i < warmup + reps; i++) {
      await raf();
      const t0 = now();
      executePlan(gl as never, plan, res, { widthPx: w, heightPx: h, ink: [34, 34, 34] });
      const t1 = now();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t2 = now();
      replayCanvas(plan.textSource, lctx as never, { dprMilli: 1000, layers: [8] });
      const t3 = now();
      await raf();
      const t4 = now();
      if (i >= warmup) { push(out, "issueMs", t1 - t0); push(out, "syncMs", t2 - t0); push(out, "labelsMs", t3 - t2); push(out, "toFrameMs", t4 - t0); }
    }
    return { ...out, contextLost: [gl.isContextLost() ? 1 : 0] };
  },
};
(window as unknown as { __bench: typeof api }).__bench = api;
