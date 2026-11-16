// test/force.test.ts
import { compileScene } from "isongraph-visualize-scene-core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ison-graph-ts/viz", async (importOriginal) => {
  const real = await importOriginal<typeof import("ison-graph-ts/viz")>();
  return { ...real, computeLayout: vi.fn(real.computeLayout) };
});
import { computeLayout as coreSpy } from "ison-graph-ts/viz";
import { bindLayout } from "../src/bind.js";
import { LayoutError } from "../src/errors.js";
import { join } from "node:path";
import { buildCoreGraph, computeForceLayout, verifyCoreGraph } from "../src/force.js";
import { quantize } from "../src/quantize.js";
import { verifyLayout } from "../src/verify.js";
import { ISONGraph } from "ison-graph-ts";
import { CORE_CFG, ORACLES, enc, layoutError, o1Scene, read } from "./helpers.js";

const compile = (src: string) => compileScene(enc(src), "ison-v1");
const handScene = (nodes: Array<[string, string]>, edges: Array<[string, string, string, string, string]> = []) => enc(JSON.stringify({
  address_scheme: "igs-addr/1", edges: edges.map(([rel, st, si, tt, ti]) => ({ label: rel, ref: { ord: "0", rel, src: { id: si, type: st }, tgt: { id: ti, type: tt } } })),
  graph: { directed: true, profile: "simple" }, igs: "IGS/1",
  nodes: nodes.map(([type, id]) => ({ category: type, label: id.slice(2), ref: { id, type } })),
  source: { artifact_sha256: "0".repeat(64), serialization_profile: "ison-v1" },
}));
afterEach(() => vi.mocked(coreSpy).mockClear());

