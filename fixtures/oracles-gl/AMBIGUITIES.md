# Ambiguities, contradictions and defects found in design 31 (written against rev 2, re-derived against rev 3 and rev 5)

Every place where the design was ambiguous, contradictory, left a byte undetermined or could not be implemented as written, with the section it concerns, the literal reading the generator uses and why.
Section numbers without a prefix are sections of design 31 (`31-CANVAS-WEBGL-DESIGN.md`); `27 n` is the IGR/1 design (rev 5), `30 n` the SVG design (rev 4). Nothing was "fixed": where the design and the
generator's output disagree, both values are given. Entries marked **DESIGN DEFECT** are things that cannot be right as written; the others are underspecifications or choices.

**46 entries (A-01 to A-46), 8 of them design defects.** A-42 to A-46 were added after the rev 5 gap review. The Appendix A items and the shader digest all reproduce (README); the defects below concern corpus rows and mutants, not the Appendix.

## A-01 [DESIGN DEFECT] W04 (`stride.edge 36`) cannot isolate G3

* **Rev 3:** RESOLVED-IN-REV3, FIXED: W04 under G1, G3 uses the constant strides, K24 killed by W07, K22 by W04. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.2 G1, G3; 13.4 W04; 13.5 K22, K24
* **Reading used:** The header's `stride` is a constant checked by G1 ("stride as stated"); G3 ("each size is a multiple of its stride") is applied with the constant strides 28/16/40. W04 therefore breaks G1 and is accepted when only G1 is disabled.
* **Why:** K24 (reader skips G3) names W07 and W04; W07 kills it, W04 does not (the row is still rejected by G1). Had G3 used the header's stride, W04 would break both G1 and G3: also not single-fault. Either way the design's claim that W04 isolates G3 is false. Recorded in `bad/FAULTS.tsv`.

## A-02 [DESIGN DEFECT] B05 asks for layers 1, 2, 3 and 5, 6, 7 in one plan, which one state cannot give

* **Rev 3:** RESOLVED-IN-REV3, FIXED: two cases (edge focus; node focus under also). **Reading matched the rev 3 text:** yes.
* **Sections:** 13.4 B05
* **Reading used:** Layer 2 needs a focused edge, layer 6 a focused node, and the focus is a single element (27 4.1). B05 is built as two cases: the primary (`plan/B05.glplan`: edge focus, layers 1, 2, 3, 4, 5, 7) and a second listed under `"also"` (`plan/B05b.glplan`: node focus, layers 1, 3, 4, 5, 6, 7).
* **Why:** 13.2 allows a second case through `"also"`.

## A-03 [DESIGN DEFECT] oracles-gl reuses oracles-dl scenes by path, but the author may not read oracles-dl

* **Rev 3:** RESOLVED-IN-REV3, FIXED (ruling): each corpus self-contained. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.4 header; 13.1; 13.3 "authored scenes"
* **Reading used:** Every scene, layout and state that design 13.4 would take from `oracles-dl` (`far` and the G/Y states) is authored in this corpus (`scenes/far-*`, `states/G08, G10, B03, B05, B05b`); frozen and oracles-svg data are used by path. The expected display lists are not re-read: the builder is re-implemented and reproduces Appendix A.1-A.3 and A.9 byte for byte.
* **Why:** Independence (13.1) forbids reading the other corpus. A later check that `oracles-dl` and `oracles-gl` agree on a scene is a cross-corpus test, not part of this corpus.

## A-04 [DESIGN DEFECT] Row "created, ready, lost, failed | init" contradicts the rows that define init in created

* **Rev 3:** RESOLVED-IN-REV3, FIXED: created removed from the init-ignored row. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.6 table, row 2 and rows 6, 7
* **Reading used:** init is a no-op in ready, lost, failed (the renderer answers ALREADY_INITIALIZED, the controller does nothing); in created it is the real initialize (rows 1, 2). Change-log M-8 says "init outside created".
* **Why:** The change log of rev 2 states the intent; the table row lists `created` by mistake.

## A-05 When are the context-event listeners added, and do they survive a failed initialize?

* **Rev 3:** RESOLVED-IN-REV3, FIXED: listeners added once at every initialize that reaches creation, left after a failure, removed by dispose. **Reading matched the rev 3 text:** yes (the vocabulary sentence still disagrees: A-35).
* **Sections:** 7.6 table, 7.6 vocabulary, 7.9
* **Reading used:** At every initialize that gets as far as the creation, before the creation calls, once (a second add is not logged); a failed initialize leaves them (the table lists no removal) and `dispose` removes them if present (`removeEventListener` x2). So U27 and U39 show the two `addEventListener` lines before the failed creation.
* **Why:** The vocabulary says "at a successful initialize, before creation", which cannot be known before the creation runs; the table says nothing about a removal after a failure; "listeners removed if any" in the dispose row implies they can exist after a failed initialize.

## A-06 A failed creation has a log, an error and a detail

