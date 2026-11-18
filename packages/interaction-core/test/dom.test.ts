// The DOM binder (design 5.8) against a FAKE DOM with the listed members only (design 16 (8)): listeners, conversion, the flow event -> machine -> intents ->
// commit -> focusElement(state.focus) -> one onCommit, focus entry, container focus on a press, key repeat, timers, error routing, option refusal.
// No browser is involved here; the real-browser smoke is scripts/browser-smoke.mjs (smoke only, one engine).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState, type ElementAddress, type Intent, type Renderer, type RenderModel, type SemanticEvent } from "isongraph-visualize-renderer-core";
import { createHeadlessRenderer } from "isongraph-visualize-renderer-core/headless";
import { bindInteraction, type InteractionBinding, type InteractionTarget } from "../src/dom/index.js";
import { loadModel, G9 } from "./helpers.js";

type Listener = (e: unknown) => void;
interface Rec { type: string; listener: Listener; options: unknown }

/** A fake Element: the members the binder uses, nothing else. */
class FakeElement {
  listeners: Rec[] = [];
  attrs = new Map<string, string>();
  style: { touchAction?: string } = {};
  captured: number[] = [];
  focusCalls: unknown[] = [];
  children: FakeElement[] = [];
  parent: FakeElement | undefined;
  rect = { left: 10, top: 20, width: 900, height: 600 };
  ownerDocument: { activeElement: FakeElement | null };
  constructor(doc?: { activeElement: FakeElement | null }) { this.ownerDocument = doc ?? { activeElement: null }; }
  addEventListener(type: string, listener: Listener, options?: unknown): void { this.listeners.push({ type, listener, options }); }
  removeEventListener(type: string, listener: Listener): void { this.listeners = this.listeners.filter((l) => !(l.type === type && l.listener === listener)); }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } { return this.rect; }
  setPointerCapture(id: number): void { this.captured.push(id); }
  getAttribute(n: string): string | null { return this.attrs.get(n) ?? null; }
  removeAttribute(n: string): void { this.attrs.delete(n); }
  hasAttribute(n: string): boolean { return this.attrs.has(n); }
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); }
  focus(o?: unknown): void { this.focusCalls.push(o); this.ownerDocument.activeElement = this; }
  contains(o: FakeElement | null): boolean { for (let e: FakeElement | undefined = o ?? undefined; e; e = e.parent) if (e === this) return true; return false; }
  append(c: FakeElement): FakeElement { c.parent = this; this.children.push(c); return c; }
  fire(type: string, ev: Record<string, unknown>): { prevented: boolean } {
    let prevented = false;
    const e = { ...ev, preventDefault: () => { prevented = true; } };
    for (const l of [...this.listeners]) if (l.type === type) l.listener(e);
    return { get prevented() { return prevented; } } as { prevented: boolean };
  }
}

const OPTS = { adapterPointer: "none", adapterFocusRestore: "none" } as const;
const PX = (x: number, y: number) => ({ clientX: 10 + x, clientY: 20 + y });

interface Harness {
  model: RenderModel; r: Renderer; container: FakeElement; surface: FakeElement; item: FakeElement; doc: { activeElement: FakeElement | null };
  commits: { events: readonly SemanticEvent[]; nav: readonly unknown[]; mode: string }[]; outputs: unknown[]; errors: unknown[]; order: string[];
  focusTargets: (ElementAddress | undefined)[]; dispatched: Intent[]; binding: InteractionBinding; picks: Map<string, ElementAddress | undefined>;
}

