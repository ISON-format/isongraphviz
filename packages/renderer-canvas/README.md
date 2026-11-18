# renderer-canvas (IGR-CV/1)

`isongraph-visualize-renderer-canvas` is the Canvas 2D renderer of ISONGraph Visualize milestone V6. It composes `createHeadlessRenderer` of `renderer-core` (every `Renderer` method is the inner one, unchanged, except `manifest`, the `fidelity` of `probe()` and the extra methods below) and draws through the shared `display-list` library: the display list `igr-dl/1` of the committed state is replayed into a Canvas 2D context in the eight paint layers of design 4.8. Specification: `docs/isongraph-visualize-blueprint/31-CANVAS-WEBGL-DESIGN.md` (rev 4); implementation notes and findings: `docs/isongraph-visualize-blueprint/reviews/31-implementation-notes.md`.

Status: **implemented, not frozen.** The independent oracle corpus `fixtures/oracles-dl/` is a DRAFT (reference digest `22107e0d...353c`, pinned nowhere). The package depends on `renderer-core` **and `display-list`** (the declared departure CCR-2 of design 10.1, owner decision 1: no renderer imports another renderer); `scene-core` and `layout-core` are dev dependencies of the tests and the demo. Two further declared departures stand in the manifest and the adapter: the `dom` renderer declares `a11y.native-dom` and `a11y.companion-dom` `unsupported/NOT_IMPLEMENTED` (CCR-3, 8.4) and the adapter selects by `pick` (the drawn route) while `hitTest` stays the frozen chord (10.1). Owner decisions 1 and 16 are the owner's; this tree implements the design as written and does not claim them made.

## What is here

Core entry `.` (DOM-free; no `node:*`, no DOM lib):

