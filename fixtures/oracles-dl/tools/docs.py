"""README.md and AMBIGUITIES.md of the corpus (produced by the generator)."""
import base
from ktable import KROWS

FAM = [("G", "golden display lists"), ("N", "numbers and geometry"), ("X", "text"), ("Y", "state hooks"),
       ("O", "options and validation"), ("F", "size limits"), ("S", "the strict reader"),
       ("P", "pick buffer and pickDrawn"), ("B", "element bounds"), ("C", "the Canvas call stream"),
       ("Z", "device sizes"), ("R", "readouts"), ("U", "the Canvas renderer (lifecycle scripts, outcome files)"),
       ("D", "differential (runtime; no files)"), ("K", "mutants (empty cells)")]


def counts(outs):
    c = {}
    err = {}
    files = {}
    for r in base.ROWS:
        c[r.group] = c.get(r.group, 0) + 1
        o = outs.get(r.id)
        if o is not None and o.error:
            err[r.group] = err.get(r.group, 0) + 1
        if o is not None and (o.files or r.inp not in ("", None)):
            files[r.group] = files.get(r.group, 0) + 1
    return c, err


# -------------------------------------------------------------------- ambiguities
def ambiguities(res):
    A = []

    def add(sec, text, reading, why, kind=""):
        A.append((sec, text, reading, why, kind))

    add("4.7 D1 and D12; 13.3 S28-S31; K72-K74",
        "D1 lists the byte rules (CRLF, indentation, blank line, final LF) and D12 re-serializes the result and compares it with "
        "the input bytes. A CRLF, indented, blank-line or no-final-LF file therefore violates D12 as well, so the claim that "
        "\"each violation breaks exactly one rule\" and that a reader with only the named rule disabled accepts the file is false "
        "for S28-S31 under a literal D12.",
        "A disabled D1 byte rule is read as a *tolerant lexer*: the tolerated byte (trailing CR, leading blanks, a missing final LF, "
        "a blank line) is dropped before the other rules and before D12, which then compares the normalized lines. Under this reading "
        "S28-S31 are single-fault and K72, K73, K74 are killed by S28, S29/S31, S30.",
        "A literal D12 over the raw bytes makes K72, K73 (S29) and K74 equivalent mutants (no row can separate them). The design "
        "should say that D12 applies after the D1 normalization, or name mutants that also disable D12. DESIGN DEFECT (clarity).")
    add("4.7 D1 nesting; 13.3 S32; K87",
        "S32 is \"JSON nesting depth 4 (outside strings)\" and the rules are called orthogonal and single-fault.",
        "No record of the grammar (4.1) nests deeper than 3 (the deepest, `e`, is exactly 3), so every line with depth 4 outside "
        "strings is also a schema violation (D2/D4/D6/D8/D9). The reader with only the nesting rule disabled still rejects S32 "
        "(asserted in `inputs/self-checks.json`).",
        "The nesting bound is observationally redundant: K87 (no nesting bound) cannot be killed by any row; it is an equivalent "
        "mutant with respect to the verdict (it only matters for resource use). DESIGN DEFECT: S32 is not single-fault and K87 is unkillable.")
    add("13.3 K161, K162 (named killers X12, X08)",
        "K161 (nesting scan not string-aware) names X12 and K162 (reader splits lines with splitlines) names X08.",
        "X12 and X08 are builder rows (G/N/X/Y/O family: `buildDisplayList` then `serializeDisplayList`); the reader is exercised "
        "by S01, which parses every expected list including `dl/X08.dl` and `dl/X12.dl`.",
        "Both mutants are killed by S01 only; the named rows do not change under them. DESIGN DEFECT (clerical): the killer should be S01.")
    add("13.5 K16 (named killers N06, N07)",
        "K16 \"degenerate edge trimmed anyway\" names N06 and N07.",
        "N07 is `zerotrim` (24.0005 px apart: L = 24,000,500 > 24 px, so the edge is NOT degenerate). K16 does not change it.",
        "Killed by N06; N07 does not kill K16 (row-does-not-kill). DESIGN DEFECT (clerical).")
    add("13.5 K53 (named killers Y07, Y10)",
        "K53 \"pid is the scene index, not the table position\" names Y07 and Y10.",
        "In Y07 (`s:ann` hidden) the surviving node `i:1` has scene index 0 and table position 1, so its pid is the same either way; "
        "the cascade removes the only edge. Y10 (first node hidden) shifts pids and kills K53.",
        "Y07 does not kill K53. DESIGN DEFECT (clerical).")
    add("13.5 K60 (named killers R30, R32)",
        "K60 swaps the two flag bits in `readoutFromList`.",
        "R32 is the readout of Y06 where the node is selected and focused (flags 3); swapping bits 1 and 2 leaves flags 3 unchanged.",
        "Only R30 kills K60 (and R31/R33 as other rows). R32 cannot. DESIGN DEFECT (clerical).")
    add("13.5 K139 (named killers R21, R28, R29)",
        "K139 \"nodes_far guard-box rule ignored in a readout\" names R21, R28, R29.",
        "R28 puts a centre at exactly the guard-box edge (inside, `nodes_at`), which is also what a reader without the rule says.",
        "R28 does not kill K139 (R21 and R29 do). DESIGN DEFECT (clerical).")
    add("13.5 K179; 13.3 R19, R37",
        "K179 \"checks the version before the schema\" names R19 and R37; R19 is \"a readout missing `arrows` (and a version error "
        "elsewhere in the same entry list: schema is checked first)\".",
        "Within an entry V1 (schema) precedes V2 (version). For a row to separate the two orders, one entry must have both defects: "
        "R19's first entry lacks `arrows` AND has `xr` = `igr-xr/2`. Read literally (the version error in another entry) no row can "
        "kill K179, because entries are validated one after the other and the first invalid entry wins.",
        "With the same-entry reading R19 kills K179 and R37 does not (it has only the version defect). Under the other reading K179 would be unkillable.")
    add("13.5 K181 (named killers R23-R27)",
        "K181 \"accepts a non-canonical or -0 decimal\" names R23-R27 (`1.0005`, `abc`, `-0`, empty, `1e3`).",
        "K181 is implemented as \"parses anything float() accepts\". R24 (`abc`) and R26 (empty) are not numbers at all: no mutant "
        "that merely accepts non-canonical *decimals* changes them.",
        "R23, R25, R27 kill K181; R24 and R26 do not. DESIGN DEFECT (clerical): they test the reject path of garbage, not K181.")
    add("13.5 K90, K155 and the other two-sided mutants (K05 11 or 13, K24 9 or 11, K25 4 or 6, K94 15 or 17)",
        "The table names two readings in one row (\"11 or 13 px\", \"boundary 2^31 exclusive or 2^31 + 1 accepted\", \"reader's "
        "maxBytes boundary wrong\").",
        "The first reading is the id itself (11 px, 9 px, 4 px, 17 segments, exclusive boundary); the second reading is run as an extra "
        "mutant `Knnb` (K05b, K24b, K25b, K94b, K90b, K155b) listed in MUTANTS.tsv.",
        "One killer row of the pair kills one variant only (S37 kills the exclusive K90, S38 the +1 K90b; O15 kills K155, O16 kills K155b). "
        "Both rows are needed; stated, not a defect.")
    add("13.5 K120-K128, K137, K142 and 13.3 D, U10",
        "K137 and K142 are \"killed by runtime rows\"; D rows and U10 have empty cells and no files; K120-K128 name U rows whose "
        "expectations are outcome files or scripts.",
        "D01-D06 are implemented as deterministic in-generator simulations (seeded) whose results are asserted and recorded in "
        "`inputs/self-checks.json` and take part in the mutant matrix as rows with internal outputs; U rows are lifecycle scripts "
        "run by the reference simulation `tools/sim.py` (the oracle's reading of 27 section 9 and 31 6.5). K142 is killed by D06 in this sense only.",
        "No oracle *file* can kill K142 (D06 has empty cells by design).")
    add("13.3 P13",
        "\"a point within 6 px of the frozen chord of a parallel edge but farther than 6 px from its curve\"; no scene is named.",
        "The authored scene `pickv` (an antiparallel pair of nodes 26 px apart) is used; the point is found by a deterministic search over "
        "a grid and asserted (`inputs/searches.json`). A grid search over `mixed20` also finds such points, so the row is realizable there too.",
        "Scene choice. Minor.")
    add("13.3 P07",
        "\"exactly 6 px from a diagonal segment (closed boundary, exact fraction compare)\"; no scene is named.",
        "Equality `cross^2 = (6000)^2 * L2` needs an integer-valued length; the route of `G01` has `L2` not a perfect square. A scene `pickd` "
        "(a 3-4-5 edge of 500 px whose 12 px trims are exact integers) is authored; the points are exact lattice points at distance 6000 m-px.",
        "Scene choice. Minor.")
    add("13.3 P08",
        "\"the interior-vertex endpoint branch (`pickv`: a point beyond a polyline vertex, outside both perpendicular spans)\".",
        "The point is found by a deterministic search over the vertices of the `pickv` polylines (angles around a vertex, radius 5800/5400/5000 m-px) "
        "and asserted to change the answer under K95; the result is recorded in `inputs/searches.json`.",
        "Search-built row, as the design asks.")
    add("13.3 A.6 and rows B01/B02",
        "A.6 attributes one 105-byte block to \"row `dl:B01`/`B02`\" and B01 is \"node boxes (`G01`)\" while B02 is \"an edge box (straight)\".",
        "B01 is `G01`; B02 is the scene `trim` (several straight edges) because a row is one scene and the same bytes cannot serve two ids "
        "meaningfully. The A.6 figure is reproduced for B01.",
        "Clerical; B02's bytes are not in the Appendix.")
    add("13.3 C07",
        "\"three categories alternating: `fillStyle` assigned only when the colour changes\".",
        "IGS/1 5.5 orders nodes by type, so the categories of a scene are contiguous runs in scene order; they cannot alternate. C07 is `mixed20` "
        "(runs of classes 0, 1, 2), where the cache is exercised at the two colour changes.",
        "Wording. A scene with alternating classes does not exist.")
    add("13.3 C10",
        "\"hostile text unmodified in `fillText`\" with no scene named; K117 (trimmed, normalized or wrapped) names C10.",
        "Node labels equal the id text (IGS/1 5.8 F3), so hostile text must be an id. The reused hostile scenes have no leading or trailing "
        "spaces and no NFD text, so none of them kills K117 (ids12 was tried: K117 survived). A scene `hostile` is authored (spaces around, NFD, markup, "
        "U+2028, U+202E, backslash and quote); K117 changes C10 only.",
        "Scene choice, needed for K117 to be killable.")
    add("13.3 U13",
        "\"`displayList()` rejects under a lowered limit\" while 6.5 says `displayListBytes()` uses `maxDlBytes` and 6.4/4.6 that a list is not serialized by "
        "`displayList()`.",
        "The outcome file records all three: `render` ok, `displayListBytes` `RESOURCE_LIMIT/BYTES_LIMIT`, `displayList` ok (the literal 6.5 reading: only "
        "serialization is bounded by bytes).",
        "DESIGN DEFECT (inconsistency 13.3 U13 versus 6.5). K128 (render builds the list) changes the `render` entry.")
    add("13.2 grammar; O14",
        "The input grammar for G, N, X, Y, O has no way to say \"a plain object shaped like a model\" (O14).",
        "The key `plain_object_model: true` is added (as 27 13.3a does for M25): the kit passes a JSON-parsed copy of the model, which lacks the brand.",
        "Grammar gap. Documented here.")
    add("13.2 \"one row = one scene, one layout, one input\"; N06, S01, P16, U07, U09",
        "N06 needs three cases, S01 many files, P16 three pick files, U07 and U09 several cases.",
        "The `also` convention of 13.2 is used inside the inline `input`: `{..., \"also\": [{...}]}`. N06: states `N04`, `N05`, `N06` of `oracles-svg` "
        "with expected `dl/N06.dl`, `dl/N06b.dl`, `dl/N06c.dl`. S01: `file` plus `also` of every expected list of G, N, X, Y, O (including N06b, N06c). "
        "P16: `pick/P01.pick` plus `also` P02, P03; the expected `pick/P16.pick` is the re-serialization of the last (equal to P03). "
        "U07: `{\"cases\": [...]}` with outcome file `json/U07.options.json`; U09: `calls/C01.calls` plus `also` C03.",
        "Documented extension.")
    add("13.3 far; N13, N14, R21, R28, R29, gl:B11-B19",
        "One scene `far` is named for rows that need different properties (N13: \"no directed edge\"; gl: B11 \"straight, directed or not\").",
        "Two scenes: `far-u` (undirected, one node, N13, N14, R28, R29 with states `states/N13|N14|R28|R29.state.json` that place the node at exactly "
        "2^40, 2^40 + 1, -256000, -256001 m-px) and `far` (directed, eight nodes f0-f7 at screen milli-px (450000,300000), (-2000000000,300000), "
        "(1000000001,700003), (450000,-3000000000), (-278000,300000), (1178001,300000), (300000,860000), (200000,100000) at the identity state "
        "`states/R21.state.json`; edges f1->f2, f0->f3, f0->f1, f0->f2, a parallel pair f1<->f3, a loop on f0, f4->f7, f5->f6). The identity state of a "
        "scene is (w*500, h*500, zoom 1000), where screen milli-px equal layout units.",
        "Scene choice; the `oracles-gl` author must read `scenes/far.scene.json` and the README, not guess.")
    add("13.2 Z; 9.1 readouts; expected file endings",
        "Z expected files are \"canonical `{\"bh\":..,\"bw\":..,\"e\":..}`\" and other `json/` files \"ordinary JSON\"; 27 says IGR byte strings have no trailing newline.",
        "`json/Znn.json` is the canonical JSON plus one LF; U06 manifests and U09 witnesses are IGR-CJ/1 without trailing newline (as the other corpora); "
        "readout, compare, list, pick, bounds, calls files end with one LF as 13.2 says; outcome files and scripts are `indent=1` JSON plus LF.",
        "Format choice, stated.")
    add("4.4(g), 30 7.5(d)",
        "`fidelity.labels` is \"elided\" if any `dl` text differs from `xs` of its label with TAB, LF, CR replaced by spaces.",
        "A label whose only change is the `xs` substitution (U+FFFE -> U+FFFD) is NOT elided (the D-DRAW departure is `unchecked`); an empty label is not elided "
        "and not counted. The reading agrees with every `expect_fidelity` of `oracles-svg` (self-check `fidelity_vs_svg_corpus`: all equal).",
        "Reading confirmed against V5's corpus.")
    add("6.2 options validation",
        "`ink`: \"a non-integer element INVALID_VALUE\"; a non-number element (a string) is not classified.",
        "A non-number or non-integer element is INVALID_VALUE; a length other than 3 or a non-array is SCHEMA; the same for `layers` elements.",
        "Gap in the table; no row distinguishes.")
    add("6.3 recorder rounding",
        "\"a number `a` is written `round(a x 1000)`\".",
        "`round` is JavaScript `Math.round` (half toward +infinity): `floor(x + 0.5)`. For the doubles of this corpus (`m / 1000`) the product is within 1e-9 of an integer, "
        "so the choice cannot matter.",
        "Minor.")
    add("5.2 validation versus the closed viewport",
        "Point validation (SCHEMA, NOT_FINITE, OUT_OF_RANGE) and the closed viewport rule.",
        "Validation first (as `hitTest`): P12 holds NaN, +-Infinity, 2^40 and -(2^31 + 1) (errors) and 2^31 (valid, outside the viewport: no hit).",
        "Order stated in 5.2; confirmed.")
    add("4.7 D5/D7",
        "D5 says an `A` is \"the record immediately after the `E` of the same pid\"; D7 compares with \"the preceding `E`\".",
        "Adjacency is checked from the A side (the previous record is an `E` of the same pid) and D7 compares an `A` with the `E` of the *same pid*; presence "
        "(`A` exists iff D = 1, one per `E`) is separate. This makes S14, S15, S17 single-fault and K81/K83 separable.",
        "Reading chosen so that the S rows are single-fault.")
    add("13.3 S39 and 4.7 D1 maxLineUnits",
        "S39 \"a line over `maxLineUnits`\".",
        "Inline `{\"file\":\"dl/G01.dl\",\"limits\":{\"maxBytes\":637,\"maxLineUnits\":100}}` (the header line has 187 units); the error is `RESOURCE_LIMIT/BYTES_LIMIT` "
        "(4.7: \"or RESOURCE_LIMIT/BYTES_LIMIT (path dl.read) for the bounds\"). No oversize input is needed, so `generated/GENERATED.tsv` is not created.",
        "Reading.")
    add("13.5 K03, K04, K57 and the other mutant texts",
        "Several mutants are one-line texts (\"centre or pan sign wrong in X\", \"header size from the layout bounds\", \"arrow tip is not the last point\", "
        "\"label text altered (trimmed, normalized or wrapped)\", \"witness reads probe()\", \"manifest differs\").",
        "Each is realized by one concrete change in `tools/dl.py`, `tools/view.py`, `tools/sim.py` (`M('Knnn')` switches): K04 `(x + cx)` instead of `(x - cx)`; K57 `W,H` from "
        "the layout bounds in px; K23 the tip is the first point; K117 `strip()`; K120 the witness lists the drawn elements of the model; K121 the manifest name gets "
        "an `x` and `labels.edge` is always supported; K136 markers dropped; K137 the layer-4 `fillStyle` is skipped when no hook is installed; K142 the harness takes the "
        "double's readout from its probe.",
        "Mutant realizations are the oracle's reading; the matrix reports what each one changes.")
    add("2 and 4 (editorial)",
        "The change log of rev 2 appears twice (the table `Rev 1 -> rev 2 (re-check findings)` and the line `Dispositions of rev 2` are repeated); the sentence of 5.2 on "
        "`createPicker` and `COORD_LIMIT` and the sentence of 7.3 on `p = 0`, `q < 0` are repeated; the signature of `backingSize` repeats \"validates its three integers\".",
        "Ignored (the repetitions are identical).",
        "DESIGN DEFECT (editorial), no effect on bytes.")
    add("13.1 gate; Appendix A",
        "The gate requires the A.1-A.8 blocks to be reproduced.",
        "Reproduced: every `dl:` item (APPENDIX-A.tsv). The `gl:` items (A.5 assembly, A.5.1-A.5.3 logs, A.8 shader digests, A.10 guard rule) belong to `oracles-gl`; the "
        "only relation checked here is that the element-table and text lines of the A.5 prefix equal the `n`, `e`, `T` lines of `G01`.",
        "Scope.")
    add("1, 13.3 U rows (scripts)",
        "U rows are \"scripts as 27 13.3a plus the ops of 13.2\" (`displayList`, `calls`, `plan`, `pick`, `textCalls`, `status`).",
        "Ops used: `create`, `initialize`, `loadScene`, `dispatch`, `displayList` (the bytes of `displayListBytes()`, expectation `expect_dl`), `canvasCalls` "
        "(`expect_calls`), `pick`, `hitTest` (`expect_hit`: an `ElementAddress` or null), `probe` (`expect_fidelity`), `export`, `render`, `dispose`, `setReducedMotion`, "
        "`getState`; an expectation `expect` is `ok` or `CODE/REASON`; `await: false` leaves the call unsettled until a later awaited call (FIFO, 27 9). `status` and `textCalls` are V7 ops and unused.",
        "Format choice, stated.")
    add("27 5.2/5.3 reducer subset",
        "U01-U02, D01 need the reducer of 27.",
        "A subset is re-implemented (select, clear-selection, focus, focus-step/first/last, set-hidden, pan, zoom, fit, set-viewport, resize) with only the validation the scripts exercise.",
        "Scope.")
    add("13.3 R20",
        "\"a hand-built `SvgReadoutLike` with printed values 1.001, 4.35, 0.007, -0.001, 867.928, 0.1 (found by search so that `float x 1000` truncated differs)\".",
        "The six values are used as given in three nodes `(1.001, 4.35)`, `(0.007, -0.001)`, `(867.928, 0.1)`. K138 (truncation of the float product) changes the readout. "
        "Whether each single value differs is not claimed; the row differs as a whole (asserted by the matrix).",
        "Reading.")
    add("9.3 readoutFromCanvasStream",
        "\"node centres from the `arc` arguments of layer 7\", \"labels from the `fillText` of layer 8 (addresses by pid through the list's table)\".",
        "Elements are the pids painted in layer 7 (nodes) and 3 (edges); marks from layers 5, 1 (selected) and 6, 2 (focus); arrows from layer 4; the role of a text is "
        "`pid <= ND`. The reader is strict: canonical lines, markers non-decreasing in layer, strictly ascending pid within a layer.",
        "Reading.")
    return A


