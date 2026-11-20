"""Independent reference logic for the single-focus and controller rows added to oracles-gl.

Written from design 31 rev 5 (7.2 plan and reader rules G1-G16, 7.4, 7.5, 7.6, 9.1, 9.3, Appendix A.5.1) alone.
Standard library only. No TypeScript, no packages/*/src was read to write this.
"""
import hashlib
import json
import re
import struct

# ------------------------------------------------------------------ canonical text (4.2, IGS/1 5.4)


def _s(x):
    out = ['"']
    for ch in x:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == '\\':
            out.append('\\\\')
        elif ch == '\b':
            out.append('\\b')
        elif ch == '\t':
            out.append('\\t')
        elif ch == '\n':
            out.append('\\n')
        elif ch == '\f':
            out.append('\\f')
        elif ch == '\r':
            out.append('\\r')
        elif o < 0x20:
            out.append('\\u%04x' % o)
        else:
            out.append(ch)
    out.append('"')
    return ''.join(out)


def cj(v):
    if v is True:
        return 'true'
    if v is False:
        return 'false'
    if v is None:
        return 'null'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return _s(v)
    if isinstance(v, (list, tuple)):
        return '[' + ','.join(cj(x) for x in v) + ']'
    if isinstance(v, dict):
        ks = sorted(v.keys(), key=lambda k: k.encode('utf-16-be'))
        return '{' + ','.join(_s(k) + ':' + cj(v[k]) for k in ks) + '}'
    raise TypeError(repr(v))


EDGE, DISC, ARROW = '<ffffffffIBBH', '<ffIBBH', '<ffffffI'
STRIDE = {'arrow': 28, 'disc': 16, 'edge': 40}
PROG = {1: 'edge', 2: 'edge', 3: 'edge', 4: 'arrow', 5: 'disc', 6: 'disc', 7: 'disc'}
GB = 256000
MUT = {'name': None}


# ------------------------------------------------------------------ the plan as a structure
class Plan:
    """header (a dict), the table lines, the T lines (all lists of parsed JSON), and the instances per layer
    (each a tuple of the struct fields).  serialize() recomputes draws and sizes from the instances."""

    def __init__(self, header, nodes, edges, texts, layers):
        self.h = header
        self.nodes, self.edges, self.texts = nodes, edges, texts
        self.layers = {k: list(v) for k, v in layers.items()}

    @staticmethod
    def parse(data):
        i = data.index(b'\n')
        h = json.loads(data[:i].decode('utf-8'))
        pos = i + 1
        nodes, edges, texts = [], [], []
        while data[pos:pos + 4] in (b'["n"', b'["e"', b'["T"'):
            j = data.index(b'\n', pos)
            r = json.loads(data[pos:j].decode('utf-8'))
            {'n': nodes, 'e': edges, 'T': texts}[r[0]].append(r[1] if r[0] != 'T' else r)
            pos = j + 1
        buf = data[pos:]
        sz = h['sizes']
        eb, db, ab = buf[:sz['edge']], buf[sz['edge']:sz['edge'] + sz['disc']], buf[sz['edge'] + sz['disc']:]
        bufs = {'edge': (eb, EDGE, 40), 'disc': (db, DISC, 16), 'arrow': (ab, ARROW, 28)}
        layers = {}
        for d in h['draws']:
            b, fmt, st = bufs[d['program']]
            layers[d['layer']] = [struct.unpack(fmt, b[(d['first'] + k) * st:(d['first'] + k + 1) * st])
                                  for k in range(d['count'])]
        return Plan(h, nodes, edges, texts, layers)

    def serialize(self, edit_header=None):
        h = dict(self.h)
        draws = []
        off = {'edge': 0, 'disc': 0, 'arrow': 0}
        bufs = {'edge': b'', 'disc': b'', 'arrow': b''}
        fmt = {'edge': EDGE, 'disc': DISC, 'arrow': ARROW}
        for layer in range(1, 8):
            ins = self.layers.get(layer, [])
            if not ins:
                continue
            p = PROG[layer]
            draws.append({'count': len(ins), 'first': off[p], 'layer': layer, 'program': p})
            off[p] += len(ins)
            for t in ins:
                bufs[p] += struct.pack(fmt[p], *t)
        h['draws'] = draws
        h['sizes'] = {k: len(v) for k, v in bufs.items()}
        h['nd'], h['ed'], h['nt'] = len(self.nodes), len(self.edges), len(self.texts)
        if edit_header:
            edit_header(h)
        out = (cj(h) + '\n').encode()
        for n in self.nodes:
            out += (cj(['n', n]) + '\n').encode()
        for e in self.edges:
            out += (cj(['e', e]) + '\n').encode()
        for t in self.texts:
            out += (cj(t) + '\n').encode()
        return out + bufs['edge'] + bufs['disc'] + bufs['arrow']


