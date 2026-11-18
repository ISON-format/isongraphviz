// src/dom/index.ts - the browser adapter (design 6.7, 8.2), a SEPARATE entry ("./dom"). It composes the core renderer with the "dom" manifest and adds
// mounting one <canvas>, whole-frame replays, one pointerdown mapping through pick() and a live status line. No byte of it is normative; it claims no
// conformance level and is not claimed accessible (8.3). The core never touches the DOM.
// Security: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, setAttribute("style", ...), setTimeout(string); sizes are
// String(int) + "px" written through the CSSOM; the status line is written with textContent; the only graph-derived attribute is the aria-label.
import { IgrError, announcementFor, graphSummary, quantizePx, statusText, summaryText } from "isongraph-visualize-renderer-core";
import type { ElementAddress, ExportFormat, Intent, RenderModel, RenderReport, RendererEnvironment, SemanticEvent, SemanticState } from "isongraph-visualize-renderer-core";
import { backingSize, pickerFromList } from "isongraph-visualize-display-list";
import type { DisplayList, ElementBox } from "isongraph-visualize-display-list";
import { replayCanvas } from "isongraph-visualize-display-list/canvas2d";
import type { Canvas2DLike } from "isongraph-visualize-display-list/canvas2d";
import { composeCanvasRenderer, type CanvasRenderer, type CanvasStatus } from "../renderer.js";
import type { CanvasRendererOptions } from "../options.js";

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);

function isElement(v: unknown): v is Element {
  return typeof v === "object" && v !== null && (v as { nodeType?: unknown }).nodeType === 1 && typeof (v as { ownerDocument?: unknown }).ownerDocument === "object" && (v as { ownerDocument?: unknown }).ownerDocument !== null;
}

