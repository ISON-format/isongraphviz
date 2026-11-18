# IGR-SVG/1 oracle corpus (`oracles-svg`)

Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere). Produced against design 30 (`30-SVG-RENDERER-DESIGN.md`,
**rev 3**; first written against rev 2, regenerated against rev 3) by an oracle author who was given only that design, `27-IGR1-DESIGN.md` (rev 5), `IGS-1.md`, `IGL-1.md`,
`docs/conformance/README.md` and the frozen fixtures (`fixtures/oracles`, `fixtures/oracles-igl`), plus the **format and layout
conventions** (README, `EXPECT.tsv`, `SHA256SUMS`, `generated/GENERATED.tsv`) of the draft corpora `oracles-igr`, `-lod`, `-stable`.
Read `AMBIGUITIES.md` before judging any mismatch: it lists {{NAMBIG}} places where the design was ambiguous, contradictory or
could not be built (A-01 to A-07 are defects of the design of rev 2; A-54 to A-61 are new findings against rev 3), the reading used, why, and for every old entry whether rev 3 resolved it and whether the reading matched.

## Independence statement

* Every expected byte comes from the Python code in `tools/` (standard library only: `hashlib`, `json`, `math`, `re`, `xml.etree.ElementTree`
  for the well-formedness self-check). `tools/svg.py` is the reference (arithmetic of section 3, model, state, reducer subset, accessible
  text, exact hit test, document writer, strict reader, id codec, `pickElement`, a small renderer/lifecycle simulation, and the 114 switchable
  mutants); `tools/corpus.py` is the driver; `tools/rows.py`, `tools/scenes.py`, `tools/searches.py` define the rows, the authored scenes
  and the seeded searches.
* The author did **not** read, import, copy or run any TypeScript, `packages/*`, the V5 implementation (none existed), the review files or the author
  notes of design 30, or any tool code of earlier corpora (in particular `oracles-igr/tools/igr.py`): everything V5 needs of IGR/1 was re-implemented
  from the written rules (owner-delegated ruling).
* Frozen inputs are reused by relative path (`../oracles/...`, `../oracles-igl/...`); every frozen file the rows read is checked against the checksum
  recorded in its own corpus at generation time ({{NFROZEN}} files). New scenes and FIXED layouts exist only where no frozen one serves
  (`scenes/`, `layouts/`: {{NSCENES}} scenes). They were checked only by the generator's **lite** checker (canonical re-serialization, ordering,
  uniqueness, identifier rules, canonical undirected endpoints, layout order and binding hash). **Per design 15.2 a third party must run
  `verifyScene`, `verifyLayout` and `bindLayout` over every file of `scenes/` and `layouts/`, and `parseState` over the accepted `states/` files
  (except `states/Y14`, `states/Y15`, which are deliberately invalid).**
* Shared assumption: oracle and code implement the same written rules. The corpus proves that code matches the text as read in `AMBIGUITIES.md`.

## What is here

`EXPECT.tsv`: header `id group tier scene layout input expected error` (15.3), **{{NROWS}} rows** (one per id of 15.8: G 10, N 16, X 15, Y 17, O 22,
F 6, T 32, U 13, D 4, K 114), {{NDATA}} of them carrying files or inline inputs, the {{NEMPTY}} `D`/`K` rows empty by design. `group` is the
leading letter. `scene`, `layout` are paths relative to the corpus directory (`../oracles/...`, `../oracles-igl/...` allowed); `input` is a path or
inline JSON (starts with `{` or `[`); `expected` is a path or empty; `error` is `CODE/REASON` or empty; the {{NERR}} rows with an `error` have no
expected file. Rows are listed in family order (G, N, X, Y, O, F, T, U, D, K). One row = one scene, one layout, one input (see A-05, A-06 for the
three rows that need more).

{{COUNTS}}

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

