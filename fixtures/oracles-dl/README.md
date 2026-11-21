# IGR-DL/1 and IGR-CV/1 oracle corpus (`oracles-dl`)

Status: **DRAFT** (not frozen; no digest is pinned). Revision note: design 31 is now rev 6 (text only: rules R31-01 to R31-04 for this corpus, owner-adopted); 37 rows and mutants were appended for it, see the last section. Produced against design 31 rev 5 (`31-CANVAS-WEBGL-DESIGN.md`; first written against rev 2, regenerated for rev 3 and refreshed for rev 5, whose only rule change for this corpus is the single-focus rule of the stream reader) by an oracle author who was given only that design, `27-IGR1-DESIGN.md` (rev 5), `30-SVG-RENDERER-DESIGN.md` (rev 4), `IGS-1.md`, `IGL-1.md`, `docs/conformance/README.md`, the frozen fixtures (`fixtures/oracles`, `fixtures/oracles-igl`) and, as read-only **data**, the scenes, layouts, states and expected SVG documents of `fixtures/oracles-svg` (the digest of its `SHA256SUMS`, `63a198339b40417d1a039058e9e61b5f21fa1a5c887be29decd5c3bef97cccbd`, is checked by the generator and a mismatch stops it). Read `AMBIGUITIES.md` (56 entries, A-47 to A-52 added after the gap review, A-53 to A-56 and a rev 6 disposition section after design 31 rev 6) before judging any mismatch.

## Independence statement

* Every expected byte comes from the Python code in `tools/` (standard library only: `hashlib`, `json`, `math`, `re`, `fractions`, `decimal`, `unicodedata`, `xml.etree.ElementTree` for the SVG scrape of rows R12-R15). `tools/core.py` is arithmetic, canonical JSON, IGS/IGL model derivation, state, a reducer subset and the frozen hit test; `tools/dl.py` the display list (build, writer, strict reader); `tools/view.py` pick, bounds, `backingSize`, the Canvas replay and recorder, readouts, `compareReadouts`; `tools/sim.py` the manifest and a lifecycle simulation; `tools/scenes.py` the authored scenes and the seeded searches; `tools/rows_a|b|c.py` the rows; `tools/gen.py` the driver and the mutant matrix; `tools/appendix_a.py` the Appendix A gate.
* The author did **not** read, import or run any TypeScript, `packages/*`, the V6/V7 packages (none exist), any `reviews/*.md` or author-notes file, any tool code of another corpus (the `tools/` of `oracles-svg` was not read or run), and did not read or write `fixtures/oracles-gl`.
* Shared assumption: oracle and code implement the same written rules; the corpus proves that code matches the text as read in `AMBIGUITIES.md`.
* A **third party** must run `verifyScene`, `verifyLayout`, `bindLayout` over every file of `scenes/` and `layouts/` and `parseState` over the accepted `states/` files (13.1); the generator's own checker is a lite one (canonical form, ordering, uniqueness, id rules, endpoint order, layout order and binding).

## What is here

`EXPECT.tsv`: header `id group tier scene layout input expected error` (13.2), **495 rows** (432 of the rev 5 generation, the 26 gap rows and the 37 rows of the rev 6 section). `scene`, `layout` are paths relative to this directory (`../oracles/...`, `../oracles-igl/...`, `../oracles-svg/...` for reused data, `scenes/...`, `layouts/...` for authored); `input` is a path or inline JSON (starts with `{` or `[`); `expected` a path or empty; `error` is `CODE/REASON` or empty; a row with an `error` has no expected file.

| Family | Rows | with an error | what |
|---|---|---|---|
| G | 11 | 0 | golden display lists |
| N | 17 | 3 | numbers and geometry |
| X | 13 | 0 | text |
| Y | 20 | 4 | state hooks |
| O | 17 | 10 | options and validation |
| F | 5 | 3 | size limits |
| S | 43 | 41 | the strict reader |
| P | 16 | 0 | pick buffer and pickDrawn |
| B | 4 | 0 | element bounds |
| C | 25 | 9 | the Canvas call stream |
| Z | 7 | 3 | device sizes |
| R | 63 | 24 | readouts |
| U | 21 | 5 | the Canvas renderer (lifecycle scripts, outcome files; U15-U21 witness rows) |
| D | 6 | 0 | differential (runtime; no files) |
| K | 227 | 0 | mutants (empty cells) |
| **total** | **495** | **102** | D and K rows (233) have empty cells by design; U10 has neither a file nor an expected cell |

