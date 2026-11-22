"""Second step of the oracles-dl rule D13 additions (design 31 4.7, R31-05): AMBIGUITIES.md (append), README.md (counts, a revision
note and one appended section) and SHA256SUMS (regenerated over the whole corpus).
Run after tools/rev7_dl.py:  python -B -I tools/rev7_finish_dl.py [DIR]
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


# ------------------------------------------------------------------ AMBIGUITIES.md (appended; nothing above is edited)
AMB = """
## A-57  13.2: the `S` row grammar has no field for the line number that D13 states (rows S44-S57, S64)

* **Design text.** 4.7: failures are `INVALID_INPUT/SCHEMA` "with the line number in `detail`"; D13 (R31-05) says "the line number in `detail` being that of the second such record". 13.2 and 13.3 give an `S` row an input that is a path (or the inline `{"file":...,"limits":...,"also":[...]}`), an empty `expected` and an `error` cell `CODE/REASON`; no existing `S` row states a line number, and no `S` grammar says how a row would.
* **Literal reading used.** The line is the one thing that tells D13's two readings apart (the second record against the first, the last or an earlier fault), so the rejected rows of D13 carry it in their inline input as `"expect_line": N` (the 1-based line of the record that the rule names; `{"expect_line":143,"file":"bad/S44.dl"}`), next to the `file` key that a reader of 13.2 already knows. This follows the precedent of `expect_detail` of `gl:E10` and `E11` (an extra inline key that states a part of the failure the `error` cell cannot). The `error` cell stays `INVALID_INPUT/SCHEMA`; a runner that does not know `expect_line` still checks the rejection and passes. No other `S` row (S02-S43) is changed.
* **Why / status.** Editorial, a grammar gap, not a verdict. The line is a **number**, not the text of `detail`: where an implementation puts it (`detail`, a `path` such as `line 7`) is not a corpus matter.

## A-58  4.7 D13 supersedes A-51 (the list reader had no focus rule)

* **Design text.** 4.7 D13 and change-log row R31-05 (ruled 2026-11-22): "at most one `E` or `N` record of the whole list has the focus bit (`flags` 2 or 3). A second record with the bit is `INVALID_INPUT/SCHEMA`, the line number in `detail` being that of the second such record ... a rule over the whole list, applied after the rules of each record; single-fault like the others".
* **Literal reading used.** D13 is the "new rule D13 with a single-fault `S` row" that A-51 named. A-51 stays as written (a record of what the corpus said before the ruling); this entry is its disposition: **RESOLVED by D13**. Both focus-bearing values count (`flags` 2 and 3), on `E` and on `N`, whatever the kind of the first record; `flags` 1 (selected only) and 0 do not. The rows are S44-S64 (S44-S55 and S64 single-fault rejections, S56 and S57 the precedence rows of A-59, S58-S63 the controls that must stay accepted); the mutants K222-K245.
* **Why / status.** Reading matched to the text; no existing expected byte changes (every existing list of the corpus has at most one focus bit, asserted by `tools/rev7_dl.py`).

## A-59  4.7 D13 against the other rules: what "applied after the rules of each record" decides (rows S56, S57)

* **Design text.** "D13 is a rule over the whole list, applied after the rules of each record." The other whole-list rules (D4 counts and `A` presence of D5, line number 0 or the header) are not ordered against D13 by any sentence.
* **Literal reading used.** Against the **per-record** rules (D6 `E`, D7 `A`, D8 `N`, D9 `T`, D12 canonical text) the order is stated: a faulty record is reported first, whether it comes before the first focus record (S57: an `E` with `flags` 4 ahead of two focused `N`) or after the second (S56: a `T` text of 25 units after two focused `N`); the line is that of the faulty record. Both rows are therefore **two-fault** lists and are judged by the line (like `S32` and `S40` they are declared exceptions to single-fault; the generator asserts that with the per-record rule alone off the line is D13's, and with D13 alone off it is the record's). No row orders D13 against the whole-list rules D4 and D5 (a header count, a missing `A`), and none is written: a row would encode a guess about a line number the text does not give.
* **Why / status.** Reading from "after the rules of each record". Mutants K230 (D13 before the records) and K231 (D13 while the records are read) are the two ways to get it wrong.

## A-60  Where the new accepted lists and ids live (rows S58-S63, S60 reuses G05)

