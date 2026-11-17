import { describe, expect, it } from "vitest";
import { sha256Hex } from "isongraph-visualize-scene-core/primitives";
import { deriveView, serializeView } from "../src/derive.js";
import { deriveAggregateId } from "../src/aggregate.js";
import type { View } from "../src/types.js";
import {
  DOC_VIEWS, LAYOUT_HASH, LABEL_POLICY, SCENE_HASH, baseState, bytes, dec, enc, errOf, example, ref, refs, stateA, stateB, stateC, world, type EdgeSpec, type World,
} from "./helpers.js";

const INNER = "igagg1:1f0a7d87706cb0271fcb451e67c7be8e9df7fae0b751f527a1480891cc5ad1dc";
const OUTER = "igagg1:877702b4003afc31868a3ffc0d607bdf9760a13155cc275e732560e6be00083e";

const derive = async (w: { sceneBytes: Uint8Array; layoutBytes: Uint8Array }, state: Record<string, unknown> | Uint8Array, options?: unknown) =>
  deriveView(w.sceneBytes, w.layoutBytes, state instanceof Uint8Array ? state : bytes(state), options as never);
const stateFor = (w: World, over: Record<string, unknown> = {}) => baseState({ scene_sha256: w.sceneSha256, layout_sha256: w.layoutSha256, ...over });
const levels = (v: View): Record<string, string> => Object.fromEntries(v.nodes.map((n) => [n.ref.id, n.label_level]));
const ids = (v: View): string[] => v.nodes.map((n) => n.ref.id);
const keysOf = (o: unknown): string[] => Object.keys(o as object).sort();

describe("W01-W03 the worked examples of design 29 section 14, byte for byte", () => {
  const cases: Array<[string, () => Record<string, unknown>, string, number]> = [
    ["A", stateA, "f379e1897ac3b557e2fabdd762391617fdff9481b210975ea26cd81570a7d4bb", 1878],
    ["B", stateB, "9421525f3b65a23eab92b77e91ea8a7e3486be0b4abd973497e0532824e13d2d", 1419],
    ["C", stateC, "054d951869caafcf5b0a73203dce8e226921ad87c17e222ef0277d4fc2c65a03", 1528],
  ];
  cases.forEach(([name, mk, hash, len], i) => {
    it(`Example ${name}`, async () => {
      const e = await example();
      const r = await derive(e, mk());
      const printed = DOC_VIEWS()[i]!;
      expect(dec(r.viewBytes)).toBe(printed);
      expect(r.viewBytes.length).toBe(len);
      expect(r.viewSha256).toBe(hash);
      expect(await sha256Hex(enc(printed))).toBe(hash);
      expect(r.stateSha256).toBe(r.view.state_sha256);
      expect(dec(serializeView(r.view))).toBe(printed);
    });
  });
  it("the printed ids come out of the derivation", async () => {
    const e = await example();
    expect((await derive(e, stateA())).view.aggregates[0]!.id).toBe(INNER);
    expect((await derive(e, stateB())).view.aggregates[0]!.id).toBe(OUTER);
  });
});

describe("RT1 identity view (C01)", () => {
  it("an empty collapse set shows every node and every edge with the layout positions", async () => {
    const e = await example();
    const { view } = await derive(e, baseState());
    expect(view.aggregates).toEqual([]);
    expect(view.aggregate_edges).toEqual([]);
    expect("elided" in view).toBe(false);
    expect(view.nodes.map((n) => [n.ref.id, n.x, n.y])).toEqual([["i:1", 0, 0], ["i:2", 1000, -500], ["s:a", -1500, 2000], ["s:b", 2500, 3000], ["s:c", 500, -1000], ["s:d", -3, 7], ["s:e", 0, 8]]);
    expect(view.edges.length).toBe(10);
    expect(view.edges.map((x) => `${x.ref.src.id}-${x.ref.rel}-${x.ref.tgt.id}`)).toEqual(
      ["i:1-q-s:b", "i:1-r-i:2", "i:1-r-s:a", "i:1-r-s:b", "s:a-r-s:b", "s:b-r-s:a", "s:c-r-i:2", "s:c-r-s:c", "s:d-r-s:c", "s:e-r-s:c"]);
    // vdeg: i:1 4, i:2 2, s:a 3, s:b 4, s:c 4 (the self-loop counts once), s:d 1, s:e 1; zoom 500 -> tz 0
    expect(levels(view)).toEqual({ "i:1": "short", "i:2": "hidden", "s:a": "short", "s:b": "short", "s:c": "short", "s:d": "hidden", "s:e": "hidden" });
    expect(view.directed).toBe(true);
    expect(view.scale).toBe(1000);
    expect(view.scene_sha256).toBe(SCENE_HASH);
    expect(view.layout_sha256).toBe(LAYOUT_HASH);
  });
  it("D09 an absent, zero or empty optional is never emitted", async () => {
    const e = await example();
    const text = dec((await derive(e, baseState())).viewBytes);
    for (const k of ["elided", "children", "exposed", "elided_edges", "label"]) expect(text).not.toContain(`"${k}"`);
    const a = (await derive(e, stateA())).view;
    expect(keysOf(a.aggregates[0])).toEqual(["anchor", "hidden", "id", "internal_edges", "label_level", "member_count"]);
    expect(a.aggregates[0]!.internal_edges).toEqual({ count: 0, rel_counts: [] });
    // a present empty-string label IS emitted (C21)
    const c = (await derive(e, baseState({ collapsed: [{ label: "", members: refs("s:d", "s:e") }] }))).view;
    expect(c.aggregates[0]!.label).toBe("");
    expect(dec((await derive(e, baseState({ collapsed: [{ label: "", members: refs("s:d", "s:e") }] }))).viewBytes)).toContain('"label":""');
  });
});

