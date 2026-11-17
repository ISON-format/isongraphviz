import { verifyScene } from "isongraph-visualize-scene-core";
import type { Scene, SceneNode, WireNodeRef } from "isongraph-visualize-scene-core";
import { compareNodeRef, decodeNodeId, labelOf, nodeRefFromWire, snapshotBytes } from "isongraph-visualize-scene-core/primitives";
import { ISONGraph } from "ison-graph-ts";
import { computeLayout as coreComputeLayout } from "ison-graph-ts/viz";
import { LayoutError } from "./errors.js";
import { finalize } from "./produce.js";
import { validatePolicy } from "./policy.js";
import { quantize } from "./quantize.js";
import type { ForceBudget, ForceConfig, ForceOptions, LayoutNode, LayoutResult, Policy } from "./types.js";

/** Measured, not a performance target: igl-evidence/budget-measurement.out.txt, 21-IGL1-DESIGN.md 7.3. */
export const DEFAULT_FORCE_BUDGET: Readonly<ForceBudget> = Object.freeze({ maxNodes: 2000, maxWork: 100_000_000 });

/**
 * Graph construction and Core's per-edge setup cost something even with zero iterations (owner, 2026-11-16 re-review). Measured on
 * Core 1.4.1: about 1.7 us to build and 1.2 us to set up per node or edge, about 3 us together, about 180 pair-interaction units at the
 * 17 ns median; rounded up to 200. An execution control only: never in the artifact. 21-IGL1-DESIGN.md 7.3.
 */
export const CONSTRUCTION_UNITS = 200n;

/**
 * Core's per-iteration cost is not only the n(n-1)/2 pair interactions (review finding I-3): it also pays per edge and per node every
 * iteration (displacement map, spring loop). Measured on Core 1.4.1 on Node 22 and 24 (igl-evidence/budget-iteration-model.out.txt),
 * 12 points from n=2 to n=200: the first formula (pairs + E) undercounted at 8 of 12; pairs + 3E + 8n + 4 covers all 12. Core returns
 * at once for n <= 1, so the iteration term is charged only for n >= 2. `edgeCount` is the PHYSICAL entry count (physicalEdgeCount).
 */
export const ITERATION_EDGE_UNITS = 3n;
export const ITERATION_NODE_UNITS = 8n;
export const ITERATION_BASE_UNITS = 4n;

export function forceWork(nodeCount: number, edgeCount: number, iterations: number): bigint {
  const n = BigInt(nodeCount);
  const e = BigInt(edgeCount);
  const perIteration = n < 2n ? 0n : (n * (n - 1n)) / 2n + ITERATION_EDGE_UNITS * e + ITERATION_NODE_UNITS * n + ITERATION_BASE_UNITS;
  return BigInt(iterations) * perIteration + CONSTRUCTION_UNITS * (n + e);
}

export function resolveBudget(b: unknown): ForceBudget {
  if (b === undefined) return { ...DEFAULT_FORCE_BUDGET };
  if (typeof b !== "object" || b === null) throw new LayoutError("INVALID_POLICY", "INVALID_BUDGET");
  const out: ForceBudget = { ...DEFAULT_FORCE_BUDGET };
  const given = b as Record<string, unknown>;
  for (const k of Object.keys(given)) if (k !== "maxNodes" && k !== "maxWork") throw new LayoutError("INVALID_POLICY", "INVALID_BUDGET", `budget.${k}`);
  for (const k of ["maxNodes", "maxWork"] as const) {
    const v = given[k]; // read once
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) throw new LayoutError("INVALID_POLICY", "INVALID_BUDGET", `budget.${k}`);
    out[k] = v;
  }
  return out;
}

export function checkBudget(nodeCount: number, edgeCount: number, iterations: number, budget: ForceBudget): void {
  if (nodeCount > budget.maxNodes) throw new LayoutError("RESOURCE_LIMIT", "NODE_LIMIT", undefined, `${nodeCount} nodes > ${budget.maxNodes}`);
  const w = forceWork(nodeCount, edgeCount, iterations);
  if (w > BigInt(budget.maxWork)) throw new LayoutError("RESOURCE_LIMIT", "WORK_LIMIT", undefined, `work ${w} > ${budget.maxWork}`);
}

const CORE_ID = /^[^\s:|]+$/; // ison-graph-ts _checkIdentifier for node ids
const DIGITS = /^-?[0-9]+$/;
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const unsupported = (reason: string, n: SceneNode): LayoutError => new LayoutError("UNSUPPORTED_SCENE", reason, undefined, `${n.ref.type} ${n.ref.id}`);

