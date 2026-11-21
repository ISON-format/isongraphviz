// Guards the mutation harness without running it: the K table has exactly the 106 mutants of the corpus MUTANTS.tsv whose named killer rows belong to
// export-core (X, H), every patch applies exactly the stated number of times to the CURRENT src (so a refactoring cannot silently turn a mutant
// into a no-op), and production code carries no switchable variants.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTRA_MUTANTS, MUTANTS } from "../scripts/mutants-table.mjs";
import { ORACLE_DIR, PKG_DIR } from "./helpers.js";

const SRC = join(PKG_DIR, "src");
const ids = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `K${String(from + i).padStart(2, "0")}`);
/** The K ids of this package: the named killers of design 15.6 are rows E, I, V, L or B. */
const EXPECTED = [...ids(63, 71), ...ids(109, 120), "K127", ...ids(154, 200), ...ids(233, 268), "K311"];

describe("the K table (scripts/mutants-table.mjs)", () => {
  const corpus = new Map(readFileSync(join(ORACLE_DIR, "MUTANTS.tsv"), "utf8").split("\n").slice(1).filter((l) => l !== "").map((l) => { const c = l.split("\t"); return [c[0]!, { named: c[2]!, mutation: c[4]! }] as const; }));
  it("has the 106 mutants of this package, each in the corpus table with a description and at least one patch", () => {
    expect(EXPECTED.length).toBe(106);
    expect(MUTANTS.map((m) => m.id)).toEqual(EXPECTED);
    for (const m of MUTANTS) { expect(corpus.has(m.id), m.id).toBe(true); expect(m.desc, m.id).toBeTruthy(); expect(m.patches.length, m.id).toBeGreaterThan(0); }
  });
  it("is exactly the set of corpus mutants whose named killers are rows of X, H (K84 names C16 and I51: a mutant of interaction-core's table)", () => {
    const mine = [...corpus].filter(([, v]) => v.named.split(",").some((r) => /^[XH]\d/.test(r))).map(([id]) => id);
    expect(mine).toEqual(EXPECTED);
  });
  it("every patch applies exactly `count` times to the current src and changes it", () => {
    for (const m of [...MUTANTS, ...EXTRA_MUTANTS]) for (const p of m.patches) {
      const text = readFileSync(join(SRC, p.file), "utf8");
      expect(text.split(p.find).length - 1, `${m.id}: ${p.file}: ${p.find.slice(0, 70)}`).toBe(p.count);
      expect(p.replace, m.id).not.toBe(p.find);
    }
  });
  it("production code has no switchable variants: no mutant, variant, MUT or K-number switch, no environment read", () => {
    for (const f of readdirSync(SRC, { recursive: true }) as string[]) {
      if (!f.endsWith(".ts")) continue;
      expect(readFileSync(join(SRC, f), "utf8"), f).not.toMatch(/\b(MUTANT|MUTATION|VARIANT|process\.env|globalThis\.__)\b|\bK\d{2,3}\b/);
    }
  });
});
