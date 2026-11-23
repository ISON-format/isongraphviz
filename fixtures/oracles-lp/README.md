# LP/1 label placement oracle corpus (`oracles-lp`)

Status: **DRAFT** (not frozen; the digest of `SHA256SUMS` is not pinned anywhere). Produced against design 37 (`37-LABEL-PLACEMENT-DESIGN.md`, LP/1, **DRAFT rev 3**, 2026-11-22: width 9 px per UTF-16 unit (half width 4.5u px), `h = ceil(9u/2)+14|10`, on top of rev 2's 29 candidates per kind and fallback to the candidate of least cost (number of distinct colliding boxes, ties to the earliest) and rev 1's grid growth by 1 px; the earlier versions of this corpus (rev 0, rev 1, rev 2) are wholly superseded: every expected file, row count, mutant table and digest is regenerated; AMBIGUITIES.md keeps the earlier entries, marked), the pure function `placeLabels(input) -> offsets`.

## Independence statement

* The expected bytes come only from the Python code in `tools/` (standard library only, Python 3), written from design 37 alone plus the layout and bookkeeping conventions of the earlier corpora (`oracles-ia`, `oracles-dl`: README, `EXPECT.tsv`, `SHA256SUMS`, `MUTANTS.tsv`, `AMBIGUITIES.md`, `tools/`).
* The author did **not** read, import, copy or run any TypeScript implementation of the placement, nothing under `packages/` and no tool code of another corpus (ruling R-G: an independent oracle written from the design alone).
* Group R2 uses, as **data**, the `N` and `T` records of the PRE-LP/1 versions of some `oracles-dl/dl/*.dl` files (the current files of that corpus have already been placed by LP/1, so their label positions are not default positions). The 16 pre-LP/1 files were copied byte for byte once, from the repository history, into `sources/` and are pinned by SHA-256 in `tools/r2.py`; nothing else of that corpus (no tool code, no expected result) is read, and regenerating this corpus needs nothing outside `fixtures/oracles-lp/` (AMBIGUITIES A-29, A-49).
* Shared assumption: oracle and code implement the same written rule; the corpus proves agreement with the text as read in `AMBIGUITIES.md`, not that the rule is wise. Read `AMBIGUITIES.md` before judging any mismatch: it lists every place where the text is ambiguous, contradictory or cannot be built, with the reading used, and three design defects (A-17 grid, A-20 complexity claim, A-21 dense layouts; rev 1 repaired A-17 in its section 7, see the `Rev 1` section of `AMBIGUITIES.md`).

## What is specified, and the binding reading

`tools/lp.py` is the reference: the plain **all-pairs** reading of sections 2 to 6 (boxes in micro-pixels, collision with a 1 px gap, 29 candidates per kind, first free candidate, fallback to the first candidate of least cost = number of distinct colliding boxes, every placed box recorded at its chosen position). `tools/lpgrid.py` is a second, independent implementation of the section 7 grid (64 px cells, integer floor of the edges, a box stored in every cell it touches, the tested box grown by 1 px as rev 1 requires; the fallback cost is the size of the set of colliding box edge tuples found in the cells touched by the grown candidate box, so identical boxes count once). The generator asserts that both agree (positions and chosen candidate numbers) on every row and on 2000 random inputs of its own generator (fractional, negative, boundary-biased and 2^40 px coordinates; widths up to 90 units).
**The TypeScript implementation is required to produce output identical to this all-pairs reading** (the grid is an optimisation that must not change a single byte). One correction to the literal text of section 7 is needed for that to hold: the tested box must be grown by 1 px on every side (A-17).

## File formats

* `inputs/<id>.json`: `{"labels":[{"kind":"node"|"edge","units":<int>,"x":"<int>","y":"<int>"},...],"nodes":[{"cx":"<int>","cy":"<int>"},...]}`. `cx`, `cy`, `x`, `y` are **decimal strings** of integers (micro-pixels, 1 px = 1,000,000, possibly negative, up to 2^62 in absolute value: JSON numbers would lose precision). `units` is a JSON integer.
* `expected/<id>.json`: `[{"dx":<int>,"dy":<int>},...]`, one entry per label in the order of `labels`, whole pixels (JSON integers, never `-0`).
* **Canonical JSON rule** (every JSON file of the corpus): keys sorted (byte order), separators `,` and `:` without any whitespace, ASCII only (no escapes are needed), no BOM, exactly one trailing LF (U+000A). LF only; no CR anywhere.
* `EXPECT.tsv`: header `id group tier input expected error note`, one row per id (**374 rows**), tab separated; `group` is the leading letter family, `tier` is `core` or `stress` (the three S rows, large inputs), `input` and `expected` are paths relative to this directory (never leaving it), `error` is always empty (the function is total; invalid input is unspecified and has no row), `note` is a one-line rationale.
* `SHA256SUMS`: one line `<sha256> *<path>` per file of the corpus except itself (the `tools/` files are included), sorted by byte order of the path. `sha256sum -c SHA256SUMS` from this directory must be clean. The digest of `SHA256SUMS` itself cannot be stored here (this README is covered by it); it is `sha256sum SHA256SUMS`.
* `MUTANTS.tsv`, `OVERLAP.tsv`, `CANDSTATS.tsv`: generated reports (below). `AMBIGUITIES.md`: hand-written log.

