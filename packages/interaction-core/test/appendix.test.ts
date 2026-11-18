// Appendix A of design 32 as unit tests (design 16 (1)), for the blocks that belong to interaction-core: A.3 (the default binding table, row B12), A.4 (the
// transcript of I50), A.5 (V22), A.11 (the key tokens, B01) and A.14 (the reveal, V30).
//   1. extracted from the design file by rules X1-X3 (skipped with a VISIBLE message when the design file is absent: it is git-ignored, kept local);
//   2. the NEVER-SKIPPING equivalent: the same figures hard-coded here (size and SHA-256 as quoted in Appendix A) against the tracked files of
//      fixtures/oracles-ia, and the implementation's bytes against both.
import { describe, expect, it } from "vitest";
import { initialState, reduce, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { canonicalBytesSigned } from "isongraph-visualize-scene-core/primitives";
import { DEFAULT_BINDINGS, createMachine, keyToken, serializeBindings, serializeMachine, serializeStep, step } from "../src/index.js";
import { G9, O1, bytesOf, designText, loadModel, readOracle, readOracleText, sha256 } from "./helpers.js";

/** The gated blocks the design quotes: [heading marker, size, sha256]. */
const FIGURES = {
  "A.3 B12": { size: 2680, sha: "f19192d6c6bcdf960d5d746c90530e6e05e065c7b51d77829afe65d99255409f", file: "json/B12.bindings.json" },
  "A.4 I50 events": { size: 516, sha: "d1c3138d0672180c168e1dbd79443256af76eea6e42163ca7285630b9dfeb1a9", file: "inputs/I50.events.json" },
  "A.4 I50 result": { size: 557, sha: "bc5959605ef452b6dc9f67acac35a890f0c8ec0bebc5057232e0b29a66282df8", file: "transcripts/I50.result.json" },
  "A.5 V22": { size: 241, sha: "e7fa9807479a84124ce5c2c1e8d8f00ee3d53db2cf663b099f68b43b42e231d3", file: "transcripts/V22.result.json" },
  "A.11 B01": { size: 243, sha: "ba08e28a7fd980c441ef5f543e28bab3d201aad26a353cf8b9163ccf269dae0b", file: "json/B01.tokens.json" },
  "A.14 V30": { size: 293, sha: "85c14b046034fbc9986258bdec847bd3e6920feae1eeb2ef5327e9e44a62e0f4", file: "transcripts/V30.result.json" },
} as const;
type Figure = keyof typeof FIGURES;

/** Rules X1-X3: every fenced block whose preceding heading quotes `(N bytes, SHA-256 h)`, `(lines, N bytes, SHA-256 h)` or `(hex, N bytes, SHA-256 h)`. */
function extractBlocks(md: string): { kind: "text" | "lines" | "hex"; size: number; sha: string; bytes: Uint8Array }[] {
  const out: { kind: "text" | "lines" | "hex"; size: number; sha: string; bytes: Uint8Array }[] = [];
  const re = /\((?:(lines|hex), )?(\d+) bytes, SHA-256 `([0-9a-f]{64})`\):\n\n```text\n([\s\S]*?)\n```/g;
  for (const m of md.matchAll(re)) {
    const kind = (m[1] ?? "text") as "text" | "lines" | "hex";
    const body = m[4]!;
    let bytes: Uint8Array;
    if (kind === "hex") bytes = Uint8Array.from(body.trim().match(/../g)!.map((h) => parseInt(h, 16)));
    else bytes = bytesOf(kind === "lines" ? body + "\n" : body); // X1: no final LF; X2: block text plus one final LF
    out.push({ kind, size: Number(m[2]), sha: m[3]!, bytes });
  }
  return out;
}

// ---- the implementation's bytes for each figure -------------------------------------------------------------------------------------------------------
async function transcript(model: RenderModel, state: SemanticState, events: unknown[]): Promise<Uint8Array> {
  let m = createMachine();
  const steps: unknown[] = [];
  for (const e of events) { const r = step(m, e, model, state); steps.push(JSON.parse(new TextDecoder().decode(serializeStep(r)))); m = r.machine; }
  return canonicalBytesSigned({ final_state: JSON.parse(new TextDecoder().decode(serializeMachine(m))), steps } as never);
}
async function produce(f: Figure): Promise<Uint8Array> {
  switch (f) {
    case "A.3 B12": return serializeBindings(DEFAULT_BINDINGS);
    case "A.4 I50 events": return readOracle(FIGURES[f].file); // an input: the same file as the block
    case "A.4 I50 result": {
      const model = await loadModel(O1.scene, O1.layout);
      return transcript(model, initialState(model, { width: 900, height: 600 }), JSON.parse(readOracleText("inputs/I50.events.json")) as unknown[]);
    }
    case "A.5 V22": {
      const model = await loadModel(O1.scene, O1.layout);
      const s = reduce(model, initialState(model, { width: 900, height: 600 }), { type: "focus", target: { node: { id: "i:1", type: "person" } } }).state;
      return transcript(model, s, [{ type: "key", t: 0, key: "ArrowRight", mods: 0 }]);
    }
    case "A.11 B01": {
      const keys = JSON.parse(readOracleText("inputs/B01.keys.json")) as string[];
      return canonicalBytesSigned(keys.map((k) => { const t = keyToken(k); return t === undefined ? [k] : [k, t]; }) as never);
    }
    case "A.14 V30": {
      const model = await loadModel(G9.scene, G9.layout);
      let s = reduce(model, initialState(model, { width: 900, height: 600 }), { type: "set-viewport", center_x: 0, center_y: 0, zoom: 2680 }).state;
      s = reduce(model, s, { type: "focus", target: { node: { id: "s:b", type: "p" } } }).state;
      return transcript(model, s, [{ type: "key", t: 0, key: "ArrowRight", mods: 0 }]);
    }
  }
}

describe("Appendix A from the TRACKED oracle files (never skipped)", () => {
  for (const f of Object.keys(FIGURES) as Figure[]) {
    it(`${f}: the tracked file has the quoted size and SHA-256, and the implementation reproduces it byte for byte`, async () => {
      const { size, sha, file } = FIGURES[f];
      const tracked = readOracle(file);
      expect(tracked.length).toBe(size);
      expect(sha256(tracked)).toBe(sha);
      const mine = await produce(f);
      expect(mine.length).toBe(size);
      expect(sha256(mine)).toBe(sha);
    });
  }
  it("the quoted figures are the ones recorded as REPRODUCED in APPENDIX-A.tsv", () => {
    const rows = readOracleText("APPENDIX-A.tsv").split("\n").slice(1).filter((l) => l !== "").map((l) => l.split("\t"));
    for (const f of Object.keys(FIGURES) as Figure[]) {
      if (f === "A.14 V30" || f === "A.11 B01") continue; // listed under their own headings below
      const r = rows.find((x) => x[0] === f);
      expect(r, f).toBeDefined();
      expect(r![3]).toBe(String(FIGURES[f].size));
      expect(r![4]).toBe(FIGURES[f].sha);
      expect(r![7]).toBe("REPRODUCED");
    }
    for (const f of ["A.11 B01", "A.14 V30"]) { const r = rows.find((x) => x[0] === f); expect(r, f).toBeDefined(); expect(r![7]).toBe("REPRODUCED"); }
  });
});

const design = designText();
describe.skipIf(design === undefined)("Appendix A extracted from the design file (rules X1-X3)", () => {
  it("the file has no CR and every gated block has its quoted size and SHA-256", () => {
    expect(design!.includes("\r")).toBe(false);
    const blocks = extractBlocks(design!);
    expect(blocks.length).toBe(12);
    for (const b of blocks) { expect(b.bytes.length, b.sha).toBe(b.size); expect(sha256(b.bytes), String(b.size)).toBe(b.sha); }
  });
  for (const f of Object.keys(FIGURES) as Figure[]) {
    it(`${f}: the block and the implementation agree`, async () => {
      const { size, sha } = FIGURES[f];
      const block = extractBlocks(design!).find((b) => b.sha === sha);
      expect(block, `${f} block with SHA-256 ${sha}`).toBeDefined();
      expect(block!.size).toBe(size);
      const mine = await produce(f);
      expect(sha256(mine)).toBe(block!.sha);
      expect(Array.from(mine)).toEqual(Array.from(block!.bytes));
    });
  }
});
if (design === undefined) console.warn("[appendix] SKIPPED: the design file docs/isongraph-visualize-blueprint/32-INTERACTION-A11Y-EXPORT-DESIGN.md is absent (git-ignored, kept local); the tracked-file equivalent above still runs");
