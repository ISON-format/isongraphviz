// src/plan.ts - the DOM plan (design 9.5): a list of operations (JSON arrays of strings, no null; "" is the append marker) that realizes a companion tree
// (full build) or updates the DOM of the previous one. Invariant I-C1: the DOM after executing plan(prev, next) on the DOM of a full build of prev equals,
// in attributes, text and sibling order, the DOM of a full build of next.
import { IaError } from "isongraph-visualize-interaction-core";
import { DEFAULT_MAX_TREE_BYTES, readTree, type ReadItem, type ReadTree } from "./tree.js";
import type { CompanionTree, DomOp } from "./types.js";
import { canon, plainEntries, schema } from "./util.js";

/** The attribute names the executor accepts (design 9.5). */
export const ATTRIBUTE_ALLOWLIST: readonly string[] = [
  "id", "class", "role", "aria-label", "aria-labelledby", "aria-describedby", "aria-live", "aria-atomic", "aria-multiselectable", "aria-selected",
  "aria-posinset", "aria-setsize", "aria-roledescription", "tabindex",
];

const keys = (p: string): { root: string; status: string; live: string; desc: string; list: string } =>
  ({ root: `${p}-root`, status: `${p}-status`, live: `${p}-live`, desc: `${p}-desc`, list: `${p}-list` });

/** The item ops (9.5) of item `i` with `before` the id of the next item in `next.items` and `bd` the description id of the next EDGE item ("" for none). */
function itemOps(out: DomOp[], k: ReturnType<typeof keys>, i: ReadItem, before: string, bd: string): void {
  const id = i.id;
  out.push(["c", id, "div"], ["a", id, "role", "option"], ["a", id, "aria-roledescription", i.roledescription], ["a", id, "tabindex", String(i.tabindex)],
    ["a", id, "aria-selected", i.selected ? "true" : "false"], ["a", id, "aria-posinset", String(i.position)], ["a", id, "aria-setsize", String(i.set_size)], ["t", id, i.name]);
  if (i.kind === "edge") {
    out.push(["c", `${id}-d`, "div"], ["t", `${id}-d`, i.description ?? ""], ["a", id, "aria-describedby", `${id}-d`], ["p", k.desc, `${id}-d`, bd]);
  }
  out.push(["p", k.list, id, before]);
}

/** For item index `x` of `items`: the id of the next item and the description id of the next edge item after it. */
function neighbours(items: readonly ReadItem[], x: number, nextEdgeDesc: string): { before: string; bd: string } {
  return { before: x + 1 < items.length ? items[x + 1]!.id : "", bd: nextEdgeDesc };
}

function fullBuild(next: ReadTree): DomOp[] {
  const k = keys(next.id_prefix), out: DomOp[] = [];
  out.push(["c", k.root, "div"], ["a", k.root, "class", "igr-companion-hidden"], ["a", k.root, "role", "application"], ["a", k.root, "aria-label", next.container.name],
    ["a", k.root, "aria-describedby", k.status],
    ["c", k.status, "div"], ["t", k.status, next.container.description], ["p", k.root, k.status, ""],
    ["c", k.live, "div"], ["a", k.live, "role", "status"], ["a", k.live, "aria-live", "polite"], ["a", k.live, "aria-atomic", "true"], ["t", k.live, next.live!.text], ["p", k.root, k.live, ""],
    ["c", k.desc, "div"], ["p", k.root, k.desc, ""],
    ["c", k.list, "div"], ["a", k.list, "role", "listbox"], ["a", k.list, "aria-multiselectable", "true"], ["a", k.list, "aria-labelledby", k.root], ["p", k.root, k.list, ""]);
  let nextEdgeDesc = "";
  for (let x = next.items.length - 1; x >= 0; x--) {
    const i = next.items[x]!;
    const nb = neighbours(next.items, x, nextEdgeDesc);
    itemOps(out, k, i, nb.before, nb.bd);
    if (i.kind === "edge") nextEdgeDesc = `${i.id}-d`;
  }
  out.push(["p", "@host", k.root, ""]);
  return out;
}

