// Compiles oracles-igl/sources/*.source.ison to oracles-igl/scenes/*.scene.json with the V1a compiler (independently frozen).
// Run from packages/scene-core after `npm run build`:  node ../../fixtures/oracles-igl/tools/compile_scenes.mjs
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { compileScene } = await import(pathToFileURL(resolve(process.cwd(), "dist/index.js")).href);
mkdirSync(join(OUT, "scenes"), { recursive: true });
for (const f of readdirSync(join(OUT, "sources")).filter((x) => x.endsWith(".source.ison")).sort()) {
  const name = f.replace(".source.ison", "");
  const r = await compileScene(new Uint8Array(readFileSync(join(OUT, "sources", f))), "ison-v1");
  writeFileSync(join(OUT, "scenes", name + ".scene.json"), r.sceneBytes);
  console.log(name.padEnd(8), r.scene.nodes.length, "nodes", r.scene.edges.length, "edges", r.sceneSha256.slice(0, 12));
}