describe("collapse and edge classification", () => {
  it("C03 collapse of everything: nodes is empty and every edge is internal", async () => {
    const e = await example();
    const { view } = await derive(e, baseState({ collapsed: [{ members: refs("i:1", "i:2", "s:a", "s:b", "s:c", "s:d", "s:e") }] }));
    expect(view.nodes).toEqual([]);
    expect(view.edges).toEqual([]);
    expect(view.aggregate_edges).toEqual([]);
    const a = view.aggregates[0]!;
    expect(a.hidden.length).toBe(7);
    expect(a.member_count).toBe(7);
    expect(a.internal_edges).toEqual({ count: 10, rel_counts: [{ count: 1, rel: "q" }, { count: 9, rel: "r" }] });
    expect(a.anchor).toEqual({ x: 357, y: 502 });
    expect(a.label_level).toBe("short"); // d = max(0, 7) = 7 >= 5, tz 0 -> short
  });
  it("E02 one bundle with two rel_counts; internal edges counted per rel", async () => {
    const e = await example();
    const { view } = await derive(e, baseState({ collapsed: [{ members: refs("s:a", "s:b") }] }));
    expect(view.aggregate_edges).toHaveLength(1);
    expect(view.aggregate_edges[0]).toMatchObject({ count: 3, rel_counts: [{ count: 1, rel: "q" }, { count: 2, rel: "r" }], src: { id: "i:1" } });
    expect(view.aggregates[0]!.internal_edges).toEqual({ count: 2, rel_counts: [{ count: 2, rel: "r" }] });
    expect(view.edges).toHaveLength(5);
  });
  it("E04 a self-loop on a hidden node is internal", async () => {
    const e = await example();
    const { view } = await derive(e, baseState({ collapsed: [{ members: refs("s:c", "s:d") }] }));
    expect(view.aggregates[0]!.internal_edges).toEqual({ count: 2, rel_counts: [{ count: 2, rel: "r" }] }); // edges 7 (s:c loop) and 8 (s:d -> s:c)
    expect(view.edges.map((x) => `${x.ref.src.id}>${x.ref.tgt.id}`)).not.toContain("s:c>s:c");
  });
  it("E06 directed opposite orientations make two bundles, ordered by (rank src, rank tgt)", async () => {
    const e = await example();
    const { view } = await derive(e, baseState({ collapsed: [{ members: refs("s:a", "s:c") }] }));
    const agg = view.aggregates[0]!.id;
    const b = view.aggregate_edges.map((x) => [(x.src as { id?: string; agg?: string }).id ?? "AGG", (x.tgt as { id?: string; agg?: string }).id ?? "AGG", x.count]);
    expect(b).toEqual([["i:1", "AGG", 1], ["s:b", "AGG", 1], ["s:d", "AGG", 1], ["s:e", "AGG", 1], ["AGG", "i:2", 1], ["AGG", "s:b", 1]]);
    expect(view.aggregate_edges[1]!.tgt).toEqual({ agg });
    expect(view.aggregates[0]!.internal_edges.count).toBe(1);
    expect(view.edges).toHaveLength(3);
  });
  it("E05 a cycle a->b->c->a with two nodes collapsed", async () => {
    const w = await world({ nodes: ["s:a", "s:b", "s:c"], edges: [["s:a", "r", "s:b"], ["s:b", "r", "s:c"], ["s:c", "r", "s:a"]] });
    const { view } = await derive(w, stateFor(w, { collapsed: [{ members: refs("s:a", "s:b") }] }));
    expect(view.aggregates[0]!.internal_edges.count).toBe(1);
    const dir = view.aggregate_edges.map((x) => ("agg" in x.src ? "AGG>" + (x.tgt as { id: string }).id : (x.src as { id: string }).id + ">AGG"));
    expect(dir).toEqual(["s:c>AGG", "AGG>s:c"]); // (rank 2, rank 3) before (rank 3, rank 2)
  });
  it("E01/E03 parallel edges of different rel and a self-loop stay visible and separate", async () => {
    const w = await world({ nodes: ["s:a", "s:b"], edges: [["s:a", "p", "s:b"], ["s:a", "q", "s:b"], ["s:a", "p", "s:a"]] });
    const { view } = await derive(w, stateFor(w));
    expect(view.edges).toHaveLength(3);
    expect(view.aggregate_edges).toEqual([]);
  });
  it("E07/E17 an undirected scene: the bundle key is ordered by rank (Example D)", async () => {
    const w = await world({ directed: false, nodes: ["s:a", "s:b", "s:x"], edges: [["s:a", "r", "s:x"], ["s:b", "r", "s:x"], ["s:a", "r", "s:b"]] });
    const { view } = await derive(w, stateFor(w, { collapsed: [{ members: refs("s:a", "s:b") }] }));
    expect(view.directed).toBe(false);
    expect(view.nodes.map((n) => n.ref.id)).toEqual(["s:x"]);
    expect(view.edges).toEqual([]);
    expect(view.aggregate_edges).toHaveLength(1);
    const be = view.aggregate_edges[0]!;
    expect(be.src).toEqual(ref("s:x"));
    expect(be.tgt).toEqual({ agg: view.aggregates[0]!.id });
    expect(be.count).toBe(2);
    expect(view.aggregates[0]!.internal_edges).toEqual({ count: 1, rel_counts: [{ count: 1, rel: "r" }] });
  });
  it("D07 rel_counts are sorted by UTF-8 bytes (not UTF-16): a < U+FF5E < U+1F600", async () => {
    const rels = ["\u{1F600}", "～", "a"];
    const w = await world({ nodes: ["s:a", "s:b", "s:x"], edges: rels.map((r): EdgeSpec => ["s:a", r, "s:x"]).concat(rels.map((r): EdgeSpec => ["s:b", r, "s:x"])) });
    const { view } = await derive(w, stateFor(w, { collapsed: [{ members: refs("s:a", "s:b") }] }));
    expect(view.aggregate_edges[0]!.rel_counts.map((r) => r.rel)).toEqual(["a", "～", "\u{1F600}"]);
    expect(view.aggregate_edges[0]!.count).toBe(6);
  });
  it("D05 anchors: negative coordinates, exact .5 ties round toward +infinity", async () => {
    const pos: Record<string, [number, number]> = { "s:a": [-3, 7], "s:b": [0, 8], "s:c": [-4, -1], "s:d": [-3, 0], "s:e": [-7, 0] };
    const w = await world({ nodes: ["s:a", "s:b", "s:c", "s:d", "s:e"], pos });
    const one = async (m: string[]) => (await derive(w, stateFor(w, { collapsed: [{ members: m.map((i) => ref(i)) }] }))).view.aggregates[0]!.anchor;
    expect(await one(["s:a", "s:b"])).toEqual({ x: -1, y: 8 }); // (-3, 0) -> -1.5 -> -1 ; (7, 8) -> 7.5 -> 8
    expect(await one(["s:b", "s:c"])).toEqual({ x: -2, y: 4 }); // (0,-4) -> -2 exact ; (8,-1) -> 3.5 -> 4
    expect(await one(["s:c", "s:e"])).toEqual({ x: -5, y: 0 }); // (-4,-7) -> -5.5 -> -5 ; (-1, 0) -> -0.5 -> 0
    expect(await one(["s:d", "s:e"])).toEqual({ x: -5, y: 0 });
  });
  it("D06 coordinates at +-(2^53-1) for all members (BigInt sums)", async () => {
    const M = Number.MAX_SAFE_INTEGER;
    const w = await world({ nodes: ["s:a", "s:b", "s:c"], pos: { "s:a": [M, -M], "s:b": [M, -M], "s:c": [M, -M] } });
    const { view } = await derive(w, stateFor(w, { collapsed: [{ members: refs("s:a", "s:b", "s:c") }] }));
    expect(view.aggregates[0]!.anchor).toEqual({ x: M, y: -M });
    const pos2: Record<string, [number, number]> = { "s:a": [M, M], "s:b": [-M, -M], "s:c": [M, M] };
    const w2 = await world({ nodes: ["s:a", "s:b", "s:c"], pos: pos2 });
    const a2 = (await derive(w2, stateFor(w2, { collapsed: [{ members: refs("s:a", "s:b", "s:c") }] }))).view.aggregates[0]!.anchor;
    // exact: sum = M, k = 3: floorDiv(2M + 3, 6)
    expect(BigInt(a2.x)).toBe((2n * BigInt(M) + 3n) / 6n);
  });
});

