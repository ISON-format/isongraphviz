// src/events.ts - the abstract input event grammar igr-input/1 (design 4): the nine shapes, their validation (first failure wins) and the constants of 3.3.
import type { ElementAddress } from "isongraph-visualize-renderer-core";
import { IaError } from "./errors.js";
import { isKeyToken } from "./bindings.js";
import { copyData, noNegZero, plainEntries } from "./geometry.js";

export const IA_INPUT = "igr-input/1", IA_BIND = "igr-bind/1", IA_NAV = "igr-nav/1", IA_LASSO = "igr-lasso/1";
// PROVISIONAL, UNMEASURED (3.3): changing one is igr-input/2 or the named format's next version.
export const DRAG_THRESHOLD_MILLI = 4000, LONG_PRESS_MS = 500, WHEEL_NOTCH_MILLI = 100_000, WHEEL_MAX_NOTCHES = 8,
  ZOOM_STEP_IN = 1250, ZOOM_STEP_OUT = 800, PAN_STEP_PX = 32, COORD_MAX_MILLI = 549_755_813_888, REVEAL_MARGIN_PX = 24;

export type PointerType = "mouse" | "touch" | "pen";
/** The ElementAddress of the element under the pointer as resolved by the host (4.1); its content is judged only by the machine's lookup. */
export type EventTarget = ElementAddress;
export type InputEvent =
  | { type: "pointerdown"; t: number; id: number; ptype: PointerType; button: 0 | 1 | 2; x: number; y: number; mods: number; target?: EventTarget }
  | { type: "pointermove"; t: number; id: number; x: number; y: number; mods: number }
  | { type: "pointerup"; t: number; id: number; x: number; y: number; mods: number }
  | { type: "pointercancel"; t: number; id: number }
  | { type: "wheel"; t: number; x: number; y: number; dy: number; unit: 0 | 1 | 2; mods: number }
  | { type: "key"; t: number; key: string; mods: number }
  | { type: "tick"; t: number }
  | { type: "contextmenu"; t: number; x: number; y: number; mods: number; target?: EventTarget }
  | { type: "dblclick"; t: number; x: number; y: number; mods: number; target?: EventTarget };

type Field = "t" | "id" | "ptype" | "button" | "x" | "y" | "dy" | "unit" | "mods" | "key" | "target";
/** Fields in validation order (4.1); `target` is the only optional one. */
const SHAPES = new Map<string, readonly Field[]>([
  ["pointerdown", ["t", "id", "ptype", "button", "x", "y", "mods", "target"]],
  ["pointermove", ["t", "id", "x", "y", "mods"]],
  ["pointerup", ["t", "id", "x", "y", "mods"]],
  ["pointercancel", ["t", "id"]],
  ["wheel", ["t", "x", "y", "dy", "unit", "mods"]],
  ["key", ["t", "key", "mods"]],
  ["tick", ["t"]],
  ["contextmenu", ["t", "x", "y", "mods", "target"]],
  ["dblclick", ["t", "x", "y", "mods", "target"]],
]);
/** Integer domains: t 0 to 2^52 (so t + 500 stays a safe integer), id 0 to 2^31 - 1, x and y within 2^39, dy within 2^40, mods 0 to 15. */
const DOMAINS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["t", [0, 2 ** 52]], ["id", [0, 2 ** 31 - 1]], ["x", [-COORD_MAX_MILLI, COORD_MAX_MILLI]], ["y", [-COORD_MAX_MILLI, COORD_MAX_MILLI]],
  ["dy", [-(2 ** 40), 2 ** 40]], ["mods", [0, 15]],
]);

const bad = (reason: string, path?: string, detail?: string): IaError => new IaError("INVALID_EVENT", reason, path, detail);

