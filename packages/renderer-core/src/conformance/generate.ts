// src/conformance/generate.ts - the kit's own generated models (lifecycle row L22: a model one element over a renderer's capacity).
import { verifyScene } from "isongraph-visualize-scene-core";
import { canonicalBytes, compareUtf8 } from "isongraph-visualize-scene-core/primitives";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel } from "../model.js";
import type { RenderModel } from "../types.js";

/** Above this node count the row is not-applicable (design 13.3a). */
export const MAX_GENERATED_NODES = 1_000_000;

/** A directed scene of `nodes` integer-identified nodes and `edges` parallel edges (distinct relations) between the first two nodes, with a FIXED layout. */
export async function generateModel(nodes: number, edges: number): Promise<RenderModel> {
  const n = Math.max(nodes, edges > 0 ? 2 : 0);
  const nodeList = Array.from({ length: n }, (_, k) => ({ category: "n", label: String(k + 1), ref: { id: `i:${k + 1}`, type: "n" } }));
  const rels = Array.from({ length: edges }, (_, k) => `r${k}`).sort(compareUtf8);
  const edgeList = rels.map((rel) => ({ label: rel, ref: { ord: "0", rel, src: { id: "i:1", type: "n" }, tgt: { id: "i:2", type: "n" } } }));
  const scene = canonicalBytes({
    address_scheme: "igs-addr/1", edges: edgeList, graph: { directed: true, profile: "simple" }, igs: "IGS/1", nodes: nodeList,
    source: { artifact_sha256: "0".repeat(64), serialization_profile: "ison-v1" },
  } as never);
  const sc = (await verifyScene(scene)).scene;
  const lay = await computeFixedLayout(scene, sc.nodes.map((node, k) => ({ ref: node.ref, x: k % 1000, y: Math.floor(k / 1000) })));
  const big = 2 ** 30;
  return buildRenderModel(scene, lay.layoutBytes, { limits: { maxNodes: n + 1, maxEdges: edges + 1, maxSceneBytes: big, maxLayoutBytes: big, maxTotalLabelUnits: big } });
}

/** The 32-bit LCG of IGL/1 section 7.1 (state x 1664525 + 1013904223 mod 2^32), the kit's only source of randomness (seeded by the caller). */
export function lcg(seed: number): { int(n: number): number; pick<T>(a: readonly T[]): T; float(): number } {
  let s = seed >>> 0;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  return { int: (n) => (next() >>> 8) % n, pick: (a) => a[(next() >>> 8) % a.length]!, float: () => (next() >>> 8) / 2 ** 24 };
}

/**
 * Tier D model of one seed (design 13.3b): 0 to 40 nodes of 1 to 4 types t0..t3, ids a mix of small integers and ASCII strings of 0 to 8 characters
 * (letters, digits, space), 0 to 2n distinct edges, directed or not, source.artifact_sha256 = the SHA-256 of the seed's bytes, FIXED layout from random
 * positions within +-10^6 thousandths. Everything is written with the canonical writer and verified by the frozen verifiers before use.
 */
export async function generateRandomModel(seed: number): Promise<RenderModel> {
  const rng = lcg(seed ^ 0x5eed5eed);
  const types = Array.from({ length: 1 + rng.int(4) }, (_, i) => `t${i}`);
  const n = rng.int(41);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789 ";
  const seen = new Set<string>();
  const nodes: { category: string; label: string; ref: { id: string; type: string } }[] = [];
  for (let k = 0; k < n; k++) {
    const type = rng.pick(types);
    let id: string;
    if (rng.int(2) === 0) id = `i:${rng.int(60) - 5}`;
    else { const len = rng.int(9); id = "s:" + Array.from({ length: len }, () => alphabet[rng.int(alphabet.length)]!).join(""); }
    const key = type + "\u0000" + id;
    if (seen.has(key)) continue;
    seen.add(key);
    nodes.push({ category: type, label: id.slice(2), ref: { id, type } });
  }
  const { compareNodeRef, nodeRefFromWire } = await import("isongraph-visualize-scene-core/primitives");
  nodes.sort((a, b) => compareNodeRef(nodeRefFromWire(a.ref), nodeRefFromWire(b.ref)));
  const directed = rng.int(2) === 0;
  const edgeKeys = new Set<string>();
  const edges: { label: string; ref: { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } } }[] = [];
  if (nodes.length > 0) {
    const want = rng.int(2 * nodes.length + 1);
    for (let k = 0; k < want * 3 && edges.length < want; k++) {
      let a = rng.int(nodes.length), b = rng.int(nodes.length);
      if (!directed && a > b) [a, b] = [b, a]; // an undirected address has src <= tgt in scene order
      const rel = `r${rng.int(3)}`;
      const key = `${a}|${rel}|${b}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ label: rel, ref: { ord: "0", rel, src: { ...nodes[a]!.ref }, tgt: { ...nodes[b]!.ref } } });
    }
  }
  edges.sort((x, y) => compareNodeRef(nodeRefFromWire(x.ref.src), nodeRefFromWire(y.ref.src)) || compareUtf8(x.ref.rel, y.ref.rel) || compareNodeRef(nodeRefFromWire(x.ref.tgt), nodeRefFromWire(y.ref.tgt)) || compareUtf8(x.ref.ord, y.ref.ord));
  const { sha256Hex } = await import("isongraph-visualize-scene-core/primitives");
  const artifact = await sha256Hex(new TextEncoder().encode(String(seed >>> 0)));
  const scene = canonicalBytes({
    address_scheme: "igs-addr/1", edges, graph: { directed, profile: "simple" }, igs: "IGS/1", nodes,
    source: { artifact_sha256: artifact, serialization_profile: "ison-v1" },
  } as never);
  const sc = (await verifyScene(scene)).scene;
  const lay = await computeFixedLayout(scene, sc.nodes.map((node) => ({ ref: node.ref, x: (rng.int(2_000_001) - 1_000_000) / 1000, y: (rng.int(2_000_001) - 1_000_000) / 1000 })));
  return buildRenderModel(scene, lay.layoutBytes);
}
