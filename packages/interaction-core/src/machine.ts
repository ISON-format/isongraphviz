// src/machine.ts - the gesture machine igr-input-machine/1 (design 5): machine state, the pure `step`, outputs, serializers and the strict machine reader.
// step(machine, event, model, state, config) is a pure function: it returns a new (frozen) machine and a result; nothing is mutated. The state argument is the
// committed SemanticState of the renderer; it is validated with the full 27 4.2 rules only when the event reads it (5).
import type { Intent, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { IgrError, isRenderModel } from "isongraph-visualize-renderer-core";
import { canonicalBytesSigned, hasLoneSurrogate, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { DEFAULT_BINDINGS, matchBinding, verifyBindings, type Binding, type BindingAction } from "./bindings.js";
import { IaError } from "./errors.js";
import { COORD_MAX_MILLI, DRAG_THRESHOLD_MILLI, LONG_PRESS_MS, WHEEL_MAX_NOTCHES, WHEEL_NOTCH_MILLI, checkTime, validateEvent, type EventTarget, type PointerType } from "./events.js";
import {
  addressOf, divRound, divRoundN, drawnElement, floorDiv, isEdge, isqrt, noNegZero, objectRef, plainEntries, readView, screenMicro, traversal, wireOf,
  type Element, type View,
} from "./geometry.js";
import { lassoTargetsMicro } from "./lasso.js";
import { navigate, navigateEnd, type NavCommand, type NavEvent, type NavOptions } from "./navigation.js";

export type Gesture = "idle" | "press" | "pan" | "lasso" | "pinch";
export type WireNode = { id: string; type: string };
export type WireEdge = { ord: string; rel: string; src: WireNode; tgt: WireNode };
export interface PointerState {
  readonly button: number; readonly id: number; readonly lasso: boolean; readonly long: boolean; readonly mods0: number; readonly moved: boolean;
  readonly ptype: PointerType; readonly t0: number; readonly target?: WireNode | WireEdge; readonly x: number; readonly x0: number; readonly y: number; readonly y0: number;
}
export interface MachineState {
  readonly anchor?: WireNode;
  readonly gesture: Gesture;
  readonly last_t: number;
  readonly mode: "normal" | "marquee";
  readonly pinch?: { readonly d: number; readonly mx: number; readonly my: number };
  readonly pointers: readonly PointerState[];
  readonly rem_x: number; readonly rem_y: number;
  readonly wheel_acc: number;
}
export interface MachineConfig { bindings?: readonly Binding[]; wrap?: boolean; maxTargets?: number; reveal?: boolean }

export type Output =
  | { kind: "intent"; intent: Intent }
  | { kind: "nav"; event: NavEvent }
  | { kind: "activate"; target: { address: unknown; artifact_sha256: string } }
  | { kind: "context-action"; source: "pointer" | "long-press" | "keyboard"; target?: { address: unknown; artifact_sha256: string }; x?: number; y?: number }
  | { kind: "lasso-preview"; rect: { x0: number; x1: number; y0: number; y1: number } }
  | { kind: "lasso-end" };
export interface StepResult { machine: MachineState; handled: boolean; outputs: Output[]; wake_at?: number }

const DEFAULT_MAX_TARGETS = 60_000;

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Machine state (5.1)
// ---------------------------------------------------------------------------------------------------------------------------------------------
type Mut<T> = { -readonly [K in keyof T]: T[K] };
type MPointer = Mut<PointerState>;
interface MMachine { gesture: Gesture; last_t: number; mode: "normal" | "marquee"; anchor?: WireNode; pinch?: { d: number; mx: number; my: number }; pointers: MPointer[]; rem_x: number; rem_y: number; wheel_acc: number }

const deepFreeze = <T>(v: T): T => {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]); Object.freeze(v); }
  return v;
};

/** The initial machine (5.1): idle, no pointer, last_t -1, mode normal. */
export function createMachine(): MachineState {
  return deepFreeze({ gesture: "idle", last_t: -1, mode: "normal", pointers: [], rem_x: 0, rem_y: 0, wheel_acc: 0 } as MachineState);
}

const badMachine = (detail: string): IaError => new IaError("INVALID_MACHINE", "SCHEMA", undefined, detail);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const GESTURES: readonly unknown[] = ["idle", "press", "pan", "lasso", "pinch"];

