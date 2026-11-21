# Ambiguities, contradictions and unimplementable rules (oracle author's log)

**Status after design 32 rev 3.** Entries A-01 to A-70 were written against rev 2. Each now ends with a `RESOLVED-IN-REV3` line (FIXED or STANDS, the rev 3 section, and whether the reading used by this generator matched; 68 matched, A-24 and A-25 differed). The two `DEFECT` entries (A-08, A-35) are stated rules in rev 3. New entries A-71 onward are places where rev 3 is still ambiguous. The text of each entry below is the rev 2 text, kept as written.

Design 32 rev 2 was read from the document alone (plus designs 27, 30, 31 and the frozen IGS/1, IGL/1 specs). Every entry names the
section, the literal reading that the generator implements, and why. **DEFECT** marks a place where the design text is wrong,
self-contradictory or leaves a normative byte undefined (flagged, not fixed). **UNIMPLEMENTABLE** marks a rule the oracle cannot
check. Numbering is A-01 upward; entries are grouped by family.

## Input grammar, machine and navigation (rows E, I, V, L, B)

**A-01 (15.5 E, 15.8) E01 has no definition.** The count of 59 includes `E01`, but the row text says only "the valid pointerdown E01".
Read: an accepted `pointerdown` (`t` 5, `id` 1, mouse, button 0, x 100000, y 200000, mods 0), expected empty, error empty.

*RESOLVED-IN-REV3 (FIXED).* `E01` defined: `pointerdown` t 5, id 1, mouse, button 0, x 100000, y 200000, mods 0, accepted; base of `E02`-`E23` (15.5). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-02 (4.2 step 4) `button` and `unit` have no numeric domain.** Only an enumeration {0,1,2}. Read: after the number checks
(`SCHEMA`, `NOT_FINITE`, `NOT_INTEGER`) any integer outside {0,1,2} is `INVALID_VALUE`, never `OUT_OF_RANGE` (so `button` -1 and 3 agree). Rows `E13`, `E18`, `E35`, `E36`.

*RESOLVED-IN-REV3 (FIXED).* `button`/`unit` integer outside {0,1,2} is `INVALID_VALUE`, never `OUT_OF_RANGE` (15.5 E). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-03 (4.2, 15.3) NaN tokens.** The tokens `"NaN"`, `"Infinity"`, `"-Infinity"` are decoded only at number fields of an event or
rectangle (`t id x y dy mods button unit`), never at `key`, `ptype` or `target` content. Row `E08` (the string `"5"`) stays `SCHEMA`.

*RESOLVED-IN-REV3 (FIXED).* NaN tokens decoded only at the number fields (15.5 E). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-04 (4.2 step 4, 15.5 E22) A non-object event.** `[]` is `SCHEMA`; an array is not a plain object.

*RESOLVED-IN-REV3 (STANDS).* already stated: an event is a plain object (4.2 step 1); `[]` is `SCHEMA` (`E22`). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-05 (5, 5.1) Error class of `config.bindings`.** "`bindings` through `verifyBindings`" does not say whether its `INVALID_BINDINGS` is
re-wrapped as `INVALID_CONFIG`. Read: it propagates unchanged. No row covers it (E40-E44 use the other keys).

*RESOLVED-IN-REV3 (FIXED).* `config.bindings` errors propagate as `INVALID_BINDINGS`, not re-wrapped (5). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-06 (5.1) `parseMachine` range checks.** The design lists invariants (pointer count per gesture, `rem_*` in [-500, 499], `wheel_acc`,
`long` only for touch, `anchor` iff marquee) but no numeric domain for pointer `x`, `y`, `t0` or for `last_t` (>= -1 assumed from
`createMachine`). Read: `last_t` in [-1, 2^52]; pointer coordinates not range-checked. Rows `E61`-`E63` break only a stated invariant.

*RESOLVED-IN-REV3 (FIXED).* `parseMachine` numeric domains stated: `last_t` in [-1, 2^52], pointer fields not re-checked (5.1). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-07 (15.5 E61-E63) Machine bytes.** `E61` is `gesture idle` with two pointers, `E62` the bytes of `createMachine()` plus LF, `E63`
`gesture pan` with a `pinch` key. All three are `INVALID_MACHINE/SCHEMA` (the only reason the table has).

*RESOLVED-IN-REV3 (FIXED).* contents of `E61`-`E63` stated (15.5). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-08 (5.2) A stale or hidden target at `pointerdown` then clears the selection. DEFECT (surprising rule).** "A target that names
nothing, or an element that is not effectively visible, is treated as absent": at `pointerdown` the pointer keeps no target, so its
release is a click on empty space and emits `clear-selection` (when no shift/ctrl/meta), while a target that becomes hidden between
press and release emits nothing (row `I27`). The two stale cases behave differently; the first loses the user's selection to a race.
Implemented literally.

*RESOLVED-IN-REV3 (FIXED).* the two stale-target cases are stated as deliberately different (absent at press: click on empty space; vanished by release: no output), with the rationale; no new row (id `I58` reserved) (5.2). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-09 (5.3) Pinch from a long-pressed pointer.** A second pointer sets both pointers `moved`; the design does not say whether `long`
is cleared. Kept (the pointer stays `long`, still touch, invariant of 5.1 holds). No row.