STATUS = [
 "RESOLVED-IN-REV3 (FIXED). Reading matched: D1 is a lexer, a disabled D1 rule is a tolerant lexer, D12 judges each line's canonical text; S28-S31 are single-fault in this regeneration and K72-K74 are killed by S28, S29/S31, S30.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched for S32 (declared exception, judged by 'rejected'). Differs for K87: it was replaced by 'reader does not enforce the order of the kinds (D2)', killed by S06 (confirmed by the matrix, see MUTANTS.tsv).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched: the killer of K161 and K162 is S01 (confirmed).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched: K16 is killed by N06 only (confirmed).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched: K53 is killed by Y10 only (confirmed).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched: K60 is killed by R30 only (confirmed).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched: K139 is killed by R21 and R29 (confirmed).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched: R19 is one entry with both defects; K179 is killed by R19 only (confirmed).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched: K181 is killed by R23, R25, R27; the new K187 is killed by R24, R26 (both confirmed).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched in substance (one reading per id, the second reading its own id; K05, K24, K25, K90, K155 as I had them). Differs only in numbering: the design's K94 is 15 segments and K94b 17 (I had them the other way round); both are killed by P03.",
 "RESOLVED-IN-REV3 (FIXED). Differs: I had left K142 killable only by a runtime row; the design redefined K142 ('a stream readout lists an element whose marker has no painting call as drawn') and added the file row R44. D06 is no longer named by any mutant; my D rows stay as self-checks of the generator.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (pickv, deterministic grid search, asserted).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (pickd).",
 "RESOLVED-IN-REV3 (STANDS). Reading matched.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (B02 is trim, the A.6 bounds block is B01's).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (scene hostile).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (three entries; displayList() succeeds).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (plain_object_model).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (the also convention is defined in 13.2).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched: far-u (N13, N14, R28, R29) and far (R21); scene ownership per corpus.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (file endings listed in 13.2).",
 "RESOLVED-IN-REV3 (STANDS). Reading matched.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (INVALID_VALUE for a non-number element).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (Math.round).",
 "RESOLVED-IN-REV3 (STANDS). Reading matched.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (adjacency from the A side; D7 against the E of the same pid).",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (inline limits, BYTES_LIMIT).",
 "RESOLVED-IN-REV3 (STANDS). Reading matched.",
 "RESOLVED-IN-REV3 (FIXED). The duplicated text is gone from rev 3 (change-log table, the two sentences, the signature comment).",
 "RESOLVED-IN-REV3 (STANDS). Scope: gl: items stay with oracles-gl.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (op list in 13.2).",
 "RESOLVED-IN-REV3 (STANDS). Scope.",
 "RESOLVED-IN-REV3 (STANDS). Reading matched.",
 "RESOLVED-IN-REV3 (FIXED). Reading matched (6.6, 9.3 now state it; R44 pins it).",
]

