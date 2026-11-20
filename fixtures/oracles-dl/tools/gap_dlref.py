"""Independent reference logic for the single-focus rows of oracles-dl.

Written from design 31 rev 5 (4.1, 4.2, 4.8, 4.9, 6.1-6.3, 6.6, 9.1, 9.3) and 27 4.2 only.
Standard library only. No TypeScript, no packages/*/src was read to write this.
"""
import json

# ---------------------------------------------------------------- canonical text (4.2, IGS/1 5.4)
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
        assert not isinstance(v, bool)
        return str(v)
    if isinstance(v, str):
        return _s(v)
    if isinstance(v, (list, tuple)):
        return '[' + ','.join(cj(x) for x in v) + ']'
    if isinstance(v, dict):
        ks = sorted(v.keys(), key=lambda k: k.encode('utf-16-be'))
        return '{' + ','.join(_s(k) + ':' + cj(v[k]) for k in ks) + '}'
    raise TypeError(repr(v))


class Reject(Exception):
    """An IgrError: code/reason."""

    def __init__(self, code, detail=''):
        super().__init__(code)
        self.code = code
        self.detail = detail


# ---------------------------------------------------------------- display list model
class DList:
    def __init__(self, text):
        assert text.endswith('\n')
        self.lines = text[:-1].split('\n')
        self.recs = [json.loads(l) for l in self.lines]
        h = self.recs[0]
        assert h[0] == 'H' and h[1] == 'igr-dl/1'
        self.W, self.H, self.D = h[2], h[3], h[4]
        self.scene, self.layout = h[6], h[7]
        self.ND, self.ED = h[8], h[9]
        self.nodes = [r[1] for r in self.recs if r[0] == 'n']
        self.edges = [r[1] for r in self.recs if r[0] == 'e']
        assert len(self.nodes) == self.ND and len(self.edges) == self.ED
        self.nt = self.ND

    def table(self, pid):
        t = self.nodes + self.edges
        return t[pid - 1]

    def text(self, recs=None):
        recs = self.recs if recs is None else recs
        return ''.join(cj(r) + '\n' for r in recs)

    def with_flags(self, flags_by_pid):
        """a copy whose E and N records carry the given flags (pid -> flags); used to model a
        (faulty or hypothetical) executor input and a focused state"""
        out = []
        for r in self.recs:
            if r[0] in ('E', 'N') and r[1] in flags_by_pid:
                r = list(r)
                r[2 if r[0] == 'E' else 3] = flags_by_pid[r[1]]
            out.append(r)
        d = DList.__new__(DList)
        d.__dict__.update(self.__dict__)
        d.recs = out
        d.lines = [cj(r) for r in out]
        return d


PALETTE = [(42, 120, 214), (235, 104, 52), (27, 175, 122), (237, 161, 0), (232, 123, 164),
           (0, 131, 0), (74, 58, 167), (227, 73, 72), (122, 121, 117)]


# ---------------------------------------------------------------- replay (6.2) into the recorded stream (6.3)
def replay(dl, dpr=1000, ink=(34, 34, 34), layers=(1, 2, 3, 4, 5, 6, 7, 8)):
    out = []
    cache = {}
    MISSING = object()

    def tok(a):  # numbers in the stream: round(a * 1000) (already integers here)
        return a

    def m(name, *args):
        out.append(['m', name] + list(args))

    def assign(prop, val):
        if cache.get(prop, MISSING) != val:
            cache[prop] = val
            out.append(['s', prop, val])

    def rgb(c):
        return 'rgb(%d,%d,%d)' % c

    def dash(a):
        key = 'lineDash'
        if cache.get(key, MISSING) != a:
            cache[key] = a
            m('setLineDash', a)

    out.append(['m', 'setTransform', dpr, 0, 0, dpr, 0, 0])
    out.append(['m', 'clearRect', 0, 0, dl.W * 1000, dl.H * 1000])

    Es = [r for r in dl.recs if r[0] == 'E']
    As = [r for r in dl.recs if r[0] == 'A']
    Ns = [r for r in dl.recs if r[0] == 'N']
    Ts = [r for r in dl.recs if r[0] == 'T']

    def route(e):
        form = e[3]
        c = e[4:]
        m('moveTo', c[0], c[1])
        if form == 0:
            m('lineTo', c[2], c[3])
        elif form == 1:
            m('quadraticCurveTo', c[2], c[3], c[4], c[5])
        else:
            m('bezierCurveTo', c[2], c[3], c[4], c[5], c[6], c[7])

    def strokeStyleLayer(width, alpha, dsh):
        assign('strokeStyle', rgb(ink))
        assign('lineWidth', width)
        assign('globalAlpha', alpha)
        dash(dsh)

    for layer in layers:
        if layer in (1, 2, 3):
            sel = {1: [e for e in Es if e[2] & 1], 2: [e for e in Es if e[2] & 2], 3: Es}[layer]
            for e in sel:
                out.append(['#', e[1], layer])
                if layer == 1:
                    strokeStyleLayer(6000, 350, [])
                elif layer == 2:
                    strokeStyleLayer(10000, 250, [6000, 4000])
                else:
                    strokeStyleLayer(2000, 600, [])
                m('beginPath')
                route(e)
                m('stroke')
        elif layer == 4:
            for a in As:
                out.append(['#', a[1], 4])
                assign('fillStyle', rgb(ink))
                assign('globalAlpha', 600)
                m('beginPath')
                m('moveTo', a[2], a[3])
                m('lineTo', a[4], a[5])
                m('lineTo', a[6], a[7])
                m('closePath')
                m('fill')
        elif layer in (5, 6):
            sel = [n for n in Ns if n[3] & (1 if layer == 5 else 2)]
            for n in sel:
                out.append(['#', n[1], layer])
                if layer == 5:
                    strokeStyleLayer(3000, 1000, [])
                    r = 14000
                else:
                    strokeStyleLayer(2000, 1000, [4000, 3000])
                    r = 18000
                m('beginPath')
                m('arc', n[4], n[5], r, 0, 'TAU')
                m('stroke')
        elif layer == 7:
            for n in Ns:
                out.append(['#', n[1], 7])
                assign('fillStyle', rgb(PALETTE[n[2]]))
                assign('globalAlpha', 1000)
                m('beginPath')
                m('arc', n[4], n[5], 10000, 0, 'TAU')
                m('fill')
                assign('strokeStyle', 'rgb(255,255,255)')
                assign('lineWidth', 2000)
                assign('globalAlpha', 1000)
                dash([])
                m('stroke')
        elif layer == 8:
            if Ts:
                assign('fillStyle', rgb(ink))
                assign('globalAlpha', 1000)
                assign('font', '12px sans-serif')
                assign('textAlign', 'center')
                assign('textBaseline', 'alphabetic')
                assign('direction', 'ltr')
            for t in Ts:
                out.append(['#', t[1], 8])
                m('fillText', t[5], t[3], t[4])
    return ''.join(cj(r) + '\n' for r in out)


