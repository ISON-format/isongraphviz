# V3 stable-layout oracle corpus (independent rebuild)

Status: **DRAFT rev 3, 2026-11-17** (updated for rev 3 of the design, which resolved A-01 to A-24; see `AMBIGUITIES.md`). An independent Python oracle for `docs/isongraph-visualize-blueprint/28-STABLE-LAYOUT-DESIGN.md` (V3 rev 2). It is not frozen, has not been compared with any implementation, and is the *first* corpus built from the design text alone. Every place where the text was ambiguous, contradictory or impossible is recorded in [`AMBIGUITIES.md`](AMBIGUITIES.md); an implementation mismatch against this corpus is a finding to explain, never a reason to regenerate an expected file.

**Section 5.6 reproduced exactly.** Cases A, B and C (previous `d6ca9f78...`, layouts `318c404c...`, `2b98f869...`, `5574bf70...`, reports `9642990a...` (1,703 bytes), `f019567f...` (1,499), `f2047035...` (2,099), `W* 61 / 39 / 105`, `(work, waves, placed)` = `(61,1,1)`, `(39,0,0)`, `(105,2,2)`) came out byte for byte on the first run, with no difference from the text. `tools/selftest56.py` asserts all of it.

## Independence statement

* Written from: `28-STABLE-LAYOUT-DESIGN.md`, `docs/specs/IGS-1.md`, `docs/specs/IGL-1.md`, `docs/conformance/README.md`, and, for house style only, `fixtures/oracles-igl/` (its README, `EXPECT.tsv`, `tools/make_oracles.py`, `tools/make_sums.py`, and the frozen scenes and layouts that vectors reference).
* **Not read, not run:** anything under `packages/` (no TypeScript at all), any other blueprint document, anything under `reviews/`.
* Pure Python 3.12 standard-library integer arithmetic (`//` for `floorDiv`, `(2a+b)//(2b)` for `divRound`, `math.isqrt`). The IGL-CJ/1 writer, the NodeRef/2 order, the IGL/1 section 4 quantizer, the diff, the wave/frontier placement, the occupancy grid, the meter, the aggregates, the IGLS/1 writer and all three verifiers are written in `tools/stablelib.py`; nothing is imported from `fixtures/oracles-igl/tools`.
* The only third-party code is **Core Python** (`ison_graph` 1.4.1, installed in the user site-packages, checked with `python -c "import ison_graph"`), used for the FORCE cold starts (TC01 to TC03, TM03) with the same UTF-16 transcoding shim as the IGL corpus (a compatibility shim, not evidence that unmodified Core Python behaves identically). TC01 and TC02 reproduce the frozen `fixtures/oracles-igl/layouts/F01.layout.json` byte for byte (asserted by the generator).
* Shared assumption: all expected bytes are *the design's rules transcribed*. They test an implementation against the text, not the text against an intention; the meter and grid charges are a model, so `WORK_LIMIT` rows test arithmetic agreement only.
* Self-checks (all pass): every produced layout verifies and binds; every produced report passes the standalone verifier, `verifyStable` and `verifyStableReproducible`; every T-REPORT row is run through the Python verifier and must give the `CODE/REASON` the design states; `tools/check_corpus.py` replays all rows from the files on disk; `tools/crosscheck.py` replays all 36 incremental placement rows with a second, naive implementation (no grid, no shared code) and agrees on positions, wave, ring, direction and meter value.

## Layout

```
EXPECT.tsv         one row per vector (148 rows)
scenes/            IGS/1 scene bytes: <id>.prev.scene.json (previous), <id>.scene.json (new / next), worked-*.scene.json
layouts/           IGL/1 bytes: <id>.prev.layout.json (previous, an input), <id>.layout.json (expected output),
                   <id>.next.layout.json (T-MEASURE next drawing, an input)
reports/           IGLS/1 bytes: <id>.report.json (expected output of a producer, or the INPUT of a report verifier)
diffs/             IGLS-DIFF/1 bytes: <id>.diff.json
tools/             generator and checkers (not covered by SHA256SUMS)
SHA256SUMS         every file except tools/ and SHA256SUMS itself ('<sha256> *<path>', byte order of the path)
```

Some rows reference frozen files of the IGS and IGL corpora by relative path (`../oracles/o1-basic.scene.json`, `../oracles-igl/layouts/F01.layout.json`, `X01`, `X03`, `scenes/empty.scene.json`); they are read-only and not repeated here. Hand-written scenes carry `source.artifact_sha256 = SHA-256(ASCII text)`: for the worked examples exactly the texts of section 5.6, for every other scene the vector id text (for example `TP01`, previous `TP01.prev`); the design fixes this only for the worked examples.

## EXPECT.tsv

Columns (tab separated): `id group previous_scene previous_layout scene input expected_layout expected_report expected_diff error work`. Paths are relative to this directory. `previous_*` are empty for a null previous drawing and for the T-REPORT/T-LIMIT rows that take no drawing.

