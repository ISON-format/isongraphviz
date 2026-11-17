import { describe, expect, it } from "vitest";
import { computeStableLayout, measureDisplacement, snapshotLayout } from "../src/index.js";
import { PLACE_56, SPEC_PREV, WORKED, cr, drawing, prevDrawing, sceneBytes, fixedLayout } from "./helpers.js";

describe("snapshotLayout (section 2.1): an inspection value that no function accepts back", () => {
  it("returns the derived hashes, directedness, nodes with positions and edges, deep-frozen", async () => {
    const s = await snapshotLayout(await prevDrawing());
    expect(s.sceneSha256).toBe(WORKED.prevScene);
    expect(s.layoutSha256).toBe(WORKED.prevLayout);
    expect(s.directed).toBe(true);
    expect(s.nodes).toEqual([{ ref: { id: "i:1", type: "n" }, x: 0, y: 0 }, { ref: { id: "i:2", type: "n" }, x: 2000, y: 0 }, { ref: { id: "i:3", type: "n" }, x: 2000, y: 1500 }, { ref: { id: "i:6", type: "n" }, x: 3000, y: 700 }]);
    expect(s.edges.map((e) => `${e.src.id}>${e.tgt.id}`)).toEqual(["i:1>i:2", "i:2>i:3", "i:3>i:6"]);
    expect(s.edges[0]).toEqual({ ord: "0", rel: "e", src: { id: "i:1", type: "n" }, tgt: { id: "i:2", type: "n" } });
    for (const v of [s, s.nodes, s.nodes[0], s.nodes[0]!.ref, s.edges, s.edges[0], s.edges[0]!.src]) expect(Object.isFrozen(v)).toBe(true);
  });
  it("mutating a returned snapshot throws or has no effect and changes no later call", async () => {
    const p = await prevDrawing();
    const s = await snapshotLayout(p);
    expect(() => { (s.nodes[0] as { x: number }).x = 99; }).toThrow();
    expect(() => { (s.nodes as unknown as unknown[]).push(1); }).toThrow();
    const again = await snapshotLayout(p);
    expect(again.nodes[0]!.x).toBe(0);
  });
  it("a snapshot is never accepted as an argument: INVALID_REQUEST/SCHEMA, by every function that takes a drawing", async () => {
    const p = await prevDrawing();
    const s = await snapshotLayout(p);
    const c = await sceneBytes(SPEC_PREV);
    expect(await cr(() => computeStableLayout(s as never, c, { placement: PLACE_56 }))).toBe("INVALID_REQUEST/SCHEMA");
    expect(await cr(() => snapshotLayout(s as never))).toBe("INVALID_REQUEST/SCHEMA");
    expect(await cr(() => measureDisplacement(p, s as never))).toBe("INVALID_REQUEST/SCHEMA");
  });
  it("x- keys of an exchanged previous layout are discarded: they never reach a snapshot or the output", async () => {
    const s0 = await sceneBytes({ tag: "xk", nodes: ["i:1"] });
    const lay = JSON.parse(new TextDecoder().decode(await fixedLayout(s0, { "i:1": [5, 6] })));
    lay["x-note"] = "hello"; lay.nodes[0]["x-tag"] = 1;
    const { canonicalBytesSigned } = await import("isongraph-visualize-scene-core/primitives");
    const layoutBytes = canonicalBytesSigned(lay);
    const snap = await snapshotLayout({ sceneBytes: s0, layoutBytes });
    expect(snap.nodes).toEqual([{ ref: { id: "i:1", type: "n" }, x: 5, y: 6 }]);
    expect(JSON.stringify(snap)).not.toContain("hello");
    const r = await computeStableLayout({ sceneBytes: s0, layoutBytes }, await sceneBytes({ tag: "xk2", nodes: ["i:1", "i:2"], edges: [["i:1", "e", "i:2"]] }), { placement: PLACE_56 });
    expect(new TextDecoder().decode(r.layout.layoutBytes)).not.toContain("x-");
  });
  it("charges S1 = n + 2e against maxWork (inclusive) and applies the admission of section 12.1", async () => {
    const p = await prevDrawing();
    expect(await cr(() => snapshotLayout(p, { budget: { maxWork: 10 } }))).toBe("no error"); // 4 + 2*3
    expect(await cr(() => snapshotLayout(p, { budget: { maxWork: 9 } }))).toBe("RESOURCE_LIMIT/WORK_LIMIT");
    expect(await cr(() => snapshotLayout(p, { budget: { maxNodes: 3 } }))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(await cr(() => snapshotLayout(p, { budget: { maxLayoutBytes: 10 } }))).toBe("RESOURCE_LIMIT/INPUT_BYTES");
    const far = await drawing({ tag: "far", nodes: ["i:1"] }, { "i:1": [2 ** 50 + 1, 0] });
    expect(await cr(() => snapshotLayout(far))).toBe("INVALID_PREVIOUS/COORDINATE_DOMAIN");
    expect(await cr(() => snapshotLayout(p, { relax: 1 } as never))).toBe("INVALID_REQUEST/UNSUPPORTED_OPTION");
  });
});
