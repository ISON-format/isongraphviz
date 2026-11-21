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
(the mutation matrix: 106 corpus + 17 `ext:` mutants, 121 killed; the two survivors are documented equivalents: `ext:K112-scan` (V8 `JSON.parse` is iterative; the unguarded-parse half of K112 is killed by rows X31-X44, X86 and a unit check) and `ext:E16`), `npm run mutants`, `npm run typecheck`, `npm run build`,
`npm run smoke`, `npm run demo -- <file.ison> [--out dir] [--size WxH] [--events file.json]` (design 17.1), `npm run demo:build` then
`npm run smoke:browser` (design 17.2, 17.4: one Chromium, smoke only; it covers the Canvas host and, after the `toggle SVG` button, the SVG host), `npm run demo:check`, `npm run check`.
`demo/page.mjs` bundles renderer-canvas `./dom` (built with `pointer: "none"`, `liveRegion: "none"`, `canvasLabel: "none"`), renderer-svg `./dom` and its core
entry, interaction-core `./dom`, a11y-companion `./dom` and this package into a self-contained page (`demo/out`, git-ignored). No network, no storage, no innerHTML.
Four buttons: `fit`, `export bundle`, `gate` and `toggle SVG` (design 17.2). `toggle SVG` swaps the Canvas host for the V5 SVG adapter (built with `pointer: "none"`,
`liveRegion: "none"` and `focusRestore: "none"`, design 9.7): the binder and the companion are disposed, no companion is mounted for the SVG host (its own ARIA
elements and roving `tabindex` are the accessible tree, one Tab stop), the binder is bound again on the same container (`adapterPointer` and `adapterFocusRestore`
`"none"`) and moves DOM focus through `focusElement`, the page writes its own status element from `liveText`, and `gate` runs the `svg-native` composition on a
`readSvg` result of the mounted document. The semantic state is carried across the toggle in both directions. On the SVG host the selection is visible as the class
`igr-selected` only (`aria-selected` is not valid on `graphics-symbol`, design 9.7 `selection-state-in-svg`), and `export bundle` has no PNG (there is no canvas).

## Unchecked (design 13.2, audit M-16)

The SVG-host input path (design 9.7: `focusRestore: "none"`, the binder moving DOM focus, one Tab stop) has one Chromium smoke run on one machine and nothing more. Known gaps of that run (notes `reviews/32-implementation-notes-c.md`, git-ignored): a pointer press on an SVG node selects it but did not move the semantic focus to it in Chromium (C-2); the binder's `surface` must be a stand-in object for an SVG host because the adapter replaces its `<svg>` on every commit (C-1); the smoke cannot tell `focusRestore: "by-id"` from `"none"` (the page source test pins the option); the pan reveal on a zoomed viewport, reduced motion, a real wheel and a real drag, and the click-to-focus-container step of 17.4 are not exercised. Also unchecked: assistive-technology behaviour, real browser event semantics beyond one Chromium smoke run, PNG pixels and metadata survival, colour contrast, target sizes on real devices. No accessibility, WCAG or browser-qualification claim.

Note on plans (audit inf-3): a companion tree of more than about 4,500 edge items already exceeds the default 16 MiB plan cap although it is below the 16 MiB tree cap; a host that wants `window: "all"` over a large model raises `maxPlanBytes`.
