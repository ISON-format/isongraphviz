// packages/scene-core/scripts/bench-compile.mjs  (informational; no thresholds)
import { performance } from "node:perf_hooks";
import { compileScene } from "../dist/index.js";

function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function source(n) {
  const rand = lcg(7), seen = new Set(), lines = ["nodes.p", "id"];
  for (let i = 0; i < n; i++) lines.push(String(i));
  lines.push("", "edges.E", "source target");
  while (seen.size < 2 * n) {
    const a = Math.floor(rand() * n), b = Math.floor(rand() * n);
    if (a === b || seen.has(`${a}>${b}`)) continue;
    seen.add(`${a}>${b}`); lines.push(`:p:${a} :p:${b}`);
  }
  return new TextEncoder().encode(lines.join("\n") + "\n");
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(JSON.stringify({ node: process.version }));
for (const n of [100, 1000, 10000]) {
  const bytes = source(n), t = [];
  await compileScene(bytes, "ison-v1");
  for (let i = 0; i < 5; i++) { const s = performance.now(); await compileScene(bytes, "ison-v1"); t.push(performance.now() - s); }
  console.log(JSON.stringify({ nodes: n, edges: 2 * n, runs: 5, medianMs: +median(t).toFixed(1), minMs: +Math.min(...t).toFixed(1), maxMs: +Math.max(...t).toFixed(1) }));
}
