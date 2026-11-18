// src/navigation.ts - keyboard graph navigation igr-nav/1 (design 7): commands, the spatial metric, incident and endpoint moves, and the focus reveal rule.
// Defined on the semantic model and state only (layout thousandths, effective visibility, scene order): no pixel, zoom or pan enters the choice of the target;
// making the target visible is the separate, viewport-dependent reveal rule of 7.5.
import type { ElementAddress, Intent, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { lookupElement } from "isongraph-visualize-renderer-core";
import type { Dir } from "./bindings.js";
import { REVEAL_MARGIN_PX } from "./events.js";
import { IaError } from "./errors.js";
import {
  addressOf, ceilDiv, divRound, floorDivN, isEdge, plainEntries, readView, sameElement, screenMicro, traversal,
  type Element, type View,
} from "./geometry.js";
import type { Output } from "./machine.js";

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Commands (7.1) and nav events (7.4)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export type NavCommand =
  | { type: "nav-spatial"; dir: Dir; extend?: boolean } | { type: "nav-incident"; delta: 1 | -1 }
  | { type: "nav-endpoint"; end: "src" | "tgt" } | { type: "nav-step"; delta: 1 | -1 };
export type NavEvent =
  | { type: "nav-none"; reason: "NO_FOCUS" | "NOT_A_NODE" | "NOT_AN_EDGE" | "ANCHOR_GONE" }
  | { type: "nav-boundary"; nav: "spatial"; dir: Dir } | { type: "nav-boundary"; nav: "incident"; delta: 1 | -1 }
  | { type: "nav-wrapped"; end: "start" | "end" }
  | { type: "marquee-started" } | { type: "marquee-cancelled" }
  | { type: "lasso-too-large"; count: number } | { type: "select-all-too-large"; count: number };
export interface NavOptions { wrap: boolean; reveal: boolean }

const bad = (reason: string, path?: string, detail?: string): IaError => new IaError("INVALID_COMMAND", reason, path, detail);
const intent = (i: Intent): Output => ({ kind: "intent", intent: i });
const nav = (event: NavEvent): Output => ({ kind: "nav", event });
const focusOn = (e: Element): Output => intent({ type: "focus", target: addressOf(e) });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 7.5 The focus reveal rule
// ---------------------------------------------------------------------------------------------------------------------------------------------
const MICRO = 1_000_000n;
const PIX_LIMIT = 2n ** 31n;

/** The exact screen position (micro-pixels) of an element: a node's centre, an edge's integer midpoint of its endpoints' centres (7.5). */
function positionOf(v: View, e: Element): { X: bigint; Y: bigint } {
  if (!isEdge(e)) return screenMicro(v.viewport, e.x, e.y);
  const a = v.model.nodes[e.src]!, b = v.model.nodes[e.tgt]!;
  const pa = screenMicro(v.viewport, a.x, a.y), pb = screenMicro(v.viewport, b.x, b.y);
  return { X: divRound(pa.X + pb.X, 2n), Y: divRound(pa.Y + pb.Y, 2n) };
}

/** The reveal pan of 7.5 for an element of the view: undefined when the element is inside the margin box or the pan would exceed 2^31. */
export function revealPanView(v: View, target: Element): Intent | undefined {
  const w = v.viewport.width, h = v.viewport.height;
  const m = Math.min(REVEAL_MARGIN_PX, floorDivN(Math.min(w, h) - 1, 2));
  const lo = BigInt(m) * MICRO, hiX = BigInt(w - m) * MICRO, hiY = BigInt(h - m) * MICRO;
  const { X, Y } = positionOf(v, target);
  if (X >= lo && X <= hiX && Y >= lo && Y <= hiY) return undefined;
  const axis = (p: bigint, hi: bigint): bigint => (p < lo ? ceilDiv(lo - p, MICRO) : p > hi ? -ceilDiv(p - hi, MICRO) : 0n);
  const dx = axis(X, hiX), dy = axis(Y, hiY);
  if (dx > PIX_LIMIT || dx < -PIX_LIMIT || dy > PIX_LIMIT || dy < -PIX_LIMIT) return undefined;
  return { type: "pan", dx: Number(dx), dy: Number(dy) };
}

/**
 * revealPan(model, state, target) (7.5): a pure function returning one frozen `pan` intent that brings the element into the margin box (24 px, clamped
 * to floor((min(w, h) - 1) / 2) for a tiny viewport), or undefined when it is already inside, names no element of the model, or the pan would exceed 2^31.
 */
export function revealPan(model: RenderModel, state: SemanticState, target: ElementAddress): Intent | undefined {
  const t = plainEntries(target);
  const kind = t?.size === 1 ? [...t.keys()][0] : undefined;
  if (t === undefined || (kind !== "node" && kind !== "edge")) throw new IaError("INVALID_INPUT", "SCHEMA", "target", "an ElementAddress expected");
  const v = readView(model, state);
  const el = lookupElement(model, t.get(kind));
  if (el === undefined || isEdge(el) !== (kind === "edge")) return undefined;
  const pan = revealPanView(v, el);
  return pan === undefined ? undefined : Object.freeze(pan);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 7.1 Validation
// ---------------------------------------------------------------------------------------------------------------------------------------------
const COMMANDS: ReadonlyMap<string, readonly string[]> = new Map([
  ["nav-spatial", ["dir"]], ["nav-incident", ["delta"]], ["nav-endpoint", ["end"]], ["nav-step", ["delta"]],
]);

function readCommand(command: unknown): NavCommand {
  const e = plainEntries(command);
  const type = e?.get("type");
  if (e === undefined || typeof type !== "string") throw bad("SCHEMA", undefined, "an object with a string type expected");
  const required = COMMANDS.get(type);
  if (required === undefined) throw bad("UNKNOWN_TYPE", "type", type);
  const allowed = type === "nav-spatial" ? [...required, "extend", "type"] : [...required, "type"];
  for (const k of e.keys()) if (!allowed.includes(k)) throw bad("SCHEMA", k, "unknown field");
  for (const k of required) if (!e.has(k)) throw bad("SCHEMA", k, "missing");
  switch (type) {
    case "nav-spatial": {
      const dir = e.get("dir");
      if (dir !== "left" && dir !== "right" && dir !== "up" && dir !== "down") throw bad("INVALID_VALUE", "dir");
      if (e.has("extend")) {
        const x = e.get("extend");
        if (typeof x !== "boolean") throw bad("SCHEMA", "extend", "boolean expected");
        return { type, dir, extend: x };
      }
      return { type, dir };
    }
    case "nav-endpoint": {
      const end = e.get("end");
      if (end !== "src" && end !== "tgt") throw bad("INVALID_VALUE", "end");
      return { type, end };
    }
    default: {
      const delta = e.get("delta");
      if (delta !== 1 && delta !== -1) throw bad("INVALID_VALUE", "delta");
      return { type: type as "nav-incident" | "nav-step", delta };
    }
  }
}

/** The options of resolveNavigation and the machine: booleans only, defaults wrap false and reveal true (7.1). */
function readOptions(options: unknown): NavOptions {
  if (options === undefined) return { wrap: false, reveal: true };
  const e = plainEntries(options);
  if (e === undefined) throw bad("SCHEMA", "options", "an object expected");
  for (const k of e.keys()) if (k !== "wrap" && k !== "reveal") throw bad("SCHEMA", `options.${k}`, "unknown option");
  const flag = (k: string, d: boolean): boolean => {
    if (!e.has(k)) return d;
    const x = e.get(k);
    if (typeof x !== "boolean") throw bad("SCHEMA", `options.${k}`, "boolean expected");
    return x;
  };
  return { wrap: flag("wrap", false), reveal: flag("reveal", true) };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 7.2 Definitions
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** The drawn edges incident to node `n` in scene order (a self-loop once). */
function incident(v: View, n: number): Element[] {
  const out: Element[] = [];
  for (const e of v.model.edges) if (v.edges[e.index] && (e.src === n || e.tgt === n)) out.push(e);
  return out;
}

/** The spatial winner (7.2): the candidate of the first non-empty tier with the smallest (p^2 + s^2, s, index), all in integers. */
function spatialWinner(v: View, f: Element, dir: Dir): Element | undefined {
  let ox: bigint, oy: bigint;
  if (isEdge(f)) {
    const a = v.model.nodes[f.src]!, b = v.model.nodes[f.tgt]!;
    ox = divRound(BigInt(a.x) + BigInt(b.x), 2n); oy = divRound(BigInt(a.y) + BigInt(b.y), 2n);
  } else { ox = BigInt(f.x); oy = BigInt(f.y); }
  const abs = (x: bigint): bigint => (x < 0n ? -x : x);
  let best: [bigint, bigint, number] | undefined, bestNode: Element | undefined;
  let bestTier = 3;
  for (const m of v.model.nodes) {
    if (!v.nodes[m.index] || (!isEdge(f) && f.index === m.index)) continue;
    const dx = BigInt(m.x) - ox, dy = BigInt(m.y) - oy;
    let p: bigint, s: bigint;
    if (dir === "right") { p = dx; s = abs(dy); } else if (dir === "left") { p = -dx; s = abs(dy); } else if (dir === "down") { p = dy; s = abs(dx); } else { p = -dy; s = abs(dx); }
    if (p <= 0n) continue;
    const tier = s <= p ? 1 : 2;
    if (tier > bestTier) continue;
    const key: [bigint, bigint, number] = [p * p + s * s, s, m.index];
    const better = best === undefined || tier < bestTier || key[0] < best[0] || (key[0] === best[0] && (key[1] < best[1] || (key[1] === best[1] && key[2] < best[2])));
    if (better) { best = key; bestNode = m; bestTier = tier; }
  }
  return bestNode;
}

/** With no focus (5.6): step, incident +1, endpoint and spatial right or down give focus-first; the others focus-last. */
function noFocus(cmd: NavCommand): "first" | "last" {
  switch (cmd.type) {
    case "nav-step": case "nav-incident": return cmd.delta === 1 ? "first" : "last";
    case "nav-endpoint": return "first";
    case "nav-spatial": return cmd.dir === "right" || cmd.dir === "down" ? "first" : "last";
  }
}

/** Appends the reveal pan (7.5) after the other outputs when the move targets an element that is not already focused and lies outside the margin box. */
function revealed(v: View, o: NavOptions, outputs: Output[], target: Element | undefined): Output[] {
  if (o.reveal && target !== undefined && !(v.focus !== undefined && sameElement(v.focus, target))) {
    const pan = revealPanView(v, target);
    if (pan !== undefined) outputs.push(intent(pan));
  }
  return outputs;
}

/** The outputs of a validated navigation command on a view (7.2, 5.6); the machine and resolveNavigation share it. */
export function navigate(v: View, cmd: NavCommand, o: NavOptions): Output[] {
  const f = v.focus;
  if (f === undefined) {
    const first = noFocus(cmd) === "first";
    const t = traversal(v);
    return revealed(v, o, [intent({ type: first ? "focus-first" : "focus-last" })], first ? t[0] : t[t.length - 1]);
  }
  switch (cmd.type) {
    case "nav-endpoint": {
      if (!isEdge(f)) return [nav({ type: "nav-none", reason: "NOT_AN_EDGE" })];
      const n = v.model.nodes[cmd.end === "src" ? f.src : f.tgt]!;
      return revealed(v, o, [focusOn(n)], n);
    }
    case "nav-incident": {
      const base = isEdge(f) ? f.src : f.index;
      const list = incident(v, base);
      if (!isEdge(f)) {
        if (list.length === 0) return [nav({ type: "nav-boundary", nav: "incident", delta: cmd.delta })];
        const t = cmd.delta === 1 ? list[0]! : list[list.length - 1]!;
        return revealed(v, o, [focusOn(t)], t);
      }
      const i = list.findIndex((x) => sameElement(x, f));
      const j = i + cmd.delta;
      if (j >= 0 && j < list.length) return revealed(v, o, [focusOn(list[j]!)], list[j]);
      if (!o.wrap) return [nav({ type: "nav-boundary", nav: "incident", delta: cmd.delta })];
      const t = cmd.delta === 1 ? list[0]! : list[list.length - 1]!;
      return revealed(v, o, [focusOn(t), nav({ type: "nav-wrapped", end: cmd.delta === 1 ? "end" : "start" })], t);
    }
    case "nav-step": {
      const t = traversal(v);
      const pos = t.findIndex((x) => sameElement(x, f));
      if (o.wrap && cmd.delta === 1 && pos === t.length - 1) return revealed(v, o, [intent({ type: "focus-first" }), nav({ type: "nav-wrapped", end: "end" })], t[0]);
      if (o.wrap && cmd.delta === -1 && pos === 0) return revealed(v, o, [intent({ type: "focus-last" }), nav({ type: "nav-wrapped", end: "start" })], t[t.length - 1]);
      return revealed(v, o, [intent({ type: "focus-step", delta: cmd.delta })], t[pos + cmd.delta]);
    }
    case "nav-spatial": {
      const w = spatialWinner(v, f, cmd.dir);
      if (w === undefined) return [nav({ type: "nav-boundary", nav: "spatial", dir: cmd.dir })];
      const out: Output[] = [focusOn(w)];
      if (cmd.extend === true) out.push(intent({ type: "select", mode: "add", targets: [addressOf(w)] }));
      return revealed(v, o, out, w);
    }
  }
}

/** The outputs of the first/last actions (Home, End): focus-first or focus-last, with the reveal of the first or last element of the traversal. */
export function navigateEnd(v: View, which: "first" | "last", o: NavOptions): Output[] {
  const t = traversal(v);
  return revealed(v, o, [intent({ type: which === "first" ? "focus-first" : "focus-last" })], which === "first" ? t[0] : t[t.length - 1]);
}

/**
 * resolveNavigation(model, state, command, options) (7): validates the command (INVALID_COMMAND: SCHEMA, UNKNOWN_TYPE, INVALID_VALUE) and the state (the
 * IgrError propagates) and compiles the command into frozen IGR/1 intents and nav events. Result `{ outputs }`; `options` is {wrap?, reveal?}.
 */
export function resolveNavigation(model: RenderModel, state: SemanticState, command: unknown, options?: { wrap?: boolean; reveal?: boolean }): { outputs: Output[] } {
  const cmd = readCommand(command);
  const o = readOptions(options);
  return { outputs: navigate(readView(model, state), cmd, o) };
}