- `createCanvasRenderer(options?)`: the headless renderer; the backend is the recording context. Extra methods: `displayList()`, `displayListBytes()` (bounded by the renderer option `maxDlBytes`), `canvasCalls()` (the recorded stream, with `dprMilli` and `ink`), `pick(point)` (the drawn-route picker), `elementBounds()`, `status()`. `probe()` never throws for geometry: its `fidelity` comes from the dry label pass.
- `canvasManifest(host, options?)`: the capability manifest (`createCanvasRenderer(o).manifest` equals `canvasManifest("headless", o)` byte for byte); honest `x-` extras (`x-dl.display-list`, `x-dl.pick-drawn`, `x-render.per-element-dom`, `x-render.host-text`).
- `createCanvasSubject(options?)`: the conformance subject of the IGR/1 kit; its witness reads the **stream**, never `probe()` (level 2 here is weaker than V5's: `texts` is empty, design 6.6).

Subpath `./dom`: `createDomCanvasRenderer(options?)`, the thin browser adapter (one `<canvas>` sized through `backingSize` and the CSSOM, whole-frame replay at every commit, one `pointerdown` handler through `pickDrawn`, a live status line, `role="img"` and an `aria-label`). A refused commit (a coordinate beyond 2^40 milli-pixels, a throwing context) **clears the canvas**, reports through `env.onError` and sets `status().failure`. It has no keyboard, wheel, move, focus or hover handler, is **not claimed accessible** (design 8.3) and claims no conformance level.

`createDomCanvasRenderer` also takes three additive adapter-only options (CCR-V11-6 of design 32, for hosts that bring their own input layer and accessible companion): `pointer: "builtin" | "none"` (default `"builtin"`; `"none"` registers no pointer listener), `liveRegion: "builtin" | "none"` (default `"builtin"`; `"none"` creates and writes no status `div`) and `canvasLabel: "builtin" | "none"` (default `"builtin"`; `"none"` sets `aria-hidden="true"` on the canvas and writes no `role="img"` or `aria-label`). The wrapper reads, validates (a bad value is `INVALID_INPUT/INVALID_VALUE`) and strips them; the shared composer and `createCanvasRenderer` still reject them as unknown keys (`INVALID_INPUT/SCHEMA`). The type is `DomCanvasRendererOptions`.

All constants are PROVISIONAL and UNMEASURED.

## Commands

Build order: `scene-core`, `layout-core`, `renderer-core` and **`display-list`** must have been built (their `dist/` is what the `file:` links resolve to), then `npm install` and `npm run build` here.

- `npm test`: the FAST suite: the `both` rows of the oracle against the renderer (list, stream, pick, bounds, readout), the `subject` rows `U01`-`U09`, `U13`, `U14` (lifecycle scripts and outcome files), unit tests for the options, the manifest, the composition, the registry, the subject and the DOM adapter against a minimal fake DOM, the differential rows `D01`-`D04` with a few seeds, the surface and source audits (exact dependencies, no DOM lib or `node:*` in the core, the security allowlist grep of 11.1, the K table guard). The tests exercise the `display-list` **source** (a vitest alias), so a change there is tested at once.
- `npm run test:slow`: one forked worker: the IGR/1 kit run over `fixtures/oracles-igr` with `createCanvasSubject` (rows `U10`-`U12`, level 2), many more differential seeds, a 20,000-node scale check and the **mutation matrix** (193 mutants, about a minute).
- `npm run mutants`: the mutation harness alone (`scripts/mutate.mjs`, `--only K01,K09`, `--jobs N`, `--timeout MS`); writes `.mutants/report.json` (git-ignored).
- `npm run check`: typecheck (tests, core without DOM, adapter with DOM), `npm test`, `npm run test:slow`, `npm run build`, `npm run smoke`, `npm run demo:check`.
- `npm run smoke`: Node smoke (needs both builds): lists and streams of three oracle examples equal the oracle bytes; `pickDrawn` reaches a self-loop; the subject's witness.
- `npm run smoke:browser`: Chromium smoke of the adapter through `playwright-core` (`./node_modules/.bin/playwright-core install chromium` once): the canvas is not blank (non-blankness only, never identity), a real press on a node selects it and its identity resolves, a press on empty space clears, a press on a self-loop's apex selects the loop, a Tab emits no focus event. One engine, one machine: a **smoke run, not browser qualification**.

## Mutation testing

`scripts/mutants-table.mjs` lists the 193 mutants of the K table of design 13.5 (K01-K187 with the b-variants) as exact-text patches applied to a **scratch copy** of both packages' `src/` (`.mutants/<id>/`); production code has no switchable variants. A mutant is KILLED when an oracle row (or one of the extra rows `ext:` of `test/oracle/runner.ts`) fails, SURVIVED when none does, INCONCLUSIVE on a timeout (never counted as killed), and a patch that does not apply is a HARNESS-ERROR. `test/mutants-table.test.ts` checks that every patch still applies to the current sources. The two documented differences from the corpus's named killers are in the implementation notes (K84, K154).

## Demo (non-normative)

- `node scripts/render-ison.mjs <file.ison> [--out file] [--size WxH] [--what dl|calls] [--layout fixed|force] [--demo]`: source text -> scene (`scene-core`) -> layout (`layout-core`; `fixed` is a deterministic integer grid, `force` the corpus policy `igl:F01`) -> display list -> Canvas stream, written to `demo/out/`. For `fixtures/oracles/o1-basic.source.ison` with `--layout force` the list is the bytes of row `dl:G01` and the stream those of `dl:C01` (`npm run demo:check` compares them). `--demo` also writes `demo/out/data.js`.
- `npm run demo:build` bundles the adapter into `demo/out/demo.js`; `demo/index.html` (serve the folder from `localhost`: hashing needs a secure context) paints the display list on a real `<canvas>` and shows click -> `pickDrawn` -> `ObjectRef` -> `resolveSelection` identity in the embedded source.

## Limits and what is NOT claimed

- Levels 0 and 1 of IGR/1 pass by delegation to the reference renderer and prove nothing about drawing; level 2 means the stream the renderer produces holds a painting call for each drawn element in its mandatory layer and for no other element (no geometry, no text). Every report is `claimable: false` until the kit is released and the corpus pinned.
- Not claimed: pixels, antialiasing, text rasterization and shaping, canvas-size limits, Canvas accuracy beyond about 10^6 px, browser behaviour beyond the single smoke run, assistive technology, keyboard operation (V11), performance (V12).
- The `dom` adapter rebuilds the picker once per pointer press (lazily per committed state); the whole-frame replay and the list rebuild per commit are O(N + E) `bigint` work with no culling (design R-5, V12).
