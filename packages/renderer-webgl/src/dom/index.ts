// src/dom/index.ts - the browser adapter (design 7.9, 8.2), a SEPARATE entry ("./dom"). It composes the core renderer with the "dom" manifest and adds two
// stacked canvases (a WebGL2 one and a 2D one for the labels), the context events through the controller, whole-frame commits, one pointerdown mapping
// through pick() and a live status line. No byte of it is normative; it claims no conformance level and is not claimed accessible (8.3). The core never
// touches the DOM; this is the only place a WebGL context is requested, and only through the structural interfaces of src/gl.ts.
// Security: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, setAttribute("style", ...), setTimeout(string); sizes are
// String(int) + "px" written through the CSSOM; the status line is written with textContent; the only graph-derived attribute is the aria-label. No
// getError, no readPixels, no network, no storage, no timer.
import { IgrError, announcementFor, graphSummary, quantizePx, statusText, summaryText } from "isongraph-visualize-renderer-core";
import type { ElementAddress, ExportFormat, Intent, RenderModel, RenderReport, RendererEnvironment, SemanticEvent, SemanticState } from "isongraph-visualize-renderer-core";
import { backingSize, pickerFromList } from "isongraph-visualize-display-list";
import type { DisplayList, ElementBox } from "isongraph-visualize-display-list";
import { replayCanvas } from "isongraph-visualize-display-list/canvas2d";
import type { Canvas2DLike } from "isongraph-visualize-display-list/canvas2d";
import { createGlController, type GlController, type GlStatus } from "../control.js";
import type { Gl2Like, GlCanvasLike } from "../gl.js";
import type { WebglRendererOptions } from "../options.js";
import { planGl, type GlPlan } from "../plan.js";
import { composeWebglRenderer, type WebglRenderer } from "../renderer.js";

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);

function isElement(v: unknown): v is Element {
  return typeof v === "object" && v !== null && (v as { nodeType?: unknown }).nodeType === 1 && typeof (v as { ownerDocument?: unknown }).ownerDocument === "object" && (v as { ownerDocument?: unknown }).ownerDocument !== null;
}

/** The DOM-only options of the adapter (CCR-V11-6, design 32 18.2); each default reproduces the behaviour of the adapter without the option. */
export type DomWebglRendererOptions = WebglRendererOptions & {
  /** "builtin" (default): the adapter's own pointerdown handler on the canvas; "none": no pointer listener of any kind. */
  pointer?: "builtin" | "none";
  /** "builtin" (default): the adapter's status div (role="status", aria-live="polite"); "none": no status element is created or written. */
  liveRegion?: "builtin" | "none";
  /** "builtin" (default): role="img" and an aria-label of summary plus status on the canvas; "none": aria-hidden="true" and no role or aria-label. */
  canvasLabel?: "builtin" | "none";
};

interface DomOnly { pointer: boolean; liveRegion: boolean; canvasLabel: boolean }
const DOM_KEYS = ["pointer", "liveRegion", "canvasLabel"] as const;
const DOM_VALUES: Record<(typeof DOM_KEYS)[number], readonly [string, string]> = { pointer: ["builtin", "none"], liveRegion: ["builtin", "none"], canvasLabel: ["builtin", "none"] };

/**
 * Reads, validates and REMOVES the DOM-only keys with a closed own-property check; the rest goes to the shared composer unchanged, whose own
 * closed key set still rejects every unknown key (INVALID_INPUT/SCHEMA). A value outside the set of a known key is INVALID_INPUT/INVALID_VALUE.
 * Anything that is not a plain object is left to the composer (SCHEMA). Each property is read once; an own property whose value is undefined is absent.
 */
function splitDomOptions(options: unknown): { rest: unknown; dom: DomOnly } {
  const dom: DomOnly = { pointer: true, liveRegion: true, canvasLabel: true };
  if (typeof options !== "object" || options === null || Array.isArray(options)) return { rest: options, dom };
  const proto: unknown = Object.getPrototypeOf(options);
  if (proto !== Object.prototype && proto !== null) return { rest: options, dom };
  const own = Object.keys(options);
  if (!own.some((k) => (DOM_KEYS as readonly string[]).includes(k))) return { rest: options, dom };
  const rest: Record<string, unknown> = {};
  const given: Partial<Record<(typeof DOM_KEYS)[number], unknown>> = {};
  for (const k of own) {
    const v: unknown = (options as Record<string, unknown>)[k];
    if ((DOM_KEYS as readonly string[]).includes(k)) { if (v !== undefined) given[k as (typeof DOM_KEYS)[number]] = v; }
    else rest[k] = v;
  }
  for (const k of DOM_KEYS) {
    if (!(k in given)) continue;
    const v = given[k];
    if (typeof v !== "string" || !DOM_VALUES[k].includes(v)) throw bad("INVALID_VALUE", `options.${k}`, `one of ${DOM_VALUES[k].join(" | ")} expected`);
    dom[k] = v === DOM_VALUES[k][0];
  }
  return { rest, dom };
}