function readWireNode(v: unknown): WireNode {
  const e = plainEntries(v);
  const id = e?.get("id"), type = e?.get("type");
  if (e === undefined || e.size !== 2 || typeof id !== "string" || typeof type !== "string") throw badMachine("a node address {id, type} expected");
  if (hasLoneSurrogate(id) || hasLoneSurrogate(type)) throw badMachine("an address string holds a lone surrogate"); // never an IgsError from the serializer
  return { id, type };
}
function readWireEdge(v: unknown): WireEdge {
  const e = plainEntries(v);
  const ord = e?.get("ord"), rel = e?.get("rel");
  if (e === undefined || e.size !== 4 || typeof ord !== "string" || typeof rel !== "string" || hasLoneSurrogate(ord) || hasLoneSurrogate(rel)) throw badMachine("an edge address {ord, rel, src, tgt} expected");
  return { ord, rel, src: readWireNode(e.get("src")), tgt: readWireNode(e.get("tgt")) };
}

function readPointer(v: unknown): MPointer {
  const e = plainEntries(v);
  const REQUIRED = ["button", "id", "lasso", "long", "mods0", "moved", "ptype", "t0", "x", "x0", "y", "y0"];
  if (e === undefined || !REQUIRED.every((k) => e.has(k)) || e.size !== REQUIRED.length + (e.has("target") ? 1 : 0)) throw badMachine("a pointer with its closed key set expected");
  const int = (k: string, lo = -Infinity, hi = Infinity): number => { const x = e.get(k); if (!isInt(x) || x < lo || x > hi) throw badMachine(`${k}: an integer ${lo === -Infinity ? "" : `in [${lo}, ${hi}] `}expected`); return noNegZero(x); };
  const flag = (k: string): boolean => { const x = e.get(k); if (typeof x !== "boolean") throw badMachine(`${k}: a boolean expected`); return x; };
  const ptype = e.get("ptype");
  if (ptype !== "mouse" && ptype !== "touch" && ptype !== "pen") throw badMachine("ptype");
  const mods0 = int("mods0");
  if (mods0 < 0 || mods0 > 15) throw badMachine("mods0");
  // the event domains of 4.2 hold at the machine too (a machine that `step` did not produce must not make `step` emit an intent the reducer refuses)
  const c = COORD_MAX_MILLI;
  const p: MPointer = { button: int("button"), id: int("id", 0, 2 ** 31 - 1), lasso: flag("lasso"), long: flag("long"), mods0, moved: flag("moved"), ptype, t0: int("t0", 0, 2 ** 52), x: int("x", -c, c), x0: int("x0", -c, c), y: int("y", -c, c), y0: int("y0", -c, c) };
  if (e.has("target")) {
    const raw = e.get("target");
    p.target = plainEntries(raw)?.has("ord") === true ? readWireEdge(raw) : readWireNode(raw);
  }
  return p;
}

/** The strict reader of a machine object (5.1): closed key sets, the stated numeric domains and the invariants; INVALID_MACHINE/SCHEMA on any deviation. */
export function readMachine(value: unknown): MMachine {
  const e = plainEntries(value);
  if (e === undefined) throw badMachine("a plain object expected");
  const KEYS = ["anchor", "gesture", "last_t", "mode", "pinch", "pointers", "rem_x", "rem_y", "wheel_acc"];
  for (const k of e.keys()) if (!KEYS.includes(k)) throw badMachine(`unknown key ${k}`);
  for (const k of ["gesture", "last_t", "mode", "pointers", "rem_x", "rem_y", "wheel_acc"]) if (!e.has(k)) throw badMachine(`missing key ${k}`);
  const gesture = e.get("gesture"), mode = e.get("mode");
  if (!GESTURES.includes(gesture)) throw badMachine("gesture");
  if (mode !== "normal" && mode !== "marquee") throw badMachine("mode");
  const last_t = e.get("last_t"), rem_x = e.get("rem_x"), rem_y = e.get("rem_y"), wheel_acc = e.get("wheel_acc");
  if (!isInt(last_t) || last_t < -1 || last_t > 2 ** 52) throw badMachine("last_t");
  if (!isInt(rem_x) || rem_x < -500 || rem_x > 499 || !isInt(rem_y) || rem_y < -500 || rem_y > 499) throw badMachine("rem_x or rem_y");
  if (!isInt(wheel_acc) || Math.abs(wheel_acc) >= WHEEL_NOTCH_MILLI) throw badMachine("wheel_acc");
  const list = e.get("pointers");
  if (!Array.isArray(list) || list.length > 2) throw badMachine("pointers");
  const pointers: MPointer[] = [];
  for (let i = 0; i < list.length; i++) {
    const d = Object.getOwnPropertyDescriptor(list, String(i));
    if (d === undefined || d.get !== undefined || d.set !== undefined) throw badMachine("pointers");
    const p = readPointer(d.value);
    if (i > 0 && p.id <= pointers[i - 1]!.id) throw badMachine("pointers are not in ascending id order");
    pointers.push(p);
  }
  const m: MMachine = { gesture: gesture as Gesture, last_t, mode, pointers, rem_x: noNegZero(rem_x), rem_y: noNegZero(rem_y), wheel_acc: noNegZero(wheel_acc) };
  if (e.has("anchor")) m.anchor = readWireNode(e.get("anchor"));
  if (e.has("pinch")) {
    const pe = plainEntries(e.get("pinch"));
    const d = pe?.get("d"), mx = pe?.get("mx"), my = pe?.get("my");
    const c = COORD_MAX_MILLI;
    if (pe === undefined || pe.size !== 3 || !isInt(d) || !isInt(mx) || !isInt(my) || d < 0 || d > 2 ** 41 || Math.abs(mx) > c || Math.abs(my) > c) throw badMachine("pinch");
    m.pinch = { d, mx: noNegZero(mx), my: noNegZero(my) };
  }
  // the invariants of 5.1
  const n = pointers.length;
  const ok =
    (n === 0) === (m.gesture === "idle") &&
    (m.gesture !== "press" || (n === 1 && !pointers[0]!.moved && !pointers[0]!.lasso)) &&
    (m.gesture !== "pan" || (n >= 1 && pointers.every((p) => p.moved && !p.lasso))) &&
    (m.gesture !== "lasso" || (n === 1 && pointers[0]!.lasso && pointers[0]!.moved)) &&
    (m.gesture !== "pinch" || (n === 2 && pointers.every((p) => p.moved && !p.lasso) && m.pinch !== undefined)) &&
    (m.gesture === "pinch") === (m.pinch !== undefined) &&
    ((m.rem_x === 0 && m.rem_y === 0) || m.gesture === "pan" || m.gesture === "pinch") &&
    (m.mode === "marquee") === (m.anchor !== undefined) &&
    pointers.every((p) => !p.long || p.ptype === "touch");
  if (!ok) throw badMachine("an invariant of 5.1 is violated");
  return m;
}

