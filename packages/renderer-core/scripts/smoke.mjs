// packages/renderer-core/scripts/smoke.mjs (Node 22 and 24; needs only the built dist)
import { compileScene } from "isongraph-visualize-scene-core";
import { computeForceLayout } from "isongraph-visualize-layout-core";
import { buildRenderModel, hitTest, initialState, reduce, serializeState } from "../dist/index.js";
import { createHeadlessRenderer } from "../dist/headless/index.js";

const source = new TextEncoder().encode("nodes.person\nid name\n1 Alice\nann Ann\n\nedges.KNOWS\nsource target\n:person:1 :person:ann\n");
const s = await compileScene(source, "ison-v1");
const f = await computeForceLayout(s.sceneBytes, { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 });
const model = await buildRenderModel(s.sceneBytes, f.layoutBytes);
const state = initialState(model, { width: 900, height: 600 });
const expected = '{"hidden":{"edges":[],"nodes":[]},"igr":"IGR/1","layout_sha256":"2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db","scene_sha256":"e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc","selection":{"edges":[],"nodes":[]},"viewport":{"center_x":383554,"center_y":134563,"height":600,"width":900,"zoom":1994}}';
if (new TextDecoder().decode(serializeState(model, state)) !== expected) { console.error("SMOKE FAIL: Appendix A.2 state differs"); process.exit(1); }
const hit = hitTest(model, state, { x: 32.0, y: 193.5 });
if (!hit || !("node" in hit) || hit.node.id !== "i:1") { console.error("SMOKE FAIL: Appendix A.4 hit differs"); process.exit(1); }
const r = reduce(model, state, { type: "pan", dx: 10, dy: 0 });
if (r.state.viewport.center_x !== 378539) { console.error("SMOKE FAIL: Appendix A.3 pan differs"); process.exit(1); }
const renderer = createHeadlessRenderer();
await renderer.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
await renderer.loadScene(model);
if (renderer.dispatch({ type: "focus-step", delta: 1 }).length !== 1) { console.error("SMOKE FAIL: dispatch"); process.exit(1); }
console.log(`smoke ok on Node ${process.version}`);
