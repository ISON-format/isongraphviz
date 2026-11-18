# Ambiguities, contradictions and defects found in design 30 (rev 2, re-checked against rev 3)

Every place where the design text was ambiguous, contradictory or could not be implemented as written, with the
section it concerns, the literal reading the generator uses, and why. Section numbers without a prefix are
sections of design 30 (`30-SVG-RENDERER-DESIGN.md`); `27 §n` is the IGR/1 design (rev 5); `IGS §n` / `IGL §n` are the
frozen specifications. Nothing here was "fixed": where the design and the generator's output disagree, both values
are given. The entries are numbered A-01 to A-61; **A-01 to A-07 are defects of the design** (something in it cannot
be right as written), A-08 to A-53 are underspecifications or choices written against rev 2; A-54 to A-61 are new (found while regenerating against rev 3).

## Defects (the text contradicts itself, the frozen specifications, or cannot be built)

**A-01. Self-loop path grammar has two numbers too many (5.2 vs 6.6 and A.8).** The production
`'M ' NUM ' ' NUM ' C ' NUM x8` (5.2, last `D` alternative) has eight numbers after `C`. A cubic Bezier needs six, rule 6.6
writes `C (X-(7+u)e6) (Y-(7+h)e6) (X+(7+u)e6) (Y-(7+h)e6) (X+7e6) (Y-7e6)` = six, and the worked example in A.8
(`M 860.928 399.4 C 852.928 375.4 882.928 375.4 874.928 399.4`) has six. Reading used: **six** (the generator
reproduces A.8 byte for byte; the strict reader of the generator accepts six). A literal reader of 5.2 would reject
every self-loop of the corpus (rows G02, N08, T16 and the loops inside their documents).

**A-02. X13 and mutant K60 cannot be built (15.4 X13, 15.5 `ten`, 15.6 K60, 7.4).** X13 asks for ten categories
"authored so that scene order differs from UTF-8 sorted order", and K60 is "category index by first appearance, not
UTF-8 order". IGS §5.5 sorts the scene's nodes by `type` (UTF-8 bytes) first, and a layout is in the same order
(IGL §5), and `verifyScene` rejects any other order (`NON_CANONICAL`). The first appearance of a category in scene order
is therefore always its UTF-8 sorted position: **no valid scene can separate K60 from the correct rule.** Result: K60 is
unkillable (the full mutant run changes no row of the corpus, see `MUTANTS.tsv`). X13 is built with ten categories
`c0`..`c9` (one node each; classes `igr-k0`..`igr-k7`, `igr-kx` twice), which kills K59 (index mod 8). Suggestion:
drop K60 or define it on something that is not scene order.

**A-03. X10 cannot put TAB, LF, CR into categories and relations (15.4 X10, 5.1, 7.2).** IGS §1.2: `type` and `rel`
"are Core identifiers: non-empty, no whitespace". TAB, LF and CR are whitespace (the JavaScript set quoted in 27 §4.2).
Only node **labels** (the id text of a `s:` id) can carry them. X10 therefore carries the three characters in labels
only: `aria-label` and `<title>` of nodes and the `<desc>` of the incident edges show them; edge names (the relation)
never contain them. The text "in labels, categories and relations" is not buildable for the last two.

**A-04. IGR-CJ/1 cannot carry the data several expected files need (15.3 "oracle-author-defined formats").** The design
says the files `json/T01.ids.json`, `T02/T15/T16.chain.json`, `T31.pick.json` are "serialized as IGR-CJ/1 bytes", but
IGR-CJ/1 forbids `null` and floating point (27 §3) while `expect: ElementAddress | null` needs "none" and a pointer
position such as `184.517` is a double (`T17` is already declared "ordinary JSON, doubles allowed"). Reading used:
`T01.ids.json`, `U06.*.manifest.json`, `U09.*.witness.json` are IGR-CJ/1 bytes (no trailing newline; an undecodable id
is an entry **without** an `address` key, never `null`); every other file of `json/` is ordinary JSON written with
`indent=1`, sorted keys, ASCII escapes and one trailing LF, and may contain `null` and doubles.

