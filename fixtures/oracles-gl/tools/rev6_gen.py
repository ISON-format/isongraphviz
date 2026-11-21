"""Rows appended to oracles-gl after design 31 rev 6 (owner-adopted wording R31-07, R31-09, R31-11 (a) and (b); R31-08 and
R31-10 are checked against the existing rows, not extended).  APPEND-ONLY: new ids, new files; an existing file is never
rewritten except by appending to EXPECT.tsv and MUTANTS.tsv.

Run:  python -B -I tools/rev6_gen.py [CORPUS_DIR]      (default: the directory above tools/)
then: python -B -I tools/rev6_finish.py [CORPUS_DIR]   (AMBIGUITIES.md append, README.md, SHA256SUMS)

Written from design 31 rev 6 alone; the reference is tools/rev6_ref.py (controller) on top of tools/gap_glref.py (plan
structure, strict reader, readout, executor log helpers) and the planner of this corpus (tools/plan.py, dlist.py, scn.py)
for the one planner row.  Standard library only.  Use -B so that no __pycache__ appears in the corpus.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dlist  # noqa: E402
import gap_glref as G  # noqa: E402
import plan as P  # noqa: E402
import rev6_ref as R  # noqa: E402
import scn  # noqa: E402

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(HERE)
NEW = []
ROWS = []


def rd(p):
    with open(os.path.join(ROOT, p), 'rb') as f:
        return f.read()


def wr(p, data):
    assert isinstance(data, bytes) and (p.endswith('.glplan') or b'\r' not in data), p
    fp = os.path.join(ROOT, p)
    assert not os.path.exists(fp), 'refusing to overwrite ' + p
    with open(fp, 'wb') as f:
        f.write(data)
    NEW.append(p)


def J(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def row(i, tier, scene, layout, inp, expected, error):
    ROWS.append((i, i[0], tier, scene, layout, inp, expected, error))


SIZE = {'height': 600, 'width': 900}
EXPECT = [l.split('\t') for l in rd('EXPECT.tsv').decode('utf-8').split('\n')[1:] if l]
IDS = {r[0] for r in EXPECT}

# =================================================================== R31-10 and R31-08: checked against the existing rows
for r in EXPECT:
    if r[0] in ('U25', 'U27', 'U31', 'U34', 'U36', 'U39'):
        inp = json.loads(r[5])
        assert r[7] == '' and r[6] == 'gllog/%s.log' % r[0] and 'info_log' not in inp and 'expect_detail' not in inp, r[0]
    if r[0] in ('E10', 'E11'):
        inp = json.loads(r[5])
        assert r[7] == 'INVALID_INPUT/INVALID_VALUE' and 'info_log' in inp and 'expect_detail' in inp, r[0]
print('R31-10: U25 U27 U31 U34 U36 U39 have an empty error cell, the log as expected file, no info_log/expect_detail; E10 E11 have both')

SH = {'%s.%s' % (p, s): hashlib.sha256(rd('shaders/%s.%s.glsl' % (p, s))).hexdigest()[:16]
      for p in ('arrow', 'disc', 'edge') for s in ('vs', 'fs')}
PLANS = {}


def plan_file(p):
    if p not in PLANS:
        PLANS[p] = rd(p)
    return PLANS[p]


def run(events, mut=None):
    fk = G.Fake(SH)
    c = R.Ctl6(fk, mut)
    sts = []
    for e in events:
        c.ev(e['op'], e.get('fail'), plan_file(e['plan']) if e.get('plan') else None)
        sts.append(c.status())
    return ''.join(G.cj(l) + '\n' for l in fk.log).encode(), sts


EXIST_U = {}
for r in EXPECT:
    if r[0][0] == 'U' and r[0] != 'U37' and 20 <= int(r[0][1:]) <= 49:
        EXIST_U[r[0]] = json.loads(r[5])['events']
# the rev 6 reference reproduces the 29 existing controller rows byte for byte, logs and status() sequences
for r in EXPECT:
    if r[0] in EXIST_U:
        inp = json.loads(r[5])
        lg, sts = run(inp['events'])
        assert lg == rd(r[6]) and sts == inp['expect_status'], r[0]
print('self-check: the rev 6 controller reproduces', len(EXIST_U), 'existing controller rows (logs and status sequences)')

# R31-08: U42 and U43 pin "a loss in created is ignored" and the release rule's own isContextLost(); the existing mutants
# K147-K149 (switches K148, K149, K151 of the earlier reference) differ on them
for fid, sw, killers in (('K147', 'K148', ['U42']), ('K148', 'K149', ['U43']), ('K149', 'K151', ['U42', 'U43'])):
    for u in killers:
        ev_ = EXIST_U[u]
        base = G.run_controller(ev_, {p: plan_file(p) for p in ('plan/G01.glplan',)}, SH, None)
        mutd = G.run_controller(ev_, {p: plan_file(p) for p in ('plan/G01.glplan',)}, SH, sw)
        assert base != mutd, (fid, u)
print('R31-08: existing U42, U43 (loss in created ignored; release from the context own flag) and mutants K147-K149 verified: each named row differs under its mutant')

# =================================================================== R31-07: planner row, reader rows, readouts
for rel in ('scenes/far-pair.scene.json', 'layouts/far-pair.layout.json'):
    scn.put(rel, rd(rel))
M = scn.load_model('scenes/far-pair.scene.json', 'layouts/far-pair.layout.json')
VP = (450000, 300000, 1000)


def pipeline(state):
    d = dlist.build_dl(M, state, True, True, dlist.DEFAULT_MAX_UNITS)
    return P.build_plan(d)[1]


base_state = scn.make_state(M, 900, 600, *VP)
assert scn.state_bytes(base_state) == rd('states/far-pair.state.json')
assert pipeline(base_state) == rd('plan/B12.glplan'), 'the planner no longer reproduces B12'
st24 = scn.make_state(M, 900, 600, *VP, focus=('e', 0))                                    # the first member of the pair
st24b = scn.make_state(M, 900, 600, *VP, selected_edges=[0, 1], focus=('e', 1))            # both selected, the second focused
B24 = pipeline(st24)
B24b = pipeline(st24b)
for b, ids in ((B24, ({3}, set())), (B24b, ({4}, set()))):
    pl = G.Plan.parse(b)
    assert not G.violations(b), G.violations(b)
    P.parse_plan(b)                                                                         # the first reader accepts too
    l2 = [t[8] for t in pl.layers[2]]
    assert len(l2) >= 2 and len(set(l2)) == 1 and {l2[0]} == ids[0], l2                     # one focused pid, several segments
assert [t[8] for t in G.Plan.parse(B24).layers[2]] == [3, 3]
assert G.Plan.parse(B24).serialize() == B24 and G.Plan.parse(B24b).serialize() == B24b
pb24b = G.Plan.parse(B24b)
assert [t[8] for t in pb24b.layers[1]] == [3, 3, 4, 4] and [t[8] for t in pb24b.layers[2]] == [4, 4]
assert [t[8] for t in pb24b.layers[3]] == [3, 3, 4, 4]
wr('states/B24.state.json', scn.state_bytes(st24))
wr('states/B24b.state.json', scn.state_bytes(st24b))
wr('plan/B24.glplan', B24)
wr('plan/B24b.glplan', B24b)
row('B24', 'both', 'scenes/far-pair.scene.json', 'layouts/far-pair.layout.json',
    J({'also': [{'expected': 'plan/B24b.glplan', 'state': 'states/B24b.state.json'}], 'size': SIZE,
       'state': 'states/B24.state.json'}), 'plan/B24.glplan', '')

# W48: the clipped focused edge (pid 3, two segments in layer 2) plus a second DISTINCT focused element (the omitted node 2)
p48 = G.Plan.parse(B24)
assert p48.h['cn'] == [[2, 0]] and p48.h['ce'] == []
p48.h['cn'] = [[2, 2]]
# W49: two focused chains: layer 2 holds the segments of pid 3 and of pid 4 (each repeats its pid; two distinct pids)
p49 = G.Plan.parse(B24)
l3 = p49.layers[3]
chain4 = [t[:10] + (1, 0) for t in l3 if t[8] == 4]                                         # style 1 (halo-foc)
assert len(chain4) == 2
p49.layers[2] = list(p49.layers[2]) + chain4
BAD = {
    'W48': (p48.serialize(), 'a focused clipped edge (pid 3, two segments in layer 2) and a cn entry with the focus bit (distinct pid 2)'),
    'W49': (p49.serialize(), 'two focused clipped edges (pids 3 and 4, two segments each in layer 2): two distinct pids'),
}
for k, (b, note) in BAD.items():
    assert G.violations(b) == {'G12'}, (k, G.violations(b))                                 # exactly G12 (single fault)
    try:
        P.parse_plan(b)
        raise AssertionError('the first reader accepts %s' % k)
    except scn.Err as e:
        assert (e.code, e.reason) == ('INVALID_INPUT', 'SCHEMA'), (k, e.code, e.reason)
    P.parse_plan(b, disabled={'G12'})                                                       # accepted when only G12 is disabled
    wr('bad/%s.glplan' % k, b)
    row(k, 'core', '', '', 'bad/%s.glplan' % k, '', 'INVALID_INPUT/SCHEMA')
wr('bad/FAULTS-rev6.tsv', ('id\trule\tnote\n' + ''.join('%s\tG12\t%s\n' % (k, BAD[k][1]) for k in BAD)).encode())
ACC = ['plan/B24.glplan', 'plan/B24b.glplan']
row('W50', 'core', '', '', J({'files': ACC}), '', '')                                       # the reader accepts planner output

for xid, pth, b in (('X19', 'plan/B24.glplan', B24), ('X20', 'plan/B24b.glplan', B24b)):
    ro = G.readout_from_gl(b)
    assert ro == P.serialize_readout(P.readout_from_gl(P.parse_plan(b))), xid               # the two readers agree
    assert ro.count(b'"focus"') == 1 and b'"focus":{"edge"' in ro
    wr('xr/%s.xr.json' % xid, ro)
    row(xid, 'core', 'scenes/far-pair.scene.json', 'layouts/far-pair.layout.json',
        J({'from': 'gl', 'plan': pth}), 'xr/%s.xr.json' % xid, '')
XPLAN = {'X19': B24, 'X20': B24b}

# =================================================================== R31-09, R31-11 (a), R31-11 (b): controller rows
G01P = 'plan/G01.glplan'


def ev(op, **kw):
    d = {'op': op}
    d.update(kw)
    return d


UROWS = {
    # R31-09: a loss during creation (the fake's fail "lost"): the log stops after the getShaderParameter of arrow.vs; no
    # getShaderInfoLog, no cleanup (the context is lost); onError and reject carry CONTEXT_LOST; phase created
    'U50': [ev('init', fail='lost')],
    # the same, then dispose: the context is lost, so no getExtension / loseContext (the release rule)
    'U51': [ev('init', fail='lost'), ev('D')],
    # R31-09 and R31-11 (a): a plan is retained, the first initialize loses the context, R restores it (ignored in created
    # but the context is usable again), the second initialize succeeds and adds no listener again
    'U52': [ev('C', plan=G01P), ev('init', fail='lost'), ev('R'), ev('init')],
    # R31-11 (a): two failed initializes, then a successful one, then dispose: the listeners are added once and removed once
    'U53': [ev('C', plan=G01P), ev('init', fail='compile'), ev('init', fail='link'), ev('init'), ev('D')],
    # R31-11 (b): after dispose in ready, L and R are ignored (no line); status().contextLost is the context's own flag
    'U54': [ev('init'), ev('C', plan=G01P), ev('D'), ev('L'), ev('R'), ev('L')],
    # the same after dispose in lost (the flag was true at the dispose; R makes the context usable again)
    'U55': [ev('init'), ev('C', plan=G01P), ev('L'), ev('D'), ev('R'), ev('L'), ev('R')],
    # the same after dispose in created (after a failed initialize; the context was released at dispose)
    'U56': [ev('init', fail='compile'), ev('D'), ev('L'), ev('R')],
    # the same after dispose in failed
    'U57': [ev('init'), ev('C', plan=G01P), ev('L'), ev('R', fail='compile'), ev('D'), ev('R'), ev('L')],
}
ULOG = {}
for uid, events in UROWS.items():
    lg, sts = run(events)
    ULOG[uid] = (lg, sts)
    wr('gllog/%s.log' % uid, lg)
    row(uid, 'subject', '', '', J({'events': events, 'expect_log': 'gllog/%s.log' % uid, 'expect_status': sts}),
        'gllog/%s.log' % uid, '')


def lines(uid):
    return [json.loads(x) for x in ULOG[uid][0].decode().split('\n') if x]


def names(uid):
    return [x[0] for x in lines(uid)]


def phases(uid):
    return [(s['phase'], s['contextLost'], s.get('failure')) for s in ULOG[uid][1]]


# statements the rows must show (asserted so that the claim in the README is the row's content)
l50 = lines('U50')
assert l50[0] == ['addEventListener', 'webglcontextlost'] and l50[1] == ['addEventListener', 'webglcontextrestored']
assert l50[-3] == ['getShaderParameter', 'arrow.vs', 'COMPILE_STATUS'], l50[-3]
assert l50[-2] == ['onError', 'INVALID_INPUT/INVALID_VALUE', 'CONTEXT_LOST'] and l50[-1][0] == 'reject'
assert 'getShaderInfoLog' not in names('U50') and not any(n.startswith('delete') for n in names('U50'))
assert phases('U50') == [('created', True, 'CONTEXT_LOST')]
assert 'loseContext' not in names('U51') and names('U51')[-3:] == ['removeEventListener', 'removeEventListener', 'onStatus']
assert lines('U51')[-1] == ['onStatus', 'disposed', 1, None]
for u in ('U52', 'U53'):
    assert names(u).count('addEventListener') == 2, u                                        # once, not twice
assert names('U52').count('createShader') == 7 and phases('U52') == [('created', False, None), ('created', True, 'CONTEXT_LOST'),
                                                                     ('created', False, 'CONTEXT_LOST'), ('ready', False, None)]
assert names('U53').count('removeEventListener') == 2 and phases('U53')[-1] == ('disposed', False, None)
assert [s[2] for s in phases('U53')] == [None, 'COMPILE_FAILED', 'LINK_FAILED', None, None]
for u in ('U54', 'U55', 'U56', 'U57'):
    after = names(u)
    assert after[-1] in ('onStatus',) and after.count('preventDefault') == (1 if u in ('U55', 'U57') else 0), u
assert [p[1] for p in phases('U54')] == [False, False, False, True, False, True]
assert [p[1] for p in phases('U55')] == [False, False, True, True, False, True, False]
assert [p[1] for p in phases('U56')] == [False, False, True, False]
assert [p[1] for p in phases('U57')] == [False, False, True, False, False, False, True]
# nothing is logged for L or R after dispose: the log ends with the onStatus of the dispose
for u in ('U54', 'U55', 'U56', 'U57'):
    assert lines(u)[-1][:2] == ['onStatus', 'disposed'], u

# =================================================================== mutants: switchable variants, run over every row they can reach
EXIST_W = [r[0] for r in EXPECT if r[0][0] == 'W' and r[7] == 'INVALID_INPUT/SCHEMA']
W47_FILES = json.loads([r for r in EXPECT if r[0] == 'W47'][0][5])['files']
W01_FILES = json.loads([r for r in EXPECT if r[0] == 'W01'][0][5])['files']
EXIST_X = {}
for r in EXPECT:
    if r[0][0] == 'X':
        inp = json.loads(r[5])
        if inp.get('from') == 'gl' and not inp.get('lenient'):
            EXIST_X[r[0]] = inp['plan']
GB_EXPECTED = []                                                                              # plans that are planner outputs of G and B rows
for r in EXPECT:
    if r[0][0] in 'GB' and r[6].endswith('.glplan'):
        GB_EXPECTED.append(r[6])
        if r[5].startswith('{'):
            for c in json.loads(r[5]).get('also', []):
                if c.get('expected', '').endswith('.glplan'):
                    GB_EXPECTED.append(c['expected'])


def _pid(t, prog):
    return t[8] if prog == 'edge' else (t[2] if prog == 'disc' else t[6])


def violations6(data, mut):
    v = set(G.violations(data))
    if mut != 'K157':
        return v
    try:
        pl = G.Plan.parse(data)
    except Exception:
        return v
    lay = pl.layers

    def ps(layer):
        prog = G.PROG[layer]
        return [_pid(t, prog) for t in lay.get(layer, [])]
    s = {k: set(ps(k)) for k in range(1, 8)}
    sub_ok = (s[1] <= s[3] and s[2] <= s[3] and s[4] <= s[3] and s[5] <= s[7] and s[6] <= s[7])
    once = lambda xs: {x for x in xs if xs.count(x) == 1}                                    # a repeated pid is not counted
    om = [e for e in pl.h['cn'] + pl.h['ce'] if e[1] & 2]
    nfoc = len(once(ps(2)) | once(ps(6))) + len(om)
    v.discard('G12')
    if not sub_ok or nfoc > 1:
        v.add('G12')
    return v


def w_outcome(rid, mut):
    if rid == 'W47':
        return tuple('rej' if violations6(rd(f), mut) else 'ok' for f in W47_FILES)
    if rid == 'W01':
        return tuple('rej' if violations6(rd(f), mut) else 'ok' for f in W01_FILES)
    if rid == 'W50':
        return tuple('rej' if violations6(rd(f), mut) else 'ok' for f in ACC)
    data = BAD[rid][0] if rid in BAD else rd('bad/%s.glplan' % rid)
    return ('rej',) if violations6(data, mut) else ('ok',)


def x_outcome(rid, mut):
    data = XPLAN[rid] if rid in XPLAN else rd(EXIST_X[rid])
    if violations6(data, mut):
        return b'REJECTED'
    if mut == 'K159':
        pl = G.Plan.parse(data)
        n = len(pl.layers.get(2, [])) + len(pl.layers.get(6, [])) + len([e for e in pl.h['cn'] + pl.h['ce'] if e[1] & 2])
        if n > 1:
            return b'REJECTED'                                                                # counts instances, refuses a chain of one pid
    return G.readout_from_gl(data)


def plan_outcome(path, data, mut):
    """the planner's output for a plan file; K158 emits the focus halo of a clipped edge for its first segment only"""
    if mut != 'K158':
        return data
    pl = G.Plan.parse(data)
    if 2 in pl.layers:
        seen, keep = set(), []
        for t in pl.layers[2]:
            if t[8] not in seen:
                seen.add(t[8])
                keep.append(t)
        pl.layers[2] = keep
    return pl.serialize()


