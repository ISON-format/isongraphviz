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