**A-05. T31 (and T17) span two scenes, but one row names one scene and one layout (15.3, 15.4 T17, T31).** T31 is
specified on `O1 + F01` (zoom 10) **and** on `O4 + F02`; T17 on `mixed20 + F04` **and** on `O4 + F02`. Reading used: the
row's `scene`/`layout` cells name the first pair, and the second pair is named in the inline `input` under `"also"`
(for T31 the per-case scene is also repeated in the expected file). The alternative (splitting into new ids) would change
the id count of 15.8.

**A-06. U09 expects two witness files but a row has one `expected` cell (15.3 `json/U09.*.witness.json`, 15.4 U09).**
The row names `G01` in its scene/layout cells and its inline `input` lists both cases
(`svg/G01.svg` -> `json/U09.G01.witness.json`, `svg/G05.svg` -> `json/U09.G05.witness.json`); the `expected` cell holds the
first file. The same applies to `U06` (two manifests).

## Contradictions with, or gaps against, frozen text

**A-07. Mutants whose named killer rows cannot kill (15.6 vs the rows).** Measured by the generator (full run of every
mutant over every row, `MUTANTS.tsv`, README table): **K01** is named killed by N01, N11 and N12 but only N01 changes
(a double-based `toFixed(3)` prints the 2^53-scale coordinates of N11/N12 identically: 4.5e10 px has spacing 7.6e-6 px,
the printed third decimal is not near a tie); **K44** (writer emits JSON with spaces or unsorted keys) is named killed by
X01 and T03, but T03 only exercises the decoder, so only X01 kills; **K68** (`maxSvgBytes` boundary exclusive) is named
F01 and F02, but F02 (one byte less, refused either way) cannot distinguish it, only F01 does. These are defects of the
vector list in the sense of 27 §13.1; they were reported, not repaired.

**A-08. `SvgNode.address` and `SvgEdge.address` (5.6): wire address or `ElementAddress`?** 5.6 says
"`address`" without saying which; the witness (12.4) uses wire references for `elements` and `ElementAddress` for `texts`.
Reading used in the generator's reader: the **wire** address (the unwrapped `{id,type}` / `{ord,rel,src,tgt}` object), kind
being known from the element. Row T14 hashes a projection of the readout whose exact JSON is defined in the README
("T14 projection"), so a TypeScript reader with another shape only has to map its readout to that projection.

**A-09. Lifecycle script vocabulary for U rows (15.3 "one more op `svg`").** The design adds the op `svg` with `expect_svg` /
`expect` and says `expect_fidelity` is "as in 15.3", but the U rows also need: constructing a renderer with options
(U04, U07, U08, U12), a probe expectation, export bytes, a listener that calls `svg()` inside `onEvent` (U03). Reading used and
documented in the README: ops `create` (arg = `SvgRendererOptions`, replaces the renderer, phase `created`), `probe` with
`expect_fidelity` = the full `fidelity` object of 12.3, `export` with `expect_media_type` and either `expect_bytes` (a path:
the scene file) or `expect_bytes_sha256`, top-level `"listener": "svg-inside"` with `expect_listener_svgs` (paths, or a
`CODE/REASON` string), top-level `subject_options` for the first renderer. The script files are **outputs** of the
generator (their `expect*` fields come from the reference simulation), so they change under mutants.

**A-10. Rows U10, U11, U12 are "no files" rows but mutants K101, K102, K106 name U11, U04, U06/U12 as killers.** To make
those mutants checkable the generator records its computed outcomes in `json/U11.witness-honesty.json` (kit check `W01`
and the level), `json/U12.cap.json` (manifest bytes equal, fidelity consistent, `CHK-CAP`) and `json/U13.render.json`; their
inline `input` describes the test double / options. `U10` stays a pure inline expectation (verdict not `fail`, level 2,
`claimable: false`); no mutant names it. The real kit run is not reproducible in Python.

