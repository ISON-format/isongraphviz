# IGR-IA/1 oracle corpus (`oracles-ia`)

Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere; the third-party `verifyScene` / `verifyLayout` / `bindLayout` / `parseState` run over the authored
`scenes/`, `layouts/`, `states/` files, required by design 32 15.1, has not been done). Produced against design 32 (`32-INTERACTION-A11Y-EXPORT-DESIGN.md`, written against **rev 2**, refreshed against **rev 3**: rev 3 changes no expected file, `EXPECT.tsv` row or input file) by an oracle author who
was given only that design, designs 27 (rev 5), 30 (rev 4) and 31 (rev 5), `docs/specs/IGS-1.md`, `docs/specs/IGL-1.md`, `docs/conformance/README.md`, the frozen fixtures
(`fixtures/oracles`, `fixtures/oracles-igl`) and the file-format conventions (README, `EXPECT.tsv`, `SHA256SUMS`, `generated/GENERATED.tsv`) of the other corpora.
Read `AMBIGUITIES.md` before judging any mismatch: it lists 70 places where the design was ambiguous, contradictory or could not be built, with the reading used.

## Independence statement

* Every expected byte comes from the Python code in `tools/` (standard library only, Python 3.12: `hashlib`, `json`, `math`, `re`, `struct`, `zlib`, `os`, `shutil`). `tools/base.py`
  (canonical JSON, integer math, scene/layout writers, model, state, texts), `tools/machine.py` (events, key tokens, bindings, machine, navigation, lasso, reveal),
  `tools/companion.py` (tree, live text, plan, executor, simulated DOM, gate), `tools/export.py` (the oracle's **own** `igr-svg/1` and `igr-dl/1` writers re-implemented from designs 30 and 31,
  PNG container, export manifest, bundle verification, manifest composition, headless), `tools/rows_a.py` and `tools/rows_b.py` (the rows), `tools/corpus.py` (scene registry, helpers),
  `tools/appendix_a.py` (extraction of the Appendix A blocks from the design file), `tools/parity.py`, `tools/readme.py`, `tools/gen.py` (driver, self-checks, mutant matrix, `SHA256SUMS`).
* The author did **not** read, import, copy or run any TypeScript, anything under `packages/`, any `reviews/*.md` or author-notes file, or any tool code of another corpus.
  Tracked expected files of `fixtures/oracles-svg` and `fixtures/oracles-dl` (and their `EXPECT.tsv`) were read **only** by `tools/parity.py` to produce `PARITY.tsv`; no byte is copied from them and nothing in this corpus refers to another corpus.
* Self-contained: `scenes/O1.scene.json` and `layouts/O1.layout.json` are byte copies of the frozen `igs:O1` and `igl:F01` files (digests asserted at generation time:
  scene `e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc`, layout `2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db`). Every other scene, layout and state is
  authored here (source hash 64 `0`), checked only by the generator's light checker (canonical form, ordering, hashes). **A third party must run `verifyScene`, `verifyLayout`, `bindLayout`
  over every file of `scenes/` and `layouts/` and `parseState` over every file of `states/`** (design 15.1) before the corpus leaves DRAFT.
* Shared assumption: oracle and code implement the same written rules; the corpus proves agreement with the text as read in `AMBIGUITIES.md`, not that a rule is wise (design R-1).

## Regeneration

```sh
python tools/gen.py                # rebuilds every generated file (all but tools/ and AMBIGUITIES.md); deterministic, any PYTHONHASHSEED
python tools/gen.py --mutant K05   # prints, for the named mutant, which of its killer rows change
```