describe("nesting (N01-N07)", () => {
  it("N03 three levels: only the outer is emitted, children lists the DIRECT children only", async () => {
    const e = await example();
    const mid = await deriveAggregateId(SCENE_HASH, refs("s:c", "s:d", "s:e"));
    const { view } = await derive(e, baseState({ collapsed: [
      { members: refs("s:a", "s:b", "s:c", "s:d", "s:e") }, { members: refs("s:c", "s:d", "s:e") }, { members: refs("s:d", "s:e") }] }));
    expect(view.aggregates).toHaveLength(1);
    expect(view.aggregates[0]!.id).toBe(OUTER);
    expect(view.aggregates[0]!.children).toEqual([mid]);
  });
  it("N06 siblings under one parent: children ascending by id", async () => {
    const e = await example();
    const a = await deriveAggregateId(SCENE_HASH, refs("s:a", "s:b"));
    const b = await deriveAggregateId(SCENE_HASH, refs("s:d", "s:e"));
    const { view } = await derive(e, baseState({ collapsed: [{ members: refs("s:a", "s:b") }, { members: refs("s:a", "s:b", "s:c", "s:d", "s:e") }, { members: refs("s:d", "s:e") }] }));
    expect(view.aggregates[0]!.children).toEqual([a, b].sort());
  });
  it("N02 expand the outer: the inner is emitted (state A)", async () => {
    const e = await example();
    const { view } = await derive(e, stateA());
    expect(view.aggregates.map((a) => a.id)).toEqual([INNER]);
    expect("children" in view.aggregates[0]!).toBe(false);
  });
  it("N07 a pinned node deep in a nest is exposed by its top aggregate; ids unchanged", async () => {
    const e = await example();
    const { view } = await derive(e, { ...stateB(), pinned: [ref("s:d")] });
    const a = view.aggregates[0]!;
    expect(a.id).toBe(OUTER);
    expect(a.exposed).toEqual([ref("s:d")]);
    expect(a.hidden).toEqual(refs("s:a", "s:b", "s:c", "s:e"));
    expect(a.member_count).toBe(5);
    expect(ids(view)).toContain("s:d");
  });
  it("two disjoint groups (C04) are two aggregates sorted by id", async () => {
    const e = await example();
    const { view } = await derive(e, baseState({ collapsed: [{ members: refs("i:1", "i:2") }, { members: refs("s:d", "s:e") }] }));
    const idsAgg = view.aggregates.map((a) => a.id);
    expect(idsAgg).toEqual([...idsAgg].sort());
    expect(idsAgg).toHaveLength(2);
    // aggregate ranks follow id order: the bundle between them has src = the smaller id (directed: i:1 -> s:c? check the pair classification by counts)
    const total = view.edges.length + view.aggregate_edges.reduce((s, x) => s + x.count, 0) + view.aggregates.reduce((s, a) => s + a.internal_edges.count, 0);
    expect(total).toBe(10);
  });
});