**A-11. State files of Y14 and Y15 (15.4 Y14, Y15; K72).** K72 ("state not validated") is named killed by Y14/Y15, but a harness
that loads these files with `parseState` fails before `renderSvg` is called, which would not exercise `renderSvg`'s own
validation (2.1 step 4). Reading used: for these two rows the state file is read with plain JSON (`JSON.parse`), the object
is handed to `renderSvg` (and the subject), and the expected error is `INVALID_STATE/SCENE_MISMATCH` (Y14: the initial state of
`O4 + F02`) and `INVALID_STATE/NON_CANONICAL` (Y15: selection `[s:ann, i:1]`, canonical key order but nodes out of scene order).

**A-12. `resolveSelection` identity cannot be produced without the ISON compiler (9.2 RT-B, T02, T15, T16).** The expected
`identity` is `{kind, address, artifact_sha256}`; the generator does not compile ISON. It asserts that the SHA-256 of the
source file equals the model's `artifact_sha256` and relies on the IGS §9 round trip property (every scene element
resolves) to write the identity. Provenance of that part of T02/T15/T16 is therefore "design rule + source hash", not an
independent resolution.

## Underspecified or choices made

**A-13. Option validation order (2.1 step 3, "in alphabetical order").** Taken as the alphabetical order of the key names:
`edgeLabels, idPrefix, labels, maxDrawnLabelUnits, maxSvgBytes, style, xmlDeclaration`. No row has two simultaneous faults,
so the order is not observable in the corpus.

**A-14. The `"NaN"` token (15.3).** The corpus-reader convention turns the strings `"NaN"`, `"Infinity"`, `"-Infinity"` into the
doubles wherever a number is expected; used for `O16` (`"maxSvgBytes": "NaN"` -> `NOT_FINITE`). A string anywhere else is `SCHEMA`.

**A-15. O20 (`{"style": null}`).** The text says an own `undefined` property is absent (a unit test) and JSON cannot write it,
but also lists `null` -> `SCHEMA`. The row is the `null` case (`INVALID_INPUT/SCHEMA`); the `undefined` case is not in the corpus.

**A-16. N01 residues (15.4 N01).** "six nodes whose centres have residues mod 1000 micro-pixels of 499, 500, 501, 1499, 1500, 1501
and the same negated (both axes)". With a minimum zoom of 10 no single viewport can give those exact screen values to all
nodes, so the corpus uses twelve nodes (six positive targets, six negative, the negated ones with `X < 0`, `Y < 0`) whose
screen coordinates `X`, `Y` at zoom 1999 have the required residue modulo 1000 **and** the required parity of the thousands
digit (so 1499 differs from 499), found by search near the origin (recorded in `scenes/ties.scene.json` and the README).
Both axes carry targets (the y target of node `k` is the x target of node `k+2`).

**A-17. N02 (15.4).** "coordinates around zero: -0.0004, -0.0005, -0.0006, 0.0005 px": zoom 10 and the centre
`(50000*w, 50000*h)` make `X = 10*x`, `Y = 10*y`, so layout values -40, -50, -60, 50 give exactly those screen values (micro-pixels
-400, -500, -600, 500) on both axes; three undirected edges join the four nodes (all degenerate).

**A-18. N04-N06 share the scene `deg` (15.5 `deg`).** The three rows need three different distances; the scene holds the three
pairs and each row uses its own viewport (centred on its pair, zoom 1000, 900 x 600). The three documents differ in coordinates
and all contain all three edges, so a degenerate-test mutant changes all three; each row still isolates one boundary
(`L = 24e6`, `25e6`, `24e6 + 0.006 px`).

**A-19. N13 "centred between the nodes" (15.4).** Taken as the centre of A.2 (`383554, 134563`) with zoom 100000; N14 is the
same centre at zoom 10 (A.4).

**A-20. N10 "one member of each group hidden".** The explicit hidden set holds the edges `a->b R1` and `c->d R1`; the endpoints stay
visible, groups renumber (`k = 3` and `k = 2`).

**A-21. X04 "a 1,024-unit string id" (15.4).** Read as the **wire** id `s:` + 1,022 characters = 1,024 UTF-16 units (the label is
the 1,022-character text); the alternative (a label of 1,024 units) would make the wire id 1,026 units. FIXED layouts have no key
limit (IGL §7.2, `igl:B08`).

