import { describe, expect, it } from "vitest";
import { deriveView } from "../src/derive.js";
import { checkViewConservation, projectToView, resolveAggregateEdge, resolveFromView } from "../src/mapping.js";
import type { View, ViewRef } from "../src/types.js";
import { baseState, bytes, errOf, example, ref, refs, world, stateA, stateB, stateC, type EdgeSpec } from "./helpers.js";

const INNER = "igagg1:1f0a7d87706cb0271fcb451e67c7be8e9df7fae0b751f527a1480891cc5ad1dc";
const OUTER = "igagg1:877702b4003afc31868a3ffc0d607bdf9760a13155cc275e732560e6be00083e";
const viewOf = async (state: Record<string, unknown>): Promise<{ view: View; e: Awaited<ReturnType<typeof example>> }> => {
  const e = await example();
  return { view: (await deriveView(e.sceneBytes, e.layoutBytes, bytes(state))).view, e };
};
const clone = <T,>(x: T): T => structuredClone(x);

describe("projectToView (S01, S02, S09)", () => {
  it("S01 a hidden ref maps to its aggregate; a visible or exposed ref maps to itself", async () => {
    const { view } = await viewOf(stateB());
    expect(projectToView(view, refs("s:c"))).toEqual([{ agg: OUTER }]);
    expect(projectToView(view, refs("i:1"))).toEqual([ref("i:1")]);
    const c = (await viewOf(stateC())).view;
    expect(projectToView(c, refs("s:b"))).toEqual([ref("s:b")]); // exposed
    expect(projectToView(c, refs("s:a"))).toEqual([{ agg: OUTER }]);
  });
  it("S02 several hidden refs of one aggregate give ONE {agg}; output deduplicated, scene nodes before aggregates", async () => {
    const { view } = await viewOf(stateB());
    expect(projectToView(view, refs("s:e", "s:d", "s:a", "i:2", "i:1", "i:1"))).toEqual([ref("i:1"), ref("i:2"), { agg: OUTER }]);
    expect(projectToView(view, [])).toEqual([]);
  });
  it("S09 several aggregates come out ordered by id ascending whatever the order of the input refs", async () => {
    const { view } = await viewOf(baseState({ collapsed: [{ members: refs("i:1", "i:2") }, { members: refs("s:d", "s:e") }] }));
    const idOf = (r: string) => view.aggregates.find((a) => a.hidden.some((h) => h.id === r))!.id;
    const asc = [idOf("i:1"), idOf("s:d")].sort();
    const memberOf = (id: string) => (id === idOf("i:1") ? "i:1" : "s:d");
    for (const order of [[0, 1], [1, 0]]) expect(projectToView(view, order.map((i) => ref(memberOf(asc[i]!))))).toEqual(asc.map((agg) => ({ agg })));
  });
  it("a ref in neither nodes nor hidden is UNRESOLVED_NODE/PROJECTION; malformed refs are SCHEMA", async () => {
    const { view } = await viewOf(stateB());
    expect(await errOf(() => projectToView(view, refs("s:zz")))).toBe("UNRESOLVED_NODE/PROJECTION");
    expect(await errOf(() => projectToView(view, [{ id: "s:a", type: "other" }]))).toBe("UNRESOLVED_NODE/PROJECTION");
    expect(await errOf(() => projectToView(view, [{ agg: OUTER } as never]))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => projectToView(view, [{ id: "x", type: "t" }]))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => projectToView(view, [{ id: "s:a", type: "t", extra: 1 } as never]))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => projectToView(view, "x" as never))).toBe("INVALID_LOD/SCHEMA");
  });
  it("S06 collapse then expand restores the projected identities", async () => {
    const a = (await viewOf(stateA())).view;
    const plain = (await viewOf(baseState())).view;
    expect(projectToView(a, refs("s:d"))).toEqual([{ agg: INNER }]);
    expect(projectToView(plain, refs("s:d"))).toEqual([ref("s:d")]);
  });
});

