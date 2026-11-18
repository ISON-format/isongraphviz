// RenderModel, address index, lookupElement, modelBytes (design section 2; vectors M*).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IgsError, resolveInScene, verifyScene } from "isongraph-visualize-scene-core";
import { LayoutError, computeFixedLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel, elementKey, modelSceneBytes, isRenderModel, lookupElement, modelBytes, resolveSelection, selectionReference } from "../src/model.js";
import { DEFAULT_RENDER_LIMITS } from "../src/types.js";
import { IgrError } from "../src/errors.js";
import { ARTIFACT_O1, LAYOUT_F01, ORACLES, ORACLES_IGL, SCENE_O1, dec, enc, errOfAsync, igl, o1Scene, o4Scene, read } from "./helpers.js";

const F01 = (): Uint8Array => igl("layouts/F01.layout.json");
const model = async (scene: Uint8Array, layout: Uint8Array, limits = {}) => buildRenderModel(scene, layout, { limits });
const mixed20 = () => igl("scenes/mixed20.scene.json");
const F04 = () => igl("layouts/F04.layout.json");

const A1 = '{"artifact_sha256":"1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a","bounds":{"max_x":593147,"max_y":187923,"min_x":173961,"min_y":81203},"categories":["person"],"directed":true,"edges":[{"label":"KNOWS","ref":{"ord":"0","rel":"KNOWS","src":{"id":"i:1","type":"person"},"tgt":{"id":"s:ann","type":"person"}},"src":0,"tgt":1}],"igr_model":"igr-model/1","layout_sha256":"2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db","nodes":[{"category":"person","degree":1,"label":"1","ref":{"id":"i:1","type":"person"},"x":173961,"y":81203},{"category":"person","degree":1,"label":"ann","ref":{"id":"s:ann","type":"person"},"x":593147,"y":187923}],"scale":1000,"scene_sha256":"e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc"}';

describe("M01: Appendix A.1 modelBytes", () => {
  it("reproduces the worked example byte for byte", async () => {
    const m = await model(o1Scene(), F01());
    expect(dec(modelBytes(m))).toBe(A1);
    expect(m.sceneSha256).toBe(SCENE_O1);
    expect(m.layoutSha256).toBe(LAYOUT_F01);
    expect(m.artifactSha256).toBe(ARTIFACT_O1);
    expect(m.igr_model).toBe("igr-model/1");
    expect(m.scale).toBe(1000);
  });
  it("model fields: index, degree, categories, bounds", async () => {
    const m = await model(o1Scene(), F01());
    expect(m.nodes.map((n) => [n.index, n.degree, n.category, n.label])).toEqual([[0, 1, "person", "1"], [1, 1, "person", "ann"]]);
    expect(m.edges[0]).toMatchObject({ index: 0, label: "KNOWS", src: 0, tgt: 1 });
    expect(m.categories).toEqual(["person"]);
    expect(m.bounds).toEqual({ min_x: 173961, min_y: 81203, max_x: 593147, max_y: 187923 });
  });
  it("is deterministic across two builds", async () => {
    expect(modelBytes(await model(o1Scene(), F01()))).toEqual(modelBytes(await model(o1Scene(), F01())));
  });
});

