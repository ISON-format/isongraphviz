// Design 14 (1): the gl: items of Appendix A (A.5, A.5.1-A.5.3, A.7, A.8, A.10) and Appendix B as unit tests. The code blocks and the quoted sizes and SHA-256
// values are EXTRACTED from the design file (docs/isongraph-visualize-blueprint/31-CANVAS-WEBGL-DESIGN.md, git-ignored and local) by rule X1 (the block text
// plus one final LF) and X2 (a composite is a printed prefix block followed by printed hex lines, unhexed) and compared with the implementation's output. If
// the design file is absent the whole file is skipped, loudly; test/appendix-tracked.test.ts is the never-skipping equivalent from tracked oracle files.
import { describe, expect, it } from "vitest";
import { buildDisplayList, serializeReadout } from "isongraph-visualize-display-list";
import { SHADER_SET_SHA256, SHADER_SOURCES, createGlResources, deleteGlResources, executePlan, parseGlPlan, planGl, readoutFromGl, releaseGlContext, serializePlan, shaderSetBytes } from "../src/index.js";
import { createFakeGl } from "./fake-gl.js";
import { O1, SHADER_DIGEST, blockAfter, designText, initial, sha256, textOf } from "./helpers.js";

const md = designText();
const NOTE = "SKIPPED: design file docs/isongraph-visualize-blueprint/31-CANVAS-WEBGL-DESIGN.md is not present (it is git-ignored and local)";
if (md === undefined) console.warn(`[appendix-a] ${NOTE}`);
const text = md ?? "";
const bytes = (s: string): number => new TextEncoder().encode(s).length;
const unhex = (s: string): Uint8Array => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));

async function g01Plan() { const { model, state } = await initial(O1); return planGl(buildDisplayList(model, state)); }

