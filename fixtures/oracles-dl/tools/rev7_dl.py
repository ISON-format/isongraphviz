"""Rows appended to oracles-dl for design 31 rule D13 (4.7, R31-05, ruled 2026-11-22): at most one `E` or `N` record of the
whole list has the focus bit; the second one is `INVALID_INPUT/SCHEMA`, the line number being that of the second one.
Rows S44-S64, mutants K222-K245.  Append-only: new ids only; no existing file is touched except the index files.

Run:  python -B -I tools/rev7_dl.py [CORPUS_DIR]        then   python -B -I tools/rev7_finish_dl.py [CORPUS_DIR]
It is NOT run by tools/gen.py (gen.py does not know the gap, rev 6 or rev 7 rows).  Reference: the strict reader of
tools/dl.py (`parse_dl`, rule "focus", the mutants K222-K245 in `_d13`).

Written from design 31 4.7 (D1-D13) and 13.2/13.3 only; the expected line number of every row is computed here from the
construction of the list (the line of the second record that carries the focus bit), never read back from the reference.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import core  # noqa: E402
import dl as D  # noqa: E402

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(HERE)
NEW = []
SCHEMA = 'INVALID_INPUT/SCHEMA'


def rd(p):
    with open(os.path.join(ROOT, p), 'rb') as f:
        return f.read()


def wr(p, data):
    assert isinstance(data, bytes) and b'\r' not in data
    fp = os.path.join(ROOT, p)
    assert not os.path.exists(fp), 'refusing to overwrite ' + p
    with open(fp, 'wb') as f:
        f.write(data)
    NEW.append(p)


def J(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def cjs(rec):
    return json.dumps(rec, separators=(',', ':'), ensure_ascii=False)


# ------------------------------------------------------------------ the base lists (accepted by S01: they are G05 and O01)
class L:
    """A list as lines (no LF), with the 1-based line of every E and N record by pid."""

    def __init__(self, path):
        self.lines = rd(path).decode('utf-8').split('\n')
        assert self.lines.pop() == ''
        self.at = {}
        for i, l in enumerate(self.lines, 1):
            r = json.loads(l)
            if r[0] in ('E', 'N'):
                self.at[(r[0], r[1])] = i
        assert len(self.at) == sum(1 for l in self.lines if l[:4] in ('["E"', '["N"'))

    def flag(self, kind, pid, fl):
        i = self.at[(kind, pid)]
        r = json.loads(self.lines[i - 1])
        r[2 if kind == 'E' else 3] = fl
        self.lines[i - 1] = cjs(r)
        return self

    def line(self, kind, pid):
        return self.at[(kind, pid)]

    def bytes(self):
        return ('\n'.join(self.lines) + '\n').encode('utf-8')

    def kinds(self):
        return [(k, p) for (k, p) in sorted(self.at, key=lambda x: self.at[x])]


def G05():
    return L('dl/G05.dl')


def O01():
    return L('dl/O01.dl')


def G02():
    return L('dl/G02.dl')


g = G05()
ND = sum(1 for k, p in g.at if k == 'N')
EIDS = sorted(p for k, p in g.at if k == 'E')
assert ND == 20 and EIDS == list(range(21, 21 + len(EIDS)))
E1, E2, ELAST = EIDS[0], EIDS[1], EIDS[-1]

rows = []
BAD = {}       # path -> bytes
EXPECT = {}    # row id -> expected line (rejected) or None (accepted)
PAIR = {}      # row id -> description


def accept(rid, lst, foc, why, path=None):
    for kind, pid, fl in foc:
        lst.flag(kind, pid, fl)
    p = path or 'dl/%s.dl' % rid
    if path is None:
        BAD[p] = lst.bytes()
    EXPECT[rid] = None
    PAIR[rid] = why
    rows.append((rid, 'S', 'core', '', '', p, '', ''))


def two(rid, kind1, pid1, fl1, kind2, pid2, fl2, why, base=G05):
    lst = base()
    for kind, pid, fl in ((kind1, pid1, fl1), (kind2, pid2, fl2)):
        lst.flag(kind, pid, fl)
    p = 'bad/%s.dl' % rid
    line = lst.line(kind2, pid2)
    assert lst.line(kind1, pid1) < line
    BAD[p] = lst.bytes()
    EXPECT[rid] = line
    PAIR[rid] = why
    rows.append((rid, 'S', 'core', '', '', J({'expect_line': line, 'file': p}), '', SCHEMA))


# ---- rejected, single-fault: exactly two focus bits and nothing else wrong; the line is the second record's
two('S44', 'N', 3, 2, 'N', 11, 2, 'two N (flags 2, 2), far apart')
two('S45', 'E', EIDS[4], 2, 'E', EIDS[20], 2, 'two E (flags 2, 2), far apart')
two('S46', 'E', EIDS[9], 2, 'N', 8, 2, 'an E then an N (flags 2, 2), far apart; the second is the N')
two('S47', 'N', 3, 3, 'N', 11, 2, 'two N, flags 3 then 2, far apart')
two('S48', 'N', 4, 2, 'N', 12, 3, 'two N, flags 2 then 3, far apart')
two('S49', 'E', EIDS[12], 3, 'N', 5, 3, 'an E and an N, both flags 3')
two('S50', 'N', 7, 2, 'N', 8, 2, 'two N, adjacent lines')
two('S51', 'E', E1, 2, 'E', E2, 2, 'the first two E, each followed by its A (adjacent E records)')
two('S52', 'E', ELAST, 2, 'N', 1, 2, 'the last E and the first N (the E/N boundary)')

# three focus bits: the error is at the SECOND
lst = G05()
for k, p in (('N', 2), ('N', 9), ('N', 15)):
    lst.flag(k, p, 2)
BAD['bad/S53.dl'] = lst.bytes()
EXPECT['S53'] = lst.line('N', 9)
PAIR['S53'] = 'three N (flags 2); the error is at the second, not the third'
rows.append(('S53', 'S', 'core', '', '', J({'expect_line': EXPECT['S53'], 'file': 'bad/S53.dl'}), '', SCHEMA))
assert lst.line('N', 9) < lst.line('N', 15)

lst = G05()
lst.flag('E', EIDS[3], 3)
lst.flag('E', EIDS[16], 2)
lst.flag('N', 6, 2)
BAD['bad/S54.dl'] = lst.bytes()
EXPECT['S54'] = lst.line('E', EIDS[16])
PAIR['S54'] = 'three, E (flags 3), E (flags 2), N (flags 2): the error is at the second E'
rows.append(('S54', 'S', 'core', '', '', J({'expect_line': EXPECT['S54'], 'file': 'bad/S54.dl'}), '', SCHEMA))

# the second focus is the LAST record of the file (a list without T: O01)
lst = O01()
lst.flag('N', 1, 2)
lst.flag('N', 2, 2)
assert lst.line('N', 2) == len(lst.lines)          # the last line of the file
BAD['bad/S55.dl'] = lst.bytes()
EXPECT['S55'] = len(lst.lines)
PAIR['S55'] = 'the second focus is the last record of the file (O01, no T): N1 and N2 flags 2'
rows.append(('S55', 'S', 'core', '', '', J({'expect_line': EXPECT['S55'], 'file': 'bad/S55.dl'}), '', SCHEMA))

# ---- precedence (declared exceptions to single-fault: two faults, the verdict is the line): D13 is applied after the rules
#      of each record (4.7), so the faulty record's line wins, whether it comes before or after the second focus record
lst = G05()
lst.flag('N', 3, 2)
lst.flag('N', 11, 2)
tpid = 12                                            # a T of a node, after every N
ti = next(i for i, l in enumerate(lst.lines, 1) if l.startswith('["T",%d,' % tpid))
r = json.loads(lst.lines[ti - 1])
r[5] = 'x' * 25                                      # D9: a text of 25 units
lst.lines[ti - 1] = cjs(r)
assert ti > lst.line('N', 20)
BAD['bad/S56.dl'] = lst.bytes()
EXPECT['S56'] = ti
PAIR['S56'] = 'two focus N, then a T of 25 units after them: the T (a per-record rule) is reported, not D13'
rows.append(('S56', 'S', 'core', '', '', J({'expect_line': ti, 'file': 'bad/S56.dl'}), '', SCHEMA))
T56 = ti

lst = G05()
lst.flag('E', E2, 4)                                 # D6: flags 4 on an early E (the verdict of D6 alone)
lst.flag('N', 3, 2)
lst.flag('N', 11, 2)
BAD['bad/S57.dl'] = lst.bytes()
EXPECT['S57'] = lst.line('E', E2)
PAIR['S57'] = 'an E with flags 4 (D6) BEFORE two focus N: the E is reported, not D13'
rows.append(('S57', 'S', 'core', '', '', J({'expect_line': EXPECT['S57'], 'file': 'bad/S57.dl'}), '', SCHEMA))

# ---- controls (accepted)
accept('S58', G05(), [('N', 7, 2)], 'exactly one focus bit, on a node')
accept('S59', G05(), [('E', EIDS[7], 2)], 'exactly one focus bit, on an edge')
accept('S60', G05(), [], 'no focus bit (the list of G05, as it stands)', path='dl/G05.dl')
lst = G05()
for k, p in lst.kinds():
    lst.flag(k, p, 1)
accept('S61', lst, [], 'flags 1 (selected only) on every E and N record: many records, no focus')
accept('S62', G05(), [('N', 9, 3)], 'flags 3 (selected and focused) once, on a node')
lst = G05()
for k, p in lst.kinds():
    lst.flag(k, p, 1)
accept('S63', lst, [('E', EIDS[10], 3)], 'flags 3 once on an edge, flags 1 on every other E and N record')
two_u = G02()
two_u.flag('E', 3, 2)
two_u.flag('E', 4, 2)
BAD['bad/S64.dl'] = two_u.bytes()
EXPECT['S64'] = two_u.line('E', 4)
PAIR['S64'] = 'an undirected list (no A): two E (flags 2, 2), adjacent lines; the second is the loop of form 2'
rows.append(('S64', 'S', 'core', '', '', J({'expect_line': EXPECT['S64'], 'file': 'bad/S64.dl'}), '', SCHEMA))

IDS = sorted(EXPECT, key=lambda x: int(x[1:]))
assert IDS == ['S%d' % n for n in range(44, 65)], IDS
REJ_SF = ['S%d' % n for n in range(44, 56)] + ['S64']          # single-fault
PREC = ['S56', 'S57']                                          # two faults, judged by the line
CTRL = ['S58', 'S59', 'S60', 'S61', 'S62', 'S63']

# ------------------------------------------------------------------ files
for p in sorted(BAD):
    wr(p, BAD[p])


def parse(data, off=frozenset(), **kw):
    try:
        D.parse_dl(data, off=off, **kw)
        return ('ok', 0)
    except D.ReadError as e:
        return (e.tag(), e.line)


def datum(rid):
    row = next(r for r in rows if r[0] == rid)
    inp = row[5]
    path = json.loads(inp)['file'] if inp.startswith('{') else inp
    return rd(path)


# ------------------------------------------------------------------ the reference: every verdict, every single-fault check
core.MUT.clear()
for rid in REJ_SF:
    d = datum(rid)
    assert parse(d) == (SCHEMA, EXPECT[rid]), (rid, parse(d), EXPECT[rid])
    assert parse(d, off={'focus'}) == ('ok', 0), rid                 # single-fault: only D13 is violated
for rid in CTRL:
    assert parse(datum(rid)) == ('ok', 0), rid
# precedence rows: D13 does not decide the line; with the faulty record's rule off it does
d56, d57 = datum('S56'), datum('S57')
assert parse(d56) == (SCHEMA, EXPECT['S56'])
assert parse(d56, off={'focus'}) == (SCHEMA, EXPECT['S56'])                          # D9 alone
assert parse(d56, off={'t_text'}) == (SCHEMA, G05().line('N', 11))
assert parse(d56, off={'t_text', 'focus'}) == ('ok', 0)
assert parse(d57) == (SCHEMA, EXPECT['S57'])
assert parse(d57, off={'focus'}) == (SCHEMA, EXPECT['S57'])                          # D6 alone
assert parse(d57, off={'flags'}) == (SCHEMA, G05().line('N', 11))
assert parse(d57, off={'flags', 'focus'}) == ('ok', 0)
# the second focus record is the second one of the list, whatever its kind: the line is the second one of the SORTED focus records
for rid in REJ_SF:
    d = datum(rid).decode('utf-8').split('\n')
    foc = [i for i, l in enumerate(d[:-1], 1) if json.loads(l)[0] in ('E', 'N') and json.loads(l)[2 if l[2] == 'E' else 3] in (2, 3)]
    assert len(foc) >= 2 and foc[1] == EXPECT[rid], rid
# no existing list of the corpus carries two focus bits (so no existing S01 case changes) and every one is still accepted
import glob  # noqa: E402
for f in sorted(glob.glob(os.path.join(ROOT, 'dl', '*.dl'))):
    b = open(f, 'rb').read()
    lines = b.decode('utf-8').split('\n')[:-1]
    foc = 0
    for l in lines:
        r = json.loads(l)
        if r[0] == 'E' and r[2] in (2, 3) or r[0] == 'N' and r[3] in (2, 3):
            foc += 1
    assert foc <= 1, f
    assert parse(b) == ('ok', 0), f

# ------------------------------------------------------------------ the rows of the existing S family for the matrix
exp = {}
for l in rd('EXPECT.tsv').decode('utf-8').split('\n')[1:]:
    if not l:
        continue
    c = l.split('\t')
    if c[1] == 'S':
        exp[c[0]] = (c[5], c[7])


def old_cases(rid):
    inp, err = exp[rid]
    if inp.startswith('{'):
        o = json.loads(inp)
        cases = [(o['file'], o.get('limits') or {})] + [(a['file'], a.get('limits') or {}) for a in o.get('also', [])]
    else:
        cases = [(inp, {})]
    return cases


def outcome(rid, mut):
    core.MUT.clear()
    if mut:
        core.MUT.add(mut)
    try:
        if rid in EXPECT:
            return [parse(datum(rid))]
        res = []
        for f, lim in old_cases(rid):
            kw = {}
            if 'maxBytes' in lim:
                kw['max_bytes'] = lim['maxBytes']
            if 'maxLineUnits' in lim:
                kw['max_line'] = lim['maxLineUnits']
            res.append(parse(rd(f), **kw)[0])
        return res
    finally:
        core.MUT.clear()


OLD = sorted((r for r in exp), key=lambda x: int(x[1:]))
for rid in OLD:                                      # the unmutated reference still gives every existing S verdict
    got = outcome(rid, None)
    if rid == 'S01':
        assert got == ['ok'] * len(got), rid
    elif exp[rid][1]:
        assert got == [exp[rid][1]], (rid, got)
    else:
        assert got == ['ok'], rid

MUTANTS = [
    ('K222', 'reader has no focus rule (D13 absent: several focus bits accepted)', REJ_SF),
    ('K223', 'reader counts the focus bit on N records only (an E with the bit is not counted)', ['S45', 'S46', 'S49', 'S51', 'S52', 'S54', 'S64']),
    ('K224', 'reader counts the focus bit on E records only (an N with the bit is not counted)', ['S44', 'S46', 'S47', 'S48', 'S49', 'S50', 'S52', 'S53', 'S55']),
    ('K225', 'reader counts the focus bit only when `flags` is 2 (a record with flags 3 is not counted)', ['S47', 'S48', 'S49', 'S54']),
    ('K226', 'reader counts the focus bit only when `flags` is 3 (a record with flags 2 is not counted)', ['S44', 'S45', 'S46', 'S47', 'S48', 'S50', 'S51', 'S52', 'S53', 'S54', 'S55', 'S64']),
    ('K227', 'reader allows two focus bits (refuses at the third; with exactly two the list is accepted)', REJ_SF),
    ('K228', 'reader reports the line of the first record with the focus bit instead of the second', REJ_SF),
    ('K229', 'reader reports the line of the last record with the focus bit (the third of three)', ['S53', 'S54']),
    ('K230', 'D13 is applied before the rules of the records (an earlier faulty record is not the one reported)', ['S56', 'S57']),
    ('K231', 'D13 is applied while the records are read (a faulty record after the second focus record is not reached)', ['S56']),
    ('K232', 'reader allows one focus E and one focus N (at most one per kind)', ['S46', 'S49', 'S52']),
    ('K233', 'reader refuses a second focus record only when the first was an N (an E first: two foci accepted)', ['S45', 'S46', 'S49', 'S51', 'S52', 'S54', 'S64']),
    ('K234', 'reader refuses a second focus record only when the first was an E (an N first: two foci accepted)', ['S44', 'S47', 'S48', 'S50', 'S53', 'S55']),
    ('K235', 'reader compares each E or N record with the previous E or N record only (two focus records that are not neighbours are accepted)', ['S44', 'S45', 'S46', 'S47', 'S48', 'S49', 'S53', 'S54']),
    ('K236', 'reader compares each record with the previous line only (an A between two E records hides the first)', ['S45', 'S46', 'S47', 'S48', 'S49', 'S51', 'S52', 'S54', 'S44', 'S53']),
    ('K237', 'reader counts the selected bit (`flags` 1 or 3) instead of the focus bit', ['S44', 'S45', 'S46', 'S61', 'S63']),
    ('K238', 'reader counts a record with flags 3 twice (one record with flags 3 is refused)', ['S62', 'S63', 'S49', 'S47']),
    ('K239', 'reader reports the line number of the second focus record minus one (a zero-based line)', REJ_SF),
    ('K240', 'the D13 error is `INVALID_INPUT/INVALID_VALUE` instead of `SCHEMA`', REJ_SF),
    ('K241', 'reader reads the focus bit of an E from `form` and of an N from `kcls` (the wrong field)', ['S60', 'S61', 'S01']),
    ('K242', 'reader does not examine the last E or N record of the list', ['S55']),
    ('K243', 'reader does not examine the first N record', ['S52']),
    ('K244', 'reader does not examine the first E record', ['S51']),
    ('K245', 'reader applies D13 to a directed list only (an undirected list with two focus records is accepted)', ['S64']),
]


def key(x):
    return (x[0], int(x[1:]))


NEWROWS = IDS
ALLROWS = OLD + NEWROWS
base = {r: outcome(r, None) for r in ALLROWS}
mut_lines, RES = [], {}
for k, desc, named in MUTANTS:
    chg = sorted({r for r in ALLROWS if outcome(r, k) != base[r]}, key=key)
    named = sorted(set(named), key=key)
    kill = [n for n in named if n in chg]
    miss = [n for n in named if n not in chg]
    other = [c for c in chg if c not in named]
    verdict = 'killed' if kill and not miss else 'NOT KILLED'
    mut_lines.append('\t'.join([k, desc, ','.join(named), ','.join(kill), ','.join(miss), ','.join(other), verdict]))
    RES[k] = {'named': named, 'kill': kill, 'miss': miss, 'other': other, 'verdict': verdict}
    assert verdict == 'killed', (k, RES[k])

# the old rows that change under a mutant are only S01 (the lists) and none of the other existing rows
for k, v in RES.items():
    assert all(c in NEWROWS or c == 'S01' for c in v['other']), (k, v['other'])

for k, desc, named in MUTANTS:
    rows.append((k, 'K', '', '', '', '', '', ''))

# ------------------------------------------------------------------ EXPECT.tsv and MUTANTS.tsv (append only)


def append(p, text):
    fp = os.path.join(ROOT, p)
    with open(fp, 'rb') as f:
        old = f.read()
    assert old.endswith(b'\n') and b'\r' not in text.encode('utf-8')
    with open(fp, 'wb') as f:
        f.write(old + text.encode('utf-8'))


have = rd('EXPECT.tsv').decode('utf-8')
for r in rows:
    assert ('\n' + r[0] + '\t') not in have, r[0]
nonk = sorted((r for r in rows if r[1] != 'K'), key=lambda r: int(r[0][1:]))
append('EXPECT.tsv', ''.join('\t'.join(r) + '\n' for r in nonk + [r for r in rows if r[1] == 'K']))
append('MUTANTS.tsv', '\n'.join(mut_lines) + '\n')

if os.environ.get('REV7_OUT'):
    with open(os.environ['REV7_OUT'], 'w') as f:
        json.dump({'new_files': NEW, 'rows': [r[0] for r in rows], 'mutants': RES, 'pairs': PAIR,
                   'lines': {k: v for k, v in EXPECT.items()}}, f, indent=1, sort_keys=True)
        f.write('\n')
print('new files', len(NEW), 'rows', len(rows), 'mutants', len(MUTANTS))
for k, v in RES.items():
    print(k, v['verdict'], 'killers', v['kill'], 'other', v['other'])