/** The DOM-only options of the adapter (CCR-V11-6, design 32 18.2); each default reproduces the behaviour of the adapter without the option. */
export type DomCanvasRendererOptions = CanvasRendererOptions & {
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

/** The DOM Canvas renderer: CanvasRenderer with host "dom"; env.host is the container Element. */
export function createDomCanvasRenderer(options?: DomCanvasRendererOptions): CanvasRenderer {
  const split = splitDomOptions(options);
  const composed = composeCanvasRenderer("dom", split.rest as CanvasRendererOptions | undefined);
  const builtinPointer = split.dom.pointer, builtinLive = split.dom.liveRegion, builtinLabel = split.dom.canvasLabel;
  const core = composed.renderer;
  const ropts = composed.options;

  let host: Element | undefined;
  let doc: Document | undefined;
  let env: RendererEnvironment | undefined;
  let model: RenderModel | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | undefined;
  let status: Element | undefined;
  let saved: Node[] = [];
  let failure: string | undefined;
  let phase: CanvasStatus["phase"] = "created";
  let stale = false; // the core is ahead of the canvas (a commit failed); the next commit catches up
  let picker: ReturnType<typeof pickerFromList> | undefined; // built lazily for the committed state, dropped by every commit (5.3)
  let pendingLoads = 0;
  let needCommit = false;
  const unbind: (() => void)[] = [];

  const reportError = (e: unknown): void => { try { env?.onError?.(e); } catch { /* a throwing onError is swallowed */ } };
  const failureToken = (e: unknown): string => (e instanceof IgrError && e.code === "INVALID_INPUT" && e.reason === "OUT_OF_RANGE" ? "COORD_LIMIT" : "REPLAY_ERROR");

  /** Sizes the canvas from the viewport and the current device pixel ratio (6.4); returns the replay ratio e. Assigning width or height clears the canvas. */
  function size(width: number, height: number): number {
    const ratio = (doc!.defaultView as unknown as { devicePixelRatio?: number } | null)?.devicePixelRatio;
    let b: { e: number; bw: number; bh: number };
    try { b = backingSize(width, height, dprMilliOf(ratio)); }
    catch (e) { throw bad("OUT_OF_RANGE", "env.size", `BACKING_SIZE ${e instanceof Error ? e.message : ""}`); }
    canvas!.style.width = String(width) + "px";
    canvas!.style.height = String(height) + "px";
    if (canvas!.width !== b.bw) canvas!.width = b.bw;
    if (canvas!.height !== b.bh) canvas!.height = b.bh;
    return b.e;
  }

  function clear(): void {
    if (!ctx || !canvas) return;
    const c = ctx as unknown as Canvas2DLike;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
  }

  /** One whole-frame commit: the list of the committed state replayed with all eight layers. On a refusal the canvas is cleared and the failure recorded. */
  function commit(): void {
    if (!host || !doc || !model || !canvas || !ctx) return;
    picker = undefined;
    const state = core.getState();
    let list: DisplayList;
    try {
      const e = size(state.viewport.width, state.viewport.height);
      list = core.displayList();
      replayCanvas(list, ctx as unknown as Canvas2DLike, { dprMilli: e, ink: ropts.ink });
      failure = undefined;
      if (builtinLabel) canvas.setAttribute("aria-label", `${summaryText(graphSummary(model))} ${statusText(model, state)}`);
    } catch (err) {
      try { clear(); } catch { /* a context that throws cannot be cleared either */ }
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
      if (!host || !model || !canvas) return;
      if (e.isPrimary === false || e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // ignored
      const state = core.getState();
      const p = { x: ((e.clientX - rect.left) * state.viewport.width) / rect.width, y: ((e.clientY - rect.top) * state.viewport.height) / rect.height };
      picker ??= pickerFromList(model, state, core.displayList());
      const a = picker.pick(p);
      adapter.dispatch(a ? { type: "select", mode: "replace", targets: [a] } : { type: "clear-selection" });
    } catch (err) { reportError(err); }
  }

  const adapter: CanvasRenderer = {
    manifest: core.manifest,
    async initialize(e: RendererEnvironment): Promise<void> {
      const h: unknown = e && typeof e === "object" ? (e as { host?: unknown }).host : undefined;
      if (!isElement(h)) throw bad("SCHEMA", "env.host", "the dom renderer needs an Element as host");
      const d = h.ownerDocument;
      const c = d.createElement("canvas");
      const x = c.getContext("2d");
      if (x === null) throw bad("INVALID_VALUE", "env.host", "NO_2D_CONTEXT getContext(\"2d\") returned null"); // fails closed before anything is mounted
      await core.initialize(e); // validates the environment, the size included (1..16384 px: backingSize cannot refuse it)
      host = h; doc = d; env = e; canvas = c; ctx = x;
      size(e.size.width, e.size.height);
      saved = Array.from(h.childNodes);
      for (const n of saved) h.removeChild(n);
      if (builtinLabel) c.setAttribute("role", "img"); else c.setAttribute("aria-hidden", "true"); // the companion is then the accessible surface
      h.appendChild(c);
      if (builtinLive) {
        status = d.createElement("div");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        h.appendChild(status);
      }
      if (builtinPointer) {
        c.addEventListener("pointerdown", onPointerDown); // the canvas's, not the host's: a press elsewhere in the host is not a press on the graph (audit M-6)
        unbind.push(() => c.removeEventListener("pointerdown", onPointerDown));
      }
      phase = "initialized";
    },
    async loadScene(m: RenderModel, initial?: SemanticState): Promise<void> {
      pendingLoads++;
      try { await core.loadScene(m, initial); }
      catch (e) { pendingLoads--; if (pendingLoads === 0 && needCommit) { needCommit = false; commitSafe(); } throw e; }
      pendingLoads--;
      model = m;
      phase = "ready";
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
    render: () => core.render(),
    probe: (): RenderReport => core.probe(),
    export: (format: ExportFormat) => core.export(format),
    async dispose(): Promise<void> {
      try { await core.dispose(); }
      finally {
        for (const u of unbind.splice(0)) u();
        if (host) {
          if (canvas && canvas.parentNode === host) host.removeChild(canvas);
          if (status && status.parentNode === host) host.removeChild(status);
          for (const n of saved) host.appendChild(n);
        }
        canvas = undefined; ctx = undefined; status = undefined; host = undefined; model = undefined; picker = undefined; stale = false; failure = undefined; phase = "disposed";
      }
    },
    displayList: () => core.displayList(),
    displayListBytes: () => core.displayListBytes(),
    canvasCalls: () => core.canvasCalls(),
    pick: (point: { x: number; y: number }): ElementAddress | undefined => core.pick(point),
    elementBounds: (): ElementBox[] => core.elementBounds(),
    status: (): CanvasStatus => (failure === undefined ? { phase } : { phase, failure }),
  };
  return adapter;
}