const pointerJson = (p: PointerState): Record<string, CJValue> => {
  const o: Record<string, CJValue> = { button: p.button, id: p.id, lasso: p.lasso, long: p.long, mods0: p.mods0, moved: p.moved, ptype: p.ptype, t0: p.t0, x: p.x, x0: p.x0, y: p.y, y0: p.y0 };
  if (p.target !== undefined) o["target"] = p.target as unknown as CJValue;
  return o;
};
function machineJson(m: MMachine): CJValue {
  const o: Record<string, CJValue> = { gesture: m.gesture, last_t: m.last_t, mode: m.mode, pointers: m.pointers.map(pointerJson), rem_x: m.rem_x, rem_y: m.rem_y, wheel_acc: m.wheel_acc };
  if (m.anchor !== undefined) o["anchor"] = m.anchor as unknown as CJValue;
  if (m.pinch !== undefined) o["pinch"] = { d: m.pinch.d, mx: m.pinch.mx, my: m.pinch.my };
  return o;
}

/** The canonical bytes (IGR-CJ/1, no trailing newline) of a machine (5.1); for tests and diagnostics (a machine is never persisted across a reload). */
export function serializeMachine(m: MachineState): Uint8Array {
  return canonicalBytesSigned(machineJson(readMachine(m)));
}

const MAX_MACHINE_BYTES = 1_048_576;
const MAX_DEPTH = 16;

/** UTF-8 to a string, lenient (U+FFFD for a bad sequence): the canonical comparison of parseMachine then rejects any input that was not valid UTF-8. */
function utf8(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length;) {
    const c = b[i]!;
    let cp = 0xfffd, len = 1;
    if (c < 0x80) cp = c;
    else if (c >= 0xc2 && c < 0xe0 && i + 1 < b.length && (b[i + 1]! & 0xc0) === 0x80) { cp = ((c & 0x1f) << 6) | (b[i + 1]! & 0x3f); len = 2; }
    else if (c >= 0xe0 && c < 0xf0 && i + 2 < b.length && (b[i + 1]! & 0xc0) === 0x80 && (b[i + 2]! & 0xc0) === 0x80) { cp = ((c & 0x0f) << 12) | ((b[i + 1]! & 0x3f) << 6) | (b[i + 2]! & 0x3f); len = 3; if (cp < 0x800 || (cp >= 0xd800 && cp < 0xe000)) { cp = 0xfffd; len = 1; } }
    else if (c >= 0xf0 && c < 0xf5 && i + 3 < b.length && (b[i + 1]! & 0xc0) === 0x80 && (b[i + 2]! & 0xc0) === 0x80 && (b[i + 3]! & 0xc0) === 0x80) { cp = ((c & 0x07) << 18) | ((b[i + 1]! & 0x3f) << 12) | ((b[i + 2]! & 0x3f) << 6) | (b[i + 3]! & 0x3f); len = 4; if (cp < 0x10000 || cp > 0x10ffff) { cp = 0xfffd; len = 1; } }
    s += String.fromCodePoint(cp);
    i += len;
  }
  return s;
}