NEW = [
 ("13.3 R44 against 9.1 and 9.4",
  "R44: node 1 is absent from `drawn`, `nodes_at` and `marked`, \"the rest equals R01\".",
  "The label text of a node comes from layer 8 only (9.3), and the stream keeps the `fillText` of pid 1, so `labels.nodes` still lists node 1 (and `label_units` stays 9) while `drawn.nodes` no longer does. "
  "That readout violates the consistency rule V3 of `compareReadouts` (every address of `labels` resolves within `drawn`). The row's text is only satisfiable by this reading.",
  "Minor contradiction between R44 and 9.4 V3: the readout of R44 is not a valid input of `compareReadouts`. Not a defect of the bytes; a reader of the row should not feed it to the comparison."),
 ("13.5 K142 against R44",
  "K142: \"stream readout lists an element whose marker has no painting call as drawn\"; killed by R44.",
  "Realized for the two layers that define 'drawn' (layer 7 for nodes, layer 3 for edges): a marker section without its painting call is still listed. "
  "The marks (layers 1, 2, 5, 6) and arrows (layer 4) are not touched, because the text says 'drawn'. R44 exercises layer 7 only; a second mutant for layer 3 would need a second row.",
  "Reading; K142 is killed by R44."),
 ("13.5 K84 and K87 (S18)",
  "K84 \"reader skips the T order and role rules\" names S18 (a T before an N); K87 is now \"reader does not enforce the order of the kinds (D2)\", killed by S06.",
  "S18 violates the D2 kind order (a `T` before an `N`), so a mutant that kills S18 must skip the D2 order; K84 is implemented as skipping the D2 order, the role rule, the T order and the one-T-per-pid rule, which makes K84 a superset of K87 on the kind order. "
  "Without the D2 order in K84 the named killer S18 would not change.",
  "Overlap: K84 and K87 both skip the D2 order. Either S18 leaves K84's killer list or K84 is understood to include the kind order. Minor."),
 ("4.7 D1 (a CR inside a line)",
  "\"no CR (a CR is a line-boundary byte, not part of the line)\"; a disabled D1 byte rule is a tolerant lexer that drops \"a CR before the LF\".",
  "Only a CR immediately before the LF is a line-boundary byte that the tolerant lexer drops; a CR inside a line stays in the line and breaks it (a JSON syntax error, so INVALID_INPUT/SCHEMA). "
  "A reader with the CR rule disabled therefore accepts CRLF files (S28) and not a lone CR.",
  "Reading; no row has a lone CR."),
 ("4.7 D1 (indentation and blank lines)",
  "\"leading blanks\" are dropped by a tolerant lexer; a blank line is dropped.",
  "'Blank' is SPACE and TAB. A blank (empty) line is dropped before parsing.",
  "Reading; S29 uses one leading space, S31 an empty line."),
 ("4.7 D7 (judged only for an A whose E passed D6)",
  "\"D7 is judged only for an `A` whose `E` passed D6\".",
  "An `E` passes D6 when its flags, form, coordinate count and coordinate bound hold; D7 is judged against it by pid. With a D6 sub-rule disabled (single-fault checks and mutants K80, K86) the `E` is treated as having passed.",
  "Reading; consistent with the single-fault rows S11-S13, S25."),
 ("13.6 last sentence against 13 intro and 13.4",
  "13.6: \"The Canvas replay rows and the `oracles-gl` plan rows both depend on the `oracles-dl` expected lists, so a defect found in a list changes both corpora\"; 13 (rev 3) and 13.4: each corpus is self-contained and nothing is read from the other.",
  "Self-containment is followed: this corpus reads only the frozen fixtures, the `oracles-svg` data (digest checked) and its own files, and authors its own scenes.",
  "DESIGN DEFECT (editorial, stale sentence): 13.6 still describes the rev 2 coupling."),
 ("13 intro, 13.3 (reuse of `oracles-svg` states)",
  "Self-contained corpora may read `oracles-svg` data; 13.3 reuses scenes `trunc`, `ties`, ... \"by path\" and N01, N02, N04-N06, N10, N16, N17 name states of `oracles-svg`.",
  "Scenes and layouts are read by path from `oracles-svg`; the states that the design names by origin (the `svg:` states of N01, N02, N04-N06, N10, N16, N17) are read by path too. Every other state (Y01-Y17, N03, N07, N13-N15, P11, C03, C19, C20, R21, R28, R29 and the pick states) is authored here; "
  "the 17 Y states are byte-equal to those of `oracles-svg` (self-check).",
  "Reading; recorded because a regeneration of `oracles-svg` would change those rows (the digest gate stops it)."),
 ("4.7 lexer and the size bounds",
  "`maxBytes` and `maxLineUnits` are checked first; the lexer also drops tolerated bytes.",
  "`maxLineUnits` is measured on the raw line (before the tolerated bytes are dropped), `maxBytes` on the whole input.",
  "Reading; no row separates the two."),
 ("6.6 and 9.3 (rev 5): at most one focused element in a stream",
  "6.6: a stream is rejected unless \"layers 2 and 6 together hold at most one pid\"; 9.3: readoutFromCanvasStream reports \"the one focus or none (no precedence rule is needed)\".",
  "The strict stream reader (`parse_stream`, used by `canvasStreamWitness` and `readoutFromCanvasStream`) counts the marker sections of layers 2 and 6 together, painted or not, and rejects the stream with INVALID_INPUT/SCHEMA when there is more than one. "
  "A node and an edge cannot share a pid, so one pid in layer 2 and one in layer 6 is also two focused elements and is rejected.",
  "Reading. The count is over markers (the reader's structural stage), not over painted sections; the text says 'hold ... pid'."),
 ("13.3 and 13.5 (rev 5): the new rule has no row and no mutant",
  "Rev 5 adds the single-focus rule to the stream reader; the change log says \"no corpus row has two focused elements\" and no row or mutant id changes.",
  "No expected byte exercises the rule (checked by a direct test: a G01 stream with two focus markers is rejected, a stream with one is accepted), and no mutant names it. "
  "13.5 closes with \"a normative rule without a mutant here is a review finding\".",
  "Finding (clerical): the rule has neither a killer row nor a mutant; a stream row with two focus markers (error `INVALID_INPUT/SCHEMA`) and a mutant that drops the rule would close it. Not added: the ids are frozen by rev 5."),
]


