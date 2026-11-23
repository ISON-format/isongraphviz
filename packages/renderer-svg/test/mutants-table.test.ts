// Guards the mutation harness without running it: the K table has the 114 ids of design 15.6 plus K115-K126 (R-H, design 30 rev 5), every patch applies exactly the stated number of
// times to the CURRENT src/ (so a refactoring cannot silently turn a mutant into a no-op), and production code carries no switchable variants.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MUTANTS } from "../scripts/mutants-table.mjs";
import { ORACLE_DIR, PKG_DIR } from "./helpers.js";

const SRC = join(PKG_DIR, "src");

describe("the K table (scripts/mutants-table.mjs)", () => {
  it("has K01..K126 once each, each with a description and at least one patch", () => {
    expect(MUTANTS.map((m) => m.id)).toEqual(Array.from({ length: 126 }, (_, i) => `K${String(i + 1).padStart(2, "0")}`));
    for (const m of MUTANTS) { expect(m.desc, m.id).toBeTruthy(); expect(m.patches.length, m.id).toBeGreaterThan(0); }
  });
  it("matches the ids of the corpus MUTANTS.tsv", () => {
    const ids = readFileSync(join(ORACLE_DIR, "MUTANTS.tsv"), "utf8").split("\n").slice(1).filter((l) => l !== "").map((l) => l.split("\t")[0]);
    expect(MUTANTS.map((m) => m.id)).toEqual(ids);
  });
  it("every patch applies exactly `count` times to the current src and changes it", () => {
    for (const m of MUTANTS) for (const p of m.patches) {
      const text = readFileSync(join(SRC, p.file), "utf8");
      expect(text.split(p.find).length - 1, `${m.id}: ${p.file}: ${p.find.slice(0, 60)}`).toBe(p.count);
      expect(p.replace, `${m.id}`).not.toBe(p.find);
    }
  });
  it("heavy rows named by a mutant exist in the harness", () => {
    for (const m of MUTANTS) for (const h of m.heavy ?? []) expect(["T28", "U10", "U11", "U12"]).toContain(h);
  });
  it("production code has no switchable variants: no mutant, variant, MUT or K-number switch in src", () => {
    for (const f of readdirSync(SRC, { recursive: true }) as string[]) {
      if (!f.endsWith(".ts")) continue;
      const t = readFileSync(join(SRC, f), "utf8");
      expect(t, f).not.toMatch(/\b(MUTANT|MUTATION|VARIANT|process\.env|globalThis\.__)\b|\bK\d{2,3}\b/);
    }
  });
});