/** The nesting depth of a JSON text, counted outside strings; used before JSON.parse so that a bracket bomb is a structured error, never a RangeError. */
function nestingDepth(text: string): number {
  let depth = 0, max = 0, inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) { if (c === 0x5c) i++; else if (c === 0x22) inString = false; continue; }
    if (c === 0x22) inString = true;
    else if (c === 0x5b || c === 0x7b) { depth++; if (depth > max) max = depth; }
    else if (c === 0x5d || c === 0x7d) depth--;
  }
  return max;
}

/** The strict reader of machine bytes (5.1): at most 1 MiB (RESOURCE_LIMIT/BYTES_LIMIT), a nesting scan, the closed reader, and canonical bytes. */
export function parseMachine(bytes: Uint8Array): MachineState {
  if (!(bytes instanceof Uint8Array)) throw badMachine("bytes expected");
  if (bytes.length > MAX_MACHINE_BYTES) throw new IaError("RESOURCE_LIMIT", "BYTES_LIMIT"); // before the copy: a huge array is refused, not duplicated
  const input = bytes.slice();
  const text = utf8(input);
  if (nestingDepth(text) > MAX_DEPTH) throw badMachine("nesting too deep");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw badMachine("not JSON"); }
  const m = readMachine(parsed);
  const again = canonicalBytesSigned(machineJson(m));
  if (again.length !== input.length || again.some((b, i) => b !== input[i])) throw badMachine("not canonical");
  return deepFreeze(m);
}