describe("computeForceLayout reproduces Core and the recorded examples", () => {
  it("O1 with Core's defaults: the 398-byte example of the design, digest 2f37ccf2…", async () => {
    const o1 = await o1Scene();
    const r = await computeForceLayout(o1.sceneBytes, CORE_CFG);
    expect(r.layoutBytes.length).toBe(398);
    expect(r.layoutSha256).toBe("2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db");
    expect(r.layout.nodes.map((n) => [n.ref.id, n.x, n.y])).toEqual([["i:1", 173961, 81203], ["s:ann", 593147, 187923]]);
  });
  it("Core's 5-node Python-parity graph quantizes to the Python fixture values", async () => {
    const s = await compile("nodes.person\nid name age\nalice Alice 30\nbob Bob 25\ncarol Carol 35\n\nnodes.company\nid name\nacme Acme\n\nnodes.project\nid name\np1 Alpha\n\nedges.KNOWS\nsource target\n:person:alice :person:bob\n:person:bob :person:carol\n\nedges.WORKS_AT\nsource target\n:person:alice :company:acme\n\nedges.WORKS_ON\nsource target\n:person:carol :project:p1\n");
    const r = await computeForceLayout(s.sceneBytes, CORE_CFG);
    const at = (id: string, type: string) => r.layout.nodes.find((n) => n.ref.id === id && n.ref.type === type)!;
    // PYTHON_PARITY_FIXTURE of ison-graph-ts/src/viz.test.ts, quantized by rule 2
    expect([at("s:acme", "company").x, at("s:acme", "company").y]).toEqual([60000, 60000]);
    expect([at("s:alice", "person").x, at("s:alice", "person").y]).toEqual([293328, 60000]);
    expect([at("s:bob", "person").x, at("s:bob", "person").y]).toEqual([377328, 354586]);
    expect([at("s:carol", "person").x, at("s:carol", "person").y]).toEqual([601380, 540000]);
    expect([at("s:p1", "project").x, at("s:p1", "project").y]).toEqual([840000, 540000]);
  });
  it("empty scene -> empty nodes; single node centred (450000, 300000)", async () => {
    const e = await compile("");
    expect((await computeForceLayout(e.sceneBytes, CORE_CFG)).layout.nodes).toEqual([]);
    const one = await compile("nodes.p\nid\n1\n");
    expect((await computeForceLayout(one.sceneBytes, CORE_CFG)).layout.nodes.map((n) => [n.x, n.y])).toEqual([[450000, 300000]]);
  });
  it("two seeds give different layouts; iterations 0 gives the initial scatter", async () => {
    const o1 = await o1Scene();
    const a = await computeForceLayout(o1.sceneBytes, CORE_CFG);
    const b = await computeForceLayout(o1.sceneBytes, { ...CORE_CFG, seed: 7 });
    const z = await computeForceLayout(o1.sceneBytes, { ...CORE_CFG, iterations: 0 });
    expect(a.layoutSha256).not.toBe(b.layoutSha256);
    expect(z.layoutSha256).not.toBe(a.layoutSha256);
  });
  it("is deterministic and independent of the order scene nodes were declared in the source", async () => {
    const x = await compile("nodes.p\nid\n2\n10\n1\n9\n\nedges.R\nsource target\n:p:1 :p:2\n:p:9 :p:10\n");
    const y = await compile("nodes.p\nid\n9\n1\n10\n2\n\nedges.R\nsource target\n:p:9 :p:10\n:p:1 :p:2\n");
    const a = await computeForceLayout(x.sceneBytes, CORE_CFG), b = await computeForceLayout(y.sceneBytes, CORE_CFG);
    expect(a.layout.nodes).toEqual(b.layout.nodes);
  });
  it("processes ids in UTF-16 order exactly as Core does: integers 1,2,9,10 are drawn in the order 1,10,2,9", async () => {
    const s = await compile("nodes.p\nid\n1\n2\n9\n10\n");
    const r = await computeForceLayout(s.sceneBytes, { ...CORE_CFG, iterations: 0 });
    const g = new ISONGraph("g");
    for (const id of [2, 10, 1, 9]) g.addNode("p", id, {});
    const direct = coreSpy(g, { ...CORE_CFG, iterations: 0 }); // Core called directly: the oracle for the order
    expect([...direct.keys()]).toEqual(["p 1", "p 10", "p 2", "p 9"]);
    for (const n of r.layout.nodes) {
      const p = direct.get(`p ${n.ref.id.slice(2)}`)!;
      expect([n.x, n.y]).toEqual([quantize(p[0]), quantize(p[1])]);
    }
  });
  it("O4 (an undirected scene whose source has BOTH mirror rows) lays out, and its Core graph matches by logical edge", async () => {
    const { verifyScene } = await import("isongraph-visualize-scene-core");
    const o4 = read(join(ORACLES, "o4-undirected.source.ison"));
    const s = await compileScene(o4, "ison-v1");
    expect(s.scene.graph.directed).toBe(false);
    await expect(computeForceLayout(s.sceneBytes, CORE_CFG)).resolves.toBeDefined();
    const { scene } = await verifyScene(s.sceneBytes);
    expect(() => verifyCoreGraph(scene, buildCoreGraph(scene))).not.toThrow();
  });
  it("self-loops and both directions are laid out (Core accepts them)", async () => {
    const s = await compile("nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:1\n:p:1 :p:2\n:p:2 :p:1\n");
    await expect(computeForceLayout(s.sceneBytes, CORE_CFG)).resolves.toBeDefined();
  });
  it("undirected scenes are laid out", async () => {
    const s = await compile("meta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n:p:2 :p:1\n");
    await expect(computeForceLayout(s.sceneBytes, CORE_CFG)).resolves.toBeDefined();
  });
  it("the result verifies, binds and is reproducible", async () => {
    const { verifyReproducible } = await import("../src/compute.js");
    const o1 = await o1Scene();
    const r = await computeForceLayout(o1.sceneBytes, CORE_CFG);
    await expect(verifyLayout(r.layoutBytes)).resolves.toBeDefined();
    await expect(bindLayout(o1.sceneBytes, r.layoutBytes)).resolves.toBeDefined();
    await expect(verifyReproducible(o1.sceneBytes, r.layoutBytes)).resolves.toBe("reproduced");
  });
  it("the output has no x- keys (strict producer output) and no budget field", async () => {
    const o1 = await o1Scene();
    const text = new TextDecoder().decode((await computeForceLayout(o1.sceneBytes, CORE_CFG)).layoutBytes);
    expect(text).not.toMatch(/"x-/);
    expect(text).not.toMatch(/budget|maxWork|maxNodes/);
  });
});

describe("computeForceLayout refuses without calling Core (Review Focus 2 and 3)", () => {
  it("each preflight refusal leaves Core uncalled and raises UNSUPPORTED_SCENE", async () => {
    const cases: Array<[Array<[string, string]>, string]> = [
      [[["p", "i:7"], ["p", "s:7"]], "UNSUPPORTED_SCENE/AMBIGUOUS_ORDER_KEY"],
      [[["p", "i:7"], ["p", "s:007"]], "UNSUPPORTED_SCENE/CORE_ID_TWIN"],
      [[["p", "i:0"], ["p", "s:-0"]], "UNSUPPORTED_SCENE/CORE_ID_TWIN"],
      [[["p", "i:-7"], ["p", "s:-007"]], "UNSUPPORTED_SCENE/CORE_ID_TWIN"],
      [[["p", "i:9007199254740993"]], "UNSUPPORTED_SCENE/UNSAFE_NODE_ID"],
      [[["p", "s:a b"]], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"],
      [[["p", "s:"]], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"],
    ];
    for (const [nodes, expected] of cases) {
      expect(await layoutError(() => computeForceLayout(handScene(nodes), CORE_CFG)), JSON.stringify(nodes)).toBe(expected);
    }
    expect(vi.mocked(coreSpy)).not.toHaveBeenCalled();
  });
  it("the controls that Core can handle DO lay out", async () => {
    for (const nodes of [[["p", "s:7"], ["q", "s:7"]], [["p", "s:007"], ["p", "s:7"]], [["p", "s:-0"], ["p", "s:0"]], [["p", "s:\uFF5E"], ["p", "s:\u{1F600}"]]] as Array<Array<[string, string]>>) {
      await expect(computeForceLayout(handScene(nodes), CORE_CFG), JSON.stringify(nodes)).resolves.toBeDefined();
    }
  });
  it("the work budget refuses before Core runs", async () => {
    const o1 = await o1Scene();
    expect(await layoutError(() => computeForceLayout(o1.sceneBytes, { ...CORE_CFG, iterations: 2 ** 31 - 1 }, { budget: { maxWork: 1000 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(await layoutError(() => computeForceLayout(o1.sceneBytes, CORE_CFG, { budget: { maxNodes: 1 } }))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(vi.mocked(coreSpy)).not.toHaveBeenCalled();
  });
  it("an invalid config is rejected before the scene is even verified or Core is called", async () => {
    const o1 = await o1Scene();
    for (const bad of [{ ...CORE_CFG, width: Number.NaN }, { ...CORE_CFG, seed: -1 }, { ...CORE_CFG, width: 100 }]) {
      expect((await layoutError(() => computeForceLayout(o1.sceneBytes, bad))).startsWith("INVALID_POLICY/")).toBe(true);
    }
    expect(vi.mocked(coreSpy)).not.toHaveBeenCalled();
  });
  it("exactly at the work limit it runs, one below it refuses", async () => {
    const o1 = await o1Scene();
    const { forceWork } = await import("../src/force.js");
    const w = Number(forceWork(2, 1, 170));
    await expect(computeForceLayout(o1.sceneBytes, CORE_CFG, { budget: { maxWork: w } })).resolves.toBeDefined();
    expect(await layoutError(() => computeForceLayout(o1.sceneBytes, CORE_CFG, { budget: { maxWork: w - 1 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
  });
  it("edge-heavy, zero-iteration input is refused before Core runs (construction is not free)", async () => {
    const o1 = await o1Scene(); // 2 nodes, 1 edge: construction work = 200 x 3 = 600
    const zero = { ...CORE_CFG, iterations: 0 };
    expect(await layoutError(() => computeForceLayout(o1.sceneBytes, zero, { budget: { maxWork: 599 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(vi.mocked(coreSpy)).not.toHaveBeenCalled();
    await expect(computeForceLayout(o1.sceneBytes, zero, { budget: { maxWork: 600 } })).resolves.toBeDefined();
  });
  it("an UNDIRECTED scene pays for both stored orientations: O4 (2 nodes, a mirrored pair + a self-loop = 2 logical edges, counted as 4 physical) costs 200 x (2 + 4) = 1200 at zero iterations", async () => {
    const o4 = await compileScene(read(join(ORACLES, "o4-undirected.source.ison")), "ison-v1");
    const zero = { ...CORE_CFG, iterations: 0 };
    expect(await layoutError(() => computeForceLayout(o4.sceneBytes, zero, { budget: { maxWork: 1199 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(vi.mocked(coreSpy)).not.toHaveBeenCalled();
    await expect(computeForceLayout(o4.sceneBytes, zero, { budget: { maxWork: 1200 } })).resolves.toBeDefined();
  });
  it("a Core rebuild that silently drops an edge is caught at the call site (logical-edge equivalence), and Core's layout is never run", async () => {
    const o1 = await o1Scene();
    const spy = vi.spyOn(ISONGraph.prototype, "addEdge").mockImplementationOnce(() => undefined as never);
    expect(await layoutError(() => computeForceLayout(o1.sceneBytes, CORE_CFG))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
    expect(vi.mocked(coreSpy)).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("the budget never changes the output", async () => {
    const o1 = await o1Scene();
    const a = await computeForceLayout(o1.sceneBytes, CORE_CFG);
    const b = await computeForceLayout(o1.sceneBytes, CORE_CFG, { budget: { maxNodes: 100000, maxWork: 1e12 } });
    expect(Buffer.from(a.layoutBytes).equals(Buffer.from(b.layoutBytes))).toBe(true);
  });
  it("OWNERSHIP (discriminating): mutating the config after the call starts changes nothing", async () => {
    const o1 = await o1Scene();
    const cfg = { ...CORE_CFG };
    const expected = (await computeForceLayout(o1.sceneBytes, { ...CORE_CFG })).layoutSha256;
    const pending = computeForceLayout(o1.sceneBytes, cfg);
    cfg.seed = 1; cfg.width = 1;
    expect((await pending).layoutSha256).toBe(expected);
  });
  it("invalid scene bytes raise V1a's IgsError; a TypeError for non-bytes", async () => {
    await expect(computeForceLayout(enc("{}"), CORE_CFG)).rejects.toMatchObject({ name: "IgsError" });
    await expect(computeForceLayout("x" as never, CORE_CFG)).rejects.toBeInstanceOf(TypeError);
  });
  it("a Core exception can never escape raw (defence in depth, forced with a mock)", async () => {
    vi.mocked(coreSpy).mockImplementationOnce(() => { throw new RangeError("boom"); });
    const o1 = await o1Scene();
    expect(await layoutError(() => computeForceLayout(o1.sceneBytes, CORE_CFG))).toBe("UNSUPPORTED_SCENE/CORE_REJECTED");
    vi.mocked(coreSpy).mockImplementationOnce(() => new Map());
    expect(await layoutError(() => computeForceLayout(o1.sceneBytes, CORE_CFG))).toBe("UNSUPPORTED_SCENE/CORE_RESULT_MISMATCH");
    vi.mocked(coreSpy).mockImplementationOnce(() => new Map([["person 1", [Number.NaN, 1]], ["person ann", [1, 1]]]) as never);
    expect(await layoutError(() => computeForceLayout(o1.sceneBytes, CORE_CFG))).toBe("INVALID_COORDINATE/NOT_FINITE");
  });
  it("Core is called with only the validated options, never radii or spacing", async () => {
    const o1 = await o1Scene();
    await computeForceLayout(o1.sceneBytes, CORE_CFG);
    const opts = vi.mocked(coreSpy).mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(opts).sort()).toEqual(["height", "iterations", "margin", "seed", "width"]);
  });
});
