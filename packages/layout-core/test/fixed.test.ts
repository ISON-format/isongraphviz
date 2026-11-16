import { describe, expect, it } from "vitest";
import { computeFixedLayout } from "../src/fixed.js";
import { bindLayout } from "../src/bind.js";
import { layoutError, o1Scene } from "./helpers.js";

const REF1 = { id: "i:1", type: "person" }, REF2 = { id: "s:ann", type: "person" };
const pos = (a: [number, number], b: [number, number]) => [{ ref: REF1, x: a[0], y: a[1] }, { ref: REF2, x: b[0], y: b[1] }];

describe("computeFixedLayout", () => {
  it("quantizes supplied LAYOUT-UNIT doubles once and produces a verified, bound layout", async () => {
    const o1 = await o1Scene();
    const r = await computeFixedLayout(o1.sceneBytes, pos([-12.3456, 0.0005], [1e6, 0.25]));
    expect(r.layout.nodes).toEqual([{ ref: REF1, x: -12346, y: 1 }, { ref: REF2, x: 1000000000, y: 250 }]);
    expect(r.layout.policy).toEqual({ family: "FIXED", algorithm: "igl-fixed/1", config: {} });
    expect(r.sceneSha256).toBe(o1.sceneSha256);
    await expect(bindLayout(o1.sceneBytes, r.layoutBytes)).resolves.toBeDefined();
  });
  it("is a function of (scene, positions): the same input twice gives identical bytes, different positions differ", async () => {
    const o1 = await o1Scene();
    const a = await computeFixedLayout(o1.sceneBytes, pos([1, 2], [3, 4]));
    const b = await computeFixedLayout(o1.sceneBytes, pos([1, 2], [3, 4]));
    const c = await computeFixedLayout(o1.sceneBytes, pos([1, 2], [3, 5]));
    expect(Buffer.from(a.layoutBytes).equals(Buffer.from(b.layoutBytes))).toBe(true);
    expect(a.layoutSha256).not.toBe(c.layoutSha256);
  });
  it("does not guess units: 173961 means layout units, giving 173961000 thousandths", async () => {
    const o1 = await o1Scene();
    const r = await computeFixedLayout(o1.sceneBytes, pos([173961, 0], [0, 0]));
    expect(r.layout.nodes[0]!.x).toBe(173961000);
  });
  it("exact ties and negative zero", async () => {
    const o1 = await o1Scene();
    const r = await computeFixedLayout(o1.sceneBytes, pos([0.0005, 0.0015], [-0.0005, -0]));
    expect(r.layout.nodes.map((n) => [n.x, n.y])).toEqual([[1, 2], [0, 0]]);
  });
  it("rejects non-finite and out-of-range coordinates", async () => {
    const o1 = await o1Scene();
    expect(await layoutError(() => computeFixedLayout(o1.sceneBytes, pos([Number.NaN, 0], [0, 0])))).toBe("INVALID_COORDINATE/NOT_FINITE");
    expect(await layoutError(() => computeFixedLayout(o1.sceneBytes, pos([Infinity, 0], [0, 0])))).toBe("INVALID_COORDINATE/NOT_FINITE");
    expect(await layoutError(() => computeFixedLayout(o1.sceneBytes, pos([9007199254740.992, 0], [0, 0])))).toBe("INVALID_COORDINATE/OUT_OF_RANGE");
  });
  it("requires exactly the scene's nodes: missing, unknown, duplicate", async () => {
    const o1 = await o1Scene();
    expect(await layoutError(() => computeFixedLayout(o1.sceneBytes, [{ ref: REF1, x: 0, y: 0 }]))).toBe("INCOMPLETE_LAYOUT/MISSING_NODE");
    expect(await layoutError(() => computeFixedLayout(o1.sceneBytes, [...pos([0, 0], [0, 0]), { ref: { id: "s:zed", type: "person" }, x: 0, y: 0 }]))).toBe("INCOMPLETE_LAYOUT/UNKNOWN_NODE");
    expect(await layoutError(() => computeFixedLayout(o1.sceneBytes, [...pos([0, 0], [0, 0]), { ref: REF1, x: 9, y: 9 }]))).toBe("INVALID_LAYOUT/DUPLICATE_NODE_REF");
    expect(await layoutError(() => computeFixedLayout(o1.sceneBytes, [...pos([0, 0], [0, 0]), { ref: { id: "bogus", type: "person" }, x: 0, y: 0 }]))).toBe("INCOMPLETE_LAYOUT/UNKNOWN_NODE");
  });
  it("an empty scene takes an empty position list", async () => {
    const { compileScene } = await import("isongraph-visualize-scene-core");
    const e = await compileScene(new Uint8Array(), "ison-v1");
    const r = await computeFixedLayout(e.sceneBytes, []);
    expect(r.layout.nodes).toEqual([]);
  });
  it("rejects malformed position containers with a LayoutError", async () => {
    const o1 = await o1Scene();
    for (const bad of [null, "x", [null], [{ ref: null, x: 0, y: 0 }], [{ ref: REF1, x: "1", y: 0 }]]) {
      expect(await layoutError(() => computeFixedLayout(o1.sceneBytes, bad as never)), JSON.stringify(bad)).toMatch(/^INVALID_(LAYOUT|COORDINATE)\//);
    }
  });
  it("OWNERSHIP (discriminating): positions mutated after the call starts do not change the result", async () => {
    const o1 = await o1Scene();
    const p = pos([1, 2], [3, 4]);
    const expected = (await computeFixedLayout(o1.sceneBytes, pos([1, 2], [3, 4]))).layoutSha256;
    const pending = computeFixedLayout(o1.sceneBytes, p);
    p[0]!.x = 999; p.pop();
    expect((await pending).layoutSha256).toBe(expected);
  });
  it("OWNERSHIP: a getter that answers differently on a second read is read once", async () => {
    const o1 = await o1Scene();
    let reads = 0;
    const first = { ref: REF1, y: 0 } as { ref: typeof REF1; x?: number; y: number };
    Object.defineProperty(first, "x", { enumerable: true, get: () => (reads++ === 0 ? 5 : 500) });
    const r = await computeFixedLayout(o1.sceneBytes, [first as never, { ref: REF2, x: 0, y: 0 }]);
    expect(r.layout.nodes[0]!.x).toBe(5000);
    expect(reads).toBe(1);
  });
  it("invalid scene bytes raise V1a's IgsError", async () => {
    await expect(computeFixedLayout(new TextEncoder().encode("{}"), [])).rejects.toMatchObject({ name: "IgsError" });
  });
  it("snapshots the scene bytes (regression guard)", async () => {
    const o1 = await o1Scene(); const b = new Uint8Array(o1.sceneBytes);
    const p = computeFixedLayout(b, pos([1, 2], [3, 4])); b.fill(0);
    await expect(p).resolves.toBeDefined();
  });
});
