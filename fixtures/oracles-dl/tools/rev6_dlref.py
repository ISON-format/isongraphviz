"""Reference logic for the rev 6 additions of oracles-dl (design 31 rev 6, 6.6 "Reader rules", 9.3).

Standard library only.  Written from the design text (31 rev 6: 4.1, 4.8, 6.2, 6.3, 6.6, 9.1, 9.3).  It reuses the
canonical writer, the list model and the replay of gap_dlref.py (this corpus's own earlier reference, which the
generator proves against the existing expected bytes) and replaces the strict stream reader, the stream readout and
the witness by versions with the rev 6 reader rules:

  R31-02  markers for more than one pid in layers 2 and 6 together: INVALID_INPUT/SCHEMA
  R31-03  the count is of markers, painted or not; a lone marker is accepted and contributes no focus
  R31-04  the kind of every marker pid against its layer: layers 1-4 edge pids, 5-7 node pids, 8 either;
          a wrong kind is INVALID_INPUT/SCHEMA; the focus count is of markers

A pid is a node pid iff pid <= ND (4.3, 9.3).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gap_dlref as G  # noqa: E402

cj, Reject, DList, replay = G.cj, G.Reject, G.DList, G.replay
METHODS, PROPS = G.METHODS, G.PROPS

# mutation switch of this reference (the K201.. matrix); None = the design's rules
MUT = {'name': None}

FOCUS_LAYERS = (2, 6)


def _painted(sec):
    pid, layer, rs = sec
    names = {r[1] for r in rs if r[0] == 'm'}
    if layer in (1, 2, 3, 5, 6):
        return 'stroke' in names
    if layer == 4:
        return 'fill' in names
    if layer == 7:
        return 'fill' in names and 'stroke' in names
    return 'fillText' in names


def _kind_ok(pid, layer, nd, mut):
    """True iff the kind of `pid` fits `layer` (R31-04), with the mutant switches of the K201.. matrix"""
    is_node = pid <= nd
    if mut == 'K213':           # boundary one low: pid = ND is taken for an edge pid
        is_node = pid < nd
    elif mut == 'K214':         # boundary one high: pid = ND + 1 is taken for a node pid
        is_node = pid <= nd + 1
    if layer == 8:
        if mut == 'K210':
            return is_node       # layer 8 takes node pids only
        if mut == 'K211':
            return not is_node   # layer 8 takes edge pids only
        return True
    edge_layer = layer in (1, 2, 3, 4)
    if mut == 'K212':           # the two groups swapped
        edge_layer = not edge_layer
    return (not is_node) if edge_layer else is_node


def read_stream(data, dl, count=True, kind=True, fn='readout'):
    """the strict stream reader; returns [(pid, layer, records, painted)]; raises Reject.
    count=False disables the single-focus clause only, kind=False the kind check only (single-fault properties)."""
    mut = MUT['name']
    if not data.endswith(b'\n'):
        raise Reject('INVALID_INPUT/SCHEMA', 'final LF')
    text = data.decode('utf-8')
    lines = text[:-1].split('\n')
    total = dl.ND + dl.ED
    recs = []
    for i, l in enumerate(lines, 1):
        try:
            r = json.loads(l)
        except Exception:
            raise Reject('INVALID_INPUT/SCHEMA', 'line %d' % i)
        if cj(r) != l:
            raise Reject('INVALID_INPUT/SCHEMA', 'line %d not canonical' % i)
        if not isinstance(r, list) or not r:
            raise Reject('INVALID_INPUT/SCHEMA', 'line %d' % i)
        k = r[0]
        if k == 'm':
            if len(r) < 2 or r[1] not in METHODS:
                raise Reject('INVALID_INPUT/SCHEMA', 'line %d method' % i)
        elif k == 's':
            if len(r) != 3 or r[1] not in PROPS:
                raise Reject('INVALID_INPUT/SCHEMA', 'line %d property' % i)
        elif k == '#':
            if len(r) != 3 or not all(isinstance(x, int) and not isinstance(x, bool) for x in r[1:]):
                raise Reject('INVALID_INPUT/SCHEMA', 'line %d marker' % i)
            if not (1 <= r[1] <= total) or not (1 <= r[2] <= 8):
                raise Reject('INVALID_INPUT/SCHEMA', 'line %d marker range' % i)
        else:
            raise Reject('INVALID_INPUT/SCHEMA', 'line %d kind' % i)
        recs.append(r)
    sections = []
    cur = None
    last_layer, last_pid = 0, 0
    for r in recs:
        if r[0] == '#':
            pid, layer = r[1], r[2]
            if layer < last_layer:
                raise Reject('INVALID_INPUT/SCHEMA', 'layer order')
            if layer == last_layer and pid <= last_pid:
                raise Reject('INVALID_INPUT/SCHEMA', 'pid order')
            last_layer, last_pid = layer, pid
            cur = [pid, layer, []]
            sections.append(cur)
        elif cur is not None:
            cur[2].append(r)

    # ---- R31-04: the kind of every marker pid against its layer
    do_kind = kind
    if (mut == 'K216' and fn == 'readout') or (mut == 'K217' and fn == 'witness') or mut == 'K208':
        do_kind = False                                   # the check exists at one call site only / not at all
    if do_kind:
        for s in sections:
            pid, layer = s[0], s[1]
            if mut in ('K201', 'K202', 'K203', 'K204', 'K205', 'K206', 'K207') and layer == int(mut[1:]) - 200:
                continue                                  # not checked in this layer
            if mut == 'K209' and not _painted(s):
                continue                                  # unpainted sections not checked
            if not _kind_ok(pid, layer, dl.ND, mut):
                code = 'INVALID_INPUT/INVALID_VALUE' if mut == 'K215' else 'INVALID_INPUT/SCHEMA'
                raise Reject(code, 'marker pid %d of the wrong kind for layer %d' % (pid, layer))

    # ---- R31-02 / R31-03: the count of markers of layers 2 and 6 together
    do_count = count
    if do_count:
        foc = [s for s in sections if s[1] in FOCUS_LAYERS]
        if mut == 'K218':       # layer 6 counted by painted sections, layer 2 by markers
            foc = [s for s in foc if s[1] == 2 or _painted(s)]
        elif mut == 'K219':     # layer 2 counted by painted sections, layer 6 by markers
            foc = [s for s in foc if s[1] == 6 or _painted(s)]
        if len(foc) > 1:
            raise Reject('INVALID_INPUT/SCHEMA', 'more than one focused element')
        if mut == 'K220' and any(s[1] == 2 and not _painted(s) for s in foc):
            raise Reject('INVALID_INPUT/SCHEMA', 'a lone unpainted layer-2 marker')
        if mut == 'K221' and fn == 'witness' and any(not _painted(s) for s in foc):
            raise Reject('INVALID_INPUT/SCHEMA', 'a lone unpainted focus marker (witness only)')
    return [(s[0], s[1], s[2], _painted(s)) for s in sections]


def stream_readout(data, dl, **kw):
    secs = read_stream(data, dl, fn='readout', **kw)
    drawn_n, drawn_e, sel_n, sel_e = set(), set(), set(), set()
    focus = None
    centres, arrows, texts = {}, set(), {}
    for pid, layer, rs, p in secs:
        if not p:
            continue                       # a marker without painting calls contributes nothing (R44)
        if layer == 7:
            drawn_n.add(pid)
            for r in rs:
                if r[0] == 'm' and r[1] == 'arc':
                    centres[pid] = (r[2], r[3])
        elif layer == 3:
            drawn_e.add(pid)
        elif layer == 1:
            sel_e.add(pid)
        elif layer == 5:
            sel_n.add(pid)
        elif layer in (2, 6):
            focus = pid
        elif layer == 4:
            arrows.add(pid)
        elif layer == 8:
            for r in rs:
                if r[0] == 'm' and r[1] == 'fillText':
                    texts[pid] = r[2]
    nd = dl.ND
    guard = 256000
    nodes_at, nodes_far = [], []
    for pid in sorted(drawn_n):
        cx, cy = centres[pid]
        a = dl.nodes[pid - 1]
        if -guard <= cx <= 1000 * dl.W + guard and -guard <= cy <= 1000 * dl.H + guard:
            nodes_at.append({'address': a, 'x': cx, 'y': cy})
        else:
            nodes_far.append(a)
    ro = {
        'igr': 'IGR/1', 'xr': 'igr-xr/1',
        'scene_sha256': dl.scene, 'layout_sha256': dl.layout,
        'drawn': {'nodes': [dl.nodes[p - 1] for p in sorted(drawn_n)],
                  'edges': [dl.table(p) for p in sorted(drawn_e)]},
        'marked': {'selected': {'nodes': [dl.nodes[p - 1] for p in sorted(sel_n)],
                                'edges': [dl.table(p) for p in sorted(sel_e)]}},
        'nodes_at': nodes_at, 'nodes_far': nodes_far,
        'arrows': [dl.table(p) for p in sorted(arrows)],
        'labels': {'nodes': [{'address': dl.table(p), 'text': t} for p, t in sorted(texts.items()) if p <= nd],
                   'edges': [{'address': dl.table(p), 'text': t} for p, t in sorted(texts.items()) if p > nd]},
        'label_units': sum(len(t.encode('utf-16-le')) // 2 for t in texts.values()),
    }
    if focus is not None:
        ro['marked']['focus'] = {'node': dl.table(focus)} if focus <= nd else {'edge': dl.table(focus)}
    return (cj(ro) + '\n').encode('utf-8')


def stream_witness(data, dl, **kw):
    secs = read_stream(data, dl, fn='witness', **kw)
    dn, de = set(), set()
    for pid, layer, rs, p in secs:
        if layer == 7 and p:
            dn.add(pid)
        if layer == 3 and p:
            de.add(pid)
    w = {'backend': 'igr-cv/1',
         'elements': {'nodes': [dl.nodes[p - 1] for p in sorted(dn)],
                      'edges': [dl.table(p) for p in sorted(de)]},
         'texts': []}
    return cj(w).encode('utf-8')        # IGR-CJ/1 without a final LF (13.2)
