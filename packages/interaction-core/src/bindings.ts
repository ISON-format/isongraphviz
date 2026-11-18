// src/bindings.ts - key tokens and the binding table igr-bind/1 (design 6): tokens, matching, the default table, verifyBindings, serializeBindings.
import { canonicalBytesSigned, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { IaError } from "./errors.js";
import { plainEntries } from "./geometry.js";

export type Dir = "left" | "right" | "up" | "down";
export type BindingAction =
  | { type: "spatial"; dir: Dir; extend: boolean }
  | { type: "step"; delta: 1 | -1 } | { type: "first" } | { type: "last" }
  | { type: "incident"; delta: 1 | -1 } | { type: "endpoint"; end: "src" | "tgt" }
  | { type: "toggle-focus" } | { type: "activate" } | { type: "clear-selection" } | { type: "context" }
  | { type: "pan"; dx: number; dy: number } | { type: "zoom"; factor: number } | { type: "fit" }
  | { type: "select-all" } | { type: "marquee-start" } | { type: "marquee-commit" } | { type: "marquee-cancel" };
export type Binding = { mode: string; key: string; mods: number; action: BindingAction };

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 6.1 Key tokens
// ---------------------------------------------------------------------------------------------------------------------------------------------
const NAME_TOKENS: ReadonlySet<string> = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter", "Escape", "Tab", "ContextMenu", "F10", "Backspace", "Delete",
]);
const LEGACY: ReadonlyMap<string, string> = new Map([
  [" ", "Space"], ["Spacebar", "Space"], ["Esc", "Escape"], ["Left", "ArrowLeft"], ["Right", "ArrowRight"], ["Up", "ArrowUp"], ["Down", "ArrowDown"], ["Apps", "ContextMenu"],
]);
const PUNCTUATION = "+-=[],./;";

/** A key token (6.1): the fifteen names, `Space`, a single character a-z or 0-9, or one of + - = [ ] , . / ; (letters are lowercase tokens). */
export function isKeyToken(s: string): boolean {
  if (typeof s !== "string") return false;
  if (NAME_TOKENS.has(s) || s === "Space") return true;
  if (s.length !== 1) return false;
  return (s >= "a" && s <= "z") || (s >= "0" && s <= "9") || PUNCTUATION.includes(s);
}

/** Maps a DOM KeyboardEvent.key to a token, or undefined (6.1). */
export function keyToken(domKey: string): string | undefined {
  if (typeof domKey !== "string") return undefined;
  if (NAME_TOKENS.has(domKey) || domKey === "Space") return domKey;
  const legacy = LEGACY.get(domKey);
  if (legacy !== undefined) return legacy;
  if (domKey.length === 1) {
    if (domKey >= "A" && domKey <= "Z") return domKey.toLowerCase();
    if (isKeyToken(domKey)) return domKey;
  }
  return undefined;
}