function update(prev: ReadTree, next: ReadTree): DomOp[] {
  const k = keys(next.id_prefix), out: DomOp[] = [];
  const prevById = new Map<string, ReadItem>(prev.items.map((i) => [i.id, i]));
  const nextIds = new Set<string>(next.items.map((i) => i.id));
  // the planner asserts the stable order of the retained items (I-C1): the traversal order is stable and every tree lists its items ascending
  const retainedPrev = prev.items.filter((i) => nextIds.has(i.id)).map((i) => i.id);
  const retainedNext = next.items.filter((i) => prevById.has(i.id)).map((i) => i.id);
  if (retainedPrev.length !== retainedNext.length || retainedPrev.some((id, x) => id !== retainedNext[x])) {
    throw new IaError("INVALID_TREE", "INCONSISTENT", "items", "the retained items do not keep their relative order");
  }
  // (1) the status text
  if (next.container.description !== prev.container.description) out.push(["t", k.status, next.container.description]);
  // (2) the live text; an unchanged non-empty announcement is rewritten (cleared, then set) so that it is announced again
  const pt = prev.live!.text, nt = next.live!.text;
  if (nt !== pt) out.push(["t", k.live, nt]);
  else if (nt !== "") out.push(["t", k.live, ""], ["t", k.live, nt]);
  // (3) removals, in previous order
  for (const i of prev.items) if (!nextIds.has(i.id)) { out.push(["r", i.id]); if (i.kind === "edge") out.push(["r", `${i.id}-d`]); }
  // (4) creations, from the last item to the first of next
  let nextEdgeDesc = "";
  for (let x = next.items.length - 1; x >= 0; x--) {
    const i = next.items[x]!;
    if (!prevById.has(i.id)) { const nb = neighbours(next.items, x, nextEdgeDesc); itemOps(out, k, i, nb.before, nb.bd); }
    if (i.kind === "edge") nextEdgeDesc = `${i.id}-d`;
  }
  // (5) attribute changes of the retained items, in next order
  for (const i of next.items) {
    const p = prevById.get(i.id);
    if (p === undefined) continue;
    if (p.tabindex !== i.tabindex) out.push(["a", i.id, "tabindex", String(i.tabindex)]);
    if (p.selected !== i.selected) out.push(["a", i.id, "aria-selected", i.selected ? "true" : "false"]);
    if (p.position !== i.position) out.push(["a", i.id, "aria-posinset", String(i.position)]);
    if (p.set_size !== i.set_size) out.push(["a", i.id, "aria-setsize", String(i.set_size)]);
  }
  return out;
}

/** Plans the DOM operations that take the DOM of `prev` (or nothing) to `next`. A refused plan (over `maxPlanBytes`) is RESOURCE_LIMIT/BYTES_LIMIT. */
export function planCompanionUpdate(prev: CompanionTree | undefined, next: CompanionTree, options?: { maxPlanBytes?: number }): DomOp[] {
  let max = DEFAULT_MAX_TREE_BYTES;
  if (options !== undefined) {
    const o = plainEntries(options); // each property read once; an accessor is refused
    if (o === undefined) throw schema("INVALID_CONFIG", "options");
    for (const k of o.keys()) if (k !== "maxPlanBytes") throw schema("INVALID_CONFIG", `options.${k}`);
    const v = o.get("maxPlanBytes");
    if (v !== undefined) {
      if (typeof v !== "number") throw schema("INVALID_CONFIG", "maxPlanBytes");
      if (!Number.isInteger(v)) throw new IaError("INVALID_CONFIG", "NOT_INTEGER", "maxPlanBytes");
      if (v < 0 || v > 2 ** 31) throw new IaError("INVALID_CONFIG", "OUT_OF_RANGE", "maxPlanBytes");
      max = v;
    }
  }
  const n = readTree(next, true);
  if (n.live === undefined) throw schema("INVALID_TREE", "tree.live", "the planner needs the live text");
  let p: ReadTree | undefined;
  if (prev !== undefined) {
    p = readTree(prev, true);
    if (p.live === undefined) throw schema("INVALID_TREE", "tree.live", "the planner needs the live text");
    if (p.id_prefix !== n.id_prefix) throw schema("INVALID_TREE", "id_prefix", "both trees need the same id_prefix");
  }
  let ops: DomOp[];
  if (p === undefined) ops = fullBuild(n);
  else if (p.scene_sha256 !== n.scene_sha256 || p.layout_sha256 !== n.layout_sha256) ops = [["r", keys(p.id_prefix).root], ...fullBuild(n)];
  else ops = update(p, n);
  let size = 0;
  for (const op of ops) { size += canon(op).length + 1; if (size > max) throw new IaError("RESOURCE_LIMIT", "BYTES_LIMIT", "plan", `the plan exceeds ${max} bytes`); }
  return ops;
}

/** The canonical text of a plan: one op per line, one LF after every line (3.1); an empty plan is zero bytes. */
export function serializePlan(ops: readonly DomOp[]): Uint8Array {
  const parts = ops.map((op) => canon(op));
  let n = 0;
  for (const p of parts) n += p.length + 1;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; out[at++] = 0x0a; }
  return out;
}
