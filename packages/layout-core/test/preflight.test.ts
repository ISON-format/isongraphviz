import { describe, expect, it } from "vitest";
import type { Scene } from "isongraph-visualize-scene-core";
import { MAX_PHYSICAL_EDGES_PER_RELATION, preflightForce, preflightForceEdges } from "../src/force.js";
import { LayoutError } from "../src/errors.js";

const N = (id: string, type = "p") => ({ category: type, label: id.slice(2), ref: { id, type } });
const verdict = (...nodes: ReturnType<typeof N>[]): string => { try { preflightForce(nodes); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason}`; throw e; } return "ok"; };

describe("preflightForce refuses every Core representation limit (docs/specs/IGL-1.md §7.1)", () => {
  const refuse: Array<[string, ReturnType<typeof N>[], string]> = [
    ["S01 i:7 + s:7 share a Core layout key", [N("i:7"), N("s:7")], "UNSUPPORTED_SCENE/AMBIGUOUS_ORDER_KEY"],
    ["S01b same pair, other row order", [N("s:7"), N("i:7")], "UNSUPPORTED_SCENE/AMBIGUOUS_ORDER_KEY"],
    ["S02 i:7 + s:007 (Core id twin)", [N("i:7"), N("s:007")], "UNSUPPORTED_SCENE/CORE_ID_TWIN"],
    ["S02b same pair, other row order (Core accepts this order; we do not)", [N("s:007"), N("i:7")], "UNSUPPORTED_SCENE/CORE_ID_TWIN"],
    ["S03 i:0 + s:-0", [N("i:0"), N("s:-0")], "UNSUPPORTED_SCENE/CORE_ID_TWIN"],
    ["S04 i:-7 + s:-007", [N("i:-7"), N("s:-007")], "UNSUPPORTED_SCENE/CORE_ID_TWIN"],
    ["S05 integer beyond 2^53-1", [N("i:9007199254740993")], "UNSUPPORTED_SCENE/UNSAFE_NODE_ID"],
    ["S06 INT64 minimum", [N("i:-9223372036854775808")], "UNSUPPORTED_SCENE/UNSAFE_NODE_ID"],
    ["S06b negative safe boundary + 1", [N("i:-9007199254740992")], "UNSUPPORTED_SCENE/UNSAFE_NODE_ID"],
    ["S07 string id with a space", [N("s:a b")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"],
    ["S08 string id with a colon", [N("s:a:b")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"],
    ["S09 empty string id", [N("s:")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"],
    ["string id with a pipe", [N("s:a|b")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"],
    ["string id with a tab", [N("s:a\tb")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"],
  ];
  for (const [name, nodes, expected] of refuse) it(`refuses ${name}`, () => expect(verdict(...nodes)).toBe(expected));

  const accept: Array<[string, ReturnType<typeof N>[]]> = [
    ["S10 s:7 in type p and s:7 in type q (different keys)", [N("s:7", "p"), N("s:7", "q")]],
    ["S11 s:007 + s:7 (two strings; Core handles them)", [N("s:007"), N("s:7")]],
    ["S12 s:-0 + s:0 (two strings)", [N("s:-0"), N("s:0")]],
    ["S13 the Unicode pair", [N("s:\uFF5E"), N("s:\u{1F600}")]],
    ["safe integer boundaries", [N("i:9007199254740991"), N("i:-9007199254740991")]],
    ["i:7 in type p and s:007 in type q (twin is per type)", [N("i:7", "p"), N("s:007", "q")]],
  ];
  for (const [name, nodes] of accept) it(`accepts ${name}`, () => expect(verdict(...nodes)).toBe("ok"));

  it("the empty node set is acceptable", () => expect(verdict()).toBe("ok"));
});

// Core's graph.edges() overflows the call stack at ~125k physical edges in ONE relation (docs/specs/IGL-1.md §7.1),
// and the threshold depends on the host's stack size. The preflight refuses far below it, so the verdict is the same on every host.
describe("preflightForceEdges: a cap on physical edges per relation, below Core's stack-overflow threshold", () => {
  const sceneWith = (rels: Record<string, number>, directed = true): Scene =>
    ({ graph: { directed }, nodes: [], edges: Object.entries(rels).flatMap(([rel, k]) => Array.from({ length: k }, () => ({ label: rel, ref: { rel } }))) }) as unknown as Scene;
  const edgeVerdict = (s: Scene): string => { try { preflightForceEdges(s); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason}`; throw e; } return "ok"; };

  it("the cap is 50,000, about 40% of the measured overflow threshold on the default stack", () => expect(MAX_PHYSICAL_EDGES_PER_RELATION).toBe(50_000));
  it("a directed relation at the cap is accepted, one above it is refused", () => {
    expect(edgeVerdict(sceneWith({ R: 50_000 }))).toBe("ok");
    expect(edgeVerdict(sceneWith({ R: 50_001 }))).toBe("UNSUPPORTED_SCENE/CORE_EDGE_LIMIT");
  });
  it("the cap is per relation: two relations of 50,000 are accepted", () => {
    expect(edgeVerdict(sceneWith({ R: 50_000, S: 50_000 }))).toBe("ok");
    expect(edgeVerdict(sceneWith({ R: 50_000, S: 50_001 }))).toBe("UNSUPPORTED_SCENE/CORE_EDGE_LIMIT");
  });
  it("an undirected scene stores two physical entries per edge, so its cap is 25,000 logical edges", () => {
    expect(edgeVerdict(sceneWith({ R: 25_000 }, false))).toBe("ok");
    expect(edgeVerdict(sceneWith({ R: 25_001 }, false))).toBe("UNSUPPORTED_SCENE/CORE_EDGE_LIMIT");
  });
  it("no edges and small relations are accepted", () => {
    expect(edgeVerdict(sceneWith({}))).toBe("ok");
    expect(edgeVerdict(sceneWith({ R: 1 }))).toBe("ok");
  });
});
