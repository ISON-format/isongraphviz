// src/workloads.ts - deterministic, seeded workload generators. Each produces an ISON source (the input of IGS/1) and explicit node positions (the input of the
// IGL/1 FIXED family); the committed packages' public APIs turn them into a verified scene and a verified layout (buildArtifacts). Nothing here reads a clock,
// Math.random or a transcendental function: a seed gives the same bytes on every run of the same engine.
import { compileScene } from "isongraph-visualize-scene-core";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import type { FixedPosition } from "isongraph-visualize-layout-core";
import { createRng, type Rng } from "./rng.js";

export type Shape = "sparse" | "dag" | "dense" | "hubs" | "hierarchy" | "groups";
export const SHAPES: readonly Shape[] = ["sparse", "dag", "dense", "hubs", "hierarchy", "groups"];
export type SizeName = "S" | "M" | "L" | "XL";
/** The node counts of the four tiers (PlanMap V12: small, medium, large, very large). */
export const SIZE_NODES: Readonly<Record<SizeName, number>> = Object.freeze({ S: 100, M: 1_000, L: 10_000, XL: 100_000 });

/**
 * compileScene (through Core) overflows the call stack with a RangeError once ONE relation holds about 125,000 edges (measured here: 120,000 compile, 125,000 do not,
 * Node 24). The generators therefore never put more than this many edges in one relation: past it the edges are split over relations REL_0, REL_1, ... in contiguous blocks.
 */
export const MAX_EDGES_PER_RELATION = 60_000;

export interface WorkloadSpec { shape: Shape; nodes: number; seed: number }
export interface WorkloadMeta { maxDegree: number; meanDegree: number; layers?: number; depth?: number; clusters?: number; intraEdgeFraction?: number }
export interface Workload {
  spec: WorkloadSpec;
  nodeCount: number;
  edges: number;
  /** One category (node type) per node. The node with index i has the integer identifier i. */
  types: string[];
  edgeSrc: Int32Array;
  edgeTgt: Int32Array;
  edgeRel: Uint8Array;
  rels: string[];
  /** The ISON source bytes (UTF-8, LF). */
  source: Uint8Array;
  /** Explicit positions in pixels with one decimal; the input of computeFixedLayout. */
  positions: FixedPosition[];
  meta: WorkloadMeta;
}

interface Graph { types: string[]; src: number[]; tgt: number[]; rel: number[]; rels: string[]; xs: number[]; ys: number[] }

const r1 = (v: number): number => Math.round(v * 10) / 10 + 0;
const capTarget = (target: number, n: number): number => Math.min(target, Math.floor((n * (n - 1)) / 2));

/** An edge set without self-loops or duplicate ordered pairs; add() is false for a refused candidate. */
function edgeSet(n: number): { add(a: number, b: number): boolean } {
  const seen = new Set<number>();
  return { add(a, b) { if (a === b) return false; const k = a * n + b; if (seen.has(k)) return false; seen.add(k); return true; } };
}

function sparse(n: number, rng: Rng): Graph {
  const g: Graph = { types: new Array<string>(n).fill("node"), src: [], tgt: [], rel: [], rels: ["LINKS", "OWNS", "USES"], xs: [], ys: [] };
  const set = edgeSet(n);
  const target = capTarget(2 * n, n);
  for (let tries = 0; g.src.length < target && tries < 100 * target + 100; tries++) {
    const a = rng.int(n), b = rng.int(n);
    if (!set.add(a, b)) continue;
    g.src.push(a); g.tgt.push(b); g.rel.push(rng.int(3));
  }
  const side = 80 * Math.sqrt(n);
  for (let i = 0; i < n; i++) { g.xs.push(r1(rng.next() * side)); g.ys.push(r1(rng.next() * side)); }
  return g;
}

function dag(n: number, rng: Rng): { g: Graph; layers: number } {
  const layers = Math.max(2, Math.ceil(Math.sqrt(n)));
  const layerOf = (i: number): number => Math.floor((i * layers) / n);
  const start = new Array<number>(layers + 1).fill(n);
  for (let i = n - 1; i >= 0; i--) start[layerOf(i)] = i;
  const g: Graph = { types: [], src: [], tgt: [], rel: [], rels: ["FEEDS"], xs: [], ys: [] };
  for (let i = 0; i < n; i++) {
    const l = layerOf(i);
    g.types.push(`t${l % 4}`);
    g.xs.push(l * 160);
    g.ys.push(r1((i - start[l]!) * 48 + (l % 2) * 24));
    if (l === 0) continue;
    const want = 1 + rng.int(3);
    const mine = new Set<number>();
    for (let tries = 0; mine.size < want && tries < 4 * want; tries++) {
      const from = rng.next() < 0.7 ? start[l - 1]! + rng.int(start[l]! - start[l - 1]!) : rng.int(start[l]!);
      if (mine.has(from)) continue;
      mine.add(from);
      g.src.push(from); g.tgt.push(i); g.rel.push(0);
    }
  }
  return { g, layers };
}

