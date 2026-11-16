// packages/scene-core/scripts/smoke.mjs  (runs on the supported Node versions, 22 and 24; needs only the built dist)
import { compileScene, verifyScene } from "../dist/index.js";

const source = new TextEncoder().encode("nodes.person\nid name\n1 Alice\nann Ann\n\nedges.KNOWS\nsource target\n:person:1 :person:ann\n");
const r = await compileScene(source, "ison-v1");
const expected = { artifact: "1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a", scene: "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc" };
if (r.artifactSha256 !== expected.artifact || r.sceneSha256 !== expected.scene) {
  console.error("SMOKE FAIL", r.artifactSha256, r.sceneSha256);
  process.exit(1);
}
await verifyScene(r.sceneBytes);
console.log(`smoke ok on Node ${process.version} (globalThis.crypto.subtle: ${Boolean(globalThis.crypto?.subtle)})`);
