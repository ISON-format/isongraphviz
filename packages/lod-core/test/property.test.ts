// Generated property suites (design 29 section 15.1 (2)): none of these produce expected bytes; each compares the implementation with an independent
// brute-force restatement, or checks a law (conservation, RT1-RT5, label monotonicity, per-class counter <= term, laminar checker vs pairwise).
import { describe, expect, it } from "vitest";
import { bindLayout } from "isongraph-visualize-layout-core";
import { checkViewConservation, projectToView, resolveAggregateEdge, resolveFromView } from "../src/mapping.js";
import { deriveViewDetailed, labelLevel } from "../src/derive.js";
import { collapseGroup, emptyState, expandGroup } from "../src/builders.js";
import { suggestGroupsDetailed } from "../src/rules.js";
import { serializeLODState, verifyLODState } from "../src/state.js";
import { classTerms, workDeriveView } from "../src/work.js";
import type { View, ViewRef } from "../src/types.js";
import { baseState, bytes, dec, errOf, world, type EdgeSpec, type World } from "./helpers.js";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const shuffle = <T,>(r: () => number, xs: readonly T[]): T[] => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = int(r, 0, i); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };

interface Scenario { w: World; ids: string[]; groups: string[][]; pins: string[]; state: Record<string, unknown>; directed: boolean; edges: EdgeSpec[] }

/** A random scene, layout (with negative coordinates), laminar group family, pins, policies. */
async function scenario(seed: number, o: { groupsOn?: boolean } = {}): Promise<Scenario> {
  const r = rng(seed);
  const n = int(r, 1, 12);
  const ids = Array.from({ length: n }, (_, i) => (r() < 0.5 ? `i:${i * 3 + int(r, 0, 2)}` : `s:n${i}`));
  const rels = ["r", "q", "～", "\u{1F600}"].slice(0, int(r, 1, 4));
  const directed = r() < 0.6;
  const m = int(r, 0, 3 * n);
  const edges: EdgeSpec[] = Array.from({ length: m }, () => [pick(r, ids), pick(r, rels), pick(r, ids)]);
  const pos: Record<string, [number, number]> = {};
  for (const id of ids) pos[id] = [int(r, -50_000, 50_000), int(r, -50_000, 50_000)];
  const w = await world({ directed, nodes: ids, edges, pos });
  // laminar family: shuffle, chunk, maybe nest
  const groups: string[][] = [];
  const split = (nodes: string[], depth: number): void => {
    let i = 0;
    while (i < nodes.length) {
      const k = int(r, 1, Math.max(1, nodes.length - (depth === 0 ? 0 : 1)));
      const chunk = nodes.slice(i, i + k);
      i += k;
      if (chunk.length >= 2 && chunk.length < nodes.length + (depth === 0 ? 1 : 0) && r() < 0.7) {
        if (depth > 0 && chunk.length === nodes.length) continue;
        groups.push(chunk);
        if (depth < 3 && chunk.length >= 4 && r() < 0.6) split(chunk, depth + 1);
      }
    }
  };
  if (o.groupsOn !== false) split(shuffle(r, ids), 0);
  const pins = ids.filter(() => r() < 0.2);
  const refOf = (id: string) => ({ id, type: "t" });
  const policy = r() < 0.5 ? { edge_policy: { keep_forest: r() < 0.5, max_view_edges: int(r, 0, m + 2) } } : {};
  const fz = int(r, 0, 4000), sz = int(r, 0, fz), fd = int(r, 0, 8), sd = int(r, 0, fd);
  const state = baseState({
    scene_sha256: w.sceneSha256, layout_sha256: w.layoutSha256, zoom_milli: int(r, 0, 5000), pinned: pins.map(refOf),
    label_policy: { full_degree: fd, full_zoom_milli: fz, short_degree: sd, short_zoom_milli: sz },
    collapsed: groups.map((g) => ({ members: g.map(refOf) })), ...policy,
  });
  return { w, ids, groups, pins, state, directed, edges };
}

/** Canonical bytes of a scenario state through the package's own writer (sorted), so any generated family is canonical. */
const canon = (s: Scenario) => serializeLODState(s.state as never);

