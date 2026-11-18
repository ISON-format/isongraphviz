// src/dom/index.ts - interaction-core "./dom" (DOM lib): the DOM binder bindInteraction (design 5.8). Adapter code, smoke only: no row claims any byte of it.
// One flow for every host: DOM event -> conversion -> step -> for each `intent` output in order target.dispatch(intent) (each dispatch commits) -> the
// SemanticEvents of all the dispatches and the nav outputs of the step are concatenated -> target.focusElement(state.focus) (DOM focus follows the SEMANTIC
// focus, only if DOM focus is inside the widget host before the step) -> target.onCommit({events, nav, mode}) ONCE. While the binder is inside this flow,
// `focusin` events are its own DOM focus moves and are ignored.
import type { ElementAddress, Intent, RenderModel, SemanticEvent, SemanticState } from "isongraph-visualize-renderer-core";
import { lookupElement, quantizePx } from "isongraph-visualize-renderer-core";
import { keyToken, matchBinding } from "../bindings.js";
import { IaError } from "../errors.js";
import { createMachine, prepareConfig, step, type MachineConfig, type MachineState, type Output } from "../machine.js";
import { plainEntries } from "../geometry.js";
import { revealPan, type NavEvent } from "../navigation.js";

export interface InteractionTarget {
  model(): RenderModel;
  state(): SemanticState;
  dispatch(intent: Intent): readonly SemanticEvent[];
  /** The element under the point (CSS pixels of the rendered surface), resolved with the host renderer's pick function. */
  pick(point: { x: number; y: number }): ElementAddress | undefined;
  /** The element a DOM element of the accessible surface stands for (the companion's item, or the SVG's `g`), or undefined. */
  addressOfElement(el: Element): ElementAddress | undefined;
  /** Moves DOM focus to the element of an address on the accessible surface; does nothing for undefined. */
  focusElement(address: ElementAddress | undefined): void;
  onCommit(info: { events: readonly SemanticEvent[]; nav: readonly NavEvent[]; mode: "normal" | "marquee" }): void;
  onOutput(o: Output): void;
  onError(e: unknown): void;
}
/** `adapterPointer` and `adapterFocusRestore` are host assertions that the renderer adapter's own pointer handling and focus restoration are off (CCR-V11-6). */
export interface BindOptions { adapterPointer: "none"; adapterFocusRestore: "none"; surface: Element; config?: MachineConfig }
export interface InteractionBinding { dispose(): void; machine(): MachineState }

const REPEATABLE: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "+", "-", "="]);

const mods = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): number => (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);

/**
 * bindInteraction(container, target, options): attaches the listeners to `container`, converts DOM events into the nine shapes of 4.1, calls `step` with the
 * renderer's committed model and state, and carries out the outputs. Throws IaError INVALID_CONFIG/SCHEMA unless both adapter assertions are "none" (the
 * binder cannot detect the adapter's own handling itself). Smoke only.
 */