async function harness(extra: { pick?: (p: { x: number; y: number }) => ElementAddress | undefined; dispatchThrows?: boolean; config?: unknown } = {}): Promise<Harness> {
  const model = await loadModel(G9.scene, G9.layout);
  const r = createHeadlessRenderer();
  await r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
  await r.loadScene(model, initialState(model, { width: 900, height: 600 }));
  const doc: { activeElement: FakeElement | null } = { activeElement: null };
  const container = new FakeElement(doc), surface = new FakeElement(doc), item = new FakeElement(doc);
  container.append(surface); container.append(item);
  const h = { model, r, container, surface, item, doc, commits: [], outputs: [], errors: [], order: [], focusTargets: [], dispatched: [], picks: new Map() } as unknown as Harness;
  const itemAddress: ElementAddress = { node: { id: "s:c", type: "p" } };
  const target: InteractionTarget = {
    model: () => model,
    state: () => r.getState(),
    dispatch: (i) => { h.order.push("dispatch"); h.dispatched.push(i); if (extra.dispatchThrows) throw new Error("boom"); return r.dispatch(i); },
    pick: extra.pick ?? (() => undefined),
    addressOfElement: (el) => ((el as unknown) === item ? itemAddress : undefined),
    focusElement: (a) => { h.order.push("focusElement"); h.focusTargets.push(a); },
    onCommit: (info) => { h.order.push("onCommit"); h.commits.push(info as never); },
    onOutput: (o) => { h.outputs.push(o); },
    onError: (e) => { h.errors.push(e); },
  };
  h.binding = bindInteraction(container as unknown as Element, target, { ...OPTS, surface: surface as unknown as Element, ...(extra.config === undefined ? {} : { config: extra.config as never }) });
  return h;
}

const pointer = (o: Record<string, unknown>) => ({ pointerId: 1, pointerType: "mouse", button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, timeStamp: 100, target: undefined, ...o });

describe("bindInteraction: options", () => {
  it("refuses a host that did not assert adapterPointer and adapterFocusRestore are none (INVALID_CONFIG/SCHEMA)", async () => {
    const model = await loadModel(G9.scene, G9.layout);
    const c = new FakeElement();
    const t = { model: () => model } as unknown as InteractionTarget;
    for (const bad of [{}, { adapterPointer: "builtin", adapterFocusRestore: "none" }, { adapterPointer: "none" }, { adapterPointer: "none", adapterFocusRestore: "by-id" }]) {
      expect(() => bindInteraction(c as unknown as Element, t, { ...bad, surface: c } as never)).toThrowError(expect.objectContaining({ code: "INVALID_CONFIG", reason: "SCHEMA" }));
    }
    expect(c.listeners.length).toBe(0);
  });
  it("validates the machine config at bind time (INVALID_CONFIG)", async () => {
    const c = new FakeElement();
    expect(() => bindInteraction(c as unknown as Element, {} as InteractionTarget, { ...OPTS, surface: c as unknown as Element, config: { wrap: "yes" } as never })).toThrowError(expect.objectContaining({ code: "INVALID_CONFIG" }));
  });
});

describe("bindInteraction: listeners", () => {
  it("registers pointer, wheel (non-passive), key, dblclick, contextmenu and focusin listeners, sets touch-action none, and removes everything at dispose", async () => {
    const h = await harness();
    const types = h.container.listeners.map((l) => l.type).sort();
    expect(types).toEqual(["contextmenu", "dblclick", "focusin", "keydown", "pointercancel", "pointerdown", "pointermove", "pointerup", "wheel"]);
    expect(h.container.listeners.find((l) => l.type === "wheel")!.options).toEqual({ passive: false });
    expect(h.container.style.touchAction).toBe("none");
    h.binding.dispose();
    expect(h.container.listeners.length).toBe(0);
    expect(h.container.style.touchAction).toBe("");
  });
});

