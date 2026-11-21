"""Rows appended to oracles-dl for design 31 rev 6 (6.6 "Reader rules", 9.3): R31-02 and R31-04 (new rows), R31-03
(complements).  Append-only: new ids only, no existing file is touched except the index files.

Run:  python -B -I tools/rev6_dl.py [CORPUS_DIR]        then   python -B -I tools/rev6_finish_dl.py [CORPUS_DIR]
It is NOT run by tools/gen.py (gen.py does not know the gap or the rev 6 rows).  Reference: tools/rev6_dlref.py.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rev6_dlref as R  # noqa: E402

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(HERE)
NEW = []


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


def dlist(p):
    return R.DList(rd(p).decode('utf-8'))


G01 = dlist('dl/G01.dl')
assert (G01.ND, G01.ED) == (2, 1)          # pids: nodes 1, 2; the edge is pid 3
S_O1, L_F01 = '../oracles/o1-basic.scene.json', '../oracles-igl/layouts/F01.layout.json'

rows = []


def row(i, tier, scene, layout, inp, expected, error):
    rows.append((i, i[0], tier, scene, layout, inp, expected, error))


def J(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def insert_before(stream, marker, new):
    ls = stream.split('\n')
    assert ls.count(marker) == 1, marker
    k = ls.index(marker)
    return '\n'.join(ls[:k] + [new] + ls[k:])


def swap_marker(stream, old, new):
    ls = stream.split('\n')
    assert ls.count(old) == 1, old
    ls[ls.index(old)] = new
    return '\n'.join(ls)


BASE = R.replay(G01)
# ------------------------------------------------------------------ streams (the reader is given the list G01)
STREAMS = {
    # R31-04, a wrong-kind marker that is painted, one per layer 1..7 (boundary pids 2 = ND and 3 = ND + 1 where possible)
    'R52': swap_marker(R.replay(G01.with_flags({3: 1})), '["#",3,1]', '["#",2,1]'),    # node pid in layer 1
    'R53': swap_marker(R.replay(G01.with_flags({3: 2})), '["#",3,2]', '["#",1,2]'),    # node pid in layer 2 (lone)
    'R54': swap_marker(BASE, '["#",3,3]', '["#",2,3]'),                                # node pid in layer 3
    'R55': swap_marker(BASE, '["#",3,4]', '["#",1,4]'),                                # node pid in layer 4
    'R56': swap_marker(R.replay(G01.with_flags({1: 1})), '["#",1,5]', '["#",3,5]'),    # edge pid in layer 5
    'R57': swap_marker(R.replay(G01.with_flags({1: 2})), '["#",1,6]', '["#",3,6]'),    # edge pid in layer 6 (lone)
    'R58': swap_marker(BASE, '["#",2,7]', '["#",3,7]'),                                # edge pid in layer 7
    # R31-04, "every marker": the wrong-kind marker has no painting call
    'R59': insert_before(BASE, '["#",1,7]', '["#",3,5]'),                              # edge pid, layer 5, unpainted
    'R60': insert_before(BASE, '["#",3,4]', '["#",2,4]'),                              # node pid, layer 4, unpainted
    # R31-02 / R31-03: the count is of markers of layers 2 and 6 together
    'R61': insert_before(R.replay(G01.with_flags({3: 2})), '["#",1,7]', '["#",1,6]'),  # painted L2 + unpainted L6
    'R62': insert_before(insert_before(BASE, '["#",3,3]', '["#",3,2]'), '["#",1,7]', '["#",1,6]'),  # both unpainted
    'R63': insert_before(BASE, '["#",3,3]', '["#",3,2]'),                              # a lone unpainted L2 marker
}
REJECT = ['R52', 'R53', 'R54', 'R55', 'R56', 'R57', 'R58', 'R59', 'R60', 'R61', 'R62']
ACCEPT = ['R63']
KIND_ROWS = REJECT[:9]
COUNT_ROWS = ['R61', 'R62']

# the markers of the new streams are what the row says (checked, so the names above cannot drift)
def markers(s):
    return [(int(l.split(',')[1]), int(l.split(',')[2][:-1])) for l in s.split('\n') if l.startswith('["#"')]


assert [m for m in markers(STREAMS['R52']) if m[1] == 1] == [(2, 1)]
assert [m for m in markers(STREAMS['R53']) if m[1] == 2] == [(1, 2)]
assert [m for m in markers(STREAMS['R54']) if m[1] == 3] == [(2, 3)]
assert [m for m in markers(STREAMS['R55']) if m[1] == 4] == [(1, 4)]
assert [m for m in markers(STREAMS['R56']) if m[1] == 5] == [(3, 5)]
assert [m for m in markers(STREAMS['R57']) if m[1] == 6] == [(3, 6)]
assert [m for m in markers(STREAMS['R58']) if m[1] == 7] == [(1, 7), (3, 7)]
assert [m for m in markers(STREAMS['R59']) if m[1] == 5] == [(3, 5)]
assert [m for m in markers(STREAMS['R60']) if m[1] == 4] == [(2, 4), (3, 4)]
assert [m for m in markers(STREAMS['R61']) if m[1] in (2, 6)] == [(3, 2), (1, 6)]
assert [m for m in markers(STREAMS['R62']) if m[1] in (2, 6)] == [(3, 2), (1, 6)]
assert [m for m in markers(STREAMS['R63']) if m[1] in (2, 6)] == [(3, 2)]


def accepts(s, **kw):
    try:
        R.read_stream(s.encode(), G01, **kw)
        return True
    except R.Reject as e:
        assert e.code == 'INVALID_INPUT/SCHEMA'
        return False


# the design's reader: every R52..R62 rejected, R63 accepted
for rid in REJECT:
    assert not accepts(STREAMS[rid]), rid
    for fn in (R.stream_readout, R.stream_witness):
        try:
            fn(STREAMS[rid].encode(), G01)
            raise AssertionError(rid + ' accepted')
        except R.Reject as e:
            assert e.code == 'INVALID_INPUT/SCHEMA'
assert accepts(STREAMS['R63'])
# the single-fault property: a kind row is accepted with only the kind check disabled (the count rule stays on),
# a count row with only the count disabled (the kind check stays on); and neither is rejected by the other rule
for rid in KIND_ROWS:
    assert accepts(STREAMS[rid], kind=False), rid
    assert accepts(STREAMS[rid], count=False) is False, rid
for rid in COUNT_ROWS:
    assert accepts(STREAMS[rid], count=False), rid
    assert accepts(STREAMS[rid], kind=False) is False, rid
# ... and every one of the streams passes every other rule: nothing but the stated rule is wrong
for rid in KIND_ROWS + COUNT_ROWS:
    R.read_stream(STREAMS[rid].encode(), G01, kind=False, count=False)

for rid in REJECT + ACCEPT:
    wr('calls/%s.calls' % rid, STREAMS[rid].encode())

for rid in REJECT:
    row(rid, 'core', S_O1, L_F01, J({'calls': 'calls/%s.calls' % rid, 'from': 'calls'}), '', 'INVALID_INPUT/SCHEMA')

RO63 = R.stream_readout(STREAMS['R63'].encode(), G01)
assert RO63 == rd('xr/R01.xr.json') == rd('xr/R49.xr.json')     # a lone unpainted marker contributes nothing
wr('xr/R63.xr.json', RO63)
row('R63', 'core', S_O1, L_F01, J({'calls': 'calls/R63.calls', 'from': 'calls'}), 'xr/R63.xr.json', '')

# witness rows: the same reader (6.6)
for uid, src in (('U18', 'R52'), ('U19', 'R56'), ('U20', 'R59')):
    row(uid, 'subject', S_O1, L_F01, J({'calls': 'calls/%s.calls' % src}), '', 'INVALID_INPUT/SCHEMA')
W21 = R.stream_witness(STREAMS['R63'].encode(), G01)
assert W21 == rd('json/U09.C01.witness.json') == rd('json/U17.witness.json')
wr('json/U21.witness.json', W21)
row('U21', 'subject', S_O1, L_F01, J({'calls': 'calls/R63.calls'}), 'json/U21.witness.json', '')

# ------------------------------------------------------------------ the rows R31-01 / R31-03 say are carried
y = {k: (v[5], v[7]) for k, v in ((r[0], r) for r in [tuple(l.split('\t')) for l in rd('EXPECT.tsv').decode().split('\n')[1:] if l])}
for rid in ('Y18', 'Y19'):
    assert y[rid][1] == 'INVALID_STATE/SCHEMA', rid
s18 = json.loads(rd('states/Y18.state.json').decode())
s19 = json.loads(rd('states/Y19.state.json').decode())
assert set(s18['focus']) == {'edge', 'node'} and isinstance(s19['focus'], list) and len(s19['focus']) == 2
for rid in ('Y20',):
    assert y[rid][1] == ''
# R44, R48, R49 (and K191) exist as the design says; their streams are read by the new reference below

# ------------------------------------------------------------------ outcomes (rows and the mutant matrix)
G11, Y03, Y11, G02, X13 = (dlist('dl/%s.dl' % n) for n in ('G11', 'Y03', 'Y11', 'G02', 'X13'))
OLD_STREAM = {'R16': (G01, 'C01'), 'R39': (Y03, 'C02'), 'R40': (Y11, 'C03'), 'R41': (G11, 'C19'), 'R42': (G02, 'C04'),
              'R43': (X13, 'X13'), 'R44': (G01, 'R44'), 'R45': (G01, 'R45'), 'R46': (G11, 'R46'), 'R47': (G01, 'R47'),
              'R48': (G01, 'R48'), 'R49': (G01, 'R49'), 'R50': (G01, 'R50'), 'R51': (G11, 'R51')}
OLD_WIT = {'U09': (G01, 'C01'), 'U09b': (Y11, 'C03'), 'U15': (G01, 'R45'), 'U16': (G01, 'R47'), 'U17': (G01, 'R50')}
OLDROWS = list(OLD_STREAM) + list(OLD_WIT)
NEWROWS = REJECT + ACCEPT + ['U18', 'U19', 'U20', 'U21']
NEW_SRC = {'U18': 'R52', 'U19': 'R56', 'U20': 'R59', 'U21': 'R63'}


def outcome(rid, mut):
    R.MUT['name'] = mut
    try:
        if rid in STREAMS:
            return ('ok', R.stream_readout(STREAMS[rid].encode(), G01))
        if rid in NEW_SRC:
            return ('ok', R.stream_witness(STREAMS[NEW_SRC[rid]].encode(), G01))
        if rid in OLD_STREAM:
            dl, c = OLD_STREAM[rid]
            return ('ok', R.stream_readout(rd('calls/%s.calls' % c), dl))
        dl, c = OLD_WIT[rid]
        return ('ok', R.stream_witness(rd('calls/%s.calls' % c), dl))
    except R.Reject as e:
        return ('err', e.code)
    except (IndexError, KeyError):
        # a mutated reader accepted a stream whose marker pid is of the wrong kind and the readout then resolves a
        # node pid in the edge table (or the reverse): the verdict is "accepted", which is what differs from the row
        return ('ok', b'ACCEPTED-WITH-A-MIS-RESOLVED-PID')
    finally:
        R.MUT['name'] = None


# the unmutated reference reproduces every existing expected result of the stream rows (self-check of the oracle)
EXPECTED_OLD = {'R16': 'xr/R16.xr.json', 'R39': 'xr/R39.xr.json', 'R40': 'xr/R40.xr.json', 'R41': 'xr/R41.xr.json',
                'R42': 'xr/R42.xr.json', 'R43': 'xr/R43.xr.json', 'R44': 'xr/R44.xr.json', 'R49': 'xr/R49.xr.json',
                'R50': 'xr/R50.xr.json', 'R51': 'xr/R51.xr.json', 'U09': 'json/U09.C01.witness.json',
                'U09b': 'json/U09.C03.witness.json', 'U17': 'json/U17.witness.json'}
for rid in OLDROWS:
    exp = ('ok', rd(EXPECTED_OLD[rid])) if rid in EXPECTED_OLD else ('err', 'INVALID_INPUT/SCHEMA')
    assert outcome(rid, None) == exp, rid
# the existing rejected streams (R45-R48, U15, U16) are single-fault for the count rule also with the kind check on
for rid in ('R45', 'R46', 'R47', 'R48'):
    dl, c = OLD_STREAM[rid]
    data = rd('calls/%s.calls' % c)
    R.read_stream(data, dl, count=False)                    # kind check on, count off: accepted
    try:
        R.read_stream(data, dl, kind=False)
        raise AssertionError(rid)
    except R.Reject:
        pass
# every accepted existing stream of the corpus (calls/*.calls whose row expects a readout) passes the kind check
for rid, (dl, c) in OLD_STREAM.items():
    if rid in EXPECTED_OLD:
        R.read_stream(rd('calls/%s.calls' % c), dl)

MUTANTS = [
    ('K201', 'stream reader does not check the kind of a layer-1 marker pid (a node pid in the edge-halo layer)', ['R52', 'U18']),
    ('K202', 'stream reader does not check the kind of a layer-2 marker pid (a node pid in the focus-halo layer)', ['R53']),
    ('K203', 'stream reader does not check the kind of a layer-3 marker pid (a node pid in the edge-line layer)', ['R54']),
    ('K204', 'stream reader does not check the kind of a layer-4 marker pid (a node pid in the arrowhead layer)', ['R55', 'R60']),
    ('K205', 'stream reader does not check the kind of a layer-5 marker pid (an edge pid in the selected-ring layer)', ['R56', 'R59', 'U19']),
    ('K206', 'stream reader does not check the kind of a layer-6 marker pid (an edge pid in the focus-ring layer)', ['R57']),
    ('K207', 'stream reader does not check the kind of a layer-7 marker pid (an edge pid in the disc layer)', ['R58']),
    ('K208', 'stream reader has no marker-kind check (readout and witness)',
     ['R52', 'R53', 'R54', 'R55', 'R56', 'R57', 'R58', 'R59', 'R60', 'U18', 'U19', 'U20']),
    ('K209', 'stream reader checks the kind of painted marker sections only (an unpainted wrong-kind marker passes)', ['R59', 'R60', 'U20']),
    ('K210', 'stream reader takes node pids only in layer 8 (an edge label marker is refused)', ['R16']),
    ('K211', 'stream reader takes edge pids only in layer 8 (a node label marker is refused)', ['R16']),
    ('K212', 'stream reader swaps the kinds of the layer groups (layers 1-4 node pids, 5-7 edge pids)', ['R16', 'R50']),
    ('K213', 'stream reader takes pid = ND for an edge pid (node/edge boundary one low)', ['R16']),
    ('K214', 'stream reader takes pid = ND + 1 for a node pid (node/edge boundary one high)', ['R16']),
    ('K215', 'a wrong-kind marker is `INVALID_INPUT/INVALID_VALUE` instead of `SCHEMA`', ['R52', 'R56', 'U18']),
    ('K216', 'readoutFromCanvasStream skips the marker-kind check, canvasStreamWitness keeps it',
     ['R52', 'R53', 'R54', 'R55', 'R56', 'R57', 'R58', 'R59', 'R60']),
    ('K217', 'canvasStreamWitness skips the marker-kind check, readoutFromCanvasStream keeps it', ['U18', 'U19', 'U20']),
    ('K218', 'single-focus count counts layer-2 markers but layer-6 painted sections only', ['R61', 'R62']),
    ('K219', 'single-focus count counts layer-6 markers but layer-2 painted sections only', ['R62']),
    ('K220', 'stream reader refuses a lone focus marker of layer 2 that has no painting calls', ['R63', 'U21']),
    ('K221', 'canvasStreamWitness refuses a lone focus marker without painting calls, readoutFromCanvasStream accepts it', ['U21']),
]


def key(x):
    return (x[0], int(x[1:]))


def fold(r):
    return {'U09b': 'U09'}.get(r, r)


base = {r: outcome(r, None) for r in NEWROWS + OLDROWS}
mut_lines, RES = [], {}
for k, desc, named in MUTANTS:
    chg = sorted({fold(r) for r in NEWROWS + OLDROWS if outcome(r, k) != base[r]}, key=key)
    named = sorted(set(named), key=key)
    kill = [n for n in named if n in chg]
    miss = [n for n in named if n not in chg]
    other = [c for c in chg if c not in named]
    verdict = 'killed' if kill and not miss else 'NOT KILLED'
    mut_lines.append('\t'.join([k, desc, ','.join(named), ','.join(kill), ','.join(miss), ','.join(other), verdict]))
    RES[k] = {'named': named, 'kill': kill, 'miss': miss, 'other': other, 'verdict': verdict}
    assert verdict == 'killed', (k, RES[k])

for k, desc, named in MUTANTS:
    row(k, '', '', '', '', '', '')

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
order = {'R': 0, 'U': 1}
nonk = sorted((r for r in rows if r[1] != 'K'), key=lambda r: (order[r[1]], int(r[0][1:])))
append('EXPECT.tsv', ''.join('\t'.join(r) + '\n' for r in nonk + [r for r in rows if r[1] == 'K']))
append('MUTANTS.tsv', '\n'.join(mut_lines) + '\n')

if os.environ.get('REV6_OUT'):
    with open(os.environ['REV6_OUT'], 'w') as f:
        json.dump({'new_files': NEW, 'rows': [r[0] for r in rows], 'mutants': RES}, f, indent=1, sort_keys=True)
        f.write('\n')
print('new files', len(NEW), 'rows', len(rows), 'mutants', len(MUTANTS))
for k, v in RES.items():
    print(k, v['verdict'], 'killers', v['kill'], 'other', v['other'])
