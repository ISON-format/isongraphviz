// The mutation matrix (design 15.6, 16 (3)): scripts/mutate.mjs over scratch copies of src/. Every one of the 69 mutants of this package's K table must be
// KILLED by at least one row, the rows the corpus names for it must be among its killers, and no kill may be a crash only. A timeout would be INCONCLUSIVE
// and fails this test (never counted as a kill).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PKG_DIR } from "../helpers.js";

describe("mutation matrix", () => {
  it("84 of 86 mutants killed (69 corpus + 17 ext:; the 2 survivors are documented equivalent mutants), none inconclusive or crash-only, every named killer kills", () => {
    const r = spawnSync(process.execPath, [join(PKG_DIR, "scripts", "mutate.mjs"), "--jobs", "2"], { cwd: PKG_DIR, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 3_000_000 });
    const report = JSON.parse(readFileSync(join(PKG_DIR, ".mutants", "report.json"), "utf8")) as { baseline_rows: number; mutants: { id: string; status: string; killers?: string[]; named_not_killing?: string[]; crash_only?: boolean }[] };
    const by = (s: string) => report.mutants.filter((m) => m.status === s).map((m) => m.id);
    console.log(`[mutants] killed ${by("KILLED").length}, survived ${by("SURVIVED").join(",") || "none"}, inconclusive ${by("INCONCLUSIVE").join(",") || "none"}, harness errors ${by("HARNESS-ERROR").join(",") || "none"}`);
    expect(report.baseline_rows).toBe(183 + 18); // 183 oracle rows (176 X + 7 H) + 18 ext: rows
    expect(report.mutants).toHaveLength(86);
    expect(report.mutants.filter((m) => /^K[0-9]/.test(m.id))).toHaveLength(69);
    // Two documented EQUIVALENT mutants survive: ext:K112-scan (V8 JSON.parse is iterative, the closed-key reader gives the same SCHEMA; the unguarded-parse half of
    // K112 is killed by rows X31-X44 and X86 and the unit check U-MANIFEST-json) and ext:E16 (renderer-core's initialState refuses the same size with the same INVALID_INPUT/OUT_OF_RANGE).
    expect(by("SURVIVED")).toEqual(["ext:E16", "ext:K112-scan"]);
    expect(by("INCONCLUSIVE")).toEqual([]);
    expect(by("HARNESS-ERROR")).toEqual([]);
    expect(report.mutants.filter((m) => m.crash_only).map((m) => m.id)).toEqual([]);
    expect(Object.fromEntries(report.mutants.filter((m) => m.id !== "K112" && (m.named_not_killing ?? []).length > 0).map((m) => [m.id, m.named_not_killing]))).toEqual({ K158: ["X97"] });
    // K112 names X25 (nesting depth), an equivalent half on V8 (see above). K158 names X97 (only IHDR, no IEND), which this implementation already refuses with the
    // 45-byte minimum of parsePng (a rule the text does not state, ambiguity A-79) before the IEND rule is reached; X96, X98, X131, X168 and U-PNG-rules kill K158.
    expect(r.status).toBe(1); // the exit code reports the one documented survivor
  });
});
