# IGR-IA/1 oracle corpus (`oracles-ia`)

Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere; the third-party `verifyScene` / `verifyLayout` / `bindLayout` / `parseState` run over the authored
`scenes/`, `layouts/`, `states/` files, required by design 32 15.1, has not been done). Produced against design 32 (`32-INTERACTION-A11Y-EXPORT-DESIGN.md`, written against **rev 2**, refreshed against **rev 3**: rev 3 changes no expected file, `EXPECT.tsv` row or input file; extended against **rev 4** by the rev 4 round below: rows only, appended) by an oracle author who
was given only that design, designs 27 (rev 5), 30 (rev 4) and 31 (rev 5), `docs/specs/IGS-1.md`, `docs/specs/IGL-1.md`, `docs/conformance/README.md`, the frozen fixtures
(`fixtures/oracles`, `fixtures/oracles-igl`) and the file-format conventions (README, `EXPECT.tsv`, `SHA256SUMS`, `generated/GENERATED.tsv`) of the other corpora.
Read `AMBIGUITIES.md` before judging any mismatch: it lists 94 places where the design was ambiguous, contradictory or could not be built, with the reading used (A-01 to A-70 the first round, A-71 to A-74 the rev 3 refresh, A-75 to A-84 the gap round, A-85 to A-94 the rev 4 round; its sections `RESOLVED-IN-REV4` and `Correction of K158` say what rev 4 settled).

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
python tools/gaps.py --write       # after gen.py: appends the gap-round rows B14-B110, X27-X177, K129-K200 (refuses to run twice)
python tools/gaps2.py --write      # after gaps.py: appends the rev 4 rows B111-B174, E74-E102, X178-X275, K201-K311, the AMBIGUITIES.md section, rewrites this README and SHA256SUMS (refuses to run twice)
```

`gen.py` wipes the generated directories first, so it regenerates from empty. It builds all rows, writes the files, runs the self-checks (every tree and state file canonical; every
tree item equals the oracle's own accessible model; invariant I-C1 for `P02`, `P04`, `P07`, `P08` on a simulated DOM; no path leaves the corpus), reproduces Appendix A (`APPENDIX-A.tsv`),
runs the mutant matrix (`MUTANTS.tsv`), the parity check (`PARITY.tsv`), writes this README and finally `SHA256SUMS` (one line `<sha256> *<path>` per file except `tools/` and itself, sorted by byte order of the path).
Verify with `sha256sum -c SHA256SUMS` from this directory. The digest of `SHA256SUMS` itself is not stored here (this README is covered by it).

## Layout

`EXPECT.tsv`: header `id group tier scene layout input expected error`, one row per id (**1032 rows**), `group` the leading letter, `tier` `core` except `D` (`diff`) and `K` (empty); `scene`, `layout` paths relative to this
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
| E | 88 | 88 | event, config, command, machine-bytes and rectangle validation (error codes) |
| I | 48 | 48 | gesture transcripts: click, drag, wheel, pinch, long press, lasso, double click |
| V | 40 | 40 | keyboard navigation, key actions, the spatial metric, the reveal rule, caps |
| L | 8 | 8 | the corner-node marquee |
| B | 174 | 174 | key tokens and bindings |
| C | 20 | 20 | companion trees, windows, live text |
| P | 11 | 11 | DOM plans (full build and update) and the invariant I-C1 |
| Q | 4 | 4 | executor logs over the recording DOM |
| G | 36 | 36 | accessibility gate reports (single-fault rows over three base rows) |
| X | 274 | 274 | export bundle, PNG binding chunk, manifest and bundle verification |
| M | 5 | 5 | composed capability manifests |
| H | 7 | 7 | headless outputs and argument errors |
| D | 6 | 0 | differential tier (runtime, seeds from the caller; empty cells) |
| K | 311 | 0 | mutants (test code; empty cells) |
| **total** | **1032** | **715** | |

Tier `core` is every row of E, I, V, L, B, C, P, Q, G, X, M, H (byte equality against the written rules, level IA0); `diff` (D) is a runtime tier of the test suite; K rows are mutants in test code.
Rows with an `error` and no expected file: B03, B04, B05, B06, B07, B08, B09, B10, B11, B13, B27, B28, B29, B30, B31, B32, B33, B34, B35, B36, B37, B38, B39, B40, B41, B42, B43, B44, B45, B46, B47, B48, B49, B50, B51, B52, B53, B54, B55, B56, B57, B58, B59, B60, B61, B62, B63, B64, B65, B66, B67, B68, B69, B70, B71, B72, B73, B74, B75, B76, B77, B78, B79, B80, B81, B82, B83, B84, B85, B86, B87, B88, B89, B90, B91, B92, B93, B94, B95, B96, B97, B98, B99, B100, B101, B102, B103, B104, B105, B106, B107, B108, B109, B110, B114, B115, B116, B117, B118, B119, B120, B121, B122, B123, B124, B125, B126, B127, B128, B129, B130, B131, B132, B133, B134, B135, B136, B137, B138, B139, B140, B141, B142, B143, B144, B145, B146, B147, B148, B149, B150, B151, B152, B153, B154, B155, B156, B157, B158, B159, B160, B161, B162, B163, B164, B165, B166, B167, B168, B169, B170, B171, B172, B173, B174, E02, E03, E04, E05, E06, E07, E08, E09, E10, E11, E12, E13, E14, E15, E16, E17, E18, E19, E20, E21, E22, E23, E33, E34, E35, E36, E37, E38, E39, E40, E41, E42, E43, E50, E51, E52, E53, E54, E55, E61, E62, E63, E70, E71, E72, E79, E80, E81, E82, E83, E84, E85, E86, E87, E88, E89, E90, E91, E92, E93, E94, E95, E96, E97, E98, E99, E100, E101, E102, H05, H06, H07, M04, M05, P10, X06, X07, X09, X11, X12, X13, X14, X15, X16, X17, X18, X19, X20, X21, X22, X23, X24, X25, X26, X31, X32, X33, X34, X35, X36, X37, X38, X39, X40, X41, X42, X43, X44, X45, X46, X47, X48, X49, X50, X51, X52, X53, X54, X55, X56, X57, X58, X59, X60, X61, X62, X63, X64, X65, X66, X67, X68, X69, X70, X71, X72, X73, X74, X75, X76, X77, X78, X79, X80, X81, X82, X83, X84, X85, X86, X87, X88, X89, X90, X91, X92, X93, X94, X95, X96, X97, X98, X99, X100, X101, X102, X103, X104, X105, X106, X107, X108, X109, X110, X121, X122, X123, X124, X130, X131, X132, X133, X134, X135, X136, X137, X138, X139, X140, X141, X142, X143, X144, X145, X146, X147, X148, X149, X150, X151, X152, X153, X154, X155, X159, X160, X161, X162, X163, X164, X165, X166, X167, X168, X169, X170, X171, X175, X176, X178, X179, X180, X181, X182, X183, X184, X185, X186, X187, X188, X189, X190, X191, X192, X193, X194, X195, X196, X197, X198, X199, X200, X201, X202, X203, X204, X205, X206, X207, X208, X209, X210, X211, X212, X213, X214, X215, X216, X217, X218, X219, X220, X221, X222, X223, X224, X225, X226, X227, X228, X229, X230, X231, X232, X233, X234, X235, X236, X237, X238, X239, X240, X241, X242, X243, X244, X245, X247, X248, X249, X250, X251, X252, X253, X254, X256, X257, X258, X259, X264, X265, X266, X267, X268, X269, X270, X271, X272, X273, X274, X275.

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

### Mutants beyond the design table (K129 to K311)

`K129`-`K200` (the gap round, `tools/gaps.py`) and `K201`-`K311` (the rev 4 round, `tools/gaps2.py`) are mutants of the Python references of those two scripts, not of the design's table; each names the new rows that kill it, re-evaluated on the stored inputs with the mutant active: KILLED 183.

| Mutant | Verdict | Named killer rows | Mutation |
|---|---|---|---|
| K129 | KILLED | B34 | host-mode grammar anchored with `$` (a trailing LF accepted) |
| K130 | KILLED | B32,B33 | host-mode first character may be `.`, `_` or `-` |
| K131 | KILLED | B27 | mods -1 accepted |
| K132 | KILLED | B19 | mods 15 refused |
| K133 | KILLED | B42 | uppercase letters are key tokens |
| K134 | KILLED | B43,B44,B45,B46 | legacy key names (Esc, Left, Spacebar) are key tokens |
| K135 | KILLED | B15,B16,B17,B18,B19,B20,B21,B22,B23,B25,B26,B27,B28,B29,B30,B31,B32,B33,B34,B35,B36,B37,B38,B39,B40,B41,B42,B43,B44,B... | shift bit ignored for every key in the duplicate check |
| K136 | KILLED | B85,B86,B87,B88 | shift bit never ignored in the duplicate check |
| K137 | KILLED | B15,B16,B17,B18,B19,B20,B21,B22,B23,B25,B26,B27,B28,B29,B30,B31,B32,B33,B34,B35,B36,B37,B38,B39,B40,B41,B42,B43,B44,B... | duplicate check compares only the shift bit |
| K138 | KILLED | B15,B16,B17,B18,B19,B20,B21,B22,B23,B25,B26,B27,B28,B29,B30,B31,B32,B33,B34,B35,B36,B37,B38,B39,B40,B41,B42,B43,B44,B... | duplicate check ignores the mode |
| K139 | KILLED | B84 | Tab refused only in normal mode |
| K140 | KILLED | B82,B83 | Tab refused only with mods 0 |
| K141 | KILLED | B91 | escape rule satisfied by an Escape row with any mods |
| K142 | KILLED | B92 | escape rule not applied to marquee |
| K143 | KILLED | B30,B31,B32,B33,B34,B35,B36,B37,B38,B39,B40,B41,B109,B110 | escape rule checked before the rows |
| K144 | KILLED | B102 | key token checked before mods |
| K145 | KILLED | B103 | action type checked before the key token |
| K146 | KILLED | B105 | Tab checked before the action fields |
| K147 | KILLED | B104,B105,B106 | Tab rows found in a first pass over the whole table |
| K148 | KILLED | B108 | closed-row check interleaved with the per-row checks |
| K149 | KILLED | B60,B61,B62,B67,B71 | extra action fields tolerated |
| K150 | KILLED | B14 | empty table refused |
| K151 | KILLED | B64 | zoom factor given as a string accepted |
| K152 | KILLED | B73 | spatial extend 1 or 0 accepted as a boolean |
| K153 | KILLED | B55,B56 | action type compared case-insensitively |
| K154 | KILLED | X89,X130,X171 | signature compared on its first four bytes only |
| K155 | KILLED | X99,X100,X133,X169 | trailing bytes shorter than a chunk ignored |
| K156 | KILLED | X94,X95,X134,X170 | IHDR length 13 not required |
| K157 | KILLED | X93,X132 | first chunk not required to be IHDR |
| K158 | KILLED | X96,X97,X98,X131,X168 | last chunk not required to be IEND |
| K159 | KILLED | X111,X112,X113 | existing chunk CRCs verified by embed |
| K160 | KILLED | X126,X129,X156 | chunk CRCs verified by read |
| K161 | KILLED | X126,X156 | CRC of the binding chunk verified by read |
| K162 | KILLED | X156 | chunk CRCs verified in bundle verification |
| K163 | KILLED | X119,X120,X128,X164 | any chunk type whose data begins igr-export + NUL is a binding chunk |
| K164 | KILLED | X118 | binding keyword and chunk type compared case-insensitively |
| K165 | KILLED | X116,X117,X128,X163 | binding chunk detected by the keyword without the NUL |
| K166 | KILLED | X121 | embed looks for an existing binding only right after IHDR |
| K167 | KILLED | X122,X123 | embed refuses only an existing binding whose text matches the template |
| K168 | KILLED | X111,X112,X113,X115,X116,X117,X118,X119,X120,X173,X174,X177 | the binding chunk inserted before IEND instead of after IHDR |
| K169 | KILLED | X135,X136,X137,X165 | read returns the first of several binding chunks |
| K170 | KILLED | X144,X167 | binding text matched with `$` (a trailing LF accepted) |
| K171 | KILLED | X139,X166 | binding text accepts uppercase hex |
| K172 | KILLED | X104 | embed accepts uppercase hex hashes |
| K173 | KILLED | X108 | embed hash check with `$` (a trailing LF accepted) |
| K174 | KILLED | X174,X177 | IHDR size read little-endian |
| K175 | KILLED | X176 | expectedPngSize compares the width only |
| K176 | KILLED | X175 | expectedPngSize compares the height only |
| K177 | KILLED | X163,X164 | a bundle png without a binding chunk accepted |
| K178 | KILLED | X159 | bundle verification does not compare the scene hash of the binding |
| K179 | KILLED | X160 | bundle verification does not compare the layout hash of the binding |
| K180 | KILLED | X161 | bundle verification does not compare the state hash of the binding |
| K181 | KILLED | X157 | bundle verification requires a 1x1 png |
| K182 | KILLED | X31,X32,X33,X34,X35,X36,X37,X38,X39,X40,X41,X42,X43,X44,X86 | invalid JSON reported as NON_CANONICAL |
| K183 | KILLED | X77,X78,X79,X80,X81,X82,X83,X84,X85,X87 | canonical bytes not checked |
| K184 | KILLED | X58,X76 | canonical bytes checked before the schema |
| K185 | KILLED | X77,X78,X83,X84,X85,X87 | whitespace ignored by the canonical-bytes check |
| K186 | KILLED | X79,X80 | key order ignored by the canonical-bytes check (the input order is kept) |
| K187 | KILLED | X81,X82 | escapes (\u0069, \/) normalised by the canonical-bytes check |
| K188 | KILLED | X75 | artifact name and sort order judged in one pass |
| K189 | KILLED | X72 | artifact names compared case-insensitively |
| K190 | KILLED | X56 | a negative bytes accepted |
| K191 | KILLED | X59 | a bytes above 2^53 - 1 accepted |
| K192 | KILLED | X51 | uppercase hex accepted in manifest hashes |
| K193 | KILLED | X52,X55 | a 63-digit hash accepted |
| K194 | KILLED | X50 | the igr value not compared |
| K195 | KILLED | X49 | the export value not compared |
| K196 | KILLED | X71 | a repeated artifact name accepted |
| K197 | KILLED | X67,X68,X69,X70,X76 | required entries not checked |
| K198 | KILLED | X45,X46,X47,X48 | a manifest that is not an object accepted |
| K199 | KILLED | X61 | extra keys in an artifact entry accepted |
| K200 | KILLED | X87,X88 | listed files compared before the strict manifest reader |
| K201 | KILLED | B114,B115,B116,B117,B118,B119,B174 | pan dx and dy not range-checked (any integer accepted) |
| K202 | KILLED | B114,B115,B118,B174 | pan dx not range-checked |
| K203 | KILLED | B116,B117,B119 | pan dy not range-checked |
| K204 | KILLED | B115,B117,B119 | pan lower bound not checked (only the upper bound) |
| K205 | KILLED | B111 | pan upper bound 2^31 refused (strict below 2^31) |
| K206 | KILLED | B111 | pan lower bound -2^31 refused (strict above -2^31) |
| K207 | KILLED | B120,B121,B122,B123,B124 | zoom factor not range-checked (any integer accepted) |
| K208 | KILLED | B120 | zoom factor 0 accepted (lower bound 0 instead of 1) |
| K209 | KILLED | B120,B121 | zoom lower bound not checked (negative factors accepted) |
| K210 | KILLED | B112 | zoom factor 1000000 refused (strict below 1,000,000) |
| K211 | KILLED | B122,B123,B124 | zoom upper bound not checked |
| K212 | KILLED | B125,B126,B127,B128,B129 | any string accepted as a spatial dir |
| K213 | KILLED | B126 | spatial dir compared case-insensitively |
| K214 | KILLED | B128,B129 | spatial dir trimmed of white space before the comparison |
| K215 | KILLED | B130,B131,B132,B133,B134 | any string accepted as an endpoint end |
| K216 | KILLED | B131 | endpoint end compared case-insensitively |
| K217 | KILLED | B133 | endpoint end trimmed of white space before the comparison |
| K218 | KILLED | B135,B136,B137 | any integer accepted as a step delta |
| K219 | KILLED | B138,B139,B140 | any integer accepted as an incident delta |
| K220 | KILLED | B136,B139 | delta 0 accepted |
| K221 | KILLED | B135,B138 | any positive integer accepted as a delta |
| K222 | KILLED | B141,B142,B143,B144,B145,B169 | a non-string mode reported as SCHEMA instead of INVALID_VALUE |
| K223 | KILLED | B144 | mode converted with String() before the check (an array holding normal accepted) |
| K224 | KILLED | B146,B147,B148,B149,B170 | mods converted with Number() before the check (null, false, an empty array read as 0) |
| K225 | KILLED | B151,B152,B153,B154,B155,B171 | a non-string key reported as INVALID_VALUE instead of UNKNOWN_KEY |
| K226 | KILLED | B151,B152,B153,B154,B155,B171 | a non-string key reported as SCHEMA instead of UNKNOWN_KEY |
| K227 | KILLED | B151,B154 | key converted with String() before the check (an array holding a accepted) |
| K228 | KILLED | B156,B157,B158,B159,B160,B161,B173 | an action that is not an object reported as SCHEMA instead of UNKNOWN_ACTION |
| K229 | KILLED | B162,B163,B164,B165,B166,B167,B168 | an action without a string type reported as INVALID_VALUE instead of UNKNOWN_ACTION |
| K230 | KILLED | B156,B173 | an action given as a string read as its type |
| K231 | KILLED | B167 | an action type converted with String() (an array holding fit read as fit) |
| K232 | KILLED | B174 | Tab checked before the action fields |
| K233 | KILLED | X223,X224,X226 | embed checks the container before the hashes |
| K234 | KILLED | X227,X228 | embed checks the already-bound state before the container |
| K235 | KILLED | X225,X226,X227,X228 | embed checks the already-bound state before the hashes |
| K236 | KILLED | X233,X234 | embed ignores extra keys of the binding object |
| K237 | KILLED | X236,X237,X238,X239,X240,X241,X242,X243,X244,X245,X253,X257,X259 | chunk types not checked |
| K238 | KILLED | X237,X238,X239,X240,X242,X243,X244,X245,X257,X259 | only the first byte of a chunk type checked |
| K239 | KILLED | X237,X244 | the fourth byte of a chunk type not checked |
| K240 | KILLED | X242,X259 | 0x5B accepted as a letter (range A to [) |
| K241 | KILLED | X241 | 0x40 accepted as a letter (range @ to Z) |
| K242 | KILLED | X244 | 0x7B accepted as a letter (range a to {) |
| K243 | KILLED | X243 | 0x60 accepted as a letter (range ` to z) |
| K244 | KILLED | X245 | Latin-1 letters accepted in a chunk type |
| K245 | KILLED | X236,X237,X253 | digits accepted in a chunk type |
| K246 | KILLED | X247 | the first chunk compared to IHDR case-insensitively |
| K247 | KILLED | X248 | the last chunk compared to IEND case-insensitively |
| K248 | KILLED | X249,X250,X254,X258 | IEND length not required to be 0 |
| K249 | KILLED | X178,X180 | a leading byte order mark skipped |
| K250 | KILLED | X181,X182,X183,X184,X185,X186 | invalid UTF-8 decoded with replacement characters |
| K251 | KILLED | X183 | UTF-8 encoded surrogates (ED A0 80) accepted |
| K252 | KILLED | X191,X192,X193,X194 | the first value of a repeated key read instead of the last |
| K253 | KILLED | X189,X190,X191,X193,X195 | a duplicate key reported as a syntax fault (SCHEMA) |
| K254 | KILLED | X189,X190,X191,X193 | a duplicate key not detected by the canonical-bytes check |
| K255 | KILLED | X197,X198,X199,X200,X201,X202,X203,X204,X205,X206,X207,X208 | numbers compared by value in the canonical-bytes check (398.0 and 1e2 accepted) |
| K256 | KILLED | X197,X198,X199,X200,X201,X202,X203,X204,X205,X206,X207,X208 | a number spelled with a fraction or an exponent reported as SCHEMA instead of NON_CANONICAL |
| K257 | KILLED | X209 | -0 read as 0 and reported as NON_CANONICAL instead of SCHEMA |
| K258 | KILLED | X210,X211,X212,X213,X215 | a lone surrogate escape reported as a syntax fault (SCHEMA) |
| K259 | KILLED | X216,X217,X222 | artifact names judged before the closed key set and value types (entry order of passes swapped) |
| K260 | KILLED | X195,X196,X218,X219,X220 | canonical bytes judged right after the value-type pass, before names and order |
| K261 | KILLED | X196,X218,X220 | canonical bytes judged after the name pass but before the order pass |
| K262 | KILLED | X260,X261,X262,X263 | expectedPngSize checked (and mismatching) even when no png is supplied |
| K263 | KILLED | X264,X265,X266 | a non-integer expectedPngSize reported as a configuration error instead of PNG_SIZE_MISMATCH |
| K264 | KILLED | X267,X268,X269 | an expectedPngSize dimension of 0 treated as any size |
| K265 | KILLED | X272,X273 | expectedPngSize compared modulo 2^32 |
| K266 | KILLED | X270,X271 | expectedPngSize compared by absolute value |
| K267 | KILLED | X266 | expectedPngSize rounded before the comparison |
| K268 | KILLED | X267,X268,X269 | a falsy expectedPngSize dimension skips the check |
| K269 | KILLED | E97 | last_t: upper bound not checked |
| K270 | KILLED | E98 | last_t: lower bound not checked |
| K271 | KILLED | E74,E76,E77 | last_t: the upper limit value itself refused (off by one) |
| K272 | KILLED | E60 | last_t: the lower limit value itself refused (off by one) |
| K273 | KILLED | E79,E99 | pointer x: upper bound not checked |
| K274 | KILLED | E80 | pointer x: lower bound not checked |
| K275 | KILLED | E74,E77 | pointer x: the upper limit value itself refused (off by one) |
| K276 | KILLED | E75,E78 | pointer x: the lower limit value itself refused (off by one) |
| K277 | KILLED | E81 | pointer x0: upper bound not checked |
| K278 | KILLED | E82 | pointer x0: lower bound not checked |
| K279 | KILLED | E74,E77 | pointer x0: the upper limit value itself refused (off by one) |
| K280 | KILLED | E75,E78 | pointer x0: the lower limit value itself refused (off by one) |
| K281 | KILLED | E83 | pointer y: upper bound not checked |
| K282 | KILLED | E84 | pointer y: lower bound not checked |
| K283 | KILLED | E74,E77 | pointer y: the upper limit value itself refused (off by one) |
| K284 | KILLED | E75,E78 | pointer y: the lower limit value itself refused (off by one) |
| K285 | KILLED | E85 | pointer y0: upper bound not checked |
| K286 | KILLED | E86,E100 | pointer y0: lower bound not checked |
| K287 | KILLED | E74,E77 | pointer y0: the upper limit value itself refused (off by one) |
| K288 | KILLED | E75,E78 | pointer y0: the lower limit value itself refused (off by one) |
| K289 | KILLED | E87,E101 | pointer t0: upper bound not checked |
| K290 | KILLED | E88 | pointer t0: lower bound not checked |
| K291 | KILLED | E74,E77 | pointer t0: the upper limit value itself refused (off by one) |
| K292 | KILLED | E75,E77,E78 | pointer t0: the lower limit value itself refused (off by one) |
| K293 | KILLED | E89,E102 | pointer id: upper bound not checked |
| K294 | KILLED | E90 | pointer id: lower bound not checked |
| K295 | KILLED | E74,E77 | pointer id: the upper limit value itself refused (off by one) |
| K296 | KILLED | E75,E77,E78 | pointer id: the lower limit value itself refused (off by one) |
| K297 | KILLED | E91 | pinch mx: upper bound not checked |
| K298 | KILLED | E92 | pinch mx: lower bound not checked |
| K299 | KILLED | E77 | pinch mx: the upper limit value itself refused (off by one) |
| K300 | KILLED | E78 | pinch mx: the lower limit value itself refused (off by one) |
| K301 | KILLED | E93 | pinch my: upper bound not checked |
| K302 | KILLED | E94 | pinch my: lower bound not checked |
| K303 | KILLED | E77 | pinch my: the upper limit value itself refused (off by one) |
| K304 | KILLED | E78 | pinch my: the lower limit value itself refused (off by one) |
| K305 | KILLED | E95 | pinch d: upper bound not checked |
| K306 | KILLED | E96 | pinch d: lower bound not checked |
| K307 | KILLED | E77 | pinch d: the upper limit value itself refused (off by one) |
| K308 | KILLED | E78 | pinch d: the lower limit value itself refused (off by one) |
| K309 | KILLED | E79,E80,E81,E82,E83,E84,E85,E86,E87,E88,E89,E90,E91,E92,E93,E94,E95,E96,E99,E100,E101,E102 | pointer and pinch fields not range-checked (the rev 3 reading, 'not range-checked again') |
| K310 | KILLED | E99,E100,E101,E102 | pointer ranges checked on the first pointer only |
| K311 | KILLED | X227,X248,X251,X252,X256 | K158 restated (correction): last chunk not required to be IEND, the 45-byte minimum kept; X97 (33 bytes) is refused by the minimum and does not kill it, rows of at least 45 bytes do |

