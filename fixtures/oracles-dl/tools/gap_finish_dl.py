"""Second step of the oracles-dl gap additions: AMBIGUITIES.md (append), README.md (counts and one appended section) and
SHA256SUMS (regenerated over the whole corpus).  Run after tools/gap_dl.py:  python -B -I tools/gap_finish_dl.py [DIR]
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


# ------------------------------------------------------------------ AMBIGUITIES.md
AMB = """
## A-47  27 4.2 (iii), 31 4.5 (4), 9.3: a state cannot name two focused elements (rows Y18, Y19)

* **Design text.** 31 9.3: "a list has at most one [focused element] by construction"; 4.5 (4): the builder validates the state with `serializeState`; 27 4.2 (iii): `focus`, when present, is an object with **exactly one** key, `node` or `edge` ("both keys or none: `SCHEMA`"); a wrong JSON type (an array) is `SCHEMA`.
* **Literal reading used.** Two states that name two foci, `{"focus":{"edge":..,"node":..}}` (Y18) and `{"focus":[{"node":..},{"node":..}]}` (Y19), are refused by the builder with `INVALID_STATE/SCHEMA`; a runner that loads the file with `parseState` or with plain JSON gets the same code, so (unlike Y14 and Y15) the loading mode does not matter. The code comes from 27, not from 31.
* **Why / status.** Reading. The rows exist because 31 rev 5 says the guarantee is "by construction": the construction is the closed state shape. Row Y20 (everything selected, one focus; `also` case for the other kind) shows that the builder sets the focus bit on exactly one record whatever else is selected.

## A-48  6.6, 9.3: the error code of a stream rejected for two foci (rows R45-R48, U15, U16)

* **Design text.** 6.6 and 9.3 say the stream "is rejected" (and 9.3 that the reader is strict) but give no code; 4.6 lists `INVALID_INPUT` with `SCHEMA` among the classes of a malformed byte form and 4.7 gives `INVALID_INPUT/SCHEMA` to the list reader.
* **Literal reading used.** `INVALID_INPUT/SCHEMA`, the same as A-45 and the same for `readoutFromCanvasStream` and `canvasStreamWitness` (both go through the one reader; K194 and K195 are the mutants that give the rule to one call site only).
* **Why / status.** Reading by analogy with 4.7; no sentence of the design pins the code of the stream reader.

## A-49  6.6 (rev 5): do markers count, or painted sections? (row R48, mutant K191; row R49)

* **Design text.** "markers ... and layers 2 and 6 together holding at most one pid" (6.6, inside the list of conditions of the markers); 9.3: "a stream whose layers 2 and 6 hold more than one pid is rejected by the stream reader"; 9.3 also: "a marker without painting calls contributes nothing" (R44).
* **Literal reading used.** The rule counts the **markers** of layers 2 and 6 (A-45), painted or not: R48 (an unpainted layer-2 marker plus a painted layer-6 marker) is rejected. A lone unpainted layer-2 or layer-6 marker is accepted and contributes no focus (R49: the readout equals R01). The two sentences are compatible with the other reading too ("hold" = painted); then R48 would be accepted with the layer-6 focus and K191 would be the correct behaviour.
* **Why / status.** Reading, recorded so the owner can rule; the row is single-fault under the stated reading only.

## A-50  6.6: a pid in both layers 2 and 6, a node pid in layer 2 (no row)

* **Design text.** "layers 2 and 6 together holding at most one pid"; the reader checks that every marker pid is in the table and that layers are non-decreasing; it has no rule that ties layers 1-4 to edge pids and 5-8 to node pids (that check is stated for the plan, 9.3 last sentences).
* **Literal reading used.** Not covered: a stream that puts one pid in layers 2 and 6 holds one pid (accepted by the count), and a node pid in layer 2 has no stated verdict. No row was written; a row would encode a guess.
* **Why / status.** Underspecified; recorded for completeness.

## A-51  4.7 D1-D12 versus "every artifact": the list reader has no focus rule (no row)

* **Design text.** The change log (rev 5, M-9) says "At most one element is focused in every artifact: G12 gains ..., the stream reader likewise (6.6)"; 9.3 says "a list has at most one by construction". 4.7 D6 and D8 allow `flags` 0..3 on every `E` and `N` and no rule counts them.
* **Literal reading used.** `parseDisplayList` accepts a list in which several records carry the focus bit (flags 2 or 3); `readoutFromList` of such a list is not specified. No S row was written (neither "accepted" nor "rejected" is derivable without choosing).
* **Why / status.** FINDING (design): either D-rules gain a clause (a new rule D13 with a single-fault `S` row) or the exemption of the list reader is stated. Until then only the builder (Y18-Y20) and the stream reader (R45-R51, U15-U17) are covered.

## A-52  13.2: where the list of a stream row comes from (rows R45-R51, U15-U17)

