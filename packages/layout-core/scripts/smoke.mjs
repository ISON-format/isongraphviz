// packages/layout-core/scripts/smoke.mjs (runs on the supported Node versions, 22 and 24; needs only the built dist)
import { compileScene } from "isongraph-visualize-scene-core";
import { bindLayout, computeFixedLayout, computeForceLayout, verifyReproducible } from "../dist/index.js";

const source = new TextEncoder().encode("nodes.person\nid name\n1 Alice\nann Ann\n\nedges.KNOWS\nsource target\n:person:1 :person:ann\n");
const CFG = { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 };
const EXPECTED = { scene: "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc", layout: "2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db" };

const s = await compileScene(source, "ison-v1");
const f = await computeForceLayout(s.sceneBytes, CFG);
if (s.sceneSha256 !== EXPECTED.scene || f.layoutSha256 !== EXPECTED.layout || f.layoutBytes.length !== 398) {
  console.error("SMOKE FAIL", s.sceneSha256, f.layoutSha256, f.layoutBytes.length);
  process.exit(1);
}
await bindLayout(s.sceneBytes, f.layoutBytes);
if ((await verifyReproducible(s.sceneBytes, f.layoutBytes)) !== "reproduced") { console.error("SMOKE FAIL: not reproduced"); process.exit(1); }
const x = await computeFixedLayout(s.sceneBytes, [{ ref: { id: "i:1", type: "person" }, x: 1, y: 2 }, { ref: { id: "s:ann", type: "person" }, x: 3, y: 4 }]);
await bindLayout(s.sceneBytes, x.layoutBytes);
console.log(`smoke ok on Node ${process.version} (globalThis.crypto.subtle: ${Boolean(globalThis.crypto?.subtle)}), layout ${f.layoutSha256.slice(0, 12)}...`);