`input` is a compact JSON **call descriptor** (the design's single `input` column cannot carry the extra arguments some functions need, see A-10):

| `fn` | Other keys | Expected |
|---|---|---|
| `diffScenes` | `budget` | `expected_diff`, `work` (= C1) |
| `computeStableLayout` | `options` (`placement`, `coldStart`, `budget`, `relax`, `groups`, `viewport`, unknown keys, exactly as passed) | `expected_layout`, `expected_report`, `expected_diff` (when a previous drawing exists), `work` (= `stats.work`), or `error` |
| `measureDisplacement` | `next_layout` (the caller's next layout, an input), `budget` | `expected_report`, `work` |
| `verifyDisplacementReport` | `report` (input bytes), `budget` | accepted (`error` empty, `work` = V1) or `error` |
| `verifyStable`, `verifyStableReproducible` | `report`, `layout` (input bytes), `budget`; previous drawing and new scene from the row columns | accepted (`work` = V1+V2, or V1+V2+production) or `error` |

`error` is `CODE/REASON`. A `#detail` suffix carries the structured error's detail where the design assigns one: `UNSUPPORTED_OPTION#relax|groups|viewport`, `UNKNOWN_KEY#<key>`, `REPORT_MISMATCH#HASH|NODE_SET|STATUS|POSITION|EDGES|ANCHOR|WAVE`, `NOT_REPRODUCED#MODE|BYTES`, and for `NO_FREE_SLOT` the node's wire address as compact canonical JSON (the design does not fix the text, A-09). `IGS:` is not used; no row needs a scene-library error. `work` is the final meter value of a successful call; for a `WORK_LIMIT` refusal it is `W` at the refusal (TL07a 78, TL07c 34).

## Vector groups produced

| Group | Rows | Ids |
|---|---|---|
| T-DIFF | 17 | `TD01`-`TD16`, plus `TD16R` (the reversed pair, for the swap property) |
| T-PLACE | 29 | `TP01`-`TP24`; `TP11`, `TP12`, `TP14` are split `a`/`b` (/`c`) because each has several parts; `TP06r` is TP06 under `RECOMMENDED_PLACEMENT` (A-01). `TP19`, `TP22`, `TP23` are Cases B, A, C |
| T-COLD | 17 | `TC01`-`TC08`; `TC04b/c`, `TC06a-e`, `TC07a-d` split the multi-part rows |
| T-MEASURE | 11 | `TM01`-`TM10`; `TM08` (next layout empty), `TM08b` (previous layout empty) |
| T-REPORT | 34 | `TR01`-`TR31` (`TR25a`/`TR25b`); plus `TR01s` (`verifyStable` accepts Case C) and `TR01r` (`verifyStableReproducible` returns `reproduced`). `TR22` is the rev 3 row (a `cold` report for an empty new scene with a previous drawing), `TR31` a seed record with no kept record |
| T-LIMIT | 40 | `TL01`-`TL21` except `TL11` (unit-test-only); `TL04`, `TL04b`, `TL04c`, `TL05`/`TL06`, `TL07a-d`, `TL08a-d`, `TL09a-h`, `TL14a/b`, `TL17`, `TL17b`, `TL19`, `TL19b`, `TL21a-c` |

Not corpus rows (rev 3 lists them as unit-test-only properties, with the observable rows that accompany them): `TL11`, the cross-process half of `TD16`, the spy assertion of `TL04` (`TL04b` is its observable form), `snapshotLayout` outputs, and the inline tests of section 16. Nothing else in section 16 is missing. Extra rows beyond the design's ids: `TD16R`, `TP06r`, `TR01s`, `TR01r`, `TL04b` (defined by rev 3) and, as oracle additions, `TC04b/c`, `TC06e`, `TM08b`, `TL04c`, `TL17b`, `TL19b`.

## Regenerate

```text
python tools/make_oracles.py   # writes EXPECT.tsv, scenes/, layouts/, reports/, diffs/ (all expected bytes)
python tools/make_sums.py      # rewrites SHA256SUMS
python tools/check_corpus.py   # replay every row from disk: 0 mismatches
python tools/crosscheck.py     # second, naive placement implementation over the incremental rows
python tools/selftest56.py     # section 5.6, asserted
```

Python 3.12 and Core Python (`ison_graph`); `ISON_GRAPH_PY_SRC` is not needed because Core Python is installed. A regeneration from an empty tree reproduces every generated file byte for byte (checked at rev 3: `SHA256SUMS` identical). No wall clock, random source or hash-table order enters any byte.

## What this establishes, and what it does not

Established: the design text is sufficient to rebuild section 5.6 exactly, and to rebuild every other vector except the ones listed above; the T-REPORT rows each violate one rule and are refused with the design's stated reason by an independent verifier. Rev 3 numbers re-derived independently and found equal to the design (no disagreement): TP06 distance 23,428, Case C verifier charges 30/44/74/179, the exact 10,240 edge key, `TL12` 5,000 units. Not established: behaviour of any implementation, wall-clock time, the default budgets, V3's own Map behaviour at long keys, or `isqrt` on very large inputs in a TypeScript port.