| Directory | Content |
|---|---|
| `dl/` | expected display lists (exact bytes, every line ends with LF): rows G, N, X, Y, O, F; `*.cK.dl` are the lists recorded by the U scripts |
| `pick/`, `bounds/` | pick buffers (P01-P03, P16) and element bounds (B01-B04, B04 is empty) |
| `calls/` | Canvas call streams (C rows, U scripts, `X13.calls` is a derived input of R43) |
| `xr/` | readouts (`Rnn.xr.json`: canonical JSON + LF), compare results (`Rnn.compare.json`), derived entry readouts of the compare rows |
| `json/` | device sizes (Z), manifests (U06), witnesses (U09), outcome files (U07, U11, U12, U13) |
| `scripts/` | lifecycle scripts of the U rows with their expectations filled in (outputs of the generator) |
| `states/` | canonical IGR-CJ/1 state bytes (no trailing newline) bound to the row's scene and layout; `U*.cK.state.json` are the states recorded by the scripts |
| `scenes/`, `layouts/` | authored IGS/1 scenes and `igl-fixed/1` layouts: `arrows`, `quadcub`, `zerotrim`, `far`, `far-u`, `brackets`, `hostile`, `pickh`, `pickd`, `pickv`, `pickt`, `pickn`, `pickb` |
| `bad/` | the S02-S43 invalid lists (single-fault, see `inputs/self-checks.json`) |
| `inputs/` | `N03.search.json` (seed, trials, witnesses), `searches.json` (N07, P08, P13), `self-checks.json` (single-fault table, parity, fidelity gate, D rows) |
| `APPENDIX-A.tsv`, `MUTANTS.tsv` | the Appendix A reproduction table and the mutant matrix (generated, covered by `SHA256SUMS`) |
| `tools/` | the generator (not in `SHA256SUMS`) |

`SHA256SUMS`: one line `<sha256> *<path>` per file except `tools/` and itself, sorted by byte order of the path. No project or person names occur in any file.

## Regenerate

```text
python tools/gen.py                  # regenerate every file from empty (removes everything but tools/); about four minutes with the matrix
python tools/gen.py --out DIR        # the same into DIR (byte-identity proof: two runs with different PYTHONHASHSEED, diff -r)
python tools/gen.py --no-matrix      # skip the mutant matrix (MUTANTS.tsv is then not written)
python tools/gen.py --mutant K08     # run one mutant over every row and list the rows that change
python tools/gen.py --check-appendix # print the Appendix A reproduction table only
```

Python 3.12, standard library only, no network, no clock, no randomness (the N03 search uses a fixed 32-bit LCG with a recorded seed; the P08/P13/N07 constructions are deterministic scans). The generator asserts at run time: Appendix A (read from the design file), the N03 search property (each of K26, K27, K28 changes an `A` record), the N07 zero-length E record, the extreme coordinates of N13/N14/R28/R29, the single-fault property of the S rows, the P08 and P13 properties, the parity of the four readout routes (list, SVG scrape, stream) on R01/R05/R30/X01, the fidelity of 34 rows against the `expect_fidelity` of `oracles-svg`, byte equality of the 17 Y states with the same-named states of `oracles-svg`, and the C-V5 parity of 3.2 over 44 (row, V5 document) pairs: every node centre, every `d` number of every route (straight, parallel, loop, degenerate), every label position and text and the presence of every arrow equal what the expected V5 documents print (`inputs/self-checks.json`, `c_v5_parity_vs_oracles_svg_documents`; the V5 documents are read as data and the two implementations are independent).

## Tiers

`core`: a function on bytes. `both`: the function and the subject (`buildDisplayList`/`recordCanvasCalls`/`pick`/`elementBounds` and the renderer methods). `subject`: lifecycle and renderer rows (U, D). `K` rows have an empty tier and empty cells. Tiers were assigned as 13.3 states them; where it is silent: B both, R core for the function rows (R12-R20, R23-R27, R36-R38 and the stream rows) and both for list rows, Z core.

## Row inputs and expected files