def render_ambiguities(res):
    A = ambiguities(res)
    assert len(STATUS) == len(A) == 35
    A = A + [(sec, text, reading, why, "") for sec, text, reading, why in NEW]
    out = ["# Ambiguities, contradictions and unimplementable rules found while writing the oracle", "",
           "Source: design 31 rev 5 (`31-CANVAS-WEBGL-DESIGN.md`; entries A-01..A-35 were written against rev 2 and carry the rev 3 disposition from its change log, with whether my reading matched), "
           "30 rev 4, 27 rev 5, IGS-1, IGL-1. A-36 to A-44 are new findings from re-implementing the rev 3 text, A-45 and A-46 from the rev 5 text. Entries marked DESIGN DEFECT are places where the text "
           "cannot be implemented as written or a named killer row does not kill; they are reported, not repaired. Entry numbers are stable.", ""]
    for i, (sec, text, reading, why, kind) in enumerate(A, 1):
        out.append("## A-%02d  %s" % (i, sec))
        out.append("")
        if i <= 35:
            out.append("* **Rev 3 status.** " + STATUS[i - 1])
        out.append("* **Design text%s.** " % (" (rev 2 wording)" if i <= 35 else "") + text)
        out.append("* **Literal reading used.** " + reading)
        out.append("* **Why / status%s.** " % (" at rev 2" if i <= 35 else "") + why)
        out.append("")
    return ("\n".join(out)).encode("utf-8"), len(A)