describe("bindInteraction: pointer", () => {
  it("a click on a picked element dispatches select (replace), prevents default on both events, captures the pointer and focuses the container", async () => {
    const a: ElementAddress = { node: { id: "s:a", type: "p" } };
    const h = await harness({ pick: () => a });
    const down = h.container.fire("pointerdown", pointer({ ...PX(182, 32), target: h.surface }));
    expect(down.prevented).toBe(true);
    expect(h.container.captured).toEqual([1]); // the DOM pointerId, not the machine id (a mouse is id 0 by convention)
    const up = h.container.fire("pointerup", pointer({ ...PX(182, 32), timeStamp: 150, target: h.surface }));
    expect(up.prevented).toBe(true);
    expect(h.dispatched).toEqual([{ type: "select", mode: "replace", targets: [a] }]);
    expect(h.r.getState().selection.nodes).toEqual([{ id: "s:a", type: "p" }]);
    expect(h.commits.length).toBe(1); // the press changed nothing and commits nothing
    expect(h.commits[0]!.events.map((e) => e.type)).toEqual(["selection-changed"]);
    // a primary press on the canvas (no accessible element) focuses the container: tabindex -1 and focus({preventScroll: true})
    expect(h.container.getAttribute("tabindex")).toBe("-1");
    expect(h.container.focusCalls[0]).toEqual({ preventScroll: true });
  });
  it("converts coordinates to integer milli-pixels of the viewport, modifiers and pointer type into the event the machine sees", async () => {
    const picks: { x: number; y: number }[] = [];
    const h = await harness({ pick: (p) => { picks.push(p); return undefined; } });
    h.container.fire("pointerdown", pointer({ clientX: 10 + 450.0004, clientY: 20 + 300.5, shiftKey: true, altKey: true, target: h.surface }));
    // the target is resolved by the host from the pixel position (doubles), the event carries milli-pixels
    expect(picks[0]!.x).toBeCloseTo(450.0004, 9);
    expect(picks[0]!.y).toBeCloseTo(300.5, 9);
    const m = h.binding.machine();
    expect(m.gesture).toBe("press");
    expect(m.pointers[0]).toMatchObject({ id: 0, x: 450000, y: 300500, mods0: 5, ptype: "mouse" });
  });
  it("scales by the ratio of the viewport size to the bounding rectangle", async () => {
    const h = await harness();
    h.surface.rect = { left: 0, top: 0, width: 450, height: 300 }; // the surface is shown at half size: 100 px on screen are 200 px of the viewport
    h.container.fire("pointerdown", pointer({ clientX: 100, clientY: 50, target: h.surface }));
    expect(h.binding.machine().pointers[0]).toMatchObject({ x: 200000, y: 100000 });
  });
  it("a drag pans through the dispatched pan intents only", async () => {
    const h = await harness();
    h.container.fire("pointerdown", pointer({ ...PX(100, 100), target: h.surface }));
    const before = h.r.getState().viewport.center_x;
    h.container.fire("pointermove", pointer({ ...PX(130, 100), timeStamp: 120 }));
    h.container.fire("pointerup", pointer({ ...PX(130, 100), timeStamp: 140 }));
    expect(h.dispatched).toEqual([{ type: "pan", dx: 30, dy: 0 }]);
    expect(h.r.getState().viewport.center_x).not.toBe(before);
  });
  it("a pointerdown that names an accessible element does not steal focus from it (the element is focused by the browser, then the focus entry runs)", async () => {
    const h = await harness();
    h.container.fire("pointerdown", pointer({ ...PX(0, 0), target: h.item }));
    expect(h.container.focusCalls.length).toBe(0);
  });
  it("drops a contextmenu whose preceding pointer was touch; a mouse contextmenu gives a context-action output", async () => {
    const h = await harness();
    h.container.fire("pointerdown", pointer({ ...PX(5, 6), pointerType: "touch", pointerId: 7, target: h.surface }));
    const c = h.container.fire("contextmenu", pointer({ ...PX(5, 6), timeStamp: 600 }));
    expect(c.prevented).toBe(true);
    expect(h.outputs).toEqual([]);
    h.container.fire("pointerup", pointer({ ...PX(5, 6), pointerType: "touch", pointerId: 7, timeStamp: 650 }));
    h.container.fire("pointerdown", pointer({ ...PX(5, 6), timeStamp: 700, target: h.surface }));
    h.container.fire("pointerup", pointer({ ...PX(5, 6), timeStamp: 710 }));
    h.container.fire("contextmenu", pointer({ ...PX(5, 6), timeStamp: 720 }));
    expect(h.outputs).toEqual([{ kind: "context-action", source: "pointer", x: 5, y: 6 }]);
  });
  it("dblclick gives fit", async () => {
    const h = await harness();
    const r = h.container.fire("dblclick", pointer({ ...PX(5, 6), timeStamp: 300 }));
    expect(r.prevented).toBe(true);
    expect(h.dispatched).toEqual([{ type: "fit" }]);
  });
  it("never lets a backwards clock produce NON_MONOTONIC_TIME: t is clamped to the largest time passed", async () => {
    const h = await harness();
    h.container.fire("pointerdown", pointer({ ...PX(5, 6), timeStamp: 1000.9, target: h.surface }));
    h.container.fire("pointermove", pointer({ ...PX(6, 6), timeStamp: 900 }));
    expect(h.errors).toEqual([]);
    expect(h.binding.machine().last_t).toBe(1000);
  });
  it("routes a conversion or machine error to onError and drops the event", async () => {
    const h = await harness();
    h.container.fire("pointermove", pointer({ clientX: Number.NaN, clientY: 0, timeStamp: 5 }));
    expect(h.errors.length).toBe(1);
    expect(h.binding.machine().last_t).toBe(-1);
  });
});

