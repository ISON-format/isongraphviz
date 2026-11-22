# isongraph-visualize-a11y-companion

V11 (design 32 rev 3). The accessible companion for hosts without a native accessible tree (Canvas, WebGL), and the accessibility gate. **Not claimed:**
`claimable` is false; nothing here is a WCAG, assistive-technology or browser-qualification claim. Private, version 0.0.0, ESM, Node >= 22.

| Entry | Content |
|---|---|
| `.` (DOM-free) | `buildCompanionTree`, `serializeCompanionTree`, `verifyCompanionTree`, `defaultWindow`, `liveText`, `planCompanionUpdate`, `serializePlan`, `executePlan`, `createRecordingDom`, `COMPANION_CSS`, `runAccessibilityGate`, `serializeGateReport`, `composeManifest` |
| `./dom` | `mountCompanion(host, options)`: the one place that touches a real DOM (smoke only) |

Source files: `tree.ts live.ts plan.ts executor.ts gate.ts svgmap.ts manifest.ts util.ts types.ts index.ts`, `dom/index.ts`. Dependencies: renderer-core,
interaction-core (`Binding`, `DEFAULT_BINDINGS`, `IaError`), scene-core (`./primitives` only). `renderer-svg` and `layout-core` are dev dependencies of tests.

## Scripts

`npm test` (fast, about 2 s: oracle rows C, P, Q, G, M tier-aware, Appendix extraction and tracked-file equivalent, TypeScript-only items of 15.7, D04-D06 with a
handful of seeds, surface tests), `npm run test:slow` (60 seeds per D row, hostile ids; the mutation matrix), `npm run mutants` (33 mutants of design 15.6, the 35 mutants K312-K346 of the rulings R32-14 and R32-15, plus 19 `ext:` mutants of the audit response on
scratch copies in `.mutants/`; production code has no switchable variants), `npm run typecheck` (core without DOM lib, dom with DOM lib, tests), `npm run build`,
`npm run smoke` (Node), `npm run check`. `scripts/vitest.mjs` runs vitest from an upper-case drive letter (Windows path-case workaround). The one-page demo and
the browser smoke live in `packages/export-core` (they bundle all V11 packages).

Findings against the design: `docs/isongraph-visualize-blueprint/reviews/32-implementation-notes-b.md` (local, git-ignored).

## Unchecked (design 13.2, audit M-16)

The toggle-to-SVG page of design 17.2 is not built, so the SVG-host input path (design 9.7: `focusRestore: "none"`, the binder moving DOM focus, one Tab stop) has no browser smoke at all; the `svg-native` gate composition is unit-tested on real V5 `readSvg` results only. Also unchecked: assistive-technology behaviour, real browser event semantics beyond one Chromium smoke run, PNG pixels and metadata survival, colour contrast, target sizes on real devices. No accessibility, WCAG or browser-qualification claim.
