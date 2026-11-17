// scripts/mutation.mjs — the mutation sample of design 29 section 15.1 (3) plus further mutants. Each seeded mutant must be killed by at least one test.
//
// The repository is NEVER touched: the package (src, test, configs) is copied to a scratch directory, the junctions to node_modules, the sibling packages and
// docs keep the real paths, and every mutant is applied to the COPY. A green baseline (the unmutated copy) is required first. A run is
//   killed        : vitest ran and at least one test failed;
//   SURVIVED      : vitest ran and everything passed;
//   inconclusive  : timeout, signal, crash, build or transform error, or no test summary at all (never counted as killed).
// Usage: node scripts/mutation.mjs [--work <dir>] [--timeout <seconds>] [mutantId ...]
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoPkg = fileURLToPath(new URL("..", import.meta.url));
const repoPackages = resolve(repoPkg, "..");
const repoRoot = resolve(repoPackages, "..");

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const work = resolve(opt("--work", join(tmpdir(), `lod-core-mutation-${process.pid}`)));
const timeoutMs = Number(opt("--timeout", "300")) * 1000;
const only = argv;

const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);
const src = (f) => join(work, "packages", "lod-core", "src", f);

/** [id, file, from, to, note, fn?]; `to` is a string; `fn` (text -> text) replaces from/to for structural mutants. */
const MUTANTS = [
  ["M01-anchor-trunc", "derive.ts", "if (a % b !== 0n && a < 0n) q -= 1n;", "", "anchor truncates instead of flooring (D05)"],
  ["M02-directed-key", "derive.ts", "if (!info.directed && a > b) { a = rv; b = ru; }", "if (a > b) { a = rv; b = ru; }", "bundle key ignores direction (E06)"],
  ["M03-vdeg-selfloop", "derive.ts", "vdeg[iS[i]!]!++; if (iT[i] !== iS[i]) vdeg[iT[i]!]!++;", "vdeg[iS[i]!]!++; vdeg[iT[i]!]!++;", "self-loop counted twice in vdeg (E16)"],
  ["M04-relorder-utf16", "derive.ts", "return compareUtf8(info.rels[a]!, info.rels[b]!);", "return info.rels[a]! < info.rels[b]! ? -1 : info.rels[a]! > info.rels[b]! ? 1 : 0;", "rel_counts in UTF-16 order (D07)"],
  ["M05-id-excludes-pins", "derive.ts", "const pre = aggregatePreimage(state.scene_sha256, members);", "const pre = aggregatePreimage(state.scene_sha256, members.filter((_, i) => !pinnedFlag[groupIdx[g]![i]!]));", "pins excluded from aggregate ids (P01)"],
  ["M06-forest-dropped", "derive.ts", "isForest[i] = 1; keep[i] = 1; forest++;", "isForest[i] = 1; forest++;", "spanning forest not kept (E10)"],
  ["M07-label-boost", "derive.ts", "Math.min(td, tz + 1)", "td", "degree boost uncapped (L03)"],
  ["M08-label-gt", "derive.ts", "const tz = zoom >= p.full_zoom_milli ? 2 : zoom >= p.short_zoom_milli ? 1 : 0;", "const tz = zoom > p.full_zoom_milli ? 2 : zoom > p.short_zoom_milli ? 1 : 0;", "zoom thresholds exclusive (L02)"],
  ["M09-pin-label", "derive.ts", 'label_level: pinnedFlag[v] ? "full" : labelLevel(vdeg[v]!, zoom, lp)', "label_level: labelLevel(vdeg[v]!, zoom, lp)", "pinned node label not full (L05, P03)"],
  ["M10-children-root", "derive.ts", "children[painting.parent[g]!]!.push(ids[g]!)", "children[painting.root[g]!]!.push(ids[g]!)", "children list all descendants (N03)"],
  ["M11-elided-one-end", "derive.ts", "if (iT[i] !== iS[i]) elidedEdges[iT[i]!]!++; else removedSelfLoops++;", "if (iT[i] === iS[i]) removedSelfLoops++;", "elided_edges only on one endpoint"],
  ["M12-all-pinned-emitted", "derive.ts", "if (painting.parent[g]! < 0 && hiddenCount[g]! > 0) emitted.push(g);", "if (painting.parent[g]! < 0) emitted.push(g);", "aggregate with nothing hidden is emitted (P02)"],
  ["M13-priority-vdeg", "derive.ts", "return (vdeg[iS[x]!]! + vdeg[iT[x]!]!) - (vdeg[iS[y]!]! + vdeg[iT[y]!]!) || iKind[x]!", "return 0 || iKind[x]!", "density priority ignores vdeg (E10-E13)"],
  ["M14-cap-ge", "derive.ts", "nItems > policy.max_view_edges", "nItems >= policy.max_view_edges", "EQUIVALENT mutant: with items == cap nothing is removed either way (forest <= items == cap, so the fill keeps every item); expected to survive"],
  ["M15-nonforest-cap", "derive.ts", "for (let k = 0; k < policy.max_view_edges; k++) keep[order[k]!] = 1;", "for (let k = 0; k < policy.max_view_edges + 1; k++) keep[order[k]!] = 1;", "keep_forest=false keeps one item too many (E13)"],
  ["M16-state-mismatch-order", "derive.ts", 'if (state.scene_sha256 !== bound.sceneSha256) throw new LODError("STATE_MISMATCH", "SCENE");' + NL + '  if (state.layout_sha256 !== bound.layoutSha256) throw new LODError("STATE_MISMATCH", "LAYOUT");', 'if (state.layout_sha256 !== bound.layoutSha256) throw new LODError("STATE_MISMATCH", "LAYOUT");' + NL + '  if (state.scene_sha256 !== bound.sceneSha256) throw new LODError("STATE_MISMATCH", "SCENE");', "layout mismatch reported before scene (M04)"],
  ["M17-visible-or", "derive.ts", "if (ru === u && rv === v) { visibleEdges.push(e); continue; }", "if (ru === u || rv === v) { visibleEdges.push(e); continue; }", "edge with one visible endpoint treated as visible (E02)"],
  ["M18-anchor-includes-exposed", "derive.ts", "if (pinnedFlag[v]) exposed.push({ id: r.id, type: r.type });", "if (pinnedFlag[v]) { exposed.push({ id: r.id, type: r.type }); sx += BigInt(px[v]!); sy += BigInt(py[v]!); }", "exposed members enter the anchor (P05)"],
  ["M19-member-count", "derive.ts", "member_count: groupIdx[g]!.length,", "member_count: hidden.length,", "member_count counts hidden only (P01)"],
  ["M20-agg-label-d", "derive.ts", "Math.max(vdeg[o]!, groupIdx[g]!.length)", "vdeg[o]!", "aggregate d ignores member_count (L04)"],
  ["M21-work-ge", "derive.ts", "if (W > BigInt(budget.maxWork))", "if (W >= BigInt(budget.maxWork))", "budget off by one (B08)"],
  ["M22-budget-clamp", "limits.ts", 'if (v > HARD[k]) throw new LODError("INVALID_POLICY", "INVALID_BUDGET", `options.budget.${k}`, "above the hard limit");', "", "budget above a hard limit not refused (B09)"],
  ["M23-int-negative", "state.ts", "const INT_TOKEN = /^(?:0|[1-9][0-9]*)$/;", "const INT_TOKEN = /^-?(?:0|[1-9][0-9]*)$/;", "negative integer tokens accepted (M08)"],
  ["M24-id-utf16", "aggregate.ts", ".sort((a, b) => compareNodeRef(a.dec, b.dec))", ".sort((a, b) => (a.ref.type + a.ref.id < b.ref.type + b.ref.id ? -1 : 1))", "members hashed in UTF-16 order (A12)"],
  ["M25-dup-group-late", "state.ts", null, null, "DUPLICATE_GROUP checked after laminarity (C11b)", (s) => {
    const a = s.indexOf("  for (let gi = 1; gi < memberKeys.length; gi++) {");
    const b = s.indexOf("  const index = new Map<string, number>();");
    const c = s.indexOf("  if (painting.maxDepth > MAX_AGG_DEPTH)");
    return s.slice(0, a) + s.slice(b, c) + s.slice(a, b) + s.slice(c);
  }],
  ["M26-laminar-none", "laminar.ts", "else if (cur !== o) throw", "else if (cur !== o && cur !== -1 && o !== -1) throw", "free nodes tolerated in a mixed group (C11)"],
  ["M27-dup-pin", "state.ts", 'for (let i = 1; i < state.pinned.length; i++) if (refKey(state.pinned[i]!) === refKey(state.pinned[i - 1]!)) throw inv("DUPLICATE_PIN", `$.pinned[${i}]`);', "", "duplicate pins accepted (P07)"],
  ["M28-members-limit", "state.ts", "if (entries > MAX_MEMBER_ENTRIES)", "if (entries >= MAX_MEMBER_ENTRIES)", "member limit off by one"],
  ["M29-pendant-gt", "rules.ts", "if (deg[v] !== 1) continue;", "if (deg[v] > 1) continue;", "isolated nodes treated as leaves (T11)"],
  ["M30-minleaves", "rules.ts", "for (const l of byHost.values()) if (l.length >= s.min) out.push(l);", "for (const l of byHost.values()) if (l.length > s.min) out.push(l);", "min_leaves boundary (T04)"],
  ["M31-conservation-edges", "conservation.ts", "if (total !== m) fail(", "if (total > m) fail(", "C-edges only checks one direction"],
  ["M32-undirected-rank", "derive.ts", "emitted.forEach((g, j) => { aggObj[g] = n + j; });", "emitted.forEach((g, j) => { aggObj[g] = n + (emitted.length - 1 - j); });", "aggregate rank not by id ascending (E17)"],
  ["M33-expand-label", "builders.ts", "const removed = st.collapsed[at]!;", "const removed = { members: st.collapsed[at]!.members };", "expandGroup drops the label of the removed group (RT2)"],
  ["M34-pinned-append", "builders.ts", 'export function setPinned(state: LODState, refs: readonly WireNodeRef[]): LODState { return finish(withField(state, "pinned", refs)); }', 'export function setPinned(state: LODState, refs: readonly WireNodeRef[]): LODState { return finish(withField(state, "pinned", [...state.pinned, ...refs])); }', "setPinned appends instead of replacing (P06)"],
  ["M35-limits-after-canon", "state.ts", null, null, "state limits checked after the canonical form (M14)", (s) => {
    const marker = "  // stage 3: limits (label, group, member)" + NL + "  checkLimits(state);" + NL + NL;
    if (!s.includes(marker)) throw new Error("marker missing");
    return s.replace(marker, "").replace('  if (canonical !== text) throw inv("NON_CANONICAL");' + NL, '  if (canonical !== text) throw inv("NON_CANONICAL");' + NL + "  checkLimits(state);" + NL);
  }],
  ["M36-project-dedupe", "mapping.ts", "for (const a of [...aggs].sort()) out.push({ agg: a });", "for (const a of aggs) out.push({ agg: a });", "projectToView aggregates in insertion order (S09)"],
  ["M37-bundle-sort", "derive.ts", "return x.a - y.a || x.b - y.b;", "return y.a - x.a || x.b - y.b;", "aggregate_edges not sorted by (rank src, rank tgt) (W02, E06)"],
  ["M38-rel-sum", "conservation.ts", "if (sum(rels.map((r) => r.count)) !== count) fail(", "if (false) fail(", "rel_counts sums not checked"],
  ["M39-closed-keys-unsorted", "state.ts", "for (const k of Object.keys(v).sort()) {" + NL + "    if (top && RESERVED_TOP.includes(k))", "for (const k of Object.keys(v)) {" + NL + "    if (top && RESERVED_TOP.includes(k))", "audit N5: keys of one object visited in document order (M-5)"],
  ["M40-no-scene-tie", "mapping.ts", "  tieViewToScene(v, scene, info.index);" + NL, "", "audit I-1: checkViewConservation does not bind the view to the scene"],
  ["M41-expand-no-verify", "builders.ts", "const st = verifyCallerState(toTree(state));", "const st = canonicalOrder(parseSchema(toTree(state)));", "rev 4: expandGroup does not verify its input state (Z13)"],
  ["M42-no-visit-budget", "state.ts", "if (--ctx.left < 0) throw", "if (false) throw", "rev 4: no visit budget for caller graphs (I-3)"],
  ["M43-no-cycle-check", "state.ts", '    if (ctx.path.has(v)) throw inv("SCHEMA", undefined, "cyclic reference");' + NL + "    spend(ctx);", "    spend(ctx);", "rev 4: no cycle check in the caller copy (I-3)"],
  ["M44-no-input-bytes", "rules.ts", 'if (input.length > MAX_INPUT_BYTES) throw new LODError("RESOURCE_LIMIT", "INPUT_BYTES");', "", "rev 4: suggestGroups has no input size check (Z01)"],
  ["M45-project-unsorted", "mapping.ts", "const out: ViewRef[] = sortRefs([...nodes].map((i) => ({ id: v.nodes[i]!.ref.id, type: v.nodes[i]!.ref.type })));", "const out: ViewRef[] = [...nodes].map((i) => ({ id: v.nodes[i]!.ref.id, type: v.nodes[i]!.ref.type }));", "rev 4: projectToView output not sorted explicitly (Z14)"],
  ["M46-spec-inherited", "rules.ts", "for (const k of Object.keys(raw)) o.set(", "for (const k in raw as object) o.set(", "rev 4: spec fields read through the prototype chain (I-2)"],
];