describe("bindInteraction: keys", () => {
  it("a bound key prevents default; Tab and unbound keys stay with the browser", async () => {
    const h = await harness();
    expect(h.container.fire("keydown", { key: "Tab", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 1 }).prevented).toBe(false);
    expect(h.container.fire("keydown", { key: "F1", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 2 }).prevented).toBe(false);
    expect(h.container.fire("keydown", { key: "ArrowRight", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 3 }).prevented).toBe(true);
    expect(h.dispatched).toEqual([{ type: "focus-first" }]); // no focus yet: the first keypress lands on an element
  });
  it("drops repeats except arrows, PageUp, PageDown, +, - and =", async () => {
    const h = await harness();
    const press = (key: string, t: number): void => { h.container.fire("keydown", { key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: true, timeStamp: t }); };
    for (const [i, k] of ["Enter", " ", "m", "a", "Escape", "F10"].entries()) press(k, i);
    expect(h.dispatched).toEqual([]);
    expect(h.commits).toEqual([]);
    press("ArrowDown", 10);
    press("+", 11);
    press("-", 12);
    press("=", 13);
    press("PageDown", 14);
    press("PageUp", 15);
    expect(h.dispatched.length).toBeGreaterThanOrEqual(6);
  });
  it("one input event is one commit: dispatches, then focusElement(state.focus) (only if DOM focus was inside), then ONE onCommit with the concatenated events", async () => {
    const h = await harness();
    h.doc.activeElement = h.item; // DOM focus is inside the widget host
    h.container.fire("keydown", { key: "ArrowRight", shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 1 });
    // no semantic focus: shift+arrow gives only focus-first (never a select add)
    expect(h.order).toEqual(["dispatch", "focusElement", "onCommit"]);
    expect(h.focusTargets).toEqual([{ node: { id: "s:a", type: "p" } }]);
    // now a shift+arrow step with a focus: focus, select add, in one commit
    h.order.length = 0; h.commits.length = 0;
    h.container.fire("keydown", { key: "ArrowRight", shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 2 });
    expect(h.order).toEqual(["dispatch", "dispatch", "focusElement", "onCommit"]);
    expect(h.commits.length).toBe(1);
    expect(h.commits[0]!.events.map((e) => e.type)).toEqual(["focus-changed", "selection-changed"]);
  });
  it("does not move DOM focus when DOM focus was outside the widget before the step", async () => {
    const h = await harness();
    h.doc.activeElement = null;
    h.container.fire("keydown", { key: "ArrowRight", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 1 });
    expect(h.focusTargets).toEqual([]);
    expect(h.commits.length).toBe(1);
  });
  it("nav events of the step reach onCommit and onOutput; the mode after the step is reported", async () => {
    const h = await harness();
    h.container.fire("keydown", { key: "m", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 1 }); // no focus
    expect(h.commits[0]!.nav).toEqual([{ type: "nav-none", reason: "NO_FOCUS" }]);
    h.container.fire("keydown", { key: "ArrowRight", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 2 });
    h.container.fire("keydown", { key: "m", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 3 });
    expect(h.commits[2]!.nav).toEqual([{ type: "marquee-started" }]);
    expect(h.commits[2]!.mode).toBe("marquee");
    expect(h.outputs.filter((o) => (o as { kind: string }).kind === "nav").length).toBe(2);
  });
  it("a dispatch that throws is reported to onError and the remaining outputs are dropped", async () => {
    const h = await harness({ dispatchThrows: true });
    h.container.fire("keydown", { key: "ArrowRight", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 1 });
    expect(h.errors.length).toBe(1);
    expect(h.dispatched.length).toBe(1);
  });
});

describe("bindInteraction: wheel", () => {
  it("is non-passive: prevents default iff the machine handled it; an unknown deltaMode is dropped", async () => {
    const h = await harness();
    const w = (o: Record<string, unknown>) => h.container.fire("wheel", { ...PX(450, 300), deltaY: -100, deltaMode: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, timeStamp: 10, ...o });
    expect(w({}).prevented).toBe(true);
    expect(h.dispatched).toEqual([{ type: "zoom", factor_milli: 1250, anchor: { x: 450, y: 300 } }]);
    h.dispatched.length = 0;
    expect(w({ deltaMode: 3, timeStamp: 11 }).prevented).toBe(false);
    expect(h.dispatched).toEqual([]);
  });
});