describe("pins (P01-P05)", () => {
  it("P02 all members pinned: no aggregate is emitted and nothing is hidden", async () => {
    const e = await example();
    const { view } = await derive(e, { ...stateA(), pinned: refs("s:d", "s:e") });
    expect(view.aggregates).toEqual([]);
    expect(view.aggregate_edges).toEqual([]);
    expect(view.edges).toHaveLength(10);
    expect(view.nodes).toHaveLength(7);
    expect(levels(view)["s:d"]).toBe("full");
    expect(levels(view)["s:e"]).toBe("full");
  });
  it("P03 a pin outside any group changes no aggregate, edge or id, but its label is full", async () => {
    const e = await example();
    const base = (await derive(e, baseState())).view;
    const pinned = (await derive(e, baseState({ pinned: [ref("i:2")] }))).view;
    expect(pinned.edges).toEqual(base.edges);
    expect(levels(base)["i:2"]).toBe("hidden");
    expect(levels(pinned)["i:2"]).toBe("full");
    expect(pinned.nodes.filter((n) => n.ref.id !== "i:2")).toEqual(base.nodes.filter((n) => n.ref.id !== "i:2"));
  });
  it("P05 one hidden node left: legal, emitted, anchor is that node", async () => {
    const e = await example();
    const { view } = await derive(e, { ...stateA(), pinned: [ref("s:e")] });
    const a = view.aggregates[0]!;
    expect(a.id).toBe(INNER);
    expect(a.hidden).toEqual([ref("s:d")]);
    expect(a.exposed).toEqual([ref("s:e")]);
    expect(a.member_count).toBe(2);
    expect(a.anchor).toEqual({ x: -3, y: 7 });
    expect(view.aggregate_edges).toHaveLength(1);
    expect(view.aggregate_edges[0]!.count).toBe(1);
    expect(view.edges.map((x) => x.ref.src.id)).toContain("s:e");
  });
  it("E09 an exposed pinned member has bundles with its own aggregate", async () => {
    const e = await example();
    const { view } = await derive(e, { ...baseState({ collapsed: [{ members: refs("s:a", "s:b") }] }), pinned: [ref("s:a")] });
    // hidden: s:b; exposed: s:a. edges: 4 s:a->s:b -> bundle (s:a, Agg); 5 s:b->s:a -> bundle (Agg, s:a); i:1->s:b (0 and 3) -> bundle (i:1, Agg) count 2
    const toStr = (r: unknown) => ("agg" in (r as object) ? "AGG" : (r as { id: string }).id);
    expect(view.aggregate_edges.map((b) => `${toStr(b.src)}>${toStr(b.tgt)}:${b.count}`)).toEqual(["i:1>AGG:2", "s:a>AGG:1", "AGG>s:a:1"]);
    expect(view.aggregates[0]!.internal_edges.count).toBe(0);
  });
});