/** dprMilli = clamp(quantizePx(devicePixelRatio * 1000), 250, 8000): a ratio is environment, not state (6.4). */
function dprMilliOf(ratio: unknown): number {
  const v = typeof ratio === "number" && Number.isFinite(ratio * 1000) ? quantizePx(ratio * 1000) : 1000;
  return Math.min(8000, Math.max(250, v));
}

/** The plan of an empty scene at a viewport: executing it clears the GL canvas, replaying its text source clears the label canvas (the refusal of 3.5, 6.7). */
function blankPlan(width: number, height: number): GlPlan {
  const zero = "0".repeat(64);
  return planGl({ format: "igr-dl/1", width, height, directed: false, artifactSha256: zero, sceneSha256: zero, layoutSha256: zero, nodes: [], edges: [], records: [] });
}

/** The DOM WebGL renderer: WebglRenderer with host "dom"; env.host is the container Element. */
export function createDomWebglRenderer(options?: DomWebglRendererOptions): WebglRenderer {
  const split = splitDomOptions(options);
  const composed = composeWebglRenderer("dom", split.rest as WebglRendererOptions | undefined);
  const builtinPointer = split.dom.pointer, builtinLive = split.dom.liveRegion, builtinLabel = split.dom.canvasLabel;
  const core = composed.renderer;
  const ropts = composed.options;

  let host: Element | undefined;
  let doc: Document | undefined;
  let env: RendererEnvironment | undefined;
  let model: RenderModel | undefined;
  let glCanvas: HTMLCanvasElement | undefined;
  let labelCanvas: HTMLCanvasElement | undefined;
  let wrapper: HTMLElement | undefined;
  let labels: CanvasRenderingContext2D | undefined;
  let controller: GlController | undefined;
  let status: Element | undefined;
  let saved: Node[] = [];
  let failure: string | undefined;
  let phase: GlStatus["phase"] = "created";
  let backing = { e: 1000, bw: 0, bh: 0 };
  let summary = "";
  let stale = false; // the core is ahead of the canvases (a commit failed); the next commit catches up
  let picker: ReturnType<typeof pickerFromList> | undefined; // built lazily for the committed state, dropped by every commit (5.3)
  let pendingLoads = 0;
  let needCommit = false;
  const unbind: (() => void)[] = [];

  const reportError = (e: unknown): void => { try { env?.onError?.(e); } catch { /* a throwing onError is swallowed */ } };
  const failureToken = (e: unknown): string =>
    e instanceof IgrError && e.code === "INVALID_INPUT" && e.reason === "OUT_OF_RANGE" ? "COORD_LIMIT" : e instanceof IgrError && e.code === "RESOURCE_LIMIT" ? "BYTES_LIMIT" : "REPLAY_ERROR";

  /** The accessible name (8.2 (a), (f)): the summary and the status text, with a loss or failure stated first. */
  const relabel = (): void => {
    if (!glCanvas) return;
    const unavailable = controller !== undefined && (controller.status().phase === "lost" || controller.status().phase === "failed");
    if (!builtinLabel) return; // canvasLabel "none": the canvases are aria-hidden and carry no role or label
    glCanvas.setAttribute("aria-label", (unavailable ? "Graph display unavailable. " : "") + summary);
  };

  /** Sizes both canvases from the viewport and the current device pixel ratio (6.4). Assigning width or height clears a canvas. */
  function size(width: number, height: number): void {
    const ratio = (doc!.defaultView as unknown as { devicePixelRatio?: number } | null)?.devicePixelRatio;
    let b: { e: number; bw: number; bh: number };
    try { b = backingSize(width, height, dprMilliOf(ratio)); }
    catch (e) { throw bad("OUT_OF_RANGE", "env.size", `BACKING_SIZE ${e instanceof Error ? e.message : ""}`); }
    for (const c of [glCanvas!, labelCanvas!]) {
      c.style.width = String(width) + "px";
      c.style.height = String(height) + "px";
      if (c.width !== b.bw) c.width = b.bw;
      if (c.height !== b.bh) c.height = b.bh;
    }
    backing = b;
  }

  /** The label layer the controller clears on a loss and redraws after a frame (7.6 (2)): the 2D canvas, drawn by the same replay as V6. */
  const labelLayer = {
    clear(): void {
      if (!labels || !labelCanvas) return;
      const c = labels as unknown as Canvas2DLike;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    },
    draw(plan: GlPlan): void {
      if (!labels) return;
      replayCanvas(plan.textSource, labels as unknown as Canvas2DLike, { layers: [8], dprMilli: backing.e, ink: ropts.ink });
    },
  };

  /** One whole-frame commit: the plan of the committed state drawn and its label runs replayed. On a refusal both canvases are cleared and the failure recorded. */
  function commit(): void {
    if (!host || !doc || !model || !glCanvas || !controller) return;
    picker = undefined;
    const state = core.getState();
    try {
      size(state.viewport.width, state.viewport.height);
      const plan = planGl(core.displayList(), { maxBytes: ropts.maxGlBytes });
      controller.commit(plan);
      failure = undefined;
      summary = `${summaryText(graphSummary(model))} ${statusText(model, state)}`;
      relabel();
    } catch (err) {
      try { controller.commit(blankPlan(state.viewport.width, state.viewport.height)); labelLayer.clear(); } catch { /* a context that throws cannot be cleared either */ }
      failure = failureToken(err);
      throw err;
    }
  }

  /** Commit for dispatch: the core has already advanced, so a failure is reported through onError (the call stays successful) and the next commit catches up. */
  function commitSafe(): void {
    try { commit(); stale = false; } catch (e) { stale = true; reportError(e); }
  }

  function onPointerDown(ev: Event): void {
    try {
      const e = ev as PointerEvent;
      if (!host || !model || !glCanvas) return;
      if (e.isPrimary === false || e.button !== 0) return;
      const rect = glCanvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // ignored
      const state = core.getState();
      const p = { x: ((e.clientX - rect.left) * state.viewport.width) / rect.width, y: ((e.clientY - rect.top) * state.viewport.height) / rect.height };
      picker ??= pickerFromList(model, state, core.displayList()); // the renderer's own list (audit I-1)
      const a = picker.pick(p);
      adapter.dispatch(a ? { type: "select", mode: "replace", targets: [a] } : { type: "clear-selection" });
    } catch (err) { reportError(err); }
  }

  const adapter: WebglRenderer = {
    manifest: core.manifest,
    async initialize(e: RendererEnvironment): Promise<void> {
      const h: unknown = e && typeof e === "object" ? (e as { host?: unknown }).host : undefined;
      if (!isElement(h)) throw bad("SCHEMA", "env.host", "the dom renderer needs an Element as host");
      const d = h.ownerDocument;
      const size0 = (e as { size?: { width?: unknown; height?: unknown } }).size;
      let b: { e: number; bw: number; bh: number };
      try { b = backingSize(size0?.width as number, size0?.height as number, dprMilliOf((d.defaultView as unknown as { devicePixelRatio?: number } | null)?.devicePixelRatio)); }
      catch (err) { throw bad("OUT_OF_RANGE", "env.size", `BACKING_SIZE ${err instanceof Error ? err.message : ""}`); }
      const gc = d.createElement("canvas"), lc = d.createElement("canvas");
      const lctx = lc.getContext("2d");
      if (lctx === null) { failure = "NO_2D_LAYER"; throw bad("INVALID_VALUE", "env.host", "NO_2D_LAYER getContext(\"2d\") returned null"); }
      glCanvas = gc; labelCanvas = lc; labels = lctx; backing = b;
      const ctl = createGlController(gc as unknown as GlCanvasLike, {
        contextAttributes: { failIfMajorPerformanceCaveat: ropts.failIfMajorPerformanceCaveat },
        // probe on DETACHED scratch canvases, never the live one (7.7); the backing size is what the adapter plans
        probe: { factory: () => d.createElement("canvas") as unknown as GlCanvasLike, need: { widthPx: b.bw, heightPx: b.bh } },
        verify: (gl: Gl2Like) => {
          gc.width = b.bw; gc.height = b.bh;
          return gl.drawingBufferWidth === b.bw && gl.drawingBufferHeight === b.bh ? undefined : "TOO_SMALL";
        },
        labels: labelLayer,
        frameSize: () => ({ widthPx: backing.bw, heightPx: backing.bh }),
        ink: ropts.ink,
        onStatus: (s: GlStatus) => { phase = s.phase; relabel(); },
        onError: (err: unknown) => reportError(err),
      });
      controller = ctl;
      try { ctl.initialize(); }
      catch (err) {
        failure = ctl.status().failure ?? failureToken(err);
        try { ctl.dispose(); } catch { /* nothing more to release */ }
        controller = undefined; glCanvas = undefined; labelCanvas = undefined; labels = undefined;
        throw err;
      }
      try { await core.initialize(e); }
      catch (err) {
        try { ctl.dispose(); } catch { /* nothing more to release */ }
        controller = undefined; glCanvas = undefined; labelCanvas = undefined; labels = undefined; failure = undefined;
        throw err;
      }
      host = h; doc = d; env = e;
      size(e.size.width, e.size.height);
      saved = Array.from(h.childNodes);
      for (const n of saved) h.removeChild(n);
      wrapper = d.createElement("div");
      wrapper.style.position = "relative";
      wrapper.style.display = "inline-block";
      lc.style.position = "absolute";
      lc.style.left = "0";
      lc.style.top = "0";
      lc.style.pointerEvents = "none";
      if (builtinLabel) gc.setAttribute("role", "img");
      for (const c of builtinLabel ? [lc] : [lc, gc]) c.setAttribute("aria-hidden", "true"); // canvasLabel "none": the companion is the accessible surface
      wrapper.appendChild(gc);
      wrapper.appendChild(lc);
      h.appendChild(wrapper);
      if (builtinLive) {
        status = d.createElement("div");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        h.appendChild(status);
      }
      if (builtinPointer) {
        gc.addEventListener("pointerdown", onPointerDown); // the GL canvas's, not the host's: a press elsewhere in the host is not a press on the graph (audit M-2)
        unbind.push(() => gc.removeEventListener("pointerdown", onPointerDown));
      }
      failure = undefined;
    },
    async loadScene(m: RenderModel, initial?: SemanticState): Promise<void> {
      pendingLoads++;
      try { await core.loadScene(m, initial); }
      catch (e) { pendingLoads--; if (pendingLoads === 0 && needCommit) { needCommit = false; commitSafe(); } throw e; }
      pendingLoads--;
      model = m;
      if (pendingLoads > 0) { needCommit = true; return; } // a later load is still in flight (the core is BUSY): the last one to settle paints
      needCommit = false;
      try { commit(); stale = false; } catch (e) { stale = true; reportError(e); throw e; } // the load itself succeeded; the state is consistent and a later dispatch retries
    },
    applySceneDelta: (delta: unknown) => core.applySceneDelta(delta),
    dispatch(intent: Intent): readonly SemanticEvent[] {
      const events = core.dispatch(intent);
      if (model && (events.length > 0 || stale)) {
        commitSafe();
        const texts: string[] = [];
        const state = core.getState();
        for (const ev of events) { const t = announcementFor(ev, model, state); if (t !== undefined) texts.push(t); }
        if (status) status.textContent = texts.join(" ");
      }
      return events;
    },
    getState: () => core.getState(),
    hitTest: (point: { x: number; y: number }): ElementAddress | undefined => core.hitTest(point),
    setReducedMotion: (reduced: boolean) => core.setReducedMotion(reduced),
    async render(): Promise<void> {
      controller?.render(); // resolves in every phase; a lost or failed context draws nothing; a failing frame rejects (audit M-8)
      return core.render();
    },
    probe: (): RenderReport => core.probe(),
    export: (format: ExportFormat) => core.export(format),
    async dispose(): Promise<void> {
      try { await core.dispose(); }
      finally {
        try { controller?.dispose(); } catch { /* the context is released as far as it can be */ }
        for (const u of unbind.splice(0)) u();
        if (host) {
          if (wrapper && wrapper.parentNode === host) host.removeChild(wrapper);
          if (status && status.parentNode === host) host.removeChild(status);
          for (const n of saved) host.appendChild(n);
        }
        glCanvas = undefined; labelCanvas = undefined; labels = undefined; wrapper = undefined; controller = undefined; status = undefined; host = undefined; model = undefined;
        picker = undefined; stale = false; failure = undefined; phase = "disposed";
      }
    },
    displayList: (): DisplayList => core.displayList(),
    plan: () => core.plan(),
    planBytes: () => core.planBytes(),
    textCalls: () => core.textCalls(),
    pick: (point: { x: number; y: number }): ElementAddress | undefined => core.pick(point),
    elementBounds: (): ElementBox[] => core.elementBounds(),
    status(): GlStatus {
      const s = controller?.status();
      const f = failure ?? s?.failure;
      return { phase: s?.phase ?? phase, contextLost: s?.contextLost ?? false, ...(f === undefined ? {} : { failure: f }), attributes: { failIfMajorPerformanceCaveat: ropts.failIfMajorPerformanceCaveat } };
    },
  };
  return adapter;
}