/** For a digit or a punctuation token the shift bit is ignored in matching and in the duplicate check (6.2: `+` is typed with shift on most layouts). */
const shiftIgnored = (token: string): boolean => token.length === 1 && !(token >= "a" && token <= "z");

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 6.3 The default table (33 rows, Appendix A.3)
// ---------------------------------------------------------------------------------------------------------------------------------------------
const row = (mode: string, key: string, mods: number, action: BindingAction): Binding => ({ mode, key, mods, action });
const ARROWS: readonly (readonly [string, Dir])[] = [["ArrowRight", "right"], ["ArrowLeft", "left"], ["ArrowUp", "up"], ["ArrowDown", "down"]];
const deepFreeze = <T>(v: T): T => {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]); Object.freeze(v); }
  return v;
};
export const DEFAULT_BINDINGS: readonly Binding[] = deepFreeze([
  ...ARROWS.map(([k, d]) => row("normal", k, 0, { type: "spatial", dir: d, extend: false })),
  ...ARROWS.map(([k, d]) => row("normal", k, 1, { type: "spatial", dir: d, extend: true })),
  row("normal", "ArrowRight", 2, { type: "pan", dx: -32, dy: 0 }),
  row("normal", "ArrowLeft", 2, { type: "pan", dx: 32, dy: 0 }),
  row("normal", "ArrowUp", 2, { type: "pan", dx: 0, dy: 32 }),
  row("normal", "ArrowDown", 2, { type: "pan", dx: 0, dy: -32 }),
  row("normal", "Home", 0, { type: "first" }),
  row("normal", "End", 0, { type: "last" }),
  row("normal", "PageDown", 0, { type: "step", delta: 1 }),
  row("normal", "PageUp", 0, { type: "step", delta: -1 }),
  row("normal", "Space", 0, { type: "toggle-focus" }),
  row("normal", "Enter", 0, { type: "activate" }),
  row("normal", "Escape", 0, { type: "clear-selection" }),
  row("normal", "ContextMenu", 0, { type: "context" }),
  row("normal", "F10", 1, { type: "context" }),
  row("normal", "e", 0, { type: "incident", delta: 1 }),
  row("normal", "e", 1, { type: "incident", delta: -1 }),
  row("normal", "s", 0, { type: "endpoint", end: "src" }),
  row("normal", "t", 0, { type: "endpoint", end: "tgt" }),
  row("normal", "+", 0, { type: "zoom", factor: 1250 }),
  row("normal", "=", 0, { type: "zoom", factor: 1250 }),
  row("normal", "-", 0, { type: "zoom", factor: 800 }),
  row("normal", "0", 0, { type: "fit" }),
  row("normal", "a", 2, { type: "select-all" }),
  row("normal", "m", 0, { type: "marquee-start" }),
  row("marquee", "Enter", 0, { type: "marquee-commit" }),
  row("marquee", "Escape", 0, { type: "marquee-cancel" }),
]);

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 6.2 Matching
// ---------------------------------------------------------------------------------------------------------------------------------------------
/**
 * The action bound to (mode, key, mods), or undefined: the rows of the machine's mode first; if the mode is not `normal` and nothing matches, the rows of
 * `normal`. Ctrl, alt and meta bits are compared exactly; the shift bit only for named keys, Space and letters. The first matching row wins.
 */