describe("Z14 (rev 4): projectToView sorts explicitly", () => {
  it("a foreign view with nodes in reverse order gives the canonical order (scene nodes by NodeRef/2, then aggregates by id)", async () => {
    const { view } = await viewOf(stateB());
    const rev = clone(view); rev.nodes.reverse();
    expect(projectToView(rev, refs("i:2", "s:c", "i:1"))).toEqual([ref("i:1"), ref("i:2"), { agg: OUTER }]);
    const a = (await viewOf(stateA())).view;
    const r2 = clone(a); r2.nodes.reverse();
    expect(projectToView(r2, refs("s:c", "i:1"))).toEqual([ref("i:1"), ref("s:c")]);
  });
  it("Z18 a given View's strings are not content-checked", async () => {
    const a = (await viewOf(stateA())).view;
    const odd = clone(a); odd.nodes[0]!.label_level = "bold" as never;
    expect(projectToView(odd, refs("i:1"))).toEqual([ref("i:1")]);
  });
});

describe("resolveFromView (S03, S04, S07)", () => {
  it("S03 an aggregate resolves to its hidden list; S04 a scene node in nodes resolves to itself", async () => {
    const { view } = await viewOf(stateB());
    expect(resolveFromView(view, [{ agg: OUTER }])).toEqual(refs("s:a", "s:b", "s:c", "s:d", "s:e"));
    expect(resolveFromView(view, [ref("i:1")])).toEqual([ref("i:1")]);
  });
  it("exposed members are not repeated in the hidden expansion; they are visible nodes", async () => {
    const { view } = await viewOf(stateC());
    expect(resolveFromView(view, [{ agg: OUTER }])).toEqual(refs("s:a", "s:c", "s:d", "s:e"));
    expect(resolveFromView(view, [ref("s:b")])).toEqual([ref("s:b")]);
  });
  it("S09 deduplicated, in NodeRef/2 order", async () => {
    const { view } = await viewOf(stateB());
    expect(resolveFromView(view, [ref("i:2"), { agg: OUTER }, ref("i:1"), ref("i:2")])).toEqual(refs("i:1", "i:2", "s:a", "s:b", "s:c", "s:d", "s:e"));
  });
  it("S07 a stale aggregate is NOT_IN_VIEW/AGGREGATE; a hidden scene ref is NOT_IN_VIEW/NODE; malformed id strings are INVALID_ID", async () => {
    const { view } = await viewOf(stateB());
    expect(await errOf(() => resolveFromView(view, [{ agg: INNER }]))).toBe("NOT_IN_VIEW/AGGREGATE");
    expect(await errOf(() => resolveFromView(view, [ref("s:c")]))).toBe("NOT_IN_VIEW/NODE");
    expect(await errOf(() => resolveFromView(view, [{ agg: "igagg1:zz" }]))).toBe("INVALID_LOD/INVALID_ID");
    expect(await errOf(() => resolveFromView(view, [{ agg: OUTER, id: "s:a" } as never]))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => resolveFromView(view, [{} as never]))).toBe("INVALID_LOD/SCHEMA");
  });
  it("S08 X is a subset of resolve(project(X)), with equality exactly for unions of visible nodes and whole hidden sets", async () => {
    const { view } = await viewOf(stateB());
    const roundtrip = (x: ReturnType<typeof refs>) => resolveFromView(view, projectToView(view, x));
    const key = (r: { id: string }) => r.id;
    const X1 = refs("s:a", "i:1");
    expect(roundtrip(X1).map(key)).toEqual(["i:1", "s:a", "s:b", "s:c", "s:d", "s:e"]);
    const X2 = refs("i:1", "s:a", "s:b", "s:c", "s:d", "s:e");
    expect(roundtrip(X2).map(key)).toEqual(X2.map(key));
  });
});

