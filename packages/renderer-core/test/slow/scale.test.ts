// Audit C-1: nothing in the package may spread or apply a node- or edge-sized array (call-argument limits make that a RangeError from about 130,000).
// SLOW suite (one worker): one 200,000-node model is built ONCE, shared by the tests that need it and released afterwards, so the memory of the
// whole file is one model, not three.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateModel } from "../../src/conformance/generate.js";
import { initialState, normalizeState } from "../../src/state.js";
import { reduce } from "../../src/reduce.js";
import { createHeadlessRenderer } from "../../src/headless/index.js";
import type { RenderModel } from "../../src/types.js";
import { kit, miniCorpus } from "../kitHelpers.js";

describe("scale: models and states far above the default limits", () => {
  let big: RenderModel | undefined;
  beforeAll(async () => { big = await generateModel(200_000, 3); }, 180_000); // about 10 s: verification of 200,000 nodes is linear but not cheap
  afterAll(() => { big = undefined; }); // nothing large stays alive after this file

  it("buildRenderModel at 200,000 nodes (the old Math.min(...) spread threw RangeError from about 130,000)", () => {
    expect(big!.nodes).toHaveLength(200_000);
    expect(big!.edges).toHaveLength(3);
    expect(big!.bounds).toEqual({ min_x: 0, min_y: 0, max_x: 999_000, max_y: 199_000 });
  });

  it("a state with a 200,000-element selection normalizes (the old s.push(...u) spread threw RangeError) and a 200,000-target select reduces", () => {
    const m = big!;
    const s0 = initialState(m, { width: 900, height: 600 });
    const all = m.nodes.map((n) => ({ ...n.ref }));
    const n = normalizeState(m, { ...s0, selection: { nodes: [...all].reverse(), edges: [] } });
    expect(n.selection.nodes).toHaveLength(200_000);
    expect(n.selection.nodes[0]).toEqual(all[0]);
    const r = reduce(m, s0, { type: "select", mode: "replace", targets: all.map((x) => ({ node: x })) }, { maxIntentTargets: 300_000, maxSceneBytes: 2 ** 30 });
    expect(r.state.selection.nodes).toHaveLength(200_000);
  });

  it("the kit's L22 does not false-fail a legitimate subject whose capacity is above the old spread threshold (150,000 nodes)", async () => {
    const cap = { capacity: { maxNodes: 150_000 } };
    const rep = await kit({ manifest: createHeadlessRenderer(cap).manifest, create: async () => createHeadlessRenderer(cap) }, await miniCorpus(), { only: ["L22"], seeds: [1] });
    expect(rep.results.filter((r) => r.id === "L22").map((r) => r.verdict)).toEqual(["pass"]);
  });
});
