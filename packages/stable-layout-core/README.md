# isongraph-visualize-stable-layout-core

Stable and incremental layout (milestone V3). Takes two scene versions, computes the node and edge correspondence by IGS/1 typed address
only, keeps every surviving node where it was, places new nodes near what they are connected to, and returns an ordinary `igl-fixed/1`
layout plus a separate displacement report (`IGLS/1`). Specification: `docs/isongraph-visualize-blueprint/28-STABLE-LAYOUT-DESIGN.md`
(rev 3, authoritative). Nothing here changes IGS/1, IGL/1, `scene-core` or `layout-core`; the output verifies with `verifyLayout` and binds
with `bindLayout` like any other layout.

## Status (read this before relying on it)

* **Implemented, test-first, 2026-11-17:** `diffScenes`, `computeStableLayout`, `measureDisplacement`, `snapshotLayout`,
  `verifyDisplacementReport`, `verifyStable`, `verifyStableReproducible`, the work meter, the structured errors. The three worked
  examples of section 5.6 (add, remove, mixed) reproduce byte for byte: every hash, report length and work value.
* **Not audited.** No independent audit and no receipt exist for this package. The independent oracle corpus `fixtures/oracles-stable/`
  was not read while implementing; afterwards a throwaway runner (`scripts/corpus-check.mjs`) replayed its 148 rows against the built
  package: all match byte for byte (outputs) and by `CODE/REASON#detail` (errors). That is agreement with an oracle written from the same design,
  not an audit.
* **Provisional, unmeasured defaults.** `DEFAULT_STABLE_BUDGET` is a proposal (OWNER DECISION 4), not a measurement. The measurement task of
  section 17 (wall time versus meter value on Node 22 and 24, V3's own Map behaviour at long keys, the cost of sorting) has **not** been run.
* **No latency promise.** The meter counts model units, not seconds. Sorting, JSON work and the cost of `verifyScene`, `bindLayout`,
  `verifyLayout` and `computeFixedLayout` (which V3 calls and does not own, IGL/1 section 7.4) are not metered.
* **Re-relaxation, groups, hulls, viewport state, transitions: not implemented** (`relax`, `groups`, `viewport` are refused as
  `INVALID_REQUEST / UNSUPPORTED_OPTION`).
* Interpretation choices where the design is silent are recorded in `docs/isongraph-visualize-blueprint/reviews/28-implementation-notes.md`.

## What it guarantees, and what it does not

Guaranteed: kept nodes never move (checked by the verifiers); each added node is at least `min_separation` from every node placed before
it; the result is a deterministic function of the declared inputs (previous scene and layout bytes, new scene bytes, placement config,
and for a cold start the ForceConfig) with no clock, no random source and no floating point beyond the guarded hand-off to
`computeFixedLayout`; every failure is a `StableLayoutError`, with no partial output.

Not guaranteed: placement quality (distance to a single neighbour, crossings, balance); that kept nodes are separated from each other;
bounded wall-clock time; that a verified layout was *produced* by this algorithm (only `verifyStableReproducible`, by recomputation, says that).
Repeated steps that add unconnected components drift outward by at least `radius` per step (section 5.4).

## Limits (hard, not budget fields) and budget

`COORD_LIMIT = 2^50` thousandths on every node of every layout V3 reads; `MAX_NODE_KEY_UNITS = 2048` for `nodeKey(...)`;
`MAX_REL_UNITS = 2048` for `JSON.stringify(rel)`; the report edge key is therefore at most 10,240 units. A previous drawing is always
re-verified from bytes inside the call; no function accepts a snapshot or an index.

## Use

```ts
import { computeStableLayout, RECOMMENDED_PLACEMENT, verifyStableReproducible } from "isongraph-visualize-stable-layout-core";

const step = await computeStableLayout(previous /* { sceneBytes, layoutBytes } | null */, newSceneBytes,
  { placement: RECOMMENDED_PLACEMENT /* required when previous is non-null */, coldStart: forceConfig /* only for a cold start */ });
step.layout.layoutBytes;   // igl-fixed/1 (igl-force/1 only on the explicit cold-start path)
step.reportBytes;          // IGLS/1, a separate artifact with its own hash step.reportSha256
step.drawing;              // feed to the next call
await verifyStableReproducible(previous, newSceneBytes, step.layout.layoutBytes, step.reportBytes); // "reproduced"
```

## Checks

```text
npm ci            # or npm install; sibling packages are linked by file: path (build them first: scene-core, layout-core)
npm run check     # typecheck, tests, build
npm run build && npm run corpus         # replays fixtures/oracles-stable (SHA256SUMS verified first): every row must match
npm run mutate -- [name-filter]         # mutation proofs: green baseline, each mutant applied to src and restored; a timeout is inconclusive, never a kill
```

Tests: unit tests per module, the section 5.6 acceptance tests, the vectors of section 16 that can be built from the text
(`TD`, `TP`, `TC`, `TM`, `TR`, `TL` families), property tests against an independently written naive reference (`test/reference.ts`) and a
generated pipeline test, and source-hygiene tests. `scripts/mutants.mjs` lists the mutants.