export function bindInteraction(container: Element, target: InteractionTarget, options: BindOptions): InteractionBinding {
  const o = plainEntries(options);
  for (const k of o?.keys() ?? []) if (k !== "adapterPointer" && k !== "adapterFocusRestore" && k !== "surface" && k !== "config") throw new IaError("INVALID_CONFIG", "SCHEMA", `options.${k}`, "unknown option");
  if (o === undefined || o.get("adapterPointer") !== "none" || o.get("adapterFocusRestore") !== "none") {
    throw new IaError("INVALID_CONFIG", "SCHEMA", "options", "adapterPointer and adapterFocusRestore must both be \"none\": the adapter's own pointer handling, live region and focus restoration must be off");
  }
  const surface = o.get("surface") as Element | undefined;
  if (typeof surface !== "object" || surface === null || typeof (surface as { getBoundingClientRect?: unknown }).getBoundingClientRect !== "function") {
    throw new IaError("INVALID_CONFIG", "SCHEMA", "options.surface", "an Element expected");
  }
  if (typeof container !== "object" || container === null || typeof (container as { addEventListener?: unknown }).addEventListener !== "function") throw new IaError("INVALID_CONFIG", "SCHEMA", "container", "an Element expected");
  for (const f of ["model", "state", "dispatch", "pick", "addressOfElement", "focusElement", "onCommit", "onOutput", "onError"] as const) {
    if (typeof (target as unknown as Record<string, unknown> | null)?.[f] !== "function") throw new IaError("INVALID_CONFIG", "SCHEMA", `target.${f}`, "a function expected");
  }
  // the config is verified ONCE here and copied (frozen): later changes to the caller's object do not reach the machine, and `step` does not verify the table again
  const config = prepareConfig(o.get("config") as MachineConfig | undefined);
  const html = container as unknown as { style?: { touchAction?: string } };
  const priorTouchAction = html.style?.touchAction ?? "";
  if (html.style !== undefined) html.style.touchAction = "none"; // through the CSSOM, never an attribute string

  let machine = createMachine();
  let committedMode: "normal" | "marquee" = "normal";
  let lastT = 0; // the largest t passed to the machine: a clock skew never yields NON_MONOTONIC_TIME and never drops an input
  let inFlow = false;
  let pointerDown = false; // a pointer press is in progress: a focusin now was caused by it (no reveal pan)
  let lastPointerType = "mouse";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wakeAt: number | undefined;
  let disposed = false;
  let addedTabindex = false; // the binder removes only a tabindex it added

  /** The time of the machine: t = max(floor(timeStamp), lastT). A stamp beyond the t domain is refused (the event is dropped) and never stored: it must not poison the clock. */
  const stamp = (ts: number): number => {
    const f = Number.isFinite(ts) ? Math.floor(ts) : 0;
    if (f > 2 ** 52) throw new IaError("INVALID_EVENT", "OUT_OF_RANGE", "timeStamp");
    const t = Math.max(f, lastT);
    lastT = t;
    return t;
  };
  /** CSS-pixel coordinates of the surface (the viewport's logical size over the bounding rectangle), as doubles. */
  const pixels = (clientX: number, clientY: number): { x: number; y: number } | undefined => {
    const r = surface.getBoundingClientRect();
    const vp = target.state().viewport;
    if (!(r.width > 0) || !(r.height > 0)) return undefined;
    return { x: ((clientX - r.left) * vp.width) / r.width, y: ((clientY - r.top) * vp.height) / r.height };
  };
  const milli = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = surface.getBoundingClientRect();
    const vp = target.state().viewport;
    return { x: quantizePx((((clientX - r.left) * vp.width) / r.width) * 1000), y: quantizePx((((clientY - r.top) * vp.height) / r.height) * 1000) };
  };
  const domFocusInside = (): boolean => {
    // the host's ROOT node (the document, or the shadow root the widget lives in): inside a shadow tree document.activeElement is the shadow host
    const root = ((container as { getRootNode?: () => unknown }).getRootNode?.() ?? container.ownerDocument) as { activeElement: Element | null };
    const active = root.activeElement;
    return active !== null && container.contains(active);
  };

  /**
   * Carries out the outputs of one input event: the intents in order (each dispatch commits), then DOM focus follows the semantic focus (only if DOM focus was
   * inside the widget host) and ONE onCommit with the concatenated events and the nav outputs. A step that dispatched nothing and produced no nav output and
   * no mode change (a pointermove below the drag threshold, a lasso preview) commits nothing. Exceptions go to onError; the remaining outputs are dropped.
   */
  const flow = (outputs: readonly Output[], after?: () => Output[], focusEntry = false): void => {
    const events: SemanticEvent[] = [];
    const navs: NavEvent[] = [];
    const wasInside = focusEntry || domFocusInside(); // a focus entry is, by definition, DOM focus inside the host
    const modeBefore = committedMode;
    let dispatched = 0;
    inFlow = true;
    try {
      const carry = (list: readonly Output[]): void => {
        for (const out of list) {
          if (out.kind === "intent") { dispatched++; events.push(...target.dispatch(out.intent)); }
          else {
            if (out.kind === "nav") navs.push(out.event);
            target.onOutput(out);
          }
        }
      };
      try {
        carry(outputs);
        if (after !== undefined) carry(after());
      } catch (e) { target.onError(e); }
      if (dispatched > 0 || navs.length > 0 || machine.mode !== modeBefore) {
        try {
          if (wasInside) target.focusElement(target.state().focus);
          committedMode = machine.mode;
          target.onCommit({ events, nav: navs, mode: machine.mode });
        } catch (e) { target.onError(e); }
      }
    } finally { inFlow = false; }
  };

  /** Runs one converted event through the machine and the flow; returns `handled` (false on an error: the event is dropped). */
  const run = (event: unknown): boolean => {
    let r;
    try { r = step(machine, event, target.model(), target.state(), config); } catch (e) { target.onError(e); return false; }
    machine = r.machine;
    flow(r.outputs);
    if (r.wake_at !== wakeAt) {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      wakeAt = r.wake_at;
      if (wakeAt !== undefined) {
        const due = wakeAt;
        timer = setTimeout(() => {
          timer = undefined; wakeAt = undefined;
          if (disposed) return;
          lastT = Math.max(due, lastT); // the tick is stamped max(wake_at, lastT)
          run({ type: "tick", t: lastT });
        }, Math.max(0, due - machine.last_t));
      }
    }
    return r.handled;
  };

  const guard = (f: () => void): void => { try { f(); } catch (e) { target.onError(e); } };
  const ptype = (e: PointerEvent): "mouse" | "touch" | "pen" => (e.pointerType === "touch" ? "touch" : e.pointerType === "pen" ? "pen" : "mouse");
  const pid = (e: PointerEvent): number => (e.pointerType === "mouse" || e.pointerType === "" ? 0 : e.pointerId);
  const withTarget = (p: { x: number; y: number } | undefined): { target?: ElementAddress } => {
    const t = p === undefined ? undefined : target.pick(p);
    return t === undefined ? {} : { target: t };
  };

  const listeners: [string, (e: never) => void, AddEventListenerOptions | undefined][] = [];
  const on = <E extends Event>(type: string, fn: (e: E) => void, opts?: AddEventListenerOptions): void => {
    const l = fn as (e: never) => void;
    listeners.push([type, l, opts]);
    container.addEventListener(type, l as unknown as EventListener, opts);
  };

  on<PointerEvent>("pointerdown", (e) => guard(() => {
    lastPointerType = e.pointerType;
    const px = pixels(e.clientX, e.clientY);
    const m = milli(e.clientX, e.clientY); // may throw: the flag is set only after a successful conversion
    if (e.button === 0) pointerDown = true;
    if (e.button === 0) {
      try { container.setPointerCapture(e.pointerId); } catch { /* an inactive pointer cannot be captured */ }
      // a primary press on a canvas (no accessible element under it) focuses the container, so that the user's keys reach it
      if (target.addressOfElement(e.target as Element) === undefined) {
        if (!container.hasAttribute("tabindex")) { container.setAttribute("tabindex", "-1"); addedTabindex = true; }
        (container as HTMLElement).focus({ preventScroll: true });
      }
    }
    const event = { type: "pointerdown", t: stamp(e.timeStamp), id: pid(e), ptype: ptype(e), button: e.button, x: m.x, y: m.y, mods: mods(e), ...withTarget(px) };
    if (run(event)) e.preventDefault();
  }));
  on<PointerEvent>("pointermove", (e) => guard(() => {
    const m = milli(e.clientX, e.clientY);
    if (run({ type: "pointermove", t: stamp(e.timeStamp), id: pid(e), x: m.x, y: m.y, mods: mods(e) })) e.preventDefault();
  }));
  on<PointerEvent>("pointerup", (e) => guard(() => {
    pointerDown = false;
    const m = milli(e.clientX, e.clientY);
    if (run({ type: "pointerup", t: stamp(e.timeStamp), id: pid(e), x: m.x, y: m.y, mods: mods(e) })) e.preventDefault();
  }));
  on<PointerEvent>("pointercancel", (e) => guard(() => {
    pointerDown = false;
    if (run({ type: "pointercancel", t: stamp(e.timeStamp), id: pid(e) })) e.preventDefault();
  }));
  on<WheelEvent>("wheel", (e) => guard(() => {
    if (e.deltaMode !== 0 && e.deltaMode !== 1 && e.deltaMode !== 2) return; // any other value drops the event
    const m = milli(e.clientX, e.clientY);
    if (run({ type: "wheel", t: stamp(e.timeStamp), x: m.x, y: m.y, dy: quantizePx(e.deltaY * 1000), unit: e.deltaMode, mods: mods(e) })) e.preventDefault();
  }), { passive: false }); // preventDefault iff handled: a widget that fills the page is a scroll trap for wheel users (listed in not_claimed)
  on<KeyboardEvent>("keydown", (e) => guard(() => {
    const token = keyToken(e.key);
    if (token === undefined) return; // no token: dropped without a call
    if (e.repeat && !REPEATABLE.has(token)) { // a held Enter, Space, m, a, Escape or F10 cannot repeat an action, but a bound one must not fall through to the page either
      if (matchBinding(config.bindings ?? [], machine.mode, token, mods(e)) !== undefined) e.preventDefault();
      return;
    }
    pointerDown = false;
    if (run({ type: "key", t: stamp(e.timeStamp), key: token, mods: mods(e) })) e.preventDefault();
  }));
  on<MouseEvent>("dblclick", (e) => guard(() => {
    const m = milli(e.clientX, e.clientY);
    if (run({ type: "dblclick", t: stamp(e.timeStamp), x: m.x, y: m.y, mods: mods(e), ...withTarget(pixels(e.clientX, e.clientY)) })) e.preventDefault();
  }));
  on<MouseEvent>("contextmenu", (e) => guard(() => {
    if (lastPointerType === "touch") { e.preventDefault(); return; } // a touch long press goes through the machine's tick: no double context action
    const m = milli(e.clientX, e.clientY);
    if (run({ type: "contextmenu", t: stamp(e.timeStamp), x: m.x, y: m.y, mods: mods(e), ...withTarget(pixels(e.clientX, e.clientY)) })) e.preventDefault();
  }));
  // Focus entry: the one place where a browser focus event dispatches a semantic intent (an exception to 30 13.2, confined to this binder).
  on<FocusEvent>("focusin", (e) => guard(() => {
    if (inFlow || disposed) return;
    const a = e.target === null ? undefined : target.addressOfElement(e.target as Element);
    if (a === undefined) return;
    const model = target.model();
    const el = lookupElement(model, "node" in a ? a.node : a.edge);
    const f = target.state().focus;
    const cur = f === undefined ? undefined : lookupElement(model, "node" in f ? f.node : f.edge);
    if (el === undefined || (cur !== undefined && cur === el)) return; // idempotent: a DOM focus that names the focused element dispatches nothing
    const caused = pointerDown;
    flow([{ kind: "intent", intent: { type: "focus", target: a } }], () => {
      if (caused) return [];
      const pan = revealPan(model, target.state(), a);
      return pan === undefined ? [] : [{ kind: "intent", intent: pan }];
    }, true);
  }));

  return {
    machine: () => machine,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      for (const [type, l, opts] of listeners) container.removeEventListener(type, l as unknown as EventListener, opts);
      listeners.length = 0;
      if (html.style !== undefined) html.style.touchAction = priorTouchAction;
      if (addedTabindex) container.removeAttribute("tabindex");
    },
  };
}