**Documents (G, N, X, Y, O, F01, F04).** `input` = `{"size":{"width":W,"height":H},"state":"initial"|"<path>","options":{...}?,"expect_fidelity":{"edge_labels","label_units","labels"}?}`
(15.3). `"initial"` is `initialState(model, size)`; a path is a state file (canonical IGR-CJ/1 bytes bound to the row's scene and layout). The `"NaN"` token is the double.
`expected` = `svg/<id>.svg`, or empty with `error`. `expect_fidelity` is the fidelity of `renderSvgDetailed` and is present on every row that renders.
`Y14` and `Y15` (core) load their state file with plain JSON (A-11), not `parseState`.

* **G** goldens (G01 = Appendix A.1). **N** numbers and geometry: authored scenes with FIXED layouts and state files; `N03` and `N15` are built by seeded search (below),
  `N01` by a residue search; `N11`/`N12` use `igl:V45`/`igl:V46`. **X** text, escaping and identities. **Y** state hooks (A.2 is `Y03`, A.3 is `Y07`; `Y17` hides all `company` nodes of `mixed20`, see A-54).
  **O** options and validation (error rows: `O10`-`O12`, `O14`-`O22`). **F** size limits: `F01` (exact length, equals `G01`), `F04` (exact length of `hub`) expect documents; `F02`, `F03`, `F06` expect
  `RESOURCE_LIMIT/BYTES_LIMIT`; `F05` is inline (see `T`-style files below).

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
mutants of the V5 test suite (empty cells); their definitions and the killers that were measured are below.

## The two searches and the residue construction

* **N01** (`ties`): 12 nodes at zoom 1999 whose screen `X`, `Y` have the required residues mod 1000 micro-pixels and the required parity of the thousands digit; found by scanning outward from the origin of the screen. Values:
  {{TIES}}
* **N03** (`trim`): seeded LCG `s' = (1664525 s + 1013904223) mod 2^32`, 24-bit output; seed {{TRIM_SEED}}; random straight edges 25-800 px at zoom 1001 (odd, so screen coordinates have arbitrary micro-pixel residues); {{TRIM_TRIALS}} trials gave
  {{TRIM_FOUND}} witnesses per variant (V1, V2, V3 of 15.5a); the scene holds seven baseline edges (horizontal 25, 150 and 700 px, vertical 300 px, 45 degrees, 3-4-5, a short oblique one) plus the witnesses. The generator asserts that the printed text under K09, K10 and K11 differs from the correct text.
* **N15** (`anchors`): seed {{ANCH_SEED}}; {{ANCH_TRIALS}} trials gave {{ANCH_FOUND}} witnesses (straight edges V4, degenerate edges V7, antiparallel pairs V5, V6, V8, V9), plus a group of three and a degenerate antiparallel pair. The generator asserts that K12, K13, K14, K109, K110, K111 each change the document.

## Appendix A reproduction (design 30)

{{APPENDIX}}

## Mutants (15.6)

Each of the 114 mutants is a switch of `tools/svg.py` (`--mutant Knn`; `svg.MUT`). For each mutant the generator runs **every row** with the mutant active and compares the row's output (files and error) with the unmutated run
(`MUTANTS.tsv`: `mutant, description, named_killers, killing_rows, named_not_killing, other_changed_rows, verdict`). Row outputs are not recomputed from mutated inputs: inputs (scenes, states, bad files, expectations that
depend on lengths) are produced once by the unmutated reference.

{{MUT_SUMMARY}}

{{MUT_TABLE}}

## What the checks establish (and do not)

Established: every document is well-formed XML (expat), has one root in the SVG namespace, `aria-label` equals `<title>`, every id decodes, every coordinate is a `NUM`, every document ends with exactly one LF and has no empty line; Appendix A is reproduced as tabled;
every bad document is single-fault; two runs produce identical `SHA256SUMS` (the digest is in the hand-over report, not here, because this file is covered by it). **Not established:** that a browser renders the documents, anything about assistive technology, the frozen verifiers' verdict on
the authored inputs (third party), performance, or any behaviour of the V5 TypeScript (none existed when this corpus was written).