describe("density cap (E10-E16)", () => {
  const cap = (max_view_edges: number, keep_forest: boolean) => ({ edge_policy: { keep_forest, max_view_edges } });
  const edgeIds = (v: View) => v.edges.map((x) => `${x.ref.src.id}>${x.ref.tgt.id}:${x.ref.rel}`);
  it("E14 a cap equal to the item count removes nothing and writes no elided", async () => {
    const e = await example();
    for (const keep of [true, false]) {
      const { view } = await derive(e, baseState(cap(10, keep)));
      expect(view.edges).toHaveLength(10);
      expect("elided" in view).toBe(false);
      expect(view.nodes.some((n) => "elided_edges" in n)).toBe(false);
    }
  });
  it("E12 cap 0 with keep_forest=false removes and accounts for every item", async () => {
    const e = await example();
    const { view } = await derive(e, baseState(cap(0, false)));
    expect(view.edges).toEqual([]);
    expect(view.elided).toEqual({ items: 10, scene_edges: 10, rel_counts: [{ count: 1, rel: "q" }, { count: 9, rel: "r" }] });
    expect(Object.fromEntries(view.nodes.map((n) => [n.ref.id, n.elided_edges]))).toEqual({ "i:1": 4, "i:2": 2, "s:a": 3, "s:b": 4, "s:c": 4, "s:d": 1, "s:e": 1 });
  });
  it("E12b/E11 cap 0 or 2 with keep_forest=true: the spanning forest wins (the cap is a target)", async () => {
    const e = await example();
    for (const c of [0, 2, 6]) {
      const { view } = await derive(e, baseState(cap(c, true)));
      expect(edgeIds(view)).toEqual(["i:1>i:2:r", "i:1>s:a:r", "s:a>s:b:r", "s:c>i:2:r", "s:d>s:c:r", "s:e>s:c:r"]);
      expect(view.elided).toEqual({ items: 4, scene_edges: 4, rel_counts: [{ count: 1, rel: "q" }, { count: 3, rel: "r" }] });
      expect(Object.fromEntries(view.nodes.filter((n) => n.elided_edges !== undefined).map((n) => [n.ref.id, n.elided_edges]))).toEqual({ "i:1": 2, "s:a": 1, "s:b": 3, "s:c": 1 });
    }
  });
  it("E10 keep_forest with spare capacity keeps non-forest items in priority order", async () => {
    const e = await example();
    const { view } = await derive(e, baseState(cap(8, true)));
    // forest {1,2,4,6,8,9}; non-forest in priority order: e5 (7), e0 (8), e3 (8), e7 (8): keep e5, e0; remove e3, e7
    expect(edgeIds(view)).toEqual(["i:1>s:b:q", "i:1>i:2:r", "i:1>s:a:r", "s:a>s:b:r", "s:b>s:a:r", "s:c>i:2:r", "s:d>s:c:r", "s:e>s:c:r"]);
    expect(view.elided).toEqual({ items: 2, scene_edges: 2, rel_counts: [{ count: 2, rel: "r" }] });
    expect(Object.fromEntries(view.nodes.filter((n) => n.elided_edges !== undefined).map((n) => [n.ref.id, n.elided_edges]))).toEqual({ "i:1": 1, "s:b": 1, "s:c": 1 });
  });
  it("E13 keep_forest=false keeps exactly the first cap items by priority and may disconnect, accounted", async () => {
    const e = await example();
    const { view } = await derive(e, baseState(cap(3, false)));
    expect(edgeIds(view)).toEqual(["i:1>i:2:r", "s:d>s:c:r", "s:e>s:c:r"]);
    expect(view.elided).toEqual({ items: 7, scene_edges: 7, rel_counts: [{ count: 1, rel: "q" }, { count: 6, rel: "r" }] });
    expect(Object.fromEntries(view.nodes.filter((n) => n.elided_edges !== undefined).map((n) => [n.ref.id, n.elided_edges]))).toEqual({ "i:1": 3, "i:2": 1, "s:a": 3, "s:b": 4, "s:c": 2 });
  });
  it("L09 a cap never changes a label level; E16 a visible self-loop counts once in vdeg", async () => {
    const e = await example();
    const a = levels((await derive(e, baseState())).view);
    for (const [c, k] of [[0, false], [2, true], [3, false], [8, true]] as const) expect(levels((await derive(e, baseState(cap(c, k)))).view)).toEqual(a);
    expect(a["s:c"]).toBe("short"); // vdeg 4 with the loop counted once: td 1 (would be 5 -> full -> still short at tz0, so check via a policy below)
    const lp = { ...LABEL_POLICY, full_degree: 5, short_degree: 4 };
    const v = (await derive(e, baseState({ label_policy: lp, zoom_milli: 1000 }))).view; // tz 1: td 1 at d=4 gives 1, td 2 at d=5 would give 2
    expect(levels(v)["s:c"]).toBe("short"); // d = 4 -> not 5
  });
  it("a cap on aggregate bundles: Example C removes four items (W03)", async () => {
    const e = await example();
    const { view } = await derive(e, stateC());
    expect(view.elided!.items).toBe(4);
  });
  it("accounting is conserved when the cap hits aggregates (nodes + aggregates)", async () => {
    const e = await example();
    const { view } = await derive(e, baseState({ collapsed: [{ members: refs("s:a", "s:b", "s:c") }], ...cap(1, false) }));
    const shown = view.edges.length + view.aggregate_edges.reduce((s, x) => s + x.count, 0);
    expect(shown + view.aggregates[0]!.internal_edges.count + view.elided!.scene_edges).toBe(10);
  });
});

