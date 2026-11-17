import { compileScene, verifyScene } from "isongraph-visualize-scene-core";
import { ISONGraph } from "ison-graph-ts";
import { describe, expect, it } from "vitest";
import { LayoutError } from "../src/errors.js";
import { buildCoreGraph, physicalEdgeCount, verifyCoreGraph } from "../src/force.js";
import { enc } from "./helpers.js";

const sceneOf = async (src: string) => (await verifyScene((await compileScene(enc(src), "ison-v1")).sceneBytes)).scene;
const mismatch = (f: () => void): string => { try { f(); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason}`; throw e; } return "ok"; };
const UND = "meta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n2\n3\n\nedges.R\nsource target\n:p:1 :p:2\n:p:2 :p:1\n:p:3 :p:3\n";
const und3 = () => { const g = new ISONGraph("g", false); for (const id of [1, 2, 3]) g.addNode("p", id, {}); return g; };

describe("the pinned Core stores an undirected edge as two physical entries (why a raw edgeCount comparison is wrong)", () => {
  it("one undirected addEdge is two entries, a self-loop one, and an explicit mirror add is refused", () => {
    const g = und3();
    g.addEdge("R", ["p", 1], ["p", 2], {});
    expect(g.edgeCount()).toBe(2);
    expect([...g.edges()].map((e) => [e.source[1], e.target[1]])).toEqual([[1, 2], [2, 1]]);
    g.addEdge("R", ["p", 3], ["p", 3], {});
    expect(g.edgeCount()).toBe(3);
    expect(() => g.addEdge("R", ["p", 2], ["p", 1], {})).toThrow(/already exists/);
  });
  it("constructing with an options object does NOT make a graph undirected (it is a truthy non-boolean)", () => {
    expect(new ISONGraph("g", false).directed).toBe(false);
    expect(typeof (new ISONGraph("g", { directed: false } as never)).directed).toBe("object");
  });
});

describe("verifyCoreGraph: logical-edge equivalence against the pinned Core", () => {
  it("O4-style: an undirected source with BOTH mirror rows and a self-loop is 2 logical edges, 3 physical entries, and matches", async () => {
    const scene = await sceneOf(UND);
    expect(scene.edges).toHaveLength(2);
    const g = buildCoreGraph(scene);
    expect(g.edgeCount()).toBe(3); // the raw-count assertion this check replaces would have compared 3 with 2
    expect(physicalEdgeCount(scene)).toBe(4); // conservative: self-loops counted twice
    expect(mismatch(() => verifyCoreGraph(scene, g))).toBe("ok");
  });
  it("an undirected edge added in the reverse orientation is still the same logical edge", async () => {
    const scene = await sceneOf(UND);
    const g = und3(); g.addEdge("R", ["p", 2], ["p", 1], {}); g.addEdge("R", ["p", 3], ["p", 3], {});
    expect(mismatch(() => verifyCoreGraph(scene, g))).toBe("ok");
  });
  it("an undirected graph missing the self-loop, or missing the pair, is a mismatch", async () => {
    const scene = await sceneOf(UND);
    const noLoop = und3(); noLoop.addEdge("R", ["p", 1], ["p", 2], {});
    expect(mismatch(() => verifyCoreGraph(scene, noLoop))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
    const noPair = und3(); noPair.addEdge("R", ["p", 3], ["p", 3], {});
    expect(mismatch(() => verifyCoreGraph(scene, noPair))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
  });
  it("an undirected graph with a different pair or relation is a mismatch", async () => {
    const scene = await sceneOf(UND);
    const wrongPair = und3(); wrongPair.addEdge("R", ["p", 1], ["p", 3], {}); wrongPair.addEdge("R", ["p", 3], ["p", 3], {});
    expect(mismatch(() => verifyCoreGraph(scene, wrongPair))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
    const wrongRel = und3(); wrongRel.addEdge("X", ["p", 1], ["p", 2], {}); wrongRel.addEdge("R", ["p", 3], ["p", 3], {});
    expect(mismatch(() => verifyCoreGraph(scene, wrongRel))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
  });
  it("directed: a->b and b->a are two edges and match", async () => {
    const scene = await sceneOf("nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n:p:2 :p:1\n");
    expect(physicalEdgeCount(scene)).toBe(2);
    expect(mismatch(() => verifyCoreGraph(scene, buildCoreGraph(scene)))).toBe("ok");
  });
  it("directed: a reversed edge is a different logical edge", async () => {
    const scene = await sceneOf("nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n");
    const g = new ISONGraph("g", true);
    g.addNode("p", 1, {}); g.addNode("p", 2, {}); g.addEdge("R", ["p", 2], ["p", 1], {});
    expect(mismatch(() => verifyCoreGraph(scene, g))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
  });
  it("two relations over one pair are two edges; a missing one is a mismatch", async () => {
    const scene = await sceneOf("nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n\nedges.S\nsource target\n:p:1 :p:2\n");
    expect(mismatch(() => verifyCoreGraph(scene, buildCoreGraph(scene)))).toBe("ok");
    const g = new ISONGraph("g", true);
    g.addNode("p", 1, {}); g.addNode("p", 2, {}); g.addEdge("R", ["p", 1], ["p", 2], {});
    expect(mismatch(() => verifyCoreGraph(scene, g))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
  });
  it("an extra edge and a different directedness are mismatches", async () => {
    const scene = await sceneOf("nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n");
    const extra = buildCoreGraph(scene); extra.addEdge("R", ["p", 2], ["p", 1], {});
    expect(mismatch(() => verifyCoreGraph(scene, extra))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
    const und = new ISONGraph("g", false);
    und.addNode("p", 1, {}); und.addNode("p", 2, {}); und.addEdge("R", ["p", 1], ["p", 2], {});
    expect(mismatch(() => verifyCoreGraph(scene, und))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
  });
  it("a missing or extra node is a mismatch", async () => {
    const scene = await sceneOf("nodes.p\nid\n1\n2\n");
    const g = new ISONGraph("g", true); g.addNode("p", 1, {});
    expect(mismatch(() => verifyCoreGraph(scene, g))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
    const h = buildCoreGraph(scene); h.addNode("p", 3, {});
    expect(mismatch(() => verifyCoreGraph(scene, h))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
  });
  it("string ids that look like integers keep their identity (s:7 is not i:7)", async () => {
    const scene = await sceneOf("nodes.p\nid\n\"7\"\nx\n\nedges.R\nsource target\n:p:7 :p:x\n");
    expect(scene.nodes.map((n) => n.ref.id)).toContain("s:7");
    expect(mismatch(() => verifyCoreGraph(scene, buildCoreGraph(scene)))).toBe("ok");
    const wrong = new ISONGraph("g", true);
    wrong.addNode("p", 7, {}); wrong.addNode("p", "x", {}); wrong.addEdge("R", ["p", 7], ["p", "x"], {});
    expect(mismatch(() => verifyCoreGraph(scene, wrong))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
  });
  it("an empty scene matches an empty graph", async () => {
    const scene = await sceneOf("");
    expect(mismatch(() => verifyCoreGraph(scene, buildCoreGraph(scene)))).toBe("ok");
  });
});