# ------------------------------------------------------------------ the strict reader rules G1-G16 (7.2), one function per rule
HEX64 = re.compile(r'^[0-9a-f]{64}$')
ADDR_N = ('id', 'type')
ADDR_E = ('ord', 'rel', 'src', 'tgt')
KEYS = ['artifact', 'ce', 'cn', 'd', 'draws', 'ed', 'format', 'g', 'h', 'layout', 'nd', 'nt', 'scene', 'seg', 'sizes',
        'stride', 'w']


def violations(data):
    """the set of reader rules (G1..G16) a plan violates; the strict reader of 7.2 rejects iff it is non-empty.
    Each rule is judged on its own text; the structure is recovered as 'How the reader measures' says."""
    v = set()
    try:
        i = data.index(b'\n')
        h = json.loads(data[:i].decode('utf-8'))
    except Exception:
        return {'G1'}
    pos = i + 1
    nodes, edges, texts = [], [], []
    raw_tbl = []
    while data[pos:pos + 4] in (b'["n"', b'["e"', b'["T"'):
        j = data.index(b'\n', pos)
        try:
            r = json.loads(data[pos:j].decode('utf-8'))
        except Exception:
            return {'G13'}
        {'n': nodes, 'e': edges, 'T': texts}[r[0]].append(r)
        if r[0] != 'T':
            raw_tbl.append((r, data[pos:j].decode('utf-8')))
        pos = j + 1
    rest = data[pos:]
    # G1
    try:
        if data[:i].decode('utf-8') != cj(h) or sorted(h.keys(), key=lambda k: k.encode('utf-16-be')) != KEYS:
            v.add('G1')
        if (h['format'] != 'igr-gl/1' or h['seg'] != 16 or h['g'] != 256000 or h['stride'] != STRIDE
                or not (1 <= h['w'] <= 16384 and 1 <= h['h'] <= 16384) or h['d'] not in (0, 1)
                or not all(HEX64.match(h[k]) for k in ('artifact', 'layout', 'scene'))):
            v.add('G1')
    except Exception:
        return {'G1'}
    sz = h['sizes']
    # G2
    if sz['edge'] + sz['disc'] + sz['arrow'] != len(rest):
        v.add('G2')
    # G3
    for k in ('edge', 'disc', 'arrow'):
        if sz[k] % STRIDE[k]:
            v.add('G3')
    eb, db, ab = rest[:sz['edge']], rest[sz['edge']:sz['edge'] + sz['disc']], rest[sz['edge'] + sz['disc']:][:sz['arrow']]
    bufs = {'edge': eb, 'disc': db, 'arrow': ab}
    # G4
    prev = 0
    for d in h['draws']:
        if not (1 <= d['layer'] <= 7) or d['layer'] <= prev or PROG[d['layer']] != d['program'] or d['count'] < 1:
            v.add('G4')
        prev = d['layer']
    # G5
    end = {'edge': 0, 'disc': 0, 'arrow': 0}
    for d in h['draws']:
        if 1 <= d['layer'] <= 7:
            p = PROG[d['layer']]
            if d['first'] != end[p]:
                v.add('G5')
            end[p] = d['first'] + d['count']
    for p in end:
        if end[p] != len(bufs[p]) // STRIDE[p]:
            v.add('G5')
    # instances per layer (the layer decides the program, G5's measurement)
    lay = {}
    fmt = {'edge': EDGE, 'disc': DISC, 'arrow': ARROW}
    for d in h['draws']:
        if not (1 <= d['layer'] <= 7):
            continue
        p = PROG[d['layer']]
        b, st = bufs[p], STRIDE[p]
        lst = []
        for k in range(d['count']):
            sl = b[(d['first'] + k) * st:(d['first'] + k + 1) * st]
            if len(sl) == st:
                lst.append(struct.unpack(fmt[p], sl))
        lay[d['layer']] = lst
    import math
    for layer, lst in lay.items():
        p = PROG[layer]
        nf = {'edge': 8, 'disc': 2, 'arrow': 6}[p]
        for t in lst:
            # G6
            for f in t[:nf]:
                if (math.isnan(f) or math.isinf(f) or (f == 0 and math.copysign(1, f) < 0) or f != int(f)
                        or abs(f) >= 16777216):
                    v.add('G6')
            if p == 'edge':
                c1x, c1y, c2x, c2y, pid, kind, style, pad = t[2], t[3], t[4], t[5], t[8], t[9], t[10], t[11]
                if kind > 2 or style > 2 or style != layer - 1:
                    v.add('G7')
                if pad:
                    v.add('G8')
                if (kind == 0 and (c1x or c1y or c2x or c2y)) or (kind == 1 and (c2x or c2y)):
                    v.add('G10')
            elif p == 'disc':
                pid, style, cat, pad = t[2], t[3], t[4], t[5]
                if style > 2 or style != layer - 5 or cat > 8 or (layer != 7 and cat != 0):
                    v.add('G7')
                if pad:
                    v.add('G8')
            else:
                pid = t[6]
            if pid < 1:
                v.add('G9')
    # G11
    for layer, lst in lay.items():
        p = PROG[layer]
        pids = [t[8] if p == 'edge' else (t[2] if p == 'disc' else t[6]) for t in lst]
        if layer <= 3:
            if any(b < a for a, b in zip(pids, pids[1:])):
                v.add('G11')
            for a, b, ta in zip(pids, pids[1:], lst):
                if a == b and ta[9] != 0:
                    v.add('G11')        # a form-1 or form-2 instance is never repeated
        else:
            if any(b <= a for a, b in zip(pids, pids[1:])):
                v.add('G11')

    def pidset(layer):
        p = PROG[layer]
        return {(t[8] if p == 'edge' else (t[2] if p == 'disc' else t[6])) for t in lay.get(layer, [])}
    nd, ed = h['nd'], h['ed']
    cn, ce = h['cn'], h['ce']
    # G12 subsets, and at most one focus
    if not (pidset(1) <= pidset(3) and pidset(2) <= pidset(3) and pidset(4) <= pidset(3)
            and pidset(5) <= pidset(7) and pidset(6) <= pidset(7)):
        v.add('G12')
    mut = MUT['name']
    f2, f6 = pidset(2), pidset(6)
    om = [e for e in cn + ce if e[1] & 2]
    if mut == 'K130':
        nfoc = len(f2 | f6)
    elif mut == 'K131':
        nfoc = len(om)
    elif mut == 'K133':
        nfoc = len(lay.get(2, [])) + len(lay.get(6, [])) + len(om)
    elif mut == 'K134':
        nfoc = len(f2 | f6) + len([e for e in cn + ce if e[1]])
    elif mut == 'K135':
        nfoc = len(f2 | f6) + len([e for e in cn if e[1] & 2])
    elif mut == 'K136':
        nfoc = 0
    else:
        nfoc = len(f2 | f6) + len(om)
    if mut == 'K132':
        if len(f2) > 1 or len(f6) > 1:
            v.add('G12')
    elif nfoc > 1:
        v.add('G12')
    # G13
    ok13 = len(nodes) == nd and len(edges) == ed
    tbl = [json.dumps(x[1], sort_keys=True) for x in nodes + edges]
    ok13 = ok13 and len(set(tbl)) == len(tbl)
    ok13 = ok13 and all(sorted(x[1].keys()) == sorted(ADDR_N) for x in nodes)
    ok13 = ok13 and all(sorted(x[1].keys()) == sorted(ADDR_E) for x in edges)
    ok13 = ok13 and all(cj(x) == line for x, line in raw_tbl)
    for layer, lst in lay.items():
        for pid in pidset(layer):
            if layer >= 5 and pid > nd:
                ok13 = False
            if layer <= 4 and not (nd + 1 <= pid <= nd + ed):
                ok13 = False
    if not ok13:
        v.add('G13')
    # G14
    if len(texts) != h['nt'] or not texts:
        if len(texts) != h['nt']:
            v.add('G14')
    for t in texts:
        if (len(t) != 6 or not isinstance(t[5], str) or not t[5] or len(t[5].encode('utf-16-le')) // 2 > 24
                or any(c in t[5] for c in '\t\n\r') or t[2] != (0 if t[1] <= nd else 1)):
            v.add('G14')
    if len({t[1] for t in texts}) != len(texts):
        v.add('G14')
    # G15
    for lst, lo, hi, emitted in ((cn, 1, nd, pidset(7)), (ce, nd + 1, nd + ed, pidset(3))):
        pids = [e[0] for e in lst]
        if any(b <= a for a, b in zip(pids, pids[1:])) or any(not (lo <= p <= hi) for p in pids) \
                or any(len(e) != 2 or not (0 <= e[1] <= 3) for e in lst) or set(pids) & emitted:
            v.add('G15')
    # G16
    for lo, hi, emitted, om in ((1, nd, pidset(7), cn), (nd + 1, nd + ed, pidset(3), ce)):
        omitted = {e[0] for e in om}
        if any(p not in emitted and p not in omitted for p in range(lo, hi + 1)):
            v.add('G16')
    return v


