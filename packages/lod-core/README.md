# isongraph-visualize-lod-core

Generic semantic level of detail (IGLOD/1), implementing `docs/isongraph-visualize-blueprint/29-LOD-DESIGN.md` (rev 4).

```
(verified scene, bound layout, LODState)  ->  View          (deriveView)
```

A pure, deterministic derivation: which scene nodes and edges are visible, which aggregate stands in for hidden nodes, how many edges each
aggregate edge stands for, and at which level (`hidden`, `short`, `full`) each label is shown. Inputs are graph topology and
application-supplied hints only. It never changes a scene, a layout or either hash, never measures pixels or text, and has no domain vocabulary.

## Status

**Implemented, tested, NOT frozen, NOT qualified.** This is the first implementation of the design. The design itself is a draft (rev 4).

- Depends on `isongraph-visualize-scene-core` and `isongraph-visualize-layout-core` by `file:` path (both frozen; neither is modified here).
- The package source imports no Core (`ison-graph-ts`), no Ext and no renderer. Core is nevertheless loaded at run time transitively through
  scene-core and layout-core (design section 12).
- The worked Examples A, B and C of design section 14 are reproduced byte for byte (state, aggregate ids, views, `view_sha256` and the work
  formula values 3,127 / 3,492 / 3,507); the test reads the printed bytes out of the design document.
- The independent oracle corpus `fixtures/oracles-lod/` is not part of `npm test`; `scripts/corpus-check.mjs` runs it against the built `dist` through the real
  verifiers (see `docs/isongraph-visualize-blueprint/reviews/29-implementation-notes.md` for what was run, the design defects found and the ambiguities).
- Tests: 265 in 11 files. `node scripts/mutation.mjs` (on a scratch copy; green baseline required) reports its mutants as killed, survived or inconclusive.
- The independent audit (`reviews/29-code-audit.md`) findings I-1, I-2, I-3 and the cheap minors are fixed; see the implementation notes for the rest.

## API

`verifyLODState`, `hashLODState`, `serializeLODState`, `emptyState`, `collapseGroup`, `expandGroup`, `replaceGroups`, `setPinned`, `withZoom`,
`withLayout`, `deriveAggregateId`, `isAggregateId`, `suggestGroups` (`pendant-fold/1`, `components/1`; `kcore/1` is reserved and unqualified),
`deriveView`, `serializeView`, `projectToView`, `resolveFromView`, `resolveAggregateEdge`, `checkViewConservation`, `LODError`,
`DEFAULT_LOD_BUDGET`, `LOD_HARD_LIMITS`. Everything that derives an aggregate id is `async` (WebCrypto SHA-256).

Pure-data extension point only: group-based LOD from IGDM (V1b is BLOCKED) is not implemented; the reserved names are refused.

## Limits and the work model are PROVISIONAL and UNMEASURED

All values of `LOD_HARD_LIMITS`, `DEFAULT_LOD_BUDGET` and the weights of the work formula `W` are the design's *proposed* numbers. **None has been
measured**; nothing here claims a latency, a throughput or that `W` bounds wall time. `W` is a proposal validated by test only: the instrumented
counter (one tick per elementary step of the formula's classes) is asserted `<=` each class term on the worked examples and on 400 generated
scenes, and a violation is `INTERNAL/WORK_MODEL`. The meter is **not a complete count** of the work: conservation key building, union-find, `children`, coordinate copies, allocations and the key length of pin lookups are not charged, and the meter charges `ceil(L/64)` per aggregate-id hash, which can be one block below the true SHA-256 compressions (`W` bounds counted ticks, not hashing time). Not counted, and not bounded: `verifyScene` and `verifyLayout` inside `bindLayout`, JSON parse
cost of scene and layout, `Map`/`Set` cost for very long keys (design section 11, the IGL-1 hazard), garbage collection, wall time.

The performance task of the design (measure every limit, re-rule the values, identifier-length effects) has not been done.

Not run: a browser smoke (WebCrypto in a secure context); any performance measurement. The hard `MAX_NODES` / `MAX_EDGES` boundaries are exercised by the lowered-budget unit tests and by the corpus rows B02 and B03 (generated).

## Scripts

- `npm run check` : typecheck, the whole vitest suite, build.
- `node scripts/mutation.mjs [--work dir] [--timeout s] [id ...]` : the mutation sample (46 seeded mutants; each must be killed by at least one test, M14 is a known equivalent mutant). It copies the package to a scratch directory and never touches the repository; it requires a green baseline and reports timeouts, crashes and build errors as inconclusive, not killed.
- `node scripts/corpus-check.mjs [corpusDir] [--verbose]` : throwaway runner of the independent oracle corpus against the built `dist` (`npm run build` first). Read-only.
