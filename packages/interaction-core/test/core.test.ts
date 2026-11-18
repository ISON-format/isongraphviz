// Unit tests for the rules that no oracle row observes (design 15.7: "tested only in the TypeScript tranche"), the argument discipline of 27 14 (snapshot,
// refuse getters, read each property once, never mutate), integers and bigint, and the error classes of 14.2 that the E rows reach only partly.
import { describe, expect, it } from "vitest";
import { IgrError, initialState, layoutToScreen, reduce, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import {
  COORD_MAX_MILLI, DEFAULT_BINDINGS, IaError, createMachine, isKeyToken, keyToken, lassoTargets, parseMachine, prepareConfig, resolveNavigation, revealPan, serializeBindings, serializeMachine,
  serializeStep, step, validateEvent, verifyBindings,
} from "../src/index.js";
import { screenMicro } from "../src/geometry.js";
import { canonicalBytesSigned } from "isongraph-visualize-scene-core/primitives";
import { G9, SIZE, bytesOf, initial, loadModel } from "./helpers.js";

const code = (f: () => unknown): string => {
  try { f(); return "none"; } catch (e) { return e instanceof IaError || e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${String(e)}`; }
};
const key = (k: string, t = 0, mods = 0) => ({ type: "key", t, key: k, mods });
const frozen = <T>(v: T): T => { if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) frozen((v as Record<string, unknown>)[k]); Object.freeze(v); } return v; };

describe("validateEvent: the argument discipline", () => {
  const base = { button: 0, id: 1, mods: 0, ptype: "mouse", t: 5, type: "pointerdown", x: 100000, y: 200000 };
  it("an unreadable getter is SCHEMA, an own undefined counts as absent, __proto__ is an unknown key", () => {
    const g = { ...base }; Object.defineProperty(g, "x", { get: () => 1, enumerable: true });
    expect(code(() => validateEvent(g))).toBe("INVALID_EVENT/SCHEMA");
    expect(code(() => validateEvent({ ...base, x: undefined }))).toBe("INVALID_EVENT/SCHEMA"); // absent: missing
    expect(code(() => validateEvent({ ...base, target: undefined }))).toBe("none"); // absent optional
    expect(code(() => validateEvent(JSON.parse(`{"t":1,"type":"tick","__proto__":{"a":1}}`)))).toBe("INVALID_EVENT/SCHEMA");
    expect(code(() => validateEvent(Object.create({ t: 1, type: "tick" })))).toBe("INVALID_EVENT/SCHEMA"); // inherited fields are not own
    expect(code(() => validateEvent(new (class X { t = 1; type = "tick"; })()))).toBe("INVALID_EVENT/SCHEMA"); // not a plain object
    expect(code(() => validateEvent(null))).toBe("INVALID_EVENT/SCHEMA");
    expect(code(() => validateEvent("tick"))).toBe("INVALID_EVENT/SCHEMA");
  });
  it("returns an owned copy: later changes to the caller's object, its target and its address do not reach it; -0 becomes 0", () => {
    const target = { node: { id: "s:a", type: "p" } };
    const ev = { ...base, target, x: -0 };
    const out = validateEvent(ev) as unknown as { x: number; target: { node: { id: string } } };
    target.node.id = "changed";
    expect(out.target.node.id).toBe("s:a");
    expect(Object.is(out.x, 0)).toBe(true);
  });
  it("the number classes and domains of 4.2 at their edges", () => {
    const e = (o: Record<string, unknown>) => code(() => validateEvent({ ...base, ...o }));
    expect(e({ x: COORD_MAX_MILLI })).toBe("none");
    expect(e({ x: -COORD_MAX_MILLI })).toBe("none");
    expect(e({ x: COORD_MAX_MILLI + 1 })).toBe("INVALID_EVENT/OUT_OF_RANGE");
    expect(e({ t: 2 ** 52 })).toBe("none");
    expect(e({ id: 2 ** 31 - 1 })).toBe("none");
    expect(e({ id: 2 ** 31 })).toBe("INVALID_EVENT/OUT_OF_RANGE");
    expect(e({ x: Infinity })).toBe("INVALID_EVENT/NOT_FINITE");
    expect(e({ x: null })).toBe("INVALID_EVENT/SCHEMA");
    expect(e({ x: [] })).toBe("INVALID_EVENT/SCHEMA");
    expect(e({ button: -1 })).toBe("INVALID_EVENT/INVALID_VALUE"); // never OUT_OF_RANGE (A-02)
    expect(e({ button: 1e300 })).toBe("INVALID_EVENT/INVALID_VALUE");
    expect(e({ ptype: 5 })).toBe("INVALID_EVENT/SCHEMA");
    expect(code(() => validateEvent({ type: "wheel", t: 0, x: 0, y: 0, mods: 0, unit: 0, dy: 2 ** 40 }))).toBe("none");
    expect(code(() => validateEvent({ type: "wheel", t: 0, x: 0, y: 0, mods: 0, unit: 0, dy: 2 ** 40 + 1 }))).toBe("INVALID_EVENT/OUT_OF_RANGE");
    expect(code(() => validateEvent(key("Tab2")))).toBe("INVALID_EVENT/UNKNOWN_KEY");
    expect(code(() => validateEvent(key("")))).toBe("INVALID_EVENT/UNKNOWN_KEY");
    expect(code(() => validateEvent({ type: "tick", t: 0, target: { node: {} } }))).toBe("INVALID_EVENT/SCHEMA");
    expect(code(() => validateEvent({ ...base, target: { node: [] } }))).toBe("INVALID_EVENT/SCHEMA");
    expect(code(() => validateEvent({ ...base, target: { other: {} } }))).toBe("INVALID_EVENT/SCHEMA");
    expect(code(() => validateEvent({ type: "tick" }))).toBe("INVALID_EVENT/SCHEMA");
  });
});

describe("step: the argument discipline and the machine", () => {
  it("never mutates its arguments (frozen machine, event, state, model, config) and returns a frozen machine whose bytes round-trip", async () => {
    const { model, state } = await initial(G9);
    const cfg = frozen({ wrap: true, maxTargets: 100 });
    let m = createMachine();
    const events = [
      { type: "pointerdown", t: 0, id: 1, ptype: "touch", button: 0, x: 182000, y: 32000, mods: 0, target: { node: { id: "s:a", type: "p" } } },
      { type: "pointermove", t: 10, id: 1, x: 190000, y: 40000, mods: 0 },
      { type: "key", t: 11, key: "ArrowRight", mods: 0 },
      { type: "wheel", t: 12, x: 1, y: 2, dy: -150000, unit: 0, mods: 0 },
    ];
    for (const e of events) {
      const r = step(m, frozen(e), model, frozen(state), cfg);
      expect(Object.isFrozen(r.machine)).toBe(true);
      expect(serializeMachine(parseMachine(serializeMachine(r.machine)))).toEqual(serializeMachine(r.machine));
      m = r.machine;
    }
  });
  it("a machine argument is validated: a bad one is INVALID_MACHINE/SCHEMA, a model that is not a render model is INVALID_INPUT/NOT_A_RENDER_MODEL", async () => {
    const { model, state } = await initial(G9);
    expect(code(() => step({ ...createMachine(), gesture: "pan" }, key("Tab"), model, state))).toBe("INVALID_MACHINE/SCHEMA");
    expect(code(() => step(createMachine(), key("Tab"), {} as RenderModel, state))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
    expect(code(() => step(createMachine(), key("Tab"), model, state, { wrap: 1 } as never))).toBe("INVALID_CONFIG/SCHEMA");
    expect(code(() => step(createMachine(), key("Tab"), model, state, { bindings: [] } as never))).toBe("none"); // an empty table binds nothing
    expect(code(() => step(createMachine(), key("Tab"), model, state, { bindings: [{}] } as never))).toBe("INVALID_BINDINGS/SCHEMA"); // not re-wrapped (A-05)
    expect(code(() => step(createMachine(), { type: "tick", t: 1 }, model, state, { maxTargets: 2 ** 31 }))).toBe("none");
    expect(code(() => step(createMachine(), { type: "tick", t: 1 }, model, state, { maxTargets: 2 ** 31 + 1 }))).toBe("INVALID_CONFIG/OUT_OF_RANGE");
    expect(code(() => step(createMachine(), { type: "tick", t: 1 }, model, state, { maxTargets: NaN }))).toBe("INVALID_CONFIG/NOT_INTEGER");
    expect(code(() => step(createMachine(), { type: "tick", t: 1 }, model, state, { reveal: "no" } as never))).toBe("INVALID_CONFIG/SCHEMA");
    expect(code(() => step(createMachine(), { type: "tick", t: 1 }, model, state, 5 as never))).toBe("INVALID_CONFIG/SCHEMA");
  });
  it("the state is read only by an event that reads it: a plain drag costs no state validation", async () => {
    const { model } = await initial(G9);
    const garbage = { not: "a state" } as unknown as SemanticState;
    let m = createMachine();
    m = step(m, { type: "pointerdown", t: 0, id: 1, ptype: "mouse", button: 0, x: 0, y: 0, mods: 0 }, model, garbage).machine; // no target: reads nothing
    m = step(m, { type: "pointermove", t: 1, id: 1, x: 9000, y: 0, mods: 0 }, model, garbage).machine; // a drag reads nothing
    m = step(m, { type: "pointermove", t: 2, id: 1, x: 12000, y: 0, mods: 0 }, model, garbage).machine;
    expect(m.gesture).toBe("pan");
    expect(code(() => step(m, key("a", 3, 2), model, garbage))).toMatch(/^INVALID_STATE\//); // a key reads it: the IgrError propagates unchanged
    expect(code(() => step(createMachine(), { type: "dblclick", t: 0, x: 0, y: 0, mods: 0 }, model, garbage))).toBe("none");
    expect(code(() => step(createMachine(), { type: "wheel", t: 0, x: 0, y: 0, dy: -1, unit: 1, mods: 0 }, model, garbage))).toBe("none"); // unit 0 and 1 read nothing
    expect(code(() => step(createMachine(), { type: "wheel", t: 0, x: 0, y: 0, dy: -1, unit: 2, mods: 0 }, model, garbage))).toMatch(/^INVALID_STATE\//); // a page reads the height
  });
  it("a state with a getter is refused (INVALID_INPUT/UNREADABLE) and every property is read once", async () => {
    const { model, state } = await initial(G9);
    let reads = 0;
    const s = { ...state } as Record<string, unknown>;
    Object.defineProperty(s, "viewport", { get: () => { reads++; return state.viewport; }, enumerable: true });
    expect(code(() => step(createMachine(), key("ArrowRight"), model, s as unknown as SemanticState))).toBe("INVALID_INPUT/UNREADABLE");
    expect(reads).toBe(0); // the getter is refused, never invoked
  });
  it("wheel arithmetic is exact beyond 2^53: dy = -2^40 on a 16,384-pixel page is eight zooms and the residue of the exact quotient", async () => {
    const model = await loadModel(G9.scene, G9.layout);
    const state = initialState(model, { width: 100, height: 16384 });
    const r = step(createMachine(), { type: "wheel", t: 0, x: 0, y: 0, dy: -(2 ** 40), unit: 2, mods: 0 }, model, state);
    expect(r.outputs.length).toBe(8);
    const d = -(2n ** 40n) * 16384n; // milli-pixels
    const left = d + 8n * 100000n;
    expect(BigInt(r.machine.wheel_acc)).toBe(left - (left / 100000n) * 100000n);
    expect(Math.abs(r.machine.wheel_acc)).toBeLessThan(100000);
  });
  it("a click on a vanished target is silent, on an absent-at-press target it is a click on empty space (5.2, the two deliberately different cases)", async () => {
    const { model, state } = await initial(G9);
    const hide = (a: string): SemanticState => reduce(model, state, { type: "set-hidden", targets: [{ node: { id: `s:${a}`, type: "p" } }], hidden: true }).state;
    const down = { type: "pointerdown", t: 0, id: 1, ptype: "mouse", button: 0, x: 0, y: 0, mods: 0, target: { node: { id: "s:a", type: "p" } } };
    const up = { type: "pointerup", t: 1, id: 1, x: 0, y: 0, mods: 0 };
    // hidden at the press: the pointer has no target, the release is a click on empty space
    const d1 = step(createMachine(), down, model, hide("a"));
    expect(d1.machine.pointers[0]!.target).toBeUndefined();
    expect(step(d1.machine, up, model, hide("a")).outputs).toEqual([{ kind: "intent", intent: { type: "clear-selection" } }]);
    // unresolvable address at the press: the same
    const d2 = step(createMachine(), { ...down, target: { node: { id: "s:nope", type: "p" } } }, model, state);
    expect(d2.machine.pointers[0]!.target).toBeUndefined();
    // drawn at the press, hidden at the release: no output at all
    const d3 = step(createMachine(), down, model, state);
    expect(d3.machine.pointers[0]!.target).toEqual({ id: "s:a", type: "p" });
    expect(step(d3.machine, up, model, hide("a")).outputs).toEqual([]);
    // an address of the wrong kind is absent too
    const d4 = step(createMachine(), { ...down, target: { edge: { id: "s:a", type: "p" } } }, model, state);
    expect(d4.machine.pointers[0]!.target).toBeUndefined();
  });
  it("a duplicate pointerdown of a known id changes nothing and is handled; a third pointer is ignored and handled; a long-pressed pointer keeps long in a pinch", async () => {
    const { model, state } = await initial(G9);
    const down = (id: number, t: number, ptype = "touch") => ({ type: "pointerdown", t, id, ptype, button: 0, x: id * 100000, y: 100000, mods: 0 });
    let r = step(createMachine(), down(1, 0), model, state);
    const before = serializeMachine(r.machine);
    r = step(r.machine, down(1, 1), model, state);
    expect(r.handled).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(serializeMachine(r.machine))).pointers).toEqual(JSON.parse(new TextDecoder().decode(before)).pointers);
    r = step(r.machine, { type: "tick", t: 600 }, model, state); // the long press fires
    expect(r.machine.pointers[0]!.long).toBe(true);
    r = step(r.machine, down(2, 700), model, state); // a pinch with a long-pressed pointer
    expect(r.machine.gesture).toBe("pinch");
    expect(r.machine.pointers[0]!.long).toBe(true);
    expect(serializeMachine(parseMachine(serializeMachine(r.machine)))).toEqual(serializeMachine(r.machine));
    const third = step(r.machine, down(3, 800), model, state);
    expect(third.handled).toBe(true);
    expect(third.machine.pointers.length).toBe(2);
  });
  it("a mouse and a touch pointer may pinch (ptype is irrelevant)", async () => {
    const { model, state } = await initial(G9);
    let r = step(createMachine(), { type: "pointerdown", t: 0, id: 0, ptype: "mouse", button: 0, x: 0, y: 0, mods: 0 }, model, state);
    r = step(r.machine, { type: "pointerdown", t: 1, id: 5, ptype: "touch", button: 0, x: 100000, y: 0, mods: 0 }, model, state);
    expect(r.machine.gesture).toBe("pinch");
  });
  it("a cancelled lasso outputs lasso-end and no selection; a second pointer during a lasso emits lasso-end first", async () => {
    const { model, state } = await initial(G9);
    let r = step(createMachine(), { type: "pointerdown", t: 0, id: 1, ptype: "mouse", button: 0, x: 0, y: 0, mods: 4 }, model, state);
    r = step(r.machine, { type: "pointermove", t: 1, id: 1, x: 50000, y: 50000, mods: 4 }, model, state);
    expect(r.machine.gesture).toBe("lasso");
    const c = step(r.machine, { type: "pointercancel", t: 2, id: 1 }, model, state);
    expect(c.outputs).toEqual([{ kind: "lasso-end" }]);
    expect(c.machine.gesture).toBe("idle");
    const two = step(r.machine, { type: "pointerdown", t: 2, id: 2, ptype: "mouse", button: 0, x: 90000, y: 0, mods: 0 }, model, state);
    expect(two.outputs).toEqual([{ kind: "lasso-end" }]);
    expect(two.machine.gesture).toBe("pinch");
  });
  it("tick reads the state only when it fires a long press, and looks the target up in the state of the tick", async () => {
    const { model, state } = await initial(G9);
    const hidden = reduce(model, state, { type: "set-hidden", targets: [{ node: { id: "s:a", type: "p" } }], hidden: true }).state;
    let r = step(createMachine(), { type: "pointerdown", t: 0, id: 1, ptype: "touch", button: 0, x: 182000, y: 32000, mods: 0, target: { node: { id: "s:a", type: "p" } } }, model, state);
    const tk = step(r.machine, { type: "tick", t: 500 }, model, hidden);
    expect(tk.outputs).toEqual([{ kind: "context-action", source: "long-press", x: 182, y: 32 }]); // dropped: no longer drawn
    expect(step(r.machine, { type: "tick", t: 499 }, model, { garbage: 1 } as never).outputs).toEqual([]); // nothing fires: nothing is read
    r = tk;
    expect(r.wake_at).toBeUndefined();
  });
  it("contextmenu carries the target only if it is drawn in the state of the event", async () => {
    const { model, state } = await initial(G9);
    const hidden = reduce(model, state, { type: "set-hidden", targets: [{ node: { id: "s:a", type: "p" } }], hidden: true }).state;
    const ev = { type: "contextmenu", t: 0, x: 182000, y: 32000, mods: 0, target: { node: { id: "s:a", type: "p" } } };
    expect((step(createMachine(), ev, model, state).outputs[0] as { target?: unknown }).target).toBeDefined();
    expect((step(createMachine(), ev, model, hidden).outputs[0] as { target?: unknown }).target).toBeUndefined();
  });
  it("select-all and the lasso count boundary are inclusive in step and in the marquee commit; marquee state survives a round trip", async () => {
    const { model, state } = await initial(G9);
    const eventsFor = (n: number) => step(createMachine(), key("a", 0, 2), model, state, { maxTargets: n }).outputs[0] as { kind: string };
    expect(eventsFor(18).kind).toBe("intent");
    expect(eventsFor(17)).toEqual({ kind: "nav", event: { type: "select-all-too-large", count: 18 } });
    const focused = reduce(model, state, { type: "focus", target: { node: { id: "s:a", type: "p" } } }).state;
    const m1 = step(createMachine(), key("m"), model, focused).machine;
    expect(m1.mode).toBe("marquee");
    expect(m1.anchor).toEqual({ id: "s:a", type: "p" });
    expect(serializeMachine(parseMachine(serializeMachine(m1)))).toEqual(serializeMachine(m1));
  });
});

describe("parseMachine and serializeMachine", () => {
  const bytes = (o: unknown) => canonicalBytesSigned(o as never);
  const base = () => JSON.parse(new TextDecoder().decode(serializeMachine(createMachine()))) as Record<string, unknown>;
  it("a machine over 1 MiB is RESOURCE_LIMIT/BYTES_LIMIT; a bracket bomb is a structured SCHEMA error", () => {
    expect(code(() => parseMachine(new Uint8Array(1_048_577).fill(0x20)))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(code(() => parseMachine(bytesOf("[".repeat(100_000) + "]".repeat(100_000))))).toBe("INVALID_MACHINE/SCHEMA");
    expect(code(() => parseMachine(bytesOf("{".repeat(1000))))).toBe("INVALID_MACHINE/SCHEMA");
    expect(code(() => parseMachine(new Uint8Array([0xff, 0xfe])))).toBe("INVALID_MACHINE/SCHEMA");
    expect(code(() => parseMachine(bytesOf("")))).toBe("INVALID_MACHINE/SCHEMA");
    expect(code(() => parseMachine("{}" as never))).toBe("INVALID_MACHINE/SCHEMA");
  });
  it("numeric domains: last_t in [-1, 2^52], remainders in [-500, 499], wheel_acc below 100000, pointer fields within the event domains (audit M-5)", () => {
    const ok = (patch: Record<string, unknown>) => code(() => parseMachine(bytes({ ...base(), ...patch })));
    expect(ok({ last_t: -1 })).toBe("none");
    expect(ok({ last_t: 2 ** 52 })).toBe("none");
    expect(ok({ last_t: -2 })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ last_t: 2 ** 52 + 1 })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ wheel_acc: 99999 })).toBe("none");
    expect(ok({ wheel_acc: 100000 })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ rem_x: 0, rem_y: 0, gesture: "idle", mode: "other" })).toBe("INVALID_MACHINE/SCHEMA");
    const p = { button: 0, id: 1, lasso: false, long: false, mods0: 0, moved: false, ptype: "mouse", t0: 0, x: 2 ** 50, x0: 0, y: 0, y0: 0 };
    expect(ok({ gesture: "press", pointers: [p] })).toBe("INVALID_MACHINE/SCHEMA"); // x beyond 2^39: the event domain holds at the machine too (5.1 as amended)
    expect(ok({ gesture: "press", pointers: [{ ...p, x: 2 ** 39 }] })).toBe("none");
  });
  it("invariants: anchor iff marquee; long only for touch; rem zero outside pan and pinch; pinch iff pinch gesture; pointers ascending", () => {
    const ok = (patch: Record<string, unknown>) => code(() => parseMachine(bytes({ ...base(), ...patch })));
    expect(ok({ mode: "marquee" })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ mode: "marquee", anchor: { id: "s:a", type: "p" } })).toBe("none");
    expect(ok({ anchor: { id: "s:a", type: "p" } })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ rem_x: 5 })).toBe("INVALID_MACHINE/SCHEMA");
    const p = (id: number, extra: Record<string, unknown> = {}) => ({ button: 0, id, lasso: false, long: false, mods0: 0, moved: false, ptype: "mouse", t0: 0, x: 0, x0: 0, y: 0, y0: 0, ...extra });
    expect(ok({ gesture: "press", pointers: [p(1, { long: true })] })).toBe("INVALID_MACHINE/SCHEMA"); // long on a mouse pointer
    expect(ok({ gesture: "press", pointers: [p(1, { long: true, ptype: "touch" })] })).toBe("none");
    expect(ok({ gesture: "press", pointers: [p(1, { moved: true })] })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ gesture: "pan", pointers: [p(1, { moved: true })] })).toBe("none");
    expect(ok({ gesture: "pan", pointers: [p(1, { moved: true, lasso: true })] })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ gesture: "lasso", pointers: [p(1, { moved: true, lasso: true })] })).toBe("none");
    expect(ok({ gesture: "pinch", pointers: [p(1, { moved: true }), p(2, { moved: true })], pinch: { d: 1, mx: 0, my: 0 } })).toBe("none");
    expect(ok({ gesture: "pinch", pointers: [p(2, { moved: true }), p(1, { moved: true })], pinch: { d: 1, mx: 0, my: 0 } })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ gesture: "pinch", pointers: [p(1, { moved: true }), p(2, { moved: true })] })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ gesture: "idle", pointers: [p(1), p(2), p(3)] })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ gesture: "press", pointers: [p(1, { target: { id: "s:a", type: "p" } })] })).toBe("none");
    expect(ok({ gesture: "press", pointers: [p(1, { target: { id: "s:a" } })] })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ unknown: 1 })).toBe("INVALID_MACHINE/SCHEMA");
    expect(ok({ gesture: "nope" })).toBe("INVALID_MACHINE/SCHEMA");
  });
  it("serializeStep has wake_at only when present, no null anywhere, no trailing newline", () => {
    const b = new TextDecoder().decode(serializeStep({ handled: true, outputs: [{ kind: "lasso-end" }] }));
    expect(b).toBe('{"handled":true,"outputs":[{"kind":"lasso-end"}]}');
    expect(new TextDecoder().decode(serializeStep({ handled: false, outputs: [], wake_at: 500 }))).toBe('{"handled":false,"outputs":[],"wake_at":500}');
    expect(new TextDecoder().decode(serializeMachine(createMachine()))).not.toContain("null");
  });
});

describe("bindings and key tokens", () => {
  it("keyToken and isKeyToken over the whole grammar", () => {
    for (const k of "abcdefghijklmnopqrstuvwxyz0123456789+-=[],./;") { expect(isKeyToken(k)).toBe(true); expect(keyToken(k)).toBe(k); }
    for (const k of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") expect(keyToken(k)).toBe(k.toLowerCase());
    for (const k of ["#", "é", "F1", "ab", "", "Shift", "Control", "Dead", "😀"]) { expect(keyToken(k)).toBeUndefined(); }
    expect(isKeyToken("Space")).toBe(true);
    expect(isKeyToken("Backspace")).toBe(true);
    expect(isKeyToken("A")).toBe(false);
    expect(isKeyToken("Esc")).toBe(false);
    expect(keyToken("Delete")).toBe("Delete");
    expect(keyToken(5 as never)).toBeUndefined();
  });
  it("the default table is 33 rows, verifies, is frozen and copies", () => {
    expect(DEFAULT_BINDINGS.length).toBe(33);
    expect(Object.isFrozen(DEFAULT_BINDINGS)).toBe(true);
    const v = verifyBindings(DEFAULT_BINDINGS);
    expect(v).toEqual(DEFAULT_BINDINGS);
    expect(v[0]).not.toBe(DEFAULT_BINDINGS[0]);
    expect(serializeBindings(DEFAULT_BINDINGS).length).toBe(2680);
  });
  it("verifyBindings reads once and refuses getters; the action field domains are INVALID_VALUE", () => {
    const row = { action: { type: "fit" }, key: "0", mode: "normal", mods: 0 };
    const g = { ...row }; Object.defineProperty(g, "key", { get: () => "0", enumerable: true });
    expect(code(() => verifyBindings([g]))).toBe("INVALID_BINDINGS/SCHEMA");
    expect(code(() => verifyBindings("x"))).toBe("INVALID_BINDINGS/SCHEMA");
    expect(code(() => verifyBindings([{ ...row, extra: 1 }]))).toBe("INVALID_BINDINGS/SCHEMA");
    const withAction = (action: unknown) => code(() => verifyBindings([{ ...row, action }]));
    expect(withAction({ type: "zoom", factor: 0 })).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(withAction({ type: "zoom", factor: 1_000_001 })).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(withAction({ type: "zoom", factor: 1_000_000 })).toBe("none");
    expect(withAction({ type: "pan", dx: 2 ** 31 + 1, dy: 0 })).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(withAction({ type: "pan", dx: 1 })).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(withAction({ type: "fit", extra: true })).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(withAction({ type: "spatial", dir: "left" })).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(withAction({ type: "spatial", dir: "north", extend: false })).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(withAction({ type: "step", delta: 0 })).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(withAction("fit")).toBe("INVALID_BINDINGS/UNKNOWN_ACTION");
    expect(code(() => verifyBindings([{ ...row, mode: "x-A" }]))).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(code(() => verifyBindings([{ ...row, mode: "x-a b" }]))).toBe("INVALID_BINDINGS/INVALID_VALUE"); // a space is outside x-[a-z0-9][a-z0-9._-]*
    expect(code(() => verifyBindings([{ ...row, mode: "x-a.b-c" }, { ...row, mode: "x-a.b-c", key: "Escape", action: { type: "clear-selection" } }]))).toBe("none");
    expect(code(() => verifyBindings([{ ...row, mods: "0" }]))).toBe("INVALID_BINDINGS/INVALID_VALUE");
    expect(code(() => verifyBindings([{ ...row, key: 5 }]))).toBe("INVALID_BINDINGS/UNKNOWN_KEY");
  });
  it("the shift bit: ignored for digits and punctuation (so + with shift is the + row), compared exactly for letters, named keys and Space", async () => {
    const { model, state } = await initial(G9);
    const z = (k: string, mods: number) => step(createMachine(), key(k, 0, mods), model, state).handled;
    expect(z("+", 0)).toBe(true); expect(z("+", 1)).toBe(true); expect(z("+", 2)).toBe(false); expect(z("0", 1)).toBe(true);
    expect(z("e", 0)).toBe(true); expect(z("e", 1)).toBe(true); expect(z("e", 2)).toBe(false); expect(z("s", 1)).toBe(false);
    expect(z("Enter", 1)).toBe(false); expect(z("Space", 1)).toBe(false); expect(z("Space", 0)).toBe(true);
    expect(z("ArrowRight", 8)).toBe(false); // meta is exact
    expect(z("ArrowRight", 4)).toBe(false); // alt is exact
  });
  it("a custom table replaces the default; host modes are never entered by the machine", async () => {
    const { model, state } = await initial(G9);
    const table = [{ mode: "normal", key: "x", mods: 0, action: { type: "fit" } }, { mode: "x-edit", key: "Escape", mods: 0, action: { type: "clear-selection" } }];
    expect(step(createMachine(), key("x"), model, state, { bindings: table as never }).outputs).toEqual([{ kind: "intent", intent: { type: "fit" } }]);
    expect(step(createMachine(), key("Home"), model, state, { bindings: table as never }).handled).toBe(false);
  });
});

describe("navigation: arguments and the reveal rule", () => {
  it("resolveNavigation validates its command and options and reads the state once", async () => {
    const { model, state } = await initial(G9);
    expect(code(() => resolveNavigation(model, state, { type: "nav-step", delta: 1 }, { wrap: "x" } as never))).toBe("INVALID_COMMAND/SCHEMA");
    expect(code(() => resolveNavigation(model, state, { type: "nav-step", delta: 1 }, { nope: true } as never))).toBe("INVALID_COMMAND/SCHEMA");
    expect(code(() => resolveNavigation(model, state, { type: "nav-step" }))).toBe("INVALID_COMMAND/SCHEMA");
    expect(code(() => resolveNavigation(model, state, { type: 5 }))).toBe("INVALID_COMMAND/SCHEMA");
    expect(code(() => resolveNavigation(model, state, { type: "nav-endpoint", end: "mid" }))).toBe("INVALID_COMMAND/INVALID_VALUE");
    expect(code(() => resolveNavigation(model, state, { type: "nav-incident", delta: 0 }))).toBe("INVALID_COMMAND/INVALID_VALUE");
    expect(code(() => resolveNavigation(model, { ...state, igr: "IGR/2" } as never, { type: "nav-step", delta: 1 }))).toMatch(/^INVALID_STATE\//);
    expect(resolveNavigation(model, state, { type: "nav-spatial", dir: "left" }).outputs).toEqual([{ kind: "intent", intent: { type: "focus-last" } }, ...revealOf(model, state, "last")]);
  });
  function revealOf(model: RenderModel, state: SemanticState, which: "first" | "last") {
    // the last element of G9 is the edge h>i
    const edge = model.edges[model.edges.length - 1]!;
    const pan = revealPan(model, state, which === "last" ? { edge: edge.ref } : { node: model.nodes[0]!.ref });
    return pan === undefined ? [] : [{ kind: "intent", intent: pan }];
  }
  it("revealPan: undefined inside the margin box, the 2^31 omission, a pan for an off-screen edge, errors for a malformed target, undefined for an unknown one", async () => {
    const { model, state } = await initial(G9);
    expect(revealPan(model, state, { node: model.nodes[4]!.ref })).toBeUndefined();
    expect(code(() => revealPan(model, state, { node: model.nodes[0]!.ref, edge: model.edges[0]!.ref } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => revealPan(model, state, "x" as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(revealPan(model, state, { node: { id: "s:nope", type: "p" } })).toBeUndefined();
    expect(revealPan(model, state, { edge: { id: "s:a", type: "p" } } as never)).toBeUndefined(); // a node address under edge is not an edge
    const far = reduce(model, state, { type: "set-viewport", center_x: 2 ** 52, center_y: 0, zoom: 100_000 }).state;
    expect(revealPan(model, far, { node: model.nodes[0]!.ref })).toBeUndefined(); // |dx| would exceed 2^31: no pan
    const near = reduce(model, state, { type: "set-viewport", center_x: 1_000_000_000, center_y: 0, zoom: 100_000 }).state;
    const pan = revealPan(model, near, { node: model.nodes[0]!.ref });
    expect(pan).toMatchObject({ type: "pan" });
    expect(Object.isFrozen(pan)).toBe(true);
  });
  it("the micro-pixel position equals layoutToScreen to within 1e-6 over generated viewports (the pinned copy of 3.4)", async () => {
    const model = await loadModel(G9.scene, G9.layout);
    let seed = 12345;
    const next = (n: number): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % n; };
    for (let i = 0; i < 400; i++) {
      const vp = { center_x: next(4_000_001) - 2_000_000, center_y: next(4_000_001) - 2_000_000, width: 1 + next(2000), height: 1 + next(2000), zoom: 10 + next(100_000) };
      const n = model.nodes[next(model.nodes.length)]!;
      const m = screenMicro(vp, n.x, n.y);
      const d = layoutToScreen(vp, { x: n.x, y: n.y });
      expect(Math.abs(d.x - Number(m.X) / 1e6)).toBeLessThan(1e-6);
      expect(Math.abs(d.y - Number(m.Y) / 1e6)).toBeLessThan(1e-6);
    }
  });
  it("lassoTargets: both corner orders, closed border, hidden nodes and edges never appear", async () => {
    const { model, state } = await initial(G9);
    const r = { x0: 150000, y0: 0, x1: 450000, y1: 350000 };
    const fwd = lassoTargets(model, state, r);
    expect(lassoTargets(model, state, { x0: r.x1, y0: r.y1, x1: r.x0, y1: r.y0 })).toEqual(fwd);
    expect(fwd.length).toBe(8);
    const hid = reduce(model, state, { type: "set-hidden", targets: [{ node: { id: "s:d", type: "p" } }], hidden: true }).state;
    expect(lassoTargets(model, hid, r).length).toBe(6); // d and the edge a>d are gone
    expect(code(() => lassoTargets(model, state, null as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => lassoTargets(model, state, { x0: 0, y0: 0, x1: 1, y1: 1, z: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => lassoTargets(model, state, { x0: "0", y0: 0, x1: 1, y1: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
    expect(code(() => lassoTargets(model, state, { x0: NaN, y0: 0, x1: 1, y1: 1 }))).toBe("INVALID_INPUT/NOT_INTEGER");
    expect(code(() => lassoTargets(model, state, { x0: -(COORD_MAX_MILLI + 1), y0: 0, x1: 1, y1: 1 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    void SIZE;
  });
});

describe("audit M-2: the binding table is verified once, not at every event", () => {
  const bigTable = (modes: number) => {
    const rows: unknown[] = [];
    for (let i = 0; i < modes; i++) { rows.push({ mode: `x-m${i}`, key: "a", mods: 0, action: { type: "fit" } }, { mode: `x-m${i}`, key: "Escape", mods: 0, action: { type: "clear-selection" } }); }
    return [...DEFAULT_BINDINGS, ...rows];
  };
  it("prepareConfig returns a frozen verified config that step accepts by identity; a raw config still works and gives the same result", async () => {
    const { model, state } = await initial(G9);
    const raw = { wrap: true, maxTargets: 7, bindings: bigTable(3) };
    const prepared = prepareConfig(raw as never);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.bindings)).toBe(true);
    raw.bindings.length = 0; // a later change to the caller's table does not matter
    const ev = { type: "key", t: 0, key: "Home", mods: 0 };
    expect(step(createMachine(), ev, model, state, prepared).outputs).toEqual(step(createMachine(), ev, model, state).outputs);
    expect(prepareConfig(prepared)).toBe(prepared); // idempotent
    expect(code(() => prepareConfig({ wrap: 1 } as never))).toBe("INVALID_CONFIG/SCHEMA");
    expect(code(() => prepareConfig({ bindings: [{}] } as never))).toBe("INVALID_BINDINGS/SCHEMA");
    expect(prepareConfig(undefined)).toMatchObject({ wrap: false, reveal: true, maxTargets: 60000 });
  });
  it("200 pointer moves with a prepared 6,000-row table cost milliseconds (the O(1) per pointer event claim of 14.1)", async () => {
    const { model, state } = await initial(G9);
    const prepared = prepareConfig({ bindings: bigTable(3000) } as never);
    let m = step(createMachine(), { type: "pointerdown", t: 0, id: 1, ptype: "mouse", button: 0, x: 0, y: 0, mods: 0 }, model, state, prepared).machine;
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) m = step(m, { type: "pointermove", t: i + 1, id: 1, x: 10000 + i * 1000, y: 0, mods: 0 }, model, state, prepared).machine;
    expect(Date.now() - t0).toBeLessThan(500); // verifying the table per event took about 17 ms each (3.3 s)
  });
  it("verifyBindings is linear in the number of distinct modes", () => {
    const t0 = Date.now();
    expect(verifyBindings(bigTable(40_000)).length).toBe(DEFAULT_BINDINGS.length + 80_000);
    expect(Date.now() - t0).toBeLessThan(800);
  });
});