## Regeneration and self-check

```sh
python tools/gen.py                  # rebuilds inputs/, expected/, the reports, README.md and SHA256SUMS; deterministic under any PYTHONHASHSEED
python tools/gen.py --out DIR        # the same into DIR (copies AMBIGUITIES.md, sources/ and tools/): byte-identity proof
python tools/gen.py --mutant K012    # prints the rows that change under one mutant
python tools/check.py                # independent check from disk (canonical form, both implementations, sums, paths)
sha256sum -c SHA256SUMS
```

`gen.py` builds every row from `tools/rows.py` (seeded `random.Random(int)`, integer arithmetic only, no clock), computes the expected files with the all-pairs reference, checks the hand-derived hints stored with the rows (the chosen candidate number or offset, derived from the design by hand: the generator stops on a mismatch), asserts properties (node order is irrelevant: every row is re-run with shuffled `nodes`; the T rows equal D02; swapped orders differ), checks the grid reading on every row and on the random inputs, runs a reachability check (every candidate 1..11 is the first free one for both kinds and u = 1, 2, 3, 5, 8, 12, 40: no candidate is dominated), a check that after placement every colliding pair involves a fallback label, the mutant matrix and writes the files. No file mentions a path outside the corpus.

## Rows: 374, per group

| Group | Rows | Content |
|---|---|---|
| E | 16 | basic and degenerate: empty input, nodes without labels, one label, labels without nodes, duplicate nodes, an own node absent from the list, a short edge |
| C | 116 | every candidate in turn: for node labels and edge labels, u = 1 and 4, candidate k = 1..29 (rev 2: 18 more than rev 1) is forced to be the first free one by whole-pixel blocker nodes (the generator asserts that the chosen index is k) |
| W | 24 | widths: u = 1, 2, 3, 12, 40, 200; the candidates (+-h, dy) with h = ceil(9u/2)+14 (node) or ceil(9u/2)+10 (edge); expected offsets also stated by the hand formula (asserted) |
| F | 27 | fallback (rev 2: the first candidate of least cost, the cost being the number of DISTINCT colliding boxes): all 29 candidates blocked (node and edge, u = 1, 3, 12), 31 identical labels (u = 2: candidates 1..29 then two fallbacks), and 19 seeded-search rows that each separate the rule from one fault: the minimum is not the first nor the last, is the first, is the last, ties (first minimum wins), identical node boxes (distinct counting), earlier placed label boxes in the cost, node boxes in the cost, gap 1 px in the cost, the winner beyond candidate 11, and the recording of a placed fallback box |
| G | 52 | the 1 px gap (u=2 integer edges; G-H rows: odd u=3 and u=1 with half-pixel box edges): node box versus label and label versus label on all four sides at a gap of 1 px (free), 1 px minus 1 micro-px and 0 (collide); the four corners with seven (gap x, gap y) cases including 0.8/0.8 (a Euclidean distance would separate them) and 1 px / 0.999999 px |
| O | 7 | order dependence: pairs and triples swapped; node label before edge label and the reverse (the function never reorders) |
| B | 7 | earlier labels block later ones at their chosen position; edge labels see node labels, node boxes and earlier edge labels; node labels see other nodes |
| I | 12 | identical default positions: 2, 3, 5, 12 and 31 labels spreading through the 29 candidates (u = 2, 3, 4, 8 node; u = 1, 2, 4 edge): u = 3 is the flush odd-u boundary (side candidate exactly 1 px from the column label), u >= 4 skips the side candidates; the eleven column slots of wide edge labels |
| D | 8 | dense clusters: 20 nodes, 20 node labels and 37 edge labels at chord midpoints on a 20-gon ring (radius 90, 140, 220, 400), a 5x4 grid and two partial variants |
| T | 10 | translations of D02 by whole cells, by origin-straddling shifts, by 2^40 px and by micro-pixel fractions: the expected file equals D02's (asserted) |
| N | 37 | cell boundaries and far coordinates: box edges exactly on multiples of 64 px, node and label edges in different cells with a gap below, at and above 1 px, negative coordinates, x = 0 straddling, 2^40 px, exactly +-2^62 micro-px |
| M | 10 | micro-pixel fractions (1, 500000, 999999) on every coordinate, gaps of exactly 1 px and 1 px minus 1 micro-px with fractional edges |
| X | 5 | own node as obstacle: the default is free of the own node for u = 1..200; non-standard defaults where the node does block |
| H | 6 | huge units: 10^6 (boxes 9e6 px wide) and 10^5 with twelve labels (the eleven column slots, then a fallback) |
| R | 15 | seeded random scenes (small: 0-14 nodes, 1-17 labels, fractional and negative coordinates, mixed kinds, sometimes interleaved kinds) |
| R2 | 19 | REAL layouts: the node (N) and label (T) records of 15 PRE-LP/1 `dl/*.dl` files (verbatim copies in `sources/`, extracted from the history of `oracles-dl/dl`) (G01, G02, G05, G07, G08, G09, G11, N03, N09, N10, N17, X08, X10, X11, F04; S58 is identical to G05 and omitted) used as inputs (milli-px x 1000; units = UTF-16 length of the text; node labels then edge labels), plus four scaled-down (denser) variants (G05 /2 and /3, N17 /2, F04 /2); the sources are pinned by SHA-256 in `tools/r2.py` |
| S | 3 | stress (tier `stress`): 24x24 grid with 1,680 labels, 5,000 labels on 2,500 random nodes in a 5000x5000 px window, 600 identical labels (adversarial density: 29 candidates, then fallbacks with a full cost pass) |
| **total** | **374** | `core` 371, `stress` 3 |