describe("bindInteraction: long press timer", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it("schedules one timer for wake_at, stamps the tick max(wake_at, lastT), and clears it when the pointer leaves", async () => {
    const h = await harness();
    h.container.fire("pointerdown", pointer({ ...PX(300, 300), pointerType: "touch", pointerId: 4, timeStamp: 0, target: h.surface }));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(499);
    expect(h.outputs).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.outputs).toEqual([{ kind: "context-action", source: "long-press", x: 300, y: 300 }]);
    expect(h.binding.machine().last_t).toBe(500);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("a release before the timer cancels it; dispose clears it", async () => {
    const h = await harness();
    h.container.fire("pointerdown", pointer({ ...PX(300, 300), pointerType: "touch", pointerId: 4, timeStamp: 0, target: h.surface }));
    h.container.fire("pointerup", pointer({ ...PX(300, 300), pointerType: "touch", pointerId: 4, timeStamp: 100 }));
    expect(vi.getTimerCount()).toBe(0);
    h.container.fire("pointerdown", pointer({ ...PX(300, 300), pointerType: "touch", pointerId: 4, timeStamp: 200, target: h.surface }));
    expect(vi.getTimerCount()).toBe(1);
    h.binding.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("bindInteraction: focus entry", () => {
  it("a focusin on an accessible element dispatches focus (and the reveal pan), is idempotent, and is ignored inside the binder's own flow", async () => {
    const h = await harness();
    h.container.fire("focusin", { target: h.item });
    expect(h.dispatched[0]).toEqual({ type: "focus", target: { node: { id: "s:c", type: "p" } } });
    expect(h.r.getState().focus).toEqual({ node: { id: "s:c", type: "p" } });
    h.dispatched.length = 0;
    h.container.fire("focusin", { target: h.item }); // already focused: nothing
    expect(h.dispatched).toEqual([]);
    h.container.fire("focusin", { target: h.surface }); // not an accessible element: nothing
    expect(h.dispatched).toEqual([]);
  });
  it("adds the reveal pan after a focus entry that was not caused by a pointer press, and not after one that was", async () => {
    const h = await harness();
    // an off-screen element: zoom in a lot around the left edge so that c is outside the margin box
    h.r.dispatch({ type: "set-viewport", center_x: -300000, center_y: 100000, zoom: 2680 });
    h.container.fire("focusin", { target: h.item });
    expect(h.dispatched.map((i) => i.type)).toEqual(["focus", "pan"]);
    const h2 = await harness();
    h2.r.dispatch({ type: "set-viewport", center_x: -300000, center_y: 100000, zoom: 2680 });
    h2.container.fire("pointerdown", pointer({ ...PX(1, 1), target: h2.item }));
    h2.container.fire("focusin", { target: h2.item });
    expect(h2.dispatched.map((i) => i.type)).toEqual(["focus"]);
  });
  it("the focus entry commits once and moves DOM focus to the semantic focus", async () => {
    const h = await harness();
    h.container.fire("focusin", { target: h.item });
    expect(h.commits.length).toBe(1);
    expect(h.focusTargets).toEqual([{ node: { id: "s:c", type: "p" } }]);
  });
});

describe("bindInteraction: audit findings M-7, M-8, M-9", () => {
  const keyEv = (key: string, t: number, o: Record<string, unknown> = {}) => ({ key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: t, ...o });

  it("M-7: an event whose timeStamp is beyond the t domain is refused and does not poison the clock", async () => {
    const h = await harness();
    h.container.fire("keydown", keyEv("ArrowRight", 1e300));
    expect(h.errors.length).toBe(1);
    expect(h.binding.machine().last_t).toBe(-1);
    h.container.fire("keydown", keyEv("ArrowRight", 10));
    h.container.fire("keydown", keyEv("ArrowRight", 11));
    expect(h.errors.length).toBe(1);
    expect(h.binding.machine().last_t).toBe(11);
    h.container.fire("keydown", keyEv("ArrowRight", 2 ** 52, { }));
    expect(h.binding.machine().last_t).toBe(2 ** 52); // the largest legal stamp is accepted
  });

  it("M-8: focus follows the semantic focus inside a shadow root (the host's root node, not the document)", async () => {
    const h = await harness();
    const shadow = { activeElement: null as FakeElement | null };
    (h.container as unknown as { getRootNode(): unknown }).getRootNode = () => shadow;
    h.doc.activeElement = null; // inside a shadow tree document.activeElement is the shadow HOST (outside the container), here nothing
    shadow.activeElement = h.item;
    h.container.fire("keydown", keyEv("ArrowRight", 1));
    expect(h.focusTargets.length).toBe(1);
    shadow.activeElement = null;
    h.container.fire("keydown", keyEv("ArrowRight", 2));
    expect(h.focusTargets.length).toBe(1); // DOM focus outside the widget: not moved
  });

  it("M-9 (a): the option object is closed and the container and target are checked at bind time", async () => {
    const model = await loadModel(G9.scene, G9.layout);
    const c = new FakeElement();
    const full = { model: () => model, state: () => undefined, dispatch: () => [], pick: () => undefined, addressOfElement: () => undefined, focusElement: () => {}, onCommit: () => {}, onOutput: () => {}, onError: () => {} };
    expect(() => bindInteraction(c as unknown as Element, full as never, { ...OPTS, surface: c as unknown as Element, bogus: 1 } as never)).toThrowError(expect.objectContaining({ code: "INVALID_CONFIG", reason: "SCHEMA" }));
    expect(() => bindInteraction(c as unknown as Element, { ...full, dispatch: undefined } as never, { ...OPTS, surface: c as unknown as Element })).toThrowError(expect.objectContaining({ code: "INVALID_CONFIG" }));
    expect(() => bindInteraction(null as never, full as never, { ...OPTS, surface: c as unknown as Element })).toThrowError(expect.objectContaining({ code: "INVALID_CONFIG" }));
    expect(c.listeners.length).toBe(0);
  });

  it("M-9 (b): dispose removes the tabindex the binder added, and only that", async () => {
    const h = await harness();
    h.container.fire("pointerdown", pointer({ ...PX(5, 5), target: h.surface }));
    expect(h.container.getAttribute("tabindex")).toBe("-1");
    h.binding.dispose();
    expect(h.container.hasAttribute("tabindex")).toBe(false);
    const h2 = await harness();
    h2.container.setAttribute("tabindex", "0");
    h2.container.fire("pointerdown", pointer({ ...PX(5, 5), target: h2.surface }));
    h2.binding.dispose();
    expect(h2.container.getAttribute("tabindex")).toBe("0");
  });

  it("M-9 (c): a press that fails in conversion does not leave the pointer-caused flag set", async () => {
    const h = await harness();
    h.r.dispatch({ type: "set-viewport", center_x: -300000, center_y: 100000, zoom: 2680 });
    h.surface.rect = { left: 10, top: 20, width: 0, height: 0 };
    h.container.fire("pointerdown", pointer({ ...PX(1, 1), target: h.item }));
    expect(h.errors.length).toBeGreaterThan(0);
    h.surface.rect = { left: 10, top: 20, width: 900, height: 600 };
    h.container.fire("focusin", { target: h.item });
    expect(h.dispatched.map((i) => i.type)).toEqual(["focus", "pan"]); // the reveal pan is applied: the flag was not stuck
  });

  it("M-9 (d): a held key that the binder drops is still prevented when a binding matches it (a held Space must not scroll the page); an unbound one is not", async () => {
    const h = await harness();
    expect(h.container.fire("keydown", keyEv(" ", 1, { repeat: true })).prevented).toBe(true);
    expect(h.container.fire("keydown", keyEv("Enter", 2, { repeat: true })).prevented).toBe(true);
    expect(h.container.fire("keydown", keyEv("Tab", 3, { repeat: true })).prevented).toBe(false);
    expect(h.container.fire("keydown", keyEv("x", 4, { repeat: true })).prevented).toBe(false);
    expect(h.dispatched).toEqual([]); // dropped: no action
  });

  it("M-9 (e) and M-2: the config is verified once at bind time; later changes to the caller's object do not reach the machine", async () => {
    const config = { wrap: true, bindings: [{ mode: "normal", key: "x", mods: 0, action: { type: "fit" } }] };
    const h = await harness({ config });
    config.bindings[0]!.key = "not a token";
    (config as { wrap: unknown }).wrap = "garbage";
    h.container.fire("keydown", keyEv("x", 1));
    expect(h.errors).toEqual([]);
    expect(h.dispatched).toEqual([{ type: "fit" }]);
  });
});