# ------------------------------------------------------------------ readout from the plan alone (9.1, 9.3)
def readout_from_gl(data):
    p = Plan.parse(data)
    h = p.h
    nd, ed = h['nd'], h['ed']
    tbl = p.nodes + p.edges
    lay = p.layers
    n7 = lay.get(7, [])
    drawn_n = {t[2] for t in n7} | {e[0] for e in h['cn']}
    drawn_e = {t[8] for t in lay.get(3, [])} | {e[0] for e in h['ce']}
    sel_n = {t[2] for t in lay.get(5, [])} | {e[0] for e in h['cn'] if e[1] & 1}
    sel_e = {t[8] for t in lay.get(1, [])} | {e[0] for e in h['ce'] if e[1] & 1}
    mut = MUT['name']
    foc = {t[2] for t in lay.get(6, [])} | {t[8] for t in lay.get(2, [])}
    if mut not in ('K137', 'K138'):
        foc |= {e[0] for e in h['cn'] + h['ce'] if e[1] & 2}
    if mut == 'K138':          # the two flag bits of the omitted entries swapped
        foc |= {e[0] for e in h['cn'] + h['ce'] if e[1] & 1}
        sel_n = {t[2] for t in lay.get(5, [])} | {e[0] for e in h['cn'] if e[1] & 2}
        sel_e = {t[8] for t in lay.get(1, [])} | {e[0] for e in h['ce'] if e[1] & 2}
    assert len(foc) <= 1 or mut is not None
    cen = {t[2]: (int(t[0]), int(t[1])) for t in n7}
    at, far = [], []
    for pid in sorted(drawn_n):
        a = tbl[pid - 1]
        if pid in cen and -GB <= cen[pid][0] <= 1000 * h['w'] + GB and -GB <= cen[pid][1] <= 1000 * h['h'] + GB:
            at.append({'address': a, 'x': cen[pid][0], 'y': cen[pid][1]})
        else:
            far.append(a)
    texts = {t[1]: t[5] for t in p.texts}
    ro = {
        'igr': 'IGR/1', 'xr': 'igr-xr/1', 'scene_sha256': h['scene'], 'layout_sha256': h['layout'],
        'drawn': {'nodes': [tbl[x - 1] for x in sorted(drawn_n)], 'edges': [tbl[x - 1] for x in sorted(drawn_e)]},
        'marked': {'selected': {'nodes': [tbl[x - 1] for x in sorted(sel_n)],
                                'edges': [tbl[x - 1] for x in sorted(sel_e)]}},
        'nodes_at': at, 'nodes_far': far,
        'arrows': [tbl[x - 1] for x in sorted(drawn_e)] if h['d'] == 1 else [],
        'labels': {'nodes': [{'address': tbl[k - 1], 'text': t} for k, t in sorted(texts.items()) if k <= nd],
                   'edges': [{'address': tbl[k - 1], 'text': t} for k, t in sorted(texts.items()) if k > nd]},
        'label_units': sum(len(t.encode('utf-16-le')) // 2 for t in texts.values()),
    }
    if foc:
        f = sorted(foc)[0]
        ro['marked']['focus'] = {'node': tbl[f - 1]} if f <= nd else {'edge': tbl[f - 1]}
    return (cj(ro) + '\n').encode()


# ------------------------------------------------------------------ the executor log (7.5, A.5.1) and the controller (7.6)
ATTR = {
    'arrow': [('a_tb1', 4, 'F', 0), ('a_b2', 2, 'F', 16)],
    'disc': [('a_center', 2, 'F', 0), ('a_meta', 4, 'U', 12)],
    'edge': [('a_ab', 4, 'F', 0), ('a_cb', 4, 'F', 16), ('a_meta', 4, 'U', 36)],
}
MODE = {'arrow': ('TRIANGLES', 3), 'disc': ('TRIANGLE_STRIP', 4), 'edge': ('TRIANGLE_STRIP', 34)}
ORDER = ['arrow', 'disc', 'edge']


class Fake:
    """the controller fake of 13.2: it logs the calls of 7.5 and the 7.6 vocabulary into one list"""

    def __init__(self, shader_dir_hashes):
        self.log = []
        self.lost = False
        self.sh = shader_dir_hashes      # 'arrow.vs' -> first 16 hex of the SHA-256 of the source

    def L(self, *a):
        self.log.append(list(a))


def _creation(fk, fail):
    """7.5 resource creation. fail: None | 'compile' | 'link' | 'lost'. returns (ok, token, created)
    created = ordered list of objects still alive (for the reverse-order cleanup)."""
    alive = []
    for prog in ORDER:
        for stage, kind in (('vs', 'VERTEX_SHADER'), ('fs', 'FRAGMENT_SHADER')):
            nm = '%s.%s' % (prog, stage)
            fk.L('createShader', nm, kind)
            alive.append(('shader', nm))
            fk.L('shaderSource', nm, fk.sh[nm])
            fk.L('compileShader', nm)
            fk.L('getShaderParameter', nm, 'COMPILE_STATUS')
            if fail == 'lost' and nm == 'arrow.vs':
                fk.lost = True
                return False, 'CONTEXT_LOST', alive, True
            if fail == 'compile' and nm == 'disc.fs':
                fk.L('getShaderInfoLog', nm)
                return False, 'COMPILE_FAILED', alive, False
        fk.L('createProgram', prog)
        alive.append(('program', prog))
        fk.L('attachShader', prog, prog + '.vs')
        fk.L('attachShader', prog, prog + '.fs')
        fk.L('linkProgram', prog)
        fk.L('getProgramParameter', prog, 'LINK_STATUS')
        if fail == 'link' and prog == 'edge':
            fk.L('getProgramInfoLog', prog)
            return False, 'LINK_FAILED', alive, False
        fk.L('deleteShader', prog + '.vs')
        fk.L('deleteShader', prog + '.fs')
        alive = [a for a in alive if a not in (('shader', prog + '.vs'), ('shader', prog + '.fs'))]
        for a in ATTR[prog]:
            fk.L('getAttribLocation', prog, a[0])
        fk.L('getUniformLocation', prog, 'u_view')
        fk.L('getUniformLocation', prog, 'u_ink')
        fk.L('createVertexArray', prog)
        alive.append(('vao', prog))
    for prog in ORDER:
        fk.L('createBuffer', prog)
        alive.append(('buffer', prog))
    return True, None, alive, False


def _cleanup(fk, alive):
    for kind, nm in reversed(alive):
        fk.L({'shader': 'deleteShader', 'vao': 'deleteVertexArray', 'program': 'deleteProgram',
              'buffer': 'deleteBuffer'}[kind], nm)


def _frame(fk, plan_bytes, ink=(34, 34, 34)):
    p = Plan.parse(plan_bytes)
    h = p.h
    w, hh = h['w'], h['h']
    fk.L('viewport', 0, 0, w, hh)
    fk.L('clearColor', 0, 0, 0, 0)
    fk.L('clear', 'COLOR_BUFFER_BIT')
    fk.L('enable', 'BLEND')
    fk.L('blendFunc', 'ONE', 'ONE_MINUS_SRC_ALPHA')
    # the buffer bytes: re-serialize to get the three buffers exactly as stored
    raw = plan_bytes
    i = raw.index(b'\n') + 1
    while raw[i:i + 4] in (b'["n"', b'["e"', b'["T"'):
        i = raw.index(b'\n', i) + 1
    buf = raw[i:]
    sz = h['sizes']
    bufs = {'edge': buf[:sz['edge']], 'disc': buf[sz['edge']:sz['edge'] + sz['disc']],
            'arrow': buf[sz['edge'] + sz['disc']:]}
    for prog in ORDER:
        if len(bufs[prog]) > 0:
            fk.L('bindBuffer', 'ARRAY_BUFFER', prog)
            fk.L('bufferData', 'ARRAY_BUFFER', len(bufs[prog]), hashlib.sha256(bufs[prog]).hexdigest()[:16],
                 'DYNAMIC_DRAW')
    for d in h['draws']:
        prog = d['program']
        st = STRIDE[prog]
        fk.L('useProgram', prog)
        fk.L('uniform2f', prog + '.u_view', w, hh)
        fk.L('uniform3f', prog + '.u_ink', *ink)
        fk.L('bindVertexArray', prog)
        fk.L('bindBuffer', 'ARRAY_BUFFER', prog)
        for nm, size, kind, off in ATTR[prog]:
            fk.L('enableVertexAttribArray', prog + '.' + nm)
            if kind == 'F':
                fk.L('vertexAttribPointer', prog + '.' + nm, size, 'FLOAT', False, st, d['first'] * st + off)
            else:
                fk.L('vertexAttribIPointer', prog + '.' + nm, size, 'UNSIGNED_BYTE', st, d['first'] * st + off)
            fk.L('vertexAttribDivisor', prog + '.' + nm, 1)
        mode, verts = MODE[prog]
        fk.L('drawArraysInstanced', mode, 0, verts, d['count'])
    fk.L('bindVertexArray', None)


class Ctl:
    """7.6 as a pure reducer over the closed table, driven by events; `fk` is the fake. The release rule asks the
    fake's own flag (isContextLost) at dispose; the controller keeps no cached copy of it.
    `mut` switches one deliberately wrong behaviour on (the K130.. matrix)."""

    def __init__(self, fk, mut=None):
        self.fk = fk
        self.phase = 'created'
        self.failure = None
        self.plan = None
        self.have_ctx = False
        self.listeners = False
        self.ever_lost = False
        self.mut = mut

    def status(self):
        s = {'attributes': {'failIfMajorPerformanceCaveat': True}, 'contextLost': self.fk.lost, 'phase': self.phase}
        if self.failure:
            s['failure'] = self.failure
        return s

    def _status_line(self):
        self.fk.L('onStatus', self.phase, 1 if self.fk.lost else 0, self.failure)

    def _draw(self, restore=False):
        if self.plan is not None:
            _frame(self.fk, self.plan)
            self.fk.L('labels.draw')
        elif restore and self.mut == 'K153':
            self.fk.L('labels.draw')

    def _create(self, fail):
        ok, tok, alive, lost = _creation(self.fk, fail)
        if ok:
            return True, None
        if not lost or self.mut == 'K142':
            _cleanup(self.fk, alive)
        return False, tok if not lost else 'LOST'

    def ev(self, op, fail=None, plan=None):
        fk, ph, mut = self.fk, self.phase, self.mut
        if ph == 'disposed':
            if mut == 'K157' and op == 'D' and self.listeners:
                fk.L('removeEventListener', 'webglcontextlost')
                fk.L('removeEventListener', 'webglcontextrestored')
            return
        if op == 'init':
            if ph != 'created':
                if mut == 'K156' and ph in ('lost', 'failed'):
                    fk.L('addEventListener', 'webglcontextlost')
                    fk.L('addEventListener', 'webglcontextrestored')
                return
            fk.L('addEventListener', 'webglcontextlost')
            fk.L('addEventListener', 'webglcontextrestored')
            self.listeners = True
            self.have_ctx = True
            ok, tok = self._create(fail)
            if ok:
                self.phase, self.failure = 'ready', None
                if mut != 'K152':
                    self._draw()
                self._status_line()
            else:
                self.failure = tok
                fk.L('onError', 'INVALID_INPUT/INVALID_VALUE', tok)
                fk.L('reject', 'INVALID_INPUT/INVALID_VALUE', tok)
            return
        if op == 'C':
            if not (ph == 'failed' and mut == 'K154'):
                self.plan = plan
            if ph == 'ready':
                self._draw()
            return
        if op == 'F':
            if ph == 'ready':
                if mut == 'K158':
                    if self.plan is not None:
                        _frame(fk, self.plan)
                else:
                    self._draw()
            return
        if op == 'L':
            if self.have_ctx:
                fk.lost = True
                self.ever_lost = True
            if ph == 'created':
                if mut == 'K151':
                    fk.L('preventDefault')
                return
            if ph == 'ready':
                fk.L('preventDefault')
                fk.L('labels.clear')
                self.phase = 'lost'
                self._status_line()
            elif ph == 'lost':
                fk.L('preventDefault')
            elif ph == 'failed':
                fk.L('preventDefault')
                if mut == 'K155':
                    fk.L('labels.clear')
                self.phase, self.failure = 'lost', None
                self._status_line()
            return
        if op == 'R':
            if ph in ('created', 'ready'):
                fk.lost = False
                return
            fk.lost = False
            ok, tok = self._create(fail)
            if ok:
                self.phase, self.failure = 'ready', None
                self._draw(restore=True)
                self._status_line()
            elif tok == 'LOST':
                if ph == 'failed' and mut == 'K140':
                    return                                  # stays failed
                self.phase = 'lost'
                if not (ph == 'failed' and mut == 'K141'):
                    self.failure = None
                if ph == 'failed' and mut != 'K143':
                    self._status_line()
            else:
                if not (ph == 'failed' and mut == 'K145'):
                    self.failure = tok
                if not (ph == 'failed' and mut == 'K146'):
                    fk.L('onError', 'INVALID_INPUT/INVALID_VALUE', tok)
                if ph == 'lost':
                    self.phase = 'failed'
                    self._status_line()
                elif mut == 'K144':
                    self._status_line()
            return
        if op == 'D':
            if ph == 'ready':
                for nm in ('edge', 'disc', 'arrow'):
                    fk.L('deleteBuffer', nm)
                for nm in ('edge', 'disc', 'arrow'):
                    fk.L('deleteVertexArray', nm)
                    fk.L('deleteProgram', nm)
                fk.L('getExtension', 'WEBGL_lose_context')
                fk.L('loseContext')
            elif ph in ('created', 'failed'):
                lost = fk.lost
                if mut == 'K148' and ph == 'created':
                    lost = False                            # releases a lost context
                if mut == 'K149':
                    lost = self.ever_lost                   # a cached flag: never released once it was lost
                if self.have_ctx and not lost:
                    fk.L('getExtension', 'WEBGL_lose_context')
                    fk.L('loseContext')
            # lost: no release
            if self.listeners:
                fk.L('removeEventListener', 'webglcontextlost')
                fk.L('removeEventListener', 'webglcontextrestored')
            self.phase, self.failure = 'disposed', None
            self._status_line()
            return


def run_controller(events, plans, shader_hashes, mut=None):
    fk = Fake(shader_hashes)
    c = Ctl(fk, mut)
    sts = []
    for e in events:
        pl = plans[e['plan']] if e.get('plan') else None
        c.ev(e['op'], e.get('fail'), pl)
        sts.append(c.status())
    return fk.log, sts
