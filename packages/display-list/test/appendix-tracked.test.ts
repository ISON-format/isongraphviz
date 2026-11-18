// Design 14 (1): the Appendix A figures asserted from TRACKED files, so that they run on a fresh clone where the git-ignored design file is absent
// (test/appendix-a.test.ts extracts the same blocks from the design and is skipped there). The bytes come from the oracle files G01, Y03, G11, C01, C02,
// P01, B01, R01, O01-O05, X09, Y07 and Z01-Z04 under fixtures/oracles-dl (SHA256SUMS-covered); the literal figures below are those of design 31 Appendix A.
import { describe, expect, it } from "vitest";
import {
  backingSize, buildDisplayList, buildPickBuffer, createPicker, elementBounds, readoutFromList, serializeBounds, serializeDisplayList, serializePickBuffer, serializeReadout,
} from "../src/index.js";
import { readoutFromCanvasStream, recordCanvasCalls } from "../src/canvas2d/index.js";
import { quantizePx, hitTest } from "isongraph-visualize-renderer-core";
import { LOOPS2, O1, bytesOf, initial, readOracleText, readState, sha256, textOf } from "./helpers.js";
import { scrapeSvg } from "./oracle/svg-scrape.js";
import { readoutFromSvgReadout } from "../src/index.js";

const len = (s: string): number => bytesOf(s).length;

