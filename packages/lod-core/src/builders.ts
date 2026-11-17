// src/builders.ts — state builders (design 29 section 5.5 and 12). Builders are conveniences: they take an owned copy of every caller value (each
// property read once), sort (members, group list, pins) and re-verify with the verifyLODState rules. Sorting happens here, never in verifyLODState.
import { nodeRefFromWire, compareNodeRef } from "isongraph-visualize-scene-core/primitives";
import { deriveAggregateId, isAggregateId } from "./aggregate.js";
import { LODError } from "./errors.js";
import { canonicalOrder, checkIntegrity, checkLimits, checkRef, nodeRefKey, parseSchema, toTree, verifyCallerState } from "./state.js";
import type { EdgePolicy, Group, LODState, LabelPolicy, WireNodeRef } from "./types.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** schema -> sort -> limits -> integrity and policy; returns a fresh canonical state. */
function finish(tree: unknown): LODState {
  const sorted = canonicalOrder(parseSchema(tree));
  checkLimits(sorted);
  checkIntegrity(sorted);
  return sorted;
}

/** The tree copy of a state with one top-level field replaced (a non-object state is left for the schema check to reject). */
function withField(state: LODState, key: string, value: unknown): unknown {
  const t = toTree(state);
  if (isObj(t)) t[key] = toTree(value);
  return t;
}

export function emptyState(args: { sceneSha256: string; layoutSha256: string; label_policy: LabelPolicy; zoom_milli: number; edge_policy?: EdgePolicy }): LODState {
  const a = { sceneSha256: args.sceneSha256, layoutSha256: args.layoutSha256, label_policy: args.label_policy, zoom_milli: args.zoom_milli, edge_policy: args.edge_policy };
  const o: Obj = { collapsed: [], label_policy: a.label_policy, layout_sha256: a.layoutSha256, lod: "IGLOD/1", pinned: [], scene_sha256: a.sceneSha256, zoom_milli: a.zoom_milli };
  if (a.edge_policy !== undefined) o["edge_policy"] = a.edge_policy;
  return finish(toTree(o));
}

export function collapseGroup(state: LODState, group: Group): LODState {
  const t = toTree(state);
  const g = toTree(group);
  if (isObj(t) && Array.isArray(t["collapsed"])) t["collapsed"].push(g);
  return finish(t);
}

export function replaceGroups(state: LODState, groups: readonly Group[]): LODState { return finish(withField(state, "collapsed", groups)); }
export function setPinned(state: LODState, refs: readonly WireNodeRef[]): LODState { return finish(withField(state, "pinned", refs)); }
export function withZoom(state: LODState, zoom_milli: number): LODState { return finish(withField(state, "zoom_milli", zoom_milli)); }
export function withLayout(state: LODState, layoutSha256: string): LODState { return finish(withField(state, "layout_sha256", layoutSha256)); }

const sameMembers = (a: readonly WireNodeRef[], b: readonly WireNodeRef[]): boolean => a.length === b.length && a.every((r, i) => nodeRefKey(r) === nodeRefKey(b[i]!));

export async function expandGroup(state: LODState, target: { members: WireNodeRef[] } | { agg: string }): Promise<{ state: LODState; removed: Group }> {
  // everything up to the first await is synchronous: owned copies of the state and of the target
  const st = verifyCallerState(toTree(state)); // the input state is verified first (stages 2-6 of section 3): nothing is repaired by the removal, no id is hashed before the limits
  const tt = toTree(target);
  if (!isObj(tt)) throw new LODError("INVALID_LOD", "SCHEMA", "target", "object expected");
  const keys = Object.keys(tt);
  let wantMembers: WireNodeRef[] | undefined;
  let wantAgg: string | undefined;
  if (keys.length === 1 && keys[0] === "members") {
    const m = tt["members"];
    if (!Array.isArray(m)) throw new LODError("INVALID_LOD", "SCHEMA", "target.members", "array expected");
    wantMembers = m.map((r, i) => checkRef(r, `target.members[${i}]`)).map((ref) => ({ ref, dec: nodeRefFromWire(ref) })).sort((a, b) => compareNodeRef(a.dec, b.dec)).map((x) => x.ref);
  } else if (keys.length === 1 && keys[0] === "agg") {
    const a = tt["agg"];
    if (typeof a !== "string" || !isAggregateId(a)) throw new LODError("INVALID_LOD", "INVALID_ID", "target.agg");
    wantAgg = a;
  } else throw new LODError("INVALID_LOD", "SCHEMA", "target", "exactly one of members or agg expected");

  let at = -1;
  if (wantMembers !== undefined) at = st.collapsed.findIndex((g) => sameMembers(g.members, wantMembers!));
  else {
    for (let i = 0; i < st.collapsed.length && at < 0; i++) if ((await deriveAggregateId(st.scene_sha256, st.collapsed[i]!.members)) === wantAgg) at = i;
  }
  if (at < 0) throw new LODError("INVALID_GROUP", "NOT_ACTIVE");
  const removed = st.collapsed[at]!;
  const rest = st.collapsed.filter((_, i) => i !== at);
  return { state: finish(toTree({ ...st, collapsed: rest })), removed };
}