describe.skipIf(md === undefined)(md === undefined ? `Appendix A and B extraction (${NOTE})` : "Appendix A and B extraction", () => {
  it("the design file contains no CR (rule X1 extracts by LF)", () => { expect(text.includes("\r")).toBe(false); });

  it("A.5 (X1 + X2): the prefix block is 836 bytes, c5d81633...; prefix + the unhexed hex lines is the plan of G01, 936 bytes, b637d7b0...", async () => {
    const prefix = blockAfter(text, "**A.5 The plan (`igr-gl/1`) of `G01`.**") + "\n";
    expect([bytes(prefix), sha256(prefix)]).toEqual([836, "c5d81633112a6003a29be7f107222aca04b3958c7ec8d2e375a787366c1600c3"]);
    const hex = blockAfter(text, "Hex block (X2: three lines").split("\n");
    expect(hex.length).toBe(3);
    const whole = new Uint8Array(936);
    const head = new TextEncoder().encode(prefix);
    whole.set(head);
    let at = head.length;
    for (const line of hex) { const b = unhex(line); whole.set(b, at); at += b.length; }
    expect(at).toBe(936);
    expect(sha256(whole)).toBe("b637d7b00e638ae36923b4c1b13b2890bfd7fd93f23f9a0926fbda2823b90b64");
    const mine = serializePlan(await g01Plan());
    expect(Array.from(mine)).toEqual(Array.from(whole));
    expect([mine.length, sha256(mine)]).toEqual([936, "b637d7b00e638ae36923b4c1b13b2890bfd7fd93f23f9a0926fbda2823b90b64"]);
    expect(Array.from(serializePlan(parseGlPlan(whole)))).toEqual(Array.from(whole));
  });
  it("A.5 figure: the plan of the A.2 state is 1155 bytes, 6cde050d... (a figure without a printed block, checked against the implementation)", async () => {
    const { model } = await initial(O1);
    const { readState } = await import("./helpers.js");
    const plan = planGl(buildDisplayList(model, readState("../oracles-svg/states/Y03.state.json")));
    const b = serializePlan(plan);
    expect([b.length, sha256(b)]).toEqual([1155, "6cde050d2fa3c02182c308fd042f9b5369cb15307d66a63564e09557fea0ccea"]);
    expect(plan.header.sizes).toEqual({ arrow: 28, disc: 64, edge: 80 });
    expect(text).toContain("The plan of the A.2 state (row `gl:G06`) is 1155 bytes, SHA-256 `6cde050d2fa3c02182c308fd042f9b5369cb15307d66a63564e09557fea0ccea`");
  });
  it("A.5.1: the creation log (E01) is the block, 2327 bytes, 2126facd..., 64 lines; the frame of G01 (E02) is 2080 bytes, bf76df94...", async () => {
    const log: string[] = [];
    const gl = createFakeGl({ log });
    const res = createGlResources(gl);
    const creation = log.map((l) => l + "\n").join("");
    expect(creation).toBe(blockAfter(text, "**A.5.1 The executor's logged sequence (7.5): complete resource creation**") + "\n");
    expect([bytes(creation), sha256(creation), log.length]).toEqual([2327, "2126facde38e4a1ca6b3a4be63b4f9599075ada8648f3a30f51a93cee6c4a1a4", 64]);
    log.length = 0;
    executePlan(gl, await g01Plan(), res, { widthPx: 900, heightPx: 600, ink: [34, 34, 34] });
    const frame = log.map((l) => l + "\n").join("");
    expect(frame).toBe(blockAfter(text, "Frame for `G01` (row `gl:E02`") + "\n");
    expect([bytes(frame), sha256(frame)]).toEqual([2080, "bf76df948456e1c02b9d8c1a1de056f9ee18a9eddb8779b673778f536b55ce14"]);
  });
  it("A.5.2: the float32 bytes just above the limit (informational) and the plan's +0", () => {
    const f = (v: number): string => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); };
    expect([16777215, 16777216, 16777217, 16777219, 0].map(f)).toEqual(["ffff7f4b", "0000804b", "0000804b", "0200804b", "00000000"]);
    expect(text).toContain("`16777215` -> `ffff7f4b`, `16777216` -> `0000804b`, `16777217` -> `0000804b`, `16777219` -> `0200804b`; `0` is `00000000` (never `00000080`)");
  });
  it("A.5.3: the deletion log (E09) is the block, 291 bytes, 103f5c0b...; the compile failure of disc.fs (E10) is the block, 1229 bytes, bd321573...", () => {
    const log: string[] = [];
    const gl = createFakeGl({ log });
    const res = createGlResources(gl);
    log.length = 0;
    deleteGlResources(gl, res); releaseGlContext(gl);
    const dispose = log.map((l) => l + "\n").join("");
    expect(dispose).toBe(blockAfter(text, "**A.5.3 Deletion and failure logs.**") + "\n");
    expect([bytes(dispose), sha256(dispose)]).toEqual([291, "103f5c0bb2c0bef91c52692f1e585abe233e49ddd588f3ca97744ff5ab9b66e8"]);
    const l2: string[] = [];
    try { createGlResources(createFakeGl({ log: l2, failCompile: "disc.fs" })); } catch { /* expected */ }
    const e10 = l2.map((l) => l + "\n").join("");
    expect(e10).toBe(blockAfter(text, "A compile failure of `disc.fs` at initialize (row `gl:E10`") + "\n");
    expect([bytes(e10), sha256(e10)]).toEqual([1229, "bd32157387d57ac744be9edc81193b6f1b60826876271321442a85da6bd7a6b7"]);
  });
  it("A.7: the readout of G01 from the plan alone is the block, 975 bytes, 127ffa68...", async () => {
    const r = textOf(serializeReadout(readoutFromGl(await g01Plan())));
    expect(r).toBe(blockAfter(text, "**A.7 The readout of `G01`**") + "\n");
    expect([bytes(r), sha256(r)]).toEqual([975, "127ffa680c360cc4698c417129ca6f5c9df1aec086004a5fcb7f3cb791a5214c"]);
  });
  it("A.8: shaderSetBytes() is 4490 bytes and SHADER_SET_SHA256 is eaf76017...; the six sources have the quoted sizes and digests", () => {
    const set = shaderSetBytes();
    expect([set.length, sha256(set), SHADER_SET_SHA256]).toEqual([4490, SHADER_DIGEST, SHADER_DIGEST]);
    expect(text).toContain("`SHADER_SET_SHA256 = eaf76017c4e62f6a445e9b550ace6301d75ea22143f27e9c66d9e97a631e6968`");
    const a8 = text.slice(text.indexOf("**A.8 Shader digests.**"));
    const quoted = [...a8.slice(0, a8.indexOf("\n")).matchAll(/`(\w+\.\w+)` (\d+) `([0-9a-f]{64})`/g)].map((m) => [m[1], Number(m[2]), m[3]]);
    expect(quoted.length).toBe(6);
    for (const [name, size, digest] of quoted as [string, number, string][]) {
      const [p, s] = name.split(".") as ["arrow" | "disc" | "edge", "vs" | "fs"];
      expect([bytes(SHADER_SOURCES[p][s]), sha256(SHADER_SOURCES[p][s])], name).toEqual([size, digest]);
    }
  });
  it("Appendix B: each of the six blocks plus one final LF is the shader source, with the quoted byte count", () => {
    const cases: [string, "arrow" | "disc" | "edge", "vs" | "fs", number][] = [
      ["**B.1 arrow vertex shader** (310 bytes):", "arrow", "vs", 310], ["**B.1 arrow fragment shader** (129 bytes):", "arrow", "fs", 129],
      ["**B.2 disc vertex shader** (476 bytes):", "disc", "vs", 476], ["**B.2 disc fragment shader** (1172 bytes):", "disc", "fs", 1172],
      ["**B.3 edge vertex shader** (1662 bytes):", "edge", "vs", 1662], ["**B.3 edge fragment shader** (536 bytes):", "edge", "fs", 536],
    ];
    for (const [marker, p, s, n] of cases) {
      const src = blockAfter(text, marker, "glsl") + "\n";
      expect(SHADER_SOURCES[p][s], marker).toBe(src);
      expect(bytes(src), marker).toBe(n);
    }
  });
  it("A.10: the plan header of the far list is the quoted text and the far edge clips to the single instance (-256000, 566635) -> (1156000, 566823)", async () => {
    const a10 = text.slice(text.indexOf("**A.10 The plan guard rule on a far edge"), text.indexOf("**A.11 Device sizes"));
    const quotedHeader = /`(\{"artifact":"1111[^`]*)`/.exec(a10)![1]!;
    const { clipSegment } = await import("../src/clip.js");
    expect(clipSegment([-2000000000, 300000], [1000000001, 700003], 900, 600, 256000)).toEqual([-256000, 566635, 1156000, 566823]);
    expect(a10).toContain("`(-256000, 566635) -> (1156000, 566823)`");
    expect(a10).toContain("`cn = [[1,1],[2,0]]`");
    const list = {
      format: "igr-dl/1", width: 900, height: 600, directed: true, artifactSha256: "1".repeat(64), sceneSha256: "2".repeat(64), layoutSha256: "3".repeat(64),
      nodes: [{ id: "s:a", type: "t" }, { id: "s:b", type: "t" }], edges: [{ ord: "0", rel: "r", src: { id: "s:a", type: "t" }, tgt: { id: "s:b", type: "t" } }],
      records: [["E", 3, 0, 0, -2000000000, 300000, 1000000001, 700003], ["A", 3, 1000000001, 700003, 999990001, 699999, 999991001, 699000], ["N", 1, 0, 1, -2000000000, 300000], ["N", 2, 0, 0, 1000000001, 700003]],
    };
    const b = serializePlan(planGl(list as never));
    expect(textOf(b.slice(0, b.indexOf(10)))).toBe(quotedHeader);
  });
});
