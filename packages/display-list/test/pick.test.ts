// Design 5: the pick buffer, pickDrawn against an unpruned brute-force reference (the body of row D05), bounds, and backingSize.
import { describe, expect, it } from "vitest";
import { hitTest, quantizePx, type ElementAddress, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, buildPickBuffer, createPicker, elementBounds, parsePickBuffer, serializeBounds, serializePickBuffer, backingSize, type DisplayList } from "../src/index.js";
import { LOOPS2, MIXED20, O1, O4, SIZE, bytesOf, errOf, initial, readState, textOf } from "./helpers.js";
import { lcg } from "./gen.js";
import { reference } from "./pick-ref.js";

describe("pickDrawn against the brute-force reference (D05 body)", () => {
  const cases: [string, { scene: string; layout: string }, string?][] = [
    ["O1", O1], ["O4 (loop)", O4], ["loops2", LOOPS2], ["mixed20 (parallel members)", MIXED20], ["pickv", { scene: "scenes/pickv.scene.json", layout: "layouts/pickv.layout.json" }, "states/pickv.state.json"],
  ];
  for (const [name, m, stateFile] of cases) {
    it(`${name}: 400 random points, 400 near the polylines, the viewport border`, async () => {
      const { model, state: init } = await initial(m);
      const state = stateFile ? readState(stateFile) : init;
      const list = buildDisplayList(model, state);
      const picker = createPicker(model, state);
      const rng = lcg(0xd05 ^ name.length);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 400; i++) pts.push({ x: rng.float() * (SIZE.width + 40) - 20, y: rng.float() * (SIZE.height + 40) - 20 });
      const pb = buildPickBuffer(list);
      for (let i = 0; i < 400 && pb.edges.length > 0; i++) {
        const e = pb.edges[rng.int(pb.edges.length)]!;
        const k = rng.int(e.points.length / 2);
        const dx = (rng.int(2 * 8200) - 8200) / 1024, dy = (rng.int(2 * 8200) - 8200) / 1024; // multiples of 2^-10 around a vertex
        pts.push({ x: e.points[2 * k]! / 1000 + dx, y: e.points[2 * k + 1]! / 1000 + dy });
      }
      for (const x of [-(2 ** -11), -(2 ** -10), SIZE.width + 2 ** -11, SIZE.width + 2 ** -10]) pts.push({ x, y: 300 });
      for (const p of pts) expect(picker.pick(p), `(${p.x}, ${p.y})`).toEqual(reference(model, state, list, p));
    });
  }
  it("a node hit is exactly the frozen hitTest's (the node step is delegated), for every point", async () => {
    const { model, state } = await initial(MIXED20);
    const picker = createPicker(model, state);
    const rng = lcg(7);
    for (let i = 0; i < 500; i++) {
      const p = { x: rng.float() * 900, y: rng.float() * 600 };
      const h = hitTest(model, state, p);
      if (h !== undefined && "node" in h) expect(picker.pick(p)).toEqual(h);
    }
  });
});

