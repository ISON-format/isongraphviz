# renderer-svg (IGR-SVG/1)

`isongraph-visualize-renderer-svg` is the SVG renderer of ISONGraph Visualize milestone V5. It turns an IGR/1 `RenderModel` and a `SemanticState` (both from `renderer-core`) into **one SVG document**, deterministically, byte for byte, without a DOM, and it carries every element's typed address in the document so that a click resolves, through the element's own id, to the address that the source resolves. Specification: `docs/isongraph-visualize-blueprint/30-SVG-RENDERER-DESIGN.md` (rev 4); ambiguity log and findings: `docs/isongraph-visualize-blueprint/reviews/30-implementation-notes.md`.

Status: **implemented, not frozen.** The independent oracle corpus `fixtures/oracles-svg/` is a DRAFT (its digest is recorded in the design for reference and pinned nowhere). The package depends on `renderer-core` only (`scene-core` and `layout-core` are dev dependencies of the tests and the demo) and changes none of the frozen contracts (IGS/1, IGL/1 rev 1, IGR/1 rev 5, V3, V8).

## What is here

Core entry `.` (DOM-free; no `node:*`, no DOM lib):

- `renderSvg(model, state, options?)`, `renderSvgDetailed` (document, `fidelity`, `label_units`, `bytes`), `writeSvg(model, state, options, sink)` (streaming: one LF-terminated line per `sink` call; the line that would exceed `maxSvgBytes` is never delivered).
- `elementDomId(prefix, address)`, `decodeElementId(prefix, id)` (reversible, injective, strict, bounded), `pickElement(model, state, prefix, { targetId?, point? })` (target id first, nodes win over an edge target, `hitTest` as the fallback).
- `readSvg(svg, limits?)` (strict reader of the `igr-svg/1` grammar with the consistency rules W1-W10), `svgWitness(svg)`.
- `svgManifest(host, options?)`, `createSvgRenderer(options?)` (composes `createHeadlessRenderer`; adds `svg()`, the SVG `fidelity` of `probe()` and the manifest), `createSvgSubject(options?)` (conformance subject with a witness).

Subpath `./dom`: `createDomSvgRenderer(options?)`, the thin browser adapter (mount, `pointerdown` mapping through `pickElement`, live status line). It renders with the same resolved options as `svg()` (the dom defaults: 8 MiB document, 262,144 label units). If a commit fails after the core state advanced (an over-limit or ill-formed document) the call still succeeds, the error goes to `env.onError`, the old document stays mounted and the next dispatch catches up; a failed `loadScene` commit rejects but leaves model and state consistent. It claims no conformance level.

`createDomSvgRenderer` also takes three additive adapter-only options (CCR-V11-6 of design 32, for hosts that bring their own input layer): `pointer: "builtin" | "none"` (default `"builtin"`; `"none"` registers no pointer listener and sets no cursor), `liveRegion: "builtin" | "none"` (default `"builtin"`; `"none"` creates and writes no status `div`) and `focusRestore: "by-id" | "none"` (default `"by-id"`; `"none"` neither remembers the focused id nor calls `focus()` after a commit). The wrapper reads, validates (a bad value is `INVALID_INPUT/INVALID_VALUE`) and strips them; the shared composer and `createSvgRenderer` still reject them as unknown keys (`INVALID_INPUT/SCHEMA`). The type is `DomSvgRendererOptions`.

Everything geometric is integer (`bigint`) arithmetic; the numbers in the output are fixed-point text produced from integers. All constants are PROVISIONAL and UNMEASURED; changing one is `igr-svg/2`.

## Commands

Build order: `scene-core`, `layout-core` and `renderer-core` must have been built (their `dist/` is what `file:` links resolve to), then `npm install` and `npm run build` here.

