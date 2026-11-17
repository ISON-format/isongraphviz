import { describe, expect, it } from "vitest";
import { nodeKey, nodeRefFromWire } from "isongraph-visualize-scene-core/primitives";
import { RECOMMENDED_PLACEMENT, computeStableLayout, diffScenes } from "../src/index.js";
import { PLACE_56, SPEC_C, cr, drawing, prevDrawing, sceneBytes, text, type NodeSpec } from "./helpers.js";

describe("TL08 the worst case of the meter model: W = 10k + 10", () => {
  async function run(k: number, x: number) {
    const ids = Array.from({ length: k }, (_, i) => `i:${i + 1}`);
    const pos = Object.fromEntries(ids.map((i) => [i, [x, 0] as [number, number]]));
    const prev = await drawing({ tag: `tl8p${k}`, nodes: ids }, pos);
    const next = await sceneBytes({ tag: `tl8n${k}`, nodes: [...ids, `i:${k + 1}`], edges: [["i:1", "e", `i:${k + 1}`]] });
    return computeStableLayout(prev, next, { placement: RECOMMENDED_PLACEMENT });
  }
  it("k coincident kept nodes at (0,0): 20, 60, 510 for k = 1, 5, 50", async () => {
    for (const [k, w] of [[1, 20], [5, 60], [50, 510]] as const) expect((await run(k, 0)).stats.work).toBe(w);
  });
  it("with the kept nodes at x = 39999 the candidate is two cells away and k = 5 gives 55 (the position is part of the vector)", async () => {
    expect((await run(5, 39999)).stats.work).toBe(55);
  });
});

describe("key-length limits (section 12.2)", () => {
  const prevOf = () => drawing({ tag: "kl", nodes: ["i:1"] }, { "i:1": [0, 0] });
  const keyUnits = (id: string, type = "n"): number => nodeKey(nodeRefFromWire({ id, type })).length;
  const tryScene = async (nodes: NodeSpec[], edges: Parameters<typeof sceneBytes>[0]["edges"] = []) => {
    const next = await sceneBytes({ tag: `kl-${nodes.length}-${text(new Uint8Array([nodes.length]))}`, nodes: ["i:1", ...nodes], edges });
    return cr(async () => computeStableLayout(await prevOf(), next, { placement: PLACE_56 }));
  };
  it("TL12 a node key of exactly 5,000 UTF-16 units (4,990 characters after s:) is refused (FIXED would accept it)", async () => {
    const id = `s:${"a".repeat(4990)}`;
    expect(keyUnits(id)).toBe(5000);
    expect(await tryScene([id])).toBe("RESOURCE_LIMIT/KEY_LENGTH");
  });
  it("TL13 a control-character id of 1,022 characters (raw 1,024 units, nodeKey 6,142 units) is refused: the limit is on the key, not the raw length", async () => {
    const id = `s:${"\u0001".repeat(1022)}`; // a 1,022-character identifier: 1,024 raw units with the `s:` tag
    expect(id.length).toBe(1024);
    expect(keyUnits(id, "t")).toBe(6142);
    expect(await tryScene([id])).toBe("RESOURCE_LIMIT/KEY_LENGTH");
  });
  it("TL14 a relation whose JSON text is 2,048 units passes, 2,049 is refused", async () => {
    const ok = "r".repeat(2046), bad = "r".repeat(2047);
    expect(JSON.stringify(ok).length).toBe(2048);
    expect(await tryScene(["i:2"], [["i:1", ok, "i:2"]])).toBe("no error");
    expect(await tryScene(["i:2"], [["i:1", bad, "i:2"]])).toBe("RESOURCE_LIMIT/KEY_LENGTH");
  });
  it("TL15 the worst-case edge key is exactly 10,240 units (the tight bound) and is accepted by V3", async () => {
    const a = `s:${'"'.repeat(1019)}`, b = `s:${"\\".repeat(1019)}`;
    expect(keyUnits(a)).toBe(2048);
    expect(keyUnits(b)).toBe(2048);
    const rel = "\u0001".repeat(341);
    expect(JSON.stringify(rel).length).toBe(2048);
    const edgeKey = JSON.stringify([nodeKey(nodeRefFromWire({ id: a, type: "n" })), rel, nodeKey(nodeRefFromWire({ id: b, type: "n" })), "0"]);
    expect(edgeKey.length).toBe(10240);
    const s1 = await sceneBytes({ tag: "tl15a", nodes: [a, b], edges: [[a, rel, b]] });
    const s2 = await sceneBytes({ tag: "tl15b", nodes: [a, b], edges: [[a, rel, b]] });
    const d = await diffScenes(s1, s2);
    expect(d.edges.common).toBe(1);
  });
  it("one unit more on either endpoint or on the relation is refused by diffScenes too", async () => {
    const long = `s:${"a".repeat(2049 - JSON.stringify(["n", "s:"]).length)}`;
    const s1 = await sceneBytes({ tag: "kd1", nodes: ["i:1"] });
    const s2 = await sceneBytes({ tag: "kd2", nodes: ["i:1", long] });
    expect(await cr(() => diffScenes(s1, s2))).toBe("RESOURCE_LIMIT/KEY_LENGTH");
    expect(await cr(() => diffScenes(s2, s1))).toBe("RESOURCE_LIMIT/KEY_LENGTH");
  });
});

describe("TL11 a meter error returns nothing and changes no later call", () => {
  it("a refused call leaves no trace: the identical call afterwards yields the same bytes as before", async () => {
    const prev = await prevDrawing();
    const c = await sceneBytes(SPEC_C);
    const before = await computeStableLayout(prev, c, { placement: PLACE_56 });
    for (const w of [1, 28, 40, 78, 104]) expect(await cr(() => computeStableLayout(prev, c, { placement: PLACE_56, budget: { maxWork: w } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    const after = await computeStableLayout(prev, c, { placement: PLACE_56 });
    expect(text(after.reportBytes)).toBe(text(before.reportBytes));
    expect(after.stats).toEqual(before.stats);
  });
});