* **Design text.** 13.3 lists the `dl/` files as expected lists of the G, N, X, Y, O rows and `bad/` as the rejected lists; it reserves no `S` id above `S43` and no `K` id above `K221`.
* **Literal reading used.** New ids continue the numbering: `S44`-`S64`, `K222`-`K245`. The rejected lists are `bad/S44.dl`-`bad/S57.dl` and `bad/S64.dl`. The accepted controls S58, S59, S61, S62, S63 are files `dl/S58.dl` etc. (a list is a list; no reader and no test globs the directory) and S60 names the existing `dl/G05.dl` (no focus bit; the `row` for the list as it stands). Every control is `G05` or `G02`/`O01` edited in `flags` only, so it is accepted by every other rule. `bad/S55.dl` is built on `O01` (a list without `T`) so that the second focus record is the last record of the file; the lists of the other rows are `G05` (20 nodes, 37 edges; directed) except `S64` (`G02`, undirected: the two `E` records follow each other with no `A` between).
* **Why / status.** Editorial; no verdict is affected.

## Resolved for D13 (disposition of an earlier entry; the entries above are unchanged)

Source: design 31 4.7 rule D13 and change-log row R31-05 (ruled 2026-11-22). Append-only: no existing expected byte, row, mutant or ambiguity line changes.

| Entry | Rule | Disposition | Rows and mutants |
|---|---|---|---|
| A-51 (the list reader has no focus rule) | D13, R31-05 | RESOLVED by D13: a second focus-bearing `E` or `N` record is `INVALID_INPUT/SCHEMA` at its line | S44-S57, S64 (rejected), S58-S63 (accepted); K222-K245 |
"""

# ------------------------------------------------------------------ README.md
README_EDITS = [
    ('37 rows and mutants were appended for it, see the last section. Produced against',
     '37 rows and mutants were appended for it. A further 45 ids (rows S44-S64, mutants K222-K245) were appended for rule D13 of design 31 4.7 (the single-focus rule of the list reader, R31-05, ruled 2026-11-22); see the last section. Produced against'),
    ('**495 rows** (432 of the rev 5 generation, the 26 gap rows and the 37 rows of the rev 6 section)',
     '**540 rows** (432 of the rev 5 generation, the 26 gap rows, the 37 rows of the rev 6 section and the 45 rows of the D13 section)'),
    ('| S | 43 | 41 | the strict reader |', '| S | 64 | 56 | the strict reader (S44-S64: rule D13) |'),
    ('| K | 227 | 0 | mutants (empty cells) |', '| K | 251 | 0 | mutants (empty cells) |'),
    ('| **total** | **495** | **102** | D and K rows (233) have empty cells by design;',
     '| **total** | **540** | **117** | D and K rows (257) have empty cells by design;'),
    ('| `bad/` | the S02-S43 invalid lists (single-fault, see `inputs/self-checks.json`) |',
     '| `bad/` | the S02-S43 invalid lists (single-fault, see `inputs/self-checks.json`) and the S44-S57 and S64 lists of rule D13 (S56 and S57 are two-fault lists judged by the line, A-59) |'),
    ('| `dl/` | expected display lists (exact bytes, every line ends with LF): rows G, N, X, Y, O, F; `*.cK.dl` are the lists recorded by the U scripts |',
     '| `dl/` | expected display lists (exact bytes, every line ends with LF): rows G, N, X, Y, O, F; `*.cK.dl` are the lists recorded by the U scripts; `S58.dl`, `S59.dl`, `S61.dl`-`S63.dl` are the accepted controls of rule D13 |'),
    ('A-53 to A-56 and a rev 6 disposition section after design 31 rev 6)',
     'A-53 to A-56 and a rev 6 disposition section after design 31 rev 6, A-57 to A-60 and a D13 disposition section after rule D13)'),
]

README_ADD = """
## Additions for design 31 rule D13 (the single-focus rule of the list reader, 4.7, R31-05; rows S44-S64, K222-K245)

Rule **D13** (ruled 2026-11-22): at most one `E` or `N` record of the whole list has the focus bit (`flags` 2 or 3); a second record with the bit is `INVALID_INPUT/SCHEMA`, the line being that of the **second** one; the rule is applied after the rules of each record and is single-fault like the others. These 45 ids were **appended** (new ids; no existing expected byte, row, mutant or ambiguity line changed; the existing files that differ are `EXPECT.tsv` and `MUTANTS.tsv` (appended lines), `AMBIGUITIES.md` (appended entries A-57 to A-60 and a disposition section), this README (counts, a revision note and this section), `SHA256SUMS`, and the reference reader `tools/dl.py` (`_d13` and the rule name `focus`, which only fires on a list with two focus bits; `python tools/gen.py --out DIR` before and after the edit gives identical output: 277 files, 432 rows, `diff -r` clean)). The digest of `SHA256SUMS` is in the hand-over report, not here, because this file is covered by it.

