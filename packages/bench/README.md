# isongraph-visualize-bench

V12 (performance evidence). A **private, no-export** package: seeded workload generators, a per-stage measurement harness over the committed packages' public APIs, an
optional Chromium mode, and a report generator. It measures; it **asserts no threshold anywhere** (a slow or refused stage is data, not a failure), it changes **no limit**
of any package, and it reads every other package through its built `dist/` (read-only). Results of the reference run and their caveats are in [RESULTS.md](RESULTS.md).

**Not a qualification.** One machine, one Node, one Chromium, noisy single runs. The workloads are synthetic seeded generators (directed graphs only), not downstream
fixtures; no delta workload exists here (V9 and V13 are blocked and nothing was invented for them).

## What is measured

Workloads (`src/workloads.ts`), each a valid IGS/1 scene (ISON text through `compileScene`) with an IGL/1 **FIXED** layout (explicit positions through
`computeFixedLayout`), at four tiers plus an optional capacity tier at the render-model cap:

| size | nodes | note |
|---|---|---|
| S, M, L, XL | 100, 1,000, 10,000, 100,000 | the PlanMap tiers |
| N20000 | 20,000 | `DEFAULT_RENDER_LIMITS.maxNodes`, run by default beside the four tiers |

| shape | construction (seeded, no `Math.random`, no transcendental function) | edges per node |
|---|---|---|
| `sparse` | uniform random distinct pairs, three relations, scattered positions | 2 |
| `dag` | layered (ceil(sqrt n) layers), every edge from an earlier layer to a later one, layered positions | about 2 |
| `dense` | communities of 20, 85 % of edges inside a community | 8 |
| `hubs` | preferential attachment (power-law degrees), hubs near the centre | about 2 |
| `hierarchy` | level-order random tree (mean branching 3), tidy tree drawing | 1 (n-1 edges) |
| `groups` | clusters of 40 (one category each), three edges per node inside a cluster, few links between clusters | about 3 |

Stages per workload (`src/pipeline.ts`): `scene-build` (compileScene) and `scene-verify`; `layout-fixed`, `layout-verify`, `layout-bind`; `layout-force` (the real FORCE
family, through its **documented budget only**: above 2,000 nodes the refusal is the evidence); `render-model`; `initial-state`; `svg` (renderSvgDetailed: bytes, label
fidelity), `svg-read`; `display-list`, `display-list-serialize`, `display-list-parse`; `canvas-stream` (the Canvas replay recorded into the stream); `gl-plan`,
`gl-plan-serialize`, `gl-plan-parse`; `companion-tree` (window auto), `companion-tree-all` (window all), `companion-plan`, `companion-gate`; `export-bundle`,
`export-verify`; `headless` (renderHeadless, six outputs); per-call latency of `hitTest`, four `reduce` intents, `step` for pointermove, wheel and ArrowRight, and an
event loop (step then reduce); V8 LOD (`lod-view-flat`, `lod-suggest`, `lod-view-collapsed`); V3 stable layout (`stable-diff`, `stable-update` for a second scene
version with 1 % new nodes, `stable-cold` through FORCE). Each record has warmup, repetitions, median / p95 / min / max, the cold first run, RSS growth around the
call, output bytes and a few metrics.

**Default limits first, raised limits second.** A stage runs under the packages' default limits. If a limit refuses (`RESOURCE_LIMIT`), the refusal is recorded and the
stage is measured again with per-call limits raised (`RAISED` in `src/pipeline.ts`); the record says `profile: "raised"` (`*` in the tables). A stage that still refuses
or fails is recorded as such. Nothing is changed in any package, and a raised figure is evidence for what a limit costs to lift, never a new default.

**Process isolation.** The driver runs one child process per workload (`--expose-gc`, a large heap), so RSS and peak memory are per workload and a crash (for instance a
heap exhaustion) costs one entry, recorded with its reason.

