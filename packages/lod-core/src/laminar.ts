// src/laminar.ts — the painting algorithm of design 29 section 5.1 (laminar check, parent, depth, top group).
import { LODError } from "./errors.js";

export interface Painting {
  /** `parent[g]`: the smallest strict superset group, or -1. */
  parent: Int32Array;
  /** `depth[g]`: 1 for a group with no parent. */
  depth: Int32Array;
  /** `root[g]`: the maximal group containing g (g itself for a top group). */
  root: Int32Array;
  /** `owner[v]`: the innermost group containing node v, or -1. */
  owner: Int32Array;
  maxDepth: number;
}

/**
 * Groups are processed LARGEST FIRST (counting sort by member count descending; equal sizes keep the given order).
 * Each member of a group must have the same current owner (counting "none" as a value) or the family is not laminar:
 * INVALID_GROUP/OVERLAPPING_GROUPS. The caller has already rejected duplicate groups. `step` is called once per member read and once per member written.
 * Cost O(G + M + n); `G <= n - 1` for any laminar family of distinct groups of size at least 2.
 */
export function paintGroups(groups: ReadonlyArray<ArrayLike<number>>, nodeCount: number, step?: (k: number) => void): Painting {
  const G = groups.length;
  let maxSize = 0;
  for (let g = 0; g < G; g++) if (groups[g]!.length > maxSize) maxSize = groups[g]!.length;
  // counting sort by size descending
  const counts = new Int32Array(maxSize + 2);
  for (let g = 0; g < G; g++) counts[maxSize - groups[g]!.length + 1]!++;
  for (let s = 1; s < counts.length; s++) counts[s] = counts[s]! + counts[s - 1]!;
  const order = new Int32Array(G);
  for (let g = 0; g < G; g++) order[counts[maxSize - groups[g]!.length]!++] = g;

  const owner = new Int32Array(nodeCount).fill(-1);
  const parent = new Int32Array(G).fill(-1);
  const depth = new Int32Array(G);
  const root = new Int32Array(G);
  let maxDepth = 0;
  for (let k = 0; k < G; k++) {
    const g = order[k]!;
    const ms = groups[g]!;
    let o = -2;
    for (let i = 0; i < ms.length; i++) {
      const cur = owner[ms[i]!]!;
      step?.(1);
      if (o === -2) o = cur;
      else if (cur !== o) throw new LODError("INVALID_GROUP", "OVERLAPPING_GROUPS");
    }
    parent[g] = o === -2 ? -1 : o;
    depth[g] = parent[g]! < 0 ? 1 : depth[parent[g]!]! + 1;
    root[g] = parent[g]! < 0 ? g : root[parent[g]!]!;
    if (depth[g]! > maxDepth) maxDepth = depth[g]!;
    for (let i = 0; i < ms.length; i++) { owner[ms[i]!] = g; step?.(1); }
  }
  return { parent, depth, root, owner, maxDepth };
}