# ---------------------------------------------------------------------- README
def make(outs, notes, app_rows, res, info):
    cnt, err = counts(outs)
    amb, n_amb = render_ambiguities(res)
    L = []
    w = L.append
    w("# IGR-DL/1 and IGR-CV/1 oracle corpus (`oracles-dl`)")
    w("")
    w("Status: **DRAFT** (not frozen; no digest is pinned). Produced against design 31 rev 5 (`31-CANVAS-WEBGL-DESIGN.md`; first written against rev 2, regenerated for rev 3 and refreshed for rev 5, whose only rule change for this corpus is the single-focus rule of the stream reader) by an oracle author who was given "
      "only that design, `27-IGR1-DESIGN.md` (rev 5), `30-SVG-RENDERER-DESIGN.md` (rev 4), `IGS-1.md`, `IGL-1.md`, `docs/conformance/README.md`, the frozen fixtures "
      "(`fixtures/oracles`, `fixtures/oracles-igl`) and, as read-only **data**, the scenes, layouts, states and expected SVG documents of `fixtures/oracles-svg` "
      "(the digest of its `SHA256SUMS`, `%s`, is checked by the generator and a mismatch stops it). Read `AMBIGUITIES.md` (%d entries) before judging any mismatch."
      % (info["oracles_svg_sums_digest"], n_amb))
    w("")
    w("## Independence statement")
    w("")
    w("* Every expected byte comes from the Python code in `tools/` (standard library only: `hashlib`, `json`, `math`, `re`, `fractions`, `decimal`, `unicodedata`, "
      "`xml.etree.ElementTree` for the SVG scrape of rows R12-R15). `tools/core.py` is arithmetic, canonical JSON, IGS/IGL model derivation, state, a reducer subset and "
      "the frozen hit test; `tools/dl.py` the display list (build, writer, strict reader); `tools/view.py` pick, bounds, `backingSize`, the Canvas replay and recorder, "
      "readouts, `compareReadouts`; `tools/sim.py` the manifest and a lifecycle simulation; `tools/scenes.py` the authored scenes and the seeded searches; "
      "`tools/rows_a|b|c.py` the rows; `tools/gen.py` the driver and the mutant matrix; `tools/appendix_a.py` the Appendix A gate.")
    w("* The author did **not** read, import or run any TypeScript, `packages/*`, the V6/V7 packages (none exist), any `reviews/*.md` or author-notes file, any tool code of "
      "another corpus (the `tools/` of `oracles-svg` was not read or run), and did not read or write `fixtures/oracles-gl`.")
    w("* Shared assumption: oracle and code implement the same written rules; the corpus proves that code matches the text as read in `AMBIGUITIES.md`.")
    w("* A **third party** must run `verifyScene`, `verifyLayout`, `bindLayout` over every file of `scenes/` and `layouts/` and `parseState` over the accepted `states/` "
      "files (13.1); the generator's own checker is a lite one (canonical form, ordering, uniqueness, id rules, endpoint order, layout order and binding).")
    w("")
    w("## What is here")
    w("")
    w("`EXPECT.tsv`: header `id group tier scene layout input expected error` (13.2), **%d rows**. `scene`, `layout` are paths relative to this directory "
      "(`../oracles/...`, `../oracles-igl/...`, `../oracles-svg/...` for reused data, `scenes/...`, `layouts/...` for authored); `input` is a path or inline JSON "
      "(starts with `{` or `[`); `expected` a path or empty; `error` is `CODE/REASON` or empty; a row with an `error` has no expected file." % len(base.ROWS))
    w("")
    w("| Family | Rows | with an error | what |")
    w("|---|---|---|---|")
    for g, what in FAM:
        w("| %s | %d | %d | %s |" % (g, cnt.get(g, 0), err.get(g, 0), what))
    w("| **total** | **%d** | **%d** | D and K rows (%d) have empty cells by design; U10 has neither a file nor an expected cell |" % (
        sum(cnt.values()), sum(err.values()), cnt.get("D", 0) + cnt.get("K", 0)))
    w("")
    w("| Directory | Content |")
    w("|---|---|")
    w("| `dl/` | expected display lists (exact bytes, every line ends with LF): rows G, N, X, Y, O, F; `*.cK.dl` are the lists recorded by the U scripts |")
    w("| `pick/`, `bounds/` | pick buffers (P01-P03, P16) and element bounds (B01-B04, B04 is empty) |")
    w("| `calls/` | Canvas call streams (C rows, U scripts, `X13.calls` is a derived input of R43) |")
    w("| `xr/` | readouts (`Rnn.xr.json`: canonical JSON + LF), compare results (`Rnn.compare.json`), derived entry readouts of the compare rows |")
    w("| `json/` | device sizes (Z), manifests (U06), witnesses (U09), outcome files (U07, U11, U12, U13) |")
    w("| `scripts/` | lifecycle scripts of the U rows with their expectations filled in (outputs of the generator) |")
    w("| `states/` | canonical IGR-CJ/1 state bytes (no trailing newline) bound to the row's scene and layout; `U*.cK.state.json` are the states recorded by the scripts |")
    w("| `scenes/`, `layouts/` | authored IGS/1 scenes and `igl-fixed/1` layouts: `arrows`, `quadcub`, `zerotrim`, `far`, `far-u`, `brackets`, `hostile`, `pickh`, `pickd`, `pickv`, `pickt`, `pickn`, `pickb` |")
    w("| `bad/` | the S02-S43 invalid lists (single-fault, see `inputs/self-checks.json`) |")
    w("| `inputs/` | `N03.search.json` (seed, trials, witnesses), `searches.json` (N07, P08, P13), `self-checks.json` (single-fault table, parity, fidelity gate, D rows) |")
    w("| `APPENDIX-A.tsv`, `MUTANTS.tsv` | the Appendix A reproduction table and the mutant matrix (generated, covered by `SHA256SUMS`) |")
    w("| `tools/` | the generator (not in `SHA256SUMS`) |")
    w("")
    w("`SHA256SUMS`: one line `<sha256> *<path>` per file except `tools/` and itself, sorted by byte order of the path. No project or person names occur in any file.")
    w("")
    w("## Regenerate")
    w("")
    w("```text")
    w("python tools/gen.py                  # regenerate every file from empty (removes everything but tools/); about four minutes with the matrix")
    w("python tools/gen.py --out DIR        # the same into DIR (byte-identity proof: two runs with different PYTHONHASHSEED, diff -r)")
    w("python tools/gen.py --no-matrix      # skip the mutant matrix (MUTANTS.tsv is then not written)")
    w("python tools/gen.py --mutant K08     # run one mutant over every row and list the rows that change")
    w("python tools/gen.py --check-appendix # print the Appendix A reproduction table only")
    w("```")
    w("")
    w("Python 3.12, standard library only, no network, no clock, no randomness (the N03 search uses a fixed 32-bit LCG with a recorded seed; the P08/P13/N07 constructions "
      "are deterministic scans). The generator asserts at run time: Appendix A (read from the design file), the N03 search property (each of K26, K27, K28 changes an `A` record), "
      "the N07 zero-length E record, the extreme coordinates of N13/N14/R28/R29, the single-fault property of the S rows, the P08 and P13 properties, the parity of the "
      "four readout routes (list, SVG scrape, stream) on R01/R05/R30/X01, the fidelity of 34 rows against the `expect_fidelity` of `oracles-svg`, byte equality of the "
      "17 Y states with the same-named states of `oracles-svg`, and the C-V5 parity of 3.2 over 44 (row, V5 document) pairs: every node centre, every `d` number of every route "
      "(straight, parallel, loop, degenerate), every label position and text and the presence of every arrow equal what the expected V5 documents print (`inputs/self-checks.json`, "
      "`c_v5_parity_vs_oracles_svg_documents`; the V5 documents are read as data and the two implementations are independent).")
    w("")
    w("## Tiers")
    w("")
    w("`core`: a function on bytes. `both`: the function and the subject (`buildDisplayList`/`recordCanvasCalls`/`pick`/`elementBounds` and the renderer methods). `subject`: lifecycle and renderer rows (U, D). "
      "`K` rows have an empty tier and empty cells. Tiers were assigned as 13.3 states them; where it is silent: B both, R core for the function rows (R12-R20, R23-R27, R36-R38 and the stream rows) and both for list rows, Z core.")
    w("")
    w("## Row inputs and expected files")
    w("")
    w("* **G, N, X, Y, O, F**: `{\"size\":{width,height},\"state\":\"initial\"|path,\"options\":{...}?,\"limits\":{\"maxBytes\":n}?,\"also\":[{\"state\":path,\"expected\":path}]?}`; "
      "`initial` is `initialState(model, size)`; a path is a state file. Tokens `\"NaN\"`, `\"Infinity\"`, `\"-Infinity\"` stand for those doubles. `plain_object_model: true` (O14) hands a model-shaped plain object. "
      "Expected `dl/<id>.dl`, or empty with `error`. Y14 and Y15 load their state files without validation (plain JSON) so that the build's own validation fails.")
    w("* **S**: a path under `bad/` or `dl/`, or inline `{\"file\":..,\"limits\":{maxBytes,maxLineUnits}?,\"also\":[..]?}`; expected empty; `error` or accepted.")
    w("* **P**: inline `{\"size\",\"state\",\"points\":[{\"x\",\"y\",\"hit\":{node|edge}?,\"error\":\"CODE/REASON\"?}]}`: the oracle writes the `hit`/`error` of every point into the input (a point with neither expects no hit); P01-P03, P16 expect `pick/Pnn.pick`. **B**: `bounds/Bnn.bounds`.")
    w("* **C**: as G plus `\"replay\":{\"dprMilli\",\"ink\",\"layers\",\"onElement\":\"not-a-function\"}?`; expected `calls/Cnn.calls`. C13 records two replays into one recorder after `reset()` (expected: the second stream, which must equal the first); "
      "C18 records with and without the `onElement` hook (expected: the stream with markers removed; the no-hook replay must equal it).")
    w("* **Z**: `{width,height,dprMilli}`; expected `json/Znn.json` = canonical `{\"bh\",\"bw\",\"e\"}` + LF.")
    w("* **R**: `{\"from\":\"list\",size,state}`, `{\"from\":\"svg\",\"svg\":path}` (the oracle's scrape of the V5 document into a `SvgReadoutLike`, then `readoutFromSvgReadout`), `{\"from\":\"calls\",\"calls\":path}`, "
      "`{\"from\":\"object\",\"object\":SvgReadoutLike}`, `{\"from\":\"compare\",\"entries\":[{renderer,readout}]}`; expected `xr/Rnn.xr.json` / `xr/Rnn.compare.json` or an error.")
    w("* **U**: `scripts/Unn.script.json` (lifecycle schema of 27 13.3a with the ops listed in AMBIGUITIES A-%d) or inline JSON (U06 manifests, U07 option cases, U09 witnesses, U11-U13 outcome files, U10 none)." % (
        [i for i, a in enumerate(ambiguities(res), 1) if a[0].startswith("1, 13.3 U rows")][0]))
    w("* **D**: no files; the oracle runs deterministic seeded checks (recorded in `inputs/self-checks.json`).")
    w("")
    w("## Appendix A reproduction (design 31)")
    w("")
    w("| Item | Result | Detail |")
    w("|---|---|---|")
    for item, result, detail in app_rows:
        w("| %s | %s | %s |" % (item.replace("|", "/"), result, detail.replace("|", "/")))
    w("")
    if res is not None:
        w("## Mutants (13.5)")
        w("")
        w("Each mutant is a switch inside `tools/` (`--mutant Knnn`). For each mutant the generator runs **every non-K row** with the mutant active and compares the row output "
          "(files, error and the row's internal result) with the unmutated run (`MUTANTS.tsv`). Inputs (scenes, states, bad files, the derived entry readouts) are produced once by the unmutated reference.")
        w("")
        kills = [k for k, v in res.items() if v["named_changed"] and not v["named_not_changed"]]
        part = [k for k, v in res.items() if v["named_changed"] and v["named_not_changed"]]
        other = [k for k, v in res.items() if not v["named_changed"] and v["changed"]]
        none = [k for k, v in res.items() if not v["changed"]]
        w("**Result: %d mutants run (the 193 mutants of the rev 3 table, including the second readings K05b, K24b, K25b, K90b, K94b, K155b and the new K187). Killed with every named killer row changing: %d. Killed, but at least one named row does not change: %d (%s). "
          "Named rows do not kill, other rows do: %d (%s). Killed by no row: %d (%s).**" % (
              len(res), len(kills), len(part), ", ".join(part), len(other), ", ".join(other), len(none), ", ".join(none)))
        w("")
        w("| Mutant | Mutation | Named killers | Named rows that change | Named rows that do NOT change |")
        w("|---|---|---|---|---|")
        for kid, v in res.items():
            w("| %s | %s | %s | %s | %s |" % (kid, v["desc"].replace("|", "/"), ",".join(v["named"]), ",".join(v["named_changed"]),
                                              ",".join(v["named_not_changed"])))
        w("")
    w("## What the checks establish (and do not)")
    w("")
    w("Established: Appendix A (`dl:` items) is reproduced as tabled; every expected list is accepted by the strict reader and re-serializes to itself; every bad list is rejected and "
      "single-fault except S32 and S40 (see AMBIGUITIES); the readout of the list, of the SVG document and of the call stream agree byte for byte on the rows named above; "
      "two runs produce identical `SHA256SUMS` (the digest is in the hand-over report, not here, because this file is covered by it). **Not established:** that a browser draws anything, "
      "anything about the V7 plan, the frozen verifiers' verdict on the authored scenes and layouts (third party), or any behaviour of TypeScript (none existed).")
    return ("\n".join(L) + "\n").encode("utf-8"), amb