function dense(n: number, rng: Rng): { g: Graph; clusters: number } {
  const size = 20, nc = Math.ceil(n / size);
  const g: Graph = { types: [], src: [], tgt: [], rel: [], rels: ["TALKS_TO"], xs: [], ys: [] };
  const comm = (i: number): number => Math.floor(i / size);
  const lo = (c: number): number => c * size, hi = (c: number): number => Math.min(n, (c + 1) * size);
  const cols = Math.ceil(Math.sqrt(nc));
  for (let i = 0; i < n; i++) {
    const c = comm(i);
    g.types.push(`c${c % 6}`);
    g.xs.push(r1((c % cols) * 260 + rng.bump() * 110));
    g.ys.push(r1(Math.floor(c / cols) * 260 + rng.bump() * 110));
  }
  const set = edgeSet(n);
  const target = capTarget(8 * n, n);
  for (let tries = 0; g.src.length < target && tries < 100 * target + 100; tries++) {
    const a = rng.int(n);
    const b = rng.next() < 0.85 ? lo(comm(a)) + rng.int(hi(comm(a)) - lo(comm(a))) : rng.int(n);
    if (!set.add(a, b)) continue;
    g.src.push(a); g.tgt.push(b); g.rel.push(0);
  }
  return { g, clusters: nc };
}

/** Preferential attachment: each new node points at two distinct earlier nodes chosen in proportion to their degree (an endpoint list, no logarithm). */
function hubs(n: number, rng: Rng): Graph {
  const g: Graph = { types: [], src: [], tgt: [], rel: [], rels: ["REFERENCES"], xs: [], ys: [] };
  const ends = new Int32Array(4 * n + 8);
  let len = 0;
  g.src.push(1); g.tgt.push(0); g.rel.push(0);
  ends[len++] = 1; ends[len++] = 0;
  for (let i = 2; i < n; i++) {
    const mine = new Set<number>();
    const want = Math.min(2, i);
    while (mine.size < want) mine.add(ends[rng.int(len)]!);
    for (const t of [...mine].sort((a, b) => a - b)) {
      g.src.push(i); g.tgt.push(t); g.rel.push(0);
      ends[len++] = i; ends[len++] = t;
    }
  }
  const deg = new Int32Array(n);
  for (let e = 0; e < g.src.length; e++) { deg[g.src[e]!]!++; deg[g.tgt[e]!]!++; }
  const mean = (2 * g.src.length) / n;
  const cut = Math.max(10, 5 * mean);
  for (let i = 0; i < n; i++) g.types.push(deg[i]! >= cut ? "hub" : "node");
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => deg[b]! - deg[a]! || a - b);
  const rank = new Int32Array(n);
  order.forEach((v, r) => { rank[v] = r; });
  const scale = 90 * Math.sqrt(n);
  for (let i = 0; i < n; i++) {
    const spread = 0.12 + 0.88 * Math.sqrt(rank[i]! / n);
    g.xs.push(r1(rng.bump() * scale * spread));
    g.ys.push(r1(rng.bump() * scale * spread));
  }
  return g;
}

/** A level-order random tree (mean branching 3) with a tidy drawing: leaves take consecutive columns in depth-first order, an inner node sits over its children. */
function hierarchy(n: number, rng: Rng): { g: Graph; depth: number } {
  const g: Graph = { types: [], src: [], tgt: [], rel: [], rels: ["CONTAINS"], xs: new Array<number>(n).fill(0), ys: new Array<number>(n).fill(0) };
  const depth = new Int32Array(n), childCount = new Int32Array(n), firstChild = new Int32Array(n).fill(-1);
  let next = 1;
  for (let v = 0; v < n && next < n; v++) {
    const c = Math.min(1 + rng.int(5), n - next);
    childCount[v] = c;
    firstChild[v] = next;
    for (let k = 0; k < c; k++) { depth[next] = depth[v]! + 1; g.src.push(v); g.tgt.push(next); g.rel.push(0); next++; }
  }
  let leaf = 0;
  const stack: number[] = [0], visit: number[] = [];
  while (stack.length > 0) {
    const v = stack.pop()!;
    visit.push(v);
    for (let k = childCount[v]! - 1; k >= 0; k--) stack.push(firstChild[v]! + k);
  }
  for (const v of visit) if (childCount[v] === 0) { g.xs[v] = leaf * 36; leaf++; }
  for (let i = visit.length - 1; i >= 0; i--) {
    const v = visit[i]!;
    if (childCount[v]! > 0) g.xs[v] = (g.xs[firstChild[v]!]! + g.xs[firstChild[v]! + childCount[v]! - 1]!) / 2;
  }
  let maxDepth = 0;
  for (let v = 0; v < n; v++) {
    g.types.push(childCount[v]! > 0 ? "branch" : "leaf");
    g.xs[v] = r1(g.xs[v]!);
    g.ys[v] = depth[v]! * 110;
    if (depth[v]! > maxDepth) maxDepth = depth[v]!;
  }
  return { g, depth: maxDepth };
}