describe("derivation laws over generated scenes", () => {
  it("conservation, per-class counter <= term, W = sum of terms, RT4, deterministic bytes (400 scenes)", async () => {
    let maxRatio = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = await scenario(seed);
      const st = canon(s);
      const d = await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, st);
      const again = await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, st);
      expect(dec(d.result.viewBytes), `seed ${seed}`).toBe(dec(again.result.viewBytes));
      await checkViewConservation(s.w.sceneBytes, d.result.view);
      let total = 0n;
      for (const c of Object.keys(d.terms) as Array<keyof typeof d.terms>) {
        expect(BigInt(d.ticks[c]), `seed ${seed} class ${c}`).toBeLessThanOrEqual(d.terms[c]);
        total += d.terms[c];
      }
      expect(total).toBe(d.W);
      expect(workDeriveView(d.inputs)).toBe(d.W);
      const sum = Object.values(d.ticks).reduce((a, b) => a + b, 0);
      maxRatio = Math.max(maxRatio, sum / Number(d.W));
      // RT4: positions are the layout's, whatever the state
      const bound = await bindLayout(s.w.sceneBytes, s.w.layoutBytes);
      const lay = new Map(bound.layout.nodes.map((nd) => [nd.ref.id, [nd.x, nd.y]]));
      for (const nd of d.result.view.nodes) expect([nd.x, nd.y]).toEqual(lay.get(nd.ref.id));
    }
    expect(maxRatio).toBeLessThanOrEqual(1);
  }, 120_000);

  it("RT1: the empty state is the identity view (every node, every edge, no aggregates)", async () => {
    for (let seed = 1000; seed < 1100; seed++) {
      const s = await scenario(seed, { groupsOn: false });
      const st = serializeLODState(baseState({ scene_sha256: s.w.sceneSha256, layout_sha256: s.w.layoutSha256 }) as never);
      const { view } = (await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, st)).result;
      const b = await bindLayout(s.w.sceneBytes, s.w.layoutBytes);
      expect(view.nodes.map((n) => n.ref)).toEqual(b.scene.nodes.map((n) => n.ref));
      expect(view.edges.map((e) => e.ref)).toEqual(b.scene.edges.map((e) => e.ref));
      expect(view.aggregates).toEqual([]); expect(view.aggregate_edges).toEqual([]); expect("elided" in view).toBe(false);
    }
  }, 60_000);

  it("RT2/RT3/RT5: expanding every group restores the identity view; collapse order does not matter", async () => {
    for (let seed = 2000; seed < 2060; seed++) {
      const s = await scenario(seed);
      const r = rng(seed);
      let st = emptyState({ sceneSha256: s.w.sceneSha256, layoutSha256: s.w.layoutSha256, label_policy: (s.state["label_policy"]) as never, zoom_milli: s.state["zoom_milli"] as number });
      const order = shuffle(r, s.groups);
      for (const g of order) st = collapseGroup(st, { members: g.map((id) => ({ id, type: "t" })) });
      let st2 = emptyState({ sceneSha256: s.w.sceneSha256, layoutSha256: s.w.layoutSha256, label_policy: (s.state["label_policy"]) as never, zoom_milli: s.state["zoom_milli"] as number });
      for (const g of shuffle(r, s.groups)) st2 = collapseGroup(st2, { members: g.map((id) => ({ id, type: "t" })) });
      expect(dec(serializeLODState(st))).toBe(dec(serializeLODState(st2)));
      const collapsedView = (await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, serializeLODState(st))).result.view;
      // expand every group (by aggregate id for top aggregates, by members for the rest) and compare with the identity view
      let cur = st;
      for (const g of shuffle(r, s.groups)) cur = (await expandGroup(cur, { members: g.map((id) => ({ id, type: "t" })) })).state;
      expect(cur.collapsed).toEqual([]);
      const ident = (await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, serializeLODState(cur))).result.view;
      const plainState = baseState({ ...s.state, collapsed: [], pinned: [] }); delete plainState["edge_policy"];
      const plain = (await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, serializeLODState(plainState as never))).result.view;
      expect(dec(new TextEncoder().encode(JSON.stringify(ident.nodes)))).toBe(JSON.stringify(plain.nodes));
      expect(ident.edges).toEqual(plain.edges);
      // every scene node is accounted for in the collapsed view exactly once
      const hidden = collapsedView.aggregates.reduce((a, g) => a + g.hidden.length, 0);
      expect(collapsedView.nodes.length + hidden).toBe(s.ids.length);
    }
  }, 120_000);
});

