// Mutation proofs (28-STABLE-LAYOUT-DESIGN.md section 17): each mutant is applied to one source file, the whole test suite is run, and the
// mutant must be KILLED by a genuine test failure. The source file is restored afterwards. Usage: node scripts/mutate.mjs [name-filter]
//  * a baseline run with no mutant must be green first (otherwise every mutant would look killed);
//  * a failing run whose only failures are timeouts or a suite that failed to load is INCONCLUSIVE, never a kill (a loaded machine can time tests out);
//  * `<file>.mutate-orig` backups are written before a mutant is applied; a leftover one (a hard kill) is restored at start-up.
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const MUTANTS = (await import("./mutants.mjs")).default;
const filter = process.argv[2];

for (const f of readdirSync(root + "src")) {
  if (f.endsWith(".mutate-orig")) { writeFileSync(root + "src/" + f.replace(/\.mutate-orig$/, ""), readFileSync(root + "src/" + f)); unlinkSync(root + "src/" + f); console.log(`restored ${f} from a previous interrupted run`); }
}

function runSuite() {
  const r = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=json"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
  const real = [], timeouts = [];
  let parsed = true;
  try {
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    for (const f of j.testResults) {
      for (const t of f.assertionResults) {
        if (t.status !== "failed") continue;
        const name = `${f.name.split(/[\\/]/).pop()} > ${t.title}`;
        (t.failureMessages ?? []).join("\n").includes("Test timed out") ? timeouts.push(name) : real.push(name);
      }
      if (f.status === "failed" && f.assertionResults.length === 0) timeouts.push(`${f.name.split(/[\\/]/).pop()} (suite failed to load)`);
    }
  } catch { parsed = false; }
  return { status: r.status, real, timeouts, parsed };
}

const base = runSuite();
if (base.status !== 0 || !base.parsed) { console.log(`BASELINE NOT GREEN (exit ${base.status}); failing: ${[...base.real, ...base.timeouts].slice(0, 5).join(" | ")}`); process.exit(2); }
console.log("baseline green");

let survived = 0, killed = 0, inconclusive = 0;
const rows = [];
for (const m of MUTANTS) {
  if (filter && !m.name.includes(filter)) continue;
  const path = root + m.file;
  const original = readFileSync(path, "utf8");
  const count = original.split(m.find).length - 1;
  if (count !== 1) { rows.push(`INVALID  ${m.name}: pattern occurs ${count} times in ${m.file}`); survived++; continue; }
  writeFileSync(path + ".mutate-orig", original);
  try {
    writeFileSync(path, original.replace(m.find, () => m.replace));
    const r = runSuite();
    if (r.real.length > 0) { killed++; rows.push(`killed   ${m.name}  [${r.real.length}]  e.g. ${r.real.slice(0, 2).join(" | ").slice(0, 230)}`); }
    else if (r.status !== 0 || !r.parsed) { inconclusive++; rows.push(`INCONCLUSIVE ${m.name}: only timeouts / load failures (${r.timeouts.slice(0, 2).join(" | ")}); NOT counted as killed`); }
    else { survived++; rows.push(`SURVIVED ${m.name}${m.equivalent ? " (declared equivalent: " + m.equivalent + ")" : ""}`); }
  } finally { writeFileSync(path, original); if (existsSync(path + ".mutate-orig")) unlinkSync(path + ".mutate-orig"); }
}
console.log(rows.join("\n"));
console.log(`\n${killed} killed, ${survived} survived or invalid, ${inconclusive} inconclusive, of ${killed + survived + inconclusive}`);
process.exit(survived === 0 && inconclusive === 0 ? 0 : 1);
