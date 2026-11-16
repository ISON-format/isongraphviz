// packages/scene-core/scripts/browser-entry.mjs
import { compileScene, verifyScene } from "../dist/index.js";

window.__smoke = async () => {
  const source = new TextEncoder().encode("nodes.person\nid name\n1 Alice\nann Ann\n\nedges.KNOWS\nsource target\n:person:1 :person:ann\n");
  const r = await compileScene(source, "ison-v1");
  await verifyScene(r.sceneBytes);
  return { artifact: r.artifactSha256, scene: r.sceneSha256, secure: window.isSecureContext };
};
