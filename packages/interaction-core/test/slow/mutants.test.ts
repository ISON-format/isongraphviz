// The mutation matrix (design 15.6, 16 (3)): scripts/mutate.mjs over scratch copies of src/. Every one of the 73 mutants of this package's K table must be
// KILLED by at least one row, the rows the corpus names for it must be among its killers, and no kill may be a crash only. A timeout would be INCONCLUSIVE
// and fails this test (never counted as a kill).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PKG_DIR } from "../helpers.js";

describe("mutation matrix", () => {
  it("98 of 98 mutants killed (73 K + 25 X), none survived, inconclusive or crash-only, every named killer kills", () => {
    const r = spawnSync(process.execPath, [join(PKG_DIR, "scripts", "mutate.mjs"), "--jobs", "2"], { cwd: PKG_DIR, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 3_000_000 });
    const report = JSON.parse(readFileSync(join(PKG_DIR, ".mutants", "report.json"), "utf8")) as { baseline_rows: number; mutants: { id: string; status: string; killers?: string[]; named_not_killing?: string[]; crash_only?: boolean }[] };
    const by = (s: string) => report.mutants.filter((m) => m.status === s).map((m) => m.id);
    console.log(`[mutants] killed ${by("KILLED").length}, survived ${by("SURVIVED").join(",") || "none"}, inconclusive ${by("INCONCLUSIVE").join(",") || "none"}, harness errors ${by("HARNESS-ERROR").join(",") || "none"}`);
    expect(report.baseline_rows).toBe(168 + 13); // 168 oracle rows + 13 ext: rows
    expect(report.mutants).toHaveLength(98);
    expect(report.mutants.filter((m) => m.id.startsWith("K"))).toHaveLength(73);
    expect(report.mutants.filter((m) => m.id.startsWith("X"))).toHaveLength(25);
    expect(by("SURVIVED")).toEqual([]);
    expect(by("INCONCLUSIVE")).toEqual([]);
    expect(by("HARNESS-ERROR")).toEqual([]);
    expect(report.mutants.filter((m) => m.crash_only).map((m) => m.id)).toEqual([]);
    expect(Object.fromEntries(report.mutants.filter((m) => (m.named_not_killing ?? []).length > 0).map((m) => [m.id, m.named_not_killing]))).toEqual({});
    expect(r.status).toBe(0);
  });
});
