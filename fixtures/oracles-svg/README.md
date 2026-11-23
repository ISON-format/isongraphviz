# IGR-SVG/1 oracle corpus (`oracles-svg`)

Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere). Produced against design 30 (`30-SVG-RENDERER-DESIGN.md`,
**rev 3**; first written against rev 2, regenerated against rev 3) by an oracle author who was given only that design, `27-IGR1-DESIGN.md` (rev 5), `IGS-1.md`, `IGL-1.md`,
`docs/conformance/README.md` and the frozen fixtures (`fixtures/oracles`, `fixtures/oracles-igl`), plus the **format and layout
conventions** (README, `EXPECT.tsv`, `SHA256SUMS`, `generated/GENERATED.tsv`) of the draft corpora `oracles-igr`, `-lod`, `-stable`.
**R-H revision (2026-11-22, design 30 rev 5 and design 37 `LP/1` **rev 3**, width 9 px per UTF-16 unit; first generated against rev 2, 7 px, and regenerated).** By an explicit owner ruling (R-H, an exception to the ledger rule R-C that covers only the label-position content) the expected bytes were regenerated for the new label placement: the writer of `tools/svg.py` calls the independent LP/1 reference `fixtures/oracles-lp/tools/lp.py` once per document. **Only label positions changed**: 26 of the 79 documents differ from the previous revision in the `x` and `y` attributes of `<text class="igr-label|igr-elabel">` elements and nowhere else (278 labels moved), `json/T14.readouts.json` differs only in the `readout_sha256` of 24 entries, and every other expected file is byte-identical; `tools/labelmove_check.py` proves this against `git show HEAD:`. The 249 old `EXPECT.tsv` rows and ids are unchanged. **Appended (R-C, new ids): family `L`, rows `L01`-`L04`** (four authored scenes `lp-*`, four state files, four documents), listed after the `K` rows, that give the placement integration the collisions the old rows lack; `MUTANTS.tsv` gained K115-K126 (the placement integration; they have no `K` row in `EXPECT.tsv`). Every old file, `T14.readouts.json` included, is unaffected by `L01`-`L04` (family `L` is not in the T14 list).
Read `AMBIGUITIES.md` before judging any mismatch: it lists 62 places where the design was ambiguous, contradictory or
could not be built (A-01 to A-07 are defects of the design of rev 2; A-54 to A-61 are new findings against rev 3), the reading used, why, and for every old entry whether rev 3 resolved it and whether the reading matched.

## Independence statement

* Every expected byte comes from the Python code in `tools/` (standard library only: `hashlib`, `json`, `math`, `re`, `xml.etree.ElementTree`
  for the well-formedness self-check). `tools/svg.py` is the reference (arithmetic of section 3, model, state, reducer subset, accessible
  text, exact hit test, document writer, strict reader, id codec, `pickElement`, a small renderer/lifecycle simulation, and the 126 switchable
  mutants); since rev 5 it loads `fixtures/oracles-lp/tools/lp.py` (the independent LP/1 reference, by path, standard library only) for the label offsets and reads no TypeScript; `tools/corpus.py` is the driver; `tools/rows.py`, `tools/scenes.py`, `tools/searches.py` define the rows, the authored scenes
  and the seeded searches.
* The author did **not** read, import, copy or run any TypeScript, `packages/*`, the V5 implementation (none existed), the review files or the author
  notes of design 30, or any tool code of earlier corpora (in particular `oracles-igr/tools/igr.py`): everything V5 needs of IGR/1 was re-implemented
  from the written rules (owner-delegated ruling).
* Frozen inputs are reused by relative path (`../oracles/...`, `../oracles-igl/...`); every frozen file the rows read is checked against the checksum
  recorded in its own corpus at generation time (21 files). New scenes and FIXED layouts exist only where no frozen one serves
  (`scenes/`, `layouts/`: 29 scenes). They were checked only by the generator's **lite** checker (canonical re-serialization, ordering,
  uniqueness, identifier rules, canonical undirected endpoints, layout order and binding hash). **Per design 15.2 a third party must run
  `verifyScene`, `verifyLayout` and `bindLayout` over every file of `scenes/` and `layouts/`, and `parseState` over the accepted `states/` files
  (except `states/Y14`, `states/Y15`, which are deliberately invalid).**
