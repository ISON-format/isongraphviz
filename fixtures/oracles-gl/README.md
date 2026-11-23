# IGR-GL/1 oracle corpus (`oracles-gl`)

Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere). **Revision note, design 31 rev 7 (2026-11-22, ruling R-H):** the label placement LP/1 (design 37 rev 3) moves labels in the display list, so the label runs of 16 expected plans (`B01`-`B06`, `B05b`, `B16`, `B20`, `G05`, `G07`, `G08`, `G10`, `G11`, `X04`, `X09`) were regenerated (73 label runs, only the `x` and `y` of `T` lines, proved by `tools/labelmove_check.py`); five mutants K173-K177 were appended; no other expected byte, row, id or input changed (last section, AMBIGUITIES A-53 to A-57). **Revision note, design 31 rev 6 (2026-11-20):** the design was folded with the owner-adopted wording R31-07..R31-11 (text only, no Appendix byte, no shader byte); 30 rows were **appended** (B24, W48-W50, X19, X20, U50-U57, K157-K172, the last section), no existing row, id, expected file or mutant was touched, and the entries A-47 to A-52 and a resolved-in-rev-6 section were appended to `AMBIGUITIES.md`. Produced against design 31 (`31-CANVAS-WEBGL-DESIGN.md`, **rev 5**, 1,821 lines; first written against rev 2, regenerated against rev 3 and again against rev 5) by an
independent oracle author who was given that design, design 30 rev 4 and design 27 rev 5, `docs/specs/IGS-1.md`, `IGL-1.md`, `docs/conformance/README.md`, the frozen fixtures
(`fixtures/oracles`, `fixtures/oracles-igl`) and, as read-only data, the scenes, layouts, states and expected SVG documents of the draft corpus `fixtures/oracles-svg`
(before anything is generated the generator asserts that the 100 lines of its `SHA256SUMS` that cover the data it reads, `scenes/`, `layouts/` and `states/`, are the ones pinned in `tools/svg_data_pins.txt`; the whole digest was `63a198339b40417d1a039058e9e61b5f21fa1a5c887be29decd5c3bef97cccbd` before the label placement LP/1, ruling R-H, and the expected `svg/` documents are no longer pinned: `tools/parity_svg.py` compares them with this list), plus the formats
(README, EXPECT.tsv, SHA256SUMS, generated/GENERATED.tsv) of the other draft corpora. Read `AMBIGUITIES.md` before judging any mismatch: it lists every place where the design was
ambiguous, contradictory or could not be built, the literal reading used, and why; design defects are flagged.

## Independence statement

* Every expected byte comes from the Python code in `tools/` (standard library only: `hashlib`, `json`, `struct`, `math`, `fractions`, `re`).
  The author re-implemented from the written rules: model derivation and effective visibility, `initialState` and the reducer subset the rows use, the display-list builder
  (design 31 section 4 with the geometry of design 30 sections 3, 6, 7), the Canvas replay and its recorded stream (needed for the three-way readout row and the Appendix A.4 gate), the plan with its guard rule
  and exact integer clipping, the strict plan reader with the rules G1-G16, the readouts, the executor call log, the context controller, the capability probe, the renderer manifest and a lifecycle simulation, and the 129 switchable mutants.
* The author did **not** read, import, copy or run any TypeScript, `packages/*/src`, any `display-list`, `renderer-canvas`, `renderer-webgl` or `cross-check` directory, any review or author-notes file, the
  tool code of any other corpus (in particular nothing under `fixtures/oracles-svg/tools/`), or anything under `fixtures/oracles-dl/` (the display-list/Canvas corpus written at the same time by another author).
  Consequently the scenes, layouts and states that design 31 13.4 says are reused from `oracles-dl` by relative path are **authored here** (`scenes/`, `layouts/`, `states/`), and the expected display lists
  are re-derived, not re-read (AMBIGUITIES A-03).
* Shared assumption: oracle and code implement the same written rules. The corpus proves that code matches the text as read in `AMBIGUITIES.md`. Third-party verification (`verifyScene`, `verifyLayout`, `bindLayout` over every file of
  `scenes/` and `layouts/`, `parseState` over every file of `states/` that is a state of an authored scene) is still required (design 13.1); the generator applied only a **lite** checker (canonical re-serialization, ordering, binding hash).

## What is here

`EXPECT.tsv`: header `id group tier scene layout input expected error` (13.2), **371 rows** (the 279 rows, one per id of design 13.6, the 57 gap rows after rev 5, the 30 rows after rev 6 and the 5 mutants after rev 7, see the last three sections).

