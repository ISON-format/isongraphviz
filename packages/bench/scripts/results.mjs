// npm run report: re-derives out/report.json (limits evidence, selection proposal), rewrites out/report.json and out/report.md, and refreshes the generated blocks of RESULTS.md.
//   node scripts/results.mjs [--report out/report.json] [--results RESULTS.md]
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuild } from "../dist/results.js";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const a = process.argv.slice(2);
const get = (flag, dflt) => { const i = a.indexOf(flag); return i >= 0 && a[i + 1] ? resolve(a[i + 1]) : dflt; };
const report = get("--report", join(pkg, "out", "report.json"));
const results = get("--results", join(pkg, "RESULTS.md"));
const r = rebuild(report, results);
console.log(`rebuilt ${report} (${r.limits.length} limit rows, ${r.selection.rows.length} selection rows); ${existsSync(results) ? `refreshed ${results}` : "no RESULTS.md to refresh"}`);