describe("M02-M06 shapes", () => {
  it("M02: undirected scene with self-loop counts a self-loop once in degree and keeps edge order", async () => {
    const m = await model(o4Scene(), igl("layouts/F02.layout.json"));
    expect(m.directed).toBe(false);
    const loop = m.edges.find((e) => e.src === e.tgt);
    expect(loop).toBeDefined();
    const n = m.nodes[loop!.src]!;
    const incident = m.edges.filter((e) => e.src === n.index || e.tgt === n.index).length;
    expect(n.degree).toBe(incident); // a self-loop is one incident edge, not two
    expect(m.edges.map((e) => e.index)).toEqual(m.edges.map((_, i) => i));
  });
  it("M03: the empty scene has no bounds key at all and no categories", async () => {
    const m = await model(igl("scenes/empty.scene.json"), igl("layouts/F07.layout.json"));
    expect(m.nodes).toHaveLength(0);
    expect("bounds" in m).toBe(false);
    expect(m.categories).toEqual([]);
    expect(dec(modelBytes(m))).not.toContain("bounds");
  });
  it("M04: a single node", async () => {
    const m = await model(igl("scenes/single.scene.json"), igl("layouts/F08.layout.json"));
    expect(m.nodes).toHaveLength(1);
    expect(m.bounds!.min_x).toBe(m.bounds!.max_x);
  });
  it("M05: unicode labels are verbatim and categories sort by UTF-8 bytes", async () => {
    const m = await model(igl("scenes/unicode.scene.json"), igl("layouts/F09.layout.json"));
    const sorted = [...m.categories].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    expect([...m.categories]).toEqual(sorted);
    expect(new Set(m.categories).size).toBe(m.categories.length);
  });
  it("M06: mixed20 has 20 nodes and 37 edges in scene order", async () => {
    const m = await model(mixed20(), F04());
    expect([m.nodes.length, m.edges.length]).toEqual([20, 37]);
    const scene = (await verifyScene(mixed20())).scene;
    expect(m.nodes.map((n) => n.ref)).toEqual(scene.nodes.map((n) => n.ref));
    expect(m.edges.map((e) => e.ref)).toEqual(scene.edges.map((e) => e.ref));
    for (const e of m.edges) {
      expect(m.nodes[e.src]!.ref).toEqual(e.ref.src);
      expect(m.nodes[e.tgt]!.ref).toEqual(e.ref.tgt);
    }
  });
  it("M07: negative and fractional-origin layouts keep thousandths unchanged", async () => {
    const m = await model(o1Scene(), igl("layouts/X01.layout.json"));
    const lay = JSON.parse(dec(igl("layouts/X01.layout.json"))) as { nodes: { x: number; y: number }[] };
    expect(m.nodes.map((n) => [n.x, n.y])).toEqual(lay.nodes.map((n) => [n.x, n.y]));
  });
  it("M08/M09: 1,022-unit labels and a 5,000 character id are accepted", async () => {
    await expect(model(igl("scenes/keybound.scene.json"), igl("layouts/F13.layout.json"))).resolves.toBeDefined();
    await expect(model(igl("scenes/S18.scene.json"), igl("layouts/X05.layout.json"))).resolves.toBeDefined();
  });
});

describe("M11-M13 propagated errors are unchanged classes", () => {
  it("M11 SCENE_MISMATCH is a LayoutError", async () => {
    const e = await buildRenderModel(igl("scenes/bind-a.scene.json"), igl("bind/B01.layout.json")).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LayoutError);
    expect((e as LayoutError).code).toBe("SCENE_MISMATCH");
  });
  it("M12 INCOMPLETE_LAYOUT/MISSING_NODE", async () => {
    const e = (await buildRenderModel(igl("scenes/bind-a.scene.json"), igl("bind/B03.layout.json")).catch((x: unknown) => x)) as LayoutError;
    expect([e.code, e.reason]).toEqual(["INCOMPLETE_LAYOUT", "MISSING_NODE"]);
  });
  it("M13 an IgsError from scene verification", async () => {
    const e = await buildRenderModel(igl("scenes/B07.scene.json"), igl("layouts/F11.layout.json")).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(IgsError);
    expect([(e as IgsError).code, (e as IgsError).reason]).toEqual(["INVALID_SCENE", "NON_CANONICAL"]);
  });
  it("non-bytes input is a TypeError, as in the other cores", async () => {
    await expect(buildRenderModel("x" as never, F01())).rejects.toBeInstanceOf(TypeError);
  });
});

describe("limits (section 15): inclusive, ordered, exact sums", () => {
  const labelUnits = async () => {
    const s = (await verifyScene(mixed20())).scene;
    return s.nodes.reduce((a, n) => a + n.label.length + n.category.length, 0) + s.edges.reduce((a, e) => a + e.label.length, 0);
  };
  it("defaults are the provisional values of the design", () => {
    expect(DEFAULT_RENDER_LIMITS).toEqual({ maxSceneBytes: 8_388_608, maxLayoutBytes: 4_194_304, maxNodes: 20_000, maxEdges: 40_000, maxTotalLabelUnits: 4_194_304, maxStateBytes: 8_388_608, maxIntentTargets: 60_000 });
    expect(Object.isFrozen(DEFAULT_RENDER_LIMITS)).toBe(true);
  });
  it("M14/M15 nodes", async () => {
    await expect(model(mixed20(), F04(), { maxNodes: 20 })).resolves.toBeDefined();
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxNodes: 19 }))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
  });
  it("M16/M17 edges", async () => {
    await expect(model(mixed20(), F04(), { maxEdges: 37 })).resolves.toBeDefined();
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxEdges: 36 }))).toBe("RESOURCE_LIMIT/EDGE_LIMIT");
  });
  it("M18/M19 label units = sum of UTF-16 lengths of node labels, node categories and edge labels", async () => {
    const n = await labelUnits();
    await expect(model(mixed20(), F04(), { maxTotalLabelUnits: n })).resolves.toBeDefined();
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxTotalLabelUnits: n - 1 }))).toBe("RESOURCE_LIMIT/LABEL_LIMIT");
  });
  it("M20/M21/M22 byte limits are checked before verification", async () => {
    const len = mixed20().length;
    await expect(model(mixed20(), F04(), { maxSceneBytes: len })).resolves.toBeDefined();
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxSceneBytes: len - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxLayoutBytes: F04().length - 1 }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    // garbage bytes over the limit are refused by length, never verified
    expect(await errOfAsync(() => buildRenderModel(new Uint8Array(10), new Uint8Array(10), { limits: { maxSceneBytes: 9 } }))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
  });
  it("invalid limits are INVALID_INPUT", async () => {
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxNodes: -1 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxNodes: 1.5 }))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxNodes: NaN }))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(await errOfAsync(() => model(mixed20(), F04(), { maxNodes: "x" as never }))).toBe("INVALID_INPUT/SCHEMA");
    expect(await errOfAsync(() => model(mixed20(), F04(), { bogus: 1 } as never))).toBe("INVALID_INPUT/SCHEMA");
  });
  it("M27 (Law 10) limits never change the bytes", async () => {
    const a = modelBytes(await model(o1Scene(), F01()));
    const b = modelBytes(await model(o1Scene(), F01(), { maxNodes: 99999, maxEdges: 99999 }));
    expect(b).toEqual(a);
  });
});

