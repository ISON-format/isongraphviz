// scripts/corpus-check.mjs — THROWAWAY runner of the independent oracle corpus fixtures/oracles-lod/ against the built dist (run `npm run build` first).
// It only READS the corpus. A mismatch is reported, never "fixed". Verify SHA256SUMS before running (sha256sum -c).
// Usage: node scripts/corpus-check.mjs [corpusDir] [--verbose]
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { canonicalBytesSigned } from "isongraph-visualize-scene-core/primitives";
import * as lod from "../dist/index.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const dir = resolve(args.find((a) => !a.startsWith("--")) ?? fileURLToPath(new URL("../../../fixtures/oracles-lod/", import.meta.url)));
const rows = readFileSync(join(dir, "EXPECT.tsv"), "utf8").split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split("\t"));
const header = rows.shift();
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const dec = (b) => new TextDecoder().decode(b);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const read = (p) => (p === undefined || p === "-" || p === "" ? undefined : new Uint8Array(readFileSync(join(dir, p))));
const canon = (v) => canonicalBytesSigned(v);

const errString = (e) => {
  if (e instanceof lod.LODError) return `${e.code}/${e.reason ?? ""}`;
  if (e instanceof lod.IgsError) return `IGS:${e.code}/${e.reason ?? ""}`;
  if (e instanceof lod.LayoutError) return `LAYOUT:${e.code}/${e.reason ?? ""}`;
  return `OTHER:${e?.name}:${String(e?.message).slice(0, 160)}`;
};

async function run(row) {
  const scene = read(row[col.scene]), layout = read(row[col.layout]), state = read(row[col.state]);
  const inputBytes = read(row[col.input]);
  const call = inputBytes ? JSON.parse(dec(inputBytes)) : null;
  const api = call?.api ?? (scene && layout && state ? "deriveView" : state ? "verifyLODState" : "UNKNOWN");
  const options = call?.options;
  const viewOf = async () => (call?.args?.view !== undefined ? call.args.view : (await lod.deriveView(scene, layout, state, options)).view);
  switch (api) {
    case "deriveView": return (await lod.deriveView(scene, layout, state, options)).viewBytes;
    case "verifyLODState": return lod.serializeLODState((await lod.verifyLODState(state)).state);
    case "suggestGroups": return canon(await lod.suggestGroups(scene, call.args.rules, options));
    case "ops": {
      let s = JSON.parse(dec(state)); // the builders take the state object as given (an invalid state file is the builder's input, not verified first), e.g. Z13c
      let wrapper;
      for (const op of call.args.ops) {
        wrapper = undefined;
        const a = op.args ?? {};
        switch (op.api) {
          case "collapseGroup": s = lod.collapseGroup(s, a.group); break;
          case "expandGroup": { const r = await lod.expandGroup(s, a.target); s = r.state; wrapper = r.removed; break; }
          case "replaceGroups": s = lod.replaceGroups(s, a.groups); break;
          case "setPinned": s = lod.setPinned(s, a.refs); break;
          case "withZoom": s = lod.withZoom(s, a.zoom_milli); break;
          case "withLayout": s = lod.withLayout(s, a.layout_sha256); break;
          default: throw new Error(`unknown op ${op.api}`);
        }
      }
      return wrapper !== undefined ? canon({ removed: wrapper, state: s }) : lod.serializeLODState(s);
    }
    case "projectToView": return canon({ refs: lod.projectToView(await viewOf(), call.args.refs) });
    case "resolveFromView": return canon({ refs: lod.resolveFromView(await viewOf(), call.args.refs) });
    case "resolveAggregateEdge": {
      const view = await viewOf();
      const edge = view.aggregate_edges?.find?.((b) => JSON.stringify(b.src) === JSON.stringify(call.args.src) && JSON.stringify(b.tgt) === JSON.stringify(call.args.tgt)) ?? { src: call.args.src, tgt: call.args.tgt };
      return canon({ edges: await lod.resolveAggregateEdge(scene, view, edge, options) });
    }
    case "deriveAggregateId": return canon({ id: await lod.deriveAggregateId(sha(scene), call.args.members) });
    case "isAggregateId": return canon({ result: lod.isAggregateId(call.args.value) });
    default: throw Object.assign(new Error(`unknown api ${api}`), { unknownApi: true });
  }
}

