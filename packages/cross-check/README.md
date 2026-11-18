# cross-check (XR-1)

`isongraph-visualize-cross-check` is the **test-only, private, no-export** harness of design 9 (rule XR-1) of `docs/isongraph-visualize-blueprint/31-CANVAS-WEBGL-DESIGN.md`: the semantic readout `igr-xr/1` of V5's SVG renderer, of the display list, of the recorded Canvas stream and of the WebGL plan must be byte-identical for the same render model, state and shared label options, and `drawn`/`marked` must equal the `probe()` of every renderer. It depends on `renderer-core`, `display-list`, `renderer-svg`, `renderer-canvas` and `renderer-webgl` (it is the one package that imports all three renderers; nothing depends on it) and reads the corpora `fixtures/oracles-svg` and `fixtures/oracles-dl` as **data only** (scenes, layouts, states, expected readouts; their digests are asserted first; no oracle tool is read).

## What XR-1 proves and what it does not (design 9.5)

- **Independent:** V5's SVG renderer (its own writer, its own reader, its own DOM) against the display list **for what the readout contains** (presence, marks, node centres, label text); and the Python oracle's bytes (`oracles-dl` `xr/Rnn.xr.json`) against each of the four readouts.
- **By construction, not independent:** the list, Canvas and GL readouts are projections of **one** list built by one function. Their agreement proves that the Canvas executor and the plan encoder follow the list, not that the list is right; Canvas and WebGL label agreement is the same replay over the same text records.
- **Not compared:** edge routes and label positions (only the parity test C-V5 compares them with V5's printed numbers), ring and halo shapes, colours, fonts, pixels, hidden-by-guard geometry. XR-1 does not prove pixel equality, equal glyphs or that a human sees the same graph.
- It pulls forward **only** the fixture-free presence/marks/centres/labels check (9.6). The PlanMap's V13 item "cross-renderer semantic conformance" (groups, visibility/LOD, timeline, downstream fixtures) is **not** done by this package.

## What is here

- `test/three-way.test.ts`: XR-1 over the 62 `G N X Y O` scenes of `oracles-svg` that use only the shared label options (the states for which `buildDisplayList` refuses, `N11` and `N12`, are reported as not applicable, 3.5); XR-1 against the Python oracle's expected bytes for all 21 `{from: list}` rows `R` of `oracles-dl`; the harness double `D06` (a readout derived from `probe()` must fail); a regression double (a stream with a node's painting removed).
- `test/parity.test.ts`: C-V5 (design 3.2): the integers of the list, printed with V5's `fmt`, are the numbers V5 prints (node centres, every route number, edge label positions).
- `test/slow/xr-generated.test.ts`: XR-1 over 60 seeded generated models (plain and hostile strings, random intents).
- `test/surface.test.ts`: private, no exports, exact dependencies, a leaf, no oracle tool read.
- `scripts/xr-ison.mjs <file.ison> [--layout fixed|force]` prints the artifact sizes and `XR-1: agree` (or the differing paths); `scripts/smoke.mjs` runs it on three oracle sources.

## Commands

All four packages (`display-list`, `renderer-svg`, `renderer-canvas`, `renderer-webgl`) must have been built for the scripts (`npm run build` in each); the tests use their **source** through vitest aliases.

- `npm test`: the fast suite. `npm run test:slow`: the generated models. `npm run check`: typecheck, both suites, the smoke.
