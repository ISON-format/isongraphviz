// src/dom/index.ts - the browser adapter (design 13), a SEPARATE entry ("./dom"). It composes the core renderer with the "dom" manifest and adds
// mounting, one pointerdown mapping and a live status line. No byte of it is normative; it claims no conformance level. The core never touches the DOM.
// Security: the document is built by the core, parsed with DOMParser and imported with importNode; there is no innerHTML, no eval, no
// string concatenation into the DOM; the status line is written with textContent only.
import { IgrError, announcementFor } from "isongraph-visualize-renderer-core";
import type { ElementAddress, ExportFormat, Intent, RenderModel, RenderReport, RendererEnvironment, SemanticEvent, SemanticState } from "isongraph-visualize-renderer-core";
import { checkPrefix } from "../ids.js";
import { pickElement } from "../pick.js";
import { composeSvgRenderer, type SvgRenderer, type SvgRendererOptions } from "../renderer.js";
import { renderSvg } from "../write.js";

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);
const SVG_NS = "http://www.w3.org/2000/svg";

/** The DOM-only options of the adapter (CCR-V11-6, design 32 18.2); each default reproduces the behaviour of the adapter without the option. */
export type DomSvgRendererOptions = SvgRendererOptions & {
  /** "builtin" (default): the adapter's own pointerdown and pointermove handlers and cursor; "none": no pointer listener and no cursor. */
  pointer?: "builtin" | "none";
  /** "builtin" (default): the adapter's status div (role="status", aria-live="polite"); "none": no status element is created or written. */
  liveRegion?: "builtin" | "none";
  /** "by-id" (default): DOM focus is restored to the previously focused element id after every commit (13.2); "none": the adapter neither remembers the id nor calls focus(). */
  focusRestore?: "by-id" | "none";
};

interface DomOnly { pointer: boolean; liveRegion: boolean; focusRestore: boolean }
const DOM_KEYS = ["pointer", "liveRegion", "focusRestore"] as const;
const DOM_VALUES: Record<(typeof DOM_KEYS)[number], readonly [string, string]> = { pointer: ["builtin", "none"], liveRegion: ["builtin", "none"], focusRestore: ["by-id", "none"] };

/**
 * Reads, validates and REMOVES the DOM-only keys with a closed own-property check; the rest goes to the shared composer unchanged, whose own
 * closed key set still rejects every unknown key (INVALID_INPUT/SCHEMA). A value outside the set of a known key is INVALID_INPUT/INVALID_VALUE.
 * Anything that is not a plain object is left to the composer (SCHEMA). Each property is read once; an own property whose value is undefined is absent.
 */
