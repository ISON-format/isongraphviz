// The mutation matrix (design 13.5, 14 (3)): scripts/mutate.mjs over scratch copies of renderer-webgl/src. Every one of the 129 mutants of the K table must be
// KILLED by at least one row, and the rows the corpus names for it must be among its killers. A timeout would be INCONCLUSIVE and fails this test (never
// counted as a kill).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PKG_DIR } from "../helpers.js";

describe("mutation matrix", () => {
  it("129 of 129 corpus mutants and the 13 extra mutants killed, none survived or inconclusive, every named killer kills", () => {
    const r = spawnSync(process.execPath, [join(PKG_DIR, "scripts", "mutate.mjs"), "--jobs", "2"], { cwd: PKG_DIR, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 3_000_000 });
    const report = JSON.parse(readFileSync(join(PKG_DIR, ".mutants", "report.json"), "utf8")) as { mutants: { id: string; status: string; killers?: string[]; named_not_killing?: string[] }[] };
    const by = (s: string) => report.mutants.filter((m) => m.status === s).map((m) => m.id);
    console.log(`[mutants] killed ${by("KILLED").length}, survived ${by("SURVIVED").join(",") || "none"}, inconclusive ${by("INCONCLUSIVE").join(",") || "none"}, harness errors ${by("HARNESS-ERROR").join(",") || "none"}`);
    expect(report.mutants).toHaveLength(142);
    expect(report.mutants.filter((m) => m.status === "KILLED" && !(m as { extra?: boolean }).extra)).toHaveLength(129);
    // the extra mutants are killed by their ext: rows (the corpus rows do not see them)
    for (const m of report.mutants.filter((x) => (x as { extra?: boolean }).extra)) expect(m.killers!.every((k) => k.startsWith("ext:")), m.id).toBe(true);
    expect(by("SURVIVED")).toEqual([]);
    expect(by("INCONCLUSIVE")).toEqual([]);
    expect(by("HARNESS-ERROR")).toEqual([]);
    expect(Object.fromEntries(report.mutants.filter((m) => (m.named_not_killing ?? []).length > 0).map((m) => [m.id, m.named_not_killing]))).toEqual({});
    expect(r.status).toBe(0);
  });
});
