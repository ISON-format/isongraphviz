"""Rows added to oracles-dl after the rev 5 gap review: the single-focus clause (design 31 rev 5, 6.6, 9.3).

Run:  python -B -I tools/gap_dl.py [CORPUS_DIR]      (default: the directory above tools/)
It adds files, appends to EXPECT.tsv and MUTANTS.tsv, and prints what it wrote. AMBIGUITIES.md, README.md and
SHA256SUMS are handled by tools/gap_finish.py, which runs after this script (it needs the row list).
It is NOT run by tools/gen.py and gen.py does not know these rows: a regeneration with gen.py removes them.
Standard library only; the reference logic is tools/gap_dlref.py, written from the design text alone.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gap_dlref as R  # noqa: E402

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


G01, G11, Y11, Y03, G02, X13 = (dlist('dl/%s.dl' % n) for n in ('G01', 'G11', 'Y11', 'Y03', 'G02', 'X13'))

S_O1, L_F01 = '../oracles/o1-basic.scene.json', '../oracles-igl/layouts/F01.layout.json'
S_LP, L_LP = '../oracles-svg/scenes/loops2.scene.json', '../oracles-svg/layouts/loops2.layout.json'
S_M20, L_F04 = '../oracles-igl/scenes/mixed20.scene.json', '../oracles-igl/layouts/F04.layout.json'

rows = []


def row(i, tier, scene, layout, inp, expected, error):
    rows.append((i, i[0], tier, scene, layout, inp, expected, error))


def J(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def insert_before(stream, marker, new):
    ls = stream.split('\n')
    k = ls.index(marker)
    return '\n'.join(ls[:k] + [new] + ls[k:])


# ------------------------------------------------------------------ streams (the reader is given the list G01 / G11)
STREAMS = {
    # two layer-6 markers (nodes 1 and 2)
    'R45': (G01, R.replay(G01.with_flags({1: 2, 2: 2}))),
    # two layer-2 markers (loops 3 and 4)
    'R46': (G11, R.replay(G11.with_flags({3: 2, 4: 2}))),
    # one layer-2 marker (edge 3) and one layer-6 marker (node 1)
    'R47': (G01, R.replay(G01.with_flags({3: 2, 1: 2}))),
    # a layer-2 marker without painting calls (edge 3) and a painted layer-6 marker (node 1)
    'R48': (G01, insert_before(R.replay(G01.with_flags({1: 2})), '["#",3,3]', '["#",3,2]')),
    # a single layer-6 marker without painting calls: nothing is focused
    'R49': (G01, insert_before(R.replay(G01), '["#",1,7]', '["#",1,6]')),
    # selection is not focus: nodes 1 and 2 and edge 3 selected, node 2 focused
    'R50': (G01, R.replay(G01.with_flags({1: 1, 2: 3, 3: 1}))),
    # the same on loops: node 1, edges 3 and 5 selected, edge 4 selected and focused
    'R51': (G11, R.replay(G11.with_flags({1: 1, 3: 1, 4: 3, 5: 1}))),
}
SCEN = {'R45': (S_O1, L_F01), 'R46': (S_LP, L_LP), 'R47': (S_O1, L_F01), 'R48': (S_O1, L_F01),
        'R49': (S_O1, L_F01), 'R50': (S_O1, L_F01), 'R51': (S_LP, L_LP)}
REJECT = ['R45', 'R46', 'R47', 'R48']
ACCEPT = ['R49', 'R50', 'R51']

for rid in REJECT + ACCEPT:
    wr('calls/%s.calls' % rid, STREAMS[rid][1].encode())

# the single-fault property: every rejected stream is accepted by the reference with only the clause disabled
for rid in REJECT:
    dl, s = STREAMS[rid]
    try:
        R.read_stream(s.encode(), dl)
        raise AssertionError(rid + ' accepted')
    except R.Reject as e:
        assert e.code == 'INVALID_INPUT/SCHEMA'
    R.read_stream(s.encode(), dl, rule=False)
    R.stream_readout(s.encode(), dl, rule=False)
    R.stream_witness(s.encode(), dl, rule=False)
for rid in ACCEPT:
    R.read_stream(STREAMS[rid][1].encode(), STREAMS[rid][0])

for rid in REJECT:
    sc, ly = SCEN[rid]
    row(rid, 'core', sc, ly, J({'calls': 'calls/%s.calls' % rid, 'from': 'calls'}), '', 'INVALID_INPUT/SCHEMA')
RO = {}
for rid in ACCEPT:
    dl, s = STREAMS[rid]
    RO[rid] = R.stream_readout(s.encode(), dl)
    wr('xr/%s.xr.json' % rid, RO[rid])
    sc, ly = SCEN[rid]
    row(rid, 'core', sc, ly, J({'calls': 'calls/%s.calls' % rid, 'from': 'calls'}), 'xr/%s.xr.json' % rid, '')

assert RO['R49'] == rd('xr/R01.xr.json')                   # an unpainted marker contributes nothing: R01's readout
assert RO['R50'].count(b'"focus"') == 1 and b'"focus":{"node"' in RO['R50']
assert RO['R51'].count(b'"focus"') == 1 and b'"focus":{"edge"' in RO['R51']

# witness rows
for uid, src in (('U15', 'R45'), ('U16', 'R47')):
    sc, ly = SCEN[src]
    row(uid, 'subject', sc, ly, J({'calls': 'calls/%s.calls' % src}), '', 'INVALID_INPUT/SCHEMA')
w17 = R.stream_witness(STREAMS['R50'][1].encode(), G01)
assert w17 == rd('json/U09.C01.witness.json')               # same drawn elements as the C01 stream
wr('json/U17.witness.json', w17)
row('U17', 'subject', S_O1, L_F01, J({'calls': 'calls/R50.calls'}), 'json/U17.witness.json', '')

# ------------------------------------------------------------------ builder rows: a state names at most one focus
y03 = json.loads(rd('states/Y03.state.json').decode())
assert R.cj(y03).encode() == rd('states/Y03.state.json')
ann, i1 = {'id': 's:ann', 'type': 'person'}, {'id': 'i:1', 'type': 'person'}
knows = y03['selection']['edges'][0]
st18 = dict(y03)
st18['focus'] = {'edge': knows, 'node': ann}                # both keys
st19 = dict(y03)
st19['focus'] = [{'node': ann}, {'node': i1}]               # an array
wr('states/Y18.state.json', R.cj(st18).encode())
wr('states/Y19.state.json', R.cj(st19).encode())
size = {'height': 600, 'width': 900}
row('Y18', 'core', S_O1, L_F01, J({'size': size, 'state': 'states/Y18.state.json'}), '', 'INVALID_STATE/SCHEMA')
row('Y19', 'core', S_O1, L_F01, J({'size': size, 'state': 'states/Y19.state.json'}), '', 'INVALID_STATE/SCHEMA')

y11 = json.loads(rd('states/Y11.state.json').decode())
assert R.cj(y11).encode() == rd('states/Y11.state.json')
edge_a = y11['selection']['edges'][0]
node_a = {'id': 'i:4', 'type': 'company'}
st20, st20b = dict(y11), dict(y11)
st20['focus'] = {'edge': edge_a}
st20b['focus'] = {'node': node_a}
wr('states/Y20.state.json', R.cj(st20).encode())
wr('states/Y20b.state.json', R.cj(st20b).encode())

tbl = Y11.nodes + Y11.edges
pe, pn = tbl.index(edge_a) + 1, tbl.index(node_a) + 1
assert pe > Y11.ND >= pn
assert all(r[2] == 1 for r in Y11.recs if r[0] == 'E') and all(r[3] == 1 for r in Y11.recs if r[0] == 'N')
l20, l20b = Y11.with_flags({pe: 3}), Y11.with_flags({pn: 3})
for l in (l20, l20b):
    assert len([r for r in l.recs if (r[0] == 'E' and r[2] & 2) or (r[0] == 'N' and r[3] & 2)]) == 1
wr('dl/Y20.dl', l20.text().encode())
wr('dl/Y20b.dl', l20b.text().encode())
row('Y20', 'both', S_M20, L_F04,
    J({'also': [{'expected': 'dl/Y20b.dl', 'state': 'states/Y20b.state.json'}], 'size': size,
       'state': 'states/Y20.state.json'}), 'dl/Y20.dl', '')


# ------------------------------------------------------------------ mutants (each a switch of the reference)
def focus_state_check(f, mut):
    """27 4.2 (iii): `focus` is an object with exactly one key"""
    if isinstance(f, dict) and len(f) == 2 and mut == 'K197':
        return None
    if isinstance(f, list) and mut == 'K198':
        return None
    if isinstance(f, dict) and len(f) == 1:
        return None
    return 'INVALID_STATE/SCHEMA'


def build_flags(base, focus_pid, mut):
    """everything selected (flags 1), the focused element +2 (4.4 c, d)"""
    fl = {r[1]: 1 for r in base.recs if r[0] in ('E', 'N')}
    if mut == 'K199':
        fl = {k: v | 2 for k, v in fl.items()}
    fl[focus_pid] |= 2
    if mut == 'K200' and focus_pid <= base.ND:
        a = base.nodes[focus_pid - 1]
        for k, e in enumerate(base.edges):
            if e['src'] == a or e['tgt'] == a:
                fl[base.ND + k + 1] |= 2
    return fl


OLD = {'R16': (G01, 'C01'), 'R39': (Y03, 'C02'), 'R40': (Y11, 'C03'), 'R41': (G11, 'C19'), 'R42': (G02, 'C04'),
       'R43': (X13, 'X13'), 'R44': (G01, 'R44'), 'U09': (G01, 'C01'), 'U09b': (Y11, 'C03')}
NEWROWS = ['R45', 'R46', 'R47', 'R48', 'R49', 'R50', 'R51', 'U15', 'U16', 'U17', 'Y18', 'Y19', 'Y20', 'Y20b']
OLDROWS = ['R16', 'R39', 'R40', 'R41', 'R42', 'R43', 'R44', 'U09', 'U09b']


def outcome(rid, mut):
    R.MUT['name'] = mut
    try:
        if rid in STREAMS:
            dl, s = STREAMS[rid]
            return ('ok', R.stream_readout(s.encode(), dl))
        if rid in ('U15', 'U16', 'U17'):
            dl, s = STREAMS[{'U15': 'R45', 'U16': 'R47', 'U17': 'R50'}[rid]]
            return ('ok', R.stream_witness(s.encode(), dl))
        if rid in ('Y18', 'Y19'):
            e = focus_state_check((st18 if rid == 'Y18' else st19)['focus'], mut)
            return ('err', e) if e else ('ok', b'a list')
        if rid in ('Y20', 'Y20b'):
            return ('ok', Y11.with_flags(build_flags(Y11, pe if rid == 'Y20' else pn, mut)).text().encode())
        dl, c = OLD[rid]
        data = rd('calls/%s.calls' % c)
        return ('ok', R.stream_witness(data, dl) if rid.startswith('U') else R.stream_readout(data, dl))
    except R.Reject as e:
        return ('err', e.code)
    finally:
        R.MUT['name'] = None


# the unmutated reference reproduces the existing expected bytes of the stream rows (self-check of the oracle)
for rid, exp in (('R16', 'xr/R16.xr.json'), ('R39', 'xr/R39.xr.json'), ('R40', 'xr/R40.xr.json'),
                 ('R41', 'xr/R41.xr.json'), ('R42', 'xr/R42.xr.json'), ('R43', 'xr/R43.xr.json'),
                 ('R44', 'xr/R44.xr.json'), ('U09', 'json/U09.C01.witness.json'),
                 ('U09b', 'json/U09.C03.witness.json')):
    assert outcome(rid, None) == ('ok', rd(exp)), rid

MUTANTS = [
    ('K188', 'single-focus count ignores the layer-2 markers (layer 6 only)', ['R46', 'R47', 'R48', 'U16']),
    ('K189', 'single-focus count ignores the layer-6 markers (layer 2 only)', ['R45', 'R47', 'R48', 'U15', 'U16']),
    ('K190', 'at most one focused marker per layer instead of in layers 2 and 6 together', ['R47', 'R48', 'U16']),
    ('K191', 'single-focus count over painted sections only (an unpainted focus marker is not counted)', ['R48']),
    ('K192', 'the single-focus count includes the selection layers 1 and 5', ['R50', 'R51', 'U17']),
    ('K193', 'stream reader has no single-focus rule (readout and witness)',
     ['R45', 'R46', 'R47', 'R48', 'U15', 'U16']),
    ('K194', 'canvasStreamWitness skips the single-focus rule, readoutFromCanvasStream keeps it', ['U15', 'U16']),
    ('K195', 'readoutFromCanvasStream skips the single-focus rule, canvasStreamWitness keeps it',
     ['R45', 'R46', 'R47', 'R48']),
    ('K196', 'stream reader refuses a lone focus marker that has no painting calls', ['R49']),
    ('K197', 'state check accepts a `focus` object with both keys `node` and `edge`', ['Y18']),
    ('K198', 'state check accepts a `focus` array', ['Y19']),
    ('K199', 'builder sets the focused bit on every element when a focus exists', ['Y20']),
    ('K200', 'builder gives the incident edges of a focused node the focused bit', ['Y20']),
]


def key(x):
    return (x[0], int(x[1:]))


def fold(r):
    return {'Y20b': 'Y20', 'U09b': 'U09'}.get(r, r)


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
order = {'Y': 0, 'R': 1, 'U': 2}
nonk = sorted((r for r in rows if r[1] != 'K'), key=lambda r: (order[r[1]], int(r[0][1:])))
append('EXPECT.tsv', ''.join('\t'.join(r) + '\n' for r in nonk + [r for r in rows if r[1] == 'K']))
append('MUTANTS.tsv', '\n'.join(mut_lines) + '\n')

if os.environ.get('GAP_OUT'):
    with open(os.environ['GAP_OUT'], 'w') as f:
        json.dump({'new_files': NEW, 'rows': [r[0] for r in rows], 'mutants': RES}, f, indent=1, sort_keys=True)
        f.write('\n')
print('new files', len(NEW), 'rows', len(rows), 'mutants', len(MUTANTS))
for k, v in RES.items():
    print(k, v['verdict'], 'killers', v['kill'], 'other', v['other'])
