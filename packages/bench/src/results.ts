// src/results.ts - re-derives a finished report (limits evidence, selection proposal) and refreshes the generated blocks of the committed RESULTS.md. The text outside the
// markers is hand-written and hand-reviewed; every table inside a marker comes from the report, so no number in a table is typed in.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { finalizeDerived } from "./derive.js";
import { browserSection, compactMarkdown, environmentMarkdown, compileProbeMarkdown, forceProbeMarkdown, injectGenerated, limitsTable, selectionTable, writeReport, type Report } from "./report.js";

export const BLOCKS = ["environment", "medians", "force-probe", "compile-probe", "browser", "limits", "selection"] as const;

export function generatedBlocks(r: Report): Record<(typeof BLOCKS)[number], string> {
  return {
    environment: environmentMarkdown(r),
    medians: compactMarkdown(r),
    "force-probe": r.forceProbe && r.forceProbe.length > 0 ? forceProbeMarkdown(r.forceProbe) : "The FORCE probe was not run.",
    "compile-probe": r.compileProbe && r.compileProbe.length > 0 ? compileProbeMarkdown(r.compileProbe) : "The compile probe was not run.",
    browser: r.browser ? browserSection(r.browser) : "The browser mode was not run.",
    limits: limitsTable(r.limits),
    selection: selectionTable(r.selection),
  };
}

export function applyToResults(doc: string, r: Report): string {
  let out = doc;
  const blocks = generatedBlocks(r);
  for (const id of BLOCKS) out = injectGenerated(out, id, blocks[id]);
  return out;
}

/** Reads report.json, re-derives, rewrites report.json and report.md beside it, and (when given) refreshes RESULTS.md. */
export function rebuild(reportPath: string, resultsPath?: string): Report {
  const r = JSON.parse(readFileSync(reportPath, "utf8")) as Report;
  finalizeDerived(r);
  writeReport(r, dirname(reportPath));
  if (resultsPath !== undefined && existsSync(resultsPath)) writeFileSync(resultsPath, applyToResults(readFileSync(resultsPath, "utf8"), r));
  return r;
}
