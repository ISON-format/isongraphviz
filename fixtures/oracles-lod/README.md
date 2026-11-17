# IGLOD/1 oracle corpus (V8 generic level of detail)

Status: **DRAFT** (not frozen, not audited). Produced by an independent oracle author from `docs/isongraph-visualize-blueprint/29-LOD-DESIGN.md` (rev 2, then updated to rev 3 and rev 4 after the design author resolved the findings) alone, in Python, with no sight of any TypeScript. Findings against the design are in [`AMBIGUITIES.md`](AMBIGUITIES.md).

## What is here

`EXPECT.tsv` (tab separated; columns `id group scene layout state input expected error`; `-` = absent; paths relative to this directory) lists 429 vectors: 194 positive (an `expected` file) and 235 negative (an `error` of the form `CODE/REASON`, `IGS:CODE/REASON` or `LAYOUT:CODE/REASON`).

| Group | Vectors | Content |
|---|---|---|
| W | 3 | the three worked examples of section 14 (`deriveView`) |
| A | 26 | aggregate identity (`deriveAggregateId`, `isAggregateId`, hostile scenes and states) |
| C | 41 | collapse, expand, builders and round trips (`ops` call files), invalid groups |
| N | 10 | nesting, depth 16 / 17, N08 `suggestGroups` union |
| E | 29 | edge bundling, self-loops, undirected, density cap, generated random scenes |
| L | 17 | label levels and policy |
| T | 38 | `suggestGroups` (both rules, errors) |
| P, S, R | 11, 23, 8 | pins; `projectToView` / `resolveFromView`; `resolveAggregateEdge` |
| M | 111 | state verification, one defect per vector, stage order |
| B | 60 | budgets and hard limits (oversize ones are generated, see below) |
| X, D | 4, 8 | extensions, anchors, ranges, relation order, optional keys, `x-` keys |
| Z | 40 | rev 4 rows Z01-Z22 (suggestGroups size and order, `x-` number tokens and traversal order, document key order, own `__proto__`, `expandGroup` on an invalid state, literal-view arguments, `deriveAggregateId` with 0 and 1 members, builder number tokens), plus extra boundary rows (Z06b-i, Z12b/c, Z13b/c, Z19-Z21) |

Directories: `scenes/`, `layouts/` (`igl-fixed/1`, with `.layout.sha256`), `states/`, `calls/` (call files), `expected/` (expected result bytes with `.sha256` beside each), `sources/` (the ISON source of the first example), `generated/GENERATED.tsv` (id, role, path, size, SHA-256 of every oversize file; the files themselves are not stored). `SHA256SUMS` lists every file except `tools/` and itself.

Vector ids follow the plan of section 15.2. A planned id realized by several vectors carries suffixes (`M05a`-`M05i`); extra vectors use free suffixes; `R01`-`R08` are `resolveAggregateEdge`. Ids not produced and why: end of `AMBIGUITIES.md`.

## How it was produced

