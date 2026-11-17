import { describe, expect, it } from "vitest";
import { assembleCatalog, suggestGroups } from "../src/rules.js";
import { example, errOf, ref, refs, world, mkScene, type EdgeSpec } from "./helpers.js";

const sg = async (nodes: string[], edges: EdgeSpec[], rules: unknown[], directed = true) => {
  const w = await world({ nodes, edges, directed });
  return (await suggestGroups(w.sceneBytes, rules as never)).groups.map((g) => g.members.map((m) => m.id));
};
const PF2 = { rule: "pendant-fold/1", min_leaves: 2 };
const star = (host: string, leaves: string[]): EdgeSpec[] => leaves.map((l) => [host, "r", l]);

describe("pendant-fold/1", () => {
  it("W01 the worked example suggests the group of state A", async () => {
    const e = await example();
    const c = await suggestGroups(e.sceneBytes, [PF2] as never);
    expect(c).toEqual({ scene_sha256: e.sceneSha256, groups: [{ members: refs("s:d", "s:e") }] });
  });
  it("T01 a star with three leaves; T04 min_leaves boundary", async () => {
    const edges = star("s:h", ["s:a", "s:b", "s:c"]);
    const nodes = ["s:h", "s:a", "s:b", "s:c"];
    expect(await sg(nodes, edges, [PF2])).toEqual([["s:a", "s:b", "s:c"]]);
    expect(await sg(nodes, edges, [{ rule: "pendant-fold/1", min_leaves: 3 }])).toEqual([["s:a", "s:b", "s:c"]]);
    expect(await sg(nodes, edges, [{ rule: "pendant-fold/1", min_leaves: 4 }])).toEqual([]);
  });
  it("T02 K2 is never folded; T11 a single node, T10 an empty scene give nothing", async () => {
    expect(await sg(["s:a", "s:b"], [["s:a", "r", "s:b"]], [PF2])).toEqual([]);
    expect(await sg(["s:a"], [], [PF2])).toEqual([]);
    expect(await sg([], [], [PF2])).toEqual([]);
  });
  it("T11b isolated nodes never fold, however many there are", async () => {
    expect(await sg(["s:a", "s:b", "s:c"], [], [PF2])).toEqual([]);
    expect(await sg(["s:a", "s:b", "s:c", "s:h", "s:x", "s:y"], [["s:h", "r", "s:x"], ["s:h", "r", "s:y"]], [PF2])).toEqual([["s:x", "s:y"]]);
  });
  it("T03 path of 3 folds its two ends under the middle; path of 4 folds nothing", async () => {
    expect(await sg(["s:a", "s:b", "s:c"], [["s:a", "r", "s:b"], ["s:b", "r", "s:c"]], [PF2])).toEqual([["s:a", "s:c"]]);
    expect(await sg(["s:a", "s:b", "s:c", "s:d"], [["s:a", "r", "s:b"], ["s:b", "r", "s:c"], ["s:c", "r", "s:d"]], [PF2])).toEqual([]);
  });
  it("T06 a cycle folds nothing", async () => {
    expect(await sg(["s:a", "s:b", "s:c"], [["s:a", "r", "s:b"], ["s:b", "r", "s:c"], ["s:c", "r", "s:a"]], [PF2])).toEqual([]);
  });
  it("T07 a leaf with a self-loop is still a leaf; parallel and opposite edges count once", async () => {
    const edges: EdgeSpec[] = [["s:h", "r", "s:a"], ["s:h", "q", "s:a"], ["s:a", "r", "s:h"], ["s:b", "r", "s:b"], ["s:h", "r", "s:b"]];
    expect(await sg(["s:h", "s:a", "s:b"], edges, [PF2])).toEqual([["s:a", "s:b"]]);
  });
  it("T08 id-twin leaves {i:7, s:7} fold together in NodeRef/2 order", async () => {
    expect(await sg(["s:h", "i:7", "s:7"], [["s:h", "r", "i:7"], ["s:h", "r", "s:7"]], [PF2])).toEqual([["i:7", "s:7"]]);
  });
  it("T09 two hosts: groups sorted by member list; direction is ignored; undirected works", async () => {
    const edges: EdgeSpec[] = [["s:a", "r", "s:h2"], ["s:b", "r", "s:h2"], ["s:h1", "r", "s:c"], ["s:h1", "r", "s:d"], ["s:h1", "r", "s:h2"]];
    const nodes = ["s:a", "s:b", "s:c", "s:d", "s:h1", "s:h2"];
    expect(await sg(nodes, edges, [PF2])).toEqual([["s:a", "s:b"], ["s:c", "s:d"]]);
    expect(await sg(nodes, edges, [PF2], false)).toEqual([["s:a", "s:b"], ["s:c", "s:d"]]);
  });
  it("two leaves attached to hosts of degree 1 (K2 pairs) never fold", async () => {
    expect(await sg(["s:a", "s:b", "s:c", "s:d"], [["s:a", "r", "s:b"], ["s:c", "r", "s:d"]], [PF2])).toEqual([]);
  });
});