/** The IGR-CJ/1 object of {handled, outputs, wake_at?} (5.5); `wake_at` is absent when none. */
export function serializeStep(r: { handled: boolean; outputs: readonly Output[]; wake_at?: number }): Uint8Array {
  const o: Record<string, CJValue> = { handled: r.handled, outputs: r.outputs as unknown as CJValue };
  if (r.wake_at !== undefined) o["wake_at"] = r.wake_at;
  return canonicalBytesSigned(o);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Configuration (5)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export interface Config { bindings: readonly Binding[]; wrap: boolean; maxTargets: number; reveal: boolean }
/** A config that readConfig has verified and frozen: `step` accepts it by identity (instanceof), so a table is verified once, not at every event. */
class VerifiedConfig implements Config {
  constructor(readonly bindings: readonly Binding[], readonly wrap: boolean, readonly maxTargets: number, readonly reveal: boolean) { Object.freeze(this); }
}
const badConfig = (reason: string, path?: string): IaError => new IaError("INVALID_CONFIG", reason, path);

export function readConfig(config: unknown): Config {
  if (config instanceof VerifiedConfig) return config;
  if (config === undefined) return new VerifiedConfig(DEFAULT_BINDINGS, false, DEFAULT_MAX_TARGETS, true);
  const e = plainEntries(config);
  if (e === undefined) throw badConfig("SCHEMA", undefined);
  for (const k of e.keys()) if (k !== "bindings" && k !== "wrap" && k !== "maxTargets" && k !== "reveal") throw badConfig("SCHEMA", k);
  const flag = (k: string, d: boolean): boolean => {
    if (!e.has(k)) return d;
    const x = e.get(k);
    if (typeof x !== "boolean") throw badConfig("SCHEMA", k);
    return x;
  };
  const bindings = e.has("bindings") ? verifyBindings(e.get("bindings")) : DEFAULT_BINDINGS; // INVALID_BINDINGS propagates unchanged (A-05)
  const wrap = flag("wrap", false);
  let maxTargets = DEFAULT_MAX_TARGETS;
  if (e.has("maxTargets")) {
    const x = e.get("maxTargets");
    if (typeof x !== "number") throw badConfig("SCHEMA", "maxTargets");
    if (!Number.isInteger(x)) throw badConfig("NOT_INTEGER", "maxTargets");
    if (x < 0 || x > 2 ** 31) throw badConfig("OUT_OF_RANGE", "maxTargets");
    maxTargets = x;
  }
  return new VerifiedConfig(deepFreeze(bindings), wrap, maxTargets, flag("reveal", true));
}

/**
 * prepareConfig(config) verifies a machine config once (the same errors as `step`) and returns a frozen copy that `step` accepts without verifying the binding
 * table again: with a raw config `step` verifies the table at every call (O(table)); a host with a large table, and the DOM binder, pass the prepared one.
 */
export function prepareConfig(config?: MachineConfig): MachineConfig {
  return readConfig(config) as VerifiedConfig;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The step (5.2 to 5.6)
// ---------------------------------------------------------------------------------------------------------------------------------------------
const intent = (i: Intent): Output => ({ kind: "intent", intent: i });
const nav = (event: NavEvent): Output => ({ kind: "nav", event });

/** The select mode of a click or a lasso: ctrl or meta toggle, else shift adds, else replace; the modifiers of the PRESS (5.3). */
const selectMode = (mods0: number): "replace" | "add" | "toggle" => ((mods0 & 10) !== 0 ? "toggle" : (mods0 & 1) !== 0 ? "add" : "replace");

interface Ctx { model: RenderModel; state: unknown; cfg: Config; view?: View }
/** The state is read (and fully validated) at most once per step, and only by an event that reads it. */
function viewOf(c: Ctx): View {
  c.view ??= readView(c.model, c.state);
  return c.view;
}

/** The ObjectRef of a wire address if it names an element that is drawn in the state of the event (5.2: a stale target is absent). */
function drawnRef(c: Ctx, wire: WireNode | WireEdge | undefined): { address: unknown; artifact_sha256: string } | undefined {
  if (wire === undefined) return undefined;
  const el = drawnElement(viewOf(c), wire);
  return el === undefined ? undefined : objectRef(c.model, el);
}

/** The pan accumulation of 5.3 for a milli-pixel delta: the whole pixels are emitted, the fraction is kept in rem_x and rem_y (each in [-500, 499]). */
function accumulate(m: MMachine, ax: number, ay: number, out: Output[]): void {
  const bx = m.rem_x + ax, by = m.rem_y + ay;
  const dx = noNegZero(divRoundN(bx, 1000)), dy = noNegZero(divRoundN(by, 1000));
  m.rem_x = noNegZero(bx - 1000 * dx); m.rem_y = noNegZero(by - 1000 * dy);
  if (dx !== 0 || dy !== 0) out.push(intent({ type: "pan", dx, dy }));
}

const previewRect = (x0: number, y0: number, x1: number, y1: number): Output => ({
  kind: "lasso-preview", rect: { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) },
});
const distance = (a: MPointer, b: MPointer): bigint => isqrt((BigInt(a.x) - BigInt(b.x)) ** 2n + (BigInt(a.y) - BigInt(b.y)) ** 2n);
const midpoint = (a: MPointer, b: MPointer): { x: number; y: number } => ({ x: Number(floorDiv(BigInt(a.x) + BigInt(b.x), 2n)), y: Number(floorDiv(BigInt(a.y) + BigInt(b.y), 2n)) });

/** The drawn element a host-resolved event target names; an address that names nothing, is not drawn, or is of the wrong kind under its key is absent (5.2). */
function targetElement(c: Ctx, target: EventTarget): Element | undefined {
  const el = drawnElement(viewOf(c), "node" in target ? target.node : target.edge);
  return el !== undefined && isEdge(el) === ("edge" in target) ? el : undefined;
}

function pointerDown(c: Ctx, m: MMachine, ev: Extract<ReturnType<typeof validateEvent>, { type: "pointerdown" }>, out: Output[]): boolean {
  if (ev.button !== 0) return false; // the secondary button reaches the machine only through contextmenu
  if (m.pointers.some((p) => p.id === ev.id)) return true; // a duplicate pointerdown: no change
  if (m.pointers.length >= 2) return true; // a third pointer is ignored
  const p: MPointer = { button: 0, id: ev.id, lasso: false, long: false, mods0: ev.mods, moved: false, ptype: ev.ptype, t0: ev.t, x: ev.x, x0: ev.x, y: ev.y, y0: ev.y };
  if (ev.target !== undefined) { // a target that names nothing or is not drawn is treated as absent: the release is a click on empty space (5.2)
    const el = targetElement(c, ev.target);
    if (el !== undefined) p.target = wireOf(el);
  }
  m.pointers.push(p);
  m.pointers.sort((a, b) => a.id - b.id);
  if (m.pointers.length === 1) { m.gesture = "press"; return true; }
  if (m.gesture === "lasso") out.push({ kind: "lasso-end" });
  for (const q of m.pointers) { q.moved = true; q.lasso = false; }
  const [a, b] = [m.pointers[0]!, m.pointers[1]!];
  const mid = midpoint(a, b);
  m.gesture = "pinch"; m.rem_x = 0; m.rem_y = 0;
  m.pinch = { d: Number(distance(a, b)), mx: mid.x, my: mid.y };
  return true;
}

function pointerMove(m: MMachine, ev: Extract<ReturnType<typeof validateEvent>, { type: "pointermove" }>, out: Output[]): boolean {
  const p = m.pointers.find((q) => q.id === ev.id);
  if (p === undefined) return false;
  const px = p.x, py = p.y;
  p.x = ev.x; p.y = ev.y;
  switch (m.gesture) {
    case "press": {
      if (p.long) break; // a fired long press claims the pointer: never a drag, never a click
      const dx = BigInt(ev.x) - BigInt(p.x0), dy = BigInt(ev.y) - BigInt(p.y0);
      if (dx * dx + dy * dy > BigInt(DRAG_THRESHOLD_MILLI) ** 2n) { // strictly greater: the exact threshold distance stays a press
        p.moved = true; m.rem_x = 0; m.rem_y = 0;
        if ((p.mods0 & 4) !== 0) { p.lasso = true; m.gesture = "lasso"; out.push(previewRect(p.x0, p.y0, ev.x, ev.y)); }
        else { m.gesture = "pan"; accumulate(m, ev.x - p.x0, ev.y - p.y0, out); }
      }
      break;
    }
    case "pan": accumulate(m, ev.x - px, ev.y - py, out); break;
    case "lasso": out.push(previewRect(p.x0, p.y0, ev.x, ev.y)); break;
    case "pinch": {
      const [a, b] = [m.pointers[0]!, m.pointers[1]!];
      const mid = midpoint(a, b);
      const pinch = m.pinch!;
      accumulate(m, mid.x - pinch.mx, mid.y - pinch.my, out); // pan first
      pinch.mx = mid.x; pinch.my = mid.y;
      const d1 = distance(a, b); // then zoom
      if (pinch.d > 0 && d1 > 0n) {
        const f = divRound(d1 * 1000n, BigInt(pinch.d));
        const factor = Number(f < 1n ? 1n : f > 1_000_000n ? 1_000_000n : f);
        if (factor !== 1000) {
          out.push(intent({ type: "zoom", factor_milli: factor, anchor: { x: Number(divRound(BigInt(mid.x), 1000n)), y: Number(divRound(BigInt(mid.y), 1000n)) } }));
          pinch.d = Number(d1);
        }
      } else if (pinch.d === 0 && d1 > 0n) pinch.d = Number(d1);
      break;
    }
    default: break;
  }
  return true;
}

/** Removes a pointer at a release or a cancel and settles the gesture (5.3): a remaining pointer of a pinch continues as a pan, no pointer left is idle. */
function removePointer(m: MMachine, p: MPointer): void {
  m.pointers = m.pointers.filter((q) => q !== p);
  if (m.gesture === "pinch") { const rest = m.pointers[0]; if (rest !== undefined) { rest.moved = true; m.gesture = "pan"; m.rem_x = 0; m.rem_y = 0; delete m.pinch; } }
  if (m.pointers.length === 0) { m.gesture = "idle"; m.rem_x = 0; m.rem_y = 0; delete m.pinch; }
}

function pointerUp(c: Ctx, m: MMachine, ev: Extract<ReturnType<typeof validateEvent>, { type: "pointerup" }>, out: Output[]): boolean {
  const p = m.pointers.find((q) => q.id === ev.id);
  if (p === undefined) return false;
  p.x = ev.x; p.y = ev.y;
  const g = m.gesture;
  removePointer(m, p);
  if (g === "press" && !p.long) { // a click; a fired long press is not a click
    const mode = selectMode(p.mods0);
    if (p.target !== undefined) {
      const el = drawnElement(viewOf(c), p.target);
      if (el !== undefined) out.push(intent({ type: "select", mode, targets: [addressOf(el)] })); // a target that vanished under the pointer: no output (5.2)
    } else if ((p.mods0 & 11) === 0) out.push(intent({ type: "clear-selection" })); // a modified click on empty space is inert; alt is ignored
  } else if (g === "lasso") {
    out.push({ kind: "lasso-end" });
    const v = viewOf(c);
    const X0 = BigInt(Math.min(p.x0, ev.x)) * 1000n, X1 = BigInt(Math.max(p.x0, ev.x)) * 1000n;
    const Y0 = BigInt(Math.min(p.y0, ev.y)) * 1000n, Y1 = BigInt(Math.max(p.y0, ev.y)) * 1000n;
    const targets = lassoTargetsMicro(v, X0, Y0, X1, Y1);
    if (targets.length > c.cfg.maxTargets) out.push(nav({ type: "lasso-too-large", count: targets.length }));
    else out.push(intent({ type: "select", mode: selectMode(p.mods0), targets }));
  }
  return true;
}

function pointerCancel(m: MMachine, ev: Extract<ReturnType<typeof validateEvent>, { type: "pointercancel" }>, out: Output[]): boolean {
  const p = m.pointers.find((q) => q.id === ev.id);
  if (p === undefined) return false;
  const g = m.gesture;
  removePointer(m, p);
  if (g === "lasso") out.push({ kind: "lasso-end" }); // a host that drew the marquee from earlier previews erases it; no selection output
  return true;
}

function wheel(c: Ctx, m: MMachine, ev: Extract<ReturnType<typeof validateEvent>, { type: "wheel" }>, out: Output[]): void {
  const unit = ev.unit === 0 ? 1n : ev.unit === 1 ? 16n : BigInt(viewOf(c).viewport.height);
  const d = BigInt(ev.dy) * unit; // milli-pixels, exact in BigInt (|dy| <= 2^40 times a page height can exceed 2^53)
  let acc = BigInt(m.wheel_acc);
  if (d === 0n) return; // a horizontal-only swipe changes nothing: the sign of 0 is neither
  if (acc !== 0n && (acc < 0n) !== (d < 0n)) acc = 0n; // a reversal discards the residue
  acc += d;
  const notch = BigInt(WHEEL_NOTCH_MILLI);
  const anchor = { x: Number(divRound(BigInt(ev.x), 1000n)), y: Number(divRound(BigInt(ev.y), 1000n)) };
  let notches = 0;
  while ((acc >= notch || acc <= -notch) && notches < WHEEL_MAX_NOTCHES) {
    out.push(intent({ type: "zoom", factor_milli: acc < 0n ? 1250 : 800, anchor: { x: anchor.x, y: anchor.y } }));
    acc += acc < 0n ? notch : -notch;
    notches++;
  }
  if (acc >= notch || acc <= -notch) acc -= (acc / notch) * notch; // the excess notches are discarded; truncation toward zero keeps the sign
  m.wheel_acc = Number(acc);
}

function tick(c: Ctx, m: MMachine, out: Output[]): void {
  for (const p of m.pointers) {
    if (p.ptype === "touch" && !p.moved && !p.long && m.last_t - p.t0 >= LONG_PRESS_MS) {
      p.long = true;
      const target = drawnRef(c, p.target); // looked up at the tick, in the state of the tick
      out.push({ kind: "context-action", source: "long-press", ...(target === undefined ? {} : { target }), x: Number(divRound(BigInt(p.x), 1000n)), y: Number(divRound(BigInt(p.y), 1000n)) });
    }
  }
}

const toNav = (a: BindingAction): NavCommand | undefined => {
  switch (a.type) {
    case "spatial": return { type: "nav-spatial", dir: a.dir, extend: a.extend };
    case "step": return { type: "nav-step", delta: a.delta };
    case "incident": return { type: "nav-incident", delta: a.delta };
    case "endpoint": return { type: "nav-endpoint", end: a.end };
    default: return undefined;
  }
};

function key(c: Ctx, m: MMachine, ev: Extract<ReturnType<typeof validateEvent>, { type: "key" }>, out: Output[]): boolean {
  const v = viewOf(c); // a key event reads the state
  const action = matchBinding(c.cfg.bindings, m.mode, ev.key, ev.mods);
  if (action === undefined) return false;
  const o: NavOptions = { wrap: c.cfg.wrap, reveal: c.cfg.reveal };
  const f = v.focus;
  const command = toNav(action);
  if (command !== undefined) { out.push(...navigate(v, command, o)); return true; }
  switch (action.type) {
    case "first": case "last": out.push(...navigateEnd(v, action.type, o)); break;
    case "toggle-focus": if (f !== undefined) out.push(intent({ type: "select", mode: "toggle", targets: [addressOf(f)] })); break;
    case "activate": if (f !== undefined) out.push({ kind: "activate", target: objectRef(c.model, f) }); break;
    case "clear-selection": out.push(intent({ type: "clear-selection" })); break;
    case "context": out.push({ kind: "context-action", source: "keyboard", ...(f === undefined ? {} : { target: objectRef(c.model, f) }) }); break;
    case "pan": out.push(intent({ type: "pan", dx: action.dx, dy: action.dy })); break;
    case "zoom": out.push(intent({ type: "zoom", factor_milli: action.factor })); break;
    case "fit": out.push(intent({ type: "fit" })); break;
    case "select-all": {
      const all = traversal(v);
      if (all.length > c.cfg.maxTargets) out.push(nav({ type: "select-all-too-large", count: all.length }));
      else out.push(intent({ type: "select", mode: "replace", targets: all.map((e) => addressOf(e)) }));
      break;
    }
    case "marquee-start": {
      if (f === undefined) out.push(nav({ type: "nav-none", reason: "NO_FOCUS" }));
      else if (isEdge(f)) out.push(nav({ type: "nav-none", reason: "NOT_A_NODE" }));
      else { m.mode = "marquee"; m.anchor = wireOf(f) as WireNode; out.push(nav({ type: "marquee-started" })); }
      break;
    }
    case "marquee-commit": marqueeCommit(c, m, v, out); break;
    case "marquee-cancel": m.mode = "normal"; delete m.anchor; out.push(nav({ type: "marquee-cancelled" })); break;
    default: break;
  }
  return true;
}

function marqueeCommit(c: Ctx, m: MMachine, v: View, out: Output[]): void {
  const anchor = m.anchor === undefined ? undefined : drawnElement(v, m.anchor); // no anchor (a host table binds commit outside marquee mode) is a gone anchor
  if (anchor === undefined) { m.mode = "normal"; delete m.anchor; out.push(nav({ type: "nav-none", reason: "ANCHOR_GONE" })); return; }
  const f = v.focus;
  if (f === undefined) { out.push(nav({ type: "nav-none", reason: "NO_FOCUS" })); return; }
  if (isEdge(f) || isEdge(anchor)) { out.push(nav({ type: "nav-none", reason: "NOT_A_NODE" })); return; }
  const a = screenMicro(v.viewport, anchor.x, anchor.y), b = screenMicro(v.viewport, f.x, f.y);
  const lo = (p: bigint, q: bigint): bigint => (p < q ? p : q), hi = (p: bigint, q: bigint): bigint => (p < q ? q : p);
  const targets = lassoTargetsMicro(v, lo(a.X, b.X), lo(a.Y, b.Y), hi(a.X, b.X), hi(a.Y, b.Y));
  m.mode = "normal"; delete m.anchor;
  if (targets.length > c.cfg.maxTargets) out.push(nav({ type: "lasso-too-large", count: targets.length }));
  else out.push(intent({ type: "select", mode: "replace", targets }));
}

/** `wake_at` (5.2): computed from the machine after the step; present iff a touch pointer is in press with moved and long both false: t0 + LONG_PRESS_MS. */
function wakeAt(m: MMachine): number | undefined {
  for (const p of m.pointers) if (p.ptype === "touch" && m.gesture === "press" && !p.moved && !p.long) return p.t0 + LONG_PRESS_MS;
  return undefined;
}

/**
 * step(machine, event, model, state, config) (5): validates the config, the model, the event (IaError INVALID_EVENT) and the time (NON_MONOTONIC_TIME),
 * applies the event and returns `{ machine, handled, outputs, wake_at? }` for the new machine. `handled` tells the host whether to call preventDefault.
 * `state` is the committed SemanticState; it is read, and fully validated (the IgrError propagates), only by an event that reads it.
 */
export function step(machine: MachineState, event: unknown, model: RenderModel, state: SemanticState, config?: MachineConfig): StepResult {
  const cfg = readConfig(config);
  if (!isRenderModel(model)) throw new IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL");
  const ev = validateEvent(event);
  const m = readMachine(machine);
  checkTime(ev.t, m.last_t);
  m.last_t = ev.t;
  const c: Ctx = { model, state, cfg };
  const out: Output[] = [];
  let handled = true;
  switch (ev.type) {
    case "pointerdown": handled = pointerDown(c, m, ev, out); break;
    case "pointermove": handled = pointerMove(m, ev, out); break;
    case "pointerup": handled = pointerUp(c, m, ev, out); break;
    case "pointercancel": handled = pointerCancel(m, ev, out); break;
    case "wheel": wheel(c, m, ev, out); break;
    case "key": handled = key(c, m, ev, out); break;
    case "tick": tick(c, m, out); break;
    case "contextmenu": {
      const el = ev.target === undefined ? undefined : targetElement(c, ev.target);
      const target = el === undefined ? undefined : objectRef(c.model, el);
      out.push({ kind: "context-action", source: "pointer", x: Number(divRound(BigInt(ev.x), 1000n)), y: Number(divRound(BigInt(ev.y), 1000n)), ...(target === undefined ? {} : { target }) });
      break;
    }
    case "dblclick": out.push(intent({ type: "fit" })); break;
  }
  const wake = wakeAt(m);
  const result: StepResult = { machine: deepFreeze(m) as MachineState, handled, outputs: out };
  if (wake !== undefined) result.wake_at = wake;
  return result;
}