`K311` restates `K158` (the correction, see `AMBIGUITIES.md`): `K158` names `X97`, a 33-byte file that the 45-byte minimum refuses before the IEND rule, so it does not kill that mutation.

## Rows that claim no bytes, and items outside the oracle (design 15.3, 15.7)

**Accepted rows** (`expected` and `error` both empty) claim only that the function returns without error and claim **no bytes**: B02, B14, B15, B16, B17, B18, B19, B20, B21, B22, B23, B24, B25, B26, B111, B112, B113, E01, E24, E25, E26, E27, E28, E29, E30, E31, E32, E44, E56, E60, E73, E74, E75, E76, E77, E78, X10, X27, X28, X29, X30, X156, X157, X158, X172 (45 rows).
Error rows (`error` set, `expected` empty) claim the error code only. An empty plan (`P03`) is a zero-byte file named in `expected`.

Tested only in the TypeScript tranche, with **no oracle bytes and no row that claims any** (cannot be built in Python, `AMBIGUITIES.md` A-60 to A-64): the binder, `mountCompanion`, adapter focus restoration and `COMPANION_CSS`;
`verifyCompanionTree`, `maxTreeBytes`, the executor guards (the simulated DOM here has them, `gen.py` self-checks them, no row asserts them) and the `INVALID_TREE/INCONSISTENT` planner assertion; properties I1-I5, I-C1 on random inputs and tier D;
the `2^31` omission of the reveal; the TypeScript mutation `K84` (`not-applicable` here; `C16`, `I51` carry bytes); the reducer part of `H05` (an error row, no bytes). Nothing in `EXPECT.tsv` names these items except the rows just mentioned.