/** Clusters of up to 40 nodes (a category each, eight categories in rotation), three out-edges per node inside its cluster, one link out of about 40 % of the clusters. */
function groups(n: number, rng: Rng): { g: Graph; clusters: number; intra: number } {
  const size = Math.min(40, Math.ceil(n / 2)), nc = Math.ceil(n / size);
  const g: Graph = { types: [], src: [], tgt: [], rel: [], rels: ["LINKS_TO"], xs: [], ys: [] };
  const cols = Math.ceil(Math.sqrt(nc));
  const lo = (c: number): number => c * size, hi = (c: number): number => Math.min(n, (c + 1) * size);
  for (let i = 0; i < n; i++) {
    const c = Math.floor(i / size);
    g.types.push(`g${c % 8}`);
    g.xs.push(r1((c % cols) * 400 + rng.bump() * 150));
    g.ys.push(r1(Math.floor(c / cols) * 400 + rng.bump() * 150));
  }
  const set = edgeSet(n);
  let intra = 0;
  for (let a = 0; a < n; a++) {
    const c = Math.floor(a / size), m = hi(c) - lo(c);
    const want = Math.min(3, m - 1);
    let got = 0;
    for (let tries = 0; got < want && tries < 8 * want + 8; tries++) {
      const b = lo(c) + rng.int(m);
      if (!set.add(a, b)) continue;
      g.src.push(a); g.tgt.push(b); g.rel.push(0); got++; intra++;
    }
  }
  for (let c = 0; c < nc; c++) {
    if (nc < 2 || rng.next() >= 0.4) continue;
    const a = lo(c) + rng.int(hi(c) - lo(c));
    let other = rng.int(nc - 1);
    if (other >= c) other++;
    const b = lo(other) + rng.int(hi(other) - lo(other));
    if (set.add(a, b)) { g.src.push(a); g.tgt.push(b); g.rel.push(0); }
  }
  return { g, clusters: nc, intra };
}

function toIson(g: Graph): Uint8Array {
  const n = g.types.length;
  const byType = new Map<string, number[]>();
  for (let i = 0; i < n; i++) { const t = g.types[i]!; const l = byType.get(t); if (l) l.push(i); else byType.set(t, [i]); }
  const lines: string[] = [];
  for (const t of [...byType.keys()].sort()) {
    lines.push(`nodes.${t}`, "id");
    for (const i of byType.get(t)!) lines.push(String(i));
    lines.push("");
  }
  const perRel = new Map<number, number[]>();
  for (let e = 0; e < g.src.length; e++) { const r = g.rel[e]!; const l = perRel.get(r); if (l) l.push(e); else perRel.set(r, [e]); }
  const order = [...perRel.keys()].sort((a, b) => (g.rels[a]! < g.rels[b]! ? -1 : 1));
  for (const r of order) {
    lines.push(`edges.${g.rels[r]!}`, "source target");
    for (const e of perRel.get(r)!) lines.push(`:${g.types[g.src[e]!]!}:${g.src[e]!} :${g.types[g.tgt[e]!]!}:${g.tgt[e]!}`);
    lines.push("");
  }
  return new TextEncoder().encode(lines.join("\n"));
}

function splitRelations(g: Graph): void {
  const counts = new Array<number>(g.rels.length).fill(0);
  for (const r of g.rel) counts[r]!++;
  if (Math.max(...counts) <= MAX_EDGES_PER_RELATION) return;
  const e = g.src.length, k = Math.ceil(e / MAX_EDGES_PER_RELATION), base = g.rels.length === 1 ? g.rels[0]! : "REL";
  g.rels = Array.from({ length: k }, (_, i) => `${base}_${i}`);
  for (let i = 0; i < e; i++) g.rel[i] = Math.floor((i * k) / e);
}