describe("label levels (L01-L06)", () => {
  const lp = (extra: Record<string, number> = {}) => ({ full_degree: 4, full_zoom_milli: 2000, short_degree: 3, short_zoom_milli: 1000, ...extra });
  const at = async (zoom: number, policy = lp()) => levels((await derive(await example(), baseState({ label_policy: policy, zoom_milli: zoom }))).view);
  it("L01 the 3 x 3 grid: zoom tier x degree tier (d = 2, 3, 4 on i:2, s:a, i:1)", async () => {
    // level = max(tz, min(td, tz + 1))
    const grid: Array<[number, [string, string, string]]> = [[0, ["hidden", "short", "short"]], [1000, ["short", "short", "full"]], [2000, ["full", "full", "full"]]];
    for (const [z, [l2, l3, l4]] of grid) {
      const l = await at(z);
      expect([l["i:2"], l["s:a"], l["i:1"]], `zoom ${z}`).toEqual([l2, l3, l4]);
    }
  });
  it("L02 thresholds use >=: 999/1000 and 1999/2000", async () => {
    expect((await at(999))["i:2"]).toBe("hidden");
    expect((await at(1000))["i:2"]).toBe("short");
    expect((await at(1999))["i:2"]).toBe("short");
    expect((await at(2000))["i:2"]).toBe("full");
    expect((await at(0))["s:a"]).toBe("short"); // d = 3 = short_degree
    expect((await at(0, lp({ short_degree: 4, full_degree: 4 })))["s:a"]).toBe("hidden");
  });
  it("L03 a high degree boosts by at most one tier", async () => {
    expect((await at(0, lp({ full_degree: 1, short_degree: 0 })))["i:2"]).toBe("short"); // td 2 at tz 0 -> min(2, 1) = 1
  });
  it("L04 an aggregate takes d = max(vdeg, member_count)", async () => {
    const e = await example();
    const a = (await derive(e, { ...stateA(), label_policy: { full_degree: 9, full_zoom_milli: 2000, short_degree: 2, short_zoom_milli: 1000 } })).view.aggregates[0]!;
    expect(a.label_level).toBe("short"); // vdeg 1, member_count 2 -> d = 2
    const b = (await derive(e, { ...stateA(), label_policy: { full_degree: 9, full_zoom_milli: 2000, short_degree: 3, short_zoom_milli: 1000 } })).view.aggregates[0]!;
    expect(b.label_level).toBe("hidden");
  });
  it("L05 pinned and exposed nodes are always full", async () => {
    const e = await example();
    const v = (await derive(e, { ...stateC(), label_policy: { full_degree: 9, full_zoom_milli: 2000, short_degree: 9, short_zoom_milli: 1000 } })).view;
    expect(levels(v)["s:b"]).toBe("full");
  });
  it("L06 the all-zero policy gives full everywhere", async () => {
    const l = await at(0, { full_degree: 0, full_zoom_milli: 0, short_degree: 0, short_zoom_milli: 0 });
    expect(new Set(Object.values(l))).toEqual(new Set(["full"]));
  });
  it("L08 levels are non-decreasing in zoom and in degree", async () => {
    const rank: Record<string, number> = { hidden: 0, short: 1, full: 2 };
    let prev: Record<string, number> | undefined;
    for (const z of [0, 500, 999, 1000, 1500, 1999, 2000, 5000]) {
      const l = Object.fromEntries(Object.entries(await at(z)).map(([k, v]) => [k, rank[v]!]));
      if (prev) for (const k of Object.keys(l)) expect(l[k]!, `${k}@${z}`).toBeGreaterThanOrEqual(prev[k]!);
      prev = l;
    }
    const l = await at(500);
    const vdeg: Record<string, number> = { "i:1": 4, "i:2": 2, "s:a": 3, "s:b": 4, "s:c": 4, "s:d": 1, "s:e": 1 };
    for (const a of Object.keys(l)) for (const b of Object.keys(l)) if (vdeg[a]! <= vdeg[b]!) expect(rank[l[a]!]!).toBeLessThanOrEqual(rank[l[b]!]!);
  });
});

