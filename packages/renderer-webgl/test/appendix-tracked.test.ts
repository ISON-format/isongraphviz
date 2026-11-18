// Design 14 (1): the Appendix A and B figures asserted from TRACKED files, so that they run on a fresh clone where the git-ignored design file is absent
// (test/appendix-a.test.ts extracts the same blocks from the design and is skipped there). The bytes come from the oracle files plan/G01, plan/G06, gllog/E01,
// E02, E09, E10, xr/X01 and shaders/*.glsl under fixtures/oracles-gl (SHA256SUMS-covered); the literal figures below are those of design 31 Appendix A.
import { describe, expect, it } from "vitest";
import { buildDisplayList, serializeReadout } from "isongraph-visualize-display-list";
import { SHADER_SET_SHA256, SHADER_SOURCES, createGlResources, deleteGlResources, executePlan, parseGlPlan, planGl, readoutFromGl, releaseGlContext, serializePlan, shaderSetBytes } from "../src/index.js";
import { createFakeGl } from "./fake-gl.js";
import { O1, SHADER_DIGEST, bytesOf, initial, readOracle, readOracleText, readState, sha256, textOf } from "./helpers.js";

const len = (s: string): number => bytesOf(s).length;
const log = (f: (l: string[]) => void): string => { const l: string[] = []; f(l); return l.map((x) => x + "\n").join(""); };

