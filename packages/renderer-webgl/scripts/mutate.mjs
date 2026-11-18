// The mutation harness (design 13.5, 14 (3)) for the WebGL renderer. For each mutant of scripts/mutants-table.mjs it copies packages/renderer-webgl/src to a
// SCRATCH directory under .mutants/, applies the mutant's exact-text patches there, bundles the scratch copy (with the display-list SOURCE, which no mutant
// touches) together with the oracle row runner (test/oracle/runner.ts) and runs every row (plus the heavy rows the mutant names) in a child process with a
// timeout. A mutant is
//   KILLED        when at least one row fails (the failing rows are listed),
//   SURVIVED      when every row passes,
//   INCONCLUSIVE  when the child timed out (a timeout is never counted as a kill),
//   HARNESS-ERROR when a patch did not apply or the child produced no result (a defect of this harness, never a verdict).
// The baseline (no patch) must be green first. Production code has no switchable variants; src/ is never modified.
//
//   node scripts/mutate.mjs [--only K01,K09,...] [--timeout MS] [--keep] [--no-heavy] [--jobs N]
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { MUTANTS } from "./mutants-table.mjs";
import { EXTRA_MUTANTS } from "./mutants-extra.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..").replace(/^[a-z]:/, (d) => d.toUpperCase());
const REPO = resolve(PKG, "..", "..");
const DL = join(REPO, "packages", "display-list");
const ORACLE = join(REPO, "fixtures", "oracles-gl");
const IGR = join(REPO, "fixtures", "oracles-igr");
const SCRATCH = join(PKG, ".mutants");
const fwd = (p) => p.replace(/\\/g, "/");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const only = opt("--only", "") ? opt("--only", "").split(",") : undefined;
const timeoutMs = Number(opt("--timeout", "300000"));
const jobs = Number(opt("--jobs", "1"));
const withHeavy = !flag("--no-heavy");

const named = new Map();
for (const line of readFileSync(join(ORACLE, "MUTANTS.tsv"), "utf8").split("\n").slice(1)) {
  const c = line.split("\t");
  if (c[0]) named.set(c[0], c[2] ? c[2].split(",") : []);
}

async function prepare(id, patches) {
  const dir = join(SCRATCH, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(PKG, "src"), join(dir, "gl", "src"), { recursive: true });
  for (const p of patches) {
    const file = join(dir, p.pkg, "src", p.file);
    const text = readFileSync(file, "utf8");
    const n = text.split(p.find).length - 1;
    if (n !== p.count) throw new Error(`patch for ${p.pkg}/${p.file}: expected ${p.count} occurrence(s), found ${n}: ${JSON.stringify(p.find.slice(0, 90))}`);
    writeFileSync(file, text.split(p.find).join(p.replace));
  }
  const entry = join(dir, "entry.ts");
  writeFileSync(entry, [
    'import * as dlIndex from "isongraph-visualize-display-list";',
    'import * as dlCanvas from "isongraph-visualize-display-list/canvas2d";',
    'import * as glIndex from "./gl/src/index.ts";',
    'import { composeWebglRenderer } from "./gl/src/renderer.ts";',
    `import { loadOracle, runAll, runHeavy } from ${JSON.stringify(fwd(join(PKG, "test", "oracle", "runner.ts")))};`,
    `import { runExtra } from ${JSON.stringify(fwd(join(PKG, "test", "oracle", "ext.ts")))};`,
    "const [, , oracleDir, igrDir, heavyCsv] = process.argv;",
    "const oracle = loadOracle(oracleDir!);",
    "const impl = { ...glIndex, composeWebglRenderer, dl: { ...dlIndex, ...dlCanvas } } as never;",
    "const results = [...(await runAll(impl, oracle)), ...(await runExtra(impl, oracle.bytes('plan/G01.glplan')))];",
    'for (const id of (heavyCsv ?? "").split(",").filter((x) => x !== "")) {',
    "  try { await runHeavy(impl, oracle, oracle.byId.get(id)!, igrDir!); results.push({ id, ok: true }); }",
    "  catch (e) { results.push({ id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }",
    "}",
    'process.stdout.write("@@RESULT@@" + JSON.stringify(results) + "\\n");',
  ].join("\n"));
  await build({
    entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: join(dir, "bundle.mjs"), logLevel: "silent", target: "node22",
    alias: {
      "isongraph-visualize-display-list/canvas2d": fwd(join(DL, "src", "canvas2d", "index.ts")),
      "isongraph-visualize-display-list": fwd(join(DL, "src", "index.ts")),
    },
    external: ["isongraph-visualize-renderer-core", "isongraph-visualize-renderer-core/*", "isongraph-visualize-scene-core", "isongraph-visualize-scene-core/*", "isongraph-visualize-layout-core", "node:*"],
  });
  return join(dir, "bundle.mjs");
}