`gen.py` wipes the generated directories first, so it regenerates from empty. It builds all rows, writes the files, runs the self-checks (every tree and state file canonical; every
tree item equals the oracle's own accessible model; invariant I-C1 for `P02`, `P04`, `P07`, `P08` on a simulated DOM; no path leaves the corpus), reproduces Appendix A (`APPENDIX-A.tsv`),
runs the mutant matrix (`MUTANTS.tsv`), the parity check (`PARITY.tsv`), writes this README and finally `SHA256SUMS` (one line `<sha256> *<path>` per file except `tools/` and itself, sorted by byte order of the path).
Verify with `sha256sum -c SHA256SUMS` from this directory. The digest of `SHA256SUMS` itself is not stored here (this README is covered by it).

## Layout

`EXPECT.tsv`: header `id group tier scene layout input expected error`, one row per id (**410 rows**), `group` the leading letter, `tier` `core` except `D` (`diff`) and `K` (empty); `scene`, `layout` paths relative to this
directory (never leaving it) or empty; `input` a relative path or inline JSON (starts with `{` or `[`); `expected` a path or empty; `error` empty or `CODE/REASON`. One row = one scene, one layout, one input.

| Directory | Content |
|---|---|
| `scenes/, layouts/` | authored IGS/1 scenes and `igl-fixed/1` layouts (canonical bytes, no trailing newline); `O1` and `layouts/O1.layout.json` are the frozen bytes; `layouts/O1.alt.layout.json` is the `O1alt` layout |
| `states/` | canonical IGR-CJ/1 state bytes (inputs of I, V, L, C, G, X rows) |
| `scripts/, transcripts/` | I, V, L scripts (ordinary JSON) and their expected `{final_state, steps}` results (IGR-CJ/1) |
| `inputs/` | key list, binding tables, machine bytes, the A.4 event file |
| `trees/, plans/, logs/` | companion trees (IGR-CJ/1), DOM plans and executor logs (LF-terminated lines, split on U+000A only) |
| `gates/` | gate reports (IGR-CJ/1) |
| `json/, manifests/, png/` | token list, default bindings, export manifests, composed manifests, binding results, PNG fixtures |
| `data/` | `O1.svg` (3,193 bytes, no declaration), `O1.decl.svg` (3,232 bytes), `O1.dl`: the oracle's own `igr-svg/1` and `igr-dl/1` bytes for `O1` |
| `headless/` | outputs of the H rows |
| `generated/` | `GENERATED.tsv` (id, role, path, bytes, sha256 of the one generated vector, `X24`) and its recipe |
| `APPENDIX-A.tsv, MUTANTS.tsv, PARITY.tsv` | generated reports (below) |

## Families and tiers

| Family | Rows | With files or inline input | Content |
|---|---|---|---|
| E | 59 | 59 | event, config, command, machine-bytes and rectangle validation (error codes) |
| I | 48 | 48 | gesture transcripts: click, drag, wheel, pinch, long press, lasso, double click |
| V | 40 | 40 | keyboard navigation, key actions, the spatial metric, the reveal rule, caps |
| L | 8 | 8 | the corner-node marquee |
| B | 13 | 13 | key tokens and bindings |
| C | 20 | 20 | companion trees, windows, live text |
| P | 11 | 11 | DOM plans (full build and update) and the invariant I-C1 |
| Q | 4 | 4 | executor logs over the recording DOM |
| G | 36 | 36 | accessibility gate reports (single-fault rows over three base rows) |
| X | 25 | 25 | export bundle, PNG binding chunk, manifest and bundle verification |
| M | 5 | 5 | composed capability manifests |
| H | 7 | 7 | headless outputs and argument errors |
| D | 6 | 0 | differential tier (runtime, seeds from the caller; empty cells) |
| K | 128 | 0 | mutants (test code; empty cells) |
| **total** | **410** | **276** | |

Tier `core` is every row of E, I, V, L, B, C, P, Q, G, X, M, H (byte equality against the written rules, level IA0); `diff` (D) is a runtime tier of the test suite; K rows are mutants in test code.
Rows with an `error` and no expected file: B03, B04, B05, B06, B07, B08, B09, B10, B11, B13, E02, E03, E04, E05, E06, E07, E08, E09, E10, E11, E12, E13, E14, E15, E16, E17, E18, E19, E20, E21, E22, E23, E33, E34, E35, E36, E37, E38, E39, E40, E41, E42, E43, E50, E51, E52, E53, E54, E55, E61, E62, E63, E70, E71, E72, H05, H06, H07, M04, M05, P10, X06, X07, X09, X11, X12, X13, X14, X15, X16, X17, X18, X19, X20, X21, X22, X23, X24, X25, X26.

## Appendix A reproduction (`APPENDIX-A.tsv`)

Blocks are extracted from the design file by rules X1 to X3 (split on LF, final LF added to `lines,` blocks, hex unhexed); the quoted size and SHA-256 are compared with the quoted block and with the generator's bytes.

| Item | Kind | Quoted bytes | Generated bytes | Status |
|---|---|---|---|---|
| A.1 C01 | text | 1544 | 1544 | REPRODUCED |
| A.3 B12 | text | 2680 | 2680 | REPRODUCED |
| A.4 I50 events | text | 516 | 516 | REPRODUCED |
| A.4 I50 result | text | 557 | 557 | REPRODUCED |
| A.5 V22 | text | 241 | 241 | REPRODUCED |
| A.6 G01 | text | 1237 | 1237 | REPRODUCED |
| A.7 P02 | lines | 154 | 154 | REPRODUCED |
| A.8 fixture | hex | 68 | 68 | REPRODUCED |
| A.8 X04 | hex | 298 | 298 | REPRODUCED |
| A.9 X03 | text | 1105 | 1105 | REPRODUCED |
| A.11 B01 | text | 243 | 243 | REPRODUCED |
| A.14 V30 | text | 293 | 293 | REPRODUCED |
| A.2 C02 | figure | 1561 | 1561 | REPRODUCED |
| A.7 P01 | figure | 5833 | 5833 | REPRODUCED |
| A.7 P04 | figure | 9025 | 9025 | REPRODUCED |
| A.7 P07 | figure | 4513 | 4513 | REPRODUCED |
| A.7 P08 | figure | 13186 | 13186 | REPRODUCED |
| A.7 P09 | figure | 51 | 51 | REPRODUCED |
| A.7 Q01 | figure | 7216 | 7216 | REPRODUCED |
| A.7 Q02 | figure | 175 | 175 | REPRODUCED |
| A.7 Q03 | figure | 7251 | 7251 | REPRODUCED |
| A.7 Q04 | figure | 4934 | 4934 | REPRODUCED |
| A.8 crc | figure |  |  | REPRODUCED |
| A.9 state | figure | 335 | 335 | REPRODUCED |
| A.9 svg | figure | 3232 | 3232 | REPRODUCED |
| A.9 X02 | figure | 977 | 977 | REPRODUCED |
| A.9 X01 | figure | 819 | 819 | REPRODUCED |
| A.10 state | figure | 335 | 335 | REPRODUCED |
| A.10 svg | figure | 3193 | 3193 | REPRODUCED |
| A.10 tree = A.1 | figure | 1544 | 1544 | REPRODUCED |
| A.13 C05 | figure | 49774 | 49774 | REPRODUCED |
| A.13 C07 | figure | 49774 | 49774 | REPRODUCED |

## Parity of the oracle's own SVG and display-list writers (`PARITY.tsv`)

The corpus does not copy `oracles-svg` / `oracles-dl` bytes. At generation time the oracle's writers are run on the frozen-fixture rows `G01`-`G10` of both corpora (initial state, default options) and on `svg:O05`
and compared with the tracked expected files (read-only): **21 of 21 MATCH**.

| Row | Status | SHA-256 (this writer) |
|---|---|---|
| svg:G01 | MATCH | `265736b6b7523681b589fcda23a20a10b574601c603e473bd78c7df7d1977653` |
| svg:G02 | MATCH | `76474a5b812ecce7dae8d9ea35dc9bc98bd7c5d37b1b5e4d5ad9429ef184a651` |
| svg:G03 | MATCH | `16d1055540c56aea5098d048a2b1f4f799a1317aab6932b42bde2c2b0623795e` |
| svg:G04 | MATCH | `44a938943ea1759616f76d692fcb582b8126cbdb4ae2a8cec2223757767841e7` |
| svg:G05 | MATCH | `a6b0b2507ed30c096a806701dbe7c213c9c8271314bc0502da7dd9688bafaa16` |
| svg:G06 | MATCH | `d1613175d8f308b7992cf9bcaa9b6b4fa111bffc9d7ab542868cfe017a674ca1` |
| svg:G07 | MATCH | `e392eed2960fb4c42131f4ba4807dc5a1c2b169ead7bbde8644c9f76f3870667` |
| svg:G08 | MATCH | `af73e0758f492f47bda48931455c9aa4195210cd97d1b089b08a715fb20160e7` |
| svg:G09 | MATCH | `d44918c4f929db1dc3d0966d98edd8ad577015dda361a56e0b37c2e518c1539c` |
| svg:G10 | MATCH | `79cc814ad18114c716d6d8a00a8c0de8908fa3e62213f067067009abf87c022a` |
| dl:G01 | MATCH | `62e9d45ed682602b4b4dae6503a92029566fb0cabf6e73f8a9a50893fcff4ebd` |
| dl:G02 | MATCH | `df97fef0ccf331cb13e10eff773275a73f1d7d40723c429d57ab585ba0cd8a89` |
| dl:G03 | MATCH | `1479ea2f69730b1deedd47fffaa4b46aa32be8d3939785ef27b552d3562591bc` |
| dl:G04 | MATCH | `e04ea3feca829633000f026abbb2a6c24b7f1a92ad2aad5c94975ac4215336ba` |
| dl:G05 | MATCH | `fb7a0a3d5c5ed1fc4b63769427267d9d18371b4f949031b33e21b981ba92fb1d` |
| dl:G06 | MATCH | `b6d1af23b35a98c95758db4c288949a55798d6214e34aef4a8a050706b6c2d09` |
| dl:G07 | MATCH | `32208bb6519fdc5cfcde67cd6cf10758d5a9fa8d5e3f8171aeebcc0b684e808d` |
| dl:G08 | MATCH | `e637658e0fe4d5cfe94eb536612d80c8a87561dd9f2fa2fc2f05d0c1a6d99140` |
| dl:G09 | MATCH | `03e58c5efd0768587e1c070009699b85b7efdbe44aafe57f55edb373ea518359` |
| dl:G10 | MATCH | `84229c3b9447c1628265da655c14463c2685cbab2692d2d1d79b7b7089bb2953` |
| svg:O05 | MATCH | `28624a30c9cb0afe4bacaa981c383ff0662f7d90ce7c62554ee8c57a982d6671` |

## Mutants (`MUTANTS.tsv`)

The 128 mutants of design 15.6 are switchable variants inside the Python reference (`--mutant Knn`; the switch set is `MUT` in `tools/base.py`). For each mutant the named killer rows are re-evaluated **on the stored
baseline inputs** with the mutant active and the output (expected files and error code) is compared with the baseline: KILLED 127, not-applicable 1.
`K84` is JavaScript-only (a plain object keyed by graph strings) and is recorded `not-applicable`; its killers `C16`, `I51` exist. A crash is never counted as a kill (the one structured-versus-unstructured
difference the design asks for, `K112` on `X25`, is a recorded `UNSTRUCTURED/RecursionError` result).

| Mutant | Verdict | Named killer rows | Rows that changed |
|---|---|---|---|
| K01 | KILLED | I07 | I07 |
| K02 | KILLED | I07b | I07b |
| K03 | KILLED | I06b | I06b |
| K04 | KILLED | I06 | I06 |
| K05 | KILLED | I06 | I06 |
| K06 | KILLED | I06 | I06 |
| K07 | KILLED | I28 | I28 |
| K08 | KILLED | I03b | I03b |
| K09 | KILLED | I04b | I04b |
| K10 | KILLED | I05 | I05 |
| K11 | KILLED | I10 | I10 |
| K12 | KILLED | I12 | I12 |
| K13 | KILLED | I08 | I08 |
| K14 | KILLED | I11 | I11 |
| K15 | KILLED | I13 | I13 |
| K16 | KILLED | I08 | I08 |
| K17 | KILLED | I14 | I14 |
| K18 | KILLED | I14 | I14 |
| K19 | KILLED | I14b | I14b |
| K20 | KILLED | I16 | I16 |
| K21 | KILLED | I18 | I18 |
| K22 | KILLED | I20 | I20 |
| K23 | KILLED | I18 | I18 |
| K24 | KILLED | I27 | I27 |
| K25 | KILLED | I25 | I25 |
| K26 | KILLED | I21 | I21 |
| K27 | KILLED | I23b | I23b |
| K28 | KILLED | I24 | I24 |
| K29 | KILLED | I24b | I24b |
| K30 | KILLED | I23 | I23 |
| K31 | KILLED | I29 | I29 |
| K32 | KILLED | V07 | V07 |
| K33 | KILLED | V07 | V07 |
| K34 | KILLED | V08 | V08 |
| K35 | KILLED | V03 | V03 |
| K36 | KILLED | V09 | V09 |
| K37 | KILLED | V11 | V11 |
| K38 | KILLED | V12 | V12 |
| K39 | KILLED | V13 | V13 |
| K40 | KILLED | V14 | V14 |
| K41 | KILLED | V14w | V14w |
| K42 | KILLED | V10 | V10 |
| K43 | KILLED | V06 | V06 |
| K44 | KILLED | V20 | V20 |
| K45 | KILLED | C02 | C02 |
| K46 | KILLED | C02 | C02 |
| K47 | KILLED | C07 | C07 |
| K48 | KILLED | C08 | C08 |
| K49 | KILLED | C10 | C10 |
| K50 | KILLED | C11 | C11 |
| K51 | KILLED | C09 | C09 |
| K52 | KILLED | C01 | C01 |
| K53 | KILLED | C01 | C01 |
| K54 | KILLED | C01 | C01 |
| K55 | KILLED | P03 | P03 |
| K56 | KILLED | P04,P08 | P04,P08 |
| K57 | KILLED | G13 | G13 |
| K58 | KILLED | G12 | G12 |
| K59 | KILLED | G14 | G14 |
| K60 | KILLED | G17 | G17 |
| K61 | KILLED | G29 | G29 |
| K62 | KILLED | G27 | G27 |
| K63 | KILLED | X04 | X04 |
| K64 | KILLED | X04 | X04 |
| K65 | KILLED | X04 | X04 |
| K66 | KILLED | X07 | X07 |
| K67 | KILLED | X06 | X06 |
| K68 | KILLED | X02 | X02 |
| K69 | KILLED | X01 | X01 |
| K70 | KILLED | X09 | X09 |
| K71 | KILLED | X02 | X02 |
| K72 | KILLED | I40 | I40 |
| K73 | KILLED | L06 | L06 |
| K74 | KILLED | V16 | V16 |
| K75 | KILLED | B01 | B01 |
| K76 | KILLED | E07 | E07 |
| K77 | KILLED | E21 | E21 |
| K78 | KILLED | E16 | E16 |
| K79 | KILLED | E05 | E05 |
| K80 | KILLED | B05 | B05 |
| K81 | KILLED | B13 | B13 |
| K82 | KILLED | M01 | M01 |
| K83 | KILLED | M01 | M01 |
| K84 | not-applicable | C16,I51 |  |
| K85 | KILLED | I42 | I42 |
| K86 | KILLED | V25 | V25 |
| K87 | KILLED | V24 | V24 |
| K88 | KILLED | V26 | V26 |
| K89 | KILLED | V25 | V25 |
| K90 | KILLED | V30 | V30 |
| K91 | KILLED | V30 | V30 |
| K92 | KILLED | V33 | V33 |
| K93 | KILLED | V32 | V32 |
| K94 | KILLED | I43 | I43 |
| K95 | KILLED | I56 | I56 |
| K96 | KILLED | I54 | I54 |
| K97 | KILLED | I57 | I57 |
| K98 | KILLED | I22 | I22 |
| K99 | KILLED | C19 | C19 |
| K100 | KILLED | P09 | P09 |
| K101 | KILLED | P01,P08 | P01,P08 |
| K102 | KILLED | G35 | G35 |
| K103 | KILLED | G33 | G33 |
| K104 | KILLED | G31 | G31 |
| K105 | KILLED | G30 | G30 |
| K106 | KILLED | G40 | G40 |
| K107 | KILLED | G41 | G41 |
| K108 | KILLED | G38 | G38 |
| K109 | KILLED | X02 | X02 |
| K110 | KILLED | X17 | X17 |
| K111 | KILLED | X24 | X24 |
| K112 | KILLED | X25 | X25 |
| K113 | KILLED | X22 | X22 |
| K114 | KILLED | X20 | X20 |
| K115 | KILLED | X21 | X21 |
| K116 | KILLED | X18 | X18 |
| K117 | KILLED | X19 | X19 |
| K118 | KILLED | X14 | X14 |
| K119 | KILLED | X23 | X23 |
| K120 | KILLED | X16 | X16 |
| K121 | KILLED | C17 | C17 |
| K122 | KILLED | V37,V38 | V37,V38 |
| K123 | KILLED | V39 | V39 |
| K124 | KILLED | V40 | V40 |
| K125 | KILLED | G42,G43 | G42,G43 |
| K126 | KILLED | I52,V36 | I52,V36 |
| K127 | KILLED | X26 | X26 |
| K128 | KILLED | G44 | G44 |

## Rows that claim no bytes, and items outside the oracle (design 15.3, 15.7)

**Accepted rows** (`expected` and `error` both empty) claim only that the function returns without error and claim **no bytes**: B02, E01, E24, E25, E26, E27, E28, E29, E30, E31, E32, E44, E56, E60, E73, X10 (16 rows).
Error rows (`error` set, `expected` empty) claim the error code only. An empty plan (`P03`) is a zero-byte file named in `expected`.

Tested only in the TypeScript tranche, with **no oracle bytes and no row that claims any** (cannot be built in Python, `AMBIGUITIES.md` A-60 to A-64): the binder, `mountCompanion`, adapter focus restoration and `COMPANION_CSS`;
`verifyCompanionTree`, `maxTreeBytes`, the executor guards (the simulated DOM here has them, `gen.py` self-checks them, no row asserts them) and the `INVALID_TREE/INCONSISTENT` planner assertion; properties I1-I5, I-C1 on random inputs and tier D;
the `2^31` omission of the reveal; the TypeScript mutation `K84` (`not-applicable` here; `C16`, `I51` carry bytes); the reducer part of `H05` (an error row, no bytes). Nothing in `EXPECT.tsv` names these items except the rows just mentioned.

## Notes

* `X24` is an oversize input recorded as a generated vector (`generated/GENERATED.tsv`): 1,048,577 bytes of 0x41, one over the 1,048,576-byte manifest limit.
* No row needed a search-built input; no seeded search is recorded. Tier D has no files by design.
* Expected files are never regenerated to make code pass; additions take new ids (design 0.12).
