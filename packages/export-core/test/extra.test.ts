// The behaviour checks of test/oracle/extra.ts (audit 32-code-audit-b.md): the unit-suite side; the mutation harness runs the same checks on scratch copies.
import { describe, it } from "vitest";
import * as ex from "../src/index.js";
import * as limits from "../src/limits.js";
import * as png from "../src/png.js";
import { ORACLE_DIR } from "./helpers.js";
import { exportChecks } from "./oracle/extra.js";
import { loadCorpus } from "./oracle/runner.js";

describe("export-core behaviour checks (Buffer copies, structured errors, UTF-8 codec, PNG rules, limits, headless snapshots)", () => {
  for (const ch of exportChecks(ex, { ...limits, ...png }, loadCorpus(ORACLE_DIR))) it(ch.id, async () => { await ch.run(); });
});