describe("Appendix A from the tracked oracle files (runs without the design file)", () => {
  it("A.1: G01 is 637 bytes, SHA-256 62e9d45e..., every line ends with one LF, and the implementation writes it", async () => {
    const g01 = readOracleText("dl/G01.dl");
    expect([len(g01), sha256(g01)]).toEqual([637, "62e9d45ed682602b4b4dae6503a92029566fb0cabf6e73f8a9a50893fcff4ebd"]);
    expect(g01.endsWith("]\n") && !g01.endsWith("\n\n")).toBe(true);
    expect(g01.split("\n")[4]).toBe('["E",3,0,0,43701,196561,856299,403439]');
    expect(g01.split("\n")[5]).toBe('["A",3,856299,403439,845374,405817,847842,396127]');
    const { model, state } = await initial(O1);
    expect(textOf(serializeDisplayList(buildDisplayList(model, state)))).toBe(g01);
  });
  it("A.2: Y03 is 637 bytes, SHA-256 48c82389..., and differs from G01 in exactly three lines", async () => {
    const y03 = readOracleText("dl/Y03.dl"), g01 = readOracleText("dl/G01.dl");
    expect([len(y03), sha256(y03)]).toEqual([637, "48c82389e35751c8db74db13e12c1345222d3dd01df16791fb9bd2bec931194e"]);
    const a = y03.split("\n"), b = g01.split("\n");
    expect(a.filter((l, i) => l !== b[i])).toEqual(['["E",3,1,0,43701,196561,856299,403439]', '["N",1,0,1,32072,193600]', '["N",2,0,2,867928,406400]']);
    const { model } = await initial(O1);
    expect(textOf(serializeDisplayList(buildDisplayList(model, readState("states/Y03.state.json"))))).toBe(y03);
  });
  it("A.3: G11 is 1553 bytes, SHA-256 3f9f4358..., and the implementation writes it", async () => {
    const g11 = readOracleText("dl/G11.dl");
    expect([len(g11), sha256(g11)]).toEqual([1553, "3f9f43587a97bdb7adbbe1465a677ae5c378f621cbffe51a0f821e09db0bf557"]);
    const { model, state } = await initial(LOOPS2);
    expect(textOf(serializeDisplayList(buildDisplayList(model, state)))).toBe(g11);
  });
  it("A.4: the streams of G01 (1042 bytes, 7ec2e46c...) and of the A.2 state (1455 bytes, 6cbb962e...)", async () => {
    const c01 = readOracleText("calls/C01.calls"), c02 = readOracleText("calls/C02.calls");
    expect([len(c01), sha256(c01)]).toEqual([1042, "7ec2e46cf221854f5c67dee39eef53dcc0c013bbdfbe352f59141133af055d22"]);
    expect([len(c02), sha256(c02)]).toEqual([1455, "6cbb962e795d29790254341af0cd2fce66f3afafe6ae8ee14dad2bb2083abfd6"]);
    const { model, state } = await initial(O1);
    expect(textOf(recordCanvasCalls(buildDisplayList(model, state)))).toBe(c01);
    expect(textOf(recordCanvasCalls(buildDisplayList(model, readState("states/Y03.state.json"))))).toBe(c02);
    expect(c02).toContain('["m","setLineDash",[4000,3000]]'); // the dash tokens of the focus ring
    expect(c02.split("\n").some((l) => l.startsWith('["#",3,2]'))).toBe(false); // there is no layer 2: the focus is a node
  });
  it("A.6: the pick buffer (104 bytes, abf25857...), the bounds (105 bytes, ca1fd785...) and the picks", async () => {
    const p01 = readOracleText("pick/P01.pick"), b01 = readOracleText("bounds/B01.bounds");
    expect([len(p01), sha256(p01)]).toEqual([104, "abf25857a74454be0e22782b66285c47d427070d9651682807d23f371aff2e03"]);
    expect([len(b01), sha256(b01)]).toEqual([105, "ca1fd785221a3733180ebf4b216b346da30399134fde346ea0f0db94df424180"]);
    const { model, state } = await initial(O1);
    const list = buildDisplayList(model, state);
    expect(textOf(serializePickBuffer(buildPickBuffer(list)))).toBe(p01);
    expect(textOf(serializeBounds(elementBounds(list)))).toBe(b01);
    const knows = { edge: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } } };
    const picker = createPicker(model, state);
    expect(picker.pick({ x: 500, y: 308 })).toEqual(knows);
    expect(hitTest(model, state, { x: 500, y: 308 })).toEqual(knows);
    expect(picker.pick({ x: 500, y: 300 })).toBeUndefined();
    expect(quantizePx(-(2 ** -11) * 1000)).toBe(0);
    expect(quantizePx(-(2 ** -10) * 1000)).toBe(-1);
  });
  it("A.6: the first loop of G11 is the 17-point polyline of the design, and the loop picks", async () => {
    const { model, state } = await initial(LOOPS2);
    const pb = buildPickBuffer(buildDisplayList(model, state));
    expect(pb.edges[0]!.points).toEqual([25100, 293000, 24027, 288781, 23733, 285125, 24107, 282031, 25038, 279500, 26413, 277531, 28123, 276125, 30056, 275281, 32100, 275000, 34144, 275281, 36077, 276125, 37787, 277531, 39163, 279500, 40093, 282031, 40467, 285125, 40173, 288781, 39100, 293000]);
    const picker = createPicker(model, state);
    const rel = (p: { x: number; y: number }): string | undefined => { const h = picker.pick(p); return h && "edge" in h ? h.edge.rel : undefined; };
    expect(rel({ x: 32.1, y: 275.0 })).toBe("R0");
    expect(rel({ x: 32.1, y: 266.0 })).toBe("R1");
    expect(rel({ x: 32.1, y: 280.0 })).toBe("R0");
    expect(hitTest(model, state, { x: 32.1, y: 275.0 })).toBeUndefined(); // the frozen hitTest cannot reach a self-loop
  });
  it("A.7: the readout of G01 is 975 bytes, SHA-256 127ffa68..., and the SVG scrape and the stream give the same bytes", async () => {
    const r01 = readOracleText("xr/R01.xr.json");
    expect([len(r01), sha256(r01)]).toEqual([975, "127ffa680c360cc4698c417129ca6f5c9df1aec086004a5fcb7f3cb791a5214c"]);
    const { model, state } = await initial(O1);
    const list = buildDisplayList(model, state);
    expect(textOf(serializeReadout(readoutFromList(list)))).toBe(r01);
    expect(textOf(serializeReadout(readoutFromSvgReadout(scrapeSvg(readOracleText("../oracles-svg/svg/G01.svg")) as never)))).toBe(r01);
    expect(textOf(serializeReadout(readoutFromCanvasStream(recordCanvasCalls(list), list)))).toBe(r01);
  });
  it("A.9: the option sizes on G01 (548, 605, 637, 605, 605, 548) and Y07 (319), and the byte limit boundary", async () => {
    const sizes: [string, number][] = [["O01", 548], ["O02", 605], ["O03", 637], ["O04", 605], ["X09", 605], ["O05", 548], ["Y07", 319]];
    for (const [id, n] of sizes) expect(len(readOracleText(`dl/${id}.dl`)), id).toBe(n);
    const { model, state } = await initial(O1);
    const list = buildDisplayList(model, state);
    expect(serializeDisplayList(list, { maxBytes: 637 }).length).toBe(637);
    expect(() => serializeDisplayList(list, { maxBytes: 636 })).toThrow(/BYTES_LIMIT/);
  });
  it("A.11: the device sizes of rows Z01-Z04", () => {
    for (const [id, args] of [["Z01", [900, 600, 1333]], ["Z02", [16384, 100, 2000]], ["Z03", [16384, 16384, 2000]], ["Z04", [16384, 16384, 250]]] as const) {
      const r = backingSize(args[0], args[1], args[2]);
      expect(JSON.stringify({ bh: r.bh, bw: r.bw, e: r.e }) + "\n", id).toBe(readOracleText(`json/${id}.json`));
    }
  });
});
