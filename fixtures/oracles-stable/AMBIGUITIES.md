# Ambiguities, contradictions and gaps found while rebuilding the V3 oracle from the design text

**Status after rev 3 of the design.** The design author resolved A-01 to A-24 in rev 3 (change log, rev 2 to rev 3). Each item below was re-checked against the rev 3 text and the corpus was regenerated (148 rows). Resolution column: *fixed* = the design/vector was changed; *accepted* = the oracle's reading was adopted as intended; *defined* = the text now states the rule. In every case the Python result was re-derived and equals the number the design now states; there is **no remaining disagreement**. The detailed rev 2 findings follow unchanged as history.

| Item | Resolution | Corpus effect |
|---|---|---|
| A-01 | fixed (TP06 own config, TP06r RECOMMENDED) | none (rows already so) |
| A-02 | fixed (seed with no kept record is `INCONSISTENT_RECORD`) | new `TR31`; `TR22` now a `cold` report for an empty new scene (`NOT_REPRODUCED#MODE`) |
| A-03, A-05, A-06, A-07, A-08, A-13, A-14, A-16, A-17, A-18, A-19 | accepted / defined | none |
| A-04 | accepted | `TR25` split into `TR25a` and `TR25b` |
| A-09, A-10, A-11 | defined | none |
| A-12 | defined (30 / 44 / 74 / 179 for Case C) | TR01, TR01s, TR01r unchanged and equal |
| A-15 | fixed (TM02 displacements) | none (rows already so) |
| A-20, A-21, A-22 | accepted | none |
| A-23 | fixed (tight bound 10,240) | none (TL15 already 10,240) |
| A-24 | defined | renames to bare ids where a single case is listed: `TL04a` to `TL04`, `TL17a` to `TL17`, `TL19a` to `TL19`, `TM08a` to `TM08`; the second cases stay as extra rows |

**New findings at rev 3.**

* **B-01 (Minor, informational).** Section 9.5 step 2 now says an `incremental` report whose derived mode is `cold` is constructible "only when it has no incremental added records", and also that none exist with kept = 0. Taken together there is no constructible `incremental`-to-`cold` mismatch at all (a derived `cold` needs a non-empty new scene with kept = 0, hence added nodes, hence incremental added records, which cannot pass section 9.3). The sentence is harmless but could be dropped; the corpus has only the `cold`-for-`incremental` direction (TR21, TR22).
* **B-02 (Minor).** The rev 3 suffix rule makes `TL04`, `TL17`, `TL19`, `TM08` single-case ids; the oracle's first drafts used `a` suffixes for them. The extra cases (`TL04c` layout byte cap, `TL17b` and `TL19b`, `TM08b`) are oracle additions, listed in the README, not design ids.

