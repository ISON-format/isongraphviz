// The admission sequence of 28-STABLE-LAYOUT-DESIGN.md section 12.1, shared by every function that reads a scene or a drawing.
import { bindLayout } from "isongraph-visualize-layout-core";
import type { Layout } from "isongraph-visualize-layout-core";
import { verifyScene } from "isongraph-visualize-scene-core";
import type { NodeRef, Scene, WireEdgeAddress, WireNodeRef } from "isongraph-visualize-scene-core";
import { nodeKey, nodeRefFromWire, snapshotBytes } from "isongraph-visualize-scene-core/primitives";
import { StableLayoutError } from "./errors.js";
import { COORD_LIMIT, MAX_NODE_KEY_UNITS, MAX_REL_UNITS, guard, unreadable, type StableBudget } from "./limits.js";
import type { PreviousDrawing } from "./types.js";

export interface IdxNode { key: string; ref: WireNodeRef; nref: NodeRef }
export interface IdxEdge { key: string; wire: WireEdgeAddress }
export interface SceneIdx {
  scene: Scene; sceneSha256: string; directed: boolean;
  nodes: IdxNode[]; edges: IdxEdge[]; nodeIndex: Map<string, number>; edgeKeys: Set<string>;
}
export interface DrawingIdx extends SceneIdx { layout: Layout; layoutSha256: string; x: number[]; y: number[] }

const tag = (v: unknown): string => guard(() => Object.prototype.toString.call(v));

/** `{ sceneBytes, layoutBytes }`, each property read once. Anything else (a snapshot value, an index, null) is SCHEMA. */
export function readDrawing(d: unknown, path: string): { sceneBytes: unknown; layoutBytes: unknown } {
  if (guard(() => typeof d !== "object" || d === null || Array.isArray(d))) throw new StableLayoutError("INVALID_REQUEST", "SCHEMA", path, "object expected");
  try {
    const o = d as Record<string, unknown>;
    return { sceneBytes: o["sceneBytes"], layoutBytes: o["layoutBytes"] };
  } catch (e) { throw unreadable(e); }
}

export interface ByteInput { value: unknown; path: string; cap: number }

/**
 * Section 12.1 steps (1)-(2): every argument must be a Uint8Array (SCHEMA), then every byte length is read ONCE and compared with its
 * cap BEFORE any copy, parse or hash (INPUT_BYTES), then each array is copied. Returns the owned copies, in order.
 */
export function admitBytes(inputs: ByteInput[]): Uint8Array[] {
  const lengths: number[] = [];
  for (const i of inputs) {
    if (tag(i.value) !== "[object Uint8Array]") throw new StableLayoutError("INVALID_REQUEST", "SCHEMA", i.path, "Uint8Array expected");
    try { lengths.push((i.value as Uint8Array).length); } catch (e) { throw unreadable(e); }
  }
  inputs.forEach((i, k) => {
    if (lengths[k]! > i.cap) throw new StableLayoutError("RESOURCE_LIMIT", "INPUT_BYTES", i.path, `${lengths[k]} bytes > ${i.cap}`);
  });
  return inputs.map((i) => {
    try { return snapshotBytes(i.value as Uint8Array); }
    catch (e) { throw new StableLayoutError("INVALID_REQUEST", "SCHEMA", i.path, e instanceof Error ? e.message : String(e)); }
  });
}

export interface ArtifactIn { role: "previous" | "next"; path: string; sceneBytes: Uint8Array; layoutBytes?: Uint8Array }

/**
 * Steps (3)-(6) over every artifact in order: verification and binding, counts, key lengths, coordinate domain. Each step is
 * one pass over all artifacts before the next step begins. Returns an index per artifact (a DrawingIdx when a layout was given).
 */