describe("determinism and purity", () => {
  it("D08 repeated derivation is byte identical; the budget never changes the bytes (B11)", async () => {
    const e = await example();
    const a = await derive(e, stateC());
    const b = await derive(e, stateC());
    const c = await derive(e, stateC(), { budget: { maxNodes: 7, maxEdges: 10, maxWork: 3507 } });
    expect(dec(a.viewBytes)).toBe(dec(b.viewBytes));
    expect(dec(a.viewBytes)).toBe(dec(c.viewBytes));
  });
  it("C19 inputs are byte unchanged and the derived hashes are the state's", async () => {
    const e = await example();
    const s0 = new Uint8Array(e.sceneBytes), l0 = new Uint8Array(e.layoutBytes), st = bytes(stateC()), st0 = new Uint8Array(st);
    const r = await derive(e, st);
    expect(e.sceneBytes).toEqual(s0); expect(e.layoutBytes).toEqual(l0); expect(st).toEqual(st0);
    expect(r.view.scene_sha256).toBe(SCENE_HASH);
  });
  it("snapshots the inputs before the first await", async () => {
    const e = await example();
    const scene = new Uint8Array(e.sceneBytes), layout = new Uint8Array(e.layoutBytes), st = bytes(stateA());
    const p = deriveView(scene, layout, st);
    scene.fill(0); layout.fill(0); st.fill(0);
    expect(dec((await p).viewBytes)).toBe(DOC_VIEWS()[0]);
  });
  it("x- keys of the state, scene and layout are ignored: the view does not change", async () => {
    const e = await example();
    const plain = await derive(e, stateA());
    const withX = await derive(e, { ...stateA(), "x-a": { b: [1, 2] } });
    const strip = (v: View) => ({ ...v, state_sha256: "" });
    expect(strip(withX.view)).toEqual(strip(plain.view));
    expect(withX.view.state_sha256).not.toBe(plain.view.state_sha256);
  });
});

