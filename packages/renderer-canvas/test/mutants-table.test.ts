// Guards the mutation harness without running it: the K table has the 193 ids of the corpus MUTANTS.tsv (K01..K187 with the b-variants), every patch
// applies exactly the stated number of times to the CURRENT src of display-list and renderer-canvas (so a refactoring cannot silently turn a mutant into a
// no-op), and production code carries no switchable variants.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTRA_MUTANTS, MUTANTS } from "../scripts/mutants-table.mjs";
import { ORACLE_DIR, PKG_DIR, REPO_DIR } from "./helpers.js";

const SRC = { dl: join(REPO_DIR, "packages", "display-list", "src"), cv: join(PKG_DIR, "src") } as const;

describe("the K table (scripts/mutants-table.mjs)", () => {
  it("matches the ids of the corpus MUTANTS.tsv, each with a description and at least one patch", () => {
    const ids = readFileSync(join(ORACLE_DIR, "MUTANTS.tsv"), "utf8").split("\n").slice(1).filter((l) => l !== "").map((l) => l.split("\t")[0]);
    expect(ids.length).toBe(193);
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
  it("the extra mutants (audit findings) are X01.. once each and are not K ids", () => {
    expect(EXTRA_MUTANTS.map((m) => m.id)).toEqual(Array.from({ length: EXTRA_MUTANTS.length }, (_, i) => `X${String(i + 1).padStart(2, "0")}`));
  });
  it("heavy rows named by a mutant exist in the harness", () => {
    for (const m of MUTANTS) for (const h of m.heavy ?? []) expect(["U10", "U11", "U12"]).toContain(h);
  });
  it("production code has no switchable variants: no mutant, variant, MUT or K-number switch in either src", () => {
    for (const dir of Object.values(SRC)) for (const f of readdirSync(dir, { recursive: true }) as string[]) {
      if (!f.endsWith(".ts")) continue;
      const t = readFileSync(join(dir, f), "utf8");
      expect(t, f).not.toMatch(/\b(MUTANT|MUTATION|VARIANT|process\.env|globalThis\.__)\b|\bK\d{2,3}\b/);
    }
  });
});
