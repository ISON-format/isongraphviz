// 28-STABLE-LAYOUT-DESIGN.md section 3: the typed-address diff.
import { admitArtifacts, admitBytes, type IdxEdge, type SceneIdx } from "./admit.js";
import { Meter, readOptions, resolveBudget, type StableBudget } from "./limits.js";
import { compareNodeRef } from "isongraph-visualize-scene-core/primitives";
import type { SceneDiff, WireNodeRef } from "./types.js";

export interface UnionEntry { status: "kept" | "added" | "removed"; pi: number; ni: number }
export interface DiffCore {
  union: UnionEntry[]; // every typed address of either scene, NodeRef/2 order
  edgesAdded: IdxEdge[]; edgesRemoved: IdxEdge[]; edgesCommon: number;
  kept: number; added: number; removed: number;
}

/** Correspondence by typed address only (Law 3): nothing but the type and the tagged id is read. `prev` null behaves as an empty scene. */
export function diffCore(prev: SceneIdx | null, next: SceneIdx): DiffCore {
  const pn = prev === null ? [] : prev.nodes;
  const union: UnionEntry[] = [];
  let i = 0, j = 0, kept = 0, added = 0, removed = 0;
  while (i < pn.length || j < next.nodes.length) {
    if (i < pn.length && j < next.nodes.length) {
      const c = compareNodeRef(pn[i]!.nref, next.nodes[j]!.nref);
      if (c === 0) { union.push({ status: "kept", pi: i++, ni: j++ }); kept++; }
      else if (c < 0) { union.push({ status: "removed", pi: i++, ni: -1 }); removed++; }
      else { union.push({ status: "added", pi: -1, ni: j++ }); added++; }
    } else if (i < pn.length) { union.push({ status: "removed", pi: i++, ni: -1 }); removed++; }
    else { union.push({ status: "added", pi: -1, ni: j++ }); added++; }
  }
  const pe = prev === null ? [] : prev.edges;
  const pk = prev === null ? new Set<string>() : prev.edgeKeys;
  const edgesAdded = next.edges.filter((e) => !pk.has(e.key));
  const edgesRemoved = pe.filter((e) => !next.edgeKeys.has(e.key));
  return { union, edgesAdded, edgesRemoved, edgesCommon: next.edges.length - edgesAdded.length, kept, added, removed };
}

/** C1 (section 12.3): n_prev + n_next + 2*(e_prev + e_next) + n_kept; an absent previous counts as 0. */
export function chargeC1(m: Meter, prev: SceneIdx | null, next: SceneIdx, kept: number): void {
  const np = prev === null ? 0 : prev.nodes.length, ep = prev === null ? 0 : prev.edges.length;
  m.charge(np + next.nodes.length + 2 * (ep + next.edges.length) + kept);
}

const wire = (r: WireNodeRef): WireNodeRef => ({ id: r.id, type: r.type });

export function toSceneDiff(core: DiffCore, prev: SceneIdx | null, next: SceneIdx): SceneDiff {
  const pick = (s: UnionEntry["status"]): WireNodeRef[] => core.union.filter((u) => u.status === s).map((u) => wire(u.ni >= 0 ? next.nodes[u.ni]!.ref : prev!.nodes[u.pi]!.ref));
  const edge = (e: IdxEdge) => ({ ord: e.wire.ord, rel: e.wire.rel, src: wire(e.wire.src), tgt: wire(e.wire.tgt) });
  return {
    directed: { next: next.directed, previous: prev === null ? next.directed : prev.directed },
    edges: { added: core.edgesAdded.map(edge), common: core.edgesCommon, removed: core.edgesRemoved.map(edge) },
    identical: prev !== null && prev.sceneSha256 === next.sceneSha256,
    igls_diff: "IGLS-DIFF/1",
    nodes: { added: pick("added"), kept: pick("kept"), removed: pick("removed") },
  };
}

export async function diffScenes(previousSceneBytes: Uint8Array, nextSceneBytes: Uint8Array, options?: { budget?: Partial<StableBudget> }): Promise<SceneDiff> {
  const o = readOptions(options, ["budget"]);
  const budget = resolveBudget(o.get("budget"));
  const [p, n] = admitBytes([
    { value: previousSceneBytes, path: "previousSceneBytes", cap: budget.maxSceneBytes },
    { value: nextSceneBytes, path: "nextSceneBytes", cap: budget.maxSceneBytes },
  ]);
  const [pi, ni] = await admitArtifacts([
    { role: "previous", path: "previous", sceneBytes: p! },
    { role: "next", path: "next", sceneBytes: n! },
  ], budget);
  const core = diffCore(pi!, ni!);
  chargeC1(new Meter(budget.maxWork), pi!, ni!, core.kept);
  return toSceneDiff(core, pi!, ni!);
}
