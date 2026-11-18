// The behaviour checks of test/oracle/extra.ts (audit 32-code-audit-b.md): the unit-suite side; the mutation harness runs the same checks on scratch copies.
import { describe, it } from "vitest";
import * as ia from "../src/index.js";
import * as exec from "../src/executor.js";
import * as live from "../src/live.js";
import * as tree from "../src/tree.js";
import * as util from "../src/util.js";
import { mountCompanion } from "../src/dom/index.js";
import { ORACLE_DIR } from "./helpers.js";
import { companionChecks } from "./oracle/extra.js";
import { loadCorpus } from "./oracle/runner.js";

describe("a11y-companion behaviour checks (mount recovery, exact screen position, boundaries, depth, guards, counts, snapshots)", () => {
  for (const ch of companionChecks(ia, { ...util, ...tree, ...live, ...exec, mountCompanion }, loadCorpus(ORACLE_DIR))) it(ch.id, async () => { await ch.run(); });
});