export async function admitArtifacts(items: ArtifactIn[], budget: StableBudget): Promise<(SceneIdx | DrawingIdx)[]> {
  // (3) verification and binding; errors of verifyScene / bindLayout propagate unchanged
  const verified: { scene: Scene; sceneSha256: string; layout?: Layout; layoutSha256?: string }[] = [];
  for (const it of items) {
    if (it.layoutBytes !== undefined) {
      const b = await bindLayout(it.sceneBytes, it.layoutBytes);
      verified.push({ scene: b.scene, sceneSha256: b.sceneSha256, layout: b.layout, layoutSha256: b.layoutSha256 });
    } else {
      const v = await verifyScene(it.sceneBytes);
      verified.push({ scene: v.scene, sceneSha256: v.sceneSha256 });
    }
  }
  // (4) counts: nodes, then edges, per scene
  items.forEach((it, i) => {
    const s = verified[i]!.scene;
    if (s.nodes.length > budget.maxNodes) throw new StableLayoutError("RESOURCE_LIMIT", "NODE_LIMIT", `${it.path}.nodes`, `${s.nodes.length} nodes > ${budget.maxNodes}`);
    if (s.edges.length > budget.maxEdges) throw new StableLayoutError("RESOURCE_LIMIT", "EDGE_LIMIT", `${it.path}.edges`, `${s.edges.length} edges > ${budget.maxEdges}`);
  });
  // (5) key lengths, on the strings actually used, before any Map or edge key is built
  const nodeKeys: string[][] = verified.map((v, i) => v.scene.nodes.map((n, k) => {
    const key = nodeKey(nodeRefFromWire(n.ref));
    if (key.length > MAX_NODE_KEY_UNITS) throw new StableLayoutError("RESOURCE_LIMIT", "KEY_LENGTH", `${items[i]!.path}.nodes[${k}]`, `node key ${key.length} units > ${MAX_NODE_KEY_UNITS}`);
    return key;
  }));
  verified.forEach((v, i) => v.scene.edges.forEach((e, k) => {
    const units = JSON.stringify(e.ref.rel).length;
    if (units > MAX_REL_UNITS) throw new StableLayoutError("RESOURCE_LIMIT", "KEY_LENGTH", `${items[i]!.path}.edges[${k}]`, `relation ${units} units > ${MAX_REL_UNITS}`);
  }));
  // (6) coordinate domain of every node of every layout read, removed nodes included
  items.forEach((it, i) => {
    const l = verified[i]!.layout;
    if (l === undefined) return;
    for (const n of l.nodes) {
      if (Math.abs(n.x) > COORD_LIMIT || Math.abs(n.y) > COORD_LIMIT) {
        throw new StableLayoutError(it.role === "previous" ? "INVALID_PREVIOUS" : "INVALID_NEXT", "COORDINATE_DOMAIN", `${it.path}.layout`, `|coordinate| > 2^50`);
      }
    }
  });
  // indexes (keys, Maps): only now
  return verified.map((v, i): SceneIdx | DrawingIdx => {
    const keys = nodeKeys[i]!;
    const nodes: IdxNode[] = v.scene.nodes.map((n, k) => ({ key: keys[k]!, ref: n.ref, nref: nodeRefFromWire(n.ref) }));
    const nodeIndex = new Map<string, number>(nodes.map((n, k) => [n.key, k] as const));
    const edges: IdxEdge[] = v.scene.edges.map((e) => ({
      key: JSON.stringify([nodeKey(nodeRefFromWire(e.ref.src)), e.ref.rel, nodeKey(nodeRefFromWire(e.ref.tgt)), e.ref.ord]),
      wire: e.ref,
    }));
    const base: SceneIdx = { scene: v.scene, sceneSha256: v.sceneSha256, directed: v.scene.graph.directed, nodes, edges, nodeIndex, edgeKeys: new Set(edges.map((e) => e.key)) };
    if (v.layout === undefined) return base;
    const pos = new Map<string, [number, number]>();
    for (const n of v.layout.nodes) pos.set(nodeKey(nodeRefFromWire(n.ref)), [n.x, n.y]);
    const x: number[] = [], y: number[] = [];
    for (const n of nodes) { const p = pos.get(n.key)!; x.push(p[0]); y.push(p[1]); } // bindLayout guarantees both sets are equal
    return { ...base, layout: v.layout, layoutSha256: v.layoutSha256!, x, y };
  });
}

export const isDrawing = (i: SceneIdx | DrawingIdx): i is DrawingIdx => (i as DrawingIdx).layout !== undefined;

/** A previous argument as bytes: null stays null. */
export function readPrevious(previous: unknown): { sceneBytes: unknown; layoutBytes: unknown } | null {
  if (previous === null) return null;
  return readDrawing(previous, "previous");
}

/** Distinct neighbours per node of the new scene: either direction, any relation, self-loops ignored (section 5.2), in index order. */
export function adjacencyOf(idx: SceneIdx): number[][] {
  const adj: Set<number>[] = idx.nodes.map(() => new Set<number>());
  for (const e of idx.edges) {
    const a = idx.nodeIndex.get(nodeKey(nodeRefFromWire(e.wire.src)))!, b = idx.nodeIndex.get(nodeKey(nodeRefFromWire(e.wire.tgt)))!;
    if (a === b) continue;
    adj[a]!.add(b); adj[b]!.add(a);
  }
  return adj.map((s) => [...s].sort((p, q) => p - q));
}

export type { PreviousDrawing };