describe("shape check of a caller-supplied View (S10)", () => {
  it("every malformed shape is INVALID_LOD/SCHEMA, on every API that takes a view", async () => {
    const { view } = await viewOf(stateB());
    const mutants: Array<[string, (v: Record<string, unknown>) => void]> = [
      ["missing nodes", (v) => { delete v["nodes"]; }],
      ["nodes not an array", (v) => { v["nodes"] = {}; }],
      ["aggregates is a string", (v) => { v["aggregates"] = "x"; }],
      ["edges null", (v) => { v["edges"] = null; }],
      ["directed not boolean", (v) => { v["directed"] = "yes"; }],
      ["scale not a number", (v) => { v["scale"] = "1000"; }],
      ["unknown key", (v) => { v["zzz"] = 1; }],
      ["node missing x", (v) => { delete (v["nodes"] as Record<string, unknown>[])[0]!["x"]; }],
      ["node ref bad key set", (v) => { (v["nodes"] as { ref: Record<string, unknown> }[])[0]!.ref = { id: "i:1" }; }],
      ["aggregate hidden entry is an agg ref", (v) => { (v["aggregates"] as { hidden: unknown[] }[])[0]!.hidden[0] = { agg: OUTER }; }],
      ["aggregate missing anchor", (v) => { delete (v["aggregates"] as Record<string, unknown>[])[0]!["anchor"]; }],
      ["anchor not integers", (v) => { (v["aggregates"] as { anchor: Record<string, unknown> }[])[0]!.anchor["x"] = "1"; }],
      ["aggregate edge src bad key set", (v) => { (v["aggregate_edges"] as { src: Record<string, unknown> }[])[0]!.src = { agg: OUTER, id: "x" }; }],
      ["aggregate edge rel_counts entry wrong", (v) => { (v["aggregate_edges"] as { rel_counts: unknown[] }[])[0]!.rel_counts[0] = { count: 1 }; }],
      ["view edge without ref", (v) => { (v["edges"] as unknown[])[0] = {}; }],
      ["elided wrong type", (v) => { v["elided"] = 5; }],
    ];
    for (const [name, mut] of mutants) {
      const bad = clone(view) as unknown as Record<string, unknown>;
      mut(bad);
      expect(await errOf(() => projectToView(bad as never, refs("i:1"))), name).toBe("INVALID_LOD/SCHEMA");
      expect(await errOf(() => resolveFromView(bad as never, [ref("i:1")])), name).toBe("INVALID_LOD/SCHEMA");
    }
    expect(await errOf(() => projectToView(null as never, []))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => projectToView([] as never, []))).toBe("INVALID_LOD/SCHEMA");
    const e = await example();
    const bad = clone(view) as unknown as Record<string, unknown>; delete bad["nodes"];
    expect(await errOf(() => resolveAggregateEdge(e.sceneBytes, bad as never, view.aggregate_edges[0]!))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => checkViewConservation(e.sceneBytes, bad as never))).toBe("INVALID_LOD/SCHEMA");
  });
  it("nothing else about a view is validated: a hand-written valid view maps", () => {
    const v = {
      address_scheme: "igs-addr/1", igview: "IGLOD-VIEW/1", scale: 1000, scene_sha256: "x", layout_sha256: "y", state_sha256: "z", directed: true,
      nodes: [{ ref: ref("s:a"), x: 1, y: 2, label_level: "short" }], aggregates: [{ id: "any", hidden: [ref("s:b")], member_count: 1, anchor: { x: 0, y: 0 }, internal_edges: { count: 0, rel_counts: [] }, label_level: "hidden" }],
      edges: [], aggregate_edges: [],
    };
    expect(projectToView(v as never, refs("s:b"))).toEqual([{ agg: "any" }]);
  });
});

