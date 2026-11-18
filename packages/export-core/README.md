# isongraph-visualize-export-core

V11 (design 32 rev 3). Export (an unauthenticated **integrity** manifest, bundle verification, one PNG `tEXt` binding chunk) and headless rendering. **Not
claimed:** `claimable` is false; PNG pixels are never promised; the manifest proves that artifacts belong together, not who made them. Private, version 0.0.0,
ESM, Node >= 22.

`.` (DOM-free, no `node:*`): `EXPORT_FORMAT`, `DEFAULT_EXPORT_LIMITS`, `exportBundle`, `serializeExportManifest`, `parseExportManifest`, `verifyExportBundle`,
`embedPngBinding`, `readPngBinding`, `renderHeadless`. Source: `manifest.ts bundle.ts png.ts headless.ts limits.ts index.ts`. Dependencies: renderer-core,
renderer-svg, display-list (`.` and `./canvas2d`), a11y-companion, scene-core (`./primitives`), and interaction-core for `IaError` (finding F-B1). The dependency
on renderer-svg and display-list is the declared departure CCR-V11-7 (owner ruling pending).

## Scripts

`npm test` (fast: rows X and H, Appendix extraction and tracked-file equivalent, PNG/manifest/bundle/headless unit tests, surface tests), `npm run test:slow`
(the mutation matrix: 22 corpus + 17 `ext:` mutants, 37 killed; the two survivors are documented equivalents: `ext:K112-scan` (V8 `JSON.parse` is iterative; the unguarded-parse half of K112 is killed by a unit check) and `ext:E16`), `npm run mutants`, `npm run typecheck`, `npm run build`,
`npm run smoke`, `npm run demo -- <file.ison> [--out dir] [--size WxH] [--events file.json]` (design 17.1), `npm run demo:build` then
`npm run smoke:browser` (design 17.2, 17.4: one Chromium, smoke only; the toggle-to-SVG item is not built, F-B11), `npm run demo:check`, `npm run check`.
`demo/page.mjs` bundles renderer-canvas `./dom` (built with `pointer: "none"`, `liveRegion: "none"`, `canvasLabel: "none"`), interaction-core `./dom`,
a11y-companion `./dom` and this package into a self-contained page (`demo/out`, git-ignored). No network, no storage, no innerHTML.

## Unchecked (design 13.2, audit M-16)

The toggle-to-SVG page of design 17.2 is not built, so the SVG-host input path (design 9.7: `focusRestore: "none"`, the binder moving DOM focus, one Tab stop) has no browser smoke at all; the `svg-native` gate composition is unit-tested on real V5 `readSvg` results only. Also unchecked: assistive-technology behaviour, real browser event semantics beyond one Chromium smoke run, PNG pixels and metadata survival, colour contrast, target sizes on real devices. No accessibility, WCAG or browser-qualification claim.

Note on plans (audit inf-3): a companion tree of more than about 4,500 edge items already exceeds the default 16 MiB plan cap although it is below the 16 MiB tree cap; a host that wants `window: "all"` over a large model raises `maxPlanBytes`.