describe("M23/M24/M26/M28 equalities and ignored extensions", () => {
  it("M23 layouts with accepted x- content give the M01 bytes", async () => {
    for (const v of ["V21", "V24"]) {
      const layout = igl(`verify/${v}.layout.json`);
      const lay = JSON.parse(dec(layout)) as { scene_sha256: string };
      expect(lay.scene_sha256).toBe(SCENE_O1);
      expect(dec(modelBytes(await model(o1Scene(), layout))), v).toContain('"layout_sha256":"' + (await verifyHash(layout)) + '"');
      const m1 = JSON.parse(dec(modelBytes(await model(o1Scene(), layout)))) as Record<string, unknown>;
      delete m1["layout_sha256"];
      const m0 = JSON.parse(A1) as Record<string, unknown>;
      delete m0["layout_sha256"];
      expect(m1, v).toEqual(m0);
    }
  });
  it("M24 coordinates at +-(2^53-1) pass through", async () => {
    for (const v of ["V45", "V46"]) {
      const layout = igl(`verify/${v}.layout.json`);
      const m = await model(o1Scene(), layout);
      expect(m.nodes.some((n) => Math.abs(n.x) === Number.MAX_SAFE_INTEGER || Math.abs(n.y) === Number.MAX_SAFE_INTEGER), v).toBe(true);
    }
  });
  it("M26 (Law 1) the layout policy never reaches the model: FORCE and FIXED with the same coordinates give equal node data", async () => {
    const a = await model(o1Scene(), F01());
    const fixed = await computeFixedLayout(o1Scene(), a.nodes.map((n) => ({ ref: n.ref, x: n.x / 1000, y: n.y / 1000 })));
    const b = await model(o1Scene(), fixed.layoutBytes);
    expect(JSON.stringify(b.nodes)).toBe(JSON.stringify(a.nodes));
    expect(b.layoutSha256).not.toBe(a.layoutSha256);
  });
  it("M28 scene x- keys on nodes and edges are ignored and absent from modelBytes", async () => {
    const scene = JSON.parse(dec(o1Scene())) as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
    scene.nodes[0]!["x-note"] = "hello"; scene.edges[0]!["x-note"] = 7;
    const { canonicalBytes } = await import("isongraph-visualize-scene-core/primitives");
    const bytes = canonicalBytes(scene as never);
    const verified = await verifyScene(bytes); // IGS/1 section 3: x- fields are accepted, preserved and hashed
    const lay = await computeFixedLayout(bytes, verified.scene.nodes.map((n, i) => ({ ref: n.ref, x: i, y: i })));
    const m = await model(bytes, lay.layoutBytes);
    expect(dec(modelBytes(m))).not.toContain("x-note");
    expect(JSON.stringify(m.nodes)).not.toContain("x-note");
    expect(JSON.stringify(m.edges)).not.toContain("x-note");
  });
});

