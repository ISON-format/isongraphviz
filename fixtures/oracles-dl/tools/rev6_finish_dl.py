"""Second step of the oracles-dl rev 6 additions: AMBIGUITIES.md (append), README.md (counts, a revision note and one
appended section) and SHA256SUMS (regenerated over the whole corpus).
Run after tools/rev6_dl.py:  python -B -I tools/rev6_finish_dl.py [DIR]
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
## A-53  6.6 (rev 6): "markers for more than one pid" versus "the count is of markers"; a pid in layers 2 and 6; the same pid twice in a layer (no row)

* **Design text.** 6.6: "layers 2 and 6 together holding at most one pid" and, in the reader rules, "markers for more than one pid" (change log R31-02) next to "The focus count is of **markers** in layers 2 and 6" (R31-03, R31-04); 6.6 also says the pids of a layer are "ascending", 9.3 "strictly ascending".
* **Literal reading used.** Every verdict that the two wordings could separate is rejected by another rule, so no row separates them. A pid that appears in both layers 2 and 6 is a node pid in layer 2 or an edge pid in layer 6 and is refused by the kind check (R31-04); the same pid twice in one layer is refused by the strict ascent of 9.3 and by the count of markers. A row for either stream would be **overdetermined** (two rules reject it, so it cannot be single-fault) and is not written. The count rows (R45-R48, R61, R62) use two **different** pids of the right kinds, where "pids" and "markers" agree.
* **Why / status.** Reading, no verdict is affected. If the owner meant "distinct pids" for the count and a non-strict ascent for 6.6, the same-pid stream would be accepted; the text of 9.3 ("strictly") and of 6.6 ("count is of markers") excludes that.

## A-54  6.6, 9.3 (rev 6): the stream reader's relation to the list beyond the table (no row)

* **Design text.** `canvasStreamWitness(stream, list)` and `readoutFromCanvasStream(stream, list)` read the stream "with a strict reader"; the reader rules name the table (a pid "in the table"), the kind of the pid and the focus count; 9.3 says "addresses by pid through the list's table".
* **Literal reading used.** The list is used for the table (and so for the number of nodes `ND`, which decides the kind of a pid) and nothing else: the reader does not check a layer-5 or layer-6 marker against the `flags` of the list, a layer-8 marker against the list's `T` records, or the painting of a layer against the list. A stream that marks an element the list does not mark is not checked by the reader (it is a mismatch, found by `compareReadouts` against the other backends, 9.5).
* **Why / status.** Reading; nothing is written because the text states no such check. Recorded because the kind rule makes a reader that needs `ND` from the list the first place where the list is more than a table of addresses.

## A-55  9.3 against 6.6 (rev 6): where the kind rule is stated

* **Design text.** 9.3 says "A pid outside the table, or a node pid in an edge layer, is `INVALID_INPUT/SCHEMA`" in the sentence that reads the **plan** (`readoutFromGl`), and names no kind rule for an **edge pid in a node layer** or for the stream in that paragraph; its stream sentences say only "canonical lines, markers non-decreasing in layer and pids strictly ascending within a layer". The complete rule (layers 1-4 edge pids, 5-7 node pids, 8 either) is in 6.6 "Reader rules".
* **Literal reading used.** 6.6 is the rule of the stream reader and 9.3 is not read as narrowing it: both directions are checked for the stream (rows R52-R55 a node pid in an edge layer, R56-R58 an edge pid in a node layer). Layer 8 takes both kinds (the existing `R16` and `C01` carry an edge label and node labels in layer 8).
* **Why / status.** Editorial: a reader of 9.3 alone would not find the edge-pid-in-a-node-layer direction. No verdict is affected.

## A-56  6.6 (rev 6): the unpainted wrong-kind marker (rows R59, R60, U20)

* **Design text.** "The reader checks the kind of **every** marker pid against its layer" (R31-04), "the focus count is of markers ... whether or not painting calls follow" (R31-03); 9.3: "a marker without painting calls contributes nothing" (R44).
* **Literal reading used.** The kind check is structural like the count: it applies to a marker whether or not painting calls follow, so a layer-5 marker for the edge pid 3 (R59) and a layer-4 marker for the node pid 2 (R60), neither with a painting call, are rejected. The sentence "contributes nothing" is about the **readout** (what is drawn, marked, an arrow, a label), not about the reader's structural stage.
* **Why / status.** Reading from "every marker pid"; the opposite reading (kind checked on painted sections only) is the mutant K209, killed by R59, R60 and U20.

## Resolved in rev 6 (disposition of earlier entries; the entries above are unchanged)

Source: design 31 rev 6, change log "Rev 5 -> rev 6 (owner-adopted wording)", sections 6.6, 9.3, 4.7. Rev 6 is text only: no Appendix byte, no row or mutant id changes. "Matched" means the rev 6 text says what the literal reading of the entry used; no existing expected byte changes.

| Entry | Rev 6 item | Disposition | Rows and mutants |
|---|---|---|---|
| A-45 (a stream with more than one focused element; the count is over markers) | R31-02, R31-03 | RESOLVED, reading matched: the count is of markers, painted or not | R45-R48, U15, U16 (existing); R61, R62 (new, complements); K188-K195, K218, K219 |
| A-46 (the single-focus rule has no row and no mutant) | R31-01, R31-02 | RESOLVED: the rows and mutants of the rev 5 gap review carry it; the rev 6 change log says new rows were still needed for R31-02 and R31-04, written here | Y18-Y20, K197-K200 (R31-01); R45-R48, U15, U16, K188-K196 (R31-02); R52-R63, U18-U21, K201-K221 (new) |
| A-47 (a state cannot name two focused elements) | R31-01 | RESOLVED, reading matched (`INVALID_STATE/SCHEMA`, 27 4.2 (iii)) | Y18, Y19, Y20 |
| A-48 (error code of a rejected stream) | R31-02, R31-04 | RESOLVED, reading matched: `INVALID_INPUT/SCHEMA` is now stated | all stream rows with an error |
| A-49 (markers or painted sections) | R31-03 | RESOLVED, reading matched: markers, painted or not; a lone marker is accepted and contributes no focus | R44, R48, R49, K191 (existing); R61, R62, R63, U21, K218-K221 (complements) |
| A-50 (a pid in layers 2 and 6; a node pid in layer 2) | R31-04 | RESOLVED, no longer underspecified: the reader checks the kind of every marker pid against its layer, so a node pid in layer 2 is `INVALID_INPUT/SCHEMA`; a pid in both layers 2 and 6 is always rejected by the kind check (A-53) | R52-R60, U18-U20, K201-K217 |
| A-51 (the list reader has no focus rule) | R31-05 | OPEN, not folded by rev 6 ("a focus rule D13 in the list reader; needs code"); no row written | none |
| A-52 (where the list of a stream row comes from) | R31-06 | OPEN, not folded by rev 6 (13.2); the reading of A-52 is kept for the new rows R52-R63 and U18-U21 | none |

Not touched (gl-only or open, no row written): R31-07, R31-08, R31-09, R31-10, R31-11 (a) and (b) (V7 plan, controller and logs: `oracles-gl`); R31-11 (c) and R30-31-01 (open, undecided).
"""

