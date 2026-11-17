import { describe, expect, it } from "vitest";
import { collapseGroup, emptyState, expandGroup, replaceGroups, setPinned, withLayout, withZoom } from "../src/builders.js";
import { deriveAggregateId } from "../src/aggregate.js";
import { serializeLODState, verifyLODState } from "../src/state.js";
import type { LODState } from "../src/types.js";
import { baseState, bytes, dec, errOf, LABEL_POLICY, LAYOUT_HASH, ref, refs, SCENE_HASH, stateA, stateB, text } from "./helpers.js";

const S = async (o: Record<string, unknown>): Promise<LODState> => (await verifyLODState(bytes(o))).state;
const T = (s: LODState): string => dec(serializeLODState(s));
const emptyArgs = { sceneSha256: SCENE_HASH, layoutSha256: LAYOUT_HASH, label_policy: LABEL_POLICY, zoom_milli: 500 };

describe("emptyState", () => {
  it("builds the canonical empty state; edge_policy only when given", () => {
    expect(T(emptyState(emptyArgs))).toBe(text(baseState()));
    expect(T(emptyState({ ...emptyArgs, edge_policy: { keep_forest: true, max_view_edges: 3 } }))).toBe(text(baseState({ edge_policy: { keep_forest: true, max_view_edges: 3 } })));
  });
  it("verifies its arguments", async () => {
    expect(await errOf(() => emptyState({ ...emptyArgs, sceneSha256: "x" }))).toBe("INVALID_LOD/INVALID_HASH");
    expect(await errOf(() => emptyState({ ...emptyArgs, zoom_milli: -1 }))).toBe("INVALID_LOD/INVALID_NUMBER");
    expect(await errOf(() => emptyState({ ...emptyArgs, zoom_milli: 1.5 }))).toBe("INVALID_LOD/INVALID_NUMBER");
    expect(await errOf(() => emptyState({ ...emptyArgs, label_policy: { ...LABEL_POLICY, short_degree: 9 } }))).toBe("INVALID_POLICY/THRESHOLD_ORDER");
  });
});