## Revision 4 round (rows only, appended)

Design 32 rev 4 folded the owner-adopted rules R32-01 to R32-13 and R32-16 (text only; no Appendix A byte changed). `tools/gaps2.py` (self-contained Python reference of 6.4, 11.2-11.5 and 5.1 as rev 4 reads them) adds rows and mutants only; **no earlier file, row or line changed**: the old `EXPECT.tsv`, `MUTANTS.tsv` and `AMBIGUITIES.md` are exact prefixes of the new ones and every other earlier file is byte-identical (the owner's append-only check).

| Family | Added | Ids | Content |
|---|---|---|---|
| B | 64 | B111-B174 | pan and zoom domains (R32-02), value sets of `dir`, `end`, `delta` (R32-03), wrong JSON type of `mode`, `mods`, `key`, `action` and the order of those checks (R32-04) |
| E | 29 | E74-E102 | `parseMachine` pointer-field ranges (R32-10): the limit accepted and one beyond refused for `last_t`, `x`, `x0`, `y`, `y0`, `t0`, `id`, pinch `d`, `mx`, `my`, and for the second pointer |
| X | 98 | X178-X275 | manifest bytes: BOM, invalid UTF-8, duplicate keys, number spellings, lone surrogates, `-0` (R32-07); whole-manifest passes (R32-08); embed check order and the closed binding object (R32-06); chunk types, `IEND` length, rows of at least 45 bytes without `IEND` (R32-05, the `K158` correction); `expectedPngSize` (R32-09) |
| K | 111 | K201-K311 | mutants of those rows (every one killed by at least one row, by a new row except `K272`, the lower limit of `last_t`, whose killer is the earlier row `E60`; `K311` is the correction of `K158`) |

Rules that need no row (R32-01 carried by `X31`-`X48`, R32-11, R32-12, R32-13, R32-16 text only; R32-14, R32-15 open) and the new ambiguities are in `AMBIGUITIES.md` (sections `R32 rule -> carrying rows`, `A-85` to `A-94`). "Earlier rows" of R32-01 and all single-fault rows still hold under the rev 4 text (the new reference agrees with every earlier row it can evaluate: see `AMBIGUITIES.md`).
The digest of `SHA256SUMS` is reported with the round and is **not** stored here (this README is covered by it). `APPENDIX-A.tsv` and `PARITY.tsv` are unchanged.

## Notes

* `X24` is an oversize input recorded as a generated vector (`generated/GENERATED.tsv`): 1,048,577 bytes of 0x41, one over the 1,048,576-byte manifest limit.
* No row needed a search-built input; no seeded search is recorded. Tier D has no files by design.
* Expected files are never regenerated to make code pass; additions take new ids (design 0.12).