No other disagreement between the independent result and rev 3 was found (checked: TP06 candidate distance 23,428; Case C verifier charges; edge-key bound 10,240; TR15's hint equals the general formula; TR22/TR25a/TR25b/TR31 each trigger exactly the stated reason in the Python verifier).

---

(History: rev 2 findings.) Source: `28-STABLE-LAYOUT-DESIGN.md` rev 2 (plus IGS/1 and IGL/1). Format per item: section, the reading chosen (always the most literal one; nothing silently invented), and what a second reading would change. Severity: **I** = Important (a vector in the design's own list is false, impossible or unconstructible, or bytes would change), **M** = Minor (a second reading changes no vector byte, or only an unvectored corner).

**Result of the main check.** Section 5.6 (Cases A, B, C: scene, layout and report hashes, report lengths 1,703 / 1,499 / 2,099, `W*` 61 / 39 / 105, `(work, waves, placed)`) was reproduced **exactly** from the text on the first run. There is no difference between the text and the Python bytes. All other numeric claims of the design that could be run were also reproduced: TL07 (`W = 78` before the report charge; 104 fails, 105 passes; 60 fails, 61 passes), TL08 (`W = 10k + 10`: 20, 60, 510; 55 at x = 39999), TL13 (`nodeKey` 6,142 units), TL15 (worst-case edge key 10,240 units).

## Important

**A-01. TP06 is false under `RECOMMENDED_PLACEMENT`** (section 16 TP06; section 5.3; "Placement is `RECOMMENDED_PLACEMENT` unless stated"). TP06 says: two siblings on one anchor, the second takes direction 1. With `R = 60000` and `S = 40000` the ring-0 candidates for directions 0 and 1 are `(60000, 0)` and `(55440, 22980)`, only 23,428 apart (< `S`), so direction 1 is blocked by the first sibling; the second takes **direction 2** `(42420, 42420)`. Reading chosen: the row states no other config, so `TP06r` records the literal reading under `RECOMMENDED_PLACEMENT` (direction 2); `TP06` itself uses an explicitly stated config `{60000, 20000, 32}` (direction 1, the intent of the row). A second reading (take the row's text as authoritative and `RECOMMENDED` as the default) is impossible; the design should say `S <= 23428` for TP06.

**A-02. TR22 cannot be constructed** (section 16 TR22; sections 9.3, 9.5, 11). "`incremental` report where `kept = 0`: `NOT_REPRODUCED/MODE`" needs a report that passes `verifyStable` (section 9.5 step 1) with mode `incremental`, kept = 0 and a non-empty new scene (otherwise section 11 derives `incremental` and nothing differs). Such a report has added records with the incremental shape, hence at least a `seed` record, whose anchor is `(maxX + R, divRound(Sy, k))` with `k = 0`: undefined. A `neighbours` anchor with no kept node has no neighbour to be the centroid of either. Reading chosen: the standalone verifier treats a seed record with no kept record as `INCONSISTENT_RECORD` (the anchor cannot be recomputed); therefore no report reaches `MODE`, and **TR22 is not produced**. A second reading (define the `k = 0` seed anchor, for example `(R, 0)`) would make TR22 constructible but is an invention the text does not support; or the row could be restated as a standalone `INVALID_REPORT` row.

## Minor

**A-03. Section 5 header versus section 11.** Section 5 says incremental placement "applies in mode `incremental` (previous present and at least one node kept)"; section 11 makes `incremental` also the mode of an empty new scene with a previous drawing (kept = 0, TP20). Reading chosen: section 11 decides the mode; placement runs only when at least one node is added and kept >= 1 (by section 11 an added node with kept = 0 is `cold`). TP20 follows this (mode `incremental`, `placement {"present": false}`, `transform_hint {"present": false}` because `c = 0`). A second reading would call TP20 `cold` and need a `coldStart`.

**A-04. `ring` bound without a placement object** (section 9.3). "`ring` in `0..max_rings-1`" has no `max_rings` when `placement` is `{"present": false}` but `incremental` added records exist (TR25's other direction). Reading chosen: the ring bound is checked only when `placement.present` is true (otherwise `ring >= 0`); the contradiction is then caught by `placement.present iff incremental with added records` (`INCONSISTENT_RECORD`). TR25 is produced only in the other direction (placement present with no added record). A second reading could make the missing-placement case `INVALID_VALUE`.

**A-05. `transform_hint` in incremental reports** (sections 8.3 and 9.3). "Exactly `(0,0)` in incremental mode" is read as a consequence of Law 4, and the verifier recomputes the hint from the general formula `divRound(sum(x_next - x_prev), c)`. TR15 (kept node moved, report otherwise self-consistent so that only `KEPT_MOVED` fires, which section 9.3 puts last) therefore must carry the formula's value. TR15 moves one of three kept nodes by +1 thousandth, so the formula gives `(0,0)` too and the bytes are the same under both readings; a larger move would diverge (formula nonzero versus forced zero).

**A-06. Admission order for `verifyDisplacementReport`** (sections 9.3, 12.1). Section 12.1 lists `verifyDisplacementReport` inside step (3) (verification) and the report count check in step (4), after it; section 9.3 says admission (byte length, counts, meter) comes first, then the schema. Counts need a parse. Reading chosen: byte length, then parse (`SCHEMA` on failure), then record/edge counts, then the V1 charge (section 12.3: "after parse and counts"), then the schema steps. Affects only a malformed report that is also over a limit; no vector.

**A-07. Reason for a report over the record/edge limits** (sections 12.1, 14). The error table names `NODE_LIMIT`/`EDGE_LIMIT` for scenes; for "records > 2*maxNodes" in a report the reason is not stated. Reading chosen: `RESOURCE_LIMIT/NODE_LIMIT` (and `EDGE_LIMIT` for edge entries). TL18 depends on it. A second reading would invent a new reason.

**A-08. Reasons for a wrong report `scale` or `address_scheme`** (section 9.3, section 14). The `INVALID_REPORT` reason list has no `INVALID_SCALE`/`UNSUPPORTED_ADDRESS_SCHEME`. Reading chosen: `scale != 1000` is `INVALID_VALUE`, a wrong `address_scheme` is `UNSUPPORTED_VERSION`. No vector.

**A-09. Format of the `NO_FREE_SLOT` detail** (section 14: "detail: its address"; TP13). No text is defined. Reading chosen: the wire reference as compact canonical JSON, `{"id":"i:2","type":"n"}`; the `error` column carries it after `#`. A second reading (e.g. the typed key string) changes only the detail text.

**A-10. The vector table has one `input` column** (section 16). Rows for `measureDisplacement` need a next drawing, and verifier rows need report and layout bytes. Reading chosen: `input` is a JSON call descriptor (`fn`, `options`, `next_layout`, `report`, `layout`, `budget`), documented in the README; `expected_layout` is only ever an *output*. A second reading would add columns; no expected byte changes.

**A-11. `work` on refusal rows** (section 16: "the Python-computed final meter value"). Reading chosen: empty for every error row except `WORK_LIMIT`, where it is `W` at the refusal (TL07a 78 as the design states, TL07c 34), so a second implementation can compare the point of termination.

**A-12. Meter charges for the verifiers** (section 12.3). V1 = `3 * (records + added_edges + removed_edges)` and V2 = C1 `+ 2 * e_next + records` were taken literally; `verifyStable` is V1 + V2 and `verifyStableReproducible` adds production's C1..C4 on the same cumulative meter. The design gives numbers only for the producer, so the verifier work values (TR01 30, TR01s 74, TR01r 179, TL19b 30) are extras not cross-checked against the text. A second reading of "records" (records of the report versus of the scene union) agrees for valid reports.

**A-13. `extent.previous` with no previous drawing** (sections 8.3, 9.2). Section 8.3 says `{"present": false}` when the layout has no nodes; with `previous` null there is no layout. Reading chosen: `{"present": false}` (TC01, TC08), the same text as an empty previous layout (TM08b, where `previous.present` is true and `extent.previous.present` is false).

**A-14. Report of a cold start with a previous drawing** (sections 9.2, 11). Read literally: every previous node `removed`, every new node bare `added`, aggregates `added`/`removed` count them, `common = 0`, `transform_hint {"present": false}`, `placement {"present": false}`, `edges` as the typed-address diff (all previous edges removed, all new edges added). Nothing contradicts this, but the text never lists the aggregates of a cold report explicitly.

**A-15. TM02, `d2 = 3`** (section 16 TM02: "`d2 = 2, 3, 4, 8, 9` give `isqrt` 1, 1, 2, 2, 3"). 3 is not a sum of two integer squares, so no displacement has `d2 = 3`. Read as a unit-test list for `isqrt` rather than for displacement; the vector uses displacements `(3,4)`, `(-1,1)`, `(2,0)`, `(-2,2)`, `(0,-3)`, `(1,2)` (`d2` = 25, 2, 4, 8, 9, 5, so `dist` 5, 1, 2, 2, 3, 2). The mutant "isqrt rounding to nearest" is still killed by `d2 = 8` (2.83 rounds to 3, floor is 2).

**A-16. Closed-object check order inside the schema step** (section 9.3). "Closed objects, with reserved names, an unknown key or a missing key" does not say whether the whole report is checked for `RESERVED_FIELD`/`UNKNOWN_FIELD`/`MISSING_FIELD` per object depth first or breadth first, nor the order between the three kinds across objects. Reading chosen: top level first, then nested objects in canonical key order; within one object reserved, then unknown, then missing. Each T-REPORT row violates one rule, so no vector depends on it (design gap (b) of the change log).

**A-17. `verifyStable` loops** (section 9.4). The check order is `HASH, NODE_SET, STATUS, POSITION, EDGES, ANCHOR, WAVE`. Read as one full pass per check over all records (so a bad `WAVE` on an early node cannot pre-empt a bad `ANCHOR` on a late one). A per-record interleaving would change which error wins only for reports with two faults; no vector has two.

**A-18. Consequences of the `verifyStable` order for fault construction** (informative, affects how rows must be built). Because `POSITION` precedes `ANCHOR`, TR26 needs a *layout that agrees with the false anchor* (a different layout from the producer's for the same scene, `layouts/TR26.layout.json`), otherwise `POSITION` fires first. Because `STATUS` precedes `MODE`, TR21's cold report must still list the shared nodes as `kept` (allowed: "kept (any mode)"). TR20 uses a self-consistent report whose added node sits on another candidate (direction 6); this also shows that "first admissible candidate" cannot be checked by the verifiers (as section 9.3 says), only recomputation can.

**A-19. `previous` null versus a report with `previous.present = true`** (section 9.4: "`previous` may be `null` for a report whose `previous` is `{"present": false}`"). The converse is not stated. Reading chosen: any mismatch between the supplied previous drawing and `report.previous` is `REPORT_MISMATCH/HASH`.

**A-20. Source hashes of non-worked-example scenes** (section 5.6 fixes them only for the worked examples). Reading chosen: `SHA-256` of the ASCII vector id text (README). A second choice changes every scene, layout and report hash of those vectors but no coordinate, record or work value.

**A-21. Identifier whitespace** (IGS/1 section 1.2, "no whitespace"). The relation for TL14/TL15/TL21 uses U+0001, which is not whitespace under JavaScript `\s` or Python `\s`; U+001C to U+001F are whitespace under Python `str.isspace` but not under JavaScript `\s`, so they are avoided.

**A-22. TL12 "a 5,000-unit identifier"**: read as a `nodeKey` of exactly 5,000 UTF-16 units (4,990 `a` characters after `s:`), above the 2,048 cap. "Accepted by `computeFixedLayout`" is shown by the previous layout the corpus itself holds for that scene (an IGL-valid FIXED layout), not by a separate row.

**A-23. TL15's bound.** The design's own bound 10,252 assumes every unit of a node key re-escapes, but a node key always contains three unescapable structural characters, so 10,252 is not reached; the corpus' worst case is 10,240 (the figure the design reports as measured) with backslash and quote identifiers at 2,048 units and a relation of 341 `U+0001` characters at 2,048 units. A relation cannot contain `"` or `\` (IGS identifier rule), so "every character a backslash or quote" applies only to the identifiers.

**A-24. Row ids that the design splits or leaves whole.** The design's `TP11`, `TP12`, `TP14`, `TC06`, `TC07`, `TL04`, `TL07`, `TL08`, `TL09`, `TL14`, `TL17`, `TL19`, `TL21` list several cases under one id. Reading chosen: one row per case with a letter suffix (`TP11a`, `TP11b`, ...); no bare id is produced for them. `TD16R` (the swapped pair), `TP06r`, `TR01s` and `TR01r` are additions.

## Vector ids not corpus rows (rev 3)

Rev 3 lists as unit-test-only properties: `TL11`, the cross-process half of `TD16`, the spy assertion of `TL04`, `snapshotLayout` outputs and the inline tests. Every other id of section 16 is a corpus row here (T-DIFF 16, T-PLACE 24, T-COLD 8, T-MEASURE 10, T-REPORT 31 including `TR22` and `TR31`, T-LIMIT 20 of 21). `TR22` (history: A-02) is now produced.