/** Qualifies the WHOLE node set against the pinned Core's representation limits before any Core graph exists (design 7.1). Ran as `preflight` in igl-evidence/order-and-collisions.mjs. */
export function preflightForce(nodes: readonly SceneNode[]): void {
  const keys = new Set<string>();
  const ints = new Map<string, Set<string>>();
  const digitStrings = new Map<string, Set<string>>();
  for (const n of nodes) {
    const id = decodeNodeId(n.ref.id);
    if (id.kind === "int") {
      if (id.value > SAFE || id.value < -SAFE) throw unsupported("UNSAFE_NODE_ID", n);
    } else if (!CORE_ID.test(id.value)) {
      throw unsupported("CORE_UNREPRESENTABLE_ID", n);
    }
    const key = `${n.ref.type} ${labelOf(id)}`; // Core layoutKey: `${type} ${String(id)}`
    if (keys.has(key)) throw unsupported("AMBIGUOUS_ORDER_KEY", n);
    keys.add(key);
    if (!ints.has(n.ref.type)) { ints.set(n.ref.type, new Set()); digitStrings.set(n.ref.type, new Set()); }
    if (id.kind === "int") ints.get(n.ref.type)!.add(id.value.toString());
    else if (DIGITS.test(id.value)) digitStrings.get(n.ref.type)!.add(BigInt(id.value).toString());
  }
  for (const [type, set] of ints) {
    for (const v of set) if (digitStrings.get(type)!.has(v)) throw new LayoutError("UNSUPPORTED_SCENE", "CORE_ID_TWIN", undefined, `${type} ${v}`);
  }
}

const coreWire = (type: string, id: string | number): WireNodeRef => ({ id: typeof id === "number" ? `i:${id}` : `s:${id}`, type });
/** Logical edge identity: directed = (rel, src, tgt); undirected = the endpoints put in NodeRef/2 order (a mirror is the same edge). */
function logicalEdgeKey(directed: boolean, rel: string, a: WireNodeRef, b: WireNodeRef): string {
  let [x, y] = [a, b];
  if (!directed && compareNodeRef(nodeRefFromWire(x), nodeRefFromWire(y)) > 0) [x, y] = [y, x];
  return JSON.stringify([rel, x.type, x.id, y.type, y.id]);
}

/**
 * The rebuilt Core graph must retain every scene node and every scene edge by LOGICAL identity, for directed and undirected scenes
 * alike (owner finding P2). The pinned Core 1.4.1 stores an undirected edge as TWO physical entries (one per orientation; a
 * self-loop once) and refuses an explicit mirror add (DuplicateEdgeError), so a bare `edgeCount() === scene.edges.length` is wrong
 * for undirected scenes (measured). This compares each logical edge's expected physical multiplicity with what Core holds.
 */
export function verifyCoreGraph(scene: Scene, graph: ISONGraph): void {
  const bad = (d: string): LayoutError => new LayoutError("UNSUPPORTED_SCENE", "CORE_RESULT_MISMATCH", undefined, d);
  const directed = scene.graph.directed;
  if (graph.directed !== directed) throw bad("directedness");
  const sceneNodes = new Set(scene.nodes.map((n) => `${n.ref.type}\u0000${n.ref.id}`));
  let nodes = 0;
  for (const n of graph.nodes()) {
    nodes++;
    const w = coreWire(n.type, n.id);
    if (!sceneNodes.has(`${w.type}\u0000${w.id}`)) throw bad("node not in scene");
  }
  if (nodes !== scene.nodes.length) throw bad("node count");
  const expected = new Map<string, number>(); // logical edge -> physical entries Core should hold
  for (const e of scene.edges) {
    const k = logicalEdgeKey(directed, e.ref.rel, e.ref.src, e.ref.tgt);
    const selfLoop = e.ref.src.type === e.ref.tgt.type && e.ref.src.id === e.ref.tgt.id;
    expected.set(k, (expected.get(k) ?? 0) + (directed || selfLoop ? 1 : 2));
  }
  for (const e of graph.edges()) {
    const k = logicalEdgeKey(directed, e.relType, coreWire(e.source[0], e.source[1]), coreWire(e.target[0], e.target[1]));
    const left = expected.get(k);
    if (!left) throw bad("edge not in scene");
    expected.set(k, left - 1);
  }
  for (const left of expected.values()) if (left !== 0) throw bad("edge count");
}

