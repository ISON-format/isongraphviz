// Row D05 at scale (design 13.3): pickDrawn against the unpruned brute-force reference over random models, random viewports and random points, including
// multiples of 2^-10 around polyline vertices and the viewport border. The fast suite (test/pick.test.ts) runs the oracle scenes.
import { describe, expect, it } from "vitest";
import { initialState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, buildPickBuffer, createPicker } from "../../src/index.js";
import { lcg, randomModel } from "../gen.js";
import { reference } from "../pick-ref.js";

describe("D05 pickDrawn against the brute-force reference, 40 random models", () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`seed ${seed}`, async () => {
      const model = await randomModel(seed, { maxNodes: 25 });
      const rng = lcg(seed * 31 + 7);
      const size = { width: 200 + rng.int(800), height: 200 + rng.int(600) };
      const base = initialState(model, size);
      const state = { ...base, viewport: { ...base.viewport, zoom: rng.pick([500, 1000, 2000, 4000]) } };
      const list = buildDisplayList(model, state);
      const picker = createPicker(model, state);
      const pb = buildPickBuffer(list);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 250; i++) pts.push({ x: rng.float() * (size.width + 60) - 30, y: rng.float() * (size.height + 60) - 30 });
      for (let i = 0; i < 250 && pb.edges.length > 0; i++) {
        const e = pb.edges[rng.int(pb.edges.length)]!;
        const k = rng.int(e.points.length / 2);
        pts.push({ x: e.points[2 * k]! / 1000 + (rng.int(2 * 8200) - 8200) / 1024, y: e.points[2 * k + 1]! / 1000 + (rng.int(2 * 8200) - 8200) / 1024 });
      }
      for (const p of pts) expect(picker.pick(p), `(${p.x}, ${p.y})`).toEqual(reference(model, state, list, p));
    });
  }
});
