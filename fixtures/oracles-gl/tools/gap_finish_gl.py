"""Second step of the oracles-gl gap additions: AMBIGUITIES.md (append), README.md (counts and one appended section) and
SHA256SUMS (regenerated over the whole corpus).  Run after tools/gap_gl.py:  python -B -I tools/gap_finish_gl.py [DIR]
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


AMB = """
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
"""

EDITS = [
    ('**279 rows**, one per id of design 13.6.', '**336 rows** (the 279 rows, one per id of design 13.6, and the 57 gap rows of the last section).'),
    ('| B | 21 | buffer encoding, guard rule, plan sections |', '| B | 23 | buffer encoding, guard rule, plan sections |'),
    ('| W | 38 | the plan reader (bad plans) |', '| W | 47 | the plan reader (bad plans; W47 accepts) |'),
    ('| X | 9 | readouts |', '| X | 18 | readouts |'),
    ('| U | 33 | the WebGL renderer (headless), the context controller |', '| U | 43 | the WebGL renderer (headless), the context controller |'),
    ('| K | 129 | mutants | no files (MUTANTS.tsv) |', '| K | 156 | mutants | no files (MUTANTS.tsv) |'),
    ('| **total** | **279** | | |', '| **total** | **336** | | |'),
    ('Rows with empty cells by design: D (5) and K (129);', 'Rows with empty cells by design: D (5) and K (156);'),
    ('Rows with an `error` cell: B10, W02-W38, X07', 'Rows with an `error` cell: B10, W02-W46, X07'),
    ('| `bad/` | the 37 bad plans W02-W38,', '| `bad/` | the 45 bad plans W02-W46,'),
]

README_ADD = """
## Additions after the rev 5 gap review (single-focus clause of G12; the controller outcomes; rows B22-B23, W39-W47, X10-X18, U40-U49, K130-K156)

The ledger notes `gl A-39` (single focus) and `gl A-40` (controller outcomes) recorded that rev 5 added rules for which no row exists (AMBIGUITIES A-39, A-40: "asserted by the generator, not by rows"). These 57 rows were **appended** (new ids; no existing expected byte or row changed; the only existing files that differ are `EXPECT.tsv`, `MUTANTS.tsv` and `bad/FAULTS.tsv` (appended lines), `AMBIGUITIES.md` (appended A-42 to A-46 and the entry count), this README (counts and this section) and `SHA256SUMS`).

| Rows | What | Files |
|---|---|---|
| W39-W46 | plans with more than one focused element, each rejected by **G12 only** (the reference reader reports exactly `G12`): layer-2 edge plus layer-6 node (W39), two layer-2 pids (W40), two layer-6 pids (W41), the layer-2 focus plus a `cn` entry with flags 2 (W42), plus a `ce` entry with flags 3 (W43), two `cn` entries with the focus bit and no drawn focus (W44), a layer-6 node plus a `cn` entry (W45), a `cn` and a `ce` entry (W46) | `bad/W39.glplan` ... `bad/W46.glplan`, `bad/FAULTS.tsv` |
| W47 | the reader accepts: `bad/BASE.glplan`, a focused clipped edge (two instances of one pid), one omitted focused node, a drawn node focus with selected omitted entries, one omitted focused edge | `plan/W47.b.glplan` ... `plan/W47.e.glplan` |
| B22, B23 | a focused node / edge that the guard rule omits: the flags in `cn`/`ce` carry the focus bit (`also` cases: selected and focused) | `states/B22*.state.json`, `states/B23*.state.json`, `plan/B22*.glplan`, `plan/B23*.glplan` |
| X10-X13 | the readout of those four plans: the focus from the omitted entry's flags | `xr/X10.xr.json` ... `xr/X13.xr.json` |
| X14-X18 | the readout of the accepted plans of W47 (the harness runs the `files` form of a W row for W01 only, so the acceptance is also pinned through the strict reader of an X row): focus edge of a clipped chain (X14), omitted node (X15), drawn node with selected omitted entries (X16), omitted edge (X17), `bad/BASE.glplan` (X18) | `xr/X14.xr.json` ... `xr/X18.xr.json` |
| U40 | `(failed, R)` with the context **lost again**: phase `lost`, `failure` cleared, `onStatus`, no cleanup calls, a later R succeeds | `gllog/U40.log` |
| U41 | `(failed, R)` with a **second usable failure** (new token): phase stays `failed`, `onError` once, new `failure`, no `onStatus`; dispose releases | `gllog/U41.log` |
| U42, U43 | the **release rule** in `created` after a failed initialize: a lost context is not released (U42), a restored one is (U43) | `gllog/U42.log`, `gllog/U43.log` |
| U44-U49 | table cells without a row: `created` with R, C, F and no context (U44); a plan retained before `initialize` is drawn by it, `ready` F (U45); a restore with no retained plan draws nothing (U46); `failed` with C and F, then lost, then the latest plan on restore (U47); `init` in `lost` and `failed` is ignored (U48); `disposed` absorbs every event (U49) | `gllog/U44.log` ... `gllog/U49.log` |
| K130-K156 | 27 mutants (reader clause variants, readout, guard flags, controller outcomes); all killed by the named rows (MUTANTS.tsv) | |