# ------------------------------------------------------------------ README.md
README_EDITS = [
    ('Status: **DRAFT** (not frozen; no digest is pinned).',
     'Status: **DRAFT** (not frozen; no digest is pinned). Revision note: design 31 is now rev 6 (text only: rules R31-01 to R31-04 for this corpus, owner-adopted); 37 rows and mutants were appended for it, see the last section.'),
    ('**458 rows** (432 of the rev 5 generation and the 26 gap rows of the last section)',
     '**495 rows** (432 of the rev 5 generation, the 26 gap rows and the 37 rows of the rev 6 section)'),
    ('| R | 51 | 13 | readouts |', '| R | 63 | 24 | readouts |'),
    ('| U | 17 | 2 | the Canvas renderer (lifecycle scripts, outcome files; U15-U17 witness rows) |',
     '| U | 21 | 5 | the Canvas renderer (lifecycle scripts, outcome files; U15-U21 witness rows) |'),
    ('| K | 206 | 0 | mutants (empty cells) |', '| K | 227 | 0 | mutants (empty cells) |'),
    ('| **total** | **458** | **88** | D and K rows (212) have empty cells by design;',
     '| **total** | **495** | **102** | D and K rows (233) have empty cells by design;'),
    ('Read `AMBIGUITIES.md` (52 entries, A-47 to A-52 added after the gap review)',
     'Read `AMBIGUITIES.md` (56 entries, A-47 to A-52 added after the gap review, A-53 to A-56 and a rev 6 disposition section after design 31 rev 6)'),
]