* **Design text.** 13.2 gives the grammar `{"from":"calls","calls":path}` for R rows ("the stream with the row's list") and for U rows nothing but "scripts"; U09 has empty scene and layout cells.
* **Literal reading used.** The new R and U rows carry the scene and layout of the list whose table the stream refers to (G01's for R45, R47-R50, U15-U17; the `loops2` one for R46 and R51), initial state; the reader needs only the table and the header hashes. The rows U15-U17 take `{"calls":"calls/Rnn.calls"}` like U09 but with the scene and layout cells filled so that the list is not implicit.
* **Why / status.** Reading; if a runner cannot resolve the list of a U row from the cells it is a runner matter, not a design one.
"""

DL_README_EDITS = [
    ('**432 rows**', '**458 rows** (432 of the rev 5 generation and the 26 gap rows of the last section)'),
    ('| Y | 17 | 2 | state hooks |', '| Y | 20 | 4 | state hooks |'),
    ('| R | 44 | 9 | readouts |', '| R | 51 | 13 | readouts |'),
    ('| U | 14 | 0 | the Canvas renderer (lifecycle scripts, outcome files) |',
     '| U | 17 | 2 | the Canvas renderer (lifecycle scripts, outcome files; U15-U17 witness rows) |'),
    ('| K | 193 | 0 | mutants (empty cells) |', '| K | 206 | 0 | mutants (empty cells) |'),
    ('| **total** | **432** | **80** | D and K rows (199) have empty cells by design;',
     '| **total** | **458** | **88** | D and K rows (212) have empty cells by design;'),
    ('Read `AMBIGUITIES.md` (46 entries)', 'Read `AMBIGUITIES.md` (52 entries, A-47 to A-52 added after the gap review)'),
]

README_ADD = """
## Additions after the rev 5 gap review (single-focus clause; rows R45-R51, U15-U17, Y18-Y20, K188-K200)

The ledger note `dl A-46` (AMBIGUITIES) recorded that rev 5 added "at most one element is focused" with no row and no mutant. These 26 rows were **appended** (ids are new; no existing expected byte or row changed; the only existing files that differ are `EXPECT.tsv` and `MUTANTS.tsv` (appended lines), `AMBIGUITIES.md` (appended entries A-47 to A-52), this README (counts and this section) and `SHA256SUMS`).

| Rows | What | Files |
|---|---|---|
| R45 | stream with two layer-6 markers (nodes 1 and 2): `INVALID_INPUT/SCHEMA` | `calls/R45.calls` |
| R46 | stream of `loops2` with two layer-2 markers (loops 3 and 4): rejected | `calls/R46.calls` |
| R47 | one layer-2 marker (edge 3) and one layer-6 marker (node 1): rejected (the count is over both layers together) | `calls/R47.calls` |
| R48 | an unpainted layer-2 marker plus a painted layer-6 marker: rejected (A-49) | `calls/R48.calls` |
| R49 | a lone layer-6 marker without painting calls: accepted, no focus, readout equal to R01's | `calls/R49.calls`, `xr/R49.xr.json` |
| R50 | nodes 1, 2 and edge 3 selected, node 2 also focused (selection is not focus): accepted | `calls/R50.calls`, `xr/R50.xr.json` |
| R51 | `loops2`: node 1, edges 3, 5 selected, edge 4 selected and focused: accepted | `calls/R51.calls`, `xr/R51.xr.json` |
| U15, U16 | `canvasStreamWitness` of the R45 and the R47 streams: rejected (the witness goes through the same reader) | (the R streams) |
| U17 | `canvasStreamWitness` of the R50 stream: accepted, equals the C01 witness | `json/U17.witness.json` |
| Y18 | state with `focus` naming both a node and an edge: `INVALID_STATE/SCHEMA` | `states/Y18.state.json` |
| Y19 | state with `focus` an array of two nodes: `INVALID_STATE/SCHEMA` | `states/Y19.state.json` |
| Y20 | `mixed20`, every element selected plus one focus (an edge; `also` case a node): the focus bit on exactly one record | `states/Y20.state.json`, `states/Y20b.state.json`, `dl/Y20.dl`, `dl/Y20b.dl` |
| K188-K200 | 13 mutants of the single-focus rule, the stream readers and the builder (MUTANTS.tsv); all killed by the named rows | |

Every rejected stream is **single-fault** (accepted by the reference with only the single-focus clause disabled; asserted by the generator). The reference reproduces the existing expected bytes of C01, C02, C04, C19 and R16, R39-R44, U09 before it writes anything.

**Independence of these rows.** Written from design 31 rev 5 (4.1, 4.2, 4.8, 4.9, 6.1-6.3, 6.6, 9.1, 9.3) and 27 4.2 by a separate oracle author who did not read, import or run any TypeScript or `packages/*/src`, and did not read the generator of this corpus; the reference logic is `tools/gap_dlref.py` (replay, strict stream reader, readout, witness, flag derivation) and `tools/gap_dl.py`, `tools/gap_finish_dl.py` (standard library only). `tools/gen.py` does not know these rows: running it removes them. To rebuild only the additions, restore the corpus from version control and run `python -B -I tools/gap_dl.py && python -B -I tools/gap_finish_dl.py`.

**Mutant matrix of K188-K200.** The mutants touch the stream reader, the readouts, the witness, the state check and the focus flags only, so each was run over the new rows and over the existing rows that call those functions (R16, R39-R44, U09's two cases); the other existing rows cannot change. Result: 13 of 13 killed with every named row changing. K192 (the selection layers counted with the focus layers) also changes the existing R39, R40 and U09.

**Not covered (recorded in AMBIGUITIES).** A-50 (a pid in layers 2 and 6; a node pid in layer 2), A-51 (the list reader has no focus rule although the change log says "every artifact"), A-49 (markers versus painted sections is a reading).
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
assert 'A-47' not in amb and amb.endswith('\n') and not amb.endswith('\n\n')
wr('AMBIGUITIES.md', amb + AMB)
rm = edit(rd('README.md'), DL_README_EDITS)
assert 'Additions after the rev 5 gap review' not in rm and rm.endswith('\n') and not rm.endswith('\n\n')
wr('README.md', rm + README_ADD)
s, n = sums()
wr('SHA256SUMS', s)
print('SHA256SUMS files', n, 'digest', hashlib.sha256(s.encode()).hexdigest())