* `tools/lodlib.py`: the oracle's own implementation of IGS-CJ/1 and IGL-CJ/1 writers, laminar painting, state verification (staged, with raw number tokens), aggregate ids, `deriveView` (representatives, bundling, internal counts, density cap with a spanning-forest union-find, label ladder, anchors by floor division), `suggestGroups` (`pendant-fold/1`, `components/1`), builders, view mappings, `resolveAggregateEdge`, the work formula W, and a minimal IGS/1 scene and `igl-fixed/1` layout verifier. Standard library only; integers are exact.
* `tools/gen_infra.py`, `g_wam.py`, `g_cnps.py`, `g_elt.py`, `g_b.py`: scene, layout and state builders and vector recorders. A recorder writes the input files, **re-reads them from disk**, runs `lodlib` and stores the result; every expected byte therefore comes from the Python implementation. The generator also asserts the design's stated facts (RT1, RT4, id stability under pins, label levels, anchors against exact rational arithmetic, conservation).
* `tools/make_oracles.py` (generator), `make_sums.py` (writes `SHA256SUMS`), `mutants.py` (self-check), `diff_networkx.py` (optional T15 differential).
* Section 14 was reproduced **first**, from the printed ISON source: source hash `b46dc3b5...`, scene bytes (1,673) and `fbf8c619...`, layout bytes (550) and `d7a8924d...`, state A bytes (384) and `b52bd0bd...`, states B and C (`1d137de1...`, `927c32b9...`), the aggregate ids, views A, B, C byte for byte (1,878 / 1,419 / 1,528 bytes; `f379e189...`, `9421525f...`, `054d9518...`) and the work values 3,127 / 3,492 / 3,507. Nothing differed.
* Rev 3 update (re-derived from this implementation, not copied): whitespace in `type` is the JavaScript `\s` set (M22), the standalone verifier applies `MAX_STATE_BYTES` (B16v), builders sort and `verifyLODState` never does (C11b/C11b2 builder, C11c unsorted file, C11d canonical order), RT2 wrapper (C15a), `children` direct only (N03), E12/E12b, M08 string = `SCHEMA` and the new `+1`, `00`, `1e999` tokens, B10 negative budgets (B10f, B10g), call files closed as specified, `resolveAggregateEdge` check order (state mismatch before work), `suggestGroups` input-size check. Example D (undirected outline) agrees with vector E07 on every stated fact (bundle `(x, Agg)`, `count 2`, `a-b` internal, 0 visible edges, 1 visible and 2 hidden nodes); the design prints no bytes for it, so nothing could differ byte-wise. Sections 14 A-C still reproduce byte for byte. The 363-row figure in section 15.2 of the design is now 386.
* Rev 4 update: every value the design states for Z01-Z18 (including the ids and preimage sizes of Z16 and Z17) was computed first by this implementation and then compared; all agree. Implementation changes made for rev 4: numbers inside `x-` values are judged by value (`1.0`, `1e3` pass stage 2 and are `NON_CANONICAL`; `-0`, `1.5`, `1e999` are `INVALID_NUMBER`), `suggestGroups` catalog check order, strict View shape check, malformed `{agg}` argument is `INVALID_ID`, only `expandGroup` verifies its input state (other builders verify their result; the input is read leniently), builders judge caller numbers by token rules, `deriveAggregateId` ref checks, the edge argument of `resolveAggregateEdge` is shape-checked. B02d and B03d are now the exactly-at-limit rows that pass (inclusive limits); the over-limit twins are B02e and B03e. Unit-test-only per design: cycles and `MAX_CALLER_VISITS`, `checkViewConservation` binding to the scene.
* Self-checks run during this work: 8 seeded mutants (anchor truncation, undirected key for a directed scene, self-loop counted twice in `vdeg`, relation order by UTF-16, member order by UTF-16, pins left out of aggregate ids, forest not kept, `DUPLICATE_GROUP` checked after laminarity) are each killed by at least one stored vector (`python tools/mutants.py`); the rules were compared with networkx on 400 random graphs (0 mismatches); regeneration into an empty directory reproduces every file byte for byte (`SHA256SUMS` compared).

## Independence statement

Read: the design `29-LOD-DESIGN.md`; `docs/specs/IGS-1.md`, `docs/specs/IGL-1.md` (schema, number and canonical sections, verification and binding), `docs/conformance/README.md` (first screens); in `fixtures/oracles-igl/`: `README.md`, the first rows of `EXPECT.tsv`, `tools/make_oracles.py` and `tools/make_sums.py` as models. Not read, not run: anything under `packages/`, any other blueprint document or review receipt, any TypeScript or Node program. Core Python was not imported by the generator (`ison_graph` was only checked to be installed). No git operation, no existing file edited.

What this corpus does **not** establish: that the hand-written scenes and layouts are accepted by the real TypeScript verifiers (only by this author's reimplementation, AMBIGUITIES A-29); behaviour at the default work budget with huge relation names (A-30); anything about wall time.

## Oversize vectors

B01, B01t, Z01-Z03, B02, B02d, B02e, B03, B03d, B03e, B04, B04o, M14b, B05, B05o, B16, B16t, B16v, B16vt, B17, B17o are produced by deterministic functions and not stored. Their sizes and SHA-256 are in `generated/GENERATED.tsv`; the `scene`, `layout`, `state`, `expected` columns of those rows name paths under `generated/` that exist only after

```text
python tools/make_oracles.py --materialize generated      # writes every generated/<id>.<role>.json (about 0.7 GB; the B01 and B01t scenes are 256 MiB each)
```

## Regenerate and check

```text
python tools/make_oracles.py        # about 45 s; rewrites EXPECT.tsv and every file; LOD_FULL=0 skips the oversize vectors
python tools/make_sums.py           # rewrites SHA256SUMS
python tools/mutants.py             # seeded-mutant self-check
python tools/diff_networkx.py       # optional differential (needs networkx)
sha256sum -c SHA256SUMS
```

Call-file shapes used (the design leaves some open; each is an entry in `AMBIGUITIES.md`): `{"api":"deriveView","args":{},"options":{"budget":{...}}}`; `{"api":"suggestGroups","args":{"rules":[...]}}`; `{"api":"ops","args":{"ops":[{"api":...,"args":...}]}}`; `{"api":"projectToView"|"resolveFromView","args":{"refs":[...]}}` (S10 adds `args.view`); `{"api":"resolveAggregateEdge","args":{"src":...,"tgt":...}}`; `{"api":"deriveAggregateId","args":{"members":[...]}}`; `{"api":"isAggregateId","args":{"value":"..."}}`. Call files with negative integers use the signed IGL-CJ/1 writer.