**A-22. The scene `hub` (15.4 F03-F05).** "one node with a 1,022-unit label and 200 incident edges": built as one hub with a
1,022-character string id, 200 leaf nodes `i:1`..`i:200` and 200 directed edges `hub -> leaf` (a self-loop alternative would
need 200 different relations). Positions are a 20 x 10 grid (integers). The default document is far over 262,144 bytes, which
makes F03 meaningful.

**A-23. Conflicting points (15.4 T02/T15/T16/T31).** The pointer values are doubles: the centre of a node is `X/10^6` (correctly
rounded division of the exact micro-pixel integer), the chord midpoint of an edge is `((Ax + Bx)/2)/10^6`. The pointer is
quantized by the hit rule (`q(p)*1000`), so a centre value may differ from the exact centre by under 1 micro-pixel; this cannot
change a verdict because the node radius is 12 px. A type-(m) point exists for an edge `e'` only when `hitTest` returns exactly
`e'` there (for the second member of a parallel group `hitTest` never does, so it has no (m) point). `pickElement` outcomes are
recorded as an index into the drawn order (`-1` none) to keep the files small; the generator asserts, when unmutated, the
rule of 15.4 independently of `pickElement` (node target: itself; edge target: the node for an (n) point, itself for an (m)
point).

**A-24. T14 (15.4).** The design asks that `readSvg` accepts every document of rows G, N, X, Y, O "and the readout agrees with
the row's model and state". The expected file is a list with, per document, the counts, a boolean `agrees_with_model` computed by
the generator's own comparison, and `readout_sha256` = SHA-256 of the IGR-CJ/1 bytes of a documented projection of the readout
(README). Rows that expect an error have no document and are not listed.