*RESOLVED-IN-REV3 (FIXED).* a long-pressed pointer keeps `long` in a pinch (5.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-10 (5.3, I55) A touch pointer with the alt bit.** The marquee test is `mods0 & 4` for any `ptype`; row `I55` therefore feeds `mods` 4 to a
touch pointer (the design says "alt-drag with a touch pointer").

*RESOLVED-IN-REV3 (FIXED).* alt marquee applies to any `ptype`; `I55` gives a touch pointer `mods` 4 (5.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-11 (5.3 pointercancel) `x`, `y` of a cancel.** The event has none, so the pointer keeps its last point. A cancelled lasso emits only
`lasso-end`. Mutant `K25` (cancel acts as release) therefore reads `mods` from the press when the cancel carries none.

*RESOLVED-IN-REV3 (FIXED).* `pointercancel` carries no coordinates (5.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-12 (5.2) `wake_at` for a touch pointer that is a second pointer.** `wake_at` is computed from the final machine only (a touch pointer
in `press`, not moved, not long); a pinch has none. Row `I14` shows `wake_at 500` at the first touch press and none afterwards.

*RESOLVED-IN-REV3 (FIXED).* `wake_at` is computed from the machine after the step (5.2). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-13 (5.4) `tick` with a long-pressed pointer that has a stale target.** The target is looked up (still drawn?) at the tick, in the
state of the tick. Row `I18` uses `g0`.

*RESOLVED-IN-REV3 (FIXED).* `tick` and `contextmenu` look the target up in the state of the event (5.2). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-14 (5.6) No focus and `extend`.** `shift+Arrow` with no focus gives the no-focus rule (`focus-first` / `focus-last`) and **no**
`select add` (the text only says a winner gives `select`). Not covered by a row.

*RESOLVED-IN-REV3 (FIXED).* no focus + shift+arrow gives only `focus-first`/`focus-last`, no `select add` (5.6). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-15 (5.6) Reveal after `select add`.** For `[focus, select add, pan]` the pan is last ("after all other outputs of the action").
No row (the extend rows `V06` stay inside the margin box).

*RESOLVED-IN-REV3 (STANDS).* already stated (reveal pan is after all other outputs, 5.6); no row. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-16 (5.6, 7.5) Reveal target of `focus-step`.** The target is `traversal[idx + delta]`; at a boundary there is none, so no pan. With
`wrap`, the wrapped `focus-first`/`focus-last` target is the first/last element. Rows `V16`, `V33`.

*RESOLVED-IN-REV3 (STANDS).* already stated (5.6, 7.5): no pan at a boundary, wrapped targets are first/last. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-17 (6.2, 6.4) `verifyBindings` field errors inside `action`.** "own fields of the right type ... else `INVALID_VALUE`": a missing or extra
field of an action is also read as `INVALID_VALUE` (not `SCHEMA`). No row.

*RESOLVED-IN-REV3 (FIXED).* every missing, extra or wrongly typed action field is `INVALID_VALUE` (6.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-18 (6.4) Row order of the checks.** Per row, in order: mode, mods, key token, action type, action fields, `Tab`, duplicate; the
`NO_ESCAPE_EXIT` pass is last. Rows `B03`-`B13` are single-fault, so the order is not observable.

*RESOLVED-IN-REV3 (FIXED).* per-row check order stated (6.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-19 (6.2) Shift bit for punctuation in `match`.** The shift bit is cleared on both sides for a digit or punctuation token
(`+ - = [ ] , . / ;` and `0`-`9`). Row `I40` (`+` and `-` with shift, `=` without).

*RESOLVED-IN-REV3 (STANDS).* already stated (6.2); `I40`. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-20 (7.2) `nav-spatial` from an edge: candidates.** All drawn nodes (the focused edge is not a node, so none is excluded), including the
edge's own endpoints. Row `V09` relies on this (endpoint `a` is the winner).

*RESOLVED-IN-REV3 (FIXED).* spatial candidates are all drawn nodes including a focused edge endpoints (7.2). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-21 (7.2, V07) The tie `(p^2 + s^2, s)`.** The design text says `s:p` and `s:v` tie on `(10^11, 300000)`; computed: p (100000, 300000) and v
(100000, -300000) have the same `p`, `s`, and are in tier 2 (`s` > `p`). Lowest index `s:p` wins as stated. Agrees.

*RESOLVED-IN-REV3 (STANDS).* the oracle agrees with the text. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-22 (7.5) A reveal pan with both components zero.** Cannot occur outside the box; the generator still returns "no pan" in that case.

*RESOLVED-IN-REV3 (STANDS).* no behaviour to specify. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

## Companion, plan, executor (rows C, P, Q)

**A-23 (15.3 C) `events` need `focus` ObjectRefs with an `artifact_sha256`.** The rows carry full `SemanticEvent`s; for corpus-authored
scenes the hash is 64 `0`. The text of `focus-changed` is taken from the address in **the event** (27 §10.2 says `announcementFor(event, model,
state)` but not whether `t` comes from the event or from `state.focus`); in every row the two coincide.

*RESOLVED-IN-REV3 (FIXED).* sources of announcement texts stated: `focus-changed` from the event `focus.address`, counts from the state argument (9.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-24 (9.4) `liveText` of `focus-changed` without `focus`.** "Focus cleared."; an event whose address names nothing gives no text.

*RESOLVED-IN-REV3 (FIXED).* differs from the oracle reading: a `focus-changed` event naming no element is an `IgrError` (`INVALID_INPUT/INVALID_VALUE`) that `liveText` propagates, as the committed `announcementFor` does (9.4); no row, so no file changes; the oracle tool follows the text. Reading matched: no, my rev 2 reading differed; the tools now follow the rev 3 text.

**A-25 (9.3) Window option errors.** The design says only "else INVALID_CONFIG". Read: wrong shape `SCHEMA`, wrong domain
(`first` < 1, `count` outside 0..5000, non-integers) `OUT_OF_RANGE`. No row.

*RESOLVED-IN-REV3 (FIXED).* window option errors stated: wrong shape `SCHEMA`, non-integer `NOT_INTEGER`, out of domain `OUT_OF_RANGE`; no row (9.3). Reading matched: no, my rev 2 reading differed; the tools now follow the rev 3 text.

**A-26 (9.2) Tab stop when the focus is outside an explicit window.** Item present, `tabindex` 0 (row `C08`).

*RESOLVED-IN-REV3 (STANDS).* already stated (9.3 items present); `C08`. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-27 (15.3 P, P03) Empty plan file.** `plans/P03.plan.txt` is a zero-byte file named in `expected`, not an empty cell (an empty cell means
"no expected file", which is used for the error rows `P10`).

*RESOLVED-IN-REV3 (FIXED).* an empty plan is a zero-byte file named in `expected`; an empty `expected` cell means no file (15.3, 15.5 `P03`). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-28 (15.5 P05) A changed scene hash needs a second scene.** A row has one scene and one layout, but `P05` needs two trees with
different `scene_sha256`. The `next` tree is the `O1` initial tree with `scene_sha256` replaced by 64 `1` (a hand-perturbed tree, an
input like the perturbed trees of the G rows). `Q03` (63 lines) fixes the item count of that tree.

*RESOLVED-IN-REV3 (FIXED).* `P05` `next` is the `O1` initial tree with `scene_sha256` 64 `1`, an authored file under `trees/`; P rows take tree files (15.3, 15.5). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-29 (15.3 P11) Format of the invariant file.** "IGR-CJ/1 `{"equal": true}` per listed pair": written as a canonical array
`[{"equal":true,"pair":"P02"}, ...]` for `P02`, `P04`, `P07`, `P08`; the row input lists the pairs as `{"next","pair","prev"}` objects.

*RESOLVED-IN-REV3 (FIXED).* `P11` file format and row input stated (15.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-30 (15.3 Q, Q04) A plan file for "a full build of g0".** `Q04` executes `plans/Q04.pre.plan.txt` (the full build of the `P07.prev`
tree) and then `plans/P07.plan.txt`. The first plan is an authored input under `plans/`.

*RESOLVED-IN-REV3 (FIXED).* `Q04` uses an authored `plans/Q04.pre.plan.txt`, the full build of the `P07` previous tree (15.3, 15.5). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-31 (9.6) Executor log key of the `id` assignment.** `["setAttribute", KEY, "id", KEY]`: the key is "the new value for the `id`
assignment itself". `["textContent", ...]` and removals use the element's last `id`; the host is `"@host"`.

*RESOLVED-IN-REV3 (STANDS).* already stated (9.6). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-32 (9.5 step 3) Removal order.** `["r", id]` then `["r", id + "-d"]` per removed edge item, in previous order. Reproduces the quoted
`P07` (32 lines) and `Q04`.

*RESOLVED-IN-REV3 (STANDS).* already stated (9.5 update step 3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-33 (9.5) `INVALID_TREE/INCONSISTENT` assertion.** Implemented as "the relative order of the retained items is the same in both trees";
the design says only that the planner asserts it. No row can trigger it (every generated pair keeps the order). UNIMPLEMENTABLE as a row.

*RESOLVED-IN-REV3 (FIXED).* the planner assertion has no row; listed as TypeScript-only (15.7). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-34 (9.5) `mode` and `list.window` produce no operation.** Confirmed by `C18` versus `C01` (trees differ, no plan row exists for a mode-only change).
Not covered by a P row.

*RESOLVED-IN-REV3 (STANDS).* already stated (9.5: mode and window produce no operation); no P row; listed (15.7). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

## Gate (rows G)

**A-35 (15.3 G, 10) `mode` is not in the G input grammar. DEFECT.** `G44` needs the gate input `mode`; the row grammar of 15.3 does not list it.
Added as an optional `"mode"` key of the inline input.

*RESOLVED-IN-REV3 (FIXED).* `mode` added to the G input grammar (15.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-36 (10 G8) Verdict of `G8-TARGET` with no drawn edge.** "One finding iff some edge is drawn; always `info`". Read: verdict `info` with an
empty findings list when there is no edge. The report of `EMPTY` is not a row, so this is unchecked.

*RESOLVED-IN-REV3 (FIXED).* `G8` with no drawn edge: verdict `info`, empty findings (10). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-37 (10 G7) `MODE_INVALID` and `MODE_MISMATCH`.** Read as exclusive: an invalid tree mode reports `MODE_INVALID` only. No row.

*RESOLVED-IN-REV3 (FIXED).* `MODE_INVALID` excludes `MODE_MISMATCH` for the same tree (10). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-38 (10 G3) Several modes without an Escape row.** One `NO_ESCAPE_EXIT` finding per offending mode, in first-occurrence order. `G15` has one.

*RESOLVED-IN-REV3 (FIXED).* one `NO_ESCAPE_EXIT` per offending mode, first-occurrence order (10). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-39 (10 findings order, G9) Whole-check versus item findings for `svg-native`.** `SVG_TITLE`, `SVG_DESC`, `SVG_TABSTOP` (no position) first, then
`SVG_NAME` / `SVG_ORDER` in item order. Rows are single-fault, so unobservable.

*RESOLVED-IN-REV3 (FIXED).* `svg-native` finding order: `SVG_TITLE`, `SVG_DESC`, `SVG_TABSTOP`, then names and order (10). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-40 (10 G1 / G3 in `svg-native`) Which findings run.** Only the binding-table findings (`NO_STEP_*`, `TAB_BOUND`, `NO_ESCAPE_EXIT`); the tree is not read.
Reports show `pass` for G1/G3 in `G32`, `G26`, `G38`, `G39`.

*RESOLVED-IN-REV3 (STANDS).* already stated (10 compositions). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-41 (15.5 G30, G42, G43) Which tree.** The gate rows keep the `G02` tree and change only the state (a viewport does not enter a tree). One input differs from
the base, as the single-fault rule requires.

*RESOLVED-IN-REV3 (STANDS).* already stated (15.5: one input differs from the base). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-42 (10 G6) `SUMMARY_MISSING`.** "Non-empty" is read as the empty string (not "whitespace only"); `G2`'s `NAME_EMPTY` uses the JavaScript whitespace set.

*RESOLVED-IN-REV3 (FIXED).* `SUMMARY_MISSING` is the empty string only (10). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-43 (10 G1) `ITEM_MISSING` positions.** The needed set is the tree's own window (clipped to `1..n`) plus the focused position plus the stop position, each
reported once, ascending.

*RESOLVED-IN-REV3 (STANDS).* already stated (10 G1). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

## Export, manifests, headless (rows X, M, H)

**A-44 (15.3 X) Shape of the `verify` files map.** `{"files": {name: path}, "manifest": path, "op": "verify"}`; the bundle files are the corpus files named
in the map (`scenes/O1.scene.json`, `layouts/O1.layout.json`, `states/O1.initial.state.json`, `data/O1.decl.svg`, `png/X04.png`, and the faulted variants).

*RESOLVED-IN-REV3 (FIXED).* shape of the `verify` file map and the corpus file names stated (15.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-45 (15.3 X) `media_type` mismatch in a manifest.** 11.3 requires "the `media_type` of 11.1 for that name"; the reason for a wrong value is not stated. Read: `SCHEMA`. No row.

*RESOLVED-IN-REV3 (FIXED).* a wrong `media_type` is `SCHEMA`; no row (11.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-46 (11.3, 11.4) `svg_format` present iff an `svg` is listed.** A violation in either direction is `SCHEMA` in the strict reader. No row (`X26` changes the value only).

*RESOLVED-IN-REV3 (FIXED).* `svg_format` iff `svg` is `SCHEMA` either way; no row (11.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-47 (11.4 (1)) Order inside `parseExportManifest`.** JSON syntax, closed key set and value types, artifact `name` (`UNKNOWN_ARTIFACT`), sort order (`SCHEMA`), required
artifacts, then canonical bytes (`NON_CANONICAL`). `X12` is a sorted manifest with an extra `thumb`; `X13` has an unsorted but otherwise valid list.

*RESOLVED-IN-REV3 (FIXED).* order of checks inside `parseExportManifest` stated (11.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-48 (11.2) Embedded PNG versus size check order.** The design says "embedded with `embedPngBinding` ... and, if `expectedPngSize` is given, its IHDR must match":
read as embed first, size second. `X17` is a valid fixture, so the order is unobservable.

*RESOLVED-IN-REV3 (FIXED).* embed first, size second (11.2). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-49 (15.5 X24, 15.3) Oversize manifest.** 1,048,577 bytes (each 0x41) are not stored; `generated/GENERATED.tsv` records length and SHA-256 and `generated/README.txt`
the recipe. The row's `input` names `generated/X24.manifest.bin`, which a harness regenerates. `X25` (200,000 bytes) is stored.

*RESOLVED-IN-REV3 (FIXED).* oversize inputs are generated and recorded (15.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-50 (15.3 M) The bases.** Authored: renderer name `ia-oracle-base`, version `0.0.0`, capacity 20,000 / 40,000 / 1,048,576, `labels` degraded `LABELS_ELIDED` on the DOM base;
the headless base has `HOST_LACKS` on all three visual capabilities (`labels` included, which replaces the degradation). All other optional capabilities
`unsupported/NOT_IMPLEMENTED`, `scene.apply-delta` `unsupported/RESERVED`. Both pass the oracle's `verifyManifest`.

*RESOLVED-IN-REV3 (FIXED).* base-manifest authoring details stated (15.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-51 (13.1) Flag validation order.** Base verified first; then each flag (unknown name or non-boolean `SCHEMA`); then the headless/companion rule (`INVALID_VALUE`). `M04` is
`SCHEMA` even though the headless rule would not apply.

*RESOLVED-IN-REV3 (FIXED).* flag validation order stated (13.1). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-52 (12, 15.5 H05) Error code of an unresolved intent target.** `INVALID_INTENT/UNRESOLVED_ELEMENT` (27 §5.2); 14.2 of design 32 has no `INVALID_INTENT` row but H05 asks for it.
The oracle implements only the intent-validation steps of 27 §5.2 that `H05` reaches; the full reducer is not part of the corpus (property I1 is TypeScript-side).

*RESOLVED-IN-REV3 (FIXED).* committed-package error codes (including `INVALID_INTENT`) propagate and are not in the V11 table (14.2). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-53 (12) `H04` and the empty `events` list.** `tree` with no intents has live text `""`, equal to the Appendix A.1 bytes (checked by `APPENDIX-A.tsv`).

*RESOLVED-IN-REV3 (STANDS).* the oracle reading equals the text (A.1). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

## Authored scenes, layouts and states

**A-54 (15.4) Layouts of `H1`, `H2`, `EMPTY`.** No positions are given; `H1`/`H2` use `(0, 0)`. `EMPTY` has an empty node list. Layout `scene_sha256` is the hash of the scene bytes.

*RESOLVED-IN-REV3 (FIXED).* layouts of `H1`, `H2`, `EMPTY`, scene-hash rule (15.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-55 (15.4) `W520`, `T4`, `T5`, `S1`-`S3`, `HOST`, `PROTO` positions.** "In thousandths as listed": taken literally (not layout units). `G9` positions `(100000*(i mod 3), 100000*(i div 3))`.

*RESOLVED-IN-REV3 (STANDS).* already stated: thousandths, taken literally (15.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-56 (15.4) `HOST` order.** The six ids sort in UTF-8 order as listed (empty, `"q"`, `<b>x</b>`, `a&b`, `a` U+2028 `b`, U+202E `abc`); the generator sorts by IGS/1 5.5 and the layout
positions follow the sorted index.

*RESOLVED-IN-REV3 (FIXED).* `HOST` ids sorted by IGS/1 section 5.5, layout follows the sorted index (15.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-57 (15.4) State files.** Every state is generated from `initialState` plus the stated focus / selection / hidden / viewport; the oracle's light validator checks hashes only. The third-party
`parseState` run (15.1) is still required (selection of a hidden element is never authored).

*RESOLVED-IN-REV3 (STANDS).* the third-party `parseState` run remains required (15.1). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-58 (15.4) `vpz` viewports with another size.** `V40` is the one row with a non-900x600 viewport: `{center 0 0, 40x40, zoom 10}`, script `size` 40x40.

*RESOLVED-IN-REV3 (FIXED).* `V40` is the one non-900x600 row (15.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-59 (3.1, 15.3) Canonical files and LF.** Files in IGR-CJ/1 have no trailing newline; plan, log, TSV and script files end with LF; script files are pretty-printed ordinary JSON
(the one non-canonical class that is not a byte string under test).

*RESOLVED-IN-REV3 (FIXED).* LF rules for scripts, TSV, plans, logs versus IGR-CJ/1 files (15.3). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

## Unimplementable or unchecked by this oracle (stated, not hidden)

**A-60 UNIMPLEMENTABLE (5.8, 9.6, 17) The binder, `mountCompanion`, focus restoration, `COMPANION_CSS` effect.** DOM and browser behaviour; no row, no Python model.

*RESOLVED-IN-REV3 (FIXED).* binder, `mountCompanion`, restoration, CSS: TypeScript-tranche only, table in 15.7, no row claims bytes. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-61 UNIMPLEMENTABLE (9.2) `verifyCompanionTree`, `maxTreeBytes`, executor guards.** The oracle implements the guards inside its simulated DOM (unknown key, duplicate `c`, `@host`, attribute
allowlist) but the design makes them unit tests, so no row asserts them.

*RESOLVED-IN-REV3 (FIXED).* `verifyCompanionTree`, `maxTreeBytes`, executor guards: TypeScript-tranche only, table in 15.7. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-62 UNIMPLEMENTABLE (5.7) Properties I1-I5 and tier D.** Need the real `reduce` and caller seeds; `D01`-`D06` stay empty by design.

*RESOLVED-IN-REV3 (FIXED).* I1-I5, I-C1, tier D: TypeScript-tranche only; `D01`-`D06` empty by design (15.7). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-63 (15.6) `K84` (TypeScript only).** Recorded `not-applicable`; `C16` and `I51` exist and are generated.

*RESOLVED-IN-REV3 (STANDS).* `K84` is `not-applicable` in the oracle; `C16`, `I51` carry bytes (15.7). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-64 (7.5, 15.7) The `2^31` omission of the reveal.** Implemented (a result beyond 2^31 gives no pan) but, as the design says, not covered by a row.

*RESOLVED-IN-REV3 (STANDS).* stated in rev 2 (15.7): the `2^31` omission has no row. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

## Smaller notes and cross-document observations

**A-65 (15.8) Counts.** The 410 ids and the 276 / 134 split are reproduced exactly (E 59, I 48, V 40, L 8, B 13, C 20, P 11, Q 4, G 36, X 25, M 5, H 7, D 6, K 128).

*RESOLVED-IN-REV3 (STANDS).* counts reproduced (15.8). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-66 (Appendix A) Figures without blocks.** All quoted figures (A.2, `P01`, `P04`, `P07`-`P09`, `Q01`-`Q04`, A.8 CRC, A.9 sizes and hashes, A.10 hashes, A.13 sizes) are parsed from the
design file by `tools/appendix_a.py` and compared; see `APPENDIX-A.tsv`.

*RESOLVED-IN-REV3 (STANDS).* figures reproduced (Appendix A). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-67 (27 section 10.2, design 32 9.4) `announcementFor` for `selection-changed`.** `{s} selected.` counts the selected elements of the **state argument**, not the
event's list. Equal in every row (the event is built from the same state).

*RESOLVED-IN-REV3 (FIXED).* see A-23: `selection-changed` counts the state argument (9.4). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-68 (15.6 table) Mutants with loose wording.** Read through 15.6a. `K18` is realised as pan-after-zoom order in the pinch output, `K19` as `pinch.d := d1` after
every move, `K07` for the click-with-target path (a target-less click already reads the press `mods` in the baseline), `K126` for the lasso, the select-all and the marquee commit.
All 127 verifiable mutants are killed by at least one named row (see `MUTANTS.tsv`); none needed a redefinition.

*RESOLVED-IN-REV3 (FIXED).* the loose mutant readings (`K07`, `K18`, `K19`, `K126`) adopted in 15.6a. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-69 (11.5) PNG fixture.** The 68-byte fixture is built by the generator (`IHDR`, one zlib `IDAT` of five zero bytes at level 9, `IEND`) and equals the A.8 block byte for byte.

*RESOLVED-IN-REV3 (STANDS).* the fixture equals the A.8 block. Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

**A-70 (15.2) Self-contained corpus.** `scenes/O1.scene.json` and `layouts/O1.layout.json` are copied from the frozen `fixtures/oracles` and `fixtures/oracles-igl` files (their digests
are asserted at generation time); the third-party `verifyScene`, `verifyLayout`, `bindLayout` and `parseState` run over `scenes/`, `layouts/`, `states/` is still outstanding.


*RESOLVED-IN-REV3 (STANDS).* self-contained corpus confirmed (15.2). Reading matched: yes (the rev 3 text adopts or confirms the reading used here).

## New entries against rev 3

**A-71 (9.3, 14.2) Non-finite window values.** Rev 3 says a non-integer window value is `NOT_INTEGER` and lists no `NOT_FINITE` for `INVALID_CONFIG`. Read: `NaN` and `+-Infinity` are non-integers, hence `NOT_INTEGER` (the event grammar of 4.2 would say `NOT_FINITE`). Reachable only through the API, never through a JSON row; no row.

**A-72 (9.4) Order of `omitFocusAnnouncement` and the A-24 error.** With `omitFocusAnnouncement` true the `focus-changed` events are dropped before their texts are built, so a `focus-changed` event naming no element raises only when it is not omitted. The text does not say which comes first. Read: omission first (the dropped event is never announced). No row.

**A-73 (9.4, 7.4) Malformed nav events in `liveText`.** Rev 3 makes an unresolvable `focus-changed` an `IgrError` but says nothing about a nav event with an unknown `reason`, a missing `count` or an unknown `type`. Read: out of scope (the oracle treats an unknown type like an event with no text and does not validate nav events). No row.

**A-74 (15.3) The recipe file of a generated vector.** Rev 3 asks for "a recipe file the generation"; the file name is not fixed. Read: `generated/README.txt` next to `generated/GENERATED.tsv`. Unchanged bytes.


## Gap round (R-G, 2026-11-19): rows B14-B110, X27-X177, K129-K200 against rev 3

This round closes three recorded gaps (the binding-domain rows of review 32 code audit A1 M-4, the invalid-JSON manifest rows of audit B M-11 and the PNG reader rows of audit B M-6) by **adding rows only**: no earlier file or row changed. Where the rev 3 text states nothing, a row was **not** written (A-76 to A-79, A-81 to A-84); where it states the order or the rule but not a reason code, the reading is recorded and the rows that carry it are named (A-75, A-80). Every ID below is a new id.

**A-75 (11.4 (1), 14.2) Reason of a manifest that is not valid JSON.** 11.4 lists "JSON syntax" first among the checks of `parseExportManifest` but gives that check no reason, and gives `SCHEMA` only to the closed key set and the value types; 14.2 lists `SCHEMA` and `NON_CANONICAL` for `INVALID_EXPORT`. Read: `INVALID_EXPORT/SCHEMA` (a manifest that is not a JSON document is not the closed grammar of 11.3; `NON_CANONICAL` is the check that comes **last**, over a document that parsed; the review ledger and the implementer's notes use the same reading). Rows carrying this reading: `X31` to `X44` (fourteen syntax faults: truncation, empty input, trailing byte, trailing comma, single quotes, leading zero, `NaN`, unquoted key, comment, cut at 100 bytes, two documents, raw LF in a string, invalid escape, plus sign). If rev 4 chooses another reason these fourteen rows change; the other manifest rows do not depend on it. Valid JSON that is not an object (`X45` to `X48`: `[]`, `null`, `5`, a string) is a wrong type and `SCHEMA` by 11.3 without this reading.

**A-76 (6.4, review audit A1 M-4 / F-5) Domains of `pan` and `zoom` fields.** Rev 3 says `pan` needs integer `dx`, `dy` and a `zoom` field "of the right type"; the domains `pan` within +-2^31 and `zoom` factor 1 to 1,000,000 (the domains of the intents of 27 5.2) are an errata sentence for rev 4, not text. Read as written, a table with `pan` `dx` 2^40 or `zoom` factor 0 would be **valid**, which the implementation refuses and the earlier oracle accepts. **No row** (neither an accepting nor a refusing one) is written for a pan or zoom value that is an integer; `B14` to `B110` use integers inside both readings and wrongly typed values (string, boolean, 1.5, missing, extra), which are `INVALID_VALUE` under both.

**A-77 (6.4, 7.1) Value sets of `dir`, `end` and `delta`.** 6.4 says "fields of the right type", 7.1 gives `dir` one of left, right, up, down, `end` src or tgt, `delta` 1 or -1 for the commands that the actions "are". Whether `dir: "north"` or `delta: 2` is a type fault is not stated. The earlier oracle and the implementation refuse them (`INVALID_VALUE`); no row, only wrong **types** (a number for `dir`, a string for `delta`, 1.5, a missing field). The same decision as A-76: domain beyond type is rev 4 text.

**A-78 (6.4) Faults of `mode`, `key` and `action` that are of the wrong JSON type.** A non-string `mode` or `key`, an `action` that is not an object, an action without a `type` or with a non-string `type`: 6.4 names the reasons by the check (mode valid `INVALID_VALUE`, key a token `UNKNOWN_KEY`, action an object whose type is in the list `UNKNOWN_ACTION`) but not for a value of the wrong type. No row.

**A-79 (11.5) PNG container rules the design does not state.** The implementation also refuses: fewer than 45 bytes in total, a chunk type that is not four ASCII letters, an `IEND` chunk with a length other than 0, a chunk length above 2^31 - 1 (the PNG specification's rules; review audit B M-6, recorded as rev 4 errata). Rev 3 states only: signature, chunks that exactly fill the bytes, first chunk `IHDR` of length 13, last chunk `IEND`. **No row** distinguishes the two: no chunk type with a digit, no `IEND` with data. Also unstated and without a row: a second `IHDR`, an `IEND` before the last chunk, a chunk length that fits exactly but whose type is not letters. `X102` (length field 0xFFFFFFFF) is refused by "exactly fills the bytes" under both readings and stays.

**A-80 (11.5) Order between the hash check, the container check and the already-bound check of `embedPngBinding`.** The text lists them in that order but does not say "first failure wins" there. Every embed row is single-fault (a bad hash with a valid PNG, a bad container with good hashes, an already bound valid container); no row combines two. The binding object with a missing or an extra key is not stated either (the earlier oracle says `SCHEMA`, the implementation accepts an extra key): no row.

**A-81 (11.3, 11.4) Manifest bytes that need a decision about the parser.** A duplicate key in the document, a UTF-8 BOM, invalid UTF-8, numbers spelled `398.0`, `1e2` or `-0`, a lone surrogate escape: whether each is a syntax fault (A-75), a value-type fault or a canonical-form fault is not stated. No row. (`X84` is a leading LF, which is valid JSON whitespace and so a canonical-form fault by 11.3.)

**A-82 (11.4 (1)) Type check and name check inside one artifact entry.** "The closed key set and value types (`SCHEMA`), each artifact `name` (`UNKNOWN_ARTIFACT`), the sort order and uniqueness (`SCHEMA`)" is read as three passes over the whole manifest, in that order; the earlier oracle judges name and bytes entry by entry. A row with a wrongly typed `bytes` **and** an unknown name would tell them apart; it was dropped. `X75` (an unknown name **and** an unsorted list, `UNKNOWN_ARTIFACT`) is kept: the name pass precedes the sort pass under both readings. `X76` (a missing `state` entry in a pretty-printed manifest, `SCHEMA`) follows the stated last position of the canonical-bytes check.

**A-83 (11.2, 14.1) `expectedPngSize` without a `png`, invalid sizes, a manifest of exactly 1,048,576 bytes.** `expectedPngSize` with no PNG, with a zero, negative or non-integer dimension: not stated, no row. The limit boundary (a manifest of exactly `maxManifestBytes`) cannot be added in the corpus convention: oversize inputs are generated by the recipe of `generated/README.txt`, which the corpus readers fix to the one vector `X24` (1,048,577 bytes of 0x41); a second generated vector needs a harness change. No row.

**A-84 (oracle tool note, not a design ambiguity) `$` in the earlier tools accepts a trailing LF.** `tools/machine.py` (`MODE_RE`) and `tools/export.py` (`HEX64`, the binding text regex, via `re.match` with `$`) accept a value followed by one LF. No earlier row exercises it, so no earlier expected byte is affected; the new rows `B34` (mode `x-a` + LF), `X54`, `X108` and `X144` (trailing LF in a hash or in the binding text) are written from the **text** (`x-[a-z0-9][a-z0-9._-]*`, "64 lowercase hex", `^...$` of 11.5 over the whole text) and disagree with those two tools on purpose; `tools/gaps.py` uses whole-string matching. Cross-reading of the 223 new B, parse, read and embed rows against the earlier tools (the verify and export rows need the model and were not compared): 4 differences, exactly the four rows named here; a fifth (a wrongly typed `bytes` with an unknown name) was the A-82 row and was dropped.

## Rev 4 round (R-H, 2026-11-20): rows B111-B174, E74-E102, X178-X275, K201-K311 against design 32 rev 4

This round was written against **rev 4** of design 32 (owner-adopted rules R32-01 to R32-13 and R32-16, change log `Rev 3 -> rev 4`) by an oracle author who read only the documents of the independence statement of `README.md`. It **adds** 191 rows (B 64, E 29, X 98) and 111 mutants (K201 to K311) by `tools/gaps2.py` and changes **no earlier file, row or line**: this section is appended to `AMBIGUITIES.md`, the new `EXPECT.tsv` and `MUTANTS.tsv` lines are appended after the old ones, and `README.md` and `SHA256SUMS` are index files rewritten around them. `APPENDIX-A.tsv` is untouched (the Appendix A bytes of the design did not change; the generator re-checks A.8 and A.9 before it writes anything). Every new expected byte comes from the reference logic of `tools/gaps2.py`; before writing, that reference was also run over **282 earlier B, E (machine bytes) and X rows** (every earlier row it can evaluate without a render model) and **agrees with all of them**: no earlier row is contradicted by the rev 4 reading (rows `X09`, `X10`, `X14`, `X15`, `X26` need `buildRenderModel`, `parseState` or `renderSvg`; `X24` is the generated oversize vector).

The rows of this round are judged by the rev 4 text only where the text decides. A point the text leaves open is an entry below (A-85 to A-94) and has **no row**.

### RESOLVED-IN-REV4 (entries of the gap round that rev 4 resolves)

The entries above are not edited; their status is recorded here.

* **A-75** (reason of a manifest that is not valid JSON): **resolved** by R32-01 (11.4 (1)): `INVALID_EXPORT/SCHEMA`, `NON_CANONICAL` only for a document that parsed and passed every earlier check. The reading used for `X31` to `X48` is confirmed; no row changes.
* **A-76** (domains of `pan` and `zoom`): **resolved** by R32-02 (6.4): `dx`, `dy` within +-2^31, `factor` 1 to 1,000,000, outside `INVALID_VALUE`. The "no row" decision of A-76 is lifted: B111-B112, B114-B124.
* **A-77** (value sets of `dir`, `end`, `delta`): **resolved** by R32-03 (6.4): any other value of the right JSON type is `INVALID_VALUE`: B113, B125-B140.
* **A-78** (faults of `mode`, `key`, `action` of the wrong JSON type): **resolved** by R32-04 (6.4): non-string `mode` `INVALID_VALUE`, non-string `key` `UNKNOWN_KEY`, an `action` that is not an object, has no string `type` or an unknown one `UNKNOWN_ACTION`: B141-B174.
* **A-79** (PNG container rules): **resolved, with a remainder**, by R32-05 (11.5): chunk types of four ASCII letters, `IEND` of length 0, the 45-byte minimum and the 2^31 cap are now text; a second `IHDR` and an `IEND` before the last chunk stay "not specified" (no row, as before). Rows: X236-X259. The minimum and the cap cannot be told apart from the exact-fill rule (A-93).
* **A-80** (order of the embed checks; the binding object): **resolved** by R32-06 (11.5): hashes, container, already bound; the binding object is closed, a missing or an extra key is `SCHEMA` (the earlier oracle reading is confirmed, the implementation's tolerance of an extra key is a defect). Rows: X223-X235. A remainder is A-85 and A-86.
* **A-81** (manifest bytes): **resolved, with a remainder**, by R32-07 (11.3): BOM, invalid UTF-8 and syntax faults `SCHEMA`, a duplicate key and a non-canonical number spelling `NON_CANONICAL`, a lone-surrogate escape judged by the value checks, `-0` `INVALID_EXPORT/SCHEMA`. Rows: X178-X215. The remainder (other spellings of a negative zero or of a number that is an integer only as a double) is A-89.
* **A-82** (type check and name check): **resolved** by R32-08 (11.4 (1)): whole-manifest passes; the earlier oracle's entry-by-entry reading is withdrawn. The row dropped in the gap round (a wrongly typed `bytes` **and** an unknown name) is now `X216` (and `X222`). `X75` and `X76` stay and agree. The four-pass list of R32-08 omits the required-entries check (A-88). Rows: X216-X222.
* **A-83** (`expectedPngSize` without a `png`, invalid sizes, the 1,048,576-byte boundary): **resolved, with a remainder**, by R32-09 (11.2): ignored unless a `png` is supplied; a non-matching size (zero, negative, non-integer, above 2^32) is always `PNG_SIZE_MISMATCH`: X260-X275. The remainder is A-87 (a size that is not an object of two numbers). The boundary of a manifest of exactly `maxManifestBytes` still has no row (a second generated vector needs a harness change: not written, as instructed).
* **A-84**: unchanged (an oracle tool note). A **second** tool note: `tools/machine.py` (`parse_machine`) still holds the rev 3 reading "pointer fields not range-checked again"; it is not edited (append-only) and `gen.py` does not write the rows E74-E102. The reference for them is `tools/gaps2.py`; run order after a regeneration: `gen.py`, `gaps.py`, `gaps2.py`.

### R32 rule -> carrying rows (decided from the earlier rows first)

"Earlier" means a row that fails on its violation, is single-fault, and is consistent with the rev 4 reading (checked by the regression above). "Gap" means no earlier row carries the rule's observable behaviour: new rows were written.

| Rule | Earlier rows | New rows | Remark |
|---|---|---|---|
| R32-01 invalid JSON is `SCHEMA` | `X31`-`X44` (fourteen syntax faults: truncation, empty, trailing byte, trailing comma, single quotes, leading zero, `NaN`, unquoted key, comment, cut, two documents, raw LF, bad escape, plus sign), `X45`-`X48` (valid JSON, not an object), `X86` (verify); `NON_CANONICAL` last: `X22`, `X77`-`X85`, `X87` | none | carried |
| R32-02 pan and zoom domains | none (A-76) | B111-B112, B114-B124 | gap closed |
| R32-03 `dir`, `end`, `delta` value sets | none (A-77; `E52`, `E54` are navigation commands, 7.1, not binding rows) | B113, B125-B140 | gap closed |
| R32-04 wrong JSON type of `mode`, `key`, `action`, `mods` | only the fields **inside** an action (`B60`-`B81`: wrongly typed `dir`, `end`, `delta`, `dx`, `dy`, `factor`, `extend`, all `INVALID_VALUE`) and string values (`B28`, `B29`, `B42`-`B59`) | B141-B174 | gap closed |
| R32-05 PNG container rules | signature `X89`, `X92`, `X130`, `X171`; first chunk and `IHDR` length `X93`-`X95`, `X132`, `X134`, `X170`; last chunk `X96`-`X98`, `X131`, `X168`; exact fill `X99`-`X103`, `X133`, `X169`; the 45-byte boundary `X114` (accepted) | X236-X259 | chunk type and `IEND` length were gaps; minimum 45 and cap 2^31 unobservable (A-93) |
| R32-06 embed order; closed binding object | single faults only: hashes `X104`-`X110`, container `X89`-`X103`, already bound `X121`-`X124` | X223-X235 | order and closed object were gaps; A-85, A-86 |
| R32-07 manifest bytes | trailing comma `X34`, leading zero `X36`, `NaN` `X37`, a leading LF `X84` | X178-X215 | BOM, UTF-8, duplicate key, number spelling, lone surrogate, `-0` were gaps; A-89 |
| R32-08 whole-manifest passes | `X75` (name before order), `X76` (required entries before canonical, A-88), `X87`, `X88`, `X12`, `X13` | X216-X222 (and `X195`, `X196`) | the type pass before the name pass, and every pass before the canonical pass, were gaps |
| R32-09 `expectedPngSize` | `X17`, `X175`, `X176` (mismatch with a png), `X174`, `X177` (match) | X260-X275 | without a png, zero, negative, non-integer and 2^32 + 1 sizes were gaps; A-87 |
| R32-10 pointer-field ranges of `parseMachine` | `E60`-`E63` (shape and invariants only, no range) | E74-E102 | gap closed (limit accepted, one beyond refused, per field; second pointer) |
| R32-11 a `tick` reads the state only with a recorded target | none (`I18`, `I20` use valid states) | none | text only (owner's list); observable only with an invalid state, which no earlier script row carries |
| R32-12 "frozen intents" wording; machine arrays not frozen | none | none | text only; not a byte or error behaviour |
| R32-13 17.4 (c) wording of the demo smoke step | none | none | text only (the demo is not in the corpus) |
| R32-14, R32-15 | open, undecided | none | not written, as instructed |
| R32-16 `export-core` depends on `interaction-core` | none | none | text only (package graph) |

### Correction of K158 (appended; the line `K158` of `MUTANTS.tsv` is not edited)

`K158` ("last chunk not required to be IEND") names `X97` among its killers. `X97` is a 33-byte file that holds only the signature and `IHDR`; rev 4 refuses it by the 45-byte minimum **before** it reaches the IEND rule, so an implementation that has the minimum and lacks the IEND rule still refuses `X97` and survives it. (The earlier `K158` line is true of the oracle's own reference, which had no minimum; it is not true of an implementation that has one.) The four other rows that `K158` names, `X96` (56 bytes: signature, `IHDR`, `IDAT`), `X98` (83 bytes: a valid file and a trailing `tEXt`), `X131` and `X168` (a bound PNG without `IEND`, 286 bytes), are all at least 45 bytes and do kill it (checked by the reference with the 45-byte minimum switched on: `X96`, `X98`, `X131`, `X168` change, `X97` does not). New rows that satisfy the owner's description (at least 45 bytes, valid signature, `IHDR` first with length 13, last chunk not `IEND`, otherwise acceptable): `X251` (exactly 45 bytes: `IHDR` and an empty `IDAT`, no `IEND`) and `X252` (81 bytes: `IHDR`, `IDAT`, a `tEXt` Comment as the last chunk), plus the read row `X256`. Mechanism: a **new** mutant line `K311` (same mutation, the corrected killer list `X227,X248,X251,X252,X256`, the description says "K158 restated (correction)") is appended to `MUTANTS.tsv` with its own empty `EXPECT.tsv` row; `K158` and its row stay as they are. Readers of `MUTANTS.tsv` should use `K311` for the K158 mutation and ignore `X97` as its killer.

### New ambiguities against rev 4 (A-85 to A-94)

**A-85 (11.5) The closed binding object against the container check.** R32-06 lists the order "the hashes, the container, the already-bound state" and, in the next sentence, says the binding object has exactly the keys scene, layout, state and that a missing or an extra key is `SCHEMA`. A missing key is a missing hash, so it is the hash check. An **extra** key is not a hash fault; whether it is judged before the container (an argument-shape check) or with the hashes is not said, and the difference shows only for a binding with an extra key **and** a bad container (or an already bound one). Read: the shape check is the first one (same code `SCHEMA` as the hashes). **No row** combines an extra key with a second fault; `X233`-`X235` are single-fault.

**A-86 (11.5) A `binding` argument that is not an object.** `null`, an array, a string or a number as the binding: the text speaks of "the binding object" and its keys, not of a value that is not an object. Read: `SCHEMA` by the same reading as A-85. **No row.**

**A-87 (11.2) The shape of `expectedPngSize`.** "validate options" is the first step and "unknown key `INVALID_CONFIG/SCHEMA`" its only stated refusal; `expectedPngSize` is typed `{ width: number; height: number }` but a missing member, an extra key, a string or `null` as a member, or a value that is not an object is not given a reason. R32-09 says only: ignored unless a `png` is supplied; a size that does not match is always `PNG_SIZE_MISMATCH`. Rows `X264`-`X275` use well-formed objects of two **numbers** (zero, negative, 1.5, 1.0000001, 2^32 + 1 are numbers that do not match). Rows `X260`-`X263` (no png) give numbers that are legal for no PNG (0, -3, 1.5): read as written they are ignored; an implementation that validated the option before ignoring it would refuse `X262` and `X263`. A non-number member has **no row**. Also without a row: the order of an `embedPngBinding` error against a size mismatch for the same png (the text says the embed comes first; the `export` row format of this corpus supplies only the fixture png).

**A-88 (11.4 (1)) The required-entries check is not in the four-pass list of R32-08.** R32-08 names four whole-manifest passes: (1) closed key set and value types, (2) every artifact `name`, (3) order and uniqueness, (4) canonical bytes. The longer list earlier in 11.4 (1) also has "the required `scene`, `layout`, `state` entries (`SCHEMA`)" between the sort order and the canonical bytes. The earlier rows `X67`-`X70` (a missing entry in a canonical manifest, `SCHEMA` under every placement) and `X76` (a missing `state` entry in a **pretty-printed** manifest: `SCHEMA` only if the required-entries check comes before the canonical-bytes pass) follow the longer list and are **kept**. If the check were a fifth pass after (4), `X76` would be `NON_CANONICAL`; if it were part of (1), a manifest with a missing entry **and** an unknown name would be `SCHEMA`, otherwise `UNKNOWN_ARTIFACT`. No new row asks which; the new R32-08 rows (`X216`-`X222`) never lack a required entry. Read: between (3) and (4), as in the longer list.

**A-89 (11.3) Number spellings whose integer-ness depends on the number model.** The new rows use only spellings that have the same value under an exact decimal reading and under IEEE doubles: `398.0`, `3.98e2`, `398E0`, `0.398e3`, `398e+0`, `1e2`, `1E2`, `1e+2`, `100.0`, `10e1`, `0.0`, `9007199254740991.0` (`NON_CANONICAL`) and `-0` (`SCHEMA`, the owner's ruling). Not decided, no row: `-0.0`, `-0e0` (a negative zero spelled with a fraction or an exponent: `SCHEMA` like `-0`, or a non-canonical spelling of 0?), `1.0000000000000001` (not an integer exactly, the integer 1 as a double), `1e-400` (0 as a double, not exactly), `1e400` (infinity as a double). The reference raises an "unspecified" error if a row ever reaches one of them.

**A-90 (6.4) A binding-row number spelled `1.0`, `1e0` or `-0`.** `mods`, `dx`, `dy`, `factor`, `delta` are "integers"; in JavaScript `1.0` and `-0` parse to integers (`-0` is `-0`), in a Python reader `1.0` is a float. The text for **bindings** has no `-0` ruling (the owner's `-0` ruling is for the manifest). No row: every new binding file spells integers as plain integers and non-integers as `1.5`.

**A-91 (5.1) Relations among machine fields that the text does not state.** `t0` greater than `last_t` (a pointer pressed after the machine's last event), `x` different from `x0` for a press that is not `moved`, `pinch.d` against the distance of the two pointers, `pinch.mx`, `pinch.my` against their midpoint: only ranges and the listed invariants are stated. The accepted rows `E74`-`E78` keep `t0 <= last_t` and `x = x0` for a press; the refusing rows `E87` and `E101` have `t0` = 2^52 + 1 above `last_t` = 2^52 and are refused by the range (an implementation with an extra relation also refuses them, for another reason). The pinch rows give `d`, `mx`, `my` values unrelated to the pointers (the range is the only stated rule).

**A-92 (15.8) "`E74`+ ... stay unused".** 15.8 reserves `E74` and above, `X27` and above and others as "unused ids that stay unused"; the gap round already took `B14`-`B110` and `X27`-`X177`, and R32-10 asks for machine rows that belong to family `E`. Read: the sentence of 15.8 is stale; the new machine rows take `E74`-`E102`.

**A-93 (11.5) Two rev 4 container rules that no row can test.** (a) "at least 45 bytes": a byte string that starts with the signature, whose chunks exactly fill the rest, whose first chunk is `IHDR` (length 13, 25 bytes) and whose last is `IEND` (a different chunk, 12 bytes) has at least 8 + 25 + 12 = 45 bytes. (b) "each chunk length is below 2^31": a length of 2^31 or more cannot be satisfied by an input that fits the corpus and is refused by the exact-fill rule (`X101`, `X102`). So an implementation without either rule gives the same result on every possible row. The reference was run with each rule switched off: no row of this round changes; no mutant is recorded for them (they would be unkillable). `X114` (45 bytes, accepted) is the boundary row of (a). The minimum matters only for which rule refuses a short file first (the `K158` correction above).

**A-94 (11.5) `readPngBinding` and the verifier use the same container rules.** "`readPngBinding(png)`: parse as above (`PNG_MALFORMED` on error)" is read as the rev 4 container rules of `embedPngBinding` (chunk types, `IEND` length, minimum): rows `X253`-`X259`. If the reader is meant to be laxer than the embedder, those rows change (the 11.4 (6) clause "structure valid" is read the same way).
