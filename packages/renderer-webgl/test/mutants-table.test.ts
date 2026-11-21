// Guards the mutation harness without running it: the K table has the 172 ids of the corpus MUTANTS.tsv (K01..K172), every patch applies exactly the stated
// number of times to the CURRENT src of renderer-webgl (so a refactoring cannot silently turn a mutant into a no-op), and production code carries no
// switchable variants.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MUTANTS } from "../scripts/mutants-table.mjs";
import { EXTRA_MUTANTS } from "../scripts/mutants-extra.mjs";
import { ORACLE_DIR, PKG_DIR } from "./helpers.js";

const SRC = { gl: join(PKG_DIR, "src") } as const;

describe("the K table (scripts/mutants-table.mjs)", () => {
  it("matches the ids of the corpus MUTANTS.tsv, each with a description and at least one patch", () => {
    const ids = readFileSync(join(ORACLE_DIR, "MUTANTS.tsv"), "utf8").split("\n").slice(1).filter((l) => l !== "").map((l) => l.split("\t")[0]);
    expect(ids.length).toBe(172);
    expect(MUTANTS.map((m) => m.id)).toEqual(ids);
    for (const m of MUTANTS) { expect(m.desc, m.id).toBeTruthy(); expect(m.patches.length, m.id).toBeGreaterThan(0); }
  });
  it("every patch applies exactly `count` times to the current src and changes it", () => {
    for (const m of [...MUTANTS, ...EXTRA_MUTANTS]) for (const p of m.patches) {
      const text = readFileSync(join(SRC[p.pkg], p.file), "utf8");
      expect(text.split(p.find).length - 1, `${m.id}: ${p.pkg}/${p.file}: ${p.find.slice(0, 60)}`).toBe(p.count);
      expect(p.replace, m.id).not.toBe(p.find);
    }
  });
  it("the 13 extra mutants (audit M-11 and design rev 5) have ids that are not corpus ids", () => {
    const ids = new Set(readFileSync(join(ORACLE_DIR, "MUTANTS.tsv"), "utf8").split("\n").slice(1).map((l) => l.split("\t")[0]));
    expect(EXTRA_MUTANTS.map((m) => m.id)).toEqual(["A01", "A06", "A15", "A16", "A17", "A22", "A33", "F1", "F2", "F3", "C1", "C2", "C3"]);
    for (const m of EXTRA_MUTANTS) expect(ids.has(m.id), m.id).toBe(false);
  });
  it("heavy rows named by a mutant exist in the harness", () => {
    for (const m of MUTANTS) for (const h of m.heavy ?? []) expect(["U10", "U11", "U12"]).toContain(h);
  });
  it("production code has no switchable variants: no mutant, variant, MUT, process.env or K-number switch in src", () => {
    for (const dir of Object.values(SRC)) for (const f of readdirSync(dir, { recursive: true }) as string[]) {
      if (!f.endsWith(".ts")) continue;
      const t = readFileSync(join(dir, f), "utf8");
      expect(t, f).not.toMatch(/\b(MUTANT|MUTATION|VARIANT|process\.env|globalThis\.__)\b|\bK\d{2,3}\b/);
    }
  });
});