**Browser mode** (`--browser`, optional; playwright-core, headless Chromium, localhost only, no network): for the workloads up to `--browser-max-nodes` (default 20,000)
the Node pass writes the SVG, the serialized display list and the GL plan; the page measures the real SVG DOM insertion plus style and layout, the Canvas 2D replay
(JS issue time, and with a one-pixel read-back to force the flush), and the WebGL2 draw with read-back sync plus the 2D label layer. It runs under two launch profiles,
the default headless GL and ANGLE on Direct3D 11, and labels each by the string the browser reports (`UNMASKED_RENDERER_WEBGL`, read in this package only, never by the
libraries): SwiftShader is **software** rendering, a named GPU is hardware. One machine, one engine.

## Commands

| command | what | expected duration (reference machine, see RESULTS.md) |
|---|---|---|
| `npm test` | the fast suite: generators' determinism and validity, statistics, harness, options, report writer, derived tables, an S-size pipeline smoke | about 5 seconds |
| `npm run bench:smoke` | S only, all shapes, 1 + 5 repetitions, the FORCE probe (small), no browser; writes `out/smoke/` | about 15 seconds (Node 22 and 24) |
| `npm run bench` | the full run (S, M, L, 20,000, XL; all shapes; the FORCE probe); add `--browser` or use `npm run bench:browser` for the browser mode | about 53 minutes with the browser mode (30 workloads; 24 browser cases under two GL profiles), measured once |
| `npm run report` | re-derives `out/report.json` (limits evidence, selection proposal), rewrites `out/report.md` and refreshes the generated blocks of `RESULTS.md` | seconds |
| `npm run check` | typecheck, `npm test`, the smoke | about 25 seconds |

Options (flags beat environment beats defaults): `--sizes S,M,L,20000,XL` (`BENCH_SIZES`; names or plain node counts), `--shapes dag,hubs` (`BENCH_SHAPES`), `--reps N` and
`--warmup N` (`BENCH_REPS`, `BENCH_WARMUP`), `--ops N` (calls per interaction sample, 20), `--seed N` (`BENCH_SEED`), `--browser` (`BENCH_BROWSER=1`),
`--browser-max-nodes N`, `--heap-mb N` (worker heap, 16384), `--stage-budget-s N` (a stage stops adding repetitions beyond this, 60; at least one measured run is always
kept), `--worker-timeout-min N`, `--no-force-probe`, `--merge-probes` (re-run only the compileScene probe and merge it into an existing `out/report.json`), `--keep-artifacts`, `--out DIR` (`BENCH_OUT`; default `out/`, `out/smoke/` for the smoke).

Default repetitions (warmup + measured): S 3 + 15, M 2 + 9, up to 30,000 nodes 1 + 5, above that 0 + 2; the stage time budget shortens them for slow stages.

## Output

`out/report.json` (the whole report; this is the source of every number in RESULTS.md) and `out/report.md` (the same as readable tables, plus a per-stage table for every
workload). `out/` is git-ignored, like `node_modules/` and `dist/`. RESULTS.md is committed, small and hand-reviewed: its tables sit between
`<!-- BEGIN GENERATED ... -->` markers and are written by `npm run report` from `out/report.json`; the text around them is hand-written.

## Requirements and environment

Node >= 22 (Node 24 is the default; the fast tests and the smoke were also run on 22), the built `dist/` of the twelve packages it imports (they exist in a checkout that
passed their own `npm run build`), and for the browser mode a Chromium installed for playwright-core 1.65.1 (`./node_modules/.bin/playwright-core install chromium`, once; this
package never installs anything and never uses the network). `node_modules/` was populated offline (`npm install --offline`), like the other packages' `file:` links.

## Known limits of the harness

- RSS growth is the operating system's resident size around a call: coarse, allocator dependent.
- The `loop-key` and `step-*` samples use one fixed state per sample; `hitTest` samples 20 seeded pointer positions per repetition and reports the mean per call.
- The FORCE work column re-implements layout-core's documented formula (`src/force-work.ts`), checked against the producer's own refusal boundary in a test.
- Browser frame figures include the compositor's wait for the next frame; the paint is offscreen and headless.
- Only 1280 x 800 at a device pixel ratio of 1 is drawn; large canvases and high-DPI backing stores are not measured.
