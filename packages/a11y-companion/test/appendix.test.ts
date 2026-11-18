// Appendix A of design 32 as unit tests (design 16 (1)) for the figures of a11y-companion: A.1 (C01, block), A.2 (C02), A.6 (G01, block), A.7 (P01, P02 block,
// P04, P07, P08, P09, Q01-Q04), A.13 (C05, C07 sizes). 1. extracted from the design file by rules X1-X3 (visible skip when the file is absent: it is
// git-ignored); 2. the NEVER-SKIPPING equivalent: the same figures hard-coded here against the tracked oracle files and the implementation's bytes.
import { describe, expect, it } from "vitest";
import * as ia from "../src/index.js";
import { bytesOf, designText, readOracle, readOracleText, sha256 } from "./helpers.js";
import { loadCorpus, runRow, type Impl } from "./oracle/runner.js";
import { ORACLE_DIR } from "./helpers.js";

const FIGURES = {
  "A.1 C01": { size: 1544, sha: "c84b5248c908abe60b9e3cc12d3aad213f174255b10e042dab4d5adb58288fc8", file: "trees/C01.tree.json", row: "C01" },
  "A.2 C02": { size: 1561, sha: "1ce787b6416b0792213cf04efcec73e6a918fed51652c2b0213caec29abcd7fa", file: "trees/C02.tree.json", row: "C02" },
  "A.6 G01": { size: 1237, sha: "4f0e3a89220308f11741898acb57a7c5856dfe146adadb41333e145d5b996706", file: "gates/G01.gate.json", row: "G01" },
  "A.7 P01": { size: 5833, sha: "eebe3e25567e1b0a9f431ab6a63aed2f9075a0a36d510d65ef6ac88e2cb88464", file: "plans/P01.plan.txt", row: "P01" },
  "A.7 P02": { size: 154, sha: "c17b2daf62e1508d2ccbc1b325ed05150b470953936ce240b513e51c8f95e831", file: "plans/P02.plan.txt", row: "P02" },
  "A.7 P04": { size: 9025, sha: "0a8f88e6a1643ee6cfd908604ae028ef035262fdb63a55c9274656ffd81362c6", file: "plans/P04.plan.txt", row: "P04" },
  "A.7 P07": { size: 4513, sha: "e5cda9181fb22629bedb8403d1bb99254e0cb5eed6aa8b28ecef422b7b886d74", file: "plans/P07.plan.txt", row: "P07" },
  "A.7 P08": { size: 13186, sha: "b960222318f986b71bb47fa406afde90444b2cf9ee67af60e4626d30147664bf", file: "plans/P08.plan.txt", row: "P08" },
  "A.7 P09": { size: 51, sha: "0d42bcdc646972c2f2a9194168894b49e6041b8ae05207ed7d762fc0ffe5759e", file: "plans/P09.plan.txt", row: "P09" },
  "A.7 Q01": { size: 7216, sha: "da70db015819f7e39e6dbbd5ce332647caa36bde89dfe5dc9cbc2156605446d4", file: "logs/Q01.log.txt", row: "Q01" },
  "A.7 Q02": { size: 175, sha: "fd55aa65009b46c44a11b51440d7e3415a773c7de987b5f38c8c411cec19e764", file: "logs/Q02.log.txt", row: "Q02" },
  "A.7 Q03": { size: 7251, sha: "01fb88ee6c7a2b6a12e6fa10a9d47c544caa256c077cccd4c6f2d6bbbc58ab74", file: "logs/Q03.log.txt", row: "Q03" },
  "A.7 Q04": { size: 4934, sha: "4356b2e7a416903f908191a9ee2de3f6eb1bb02e7a7036fcbc301dd27d3618dc", file: "logs/Q04.log.txt", row: "Q04" },
  "A.13 C05": { size: 49774, sha: "", file: "trees/C05.tree.json", row: "C05" },
  "A.13 C07": { size: 49774, sha: "", file: "trees/C07.tree.json", row: "C07" },
} as const;
const impl = ia as unknown as Impl;
const corpus = loadCorpus(ORACLE_DIR);

describe("Appendix A (a11y-companion figures) from the TRACKED oracle files (never skipped)", () => {
  for (const [name, f] of Object.entries(FIGURES)) {
    it(`${name}: the tracked file has the quoted size${f.sha ? " and SHA-256" : ""}, and the implementation reproduces it (row ${f.row})`, async () => {
      const tracked = readOracle(f.file);
      expect(tracked.length).toBe(f.size);
      if (f.sha) expect(sha256(tracked)).toBe(f.sha);
      await runRow(impl, corpus, corpus.byId.get(f.row)!); // byte equality with the tracked file
    });
  }
  it("the quoted figures are REPRODUCED in APPENDIX-A.tsv", () => {
    const rows = readOracleText("APPENDIX-A.tsv").split("\n").slice(1).filter((l) => l !== "").map((l) => l.split("\t"));
    for (const [name, f] of Object.entries(FIGURES)) {
      const r = rows.find((x) => x[0] === name);
      expect(r, name).toBeDefined();
      expect(r![3]).toBe(String(f.size));
      expect(r![7]).toBe("REPRODUCED");
    }
  });
});

const design = designText();
describe.skipIf(design === undefined)("Appendix A extracted from the design file (rules X1-X3)", () => {
  const re = /\((?:(lines|hex), )?(\d+) bytes, SHA-256 `([0-9a-f]{64})`\):\n\n```text\n([\s\S]*?)\n```/g;
  const blocks = (): { kind: string; size: number; sha: string; bytes: Uint8Array }[] => [...design!.matchAll(re)].map((m) => {
    const kind = m[1] ?? "text";
    const bytes = kind === "hex" ? Uint8Array.from(m[4]!.trim().match(/../g)!.map((h) => parseInt(h, 16))) : bytesOf(kind === "lines" ? m[4]! + "\n" : m[4]!);
    return { kind, size: Number(m[2]), sha: m[3]!, bytes };
  });
  it("the file has no CR and the 12 gated blocks have their quoted size and SHA-256", () => {
    expect(design!.includes("\r")).toBe(false);
    expect(blocks().length).toBe(12);
    for (const b of blocks()) { expect(b.bytes.length).toBe(b.size); expect(sha256(b.bytes)).toBe(b.sha); }
  });
  for (const name of ["A.1 C01", "A.6 G01", "A.7 P02"] as const) {
    it(`${name}: the block equals the tracked file`, () => {
      const f = FIGURES[name];
      const b = blocks().find((x) => x.sha === f.sha);
      expect(b, name).toBeDefined();
      expect(Array.from(b!.bytes)).toEqual(Array.from(readOracle(f.file)));
    });
  }
});
if (design === undefined) console.warn("[appendix] SKIPPED: the design file docs/isongraph-visualize-blueprint/32-INTERACTION-A11Y-EXPORT-DESIGN.md is absent (git-ignored, kept local); the tracked-file equivalent above still runs");