def u_outcome(rid, mut):
    ev_ = UROWS[rid] if rid in UROWS else EXIST_U[rid]
    return run(ev_, mut)


# (id, description, named killers)
MUT = [
    ('K157', 'G12 ignores a pid that repeats (a focused edge of several clipped segments is not counted as a focus)', ['W48', 'W49']),
    ('K158', 'the planner writes the focus halo (layer 2) of a clipped edge for its first segment only', ['B24']),
    ('K159', 'readoutFromGl counts the instances of layers 2 and 6 as foci and refuses a clipped focused edge', ['X19', 'X20']),
    ('K160', 'a loss during creation calls getShaderInfoLog before the failure is reported', ['U50', 'U51', 'U52']),
    ('K161', 'a loss during creation still deletes the objects created so far', ['U50', 'U51', 'U52']),
    ('K162', 'a loss during creation is reported with the token COMPILE_FAILED instead of CONTEXT_LOST', ['U50', 'U51', 'U52']),
    ('K163', 'a loss during creation puts the controller in phase lost (onStatus) instead of leaving it in created', ['U50', 'U51', 'U52']),
    ('K164', 'dispose after a loss during creation releases the lost context (getExtension, loseContext)', ['U51']),
    ('K165', 'a second initialize in created adds the two listeners again', ['U52', 'U53']),
    ('K166', 'a second initialize in created after a failed one is ignored', ['U52', 'U53']),
    ('K167', 'status().contextLost after dispose is the value kept from the dispose', ['U54', 'U55', 'U56', 'U57']),
    ('K168', 'after dispose a loss event still runs the loss handler (preventDefault)', ['U54', 'U55', 'U56', 'U57']),
    ('K169', 'after dispose a restore event rebuilds the resources', ['U54', 'U55', 'U56', 'U57']),
    ('K170', 'status().contextLost is derived from the phase (true only in lost), not from the context', ['U42', 'U43', 'U54']),
    ('K171', 'a loss event in created moves the controller to lost (preventDefault, labels.clear, onStatus)', ['U42', 'U43']),
    ('K172', 'a loss event in created calls onStatus without a phase change', ['U42', 'U43']),
]
W_ROWS = list(BAD) + ['W50', 'W47', 'W01'] + EXIST_W
X_ROWS = list(XPLAN) + list(EXIST_X)
U_ROWS = list(UROWS) + sorted(EXIST_U, key=lambda x: int(x[1:]))
base_w = {r: w_outcome(r, None) for r in W_ROWS}
base_x = {r: x_outcome(r, None) for r in X_ROWS}
base_u = {r: u_outcome(r, None) for r in U_ROWS}
for r in EXIST_W:
    assert base_w[r] == ('rej',), r