/** A number field: SCHEMA for a non-number, NOT_FINITE for NaN or an infinity, NOT_INTEGER for a fraction, then the domain (OUT_OF_RANGE). */
function integer(v: unknown, path: string, lo: number, hi: number): number {
  if (typeof v !== "number") throw bad("SCHEMA", path, "number expected");
  if (!Number.isFinite(v)) throw bad("NOT_FINITE", path);
  if (!Number.isInteger(v)) throw bad("NOT_INTEGER", path);
  if (v < lo || v > hi) throw bad("OUT_OF_RANGE", path);
  return noNegZero(v);
}
/** An enumerated integer (button, unit): the number checks first, then membership (INVALID_VALUE, never OUT_OF_RANGE, A-02). */
function enumerated(v: unknown, path: string): 0 | 1 | 2 {
  const n = integer(v, path, -Infinity, Infinity);
  if (n !== 0 && n !== 1 && n !== 2) throw bad("INVALID_VALUE", path);
  return n;
}

function targetOf(v: unknown): EventTarget {
  const e = plainEntries(v);
  if (e === undefined || e.size !== 1) throw bad("SCHEMA", "target", "exactly one key, node or edge");
  const [k, inner] = [...e][0]!;
  if (k !== "node" && k !== "edge") throw bad("SCHEMA", "target", "exactly one key, node or edge");
  if (typeof inner !== "object" || inner === null || Array.isArray(inner)) throw bad("SCHEMA", `target.${k}`, "an object expected");
  let copy: unknown;
  try { copy = copyData(inner, 6); } catch { throw bad("SCHEMA", `target.${k}`, "unreadable"); }
  return (k === "node" ? { node: copy } : { edge: copy }) as unknown as EventTarget;
}

/**
 * validateEvent (4.2, steps 1 to 4; step 5, the time check, needs the machine and is done by `step`): returns an owned copy with the fields in the order
 * of the table, or throws IaError INVALID_EVENT. First failure wins.
 */
export function validateEvent(event: unknown): InputEvent {
  const entries = plainEntries(event); // 1. a plain object; an own undefined is absent; an unreadable getter is SCHEMA
  if (entries === undefined) throw bad("SCHEMA", undefined, "a plain object expected");
  if (!entries.has("type")) throw bad("SCHEMA", "type", "missing"); // 2. absent: SCHEMA
  const type = entries.get("type");
  const shape = typeof type === "string" ? SHAPES.get(type) : undefined;
  if (shape === undefined) throw bad("UNKNOWN_TYPE", "type");
  for (const k of entries.keys()) if (k !== "type" && !(shape as readonly string[]).includes(k)) throw bad("SCHEMA", k, "unknown field"); // 3. closed key set
  for (const f of shape) if (f !== "target" && !entries.has(f)) throw bad("SCHEMA", f, "missing");
  const out: Record<string, unknown> = { type };
  for (const f of shape) { // 4. every field completely, in the table order
    if (!entries.has(f)) continue; // only `target` can be absent here
    const v = entries.get(f);
    switch (f) {
      case "button": case "unit": out[f] = enumerated(v, f); break;
      case "ptype":
        if (typeof v !== "string") throw bad("SCHEMA", f, "string expected");
        if (v !== "mouse" && v !== "touch" && v !== "pen") throw bad("INVALID_VALUE", f);
        out[f] = v; break;
      case "key":
        if (typeof v !== "string") throw bad("SCHEMA", f, "string expected");
        if (!isKeyToken(v)) throw bad("UNKNOWN_KEY", f);
        out[f] = v; break;
      case "target": out[f] = targetOf(v); break;
      default: { const d = DOMAINS.get(f)!; out[f] = integer(v, f, d[0], d[1]); }
    }
  }
  return out as unknown as InputEvent;
}

/** 4.2 step 5: a valid event whose `t` is smaller than the machine's last_t is NON_MONOTONIC_TIME; equal is allowed. */
export function checkTime(t: number, lastT: number): void {
  if (t < lastT) throw bad("NON_MONOTONIC_TIME", "t", `t ${t} is before the last event time ${lastT}`);
}