describe("budget and the order of checks (B02-B11)", () => {
  it("B02/B03 node and edge limits are against min(budget, hard limit)", async () => {
    const e = await example();
    expect(await errOf(() => derive(e, stateA(), { budget: { maxNodes: 6 } }))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(await errOf(() => derive(e, stateA(), { budget: { maxNodes: 7 } }))).toBe("no error");
    expect(await errOf(() => derive(e, stateA(), { budget: { maxEdges: 9 } }))).toBe("RESOURCE_LIMIT/EDGE_LIMIT");
    expect(await errOf(() => derive(e, stateA(), { budget: { maxEdges: 10 } }))).toBe("no error");
  });
  it("B08 W of the worked examples is 3127, 3492 and 3507: exactly at maxWork passes, one below is refused", async () => {
    const e = await example();
    for (const [mk, W] of [[stateA, 3127], [stateB, 3492], [stateC, 3507]] as const) {
      expect(await errOf(() => derive(e, mk(), { budget: { maxWork: W } })), `W=${W}`).toBe("no error");
      expect(await errOf(() => derive(e, mk(), { budget: { maxWork: W - 1 } })), `W-1=${W - 1}`).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    }
  });
  it("B09/B10 an invalid budget is an error, never clamped", async () => {
    const e = await example();
    const B = (budget: unknown) => errOf(() => derive(e, stateA(), { budget }));
    expect(await B({ maxNodes: 100_001 })).toBe("INVALID_POLICY/INVALID_BUDGET");
    expect(await B({ maxEdges: 500_001 })).toBe("INVALID_POLICY/INVALID_BUDGET");
    expect(await B({ maxWork: 1_000_000_001 })).toBe("INVALID_POLICY/INVALID_BUDGET");
    for (const bad of [{ other: 1 }, { maxNodes: 0 }, { maxNodes: -1 }, { maxNodes: "5" }, { maxNodes: true }, { maxNodes: 1.5 }, { maxNodes: NaN }, null, 5, []]) expect(await B(bad), JSON.stringify(bad)).toBe("INVALID_POLICY/INVALID_BUDGET");
    expect(await B({ maxNodes: 100_000, maxEdges: 500_000, maxWork: 1_000_000_000 })).toBe("no error");
    expect(await errOf(() => derive(e, stateA(), 5 as never))).toBe("INVALID_POLICY/INVALID_BUDGET");
  });
  it("B07 a refusal by the work limit happens before every LOD pass", async () => {
    const { deriveViewDetailed } = await import("../src/derive.js");
    const e = await example();
    const passes: string[] = [];
    await expect(deriveViewDetailed(e.sceneBytes, e.layoutBytes, bytes(stateA()), { budget: { maxWork: 3126 } }, { pass: (p: string) => passes.push(p) })).rejects.toMatchObject({ reason: "WORK_LIMIT" });
    expect(passes).toEqual([]);
    await deriveViewDetailed(e.sceneBytes, e.layoutBytes, bytes(stateA()), undefined, { pass: (p: string) => passes.push(p) });
    expect(passes).toEqual(expect.arrayContaining(["ids", "edges", "labels", "serialize", "hash", "conservation"]));
  });
  it("B01 INPUT_BYTES before any parse (scene + layout + state over 256 MiB)", async () => {
    const e = await example();
    const big = new Uint8Array(268_435_457);
    expect(await errOf(() => deriveView(big, e.layoutBytes, bytes(stateA())))).toBe("RESOURCE_LIMIT/INPUT_BYTES");
    expect(await errOf(() => deriveView(e.sceneBytes, e.layoutBytes, new Uint8Array(33_554_433)))).toBe("RESOURCE_LIMIT/STATE_BYTES");
  }, 60_000);
  it("the order of checks: budget before sizes before state before scene and layout before limits before binding before work", async () => {
    const e = await example();
    const junk = new Uint8Array([1, 2, 3]);
    // an invalid budget wins over everything
    expect(await errOf(() => deriveView(junk, junk, junk, { budget: { maxNodes: 0 } } as never))).toBe("INVALID_POLICY/INVALID_BUDGET");
    // M21: a state defect with an invalid scene is the state error
    expect(await errOf(() => deriveView(junk, e.layoutBytes, junk))).toBe("INVALID_LOD/SCHEMA");
    // an invalid scene with a valid state is the scene error (IgsError)
    expect(await errOf(() => deriveView(junk, e.layoutBytes, bytes(stateA())))).toBe("IgsError:INVALID_SCENE/SCHEMA");
    // a layout of another scene: V2's unchanged error
    const w2 = await world({ nodes: ["s:a", "s:b"] });
    expect(await errOf(() => deriveView(e.sceneBytes, w2.layoutBytes, bytes(stateA())))).toBe("LayoutError:SCENE_MISMATCH/");
    // the node limit is checked after binding but before state binding
    expect(await errOf(() => deriveView(e.sceneBytes, e.layoutBytes, bytes(baseState({ scene_sha256: "0".repeat(64) })), { budget: { maxNodes: 1 } }))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
  });
  it("M03/M04 STATE_MISMATCH: scene is checked before layout", async () => {
    const e = await example();
    expect(await errOf(() => derive(e, baseState({ scene_sha256: "0".repeat(64) })))).toBe("STATE_MISMATCH/SCENE");
    expect(await errOf(() => derive(e, baseState({ layout_sha256: "0".repeat(64) })))).toBe("STATE_MISMATCH/LAYOUT");
    expect(await errOf(() => derive(e, baseState({ scene_sha256: "0".repeat(64), layout_sha256: "1".repeat(64) })))).toBe("STATE_MISMATCH/SCENE");
  });
  it("C12/P04 unresolved members before unresolved pins", async () => {
    const e = await example();
    expect(await errOf(() => derive(e, baseState({ collapsed: [{ members: refs("s:d", "s:zz") }] })))).toBe("UNRESOLVED_NODE/MEMBER");
    expect(await errOf(() => derive(e, baseState({ pinned: [ref("s:zz")] })))).toBe("UNRESOLVED_NODE/PINNED");
    expect(await errOf(() => derive(e, baseState({ collapsed: [{ members: refs("s:d", "s:zz") }], pinned: [ref("s:yy")] })))).toBe("UNRESOLVED_NODE/MEMBER");
    expect(await errOf(() => derive(e, baseState({ pinned: [{ id: "s:a", type: "other" }] })))).toBe("UNRESOLVED_NODE/PINNED");
  });
  it("M14 a state with an overlap error is reported before an unbound scene", async () => {
    const e = await example();
    expect(await errOf(() => derive(e, baseState({ scene_sha256: "0".repeat(64), collapsed: [{ members: refs("s:a", "s:b") }, { members: refs("s:b", "s:c") }] })))).toBe("INVALID_GROUP/OVERLAPPING_GROUPS");
  });
});
