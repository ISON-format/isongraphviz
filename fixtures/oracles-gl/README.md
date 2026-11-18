# IGR-GL/1 oracle corpus (`oracles-gl`)

Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere). Produced against design 31 (`31-CANVAS-WEBGL-DESIGN.md`, **rev 5**, 1,821 lines; first written against rev 2, regenerated against rev 3 and again against rev 5) by an
independent oracle author who was given that design, design 30 rev 4 and design 27 rev 5, `docs/specs/IGS-1.md`, `IGL-1.md`, `docs/conformance/README.md`, the frozen fixtures
(`fixtures/oracles`, `fixtures/oracles-igl`) and, as read-only data, the scenes, layouts, states and expected SVG documents of the draft corpus `fixtures/oracles-svg`
(its `SHA256SUMS` digest `63a198339b40417d1a039058e9e61b5f21fa1a5c887be29decd5c3bef97cccbd` is asserted before anything is generated), plus the formats
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

`EXPECT.tsv`: header `id group tier scene layout input expected error` (13.2), **279 rows**, one per id of design 13.6.

| Family | Rows | Content | Expected files |
|---|---|---|---|
| G | 11 | golden plans | plan/Gnn.glplan (binary, 7.2) |
| B | 21 | buffer encoding, guard rule, plan sections | plan/Bnn.glplan; B08 renderer-level (also list); B10 error |
| H | 6 | the shader set | json/H0n.*.json, shaders/*.glsl |
| W | 38 | the plan reader (bad plans) | bad/Wnn.glplan (error INVALID_INPUT/SCHEMA), bad/FAULTS.tsv |
| X | 9 | readouts | xr/Xnn.xr.json (X07 error) |
| E | 11 | executor call logs against a fake context | gllog/Enn.log (E10, E11: log and error) |
| U | 33 | the WebGL renderer (headless), the context controller | scripts/, plan/, states/, json/, calls/, gllog/ |
| P | 16 | the capability probe | json/Pnn.probe.json + gllog/Pnn.log |
| D | 5 | differential (runtime) | no files (self-checks of the generator, README) |
| K | 129 | mutants | no files (MUTANTS.tsv) |
| **total** | **279** | | |

Rows with empty cells by design: D (5) and K (129); U10 is a kit run with neither file nor expected cell; W01 and the B-row "also" cases are described below. Rows with an `error` cell: B10, W02-W38, X07 (and the two rows E10, E11 that carry both a log and an error, AMBIGUITIES A-06).

| Directory | Content |
|---|---|
| `plan/` | expected plans (binary `igr-gl/1`: header line, element table, label runs, three instance buffers) of rows G, B, X and the plans after each step of U scripts |
| `bad/` | the 37 bad plans W02-W38, `X07.glplan`, `FAULTS.tsv` (the rule each bad plan breaks), `BASE.glplan` (the plan they are made from) |
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
| A.3 display list of G11/loops2 (X1 block) | **REPRODUCED** | bytes equal; size mine 1553 / design 1553; sha mine 3f9f43587a97bdb7... / design 3f9f43587a97bdb7... |
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

* ok: digest of the consumed oracles-svg/SHA256SUMS is 63a19833...cccbd
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
* ok: C-V5 parity: node centres, path numbers and label positions of 54 V5 documents (svg G, N, X, Y rows) equal the list's integers (refused: N11:INVALID_INPUT/OUT_OF_RANGE, N12:INVALID_INPUT/OUT_OF_RANGE)
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