/** An independent, naive restatement of section 7.1 (no sorting machinery): classes of edges for a scenario without a cap. */
describe("edge classification against a brute-force reference (E15)", () => {
  it("visible edges, bundles and internal counts agree on 300 scenes", async () => {
    for (let seed = 5000; seed < 5300; seed++) {
      const s = await scenario(seed);
      delete (s.state as Record<string, unknown>)["edge_policy"];
      const stBytes = canon(s);
      const { view } = (await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, stBytes)).result;
      const bound = await bindLayout(s.w.sceneBytes, s.w.layoutBytes);
      const pinned = new Set(s.pins);
      // maximal group containing v (largest by size); an emitted group hides >= 1 node
      const topOf = (id: string): string[] | undefined => {
        let best: string[] | undefined;
        for (const g of s.groups) if (g.includes(id) && (best === undefined || g.length > best.length)) best = g;
        return best;
      };
      const emittedGroups = new Set(s.groups.filter((g) => !s.groups.some((h) => h !== g && h.length > g.length && g.every((x) => h.includes(x))) && g.some((x) => !pinned.has(x))).map((g) => g.join("|")));
      const byMembers = new Map<string, string>();
      for (const a of view.aggregates) byMembers.set([...a.hidden, ...(a.exposed ?? [])].map((x) => x.id).sort().join("|"), a.id);
      const aggIds = view.aggregates.map((a) => a.id).sort();
      const rankOf = (name: string): number => (name.startsWith("A:") ? bound.scene.nodes.length + aggIds.indexOf(name.slice(2)) : bound.scene.nodes.findIndex((nd) => nd.ref.id === name));
      const rep = (id: string): string => {
        if (pinned.has(id)) return id;
        const t = topOf(id);
        return t !== undefined && emittedGroups.has(t.join("|")) ? "A:" + byMembers.get([...t].sort().join("|"))! : id;
      };
      const vis: string[] = [], bundles = new Map<string, { count: number }>(), internal = new Map<string, number>();
      for (const e of bound.scene.edges) {
        const a = rep(e.ref.src.id), b = rep(e.ref.tgt.id);
        if (a === e.ref.src.id && b === e.ref.tgt.id) { vis.push(`${a}>${e.ref.rel}>${b}`); continue; }
        if (a === b) { internal.set(a.slice(2), (internal.get(a.slice(2)) ?? 0) + 1); continue; }
        const [x, y] = bound.scene.graph.directed || rankOf(a) < rankOf(b) ? [a, b] : [b, a];
        const cur = bundles.get(`${x}>${y}`) ?? { count: 0 };
        cur.count++;
        bundles.set(`${x}>${y}`, cur);
      }
      expect(view.edges.map((e) => `${e.ref.src.id}>${e.ref.rel}>${e.ref.tgt.id}`), `seed ${seed}`).toEqual(vis);
      const nameOf = (r: ViewRef): string => ("agg" in r ? "A:" + r.agg : r.id);
      const want = [...bundles].map(([k, b]) => [k, b.count] as const).sort();
      const got = view.aggregate_edges.map((b) => [`${nameOf(b.src)}>${nameOf(b.tgt)}`, b.count] as const).sort();
      expect(got, `seed ${seed}`).toEqual(want);
      // the order of aggregate_edges is by (rank src, rank tgt)
      const ranks = view.aggregate_edges.map((b) => [rankOf(nameOf(b.src)), rankOf(nameOf(b.tgt))]);
      expect(ranks).toEqual([...ranks].sort((p, q) => p[0]! - q[0]! || p[1]! - q[1]!));
      for (const b of view.aggregate_edges) expect(b.rel_counts.reduce((a, x) => a + x.count, 0)).toBe(b.count);
      const internalGot = new Map(view.aggregates.filter((a) => a.internal_edges.count > 0).map((a) => [a.id, a.internal_edges.count] as const));
      expect([...internalGot].sort()).toEqual([...internal].sort());
    }
  }, 180_000);
});

