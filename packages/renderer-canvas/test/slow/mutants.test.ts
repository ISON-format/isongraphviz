// The mutation matrix (design 13.5, 14 (3)): scripts/mutate.mjs over scratch copies of display-list/src and renderer-canvas/src. Every one of the 193 mutants
// of the K table must be KILLED by at least one row, and the rows the corpus names for it must be among its killers, except the two documented cases
// (docs/isongraph-visualize-blueprint/reviews/31-implementation-notes.md): K84 (the corpus names S18, which design rev 4 moved to K87) and K154 (the
// corpus row O14 is answered by renderer-core's own model check too, so the mutant is killed by the extra row ext:K154). A timeout would be INCONCLUSIVE and
// fails this test (never counted as a kill).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PKG_DIR } from "../helpers.js";

describe("mutation matrix", () => {
  it("193 of 193 mutants killed, none survived or inconclusive, every named killer kills (two documented exceptions)", () => {
    const r = spawnSync(process.execPath, [join(PKG_DIR, "scripts", "mutate.mjs"), "--jobs", "2"], { cwd: PKG_DIR, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 3_000_000 });
    const report = JSON.parse(readFileSync(join(PKG_DIR, ".mutants", "report.json"), "utf8")) as { mutants: { id: string; status: string; killers?: string[]; named_not_killing?: string[] }[] };
    const by = (s: string) => report.mutants.filter((m) => m.status === s).map((m) => m.id);
    console.log(`[mutants] killed ${by("KILLED").length}, survived ${by("SURVIVED").join(",") || "none"}, inconclusive ${by("INCONCLUSIVE").join(",") || "none"}, harness errors ${by("HARNESS-ERROR").join(",") || "none"}`);
    const k = report.mutants.filter((m) => m.id.startsWith("K")), x = report.mutants.filter((m) => m.id.startsWith("X"));
    expect(k).toHaveLength(193);
    expect(x.length).toBeGreaterThanOrEqual(14);
    expect(x.filter((m) => m.status !== "KILLED").map((m) => m.id)).toEqual([]); // the extra mutants of the audit findings are killed too
    expect(by("SURVIVED")).toEqual([]);
    expect(by("INCONCLUSIVE")).toEqual([]);
    expect(by("HARNESS-ERROR")).toEqual([]);
    expect(Object.fromEntries(report.mutants.filter((m) => (m.named_not_killing ?? []).length > 0).map((m) => [m.id, m.named_not_killing]))).toEqual({ K84: ["S18"], K154: ["O14"] });
    expect(report.mutants.find((m) => m.id === "K154")!.killers).toEqual(["ext:K154"]);
    expect(r.status).toBe(0);
  });
});
