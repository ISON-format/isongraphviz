"""Second step of the rev 6 additions to oracles-gl: AMBIGUITIES.md (append only), README.md (counts, revision note and one
appended section) and SHA256SUMS (regenerated over the whole corpus).  Run after tools/rev6_gen.py:
    python -B -I tools/rev6_finish.py [DIR]
"""
import hashlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(HERE)


def rd(p):
    with open(os.path.join(ROOT, p), 'rb') as f:
        return f.read().decode('utf-8')


def wr(p, s):
    assert '\r' not in s
    with open(os.path.join(ROOT, p), 'wb') as f:
        f.write(s.encode('utf-8'))


def edit(text, pairs):
    for old, new in pairs:
        assert text.count(old) == 1, old
        text = text.replace(old, new)
    return text


def sums():
    fs = []
    for d, ds, ns in os.walk(ROOT):
        for n in ns:
            p = os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, '/')
            if p.startswith('tools/') or p == 'SHA256SUMS':
                continue
            fs.append(p)
    fs.sort(key=lambda p: p.encode('utf-8'))
    out = ''.join('%s *%s\n' % (hashlib.sha256(open(os.path.join(ROOT, p), 'rb').read()).hexdigest(), p) for p in fs)
    return out, len(fs)


AMB = """
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
"""

EDITS = [
    ('**336 rows** (the 279 rows, one per id of design 13.6, and the 57 gap rows of the last section).',
     '**366 rows** (the 279 rows, one per id of design 13.6, the 57 gap rows after rev 5 and the 30 rows after rev 6, see the last two sections).'),
    ('| B | 23 | buffer encoding, guard rule, plan sections |', '| B | 24 | buffer encoding, guard rule, plan sections |'),
    ('| W | 47 | the plan reader (bad plans; W47 accepts) |', '| W | 50 | the plan reader (bad plans; W47 and W50 accept) |'),
    ('| X | 18 | readouts |', '| X | 20 | readouts |'),
    ('| U | 43 | the WebGL renderer (headless), the context controller |', '| U | 51 | the WebGL renderer (headless), the context controller |'),
    ('| K | 156 | mutants | no files (MUTANTS.tsv) |', '| K | 172 | mutants | no files (MUTANTS.tsv) |'),
    ('| **total** | **336** | | |', '| **total** | **366** | | |'),
    ('Rows with empty cells by design: D (5) and K (156);', 'Rows with empty cells by design: D (5) and K (172);'),
    ('Rows with an `error` cell: B10, W02-W46, X07', 'Rows with an `error` cell: B10, W02-W46, W48, W49, X07'),
    ('| `bad/` | the 45 bad plans W02-W46,', '| `bad/` | the 47 bad plans W02-W46, W48, W49,'),
    ('Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere).',
     'Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere). **Revision note, design 31 rev 6 (2026-11-20):** the design was folded with the owner-adopted wording R31-07..R31-11 (text only, no Appendix byte, no shader byte); 30 rows were **appended** (B24, W48-W50, X19, X20, U50-U57, K157-K172, the last section), no existing row, id, expected file or mutant was touched, and the entries A-47 to A-52 and a resolved-in-rev-6 section were appended to `AMBIGUITIES.md`.'),
]