README_ADD = """
## Additions for design 31 rev 6 (stream reader rules R31-02 to R31-04; rows R52-R63, U18-U21, K201-K221)

Design 31 rev 6 (2026-11-20, text only: no Appendix byte, no row or mutant id changes) folded owner-adopted wording; four of its items concern this corpus. These 37 ids were **appended** (new ids; no existing expected byte or row changed; the only existing files that differ are `EXPECT.tsv` and `MUTANTS.tsv` (appended lines), `AMBIGUITIES.md` (appended entries A-53 to A-56 and a disposition section), this README (counts, a revision note and this section) and `SHA256SUMS`). The digest of `SHA256SUMS` is in the hand-over report, not here, because this file is covered by it.

| Rev 6 rule | Carried by (existing rows, verified against this corpus) | New rows (this addition) |
|---|---|---|
| R31-01 a state with two foci is `INVALID_STATE/SCHEMA`; a list from a valid state has at most one focus | Y18 (both keys), Y19 (array), Y20 (one focus bit whatever else is selected); K197-K200 | none needed |
| R31-02 markers for more than one pid in layers 2 and 6 together: `INVALID_INPUT/SCHEMA`, from the one reader of `readoutFromCanvasStream` and `canvasStreamWitness` | R45 (two nodes, layer 6), R46 (two edges, layer 2), R47 (edge in layer 2 + node in layer 6), R48 (unpainted layer 2 + painted layer 6), U15, U16 (witness); K188-K195 | R61 (painted layer 2 + unpainted layer 6), R62 (both unpainted). The same layer twice and a pid in both layers are overdetermined and have no row (A-53) |
| R31-03 the count is of markers, painted or not; a lone marker is accepted and contributes no focus | R44, R48, R49, K191 | R63 (a lone unpainted layer-2 marker: accepted, readout equal to R01's and R49's), U21 (the witness of the R63 stream equals the C01 witness) |
| R31-04 the kind of every marker pid against its layer (1-4 edge pids, 5-7 node pids, 8 either); wrong kind `INVALID_INPUT/SCHEMA`; the count is of markers | layer 8 takes both kinds: R16, U09 (the C01 stream has node labels and an edge label in layer 8) | R52 (node pid 2 in layer 1), R53 (node pid 1 in layer 2), R54 (node pid 2 in layer 3), R55 (node pid 1 in layer 4), R56 (edge pid 3 in layer 5), R57 (edge pid 3 in layer 6), R58 (edge pid 3 in layer 7), R59 (unpainted edge pid 3 in layer 5), R60 (unpainted node pid 2 in layer 4), U18 (witness of R52), U19 (witness of R56), U20 (witness of R59) |
| mutants | K188-K200 | K201-K207 (kind not checked in one layer, per layer 1..7), K208 (no kind check), K209 (painted sections only), K210, K211 (layer 8 one kind only), K212 (groups swapped), K213, K214 (the node/edge boundary off by one), K215 (wrong error class), K216, K217 (the rule at one call site only), K218, K219 (count partly by painted sections), K220, K221 (a lone unpainted focus marker refused) |

Every rejected stream is **single-fault**: a kind row (R52-R60) is accepted by the reference with only the kind check disabled and is rejected with only the count disabled (the kind check alone rejects it); a count row (R61, R62) is accepted with only the count disabled and rejected with only the kind check disabled; with both disabled every new stream passes every other rule of the strict reader (asserted by `tools/rev6_dl.py`). R63 is accepted. Rows R52-R63 are streams of the list `G01` (the scene and layout cells are G01's, as for R45) derived from the recorded replay by one marker edit each; `calls/R52.calls` ... `calls/R63.calls`, `xr/R63.xr.json`, `json/U21.witness.json` are the files.

The new reference (`tools/rev6_dlref.py`: the strict reader with the kind check, the readout and the witness) first reproduces every existing expected result of the stream rows (R16, R39-R44, R49-R51, U09 (two cases), U17) and the verdicts of R45-R48, U15, U16 (the existing rejected streams are rejected by the count alone and none has a wrong-kind marker); every accepted stream that a row reads (R16, R39-R44, R49-R51, U09, U17) passes the kind check. **Mutant matrix of K201-K221:** the mutants touch the stream reader, the readout and the witness only, so each was run over the new rows and over the existing rows that call them (R16, R39-R51, U09 (two cases), U15-U17); 21 of 21 killed with every named row changing. K213 and K214 (the boundary) are killed by `R16` (and other accepted streams) only: a wrong-kind stream also holds right-kind markers of the same pids, so a boundary fault is rejected anyway on every new row.

**Independence.** Written from design 31 rev 6 (4.1, 4.3, 4.8, 6.2, 6.3, 6.6, 9.1, 9.3) by an oracle author who read only the design files named for the task, the corpus itself and the frozen fixtures, and did not read, import or run any TypeScript or `packages/*`; standard library only. `tools/gen.py` does not know these rows. To rebuild only the additions, restore the corpus from version control and run `python -B -I tools/rev6_dl.py && python -B -I tools/rev6_finish_dl.py` (after the gap review scripts).

**Not covered (recorded in AMBIGUITIES).** R31-05 (a list reader focus rule D13) and R31-06 (where a stream row's list comes from) are open in the design (A-51, A-52); R31-07 to R31-11 and R30-31-01 are gl-only or open. A-53 (the same pid twice or a pid in layers 2 and 6 is overdetermined), A-54 (the reader uses the list for the table only), A-55 (the kind rule is stated fully in 6.6, partly in 9.3), A-56 (the unpainted wrong-kind marker is a reading of "every marker").
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
assert 'A-53' not in amb and amb.endswith('\n') and not amb.endswith('\n\n')
wr('AMBIGUITIES.md', amb + AMB)
rm = edit(rd('README.md'), README_EDITS)
assert 'Additions for design 31 rev 6' not in rm and rm.endswith('\n') and not rm.endswith('\n\n')
wr('README.md', rm + README_ADD)
s, n = sums()
wr('SHA256SUMS', s)
print('SHA256SUMS files', n, 'digest', hashlib.sha256(s.encode()).hexdigest())