function runChild(bundle, heavy) {
  return new Promise((res) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, ["--max-old-space-size=2048", bundle, ORACLE, IGR, heavy.join(",")], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", timedOut = false;
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.on("close", () => {
      clearTimeout(timer);
      const m = /@@RESULT@@([^\n]*)\n/.exec(out); // `.` would stop at U+2028 inside a detail text
      res({ timedOut, ms: Date.now() - t0, results: m ? JSON.parse(m[1]) : undefined, err: err.slice(0, 600) });
    });
  });
}

async function runOne(m) {
  let bundle;
  try { bundle = await prepare(m.id, m.patches); } catch (e) { return { id: m.id, desc: m.desc, status: "HARNESS-ERROR", note: String(e.message ?? e) }; }
  const heavy = withHeavy ? (m.heavy ?? []) : [];
  const r = await runChild(bundle, heavy);
  if (r.timedOut) return { id: m.id, desc: m.desc, status: "INCONCLUSIVE", note: `timeout after ${timeoutMs} ms`, ms: r.ms };
  if (!r.results) return { id: m.id, desc: m.desc, status: "HARNESS-ERROR", note: `the child produced no result: ${r.err}`, ms: r.ms };
  const failing = r.results.filter((x) => !x.ok).map((x) => x.id);
  const nk = named.get(m.id) ?? [];
  return {
    id: m.id, desc: m.desc, extra: EXTRA_MUTANTS.some((x) => x.id === m.id), status: failing.length > 0 ? "KILLED" : "SURVIVED", killers: failing, named: nk,
    named_killed: nk.filter((x) => failing.includes(x)), named_not_killing: nk.filter((x) => !failing.includes(x)), ms: r.ms,
    detail: failing.length > 0 ? r.results.find((x) => !x.ok)?.detail?.slice(0, 160) : undefined,
  };
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  // the baseline must be green, heavy rows included
  const base = await prepare("BASE", []);
  const b = await runChild(base, ["U10", "U11", "U12"]);
  const bad = (b.results ?? []).filter((x) => !x.ok);
  if (b.timedOut || !b.results || bad.length > 0) {
    console.error("BASELINE IS NOT GREEN:", b.timedOut ? "timeout" : b.err, JSON.stringify(bad.slice(0, 5)));
    process.exit(2);
  }
  console.error(`baseline green: ${b.results.length} row checks in ${b.ms} ms`);

  const todo = [...MUTANTS, ...EXTRA_MUTANTS].filter((m) => !only || only.includes(m.id));
  const report = [];
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const m = todo[next++];
      const r = await runOne(m);
      report.push(r);
      console.error(`${r.id} ${r.status}${r.killers ? ` (${r.killers.length} rows: ${r.killers.slice(0, 6).join(",")}${r.killers.length > 6 ? ",..." : ""})` : ""}${r.note ? ` ${r.note}` : ""}`);
      if (!flag("--keep")) rmSync(join(SCRATCH, m.id), { recursive: true, force: true });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  report.sort((a, c) => a.id.localeCompare(c.id, "en", { numeric: true }));
  writeFileSync(join(SCRATCH, "report.json"), JSON.stringify({ baseline_rows: b.results.length, mutants: report }, null, 1) + "\n");
  if (!flag("--keep")) rmSync(join(SCRATCH, "BASE"), { recursive: true, force: true });

  const count = (s) => report.filter((r) => r.status === s).length;
  console.log(`mutants: ${report.length}  killed ${count("KILLED")}  survived ${count("SURVIVED")}  inconclusive ${count("INCONCLUSIVE")}  harness-error ${count("HARNESS-ERROR")}`);
  for (const r of report) {
    const nn = r.named_not_killing && r.named_not_killing.length > 0 ? `  named-not-killing: ${r.named_not_killing.join(",")}` : "";
    console.log(`${r.id}\t${r.status}\tkillers: ${(r.killers ?? []).join(",")}\tnamed: ${(r.named ?? []).join(",")}${nn}${r.note ? `\t${r.note}` : ""}`);
  }
  if (!existsSync(join(SCRATCH, "report.json"))) process.exit(3);
  process.exit(count("SURVIVED") + count("HARNESS-ERROR") + count("INCONCLUSIVE") > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(4); });