- `npm test`: the FAST suite (about 2 s, 322 tests): Appendix A extraction, unit tests for every rule, the oracle corpus rows of every tier, surface and source audits, the adapter against a minimal fake DOM, the differential rows D01-D04 with a few seeds.
- `npm run test:slow`: the SLOW suite (`test/slow`, one forked worker): the IGR/1 kit run over `fixtures/oracles-igr` with `createSvgSubject` (rows U10-U12, level 2), the 4 MB id of row T28, many more differential seeds, a 20,000-node scale check, and the **mutation matrix** (about 1.5 minutes).
- `npm run mutants`: the mutation harness alone (`scripts/mutate.mjs`, `--only K01,K09`, `--jobs N`, `--timeout MS`); writes `.mutants/report.json` (git-ignored).
- `npm run check`: typecheck (tests, core without DOM, adapter with DOM), `npm test`, `npm run test:slow`, `npm run build`, `npm run smoke`, `npm run demo:check`.
- `npm run smoke`: Node smoke (needs the build): renders O1/F01 and two more examples to `demo/out/*.svg` and compares them with the oracle bytes.
- `npm run smoke:browser`: Chromium smoke of the adapter through `playwright-core` (`./node_modules/.bin/playwright-core install chromium` once). One engine, one machine: a **smoke run, not browser qualification**.

On Windows always go through these scripts: `scripts/vitest.mjs` restores an upper-case drive letter (a shell that starts in `d:\...` makes plain `npx vitest` fail every file; see `packages/renderer-core/README.md`).

## Tests, oracle and mutation testing

- The oracle rows run through `test/oracle/runner.ts`, which is parameterized by the implementation under test, so the same row logic runs against `src/` (`test/oracle.test.ts`) and against scratch mutants. Tier `core` rows call the function; tier `both` rows also load the model into `createSvgRenderer` and compare `svg()`; tier `subject` rows run the lifecycle scripts. Expected bytes are never edited or regenerated to make code pass.
- `test/appendix-a.test.ts` extracts the Appendix A code blocks (A.1-A.4) and the quoted figures from the design file and compares them with the output; the design file is git-ignored and local, so that test is **skipped with a visible message when it is absent** (a fresh clone). `test/appendix-tracked.test.ts` never skips: it asserts the same Appendix A bytes and figures (A.1 to A.10: sizes, SHA-256 values, the three blocks, the degenerate edge, loop, parallel groups, extreme coordinates, option sizes, click chain and hit numbers) from the tracked oracle documents G01, Y03, Y07, N14, G02, G05, N11, O01-O06 and X01.
- `scripts/mutants-table.mjs` lists the 114 mutants K01-K114 of design 15.6 as exact-text patches applied to a **scratch copy** of `src/` (`.mutants/<id>/`); production code has no switchable variants. A mutant is KILLED when an oracle row fails, SURVIVED when none does, INCONCLUSIVE on a timeout (never counted as killed), and a patch that does not apply is a HARNESS-ERROR. `test/mutants-table.test.ts` checks that every patch still applies to the current source.

## Demo (non-normative)

- `node demo/render-ison.mjs <file.ison> [--out file.svg] [--size WxH] [--layout fixed|force] [--demo]`: source text -> scene (scene-core) -> layout (layout-core; `fixed` is a deterministic integer grid through the FIXED family, `force` the FORCE family with the corpus policy `igl:F01`) -> SVG, written to `demo/out/`. `--demo` also writes `demo/out/data.js` (source, scene and layout bytes, base64).
- `npm run demo:build` bundles the adapter into `demo/out/demo.js`; `demo/index.html` (serve the folder from `localhost`: hashing needs a secure context) shows click -> `ObjectRef` -> `resolveSelection` identity in the embedded source.

## Limits and what is NOT claimed

- Levels 0 and 1 of IGR/1 pass by delegation to the reference renderer and prove nothing about drawing; level 2 means the document the renderer produces, parsed by the strict reader, holds exactly the drawn elements and their names, for scenes without the scalars that XML cannot carry (D-XML, design 7.1). Every report is `claimable: false` until the kit is released.
- Not claimed: browser rendering beyond the single smoke run, assistive-technology behaviour, cross-browser behaviour of `pointer-events: stroke`, performance (V12), colour contrast, keyboard graph navigation (V11), aggregates (V8, deferred).
- `hitTest` follows the straight chord (27 section 7.1) and cannot hit a self-loop or any parallel edge but the lowest-index one; the adapter avoids this through the target element's id (`pickElement`). Disclosed in design 9.4.
- `npm test` stays small by design: the 4 MB id, the kit runs and the mutation matrix are in the slow suite.