describe("M25 brand and isolation (section 2.1)", () => {
  it("isRenderModel accepts built models only", async () => {
    const m = await model(o1Scene(), F01());
    expect(isRenderModel(m)).toBe(true);
    expect(isRenderModel(JSON.parse(JSON.stringify(m)))).toBe(false);
    expect(isRenderModel(structuredClone({ ...m }))).toBe(false);
    expect(isRenderModel(null)).toBe(false);
    expect(isRenderModel({ ...m })).toBe(false); // spread drops nothing? the symbol IS own & enumerable: shape checks still reject a thawed copy
  });
  it("a model is deep-frozen; the scene bytes are reachable only through modelSceneBytes, and the verified canonical scene bytes", async () => {
    const m = await model(o1Scene(), F01());
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.nodes)).toBe(true);
    expect(Object.isFrozen(m.nodes[0])).toBe(true);
    expect(Object.isFrozen(m.nodes[0]!.ref)).toBe(true);
    expect(Object.isFrozen(m.edges[0]!.ref.src)).toBe(true);
    expect(Object.isFrozen(m.categories)).toBe(true);
    expect(Object.isFrozen(m.bounds)).toBe(true);
    expect(modelSceneBytes(m)).toEqual(o1Scene());
    expect(Object.getOwnPropertySymbols(m).map(String).sort()).toEqual(["Symbol(isongraph.igr.model.sceneBytes/1)", "Symbol(isongraph.igr.model/1)"]);
  });
  it("a model with a different igr_model version is not a model", async () => {
    const m = await model(o1Scene(), F01());
    const other = { ...m, igr_model: "igr-model/2" };
    Object.defineProperty(other, Symbol.for("isongraph.igr.model/1"), { value: true });
    expect(isRenderModel(other)).toBe(false);
  });
  it("snapshots both arrays synchronously: the caller mutating them while the build is pending changes nothing", async () => {
    const s = new Uint8Array(o1Scene()), l = new Uint8Array(F01());
    const p = buildRenderModel(s, l);
    s.fill(0); l.fill(0);
    const m = await p;
    expect(dec(modelBytes(m))).toBe(A1);
    expect(modelSceneBytes(m)).toEqual(o1Scene());
  });
  it("rejects shared-memory input", async () => {
    await expect(buildRenderModel(new Uint8Array(new SharedArrayBuffer(4)), F01())).rejects.toBeInstanceOf(TypeError);
  });
  it("buildRenderModel takes at most three parameters and none is a hash", () => {
    expect(buildRenderModel.length).toBeLessThanOrEqual(3);
  });
});

async function verifyHash(b: Uint8Array): Promise<string> {
  const { sha256Hex } = await import("isongraph-visualize-scene-core/primitives");
  return sha256Hex(b);
}