// oversize expected files that the generator does not write: GENERATED.tsv gives their size and SHA-256 instead
const generated = new Map();
const genPath = join(dir, "generated/GENERATED.tsv");
if (existsSync(genPath)) for (const l of readFileSync(genPath, "utf8").split(String.fromCharCode(10)).slice(1)) {
  const f = l.replace(String.fromCharCode(13), "").split(String.fromCharCode(9));
  if (f.length === 5) generated.set(f[2], { bytes: Number(f[3]), sha: f[4] });
}
const tally = { ok: 0, mismatch: 0, skipped: 0 };
const report = [];
for (const row of rows) {
  const id = row[col.id], group = row[col.group];
  const needed = [col.scene, col.layout, col.state, col.input, col.expected].map((c) => row[c]).filter((p) => p && p !== "-");
  const expectedPath = row[col.expected];
  const hashOnly = expectedPath && expectedPath !== "-" && !existsSync(join(dir, expectedPath)) && generated.has(expectedPath);
  const missing = needed.filter((p) => !existsSync(join(dir, p)) && !(hashOnly && p === expectedPath));
  if (missing.length > 0) { tally.skipped++; report.push({ id, group, kind: "SKIPPED", detail: `missing ${missing[0]}` }); continue; }
  const wantErr = row[col.error] ?? "";
  let got, err;
  try { got = await run(row); } catch (e) { err = e; }
  if (err?.unknownApi) { tally.skipped++; report.push({ id, group, kind: "SKIPPED", detail: err.message }); continue; }
  if (wantErr !== "") {
    const gotErr = err === undefined ? "no error" : errString(err);
    if (gotErr === wantErr) tally.ok++; else { tally.mismatch++; report.push({ id, group, kind: "ERROR-MISMATCH", detail: `want ${wantErr}  got ${gotErr}` }); }
  } else {
    if (hashOnly && err === undefined) {
      const g = generated.get(expectedPath);
      if (got.length === g.bytes && sha(got) === g.sha) tally.ok++; else { tally.mismatch++; report.push({ id, group, kind: "HASH-MISMATCH", detail: `got ${got.length} bytes ${sha(got)}; GENERATED.tsv says ${g.bytes} bytes ${g.sha}` }); }
      continue;
    }
    const want = read(row[col.expected]);
    if (err !== undefined) { tally.mismatch++; report.push({ id, group, kind: "UNEXPECTED-ERROR", detail: errString(err) }); continue; }
    if (dec(got) === dec(want)) tally.ok++;
    else {
      tally.mismatch++;
      let i = 0; const a = dec(got), b = dec(want);
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      report.push({ id, group, kind: "BYTES-MISMATCH", detail: `len got ${got.length} want ${want.length}; first difference at ${i}: got ${JSON.stringify(a.slice(Math.max(0, i - 30), i + 50))} want ${JSON.stringify(b.slice(Math.max(0, i - 30), i + 50))}` });
    }
  }
}
console.log(`corpus ${dir}\nrows ${rows.length}: ok ${tally.ok}, mismatch ${tally.mismatch}, skipped ${tally.skipped}`);
for (const r of report) if (verbose || r.kind !== "SKIPPED") console.log(`${r.kind}\t${r.id}\t${r.detail}`);
const skipped = report.filter((r) => r.kind === "SKIPPED");
if (skipped.length > 0 && !verbose) console.log(`skipped ids: ${skipped.map((r) => r.id).join(" ")}`);
process.exit(tally.mismatch === 0 ? 0 : 1);