* **G, N, X, Y, O, F**: `{"size":{width,height},"state":"initial"|path,"options":{...}?,"limits":{"maxBytes":n}?,"also":[{"state":path,"expected":path}]?}`; `initial` is `initialState(model, size)`; a path is a state file. Tokens `"NaN"`, `"Infinity"`, `"-Infinity"` stand for those doubles. `plain_object_model: true` (O14) hands a model-shaped plain object. Expected `dl/<id>.dl`, or empty with `error`. Y14 and Y15 load their state files without validation (plain JSON) so that the build's own validation fails.
* **S**: a path under `bad/` or `dl/`, or inline `{"file":..,"limits":{maxBytes,maxLineUnits}?,"also":[..]?}`; expected empty; `error` or accepted.
* **P**: inline `{"size","state","points":[{"x","y","hit":{node|edge}?,"error":"CODE/REASON"?}]}`: the oracle writes the `hit`/`error` of every point into the input (a point with neither expects no hit); P01-P03, P16 expect `pick/Pnn.pick`. **B**: `bounds/Bnn.bounds`.
* **C**: as G plus `"replay":{"dprMilli","ink","layers","onElement":"not-a-function"}?`; expected `calls/Cnn.calls`. C13 records two replays into one recorder after `reset()` (expected: the second stream, which must equal the first); C18 records with and without the `onElement` hook (expected: the stream with markers removed; the no-hook replay must equal it).
* **Z**: `{width,height,dprMilli}`; expected `json/Znn.json` = canonical `{"bh","bw","e"}` + LF.
* **R**: `{"from":"list",size,state}`, `{"from":"svg","svg":path}` (the oracle's scrape of the V5 document into a `SvgReadoutLike`, then `readoutFromSvgReadout`), `{"from":"calls","calls":path}`, `{"from":"object","object":SvgReadoutLike}`, `{"from":"compare","entries":[{renderer,readout}]}`; expected `xr/Rnn.xr.json` / `xr/Rnn.compare.json` or an error.
* **U**: `scripts/Unn.script.json` (lifecycle schema of 27 13.3a with the ops listed in AMBIGUITIES A-32) or inline JSON (U06 manifests, U07 option cases, U09 witnesses, U11-U13 outcome files, U10 none).
* **D**: no files; the oracle runs deterministic seeded checks (recorded in `inputs/self-checks.json`).

## Appendix A reproduction (design 31)

| Item | Result | Detail |
|---|---|---|
| A.1 G01 bytes equal the A.1 block (X1) | REPRODUCED | 637 bytes |
| A.1 size 637 and SHA-256 of the block | REPRODUCED | 637 / 62e9d45ed682602b4b4dae6503a92029566fb0cabf6e73f8a9a50893fcff4ebd |
| A.2 (row Y03) figure without a gated block | REPRODUCED | 637 / 48c82389e35751c8db74db13e12c1345222d3dd01df16791fb9bd2bec931194e |
| A.2 difference block (three lines) equals the lines of Y03 that differ from G01 | REPRODUCED |  |
| A.3 G11 bytes equal the A.3 block (X1) | REPRODUCED | 1553 bytes |
| A.3 size 1553 and SHA-256 | REPRODUCED |  |
| A.4 C01 stream equals the A.4 block (X1) | REPRODUCED | 1042 bytes |
| A.4 size 1042 and SHA-256 of C01 | REPRODUCED |  |
| A.4 C02 stream (figure without a gated block) | REPRODUCED | 1455 / 6cbb962e795d29790254341af0cd2fce66f3afafe6ae8ee14dad2bb2083abfd6 |
| A.6 P01 pick buffer equals the block (X1) | REPRODUCED | 104 bytes |
| A.6 P01 size 104 and SHA-256 | REPRODUCED |  |
| A.6 bounds block equals B01 (X1) | REPRODUCED | 105 bytes |
| A.6 bounds size 105 and SHA-256 | REPRODUCED |  |
| A.6 first loop of G11: the 17-point polyline equals P03's line of pid 3 | REPRODUCED |  |
| A.6 pick (500,308) -> the KNOWS edge; (500,300) -> none | REPRODUCED |  |
| A.6 quantizePx(-2^-11 * 1000) = 0 (inside) and quantizePx(-2^-10 * 1000) = -1 (outside) | REPRODUCED |  |
| A.6 loops: (32.1,275.0) -> loop pid 3 with hitTest none; (32.1,266.0) -> pid 4; (32.1,280.0) -> pid 3 | REPRODUCED |  |
| A.7 R01 readout equals the block (X1) | REPRODUCED | 975 bytes |
| A.7 size 975 and SHA-256 | REPRODUCED |  |
| A.7 the same bytes from the SVG scrape (R12) and from the stream (R16) | REPRODUCED |  |
| A.5 (gl: item) the element-table and text lines of the printed plan prefix equal the n, e, T lines of G01 | REPRODUCED | plan assembly itself is an oracles-gl matter |
| A.8 (gl: item) | not applicable | shader digests: oracles-gl |
| A.10 (gl: item) | not applicable | plan guard rule: oracles-gl |
| A.5.1-A.5.3 (gl: items) | not applicable | executor logs: oracles-gl |
| A.9 option sizes labels:false 548, edgeLabels:false 605, 9 -> 637, 8 -> 605, 4 -> 605, 0 -> 548, Y07 319 | REPRODUCED | O01=548, O02=605, O03=637, O04=605, X09=605, O05=548, Y07=319 |
| A.9 F01 (maxBytes 637) accepted and equals G01; F02 (636) RESOURCE_LIMIT/BYTES_LIMIT | REPRODUCED |  |
| A.11 device sizes Z01-Z04 | REPRODUCED |  |

## Mutants (13.5)

Each mutant is a switch inside `tools/` (`--mutant Knnn`). For each mutant the generator runs **every non-K row** with the mutant active and compares the row output (files, error and the row's internal result) with the unmutated run (`MUTANTS.tsv`). Inputs (scenes, states, bad files, the derived entry readouts) are produced once by the unmutated reference.

**Result: 193 mutants run (the 193 mutants of the rev 3 table, including the second readings K05b, K24b, K25b, K90b, K94b, K155b and the new K187). Killed with every named killer row changing: 193. Killed, but at least one named row does not change: 0 (). Named rows do not kill, other rows do: 0 (). Killed by no row: 0 ().**

| Mutant | Mutation | Named killers | Named rows that change | Named rows that do NOT change |
|---|---|---|---|---|
| K01 | m-px by truncation toward zero | N01 | N01 |  |
| K02 | m-px by `floorDiv` instead of `divRound` | N01 | N01 |  |
| K03 | node centre from `w/2` with integer division | G09,G10 | G09,G10 |  |
| K04 | centre or pan sign wrong in `X` | G01,Y13 | G01,Y13 |  |
| K05 | trim 11 px instead of 12 | G01 | G01 |  |
| K05b | trim 13 px instead of 12 | G01 | G01 |  |
| K06 | trim with the nearest-integer root (V1) | N16 | N16 |  |
| K07 | trim with `floorDiv` (V2) | N16 | N16 |  |
| K08 | trim computed in doubles (V3) | N16 | N16 |  |
| K09 | straight anchor with `floorDiv` (V4) | N17 | N17 |  |
| K10 | parallel anchor with `floorDiv` (V5) | N17 | N17 |  |
| K11 | parallel control point with `floorDiv` (V6) | N17 | N17 |  |
| K12 | degenerate anchor with `floorDiv` (V7) | N17 | N17 |  |
| K13 | parallel midpoint with `floorDiv` (V8) | N17 | N17 |  |
| K14 | parallel frame root nearest-integer (V9) | N17 | N17 |  |
| K15 | degenerate test `<` instead of `<=` | N06 | N06 |  |
| K16 | degenerate edge trimmed anyway | N06 | N06 |  |
| K17 | coincident nodes divide by zero | N05 | N05 |  |
| K18 | parallel offset sign flipped for reversed edges | N09,G05 | N09,G05 |  |
| K19 | grouping by ordered pair | G05,N09 | G05,N09 |  |
| K20 | group counts hidden members | N10 | N10 |  |
| K21 | loop rank counted globally | N08,G11 | N08,G11 |  |
| K22 | wrong loop label anchor | G11 | G11 |  |
| K23 | arrow tip is not the last point of the route | G01 | G01 |  |
| K24 | arrow length 9 px instead of 10 | G01 | G01 |  |
| K24b | arrow length 11 px instead of 10 | G01 | G01 |  |
| K25 | arrow half-width 4 px instead of 5 | G01 | G01 |  |
| K25b | arrow half-width 6 px instead of 5 | G01 | G01 |  |
| K26 | arrow corner `b2` computed as the negation of `b1`'s offset | N03 | N03 |  |
| K27 | arrow base centre with `floorDiv` | N03 | N03 |  |
| K28 | arrow direction from the unrounded µpx points | N03 | N03 |  |
| K29 | zero-length direction left as (0, 0) | N05 | N05 |  |
| K30 | zero-length direction (0, 1) | N05,N07 | N05,N07 |  |
| K31 | arrow on a form-1 edge uses the chord | N04 | N04 |  |
| K32 | arrow on a form-2 edge uses the first control point | N04,G11 | N04,G11 |  |
| K33 | `A` emitted on an undirected graph | G02 | G02 |  |
| K34 | `A` omitted on a directed graph | G01 | G01 |  |
| K35 | all `A` after all `E` | G11,N09 | G11,N09 |  |
| K36 | truncation at 25 units or ellipsis not counted | X01 | X01 |  |
| K37 | truncation splits a surrogate pair | X01 | X01 |  |
| K38 | TAB, LF, CR kept in the text | X03 | X03 |  |
| K39 | XML-illegal scalar kept | X04 | X04 |  |
| K40 | XML-illegal scalar deleted instead of U+FFFD | X04 | X04 |  |
| K41 | text NFC-normalized | X06 | X06 |  |
| K42 | empty label emits a `T` | X05 | X05 |  |
| K43 | label budget boundary exclusive | O03 | O03 |  |
| K44 | label budget not monotone | O06 | O06 |  |
| K45 | budget walk takes edge labels before node labels | X09 | X09 |  |
| K46 | text XML-escaped | X02 | X02 |  |
| K47 | `edgeLabels` default false | G01 | G01 |  |
| K48 | node and edge `T` ranges mixed (edge labels before node labels in file order) | G01 | G01 |  |
| K49 | hidden element in the table | Y07 | Y07 |  |
| K50 | hide does not cascade to incident edges | Y07 | Y07 |  |
| K51 | selected and focused bits swapped | Y03 | Y03 |  |
| K52 | focus bit missing on edges | Y05 | Y05 |  |
| K53 | pid is the scene index, not the table position | Y10 | Y10 |  |
| K54 | category class by index modulo 8 | X10 | X10 |  |
| K55 | category class over visible nodes only | Y17,X11 | Y17,X11 |  |
| K56 | header counts include hidden elements | Y07 | Y07 |  |
| K57 | header size from the layout bounds | G08,G09 | G08,G09 |  |
| K58 | header scene and layout hashes swapped | G01 | G01 |  |
| K59 | edges before nodes in the table | G01 | G01 |  |
| K60 | `readoutFromList` takes `marked.selected` from the focused bit (the two flag bits swapped in the readout) | R30 | R30 |  |
| K61 | final LF missing | G01 | G01 |  |
| K62 | table address with spaces or unsorted keys | G01,X08 | G01,X08 |  |
| K63 | U+2028 or DEL written as an escape in a string | X08 | X08 |  |
| K64 | coordinate limit exclusive (a coordinate of exactly `2^40` refused) | N13 | N13 |  |
| K65 | coordinate limit not enforced | N14,N11 | N14,N11 |  |
| K66 | unknown option key ignored | O07 | O07 |  |
| K67 | options array accepted | O12 | O12 |  |
| K68 | state not validated | Y14,Y15 | Y14,Y15 |  |
| K69 | `maxBytes` boundary exclusive | F01 | F01 |  |
| K70 | `maxBytes` boundary accepts one byte more | F02 | F02 |  |
| K71 | a refused document partially returned | F03 | F03 |  |
| K72 | reader accepts CRLF | S28 | S28 |  |
| K73 | reader accepts an indented or a blank line | S29,S31 | S29,S31 |  |
| K74 | reader does not require the final LF | S30 | S30 |  |
| K75 | reader skips the header checks (format, `W`, hash shape) | S04,S26,S27 | S04,S26,S27 |  |
| K76 | reader does not check the header counts against the table | S05 | S05 |  |
| K77 | reader skips the table canonical check | S07 | S07 |  |
| K78 | reader allows a repeated address | S08 | S08 |  |
| K79 | reader skips the `E` and `N` pid rules | S09,S10,S42 | S09,S10,S42 |  |
| K80 | reader skips the range of `flags` and `form` and the coordinate count | S11,S12,S13 | S11,S12,S13 |  |
| K81 | reader skips the `A` presence rule | S14,S15 | S14,S15 |  |
| K82 | reader skips the `A` consistency rule | S16 | S16 |  |
| K83 | reader skips the `A` adjacency rule (accepts `E E A A`) | S17 | S17 |  |
| K84 | reader skips the `T` order and role rules | S18,S19,S23,S24 | S18,S19,S23,S24 |  |
| K85 | reader skips the `T` text rules | S20,S21,S22 | S20,S21,S22 |  |
| K86 | reader skips the `E`/`N` coordinate bound | S25 | S25 |  |
| K87 | reader does not enforce the order of the kinds (D2) | S06 | S06 |  |
| K88 | reader accepts non-canonical number spellings | S33,S34,S35 | S33,S34,S35 |  |
| K89 | reader accepts an unknown kind | S36 | S36 |  |
| K90 | reader's `maxBytes` boundary exclusive | S37 | S37 |  |
| K90b | reader's `maxBytes` boundary accepts one byte more | S38 | S38 |  |
| K91 | reader has no `maxLineUnits` bound | S39 | S39 |  |
| K92 | reader skips the `kcls` range | S41 | S41 |  |
| K93 | flatten with `floorDiv` | P02,P03 | P02,P03 |  |
| K94 | flatten with 15 segments | P03 | P03 |  |
| K94b | flatten with 17 segments | P03 | P03 |  |
| K95 | pick without the endpoint branches | P08 | P08 |  |
| K96 | pick tolerance 5 px | P04,P07 | P04,P07 |  |
| K97 | pick tolerance 7 px | P04,P07 | P04,P07 |  |
| K98 | pick boundary open | P07 | P07 |  |
| K99 | pick tie goes to the highest index | P09 | P09 |  |
| K100 | pick takes the nearest edge before a node within 12 px | P10 | P10 |  |
| K101 | pick uses the frozen chord for edges | P05,P06 | P05,P06 |  |
| K102 | pointer converted to whole pixels | P04 | P04 |  |
| K103 | hidden element pickable | P11 | P11 |  |
| K104 | pick returns a pid instead of an address | P05 | P05 |  |
| K105 | a frozen edge hit is honoured | P13 | P13 |  |
| K106 | node bound ±18000 | B01 | B01 |  |
| K107 | edge bound without the 6000 expansion | B02 | B02 |  |
| K108 | loop bound from its end points only | B03 | B03 |  |
| K109 | rings painted after the discs | C02 | C02 |  |
| K110 | halos painted after the line | C02 | C02 |  |
| K111 | arrowheads painted before the lines | C01 | C01 |  |
| K112 | style cache disabled | C01,C07 | C01,C07 |  |
| K113 | style cache not reset between replays | C13 | C13 |  |
| K114 | dash not reassigned for the disc stroke | C02 | C02 |  |
| K115 | `setTransform` missing or `dprMilli` ignored | C05 | C05 |  |
| K116 | `clearRect` missing | C01 | C01 |  |
| K117 | label text altered (trimmed, normalized or wrapped) | C10 | C10 |  |
| K118 | font string differs | C01 | C01 |  |
| K119 | `ink` ignored | C06 | C06 |  |
| K120 | witness reads `probe()` instead of the stream | U11 | U11 |  |
| K121 | manifest differs from the renderer's, or `labels.edge` supported with edge labels off | U06,U12 | U06,U12 |  |
| K122 | `export("svg")` returns bytes though declared unsupported | U05 | U05 |  |
| K123 | `displayList()` does not throw `BUSY` | U03 | U03 |  |
| K124 | `displayList()` returns the previous state's list | U01 | U01 |  |
| K125 | `pick` calls the frozen `hitTest` for edges | U14 | U14 |  |
| K126 | `capacity` and `dl` label budgets may differ | U07 | U07 |  |
| K127 | `probe().fidelity.labels` `full` while truncating | U04 | U04 |  |
| K128 | `render()` builds the list | U13 | U13 |  |
| K129 | `dprMilli` not validated | C11,C12 | C11,C12 |  |
| K130 | `ink` not validated | C14,C15 | C14,C15 |  |
| K131 | `layers` not validated | C17 | C17 |  |
| K132 | arc end angle `Math.PI` instead of `2π` | C01 | C01 |  |
| K133 | all edges of a layer stroked in one path | C03 | C03 |  |
| K134 | `save`/`restore` used | C01 | C01 |  |
| K135 | text styles assigned when there is no label | C08,C09 | C08,C09 |  |
| K136 | element markers missing or with the wrong layer | C01 | C01 |  |
| K137 | the 2D calls differ without `onElement` | C18 | C18 |  |
| K138 | `readoutFromSvgReadout` parses decimals through a float and truncates | R20 | R20 |  |
| K139 | `nodes_far` guard-box rule ignored in a readout | R21,R29 | R21,R29 |  |
| K140 | `compareReadouts` path or reference rule wrong | R17 | R17 |  |
| K141 | `compareReadouts` compares readouts with different hashes | R18 | R18 |  |
| K142 | stream readout lists an element whose marker has no painting call as drawn | R44 | R44 |  |
| K143 | `label_units` counts code points | R22 | R22 |  |
| K144 | `readoutFromList` puts the focus under the wrong key (node/edge) | R31,R32 | R31,R32 |  |
| K145 | stream readout takes the selected nodes from layer 7 (every node) | R39 | R39 |  |
| K146 | stream readout takes the focus from layer 5 instead of layer 6 | R39 | R39 |  |
| K147 | stream readout takes the arrows from layer 3 (every edge) | R42 | R42 |  |
| K148 | stream readout takes node centres from the layer-8 anchors | R16 | R16 |  |
| K149 | stream readout counts `label_units` in bytes | R43 | R43 |  |
| K150 | `readoutFromList` classifies `nodes_at` by the viewport rectangle instead of the guard box | R28 | R28 |  |
| K151 | option error class `INVALID_VALUE` instead of `SCHEMA` for a non-boolean `labels` | O08 | O08 |  |
| K152 | numeric option error classes confused (`NOT_FINITE`, `INVALID_VALUE`, `OUT_OF_RANGE`) | O09,O10,O11 | O09,O10,O11 |  |
| K153 | `null` option accepted as absent | O13 | O13 |  |
| K154 | a non-model is not rejected | O14 | O14 |  |
| K155 | `maxDrawnLabelUnits` boundary 2^31 exclusive | O15 | O15 |  |
| K155b | `maxDrawnLabelUnits` 2^31 + 1 accepted | O16 | O16 |  |
| K156 | options validated in a different order than alphabetical | O17 | O17 |  |
| K157 | `pickDrawn` without the closed-viewport rule | P14,P15 | P14,P15 |  |
| K158 | `pickDrawn` border test on the raw point instead of the quantized one | P15 | P15 |  |
| K159 | `pickDrawn` point validation missing | P12 | P12 |  |
| K160 | reader skips the `T` coordinate bound | S43 | S43 |  |
| K161 | reader's nesting scan is not string-aware | S01 | S01 |  |
| K162 | reader splits lines with `splitlines` (also on U+2028) | S01 | S01 |  |
| K163 | `backingSize` floors instead of `divRound` | Z01 | Z01 |  |
| K164 | `backingSize` without the per-side cap | Z02 | Z02 |  |
| K165 | `backingSize` without the area cap | Z03 | Z03 |  |
| K166 | `backingSize` does not validate `dprMilli` | Z05,Z06 | Z05,Z06 |  |
| K167 | `ink` length not validated | C21 | C21 |  |
| K168 | empty `layers` rejected | C22 | C22 |  |
| K169 | `layers` range not validated | C23 | C23 |  |
| K170 | `layers` duplicates accepted | C24 | C24 |  |
| K171 | `onElement` type not validated | C25 | C25 |  |
| K172 | layer-8 text styles assigned after the first marker | C01 | C01 |  |
| K173 | a `PALETTE` entry among k3-k8 wrong | C20 | C20 |  |
| K174 | halo-foc width or dash wrong | C03 | C03 |  |
| K175 | ring-foc dash wrong | C02,C19 | C02,C19 |  |
| K176 | dash tokens not multiplied by 1000 | C02 | C02 |  |
| K177 | form-2 route drawn with `quadraticCurveTo` | C19 | C19 |  |
| K178 | form-1 route drawn with `bezierCurveTo` | C03 | C03 |  |
| K179 | `compareReadouts` checks the version before the schema (one entry has both defects) | R19 | R19 |  |
| K180 | `compareReadouts` accepts an inconsistent `nodes_at`/`nodes_far` partition | R36 | R36 |  |
| K181 | `readoutFromSvgReadout` accepts a non-canonical or `-0` decimal | R23,R25,R27 | R23,R25,R27 |  |
| K182 | `readoutFromSvgReadout` swaps the selected and focused marks | R14 | R14 |  |
| K183 | `compareReadouts` reads a caller-owned `__proto__` key | R38 | R38 |  |
| K184 | `labels: false` still emits node `T` records | O01 | O01 |  |
| K185 | `edgeLabels: false` still emits edge `T` records | O02 | O02 |  |
| K186 | `backingSize` accepts a zero width | Z07 | Z07 |  |
| K187 | `readoutFromSvgReadout` accepts a printed value that is not a number | R24,R26 | R24,R26 |  |

## What the checks establish (and do not)

Established: Appendix A (`dl:` items) is reproduced as tabled; every expected list is accepted by the strict reader and re-serializes to itself; every bad list is rejected and single-fault except S32 and S40 (see AMBIGUITIES); the readout of the list, of the SVG document and of the call stream agree byte for byte on the rows named above; two runs produce identical `SHA256SUMS` (the digest is in the hand-over report, not here, because this file is covered by it). **Not established:** that a browser draws anything, anything about the V7 plan, the frozen verifiers' verdict on the authored scenes and layouts (third party), or any behaviour of TypeScript (none existed).

## Additions after the rev 5 gap review (single-focus clause; rows R45-R51, U15-U17, Y18-Y20, K188-K200)

The ledger note `dl A-46` (AMBIGUITIES) recorded that rev 5 added "at most one element is focused" with no row and no mutant. These 26 rows were **appended** (ids are new; no existing expected byte or row changed; the only existing files that differ are `EXPECT.tsv` and `MUTANTS.tsv` (appended lines), `AMBIGUITIES.md` (appended entries A-47 to A-52), this README (counts and this section) and `SHA256SUMS`).

| Rows | What | Files |
|---|---|---|
| R45 | stream with two layer-6 markers (nodes 1 and 2): `INVALID_INPUT/SCHEMA` | `calls/R45.calls` |
| R46 | stream of `loops2` with two layer-2 markers (loops 3 and 4): rejected | `calls/R46.calls` |
| R47 | one layer-2 marker (edge 3) and one layer-6 marker (node 1): rejected (the count is over both layers together) | `calls/R47.calls` |
| R48 | an unpainted layer-2 marker plus a painted layer-6 marker: rejected (A-49) | `calls/R48.calls` |
| R49 | a lone layer-6 marker without painting calls: accepted, no focus, readout equal to R01's | `calls/R49.calls`, `xr/R49.xr.json` |
| R50 | nodes 1, 2 and edge 3 selected, node 2 also focused (selection is not focus): accepted | `calls/R50.calls`, `xr/R50.xr.json` |
| R51 | `loops2`: node 1, edges 3, 5 selected, edge 4 selected and focused: accepted | `calls/R51.calls`, `xr/R51.xr.json` |
| U15, U16 | `canvasStreamWitness` of the R45 and the R47 streams: rejected (the witness goes through the same reader) | (the R streams) |
| U17 | `canvasStreamWitness` of the R50 stream: accepted, equals the C01 witness | `json/U17.witness.json` |
| Y18 | state with `focus` naming both a node and an edge: `INVALID_STATE/SCHEMA` | `states/Y18.state.json` |
| Y19 | state with `focus` an array of two nodes: `INVALID_STATE/SCHEMA` | `states/Y19.state.json` |
| Y20 | `mixed20`, every element selected plus one focus (an edge; `also` case a node): the focus bit on exactly one record | `states/Y20.state.json`, `states/Y20b.state.json`, `dl/Y20.dl`, `dl/Y20b.dl` |
| K188-K200 | 13 mutants of the single-focus rule, the stream readers and the builder (MUTANTS.tsv); all killed by the named rows | |

Every rejected stream is **single-fault** (accepted by the reference with only the single-focus clause disabled; asserted by the generator). The reference reproduces the existing expected bytes of C01, C02, C04, C19 and R16, R39-R44, U09 before it writes anything.

**Independence of these rows.** Written from design 31 rev 5 (4.1, 4.2, 4.8, 4.9, 6.1-6.3, 6.6, 9.1, 9.3) and 27 4.2 by a separate oracle author who did not read, import or run any TypeScript or `packages/*/src`, and did not read the generator of this corpus; the reference logic is `tools/gap_dlref.py` (replay, strict stream reader, readout, witness, flag derivation) and `tools/gap_dl.py`, `tools/gap_finish_dl.py` (standard library only). `tools/gen.py` does not know these rows: running it removes them. To rebuild only the additions, restore the corpus from version control and run `python -B -I tools/gap_dl.py && python -B -I tools/gap_finish_dl.py`.

**Mutant matrix of K188-K200.** The mutants touch the stream reader, the readouts, the witness, the state check and the focus flags only, so each was run over the new rows and over the existing rows that call those functions (R16, R39-R44, U09's two cases); the other existing rows cannot change. Result: 13 of 13 killed with every named row changing. K192 (the selection layers counted with the focus layers) also changes the existing R39, R40 and U09.

**Not covered (recorded in AMBIGUITIES).** A-50 (a pid in layers 2 and 6; a node pid in layer 2), A-51 (the list reader has no focus rule although the change log says "every artifact"), A-49 (markers versus painted sections is a reading).

## Additions for design 31 rev 6 (stream reader rules R31-02 to R31-04; rows R52-R63, U18-U21, K201-K221)

Design 31 rev 6 (2026-11-20, text only: no Appendix byte, no row or mutant id changes) folded owner-adopted wording; four of its items concern this corpus. These 37 ids were **appended** (new ids; no existing expected byte or row changed; the only existing files that differ are `EXPECT.tsv` and `MUTANTS.tsv` (appended lines), `AMBIGUITIES.md` (appended entries A-53 to A-56 and a disposition section), this README (counts, a revision note and this section) and `SHA256SUMS`). The digest of `SHA256SUMS` is in the hand-over report, not here, because this file is covered by it.

| Rev 6 rule | Carried by (existing rows, verified against this corpus) | New rows (this addition) |
|---|---|---|
| R31-01 a state with two foci is `INVALID_STATE/SCHEMA`; a list from a valid state has at most one focus | Y18 (both keys), Y19 (array), Y20 (one focus bit whatever else is selected); K197-K200 | none needed |
| R31-02 markers for more than one pid in layers 2 and 6 together: `INVALID_INPUT/SCHEMA`, from the one reader of `readoutFromCanvasStream` and `canvasStreamWitness` | R45 (two nodes, layer 6), R46 (two edges, layer 2), R47 (edge in layer 2 + node in layer 6), R48 (unpainted layer 2 + painted layer 6), U15, U16 (witness); K188-K195 | R61 (painted layer 2 + unpainted layer 6), R62 (both unpainted). The same layer twice and a pid in both layers are overdetermined and have no row (A-53) |
| R31-03 the count is of markers, painted or not; a lone marker is accepted and contributes no focus | R44, R48, R49, K191 | R63 (a lone unpainted layer-2 marker: accepted, readout equal to R01's and R49's), U21 (the witness of the R63 stream equals the C01 witness) |
| R31-04 the kind of every marker pid against its layer (1-4 edge pids, 5-7 node pids, 8 either); wrong kind `INVALID_INPUT/SCHEMA`; the count is of markers | layer 8 takes both kinds: R16, U09 (the C01 stream has node labels and an edge label in layer 8) | R52 (node pid 2 in layer 1), R53 (node pid 1 in layer 2), R54 (node pid 2 in layer 3), R55 (node pid 1 in layer 4), R56 (edge pid 3 in layer 5), R57 (edge pid 3 in layer 6), R58 (edge pid 3 in layer 7), R59 (unpainted edge pid 3 in layer 5), R60 (unpainted node pid 2 in layer 4), U18 (witness of R52), U19 (witness of R56), U20 (witness of R59) |
| mutants | K188-K200 | K201-K207 (kind not checked in one layer, per layer 1..7), K208 (no kind check), K209 (painted sections only), K210, K211 (layer 8 one kind only), K212 (groups swapped), K213, K214 (the node/edge boundary off by one), K215 (wrong error class), K216, K217 (the rule at one call site only), K218, K219 (count partly by painted sections), K220, K221 (a lone unpainted focus marker refused) |

Every rejected stream is **single-fault**: a kind row (R52-R60) is accepted by the reference with only the kind check disabled and is rejected with only the count disabled (the kind check alone rejects it); a count row (R61, R62) is accepted with only the count disabled and rejected with only the kind check disabled; with both disabled every new stream passes every other rule of the strict reader (asserted by `tools/rev6_dl.py`). R63 is accepted. Rows R52-R63 are streams of the list `G01` (the scene and layout cells are G01's, as for R45) derived from the recorded replay by one marker edit each; `calls/R52.calls` ... `calls/R63.calls`, `xr/R63.xr.json`, `json/U21.witness.json` are the files.

The new reference (`tools/rev6_dlref.py`: the strict reader with the kind check, the readout and the witness) first reproduces every existing expected result of the stream rows (R16, R39-R44, R49-R51, U09 (two cases), U17) and the verdicts of R45-R48, U15, U16 (the existing rejected streams are rejected by the count alone and none has a wrong-kind marker); every accepted stream that a row reads (R16, R39-R44, R49-R51, U09, U17) passes the kind check. **Mutant matrix of K201-K221:** the mutants touch the stream reader, the readout and the witness only, so each was run over the new rows and over the existing rows that call them (R16, R39-R51, U09 (two cases), U15-U17); 21 of 21 killed with every named row changing. K213 and K214 (the boundary) are killed by `R16` (and other accepted streams) only: a wrong-kind stream also holds right-kind markers of the same pids, so a boundary fault is rejected anyway on every new row.

**Independence.** Written from design 31 rev 6 (4.1, 4.3, 4.8, 6.2, 6.3, 6.6, 9.1, 9.3) by an oracle author who read only the design files named for the task, the corpus itself and the frozen fixtures, and did not read, import or run any TypeScript or `packages/*`; standard library only. `tools/gen.py` does not know these rows. To rebuild only the additions, restore the corpus from version control and run `python -B -I tools/rev6_dl.py && python -B -I tools/rev6_finish_dl.py` (after the gap review scripts).

**Not covered (recorded in AMBIGUITIES).** R31-05 (a list reader focus rule D13) and R31-06 (where a stream row's list comes from) are open in the design (A-51, A-52); R31-07 to R31-11 and R30-31-01 are gl-only or open. A-53 (the same pid twice or a pid in layers 2 and 6 is overdetermined), A-54 (the reader uses the list for the table only), A-55 (the kind rule is stated fully in 6.6, partly in 9.3), A-56 (the unpainted wrong-kind marker is a reading of "every marker").
