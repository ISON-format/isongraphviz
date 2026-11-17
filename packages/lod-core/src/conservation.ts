// src/conservation.ts — the information-preservation law, executable (design 29 section 7.4).
import { LODError } from "./errors.js";
import type { View } from "./types.js";

const fail = (detail: string): never => { throw new LODError("INTERNAL", "CONSERVATION", undefined, detail); };

const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);

/**
 * C-nodes, C-edges and C-elided over a view of a scene with `n` nodes and `m` edges. Throws INTERNAL/CONSERVATION.
 * `removedSelfLoopItems` is known only inside `deriveView` (the items it removed whose endpoints coincide); when given, C-elided is exact,
 * otherwise only `items <= sum(elided_edges) <= 2 * items` is checked (a view does not record that number).
 * C-ids (each aggregate id equals the derived id of its leaf set) needs hashing and is checked by the callers.
 */
export function checkConservation(view: View, n: number, m: number, removedSelfLoopItems?: number): void {
  // C-nodes
  const seen = new Set<string>();
  const key = (r: { id: string; type: string }): string => JSON.stringify([r.type, r.id]);
  for (const nd of view.nodes) {
    const k = key(nd.ref);
    if (seen.has(k)) fail(`C-nodes: node ${k} listed twice`);
    seen.add(k);
  }
  let hiddenTotal = 0;
  for (const a of view.aggregates) {
    for (const h of a.hidden) {
      const k = key(h);
      if (seen.has(k)) fail(`C-nodes: ${k} is both visible or hidden twice`);
      seen.add(k);
      hiddenTotal++;
    }
  }
  if (view.nodes.length + hiddenTotal !== n) fail(`C-nodes: ${view.nodes.length} + ${hiddenTotal} != ${n}`);
  const visible = new Set(view.nodes.map((x) => key(x.ref)));
  for (const a of view.aggregates) {
    const ex = a.exposed ?? [];
    for (const e of ex) if (!visible.has(key(e))) fail(`C-nodes: exposed ${key(e)} is not a visible node`);
    if (a.member_count !== a.hidden.length + ex.length) fail(`C-nodes: member_count of ${a.id}`);
  }
  // C-edges
  const rc = (what: string, count: number, rels: ReadonlyArray<{ count: number }>): void => { if (sum(rels.map((r) => r.count)) !== count) fail(`C-edges: rel_counts of ${what} do not sum to ${count}`); };
  for (const b of view.aggregate_edges) rc("a bundle", b.count, b.rel_counts);
  for (const a of view.aggregates) rc(`internal edges of ${a.id}`, a.internal_edges.count, a.internal_edges.rel_counts);
  const elidedScene = view.elided?.scene_edges ?? 0;
  if (view.elided !== undefined) rc("elided", view.elided.scene_edges, view.elided.rel_counts);
  const total = view.edges.length + sum(view.aggregate_edges.map((b) => b.count)) + sum(view.aggregates.map((a) => a.internal_edges.count)) + elidedScene;
  if (total !== m) fail(`C-edges: ${total} != ${m}`);
  // C-elided
  const items = view.elided?.items ?? 0;
  const ee = sum(view.nodes.map((x) => x.elided_edges ?? 0)) + sum(view.aggregates.map((a) => a.elided_edges ?? 0));
  if (removedSelfLoopItems !== undefined) { if (ee !== 2 * items - removedSelfLoopItems) fail(`C-elided: ${ee} != 2*${items} - ${removedSelfLoopItems}`); }
  else if (ee < items || ee > 2 * items) fail(`C-elided: ${ee} outside [${items}, ${2 * items}]`);
}