* **Rev 3:** RESOLVED-IN-REV3, FIXED: file grammar for rows with both a log and an error. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.5, 7.6, 13.2 E10, E11, U27
* **Reading used:** E10 and E11 (and U25, U27, U31, U34, U36, U39) carry both an `expected` log and an `error` cell (`INVALID_INPUT/INVALID_VALUE`); the `detail` (token + colon + at most 120 characters of the fake's info log) is recorded in the inline input as `expect_detail`, with the fake's `info_log` (more than 120 characters, so K104 can show). The controller log records the failure as `onError` then `reject` (initialize) or `onError` then `onStatus` (restore).
* **Why:** 13.2 says an error row normally has no expected file; the rows need both. No place in the design says where the detail is checked.

## A-07 Where does the probe call log live?

* **Rev 3:** RESOLVED-IN-REV3, FIXED: expected = canonical probe result, expect_log inline. **Reading matched the rev 3 text:** yes (file form of the result: A-34).
* **Sections:** 13.2 probe rows
* **Reading used:** In the inline input as `"expect_log":"gllog/Pnn.log"`; `expected` is the canonical probe result (`json/Pnn.probe.json`).
* **Why:** 13.2 names both files but the row has one `expected` cell.

## A-08 U37 is a composite scenario

* **Rev 3:** RESOLVED-IN-REV3, FIXED: composite file with case/status lines. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.7, 7.9, 13.4 U37
* **Reading used:** U37 holds four cases (default attributes; option false; software-only fake with the option false; software-only fake with the default), each a section of `gllog/U37.log` introduced by `["case",name]` and closed by `["status",{...}]` (two tokens outside the 7.6 vocabulary). Per case: the probe's log, the adapter's own `getContext webgl2` with the option, the controller's initialize log. A probe rejection is logged as `reject` only (no `onError`: the controller has not started).
* **Why:** The design describes the behaviour (probe and getContext share the option; probe contexts released) but no file form.

## A-09 Controller details left open

* **Rev 5:** RESOLVED-IN-REV5, controller conventions refined: the release rule (loseContext only on an obtained, not lost context, in every phase), (failed, R) lost again, (failed, R) second usable failure with no onStatus. **Reading matched:** partly: my rev 3 simulation released a lost context in created and sent onStatus on every restore failure; both corrected, no expected byte changed.
* **Rev 3:** RESOLVED-IN-REV3, FIXED: controller conventions written in 7.6. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.5, 7.6
* **Reading used:** The frame after init, restore, commit or render uses `{widthPx: w, heightPx: h}` of the plan header (dprMilli 1000: the backing size equals the CSS size) and ink (34,34,34); a commit in `ready` logs the frame and then `["labels.draw"]`; init or restore with no retained plan draws nothing and logs no `labels.draw` (explicit for restore, applied to init); a loss during creation (`"fail":"lost"`) makes the context lost right after the `getShaderParameter` of `arrow.vs` (the log stops there); a fake compile failure is `disc.fs`, a link failure `edge` (rows E10, E11); `status().contextLost` is the fake's flag (true between a loss and a restore; not set by `loseContext()` at dispose); `failure` holds the closed token in `failed` and after a failed initialize and is cleared on the next success, on a loss out of `failed` and at dispose.
* **Why:** Each point is needed to produce a byte of a controller log; the design is silent or ambiguous.

## A-10 Probe: lazy checks, release timing, which canvas answers the relaxed request

* **Rev 3:** RESOLVED-IN-REV3, FIXED: check order, stop at first failure, release timing, relaxed request, 2D call. **Reading matched the rev 3 text:** yes (step (5) wording: A-36).
* **Sections:** 7.7
* **Reading used:** Checks run in the order vertex precision, fragment precision, MAX_VERTEX_ATTRIBS, MAX_VIEWPORT_DIMS and stop at the first failure (so P05 logs one precision call, P15 none of the later calls); the GL context is released (`getExtension WEBGL_lose_context`, then `loseContext` if the extension exists) right after the checks and before the 2D canvas; a request with `failIfMajorPerformanceCaveat:false` is answered by `webgl2_relaxed` of any canvas (absent: `webgl2`); the 2D canvas is the next `factory()` call (the second one on the success path; there is no 2D check on a failure return).
* **Why:** 7.7's call-order sentence lists the success path only; "first match wins" is read as lazy evaluation.

## A-11 [DESIGN DEFECT] G13 and G16 overlap; G13 has no lower bound for node pids

* **Rev 3:** RESOLVED-IN-REV3, FIXED: G13 range only, G16 coverage only. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.2 G13, G16; 13.4 W21, W29, W30, W38
* **Reading used:** G13 is read literally: node-layer pids are `<= nd` (no lower bound), edge-layer pids `nd+1..nd+ed`; G16 is read as coverage only (every pid of the table is accounted for by an instance or by cn/ce; extras are G13's business). With this reading W29 and W30 break G13 only, W38 G16 only, and W21 (a pid 0 in layer 7) G9 only.
* **Why:** With "exactly" in G16 an out-of-range pid breaks G13 and G16 at once, and a pid 0 in an edge layer breaks G9 and G13; the rows cannot then be single-fault.

## A-12 How the reader finds the buffers and what each rule is measured on

* **Rev 5:** RESOLVED-IN-REV5, the reader rules gain the single-focus clause in G12 (7.2). **Reading matched:** yes for the text; the clause has no row (A-39).
* **Rev 3:** RESOLVED-IN-REV3, FIXED: 'How the reader measures'. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.2 G2, G3, G5; 13.4 W05-W07, W09-W11
* **Reading used:** Sections are found by the line prefixes `["n",`, `["e",`, `["T",` (no valid buffer can begin with them: G6 forbids such a float), so G13/G14 count lines and G2 compares the remainder with the sum of the sizes; with G2 disabled each buffer is the slice of its header size (possibly shorter), G3 is measured on that slice and every instance count is `len // stride`; G5 takes a draw's program from its layer (the `program` string is G4's). W05 is built on a plan with an empty arrow buffer so that the disc buffer is the last one; W07 appends one byte to the edge buffer and raises its size; W09 renames the program of the layer-5 draw; W11 inserts an uncovered dummy instance between layers 1 and 3.
* **Why:** The text gives the rules but not the order or the measurement, and a single-fault property needs every rule to be orthogonal.

## A-13 X07 is not reachable through the strict reader

* **Rev 3:** RESOLVED-IN-REV3, FIXED: read with every reader rule disabled. **Reading matched the rev 3 text:** yes.
* **Sections:** 9.3, 13.4 X07
* **Reading used:** X07 reads the bad plan `bad/X07.glplan` with the reader's every rule disabled and then calls `readoutFromGl`, which answers `INVALID_INPUT/SCHEMA` for the pid outside the table. K119 (accepts it) removes the check and the unknown pid is skipped.
* **Why:** A plan produced by `parseGlPlan` cannot hold such a pid (G13), so the check in `readoutFromGl` is defence in depth; the row needs an input that bypasses the reader.

## A-14 The witness double of U11 is rejected by the strict reader

* **Rev 3:** RESOLVED-IN-REV3, FIXED: the witness reads the double's plan with every rule disabled. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.8, 13.4 U11
* **Reading used:** The double's plan lacks a disc instance without a `cn` entry (a G16 violation); the witness reads the plan through the reader with every rule disabled, finds one node fewer than `probe()` drew, and W01 fails. K68 (the witness reads `probe()`) makes it pass. Outcome: `json/U11.witness-honesty.json`.
* **Why:** 7.8 says the witness reads "the parsed plan"; a strict parse of the double would throw, which is also a failure but not an informative one.

## A-15 Renderer option validation: order and codes

* **Rev 5:** RESOLVED-IN-REV5, budget 0: a renderer with dl.maxDrawnLabelUnits 0 or capacity 0 is refused (6.5). **Reading matched:** partly: the rev 3 generation accepted dl budget 0 at renderer level (B08 case c); now refused, and case c is list-level (A-41).
* **Rev 3:** RESOLVED-IN-REV3, FIXED: alphabetical order and codes of the renderer options. **Reading matched the rev 3 text:** yes, except the code for a non-number element of ink (A-37).
* **Sections:** 6.5, 7.8, 11.2, 13.4 U07
* **Reading used:** Top-level keys are validated in alphabetical order (the design states the order for `DlOptions` only): `capacity`, `contextAttributes`, `dl`, `dprMilli`, `ink`, `maxDlBytes`, `maxGlBytes`, `name`, `version`; an unknown key or a non-object is SCHEMA; numeric classes as 27 15 (SCHEMA, NOT_FINITE, INVALID_VALUE, OUT_OF_RANGE); `dprMilli` 250..8000; `ink` three integers 0..255; capacity members positive safe integers; `name` and `version` by the manifest patterns with INVALID_VALUE; `maxDlBytes` and `maxGlBytes` integers 0..2^31 (unspecified); `contextAttributes.failIfMajorPerformanceCaveat` a boolean (SCHEMA, 11.2).
* **Why:** The text lists the options and codes by reference to other rows that this author could not read (`dl:O07-O12`), so the grammar is rebuilt from 4.5, 6.2 and 11.2.

## A-16 "U01-U08 as dl:U01-U08 with plan" cannot be followed literally

* **Rev 3:** RESOLVED-IN-REV3, FIXED: cross-corpus reference removed. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.4 U01-U08, 13.3 U rows
* **Reading used:** The scripts were built from the text of 13.3 (U01 select, focus-step, set-hidden then unhide, clear-selection with the plan after each step; U02 resize and set-viewport; U03 the phases NOT_INITIALIZED, NOT_LOADED, ok, BUSY during a pending load, DISPOSED; U04 fidelity of O1 (full), keybound (elided), labels false (none) and motion none with reducedMotion; U05 export; U06 manifests; U07 option errors; U08 capacity 1). Ops added to 27's list: `create`, `plan` (outcome only), `planBytes` (outcome and file); `export` checks the media type and the SHA-256 of the bytes; U04's reduced-motion case is the `setReducedMotion` op.
* **Why:** The dl corpus may not be read.

## A-17 The manifest and its comparison

* **Rev 3:** RESOLVED-IN-REV3, STANDS. **Reading matched the rev 3 text:** yes.
* **Sections:** 8.1, 7.8, 13.4 U06
* **Reading used:** Capabilities as 6.5/7.8 list them (mandatory supported, `labels` degraded LABELS_ELIDED, `labels.edge` by the options, export.svg/png, motion.animated, a11y.native-dom, a11y.companion-dom NOT_IMPLEMENTED, `scene.apply-delta` RESERVED, the `x-` extras); default name `webgl-renderer`, version `0.0.0`. U06 writes the manifest of the renderer object (via `createWebglRenderer`) for both hosts and an outcome file `json/U06.equal.json` recording that it equals `glManifest` and passes `verifyManifest`.
* **Why:** The text lists the ids; the row needs bytes.

## A-18 [DESIGN DEFECT] K10 (kind and style swapped) is not killed by G07

* **Rev 3:** RESOLVED-IN-REV3, FIXED: killer G05 only. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.4 K10, G07
* **Reading used:** G07 (loops2, initial) holds only kind-2, style-2 instances in layer 3, so swapping the two bytes changes nothing; K10 is killed by G05 and many other rows.
* **Why:** Measured in `MUTANTS.tsv`.

## A-19 [DESIGN DEFECT] K94 and K112 overlap

* **Rev 3:** RESOLVED-IN-REV3, FIXED: K94 = box test, K112 = clipped away, killers B13 and B21. **Reading matched the rev 3 text:** partly: the rev 2 K94 also covered clipped-away edges (A-38).
* **Sections:** 13.5 K94, K112
* **Reading used:** Rev 2 generation: K94 was implemented as the arrow of any omitted edge (box test or clipped away) kept without the guard test, K112 as the subset clipped away; rev 3 makes K94 the box-test case (killer B13) and K112 the clipped-away case (B21).
* **Why:** If K94 meant only the box test, B21 could not kill it (B21's edge passes the box test).

## A-20 Wording of some mutants

* **Rev 3:** RESOLVED-IN-REV3, STANDS (realization is the oracle's). **Reading matched the rev 3 text:** yes.
* **Sections:** 13.5 K72, K17, K13, K06, K69
* **Reading used:** K72: the readout guard-box test uses the open interval. K17: with no text records the node discs are dropped (the buffers depend on the label options). K13: a dummy arrow instance on an undirected plan. K06: the pid written is the 0-based index of the instance in its buffer. K69: the renderer's own manifest uses the `dom` label budget on a headless host (so that default and non-default rows both see it).
* **Why:** The mutation column gives a phrase; the matrix needs a definition.

## A-21 Shader rows

* **Rev 3:** RESOLVED-IN-REV3, FIXED: H01 has no final LF. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.4, 13.4 H01-H06
* **Reading used:** H01 is `shaderSetBytes()`: 4490 bytes, canonical JSON, **no** trailing LF (so rule X1's "+ LF" does not apply to it; A.8 quotes no block). H02/H03/H05/H06 expected files are canonical JSON of the computed values (digest, per-source size and SHA-256, before/after digests around two hostile plans, the identifier sets extracted from the text by a small line parser and their equality with 7.4); H04 reports H-1 and H-2 per source. The six sources and the digest are recorded in `shaders/`.
* **Why:** Needed to give each row a byte form. `gl_VertexID` is not an attribute for H06 (7.4 says so).

## A-22 A.10 cannot be reproduced through a scene

* **Rev 3:** RESOLVED-IN-REV3, FIXED: A.10 is a list-level example. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.3, 13.4 A.10, B11
* **Reading used:** A.10 is reproduced at list level (an in-memory display list with the placeholder hashes) and matches. Rows B11, B14, B15 use scenes, whose straight edges are trimmed by 12 px, so their clipped numbers differ from A.10's; B11/B12 are tuned by search (`inputs/B11.search.json`, `inputs/B12.search.json`) so that a clipped coordinate has a fraction of at least 1/2 (asserted with exact fractions).
* **Why:** A.10's list has an untrimmed edge that no layout can produce.

## A-23 B01 needs a curved edge with a far end: a parallel pair

* **Rev 3:** RESOLVED-IN-REV3, FIXED: B01 needs a parallel pair. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.4 B01
* **Reading used:** Scene `far-thr`: a node in view and two far nodes, each in an antiparallel pair; the largest coordinate of the first pair is exactly 16777215 (kept, kind 1), of the second 16777216 (clipped). Found by scanning the far node's x (`inputs/B01.search.json`).
* **Why:** A self-loop cannot straddle the guard box; only a parallel pair has form 1 and a far end.

## A-24 Which rows can reach which clip case

* **Rev 3:** RESOLVED-IN-REV3, FIXED: notes on B12, B18, B21. **Reading matched the rev 3 text:** yes.
* **Sections:** 7.3, 13.4 B12, B18, B21
* **Reading used:** An edge whose coordinates are all below 2^24 is never clipped, so the `p = 0, q < 0` case of B18 needs one end beyond 2^24 (the row has one at -20,000,000 m-px); B12 needs a node just inside the left of the guard box so that a chain of at least two instances results (`far-pair`); B21 is a slightly tilted edge that ends 5000 m-px above the top side (searched, `inputs/B21.search.json`) whose clip is rejected through t0 > t1 while its arrow meets the box.
* **Why:** The text describes the cases as if the clip were reached by any edge.

## A-25 Rows with several outputs

* **Rev 5:** RESOLVED-IN-REV5, B08: case c moves to list/plan level (13.4). **Reading matched:** no, the rev 3 generation built case c with a renderer (A-41).
* **Rev 3:** RESOLVED-IN-REV3, FIXED: also cases. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.4 B08, B05
* **Reading used:** B08 lists its three variants (`labels:false`, `edgeLabels:false`, `maxDrawnLabelUnits:0`) in the row: the first is the `expected` plan, the others under `"also"`; `json/B08.*.json` record that the buffers equal G01's and the `nt` of each.
* **Why:** One row = one expected cell.

## A-26 X05 (three-way) and the scrape of the SVG document

* **Rev 3:** RESOLVED-IN-REV3, STANDS. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.4 X05, 9.3
* **Reading used:** The oracle scrapes the expected V5 document `../oracles-svg/svg/G01.svg` with regular expressions into a `SvgReadoutLike` (decimal strings parsed exactly), builds the readouts from the SVG object, from its own Canvas stream (stored as `calls/X05.calls`) and from the plan, and asserts the four (with the list's) are the same bytes; the row's file is that one readout.
* **Why:** No format of the scrape is given.

## A-27 Input forms the grammar does not cover

* **Rev 3:** RESOLVED-IN-REV3, FIXED: W01, X, search grammars. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.2, 13.4 W01
* **Reading used:** W01 is an inline file list; X rows use `from`; E, P, U controller rows as in the README. Keys are closed per family as documented.
* **Why:** 13.2 lists grammars for G, N, X, Y, O, F, S, P, B, C, Z, R and a generic one for the gl families.

## A-28 Runtime rows

* **Rev 3:** RESOLVED-IN-REV3, STANDS. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.4 D01-D05
* **Reading used:** No files. The generator runs seeded versions as self-checks: D01 40 random models (LCG seed 20261119) with 12 random intents each; D02 every plan number below 2^24; D03 buffers unchanged under three label options; D04 draw instance counts and the layer-3/ce accounting through the executor fake; D05 the exact clip against brute force on 300 random segments (1200 points), at most 1 m-px off. The counts are in the self-check list of the README.
* **Why:** D rows are runtime by design (13.6).

## A-29 No generated oversize vectors

* **Rev 3:** RESOLVED-IN-REV3, STANDS. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.7, 13.1, 13.2
* **Reading used:** `generated/GENERATED.tsv` is header only: no gl: row has an input too large to store (the largest plan is a few thousand bytes).
* **Why:** The design asks for GENERATED.tsv only "where rows need them".

## A-30 Display-list builder choices

* **Rev 3:** RESOLVED-IN-REV3, STANDS. **Reading matched the rev 3 text:** yes.
* **Sections:** 3.5, 4.4, 30 6.2
* **Reading used:** Grouping and ranks count visible edges only; a degenerate pair classifies all its members as degenerate before grouping; parallel rank is the 0-based position in scene order within the group; the arrowhead uses the point before the last as written in the record; label budget walk, `fidelity` and `label_units` as 4.4(g); the coordinate check (|v| <= 2^40) is made after the whole list is built. All of Appendix A.1, A.3, A.9 reproduces.
* **Why:** Stated for the record; no conflict found.

## A-31 A node emitted but outside the guard box

* **Rev 3:** RESOLVED-IN-REV3, FIXED: stated in 9.1. **Reading matched the rev 3 text:** yes.
* **Sections:** 9.1, 7.3, 13.4 X04
* **Reading used:** A node whose centre is between the guard box and the guard box expanded by 22000 is in layer 7 of the plan and in `nodes_far` of the readout (its centre is outside the guard box); a node on the closed boundary is in `nodes_at` (X04 shows both).
* **Why:** 9.1 defines the domain, 7.3 the emission; the two differ by 22000.

## A-32 [DESIGN DEFECT] Duplicated text

* **Rev 3:** RESOLVED-IN-REV3, FIXED: duplicates removed. **Reading matched the rev 3 text:** yes.
* **Sections:** design file: change log and sections 5.2, 7.3
* **Reading used:** The "Rev 1 -> rev 2 (re-check findings)" table and its closing sentence appear twice (lines 65-96 and 98-129); the sentence on `p = 0` segments in 7.3 and the first paragraph of 5.2 (`createPicker` and the coordinate check) are each written twice; the header line of 2 still says "Status: DRAFT rev 0"; the change-log line "Findings table of later reviews: to be filled" remains.
* **Why:** No rule is affected; listed so the next revision cleans them.

## A-33 Counts

* **Rev 3:** RESOLVED-IN-REV3, STANDS. **Reading matched the rev 3 text:** yes.
* **Sections:** 13.6
* **Reading used:** 279 ids: G 11, B 21, H 6, W 38, X 9, E 11, U 33 (U01-U13 and U20-U39), P 16, D 5, K 129; all built. Rows with empty cells: D (5), K (129), U10.
* **Why:** Equal to the design's count; nothing was dropped.

## A-34 Ending and form of the probe results and of the other outcome files

* **Rev 3:** NEW (found while re-deriving the generator from rev 3).
* **Sections:** 13.2 file endings; 7.7
* **Reading used:** Rev 3 lists the endings: logs, readouts and streams are canonical text plus one LF; `json/H01.set.json` (no LF), `json/U06.*.manifest.json` and `json/U09.*.witness.json` (IGR-CJ/1, no LF) are the exceptions; 'outcome files and scripts are ordinary JSON (indent=1, sorted keys) plus LF'; 'other files under json/ are ordinary JSON'. Read together: every other `json/` file, including the probe results (`json/Pnn.probe.json`, which 13.2 calls 'the canonical probe result') and H02-H06, is ordinary JSON, indent 1, sorted keys, plus one LF; the search records of `inputs/` likewise. **This changes the bytes of the outcome, probe, H02-H06 and search files against the rev 2 generation** (they were canonical JSON without LF); it is the only expected-byte change of this regeneration besides one added U07 case.
* **Why:** No sentence says which form a probe result takes; the generic rule for `json/` and the outcome-file rule were applied. The alternative (canonical text plus LF) would be as defensible; one sentence in 13.2 would settle it.

## A-35 Residual contradiction on when the listeners are logged

* **Rev 3:** NEW (found while re-deriving the generator from rev 3).
* **Sections:** 7.6 vocabulary and Listeners paragraph
* **Reading used:** The Listeners paragraph and the table (listeners added once at the start of every initialize that reaches creation, left after a failure) win over the vocabulary line, which still says 'at a successful initialize, before creation'. The generator follows the paragraph and the table (as the rev 2 reading did).
* **Why:** Rev 3 fixed the table but left the older wording in the vocabulary sentence.

## A-36 'Canvas C (a third factory call)' versus the success path

* **Rev 3:** NEW (found while re-deriving the generator from rev 3).
* **Sections:** 7.7 step (5) and the closing call-order sentence
* **Reading used:** The closing sentences win: the 2D canvas is the next `factory()` call (the second on the success path; after a relaxed retry the probe has already returned).
* **Why:** Step (5) still says 'a third factory call'; the call order printed at the end of 7.7 shows two factory calls on the success path.

## A-37 Code for a non-number element of `ink` in the renderer options

* **Rev 3:** NEW (found while re-deriving the generator from rev 3).
* **Sections:** 6.5 renderer options, 6.2 replay options
* **Reading used:** 6.2 says a non-number or non-integer element of the replay `ink` is INVALID_VALUE; 6.5 says the renderer option `ink` is 'three integers 0..255' with numeric classes as 27 15. The same code (INVALID_VALUE) is applied to a non-number element of the renderer option; a non-array or a wrong length stays SCHEMA. Row U07 gained the case `{'ink':['a',0,0]}`. (The rev 2 generation used SCHEMA here; no row tested it.)
* **Why:** 27 15 gives classes for a number (a string where a number belongs is SCHEMA there); 6.2 says INVALID_VALUE for an element. The replay sentence was followed because the option is handed to the replay.

## A-38 K94 and K112 as redefined

* **Rev 3:** NEW (found while re-deriving the generator from rev 3).
* **Sections:** 13.5 K94, K112; rev 3 table
* **Reading used:** K94 is now 'the arrow of an edge omitted by the box test is emitted without the guard test' (killer B13 only); K112 'an arrow is emitted for an edge whose polyline was clipped away' (killer B21). Implemented exactly so; B13 kills K94, B21 kills K112 and not K94.
* **Why:** The rev 2 generation had K94 also cover clipped-away edges (so B21 killed it); the corrected killer lists were adopted.

## A-39 The single-focus clause of G12 has no row and no mutant

* **Rev 3:** NEW (found while re-deriving the generator from rev 3).
* **Sections:** 7.2 G12 (rev 5), 13.4 W rows, 13.5 K33
* **Reading used:** G12 is implemented as: the number of distinct pids of layers 2 and 6 plus the cn and ce entries whose flags & 2 is set is at most one. Nothing in the corpus exercises it: no W row is single-fault for this clause and no mutant removes it (K33 'reader skips G12' is killed by W24, W25, W28 through the subset clause). The generator asserts the clause separately (a plan with an edge focus in layer 2 and a cn entry with flags & 2 is rejected by G12 and accepted when only G12 is disabled).
* **Why:** Rev 5 adds the clause to the rule but, by its own regeneration list, adds no row; an implementation that omits it passes every row. A W row (a new id) would be the way to cover it; ids are frozen at 279 so none was added. Whether a repeated instance of one clipped focused edge counts once (distinct pids) or per instance is not said; distinct pids was read.

## A-40 The rev 5 controller outcomes are asserted by the generator, not by rows

* **Rev 3:** NEW (found while re-deriving the generator from rev 3).
* **Sections:** 7.6 (rev 5) rows U31, U34, U36, U39, U28
* **Reading used:** The release rule (loseContext only on a context that was obtained and is not lost, in every phase; dispose in created with a lost context obtained makes no release call), the (failed, R) lost-again outcome (phase lost, failure cleared, onStatus, no cleanup calls) and the (failed, R) second-usable-failure outcome (phase stays failed, onError once, new failure token, no onStatus) are implemented in the reference and asserted in the generator's self-checks. No existing row reaches them (U28 is lost to lost, U31 failed to ready, U34 and U39 have a usable context), and the 279 ids are frozen, so no expected byte changed. Mutant K97 (a loss during the restore rebuild ends in failed) is still killed by U28.
* **Why:** Stated for the record: the new rules are covered only by the generator, so a code that gets them wrong still passes the corpus.

## A-41 B08 case c at list/plan level

* **Rev 3:** NEW (found while re-deriving the generator from rev 3).
* **Sections:** 6.5 (rev 5), 13.4 B08
* **Reading used:** Case c is built as planGl(buildDisplayList(model, state, {maxDrawnLabelUnits: 0})) with no renderer; its input key is {'list':{'maxDrawnLabelUnits':0}} (under 'also'; cases a and b keep {'options':{'dl':...}}); the row's tier stays subject. A renderer built with dl.maxDrawnLabelUnits 0 (or capacity 0) is refused INVALID_INPUT/OUT_OF_RANGE by the reference (no row: 6.5 leaves it to unit tests). plan/B08.c.glplan is byte-identical to the rev 3 generation; json/B08.c.json records the list form of the option instead of the options form.
* **Why:** The plan bytes do not depend on whether the zero budget reaches the builder through a renderer. 6.5 gives the code for a capacity of 0 (the same family as the one-value rule) but not for the dl option itself: OUT_OF_RANGE was used for both.

## A-42 Rows B22, B23, X10-X13 (and X14-X18): expected plans derived from B14 and B13, not by re-running a planner

* **Rev 5:** NEW (gap review after rev 5; closes the row part of A-39 for the omitted elements).
* **Sections:** 7.2 (`cn`, `ce` entries `[pid, flags]` with the flags of the list's `N`/`E`), 4.4 (c), (d) (`flags = 1*selected + 2*focused`), 7.3 (the guard rule decides omission from geometry), 9.3 (marks "from the omitted entries' `flags`").
* **Reading used:** whether an element is omitted depends only on geometry, never on selection or focus, so the plan of a state that only adds a focus to B14's scene (`far-a`, both nodes culled) or B13's scene (`far-out`, the edge entirely outside) is the plan of B14 or B13 with the flags of the one omitted entry changed (B22: `cn [[1,2],[2,0]]`; `also` B22b: selected and focused, `[1,3]`; B23: `ce [[4,2]]` with the selection emptied; `also` B23b: `[4,3]`, B13's selection kept). The expected files were derived that way and checked by the reference reader (G1-G16) and readout, not by running a planner again. X10-X13 are the readouts of those four plans: the focus comes from the entry's flags (`marked.focus`), the culled node stays in `drawn` and in `nodes_far`.
* **Why:** a new planner run would add nothing: the guard rule is covered by B13-B21; what was uncovered is the flag of a *focused* omitted element and its readout.

## A-43 Row W47 and the distinct-pid reading of G12

* **Rev 5:** NEW (gap review). Closes the row part of A-39.
* **Sections:** 7.2 G11, G12; 13.4 W.
* **Reading used:** W39-W46 are single-fault plans for the single-focus clause (the reference reader reports exactly `G12` for each; asserted); W47 lists plans the reader must **accept**: the existing `bad/BASE.glplan` (a layer-2 edge focus with selected omitted entries), a focused edge whose chain has two kind-0 instances of one pid in layers 1, 2 and 3 (`plan/W47.b`), one omitted focused node (`.c`), one drawn node focus with selected omitted entries (`.d`), one omitted focused edge (`.e`). "The pids ... number at most one" is read as **distinct pids**, which the text forces: a clipped focused edge repeats its pid (G11) and a plan builder must still produce a valid plan. The plans of W47 are synthetic (edited from BASE), not planner outputs.
* **Why:** A-39 said no row covers the clause and that "whether a repeated instance counts once or per instance is not said"; W47.b answers it with the only reading under which the builder's own output is valid. The same plans are read by the rows X14-X18 (a readout is taken through the strict reader), because the harness of V7 dispatches the inline `files` form of a W row for W01 only (by id): W47 itself is not run there (a runner finding, not a design one; design 13.2 gives the `files` form for acceptance).

## A-44 Rows U42, U43: the release rule in `created` with a lost context

* **Rev 5:** NEW (gap review). Closes the row part of A-40 (the controller outcomes).
* **Sections:** 7.6 table rows `created` L/R and D, "Release rule", status convention, 13.2 controller fake.
* **Reading used:** after a failed initialize the phase is `created`, a context object exists and the listeners are in place. The table row `created | L, R` says "X (no context to lose; ignored)" and, unlike every other loss row, does not list `preventDefault`: a loss in `created` is ignored without any effect line, status unchanged, `status().contextLost` is the fake's flag (true from the loss). The release rule says `loseContext()` only for a context that "was obtained and is **not lost**": since `created` ignores the loss event, "lost" can only mean the context's own state (`isContextLost()`), so U42 (`init` fails, L, D) logs no `getExtension`/`loseContext`, and U43 (`init` fails, L, R, D) does, because R makes the context usable again. Mutants K147-K149 differ on exactly this.
* **Not used:** a loss *during* the failed creation (the fake's `fail: "lost"` at `init`): 7.5 says the detail token is `CONTEXT_LOST` "followed by a colon and at most 120 characters of the driver's info log (called once, after the status check and before the cleanup)", but a lost context returns no log and the design does not say whether `getShaderInfoLog` is still called; no row writes that byte.
* **Why:** U42 is the "dispose in `created` with a lost context" case the ledger names (M-4); without the reading above no event sequence reaches it.

## A-45 The U-row convention differs from the sentence of 13.2 about rows with a log and an error

* **Rev 5:** NEW (gap review); a finding about the existing corpus.
* **Sections:** 13.2 "A failure that has both a log and an error" (lists U25, U27, U31, U34, U36, U39), README of this corpus, A-06.
* **Reading used:** the existing rows U25, U27, U31, U34, U36, U39 have an **empty** `error` cell and no `info_log`/`expect_detail` in their input (only E10 and E11 have them), contrary to 13.2 and to A-06. The new controller rows follow the existing U rows (expected = the log, `error` empty, no info log), so one runner reads all U rows alike; U42 and U43 contain a failed initialize in that form.
* **Why:** consistency with the committed rows; whether the design sentence or the rows should change is the owner's call.

## A-46 Controller cells deliberately not written as rows

* **Rev 5:** NEW (gap review).
* **Sections:** 7.6.
* **Reading used:** (a) a second `init` after a failed `init` (created, creation fails, then `init` again): "listeners added once at the start of every initialize that reaches creation" and "a failed initialize leaves them in place" leave open whether the listeners are added twice; (b) `L` or `R` after `dispose`: with the listeners removed the fake's flag, and so `status().contextLost`, is not determined; U49 uses only `C`, `F`, `init`, `D` after the dispose; (c) a plan with two foci read with every reader rule disabled (X07's mode): 9.3 says `readoutFromGl` "reports the one focus or none" for valid plans; the result for two foci is not stated. No row encodes a guess for (a)-(c).
* **Why:** underspecified; recorded for the owner.

## A-47 After dispose, does the controller fake's flag still follow L and R?

* **Rev 6:** NEW (rows U54-U57 for R31-11 (b)).
* **Sections:** 7.6 "Listeners" (last sentences: "After `dispose`, `L` and `R` are ignored, and `status().contextLost` continues to report the context's own `isContextLost()`"), the controller conventions ("`status().contextLost` is the fake's flag (true from a loss to the next restore; `loseContext()` at dispose does not set it)"), 13.2 controller fake ("reports `isContextLost()` true from the event `"lost"` on and false after an `R`").
* **Reading used:** the fake's flag is the context's own state and follows the `L` and `R` inputs in every phase, also after `dispose` and with the listeners removed (a removed listener means the controller is not told, not that the context stops being lost). `status().contextLost` after dispose reports that flag: in U54-U57 it is true after a loss, false after a restore, and no line is logged for the events (no `preventDefault`, no `labels.clear`, no `onStatus`, no GL call).
* **Why:** the clause "(not a value kept from the dispose)" can be tested only if the value can change after dispose. If the owner's fake stops following events once the listeners are removed, the statuses after the first post-dispose `L` or `R` of U54-U57 are wrong (the log lines would still be right) and mutant K167 would be unkillable. The reading is the only one under which the rev 6 sentence has content.

## A-48 `L` or `R` in `created` before any context object was obtained

* **Rev 6:** NEW (no row written).
* **Sections:** 7.6 table `created | L, R` ("X (no context to lose; ignored). A loss event in `created` is ignored: no effect line, status unchanged, `status().contextLost` true").
* **Reading used:** none; no row sends `L` or `R` to a controller that has not reached `getContext` (before the first `initialize`). The sentence says there is no context to lose and also that `contextLost` is true afterwards. The rows use a loss in `created` only after a failed initialize (a context object exists: U42, U43) and after dispose following an initialize (U54-U57). U44 sends an `R` with no context and shows `contextLost` false (the flag cannot become true).
* **Why:** the byte (`contextLost` of a controller with no context after an `L`) is not determined; recorded for the owner.

## A-49 "so that a loss during creation is observable" versus "a loss event in `created` is ignored"

* **Rev 6:** NEW (wording; the rows are unaffected).
* **Sections:** 7.6 "Listeners" ("added once ... before the creation calls (so that a loss during creation is observable)"), table `created | L, R`, 7.5 failure paragraph.
* **Reading used:** the listeners are in place during creation, a loss event arriving in `created` is ignored without an effect line, so the loss is observable only as the failed initialize (`onError`, `reject` with `CONTEXT_LOST`, `status().failure` `CONTEXT_LOST`) and through `status().contextLost`. U50 pins exactly those lines. Whether the fake also dispatches `webglcontextlost` during creation is not stated; the log is the same either way, because the event is ignored in `created`.
* **Why:** the two sentences read as if the listeners made the loss visible as a line; no line shows it.

## A-50 The `detail` string of a rejection caused by a loss during creation (executor level)

* **Rev 6:** NEW (no row written).
* **Sections:** 7.5 failure paragraph, 13.2 `E` grammar.
* **Reading used:** 7.5 says the detail is `CONTEXT_LOST` "with no driver text"; for the other tokens it is the token, a colon and at most 120 characters of the info log. Whether a loss gives the bare `CONTEXT_LOST` or `CONTEXT_LOST:` is not said, and the `E` scenarios (`create`, `frame`, `dispose`, `fail-compile:<program>.<stage>`, `fail-link:<program>`) have no lost scenario. The controller log records the closed token only (`["onError","INVALID_INPUT/INVALID_VALUE","CONTEXT_LOST"]`), so U50-U53 do not depend on the string; no `E` row writes it.
* **Why:** nothing in the grammar can carry it; an implementation may choose either spelling and pass the corpus.

## A-51 13.2 "`onError` then `onStatus` (a failed restore)" is not exact

* **Rev 6:** NEW (wording; the rows follow 7.6).
* **Sections:** 13.2 "A failure that has both a log and an error"; 7.6 table `lost | R` and `failed | R` (M-15 of rev 5).
* **Reading used:** from `lost` a failed restore logs `onError` then `onStatus` (phase becomes `failed`: U25, U57); from `failed` a second usable failure logs `onError` only (no phase change, no `onStatus`: U41). The 13.2 sentence is read as describing the `lost` to `failed` restore.
* **Why:** read literally for every failed restore, the sentence contradicts the `failed | R` row.

## A-52 An initialize on a context that is still lost

* **Rev 6:** NEW (no row written).
* **Sections:** 7.5 ("an `isContextLost()` that is true after a step stops creation"), 7.6 `created | init`.
* **Reading used:** none. After a loss during creation (U50) the context stays lost until an `R`. A second `initialize` without a restore in between would start creation on a lost context; 7.5 says a lost context stops creation but not after which step the first check happens, and the fake's log stops "where the loss happened", which is not where it is already lost. U52 therefore sends an `R` between the two initializes.
* **Why:** the log of that case is not determined; recorded for the owner.

## Resolved in rev 6 (appended; no entry above is edited)

**52 entries (A-01 to A-52), 8 of them design defects** (A-47 to A-52 were added after design 31 rev 6; the entry count in the header of this file is the rev 5 figure). Rev 6 (table `Rev 5 -> rev 6`, owner-adopted wording R31-01..R31-04, R31-07..R31-11 (a), (b)) resolves or confirms these entries; nothing above is rewritten, the notes here supersede the "Reading used" lines where they differ.

* **A-06 (the `U` rows part) and A-45:** RESOLVED-IN-REV6 (R31-10), FIXED in 13.2: a controller row whose run contains a failed initialize has an empty `error` cell and the log as its expected file; `info_log` / `expect_detail` are for `E10` and `E11` only; the rows `U25`, `U27`, `U31`, `U34`, `U36`, `U39` follow it. **Reading matched:** yes (the corpus rows were already in that form; checked by script over `EXPECT.tsv` for all six rows and for `E10`, `E11`). No row changed.
* **A-39 and A-43 (single focus, distinct pids):** RESOLVED-IN-REV6 (R31-07), CHANGED in 7.2 G12: "at most one **distinct** pid; a clipped focused edge repeats its pid (G11) and the repeat is not a second focus". **Reading matched:** yes (A-43 read the clause as distinct pids). Already carried by `W39`-`W46` (more than one focus is refused), `W47` and `X14` (a clipped focused edge is accepted) and the mutants `K130`-`K136`; rev 6 adds the planner row `B24` (a real planner output with a focused edge of several clipped segments), `W48`, `W49` (a repeated pid plus a second distinct pid, two distinct repeated pids), `W50`, `X19`, `X20` and `K157`-`K159`.
* **A-44 (release rule in `created`; "Not used": a loss during creation):** RESOLVED-IN-REV6 (R31-08, R31-09). The loss in `created` is ignored with `status().contextLost` true and the release rule's "not lost" is the context's own `isContextLost()`: **reading matched:** yes (`U42`, `U43`, `K147`-`K149`, verified). The loss during creation is now stated: detail `CONTEXT_LOST` with no driver text and `getShaderInfoLog` not called: **reading matched:** the oracle's convention (the log stops after the `getShaderParameter` of `arrow.vs`, no cleanup) is consistent with it; new rows `U50`-`U52`, mutants `K160`-`K164`.
* **A-46 (a) a second `initialize` after a failed one:** RESOLVED-IN-REV6 (R31-11 (a)): no listener is added again. New rows `U52`, `U53`, mutants `K165`, `K166`. **(b) `L` or `R` after `dispose`:** RESOLVED-IN-REV6 (R31-11 (b)): ignored, and `status().contextLost` reports the context's own `isContextLost()` (see A-47 for the one reading needed). New rows `U54`-`U57`, mutants `K167`-`K170`. **(c) a plan with two foci read with every reader rule disabled:** STILL OPEN (R31-11 (c) is not folded in rev 6): no row.
* **A-09 (a loss during creation, the "log stops" convention):** CONFIRMED in part: 7.5 now says no driver text and no `getShaderInfoLog`; the point where the log stops (right after the `getShaderParameter` of `arrow.vs`) remains the oracle's convention of 7.6 ("Controller conventions") and is not changed.
* **Not folded by rev 6 and not covered here:** R31-05, R31-06, R31-11 (c), R30-31-01 (open in the design); no row is written for them.