export function generateWorkload(spec: WorkloadSpec): Workload {
  const { shape, nodes: n, seed } = spec;
  if (!SHAPES.includes(shape)) throw new Error(`unknown shape ${String(shape)}`);
  if (!Number.isInteger(n) || n < 2) throw new Error("a workload needs at least 2 nodes");
  const rng = createRng(seed ^ (SHAPES.indexOf(shape) * 0x9e3779b1));
  let g: Graph;
  const meta: WorkloadMeta = { maxDegree: 0, meanDegree: 0 };
  switch (shape) {
    case "sparse": g = sparse(n, rng); break;
    case "dag": { const d = dag(n, rng); g = d.g; meta.layers = d.layers; break; }
    case "dense": { const d = dense(n, rng); g = d.g; meta.clusters = d.clusters; break; }
    case "hubs": g = hubs(n, rng); break;
    case "hierarchy": { const h = hierarchy(n, rng); g = h.g; meta.depth = h.depth; break; }
    case "groups": { const q = groups(n, rng); g = q.g; meta.clusters = q.clusters; meta.intraEdgeFraction = g.src.length === 0 ? 1 : q.intra / g.src.length; break; }
  }
  splitRelations(g);
  const e = g.src.length;
  const deg = new Int32Array(n);
  for (let k = 0; k < e; k++) { deg[g.src[k]!]!++; deg[g.tgt[k]!]!++; }
  for (let i = 0; i < n; i++) if (deg[i]! > meta.maxDegree) meta.maxDegree = deg[i]!;
  meta.meanDegree = (2 * e) / n;
  const positions: FixedPosition[] = new Array<FixedPosition>(n);
  for (let i = 0; i < n; i++) positions[i] = { ref: { id: `i:${i}`, type: g.types[i]! }, x: g.xs[i]!, y: g.ys[i]! };
  return {
    spec: { shape, nodes: n, seed }, nodeCount: n, edges: e, types: g.types, edgeSrc: Int32Array.from(g.src), edgeTgt: Int32Array.from(g.tgt),
    edgeRel: Uint8Array.from(g.rel), rels: g.rels, source: toIson(g), positions, meta,
  };
}

export interface Artifacts { sceneBytes: Uint8Array; sceneSha256: string; artifactSha256: string; layoutBytes: Uint8Array; layoutSha256: string }

/** ISON source to the verified IGS/1 scene (compileScene) and the IGL/1 FIXED layout (computeFixedLayout) through the public APIs only. */
export async function buildArtifacts(w: Workload): Promise<Artifacts> {
  const c = await compileScene(w.source, "ison-v1");
  const l = await computeFixedLayout(c.sceneBytes, w.positions);
  return { sceneBytes: c.sceneBytes, sceneSha256: c.sceneSha256, artifactSha256: c.artifactSha256, layoutBytes: l.layoutBytes, layoutSha256: l.layoutSha256 };
}

export interface SizeSpec { name: string; nodes: number }
/** "S,M,L,XL" or plain node counts ("S,2500"): ordered, each once; a count below 2 and an unknown name are refused. */
export function parseSizes(text: string): SizeSpec[] {
  const out: SizeSpec[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(",")) {
    const t = raw.trim();
    if (t === "") continue;
    let s: SizeSpec;
    if (Object.prototype.hasOwnProperty.call(SIZE_NODES, t)) s = { name: t, nodes: SIZE_NODES[t as SizeName] };
    else if (/^[0-9]+$/.test(t) && Number(t) >= 2) s = { name: `N${Number(t)}`, nodes: Number(t) };
    else throw new Error(`unknown size ${JSON.stringify(t)} (S, M, L, XL or a node count of at least 2)`);
    if (!seen.has(s.name)) { seen.add(s.name); out.push(s); }
  }
  if (out.length === 0) throw new Error("no size given");
  return out;
}

/**
 * A second version of the same scene for the stable-layout update: the original source plus `count` new nodes of a new category ("fresh"), each with one edge
 * ("ATTACH") to an existing node chosen by the seed. Two ordinary scenes; this is not a delta format and not a V9 workload.
 */
export function growSource(w: Workload, count: number, seed: number): Uint8Array {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");
  const rng = createRng(seed);
  const n = w.nodeCount;
  const lines: string[] = ["", "nodes.fresh", "id"];
  for (let i = 0; i < count; i++) lines.push(String(n + i));
  lines.push("", "edges.ATTACH", "source target");
  for (let i = 0; i < count; i++) { const j = rng.int(n); lines.push(`:fresh:${n + i} :${w.types[j]!}:${j}`); }
  lines.push("");
  const extra = new TextEncoder().encode(lines.join("\n"));
  const out = new Uint8Array(w.source.length + extra.length);
  out.set(w.source, 0);
  out.set(extra, w.source.length);
  return out;
}