* Shared assumption: oracle and code implement the same written rules. The corpus proves that code matches the text as read in `AMBIGUITIES.md`.

## What is here

`EXPECT.tsv`: header `id group tier scene layout input expected error` (15.3), **253 rows** (one per id of 15.8: G 10, N 16, X 15, Y 17, O 22,
F 6, T 32, U 13, D 4, K 114, and since R-H L 4, appended last), 135 of them carrying files or inline inputs, the 118 `D`/`K` rows empty by design. `group` is the
leading letter. `scene`, `layout` are paths relative to the corpus directory (`../oracles/...`, `../oracles-igl/...` allowed); `input` is a path or
inline JSON (starts with `{` or `[`); `expected` is a path or empty; `error` is `CODE/REASON` or empty; the 38 rows with an `error` have no
expected file. Rows are listed in family order (G, N, X, Y, O, F, T, U, D, K). One row = one scene, one layout, one input (see A-05, A-06 for the
three rows that need more).

| Family | Rows | With files or inline input | With `error` |
|---|---|---|---|
| G golden documents | 10 | 10 | 0 |
| N numbers and geometry | 16 | 16 | 0 |
| X text, escaping, identities | 15 | 15 | 0 |
| Y state hooks | 17 | 17 | 2 |
| O options and validation | 22 | 22 | 12 |
| F size limits | 6 | 6 | 3 |
| T round trip, pick, reader | 32 | 32 | 21 |
| U the renderer | 13 | 13 | 0 |
| D differential (runtime) | 4 | 0 | 0 |
| K mutants (empty cells) | 114 | 0 | 0 |
| L LP/1 placement integration (R-H) | 4 | 4 | 0 |
| **total** | **253** | **135** | **38** |

| Directory | Content |
|---|---|
| `svg/` | expected documents, **exact bytes** (every line ends with LF, including the last; no BOM): rows G, N, X, Y, O, F and the documents recorded by U rows (`U01.c2.svg`, ...) |
| `states/` | canonical IGR-CJ/1 state bytes (no trailing newline): inputs of N, Y, T rows and the states after each `dispatch` of the U scripts |
| `scenes/`, `layouts/` | authored IGS/1 scenes and `igl-fixed/1` layouts (canonical bytes, no trailing newline), `<name>.scene.json`, `<name>.layout.json` |
| `inputs/` | `T03.ids.json` (the 16 id cases), `N03.search.json`, `N15.search.json` (seed, trials, witnesses of the two searches) |
| `json/` | expected non-SVG results (formats below) |
| `bad/` | invalid documents for `readSvg` (T04-T13, T19-T26, T29, T30, T32) |
| `scripts/` | lifecycle scripts of the U rows with their expectations filled in (they are outputs of the generator) |
| `generated/GENERATED.tsv` | id, role, path, bytes, SHA-256 of the one value that is generated and not stored (`T28`) |
| `MUTANTS.tsv`, `APPENDIX-A.tsv` | the mutant matrix and the Appendix A reproduction table (generated, covered by `SHA256SUMS`) |
| `tools/` | the generator (not in `SHA256SUMS`) |

`SHA256SUMS`: one line `<sha256> *<path>` per file, sorted by byte order of the path, covering every file except `tools/` and itself.

## Regenerate

```text
python tools/svg.py                    # rewrites every generated file in place (about two minutes: it includes the full mutant matrix)
python tools/svg.py --out DIR          # the same into DIR (used for the byte-identity proof: two runs, diff -r)
python tools/svg.py --no-matrix        # skip the mutant matrix (MUTANTS.tsv is then not written)
python tools/svg.py --mutant K08       # run one mutant over every row and list the rows that change
python tools/svg.py --check-appendix   # print the Appendix A reproduction table only
python tools/labelmove_check.py        # R-H proof: against `git show HEAD:`, only label x/y changed in the documents, every other file identical (needs git)
```