describe("lookupElement (section 2.2): strict, non-throwing, never more permissive than resolveInScene", () => {
  it("resolves every element of every corpus scene exactly like resolveInScene", async () => {
    const pairs: [Uint8Array, Uint8Array][] = [[o1Scene(), F01()], [o4Scene(), igl("layouts/F02.layout.json")], [mixed20(), F04()], [igl("scenes/unicode.scene.json"), igl("layouts/F09.layout.json")]];
    for (const [s, l] of pairs) {
      const m = await model(s, l);
      const scene = (await verifyScene(s)).scene;
      for (const n of m.nodes) { expect(lookupElement(m, n.ref)).toBe(n); expect(resolveInScene(scene, n.ref).ref).toEqual(n.ref); }
      for (const e of m.edges) { expect(lookupElement(m, e.ref)).toBe(e); expect(resolveInScene(scene, e.ref).ref).toEqual(e.ref); }
      // undirected address with src > tgt resolves in neither
      if (!m.directed) for (const e of m.edges) {
        if (e.src === e.tgt) continue;
        const flipped = { ord: e.ref.ord, rel: e.ref.rel, src: e.ref.tgt, tgt: e.ref.src };
        expect(lookupElement(m, flipped)).toBeUndefined();
        expect(() => resolveInScene(scene, flipped)).toThrow(IgsError);
      }
    }
  });
  it("returns undefined, never throws, for absent, malformed, extra-key and lone-surrogate addresses", async () => {
    const m = await model(o1Scene(), F01());
    const bad: unknown[] = [undefined, null, 1, "x", [], {}, { id: "i:1" }, { type: "person" }, { id: "i:1", type: "person", extra: 1 },
      { id: 1, type: "person" }, { id: "i:1", type: 5 }, { id: "i:01", type: "person" }, { id: "\ud800", type: "person" },
      { id: "i:1", type: "person\ud800" }, { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" } },
      { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" }, extra: 1 },
      { ord: 0, rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } },
      { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person", z: 1 }, tgt: { id: "s:ann", type: "person" } },
      Object.assign(Object.create({ id: "i:1", type: "person" }), {}), new Map(), () => 1];
    for (const b of bad) expect(lookupElement(m, b), JSON.stringify(b)).toBeUndefined();
    const getter = { get id(): string { throw new Error("boom"); }, type: "person" };
    expect(lookupElement(m, getter)).toBeUndefined();
    const toJson = { id: { toJSON: () => "i:1" }, type: "person" };
    expect(lookupElement(m, toJson)).toBeUndefined();
    let reads = 0;
    const once = { get id() { reads++; return reads === 1 ? "i:1" : "s:ann"; }, type: "person" };
    const found = lookupElement(m, once);
    expect(found?.index).toBe(0); // read once: the first read decides
    expect(reads).toBe(1);
  });
  it("elementKey is the JSON string-array key and cannot confuse a node with an edge or id splits", async () => {
    const m = await model(o1Scene(), F01());
    expect(elementKey(m.nodes[0]!.ref)).toBe('["n","person","i:1"]');
    expect(elementKey(m.edges[0]!.ref)).toBe('["e","0","KNOWS","person","i:1","person","s:ann"]');
    expect(() => elementKey({ id: 1 } as never)).toThrow(IgrError);
  });
});

describe("files read by the corpus tests exist", () => {
  it("fixtures are present", () => {
    expect(read(join(ORACLES, "o1-basic.scene.json")).length).toBeGreaterThan(10);
    expect(read(join(ORACLES_IGL, "EXPECT.tsv")).length).toBeGreaterThan(10);
    expect(enc("x").length).toBe(1);
  });
});

describe("source round trip (section 7.2)", () => {
  it("selectionReference is exactly the address and the artifact hash; resolveSelection is resolveInSource", async () => {
    const m = await model(o1Scene(), F01());
    const ref = selectionReference(m, { node: { id: "i:1", type: "person" } });
    expect(ref).toEqual({ artifact_sha256: ARTIFACT_O1, address: { id: "i:1", type: "person" } });
    const source = read(join(ORACLES, "o1-basic.source.ison"));
    await expect(resolveSelection(m, { node: { id: "i:1", type: "person" } }, source)).resolves.toEqual({ kind: "node", address: { id: "i:1", type: "person" }, artifact_sha256: ARTIFACT_O1 });
    await expect(resolveSelection(m, { edge: m.edges[0]!.ref }, source)).resolves.toMatchObject({ kind: "edge" });
    await expect(resolveSelection(m, { node: { id: "i:1", type: "person" } }, enc("nodes.person\nid\n1\n"))).rejects.toMatchObject({ code: "SOURCE_MISMATCH" });
  });
  it("an absent address is UNRESOLVED_ADDRESS (IgsError)", async () => {
    const m = await model(o1Scene(), F01());
    expect(() => selectionReference(m, { node: { id: "i:9", type: "person" } })).toThrow(IgsError);
    expect(() => selectionReference(m, { bogus: 1 } as never)).toThrow(IgrError);
  });
});

describe("audit I-1: sceneBytes is only ever exposed as copies", () => {
  it("writing into model.sceneBytes cannot corrupt the model or export('scene')", async () => {
    const m = await model(o1Scene(), F01());
    const first = modelSceneBytes(m)[0]!;
    modelSceneBytes(m)[0] = 0x41; // writes into a copy
    modelSceneBytes(m).fill(0);
    expect(modelSceneBytes(m)[0]).toBe(first);
    expect("sceneBytes" in m).toBe(false); // rev 4 (2.2): not a public field
    expect(modelSceneBytes(m)).toEqual(o1Scene());
    expect(modelSceneBytes(m)).not.toBe(modelSceneBytes(m)); // a fresh copy every time
    const { createHeadlessRenderer } = await import("../src/headless/index.js");
    const r = createHeadlessRenderer();
    await r.initialize({ host: "headless", size: { width: 10, height: 10 }, reducedMotion: false });
    await r.loadScene(m);
    expect((await r.export("scene")).bytes).toEqual(o1Scene());
    expect(isRenderModel(m)).toBe(true);
  });
  it("events handed to a listener and returned by dispatch are frozen: a listener cannot change what dispatch returns", async () => {
    const { createHeadlessRenderer } = await import("../src/headless/index.js");
    const m = await model(o1Scene(), F01());
    const r = createHeadlessRenderer();
    const errors: unknown[] = [];
    await r.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false, onEvent: (e) => { if (e.type === "selection-changed") (e.selection as unknown[]).push("junk"); }, onError: (e) => errors.push(e) });
    await r.loadScene(m);
    const ev = r.dispatch({ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] });
    expect(JSON.stringify(ev)).not.toContain("junk");
    expect(errors).toHaveLength(1); // the push threw on the frozen array and was routed to onError
    expect(Object.isFrozen(ev[0])).toBe(true);
  });
});