assert base_w['W47'] == ('ok',) * 5 and base_w['W50'] == ('ok', 'ok'), (base_w['W47'], base_w['W50'])
for xid in EXIST_X:
    assert base_x[xid] == rd('xr/%s.xr.json' % xid), xid
for xid, b in XPLAN.items():
    assert base_x[xid] == rd('xr/%s.xr.json' % xid), xid
B_ROWS = {'B24': B24, 'B24b': B24b}
for k in GB_EXPECTED:
    assert plan_outcome(k, rd(k), None) == rd(k)


def key(x):
    return (x[0], int(x[1:]))


def fold(x):
    return {'B24b': 'B24'}.get(x, x)


mut_lines, RES = [], {}
for fid, desc, named in MUT:
    changed = set()
    for r in W_ROWS:
        if w_outcome(r, fid) != base_w[r]:
            changed.add(r)
    for r in X_ROWS:
        if x_outcome(r, fid) != base_x[r]:
            changed.add(r)
    for r, b in B_ROWS.items():
        if plan_outcome(r, b, fid) != b:
            changed.add(fold(r))
    for k in GB_EXPECTED:                                    # the planner outputs of the G and B rows that already exist
        if plan_outcome(k, rd(k), fid) != rd(k):
            changed.add(k)
    for r in U_ROWS:
        if u_outcome(r, fid) != base_u[r]:
            changed.add(r)
    chg = sorted(changed, key=lambda x: key(x) if x[0] in 'BWXU' and x[1:].isdigit() else (x, 0))
    named = sorted(set(named), key=key)
    kill = [n for n in named if n in changed]
    miss = [n for n in named if n not in changed]
    other = [c for c in chg if c not in named]
    verdict = 'KILLED' if kill and not miss else 'NOT KILLED'
    assert verdict == 'KILLED', (fid, kill, miss)
    mut_lines.append('\t'.join([fid, desc, ','.join(named), ','.join(kill), ','.join(miss), ','.join(other), verdict]))
    RES[fid] = {'named': named, 'kill': kill, 'miss': miss, 'other': other}
    row(fid, '', '', '', '', '', '')