Hand-checkable: rows E, C, W, F, G, I, O, B, H, X, N, M carry a stated expectation (`exp`) in `tools/rows.py` (a candidate number, `not the default`, or an exact offset) that the generator asserts against the reference; the blockers of C, W and F rows are nodes found by a whole-pixel search, and the row note says which candidates they block.

## Mutants (`MUTANTS.tsv`)

280 reference faults, each a switch of the configurable all-pairs engine `tools/mut.py` (reference faults) or of the grid `tools/lpgrid.py` (grid faults), run over every row and diffed against the stored expected files: **272 killed, 8 unkillable**. Families: collision rule (gap 0 / 2 px, `<=`, one axis, asymmetric, Euclidean, each of the four conditions dropped), box sizes (width 6 (rev 0), 7 (rev 2), 8, 10 px per unit; the half width 4.5u floored or rounded up to whole pixels; heights 12 and 14; node half size 10, 12, 14), the 29-candidate lists (every adjacent pair swapped, per kind; lists truncated at 11, 17 and 28; every candidate's `dy` and `dx` one off; the d order of the added candidates swapped, ascending, reversed pairs; the side offset `d+20` versus `d`, `d+19`, `d+21`; the order inside the added triples), `h` formulas (node and edge: +-1 on the constant, floor instead of ceil, the rev 2 formula `ceil(7u/2)`, `4u`, `5u`, `9u`, kinds swapped), the rev 2 fallback, kept in rev 3 (default position, last candidate, candidate 2, last minimum on ties, cost counting boxes instead of distinct boxes, cost ignoring label boxes, cost ignoring node boxes, cost with a gap of 0, minimum among the first 11 only), who sees whom (six switches), order (edge-first, reverse), bookkeeping (placed box at the default, fallback not recorded, only defaults recorded, nothing recorded), last-free instead of first-free, default not tried, sign flips, coordinates floored / rounded / in float64, a units cap, and fifteen grid faults (first cell only, query first cell only, no 1 px growth, sign lost, mixed floor/truncation, truncation, exclusive end, three cell sizes, the dedupe of rev 1, and three faults of the fallback cost: stored copies counted, cells counted, dedupe with copies counted). Column `killing_rows` lists up to 25 rows that change under the mutant, `stress_rows_changed` the S rows (the S rows are evaluated for a cfg mutant only when no other row kills it, and always for grid faults).

Unkillable mutants (the reason is the finding, see A-19):

* `K266` grid: cell index by truncation toward zero instead of floor: output-equivalent: truncation toward zero is monotone, so boxes that overlap still share a cell; it only merges the cells -63..63 px into one cell (more candidates per cell, never fewer). The negative-coordinate rows are present (T, N, NF) but cannot expose it. Verified equal on the random inputs too. Contrast K275 (sign lost) and K276 (floor on one edge, truncation on the other), which the negative rows do kill.
* `K270` grid: right and bottom edges on a cell boundary belong to the previous cell (exclusive end): output-equivalent once the 1 px growth (rev 1 section 7, A-17) is applied: the growth (>= 1 micro-px) always reaches the previous cell. Without the growth the fault would matter, but that is already K269.
* `K271` grid: cells of 63 px: output-equivalent: the cell size is a performance parameter (any positive size gives the exact result).
* `K272` grid: cells of 65 px: output-equivalent: the cell size is a performance parameter.
* `K273` grid: cells of 64 px, truncation toward zero AND exclusive end: output-equivalent for the same two reasons as K266 and K270.
* `K274` grid: cells of 1000 px: output-equivalent: the cell size is a performance parameter.
* `K277` grid: a box whose exact edges are already stored is not stored again (dedupe, allowed by rev 1): output-equivalent by construction: a candidate collides with a stored box iff it collides with an identical one, and the rev 2 cost counts the set of distinct boxes anyway; rev 1 section 7 explicitly allows the skip. Verified equal on every row and on the random inputs.
* `K280` grid: dedupe of identical boxes AND fallback cost counting stored copies: output-equivalent by construction: with identical boxes stored once, counting stored copies counts distinct boxes (a node box cannot equal a label box: heights 26 and 13 px); without the dedupe the copy-counting fault is killed (see the fallback-cost grid fault above). Verified equal on the random inputs.

## Reports

* `OVERLAP.tsv`: for the dense rows (D, R, R2, S01), the number of colliding pairs (label-label `ll`, label-node `ln`) with every label at its default (`default`, rev 3 boxes), after the rev 1 rule (width 7, 11 candidates, fallback (0,0); superseded `tools/lp1.py`; `rev1`), after the rev 2 rule (width 7, 29 candidates, min-cost fallback; superseded `tools/lp2.py`; `rev2`) and after the rev 3 rule (`rev3`), each revision counted twice: `lp_*` under that revision's own box model (7 px per unit for rev 1 and 2, 9 for rev 3 and the default column; height 13, gap 1 px) and `judge_*` under a judge of 8 px per unit, height 14 (top Y-11, bottom Y+3), gap 0 (boxes that touch do not collide), node boxes as in LP/1; then the labels without a free candidate under rev 1, 2 and 3 (`rev1_fallback`, `rev2_fallback`, `rev3_fallback`) and the rev 3 labels not at their default (`rev3_moved`). Discussed in `AMBIGUITIES.md` (A-47 and the Rev 3 section).
* `CANDSTATS.tsv`: how often each candidate number 1..29 is chosen, as a free candidate (`free1..free29`) or as a fallback (`fallback1..fallback29`), over the rows, per kind and tier.

## NOT verified

* The winning candidate of the rev 2 fallback rows by hand: F01-F06 and F09-F27 come from seeded searches (each separates the rule from one named fault, asserted by the generator) and their expected values from the reference; the generator recomputes every fallback of every core row of at most 60 labels with an independent plain-dict cost function, but no row gives the winner by hand (the hand-derived hints stop at first-free rows and at prefixes of I04, I05, I07, I11, H05).
* Anything in the TypeScript: this corpus is the oracle, no implementation has been run against it yet; whether `bigint` handling, the order of operations and the 64 px grid of the implementation reproduce these bytes is exactly what the corpus will test.
* Invalid input (`units < 1`, a non-integer `units`, a coordinate beyond +-2^62, an unknown `kind`): unspecified by the design, no row. Rows at exactly +-2^62 are in (NF-P62, NF-M62).
* Hidden elements, the label budget, elision and `text-anchor`: the caller's concern (design 37 sections 2, 3), outside the function; no row.
* That the 9 px per UTF-16 unit width, the 13 px height and the 26 px node box fit real glyphs and drawn nodes (a model, section 8); that labels stay off edge strokes (not claimed by the design).
* The near-linear complexity claim as a measurement: the corpus has stress rows but measures no time; the adversarial density (S03) and huge widths (H rows) are where the grid is not near-linear (A-20).
* Third-party review of `AMBIGUITIES.md` readings; an independent re-derivation by a second author of the hand-derived hints.
* Cross-corpus effects (the regenerated `oracles-svg`, `oracles-dl`, `oracles-gl` bytes of design 37 section 9): not part of this corpus.

