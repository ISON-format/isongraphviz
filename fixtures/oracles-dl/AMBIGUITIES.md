# Ambiguities, contradictions and unimplementable rules found while writing the oracle

Source: design 31 rev 5 (`31-CANVAS-WEBGL-DESIGN.md`; entries A-01..A-35 were written against rev 2 and carry the rev 3 disposition from its change log, with whether my reading matched), 30 rev 4, 27 rev 5, IGS-1, IGL-1. A-36 to A-44 are new findings from re-implementing the rev 3 text, A-45 and A-46 from the rev 5 text. Entries marked DESIGN DEFECT are places where the text cannot be implemented as written or a named killer row does not kill; they are reported, not repaired. Entry numbers are stable.

## A-01  4.7 D1 and D12; 13.3 S28-S31; K72-K74

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: D1 is a lexer, a disabled D1 rule is a tolerant lexer, D12 judges each line's canonical text; S28-S31 are single-fault in this regeneration and K72-K74 are killed by S28, S29/S31, S30.
* **Design text (rev 2 wording).** D1 lists the byte rules (CRLF, indentation, blank line, final LF) and D12 re-serializes the result and compares it with the input bytes. A CRLF, indented, blank-line or no-final-LF file therefore violates D12 as well, so the claim that "each violation breaks exactly one rule" and that a reader with only the named rule disabled accepts the file is false for S28-S31 under a literal D12.
* **Literal reading used.** A disabled D1 byte rule is read as a *tolerant lexer*: the tolerated byte (trailing CR, leading blanks, a missing final LF, a blank line) is dropped before the other rules and before D12, which then compares the normalized lines. Under this reading S28-S31 are single-fault and K72, K73, K74 are killed by S28, S29/S31, S30.
* **Why / status at rev 2.** A literal D12 over the raw bytes makes K72, K73 (S29) and K74 equivalent mutants (no row can separate them). The design should say that D12 applies after the D1 normalization, or name mutants that also disable D12. DESIGN DEFECT (clarity).

## A-02  4.7 D1 nesting; 13.3 S32; K87

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched for S32 (declared exception, judged by 'rejected'). Differs for K87: it was replaced by 'reader does not enforce the order of the kinds (D2)', killed by S06 (confirmed by the matrix, see MUTANTS.tsv).
* **Design text (rev 2 wording).** S32 is "JSON nesting depth 4 (outside strings)" and the rules are called orthogonal and single-fault.
* **Literal reading used.** No record of the grammar (4.1) nests deeper than 3 (the deepest, `e`, is exactly 3), so every line with depth 4 outside strings is also a schema violation (D2/D4/D6/D8/D9). The reader with only the nesting rule disabled still rejects S32 (asserted in `inputs/self-checks.json`).
* **Why / status at rev 2.** The nesting bound is observationally redundant: K87 (no nesting bound) cannot be killed by any row; it is an equivalent mutant with respect to the verdict (it only matters for resource use). DESIGN DEFECT: S32 is not single-fault and K87 is unkillable.

## A-03  13.3 K161, K162 (named killers X12, X08)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: the killer of K161 and K162 is S01 (confirmed).
* **Design text (rev 2 wording).** K161 (nesting scan not string-aware) names X12 and K162 (reader splits lines with splitlines) names X08.
* **Literal reading used.** X12 and X08 are builder rows (G/N/X/Y/O family: `buildDisplayList` then `serializeDisplayList`); the reader is exercised by S01, which parses every expected list including `dl/X08.dl` and `dl/X12.dl`.
* **Why / status at rev 2.** Both mutants are killed by S01 only; the named rows do not change under them. DESIGN DEFECT (clerical): the killer should be S01.

## A-04  13.5 K16 (named killers N06, N07)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: K16 is killed by N06 only (confirmed).
* **Design text (rev 2 wording).** K16 "degenerate edge trimmed anyway" names N06 and N07.
* **Literal reading used.** N07 is `zerotrim` (24.0005 px apart: L = 24,000,500 > 24 px, so the edge is NOT degenerate). K16 does not change it.
* **Why / status at rev 2.** Killed by N06; N07 does not kill K16 (row-does-not-kill). DESIGN DEFECT (clerical).

## A-05  13.5 K53 (named killers Y07, Y10)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: K53 is killed by Y10 only (confirmed).
* **Design text (rev 2 wording).** K53 "pid is the scene index, not the table position" names Y07 and Y10.
* **Literal reading used.** In Y07 (`s:ann` hidden) the surviving node `i:1` has scene index 0 and table position 1, so its pid is the same either way; the cascade removes the only edge. Y10 (first node hidden) shifts pids and kills K53.
* **Why / status at rev 2.** Y07 does not kill K53. DESIGN DEFECT (clerical).

## A-06  13.5 K60 (named killers R30, R32)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: K60 is killed by R30 only (confirmed).
* **Design text (rev 2 wording).** K60 swaps the two flag bits in `readoutFromList`.
* **Literal reading used.** R32 is the readout of Y06 where the node is selected and focused (flags 3); swapping bits 1 and 2 leaves flags 3 unchanged.
* **Why / status at rev 2.** Only R30 kills K60 (and R31/R33 as other rows). R32 cannot. DESIGN DEFECT (clerical).

## A-07  13.5 K139 (named killers R21, R28, R29)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: K139 is killed by R21 and R29 (confirmed).
* **Design text (rev 2 wording).** K139 "nodes_far guard-box rule ignored in a readout" names R21, R28, R29.
* **Literal reading used.** R28 puts a centre at exactly the guard-box edge (inside, `nodes_at`), which is also what a reader without the rule says.
* **Why / status at rev 2.** R28 does not kill K139 (R21 and R29 do). DESIGN DEFECT (clerical).

## A-08  13.5 K179; 13.3 R19, R37

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: R19 is one entry with both defects; K179 is killed by R19 only (confirmed).
* **Design text (rev 2 wording).** K179 "checks the version before the schema" names R19 and R37; R19 is "a readout missing `arrows` (and a version error elsewhere in the same entry list: schema is checked first)".
* **Literal reading used.** Within an entry V1 (schema) precedes V2 (version). For a row to separate the two orders, one entry must have both defects: R19's first entry lacks `arrows` AND has `xr` = `igr-xr/2`. Read literally (the version error in another entry) no row can kill K179, because entries are validated one after the other and the first invalid entry wins.
* **Why / status at rev 2.** With the same-entry reading R19 kills K179 and R37 does not (it has only the version defect). Under the other reading K179 would be unkillable.

## A-09  13.5 K181 (named killers R23-R27)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: K181 is killed by R23, R25, R27; the new K187 is killed by R24, R26 (both confirmed).
* **Design text (rev 2 wording).** K181 "accepts a non-canonical or -0 decimal" names R23-R27 (`1.0005`, `abc`, `-0`, empty, `1e3`).
* **Literal reading used.** K181 is implemented as "parses anything float() accepts". R24 (`abc`) and R26 (empty) are not numbers at all: no mutant that merely accepts non-canonical *decimals* changes them.
* **Why / status at rev 2.** R23, R25, R27 kill K181; R24 and R26 do not. DESIGN DEFECT (clerical): they test the reject path of garbage, not K181.