**A-25. T21 / T09 / T10 / T29 placement of the fault (5.6 single-fault rule).** To keep each bad file single-fault, the fault is
placed where no other rule looks: T21 uses `aria-describedby="igr-title"` (the design says "names another id"; changing
`aria-labelledby` would also break W1 because the prefix is derived from it, see A-26); T09 and T10 put `&foo;` and a raw
`<` in the **edge `<desc>`** (a node `<title>` would also break W6); T29 makes the node `<title>` span two lines **and** writes
the `aria-label` with `&#10;`, so that W6 holds after joining (the design's rev 0 defect shape).

**A-26. How the reader derives the prefix (5.6 W1, W2).** `idPrefix` of the readout = the `aria-labelledby` value minus the
suffix `-title`; element ids must start with `P-n-` / `P-e-` for that `P` (W1); `<title id>`, `<desc id>` and the marker id must be
`P-title`, `aria-describedby`, `P-arrow` (W2). 5.6 does not say where `P` comes from; any other choice makes T21 two-fault.

**A-27. Label elision and `fidelity.labels` (7.5d).** `"elided"` iff some drawn label was truncated (its drawn text differs from
`xs` of the label with TAB/LF/CR replaced) **or** omitted by the budget; an empty label is not "elided" (7.5b says it has nothing to
draw); `labels: false` gives `"none"`, `label_units 0`, `edge_labels false`; `edgeLabels: false` with `labels: true` is `"full"` or
`"elided"` as the node labels decide (edge labels are not "omitted by (c)").

**A-28. Budget walk (7.5c).** "would-be `<text>` elements" are the visible nodes with a non-empty `dl`, then the visible edges (only
when edge labels are on). An element with an empty `dl` is neither counted nor does it stop the walk.

**A-29. Manifest with `style: false` (12.2).** `direction-cue` and `indicators.non-color` are "declared for a styled document";
nothing says the status changes when `style` is false. Reading used: they stay `supported` (the manifest depends on `style` in no
field). `labels.edge` degrades only for `labels: false` or `edgeLabels: false`.

**A-30. `capacity.maxDrawnLabelUnits` / `svg.maxDrawnLabelUnits` (12.2).** If only the `svg` value is given the capacity takes it
(and the reverse); U12 gives only the capacity value (77) and U07 gives two different values (`INVALID_VALUE`).

**A-31. `U03` (called from inside `onEvent`).** Modelled as a listener `svg-inside` that calls `svg()` once per `dispatch` after
the commit; the expected document is that of the committed state (`svg/U03.l0.svg`).

**A-32. `U04` (reduced motion).** `initialize` gets `reducedMotion: true`, then `setReducedMotion(false)`; `motion` is `"none"` in all
probes (12.3). Also recorded: a probe after switching to `labels: false` and to `edgeLabels: false` renderers (`create` op).

**A-33. `U05` (export).** `export("scene")` is expected to report media type `application/octet-stream` and the scene file bytes (the
script field `expect_bytes` holds the path of the scene file); `""` and `"SVG"` are `INVALID_INPUT/UNKNOWN_FORMAT` (27 §9 rule 9).

**A-34. `U07`.** The six invalid-option `create` calls use the option values of O10, O11, O15, O16, O17, O18 (not O12, O13, O14, O19) plus the
capacity/svg conflict.

**A-35. `F05` (15.4).** Besides "at most 4,096 bytes" the file records the exact number of delivered bytes and lines
(`sink_bytes`, `sink_lines`): each delivered line includes its LF and the refused line is not delivered (2.1, 14.2), so the
count is deterministic (4,083 bytes in 59 lines for the corpus `hub`). A subject may check the exact number or only the bound.

**A-36. `T27`.** The `maxLineUnits` check uses `maxLineUnits: 100` on `G01` (its root line is 488 units); only the result
(`RESOURCE_LIMIT/BYTES_LIMIT`) is recorded.

**A-37. `T28`.** The over-long id (4,194,306 hex digits = a 2,097,153-byte JSON text) is generated, not stored; its length and SHA-256 are
in `generated/GENERATED.tsv` (as the earlier corpora record oversize files). The second case (JSON nested four levels,
`{"a":{"b":{"c":{"d":"x"}}}}`) is `undefined` for two reasons (depth and key shape), so only the first case separates K81.

**A-38. T18 (15.4).** Cases: hidden node id (alone, with a point on its old position), hidden edge id (alone, with a point on the
chord), an id that decodes but names no element (alone, with a point on `i:1`), an undecodable id (alone, with a point on `i:1`), a
visible node id, and a point alone. Results are `pickElement` results (`null` = none).

**A-39. Frozen rows used by number.** `igl:V45`, `V46` are layouts in `../oracles-igl/verify/`; `G07` uses `keybound` + `F13`; `X05`
uses `igl:S18` + `igl:X05` (the layout file is `layouts/X05.layout.json`).

**A-40. K-mutant definitions that 15.6 leaves open.** Implemented as: K01 `Number(v)/1e6` printed with `toFixed(3)` and trailing
zeros stripped; K03 a `-0` when the milli value is 0 and `v < 0`; K05 ties toward -infinity; K16 `sqrt` in doubles compared with 24e6;
K17 trimmed (12 px each end) whenever `L > 0`; K18 `NaN` text for coincident nodes; K22 loop marker on undirected graphs; K23 frame
vector `B - A` of the edge itself; K27 curve trimmed toward the other endpoint; K28 loop anchor `25 + 8r`; K39 the high surrogate of a cut pair
is kept (it prints as U+FFFD, as UTF-8 encoding of a lone surrogate would); K40 cut at 25 units (24 + ellipsis); K41 names passed through `dl`
and trimmed; K44 JSON with spaces and insertion order; K45 hex of UTF-16LE; K47 the `i:`/`s:` tags dropped from ids; K53 two tab stops
(focus and the first model node, which can also be hidden = none); K55 focus ring before selection ring, halos after the line; K58
zero treated as singular; K63 marker on the pick path; K73 declaration without LF; K76 `viewBox` from the layout bounds in px; K77 nodes
outside `[0,W] x [0,H]` and edges with both ends outside are dropped; K98 the chain maps an element to `model.nodes[p]` / `model.edges[p]` with `p` its document position;
K99 no visibility or existence check on the target id; K100 `hitTest` first; K102 `labels: full` while truncating; K104 the previous state;
K105 `export("svg")` returns bytes; K106 `labels.edge` always supported and the `dom` capacity defaults of `headless`; K107 `render()` runs the writer.
The generator's `MUT_TEXT` table (`tools/corpus.py`) lists all 113.

**A-41. Where the correct reference and a mutant could only differ in a field no row stores.** `render()` of a subject has no output, so K107 is checked
through `json/U13.render.json` (the outcome of `render()` and `svg()` under a lowered `maxSvgBytes`).

**A-42. A.1 gate wording (15.2).** The block is 3,193 bytes with the final LF (3,192 without); the generator compares with the
LF added, as the design states. Reproduced.

**A-43. Counts (15.8).** 247 ids, 130 with files or inline inputs; D and K rows have empty cells. The 38 rows with an `error` and no expected file
are the negative rows listed in `EXPECT.tsv`. `D` rows carry tier `subject`, `K` rows an empty tier (as 13.3a does for IGR/1).

**A-44. `tier core` rows with options (O02, O03, O04, O05-O09).** "tier core unless stated" and only O01 says `both`; the generator follows it
(O02-O04 core), although O02-O04 would also be meaningful for a subject built with those options (U07 covers the subject side).

**A-45. The scene `trunc3` (O09).** Built without edges, so the budget walk sees three nodes (3, 10, 1 units) and with limit 5 only the first is
drawn; with edges the monotone rule would be indistinguishable from the order of the nodes.

**A-46. `ids12` (X06).** The twelve hostile characters are used inside ids `s:a<c>b`; the edges join pairs of them so that edge ids and
descriptions contain them too. `|` and `:` are not used (IGL FORCE refuses them; FIXED accepts them, but 27 does not ask).

**A-47. K-rows and mutants that touch the readout (K82-K97, K113).** Each reader mutant is "the named rule disabled": the generator's reader has a
set of per-rule switches and the single-fault assertion of 5.6 is checked for every bad file at generation time (a reader with only the named
rule disabled accepts the file). T05 and T06 share the switch `attr` (K83), T07 and T08 share `crlf` + `indent` (K84).

**A-48. 15.2 "Owner decision 4".** Resolved by the coordinator's ruling in the task: the whole reference was re-implemented; no code or file of
earlier corpora was imported, copied or run (their READMEs and file formats were read).

**A-49. Lite verification only.** `verifyScene`, `verifyLayout`, `bindLayout` (the frozen TypeScript) were not run (not available to the oracle author,
15.2). The generator verifies its own scenes and layouts with a lite checker (canonical re-serialization, ordering, uniqueness, identifier rules,
undirected endpoint order, layout order and binding hash) and verifies that every frozen file it reads matches the checksum recorded in its own corpus.
A third party must still run the frozen verifiers over `scenes/` and `layouts/` and `parseState` over the accepted state files.

**A-50. Time-sensitive item: Python `float` vs binary64 (15.5a V3, K11).** V3 uses `math.sqrt` and `math.floor(qx*t/sqrt(n) + 0.5)` on `float(qx)*t`; Python
and JavaScript both use IEEE-754 binary64 with correctly rounded `sqrt`, multiplication and division, and `Number(bigint)` rounds to nearest like
`float(int)`; no divergence is expected, and no row depends on a value where the two could differ (N03 is checked by the real renderer under K11).

**A-51. `fmt` for values beyond 2^53 micro-pixels (3.2).** Integer arithmetic only (Python `int`): N11/N12 print all digits (A.8 reproduced).

**A-52. Rows whose expected bytes are exactly another row's bytes.** `F01` equals `G01`; `O04` has the length of `G01` (A.9). They are separate
files (one row, one file).

**A-53. Default renderer name in the manifest (12.2, U06).** 12.2 says `renderer.name` defaults to a string that contains the product name.
The task that produced this corpus forbids project names in any file, so `U06` records `svgManifest("headless", {name: "x-svg"})` and
`svgManifest("dom", {name: "x-svg"})` (the `name` is the only member that differs from the default call; every other byte is the
default manifest of 12.2) and the reference carries a neutral default name. A TypeScript test must compare `svgManifest(host, {name: "x-svg"})`
with these files and may check the default name separately.