const EQUIVALENT = new Set(["M14-cap-ge"]);

// ---------------------------------------------------------------- scratch copy (the repository is never written)
const links = [];
const link = (target, path) => { mkdirSync(resolve(path, ".."), { recursive: true }); symlinkSync(target, path, "junction"); links.push(path); };
function setup() {
  rmSync(work, { recursive: true, force: true });
  const pkg = join(work, "packages", "lod-core");
  mkdirSync(pkg, { recursive: true });
  for (const d of ["src", "test"]) cpSync(join(repoPkg, d), join(pkg, d), { recursive: true });
  for (const f of ["package.json", "tsconfig.json", "tsconfig.build.json", "vitest.config.ts"]) cpSync(join(repoPkg, f), join(pkg, f));
  link(join(repoPkg, "node_modules"), join(pkg, "node_modules"));
  link(join(repoPackages, "scene-core"), join(work, "packages", "scene-core"));
  link(join(repoPackages, "layout-core"), join(work, "packages", "layout-core"));
  link(join(repoRoot, "docs"), join(work, "docs"));
  return pkg;
}
function teardown() {
  for (const l of links) { try { unlinkSync(l); } catch { /* junction already gone */ } }
  rmSync(work, { recursive: true, force: true });
}

const strip = (t) => t.replace(/\x1b\[[0-9;]*m/g, "");
function runSuite(pkg) {
  const r = spawnSync(process.execPath, [join(pkg, "node_modules", "vitest", "vitest.mjs"), "run", "--reporter=default"], { cwd: pkg, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const out = strip((r.stdout ?? "") + (r.stderr ?? ""));
  const summary = /Tests\s+(?:(\d+) failed)?[\s|]*(?:(\d+) passed)?/.exec(out);
  const failed = summary?.[1] ? Number(summary[1]) : 0;
  const passed = summary?.[2] ? Number(summary[2]) : 0;
  let verdict;
  if (r.error || r.signal) verdict = `inconclusive (${r.error?.code ?? r.signal})`;
  else if (r.status === 0 && passed > 0 && failed === 0) verdict = "passed";
  else if (failed > 0) verdict = "failed";
  else verdict = "inconclusive (no test summary: build or transform error)";
  const names = [...out.matchAll(/FAIL\s+(test\/[^\s>]+)[^\n]*>\s*([^\n]+)/g)].slice(0, 2).map((m) => `${m[1]}: ${m[2].slice(0, 90)}`);
  return { verdict, names, passed, failed };
}

if (!existsSync(join(repoPkg, "node_modules"))) { console.error("run npm ci first"); process.exit(2); }
const pkg = setup();
const results = [];
const errors = [];
try {
  const base = runSuite(pkg);
  if (base.verdict !== "passed") { console.error(`BASELINE NOT GREEN (${base.verdict}, ${base.failed} failed): refusing to run mutants`); process.exitCode = 2; throw new Error("baseline"); }
  console.log(`baseline green: ${base.passed} tests`);
  for (const [id, file, from, to, note, fn] of MUTANTS) {
    if (only.length > 0 && !only.includes(id)) continue;
    const path = src(file);
    const original = readFileSync(path, "utf8");
    const text = original.split(CRLF).join(NL);
    let mutated;
    if (fn) mutated = fn(text);
    else {
      const count = text.split(from).length - 1;
      if (count !== 1) { errors.push(`${id}: pattern occurs ${count} times`); results.push([id, "PATTERN-ERROR", note, ""]); continue; }
      mutated = text.replace(from, () => to);
    }
    if (mutated === text) { errors.push(`${id}: mutation changed nothing`); results.push([id, "NO-CHANGE", note, ""]); continue; }
    try {
      writeFileSync(path, mutated);
      const r = runSuite(pkg);
      results.push([id, r.verdict === "failed" ? "killed" : r.verdict === "passed" ? "SURVIVED" : r.verdict, note, r.names.join(" | ")]);
    } finally { writeFileSync(path, original); }
  }
} catch (e) { if (e.message !== "baseline") throw e; }
finally { teardown(); }

for (const r of results) console.log(r.join("\t"));
const killed = results.filter((r) => r[1] === "killed").length;
const survived = results.filter((r) => r[1] === "SURVIVED" && !EQUIVALENT.has(r[0]));
const inconclusive = results.filter((r) => r[1] !== "killed" && r[1] !== "SURVIVED");
console.log(NL + `${killed}/${results.length} mutants killed; ${survived.length} survived (equivalent excluded: ${[...EQUIVALENT].join(", ")}); ${inconclusive.length} inconclusive or errors`);
for (const e of errors) console.log("ERROR:", e);
process.exit(process.exitCode ? process.exitCode : survived.length === 0 && inconclusive.length === 0 ? 0 : 1);
