// Corpus runner: replays fixtures/oracles-stable/EXPECT.tsv against the built package (dist). Reads expected files, never writes them.
// First verifies every file named in SHA256SUMS (a corrupted or edited corpus aborts the run). Usage: npm run build && npm run corpus
// Mismatches are findings to explain (oracle bug, design ambiguity or implementation bug), never a reason to edit an expected file.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as api from "../dist/index.js";
import { canonicalBytesSigned } from "isongraph-visualize-scene-core/primitives";

const DIR = fileURLToPath(new URL("../../../fixtures/oracles-stable/", import.meta.url));
const rd = (p) => (p ? new Uint8Array(readFileSync(DIR + p)) : null);
const eq = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
let bad = 0, checked = 0;
for (const l of readFileSync(DIR + "SHA256SUMS", "utf8").split("\n").filter((x) => x.length)) {
  const m = /^([0-9a-f]{64}) \*(.+)$/.exec(l);
  if (!m || createHash("sha256").update(readFileSync(DIR + m[2])).digest("hex") !== m[1]) { bad++; console.log(`SHA256SUMS: ${l.slice(0, 120)} does not verify`); }
  checked++;
}
if (bad > 0) { console.log(`${bad} of ${checked} files fail SHA256SUMS; not running`); process.exit(2); }
console.log(`SHA256SUMS: ${checked} files verify`);
const lines = readFileSync(DIR + "EXPECT.tsv", "utf8").split("\n").filter((l) => l.length);
const head = lines[0].split("\t");
const out = { ok: 0, bad: [] };

const errString = (e) => {
  const cr = `${e.code}/${e.reason ?? ""}`;
  if (e.reason === "UNSUPPORTED_OPTION" || e.reason === "REPORT_MISMATCH" || e.reason === "NOT_REPRODUCED" || e.reason === "NO_FREE_SLOT") return `${cr}#${e.detail}`;
  if (e.reason === "UNKNOWN_KEY") return `${cr}#${(e.path ?? "").replace(/^options\./, "")}`;
  return cr;
};
async function call(fn) { try { return { value: await fn() }; } catch (e) { return { error: e }; } }

for (const line of lines.slice(1)) {
  const row = Object.fromEntries(line.split("\t").map((v, i) => [head[i], v]));
  const inp = JSON.parse(row.input);
  const prev = row.previous_scene ? { sceneBytes: rd(row.previous_scene), layoutBytes: rd(row.previous_layout) } : null;
  const scene = rd(row.scene);
  const budget = inp.budget;
  const withBudget = (extra) => ({ ...extra, ...(budget ? { budget } : {}) });
  const problems = [];
  let run, stats;
  switch (inp.fn) {
    case "diffScenes": run = () => api.diffScenes(prev.sceneBytes, scene, withBudget({})); break;
    case "computeStableLayout": run = () => api.computeStableLayout(prev, scene, inp.options ?? {}); break;
    case "measureDisplacement": run = () => api.measureDisplacement(prev, { sceneBytes: scene, layoutBytes: rd(inp.next_layout) }, withBudget({})); break;
    case "verifyDisplacementReport": run = () => api.verifyDisplacementReport(rd(inp.report), withBudget({})); break;
    case "verifyStable": run = () => api.verifyStable(prev, scene, rd(inp.layout), rd(inp.report), withBudget({})); break;
    case "verifyStableReproducible": run = () => api.verifyStableReproducible(prev, scene, rd(inp.layout), rd(inp.report), withBudget({})); break;
    default: problems.push(`unknown fn ${inp.fn}`);
  }
  if (run) {
    const r = await call(run);
    if (row.error) {
      if (!r.error) problems.push(`expected error ${row.error}, got success`);
      else if (errString(r.error) !== row.error) problems.push(`error ${errString(r.error)} != expected ${row.error}`);
    } else if (r.error) problems.push(`unexpected error ${errString(r.error)}: ${r.error.message}`);
    else {
      const v = r.value;
      if (inp.fn === "diffScenes") { if (!eq(canonicalBytesSigned(v), rd(row.expected_diff))) problems.push("diff bytes differ"); }
      if (inp.fn === "computeStableLayout") {
        if (!eq(v.layout.layoutBytes, rd(row.expected_layout))) problems.push("layout bytes differ");
        if (!eq(v.reportBytes, rd(row.expected_report))) problems.push("report bytes differ");
        if (row.expected_diff && !eq(canonicalBytesSigned(v.diff), rd(row.expected_diff))) problems.push("diff bytes differ");
        stats = v.stats.work;
      }
      if (inp.fn === "measureDisplacement") {
        if (!eq(v.reportBytes, rd(row.expected_report))) problems.push("report bytes differ");
        stats = v.stats.work;
      }
      if (inp.fn === "verifyDisplacementReport" && row.expected_report && !eq(rd(inp.report), rd(row.expected_report))) problems.push("(input/expected differ)");
      if (row.work !== "") {
        const w = Number(row.work);
        if (w === 0 && stats === undefined) { /* maxWork 0 is not a valid budget; nothing to bound */ } else if (stats !== undefined) { if (stats !== w) problems.push(`work ${stats} != ${w}`); }
        else { // work of a verifier or of diffScenes: the boundary maxWork = w passes and w - 1 is a WORK_LIMIT
          const at = async (mw) => { const b = { ...(budget ?? {}), maxWork: mw }; const o = { ...inp, budget: b }; return call(() => ({
            diffScenes: () => api.diffScenes(prev?.sceneBytes, scene, { budget: b }),
            verifyDisplacementReport: () => api.verifyDisplacementReport(rd(o.report), { budget: b }),
            verifyStable: () => api.verifyStable(prev, scene, rd(o.layout), rd(o.report), { budget: b }),
            verifyStableReproducible: () => api.verifyStableReproducible(prev, scene, rd(o.layout), rd(o.report), { budget: b }),
          })[inp.fn]()); };
          const a = await at(w), b = w > 0 ? await at(w - 1) : { error: { reason: "WORK_LIMIT" } };
          if (a.error) problems.push(`work ${w}: fails at maxWork = ${w} (${errString(a.error)})`);
          if (!(b.error && b.error.reason === "WORK_LIMIT")) problems.push(`work ${w}: does not fail with WORK_LIMIT at maxWork = ${w - 1}`);
        }
      }
    }
    if (row.error === "RESOURCE_LIMIT/WORK_LIMIT" && row.work !== "" && r.error) {
      // the corpus work value is W BEFORE the refused charge; the package reports W + charge in the detail. Informational only.
      problems.push(`(info) refusal detail "${r.error.detail}", corpus W = ${row.work}`);
      problems.splice(problems.findIndex((p) => p.startsWith("(info)")), 1, `(info only) ${problems.pop()}`);
    }
  }
  const real = problems.filter((p) => !p.startsWith("(info only)"));
  if (real.length === 0) out.ok++; else out.bad.push(`${row.id} [${inp.fn}]: ${real.join("; ")}`);
  for (const p of problems.filter((p) => p.startsWith("(info only)"))) console.log(`${row.id}: ${p}`);
}
console.log(`\n${out.ok} rows match, ${out.bad.length} mismatch of ${out.ok + out.bad.length}`);
for (const b of out.bad) console.log("MISMATCH " + b);
process.exit(out.bad.length === 0 ? 0 : 1);