function splitDomOptions(options: unknown): { rest: unknown; dom: DomOnly } {
  const dom: DomOnly = { pointer: true, liveRegion: true, focusRestore: true };
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

function isElement(v: unknown): v is Element {
  return typeof v === "object" && v !== null && (v as { nodeType?: unknown }).nodeType === 1 && typeof (v as { ownerDocument?: unknown }).ownerDocument === "object" && (v as { ownerDocument?: unknown }).ownerDocument !== null;
}

/** The dom renderer: Renderer & { svg() } with host "dom"; env.host is the container Element (13.1). */
export function createDomSvgRenderer(options?: DomSvgRendererOptions): SvgRenderer {
  const split = splitDomOptions(options);
  const composed = composeSvgRenderer("dom", split.rest as SvgRendererOptions | undefined);
  const builtinPointer = split.dom.pointer, builtinLive = split.dom.liveRegion, restoreFocus = split.dom.focusRestore;
  const core = composed.renderer;
  const svgOptions = composed.svgOptions; // the RESOLVED options (dom defaults: 8 MiB, the capacity label budget): the mounted document is what svg() returns
  const prefix = svgOptions.idPrefix ?? "igr";

  let host: Element | undefined;
  let doc: Document | undefined;
  let env: RendererEnvironment | undefined;
  let model: RenderModel | undefined;
  let status: Element | undefined;
  let mounted: Element | undefined;
  let saved: Node[] = [];
  let prevCursor = "";
  let stale = false; // the core is ahead of the mounted document (a commit failed); the next commit catches up
  let pendingLoads = 0;
  let needCommit = false;
  const unbind: (() => void)[] = [];

  const reportError = (e: unknown): void => { try { env?.onError?.(e); } catch { /* a throwing onError is swallowed */ } };

  function commit(): void {
    if (!host || !doc || !model) return;
    const state = core.getState();
    const text = renderSvg(model, state, svgOptions);
    const parsed = new (doc.defaultView as unknown as { DOMParser: typeof DOMParser }).DOMParser().parseFromString(text, "image/svg+xml");
    if (parsed.getElementsByTagName("parsererror").length > 0 || parsed.documentElement.namespaceURI !== SVG_NS) throw bad("SCHEMA", "svg", "generated SVG is not well-formed");
    const hadFocus = restoreFocus && mounted !== undefined && host.contains(doc.activeElement);
    const focusedId = hadFocus ? doc.activeElement?.getAttribute("id") ?? undefined : undefined;
    const imported = doc.importNode(parsed.documentElement, true) as Element;
    if (mounted) host.replaceChild(imported, mounted); else host.insertBefore(imported, status ?? null);
    mounted = imported;
    if (focusedId !== undefined) {
      // DOM focus restoration only: a browser focus never becomes a semantic focus intent (13.2)
      const el = Array.from(imported.querySelectorAll("[id]")).find((x) => x.getAttribute("id") === focusedId);
      if (el && typeof (el as unknown as { focus?: unknown }).focus === "function") (el as unknown as { focus(o: { preventScroll: boolean }): void }).focus({ preventScroll: true });
    }
  }

  const elementOf = (target: EventTarget | null): Element | null => {
    const t = target as Element | null;
    return t && typeof t.closest === "function" ? t.closest("g.igr-node, g.igr-edge") : null;
  };

  /** Commit for dispatch: the core has already advanced, so a failure is reported through onError (the call stays successful) and the next commit catches up. */
  function commitSafe(): void {
    try { commit(); stale = false; } catch (e) { stale = true; reportError(e); }
  }

  function onPointerDown(ev: Event): void {
    try {
      const e = ev as PointerEvent;
      if (!host || !model || !mounted) return;
      if (e.isPrimary === false || e.button !== 0) return;
      const rect = mounted.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // ignored (13.3)
      const state = core.getState();
      const p = { x: ((e.clientX - rect.left) * state.viewport.width) / rect.width, y: ((e.clientY - rect.top) * state.viewport.height) / rect.height };
      const el = elementOf(e.target);
      const targetId = el?.getAttribute("id") ?? undefined;
      const a = pickElement(model, state, prefix, targetId === undefined ? { point: p } : { targetId, point: p });
      adapter.dispatch(a ? { type: "select", mode: "replace", targets: [a] } : { type: "clear-selection" });
    } catch (err) { reportError(err); }
  }

  function onPointerMove(ev: Event): void {
    try { if (host) (host as HTMLElement).style.cursor = elementOf(ev.target) ? "pointer" : "default"; } catch (err) { reportError(err); }
  }

  const adapter: SvgRenderer = {
    manifest: core.manifest,
    async initialize(e: RendererEnvironment): Promise<void> {
      const h: unknown = e && typeof e === "object" ? (e as { host?: unknown }).host : undefined;
      if (!isElement(h)) throw bad("SCHEMA", "env.host", "the dom renderer needs an Element as host");
      const d = h.ownerDocument;
      checkPrefix(prefix);
      const dup = d.getElementById(prefix + "-title");
      if (dup && !h.contains(dup)) throw bad("INVALID_VALUE", "env.host", `the page already has an element with id ${prefix}-title`);
      await core.initialize(e);
      host = h; doc = d; env = e;
      if (builtinPointer) prevCursor = (h as HTMLElement).style.cursor;
      saved = Array.from(h.childNodes);
      for (const n of saved) h.removeChild(n);
      if (builtinLive) {
        status = d.createElement("div");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        h.appendChild(status);
      }
      if (builtinPointer) {
        h.addEventListener("pointerdown", onPointerDown);
        h.addEventListener("pointermove", onPointerMove);
        unbind.push(() => h.removeEventListener("pointerdown", onPointerDown), () => h.removeEventListener("pointermove", onPointerMove));
      }
    },
    async loadScene(m: RenderModel, initial?: SemanticState): Promise<void> {
      pendingLoads++;
      try { await core.loadScene(m, initial); }
      catch (e) { pendingLoads--; if (pendingLoads === 0 && needCommit) { needCommit = false; commitSafe(); } throw e; }
      pendingLoads--;
      model = m;
      if (pendingLoads > 0) { needCommit = true; return; } // a later load is still in flight (the core is BUSY): the last one to settle mounts
      needCommit = false;
      try { commit(); stale = false; } catch (e) { stale = true; throw e; } // the load itself succeeded; the state is consistent and a later dispatch retries
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
          if (mounted && mounted.parentNode === host) host.removeChild(mounted);
          if (status && status.parentNode === host) host.removeChild(status);
          for (const n of saved) host.appendChild(n);
          if (builtinPointer) (host as HTMLElement).style.cursor = prevCursor;
        }
        mounted = undefined; status = undefined; host = undefined; model = undefined; stale = false;
      }
    },
    svg: () => core.svg(),
  };
  return adapter;
}