# =================================================================== append to the index files (nothing else is rewritten)
have = rd('EXPECT.tsv').decode('utf-8')
for r in ROWS:
    assert r[0] not in IDS and ('\n' + r[0] + '\t') not in have, r[0]
order = {'B': 0, 'W': 1, 'X': 2, 'U': 3, 'K': 4}
srt = sorted(ROWS, key=lambda r: (order[r[1]], int(r[0][1:].rstrip('b'))))
ids = [r[0] for r in srt]
assert len(ids) == len(set(ids))


def append(p, text):
    fp = os.path.join(ROOT, p)
    with open(fp, 'rb') as f:
        old = f.read()
    assert old.endswith(b'\n') and '\r' not in text
    with open(fp, 'wb') as f:
        f.write(old + text.encode('utf-8'))


append('EXPECT.tsv', ''.join('\t'.join(r) + '\n' for r in srt))
append('MUTANTS.tsv', '\n'.join(mut_lines) + '\n')
out = os.environ.get('REV6_OUT')
if out:
    with open(out, 'w') as f:
        json.dump({'new_files': NEW, 'rows': ids, 'mutants': RES}, f, indent=1, sort_keys=True)
        f.write('\n')
print('new files', len(NEW), 'rows', len(ROWS), 'mutants', len(MUT))
for k, v in RES.items():
    print(k, 'killed by', v['kill'], 'other changed rows', v['other'])