describe("components/1", () => {
  const C = (k: number) => ({ rule: "components/1", min_size: k });
  const nodes = ["s:a", "s:b", "s:c", "s:d", "s:e", "s:f"];
  const edges: EdgeSpec[] = [["s:a", "r", "s:b"], ["s:b", "r", "s:c"], ["s:d", "r", "s:e"]];
  it("T05 weak components, isolated nodes never form groups, min_size boundary", async () => {
    expect(await sg(nodes, edges, [C(2)])).toEqual([["s:a", "s:b", "s:c"], ["s:d", "s:e"]]);
    expect(await sg(nodes, edges, [C(3)])).toEqual([["s:a", "s:b", "s:c"]]);
    expect(await sg(nodes, edges, [C(4)])).toEqual([]);
  });
  it("T12 a connected scene gives one group of everything; the direction of edges does not matter", async () => {
    expect(await sg(["s:a", "s:b", "s:c"], [["s:b", "r", "s:a"], ["s:b", "r", "s:c"]], [C(2)])).toEqual([["s:a", "s:b", "s:c"]]);
    expect(await sg(["s:a", "s:b", "s:c"], [["s:b", "r", "s:a"], ["s:c", "r", "s:b"]], [C(2)], false)).toEqual([["s:a", "s:b", "s:c"]]);
  });
  it("a self-loop alone does not connect anything", async () => {
    expect(await sg(["s:a", "s:b"], [["s:a", "r", "s:a"]], [C(2)])).toEqual([]);
  });
});

describe("unions, order, deduplication", () => {
  it("N08 components union pendant-fold is laminar (a component strictly contains its folded set)", async () => {
    const edges = [...star("s:h", ["s:a", "s:b"]), ["s:x", "r", "s:y"] as EdgeSpec];
    const out = await sg(["s:h", "s:a", "s:b", "s:x", "s:y"], edges, [PF2, { rule: "components/1", min_size: 2 }]);
    expect(out).toEqual([["s:a", "s:b"], ["s:a", "s:b", "s:h"], ["s:x", "s:y"]]); // proper prefix first
  });
  it("T14 equal member lists are deduplicated, whatever the spec order", async () => {
    const nodes = ["s:h", "s:a", "s:b", "s:c"], edges = star("s:h", ["s:a", "s:b", "s:c"]);
    expect(await sg(nodes, edges, [PF2, { rule: "pendant-fold/1", min_leaves: 3 }, PF2])).toEqual([["s:a", "s:b", "s:c"]]);
    const a = await sg(nodes, edges, [PF2, { rule: "components/1", min_size: 2 }]);
    const b = await sg(nodes, edges, [{ rule: "components/1", min_size: 2 }, PF2]);
    expect(a).toEqual(b);
    expect(a).toEqual([["s:a", "s:b", "s:c"], ["s:a", "s:b", "s:c", "s:h"]]);
  });
  it("the catalog is independent of the scene's source order and an empty rule list gives an empty catalog", async () => {
    const w = await world({ nodes: ["s:h", "s:a", "s:b"], edges: star("s:h", ["s:a", "s:b"]) });
    const c = await suggestGroups(w.sceneBytes, []);
    expect(c).toEqual({ scene_sha256: w.sceneSha256, groups: [] });
  });
});