README_ADD = """
## Additions after design 31 rev 6 (R31-07, R31-09, R31-11 (a) and (b); rows B24, W48-W50, X19-X20, U50-U57, K157-K172)

Design 31 rev 6 folded owner-adopted wording into 7.2 G12, 7.5, 7.6 and 13.2. The rules and the rows that fail when a rule is violated:

| Rule | What it says | Rows that carry it |
|---|---|---|
| R31-07 (G12) | the focused pids of a plan number at most one **distinct** pid; a clipped focused edge repeats its pid (G11) and the repeat is not a second focus | existing: `W39`-`W46` (more than one distinct focus refused), `W47` and `X14` (a clipped focused edge accepted), mutants `K130`-`K136`; **new:** `B24` (planner output: a focused edge of two clipped segments, `also` selected and focused), `W48` (a clipped focused edge plus a second distinct focus: refused by G12 only), `W49` (two focused clipped edges: refused by G12 only), `W50` (the reader accepts the planner output of `B24`), `X19`, `X20` (the readout reports the one focus), mutants `K157`-`K159` |
| R31-08 | a loss event in `created` is ignored (no effect line, status unchanged, `contextLost` true); the release rule's "not lost" is the context's own `isContextLost()` | existing and verified, no new row: `U42`, `U43`, mutants `K147`-`K149`; new mutants `K170`-`K172` also differ on them |
| R31-09 | a loss during creation: detail `CONTEXT_LOST` with no driver text, `getShaderInfoLog` not called | **new:** `U50` (the log stops after `getShaderParameter arrow.vs`, `onError` and `reject` `CONTEXT_LOST`, no info-log call, no cleanup), `U51` (then dispose: no release), `U52` (then restore and a second initialize), mutants `K160`-`K164` |
| R31-10 | 13.2: a controller row with a failed initialize has an empty `error` cell and the log as expected file; `info_log` / `expect_detail` only for `E10`, `E11` | existing and verified by script, no new row: `U25`, `U27`, `U31`, `U34`, `U36`, `U39` (and `E10`, `E11` carry both) |
| R31-11 (a) | a second `initialize` in `created` after a failed one adds no listener again | **new:** `U52`, `U53` (two failed initializes, then a successful one, then dispose: two `addEventListener` lines in all, two `removeEventListener`), mutants `K165`, `K166` |
| R31-11 (b) | after `dispose`, `L` and `R` are ignored and `status().contextLost` continues to report the context's own `isContextLost()` | **new:** `U54` (after dispose in `ready`), `U55` (in `lost`), `U56` (in `created`), `U57` (in `failed`): no line for the events, `contextLost` true after a loss and false after a restore (reading A-47), mutants `K167`-`K170` |

Not written, by the task's own limits: R31-05, R31-06, R31-11 (c), R30-31-01 (open in the design); the items of rev 6 that belong to the display-list corpus. Open points found while writing the rows: AMBIGUITIES A-48 to A-52 (no row).

**What was added.** `B24` (a real planner output of the existing scene `far-pair`, so the plan comes from this corpus's own planner; the B12 plan is reproduced byte for byte first), `states/B24.state.json`, `states/B24b.state.json`, `plan/B24.glplan`, `plan/B24b.glplan`, `bad/W48.glplan`, `bad/W49.glplan`, `bad/FAULTS-rev6.tsv` (the rule of each new bad plan; `bad/FAULTS.tsv` is not touched), `xr/X19.xr.json`, `xr/X20.xr.json`, `gllog/U50.log` ... `gllog/U57.log`; 17 new files, 30 new ids; the only existing files that differ are `EXPECT.tsv`, `MUTANTS.tsv`, `AMBIGUITIES.md` (appended lines only), this README and `SHA256SUMS`. No existing expected file is regenerated.

**Rows.** `B24` is tier `both` (`planBytes()` equals the file, the `also` case is the selected and focused variant); `W48`, `W49` are single-fault bad plans (the reference reader reports exactly `G12`, and a second, older reader of this corpus rejects them with `INVALID_INPUT/SCHEMA` and accepts them with only G12 disabled); `W50` is the `files` form (AMBIGUITIES A-43 records that the V7 harness dispatches the `files` form for `W01` only, so the acceptance is also pinned through the strict reader by the X rows `X19`, `X20`, as for `W47`/`X14`); the controller rows use the existing format (13.2: `events`, `expect_status`, `expect_log`, an empty `error` cell, fake conventions of 7.6) and the plan `plan/G01.glplan`.

**Independence.** Written from design 31 rev 6 (7.2 G11/G12, 7.5, 7.6 with the controller conventions, 13.2) by the same oracle author, who did not read, import or run any TypeScript or anything under `packages/`, and did not read another corpus's tools or expected files. The reference is `tools/rev6_ref.py` (the controller of rev 6 on top of `tools/gap_glref.py`) and `tools/rev6_gen.py`, `tools/rev6_finish.py` (not in `SHA256SUMS`; run `python -B -I tools/rev6_gen.py && python -B -I tools/rev6_finish.py` on a corpus without these rows; the old generator `tools/gl.py` does not know them and would remove them). Before anything is written the reference is checked against the existing corpus: it reproduces the logs and `status()` sequences of the 29 existing controller rows (U20-U36, U38-U49) byte for byte, the planner reproduces `plan/B12.glplan`, the existing readouts and the verdict of every existing bad plan are unchanged. The unchanged original generator was also run into a scratch directory (`python -B -I tools/gl.py --out DIR`): its 252 files and 279 rows equal the corpus files byte for byte except the index files and `bad/FAULTS.tsv`, so the rev 6 text did not change a byte of the first 279 rows.

**Mutant matrix of K157-K172.** 16 of 16 killed, every named row changing (computed by `tools/rev6_gen.py`, the matrix is in `MUTANTS.tsv`). Each mutant was run over the new rows and over every existing row it can reach (all bad plans, all readouts of plans, the planner outputs of the G and B rows, the 29 existing controller rows). Rows that change although not named: `K159` also changes the existing `X14` (the readout of the clipped focused edge of `W47.b`); `K170` also changes `U33`, `U50`-`U52`, `U55`-`U57`. No mutant changes an existing row of another kind. `K158` changes no existing planner row: no existing row has a focused clipped edge, which is why `B24` was needed.

**Digest.** The digest of the new `SHA256SUMS` cannot be recorded in this file (the README is one of the files it covers); it is given in the hand-over. For reference, the digest of `SHA256SUMS` before these additions was `b87ff2918a63f2acec56674b0b45b375f572ed8649340ca3bd7874d6a4084c5e`.
"""

amb = rd('AMBIGUITIES.md')
assert 'A-47 ' not in amb and amb.endswith('\n')
wr('AMBIGUITIES.md', amb + (AMB.lstrip('\n') if amb.endswith('\n\n') else AMB))
rm = edit(rd('README.md'), EDITS)
assert 'Additions after design 31 rev 6' not in rm and rm.endswith('\n')
wr('README.md', rm + (README_ADD.lstrip('\n') if rm.endswith('\n\n') else README_ADD))
s, n = sums()
wr('SHA256SUMS', s)
print('SHA256SUMS files', n, 'digest', hashlib.sha256(s.encode()).hexdigest())