describe("collapseGroup", () => {
  it("sorts the supplied members and returns a new canonical state (input untouched)", () => {
    const s = emptyState(emptyArgs);
    const before = T(s);
    const g = { members: refs("s:e", "s:d") };
    const r = collapseGroup(s, g);
    expect(T(r)).toBe(text(stateA()));
    expect(T(s)).toBe(before);
    expect(g.members).toEqual(refs("s:e", "s:d"));
    expect(r).not.toBe(s);
  });
  it("C05/C15 keeps the label (including the empty string), pins, zoom, policies and x- keys", async () => {
    const s = await S(baseState({ pinned: [ref("s:a")], zoom_milli: 7, "x-keep": { a: 1 }, edge_policy: { keep_forest: false, max_view_edges: 4 } }));
    const r = collapseGroup(s, { members: refs("s:d", "s:e"), label: "" });
    expect(r.collapsed).toEqual([{ label: "", members: refs("s:d", "s:e") }]);
    expect(r["x-keep"]).toEqual({ a: 1 });
    expect(r.zoom_milli).toBe(7);
    expect(r.pinned).toEqual([ref("s:a")]);
    expect(r.edge_policy).toEqual({ keep_forest: false, max_view_edges: 4 });
  });
  it("errors: duplicate member, duplicate group, overlap, too small, empty, bad ref, aggregate member", async () => {
    const s = await S(stateA());
    expect(await errOf(() => collapseGroup(s, { members: refs("s:a", "s:a") }))).toBe("INVALID_GROUP/DUPLICATE_MEMBER");
    expect(await errOf(() => collapseGroup(s, { members: refs("s:e", "s:d") }))).toBe("INVALID_GROUP/DUPLICATE_GROUP");
    expect(await errOf(() => collapseGroup(s, { members: refs("s:c", "s:d") }))).toBe("INVALID_GROUP/OVERLAPPING_GROUPS");
    expect(await errOf(() => collapseGroup(s, { members: refs("s:c") }))).toBe("INVALID_GROUP/GROUP_TOO_SMALL");
    expect(await errOf(() => collapseGroup(s, { members: [] }))).toBe("INVALID_GROUP/EMPTY_GROUP");
    expect(await errOf(() => collapseGroup(s, { members: [{ id: "bad", type: "t" }, ref("s:a")] }))).toBe("INVALID_LOD/INVALID_ID");
    expect(await errOf(() => collapseGroup(s, { members: [{ agg: "x" } as never, ref("s:a")] }))).toBe("INVALID_GROUP/AGGREGATE_AS_MEMBER");
    expect(await errOf(() => collapseGroup(s, { members: refs("s:a", "s:b"), extra: 1 } as never))).toBe("INVALID_LOD/UNKNOWN_FIELD");
    expect(await errOf(() => collapseGroup(s, { members: refs("s:a", "s:b"), label: 5 } as never))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => collapseGroup(s, { members: refs("s:a", "s:b"), label: "x".repeat(257) }))).toBe("RESOURCE_LIMIT/LABEL_LIMIT");
    expect(await errOf(() => collapseGroup(s, null as never))).toBe("INVALID_LOD/SCHEMA");
  });
  it("N04/N05 depth 17 is DEPTH_LIMIT", () => {
    let s = emptyState(emptyArgs);
    for (let d = 2; d <= 17; d++) s = collapseGroup(s, { members: Array.from({ length: d }, (_, i) => ref(`i:${i + 1}`)) });
    expect(s.collapsed.length).toBe(16);
    expect(() => collapseGroup(s, { members: Array.from({ length: 18 }, (_, i) => ref(`i:${i + 1}`)) })).toThrow(/DEPTH_LIMIT/);
  });
  it("reads caller properties once (a getter-bearing state is snapshotted)", () => {
    let reads = 0;
    const s = emptyState(emptyArgs);
    const evil = { ...s, get zoom_milli() { reads++; return 500; } } as LODState;
    Object.defineProperty(evil, "zoom_milli", { get() { reads++; return 500; }, enumerable: true });
    reads = 0;
    collapseGroup(evil, { members: refs("s:d", "s:e") });
    expect(reads).toBe(1);
  });
  it("audit I-3 (rev 4): a cyclic caller object is INVALID_LOD/SCHEMA at once, not an out-of-memory abort", async () => {
    const s = emptyState(emptyArgs);
    const g: Record<string, unknown> = { members: [ref("s:a"), ref("s:b")] };
    g["a"] = g; g["b"] = g; // two references per level: a tree expansion is exponential
    expect(await errOf(() => collapseGroup(s, g as never))).toBe("INVALID_LOD/SCHEMA");
    const a: unknown[] = []; a.push(a);
    expect(await errOf(() => replaceGroups(s, a as never))).toBe("INVALID_LOD/SCHEMA");
    const x: Record<string, unknown> = {}; x["loop"] = { back: x };
    expect(await errOf(() => collapseGroup({ ...s, "x-c": x } as never, { members: refs("s:a", "s:b") }))).toBe("INVALID_LOD/SCHEMA");
  });
  it("audit I-3 / rev 4: a shared subobject counts at every visit: 2^22 leaves (about 8.4M visits) are over MAX_CALLER_VISITS, a few hundred visits are not (RESOURCE_LIMIT/VISIT_LIMIT)", async () => {
    let v: unknown = 1;
    for (let i = 0; i < 22; i++) v = { a: v, b: v };
    expect(await errOf(() => collapseGroup({ ...emptyState(emptyArgs), "x-big": v } as never, { members: refs("s:a", "s:b") }))).toBe("RESOURCE_LIMIT/VISIT_LIMIT");
    let small: unknown = 1;
    for (let i = 0; i < 6; i++) small = { a: small, b: small };
    expect(await errOf(() => collapseGroup({ ...emptyState(emptyArgs), "x-small": small } as never, { members: refs("s:a", "s:b") }))).toBe("no error");
  }, 30_000);
  it("audit I-3: legitimate aliasing (one ref object used in a group and in pinned) still works", () => {
    const shared = ref("s:d");
    const s = setPinned(emptyState(emptyArgs), [shared]);
    const r = collapseGroup(s, { members: [shared, ref("s:e")] });
    expect(r.collapsed[0]!.members).toEqual(refs("s:d", "s:e"));
    expect(r.pinned).toEqual([ref("s:d")]);
  });
  it("C20 hostile: an x- value nested 100,000 deep is TOO_DEEP, not a RangeError", async () => {
    let v: unknown = 1;
    for (let i = 0; i < 100_000; i++) v = [v];
    const s = { ...emptyState(emptyArgs), "x-d": v } as LODState;
    expect(await errOf(() => collapseGroup(s, { members: refs("s:d", "s:e") }))).toBe("INVALID_LOD/TOO_DEEP");
  });
});

