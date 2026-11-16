// packages/layout-core/scripts/bench-layout.mjs - INFORMATIONAL only: producer time through computeForceLayout. No thresholds.
import { compileScene } from "isongraph-visualize-scene-core";
import { computeForceLayout } from "../dist/index.js";

const CFG = { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 };
const mixed = (n) => {
  let s = 12345;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let t = `nodes.p\nid\n${Array.from({ length: n }, (_, i) => i).join("\n")}\n\nedges.R\nsource target\n`;
  const seen = new Set();
  for (let i = 0; i < 2 * n; i++) { const a = Math.floor(r() * n), b = Math.floor(r() * n); const k = a + "," + b; if (a === b || seen.has(k)) continue; seen.add(k); t += `:p:${a} :p:${b}\n`; }
  return t;
};
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`node ${process.version}; ${process.platform} ${process.arch}`);
console.log("n      edges   median ms (3 runs after 1 warm-up)   of which compile (verify + hash) is outside this figure");
for (const n of [100, 300, 1000]) {
  const s = await compileScene(new TextEncoder().encode(mixed(n)), "ison-v1");
  await computeForceLayout(s.sceneBytes, { ...CFG, iterations: 5 });
  const t = [];
  for (let i = 0; i < 3; i++) { const a = performance.now(); await computeForceLayout(s.sceneBytes, CFG); t.push(performance.now() - a); }
  console.log(`${String(n).padEnd(6)} ${String(s.scene.edges.length).padEnd(7)} ${median(t).toFixed(1).padStart(10)}`);
}
