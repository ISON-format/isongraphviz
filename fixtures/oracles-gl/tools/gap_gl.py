"""Rows added to oracles-gl after the rev 5 gap review: the single-focus clause of G12 (design 31 rev 5, 7.2, 9.3) and
the controller outcomes of 7.6 that had no row (lost-again and second-usable-failure from `failed`, the release rule,
and the table cells without a row).

Run:  python -B -I tools/gap_gl.py [CORPUS_DIR]      (default: the directory above tools/)
It adds files and appends to EXPECT.tsv, MUTANTS.tsv and bad/FAULTS.tsv. AMBIGUITIES.md, README.md and SHA256SUMS are
handled by tools/gap_finish.py. tools/gen.py (the original generator) does not know these rows.
Standard library only; the reference logic is tools/gap_glref.py, written from the design text alone.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gap_glref as G  # noqa: E402

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(HERE)
NEW = []


def rd(p):
    with open(os.path.join(ROOT, p), 'rb') as f:
        return f.read()


def wr(p, data):
    assert isinstance(data, bytes) and (p.endswith('.glplan') or b'\r' not in data)
    fp = os.path.join(ROOT, p)
    assert not os.path.exists(fp), 'refusing to overwrite ' + p
    with open(fp, 'wb') as f:
        f.write(data)
    NEW.append(p)


def J(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


rows = []


def row(i, tier, scene, layout, inp, expected, error):
    rows.append((i, i[0], tier, scene, layout, inp, expected, error))


SIZE = {'height': 600, 'width': 900}

# ------------------------------------------------------------------ W rows: plans with more than one focused element
BASE_B = rd('bad/BASE.glplan')
assert not G.violations(BASE_B)


def base():
    return G.Plan.parse(BASE_B)


def L6(pid):
    cx, cy = {1: (100000.0, 100000.0), 2: (300000.0, 450000.0), 4: (500000.0, 150000.0)}[pid]
    return (cx, cy, pid, 1, 0, 0)


def variant(l2=None, add6=(), cn=None, ce=None, l2_add=()):
    """BASE with its layer-2 draw replaced / extended, layer-6 instances added and the omitted entries changed"""
    p = base()
    if l2 == 'none':
        p.layers.pop(2)
    p.layers.setdefault(2, [])
    p.layers[2] = list(p.layers[2]) + list(l2_add)
    if not p.layers[2]:
        p.layers.pop(2)
    if add6:
        p.layers[6] = [L6(x) for x in add6]
    h = p.h
    if cn is not None:
        h['cn'] = cn
    if ce is not None:
        h['ce'] = ce
    return p


I10_L2 = (1156000.0, 100121.0, 0.0, 0.0, 0.0, 0.0, 112000.0, 100001.0, 10, 0, 1, 0)   # pid 10, kind 0, style 1
W = {
    'W39': (variant(add6=(2,)), 'a layer-2 edge focus (pid 9) and a layer-6 node focus (pid 2)'),
    'W40': (variant(l2_add=(I10_L2,)), 'two layer-2 pids (9 and 10)'),
    'W41': (variant(l2='none', add6=(1, 2)), 'two layer-6 pids (1 and 2), no layer 2'),
    'W42': (variant(cn=[[3, 2], [5, 1]]), 'the layer-2 focus and a cn entry with flags 2'),
    'W43': (variant(ce=[[11, 3]]), 'the layer-2 focus and a ce entry with flags 3'),
    'W44': (variant(l2='none', cn=[[3, 2], [5, 3]]), 'two cn entries with the focus bit, no drawn focus'),
    'W45': (variant(l2='none', add6=(1,), cn=[[3, 2], [5, 1]]), 'a layer-6 node focus and a cn entry with flags 2'),
    'W46': (variant(l2='none', cn=[[3, 2], [5, 1]], ce=[[11, 2]]), 'a cn entry and a ce entry with the focus bit'),
}
for k, (p, note) in W.items():
    b = p.serialize()
    assert G.violations(b) == {'G12'}, (k, G.violations(b))
    wr('bad/%s.glplan' % k, b)
    row(k, 'core', '', '', 'bad/%s.glplan' % k, '', 'INVALID_INPUT/SCHEMA')

# W47: accepted plans (one focus, however it is spelled; selection is not focus; a clipped edge is one element)
segA = (111907.0, 101488.0, 0.0, 0.0, 0.0, 0.0, 300000.0, 125000.0)
segB = (300000.0, 125000.0, 0.0, 0.0, 0.0, 0.0, 488093.0, 148512.0)
pb = base()
pb.layers[1] = [segA + (6, 0, 0, 0), segB + (6, 0, 0, 0)]
pb.layers[2] = [segA + (6, 0, 1, 0), segB + (6, 0, 1, 0)]
pb.layers[3] = [segA + (6, 0, 2, 0), segB + (6, 0, 2, 0)] + pb.layers[3][1:]
ACC = {
    'plan/W47.b.glplan': pb,                                                      # a clipped focused edge: two instances, one pid
    'plan/W47.c.glplan': variant(l2='none', cn=[[3, 3], [5, 1]]),                 # one focus, omitted (selected and focused)
    'plan/W47.d.glplan': variant(l2='none', add6=(1,), cn=[[3, 1], [5, 1]]),      # a drawn node focus; omitted entries selected
    'plan/W47.e.glplan': variant(l2='none', cn=[[3, 1], [5, 1]], ce=[[11, 3]]),   # one omitted edge focus; others selected
}
for pth, p in ACC.items():
    b = p.serialize()
    assert not G.violations(b), (pth, G.violations(b))
    assert G.Plan.parse(b).serialize() == b
    wr(pth, b)
files = ['bad/BASE.glplan'] + sorted(ACC)
row('W47', 'core', '', '', J({'files': files}), '', '')

# ------------------------------------------------------------------ B rows: a focused element the guard rule omits
def with_flags(data, cn=None, ce=None):
    p = G.Plan.parse(data)
    if cn is not None:
        p.h['cn'] = cn
    if ce is not None:
        p.h['ce'] = ce
    return p.serialize()


far_a = json.loads(rd('states/far-a.state.json').decode())
far_a_sel = json.loads(rd('states/far-a.sel.state.json').decode())
far_out = json.loads(rd('states/far-out.state.json').decode())
for st in (far_a, far_a_sel, far_out):
    pass
assert G.cj(far_a).encode() == rd('states/far-a.state.json')
assert G.cj(far_out).encode() == rd('states/far-out.state.json')
sa = {'id': 's:a', 'type': 'p'}
eout = far_out['selection']['edges'][0]
st = {}
st['B22'] = dict(far_a, focus={'node': sa})
st['B22b'] = dict(far_a_sel, focus={'node': sa})
st['B23'] = dict(far_out, selection={'edges': [], 'nodes': []}, focus={'edge': eout})
st['B23b'] = dict(far_out, focus={'edge': eout})
for k, v in st.items():
    wr('states/%s.state.json' % k, G.cj(v).encode())

B14, B13 = rd('plan/B14.glplan'), rd('plan/B13.glplan')
p14, p13 = G.Plan.parse(B14), G.Plan.parse(B13)
assert p14.h['cn'] == [[1, 1], [2, 0]] and p14.h['ce'] == [] and p13.h['ce'] == [[4, 1]] and p13.h['cn'] == [[1, 1], [2, 0]]
# an omitted element's flags come from the state (1 selected, +2 focused); the guard rule decides the omission
BP = {
    'B22': with_flags(B14, cn=[[1, 2], [2, 0]]),
    'B22b': with_flags(B14, cn=[[1, 3], [2, 0]]),
    'B23': with_flags(B13, cn=[[1, 0], [2, 0]], ce=[[4, 2]]),
    'B23b': with_flags(B13, ce=[[4, 3]]),
}
for k, b in BP.items():
    assert not G.violations(b)
    wr('plan/%s.glplan' % k, b)
row('B22', 'both', 'scenes/far-a.scene.json', 'layouts/far-a.layout.json',
    J({'also': [{'expected': 'plan/B22b.glplan', 'state': 'states/B22b.state.json'}], 'size': SIZE,
       'state': 'states/B22.state.json'}), 'plan/B22.glplan', '')
row('B23', 'both', 'scenes/far-out.scene.json', 'layouts/far-out.layout.json',
    J({'also': [{'expected': 'plan/B23b.glplan', 'state': 'states/B23b.state.json'}], 'size': SIZE,
       'state': 'states/B23.state.json'}), 'plan/B23.glplan', '')

# ------------------------------------------------------------------ X rows: readout of the one focus of an omitted element
XR = {}
for xid, pl, sc in (('X10', 'B22', 'far-a'), ('X11', 'B22b', 'far-a'), ('X12', 'B23', 'far-out'), ('X13', 'B23b', 'far-out')):
    XR[xid] = G.readout_from_gl(BP[pl])
    wr('xr/%s.xr.json' % xid, XR[xid])
    row(xid, 'core', 'scenes/%s.scene.json' % sc, 'layouts/%s.layout.json' % sc,
        J({'from': 'gl', 'plan': 'plan/%s.glplan' % pl}), 'xr/%s.xr.json' % xid, '')
assert b'"focus":{"node":{"id":"s:a"' in XR['X10'] and b'"focus":{"node"' in XR['X11']
assert b'"focus":{"edge"' in XR['X12'] and b'"focus":{"edge"' in XR['X13']
assert b'"selected":{"edges":[],"nodes":[]}' in XR['X10'] and b'"selected":{"edges":[],"nodes":[]}' in XR['X12']
assert b'"selected":{"edges":[{' in XR['X13'] and b'"nodes":[{"id":"s:u"' in XR['X13'].split(b'"selected"')[1]

# X14-X18: the accepted plans of W47 read through the harness (the harness dispatches the `files` form of a W row for W01
# only): the strict reader must accept each, and the readout reports the one focus however it is spelled
XPLAN = {
    'X14': ('plan/W47.b.glplan', ACC['plan/W47.b.glplan'].serialize()),
    'X15': ('plan/W47.c.glplan', ACC['plan/W47.c.glplan'].serialize()),
    'X16': ('plan/W47.d.glplan', ACC['plan/W47.d.glplan'].serialize()),
    'X17': ('plan/W47.e.glplan', ACC['plan/W47.e.glplan'].serialize()),
    'X18': ('bad/BASE.glplan', BASE_B),
}
for xid, (pth, data) in XPLAN.items():
    XR[xid] = G.readout_from_gl(data)
    wr('xr/%s.xr.json' % xid, XR[xid])
    row(xid, 'core', '', '', J({'from': 'gl', 'plan': pth}), 'xr/%s.xr.json' % xid, '')
    assert XR[xid].count(b'"focus"') == 1
assert b'"focus":{"edge"' in XR['X14'] and b'"focus":{"node"' in XR['X15'] and b'"focus":{"node"' in XR['X16']
assert b'"focus":{"edge"' in XR['X17'] and b'"focus":{"edge"' in XR['X18']

# ------------------------------------------------------------------ U rows: the controller table cells without a row
SH = {'%s.%s' % (p, s): hashlib.sha256(rd('shaders/%s.%s.glsl' % (p, s))).hexdigest()[:16]
      for p in ('arrow', 'disc', 'edge') for s in ('vs', 'fs')}
PLANS = {'plan/G01.glplan': rd('plan/G01.glplan'), 'plan/G05.glplan': rd('plan/G05.glplan')}
G01P, G05P = 'plan/G01.glplan', 'plan/G05.glplan'


def ev(op, **kw):
    d = {'op': op}
    d.update(kw)
    return d


UROWS = {
    # (failed, R): the context is lost again during the retry; then a later R succeeds
    'U40': [ev('init'), ev('C', plan=G01P), ev('L'), ev('R', fail='compile'), ev('R', fail='lost'), ev('R')],
    # (failed, R): a second usable failure with another token; then dispose releases the usable context
    'U41': [ev('init'), ev('C', plan=G01P), ev('L'), ev('R', fail='compile'), ev('R', fail='link'), ev('D')],
    # release rule: dispose in created with an obtained context that is lost (a loss event after a failed initialize)
    'U42': [ev('init', fail='compile'), ev('L'), ev('D')],
    # the same context restored before dispose: it is released
    'U43': [ev('init', fail='compile'), ev('L'), ev('R'), ev('D')],
    # created: R, C, F with no context, then dispose
    'U44': [ev('R'), ev('C', plan=G01P), ev('F'), ev('D')],
    # created: a plan retained before initialize is drawn by it; ready: F
    'U45': [ev('C', plan=G01P), ev('init'), ev('F')],
    # a restore with no retained plan draws nothing
    'U46': [ev('init'), ev('L'), ev('R')],
    # failed: C and F do nothing; the latest plan is drawn after failed -> lost -> ready
    'U47': [ev('init'), ev('C', plan=G01P), ev('L'), ev('R', fail='compile'), ev('C', plan=G05P), ev('F'), ev('L'), ev('R')],
    # init in lost and in failed: ignored
    'U48': [ev('init'), ev('C', plan=G01P), ev('L'), ev('init'), ev('R', fail='compile'), ev('init')],
    # disposed absorbs every event
    'U49': [ev('init'), ev('C', plan=G01P), ev('D'), ev('C', plan=G05P), ev('F'), ev('init'), ev('D')],
}


def run(events, mut=None):
    fk = G.Fake(SH)
    c = G.Ctl(fk, mut)
    sts = []
    for e in events:
        c.ev(e['op'], e.get('fail'), PLANS[e['plan']] if e.get('plan') else None)
        sts.append(c.status())
    return ''.join(G.cj(l) + '\n' for l in fk.log).encode(), sts


# the reference reproduces the 19 existing controller rows (self-check)
for r in rd('EXPECT.tsv').decode().split('\n')[1:]:
    c = r.split('\t')
    if c[0] in ['U%d' % i for i in range(20, 40)] and c[0] != 'U37':
        inp = json.loads(c[5])
        for e in inp['events']:
            if e.get('plan') and e['plan'] not in PLANS:
                PLANS[e['plan']] = rd(e['plan'])
        lg, sts = run(inp['events'])
        assert lg == rd(c[6]) and sts == inp['expect_status'], c[0]

ULOG = {}
for uid, events in UROWS.items():
    lg, sts = run(events)
    ULOG[uid] = (lg, sts)
    wr('gllog/%s.log' % uid, lg)
    row(uid, 'subject', '', '', J({'events': events, 'expect_log': 'gllog/%s.log' % uid, 'expect_status': sts}),
        'gllog/%s.log' % uid, '')

# statements the rows must show (the three outcomes of A-40 and the other cells)
lg40 = ULOG['U40'][1]
assert [s['phase'] for s in lg40] == ['ready', 'ready', 'lost', 'failed', 'lost', 'ready']
assert 'failure' not in lg40[4] and lg40[4]['contextLost'] is True
assert [s.get('failure') for s in ULOG['U41'][1]][3:5] == ['COMPILE_FAILED', 'LINK_FAILED']
assert [s['phase'] for s in ULOG['U41'][1]][3:5] == ['failed', 'failed']
assert b'["loseContext"]' not in ULOG['U42'][0] and b'["loseContext"]' in ULOG['U43'][0]
assert b'["loseContext"]' in ULOG['U41'][0]
assert ULOG['U42'][1][-1] == {'attributes': {'failIfMajorPerformanceCaveat': True}, 'contextLost': True,
                              'phase': 'disposed'}

# ------------------------------------------------------------------ mutants
EXIST_W = [l.split('\t')[0] for l in rd('bad/FAULTS.tsv').decode().split('\n')[1:] if l]
EXIST_ACC = ['plan/G%02d.glplan' % i for i in range(1, 12)]


def w_outcome(rid, mut):
    G.MUT['name'] = mut
    try:
        if rid in W:
            data = W[rid][0].serialize()
        elif rid in ('W47', 'W01'):
            data = None
        else:
            data = rd('bad/%s.glplan' % rid)
        if rid == 'W47':
            return tuple('rej' if G.violations(rd(f)) else 'ok' for f in files)
        if rid == 'W01':
            return tuple('rej' if G.violations(rd(f)) else 'ok' for f in EXIST_ACC)
        return ('rej',) if G.violations(data) else ('ok',)
    finally:
        G.MUT['name'] = None


def x_outcome(rid, mut):
    G.MUT['name'] = mut
    try:
        pl = {'X10': BP['B22'], 'X11': BP['B22b'], 'X12': BP['B23'], 'X13': BP['B23b']}.get(rid)
        if pl is None and rid in XPLAN:
            pl = XPLAN[rid][1]
        if pl is None:
            pl = rd('plan/%s.glplan' % {'X01': 'G01', 'X02': 'G05', 'X03': 'G06', 'X04': 'X04', 'X06': 'X06', 'X08': 'X08',
                                         'X09': 'X09'}[rid])
        if G.violations(pl):          # the readout is read through the strict reader
            return b'REJECTED'
        return G.readout_from_gl(pl)
    finally:
        G.MUT['name'] = None


def b_outcome(rid, mut):
    if mut == 'K139':       # the guard rule writes the omitted element's flags without the focus bit
        return b''.join(with_flags(src, cn=[[a, b & 1] for a, b in G.Plan.parse(src).h['cn']],
                                   ce=[[a, b & 1] for a, b in G.Plan.parse(src).h['ce']])
                        for src in [BP[rid]])
    return BP[rid]


def u_outcome(rid, mut):
    if rid in UROWS:
        ev_ = UROWS[rid]
    else:
        ev_ = EXIST_U[rid]
    return run(ev_, mut)


EXIST_U = {}
for r in rd('EXPECT.tsv').decode().split('\n')[1:]:
    c = r.split('\t')
    if c[0] in ['U%d' % i for i in range(20, 40)] and c[0] != 'U37':
        EXIST_U[c[0]] = json.loads(c[5])['events']

# (final id, switch, description, named killers)
MUT = [
    ('K130', 'K130', 'G12 single-focus clause counts the layer-2 and layer-6 pids only (cn/ce flags ignored)',
     ['W42', 'W43', 'W44', 'W45', 'W46']),
    ('K131', 'K131', 'G12 single-focus clause counts the cn/ce entries with the focus bit only (layers 2 and 6 ignored)',
     ['W39', 'W40', 'W41', 'W42', 'W43', 'W45']),
    ('K132', 'K132', 'G12 allows one focused pid in layer 2 and one in layer 6 separately (cn/ce flags ignored)',
     ['W39', 'W42', 'W43', 'W44', 'W45', 'W46']),
    ('K133', 'K133', 'G12 counts instances instead of distinct pids (a clipped focused edge counts per instance)',
     ['W47', 'X14']),
    ('K134', 'K134', 'G12 counts every cn/ce entry with a non-zero flags value (a selected omitted element is a focus)',
     ['W47', 'X16', 'X18']),
    ('K135', 'K135', 'G12 counts the cn entries with the focus bit but not the ce entries', ['W43', 'W46']),
    ('K136', 'K136', 'reader has the subset clauses of G12 but not the single-focus clause',
     ['W39', 'W40', 'W41', 'W42', 'W43', 'W44', 'W45', 'W46']),
    ('K137', 'K137', 'readoutFromGl takes the focus from the layers 2 and 6 only (the flags of omitted entries ignored)',
     ['X10', 'X11', 'X12', 'X13', 'X15', 'X17']),
    ('K138', 'K138', 'readoutFromGl swaps the selected and focused bits of the omitted entries',
     ['X10', 'X12', 'X13']),
    ('K139', 'K139', 'the guard rule writes the flags of an omitted element without the focus bit',
     ['B22', 'B23']),
    ('K140', 'K140', 'controller (failed, R) with the context lost again ends in phase failed instead of lost', ['U40']),
    ('K141', 'K141', 'controller (failed, R) lost again keeps the failure token', ['U40']),
    ('K142', 'K142', 'controller deletes the created objects when the restore is lost again', ['U40']),
    ('K143', 'K143', 'controller (failed, R) lost again does not call onStatus', ['U40']),
    ('K144', 'K144', 'controller (failed, R) second usable failure calls onStatus though the phase stays failed', ['U41']),
    ('K145', 'K145', 'controller (failed, R) second usable failure keeps the old failure token', ['U41']),
    ('K146', 'K146', 'controller (failed, R) second usable failure does not call onError', ['U41']),
    ('K147', 'K148', 'dispose in created releases the context although it is lost', ['U42']),
    ('K148', 'K149', 'dispose in created decides the release from a cached "was ever lost" flag, not from the context', ['U43']),
    ('K149', 'K151', 'a loss event in created calls preventDefault', ['U42', 'U43']),
    ('K150', 'K152', 'initialize does not draw a plan retained before it', ['U45']),
    ('K151', 'K153', 'a restore with no retained plan logs a label draw', ['U46']),
    ('K152', 'K154', 'a commit in failed does not store the plan (the restore draws an older one)', ['U47']),
    ('K153', 'K155', 'a loss out of failed clears the label canvas again', ['U47']),
    ('K154', 'K156', 'initialize in lost or failed adds the listeners again', ['U48']),
    ('K155', 'K157', 'a second dispose removes the listeners again', ['U49']),
    ('K156', 'K158', 'render() in ready draws the frame but not the labels', ['U45']),
]

W_ROWS = list(W) + ['W47', 'W01'] + EXIST_W
X_ROWS = ['X10', 'X11', 'X12', 'X13', 'X14', 'X15', 'X16', 'X17', 'X18', 'X01', 'X02', 'X03', 'X04', 'X06', 'X08', 'X09']
B_ROWS = ['B22', 'B22b', 'B23', 'B23b']
U_ROWS = list(UROWS) + sorted(EXIST_U, key=lambda x: int(x[1:]))


def fold(r):
    return {'B22b': 'B22', 'B23b': 'B23'}.get(r, r)


def key(x):
    return (x[0], int(x[1:]))


base_out = {}
for r in W_ROWS:
    base_out[r] = w_outcome(r, None)
for r in X_ROWS:
    base_out[r] = x_outcome(r, None)
for r in B_ROWS:
    base_out[r] = b_outcome(r, None)
for r in U_ROWS:
    base_out[r] = u_outcome(r, None)

# the unmutated reference reproduces the existing readouts
for xid, pl in (('X01', 'G01'), ('X02', 'G05'), ('X03', 'G06'), ('X04', 'X04'), ('X06', 'X06'), ('X08', 'X08'), ('X09', 'X09')):
    assert x_outcome(xid, None) == rd('xr/%s.xr.json' % xid), xid
for r in EXIST_W:
    assert base_out[r] == ('rej',), r

mut_lines, RES = [], {}
for fid, sw, desc, named in MUT:
    changed = set()
    for r in W_ROWS:
        if w_outcome(r, sw) != base_out[r]:
            changed.add(fold(r))
    for r in X_ROWS:
        if x_outcome(r, sw) != base_out[r]:
            changed.add(r)
    for r in B_ROWS:
        if b_outcome(r, sw) != base_out[r]:
            changed.add(fold(r))
    for r in U_ROWS:
        if u_outcome(r, sw) != base_out[r]:
            changed.add(r)
    chg = sorted(changed, key=key)
    named = sorted(set(named), key=key)
    kill = [n for n in named if n in chg]
    miss = [n for n in named if n not in chg]
    other = [c for c in chg if c not in named]
    verdict = 'KILLED' if kill and not miss else 'NOT KILLED'
    assert verdict == 'KILLED', (fid, sw, kill, miss)
    mut_lines.append('\t'.join([fid, desc, ','.join(named), ','.join(kill), ','.join(miss), ','.join(other), verdict]))
    RES[fid] = {'switch': sw, 'named': named, 'kill': kill, 'miss': miss, 'other': other}
    row(fid, '', '', '', '', '', '')

# ------------------------------------------------------------------ append to the index files
def append(p, text):
    fp = os.path.join(ROOT, p)
    with open(fp, 'rb') as f:
        old = f.read()
    assert old.endswith(b'\n') and '\r' not in text
    with open(fp, 'wb') as f:
        f.write(old + text.encode('utf-8'))


have = rd('EXPECT.tsv').decode('utf-8')
for r in rows:
    assert ('\n' + r[0] + '\t') not in have, r[0]
order = {'B': 0, 'W': 1, 'X': 2, 'U': 3, 'K': 4}
srt = sorted(rows, key=lambda r: (order[r[1]], int(r[0][1:])))
append('EXPECT.tsv', ''.join('\t'.join(r) + '\n' for r in srt))
append('MUTANTS.tsv', '\n'.join(mut_lines) + '\n')
append('bad/FAULTS.tsv', ''.join('%s\tG12\t%s\n' % (k, W[k][1]) for k in W))

if os.environ.get('GAP_OUT'):
    with open(os.environ['GAP_OUT'], 'w') as f:
        json.dump({'new_files': NEW, 'rows': [r[0] for r in srt], 'mutants': RES}, f, indent=1, sort_keys=True)
        f.write('\n')
print('new files', len(NEW), 'rows', len(rows), 'mutants', len(MUT))
for k, v in RES.items():
    print(k, 'killers', v['kill'], 'other', v['other'])