describe("expandGroup and round trips", () => {
  it("RT2 collapse then expand by members: the wrapper has the original state and the removed group", async () => {
    const s = await S(baseState({ pinned: [ref("s:a")] }));
    const g = { label: "L", members: refs("s:d", "s:e") };
    const c = collapseGroup(s, g);
    const r = await expandGroup(c, { members: refs("s:e", "s:d") });
    expect(T(r.state)).toBe(T(s));
    expect(r.removed).toEqual(g);
  });
  it("RT2 expand by aggregate id, then collapse the removed group: the bytes of S (label included)", async () => {
    const s = await S(stateB());
    const id = await deriveAggregateId(SCENE_HASH, refs("s:d", "s:e"));
    const r = await expandGroup(s, { agg: id });
    expect(r.state.collapsed.length).toBe(1);
    expect(r.removed).toEqual({ members: refs("s:d", "s:e") });
    expect(T(collapseGroup(r.state, r.removed))).toBe(T(s));
    const outer = await expandGroup(s, { agg: await deriveAggregateId(SCENE_HASH, refs("s:a", "s:b", "s:c", "s:d", "s:e")) });
    expect(outer.removed.label).toBe("outer");
    expect(T(collapseGroup(outer.state, outer.removed))).toBe(T(s));
    expect(outer.state.collapsed).toEqual([{ members: refs("s:d", "s:e") }]); // inner groups stay active
  });
  it("C18 NOT_ACTIVE; malformed {agg} is INVALID_ID; a target with other keys is SCHEMA", async () => {
    const s = await S(stateA());
    expect(await errOf(() => expandGroup(s, { members: refs("s:a", "s:b") }))).toBe("INVALID_GROUP/NOT_ACTIVE");
    expect(await errOf(() => expandGroup(s, { members: refs("s:d") }))).toBe("INVALID_GROUP/NOT_ACTIVE");
    expect(await errOf(() => expandGroup(s, { agg: "igagg1:" + "0".repeat(64) }))).toBe("INVALID_GROUP/NOT_ACTIVE");
    expect(await errOf(() => expandGroup(s, { agg: "igagg1:xyz" }))).toBe("INVALID_LOD/INVALID_ID");
    expect(await errOf(() => expandGroup(s, { agg: 5 } as never))).toBe("INVALID_LOD/INVALID_ID");
    expect(await errOf(() => expandGroup(s, {} as never))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => expandGroup(s, { agg: "igagg1:" + "0".repeat(64), members: [] } as never))).toBe("INVALID_LOD/SCHEMA");
  });
  it("snapshots state and target before the first await", async () => {
    const s = await S(stateA());
    const target = { members: refs("s:d", "s:e") };
    const p = expandGroup(s, target);
    target.members = refs("s:a", "s:b");
    s.collapsed.length = 0;
    const r = await p;
    expect(r.state.collapsed).toEqual([]);
    expect(r.removed.members).toEqual(refs("s:d", "s:e"));
  });
  it("RT5 collapsing in any order that ends at the same set yields the same bytes", () => {
    const gs = [{ members: refs("s:a", "s:b", "s:c", "s:d", "s:e") }, { members: refs("s:d", "s:e") }, { members: refs("i:1", "i:2") }];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const outs = perms.map((p) => T(p.reduce((s, i) => collapseGroup(s, gs[i]!), emptyState(emptyArgs))));
    expect(new Set(outs).size).toBe(1);
  });
});

describe("rev 4: expandGroup verifies its input state first (Z13)", () => {
  const overlapping = (): LODState => ({ ...emptyState(emptyArgs), collapsed: [{ members: refs("s:a", "s:b") }, { members: refs("s:b", "s:c") }] });
  it("an input state with overlapping groups fails with the verifier's code instead of being repaired by the removal", async () => {
    expect(await errOf(() => expandGroup(overlapping(), { members: refs("s:a", "s:b") }))).toBe("INVALID_GROUP/OVERLAPPING_GROUPS");
    expect(await errOf(() => expandGroup(overlapping(), { members: refs("s:b", "s:c") }))).toBe("INVALID_GROUP/OVERLAPPING_GROUPS");
  });
  it("an unsorted input state is NON_CANONICAL, a duplicate pin is DUPLICATE_PIN, a bad policy is THRESHOLD_ORDER", async () => {
    const s = await S(stateA());
    expect(await errOf(() => expandGroup({ ...s, collapsed: [{ members: refs("s:e", "s:d") }] }, { members: refs("s:d", "s:e") }))).toBe("INVALID_LOD/NON_CANONICAL");
    expect(await errOf(() => expandGroup({ ...s, pinned: refs("s:a", "s:a") }, { members: refs("s:d", "s:e") }))).toBe("INVALID_LOD/DUPLICATE_PIN");
    expect(await errOf(() => expandGroup({ ...s, label_policy: { ...LABEL_POLICY, short_degree: 9 } }, { members: refs("s:d", "s:e") }))).toBe("INVALID_POLICY/THRESHOLD_ORDER");
  });
  it("with an {agg} target the limits are checked before any id is hashed (20,001 groups: GROUP_LIMIT at once)", async () => {
    const many = Array.from({ length: 20_001 }, (_, i) => ({ members: [ref("i:" + 2 * i), ref("i:" + (2 * i + 1))] }));
    const t0 = Date.now();
    expect(await errOf(() => expandGroup({ ...emptyState(emptyArgs), collapsed: many }, { agg: "igagg1:" + "0".repeat(64) }))).toBe("RESOURCE_LIMIT/GROUP_LIMIT");
    expect(Date.now() - t0).toBeLessThan(3000);
  }, 20_000);
  it("a valid state is expanded as before", async () => {
    const r = await expandGroup(await S(stateB()), { members: refs("s:d", "s:e") });
    expect(r.state.collapsed.length).toBe(1);
  });
});

