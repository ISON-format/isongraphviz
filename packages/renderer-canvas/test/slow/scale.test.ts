// Scale checks (design 11.4, 19 R-5): a model at the capacity of the dom renderer (20,000 nodes, 40,000 edges) goes through the list, the byte form, the strict
// reader, the stream, the readouts and one pick. Time and memory are recorded, not asserted as a performance claim (V12 owns performance).
import { describe, expect, it } from "vitest";
import { generateModel } from "isongraph-visualize-renderer-core/conformance";
import { initialState } from "isongraph-visualize-renderer-core";
import { buildDisplayList, createPicker, parseDisplayList, readoutFromList, serializeDisplayList, serializeReadout } from "isongraph-visualize-display-list";
import { readoutFromCanvasStream, recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";

describe("20,000 nodes and 40,000 edges", () => {
  it("list, bytes, reader, stream, readouts and a pick are consistent and bounded", async () => {
    const t0 = Date.now();
    const model = await generateModel(20_000, 40_000);
    const state = initialState(model, { width: 1600, height: 1000 });
    const t1 = Date.now();
    const list = buildDisplayList(model, state);
    const t2 = Date.now();
    const bytes = serializeDisplayList(list);
    const parsed = parseDisplayList(bytes);
    const t3 = Date.now();
    expect(parsed.records.length).toBe(list.records.length);
    expect(list.nodes.length).toBe(20_000);
    expect(list.edges.length).toBe(40_000);
    const stream = recordCanvasCalls(list);
    const t4 = Date.now();
    expect(new TextDecoder().decode(serializeReadout(readoutFromCanvasStream(stream, list)))).toBe(new TextDecoder().decode(serializeReadout(readoutFromList(list))));
    const t5 = Date.now();
    createPicker(model, state).pick({ x: 800, y: 500 });
    const t6 = Date.now();
    console.log(`[scale] model ${t1 - t0} ms, list ${t2 - t1} ms (${list.records.length} records), bytes+reader ${t3 - t2} ms (${bytes.length} bytes), stream ${t4 - t3} ms (${stream.length} bytes), readouts ${t5 - t4} ms, picker ${t6 - t5} ms`);
    expect(bytes.length).toBeLessThan(67_108_864); // under the default maxDlBytes
  });
});
