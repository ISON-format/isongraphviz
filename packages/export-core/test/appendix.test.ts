// Appendix A of design 32 as unit tests (design 16 (1)) for the figures of export-core: A.8 (the PNG fixture and the bound PNG, hex blocks, and the CRC), A.9
// (X03 block, X01, X02 and the SVG sizes), A.10 (headless state and SVG). 1. extracted from the design file by rules X1-X3 (visible skip when absent);
// 2. the NEVER-SKIPPING equivalent: the same figures hard-coded here against the tracked oracle files and the implementation's bytes.
import { describe, expect, it } from "vitest";
import * as ex from "../src/index.js";
import { crc32 } from "../src/png.js";
import { O1, bytesOf, designText, initial, readOracle, readOracleText, sha256 } from "./helpers.js";

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const FIG = {
  "A.8 fixture": { size: 68, sha: "2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11", file: "png/fixture.png" },
  "A.8 X04": { size: 298, sha: "d2af7f210b9d9028446fbbb2f217a2c498ce69f063637ae98442f0eb6240d10d", file: "png/X04.png" },
  "A.9 X03": { size: 1105, sha: "9f1d38abb903441439fa8ab4d82453ceaae6a339bf800bde6d0e14d45856f675", file: "json/X03.manifest.json" },
  "A.9 X02": { size: 977, sha: "0ff6d50317e8a60332425b75aa0802fe0e58b076f882e4751def582fee84b064", file: "json/X02.manifest.json" },
  "A.9 X01": { size: 819, sha: "7c07d13dd93b8fcfe081fe6ec2c5cc3f163beedbee5d43435a7b739e693cb2f6", file: "json/X01.manifest.json" },
  "A.9 state": { size: 335, sha: "be5391e1488a46ccefeb7068c85106f689f19419cd46570a2492bd5060e7d87d", file: "states/O1.initial.state.json" },
  "A.9 svg": { size: 3232, sha: "28624a30c9cb0afe4bacaa981c383ff0662f7d90ce7c62554ee8c57a982d6671", file: "data/O1.decl.svg" },
  "A.10 svg": { size: 3193, sha: "265736b6b7523681b589fcda23a20a10b574601c603e473bd78c7df7d1977653", file: "data/O1.svg" },
} as const;

describe("Appendix A (export-core figures) from the TRACKED oracle files (never skipped)", () => {
  for (const [name, f] of Object.entries(FIG)) it(`${name}: the tracked file has the quoted size and SHA-256`, () => { expect(readOracle(f.file).length).toBe(f.size); expect(sha256(readOracle(f.file))).toBe(f.sha); });
  it("the implementation reproduces A.8 (bound PNG, CRC 27d7f4f7 is the figure of the chunk), A.9 (manifests, svg, state) and A.10 (state, svg) byte for byte", async () => {
    const { model, state } = await initial(O1);
    const layout = readOracle(O1.layout);
    const x01 = await ex.exportBundle(model, state, layout, { svg: false });
    const x02 = await ex.exportBundle(model, state, layout);
    const x03 = await ex.exportBundle(model, state, layout, { png: readOracle("png/fixture.png") });
    expect(sha256(x01.manifestBytes)).toBe(FIG["A.9 X01"].sha);
    expect(sha256(x02.manifestBytes)).toBe(FIG["A.9 X02"].sha);
    expect(sha256(x03.manifestBytes)).toBe(FIG["A.9 X03"].sha);
    expect(sha256(x03.files.get("png")!)).toBe(FIG["A.8 X04"].sha);
    expect(sha256(x02.files.get("svg")!)).toBe(FIG["A.9 svg"].sha);
    expect(x02.files.get("state")!.length).toBe(335);
    expect(sha256(x02.files.get("state")!)).toBe(FIG["A.9 state"].sha);
    const h = await ex.renderHeadless({ sceneBytes: readOracle(O1.scene), layoutBytes: readOracle(O1.layout), outputs: ["state", "svg"] });
    expect(sha256(h.files.get("state")!)).toBe(FIG["A.9 state"].sha);
    expect(sha256(h.files.get("svg")!)).toBe(FIG["A.10 svg"].sha);
    const png = readOracle("png/X04.png");
    const crcOf = (hexStr: string): string => hexStr;
    expect(crcOf(hex(png.slice(33 + 8 + 218, 33 + 12 + 218)))).toBe(crc32(png.slice(37, 37 + 4 + 218)).toString(16).padStart(8, "0"));
    expect(readOracleText("APPENDIX-A.tsv")).toContain("A.8 crc\tfigure");
  });
});

const design = designText();
describe.skipIf(design === undefined)("Appendix A extracted from the design file (rules X1-X3)", () => {
  const re = /\((?:(lines|hex), )?(\d+) bytes, SHA-256 `([0-9a-f]{64})`\):\n\n```text\n([\s\S]*?)\n```/g;
  const blocks = (): { kind: string; size: number; sha: string; bytes: Uint8Array }[] => [...design!.matchAll(re)].map((m) => {
    const kind = m[1] ?? "text";
    return { kind, size: Number(m[2]), sha: m[3]!, bytes: kind === "hex" ? Uint8Array.from(m[4]!.trim().match(/../g)!.map((h) => parseInt(h, 16))) : bytesOf(kind === "lines" ? m[4]! + "\n" : m[4]!) };
  });
  it("the file has no CR and every gated block has its quoted size and SHA-256", () => {
    expect(design!.includes("\r")).toBe(false);
    for (const b of blocks()) { expect(b.bytes.length).toBe(b.size); expect(sha256(b.bytes)).toBe(b.sha); }
  });
  for (const name of ["A.8 fixture", "A.8 X04", "A.9 X03"] as const) it(`${name}: the block equals the tracked file`, () => {
    const b = blocks().find((x) => x.sha === FIG[name].sha);
    expect(b, name).toBeDefined();
    expect(Array.from(b!.bytes)).toEqual(Array.from(readOracle(FIG[name].file)));
  });
});
if (design === undefined) console.warn("[appendix] SKIPPED: the design file docs/isongraph-visualize-blueprint/32-INTERACTION-A11Y-EXPORT-DESIGN.md is absent (git-ignored, kept local); the tracked-file equivalent above still runs");