## A-10  13.5 K90, K155 and the other two-sided mutants (K05 11 or 13, K24 9 or 11, K25 4 or 6, K94 15 or 17)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched in substance (one reading per id, the second reading its own id; K05, K24, K25, K90, K155 as I had them). Differs only in numbering: the design's K94 is 15 segments and K94b 17 (I had them the other way round); both are killed by P03.
* **Design text (rev 2 wording).** The table names two readings in one row ("11 or 13 px", "boundary 2^31 exclusive or 2^31 + 1 accepted", "reader's maxBytes boundary wrong").
* **Literal reading used.** The first reading is the id itself (11 px, 9 px, 4 px, 17 segments, exclusive boundary); the second reading is run as an extra mutant `Knnb` (K05b, K24b, K25b, K94b, K90b, K155b) listed in MUTANTS.tsv.
* **Why / status at rev 2.** One killer row of the pair kills one variant only (S37 kills the exclusive K90, S38 the +1 K90b; O15 kills K155, O16 kills K155b). Both rows are needed; stated, not a defect.

## A-11  13.5 K120-K128, K137, K142 and 13.3 D, U10

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Differs: I had left K142 killable only by a runtime row; the design redefined K142 ('a stream readout lists an element whose marker has no painting call as drawn') and added the file row R44. D06 is no longer named by any mutant; my D rows stay as self-checks of the generator.
* **Design text (rev 2 wording).** K137 and K142 are "killed by runtime rows"; D rows and U10 have empty cells and no files; K120-K128 name U rows whose expectations are outcome files or scripts.
* **Literal reading used.** D01-D06 are implemented as deterministic in-generator simulations (seeded) whose results are asserted and recorded in `inputs/self-checks.json` and take part in the mutant matrix as rows with internal outputs; U rows are lifecycle scripts run by the reference simulation `tools/sim.py` (the oracle's reading of 27 section 9 and 31 6.5). K142 is killed by D06 in this sense only.
* **Why / status at rev 2.** No oracle *file* can kill K142 (D06 has empty cells by design).

## A-12  13.3 P13

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (pickv, deterministic grid search, asserted).
* **Design text (rev 2 wording).** "a point within 6 px of the frozen chord of a parallel edge but farther than 6 px from its curve"; no scene is named.
* **Literal reading used.** The authored scene `pickv` (an antiparallel pair of nodes 26 px apart) is used; the point is found by a deterministic search over a grid and asserted (`inputs/searches.json`). A grid search over `mixed20` also finds such points, so the row is realizable there too.
* **Why / status at rev 2.** Scene choice. Minor.

## A-13  13.3 P07

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (pickd).
* **Design text (rev 2 wording).** "exactly 6 px from a diagonal segment (closed boundary, exact fraction compare)"; no scene is named.
* **Literal reading used.** Equality `cross^2 = (6000)^2 * L2` needs an integer-valued length; the route of `G01` has `L2` not a perfect square. A scene `pickd` (a 3-4-5 edge of 500 px whose 12 px trims are exact integers) is authored; the points are exact lattice points at distance 6000 m-px.
* **Why / status at rev 2.** Scene choice. Minor.

## A-14  13.3 P08

* **Rev 3 status.** RESOLVED-IN-REV3 (STANDS). Reading matched.
* **Design text (rev 2 wording).** "the interior-vertex endpoint branch (`pickv`: a point beyond a polyline vertex, outside both perpendicular spans)".
* **Literal reading used.** The point is found by a deterministic search over the vertices of the `pickv` polylines (angles around a vertex, radius 5800/5400/5000 m-px) and asserted to change the answer under K95; the result is recorded in `inputs/searches.json`.
* **Why / status at rev 2.** Search-built row, as the design asks.

## A-15  13.3 A.6 and rows B01/B02

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (B02 is trim, the A.6 bounds block is B01's).
* **Design text (rev 2 wording).** A.6 attributes one 105-byte block to "row `dl:B01`/`B02`" and B01 is "node boxes (`G01`)" while B02 is "an edge box (straight)".
* **Literal reading used.** B01 is `G01`; B02 is the scene `trim` (several straight edges) because a row is one scene and the same bytes cannot serve two ids meaningfully. The A.6 figure is reproduced for B01.
* **Why / status at rev 2.** Clerical; B02's bytes are not in the Appendix.

## A-16  13.3 C07

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched.
* **Design text (rev 2 wording).** "three categories alternating: `fillStyle` assigned only when the colour changes".
* **Literal reading used.** IGS/1 5.5 orders nodes by type, so the categories of a scene are contiguous runs in scene order; they cannot alternate. C07 is `mixed20` (runs of classes 0, 1, 2), where the cache is exercised at the two colour changes.
* **Why / status at rev 2.** Wording. A scene with alternating classes does not exist.

## A-17  13.3 C10

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (scene hostile).
* **Design text (rev 2 wording).** "hostile text unmodified in `fillText`" with no scene named; K117 (trimmed, normalized or wrapped) names C10.
* **Literal reading used.** Node labels equal the id text (IGS/1 5.8 F3), so hostile text must be an id. The reused hostile scenes have no leading or trailing spaces and no NFD text, so none of them kills K117 (ids12 was tried: K117 survived). A scene `hostile` is authored (spaces around, NFD, markup, U+2028, U+202E, backslash and quote); K117 changes C10 only.
* **Why / status at rev 2.** Scene choice, needed for K117 to be killable.

## A-18  13.3 U13

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (three entries; displayList() succeeds).
* **Design text (rev 2 wording).** "`displayList()` rejects under a lowered limit" while 6.5 says `displayListBytes()` uses `maxDlBytes` and 6.4/4.6 that a list is not serialized by `displayList()`.
* **Literal reading used.** The outcome file records all three: `render` ok, `displayListBytes` `RESOURCE_LIMIT/BYTES_LIMIT`, `displayList` ok (the literal 6.5 reading: only serialization is bounded by bytes).
* **Why / status at rev 2.** DESIGN DEFECT (inconsistency 13.3 U13 versus 6.5). K128 (render builds the list) changes the `render` entry.

## A-19  13.2 grammar; O14

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (plain_object_model).
* **Design text (rev 2 wording).** The input grammar for G, N, X, Y, O has no way to say "a plain object shaped like a model" (O14).
* **Literal reading used.** The key `plain_object_model: true` is added (as 27 13.3a does for M25): the kit passes a JSON-parsed copy of the model, which lacks the brand.
* **Why / status at rev 2.** Grammar gap. Documented here.

## A-20  13.2 "one row = one scene, one layout, one input"; N06, S01, P16, U07, U09

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (the also convention is defined in 13.2).
* **Design text (rev 2 wording).** N06 needs three cases, S01 many files, P16 three pick files, U07 and U09 several cases.
* **Literal reading used.** The `also` convention of 13.2 is used inside the inline `input`: `{..., "also": [{...}]}`. N06: states `N04`, `N05`, `N06` of `oracles-svg` with expected `dl/N06.dl`, `dl/N06b.dl`, `dl/N06c.dl`. S01: `file` plus `also` of every expected list of G, N, X, Y, O (including N06b, N06c). P16: `pick/P01.pick` plus `also` P02, P03; the expected `pick/P16.pick` is the re-serialization of the last (equal to P03). U07: `{"cases": [...]}` with outcome file `json/U07.options.json`; U09: `calls/C01.calls` plus `also` C03.
* **Why / status at rev 2.** Documented extension.

## A-21  13.3 far; N13, N14, R21, R28, R29, gl:B11-B19

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched: far-u (N13, N14, R28, R29) and far (R21); scene ownership per corpus.
* **Design text (rev 2 wording).** One scene `far` is named for rows that need different properties (N13: "no directed edge"; gl: B11 "straight, directed or not").
* **Literal reading used.** Two scenes: `far-u` (undirected, one node, N13, N14, R28, R29 with states `states/N13|N14|R28|R29.state.json` that place the node at exactly 2^40, 2^40 + 1, -256000, -256001 m-px) and `far` (directed, eight nodes f0-f7 at screen milli-px (450000,300000), (-2000000000,300000), (1000000001,700003), (450000,-3000000000), (-278000,300000), (1178001,300000), (300000,860000), (200000,100000) at the identity state `states/R21.state.json`; edges f1->f2, f0->f3, f0->f1, f0->f2, a parallel pair f1<->f3, a loop on f0, f4->f7, f5->f6). The identity state of a scene is (w*500, h*500, zoom 1000), where screen milli-px equal layout units.
* **Why / status at rev 2.** Scene choice; the `oracles-gl` author must read `scenes/far.scene.json` and the README, not guess.

## A-22  13.2 Z; 9.1 readouts; expected file endings

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (file endings listed in 13.2).
* **Design text (rev 2 wording).** Z expected files are "canonical `{"bh":..,"bw":..,"e":..}`" and other `json/` files "ordinary JSON"; 27 says IGR byte strings have no trailing newline.
* **Literal reading used.** `json/Znn.json` is the canonical JSON plus one LF; U06 manifests and U09 witnesses are IGR-CJ/1 without trailing newline (as the other corpora); readout, compare, list, pick, bounds, calls files end with one LF as 13.2 says; outcome files and scripts are `indent=1` JSON plus LF.
* **Why / status at rev 2.** Format choice, stated.

## A-23  4.4(g), 30 7.5(d)

* **Rev 3 status.** RESOLVED-IN-REV3 (STANDS). Reading matched.
* **Design text (rev 2 wording).** `fidelity.labels` is "elided" if any `dl` text differs from `xs` of its label with TAB, LF, CR replaced by spaces.
* **Literal reading used.** A label whose only change is the `xs` substitution (U+FFFE -> U+FFFD) is NOT elided (the D-DRAW departure is `unchecked`); an empty label is not elided and not counted. The reading agrees with every `expect_fidelity` of `oracles-svg` (self-check `fidelity_vs_svg_corpus`: all equal).
* **Why / status at rev 2.** Reading confirmed against V5's corpus.

## A-24  6.2 options validation

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (INVALID_VALUE for a non-number element).
* **Design text (rev 2 wording).** `ink`: "a non-integer element INVALID_VALUE"; a non-number element (a string) is not classified.
* **Literal reading used.** A non-number or non-integer element is INVALID_VALUE; a length other than 3 or a non-array is SCHEMA; the same for `layers` elements.
* **Why / status at rev 2.** Gap in the table; no row distinguishes.

## A-25  6.3 recorder rounding

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (Math.round).
* **Design text (rev 2 wording).** "a number `a` is written `round(a x 1000)`".
* **Literal reading used.** `round` is JavaScript `Math.round` (half toward +infinity): `floor(x + 0.5)`. For the doubles of this corpus (`m / 1000`) the product is within 1e-9 of an integer, so the choice cannot matter.
* **Why / status at rev 2.** Minor.

## A-26  5.2 validation versus the closed viewport

* **Rev 3 status.** RESOLVED-IN-REV3 (STANDS). Reading matched.
* **Design text (rev 2 wording).** Point validation (SCHEMA, NOT_FINITE, OUT_OF_RANGE) and the closed viewport rule.
* **Literal reading used.** Validation first (as `hitTest`): P12 holds NaN, +-Infinity, 2^40 and -(2^31 + 1) (errors) and 2^31 (valid, outside the viewport: no hit).
* **Why / status at rev 2.** Order stated in 5.2; confirmed.

## A-27  4.7 D5/D7

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (adjacency from the A side; D7 against the E of the same pid).
* **Design text (rev 2 wording).** D5 says an `A` is "the record immediately after the `E` of the same pid"; D7 compares with "the preceding `E`".
* **Literal reading used.** Adjacency is checked from the A side (the previous record is an `E` of the same pid) and D7 compares an `A` with the `E` of the *same pid*; presence (`A` exists iff D = 1, one per `E`) is separate. This makes S14, S15, S17 single-fault and K81/K83 separable.
* **Why / status at rev 2.** Reading chosen so that the S rows are single-fault.

## A-28  13.3 S39 and 4.7 D1 maxLineUnits

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (inline limits, BYTES_LIMIT).
* **Design text (rev 2 wording).** S39 "a line over `maxLineUnits`".
* **Literal reading used.** Inline `{"file":"dl/G01.dl","limits":{"maxBytes":637,"maxLineUnits":100}}` (the header line has 187 units); the error is `RESOURCE_LIMIT/BYTES_LIMIT` (4.7: "or RESOURCE_LIMIT/BYTES_LIMIT (path dl.read) for the bounds"). No oversize input is needed, so `generated/GENERATED.tsv` is not created.
* **Why / status at rev 2.** Reading.

## A-29  13.5 K03, K04, K57 and the other mutant texts

* **Rev 3 status.** RESOLVED-IN-REV3 (STANDS). Reading matched.
* **Design text (rev 2 wording).** Several mutants are one-line texts ("centre or pan sign wrong in X", "header size from the layout bounds", "arrow tip is not the last point", "label text altered (trimmed, normalized or wrapped)", "witness reads probe()", "manifest differs").
* **Literal reading used.** Each is realized by one concrete change in `tools/dl.py`, `tools/view.py`, `tools/sim.py` (`M('Knnn')` switches): K04 `(x + cx)` instead of `(x - cx)`; K57 `W,H` from the layout bounds in px; K23 the tip is the first point; K117 `strip()`; K120 the witness lists the drawn elements of the model; K121 the manifest name gets an `x` and `labels.edge` is always supported; K136 markers dropped; K137 the layer-4 `fillStyle` is skipped when no hook is installed; K142 the harness takes the double's readout from its probe.
* **Why / status at rev 2.** Mutant realizations are the oracle's reading; the matrix reports what each one changes.

## A-30  2 and 4 (editorial)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). The duplicated text is gone from rev 3 (change-log table, the two sentences, the signature comment).
* **Design text (rev 2 wording).** The change log of rev 2 appears twice (the table `Rev 1 -> rev 2 (re-check findings)` and the line `Dispositions of rev 2` are repeated); the sentence of 5.2 on `createPicker` and `COORD_LIMIT` and the sentence of 7.3 on `p = 0`, `q < 0` are repeated; the signature of `backingSize` repeats "validates its three integers".
* **Literal reading used.** Ignored (the repetitions are identical).
* **Why / status at rev 2.** DESIGN DEFECT (editorial), no effect on bytes.

## A-31  13.1 gate; Appendix A

* **Rev 3 status.** RESOLVED-IN-REV3 (STANDS). Scope: gl: items stay with oracles-gl.
* **Design text (rev 2 wording).** The gate requires the A.1-A.8 blocks to be reproduced.
* **Literal reading used.** Reproduced: every `dl:` item (APPENDIX-A.tsv). The `gl:` items (A.5 assembly, A.5.1-A.5.3 logs, A.8 shader digests, A.10 guard rule) belong to `oracles-gl`; the only relation checked here is that the element-table and text lines of the A.5 prefix equal the `n`, `e`, `T` lines of `G01`.
* **Why / status at rev 2.** Scope.

## A-32  1, 13.3 U rows (scripts)

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (op list in 13.2).
* **Design text (rev 2 wording).** U rows are "scripts as 27 13.3a plus the ops of 13.2" (`displayList`, `calls`, `plan`, `pick`, `textCalls`, `status`).
* **Literal reading used.** Ops used: `create`, `initialize`, `loadScene`, `dispatch`, `displayList` (the bytes of `displayListBytes()`, expectation `expect_dl`), `canvasCalls` (`expect_calls`), `pick`, `hitTest` (`expect_hit`: an `ElementAddress` or null), `probe` (`expect_fidelity`), `export`, `render`, `dispose`, `setReducedMotion`, `getState`; an expectation `expect` is `ok` or `CODE/REASON`; `await: false` leaves the call unsettled until a later awaited call (FIFO, 27 9). `status` and `textCalls` are V7 ops and unused.
* **Why / status at rev 2.** Format choice, stated.

## A-33  27 5.2/5.3 reducer subset

* **Rev 3 status.** RESOLVED-IN-REV3 (STANDS). Scope.
* **Design text (rev 2 wording).** U01-U02, D01 need the reducer of 27.
* **Literal reading used.** A subset is re-implemented (select, clear-selection, focus, focus-step/first/last, set-hidden, pan, zoom, fit, set-viewport, resize) with only the validation the scripts exercise.
* **Why / status at rev 2.** Scope.

## A-34  13.3 R20

* **Rev 3 status.** RESOLVED-IN-REV3 (STANDS). Reading matched.
* **Design text (rev 2 wording).** "a hand-built `SvgReadoutLike` with printed values 1.001, 4.35, 0.007, -0.001, 867.928, 0.1 (found by search so that `float x 1000` truncated differs)".
* **Literal reading used.** The six values are used as given in three nodes `(1.001, 4.35)`, `(0.007, -0.001)`, `(867.928, 0.1)`. K138 (truncation of the float product) changes the readout. Whether each single value differs is not claimed; the row differs as a whole (asserted by the matrix).
* **Why / status at rev 2.** Reading.

## A-35  9.3 readoutFromCanvasStream

* **Rev 3 status.** RESOLVED-IN-REV3 (FIXED). Reading matched (6.6, 9.3 now state it; R44 pins it).
* **Design text (rev 2 wording).** "node centres from the `arc` arguments of layer 7", "labels from the `fillText` of layer 8 (addresses by pid through the list's table)".
* **Literal reading used.** Elements are the pids painted in layer 7 (nodes) and 3 (edges); marks from layers 5, 1 (selected) and 6, 2 (focus); arrows from layer 4; the role of a text is `pid <= ND`. The reader is strict: canonical lines, markers non-decreasing in layer, strictly ascending pid within a layer.
* **Why / status at rev 2.** Reading.

## A-36  13.3 R44 against 9.1 and 9.4

* **Design text.** R44: node 1 is absent from `drawn`, `nodes_at` and `marked`, "the rest equals R01".
* **Literal reading used.** The label text of a node comes from layer 8 only (9.3), and the stream keeps the `fillText` of pid 1, so `labels.nodes` still lists node 1 (and `label_units` stays 9) while `drawn.nodes` no longer does. That readout violates the consistency rule V3 of `compareReadouts` (every address of `labels` resolves within `drawn`). The row's text is only satisfiable by this reading.
* **Why / status.** Minor contradiction between R44 and 9.4 V3: the readout of R44 is not a valid input of `compareReadouts`. Not a defect of the bytes; a reader of the row should not feed it to the comparison.

## A-37  13.5 K142 against R44

* **Design text.** K142: "stream readout lists an element whose marker has no painting call as drawn"; killed by R44.
* **Literal reading used.** Realized for the two layers that define 'drawn' (layer 7 for nodes, layer 3 for edges): a marker section without its painting call is still listed. The marks (layers 1, 2, 5, 6) and arrows (layer 4) are not touched, because the text says 'drawn'. R44 exercises layer 7 only; a second mutant for layer 3 would need a second row.
* **Why / status.** Reading; K142 is killed by R44.

## A-38  13.5 K84 and K87 (S18)

* **Design text.** K84 "reader skips the T order and role rules" names S18 (a T before an N); K87 is now "reader does not enforce the order of the kinds (D2)", killed by S06.
* **Literal reading used.** S18 violates the D2 kind order (a `T` before an `N`), so a mutant that kills S18 must skip the D2 order; K84 is implemented as skipping the D2 order, the role rule, the T order and the one-T-per-pid rule, which makes K84 a superset of K87 on the kind order. Without the D2 order in K84 the named killer S18 would not change.
* **Why / status.** Overlap: K84 and K87 both skip the D2 order. Either S18 leaves K84's killer list or K84 is understood to include the kind order. Minor.

## A-39  4.7 D1 (a CR inside a line)

* **Design text.** "no CR (a CR is a line-boundary byte, not part of the line)"; a disabled D1 byte rule is a tolerant lexer that drops "a CR before the LF".
* **Literal reading used.** Only a CR immediately before the LF is a line-boundary byte that the tolerant lexer drops; a CR inside a line stays in the line and breaks it (a JSON syntax error, so INVALID_INPUT/SCHEMA). A reader with the CR rule disabled therefore accepts CRLF files (S28) and not a lone CR.
* **Why / status.** Reading; no row has a lone CR.

## A-40  4.7 D1 (indentation and blank lines)

* **Design text.** "leading blanks" are dropped by a tolerant lexer; a blank line is dropped.
* **Literal reading used.** 'Blank' is SPACE and TAB. A blank (empty) line is dropped before parsing.
* **Why / status.** Reading; S29 uses one leading space, S31 an empty line.

## A-41  4.7 D7 (judged only for an A whose E passed D6)

* **Design text.** "D7 is judged only for an `A` whose `E` passed D6".
* **Literal reading used.** An `E` passes D6 when its flags, form, coordinate count and coordinate bound hold; D7 is judged against it by pid. With a D6 sub-rule disabled (single-fault checks and mutants K80, K86) the `E` is treated as having passed.
* **Why / status.** Reading; consistent with the single-fault rows S11-S13, S25.

## A-42  13.6 last sentence against 13 intro and 13.4

* **Design text.** 13.6: "The Canvas replay rows and the `oracles-gl` plan rows both depend on the `oracles-dl` expected lists, so a defect found in a list changes both corpora"; 13 (rev 3) and 13.4: each corpus is self-contained and nothing is read from the other.
* **Literal reading used.** Self-containment is followed: this corpus reads only the frozen fixtures, the `oracles-svg` data (digest checked) and its own files, and authors its own scenes.
* **Why / status.** DESIGN DEFECT (editorial, stale sentence): 13.6 still describes the rev 2 coupling.

## A-43  13 intro, 13.3 (reuse of `oracles-svg` states)

* **Design text.** Self-contained corpora may read `oracles-svg` data; 13.3 reuses scenes `trunc`, `ties`, ... "by path" and N01, N02, N04-N06, N10, N16, N17 name states of `oracles-svg`.
* **Literal reading used.** Scenes and layouts are read by path from `oracles-svg`; the states that the design names by origin (the `svg:` states of N01, N02, N04-N06, N10, N16, N17) are read by path too. Every other state (Y01-Y17, N03, N07, N13-N15, P11, C03, C19, C20, R21, R28, R29 and the pick states) is authored here; the 17 Y states are byte-equal to those of `oracles-svg` (self-check).
* **Why / status.** Reading; recorded because a regeneration of `oracles-svg` would change those rows (the digest gate stops it).

## A-44  4.7 lexer and the size bounds

* **Design text.** `maxBytes` and `maxLineUnits` are checked first; the lexer also drops tolerated bytes.
* **Literal reading used.** `maxLineUnits` is measured on the raw line (before the tolerated bytes are dropped), `maxBytes` on the whole input.
* **Why / status.** Reading; no row separates the two.

## A-45  6.6 and 9.3 (rev 5): at most one focused element in a stream

* **Design text.** 6.6: a stream is rejected unless "layers 2 and 6 together hold at most one pid"; 9.3: readoutFromCanvasStream reports "the one focus or none (no precedence rule is needed)".
* **Literal reading used.** The strict stream reader (`parse_stream`, used by `canvasStreamWitness` and `readoutFromCanvasStream`) counts the marker sections of layers 2 and 6 together, painted or not, and rejects the stream with INVALID_INPUT/SCHEMA when there is more than one. A node and an edge cannot share a pid, so one pid in layer 2 and one in layer 6 is also two focused elements and is rejected.
* **Why / status.** Reading. The count is over markers (the reader's structural stage), not over painted sections; the text says 'hold ... pid'.

## A-46  13.3 and 13.5 (rev 5): the new rule has no row and no mutant

* **Design text.** Rev 5 adds the single-focus rule to the stream reader; the change log says "no corpus row has two focused elements" and no row or mutant id changes.
* **Literal reading used.** No expected byte exercises the rule (checked by a direct test: a G01 stream with two focus markers is rejected, a stream with one is accepted), and no mutant names it. 13.5 closes with "a normative rule without a mutant here is a review finding".
* **Why / status.** Finding (clerical): the rule has neither a killer row nor a mutant; a stream row with two focus markers (error `INVALID_INPUT/SCHEMA`) and a mutant that drops the rule would close it. Not added: the ids are frozen by rev 5.

## A-47  27 4.2 (iii), 31 4.5 (4), 9.3: a state cannot name two focused elements (rows Y18, Y19)

* **Design text.** 31 9.3: "a list has at most one [focused element] by construction"; 4.5 (4): the builder validates the state with `serializeState`; 27 4.2 (iii): `focus`, when present, is an object with **exactly one** key, `node` or `edge` ("both keys or none: `SCHEMA`"); a wrong JSON type (an array) is `SCHEMA`.
* **Literal reading used.** Two states that name two foci, `{"focus":{"edge":..,"node":..}}` (Y18) and `{"focus":[{"node":..},{"node":..}]}` (Y19), are refused by the builder with `INVALID_STATE/SCHEMA`; a runner that loads the file with `parseState` or with plain JSON gets the same code, so (unlike Y14 and Y15) the loading mode does not matter. The code comes from 27, not from 31.
* **Why / status.** Reading. The rows exist because 31 rev 5 says the guarantee is "by construction": the construction is the closed state shape. Row Y20 (everything selected, one focus; `also` case for the other kind) shows that the builder sets the focus bit on exactly one record whatever else is selected.

## A-48  6.6, 9.3: the error code of a stream rejected for two foci (rows R45-R48, U15, U16)

* **Design text.** 6.6 and 9.3 say the stream "is rejected" (and 9.3 that the reader is strict) but give no code; 4.6 lists `INVALID_INPUT` with `SCHEMA` among the classes of a malformed byte form and 4.7 gives `INVALID_INPUT/SCHEMA` to the list reader.
* **Literal reading used.** `INVALID_INPUT/SCHEMA`, the same as A-45 and the same for `readoutFromCanvasStream` and `canvasStreamWitness` (both go through the one reader; K194 and K195 are the mutants that give the rule to one call site only).
* **Why / status.** Reading by analogy with 4.7; no sentence of the design pins the code of the stream reader.

## A-49  6.6 (rev 5): do markers count, or painted sections? (row R48, mutant K191; row R49)

* **Design text.** "markers ... and layers 2 and 6 together holding at most one pid" (6.6, inside the list of conditions of the markers); 9.3: "a stream whose layers 2 and 6 hold more than one pid is rejected by the stream reader"; 9.3 also: "a marker without painting calls contributes nothing" (R44).
* **Literal reading used.** The rule counts the **markers** of layers 2 and 6 (A-45), painted or not: R48 (an unpainted layer-2 marker plus a painted layer-6 marker) is rejected. A lone unpainted layer-2 or layer-6 marker is accepted and contributes no focus (R49: the readout equals R01). The two sentences are compatible with the other reading too ("hold" = painted); then R48 would be accepted with the layer-6 focus and K191 would be the correct behaviour.
* **Why / status.** Reading, recorded so the owner can rule; the row is single-fault under the stated reading only.

## A-50  6.6: a pid in both layers 2 and 6, a node pid in layer 2 (no row)

* **Design text.** "layers 2 and 6 together holding at most one pid"; the reader checks that every marker pid is in the table and that layers are non-decreasing; it has no rule that ties layers 1-4 to edge pids and 5-8 to node pids (that check is stated for the plan, 9.3 last sentences).
* **Literal reading used.** Not covered: a stream that puts one pid in layers 2 and 6 holds one pid (accepted by the count), and a node pid in layer 2 has no stated verdict. No row was written; a row would encode a guess.
* **Why / status.** Underspecified; recorded for completeness.

## A-51  4.7 D1-D12 versus "every artifact": the list reader has no focus rule (no row)

* **Design text.** The change log (rev 5, M-9) says "At most one element is focused in every artifact: G12 gains ..., the stream reader likewise (6.6)"; 9.3 says "a list has at most one by construction". 4.7 D6 and D8 allow `flags` 0..3 on every `E` and `N` and no rule counts them.
* **Literal reading used.** `parseDisplayList` accepts a list in which several records carry the focus bit (flags 2 or 3); `readoutFromList` of such a list is not specified. No S row was written (neither "accepted" nor "rejected" is derivable without choosing).
* **Why / status.** FINDING (design): either D-rules gain a clause (a new rule D13 with a single-fault `S` row) or the exemption of the list reader is stated. Until then only the builder (Y18-Y20) and the stream reader (R45-R51, U15-U17) are covered.

## A-52  13.2: where the list of a stream row comes from (rows R45-R51, U15-U17)

* **Design text.** 13.2 gives the grammar `{"from":"calls","calls":path}` for R rows ("the stream with the row's list") and for U rows nothing but "scripts"; U09 has empty scene and layout cells.
* **Literal reading used.** The new R and U rows carry the scene and layout of the list whose table the stream refers to (G01's for R45, R47-R50, U15-U17; the `loops2` one for R46 and R51), initial state; the reader needs only the table and the header hashes. The rows U15-U17 take `{"calls":"calls/Rnn.calls"}` like U09 but with the scene and layout cells filled so that the list is not implicit.
* **Why / status.** Reading; if a runner cannot resolve the list of a U row from the cells it is a runner matter, not a design one.

## A-53  6.6 (rev 6): "markers for more than one pid" versus "the count is of markers"; a pid in layers 2 and 6; the same pid twice in a layer (no row)

* **Design text.** 6.6: "layers 2 and 6 together holding at most one pid" and, in the reader rules, "markers for more than one pid" (change log R31-02) next to "The focus count is of **markers** in layers 2 and 6" (R31-03, R31-04); 6.6 also says the pids of a layer are "ascending", 9.3 "strictly ascending".
* **Literal reading used.** Every verdict that the two wordings could separate is rejected by another rule, so no row separates them. A pid that appears in both layers 2 and 6 is a node pid in layer 2 or an edge pid in layer 6 and is refused by the kind check (R31-04); the same pid twice in one layer is refused by the strict ascent of 9.3 and by the count of markers. A row for either stream would be **overdetermined** (two rules reject it, so it cannot be single-fault) and is not written. The count rows (R45-R48, R61, R62) use two **different** pids of the right kinds, where "pids" and "markers" agree.
* **Why / status.** Reading, no verdict is affected. If the owner meant "distinct pids" for the count and a non-strict ascent for 6.6, the same-pid stream would be accepted; the text of 9.3 ("strictly") and of 6.6 ("count is of markers") excludes that.

## A-54  6.6, 9.3 (rev 6): the stream reader's relation to the list beyond the table (no row)

* **Design text.** `canvasStreamWitness(stream, list)` and `readoutFromCanvasStream(stream, list)` read the stream "with a strict reader"; the reader rules name the table (a pid "in the table"), the kind of the pid and the focus count; 9.3 says "addresses by pid through the list's table".
* **Literal reading used.** The list is used for the table (and so for the number of nodes `ND`, which decides the kind of a pid) and nothing else: the reader does not check a layer-5 or layer-6 marker against the `flags` of the list, a layer-8 marker against the list's `T` records, or the painting of a layer against the list. A stream that marks an element the list does not mark is not checked by the reader (it is a mismatch, found by `compareReadouts` against the other backends, 9.5).
* **Why / status.** Reading; nothing is written because the text states no such check. Recorded because the kind rule makes a reader that needs `ND` from the list the first place where the list is more than a table of addresses.

## A-55  9.3 against 6.6 (rev 6): where the kind rule is stated

* **Design text.** 9.3 says "A pid outside the table, or a node pid in an edge layer, is `INVALID_INPUT/SCHEMA`" in the sentence that reads the **plan** (`readoutFromGl`), and names no kind rule for an **edge pid in a node layer** or for the stream in that paragraph; its stream sentences say only "canonical lines, markers non-decreasing in layer and pids strictly ascending within a layer". The complete rule (layers 1-4 edge pids, 5-7 node pids, 8 either) is in 6.6 "Reader rules".
* **Literal reading used.** 6.6 is the rule of the stream reader and 9.3 is not read as narrowing it: both directions are checked for the stream (rows R52-R55 a node pid in an edge layer, R56-R58 an edge pid in a node layer). Layer 8 takes both kinds (the existing `R16` and `C01` carry an edge label and node labels in layer 8).
* **Why / status.** Editorial: a reader of 9.3 alone would not find the edge-pid-in-a-node-layer direction. No verdict is affected.

## A-56  6.6 (rev 6): the unpainted wrong-kind marker (rows R59, R60, U20)

* **Design text.** "The reader checks the kind of **every** marker pid against its layer" (R31-04), "the focus count is of markers ... whether or not painting calls follow" (R31-03); 9.3: "a marker without painting calls contributes nothing" (R44).
* **Literal reading used.** The kind check is structural like the count: it applies to a marker whether or not painting calls follow, so a layer-5 marker for the edge pid 3 (R59) and a layer-4 marker for the node pid 2 (R60), neither with a painting call, are rejected. The sentence "contributes nothing" is about the **readout** (what is drawn, marked, an arrow, a label), not about the reader's structural stage.
* **Why / status.** Reading from "every marker pid"; the opposite reading (kind checked on painted sections only) is the mutant K209, killed by R59, R60 and U20.

## Resolved in rev 6 (disposition of earlier entries; the entries above are unchanged)

Source: design 31 rev 6, change log "Rev 5 -> rev 6 (owner-adopted wording)", sections 6.6, 9.3, 4.7. Rev 6 is text only: no Appendix byte, no row or mutant id changes. "Matched" means the rev 6 text says what the literal reading of the entry used; no existing expected byte changes.

| Entry | Rev 6 item | Disposition | Rows and mutants |
|---|---|---|---|
| A-45 (a stream with more than one focused element; the count is over markers) | R31-02, R31-03 | RESOLVED, reading matched: the count is of markers, painted or not | R45-R48, U15, U16 (existing); R61, R62 (new, complements); K188-K195, K218, K219 |
| A-46 (the single-focus rule has no row and no mutant) | R31-01, R31-02 | RESOLVED: the rows and mutants of the rev 5 gap review carry it; the rev 6 change log says new rows were still needed for R31-02 and R31-04, written here | Y18-Y20, K197-K200 (R31-01); R45-R48, U15, U16, K188-K196 (R31-02); R52-R63, U18-U21, K201-K221 (new) |
| A-47 (a state cannot name two focused elements) | R31-01 | RESOLVED, reading matched (`INVALID_STATE/SCHEMA`, 27 4.2 (iii)) | Y18, Y19, Y20 |
| A-48 (error code of a rejected stream) | R31-02, R31-04 | RESOLVED, reading matched: `INVALID_INPUT/SCHEMA` is now stated | all stream rows with an error |
| A-49 (markers or painted sections) | R31-03 | RESOLVED, reading matched: markers, painted or not; a lone marker is accepted and contributes no focus | R44, R48, R49, K191 (existing); R61, R62, R63, U21, K218-K221 (complements) |
| A-50 (a pid in layers 2 and 6; a node pid in layer 2) | R31-04 | RESOLVED, no longer underspecified: the reader checks the kind of every marker pid against its layer, so a node pid in layer 2 is `INVALID_INPUT/SCHEMA`; a pid in both layers 2 and 6 is always rejected by the kind check (A-53) | R52-R60, U18-U20, K201-K217 |
| A-51 (the list reader has no focus rule) | R31-05 | OPEN, not folded by rev 6 ("a focus rule D13 in the list reader; needs code"); no row written | none |
| A-52 (where the list of a stream row comes from) | R31-06 | OPEN, not folded by rev 6 (13.2); the reading of A-52 is kept for the new rows R52-R63 and U18-U21 | none |

Not touched (gl-only or open, no row written): R31-07, R31-08, R31-09, R31-10, R31-11 (a) and (b) (V7 plan, controller and logs: `oracles-gl`); R31-11 (c) and R30-31-01 (open, undecided).

## A-57  13.2: the `S` row grammar has no field for the line number that D13 states (rows S44-S57, S64)

* **Design text.** 4.7: failures are `INVALID_INPUT/SCHEMA` "with the line number in `detail`"; D13 (R31-05) says "the line number in `detail` being that of the second such record". 13.2 and 13.3 give an `S` row an input that is a path (or the inline `{"file":...,"limits":...,"also":[...]}`), an empty `expected` and an `error` cell `CODE/REASON`; no existing `S` row states a line number, and no `S` grammar says how a row would.
* **Literal reading used.** The line is the one thing that tells D13's two readings apart (the second record against the first, the last or an earlier fault), so the rejected rows of D13 carry it in their inline input as `"expect_line": N` (the 1-based line of the record that the rule names; `{"expect_line":143,"file":"bad/S44.dl"}`), next to the `file` key that a reader of 13.2 already knows. This follows the precedent of `expect_detail` of `gl:E10` and `E11` (an extra inline key that states a part of the failure the `error` cell cannot). The `error` cell stays `INVALID_INPUT/SCHEMA`; a runner that does not know `expect_line` still checks the rejection and passes. No other `S` row (S02-S43) is changed.
* **Why / status.** Editorial, a grammar gap, not a verdict. The line is a **number**, not the text of `detail`: where an implementation puts it (`detail`, a `path` such as `line 7`) is not a corpus matter.

## A-58  4.7 D13 supersedes A-51 (the list reader had no focus rule)

* **Design text.** 4.7 D13 and change-log row R31-05 (ruled 2026-11-22): "at most one `E` or `N` record of the whole list has the focus bit (`flags` 2 or 3). A second record with the bit is `INVALID_INPUT/SCHEMA`, the line number in `detail` being that of the second such record ... a rule over the whole list, applied after the rules of each record; single-fault like the others".
* **Literal reading used.** D13 is the "new rule D13 with a single-fault `S` row" that A-51 named. A-51 stays as written (a record of what the corpus said before the ruling); this entry is its disposition: **RESOLVED by D13**. Both focus-bearing values count (`flags` 2 and 3), on `E` and on `N`, whatever the kind of the first record; `flags` 1 (selected only) and 0 do not. The rows are S44-S64 (S44-S55 and S64 single-fault rejections, S56 and S57 the precedence rows of A-59, S58-S63 the controls that must stay accepted); the mutants K222-K245.
* **Why / status.** Reading matched to the text; no existing expected byte changes (every existing list of the corpus has at most one focus bit, asserted by `tools/rev7_dl.py`).

## A-59  4.7 D13 against the other rules: what "applied after the rules of each record" decides (rows S56, S57)

* **Design text.** "D13 is a rule over the whole list, applied after the rules of each record." The other whole-list rules (D4 counts and `A` presence of D5, line number 0 or the header) are not ordered against D13 by any sentence.
* **Literal reading used.** Against the **per-record** rules (D6 `E`, D7 `A`, D8 `N`, D9 `T`, D12 canonical text) the order is stated: a faulty record is reported first, whether it comes before the first focus record (S57: an `E` with `flags` 4 ahead of two focused `N`) or after the second (S56: a `T` text of 25 units after two focused `N`); the line is that of the faulty record. Both rows are therefore **two-fault** lists and are judged by the line (like `S32` and `S40` they are declared exceptions to single-fault; the generator asserts that with the per-record rule alone off the line is D13's, and with D13 alone off it is the record's). No row orders D13 against the whole-list rules D4 and D5 (a header count, a missing `A`), and none is written: a row would encode a guess about a line number the text does not give.
* **Why / status.** Reading from "after the rules of each record". Mutants K230 (D13 before the records) and K231 (D13 while the records are read) are the two ways to get it wrong.

## A-60  Where the new accepted lists and ids live (rows S58-S63, S60 reuses G05)

* **Design text.** 13.3 lists the `dl/` files as expected lists of the G, N, X, Y, O rows and `bad/` as the rejected lists; it reserves no `S` id above `S43` and no `K` id above `K221`.
* **Literal reading used.** New ids continue the numbering: `S44`-`S64`, `K222`-`K245`. The rejected lists are `bad/S44.dl`-`bad/S57.dl` and `bad/S64.dl`. The accepted controls S58, S59, S61, S62, S63 are files `dl/S58.dl` etc. (a list is a list; no reader and no test globs the directory) and S60 names the existing `dl/G05.dl` (no focus bit; the `row` for the list as it stands). Every control is `G05` or `G02`/`O01` edited in `flags` only, so it is accepted by every other rule. `bad/S55.dl` is built on `O01` (a list without `T`) so that the second focus record is the last record of the file; the lists of the other rows are `G05` (20 nodes, 37 edges; directed) except `S64` (`G02`, undirected: the two `E` records follow each other with no `A` between).
* **Why / status.** Editorial; no verdict is affected.

## Resolved for D13 (disposition of an earlier entry; the entries above are unchanged)

Source: design 31 4.7 rule D13 and change-log row R31-05 (ruled 2026-11-22). Append-only: no existing expected byte, row, mutant or ambiguity line changes.

| Entry | Rule | Disposition | Rows and mutants |
|---|---|---|---|
| A-51 (the list reader has no focus rule) | D13, R31-05 | RESOLVED by D13: a second focus-bearing `E` or `N` record is `INVALID_INPUT/SCHEMA` at its line | S44-S57, S64 (rejected), S58-S63 (accepted); K222-K245 |

## A-61  Ruling R-H: label positions change, nothing else (design 37 rev 3; design 31 4.1 and 4.4(g) rev 7)

* **Design text.** Design 37 section 1 and 9, the owner decision of 2026-11-22 recorded as ruling R-H (execution plan, last lines): label overlaps are fixed in the real renderer code, the new placement LP/1 is the default, the expected bytes of the DRAFT corpora are regenerated for it, as an explicit exception to the ledger rule R-C that covers only the expected label-position bytes. 31 4.4(g) now says the `T` position is the default position plus the whole-pixel offset of `placeLabels`.
* **Reading used.** Every `T` record and every `fillText` call of a builder output is written at `default + placeLabels(...)`. The placement function is the Python reference of `fixtures/oracles-lp/tools/lp.py`, imported by path (`tools/dl.py` loads that file alone with `importlib`, after checking its SHA-256 `1c62862f...29b95` (rev 3 of design 37; see A-67); this corpus never reads TypeScript). No other byte of any expected file changes: `tools/labelmove_check.py` replaces the x and y of every `T` record and of every `fillText` call by a constant in the old (`git show HEAD:...`) and the new file and requires byte identity, and requires every other file to be byte-identical (append-only files, index files and the four new rows excepted).
* **Why / status.** Ruled by the owner; not an ambiguity of the text. Recorded so that a reader of a future diff of this corpus finds the one authorised exception.

## A-62  Which files are builder outputs (regenerated) and which are hand-built inputs (not regenerated)

* **Design text.** The ruling covers the expected label-position bytes; 13.2 says which cell of a row is an input and which an expected file.
* **Reading used, row class by row class.** Regenerated (builder outputs, expected cells; the files and the number of moved labels are listed by `labelmove_check.py`): the `.dl` files of the G, N, X, Y, O, F rows that hold a colliding label (29 files: `dl/F04`, `G05`, `G07`, `G08`, `G09`, `G11`, `N01`-`N03`, `N05`-`N08`, `N06b`, `N06c`, `N16`, `N17`, `X02`-`X05`, `X10`, `X11`, `Y08`, `Y11`, `Y12`, `Y17`, `Y20`, `Y20b`; `Y20` and `Y20b` were written by `tools/gap_dl.py` from its own list model on the old lists, so `lp_dl.py` rebuilds them with the reference builder and checks that only the x and y of the `T` records differ) and the Canvas call streams of the C rows (`calls/C03`, `C07`, `C19`, `C20`: the `fillText` operands). Byte-identical to the old corpus, because they hold no label position or no label of theirs moves: every other `dl/` and `calls/` file, the readouts and compare results (`xr/`: a readout has the label text and the unit total, never a position), the pick buffers and bounds (labels are not hit-tested and have no extent in 5.1/5.4), the device sizes, the manifests, witnesses and outcome files (`json/`), the lifecycle scripts, the lists and states recorded by the U rows (`*.cK.dl`, `*.cK.state.json`), the states, scenes and layouts, and `inputs/*.json`. Hand-built inputs, NOT regenerated, although the generator derives them from expected files by editing: the bad lists `bad/S02`-`bad/S57` and `bad/S64`, the accepted controls `dl/S58`, `dl/S59`, `dl/S61`-`dl/S63`, and the call streams `calls/R45`-`calls/R63`; the lists and streams are built from the pre-LP/1 lists (`D.LP_ON` is switched off while `tools/rows_a.py` builds the bad lists, and `tools/regen_all.py` hands the gap, rev 6 and rev 7 tools the pre-LP/1 lists), so their `T` positions are the old ones. The reader and the stream reader check only coordinate ranges of `T` (D9) and no S or R row compares a position with the builder; `labelmove_check.py` shows every one of these files byte-identical to the old corpus.
* **Why / status.** Reading of the owner instruction ("hand-built bad/ input files are inputs ... they are NOT regenerated; if a row is an expected output of the builder it is"). The reader accepts both position sets, so no verdict depends on the choice.

## A-63  The offset is added to the micro-pixel default before the rounding to milli-pixels

* **Design text.** 37 section 2: "the renderer adds `dx`, `dy` (times 10^6) to `x`, `y`"; section 1: the placement works on micro-pixels before the final rounding; 31 4.4(b): rounding happens once, from the micro-pixel value.
* **Reading used.** `T.x = m(x + dx * 10^6)`, `T.y = m(y + dy * 10^6)` with the default `(x, y)` in micro-pixels exactly as before (`(X, Y + 24 * 10^6)` and `(ax, ay - 4 * 10^6)`). Because a whole pixel is a multiple of 1000 micro-pixels the offset commutes with `m`; what matters is that the placement itself runs on the micro-pixel defaults: two labels 9.99999 px apart collide, the same labels rounded to milli-pixels are exactly 10 px apart and do not (row G12; mutant K250).
* **Why / status.** Reading from the text; the micro-pixel defaults are the input of `placeLabels` (37 section 2).

## A-64  The gate on `oracles-svg` covers its data, not its expected documents

* **Design text.** 13.1 (self-containment): this corpus reads the scenes, layouts and states of `oracles-svg` by path; before this ruling the generator stopped when the digest of the whole `SHA256SUMS` of `oracles-svg` changed.
* **Reading used.** `oracles-svg` is regenerated for LP/1 under the same ruling (its `svg/` documents carry the same label positions), so the gate of `tools/gen.py` now requires the 88 lines of its `scenes/`, `layouts/` and `states/` that the pre-LP/1 corpus consumed (kept in `tools/svg_data_pins.txt`, digest `7b0912c9...a617`) to be present unchanged in its `SHA256SUMS`: the data this generator actually uses. Files that `oracles-svg` adds later (it appends rows for LP/1) do not matter. The documents `svg/*.svg` and `EXPECT.tsv` of `oracles-svg` are read only for the readout scrape of the R12-R15 rows and for the informational checks of `inputs/self-checks.json`; the scrape never looks at a label position. The self-check `c_v5_parity_vs_oracles_svg_documents` compares the list positions of every pair with the printed SVG numbers: with the regenerated `oracles-svg` it is `true` for every pair (the two independent oracles agree on every label position), with the pre-LP/1 documents it reports `DIFF` on the moved labels.
* **Why / status.** Editorial; no expected byte depends on it. The README statement about the digest of `SHA256SUMS` is left as it was written for the pre-LP/1 generation.

## A-65  New rows G12-G15 and mutants K246-K256

* **Design text.** The owner instruction asks for mutants of the integration (placement skipped, x only, y only, edge labels first, placement after the milli rounding, per-kind calls, hidden nodes as obstacles, units before the elision, node obstacles ignored) and for a row with fractional micro-pixel defaults.
* **Reading used.** G12 (fractional defaults, zoom 1001, K250), G13 (a hidden node on the second candidate, K252), G14 (a drawn node without a label, K255), G15 (an astral label, K256) are appended with authored scenes `lpfrac`, `lphid`, `lpunl`, `lpastral`, layouts and states. K246-K256 are switches of `tools/dl.py` (`lp_offsets`) run over every non-K row of the generator and the new rows; the table is in `MUTANTS.tsv`. The mutants that the existing G, N, X, Y, O, F, C rows already kill (K246-K249, K251, K253, K254) are named with their killers; K250, K252, K255, K256 are killed only by the new rows.
* **Why / status.** Editorial; append-only (ids G12-G15, K246-K256, A-61-A-67).

## A-66  Sizes pinned by existing rows do not move

* **Design text.** F01/F02 pin the byte limit 637 on G01, F04 pins the size of the hub list; A.9 quotes option sizes.
* **Reading used.** The changed files keep their line structure; some change size by 1 to 18 bytes (a coordinate gains or loses a digit: `N02` +18 is the largest, `G05`, `Y08`, `Y11`, `Y12`, `Y20`, `C03`, `C07` +1). No size pinned by a row moves: G01 stays 637 bytes (F01 and F02 pin 637 and 636), the size of the hub list pinned by F04 is unchanged (labels move but each coordinate keeps its digit count), G11 stays 1553 bytes, the option sizes of A.9 are those of G01 and Y07 (no label of either moves). The Appendix A figures: only A.3 (G11) changes, its SHA-256 (`3f9f4358...` to `273c0a57...`); `APPENDIX-A.tsv` is byte-identical to the old file.
* **Why / status.** Reading; checked by `labelmove_check.py` (a file that is not listed is byte-identical) and by the Appendix A reproduction table.

## A-67  Design 37 rev 3: the width model is 9 px per UTF-16 unit (the placement function changed, the integration did not)

* **Design text.** Design 37 rev 3 (2026-11-22): half width `4.5u` px (`4,500,000 * u` micro-pixels), `h = floor((9u + 1) / 2) + 14` for node labels and `+ 10` for edge labels; everything else as rev 2. `fixtures/oracles-lp` was regenerated (digest `564db749...b657`) and `tools/lp.py` changed.
* **Reading used.** The reference `lp.py` pin of `tools/dl.py` is now `1c62862f...29b95`; this corpus (A-61 to A-66, rows G12-G15, mutants K246-K256) was regenerated from it with no change of integration. The positions of every label are those of rev 3 (the 29 files of A-62 hold moved labels: `G07` is now among them, 33 files with the call streams); the x and y of `G11`'s label `R2` of pid 5 is 51100, the A.3 SHA-256 of design 31 is `6ff85140...8ef0`. Rows whose geometry depended on the width were re-picked: G12 now has its nodes 9990 layout units apart at zoom 1001 (9.99999 px, collision below `9u + 1 = 10` px, milli-pixel positions exactly 10 px apart); G13 and G14 (6 px apart) and G15 (17 px apart, UTF-16 reach `18 + 4.5 + 1 = 23.5` px against `9 + 4.5 + 1 = 14.5` px for scalars) keep their scenes. Every named killer of K246-K256 still kills (checked by the matrix of `tools/lp_dl.py`).
* **Why / status.** Editorial; ids unchanged (the meaning of no row or mutant changed, only a coordinate of G12's scene).

## Resolved for LP/1 (disposition; the entries above are unchanged)

Source: design 37 rev 3 and ruling R-H (2026-11-22); design 31 rev 7 (4.1, 4.4(g)). Append-only: no existing expected byte except the x and y of label records, no existing row, mutant or ambiguity line changes.

| Entry | Rule | Disposition | Rows and mutants |
|---|---|---|---|
| (new) | LP/1 label placement, R-H | the label positions of every builder output are regenerated from the reference `oracles-lp/tools/lp.py`; proof: `tools/labelmove_check.py` | all G, N, X, Y, O, F, C rows that hold a moved label; G12-G15 new; K246-K256 |