| Family | Rows | Content | Expected files |
|---|---|---|---|
| G | 11 | golden plans | plan/Gnn.glplan (binary, 7.2) |
| B | 24 | buffer encoding, guard rule, plan sections | plan/Bnn.glplan; B08 renderer-level (also list); B10 error |
| H | 6 | the shader set | json/H0n.*.json, shaders/*.glsl |
| W | 50 | the plan reader (bad plans; W47 and W50 accept) | bad/Wnn.glplan (error INVALID_INPUT/SCHEMA), bad/FAULTS.tsv |
| X | 20 | readouts | xr/Xnn.xr.json (X07 error) |
| E | 11 | executor call logs against a fake context | gllog/Enn.log (E10, E11: log and error) |
| U | 51 | the WebGL renderer (headless), the context controller | scripts/, plan/, states/, json/, calls/, gllog/ |
| P | 16 | the capability probe | json/Pnn.probe.json + gllog/Pnn.log |
| D | 5 | differential (runtime) | no files (self-checks of the generator, README) |
| K | 177 | mutants | no files (MUTANTS.tsv) |
| **total** | **371** | | |

Rows with empty cells by design: D (5) and K (177); U10 is a kit run with neither file nor expected cell; W01 and the B-row "also" cases are described below. Rows with an `error` cell: B10, W02-W46, W48, W49, X07 (and the two rows E10, E11 that carry both a log and an error, AMBIGUITIES A-06).

| Directory | Content |
|---|---|
| `plan/` | expected plans (binary `igr-gl/1`: header line, element table, label runs, three instance buffers) of rows G, B, X and the plans after each step of U scripts |
| `bad/` | the 47 bad plans W02-W46, W48, W49, `X07.glplan`, `FAULTS.tsv` (the rule each bad plan breaks), `BASE.glplan` (the plan they are made from) |
| `gllog/` | executor call logs (E), controller logs (U20-U39), probe call logs (P): one canonical JSON line per effect, LF-terminated |
| `calls/` | recorded Canvas streams: `X05.calls` (the Canvas stream of O1, all layers), `U13.calls` (the WebGL text layer, layer 8) |
| `xr/` | readouts `igr-xr/1`: canonical JSON plus one LF |
| `json/` | shader set bytes and digests (H), probe results (P), manifests, witnesses and outcome files (U), B08 outcome files |
| `shaders/` | the six shader sources (`arrow|disc|edge`.`vs|fs`.glsl, exact bytes) and `SHADER_SET_SHA256` |
| `scenes/ layouts/ states/` | authored IGS/1 scenes, `igl-fixed/1` layouts and IGR/1 states (canonical bytes, no trailing LF) |
| `scripts/` | lifecycle scripts of the U01-U08 rows with their expectations filled in (generator outputs; ordinary JSON, sorted keys, indent 1) |
| `inputs/` | the numbers of the four searches (B01, B11, B12, B21) |
| `generated/GENERATED.tsv` | header only: no gl: row needs an oversize input (nothing is generated and not stored) |
| `MUTANTS.tsv`, `APPENDIX-A.tsv` | the mutant matrix and the Appendix A reproduction table (generated, covered by `SHA256SUMS`) |
| `tools/` | the generator (not in `SHA256SUMS`) |

`SHA256SUMS`: one line `<sha256> *<path>` per file, sorted by byte order of the path, covering every file except `tools/` and itself.

## Regenerate

```text
python tools/gl.py                  # rewrites every generated file in place (the whole mutant matrix is included: about half a minute)
python tools/gl.py --out DIR        # the same into DIR (used for the byte-identity proof: two runs, different PYTHONHASHSEED, diff -r)
python tools/gl.py --no-matrix      # skip the mutant matrix (MUTANTS.tsv is then not written)
python tools/gl.py --mutant K12     # run one mutant over every row and list the rows that change
python tools/gl.py --check-appendix # print the Appendix A reproduction table only
```

Python 3.12, standard library only, no network, no clock, no environment input. The only randomness is the 32-bit LCG of IGL/1 7.1 with fixed seeds (runtime tier D self-checks). The generator reads the design file
(`31-CANVAS-WEBGL-DESIGN.md` under `docs/`) to extract the Appendix A blocks (rules X1, X2) and the mutant table, and fails loudly if the file is missing, contains a CR, or a block disagrees.

## Tiers

`core`: a function on bytes (planner, reader, readout, executor log against a fake, probe against a fake). `both`: the function and the subject renderer (`planBytes()` equals the file). `subject`: lifecycle, renderer and controller rows. D rows are `subject`; K rows have an empty tier.

## Row inputs (the grammar of 13.2 and what this author had to add)

* **G, B** (plan rows) `{"size":{"height":H,"width":W},"state":"initial"|"<path>"}`; B09 and B10 add `"limits":{"maxBytes":n}`; B01, B11, B12, B21 add `"search":"inputs/....json"`; **B05** and **B08** list a second case under `"also"` (A-02, A-25); the third case of B08 is at list/plan level, key `{"list":{"maxDrawnLabelUnits":0}}` (A-41).
* **W** a path under `bad/` (expected empty, `error` `INVALID_INPUT/SCHEMA`); **W01** inline `{"files":["plan/G01.glplan",...]}`: the reader accepts each and re-serializes it to itself.
* **X** `{"from":"gl","plan":"<path>"}` (the readout of the plan alone); X05 `{"from":"three-way","svg":...,"calls":...,"plan":...}`; X07 `{"from":"gl","lenient":true,"plan":"bad/X07.glplan"}` (A-13).
* **E** `{"size","state","frame":{"widthPx","heightPx","ink"},"scenario":"create|frame|dispose|fail-compile:<program>.<stage>|fail-link:<program>"}`; E10 and E11 also carry `info_log` and `expect_detail` (the closed token, a colon and at most 120 characters of the log, 11.3).
* **U controller rows** `{"events":[{"op":"init|L|R|C|F|D","fail":"compile|link|lost"?,"plan":"<path>"?}],"expect_status":[...],"expect_log":"gllog/Unn.log"}`; U37 lists four cases with a probe fake each.
* **P** `{"fake":FAKE,"need":{...}?,"options":{...}?,"expect_log":"gllog/Pnn.log"}`; `expected` is the canonical probe result (A-07).
* **U01-U08** a script path (the schema of 27 13.3a with the ops of 13.2 plus `create`, `plan`, `planBytes`, `probe`); `expect` is `ok` or `CODE/REASON`, `expect_plan` a plan file, `expect_state` a state file.

* **File endings (13.2, rev 3).** Logs, streams and readouts: canonical text plus one LF. `json/H01.set.json` (4490 bytes), `json/U06.*.manifest.json` and `json/U09.*.witness.json`: IGR-CJ/1, no final LF. Every other `json/` file (probe results, H02-H06, outcome files), the scripts and `inputs/*.json`: ordinary JSON, indent 1, sorted keys, plus one LF (A-34). States, scenes, layouts: no final LF.

## Shared geometry convention of the authored scenes

Every authored layout is read under the viewport `{center_x 450000, center_y 300000, zoom 1000, 900 x 600}`: then a layout value in thousandths **is** the screen coordinate in milli-pixels, so a row can say "a node at m-px (1178000, 300000)" and the layout holds exactly those numbers. The state files of the authored scenes carry that viewport.

## Appendix A reproduction (design 31)

| Item | Result | Detail |
|---|---|---|
| A.1 display list of G01 (X1 block) | **REPRODUCED** | bytes equal; size mine 637 / design 637; sha mine 62e9d45ed682602b... / design 62e9d45ed682602b... |
| A.2 display list differs from A.1 in exactly the three printed lines | **REPRODUCED** |  |
| A.2 display list size and SHA-256 (figure) | **REPRODUCED** | size mine 637 / design 637; sha mine 48c82389e35751c8... / design 48c82389e35751c8... |
| A.3 display list of G11/loops2 (X1 block) | **REPRODUCED** | bytes equal; size mine 1553 / design 1553; sha mine 6ff8514097243394... / design 6ff8514097243394... |
| A.4 Canvas stream of G01 (X1 block) | **REPRODUCED** | bytes equal; size mine 1042 / design 1042; sha mine 7ec2e46cf221854f... / design 7ec2e46cf221854f... |
| A.4 Canvas stream of the A.2 state (figure, row C02) | **REPRODUCED** | size mine 1455 / design 1455; sha mine 6cbb962e795d2979... / design 6cbb962e795d2979... |
| A.5 prefix block (X1: 836 bytes) | **REPRODUCED** | bytes equal; size mine 836 / design 836; sha mine c5d81633112a6003... / design c5d81633112a6003... |
| A.5 composite: prefix + unhexed hex lines equals the plan of G01 (X2) | **REPRODUCED** | bytes equal; size mine 936 / design 936; sha mine b637d7b00e638ae3... / design b637d7b00e638ae3... |
| A.5 plan of the A.2 state (figure, row G06) | **REPRODUCED** | size mine 1155 / design 1155; sha mine 6cde050d2fa3c021... / design 6cde050d2fa3c021... |
| A.5 header line of the A.2 plan is 718 bytes with its LF; sizes edge 80, disc 64, arrow 28 | **REPRODUCED** |  |
| A.5.1 resource creation log (E01, X1 block) | **REPRODUCED** | bytes equal; size mine 2327 / design 2327; sha mine 2126facde38e4a1c... / design 2126facde38e4a1c... |
| A.5.1 the creation log has 64 lines | **REPRODUCED** |  |
| A.5.1 frame of G01 (E02, X1 block) | **REPRODUCED** | bytes equal; size mine 2080 / design 2080; sha mine bf76df948456e1c0... / design bf76df948456e1c0... |
| A.5.2 float32 bytes of 16777215, 16777216, 16777217, 16777219 and 0 (informational) | **REPRODUCED** |  |
| A.5.3 dispose log (E09, X1 block) | **REPRODUCED** | bytes equal; size mine 291 / design 291; sha mine 103f5c0bb2c0bef9... / design 103f5c0bb2c0bef9... |
| A.5.3 compile failure of disc.fs (E10, X1 block) | **REPRODUCED** | bytes equal; size mine 1229 / design 1229; sha mine bd32157387d57ac7... / design bd32157387d57ac7... |
| A.6 pick buffer of G01 (X1 block) | **REPRODUCED** | bytes equal; size mine 104 / design 104; sha mine abf25857a74454be... / design abf25857a74454be... |
| A.6 element bounds of G01 (X1 block) | **REPRODUCED** | bytes equal; size mine 105 / design 105; sha mine ca1fd785221a3733... / design ca1fd785221a3733... |
| A.6 the 17-point polyline of the first loop of G11 (5.1 flatten) | **REPRODUCED** |  |
| A.7 readout of G01 from the plan alone (X1 block) | **REPRODUCED** | bytes equal; size mine 975 / design 975; sha mine 127ffa680c360cc4... / design 127ffa680c360cc4... |
| A.7 the readout from the list, from the Canvas stream and from the plan are the same bytes | **REPRODUCED** |  |
| A.8 shaderSetBytes() is 4490 bytes | **REPRODUCED** | mine 4490 |
| A.8 SHADER_SET_SHA256 = eaf76017c4e6... | **REPRODUCED** | mine eaf76017c4e62f6a445e9b550ace6301d75ea22143f27e9c66d9e97a631e6968 / design eaf76017c4e62f6a445e9b550ace6301d75ea22143f27e9c66d9e97a631e6968 |
| A.8 the six sources (sizes and SHA-256) equal the quoted ones | **REPRODUCED** |  |
| Appendix B: the six sources equal the blocks extracted from the design (X1) and their quoted byte counts | **REPRODUCED** |  |
| A.9 list sizes under the label options (548, 605, 637, 605, 605, 548) | **REPRODUCED** | {'labels: false': 548, 'edgeLabels: false': 605, 'maxDrawnLabelUnits: 9': 637, 'maxDrawnLabelUnits: 8': 605, 'maxDrawnLabelUnits: 4': 605, 'maxDrawnLa |
| A.9 state Y07 list is 319 bytes (ND 1, ED 0, D 1) | **REPRODUCED** |  |
| A.10 plan header of the far-edge list (quoted header text equals this oracle's header) | **REPRODUCED** |  |
| A.10 the single kind-0 instance (-256000, 566635) -> (1156000, 566823) | **REPRODUCED** | mine [([-256000, 566635, 0, 0, 0, 0, 1156000, 566823], 3, 0, 2, 0)] |
| A.10 cn = [[1,1],[2,0]]; the arrow triangle is outside the guard box and omitted; d stays 1 | **REPRODUCED** |  |
| A.10 d = (3000000001, 400003); t0 = 1999744000/3000000001, t1 = 2001156000/3000000001; entry y 566634.5329884551..., exit y 566822.801067059... | **REPRODUCED** | entry 566634.5329884551 exit 566822.801067059 |
| A.10 divRound gives 566635 where a floorDiv gives 566634 (the K85 separation) | **REPRODUCED** |  |
| A.11 device sizes (1333 -> 1200x800; per-side cap; area cap 500; 250) | **REPRODUCED** |  |

**`SHADER_SET_SHA256`**: the generator computes the SHA-256 of the canonical JSON of the six sources (4490 bytes, no trailing LF) and compares it with the design's `eaf76017c4e62f6a445e9b550ace6301d75ea22143f27e9c66d9e97a631e6968`: see the rows above; the six sources and the digest are recorded in `shaders/` and `json/H0*`.

## Mutants

The 129 GL mutants of design 13.5 are switchable variants inside the Python reference (`--mutant Knn`; `tools/mut.py` and the `mut.on(...)` calls). For each, every row is computed again and compared with the baseline; the named killer rows must change.
**129 of 129 killed by at least one named row; 0 unkillable; 0 changed only rows other than the named ones; 0 killed but with at least one named row that does not kill (design defects):**


The full matrix is `MUTANTS.tsv` (columns mutant, description, named killers, killing rows, named rows that do not kill, other changed rows, verdict).

## Self-checks the generator makes (all must pass before a file is written)

* ok: tools/svg_data_pins.txt digest is 1eaf761a...aa91
* ok: the 100 pinned oracles-svg data lines (scenes, layouts, states) are all in its SHA256SUMS
* ok: external files read are verified against their own SHA256SUMS
* ok: 24 authored scene/layout files pass the lite checks
* ok: G01 readout from the plan equals the readout from the list
* ok: G02 readout from the plan equals the readout from the list
* ok: G03 readout from the plan equals the readout from the list
* ok: G04 readout from the plan equals the readout from the list
* ok: G05 readout from the plan equals the readout from the list
* ok: G06 readout from the plan equals the readout from the list
* ok: G07 readout from the plan equals the readout from the list
* ok: G08 readout from the plan equals the readout from the list
* ok: G09 readout from the plan equals the readout from the list
* ok: G10 readout from the plan equals the readout from the list
* ok: G11 readout from the plan equals the readout from the list
* ok: B01 an edge with largest coordinate 16777215 is kept (kind 1) and one with 16777216 is clipped (kind 0)
* ok: B11 has a clipped coordinate with fraction >= 1/2 (floorDiv would differ)
* ok: B12 has a clipped coordinate with fraction >= 1/2 (floorDiv would differ)
* ok: B14 has a clipped coordinate with fraction >= 1/2 (floorDiv would differ)
* ok: B12 each member of the pair is a chain of kind-0 instances
* ok: B13 the edge is omitted and listed in ce with its flags
* ok: B14 a selected node outside is listed in cn with flags 1
* ok: B15 the visible part of the edge is drawn, its arrow omitted, d stays 1
* ok: B16 a centre at exactly GB + 22000 is emitted and one m-px more is omitted
* ok: B17 the table and T lines of the plan equal the n, e, T lines of the list
* ok: B18 axis-parallel edge outside by 0 < gap <= 12000, box meets GB, clip rejects it (p = 0, q < 0)
* ok: B19 an edge box expanded by 12000 touching GB is emitted, one m-px less is omitted and listed
* ok: B20 coincident nodes: box expanded by 6000 misses GB, by 12000 meets it, arrow base inside GB; edge and arrow both emitted
* ok: B21 the polyline is clipped away entirely (t0 > t1), its arrow meets GB, the edge is in ce and no arrow is emitted
* ok: 7.6 (failed, R) with a second usable failure: phase failed, onError once, new failure token, no onStatus
* ok: 7.6 (failed, R) lost again: phase lost, failure cleared, onStatus, no cleanup after the stop
* ok: 7.6 dispose in created with a lost context obtained: no getExtension, no loseContext
* ok: 7.6 dispose in created after a failed initialize with a usable context: loseContext
* ok: 7.2 G12: ... and accepted when only G12 is disabled (single fault)
* ok: 6.5 a renderer with dl.maxDrawnLabelUnits 0 is refused (INVALID_INPUT/OUT_OF_RANGE); the list builder and planGl accept 0
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout
* ok: D02 every plan number has |v| < 2^24
* ok: D03 buffers do not depend on the label options {'labels': False}
* ok: D03 buffers do not depend on the label options {'edge_labels': False}
* ok: D03 buffers do not depend on the label options {'max_units': 3}
* ok: D04 the instance count of every draw equals the plan's
* ok: D04 layer-3 pids plus ce are exactly the drawn edges
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clipped end points lie in the guard box (+-1 m-px)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 clip result exists iff the exact clip is non-empty (or a single rounded point)
* ok: D05 no point of the exact clipped geometry is farther than 1 m-px from the integer clipped segment (worst 0.495 over 196 points)
* ok: D01 cases 480, D02 cases 480, D03 cases 480, D04 cases 480, D05 points 196
* ok: the single-fault property of every bad plan W02-W38 (rejected by the named rule only; accepted when only that rule is disabled), the strict reader's round trip of every plan file, every plan number below 2^24 (per file)

## What is not claimed

The shader sources were compiled once, by the author, in headless Chromium (see the hand-over) and not elsewhere; nothing here claims pixels, GPU behaviour, real context loss, other drivers or browsers. The runtime D rows have no frozen bytes. The controller, probe and lifecycle rows run on fakes and on a simulation whose every choice is recorded in `AMBIGUITIES.md`.

## Additions after the rev 5 gap review (single-focus clause of G12; the controller outcomes; rows B22-B23, W39-W47, X10-X18, U40-U49, K130-K156)

The ledger notes `gl A-39` (single focus) and `gl A-40` (controller outcomes) recorded that rev 5 added rules for which no row exists (AMBIGUITIES A-39, A-40: "asserted by the generator, not by rows"). These 57 rows were **appended** (new ids; no existing expected byte or row changed; the only existing files that differ are `EXPECT.tsv`, `MUTANTS.tsv` and `bad/FAULTS.tsv` (appended lines), `AMBIGUITIES.md` (appended A-42 to A-46 and the entry count), this README (counts and this section) and `SHA256SUMS`).

| Rows | What | Files |
|---|---|---|
| W39-W46 | plans with more than one focused element, each rejected by **G12 only** (the reference reader reports exactly `G12`): layer-2 edge plus layer-6 node (W39), two layer-2 pids (W40), two layer-6 pids (W41), the layer-2 focus plus a `cn` entry with flags 2 (W42), plus a `ce` entry with flags 3 (W43), two `cn` entries with the focus bit and no drawn focus (W44), a layer-6 node plus a `cn` entry (W45), a `cn` and a `ce` entry (W46) | `bad/W39.glplan` ... `bad/W46.glplan`, `bad/FAULTS.tsv` |
| W47 | the reader accepts: `bad/BASE.glplan`, a focused clipped edge (two instances of one pid), one omitted focused node, a drawn node focus with selected omitted entries, one omitted focused edge | `plan/W47.b.glplan` ... `plan/W47.e.glplan` |
| B22, B23 | a focused node / edge that the guard rule omits: the flags in `cn`/`ce` carry the focus bit (`also` cases: selected and focused) | `states/B22*.state.json`, `states/B23*.state.json`, `plan/B22*.glplan`, `plan/B23*.glplan` |
| X10-X13 | the readout of those four plans: the focus from the omitted entry's flags | `xr/X10.xr.json` ... `xr/X13.xr.json` |
| X14-X18 | the readout of the accepted plans of W47 (the harness runs the `files` form of a W row for W01 only, so the acceptance is also pinned through the strict reader of an X row): focus edge of a clipped chain (X14), omitted node (X15), drawn node with selected omitted entries (X16), omitted edge (X17), `bad/BASE.glplan` (X18) | `xr/X14.xr.json` ... `xr/X18.xr.json` |
| U40 | `(failed, R)` with the context **lost again**: phase `lost`, `failure` cleared, `onStatus`, no cleanup calls, a later R succeeds | `gllog/U40.log` |
| U41 | `(failed, R)` with a **second usable failure** (new token): phase stays `failed`, `onError` once, new `failure`, no `onStatus`; dispose releases | `gllog/U41.log` |
| U42, U43 | the **release rule** in `created` after a failed initialize: a lost context is not released (U42), a restored one is (U43) | `gllog/U42.log`, `gllog/U43.log` |
| U44-U49 | table cells without a row: `created` with R, C, F and no context (U44); a plan retained before `initialize` is drawn by it, `ready` F (U45); a restore with no retained plan draws nothing (U46); `failed` with C and F, then lost, then the latest plan on restore (U47); `init` in `lost` and `failed` is ignored (U48); `disposed` absorbs every event (U49) | `gllog/U44.log` ... `gllog/U49.log` |
| K130-K156 | 27 mutants (reader clause variants, readout, guard flags, controller outcomes); all killed by the named rows (MUTANTS.tsv) | |

**Independence of these rows.** Written from design 31 rev 5 (7.2 with G1-G16, 7.4, 7.5, 7.6, 9.1, 9.3, Appendix A.5.1) by a separate oracle author who did not read, import or run any TypeScript or `packages/*/src` and did not read the generator of this corpus; the reference logic is `tools/gap_glref.py` (plan structure and strict reader G1-G16, readout from the plan, executor log, controller reducer with its fake) and `tools/gap_gl.py`, `tools/gap_finish_gl.py` (standard library only). Before writing anything the reference is checked against the existing corpus: it accepts every `plan/*.glplan`, reproduces the violated rule of each of W02-W38, the readouts X01-X04, X06, X08, X09 and the logs and `status()` sequences of the 19 existing controller rows U20-U36, U38, U39 byte for byte. `tools/gen.py` does not know these rows: running it removes them. To rebuild only the additions, restore the corpus from version control and run `python -B -I tools/gap_gl.py && python -B -I tools/gap_finish_gl.py`.

**Mutant matrix of K130-K156.** The mutants touch the G12 clause, the readout, the guard flags and the controller only, so each was run over the new rows and over every existing row that calls those functions (W01-W38, X01-X09, U20-U39 except U37, B14 and B13 by derivation); the other existing rows cannot change. Result: 27 of 27 killed with every named row changing. Rows that change although not named: K134 also changes X13-X15 and X17 (selected omitted entries); K138 the existing X06 and the new X14-X18; K142 the existing U28; K148 the new U41 and the existing U34; K153 the existing U36 (these existing rows already pinned those behaviours; no existing row pinned the focus clause or the three controller outcomes).

**Not covered (recorded in AMBIGUITIES).** A-44 (a loss during the failed creation), A-46 (a second initialize after a failure, events after dispose, two foci read leniently), A-45 (the existing U rows do not follow the 13.2 sentence about an error cell).

## Additions after design 31 rev 6 (R31-07, R31-09, R31-11 (a) and (b); rows B24, W48-W50, X19-X20, U50-U57, K157-K172)

Design 31 rev 6 folded owner-adopted wording into 7.2 G12, 7.5, 7.6 and 13.2. The rules and the rows that fail when a rule is violated:

| Rule | What it says | Rows that carry it |
|---|---|---|
| R31-07 (G12) | the focused pids of a plan number at most one **distinct** pid; a clipped focused edge repeats its pid (G11) and the repeat is not a second focus | existing: `W39`-`W46` (more than one distinct focus refused), `W47` and `X14` (a clipped focused edge accepted), mutants `K130`-`K136`; **new:** `B24` (planner output: a focused edge of two clipped segments, `also` selected and focused), `W48` (a clipped focused edge plus a second distinct focus: refused by G12 only), `W49` (two focused clipped edges: refused by G12 only), `W50` (the reader accepts the planner output of `B24`), `X19`, `X20` (the readout reports the one focus), mutants `K157`-`K159` |
| R31-08 | a loss event in `created` is ignored (no effect line, status unchanged, `contextLost` true); the release rule's "not lost" is the context's own `isContextLost()` | existing and verified, no new row: `U42`, `U43`, mutants `K147`-`K149`; new mutants `K170`-`K172` also differ on them |
| R31-09 | a loss during creation: detail `CONTEXT_LOST` with no driver text, `getShaderInfoLog` not called | **new:** `U50` (the log stops after `getShaderParameter arrow.vs`, `onError` and `reject` `CONTEXT_LOST`, no info-log call, no cleanup), `U51` (then dispose: no release), `U52` (then restore and a second initialize), mutants `K160`-`K164` |
| R31-10 | 13.2: a controller row with a failed initialize has an empty `error` cell and the log as expected file; `info_log` / `expect_detail` only for `E10`, `E11` | existing and verified by script, no new row: `U25`, `U27`, `U31`, `U34`, `U36`, `U39` (and `E10`, `E11` carry both) |
| R31-11 (a) | a second `initialize` in `created` after a failed one adds no listener again | **new:** `U52`, `U53` (two failed initializes, then a successful one, then dispose: two `addEventListener` lines in all, two `removeEventListener`), mutants `K165`, `K166` |
| R31-11 (b) | after `dispose`, `L` and `R` are ignored and `status().contextLost` continues to report the context's own `isContextLost()` | **new:** `U54` (after dispose in `ready`), `U55` (in `lost`), `U56` (in `created`), `U57` (in `failed`): no line for the events, `contextLost` true after a loss and false after a restore (reading A-47), mutants `K167`-`K170` |

Not written, by the task's own limits: R31-05, R31-06, R31-11 (c), R30-31-01 (open in the design); the items of rev 6 that belong to the display-list corpus. Open points found while writing the rows: AMBIGUITIES A-48 to A-52 (no row).

**What was added.** `B24` (a real planner output of the existing scene `far-pair`, so the plan comes from this corpus's own planner; the B12 plan is reproduced byte for byte first), `states/B24.state.json`, `states/B24b.state.json`, `plan/B24.glplan`, `plan/B24b.glplan`, `bad/W48.glplan`, `bad/W49.glplan`, `bad/FAULTS-rev6.tsv` (the rule of each new bad plan; `bad/FAULTS.tsv` is not touched), `xr/X19.xr.json`, `xr/X20.xr.json`, `gllog/U50.log` ... `gllog/U57.log`; 17 new files, 30 new ids; the only existing files that differ are `EXPECT.tsv`, `MUTANTS.tsv`, `AMBIGUITIES.md` (appended lines only), this README and `SHA256SUMS`. No existing expected file is regenerated.

**Rows.** `B24` is tier `both` (`planBytes()` equals the file, the `also` case is the selected and focused variant); `W48`, `W49` are single-fault bad plans (the reference reader reports exactly `G12`, and a second, older reader of this corpus rejects them with `INVALID_INPUT/SCHEMA` and accepts them with only G12 disabled); `W50` is the `files` form (AMBIGUITIES A-43 records that the V7 harness dispatches the `files` form for `W01` only, so the acceptance is also pinned through the strict reader by the X rows `X19`, `X20`, as for `W47`/`X14`); the controller rows use the existing format (13.2: `events`, `expect_status`, `expect_log`, an empty `error` cell, fake conventions of 7.6) and the plan `plan/G01.glplan`.

**Independence.** Written from design 31 rev 6 (7.2 G11/G12, 7.5, 7.6 with the controller conventions, 13.2) by the same oracle author, who did not read, import or run any TypeScript or anything under `packages/`, and did not read another corpus's tools or expected files. The reference is `tools/rev6_ref.py` (the controller of rev 6 on top of `tools/gap_glref.py`) and `tools/rev6_gen.py`, `tools/rev6_finish.py` (not in `SHA256SUMS`; run `python -B -I tools/rev6_gen.py && python -B -I tools/rev6_finish.py` on a corpus without these rows; the old generator `tools/gl.py` does not know them and would remove them). Before anything is written the reference is checked against the existing corpus: it reproduces the logs and `status()` sequences of the 29 existing controller rows (U20-U36, U38-U49) byte for byte, the planner reproduces `plan/B12.glplan`, the existing readouts and the verdict of every existing bad plan are unchanged. The unchanged original generator was also run into a scratch directory (`python -B -I tools/gl.py --out DIR`): its 252 files and 279 rows equal the corpus files byte for byte except the index files and `bad/FAULTS.tsv`, so the rev 6 text did not change a byte of the first 279 rows.

**Mutant matrix of K157-K172.** 16 of 16 killed, every named row changing (computed by `tools/rev6_gen.py`, the matrix is in `MUTANTS.tsv`). Each mutant was run over the new rows and over every existing row it can reach (all bad plans, all readouts of plans, the planner outputs of the G and B rows, the 29 existing controller rows). Rows that change although not named: `K159` also changes the existing `X14` (the readout of the clipped focused edge of `W47.b`); `K170` also changes `U33`, `U50`-`U52`, `U55`-`U57`. No mutant changes an existing row of another kind. `K158` changes no existing planner row: no existing row has a focused clipped edge, which is why `B24` was needed.

**Digest.** The digest of the new `SHA256SUMS` cannot be recorded in this file (the README is one of the files it covers); it is given in the hand-over. For reference, the digest of `SHA256SUMS` before these additions was `b87ff2918a63f2acec56674b0b45b375f572ed8649340ca3bd7874d6a4084c5e`.

## Additions after design 31 rev 7 (label placement LP/1, ruling R-H of 2026-11-22; mutants K173-K177)

The owner decided that label overlaps are fixed in the real renderer code with a new default placement (design `37-LABEL-PLACEMENT-DESIGN.md`, LP/1 rev 3) and that the expected label-position bytes of the DRAFT corpora are regenerated (an explicit exception to the ledger rule R-C that covers only label positions). The display list builder of this corpus (`tools/dlist.py`) now applies LP/1 by calling the reference `place_labels` of `fixtures/oracles-lp/tools/lp.py` (read by path, digest pinned: A-53); the plan copies the `T` records into its label runs unchanged.

| What | Result |
|---|---|
| Expected files that changed | 16 plans, `plan/B01 B02 B03 B04 B05 B05b B06 B16 B20 G05 G07 G08 G10 G11 X04 X09.glplan`; 73 label runs (the label lines of the plans), only the `x` and `y` of `T` lines |
| Expected files that did not change | 286 of the 308 files are byte-identical (the 16 plans and 5 index files differ, and `SHA256SUMS`): every `bad/`, `calls/`, `gllog/`, `json/`, `shaders/`, `xr/`, `scripts/`, `inputs/`, `scenes/`, `layouts/`, `states/` file; the readouts, logs and manifests carry no label position |
| Appendix A | A.3 only: the quoted SHA-256 of the display list of `G11`/`loops2` is `6ff8514097243394205a11f23e3250c607ddca3b4c39f603916e436dbd3a8ef0` (bytes of the design's block equal this oracle's list) |
| Rows, ids, inputs, file paths | unchanged; 5 mutant rows K173-K177 appended (EXPECT.tsv 371 rows) |
| Mutants K173-K177 | 5 of 5 killed by the regenerated plans (MUTANTS.tsv); each is also a text patch of `packages/renderer-webgl/src/plan.ts` in the harness |
| Gate | the oracles-svg gate is the 100 pinned scenes, layouts and states lines (`tools/svg_data_pins.txt`), A-54 |
| Independent confirmation | `tools/parity_svg.py` compares the list's `T` integers with the `<text>` positions of the LP/1 SVG documents of `oracles-svg` (run last, against whatever state that corpus is in); the bytes of design 31 A.3 equal this oracle's list |

**Proof that nothing else changed.** `python -B -I tools/labelmove_check.py` (run from the repository: the old side is `git show HEAD:fixtures/oracles-gl/<path>`; `--old-dir DIR` reads a copy of the old corpus instead) masks the `x` and `y` of every `T` line of a `.glplan` file on both sides, requires the masked files to be byte-identical (this also covers the header, which carries the buffer sizes), requires every other file to be byte-identical or an append-only / index file, and lists the labels moved. Regenerate the whole corpus with `python -B -I tools/regen_all.py OUTDIR`.
