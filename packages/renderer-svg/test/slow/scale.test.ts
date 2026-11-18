// A model at the headless default capacity (20,000 nodes) and a group of 5,000 parallel edges: render, read back, and bound the output (no latency claim: V12).
import { describe, expect, it } from "vitest";
import { generateModel } from "isongraph-visualize-renderer-core/conformance";
import { initialState } from "isongraph-visualize-renderer-core";
import { readSvg, renderSvgDetailed, writeSvg } from "../../src/index.js";

describe("scale", () => {
  it("20,000 nodes and 5,000 parallel edges: written, read back strictly, refused one byte under the exact size", async () => {
    const m = await generateModel(20_000, 5_000);
    const s = initialState(m, { width: 900, height: 600 });
    const r = renderSvgDetailed(m, s);
    const ro = readSvg(r.svg);
    expect(ro.nodes).toHaveLength(20_000);
    expect(ro.edges).toHaveLength(5_000);
    let sunk = 0;
    expect(() => writeSvg(m, s, { maxSvgBytes: r.bytes - 1 }, (l) => { sunk += l.length; })).toThrow(/BYTES_LIMIT/);
    expect(sunk).toBeLessThanOrEqual(r.bytes - 1);
  });
});