describe("Appendix A (gl:) from the tracked oracle files (runs without the design file)", () => {
  it("A.5: the plan of G01 is 936 bytes, b637d7b0..., the prefix is 836 bytes, c5d81633..., the header line is 571 bytes and the table and text lines 265; the implementation writes it", async () => {
    const g01 = readOracle("plan/G01.glplan");
    expect([g01.length, sha256(g01)]).toEqual([936, "b637d7b00e638ae36923b4c1b13b2890bfd7fd93f23f9a0926fbda2823b90b64"]);
    const prefix = g01.slice(0, 836);
    expect(sha256(prefix)).toBe("c5d81633112a6003a29be7f107222aca04b3958c7ec8d2e375a787366c1600c3");
    const lines = textOf(prefix).split("\n");
    expect(len(lines[0]! + "\n")).toBe(571);
    expect(len(lines.slice(1).join("\n"))).toBe(265);
    expect(Array.from(g01.slice(836, 836 + 4))).toEqual([0x00, 0xb5, 0x2a, 0x47]); // the first float32 of the edge buffer: 43701
    const { model, state } = await initial(O1);
    expect(Array.from(serializePlan(planGl(buildDisplayList(model, state))))).toEqual(Array.from(g01));
    expect(Array.from(serializePlan(parseGlPlan(g01)))).toEqual(Array.from(g01));
  });
  it("A.5: the plan of the A.2 state (G06) is 1155 bytes, 6cde050d..., its header line 718 bytes, sizes edge 80, disc 64, arrow 28, and there is no layer-2 draw", async () => {
    const g06 = readOracle("plan/G06.glplan");
    expect([g06.length, sha256(g06)]).toEqual([1155, "6cde050d2fa3c02182c308fd042f9b5369cb15307d66a63564e09557fea0ccea"]);
    const plan = parseGlPlan(g06);
    expect(plan.header.sizes).toEqual({ arrow: 28, disc: 64, edge: 80 });
    expect(plan.header.draws).toEqual([
      { count: 1, first: 0, layer: 1, program: "edge" }, { count: 1, first: 1, layer: 3, program: "edge" }, { count: 1, first: 0, layer: 4, program: "arrow" },
      { count: 1, first: 0, layer: 5, program: "disc" }, { count: 1, first: 1, layer: 6, program: "disc" }, { count: 2, first: 2, layer: 7, program: "disc" },
    ]);
    expect(g06.indexOf(10) + 1).toBe(718);
    const { model } = await initial(O1);
    expect(Array.from(serializePlan(planGl(buildDisplayList(model, readState("../oracles-svg/states/Y03.state.json")))))).toEqual(Array.from(g06));
  });
  it("A.5.1: the creation log (E01) is 2327 bytes, 2126facd..., 64 lines; the frame of G01 (E02) is 2080 bytes, bf76df94...", async () => {
    const e01 = readOracleText("gllog/E01.log"), e02 = readOracleText("gllog/E02.log");
    expect([len(e01), sha256(e01), e01.split("\n").length - 1]).toEqual([2327, "2126facde38e4a1ca6b3a4be63b4f9599075ada8648f3a30f51a93cee6c4a1a4", 64]);
    expect([len(e02), sha256(e02)]).toEqual([2080, "bf76df948456e1c02b9d8c1a1de056f9ee18a9eddb8779b673778f536b55ce14"]);
    expect(log((l) => { createGlResources(createFakeGl({ log: l })); })).toBe(e01);
    const { model, state } = await initial(O1);
    const plan = planGl(buildDisplayList(model, state));
    expect(log((l) => { const gl = createFakeGl({ log: l }); const r = createGlResources(gl); l.length = 0; executePlan(gl, plan, r, { widthPx: 900, heightPx: 600, ink: [34, 34, 34] }); })).toBe(e02);
  });
  it("A.5.2: float32 of 16777215 is ffff7f4b and 16777216 is 0000804b (informational); zero is +0 in a plan", () => {
    const f = (v: number): string => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); };
    expect([f(16777215), f(16777216), f(16777217), f(16777219), f(0)]).toEqual(["ffff7f4b", "0000804b", "0000804b", "0200804b", "00000000"]);
  });
  it("A.5.3: the deletion log (E09) is 291 bytes, 103f5c0b...; the compile failure of disc.fs (E10) is 1229 bytes, bd321573...", () => {
    const e09 = readOracleText("gllog/E09.log"), e10 = readOracleText("gllog/E10.log");
    expect([len(e09), sha256(e09)]).toEqual([291, "103f5c0bb2c0bef91c52692f1e585abe233e49ddd588f3ca97744ff5ab9b66e8"]);
    expect([len(e10), sha256(e10)]).toEqual([1229, "bd32157387d57ac744be9edc81193b6f1b60826876271321442a85da6bd7a6b7"]);
    expect(log((l) => { const gl = createFakeGl({ log: l }); const r = createGlResources(gl); l.length = 0; deleteGlResources(gl, r); releaseGlContext(gl); })).toBe(e09);
    expect(log((l) => { try { createGlResources(createFakeGl({ log: l, failCompile: "disc.fs" })); } catch { /* expected */ } })).toBe(e10);
  });
  it("A.7: the readout of G01 from the plan alone is 975 bytes, 127ffa68...", () => {
    const x01 = readOracleText("xr/X01.xr.json");
    expect([len(x01), sha256(x01)]).toEqual([975, "127ffa680c360cc4698c417129ca6f5c9df1aec086004a5fcb7f3cb791a5214c"]);
    expect(textOf(serializeReadout(readoutFromGl(parseGlPlan(readOracle("plan/G01.glplan")))))).toBe(x01);
  });
  it("A.8: SHADER_SET_SHA256 is eaf76017..., the set is 4490 bytes, no final LF, and the six sources have the quoted sizes and digests", () => {
    const set = shaderSetBytes();
    expect([set.length, sha256(set), SHADER_SET_SHA256]).toEqual([4490, SHADER_DIGEST, SHADER_DIGEST]);
    expect(set[set.length - 1]).toBe(0x7d);
    expect(textOf(readOracle("json/H01.set.json").slice(0, 40))).toBe(textOf(set.slice(0, 40)));
    const quoted: Record<string, [number, string]> = {
      "arrow.fs": [129, "894c4e9db734c2fcc5f42940184807d119f028d2d24bc53d979c038f0450e914"], "arrow.vs": [310, "975cffe180978aaacd4b7e716fd067877e6c9bfd9de03530037fae630f459006"],
      "disc.fs": [1172, "5a783e38303592b018513b272fdcda6ecd4feda10a7a65fa594d65f3be603bf6"], "disc.vs": [476, "d9a3be158baca0282919240a9d729989ad671c8828a531a95fe04f8bf5909d30"],
      "edge.fs": [536, "b537d827b12c32a8c98e0f3b7412bbd71cbe77b1efa0bd7efa0127fb7b69c245"], "edge.vs": [1662, "9dc240db5ea5b60fc26fadc1425da04b4a84b123812fd7a00786beec25f1c62f"],
    };
    for (const [name, [size, digest]] of Object.entries(quoted)) {
      const [p, s] = name.split(".") as ["arrow" | "disc" | "edge", "vs" | "fs"];
      expect([len(SHADER_SOURCES[p][s]), sha256(SHADER_SOURCES[p][s])], name).toEqual([size, digest]);
      expect(readOracleText(`shaders/${name}.glsl`), `${name} equals the corpus file`).toBe(SHADER_SOURCES[p][s]);
    }
    expect(readOracleText("shaders/SHADER_SET_SHA256").trim()).toBe(SHADER_DIGEST);
  });
  it("Appendix B: every source starts with #version 300 es, is ASCII, LF only, ends with one LF, has no TAB, no trailing space and no #include/#extension/#define/#pragma/#line", () => {
    for (const p of ["arrow", "disc", "edge"] as const) for (const s of ["vs", "fs"] as const) {
      const src = SHADER_SOURCES[p][s];
      expect(src.startsWith("#version 300 es\n")).toBe(true);
      expect(src.endsWith("\n") && !src.endsWith("\n\n")).toBe(true);
      expect(/^[\x20-\x7e\n]*$/.test(src)).toBe(true);
      expect(src.includes("\t") || src.includes("\r") || / \n/.test(src)).toBe(false);
      expect(/#(include|extension|define|pragma|line)\b/.test(src)).toBe(false);
    }
  });
});
