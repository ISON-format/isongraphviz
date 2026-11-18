// src/tree.ts - the companion tree (design 9.2, 9.3): a pure description of roles, names, positions and relationships over (RenderModel, SemanticState),
// the machine mode and the last events. It adds structure to the strings of 27 10 and changes none of them (Law 6).
import { buildAccessibleModel, type AccessibleItem, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { IaError } from "isongraph-visualize-interaction-core";
import { liveTextOf, snapshotEvents } from "./live.js";
import type { CompanionItem, CompanionOptions, CompanionTree, Mode, WindowOption } from "./types.js";
import { canon, copyPlain, itemId, plainEntries, schema, type Plain } from "./util.js";

export const COMPANION_FORMAT = "igr-companion/1";
export const COMPANION_FULL_MAX = 500;
export const COMPANION_WINDOW = 200;
export const DEFAULT_MAX_TREE_BYTES = 16_777_216;
export const ID_PREFIX = /^[a-z][a-z0-9-]{0,31}$/;
const WINDOW_COUNT_MAX = 5000;

const cfg = (reason: string, path: string, detail?: string): IaError => new IaError("INVALID_CONFIG", reason, path, detail);

// ---------------------------------------------------------------------------------------------------------------------------------------------
// windows (9.3)
// ---------------------------------------------------------------------------------------------------------------------------------------------
function checkInt(v: unknown, path: string, lo: number, hi: number): number {
  if (typeof v !== "number") throw cfg("SCHEMA", path, "number expected");
  if (!Number.isInteger(v)) throw cfg("NOT_INTEGER", path); // NaN and +-Infinity are non-integers (A-71)
  if (v < lo || v > hi) throw cfg("OUT_OF_RANGE", path);
  return v;
}

/** The auto window: all N when N <= 500, else 200 positions centred on the focus (position 1 without a focus). */
export function defaultWindow(setSize: number, focusPosition: number | undefined): { first: number; count: number } {
  if (!Number.isSafeInteger(setSize) || setSize < 0) throw cfg("OUT_OF_RANGE", "setSize");
  if (focusPosition !== undefined && (!Number.isSafeInteger(focusPosition) || focusPosition < 1)) throw cfg("OUT_OF_RANGE", "focusPosition");
  if (setSize <= COMPANION_FULL_MAX) return { first: 1, count: setSize };
  const p = focusPosition ?? 1;
  return { first: Math.max(1, Math.min(p - 100, setSize - COMPANION_WINDOW + 1)), count: COMPANION_WINDOW };
}

function readWindow(w: unknown): WindowOption {
  if (w === "auto" || w === "all") return w;
  const m = plainEntries(w);
  if (m === undefined) throw cfg("SCHEMA", "window", '"auto", "all" or {first, count} expected');
  for (const k of m.keys()) if (k !== "first" && k !== "count") throw cfg("SCHEMA", `window.${k}`);
  if (!m.has("first") || !m.has("count")) throw cfg("SCHEMA", "window", "first and count are required");
  return { first: checkInt(m.get("first"), "window.first", 1, Number.MAX_SAFE_INTEGER), count: checkInt(m.get("count"), "window.count", 0, WINDOW_COUNT_MAX) };
}

interface ResolvedOptions { idPrefix: string; window: WindowOption; events: { type: string; [k: string]: unknown }[]; mode: Mode; omitFocus: boolean; maxTreeBytes: number }

function readOptions(options: unknown): ResolvedOptions {
  const r: ResolvedOptions = { idPrefix: "igc", window: "auto", events: [], mode: "normal", omitFocus: false, maxTreeBytes: DEFAULT_MAX_TREE_BYTES };
  if (options === undefined) return r;
  const m = plainEntries(options);
  if (m === undefined) throw cfg("SCHEMA", "options", "a plain object expected");
  for (const k of m.keys()) if (!["idPrefix", "window", "events", "mode", "omitFocusAnnouncement", "maxTreeBytes"].includes(k)) throw cfg("SCHEMA", `options.${k}`);
  const g = (k: string): unknown => m.get(k);
  if (g("idPrefix") !== undefined) {
    if (typeof g("idPrefix") !== "string") throw cfg("SCHEMA", "idPrefix", "string expected");
    if (!ID_PREFIX.test(g("idPrefix") as string)) throw cfg("INVALID_VALUE", "idPrefix", "does not match /^[a-z][a-z0-9-]{0,31}$/");
    r.idPrefix = g("idPrefix") as string;
  }
  if (g("window") !== undefined) r.window = readWindow(g("window"));
  if (g("events") !== undefined) r.events = snapshotEvents(g("events"), "INVALID_CONFIG", "events");
  if (g("mode") !== undefined) {
    if (typeof g("mode") !== "string") throw cfg("SCHEMA", "mode", "string expected");
    if (g("mode") !== "normal" && g("mode") !== "marquee") throw cfg("INVALID_VALUE", "mode");
    r.mode = g("mode") as Mode;
  }
  if (g("omitFocusAnnouncement") !== undefined) {
    if (typeof g("omitFocusAnnouncement") !== "boolean") throw cfg("SCHEMA", "omitFocusAnnouncement", "boolean expected");
    r.omitFocus = g("omitFocusAnnouncement") as boolean;
  }
  if (g("maxTreeBytes") !== undefined) r.maxTreeBytes = checkInt(g("maxTreeBytes"), "maxTreeBytes", 0, 2 ** 31);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the tree (9.2)
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** The positions (1-based, ascending, each once) that have an item: the window, the focused position and the tab stop (9.3). */
function presentPositions(n: number, win: { first: number; count: number }, fpos: number | undefined, stop: number | undefined): number[] {
  const last = Math.min(n, win.first + win.count - 1);
  const lo = win.first, hi = last;
  const below: number[] = [], above: number[] = [];
  for (const p of [fpos, stop]) {
    if (p === undefined || p < 1 || p > n) continue;
    if (p >= lo && p <= hi) continue;
    const bucket = p < lo ? below : above;
    if (!bucket.includes(p)) bucket.push(p);
  }
  below.sort((a, b) => a - b); above.sort((a, b) => a - b);
  const out = below;
  for (let p = Math.max(1, lo); p <= hi; p++) out.push(p);
  for (const p of above) out.push(p);
  return out;
}

export function buildCompanionTree(model: RenderModel, state: SemanticState, options?: CompanionOptions): CompanionTree {
  const o = readOptions(options);
  const am = buildAccessibleModel(model, state); // validates the model and the state (27 4.2)
  const n = am.items.length;
  let fpos: number | undefined;
  for (const it of am.items) if (it.focused) { fpos = it.position; break; }
  const stop = n === 0 ? undefined : fpos ?? 1;
  const win = o.window === "auto" ? defaultWindow(n, fpos) : o.window === "all" ? { first: 1, count: n } : { first: o.window.first, count: o.window.count };
  const items: CompanionItem[] = presentPositions(n, win, fpos, stop).map((p) => {
    const it: AccessibleItem = am.items[p - 1]!;
    const item: CompanionItem = {
      address: it.address, focused: it.focused, id: itemId(o.idPrefix, it.address), kind: it.role, name: it.name, position: it.position,
      roledescription: it.role, selected: it.selected, set_size: n, tabindex: p === stop ? 0 : -1,
    };
    if (it.description !== undefined) item.description = it.description;
    return item;
  });
  const tree: CompanionTree = {
    companion: COMPANION_FORMAT, container: { description: am.status, name: am.summary, role: "application" }, id_prefix: o.idPrefix, items,
    layout_sha256: model.layoutSha256,
    list: { multiselectable: true, role: "listbox", set_size: n, window: { count: win.count, first: win.first } },
    live: { atomic: true, politeness: "polite", role: "status", text: liveTextOf(o.events, model, state, o.omitFocus) },
    mode: o.mode, scene_sha256: model.sceneSha256,
  };
  if (serializeCompanionTree(tree).length > o.maxTreeBytes) throw new IaError("RESOURCE_LIMIT", "BYTES_LIMIT", "tree", `the tree exceeds ${o.maxTreeBytes} bytes`);
  return tree;
}

export function serializeCompanionTree(t: CompanionTree): Uint8Array { return canon(t); }

// ---------------------------------------------------------------------------------------------------------------------------------------------
// reading a tree of an unknown source (9.2, 10): an owned copy, a closed shape, depth at most 8
// ---------------------------------------------------------------------------------------------------------------------------------------------
const MAX_TREE_DEPTH = 8;
const bad = (path: string, detail?: string): IaError => schema("INVALID_TREE", path, detail);

function obj(v: unknown, path: string, keys: readonly string[], required: readonly string[], strict: boolean): Map<string, unknown> {
  const m = plainEntries(v);
  if (m === undefined) throw bad(path, "an object expected");
  if (strict) for (const k of m.keys()) if (!keys.includes(k)) throw bad(`${path}.${k}`, "unknown key");
  for (const k of required) if (!m.has(k)) throw bad(`${path}.${k}`, "missing");
  return m;
}
const str = (v: unknown, path: string): string => { if (typeof v !== "string") throw bad(path, "string expected"); return v; };
const bool = (v: unknown, path: string): boolean => { if (typeof v !== "boolean") throw bad(path, "boolean expected"); return v; };
const int = (v: unknown, path: string): number => { if (typeof v !== "number" || !Number.isSafeInteger(v)) throw bad(path, "integer expected"); return v; };

/** An owned, shape-checked copy of a tree. `loose` accepts a missing `live` object and a missing item `description`, and unknown extra keys (the gate reads what it checks). */
export interface ReadTree {
  companion: string; container: { description: string; name: string; role: string }; id_prefix: string; items: ReadItem[]; layout_sha256: string;
  list: { multiselectable: boolean; role: string; set_size: number; window: { count: number; first: number } };
  live?: { atomic: boolean; politeness: string; role: string; text: string }; mode: string; scene_sha256: string;
}
export interface ReadItem {
  address: Plain; description?: string; focused: boolean; id: string; kind: string; name: string; position: number; roledescription: string; selected: boolean; set_size: number; tabindex: number;
}

export function readTree(tree: unknown, loose: boolean): ReadTree {
  const copy = copyPlain(tree, MAX_TREE_DEPTH);
  if (copy === undefined) throw bad("tree", "not plain data, or nested deeper than 8");
  const top = obj(copy, "tree", ["companion", "container", "id_prefix", "items", "layout_sha256", "list", "live", "mode", "scene_sha256"],
    ["companion", "container", "id_prefix", "items", "layout_sha256", "list", "mode", "scene_sha256", ...(loose ? [] : ["live"])], !loose);
  const c = obj(top.get("container"), "tree.container", ["description", "name", "role"], ["description", "name", "role"], !loose);
  const l = obj(top.get("list"), "tree.list", ["multiselectable", "role", "set_size", "window"], ["multiselectable", "role", "set_size", "window"], !loose);
  const w = obj(l.get("window"), "tree.list.window", ["count", "first"], ["count", "first"], !loose);
  const rawItems = top.get("items");
  if (!Array.isArray(rawItems)) throw bad("tree.items", "array expected");
  const items: ReadItem[] = rawItems.map((raw, i) => {
    const p = `tree.items[${i}]`;
    const m = obj(raw, p, ["address", "description", "focused", "id", "kind", "name", "position", "roledescription", "selected", "set_size", "tabindex"],
      ["address", "focused", "id", "kind", "name", "position", "roledescription", "selected", "set_size", "tabindex"], !loose);
    const addr = m.get("address");
    const am = plainEntries(addr);
    if (am === undefined || am.size !== 1 || !(am.has("node") || am.has("edge")) || plainEntries(am.get("node") ?? am.get("edge")) === undefined) throw bad(`${p}.address`, "ElementAddress expected");
    const item: ReadItem = {
      address: addr as Plain, focused: bool(m.get("focused"), `${p}.focused`), id: str(m.get("id"), `${p}.id`), kind: str(m.get("kind"), `${p}.kind`),
      name: str(m.get("name"), `${p}.name`), position: int(m.get("position"), `${p}.position`), roledescription: str(m.get("roledescription"), `${p}.roledescription`),
      selected: bool(m.get("selected"), `${p}.selected`), set_size: int(m.get("set_size"), `${p}.set_size`), tabindex: int(m.get("tabindex"), `${p}.tabindex`),
    };
    if (m.has("description")) item.description = str(m.get("description"), `${p}.description`);
    return item;
  });
  const out: ReadTree = {
    companion: str(top.get("companion"), "tree.companion"),
    container: { description: str(c.get("description"), "tree.container.description"), name: str(c.get("name"), "tree.container.name"), role: str(c.get("role"), "tree.container.role") },
    id_prefix: str(top.get("id_prefix"), "tree.id_prefix"), items, layout_sha256: str(top.get("layout_sha256"), "tree.layout_sha256"),
    list: { multiselectable: bool(l.get("multiselectable"), "tree.list.multiselectable"), role: str(l.get("role"), "tree.list.role"), set_size: int(l.get("set_size"), "tree.list.set_size"),
      window: { count: int(w.get("count"), "tree.list.window.count"), first: int(w.get("first"), "tree.list.window.first") } },
    mode: str(top.get("mode"), "tree.mode"), scene_sha256: str(top.get("scene_sha256"), "tree.scene_sha256"),
  };
  if (top.has("live")) {
    const lv = obj(top.get("live"), "tree.live", ["atomic", "politeness", "role", "text"], ["atomic", "politeness", "role", "text"], !loose);
    out.live = { atomic: bool(lv.get("atomic"), "tree.live.atomic"), politeness: str(lv.get("politeness"), "tree.live.politeness"), role: str(lv.get("role"), "tree.live.role"), text: str(lv.get("text"), "tree.live.text") };
  }
  return out;
}

/**
 * Host-side check (9.2, not oracle-checked): the tree has the exact shape (depth at most 8, scanned before use) and equals the tree built from the same
 * (model, state) with its own prefix, window and mode, except that `live.text` may be any string of at most 400 UTF-16 units.
 */
export function verifyCompanionTree(model: RenderModel, state: SemanticState, tree: unknown): CompanionTree {
  const t = readTree(tree, false);
  if (t.mode !== "normal" && t.mode !== "marquee") throw schema("INVALID_TREE", "tree.mode");
  const w = t.list.window.count > WINDOW_COUNT_MAX ? "all" : { first: t.list.window.first, count: t.list.window.count }; // "all" echoes {1, N} beyond the explicit domain
  let expected: CompanionTree;
  try { expected = buildCompanionTree(model, state, { idPrefix: t.id_prefix, window: w, mode: t.mode }); } catch (e) {
    // a forged window or prefix is a value that differs (INCONSISTENT), not a configuration error of the caller
    if (e instanceof IaError && e.code === "INVALID_CONFIG") throw new IaError("INVALID_TREE", "INCONSISTENT", "tree", "its prefix or window is not a valid one");
    throw e;
  }
  if (t.live === undefined || t.live.text.length > 400) throw new IaError("INVALID_TREE", "INCONSISTENT", "tree.live.text", "at most 400 UTF-16 units");
  const probe = { ...expected, live: { ...expected.live, text: t.live.text } };
  const a = canon(probe), b = canon(t);
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) throw new IaError("INVALID_TREE", "INCONSISTENT", "tree", "differs from the tree built from the model and the state");
  return probe as CompanionTree;
}

