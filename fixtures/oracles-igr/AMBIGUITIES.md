# Ambiguities, contradictions, gaps and impossibilities found while writing the IGR/1 oracle

Source of truth: `27-IGR1-DESIGN.md` (rev 5 for the corpus now in this directory; the A-nn entries were written against rev 2, the B-nn against rev 3, the C-nn against rev 4 and the D-nn against rev 5; cited by section), `IGS-1.md`, `IGL-1.md`. Rule applied throughout: choose the most literal reading, continue, record it here; never invent silently. Severity: **Impossible** (the row cannot be produced as written), **High** (changes expected bytes of several vectors or the kit contract), **Medium** (changes a few vectors), **Low** (wording, one or two bytes). "Second reading" = what changes if the other reading is right; where a corpus row would need regenerating, the ids are named.

Appendix A reproduced **exactly**: 46 of 46 items (A.1 model bytes, A.2 state bytes, every number of A.3, A.4 and A.5, the three event byte strings of A.6, the five-step focus walk and the boundary event), checked by `tools/appendix_a.py`, which extracts the expected strings from the design text. This still holds against rev 3 (Appendix A changed only in wording).

---

## Rev 5 status (the corpus was regenerated from rev 5, 354 ids)

Rev 5 closes the vector gap found by the re-audit (mutants `K58`, `K59`, `K76`, the auditor's N4-N7). **Every expected value of the new rows was re-derived by the generator and compared with the design: no disagreement** (`S51` `UNRESOLVED_ELEMENT`, `S52` `NON_CANONICAL`, `S53` `INVALID_NUMBER`, `S54` `LAYOUT_MISMATCH`, `S55` `INVALID_VALUE`, `M30` categories `["～","😀"]`, `A21` summary and names, `P27` `SCHEMA`, `L27` the seven outcomes `INVALID_VALUE`, `SCHEMA`, `OUT_OF_RANGE`, `SCHEMA`, `NOT_FINITE`, `OUT_OF_RANGE`, ok). Regenerating changed **no byte of any earlier file**; `EXPECT.tsv` gained 13 rows and the tier of `S50` became `core` (checked by comparing `SHA256SUMS` before and after).

**Mutant check (my own, `tools/mutants_check.py`).** Every mutant that has oracle rows is applied to the Python reference and the rows that flip are listed; each flips at least one row of the check the design names: `K58` (ordering before integrity: `S16`, `S17`, `S51`), `K59` (binding last: `S22`, `S54`), `K73` (`S48`), `K75` (`S49`), `K76` (text budget exclusive: `R51`, under `CHK-INTENT`), `K77` (state size exclusive: `S50`, core), `K79` (`P27`), `K80` (`S55`), `K81` (`L27`), `K82` (`M30` core, `A21` under `CHK-LABEL`), plus the earlier hit, viewport and fit mutants (31 mutations in all, none uncovered). I also checked that the 41 subject-tier `S` rows reach the same error through the object rules alone (steps 1-5, no byte rule), as `loadScene(model, initial)` requires: no mismatch.

| Finding | Status in rev 5 | Corpus |
|---|---|---|
| C-02 tier of `S50` | **fixed** (core) | `S50` is `core` |
| C-01, C-03 to C-10 | unchanged by rev 5 (the choices stay as recorded) | same |

### Findings on rev 5 (D-nn)

* **D-01 (Low) `S52` is not a `K58` row.** Rev 5 lists `S52` ("unsorted and selected-hidden", `NON_CANONICAL`) among the rows that catch `K58` ("`parseState` checks ordering before integrity"). A subject that checks ordering first still returns `NON_CANONICAL` for `S52`; `S52` catches the opposite mistake (consistency before ordering), which I implemented as a separate mutant `K58b`: only `S52` flips. `K58` itself is caught by `S16`, `S17`, `S51`. `K58b` has no `K` id in the design (it is not `K73`, which swaps `SELECTED_HIDDEN` and `FOCUS_HIDDEN`).
* **D-02 (Low) `S53` has no named mutant.** It pins schema before binding (a stale hash and a bad zoom: `INVALID_NUMBER`); `K59` is "binding last", the opposite direction. A mutant "binding before schema" would be killed by `S53`; no `K` id names it.
* **D-03 (Low) `L27` order inside `initialize`.** One defective limit per call, so the order between the size check, the phase check and the limits check is untested; chosen: phase, then size, then limits. Each failed call leaves the phase `created`, so seven `initialize` calls follow one another (the last, `maxNodes` 0, succeeds). The `NaN` call is written with the corpus token `"NaN"`, the string call with the real string `"5"`.
* **D-04 (Info) `loadScene` and `maxStateBytes`.** Rev 5 says `loadScene` applies no `maxStateBytes`; no row can test it (a state object has no bytes) beyond `S41`/`S50`, which are core. The generator's lifecycle simulation parses an `initial` file with an unlimited size.
* **D-05 (Info) New author-written inputs.** `scenes/M30`, `layouts/M30` (types U+FF5E and U+1F600 as identifiers, ids `i:1` in both) join the list of A-36 for third-party verification.

---

## Rev 4 status (the corpus was regenerated from rev 4, 341 ids)

Rev 4 of the design pins the findings above (B-01 to B-11), the code audit and the implementer's notes. **Every expected value of 13.3b was re-derived by the generator and compared with the number or byte the design states: no disagreement.** (S47 centre 1501/2001 and zoom 100000 with the four intermediate numbers, H27 distances 11,937,500 and 12,000,500 µpx and 8.43 px, R51 = exactly 504 units and R52 = 513, C16, C17 and C20 differences, A20 `"a  R b"`.) Of the 15 disagreements of the table in the rev 4 change log, the corpus already agreed with the pinned text on all rows that exist for them; where the oracle side was pinned (1-3, 5-10, 11) the earlier files did not change: regenerating changed **no byte of any rev 3 file** (only `EXPECT.tsv` gained rows), checked by comparing `SHA256SUMS` before and after. The only code differences from rev 3 were in paths no rev 3 row exercised: an intent target container must hold an *object* (`{"node":5}` is `SCHEMA`, previously `UNRESOLVED_ELEMENT`), `set-hidden` checks `targets` before `hidden`, and report validation is now V1-V5 (exact address key shapes, `state.igr`, `accessible.items`, `drawn` as a set).

| Point of the table | Corpus |
|---|---|
| 1 compare order, 2 stale `state.scene_sha256`, 3 `drawn` as a set, 4 tie rule | agree; rows `C14`-`C17`, `C20` |
| 5 address key errors in a state | agree (already `UNKNOWN_FIELD`/`MISSING_FIELD`); rows `S42`-`S46` |
| 6 malformed address in a target, 7 `{}` | agree (already `UNRESOLVED_ELEMENT`, `SCHEMA`); rows `R42`-`R48` |
| 8 `indicators.non-color`, 9 `labels.edge` `HOST_LACKS`, 10 non-number capacity | agree (already `MANDATORY_DEGRADED`, `HOST_LACKS_NOT_ALLOWED`, `SCHEMA`); rows `P22`-`P24` |
| 11 `expect_settle_order` | agree (asynchronous calls only); `L25` |
| 12-14 kit, `undefined`, `serializeProjection` | not file-visible; `C18` follows 14 |
| 15 state failures inside a report | agree: `SCHEMA` for step-1, `UNRESOLVED_ELEMENT`, `NON_CANONICAL` for duplicate/order/consistency; rows `C19`, `C21` |

| B-nn | Status in rev 4 | Corpus |
|---|---|---|
| B-01, B-02 | **defined** (V1-V5; no binding; hash fields inside the state shape-checked only) | matches the author's reading; `C06`, `C10`, `C13` unchanged |
| B-03, B-04 | **defined** (`{}` is `SCHEMA`, `{"type":5}` `UNKNOWN_TYPE`; field order, `mode` before `targets`, container-only check before `TARGET_LIMIT`) | matches; `R42`-`R50` |
| B-05 | **defined** (`RESERVED` applies to `x-`, `HOST_LACKS` does not) | `P25`, `P26` |
| B-06 | **defined** (`MANDATORY_DEGRADED`) | `P22` |
| B-07 | **accepted** | n/a |
| B-08 | **defined** (`expect_recorded_events` only for `record`, `[]` if none; settle order asynchronous only) | matches |
| B-09 | **fixed** (`initialize` `arg` override) | `L24d` |
| B-10 | **fixed** (`DISPOSED` after `dispose()` was called) | `L25` |
| B-11 | recomputed: 341 ids, 83 empty, 258 with files | verified from `EXPECT.tsv` |

### Findings on rev 4 (C-nn)

* **C-01 (Low) `Infinity` in a state.** 4.2: "`1e999` and `Infinity` in a state are `INVALID_NUMBER`". `Infinity` is not a JSON token: in *bytes* the text fails to parse (`SCHEMA`, step 1 (i)); `INVALID_NUMBER` can only apply to an object holding the double. Implemented that way; no vector (`1e999` is a valid token: `INVALID_NUMBER`).
* **C-02 (Low) Tier of `S50`.** 13.3a lists the core `S` rows (`S12 S13 S14 S28 S37 S38 S41`); `S50` has the same input form as `S41` (file plus `maxStateBytes`), which no subject can run through `loadScene(model, initial)`. Followed the list literally: `S50` is `both`. Second reading: `core`, one cell changes.
* **C-03 (Low) Error-only `R` scripts.** `R42`-`R48`, `R50`, `R52` have no successful step, so "the state file of the last successful step" names nothing. Chosen: the unchanged initial state, i.e. `states/S01.state.json` (O1, 900×600, the same bytes as `S01`).
* **C-04 (Low) `applies_if` values.** The lifecycle schema enumerates only `has-undeclared-export-format`; 13.3b says `L26` has "`applies_if` capacity ≤ 1,000,000". Chosen the string `capacity-at-most-1000000` on the `loadScene` calls of `L26`; `L22` (not-applicable above 1,000,000 nodes) carries none, as in rev 3.
* **C-05 (Low) `C18` file format.** `serializeProjection` has no corpus format. The row uses a `*.reports.json` with a top-level `"op":"serializeProjection"` and one entry whose `report` is a projection (no `fidelity`); expected `INVALID_REPORT/INCONSISTENT`.
* **C-06 (Low) `state.igr` in V1/V2.** V1 says the state passes "every step-1 rule except the address patterns and hash binding" (the `igr` value check is a step-1 rule) while V2 names `report.state.igr`. Implemented: the value of `state.igr` is judged at V2 (`UNSUPPORTED_VERSION`), its type at V1.
* **C-07 (Low) `accessible.items` in V1.** "Items of the §10.3 shape": implemented as exact required keys (`description` optional), `role` node|edge, booleans, strings, numbers for `position`/`set_size` (integrality not judged), and the address shape of `ElementAddress`.
* **C-08 (Low) `C14` has three reports.** 13.3b: "two reports, `a` and `b`; `b` has changed hashes **and** another report `c` lacks one visible node": produced as three entries, `a`, `b` (hashes changed consistently), `c` (`drawn` short of `s:ann`); the verdict `INCONSISTENT` depends on validating `c` before the hash check.
* **C-09 (Info) `undefined`, `-0` objects, deep freezing.** No JSON representation, so no corpus vector (rev 4 items 6, `-0`, 8).
* **C-10 (Low) Author-written inputs grew.** `layouts/S47`, `layouts/H27` and the scene/layout pair `A20` join the list of A-36 (third-party verification with the frozen verifiers); `A20` has ids `s:a ` and `s:b` (a trailing space in an id).

---

## Rev 3 status (the corpus was regenerated from rev 3, 287 ids)

The design author answered A-01 to A-36 in rev 3 of the design. The entries further below (A-01 ...) are kept as written against rev 2, because they record what was found; the table says what rev 3 did with each and whether this corpus now follows it. **Every number or byte the design now states was re-derived by the generator and compared; no disagreement was found.** B-01 to B-11 record the places where rev 3 is still silent, or where the author had to choose.

| A-nn | Status in rev 3 | Corpus now |
|---|---|---|
| A-01 `M23` impossible | **fixed** (own bytes; `nodes`, `edges`, `bounds` equal `M01`'s as an assertion) | same as before, asserted by the generator |
| A-02 two inputs per row | **fixed** (one row = one scene, layout, input; `M23b`, `M24b`, `R31b`, `P21` official) | same |
| A-03 `EXPECT.tsv` shape, tiers | **fixed** (all ids listed; `P` is core; `K` empty tier) | `P` tier changed from `both` to `core`; 287 rows; 220 with files, 67 empty (verified) |
| A-04 supplementary ids | **fixed** (design ids) | same |
| A-05 `S` row content | **defined** (matches the author's choices) | same |
| A-06 `parseState` visiting order | **defined** (matches) | same |
| A-07 border on raw or quantized point | **changed** to the quantized point `P`; `H26`, `K62` | implemented; of 2,100 hit points only 5 (all in `H26`) differ between the two readings, as designed |
| A-08 dead endpoint branch | **fixed** (removed, `0 < tn < L2`) | implemented; the old and the new rule agree on all 2,100 points (checked) |
| A-09 intent codes, `NaN` token | **defined** (full table, order of checks, token is a corpus-reader convention) | implemented; see B-03, B-04 |
| A-10 order in `reduce` | **defined** | implemented (the completeness check now precedes every number check) |
| A-11 `remove` of absent | **accepted** | same |
| A-12 event order | **accepted** (nodes, then edges) | same |
| A-13 focus details | **accepted** | same |
| A-14 `fit` padding | **accepted** | same |
| A-15 integer-valued beyond safe | **accepted** | same |
| A-16 focus announcement | **accepted** (bare `t`) | already so; `A01 A03 A07 A08 A09 A11 A13` follow it |
| A-17 summary ignores visibility, `A05` | **accepted** | same |
| A-18 announcements per file | **fixed** (`A19` added: "Start of graph.") | `A19` produced, asserted |
| A-19 manifest order and codes | **defined** (8.1) | implemented; one behaviour changed: `HOST_LACKS` on a mandatory non-visual capability is now `HOST_LACKS_NOT_ALLOWED` (before: `MANDATORY_UNSUPPORTED`); no vector affected |
| A-20 whitespace dialect | **defined** | same |
| A-21 lifecycle precedence | **defined** (ten rules) | implemented; `applySceneDelta` is now also issued while a call is pending (`L19`), `export(5)` is `INVALID_INPUT/SCHEMA` (`L15`) |
| A-22 listener | **accepted** | same |
| A-23 `L14`/`L22` placeholders | **defined** (`applies_if` is the string `has-undeclared-export-format`; kit-built model up to 1,000,000 nodes) | `applies_if` string changed accordingly |
| A-24 `compareProjections` | **defined** (named entries, path algorithm) | implemented as written |
| A-25 `C06`, `C04`, index | **fixed** (`{comparable:false}` on hash mismatch; `C09`-`C13` added; index corrected) | `C09`-`C13` produced; see B-01, B-02 |
| A-26 hit files | **accepted** (`H24` is a file) | same |
| A-27 `R32`/`R33` | **accepted** | same files |
| A-28 `M` rows | **accepted** | same |
| A-29 prefixes | **accepted** (`LAYOUT:`, `IGS:`) | same |
| A-30 lifecycle schema | **accepted** (full schema in 13.3a) | follows it; `expect_recorded_events` is now written only for the `record` listener (B-08) |
| A-31, A-32, A-33 | **accepted** (`H19` per-point `state`, `A16` `reducedMotion`, `C07` `manifest`) | same |
| A-34 other additions | **accepted** | same |
| A-35 Appendix A.6 wording | **fixed** | n/a |
| A-36 author's inputs unverified | **open process item** (a third party must run the frozen verifiers) | still open; the corpus stays DRAFT |

### Findings on rev 3 (B-nn)

* **B-01 (Medium) Report validation order.** 11 lists the `INVALID_REPORT` reasons (`SCHEMA`, `UNSUPPORTED_VERSION`, `UNRESOLVED_ELEMENT`, `NON_CANONICAL`, `INCONSISTENT`) but not the order between them, and does not say how a state failure other than strict serialization (duplicate element, selected-but-hidden) maps. Chosen: the order of the list; every state failure that is not an unresolved address is `NON_CANONICAL`. `C10` (`marked.selected` names no element, state clean) depends on `UNRESOLVED_ELEMENT` winning over `INCONSISTENT`; another order turns `C10` into `INCONSISTENT`.
* **B-02 (Medium) Strict serialization versus "hashes are not checked".** 11 says a state that does not serialize strictly is `NON_CANONICAL` and, in the same paragraph, that hashes are not checked during validation; but `serializeState` includes the binding step (4.2 step 2), so `C06`'s report (hashes changed consistently in `scene_sha256` and `state.scene_sha256`) would throw. Chosen: validation applies steps 3-5 of 4.2 only (no binding). Second reading: `C06` would be `INVALID_REPORT`.
* **B-03 (Low) `type` of an intent.** 5.2: "`type` not a known string: `UNKNOWN_TYPE`" and "a missing field: `SCHEMA`". Chosen: `type` present but not a string, or an unknown string: `UNKNOWN_TYPE`; `type` absent: `SCHEMA`. No vector.
* **B-04 (Low) Placement of the non-number checks.** 5.2 orders: object, `type`, closed and complete field set, number fields, `TARGET_LIMIT`, resolution, visibility. Not placed: the `mode` enum (chosen: after completeness, before the targets), the type of `hidden` (boolean, `SCHEMA`; same place), and a malformed target container (`SCHEMA`; before `TARGET_LIMIT`, since the count needs an array). Every step of `R34` has one defect, so it is unaffected.
* **B-05 (Low) `x-` capabilities.** 8.1 (7c) says `HOST_LACKS` is allowed only on a visual capability of a headless host and `RESERVED` is valid only on `scene.apply-delta`; the table of 8.2 gives `x-...` "any" status. Chosen: the `RESERVED` rule applies to `x-` ids (literal), the `HOST_LACKS` rule does not (table). `P03` avoids `HOST_LACKS` on an `x-` id so that either reading gives the same bytes.
* **B-06 (Low) `indicators.non-color` degraded.** The table gives it `supported` or `unsupported/HOST_LACKS` and no degradation; 8.1 gives `MANDATORY_DEGRADED` for "a mandatory capability ... `degraded` where only `supported` is allowed" and `DEGRADATION_NOT_ALLOWED` for "`degraded` on a capability that allows only `supported`/`unsupported`". Chosen `MANDATORY_DEGRADED`. No vector.
* **B-07 (Low) The index of 12 is not exhaustive.** Computed from the corpus: `INVALID_LIFECYCLE` also occurs in `L08 L09 L18 L22 L23 L24b`, `INVALID_STATE` in `L08 L10`, `INVALID_INPUT` in `L08`, `UNSUPPORTED_CAPABILITY` in `L19` (follow-up calls inside scripts). The index lists primary rows only; not an error.
* **B-08 (Low) Lifecycle file keys.** `expect_recorded_events` is defined for the `record` listener: the corpus writes it only for `record` scripts (so `L21`, the `throw` row, does not assert the recorded events; `L21b`, the same calls with `record`, does), and writes `[]` when nothing was seen. `expect_settle_order` is written for `L18` only (all its calls are asynchronous); for a script with synchronous calls "the order in which the calls settled" is not defined.
* **B-09 (Low) A later valid `initialize` is untestable.** Rule (3) of 9 allows it, but the lifecycle schema has one `env` per script and no per-call override, so no row can fail an `initialize` and then succeed with another size. `L24` ends after the failure; `L24b` shows `getState` is then `NOT_INITIALIZED`.
* **B-10 (Low) `applySceneDelta` after a pending `dispose`.** Rule (7): `DISPOSED` "after dispose". Whether a still pending `dispose` counts is not said; no row issues `applySceneDelta` while `dispose` is pending.
* **B-11 (info) The design's own numbers, re-derived.** 287 ids, 67 empty by design, 220 with files: reproduced from the generated `EXPECT.tsv`. `C03` has four paths: reproduced. `H26`: inside, outside, inside, outside: reproduced. Appendix A: reproduced.

---

## Vectors that are not produced, or produced only in part (rev 3)

| Id(s) | State | Why |
|---|---|---|
| `D01`-`D05`, `K01`-`K82` | rows present, all cells empty (87 at rev 5) | by design: runtime tier and kit code |
| `A16` | the a11y bytes are produced; `motion: "none"` has no oracle bytes | the obligation is checked through `probe()` |
| `L14`, `L22` | produced with kit-substituted placeholders | subject-dependent (A-23); the kit-built oversized model of `L22` is kit side |
| a later valid `initialize` after a failed one | no row | B-09 |

Result at rev 3: 220 of the 287 design ids carried files; at rev 5 the figure is **267 of 354** (M 32, S 55, R 53, H 27, A 21, P 27, L 31, C 21); `D` and `K` (87) are byte-less by design. The 7 ids that were supplementary in rev 2 are design ids in rev 3.

---

## Entries against rev 2 (historical; see the status table above)

## A-01 `M23` cannot expect `M01`'s bytes (Impossible)

* 13.3 `M23`: "layouts igl:V21, V24 (accepted `x-` content) → equals `M01` bytes"; 13.3a: "`M23` expects `M01`'s file".
* `modelBytes` contains `layout_sha256` (2.2, A.1). `V21` and `V24` differ from `F01` by an `x-` key, so their SHA-256 differs from `F01`'s; the model bytes differ from `M01` in that one field (checked: `nodes`, `edges`, `bounds`, everything else equal). A model equal to `M01` byte for byte is impossible.
* Reading chosen: `M23` = `O1` + `V21`, expected = the bytes the rules give (`models/M23.model.json`); `M23b` = `O1` + `V24`. The statement that survives is "equal to M01 except `layout_sha256`", which the generator asserts on `nodes`.
* Second reading: if the intended claim is "equal after removing `layout_sha256`", the kit must compare on the parsed object, not bytes.

## A-02 Rows that name two inputs but have one scene/layout column (High)

`M23` (V21, V24), `M24` (V45, V46), `R31` ("V45/V46 extremes"; the R script has no model field, the model is the row's), `P17` (capacity "0 or fractional"). Chosen: the first-named half in the design row where it is more natural (`M23`: V21, `M24`: V45, `R31`: V46, `P17`: 0) and the other half as a supplementary id (`M23b`, `M24b`, `R31b`, `P21`). Second reading: allow a list of layouts per row, or drop the supplementary ids.

## A-03 Shape of `EXPECT.tsv` (Medium)

* 13.3: "272 ids (267 file-backed; `D` rows have no frozen bytes; `K` rows are code, with no oracle files except the tamper copies)". 272 − 5 = 267 counts the 61 `K` ids as file-backed, which contradicts the same sentence. Real count: 206 ids have files (see above).
* 13.3a lists `D, K` in one table row ("none"/"none"), so all 272 ids are written to `EXPECT.tsv`, `D` and `K` with empty cells. Second reading: `D` and `K` rows are not in the file (267 or 206 rows).
* `group`: not defined (the design names groups "M model", "S state"); chosen the leading letter (`M`, `S`, …). `oracles-igl` uses words (`force`, `fixed`). Low.
* `tier`: `core` / `subject` / `both` is given only in prose (13.1). Chosen: `M` core; `S` both except the byte-level rows `S12 S13 S14 S28 S37 S38 S41` (core, 13.1); `R H A P` both; `L D` subject; `C` core (`compareProjections` is renderer-core); `K` empty (no tier applies). The design does not say which tier `P`, `C`, `K` have. Low.

## A-04 Supplementary ids (documentation)

`M23b`, `M24b`, `R31b`, `P21` (A-02); `L21b` (a `record` listener on the multi-event steps of `L21`, because one script has one listener mode: `L21` uses `throw`); `L24b`, `L24c` (`height` 16385 rejected, `width` 16384 accepted: the boundaries of the same size rule). 13.3 says "exact counts are fixed when the generator first runs"; they are additions of this first run, not changes to any design id. The kit may ignore them.

## A-05 Which model/content for several `S` rows (Medium)

* `S08` (1×1), `S09` (64×64), `S10` (65×65): scene not stated; chosen `O1`+`F01` (as `S01`). Second reading: the empty or a tiny scene would change those three expected files.
* `S02` "selection node+edge", `S03` "with focus": `S15` (unsorted), `S16`, `S17` (duplicate) are "mutated from `S03`" and need at least two nodes in one array. Chosen `S02` = nodes `[i:1, s:ann]`, edge `[KNOWS]`; `S03` = `S02` + focus on the node `s:ann` (so that `S23`, which hides `i:1`, violates only the selection). `S04` (hidden node `s:ann` and edge `KNOWS`, selection `[i:1]`, focus `i:1`), `S05` (centre −500000/−250000, zoom 1000), `S06` (hidden edge only), `S11` (O4: selection of the edge `i:1 R i:2`, focus `i:2`) are the author's.
* `S41`: which file; chosen `S03` with `maxStateBytes` = length − 1. `S22`: the file is `S11`'s bytes against the `O1` model.
* Value-level vs byte-level (13.1): `S27` (1000.5) and `S31` (2^53) are object-expressible and marked `both`; `S28` (`1e3`) is byte-level (core).

## A-06 `parseState`: order inside steps 3 and 5, and visiting order (Medium)

* 4.2 step 3 says "every address resolves; no element twice". Chosen: pass 1 resolves every address of every array (document order of arrays below), pass 2 looks for duplicates. A single array with both an unresolved and a duplicated element, or mixed arrays, is not specified; no vector uses one.
* Arrays are visited in ascending key order (`focus`, `hidden.edges`, `hidden.nodes`, `selection.edges`, `selection.nodes`), i.e. **edges before nodes** inside an `ElementSet`, by the rule "remaining keys in ascending UTF-16 key order" of step 1. Only matters when two arrays carry different errors.
* Step 5: "selected and focused elements are effectively visible": chosen selection first (`SELECTED_HIDDEN`), then focus (`FOCUS_HIDDEN`), the order of the text. `S23`, `S24` are built so that only one is violated.

## A-07 Hit rectangle: raw point or quantized point? (Medium)

7.1: "`P = q(p) × 1000` … A point outside `[0, w]×[0, h]` (closed) has no hit." The sentence follows the `P` definition but speaks of "a point". Chosen: the raw `p` is compared with `[0, w]×[0, h]`; `P` is used only for distances. The two differ only within 0.0005 px of the border (`p = −2^−11` has `q(p) = 0`, "inside" under the other reading). `H17` uses 0, `w`, `h` exactly and ≥ 0.5 px outside, so both readings give the same expected bytes; a kit that wants to pin it needs a new id.

## A-08 The endpoint branch of the edge test can never decide a hit (Low, design observation)

7.1 step 2 gives `tn ≤ 0` and `tn ≥ L2` the endpoint distance. If that distance is ≤ 6 px, the endpoint's node is within 12 px and effectively visible (an effectively visible edge has visible endpoints), so step 1 returns the node. The branch therefore never produces an edge result; it only has to give "no hit" beyond 6 px. `H11` can only pin "no hit beyond a segment end (13 px) / node wins (4, 7 px)". Not an error; a simplification (clamp to the segment, or drop the branch) gives identical results.

## A-09 Intent validation: unspecified schema codes, `NaN` in a script (High)

5.2 fixes four codes (non-number → `SCHEMA`; `NaN`/`±Infinity` → `NOT_FINITE`; finite non-integer → `INVALID_VALUE`; outside domain → `OUT_OF_RANGE`) and `UNKNOWN_TYPE`. Not stated, chosen: an extra field → `SCHEMA` (R34); a missing field → `SCHEMA`; a `mode` or `delta` outside its enum → `INVALID_VALUE`; a non-object intent, a malformed target container or `targets` not an array → `SCHEMA`; a boolean where a number belongs → `SCHEMA`. Only the first two appear in vectors (R34), the others are implemented but unused.
`NaN` in a file: 13.3a says the strings `"NaN"`, `"Infinity"`, `"-Infinity"` stand for doubles "where a coordinate is expected", while 5.2 says "string where a number belongs: `SCHEMA`". Chosen: the three tokens are doubles wherever a number is expected, including intent fields (R34 uses `"NaN"`, `"Infinity"` in `pan.dx`; the "string" case uses `"10"`). Second reading: the NaN step cannot be written in a JSON script and `R34`/`H18` need a different token.

## A-10 Order of checks inside `reduce` (Medium)

Chosen: intent object/type → closed fields → number fields (in the order of the interface) → `TARGET_LIMIT` (count, then address text) → resolve all targets (`UNRESOLVED_ELEMENT`) → `ELEMENT_HIDDEN` (replace/add/toggle) → apply → final range check (`OUT_OF_RANGE`). 15 says the target limits are checked "on `select` and `set-hidden`" without ordering them against resolution; vectors keep each failure isolated, except that `R40` has duplicates counted **before** de-duplication (51 targets that name one node count as 51). `TARGET_LIMIT` text counts the UTF-16 length of every string value of every address (`id`, `type`, `ord`, `rel`, both endpoints); for `R40` the limit `maxSceneBytes` = the scene's byte length (504) so that the model still builds (inclusive boundary, 8.3/15) and 46 × 11 units > 504. The script-level `limits` therefore also reach `buildRenderModel`. Second reading: limits only for `reduce`, then `maxSceneBytes` could be tiny.

## A-11 `remove` of an "absent" target (Low)

5.3: "`remove` … a hidden target is not an error … nor is an absent one." Chosen: "absent" = a resolvable element that is not selected. A target that names nothing in the scene is still `UNRESOLVED_ELEMENT` (the sentence about resolution has no exception). Second reading would turn an unresolved `remove` into a no-op; no vector.

## A-12 Event `selection` / `hidden` order (Low)

5.4: "full selection, scene order" / "explicit hidden set, scene order". Chosen: all nodes in scene order, then all edges in scene order (as the traversal order of 5.3). Second reading: "edges then nodes" (the key order of `ElementSet`); it would reorder every event that mixes both kinds (`R03`, `R05`, `R10`, `R35`, `R41` and the event files of `L` scripts that select an edge).

## A-13 `focus-step` / `focus-first` / `focus-last` details (Low)

Chosen: `traversal-boundary` is emitted only by `focus-step` at an end (`end:"end"` for `+1` at the last element, `end:"start"` for `-1` at the first); `focus-first` when the first element is already focused changes nothing and emits nothing (5.3 last bullet reserves the boundary exception to the boundary event); with focus absent `focus-step` never emits a boundary; the empty traversal is a silent no-op for all three. A one-element traversal: `+1` and `-1` both give a boundary. Second reading: `focus-first`/`focus-last` also emit a boundary.

## A-14 `fit` padding domain (Low)

6: explicit padding "integer `0…VIEWPORT_MAX_PX` (negative: `INVALID_VALUE`; above: `OUT_OF_RANGE`) and `w − 2·padding ≥ 1`, `h − 2·padding ≥ 1`, else `OUT_OF_RANGE`". Implemented literally (`R27`, `R28`); a non-integer padding is `INVALID_VALUE` by 5.2. A padding of 16384 is inside the domain but fails the size rule (`OUT_OF_RANGE`), and 16385 fails the domain: same code, no vector can tell them apart.

## A-15 Integer-valued double beyond the safe range in an intent (Low)

`set-viewport.center_x = 2^53`: 5.2 maps "finite non-integer" to `INVALID_VALUE` and "outside the §6 domain" to `OUT_OF_RANGE`; the value is an integer-valued double outside `|v| ≤ 2^53 − 1`. Chosen `OUT_OF_RANGE` (R30). In a *state* the same value is `INVALID_NUMBER` (4.2); the two rules are consistent only because they are different documents' codes. Second reading `INVALID_VALUE` (R30 steps 3, 4).

## A-16 Announcement text for `focus-changed` (High)

10.2: "`focus-changed` → `t` as above, or "Focus cleared."", while the other announcements are full sentences ending in a full stop and `statusText` embeds `t` as " Focus: {t}.". Chosen: the announcement is `t` itself (`person 1`, `1 KNOWS ann`), **no** trailing full stop. Second reading: `{t}.`. Affects the `announcements` array of every `A` row whose last step emits `focus-changed` with a focus (`A01`, `A03`, `A07`, `A08`, `A09`, `A11`, `A13`); `A15`, `A18` (focus cleared) are unaffected.

## A-17 Summary independent of visibility; `A05` (Low)

`graphSummary(model)` takes only the model (10.2), so counts include effectively hidden elements while `items`/`status` exclude them. Chosen as written. `A05` "singular/plural (1 and 2)" cannot be covered by one frozen scene (no frozen scene has one node and one edge); the author added the scene `A05` (one node with a self-loop: "1 node and 1 edge"); plurals of 2 are in `A02`/`A03`/`A04`.

## A-18 What a single `A` script can cover (Low)

The a11y file carries the announcements of the **last step only** (13.3a). `A15` ("every event, effective counts") therefore covers `visibility-changed`, `selection-changed`, `focus-changed` (cleared) in one step; `traversal-boundary` ("End of graph.") is the last step of `A10`; `viewport-changed` (no announcement, `[]`) is the last step of `A16`. "Start of graph." appears in no a11y file (it is exercised only by the `traversal-boundary` events of `R15`, `R16`, whose announcement text is not an oracle output there). `A18`: expected cell = the events file of the last step of its script (same script as `A15`), the a11y file is also written.

## A-19 Manifest: unstated codes and check order (Medium)

8.1/8.2 name the reasons but not the order between statuses and degradations, nor every code. Chosen: top-level shape (`SCHEMA`) → `igr` (`UNSUPPORTED_VERSION`) → `renderer` (`INVALID_NAME` for name/version patterns) → `capacity` (`INVALID_LIMITS`: not a positive safe integer, fractional included) → missing ids (`MISSING_CAPABILITY`) → unknown ids (`UNKNOWN_CAPABILITY`; **a malformed `x-` id such as `x-Bad` is "unknown"**, `P18`) → each capability in key order: status shape (`SCHEMA`) → degradation names (`UNKNOWN_DEGRADATION`) → status rule. For a status rule: `scene.apply-delta` anything but `unsupported/RESERVED` → `RESERVED_CAPABILITY` (`P09`-`P11`); `RESERVED` on another id → `RESERVED_CAPABILITY` (`P20`); a mandatory id `unsupported` → `MANDATORY_UNSUPPORTED`, `degraded` → `MANDATORY_DEGRADED` **before** any `DEGRADATION_NOT_ALLOWED` (`P08` degrades `viewport` with a degradation the id would not allow anyway); `export.svg` `degraded` with a known degradation → `DEGRADATION_NOT_ALLOWED` (`P13`; the table lists `degraded` as not allowed for it but gives no code for the status itself); `HOST_LACKS` on a `dom` host → `HOST_LACKS_NOT_ALLOWED` (`P15`). Unproduced: `labels`/`direction-cue` `unsupported/NOT_IMPLEMENTED` (implemented as `MANDATORY_UNSUPPORTED`, no vector); an empty `degradations` list (`SCHEMA`); `renderer.host` outside `dom|headless` (`SCHEMA`). Second reading changes `P08`, `P13`, `P18` only.

## A-20 Identifier whitespace dialect (Low)

4.2 gives `^[^\s:|"\\]+$` (JavaScript `\s`); Python's `re` `\s` also matches U+001C–U+001F and differs on others. The generator uses the JavaScript whitespace set (`\t \n \v \f \r`, space, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF). Types and relations in `hostile` therefore contain no whitespace and no `"`; U+2028/U+2029, NUL, DEL and quotes appear only in `s:` ids, while types and relations carry markup, `&` and the bidi control U+202E.

## A-21 Lifecycle phases, precedence, pending calls (High)

9 is prose; the `L` expectations were computed by a small simulation (`tools/lifecycle.py`) of these readings: (1) **BUSY takes precedence over every phase error** for the synchronous methods (`dispatch getState hitTest probe`) while any of `initialize loadScene render export dispose` is pending; `setReducedMotion` is allowed then (`L19`); (2) calls are evaluated **at processing time in FIFO order**, so an un-awaited `loadScene` right after an un-awaited `initialize` succeeds (`L18`), and the `expect` of a `"await": false` call is its *settled* outcome; (3) a failed `initialize` (`L24`) leaves the phase `created` (`getState` afterwards is `NOT_INITIALIZED`, `L24b`; whether a later valid `initialize` is then allowed is not stated, no vector tests it); (4) `initialize` after `dispose` is `DISPOSED` (not `ALREADY_INITIALIZED`); (5) `dispose` is allowed in every phase, including `created`; (6) `setReducedMotion` after `dispose` is `DISPOSED`; (7) `applySceneDelta` is treated as an immediate rejection (not queued; it is not in the list of FIFO calls although it returns a promise), and is never issued while another call is pending; (8) a failed `loadScene` leaves phase and state as before (`L08`, including from `initialized`: `getState` stays `NOT_LOADED`); (9) `loadScene` with `initial` validates exactly like `parseState` (`SCENE_MISMATCH` first) on the bytes of the named file; (10) `export` checks the phase, then the format string (`UNKNOWN_FORMAT` for any string not `scene|svg|png`, including `"SCENE"` and `""`); a non-string argument is not tested.

## A-22 Listener semantics (Medium)

9: `onEvent` is called "synchronous, after the state commit, in order, exactly once"; a throwing `onEvent` goes to `onError`; a `dispatch` inside it throws `REENTRANT`. Chosen: **per event**. In mode `throw` the listener throws on every event, each throw is caught individually and delivery continues with the next event (`L21`: 6 events, 6 `onError` calls, `dispatch` still returns the events, state committed). In mode `dispatch-inside` the listener tries one `dispatch` per event and records the error code (`L20`: three `REENTRANT`). In mode `record` the kit records the events (`L21b`). Second reading: a throw aborts delivery of the remaining events of that `reduce`.

## A-23 `L14` and `L22` depend on the subject (Medium)

`L14` ("declared-unsupported export → `NOT_SUPPORTED`") needs a format the subject declared unsupported; `L22` ("model over capacity → `NODE_LIMIT`") needs a model larger than the subject's `capacity.maxNodes`. Neither can be fixed by an oracle. Encoded as a placeholder the kit must substitute: `export` argument `"@first-undeclared-export-format"` with `applies_if`; `loadScene` argument `{"over_capacity":"nodes"|"edges"}`. 13.3 says no large scene is needed for limit rows; the kit generates it.

## A-24 `compareProjections` input and the path rule (Medium)

11 gives `compareProjections(model, reports)` with `reports` of type `RenderReport[]` that carry no renderer name; the result needs names, and 13.3a's file has `{"renderer","report"}` entries. Chosen: entries are `[(name, report)]`. Path rule (13.3a): implemented as: equal values → nothing; all objects → recurse on the union of keys (a key missing in one report is a value `absent`); all arrays of one length → recurse by index; otherwise the path is "the deepest differing value" and the majority value is the reference (tie: first-listed), `renderers` = sorted names that differ. Not specified: three renderers whose arrays differ in length for some and in content for others (no vector), and whether a differing sub-object of different key sets reports the object or each key (chosen: each key, so `state.focus` for an added focus, `drawn.nodes` for a hidden node). Second reading: the object path.

## A-25 `C06` and the `INVALID_REPORT` index (Medium)

* `C06` ("different `scene_sha256` → `{comparable:false}`"): both the report's and its `state`'s `scene_sha256` were changed so the report stays self-consistent; the row header still names one model. If a kit first checks each report against the model, `INVALID_REPORT/SCENE_MISMATCH` would be thrown instead of a result; 11 says the result is `{comparable:false}`.
* 12: "`INVALID_REPORT` C-group and `K`-mutants". None of `C01`-`C08` can produce an error (they are results), and no row exists for `INVALID_REPORT/INCONSISTENT`, `NON_CANONICAL`, `UNRESOLVED_ELEMENT`; the index mentions rows that the vector list does not contain. Finding for the design author: add `C` rows for the five `INVALID_REPORT` reasons, or drop "C-group" from the index.
* `C04` ("different `drawn`") cannot change `drawn` alone (the report would be `INCONSISTENT`); the row differs in the hidden set, so five paths differ (`accessible.items`, `accessible.status`, `drawn.edges`, `drawn.nodes`, `state.hidden.nodes`). `C03` differs in four paths (`state.focus`, `marked.focus`, `accessible.items[0].focused`, `accessible.status`). `fidelity` is excluded from the projection (`C02`, `C07`).

## A-26 Hit files (Low)

`"state":"initial"` + `size` = `initialState(model, size)`. Point coordinates are written as shortest-repr decimals of the intended doubles (`212.00048828125` = 212 + 2^−11). `H24` is "inline" in 13.3 but has a row in 13.3a's table: produced as a file, a 20-px lattice over `[0,900]×[0,600]` on `mixed20`+`F04` plus, per edge, points at offsets 0, ±5.999, ±6.001 and 6 px from two positions along it and, per node, points at 11.999, 12 and 12.001 px (of the 1,907 points, 533 have a hit, 480 of them an edge). Exact results are brute force; "pruned equals brute force" (acceleration) is still the kit's own test.

## A-27 `R` scripts (Low)

13.3a: `expected` = "the state file of the last successful step". `R32`, `R33` need a state close to ±(2^53−1) to overflow (a pan or anchor shift of at most 2^31·10^6/10 ≈ 2·10^14 cannot overflow from any ordinary state): the author supplies `states/R32.init.state.json` (centre 9007199254740000, −9007199254740000, zoom 10) as the script's `initial`; `R33` reuses it. Steps with an `error` have no `expected_state`; `size` of `R38` is `1×1`.

## A-28 `M` rows (Low)

`M25`: scene/layout columns carry `O1`+`F01` (the model the kit turns into a plain object); `M27`: expected cell points at `models/M01.model.json` (13.3a: "expects M01's file"); `M18`: `N` = sum of UTF-16 lengths of the labels and categories of nodes and the labels of edges (mixed20: computed, in the `input` cell); `M20` `len` = byte length of the scene file; `M22` `len` = layout file length. Limit rows with an error use no expected file.

## A-29 Error prefixes (Low)

13.3a: "`IGS:CODE/REASON` and `LAYOUT:CODE/REASON` for errors propagated … as in `oracles-igl`". `oracles-igl` writes layout errors with **no** prefix (`SCENE_MISMATCH/`, `INCOMPLETE_LAYOUT/MISSING_NODE`) and only `IGS:` prefixed. Chosen the literal `LAYOUT:` prefix in `M11` and `M12`. Second reading: no prefix, two cells change.

## A-30 Lifecycle script schema extensions (High)

13.3a's call object has only `op arg await expect`, which cannot carry what `L07 L08 L16 L21 L23` must check (state after a failed load, scene bytes of `export`, recorded events). Added, all optional: per call `expect_state` (path of the canonical state after `dispatch`/`getState`/`probe`), `expect_events` (path, `serializeEvents` of what `dispatch` returned), `expect_hit` (`hitTest` result or null), `expect_bytes` + `expect_media_type` (`export("scene")`), `expect_motion` (`probe`: `"none"` when reduced motion is on), `applies_if`; per script `expect_recorded_events` (path, all events seen by the listener in order), `expect_listener_errors` (`dispatch-inside`), `expect_on_error_count` (`throw`), `expect_settle_order` (`L18`). `loadScene` `arg` forms: `{"model":{scene,layout}}`, `{"initial":path}`, `{"plain_object_model":true}`, `{"over_capacity":…}`. `env.host` is `"headless"` in all scripts (the kit substitutes the subject's). Second reading: a smaller schema, then `L07 L08 L16 L20 L21 L23` verify less.

## A-31 `H19` needs several states (Low)

"constant 12 px at zoom min, default, max" requires three viewports; a hits file has one `state`. Added an optional per-point `"state": path` (the file-level `state` is the min-zoom one). Second reading: three rows.

## A-32 `A16` (`reducedMotion` → `motion: "none"`) has no a11y bytes (Low)

The rule is about `fidelity.motion`, which is excluded from the projection and absent from the a11y file. The row is produced as an ordinary script (select, pan) with an extra key `"reducedMotion": true`; its expected bytes do not depend on it. The obligation is checked by the kit through `probe()`/`expect_motion`.

## A-33 `C07` ("different manifests, equal projections") (Low)

Report entries have no manifest field in 13.3a. Added an optional `"manifest"` per entry (the base `dom` manifest and `P01`); expected `agree: true`. 

## A-34 Other additions (Low)

`states/R32.init.state.json` (A-27); `a11y/A18.a11y.json` (written although `A18`'s expected cell is its events file); `L21b`, `L24b`, `L24c` (A-04).

## A-35 Appendix A.6 wording (Low)

"A third `focus-step {delta: 1}` moves to `s:ann`, a fourth to the edge, and a fifth leaves the state unchanged": counted as intents (select = 1, focus-steps = 2, 3, 4, 5), not as focus-steps; the bytes are right (reproduced).

## A-36 Verification of the author's own inputs (process)

13.4 forbids the oracle author from running the frozen verifiers. The seven scene/layout pairs written by the author (`hitgeo`, `hostile`, `M28`, `A05`, `ten`, `nfc`, `twins`) and the two further layouts (`M26`, `M29`) and every file of `states/` have only been checked by the author's Python "lite" verifier (canonical re-serialization, node/edge uniqueness, endpoints, labels, ordinals; layout canonical form, scene binding, node coverage). A third party must run `verifyScene`/`verifyLayout`/`bindLayout`/`parseState` over them. Points that deserve a look there: type/relation identifiers containing `<`, `>`, `&`, U+202E; node ids containing NUL, DEL, U+2028, U+2029 and astral text; `i:1` and `s:1` in one type (`twins`); NFC/NFD twins as ids and as types (`nfc`); a scene with `x-` keys on nodes and edges (`M28`: `{"a":[1,2,{"b":true}]}` is in the IGS-CJ/1 domain).

---

## Anything unimplementable?

* Nothing is unimplementable in the rules. **`M23` as written is impossible** (A-01) and three rows cannot carry the two inputs they name (A-02).
* Not representable in the specified formats without extensions: the L group (A-30), `H19` (A-31), `A16` (A-32), `C07` (A-33). These are the gaps the design itself lists under "Outsider read of rev 2" (1)-(5); this corpus is one concrete proposal for them.
* Inconsistent index: 12 lists `INVALID_REPORT` rows in the `C` group that do not exist (A-25); 13.3 counts `K` rows as file-backed (A-03).
* One dead branch in the hit geometry (A-08), harmless.