/** Physical edge entries Core will build for a scene (the construction cost driver): E directed, 2E undirected (self-loops counted twice: conservative). */
export const physicalEdgeCount = (scene: Scene): number => (scene.graph.directed ? scene.edges.length : 2 * scene.edges.length);

export function buildCoreGraph(scene: Scene): ISONGraph {
  const g = new ISONGraph("scene", scene.graph.directed);
  const coreId = (wire: string): number | string => { const id = decodeNodeId(wire); return id.kind === "int" ? Number(id.value) : id.value; };
  for (const n of scene.nodes) g.addNode(n.ref.type, coreId(n.ref.id), {});
  for (const e of scene.edges) g.addEdge(e.ref.rel, [e.ref.src.type, coreId(e.ref.src.id)], [e.ref.tgt.type, coreId(e.ref.tgt.id)], {});
  return g;
}

/**
 * Core 1.4.1 builds graph.edges() with `edgeList.push(...edges)`, which overflows the call stack once ONE relation holds about 125,000
 * physical edges (124,860 on Node 24, 125,191 on Node 22; igl-evidence/core-edge-limit.out.txt), and the exact threshold depends on the
 * host's stack size (review finding I-2). The producer therefore refuses, on every host alike, far below it: 50,000 physical edges
 * per relation (about 40% of the measured threshold). Undirected edges count twice (Core stores both orientations; a self-loop is
 * counted twice, conservatively). A Core representation limit, like the node checks; never in the artifact.
 */
export const MAX_PHYSICAL_EDGES_PER_RELATION = 50_000;

export function preflightForceEdges(scene: Scene): void {
  const per = scene.graph.directed ? 1 : 2;
  const counts = new Map<string, number>();
  for (const e of scene.edges) {
    const k = (counts.get(e.ref.rel) ?? 0) + per;
    if (k > MAX_PHYSICAL_EDGES_PER_RELATION) throw new LayoutError("UNSUPPORTED_SCENE", "CORE_EDGE_LIMIT", undefined, `relation ${e.ref.rel}: more than ${MAX_PHYSICAL_EDGES_PER_RELATION} physical edges`);
    counts.set(e.ref.rel, k);
  }
}

/** Shared by computeForceLayout, computeLayout and verifyReproducible. `input` is already an owned copy. */
export async function produceForce(input: Uint8Array, policy: Policy, budget: ForceBudget): Promise<LayoutResult> {
  const cfg = policy.config as unknown as ForceConfig;
  const { scene, sceneSha256 } = await verifyScene(input);
  checkBudget(scene.nodes.length, physicalEdgeCount(scene), cfg.iterations, budget); // before anything is built; Core is synchronous and cannot be cancelled
  preflightForce(scene.nodes);
  preflightForceEdges(scene);
  let raw: Map<string, [number, number]>;
  try {
    const graph = buildCoreGraph(scene);
    verifyCoreGraph(scene, graph); // logical-edge equivalence, directed and undirected (not a raw count)
    // radii and spacing are deliberately never passed: igl-force/1 is Core's plain layout (owner D4)
    raw = coreComputeLayout(graph, { width: cfg.width, height: cfg.height, iterations: cfg.iterations, seed: cfg.seed, margin: cfg.margin });
  } catch (e) {
    if (e instanceof LayoutError) throw e;
    throw new LayoutError("UNSUPPORTED_SCENE", "CORE_REJECTED", undefined, e instanceof Error ? e.message : String(e));
  }
  if (raw.size !== scene.nodes.length) throw new LayoutError("UNSUPPORTED_SCENE", "CORE_RESULT_MISMATCH", undefined, "layout size");
  const nodes: LayoutNode[] = scene.nodes.map((n) => {
    const p = raw.get(`${n.ref.type} ${n.label}`);
    if (!p) throw new LayoutError("UNSUPPORTED_SCENE", "CORE_RESULT_MISMATCH", undefined, `${n.ref.type} ${n.label}`);
    return { ref: { id: n.ref.id, type: n.ref.type }, x: quantize(p[0]), y: quantize(p[1]) };
  });
  return finalize(sceneSha256, policy, nodes);
}

export async function computeForceLayout(sceneBytes: Uint8Array, config: ForceConfig, options?: ForceOptions): Promise<LayoutResult> {
  const input = snapshotBytes(sceneBytes); // synchronous, before the first await
  const policy = validatePolicy({ family: "FORCE", algorithm: "igl-force/1", config });
  const budget = resolveBudget(options === undefined || options === null ? undefined : options.budget);
  return produceForce(input, policy, budget);
}