export function matchBinding(table: readonly Binding[], mode: string, key: string, mods: number): BindingAction | undefined {
  const mask = shiftIgnored(key) ? 14 : 15;
  const find = (m: string): BindingAction | undefined => {
    for (const b of table) if (b.mode === m && b.key === key && (b.mods & mask) === (mods & mask)) return b.action;
    return undefined;
  };
  const own = find(mode);
  if (own !== undefined || mode === "normal") return own;
  return find("normal");
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 6.4 verifyBindings
// ---------------------------------------------------------------------------------------------------------------------------------------------
const bad = (reason: string, path?: string, detail?: string): IaError => new IaError("INVALID_BINDINGS", reason, path, detail);
const MODE = /^x-[a-z0-9][a-z0-9._-]*$/;
const DIRS: readonly unknown[] = ["left", "right", "up", "down"];
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isDelta = (v: unknown): v is 1 | -1 => v === 1 || v === -1;
const PIX_LIMIT = 2 ** 31;

/** The own fields of an action by type: each missing, extra or wrongly typed field is INVALID_VALUE (not SCHEMA, A-17). */
const ACTIONS: ReadonlyMap<string, { fields: readonly string[]; ok(f: Map<string, unknown>): boolean }> = new Map([
  ["spatial", { fields: ["dir", "extend"], ok: (f) => DIRS.includes(f.get("dir")) && typeof f.get("extend") === "boolean" }],
  ["step", { fields: ["delta"], ok: (f) => isDelta(f.get("delta")) }],
  ["first", { fields: [], ok: () => true }],
  ["last", { fields: [], ok: () => true }],
  ["incident", { fields: ["delta"], ok: (f) => isDelta(f.get("delta")) }],
  ["endpoint", { fields: ["end"], ok: (f) => f.get("end") === "src" || f.get("end") === "tgt" }],
  ["toggle-focus", { fields: [], ok: () => true }],
  ["activate", { fields: [], ok: () => true }],
  ["clear-selection", { fields: [], ok: () => true }],
  ["context", { fields: [], ok: () => true }],
  ["pan", { fields: ["dx", "dy"], ok: (f) => { const x = f.get("dx"), y = f.get("dy"); return isInt(x) && isInt(y) && Math.abs(x) <= PIX_LIMIT && Math.abs(y) <= PIX_LIMIT; } }],
  ["zoom", { fields: ["factor"], ok: (f) => { const x = f.get("factor"); return isInt(x) && x >= 1 && x <= 1_000_000; } }],
  ["fit", { fields: [], ok: () => true }],
  ["select-all", { fields: [], ok: () => true }],
  ["marquee-start", { fields: [], ok: () => true }],
  ["marquee-commit", { fields: [], ok: () => true }],
  ["marquee-cancel", { fields: [], ok: () => true }],
]);

function readAction(v: unknown, path: string): BindingAction {
  const e = plainEntries(v);
  const type = e?.get("type");
  const spec = typeof type === "string" ? ACTIONS.get(type) : undefined;
  if (e === undefined || spec === undefined) throw bad("UNKNOWN_ACTION", path);
  if (e.size !== spec.fields.length + 1 || !spec.fields.every((f) => e.has(f)) || !spec.ok(e)) throw bad("INVALID_VALUE", path);
  const out: Record<string, unknown> = { type };
  for (const f of spec.fields) out[f] = e.get(f);
  return out as unknown as BindingAction;
}

/**
 * Verifies and copies a binding table (6.4, first failure wins). (1) an array of closed objects with exactly action, key, mode, mods (SCHEMA); (2) per row in
 * order: mode, mods, key token, action type, action fields, `Tab` in any mode (TAB_BOUND), duplicate (mode, key, mods with the shift bit cleared where 6.2
 * ignores it); (3) every mode other than `normal` that occurs has a row (mode, Escape, 0) (NO_ESCAPE_EXIT).
 */
export function verifyBindings(table: unknown): Binding[] {
  if (!Array.isArray(table)) throw bad("SCHEMA", undefined, "an array expected");
  const rows: Map<string, unknown>[] = [];
  for (let i = 0; i < table.length; i++) {
    const d = Object.getOwnPropertyDescriptor(table, String(i));
    const e = d === undefined || d.get !== undefined || d.set !== undefined ? undefined : plainEntries(d.value);
    if (e === undefined || e.size !== 4 || !["action", "key", "mode", "mods"].every((k) => e.has(k))) throw bad("SCHEMA", `[${i}]`, "exactly action, key, mode, mods");
    rows.push(e);
  }
  const out: Binding[] = [];
  const seen = new Set<string>();
  const modes: string[] = []; // in first-occurrence order
  const seenModes = new Set<string>();
  const escapes = new Set<string>();
  rows.forEach((e, i) => {
    const p = `[${i}]`;
    const mode = e.get("mode"), mods = e.get("mods"), key = e.get("key");
    if (typeof mode !== "string" || !(mode === "normal" || mode === "marquee" || MODE.test(mode))) throw bad("INVALID_VALUE", `${p}.mode`);
    if (!isInt(mods) || mods < 0 || mods > 15) throw bad("INVALID_VALUE", `${p}.mods`);
    if (typeof key !== "string" || !isKeyToken(key)) throw bad("UNKNOWN_KEY", `${p}.key`);
    const action = readAction(e.get("action"), `${p}.action`);
    if (key === "Tab") throw bad("TAB_BOUND", p);
    const id = JSON.stringify([mode, key, shiftIgnored(key) ? mods & 14 : mods]);
    if (seen.has(id)) throw bad("DUPLICATE_BINDING", p);
    seen.add(id);
    if (!seenModes.has(mode)) { seenModes.add(mode); modes.push(mode); }
    if (key === "Escape" && mods === 0) escapes.add(mode);
    out.push({ mode, key, mods, action });
  });
  for (const m of modes) if (m !== "normal" && !escapes.has(m)) throw bad("NO_ESCAPE_EXIT", undefined, m);
  return out;
}

/** The canonical bytes (IGR-CJ/1) of a verified table (Appendix A.3 for the default table); a table that does not verify is refused. */
export function serializeBindings(t: readonly Binding[]): Uint8Array {
  return canonicalBytesSigned(verifyBindings(t) as unknown as CJValue);
}