# ---------------------------------------------------------------- the strict stream reader (6.6, 9.3)
METHODS = {'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'closePath',
           'fill', 'stroke', 'fillText', 'clearRect', 'setTransform', 'setLineDash'}
PROPS = {'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'textAlign', 'textBaseline',
         'direction'}

# mutation switches of the reference reader (the K188.. matrix); None = the design's rule
MUT = {'name': None}


def read_stream(data, dl, rule=True, fn='readout'):
    """returns (sections) where sections = list of (pid, layer, [records]); raises Reject.
    rule=False disables the single-focus clause only (the single-fault property)."""
    if not data.endswith(b'\n'):
        raise Reject('INVALID_INPUT/SCHEMA', 'final LF')
    text = data.decode('utf-8')
    lines = text[:-1].split('\n')
    n_t = dl.ND
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

    def painted(sec):
        pid, layer, rs = sec
        names = {r[1] for r in rs if r[0] == 'm'}
        if layer in (1, 2, 3, 5, 6):
            return 'stroke' in names
        if layer == 4:
            return 'fill' in names
        if layer == 7:
            return 'fill' in names and 'stroke' in names
        return 'fillText' in names

    mut = MUT['name']
    if (mut == 'K194' and fn == 'witness') or (mut == 'K195' and fn == 'readout'):
        rule = False       # the rule exists in one call site only
    if rule:
        foc = [s for s in sections if s[1] in (2, 6)]
        if mut == 'K188':      # layer 2 ignored in the count
            foc = [s for s in foc if s[1] == 6]
        elif mut == 'K189':    # layer 6 ignored in the count
            foc = [s for s in foc if s[1] == 2]
        elif mut == 'K191':    # only painted sections counted
            foc = [s for s in foc if painted(s)]
        elif mut == 'K192':    # selection layers counted with the focus layers
            foc = [s for s in sections if s[1] in (1, 2, 5, 6)]
        if mut == 'K190':      # at most one per layer, not together
            if len([s for s in foc if s[1] == 2]) > 1 or len([s for s in foc if s[1] == 6]) > 1:
                raise Reject('INVALID_INPUT/SCHEMA', 'more than one focused element')
        elif mut == 'K196':    # a lone unpainted focus marker is refused
            if len(foc) > 1 or any(not painted(s) for s in foc):
                raise Reject('INVALID_INPUT/SCHEMA', 'more than one focused element')
        elif mut != 'K193' and len(foc) > 1:
            raise Reject('INVALID_INPUT/SCHEMA', 'more than one focused element')
    return [(s[0], s[1], s[2], painted(s)) for s in sections]


def stream_readout(data, dl, rule=True):
    secs = read_stream(data, dl, rule, 'readout')
    drawn_n, drawn_e, sel_n, sel_e = set(), set(), set(), set()
    focus = None
    centres = {}
    arrows = set()
    texts = {}
    for pid, layer, rs, p in secs:
        if layer == 7 and p:
            drawn_n.add(pid)
            for r in rs:
                if r[0] == 'm' and r[1] == 'arc':
                    centres[pid] = (r[2], r[3])
        elif layer == 3 and p:
            drawn_e.add(pid)
        elif layer == 1 and p:
            sel_e.add(pid)
        elif layer == 5 and p:
            sel_n.add(pid)
        elif layer in (2, 6) and p:
            focus = pid
        elif layer == 4 and p:
            arrows.add(pid)
        elif layer == 8 and p:
            for r in rs:
                if r[0] == 'm' and r[1] == 'fillText':
                    texts[pid] = r[2]
    nd = dl.ND
    G = 256000
    nodes_at, nodes_far = [], []
    for pid in sorted(drawn_n):
        cx, cy = centres[pid]
        a = dl.nodes[pid - 1]
        if -G <= cx <= 1000 * dl.W + G and -G <= cy <= 1000 * dl.H + G:
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


def stream_witness(data, dl, rule=True):
    secs = read_stream(data, dl, rule, 'witness')
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
    return cj(w).encode('utf-8')   # IGR-CJ/1 without a final LF (13.2)