describe("createPicker", () => {
  it("validates the model, the state and the point in that order", async () => {
    const { model, state } = await initial(O1);
    expect(errOf(() => createPicker({} as never, state))).toBe("INVALID_INPUT/NOT_A_RENDER_MODEL");
    expect(errOf(() => createPicker(model, readState("states/Y14.state.json")))).toBe("INVALID_STATE/SCENE_MISMATCH");
    const p = createPicker(model, state);
    for (const bad of [null, [], { x: 1 }, { x: 1, y: 2, z: 3 }, { x: "1", y: 2 }]) expect(errOf(() => p.pick(bad as never)), JSON.stringify(bad)).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => p.pick({ x: NaN, y: 0 }))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(errOf(() => p.pick({ x: 2 ** 31 + 1, y: 0 }))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(p.pick({ x: 2 ** 31, y: 0 })).toBeUndefined();
  });
  it("is not bound to a list: the coordinate check of 3.5 applies to the picker too", async () => {
    const { model } = await initial(O1);
    const far = readState("states/N14.state.json");
    expect(errOf(() => createPicker(model, far))).toMatch(/^INVALID_STATE\//); // another scene's state
  });
  it("bounds() are the element bounds of the list", async () => {
    const { model, state } = await initial(O1);
    expect(createPicker(model, state).bounds()).toEqual(elementBounds(buildDisplayList(model, state)));
  });
  it("the quantized pointer: x = -2^-11 is inside the closed viewport, -2^-10 is outside", async () => {
    const m = { scene: "scenes/pickb.scene.json", layout: "layouts/pickb.layout.json" };
    const { model, state } = await initial(m);
    const picker = createPicker(model, readState("states/pickb.state.json") ?? state);
    expect(picker.pick({ x: -(2 ** -11), y: 300 })).toBeDefined();
    expect(picker.pick({ x: -(2 ** -10), y: 300 })).toBeUndefined();
  });
});

describe("the pick buffer reader", () => {
  it("round-trips the built buffers and is strict", async () => {
    for (const m of [O1, LOOPS2, MIXED20]) {
      const { model, state } = await initial(m);
      const b = serializePickBuffer(buildPickBuffer(buildDisplayList(model, state)));
      expect(textOf(serializePickBuffer(parsePickBuffer(b)))).toBe(textOf(b));
    }
    const ok = '["P","igr-pick/1",1,0]\n["pn",1,5,6]\n';
    expect(() => parsePickBuffer(bytesOf(ok))).not.toThrow();
    for (const bad of [
      '["P","igr-pick/2",1,0]\n["pn",1,5,6]\n', '["P","igr-pick/1",1,0]\n["pn",2,5,6]\n', '["P","igr-pick/1",1,0]\n["pn",1,5,6]', '["P","igr-pick/1",2,0]\n["pn",1,5,6]\n',
      '["P","igr-pick/1",0,1]\n["pe",1,1,2,3]\n', '["pn",1,5,6]\n', '["P","igr-pick/1",1,0]\n["pn",1,5.0,6]\n', '["P","igr-pick/1",1,1]\n["pe",2,1,2,3,4]\n["pn",1,5,6]\n',
    ]) expect(errOf(() => parsePickBuffer(bytesOf(bad))), bad).toBe("INVALID_INPUT/SCHEMA");
  });
});

describe("element bounds (5.4)", () => {
  it("a node box is the focus ring plus the half stroke, an edge box the polyline plus 6 px; an empty list gives empty bytes", async () => {
    const { model, state } = await initial(O1);
    const b = elementBounds(buildDisplayList(model, state));
    expect(b[0]).toEqual({ pid: 1, x0: 13072, y0: 174600, x1: 51072, y1: 212600 });
    expect(b[2]).toEqual({ pid: 3, x0: 37701, y0: 190561, x1: 862299, y1: 409439 });
    expect(serializeBounds([]).length).toBe(0);
  });
});

describe("backingSize (6.4)", () => {
  it("validates width, height then dprMilli", () => {
    expect(errOf(() => backingSize("1" as never, 1, 1000))).toBe("INVALID_INPUT/SCHEMA");
    expect(errOf(() => backingSize(1.5, 1, 1000))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(errOf(() => backingSize(1, NaN, 1000))).toBe("INVALID_INPUT/NOT_FINITE");
    expect(errOf(() => backingSize(16385, 1, 1000))).toBe("INVALID_INPUT/OUT_OF_RANGE");
    expect(errOf(() => backingSize(1, 1, 8001))).toBe("INVALID_INPUT/OUT_OF_RANGE");
  });
  it("a legal viewport always yields e >= 500, and the area cap is a safety bound within a few thousand pixels", () => {
    const rng = lcg(99);
    for (let i = 0; i < 2000; i++) {
      const w = 1 + rng.int(16384), h = 1 + rng.int(16384), d = 250 + rng.int(7751);
      const r = backingSize(w, h, d);
      expect(r.e).toBeGreaterThanOrEqual(Math.min(500, d));
      expect(r.bw * r.bh).toBeLessThanOrEqual(2 ** 26 + 12_000);
      expect(r.bw).toBeLessThanOrEqual(16384 + 1);
    }
  });
});