**Independence of these rows.** Written from design 31 rev 5 (7.2 with G1-G16, 7.4, 7.5, 7.6, 9.1, 9.3, Appendix A.5.1) by a separate oracle author who did not read, import or run any TypeScript or `packages/*/src` and did not read the generator of this corpus; the reference logic is `tools/gap_glref.py` (plan structure and strict reader G1-G16, readout from the plan, executor log, controller reducer with its fake) and `tools/gap_gl.py`, `tools/gap_finish_gl.py` (standard library only). Before writing anything the reference is checked against the existing corpus: it accepts every `plan/*.glplan`, reproduces the violated rule of each of W02-W38, the readouts X01-X04, X06, X08, X09 and the logs and `status()` sequences of the 19 existing controller rows U20-U36, U38, U39 byte for byte. `tools/gen.py` does not know these rows: running it removes them. To rebuild only the additions, restore the corpus from version control and run `python -B -I tools/gap_gl.py && python -B -I tools/gap_finish_gl.py`.

**Mutant matrix of K130-K156.** The mutants touch the G12 clause, the readout, the guard flags and the controller only, so each was run over the new rows and over every existing row that calls those functions (W01-W38, X01-X09, U20-U39 except U37, B14 and B13 by derivation); the other existing rows cannot change. Result: 27 of 27 killed with every named row changing. Rows that change although not named: K134 also changes X13-X15 and X17 (selected omitted entries); K138 the existing X06 and the new X14-X18; K142 the existing U28; K148 the new U41 and the existing U34; K153 the existing U36 (these existing rows already pinned those behaviours; no existing row pinned the focus clause or the three controller outcomes).

**Not covered (recorded in AMBIGUITIES).** A-44 (a loss during the failed creation), A-46 (a second initialize after a failure, events after dispose, two foci read leniently), A-45 (the existing U rows do not follow the 13.2 sentence about an error cell).
"""


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


amb = rd('AMBIGUITIES.md')
assert 'A-42 ' not in amb and amb.endswith('\n')
amb = edit(amb, [('**41 entries (A-01 to A-41), 8 of them design defects.**',
                  '**46 entries (A-01 to A-46), 8 of them design defects.** A-42 to A-46 were added after the rev 5 gap review.')])
wr('AMBIGUITIES.md', amb + (AMB.lstrip('\n') if amb.endswith('\n\n') else AMB))
rm = edit(rd('README.md'), EDITS)
assert 'Additions after the rev 5 gap review' not in rm and rm.endswith('\n')
wr('README.md', rm + (README_ADD.lstrip('\n') if rm.endswith('\n\n') else README_ADD))
s, n = sums()
wr('SHA256SUMS', s)
print('SHA256SUMS files', n, 'digest', hashlib.sha256(s.encode()).hexdigest())
