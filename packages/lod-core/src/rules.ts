// src/rules.ts — topology-only collapse sets (design 29 section 6): pendant-fold/1 (the default) and components/1. kcore/1 is reserved, unqualified.
import { verifyScene } from "isongraph-visualize-scene-core";
import { snapshotBytes } from "isongraph-visualize-scene-core/primitives";
import { LODError } from "./errors.js";
import { paintGroups } from "./laminar.js";
import { INT31_MAX, MAX_AGG_DEPTH, MAX_INPUT_BYTES, MAX_EDGES, MAX_GROUPS, MAX_MEMBER_ENTRIES, MAX_NODES, MAX_RULES, resolveBudget, type BudgetOptions } from "./limits.js";
import { indexScene } from "./sceneinfo.js";
import { guardCaller } from "./state.js";
import type { Group, GroupCatalog, RuleSpec, WireNodeRef } from "./types.js";
import { Meter, workSuggest } from "./work.js";

const PARAM = (path: string, detail: string): LODError => new LODError("INVALID_POLICY", "INVALID_RULE_PARAM", path, detail);

type Parsed = { rule: "pendant-fold/1" | "components/1"; min: number };

/** One spec, read once from an own-property snapshot. UNSUPPORTED_RULE before INVALID_RULE_PARAM. */
function parseSpec(raw: unknown, i: number): Parsed {
  const path = `rules[${i}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw PARAM(path, "object expected");
  const o = new Map<string, unknown>();
  for (const k of Object.keys(raw)) o.set(k, (raw as Record<string, unknown>)[k]); // own enumerable properties, each read once; a Map keeps an own __proto__ key as data
  const id = o.get("rule");
  if (typeof id !== "string") throw PARAM(`${path}.rule`, "string expected");
  const paramKey = id === "pendant-fold/1" ? "min_leaves" : id === "components/1" ? "min_size" : undefined;
  if (paramKey === undefined) throw new LODError("UNSUPPORTED_RULE", undefined, `${path}.rule`, id);
  for (const k of [...o.keys()].sort()) if (k !== "rule" && k !== paramKey) throw PARAM(`${path}.${k}`, "unknown parameter");
  const v = o.get(paramKey);
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 2 || v > INT31_MAX) throw PARAM(`${path}.${paramKey}`, "integer 2 .. 2^31-1 expected");
  return { rule: id as Parsed["rule"], min: v };
}

const compareIdx = (a: readonly number[], b: readonly number[]): number => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1; // a proper prefix first
};

/**
 * Union, deduplication and the limit and laminarity checks of a catalog. `outputs[r]` are the groups (node-index lists) of rule `r`.
 * Order: sort and deduplicate equal lists; GROUP_LIMIT, MEMBER_LIMIT (counts, as for a state); laminarity (OVERLAPPING_GROUPS); DEPTH_LIMIT.
 * With the two qualified rules only GROUP_LIMIT is reachable; the other checks are defensive for future rules (exercised with mocked output).
 */
export function assembleCatalog(sceneSha256: string, nodes: readonly WireNodeRef[], outputs: ReadonlyArray<ReadonlyArray<readonly number[]>>): GroupCatalog {
  const all: number[][] = [];
  for (const out of outputs) for (const g of out) all.push([...g].sort((a, b) => a - b));
  all.sort(compareIdx);
  const lists: number[][] = [];
  for (const g of all) if (lists.length === 0 || compareIdx(lists[lists.length - 1]!, g) !== 0) lists.push(g);
  if (lists.length > MAX_GROUPS) throw new LODError("RESOURCE_LIMIT", "GROUP_LIMIT");
  let entries = 0;
  for (const g of lists) entries += g.length;
  if (entries > MAX_MEMBER_ENTRIES) throw new LODError("RESOURCE_LIMIT", "MEMBER_LIMIT");
  const painting = paintGroups(lists, nodes.length);
  if (painting.maxDepth > MAX_AGG_DEPTH) throw new LODError("RESOURCE_LIMIT", "DEPTH_LIMIT");
  const groups: Group[] = lists.map((g) => ({ members: g.map((i) => ({ id: nodes[i]!.id, type: nodes[i]!.type })) }));
  return { scene_sha256: sceneSha256, groups };
}

export async function suggestGroups(sceneBytes: Uint8Array, rules: readonly RuleSpec[], options?: BudgetOptions): Promise<GroupCatalog> {
  return (await suggestGroupsDetailed(sceneBytes, rules, options)).catalog;
}

/** The same call with the work meter and W exposed (tests assert ticks <= W). */
export async function suggestGroupsDetailed(sceneBytes: Uint8Array, rules: readonly RuleSpec[], options?: BudgetOptions): Promise<{ catalog: GroupCatalog; ticks: number; W: bigint }> {
  const input = snapshotBytes(sceneBytes); // first statements, synchronous
  const budget = resolveBudget(options);
  if (input.length > MAX_INPUT_BYTES) throw new LODError("RESOURCE_LIMIT", "INPUT_BYTES"); // sizes right after the budget shape, before anything else
  if (!Array.isArray(rules)) throw PARAM("rules", "array expected");
  const rawSpecs = Array.from(rules);
  if (rawSpecs.length > MAX_RULES) throw new LODError("RESOURCE_LIMIT", "RULE_LIMIT");
  guardCaller(rawSpecs); // cycle and visit budget of the caller-owned spec graph
  const specs = rawSpecs.map(parseSpec);

  const { scene, sceneSha256 } = await verifyScene(input);
  const n = scene.nodes.length, m = scene.edges.length;
  if (n > Math.min(budget.maxNodes, MAX_NODES)) throw new LODError("RESOURCE_LIMIT", "NODE_LIMIT");
  if (m > Math.min(budget.maxEdges, MAX_EDGES)) throw new LODError("RESOURCE_LIMIT", "EDGE_LIMIT");
  const meter = new Meter();
  const info = indexScene(scene, meter, { nodes: "rules", edges: "rules", keys: "rules" });
  const W = workSuggest(n, m, specs.length, info.Lkey);
  if (W > BigInt(budget.maxWork)) throw new LODError("RESOURCE_LIMIT", "WORK_LIMIT");

  // the skeleton: distinct unordered pairs {u, v}, u != v (direction, relation, ordinal and self-loops ignored)
  const pairs = new Set<number>();
  const deg = new Int32Array(n), last = new Int32Array(n).fill(-1);
  const eu: number[] = [], ev: number[] = [];
  for (let e = 0; e < m; e++) {
    let u = info.src[e]!, v = info.tgt[e]!;
    meter.add("rules", 1);
    if (u === v) continue;
    if (u > v) { const t = u; u = v; v = t; }
    const key = u * n + v;
    if (pairs.has(key)) continue;
    pairs.add(key);
    eu.push(u); ev.push(v);
    deg[u]!++; deg[v]!++; last[u] = v; last[v] = u;
  }
  const outputs: number[][][] = [];
  for (const s of specs) {
    if (s.rule === "pendant-fold/1") {
      const byHost = new Map<number, number[]>();
      for (let v = 0; v < n; v++) {
        meter.add("rules", 1);
        if (deg[v] !== 1) continue;
        const h = last[v]!;
        const l = byHost.get(h);
        if (l === undefined) byHost.set(h, [v]); else l.push(v);
      }
      const out: number[][] = [];
      for (const l of byHost.values()) if (l.length >= s.min) out.push(l);
      out.sort(compareIdx);
      outputs.push(out);
    } else {
      const parent = new Int32Array(n);
      for (let v = 0; v < n; v++) { parent[v] = v; meter.add("rules", 1); }
      const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
      for (let i = 0; i < eu.length; i++) { meter.add("rules", 1); const a = find(eu[i]!), b = find(ev[i]!); if (a !== b) parent[a < b ? b : a] = a < b ? a : b; }
      const comp = new Map<number, number[]>();
      for (let v = 0; v < n; v++) { meter.add("rules", 1); const r = find(v); const l = comp.get(r); if (l === undefined) comp.set(r, [v]); else l.push(v); }
      const out: number[][] = [];
      for (const l of comp.values()) if (l.length >= s.min) out.push(l);
      out.sort(compareIdx);
      outputs.push(out);
    }
  }
  const catalog = assembleCatalog(sceneSha256, scene.nodes.map((x) => x.ref), outputs);
  return { catalog, ticks: meter.ticks["rules"], W };
}