Python 3.12, standard library only, no network, no clock, no randomness (the two searches use a fixed 32-bit LCG and fixed seeds, recorded below).
`README.md` and `AMBIGUITIES.md` are produced from `tools/doc/`. The generator asserts at run time: Appendix A (it reads the expected strings from
design 30 when the file is found), the properties of the searches (N03, N15), the single-fault property of the bad documents, the
expat well-formedness of every document, and the rule of 15.4 for conflicting points.

## Tiers

`core`: a function on bytes (`renderSvg` / `writeSvg` / `readSvg` / `decodeElementId` / `pickElement`). `both`: the function **and** the subject
(`loadScene(model, state)` then `svg()` equals the same file, with the subject built with the row's options). `subject`: lifecycle and renderer rows.
`D` rows are `subject` (runtime, caller seeds, no files); `K` rows have an empty tier.

## Row families, inputs and expected files

**Documents (G, N, X, Y, O, L, F01, F04).** `input` = `{"size":{"width":W,"height":H},"state":"initial"|"<path>","options":{...}?,"expect_fidelity":{"edge_labels","label_units","labels"}?}`
(15.3). `"initial"` is `initialState(model, size)`; a path is a state file (canonical IGR-CJ/1 bytes bound to the row's scene and layout). The `"NaN"` token is the double.
`expected` = `svg/<id>.svg`, or empty with `error`. `expect_fidelity` is the fidelity of `renderSvgDetailed` and is present on every row that renders.
`Y14` and `Y15` (core) load their state file with plain JSON (A-11), not `parseState`.

* **G** goldens (G01 = Appendix A.1). **N** numbers and geometry: authored scenes with FIXED layouts and state files; `N03` and `N15` are built by seeded search (below),
  `N01` by a residue search; `N11`/`N12` use `igl:V45`/`igl:V46`. **X** text, escaping and identities. **Y** state hooks (A.2 is `Y03`, A.3 is `Y07`; `Y17` hides all `company` nodes of `mixed20`, see A-54).
  **O** options and validation (error rows: `O10`-`O12`, `O14`-`O22`). **F** size limits: `F01` (exact length, equals `G01`), `F04` (exact length of `hub`) expect documents; `F02`, `F03`, `F06` expect
  `RESOURCE_LIMIT/BYTES_LIMIT`; `F05` is inline (see `T`-style files below).

**L** (R-H, appended after the `K` rows; documents, tier both, same input form as G; scene `scenes/lp-*.scene.json`, FIXED layout, state `states/Lnn.state.json` at centre (450, 300), zoom 1000, 900x600, so one layout unit is one pixel). Each row is one collision that only one of the mutants K123-K126 gets wrong:

| Row | Scene | Content | Mutant killed |
|---|---|---|---|
| `L01` | `lp-hid-box` | the HIDDEN node `i:2` sits 30 px below `i:1`, inside the default label box of `i:1`; the label stays at its default position | K123 hidden nodes are obstacles |
| `L02` | `lp-nolabel` | the visible node `s:` has an empty label (no `<text>`) and sits 30 px below `s:aaaa`; the label of `s:aaaa` moves up (`y=183`) | K124 nodes without a drawn label dropped |
| `L03` | `lp-hid-label` | the hidden node `i:1` (label `1`, earlier in model order) has a default label box that overlaps that of `s:aaaa` 12 px to its right, its disc box does not; the label of `s:aaaa` stays at its default position | K125 labels of hidden nodes take part |
| `L04` | `lp-astral` | `s:bbbb` and a label of six U+1F600 (12 UTF-16 units, 6 code points) 48 px apart: the boxes collide only at 12 units; the astral label moves up | K126 units in code points |

**T** round trip, pick and reader.

| Row | Input | Expected |
|---|---|---|
| `T01` | `{"svg":"svg/X01.svg","idPrefix":"igr"}` | `json/T01.ids.json`: IGR-CJ/1 array of `{id, address}` (address = `ElementAddress`, absent when undecodable) in document order |
| `T02`, `T15`, `T16` | `{"size","state":"initial","idPrefix","source"?,"points"?}` | `json/Tnn.chain.json`: `{drawn_order, elements, pointer, conflict_case_format}`; per element `{element, id, by_id, objectRef, identity?, conflicts}`: `by_id` = `pickElement` with the id alone; `objectRef` = `{address (wire), artifact_sha256}` (the `selection-changed` reference); `identity` = `{address, artifact_sha256, kind}` (A-12); `conflicts` = `[x, y, "n"|"m", expected]` per conflicting point of 15.4 (n = centre of another drawn node, m = chord midpoint of another drawn edge at which `hitTest` returns that edge), `expected` = index into `drawn_order`, `-1` none; pointer-only cases in `pointer` |
| `T03` | `inputs/T03.ids.json` (16 cases `{case, idPrefix, id}`) | `json/T03.decode.json`: `[{case, address}]`, `address` = `ElementAddress` or `null` |
| `T04`-`T13`, `T19`-`T26`, `T29`, `T30`, `T32` | `bad/<id>.svg` | none; `error` = `INVALID_INPUT/SCHEMA` (each file is single-fault: asserted by the generator) |
| `T14` | `{"rows":[...]}` (every non-error document of G, N, X, Y, O) | `json/T14.readouts.json` (see "T14 projection") |
| `T17` | `{"size","state":"initial","also":{scene O4,layout F02}}` | `json/T17.hits.json`: `{points:[{label, scene, x, y, hit: ElementAddress|null, LIMITATION: true}]}` (the geometric `hitTest`, labelled LIMITATION rows) |
| `T18` | state `states/T18.state.json` (s:ann hidden) | `json/T18.pick.json`: `[{label, input, pick}]` |
| `T27` | `readSvg` of `G01` with three limits | `json/T27.limits.json`: `[{call, limits, result}]` |
| `T28` | the over-long id is generated (A-37) | `json/T28.decode.json` |
| `T31` | O1 + F01 at zoom 10 (state `N14`) and `also` O4 + F02 | `json/T31.pick.json`: `[{scene, label, input, pick}]` |

**T14 projection.** For every document `readSvg` must accept, the entry is `{row, nodes, edges, agrees_with_model, readout_sha256}`; `readout_sha256` is the SHA-256 of the IGR-CJ/1 bytes of
`{idPrefix, width, height, artifact_sha256, scene_sha256, layout_sha256, title, desc, styled, directed, nodes:[{address(wire), id, category_class, selected, focused, tabindex, name, label?, cx, cy}], edges:[{address(wire), id, selected, focused, tabindex, name, description, d, marker, label?, label_x?, label_y?}]}`
with `category_class` as the class token (`igr-k0`..), `tabindex` the printed string (`"0"`/`"-1"`), numbers the printed strings, text entity-decoded, optional members absent (never null).

**U** the renderer (`subject`). `input` = `scripts/Unn.script.json` for U01-U05, U07, U08; inline JSON for U06, U09-U13. A script is
`{model:{scene,layout}, env:{host:"headless",size,reducedMotion}, listener, subject_options?, calls:[...]}` (the schema of 27 §13.3a with the ops of A-09). Every call has `expect` = `"ok"` or `CODE/REASON`;
`dispatch` and `getState` have `expect_state` (a path), `svg` has `expect_svg` (a path under `svg/`), `probe` has `expect_fidelity` (the object of 12.3), `export` has `expect_media_type` and `expect_bytes` (path) or `expect_bytes_sha256`.
`await: false` issues the call without waiting (U03: a pending `loadScene`, so `svg()` is `BUSY`, then `render` settles it).
Files: `json/U06.headless.manifest.json`, `json/U06.dom.manifest.json` (IGR-CJ/1 manifests of `svgManifest(host, {name: "x-svg"})`, A-53), `json/U09.G01.witness.json`, `json/U09.G05.witness.json` (IGR-CJ/1 `WitnessReport`),
`json/U11.witness-honesty.json`, `json/U12.cap.json`, `json/U13.render.json` (A-10). `U10` has no expected file.

**D, K.** `D01`-`D04` are runtime tiers (caller seeds, kit-generated models): no file; `tools/svg.py` (`RefRenderer`, `render_svg`, `read_svg`, `pick_element`, `hit_test`) is a ready reference for them. `K01`-`K114` are
mutants of the V5 test suite (empty cells); their definitions and the killers that were measured are below. `K115`-`K126` (R-H, placement integration) are mutants only: they have **no** `K` row in `EXPECT.tsv` (the rows are not changed by R-H) and are listed in `MUTANTS.tsv`.

## The two searches and the residue construction

* **N01** (`ties`): 12 nodes at zoom 1999 whose screen `X`, `Y` have the required residues mod 1000 micro-pixels and the required parity of the thousands digit; found by scanning outward from the origin of the screen. Values:
  s:t00: X=1226499 Y=3146501; s:t01: X=1224500 Y=1151499; s:t02: X=1222501 Y=1149500; s:t03: X=3225499 Y=1147501; s:t04: X=3223500 Y=3150499; s:t05: X=3221501 Y=3148500; s:t06: X=-776499 Y=-2846501; s:t07: X=-774500 Y=-851499; s:t08: X=-772501 Y=-849500; s:t09: X=-2775499 Y=-847501; s:t10: X=-2773500 Y=-2850499; s:t11: X=-2771501 Y=-2848500
* **N03** (`trim`): seeded LCG `s' = (1664525 s + 1013904223) mod 2^32`, 24-bit output; seed 20261117; random straight edges 25-800 px at zoom 1001 (odd, so screen coordinates have arbitrary micro-pixel residues); 92255 trials gave
  3 witnesses per variant (V1, V2, V3 of 15.5a); the scene holds seven baseline edges (horizontal 25, 150 and 700 px, vertical 300 px, 45 degrees, 3-4-5, a short oblique one) plus the witnesses. The generator asserts that the printed text under K09, K10 and K11 differs from the correct text.
* **N15** (`anchors`): seed 20261118; 32231 trials gave 2 per variant witnesses (straight edges V4, degenerate edges V7, antiparallel pairs V5, V6, V8, V9), plus a group of three and a degenerate antiparallel pair. The generator asserts that K12, K13, K14, K109, K110, K111 each change the document.

## Appendix A reproduction (design 30)

| Item | Result | Detail |
|---|---|---|
| A.1 G01 bytes equal the A.1 block (extracted from the design) | **REPRODUCED** | 3193 bytes |
| A.1 size 3193 and SHA-256 265736b6b752... of the block | **REPRODUCED** | 3193 / 265736b6b7523681b589fcda23a20a10b574601c603e473bd78c7df7d1977653 |
| A.2 (row Y03) size 3441 and SHA-256 d2db035d1125... | **REPRODUCED** | 3441 / d2db035d11252ee3be86cd4259ca11cdd0cd55178abd5bf8df15deedf5739261 |
| A.3 (row Y07) size 2242 and SHA-256 6694f5e23e26... | **REPRODUCED** | 2242 / 6694f5e23e261cf442409f627115d94650a70e7a16f11528209e03c88c0254fd |
| A.2 block from <g class="igr-nodes"> on | **REPRODUCED** |  |
| A.3 block from <g class="igr-nodes"> on | **REPRODUCED** |  |
| A.4 degenerate edge (row N14) three lines | **REPRODUCED** |  |
| A.5 four distinct ids (i:7, s:7, s:007, s:-0) also present in row X01 | **REPRODUCED** |  |
| A.6 labels (dl cases, escapes, D-XML, budget 9/8/0) | **REPRODUCED** |  |
| A.7 click chain numbers (points -> i:1, edge, none, s:ann; id path; source hash) | **REPRODUCED** |  |
| A.8 other forms (self-loop, mixed20 edges 7/26/1/28, extreme coordinates) | **REPRODUCED** |  |
| A.9 option sizes (xmlDeclaration 3232, style:false 2207, labels:false 2965, edgeLabels:false 3118, idPrefix 3193) | **REPRODUCED** | O05=3232, O01=2207, O02=2965, O03=3118, O04=3193 |
| A.10 hit numbers (midpoint 184.517/216.904 -> edge 7; apexes; loop apex; edge 26 by id at the midpoint; T31 node wins) | **REPRODUCED** | mid=(184.517307,216.9037875) apex7=(187.122,208.693) apex26=(181.912,225.115) loop=(867.928,381.4) |

## Mutants (15.6)

Each of the 126 mutants (K01-K114 from design 15.6; K115-K126 added by R-H for the placement integration, design 30 rev 5) is a switch of `tools/svg.py` (`--mutant Knn`; `svg.MUT`). For each mutant the generator runs **every row** with the mutant active and compares the row's output (files and error) with the unmutated run
(`MUTANTS.tsv`: `mutant, description, named_killers, killing_rows, named_not_killing, other_changed_rows, verdict`); for K01-K122 the rows of family `L` are left out of `other_changed_rows`, so that their lines are exactly those of the revision before `L01`-`L04`). Row outputs are not recomputed from mutated inputs: inputs (scenes, states, bad files, expectations that
depend on lengths) are produced once by the unmutated reference.

**Result: 126 of 126 mutants are killed by at least one of their named killer rows; 0 are killed by no row at all (none).** 0 mutants name a killer row that does not change under the mutant (design defects of the vector list, reported not repaired): none.

| Mutant | Mutation | Named killers | Rows that change (named) | Named rows that do NOT change |
|---|---|---|---|---|
| K01 | coordinates via double toFixed(3) | N01,N02,N03 | N01,N02,N03 |  |
| K02 | trailing zeros kept | G01 | G01 |  |
| K03 | -0 printed for tiny negatives | N02 | N02 |  |
| K04 | fmt truncates toward zero | N01,N02 | N01,N02 |  |
| K05 | fmt tie rounds half down | N01 | N01 |  |
| K06 | X uses w/2 with integer division | G09,G10 | G09,G10 |  |
| K07 | centre sign wrong in X | G01,Y13 | G01,Y13 |  |
| K08 | trim 11 px | G01 | G01 |  |
| K09 | trim nearest-integer root (V1) | N03 | N03 |  |
| K10 | trim floorDiv (V2) | N03 | N03 |  |
| K11 | trim in doubles (V3) | N03 | N03 |  |
| K12 | straight anchor floorDiv (V4) | N15 | N15 |  |
| K13 | parallel anchor floorDiv (V5) | N15 | N15 |  |
| K14 | control point floorDiv (V6) | N15 | N15 |  |
| K15 | degenerate test < | N04 | N04 |  |
| K16 | degenerate by float length | N06 | N06 |  |
| K17 | degenerate trimmed anyway | N04,N14 | N04,N14 |  |
| K18 | coincident nodes NaN | N07 | N07 |  |
| K19 | marker on undirected | G02 | G02 |  |
| K20 | no marker on directed | G01 | G01 |  |
| K21 | loop rank global | N08 | N08 |  |
| K22 | loop marker on undirected | G02 | G02 |  |
| K23 | parallel offset sign by edge direction | N09,G05 | N09,G05 |  |
| K24 | grouping by ordered pair | G05,N09 | G05,N09 |  |
| K25 | group counts hidden members | N10 | N10 |  |
| K26 | PAR_STEP 15 | N09 | N09 |  |
| K27 | curve trimmed along chord | N09 | N09 |  |
| K28 | wrong loop label anchor | N08 | N08 |  |
| K29 | unescaped < and & in TEXT | X02,X12 | X02,X12 |  |
| K30 | > not escaped in TEXT | X12 | X12 |  |
| K31 | quote not escaped in aria-label | X02 | X02 |  |
| K32 | TAB/LF/CR raw in attribute | X10 | X10 |  |
| K33 | LF raw in TEXT | X10 | X10 |  |
| K34 | CR raw in TEXT | X10 | X10 |  |
| K35 | drawn text keeps TAB/LF | X10 | X10 |  |
| K36 | TAB written &#9; in TEXT | X10 | X10 |  |
| K37 | XML-illegal scalar kept | X11 | X11 |  |
| K38 | XML-illegal scalar deleted | X11 | X11 |  |
| K39 | truncation splits a pair | X03 | X03 |  |
| K40 | truncation at 25 | X03 | X03 |  |
| K41 | names trimmed | G07,X08 | G07,X08 |  |
| K42 | name NFC-normalized | X07 | X07 |  |
| K43 | id from array index | X01,T01 | X01,T01 |  |
| K44 | id JSON with spaces | X01 | X01 |  |
| K45 | id hex of UTF-16 | X06,X15 | X06,X15 |  |
| K46 | id hex uppercase | X01 | X01 |  |
| K47 | id tag dropped | X01 | X01 |  |
| K48 | idPrefix not validated | O11,O12,O14,O21 | O11,O12,O14,O21 |  |
| K49 | prefix not applied to url()/aria refs | O04 | O04 |  |
| K50 | edges before nodes | G01 | G01 |  |
| K51 | hidden element emitted | Y07,Y08 | Y07,Y08 |  |
| K52 | hide does not cascade | Y07 | Y07 |  |
| K53 | two tabindex 0 | Y04,Y05,Y10 | Y04,Y05,Y10 |  |
| K54 | ring/halo missing | Y01,Y02,Y04 | Y01,Y02,Y04 |  |
| K55 | ring/halo order wrong | Y02,Y06,Y16 | Y02,Y06,Y16 |  |
| K56 | class order wrong | Y06,Y16 | Y06,Y16 |  |
| K57 | status hidden count explicit only | Y07 | Y07 |  |
| K58 | summary always plural | G03,G04 | G03,G04 |  |
| K59 | category class mod 8 | X13 | X13 |  |
| K60 | category class over visible nodes only | Y17 | Y17 |  |
| K61 | empty text emitted | X08 | X08 |  |
| K62 | defs dropped without visible edges | Y09,G04 | Y09,G04 |  |
| K63 | pick path carries marker | G01 | G01 |  |
| K64 | label budget boundary exclusive | O06 | O06 |  |
| K65 | label budget not monotone | O09 | O09 |  |
| K66 | edgeLabels default false | G01 | G01 |  |
| K67 | style:false ignored | O01 | O01 |  |
| K68 | maxSvgBytes boundary exclusive (output of exactly the limit refused) | F01 | F01 |  |
| K69 | writer streams then checks | F05 | F05 |  |
| K70 | unknown option ignored | O10 | O10 |  |
| K71 | options array accepted | O19 | O19 |  |
| K72 | state not validated | Y14,Y15 | Y14,Y15 |  |
| K73 | declaration without LF | O05 | O05 |  |
| K74 | final LF missing | G01 | G01 |  |
| K75 | root attribute order changed | G01 | G01 |  |
| K76 | viewBox from layout bounds | G08,G09 | G08,G09 |  |
| K77 | off-screen elements dropped | Y13 | Y13 |  |
| K78 | artifact attr carries scene hash | G01 | G01 |  |
| K79 | decode accepts non-canonical | T03 | T03 |  |
| K80 | decode accepts kind a | T03 | T03 |  |
| K81 | decode has no bound | T28 | T28 |  |
| K82 | reader accepts script | T04 | T04 |  |
| K83 | reader accepts event attr/href | T05,T06 | T05,T06 |  |
| K84 | reader accepts CRLF/indent | T07,T08 | T07,T08 |  |
| K85 | reader accepts multi-line element | T29 | T29 |  |
| K86 | reader skips W1 dup | T19 | T19 |  |
| K87 | reader skips W1 decode | T20 | T20 |  |
| K88 | reader skips W2 | T21 | T21 |  |
| K89 | reader skips W3 | T22 | T22 |  |
| K90 | reader skips W4 | T23 | T23 |  |
| K91 | reader skips W5 | T11 | T11 |  |
| K92 | reader skips W6 | T12 | T12 |  |
| K93 | reader skips W7 | T24 | T24 |  |
| K94 | reader skips W8 | T25 | T25 |  |
| K95 | reader skips W9 | T26 | T26 |  |
| K96 | reader skips W10 | T30 | T30 |  |
| K97 | reader has no bound | T27 | T27 |  |
| K98 | click chain through array index | T02 | T02 |  |
| K99 | pick returns hidden/stale | T18 | T18 |  |
| K100 | pick prefers hitTest | T02,T15,T16 | T02,T15,T16 |  |
| K101 | witness reads probe | U11 | U11 |  |
| K102 | probe fidelity full while truncating | U04 | U04 |  |
| K103 | svg() no BUSY | U03 | U03 |  |
| K104 | svg() previous state | U01 | U01 |  |
| K105 | export svg returns bytes | U05 | U05 |  |
| K106 | manifest differs / labels.edge | U06,U12 | U06,U12 |  |
| K107 | render() builds document | U13 | U13 |  |
| K108 | capacity/svg label units may differ | U07 | U07 |  |
| K109 | degenerate anchor floorDiv (V7) | N15 | N15 |  |
| K110 | parallel midpoint floorDiv (V8) | N15 | N15 |  |
| K111 | parallel Lf nearest root (V9) | N15 | N15 |  |
| K112 | pick keeps edge over node | T31,T02,T15,T16 | T31,T02,T15,T16 |  |
| K113 | reader skips style compare | T32 | T32 |  |
| K114 | maxSvgBytes boundary accepts one byte more | F02 | F02 |  |
| K115 | label placement skipped (default positions) | G05,G08,N14 | G05,G08,N14 |  |
| K116 | placement offsets applied to x only | G09,N14 | G09,N14 |  |
| K117 | placement offsets applied to y only | G05,G08 | G05,G08 |  |
| K118 | placement called twice (node labels, edge labels separately) | G08,G09 | G08,G09 |  |
| K119 | placement order: edge labels before node labels | G08,G09 | G08,G09 |  |
| K120 | node obstacles at the label baseline (cy + 24 px), not the centre | G01,G08 | G01,G08 |  |
| K121 | label units counted before the elision | G07,X04 | G07,X04 |  |
| K122 | node obstacles ignored by the placement | G05,G08 | G05,G08 |  |
| K123 | hidden nodes are obstacles of the placement | L01 | L01 |  |
| K124 | visible nodes without a drawn label dropped from the obstacles | L02 | L02 |  |
| K125 | labels of hidden nodes take part in the placement | L03 | L03 |  |
| K126 | label units counted in code points | L04 | L04 |  |


## What the checks establish (and do not)

Established: every document is well-formed XML (expat), has one root in the SVG namespace, `aria-label` equals `<title>`, every id decodes, every coordinate is a `NUM`, every document ends with exactly one LF and has no empty line; Appendix A is reproduced as tabled;
every bad document is single-fault; two runs produce identical `SHA256SUMS` (the digest is in the hand-over report, not here, because this file is covered by it). **Not established:** that a browser renders the documents, anything about assistive technology, the frozen verifiers' verdict on
the authored inputs (third party), performance, or any behaviour of the V5 TypeScript (none existed when this corpus was written).
