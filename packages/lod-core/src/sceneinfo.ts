// src/sceneinfo.ts — integer indexing of a verified scene (every algorithm of V8 runs on integer node indices; design 29 sections 5.1 and 11).
import type { Scene } from "isongraph-visualize-scene-core";
import { ceilDiv, utf8Len, type Meter, type WorkClass } from "./work.js";

/** scene-core nodeKey of a canonical wire reference. */
export const keyOfRef = (r: { id: string; type: string }): string => JSON.stringify([r.type, r.id]);

export interface SceneInfo {
  n: number; m: number; directed: boolean;
  keys: string[]; keyLen: number[]; index: Map<string, number>;
  /** longest nodeKey in UTF-8 bytes over all nodes */
  Lkey: number;
  src: Int32Array; tgt: Int32Array; relOf: Int32Array;
  rels: string[]; Lrel: number;
}

/**
 * Builds the node index (scene order IS rank: the scene's `nodes` array is in NodeRef/2 order), resolves every edge endpoint and relation to integers.
 * Ticks (when a meter is given): per node 1 plus ceil(len/64) of its key; per edge 1, two endpoint lookups (1 + ceil(len/64) each) and one relation lookup
 * (1 + ceil(len/64)). `ticksTo` selects the classes charged (the rule entry point charges everything to "rules").
 */
export function indexScene(scene: Scene, meter?: Meter, ticksTo?: { nodes: WorkClass; edges: WorkClass; keys: WorkClass }): SceneInfo {
  const cls = ticksTo ?? { nodes: "nodes", edges: "edges", keys: "keys" };
  const n = scene.nodes.length, m = scene.edges.length;
  const keys = new Array<string>(n), keyLen = new Array<number>(n);
  const index = new Map<string, number>();
  let Lkey = 0;
  for (let i = 0; i < n; i++) {
    const k = keyOfRef(scene.nodes[i]!.ref);
    keys[i] = k;
    const len = utf8Len(k);
    keyLen[i] = len;
    if (len > Lkey) Lkey = len;
    index.set(k, i);
    meter?.add(cls.nodes, 1);
    meter?.add(cls.keys, ceilDiv(len, 64));
  }
  const src = new Int32Array(m), tgt = new Int32Array(m), relOf = new Int32Array(m);
  const relIds = new Map<string, number>();
  const rels: string[] = [];
  let Lrel = 0;
  for (let e = 0; e < m; e++) {
    const r = scene.edges[e]!.ref;
    const ks = keyOfRef(r.src), kt = keyOfRef(r.tgt);
    meter?.add(cls.edges, 1);
    meter?.add(cls.keys, 2 + ceilDiv(utf8Len(ks), 64) + ceilDiv(utf8Len(kt), 64));
    const s = index.get(ks), t = index.get(kt);
    if (s === undefined || t === undefined) throw new Error("edge endpoint outside the verified scene"); // unreachable after verifyScene
    src[e] = s; tgt[e] = t;
    let id = relIds.get(r.rel);
    const rl = utf8Len(r.rel);
    meter?.add(cls.keys, 1 + ceilDiv(rl, 64));
    if (id === undefined) { id = rels.length; relIds.set(r.rel, id); rels.push(r.rel); if (rl > Lrel) Lrel = rl; }
    relOf[e] = id;
  }
  return { n, m, directed: scene.graph.directed, keys, keyLen, index, Lkey, src, tgt, relOf, rels, Lrel };
}