describe("T13/T16 rule specs and the order of checks", () => {
  const w = world({ nodes: ["s:h", "s:a", "s:b"], edges: star("s:h", ["s:a", "s:b"]) });
  const E = async (rules: unknown, options?: unknown, scene?: Uint8Array) => errOf(async () => suggestGroups(scene ?? (await w).sceneBytes, rules as never, options as never));
  it("unknown or unqualified rule ids are UNSUPPORTED_RULE", async () => {
    for (const r of ["kcore/1", "igdm/hulls", "pendant-fold/2", "components", ""]) expect(await E([{ rule: r, min_leaves: 2 }]), r).toBe("UNSUPPORTED_RULE/");
    try { await suggestGroups((await w).sceneBytes, [{ rule: "kcore/1" }] as never); } catch (e) { expect((e as { detail?: string }).detail).toBe("kcore/1"); }
  });
  it("parameter errors are INVALID_RULE_PARAM", async () => {
    const P = "INVALID_POLICY/INVALID_RULE_PARAM";
    for (const spec of [{ rule: "pendant-fold/1" }, { rule: "pendant-fold/1", min_leaves: 1 }, { rule: "pendant-fold/1", min_leaves: 2 ** 31 }, { rule: "pendant-fold/1", min_leaves: 2.5 }, { rule: "pendant-fold/1", min_leaves: "2" },
      { rule: "pendant-fold/1", min_leaves: 2, extra: 1 }, { rule: "pendant-fold/1", min_size: 2 }, { rule: "components/1", min_leaves: 2 }, { rule: "components/1" }, { rule: "components/1", min_size: 1 },
      { min_leaves: 2 }, { rule: 5, min_leaves: 2 }, null, 5, "x"]) expect(await E([spec]), JSON.stringify(spec)).toBe(P);
    expect(await E("nope")).toBe(P);
    expect(await E([{ rule: "pendant-fold/1", min_leaves: 2 ** 31 - 1 }])).toBe("no error");
    expect(await E([{ rule: "pendant-fold/1", min_leaves: 2 }, { rule: "pendant-fold/1", min_leaves: 2 ** 31 - 1 }, { rule: "components/1", min_size: 2 }])).toBe("no error");
  });
  it("UNSUPPORTED_RULE comes before INVALID_RULE_PARAM for one spec; specs are checked in order", async () => {
    expect(await E([{ rule: "kcore/1", min_leaves: -1 }])).toBe("UNSUPPORTED_RULE/");
    expect(await E([{ rule: "pendant-fold/1" }, { rule: "kcore/1" }])).toBe("INVALID_POLICY/INVALID_RULE_PARAM");
    expect(await E([{ rule: "kcore/1" }, { rule: "pendant-fold/1" }])).toBe("UNSUPPORTED_RULE/");
  });
  it("RULE_LIMIT: more than 8 specs, checked before the specs themselves", async () => {
    expect(await E(Array.from({ length: 9 }, () => ({ rule: "pendant-fold/1", min_leaves: 2 })))).toBe("RESOURCE_LIMIT/RULE_LIMIT");
    expect(await E(Array.from({ length: 9 }, () => ({ rule: "nope" })))).toBe("RESOURCE_LIMIT/RULE_LIMIT");
    expect(await E(Array.from({ length: 8 }, () => ({ rule: "pendant-fold/1", min_leaves: 2 })))).toBe("no error");
  });
  it("budget shape first, then the rule list, then the scene", async () => {
    expect(await E([{ rule: "kcore/1" }], { budget: { maxNodes: 0 } })).toBe("INVALID_POLICY/INVALID_BUDGET");
    expect(await E([{ rule: "kcore/1" }], undefined, new Uint8Array([1, 2, 3]))).toBe("UNSUPPORTED_RULE/");
    expect(await E([PF2], undefined, new Uint8Array([1, 2, 3]))).toBe("IgsError:INVALID_SCENE/INVALID_ENCODING".replace("INVALID_ENCODING", "SCHEMA"));
    expect(await E([], undefined, new Uint8Array([1, 2, 3]))).toBe("IgsError:INVALID_SCENE/SCHEMA");
  });
  it("B15 NODE_LIMIT, EDGE_LIMIT and WORK_LIMIT", async () => {
    expect(await E([PF2], { budget: { maxNodes: 2 } })).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(await E([PF2], { budget: { maxNodes: 3 } })).toBe("no error");
    expect(await E([PF2], { budget: { maxEdges: 1 } })).toBe("RESOURCE_LIMIT/EDGE_LIMIT");
    // W = 10*(n+m)*r + r*(n+2m)*ceil(Lkey/64) = 10*5*1 + 1*7*1 = 57
    expect(await E([PF2], { budget: { maxWork: 57 } })).toBe("no error");
    expect(await E([PF2], { budget: { maxWork: 56 } })).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(await E([PF2, PF2], { budget: { maxWork: 113 } })).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(await E([PF2, PF2], { budget: { maxWork: 114 } })).toBe("no error");
  });
  it("a budget never changes the result", async () => {
    const a = await suggestGroups((await w).sceneBytes, [PF2] as never);
    const b = await suggestGroups((await w).sceneBytes, [PF2] as never, { budget: { maxWork: 57, maxNodes: 3, maxEdges: 2 } });
    expect(b).toEqual(a);
  });
  it("audit I-2: own __proto__, constructor and prototype keys are unknown parameters, never read as the rule", async () => {
    const P = "INVALID_POLICY/INVALID_RULE_PARAM";
    const parse = (t: string) => JSON.parse(t) as unknown; // JSON.parse creates an OWN __proto__ property
    expect(await E([parse('{"rule":"components/1","min_size":2,"__proto__":{"x":1}}')])).toBe(P);
    expect(await E([parse('{"__proto__":{"rule":"components/1"},"min_size":2}')])).toBe(P);
    expect(await E([parse('{"__proto__":{"rule":"components/1","min_size":2}}')])).toBe(P);
    expect(await E([{ rule: "components/1", min_size: 2, constructor: 1 }])).toBe(P);
    expect(await E([{ rule: "components/1", min_size: 2, prototype: {} }])).toBe(P);
    expect(await E([{ rule: "pendant-fold/1", min_leaves: 2, toString: 1 }])).toBe(P);
    expect(await E([Object.assign(Object.create({ min_size: 2 }), { rule: "components/1" })])).toBe(P); // an inherited parameter is not read
    expect(await E([Object.create({ rule: "components/1", min_size: 2 })])).toBe(P);
    expect(await E([Object.create(null, { rule: { value: "components/1", enumerable: true }, min_size: { value: 2, enumerable: true } })])).toBe("no error");
    expect(({} as Record<string, unknown>)["x"]).toBeUndefined(); // no pollution
  });
  it("audit I-2: options.budget is read as an own property only; an own __proto__ key is an unknown budget key", async () => {
    const inherited = Object.create({ budget: { maxNodes: 1 } });
    expect(await E([PF2], inherited)).toBe("no error");
    expect(await E([PF2], JSON.parse('{"budget":{"maxNodes":9,"__proto__":{}}}'))).toBe("INVALID_POLICY/INVALID_BUDGET");
  });
  it("snapshots the rules and the bytes before the first await", async () => {
    const bytes = new Uint8Array((await w).sceneBytes);
    const rules = [{ rule: "pendant-fold/1", min_leaves: 2 }];
    const p = suggestGroups(bytes, rules as never);
    bytes.fill(0); rules[0]!.min_leaves = 99;
    expect((await p).groups.length).toBe(1);
  });
  it("a rule may not be supplied a group via inherited props", async () => {
    const spec = Object.create({ rule: "pendant-fold/1", min_leaves: 2 });
    expect(await E([spec])).toBe("INVALID_POLICY/INVALID_RULE_PARAM");
  });
});

