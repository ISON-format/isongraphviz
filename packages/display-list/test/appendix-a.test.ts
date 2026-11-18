// Design 14 (1): Appendix A as unit tests. The code blocks and quoted sizes/SHA-256 values are EXTRACTED from the design file
// (docs/isongraph-visualize-blueprint/31-CANVAS-WEBGL-DESIGN.md, git-ignored and local) by rule X1 (the block text plus one final LF) and compared with
// the implementation's output. If the design file is absent the whole file is skipped, loudly; test/appendix-tracked.test.ts is the never-skipping
// equivalent from tracked oracle files. The gl: items of the Appendix (A.5, A.8, A.10) belong to renderer-webgl.
import { describe, expect, it } from "vitest";
import { buildDisplayList, buildPickBuffer, backingSize, elementBounds, readoutFromList, serializeBounds, serializeDisplayList, serializePickBuffer, serializeReadout } from "../src/index.js";
import { recordCanvasCalls } from "../src/canvas2d/index.js";
import { LOOPS2, O1, blockAfter, designText, initial, readState, sha256, textOf } from "./helpers.js";

const md = designText();
const NOTE = "SKIPPED: design file docs/isongraph-visualize-blueprint/31-CANVAS-WEBGL-DESIGN.md is not present (it is git-ignored and local)";
if (md === undefined) console.warn(`[appendix-a] ${NOTE}`);
const text = md ?? "";
const bytes = (s: string): number => new TextEncoder().encode(s).length;

describe.skipIf(md === undefined)(md === undefined ? `Appendix A extraction (${NOTE})` : "Appendix A extraction", () => {
  it("the design file contains no CR (rule X1 extracts by LF)", () => { expect(text.includes("\r")).toBe(false); });

  it("A.1: the block plus the final LF is G01 (637 bytes, SHA-256 62e9d45e...)", async () => {
    const { model, state } = await initial(O1);
    const block = blockAfter(text, "**A.1 `buildDisplayList(O1/F01, initial)`");
    const doc = textOf(serializeDisplayList(buildDisplayList(model, state)));
    expect(doc).toBe(block + "\n");
    expect(bytes(doc)).toBe(637);
    expect(sha256(doc)).toBe("62e9d45ed682602b4b4dae6503a92029566fb0cabf6e73f8a9a50893fcff4ebd");
    expect(text).toContain("(637 bytes, SHA-256 `62e9d45ed682602b4b4dae6503a92029566fb0cabf6e73f8a9a50893fcff4ebd`");
  });
  it("A.2: the hooks state Y03 differs from A.1 in exactly the three lines of the block (637 bytes, SHA-256 48c82389...)", async () => {
    const { model, state } = await initial(O1);
    const doc = textOf(serializeDisplayList(buildDisplayList(model, readState("states/Y03.state.json"))));
    const base = textOf(serializeDisplayList(buildDisplayList(model, state))).split("\n");
    const diff = doc.split("\n").filter((l, i) => l !== base[i]);
    expect(diff.join("\n")).toBe(blockAfter(text, "**A.2 Hooks**"));
    expect(bytes(doc)).toBe(637);
    expect(sha256(doc)).toBe("48c82389e35751c8db74db13e12c1345222d3dd01df16791fb9bd2bec931194e");
    expect(text).toContain("The list is 637 bytes, SHA-256 `48c82389e35751c8db74db13e12c1345222d3dd01df16791fb9bd2bec931194e`");
  });
  it("A.3: the directed self-loops (row G11) are the block, 1553 bytes, SHA-256 3f9f4358...", async () => {
    const { model, state } = await initial(LOOPS2);
    const doc = textOf(serializeDisplayList(buildDisplayList(model, state)));
    expect(doc).toBe(blockAfter(text, "**A.3 Directed self-loops") + "\n");
    expect(bytes(doc)).toBe(1553);
    expect(sha256(doc)).toBe("3f9f43587a97bdb7adbbe1465a677ae5c378f621cbffe51a0f821e09db0bf557");
  });
  it("A.4: the Canvas stream of G01 is the block, 1042 bytes, SHA-256 7ec2e46c...; the stream of the A.2 state is 1455 bytes, SHA-256 6cbb962e...", async () => {
    const { model, state } = await initial(O1);
    const doc = textOf(recordCanvasCalls(buildDisplayList(model, state)));
    expect(doc).toBe(blockAfter(text, "**A.4 The Canvas stream (`igr-cv/1`) of `G01`**") + "\n");
    expect(bytes(doc)).toBe(1042);
    expect(sha256(doc)).toBe("7ec2e46cf221854f5c67dee39eef53dcc0c013bbdfbe352f59141133af055d22");
    const c02 = textOf(recordCanvasCalls(buildDisplayList(model, readState("states/Y03.state.json"))));
    expect(bytes(c02)).toBe(1455);
    expect(sha256(c02)).toBe("6cbb962e795d29790254341af0cd2fce66f3afafe6ae8ee14dad2bb2083abfd6");
  });
  it("A.6: the pick buffer of G01 (104 bytes, SHA-256 abf25857...) and its bounds (105 bytes, SHA-256 ca1fd785...) are the blocks", async () => {
    const { model, state } = await initial(O1);
    const list = buildDisplayList(model, state);
    const pick = textOf(serializePickBuffer(buildPickBuffer(list)));
    expect(pick).toBe(blockAfter(text, "**A.6 Pick buffer, bounds and picks.**") + "\n");
    expect([bytes(pick), sha256(pick)]).toEqual([104, "abf25857a74454be0e22782b66285c47d427070d9651682807d23f371aff2e03"]);
    const bounds = textOf(serializeBounds(elementBounds(list)));
    expect(bounds).toBe(blockAfter(text, "`serializeBounds` of `G01`") + "\n");
    expect([bytes(bounds), sha256(bounds)]).toEqual([105, "ca1fd785221a3733180ebf4b216b346da30399134fde346ea0f0db94df424180"]);
  });
  it("A.7: the readout of G01 is the block, 975 bytes, SHA-256 127ffa68...", async () => {
    const { model, state } = await initial(O1);
    const r = textOf(serializeReadout(readoutFromList(buildDisplayList(model, state))));
    expect(r).toBe(blockAfter(text, "**A.7 The readout of `G01`**") + "\n");
    expect([bytes(r), sha256(r)]).toEqual([975, "127ffa680c360cc4698c417129ca6f5c9df1aec086004a5fcb7f3cb791a5214c"]);
  });
  it("A.9 and A.11 are quoted in the design with the figures the implementation produces", async () => {
    expect(text).toContain("`labels: false` 548");
    expect(text).toContain("`edgeLabels: false` 605");
    expect(text).toContain("`maxDrawnLabelUnits: 9` 637");
    expect(text).toContain("state `Y07` (`s:ann` hidden, the edge cascades) 319");
    expect(backingSize(900, 600, 1333)).toEqual({ e: 1333, bw: 1200, bh: 800 });
    expect(backingSize(16384, 100, 2000)).toEqual({ e: 1000, bw: 16384, bh: 100 });
    expect(backingSize(16384, 16384, 2000)).toEqual({ e: 500, bw: 8192, bh: 8192 });
    expect(backingSize(16384, 16384, 250)).toEqual({ e: 250, bw: 4096, bh: 4096 });
  });
});