describe("density cap properties (E10-E13, E15)", () => {
  it("keep_forest preserves connectivity of the item graph; accounting is exact; the cap is a target only when the forest exceeds it", async () => {
    for (let seed = 7000; seed < 7250; seed++) {
      const s = await scenario(seed);
      const m = s.edges.length;
      const r = rng(seed);
      const cap = int(r, 0, m + 1);
      const keep = r() < 0.5;
      const noCap = { ...s.state }; delete (noCap as Record<string, unknown>)["edge_policy"];
      const full = (await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, serializeLODState(noCap as never))).result.view;
      const capped = (await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, serializeLODState({ ...s.state, edge_policy: { keep_forest: keep, max_view_edges: cap } } as never))).result.view;
      const itemsFull = full.edges.length + full.aggregate_edges.length;
      const itemsKept = capped.edges.length + capped.aggregate_edges.length;
      // nodes and aggregates and labels are never changed by a cap
      expect(capped.nodes.map((n) => [n.ref.id, n.label_level])).toEqual(full.nodes.map((n) => [n.ref.id, n.label_level]));
      expect(capped.aggregates.map((a) => [a.id, a.label_level])).toEqual(full.aggregates.map((a) => [a.id, a.label_level]));
      const removed = itemsFull - itemsKept;
      expect(capped.elided?.items ?? 0).toBe(removed);
      if (itemsFull <= cap) { expect(removed).toBe(0); expect("elided" in capped).toBe(false); continue; }
      if (!keep) expect(itemsKept).toBe(cap);
      else {
        // connectivity of the item graph (union-find over view objects) equals that of the full item graph
        const comps = (v: View): string[] => {
          const p = new Map<string, string>();
          const nm = (x: ViewRef): string => ("agg" in x ? "A" + x.agg : x.id);
          const f = (x: string): string => { while ((p.get(x) ?? x) !== x) x = p.get(x)!; return x; };
          const all = [...v.nodes.map((n) => n.ref.id), ...v.aggregates.map((a) => "A" + a.id)];
          for (const x of all) p.set(x, x);
          const join = (a: string, b: string) => { const x = f(a), y = f(b); if (x !== y) p.set(x, y); };
          for (const e of v.edges) join(e.ref.src.id, e.ref.tgt.id);
          for (const b of v.aggregate_edges) join(nm(b.src), nm(b.tgt));
          const groups = new Map<string, string[]>();
          for (const x of all) groups.set(f(x), [...(groups.get(f(x)) ?? []), x]);
          return [...groups.values()].map((g) => g.sort().join(",")).sort();
        };
        // elided items do not appear in a view, so connectivity is compared through the full view
        const connectivityKept = comps(capped);
        const connectivityFull = comps(full);
        expect(connectivityKept).toEqual(connectivityFull);
        // kept = max(cap, forest size): at least cap items stay whenever there were more than cap
        expect(itemsKept).toBeGreaterThanOrEqual(Math.min(cap, itemsFull));
      }
    }
  }, 180_000);
});