describe("B17 and the defensive checks (mocked rule output)", () => {
  it("GROUP_LIMIT: 20,001 pendant groups need 60,003 nodes and a raised maxNodes", async () => {
    const nodes: string[] = [], edges: EdgeSpec[] = [];
    for (let i = 0; i < 20_001; i++) { nodes.push(`i:${3 * i}`, `i:${3 * i + 1}`, `i:${3 * i + 2}`); edges.push([`i:${3 * i}`, "r", `i:${3 * i + 1}`], [`i:${3 * i}`, "r", `i:${3 * i + 2}`]); }
    const sceneBytes = mkScene({ nodes, edges });
    expect(await errOf(() => suggestGroups(sceneBytes, [PF2] as never))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(await errOf(() => suggestGroups(sceneBytes, [PF2] as never, { budget: { maxNodes: 100_000 } }))).toBe("RESOURCE_LIMIT/GROUP_LIMIT");
    // 20,000 groups fit
    const ok = mkScene({ nodes: nodes.slice(0, 60_000), edges: edges.slice(0, 40_000) });
    expect((await suggestGroups(ok, [PF2] as never, { budget: { maxNodes: 100_000 } })).groups.length).toBe(20_000);
  }, 120_000);
  const nodeRefs = (n: number) => Array.from({ length: n }, (_, i) => ref(`i:${i}`));
  it("MEMBER_LIMIT: more than 500,000 entries through nesting", () => {
    const n = 31_258;
    const chain = Array.from({ length: 16 }, (_, k) => Array.from({ length: n - k }, (_, i) => i)); // 16 nested groups
    expect(chain.reduce((s, g) => s + g.length, 0)).toBeGreaterThan(500_000);
    expect(() => assembleCatalog("0".repeat(64), nodeRefs(n), [chain])).toThrow(/MEMBER_LIMIT/);
  });
  it("DEPTH_LIMIT: nesting deeper than 16", () => {
    const chain = Array.from({ length: 17 }, (_, k) => Array.from({ length: 20 - k }, (_, i) => i));
    expect(() => assembleCatalog("0".repeat(64), nodeRefs(20), [chain])).toThrow(/DEPTH_LIMIT/);
    expect(assembleCatalog("0".repeat(64), nodeRefs(20), [chain.slice(0, 16)]).groups.length).toBe(16);
  });
  it("a rule-union overlap is OVERLAPPING_GROUPS, never a silent drop", () => {
    expect(() => assembleCatalog("0".repeat(64), nodeRefs(5), [[[0, 1]], [[1, 2]]])).toThrow(/OVERLAPPING_GROUPS/);
  });
  it("sorts, deduplicates equal lists and copies wire references", () => {
    const c = assembleCatalog("0".repeat(64), nodeRefs(5), [[[3, 4], [0, 1]], [[0, 1]]]);
    expect(c.groups).toEqual([{ members: [ref("i:0"), ref("i:1")] }, { members: [ref("i:3"), ref("i:4")] }]);
  });
});
