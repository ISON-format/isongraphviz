// scripts/smoke.mjs (Node 22 and 24; needs the built dist/ of this package and its dependencies, and the tracked corpus): the bundle of O1 equals Appendix A.9
// and verifies, the PNG chunk equals A.8, renderHeadless of O1 equals A.10 (state, svg, tree = A.1), a tampered bundle is refused.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import { exportBundle, verifyExportBundle, renderHeadless, readPngBinding } from "../dist/index.js";

const ORACLES = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "..", "..", "fixtures", "oracles-ia");
const read = (rel) => new Uint8Array(readFileSync(join(ORACLES, rel)));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };

const model = await buildRenderModel(read("scenes/O1.scene.json"), read("layouts/O1.layout.json"));
const state = initialState(model, { width: 900, height: 600 });
const r = await exportBundle(model, state, read("layouts/O1.layout.json"), { png: read("png/fixture.png") });
if (!same(r.manifestBytes, read("json/X03.manifest.json"))) fail("the manifest differs from the tracked A.9 bytes (row X03)");
if (!same(r.files.get("png"), read("png/X04.png"))) fail("the bound PNG differs from the tracked A.8 bytes (row X04)");
await verifyExportBundle(r.files, r.manifestBytes);
const b = readPngBinding(r.files.get("png"));
if (b.scene !== model.sceneSha256 || b.layout !== model.layoutSha256) fail("the PNG binding");
console.log(`ok A.8/A.9: manifest ${r.manifestBytes.length} bytes (${sha(r.manifestBytes).slice(0, 12)}), files ${[...r.files.keys()].join(",")}, verified`);

const bad = new Map(r.files);
const svg = bad.get("svg").slice(); svg[40] ^= 1; bad.set("svg", svg);
try { await verifyExportBundle(bad, r.manifestBytes); fail("a tampered svg was accepted"); } catch (e) { if (e.code !== "INVALID_EXPORT" || e.reason !== "ARTIFACT_MISMATCH") fail(`unexpected ${e}`); }
console.log("ok tamper: a changed svg byte is ARTIFACT_MISMATCH");

const h = await renderHeadless({ sceneBytes: read("scenes/O1.scene.json"), layoutBytes: read("layouts/O1.layout.json"), outputs: ["state", "svg", "tree"] });
if (!same(h.files.get("state"), read("headless/H01.bin")) || !same(h.files.get("svg"), read("headless/H02.bin")) || !same(h.files.get("tree"), read("headless/H04.bin"))) fail("renderHeadless differs from A.10 / A.1");
console.log(`smoke ok on Node ${process.version}`);
