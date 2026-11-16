// packages/layout-core/scripts/browser-entry.mjs
import { compileScene } from "isongraph-visualize-scene-core";
import { bindLayout, computeForceLayout, verifyReproducible } from "../dist/index.js";

window.__smoke = async () => {
  const source = new TextEncoder().encode("nodes.person\nid name\n1 Alice\nann Ann\n\nedges.KNOWS\nsource target\n:person:1 :person:ann\n");
  const s = await compileScene(source, "ison-v1");
  const f = await computeForceLayout(s.sceneBytes, { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 });
  await bindLayout(s.sceneBytes, f.layoutBytes);
  const again = await verifyReproducible(s.sceneBytes, f.layoutBytes);
  return { scene: s.sceneSha256, layout: f.layoutSha256, again, secure: window.isSecureContext };
};

window.__insecure = async () => {
  try {
    await compileScene(new TextEncoder().encode("nodes.p\nid\n1\n"), "ison-v1");
    return { rejected: false };
  } catch (e) { return { rejected: true, name: e.name, secure: window.isSecureContext }; }
};