describe("resolveAggregateEdge (R vectors)", () => {
  it("the edges behind a bundle, in scene order", async () => {
    const { view, e } = await viewOf(stateB());
    const b0 = view.aggregate_edges[0]!; // (i:1 -> Outer): edges 0, 2, 3
    const r = await resolveAggregateEdge(e.sceneBytes, view, b0);
    expect(r.map((x) => `${x.src.id}-${x.rel}-${x.tgt.id}`)).toEqual(["i:1-q-s:b", "i:1-r-s:a", "i:1-r-s:b"]);
    const b1 = view.aggregate_edges[1]!; // (Outer -> i:2): edge 6
    expect((await resolveAggregateEdge(e.sceneBytes, view, b1)).map((x) => `${x.src.id}-${x.rel}-${x.tgt.id}`)).toEqual(["s:c-r-i:2"]);
    expect(r.length).toBe(b0.count);
  });
  it("every bundle's recovered edges have the bundle's count and rel_counts (state B and a nested state)", async () => {
    for (const st of [stateA(), stateB(), baseState({ collapsed: [{ members: refs("s:a", "s:c") }] })]) {
      const { view, e } = await viewOf(st);
      for (const b of view.aggregate_edges) {
        const r = await resolveAggregateEdge(e.sceneBytes, view, b);
        expect(r.length).toBe(b.count);
        const c: Record<string, number> = {};
        for (const x of r) c[x.rel] = (c[x.rel] ?? 0) + 1;
        expect(Object.entries(c).sort()).toEqual(b.rel_counts.map((x) => [x.rel, x.count]));
      }
    }
  });
  it("directed opposite bundles are separate; an undirected bundle is found by (rank-smaller, aggregate)", async () => {
    const { view, e } = await viewOf(baseState({ collapsed: [{ members: refs("s:a", "s:c") }] }));
    const toStr = (r: ViewRef) => ("agg" in r ? "AGG" : r.id);
    const sb = view.aggregate_edges.find((b) => toStr(b.src) === "s:b" && toStr(b.tgt) === "AGG")!;
    const bs = view.aggregate_edges.find((b) => toStr(b.src) === "AGG" && toStr(b.tgt) === "s:b")!;
    expect((await resolveAggregateEdge(e.sceneBytes, view, sb)).map((x) => x.src.id + x.tgt.id)).toEqual(["s:bs:a"]);
    expect((await resolveAggregateEdge(e.sceneBytes, view, bs)).map((x) => x.src.id + x.tgt.id)).toEqual(["s:as:b"]);
    const w = await world({ directed: false, nodes: ["s:a", "s:b", "s:x"], edges: [["s:a", "r", "s:x"], ["s:b", "r", "s:x"], ["s:a", "r", "s:b"]] });
    const v = (await deriveView(w.sceneBytes, w.layoutBytes, bytes(baseState({ scene_sha256: w.sceneSha256, layout_sha256: w.layoutSha256, collapsed: [{ members: refs("s:a", "s:b") }] })))).view;
    const r = await resolveAggregateEdge(w.sceneBytes, v, v.aggregate_edges[0]!);
    expect(r.map((x) => x.src.id + x.tgt.id)).toEqual(["s:as:x", "s:bs:x"]);
  });
  it("an edge that is not a bundle of the view (also one removed by a density cap) is NOT_IN_VIEW/EDGE", async () => {
    const { view, e } = await viewOf(stateC());
    expect(await errOf(() => resolveAggregateEdge(e.sceneBytes, view, { src: ref("i:1"), tgt: { agg: OUTER }, count: 1, rel_counts: [] }))).toBe("NOT_IN_VIEW/EDGE");
    expect(await errOf(() => resolveAggregateEdge(e.sceneBytes, view, { src: ref("s:zz"), tgt: { agg: OUTER } } as never))).toBe("NOT_IN_VIEW/EDGE");
    expect(await errOf(() => resolveAggregateEdge(e.sceneBytes, view, { src: ref("zz"), tgt: { agg: OUTER } } as never))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => resolveAggregateEdge(e.sceneBytes, view, { src: { agg: "bad" }, tgt: ref("i:2") } as never))).toBe("INVALID_LOD/INVALID_ID");
    expect(await errOf(() => resolveAggregateEdge(e.sceneBytes, view, 5 as never))).toBe("INVALID_LOD/SCHEMA");
    expect(await errOf(() => resolveAggregateEdge(e.sceneBytes, view, { src: ref("i:1") } as never))).toBe("INVALID_LOD/SCHEMA");
  });
  it("B15 order of checks: view shape, budget, scene, limits, scene hash, then work", async () => {
    const { view, e } = await viewOf(stateB());
    const b = view.aggregate_edges[0]!;
    const E = (scene: Uint8Array, v: unknown, options?: unknown) => errOf(() => resolveAggregateEdge(scene, v as never, b, options as never));
    expect(await E(new Uint8Array([1]), { nope: 1 }, { budget: { maxNodes: 0 } })).toBe("INVALID_LOD/SCHEMA"); // view shape first
    expect(await E(new Uint8Array([1]), view, { budget: { maxNodes: 0 } })).toBe("INVALID_POLICY/INVALID_BUDGET");
    expect(await E(new Uint8Array([1]), view)).toBe("IgsError:INVALID_SCENE/SCHEMA");
    expect(await E(e.sceneBytes, view, { budget: { maxNodes: 6 } })).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(await E(e.sceneBytes, view, { budget: { maxEdges: 9 } })).toBe("RESOURCE_LIMIT/EDGE_LIMIT");
    expect(await E(e.sceneBytes, { ...view, scene_sha256: "0".repeat(64) }, { budget: { maxWork: 1 } })).toBe("STATE_MISMATCH/SCENE");
    // W = 6n + 8m + 8V + (n + 2m) ceil(Lkey/64) = 42 + 80 + 8V + 27: V = nodes 2 + hidden 5 + exposed 0 + edges 1 + bundles 2 + rel_counts (2 + 1 + internal 1 + elided 0) = 14 -> 112
    const W = 6 * 7 + 8 * 10 + 8 * 14 + 27;
    expect(await E(e.sceneBytes, view, { budget: { maxWork: W } })).toBe("no error");
    expect(await E(e.sceneBytes, view, { budget: { maxWork: W - 1 } })).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
});

describe("audit I-1: a view is tied to the scene, not only counted", () => {
  const ghost = ref("s:ghost");
  const E = async (mut: (v: View) => void) => { const { view, e } = await viewOf(stateC()); const v = clone(view); mut(v); return errOf(() => checkViewConservation(e.sceneBytes, v)); };
  it("a visible node that is not in the scene (a real one omitted) is INTERNAL/CONSERVATION", async () => {
    expect(await E((v) => { v.nodes[0]!.ref = ghost; })).toBe("INTERNAL/CONSERVATION");
  });
  it("a hidden or exposed member that is not in the scene is refused, even with the counts intact", async () => {
    expect(await E((v) => { v.aggregates[0]!.hidden[0] = ghost; })).toBe("INTERNAL/CONSERVATION");
    expect(await E((v) => { v.aggregates[0]!.exposed = [ghost]; v.nodes[v.nodes.findIndex((n) => n.ref.id === "s:b")]!.ref = ghost; })).toBe("INTERNAL/CONSERVATION");
  });
  it("a visible edge whose endpoints or address are not in the scene is refused", async () => {
    expect(await E((v) => { v.edges[0]!.ref.src = ghost; })).toBe("INTERNAL/CONSERVATION");
    expect(await E((v) => { v.edges[0]!.ref.rel = "nope"; })).toBe("INTERNAL/CONSERVATION");
  });
  it("a bundle endpoint that is a ghost node or an aggregate not in the view is refused", async () => {
    expect(await E((v) => { v.aggregate_edges[0]!.tgt = ghost; })).toBe("INTERNAL/CONSERVATION");
    expect(await E((v) => { v.aggregate_edges[0]!.tgt = { agg: "igagg1:" + "0".repeat(64) }; })).toBe("INTERNAL/CONSERVATION");
  });
  it("a node listed twice (a real one omitted) is refused", async () => {
    expect(await E((v) => { v.nodes[1]!.ref = { ...v.nodes[0]!.ref }; })).toBe("INTERNAL/CONSERVATION");
  });
  it("the derived views still pass", async () => {
    for (const mk of [stateA, stateB, stateC]) { const { view, e } = await viewOf(mk()); await expect(checkViewConservation(e.sceneBytes, view)).resolves.toBeUndefined(); }
  });
});

describe("audit M-2/M-3: given views", () => {
  it("a malformed hidden ref gives INVALID_LOD/SCHEMA from resolveFromView, not an IgsError", async () => {
    const { view } = await viewOf(stateB());
    const bad = clone(view); bad.aggregates[0]!.hidden[0] = { id: "zzz", type: "t" };
    expect(await errOf(() => resolveFromView(bad, [{ agg: OUTER }]))).toBe("INVALID_LOD/SCHEMA");
  });
  it("projectToView and resolveFromView read the caller view once (a snapshot), or refuse a non-plain object", async () => {
    const { view } = await viewOf(stateB());
    let reads = 0;
    const spy = { ...view } as Record<string, unknown>;
    Object.defineProperty(spy, "nodes", { enumerable: true, get() { reads++; return view.nodes; } });
    projectToView(spy as never, refs("i:1"));
    expect(reads).toBe(1);
    reads = 0;
    resolveFromView(spy as never, [ref("i:1")]);
    expect(reads).toBe(1);
    expect(await errOf(() => projectToView(new Proxy(view, {}) as never, []))).toBe("INVALID_LOD/SCHEMA");
  });
});

describe("checkViewConservation", () => {
  it("accepts the derived views of the worked examples", async () => {
    for (const mk of [stateA, stateB, stateC, () => baseState()]) {
      const { view, e } = await viewOf(mk());
      await expect(checkViewConservation(e.sceneBytes, view)).resolves.toBeUndefined();
    }
  });
  it("rejects a view that lost or gained anything (C-nodes, C-edges, C-elided, C-ids)", async () => {
    const { view, e } = await viewOf(stateC());
    const mutants: Array<[string, (v: View) => void]> = [
      ["drop a visible node", (v) => { v.nodes.pop(); }],
      ["drop a hidden node", (v) => { v.aggregates[0]!.hidden.pop(); }],
      ["duplicate a hidden node as visible", (v) => { v.nodes.push({ ...v.nodes[0]! }); }],
      ["exposed not visible", (v) => { v.aggregates[0]!.exposed = [ref("s:zz")]; }],
      ["member_count off by one", (v) => { v.aggregates[0]!.member_count++; }],
      ["drop a visible edge", (v) => { v.edges.pop(); }],
      ["bundle count off", (v) => { v.aggregate_edges[0]!.count++; v.aggregate_edges[0]!.rel_counts[0]!.count++; }],
      ["bundle rel_counts do not sum", (v) => { v.aggregate_edges[0]!.rel_counts[0]!.count++; }],
      ["internal count off", (v) => { v.aggregates[0]!.internal_edges.count++; v.aggregates[0]!.internal_edges.rel_counts[0]!.count++; }],
      ["elided scene_edges off", (v) => { v.elided!.scene_edges++; v.elided!.rel_counts[0]!.count++; }],
      ["elided removed", (v) => { delete v.elided; }],
      ["elided_edges too small", (v) => { for (const n of v.nodes) delete n.elided_edges; }],
      ["elided_edges too large", (v) => { v.nodes[0]!.elided_edges = 99; }],
      ["aggregate id wrong", (v) => { v.aggregates[0]!.id = "igagg1:" + "0".repeat(64); }],
      ["hidden member swapped for another node", (v) => { v.aggregates[0]!.hidden[0] = ref("s:zz"); }],
    ];
    for (const [name, mut] of mutants) {
      const v = clone(view);
      mut(v);
      expect(await errOf(() => checkViewConservation(e.sceneBytes, v)), name).toBe("INTERNAL/CONSERVATION");
    }
  });
  it("a view of another scene is STATE_MISMATCH/SCENE; budgets apply", async () => {
    const { view, e } = await viewOf(stateA());
    expect(await errOf(() => checkViewConservation(e.sceneBytes, { ...view, scene_sha256: "1".repeat(64) }))).toBe("STATE_MISMATCH/SCENE");
    expect(await errOf(() => checkViewConservation(e.sceneBytes, view, { budget: { maxWork: 1 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(await errOf(() => checkViewConservation(e.sceneBytes, view, { budget: { maxNodes: 1 } }))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
  });
  it("hidden and exposed are interleaved in NodeRef/2 order to recompute the id (pinned member in the middle)", async () => {
    const w = await world({ nodes: ["s:a", "s:b", "s:c"], edges: [["s:a", "r", "s:b"]] });
    const st = baseState({ scene_sha256: w.sceneSha256, layout_sha256: w.layoutSha256, collapsed: [{ members: refs("s:a", "s:b", "s:c") }], pinned: [ref("s:b")] });
    const { view } = await deriveView(w.sceneBytes, w.layoutBytes, bytes(st));
    await expect(checkViewConservation(w.sceneBytes, view)).resolves.toBeUndefined();
    void ({} as EdgeSpec);
  });
});
