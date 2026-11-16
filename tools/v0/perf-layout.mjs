// V0.8 layout performance baseline (measurement only; no thresholds are derived from it).
// usage: node tools/v0/perf-layout.mjs <core-ts-dist-dir> <prototype media/main.js>
//
// Both implementations receive the SAME explicit settings, recorded in the "settings" line:
// width 900, height 600, iterations 170, seed 42, margin 60 (these equal Core's defaults and the
// prototype's call settings). The graph is identical for both: n nodes of one type, 2n distinct
// directed edges from a fixed LCG. A parity check compares the two layouts for n=100 and n=500.
import { createRequire } from "node:module";
import os from "node:os";
import { performance } from "node:perf_hooks";

const [coreDist, protoMain] = process.argv.slice(2);
if (!coreDist || !protoMain) throw new Error("usage: perf-layout.mjs <core-dist> <main.js>");
const require = createRequire(import.meta.url);
const { ISONGraph } = require(`${coreDist}/index.js`);
const { computeLayout: coreLayout } = require(`${coreDist}/viz.js`);
const { computeLayout: protoLayout } = require(protoMain);

const SETTINGS = { width: 900, height: 600, iterations: 170, seed: 42, margin: 60 };
const SIZES = [100, 500, 1000, 2000];
const WARMUP = 1;

function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function edgesFor(n) {
  const rand = lcg(7), seen = new Set(), out = [];
  while (out.length < 2 * n) {
    const a = Math.floor(rand() * n), b = Math.floor(rand() * n);
    const key = `${a}>${b}`;
    if (a === b || seen.has(key)) continue;
    seen.add(key); out.push([a, b]);
  }
  return out;
}

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function time(fn, runs) {
  for (let i = 0; i < WARMUP; i++) fn();
  const t = [];
  for (let i = 0; i < runs; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); }
  return t;
}

console.log(JSON.stringify({ env: { node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: Math.round(os.totalmem() / 2 ** 30), platform: os.platform(), arch: process.arch } }));
console.log(JSON.stringify({ settings: SETTINGS, sizes: SIZES, warmupRuns: WARMUP, edgesPerNode: 2, edgeGenerator: "lcg(7), distinct directed pairs, no self loops" }));

for (const n of SIZES) {
  const es = edgesFor(n), runs = n >= 1000 ? 3 : 5;
  const g = new ISONGraph("perf");
  for (let i = 0; i < n; i++) g.addNode("p", i);
  for (const [a, b] of es) g.addEdge("E", ["p", a], ["p", b]);
  const pn = Array.from({ length: n }, (_, i) => ({ type: "p", id: i }));
  const pe = es.map(([a, b]) => ({ source: ["p", a], target: ["p", b] }));
  const impls = [
    ["core-ts-computeLayout", () => coreLayout(g, SETTINGS)],
    ["prototype-main.js", () => protoLayout(pn, pe, SETTINGS)],
  ];
  for (const [impl, fn] of impls) {
    const t = time(fn, runs);
    console.log(JSON.stringify({ impl, nodes: n, edges: es.length, runs, medianMs: +median(t).toFixed(1), minMs: +Math.min(...t).toFixed(1), maxMs: +Math.max(...t).toFixed(1) }));
  }
  if (n <= 500) {
    const a = coreLayout(g, SETTINGS), b = protoLayout(pn, pe, SETTINGS);
    let maxDiff = 0, missing = 0, count = 0;
    for (const [k, [x, y]] of a) {
      const q = b[k];
      if (!q) { missing++; continue; }
      count++;
      maxDiff = Math.max(maxDiff, Math.abs(x - q[0]), Math.abs(y - q[1]));
    }
    console.log(JSON.stringify({ parity: { nodes: n, comparedNodes: count, missingInPrototype: missing, maxAbsDiff: maxDiff, sizeCore: a.size, sizePrototype: Object.keys(b).length } }));
  }
}
