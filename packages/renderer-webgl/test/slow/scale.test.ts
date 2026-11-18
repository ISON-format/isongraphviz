// Scale check (design 11.4, 19 R-5): a model at the dom capacity of the Canvas renderer (20,000 nodes, 40,000 edges) goes through the list, the plan, the strict
// plan reader, the readouts and one frame against a counting fake. Time is recorded, not asserted as a performance claim (V12 owns performance).
import { describe, expect, it } from "vitest";
import { generateModel } from "isongraph-visualize-renderer-core/conformance";
import { initialState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, readoutFromList, serializeReadout } from "isongraph-visualize-display-list";
import { createGlResources, executePlan, parseGlPlan, planGl, readoutFromGl, serializePlan } from "../../src/index.js";
import { createFakeGl } from "../fake-gl.js";

describe("20,000 nodes and 40,000 edges", () => {
  it("list, plan, bytes, reader, readouts and one frame are consistent and bounded", async () => {
    const t0 = Date.now();
    const model = await generateModel(20_000, 40_000);
    const state = initialState(model, { width: 1600, height: 1000 });
    const t1 = Date.now();
    const list = buildDisplayList(model, state);
    const t2 = Date.now();
    const plan = planGl(list);
    const bytes = serializePlan(plan);
    const t3 = Date.now();
    const parsed = parseGlPlan(bytes);
    const t4 = Date.now();
    expect(parsed.nodes.length).toBe(20_000);
    expect(parsed.edges.length).toBe(40_000);
    expect(new TextDecoder().decode(serializeReadout(readoutFromGl(parsed)))).toBe(new TextDecoder().decode(serializeReadout(readoutFromList(list))));
    const t5 = Date.now();
    let calls = 0;
    const log: string[] = [];
    const gl = createFakeGl({ log });
    const res = createGlResources(gl);
    log.length = 0;
    executePlan(gl, parsed, res, { widthPx: 1600, heightPx: 1000, ink: [34, 34, 34] });
    calls = log.length;
    console.log(`[scale] model ${t1 - t0} ms, list ${t2 - t1} ms, plan+bytes ${t3 - t2} ms (${bytes.length} bytes), reader ${t4 - t3} ms, readouts ${t5 - t4} ms, frame ${calls} GL calls`);
    expect(bytes.length).toBeLessThan(268_435_456); // under the default maxGlBytes
    expect(calls).toBeLessThan(100);
  });
});
