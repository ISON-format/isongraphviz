// scripts/smoke.mjs (Node 22 and 24; needs the built dist/ of this package and its dependencies, and the tracked corpus): the tree of O1 equals Appendix A.1, its
// full-build plan executes on the recording DOM to the log of row Q01, the gate passes (G8 info) on it, and a composed manifest has the seven x-ia ids.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import { buildCompanionTree, serializeCompanionTree, planCompanionUpdate, serializePlan, createRecordingDom, executePlan, runAccessibilityGate, composeManifest } from "../dist/index.js";

const ORACLES = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "..", "..", "fixtures", "oracles-ia");
const read = (rel) => new Uint8Array(readFileSync(join(ORACLES, rel)));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };

const model = await buildRenderModel(read("scenes/O1.scene.json"), read("layouts/O1.layout.json"));
const state = initialState(model, { width: 900, height: 600 });
const tree = buildCompanionTree(model, state);
if (!same(serializeCompanionTree(tree), read("trees/C01.tree.json"))) fail("the tree differs from the tracked A.1 bytes (row C01)");
const ops = planCompanionUpdate(undefined, tree);
if (!same(serializePlan(ops), read("plans/P01.plan.txt"))) fail("the plan differs from the tracked bytes (row P01)");
const rec = createRecordingDom();
executePlan(rec.dom, rec.host, ops);
if (!same(rec.log(), read("logs/Q01.log.txt"))) fail("the executor log differs from the tracked bytes (row Q01)");
const gate = runAccessibilityGate({ model, state, tree, fidelity: { motion: "none" }, reducedMotion: true });
if (gate.verdict !== "pass") fail("the gate failed on the initial tree");
const m = composeManifest(JSON.parse(new TextDecoder().decode(read("manifests/base-dom.manifest.json"))), { input: true, companion: true });
if (Object.keys(m.capabilities).filter((k) => k.startsWith("x-ia.")).length !== 7) fail("the composed manifest");
console.log(`ok: tree ${serializeCompanionTree(tree).length} bytes, plan ${ops.length} ops, log ${rec.log().length} bytes, gate ${gate.verdict}`);
console.log(`smoke ok on Node ${process.version}`);