describe("replaceGroups, setPinned, withZoom, withLayout", () => {
  it("X03 replaceGroups swaps the catalog; sorts members and the list", async () => {
    const s = await S(stateA());
    const r = replaceGroups(s, [{ members: refs("s:e", "s:d") }, { members: refs("i:2", "i:1") }]);
    expect(r.collapsed).toEqual([{ members: refs("i:1", "i:2") }, { members: refs("s:d", "s:e") }]);
    expect(replaceGroups(s, []).collapsed).toEqual([]);
  });
  it("C11b replaceGroups sorts like the other builders: the same family in two list orders gives DUPLICATE_GROUP in both", async () => {
    const s = await S(baseState());
    const a = { members: refs("s:a", "s:b") }, a2 = { members: refs("s:b", "s:a") }, o = { members: refs("s:b", "s:c") };
    expect(await errOf(() => replaceGroups(s, [a, a2, o]))).toBe("INVALID_GROUP/DUPLICATE_GROUP");
    expect(await errOf(() => replaceGroups(s, [o, a2, a]))).toBe("INVALID_GROUP/DUPLICATE_GROUP");
    expect(await errOf(() => replaceGroups(s, [o, a]))).toBe("INVALID_GROUP/OVERLAPPING_GROUPS");
    expect(await errOf(() => replaceGroups(s, "x" as never))).toBe("INVALID_LOD/SCHEMA");
  });
  it("P06 setPinned REPLACES the whole set; [] unpins; sorts; duplicate pin errors", async () => {
    const s = await S(baseState({ pinned: [ref("s:a")] }));
    expect(setPinned(s, refs("s:c", "s:b")).pinned).toEqual(refs("s:b", "s:c"));
    expect(setPinned(s, []).pinned).toEqual([]);
    expect(await errOf(() => setPinned(s, refs("s:b", "s:b")))).toBe("INVALID_LOD/DUPLICATE_PIN");
    expect(await errOf(() => setPinned(s, [{ id: "bad", type: "t" }]))).toBe("INVALID_LOD/INVALID_ID");
    expect(s.pinned).toEqual([ref("s:a")]);
  });
  it("withZoom and withLayout", async () => {
    const s = await S(stateA());
    expect(withZoom(s, 2000).zoom_milli).toBe(2000);
    expect(await errOf(() => withZoom(s, -5))).toBe("INVALID_LOD/INVALID_NUMBER");
    expect(await errOf(() => withZoom(s, 2 ** 31))).toBe("INVALID_LOD/INVALID_NUMBER");
    expect(await errOf(() => withZoom(s, "5" as never))).toBe("INVALID_LOD/SCHEMA");
    const l = withLayout(s, "a".repeat(64));
    expect(l.layout_sha256).toBe("a".repeat(64));
    expect(l.collapsed).toEqual(s.collapsed);
    expect(await errOf(() => withLayout(s, "zz"))).toBe("INVALID_LOD/INVALID_HASH");
  });
  it("builders hand back states that verify byte for byte", async () => {
    let s = emptyState(emptyArgs);
    s = collapseGroup(s, { members: refs("s:d", "s:e") });
    s = setPinned(s, refs("s:a"));
    s = withZoom(s, 123);
    const again = await verifyLODState(serializeLODState(s));
    expect(T(again.state)).toBe(T(s));
  });
});
