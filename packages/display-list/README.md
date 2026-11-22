# display-list (IGR-DL/1, igr-pick/1, igr-cv/1 replay, igr-xr/1)

`isongraph-visualize-display-list` is the shared library of ISONGraph Visualize milestones V6 and V7 (design `docs/isongraph-visualize-blueprint/31-CANVAS-WEBGL-DESIGN.md`, rev 4; implementation notes and findings: `docs/isongraph-visualize-blueprint/reviews/31-implementation-notes.md`). It turns an IGR/1 `RenderModel` and a `SemanticState` (both from `renderer-core`) into one renderer-neutral **display list** (integers and strings only, canonical bytes), and it holds everything that both renderers must agree on by construction: the strict reader, the pick buffer and `pickDrawn`, element bounds, the device size, the theme, the Canvas 2D replay with its recorded stream, and the cross-renderer readout.

Status: **implemented, not frozen.** The independent oracle corpus `fixtures/oracles-dl/` is a DRAFT (its `SHA256SUMS` digest `8c954cdb...5746` is the reference of design 13.7 and pinned nowhere; every run is `claimable: false`). The package depends on `renderer-core` only (`scene-core` and `layout-core` are dev dependencies of the tests) and changes none of the frozen contracts. It is a **shared library, not a renderer**; that `renderer-canvas` (and later `renderer-webgl`) depend on it as well as on `renderer-core` is the declared departure CCR-2 of design 10.1 (owner decision 1).

## What is here

Core entry `.` (DOM-free; no `node:*`, no DOM lib, no `TextEncoder`: `src/utf8.ts` is a strict hand-written UTF-8):

- `buildDisplayList(model, state, options?)` (the records `H n e E A N T`, 4.1-4.4), `dryLabelPass` (the label pass alone, for `probe()`), `serializeDisplayList(list, { maxBytes? })` (canonical bytes, 4.2), `parseDisplayList(bytes, limits?)` (the strict reader, rules D1-D12, 4.7).
- `buildPickBuffer`, `serializePickBuffer`, `parsePickBuffer`, `createPicker(model, state)` (`pickDrawn`: nodes by delegation to the frozen `hitTest`, edges by the drawn route as an exact rational, 5.2), `elementBounds`, `serializeBounds`, `backingSize(width, height, dprMilli)` (6.4).
- `THEME` (igr-theme/1, 4.9), the constants, `DEFAULT_*_LIMITS`.
- `readoutFromList`, `readoutFromSvgReadout` (a structural `SvgReadoutLike`, no import of `renderer-svg`), `serializeReadout`, `compareReadouts` (9).

Subpath `./canvas2d` (DOM-free, structural `Canvas2DLike`): `replayCanvas(source, ctx, options?)` (6.2), `createRecordingContext`, `recordCanvasCalls` (the oracle form of a replay, 6.3), `canvasStreamWitness` (6.6) and `readoutFromCanvasStream` (9.3).

Additions beyond the list of design 2 (additive, for `renderer-canvas` and for the V7 step; named in the implementation notes): `resolveDlOptions`, `assembleReadout`, `inGuardBox` and the types `ReadoutParts`, `ResolvedDlOptions` from `.`, and `resolveReplayOptions` from `./canvas2d`.

Everything geometric is integer (`bigint`) arithmetic; floating point occurs only at the two places design 12 allows (`m / 1000` and `2 * Math.PI` in the executor, `Math.round` and the tolerance in the recorder). All constants are PROVISIONAL and UNMEASURED; changing a normative one is the next version of its format token.

## Commands

Build order: `scene-core`, `layout-core` and `renderer-core` must have been built (their `dist/` is what the `file:` links resolve to), then `npm install` and `npm run build` here (`renderer-canvas` reads this package's `dist/`).

- `npm test`: the FAST suite (a few seconds): the arithmetic, text, canonical writer and UTF-8 units, the options, the builder, the reader, the pick and bounds, the replay against a strict double, the readouts, **every `dl:` function row of `fixtures/oracles-dl` (tier `core` and the function side of tier `both`)**, Appendix A extracted from the design file (skipped visibly when it is absent) and Appendix A from tracked oracle files (never skipped), the source audits.
- `npm run test:slow`: the SLOW suite (`test/slow`, one forked worker): row D05 at scale (pickDrawn against a brute-force reference over random models).
- `npm run check`: typecheck (tests, core without DOM), `npm test`, `npm run test:slow`, `npm run build`, `npm run smoke`.
- `npm run smoke`: Node smoke (needs the build): the lists of three oracle examples equal the oracle bytes, round-trip through the strict reader; the pick buffer and the readout of `G01`.
- On Windows always go through these scripts: `scripts/vitest.mjs` restores an upper-case drive letter (see `packages/renderer-core/README.md`).

The renderer rows (tier `both`, the renderer side), the subject rows `U01`-`U21`, the demo, the browser smoke and the **mutation matrix** for the whole K table (251 mutants over this package's and `renderer-canvas`'s sources) are in `packages/renderer-canvas`.

## Tests and oracle

- `test/oracle/runner.ts` is the corpus row logic for the function rows; it is parameterized by the implementation under test, so that the same code runs against `src/` and against the scratch mutants of the matrix. Expected bytes are never edited or regenerated to make code pass.
- `test/appendix-a.test.ts` extracts the Appendix A blocks (rule X1: block text plus one final LF) and the quoted sizes and SHA-256 values from the design file (git-ignored and local: **skipped with a visible message when absent**). `test/appendix-tracked.test.ts` asserts the same bytes and figures from tracked oracle files and never skips. The `gl:` items of the Appendix (A.5, A.8, A.10) belong to `renderer-webgl`.
- `test/pick.test.ts` and `test/slow/differential-slow.test.ts` run `pickDrawn` against an independent, unpruned reference (the body of row D05).

## Limits and what is NOT claimed

- The Canvas replay is checked as a recorded stream; pixels, antialiasing, text rasterization and shaping are not (design 10). A report is `claimable: false` until the corpus digest is pinned and the kit is released.
- No node or edge count, byte or coordinate limit here is measured: they are safety caps (design 11.4).
- `pickDrawn` is an adapter-level duality with the frozen `hitTest` (declared, 10.1).
- Node 22 and Node 24 are the supported engines; the tests in this tree were run on Node 24 only.