| Row | List | What |
|---|---|---|
| S44 | G05 | two `N` (flags 2, 2), far apart: line of the second |
| S45 | G05 | two `E` (flags 2, 2), far apart |
| S46 | G05 | an `E` then an `N` (flags 2, 2), far apart: the second is the `N` |
| S47, S48 | G05 | flags 3 then 2, flags 2 then 3 (two `N`, far apart) |
| S49 | G05 | an `E` and an `N`, both flags 3 |
| S50 | G05 | two `N` on neighbouring lines |
| S51 | G05 | the first two `E` records (each followed by its `A`) |
| S52 | G05 | the last `E` and the first `N` (the E/N boundary) |
| S53 | G05 | three `N`: the error is at the second |
| S54 | G05 | three, `E` (3), `E` (2), `N` (2): the error is at the second `E` |
| S55 | O01 | two `N`; the second is the last line of the file (a list without `T`) |
| S64 | G02 | an undirected list (no `A`): two `E` (flags 2, 2), neighbouring lines |
| S56 | G05 | **two faults:** two focused `N`, then a `T` of 25 units: the `T` line (A-59) |
| S57 | G05 | **two faults:** an `E` with `flags` 4, then two focused `N`: the `E` line (A-59) |
| S58, S59 | G05 | accepted: exactly one focus bit, on a node, on an edge |
| S60 | G05 | accepted: no focus bit (the file `dl/G05.dl` itself) |
| S61 | G05 | accepted: `flags` 1 (selected only) on every `E` and `N` record |
| S62 | G05 | accepted: `flags` 3 once, on a node |
| S63 | G05 | accepted: `flags` 3 once, on an edge, `flags` 1 on every other `E` and `N` |

The rejected rows state the line in the inline input as `"expect_line"` (A-57); the `error` cell is `INVALID_INPUT/SCHEMA`. Rows S44-S55 and S64 are **single-fault**: the reference reader with only rule `focus` disabled accepts each; S56 and S57 are the declared two-fault exceptions (with the `T` rule alone off the line is the second focused `N`; with `flags` alone off likewise; asserted by `tools/rev7_dl.py`). The expected line of every row is computed from the construction of the list in `tools/rev7_dl.py` (the line of the second focus-bearing record), then asserted against the reference.

**Mutants K222-K245** (all in the reference reader `tools/dl.py`, `_d13`, and run over every `S` row, old and new): K222 no D13, K223 counts `N` only, K224 counts `E` only, K225 counts `flags` 2 only, K226 counts `flags` 3 only, K227 allows two (refuses the third), K228 reports the first record's line, K229 reports the last (third) record's line, K230 applies D13 before the rules of the records, K231 applies D13 while the records are read, K232 one focus `E` and one focus `N` allowed (per kind), K233 second focus counted only when the first was an `N`, K234 only when the first was an `E`, K235 compares neighbouring `E`/`N` records only, K236 neighbouring lines only, K237 counts the selected bit, K238 counts `flags` 3 twice, K239 zero-based line, K240 `INVALID_VALUE` instead of `SCHEMA`, K241 reads the bit from `form`/`kcls`, K242 skips the last `E`/`N` record, K243 skips the first `N`, K244 skips the first `E`, K245 applies D13 to a directed list only. **24 of 24 killed with every named killer row changing**; the only existing row that changes under any of them is `S01` (the lists of rows G, N, X, Y, O: K237, K238, K241 refuse an existing accepted list, as named in `MUTANTS.tsv` "other changed rows").

**Independence.** Written from design 31 4.7 (D1-D13) and 13.2-13.3 by an oracle author who did not read `packages/display-list/src/read.ts` (or any other `src/` file) before the rows and their expected lines were written; the display-list oracle runner was read only to learn how an `S` row input is dispatched (by form); standard library only, no TypeScript was run. `tools/gen.py` does not know these rows; to rebuild only the additions, restore the corpus from version control and run `python -B -I tools/rev7_dl.py && python -B -I tools/rev7_finish_dl.py`.

**Not covered (recorded in AMBIGUITIES).** A-57 the line number has no field in the `S` grammar (an `expect_line` key was added); A-59 the order of D13 against the whole-list rules D4 and D5 (no row); A-60 where the lists and ids live.
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
assert 'A-57' not in amb and amb.endswith('\n') and not amb.endswith('\n\n')
wr('AMBIGUITIES.md', amb + AMB)
rm = edit(rd('README.md'), README_EDITS)
assert 'Additions for design 31 rule D13' not in rm and rm.endswith('\n') and not rm.endswith('\n\n')
wr('README.md', rm + README_ADD)
s, n = sums()
wr('SHA256SUMS', s)
print('SHA256SUMS files', n, 'digest', hashlib.sha256(s.encode()).hexdigest())