describe("label levels (L08) and the laminar checker (C11)", () => {
  it("levels follow the formula, never decrease with zoom or degree, boost at most one tier", () => {
    const r = rng(77);
    for (let i = 0; i < 2000; i++) {
      const fz = int(r, 0, 4000), sz = int(r, 0, fz), fd = int(r, 0, 9), sd = int(r, 0, fd);
      const p = { full_degree: fd, full_zoom_milli: fz, short_degree: sd, short_zoom_milli: sz };
      const z = int(r, 0, 5000), d = int(r, 0, 12);
      const rank = { hidden: 0, short: 1, full: 2 };
      const tz = z >= fz ? 2 : z >= sz ? 1 : 0, td = d >= fd ? 2 : d >= sd ? 1 : 0;
      const lv = rank[labelLevel(d, z, p)];
      expect(lv).toBe(Math.max(tz, Math.min(td, tz + 1)));
      expect(lv).toBeLessThanOrEqual(tz + 1);
      expect(lv).toBeGreaterThanOrEqual(tz);
      expect(rank[labelLevel(d, z + int(r, 0, 3000), p)]).toBeGreaterThanOrEqual(lv);
      expect(rank[labelLevel(d + int(r, 0, 5), z, p)]).toBeGreaterThanOrEqual(lv);
    }
  });
  it("the painting check agrees with a brute-force pairwise laminar test on random families of at most 8 groups", async () => {
    const r = rng(99);
    let accepted = 0, rejected = 0;
    for (let i = 0; i < 1500; i++) {
      const ids = Array.from({ length: 7 }, (_, k) => `s:n${k}`);
      const fam: string[][] = [];
      const gs = int(r, 1, 8);
      for (let g = 0; g < gs; g++) { const k = int(r, 2, 6); fam.push(shuffle(r, ids).slice(0, k)); }
      const key = (g: string[]) => [...g].sort().join("|");
      const uniq = new Map(fam.map((g) => [key(g), g] as const));
      const groups = [...uniq.values()];
      const laminar = groups.every((a) => groups.every((b) => {
        const inter = a.filter((x) => b.includes(x)).length;
        return inter === 0 || inter === a.length || inter === b.length;
      }));
      const st = baseState({ collapsed: groups.map((g) => ({ members: g.map((id) => ({ id, type: "t" })) })) });
      const bytesOf = serializeLODState(st as never);
      const err = await errOf(() => verifyLODState(bytesOf));
      if (laminar) { expect(err).toBe("no error"); accepted++; } else { expect(err).toBe("INVALID_GROUP/OVERLAPPING_GROUPS"); rejected++; }
    }
    expect(accepted).toBeGreaterThan(100);
    expect(rejected).toBeGreaterThan(100);
  }, 60_000);
});

describe("selection mapping and edge recovery over generated views (S08, R)", () => {
  it("X is a subset of resolve(project(X)); bundles resolve to exactly their count; every conserved scene edge is recoverable", async () => {
    for (let seed = 9000; seed < 9120; seed++) {
      const s = await scenario(seed);
      const noCap = { ...s.state }; delete (noCap as Record<string, unknown>)["edge_policy"];
      const { view } = (await deriveViewDetailed(s.w.sceneBytes, s.w.layoutBytes, serializeLODState(noCap as never))).result;
      const r = rng(seed);
      const X = s.ids.filter(() => r() < 0.5).map((id) => ({ id, type: "t" }));
      const back = resolveFromView(view, projectToView(view, X)).map((x) => x.id);
      for (const x of X) expect(back).toContain(x.id);
      for (const b of view.aggregate_edges) expect((await resolveAggregateEdge(s.w.sceneBytes, view, b)).length).toBe(b.count);
      // the work meter of the mapping entry points is not asserted here; conservation of the given view must pass
      await checkViewConservation(s.w.sceneBytes, view);
    }
  }, 120_000);
});

describe("suggestGroups work (B15)", () => {
  it("ticks never exceed W = 10 (n + m) r + r (n + 2m) ceil(Lkey/64) for r >= 1", async () => {
    for (let seed = 300; seed < 420; seed++) {
      const s = await scenario(seed, { groupsOn: false });
      const specs = [{ rule: "pendant-fold/1", min_leaves: 2 }, { rule: "components/1", min_size: 2 }].slice(0, 1 + (seed % 2));
      const d = await suggestGroupsDetailed(s.w.sceneBytes, specs as never);
      expect(BigInt(d.ticks), `seed ${seed}`).toBeLessThanOrEqual(d.W);
    }
  });
  it("the work formula terms sum to the printed W of the worked examples", () => {
    const common = { Hscene: 1673, Hlayout: 550, n: 7, m: 10, R: 2, Lrel: 1, Lkey: 11 };
    expect(workDeriveView({ ...common, Hs: 384, G: 1, M: 2, T: 0, Hids: 163 })).toBe(3127n);
    expect(workDeriveView({ ...common, Hs: 534, G: 2, M: 7, T: 0, Hids: 398 })).toBe(3492n);
    expect(workDeriveView({ ...common, Hs: 611, G: 2, M: 7, T: 1, Hids: 398 })).toBe(3507n);
    expect(classTerms({ ...common, Hs: 384, G: 1, M: 2, T: 0, Hids: 163 }).serialize).toBe(2432n);
  });
});
