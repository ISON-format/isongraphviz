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

