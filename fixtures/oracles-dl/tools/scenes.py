"""Authored scenes, FIXED layouts and the seeded searches of the oracles-dl corpus.

Layout coordinates are thousandths.  With the state `ident_state` (centre = (w*500, h*500),
zoom 1000) the screen position in milli-pixels equals the layout coordinate, so the authored
layouts below are written directly in screen milli-pixels."""
import hashlib
import json
import math

import core
from core import cjb, make_scene, make_layout, sha256, S
import dl as D

CORPUS = {}          # path -> bytes, authored files
INFO = {}            # searches and assertions recorded for README / inputs


def art(name):
    return hashlib.sha256(("oracles-dl:" + name).encode()).hexdigest()


def add_scene(name, directed, nodes, edges, pos):
    sb = make_scene(directed, nodes, edges, art(name))
    core.verify_scene_lite(sb)
    lb = make_layout(sb, pos)
    core.verify_layout_lite(lb, sb)
    CORPUS["scenes/%s.scene.json" % name] = sb
    CORPUS["layouts/%s.layout.json" % name] = lb
    return sb, lb


def P(i):
    return (i, "p")


def state_bytes(model, cx, cy, zoom, w, h, **kw):
    st = core.empty_state(model, {"center_x": cx, "center_y": cy, "height": h, "width": w, "zoom": zoom})
    for k, v in kw.items():
        st[k] = v
    return st


def ident_state(model, w, h):
    return state_bytes(model, w * 500, h * 500, 1000, w, h)


# ---------------------------------------------------------------- LCG (search)
class LCG:
    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def next24(self):
        self.s = (1664525 * self.s + 1013904223) & 0xFFFFFFFF
        return self.s >> 8


# ------------------------------------------------------ arrows (N03), by search
ARROW_SEED = 20261201
ARROW_BUDGET = 2_000_000


def arrow_variants(model_pts, directed=True):
    pass


def _arrow_probe(x1, y1, x2, y2, z=1001, w=900, h=600):
    """returns dict of variants -> differs for a straight edge between layout points at state (0,0,z)."""
    A = ((x1) * z + w * 500000, (y1) * z + h * 500000)
    B = ((x2) * z + w * 500000, (y2) * z + h * 500000)
    dx, dy = B[0] - A[0], B[1] - A[1]
    L = math.isqrt(dx * dx + dy * dy)
    if L <= 24 * S:
        return None
    A2 = D.trim_pt(A, B, 12 * S)
    B2 = D.trim_pt(B, A, 12 * S)
    pm = [(D.m_px(A2[0]), D.m_px(A2[1])), (D.m_px(B2[0]), D.m_px(B2[1]))]
    base = D.arrow_for(0, pm)
    out = {}
    for k in ("K26", "K27"):
        core.MUT.add(k)
        try:
            out[k] = D.arrow_for(0, pm) != base
        finally:
            core.MUT.discard(k)
    ru = {"form": 0, "pts": [A2, B2]}
    out["K28"] = D.arrow_k28(ru, pm) != base
    return out


def search_arrows():
    rng = LCG(ARROW_SEED)
    need = {"K26": 3, "K27": 3, "K28": 3}
    wit = {k: [] for k in need}
    trials = 0
    while trials < ARROW_BUDGET and any(len(wit[k]) < need[k] for k in need):
        trials += 1
        x1 = rng.next24() % 800001 - 400000
        y1 = rng.next24() % 500001 - 250000
        x2 = rng.next24() % 800001 - 400000
        y2 = rng.next24() % 500001 - 250000
        r = _arrow_probe(x1, y1, x2, y2)
        if r is None:
            continue
        dxp = abs(x2 - x1) * 1001 / 1e6
        dyp = abs(y2 - y1) * 1001 / 1e6
        if math.hypot(dxp, dyp) > 800:
            continue
        for k in need:
            if r[k] and len(wit[k]) < need[k]:
                wit[k].append((x1, y1, x2, y2))
    assert all(len(wit[k]) >= need[k] for k in need), "arrow search failed within budget"
    return trials, wit


def build_arrows():
    trials, wit = search_arrows()
    edges = []   # (x1,y1,x2,y2,label)
    base = [(100000, -200000, 125000, -200000), (-300000, -150000, -150000, -150000),
            (-300000, 0, -300000, 300000 - 20000), (0, -100000, 300000, 100000 - 100000 + 100000),
            (-200000, 100000, -100000, 200000 - 40000), (100000, -50000, 250000 - 12000, 150000 - 2000),
            (-380000, -240000, 380000, -240000)]
    # 3-4-5 triple (30, 40 -> 50 px at zoom 1001 is not exact; kept as an oblique baseline)
    allp = list(base)
    for k in ("K26", "K27", "K28"):
        allp += wit[k]
    nodes, ed, pos = [], [], {}
    for i, (x1, y1, x2, y2) in enumerate(allp):
        a, b = "s:e%02da" % i, "s:e%02db" % i
        nodes += [(a, "p"), (b, "p")]
        pos[a] = (x1, y1)
        pos[b] = (x2, y2)
        ed.append(((a, "p"), "R", (b, "p")))
    sb, lb = add_scene("arrows", True, nodes, ed, pos)
    model = core.build_model(sb, lb)
    st = state_bytes(model, 0, 0, 1001, 900, 600)
    CORPUS["states/N03.state.json"] = cjb(st)
    INFO["N03"] = {"seed": ARROW_SEED, "budget": ARROW_BUDGET, "trials": trials,
                   "witnesses": {k: [list(w) for w in wit[k]] for k in wit}}
    # assertions: each variant changes at least one A record
    state = st
    dl0 = D.build_dl(model, state)
    base_a = [r for r in dl0["records"] if r[0] == "A"]
    for k in ("K26", "K27", "K28"):
        core.MUT.add(k)
        try:
            dlm = D.build_dl(model, state)
        finally:
            core.MUT.discard(k)
        am = [r for r in dlm["records"] if r[0] == "A"]
        assert am != base_a, "N03 variant %s does not change any A" % k
    return model


# --------------------------------------------------------------- the others
def build_quadcub():
    nodes = [P("s:a"), P("s:b"), P("s:c"), P("s:d")]
    pos = {"s:a": (200000, 150000), "s:b": (500000, 150000), "s:c": (200000, 400000), "s:d": (600000, 400000)}
    edges = [(P("s:a"), "X", P("s:b")), (P("s:b"), "Y", P("s:a")), (P("s:c"), "L", P("s:c")),
             (P("s:c"), "S", P("s:d"))]
    sb, lb = add_scene("quadcub", True, nodes, edges, pos)
    return core.build_model(sb, lb)


def build_zerotrim():
    nodes = [P("s:a"), P("s:b")]
    # zoom 500: screen X = (x - cx) * 500 + 450e6 ; distance 48001 layout units = 24.0005 px
    best = None
    for xa in range(100001, 100401, 2):    # odd start so that the x residue is 500 micro-px
        pos = {"s:a": (xa, 200000), "s:b": (xa + 48001, 200000)}
        best = (xa, pos)
        break
    pos = best[1]
    edges = [(P("s:a"), "R", P("s:b"))]
    sb, lb = add_scene("zerotrim", True, nodes, edges, pos)
    model = core.build_model(sb, lb)
    st = state_bytes(model, 100000 + 24000, 200000, 500, 900, 600)
    CORPUS["states/N07.state.json"] = cjb(st)
    dl = D.build_dl(model, st)
    e = [r for r in dl["records"] if r[0] == "E"][0]
    assert e[4] == e[6] and e[5] == e[7], "zerotrim E record is not zero-length: %r" % (e,)
    a = [r for r in dl["records"] if r[0] == "A"][0]
    INFO["N07"] = {"E": e, "A": a}
    return model


def build_far():
    # directed: nodes f0..f7 (type p), positions in screen milli-px at the identity state 900x600
    ids = ["s:f%d" % i for i in range(8)]
    coords = [(450000, 300000), (-2000000000, 300000), (1000000001, 700003), (450000, -3000000000),
              (-256000 - 22000, 300000), (1156000 + 22000 + 1, 300000), (300000, 860000), (200000, 100000)]
    nodes = [P(i) for i in ids]
    pos = {i: c for i, c in zip(ids, coords)}
    edges = [(P("s:f1"), "R", P("s:f2")), (P("s:f0"), "R", P("s:f3")), (P("s:f0"), "R", P("s:f1")),
             (P("s:f0"), "R", P("s:f2")), (P("s:f1"), "Q", P("s:f3")), (P("s:f3"), "Q", P("s:f1")),
             (P("s:f0"), "L", P("s:f0")), (P("s:f4"), "R", P("s:f7")), (P("s:f5"), "R", P("s:f6"))]
    sb, lb = add_scene("far", True, nodes, edges, pos)
    model = core.build_model(sb, lb)
    return model


def build_far_u():
    nodes = [P("s:u0")]
    sb, lb = add_scene("far-u", False, nodes, [], {"s:u0": (0, 0)})
    model = core.build_model(sb, lb)
    for name, cx in (("N13", 450000 - (1 << 40)), ("N14", 450000 - (1 << 40) - 1),
                     ("R28", 706000), ("R29", 706001), ("R21", 0)):
        if name == "R21":
            continue
        CORPUS["states/%s.state.json" % name] = cjb(state_bytes(model, cx, 0, 1000, 900, 600))
    # assertions on the extreme coordinates
    for name, want in (("N13", 1 << 40), ("N14", (1 << 40) + 1), ("R28", -256000), ("R29", -256001)):
        st = json.loads(CORPUS["states/%s.state.json" % name].decode())
        X, Y = core.screen_xy(model, st, model["nodes"][0])
        assert D.m_px(X) == want, (name, D.m_px(X), want)
    return model


def build_brackets():
    ids = ["s:[[[[}}}}", 's:\\"', 's:{"a":{"b":{"c":1}}}']
    nodes = [P(i) for i in ids]
    pos = {ids[0]: (150000, 150000), ids[1]: (450000, 300000), ids[2]: (750000, 450000)}
    edges = [(P(ids[0]), "[[[[}}}}", P(ids[1])), (P(ids[1]), "}{][", P(ids[2]))]
    sb, lb = add_scene("brackets", True, nodes, edges, pos)
    return core.build_model(sb, lb)


def build_hostile():
    """C10: text that a replay must pass through unmodified (leading/trailing spaces, NFD, markup, U+2028, bidi)."""
    ids = ["s: x ", "s:e\u0301", 's:<script>"&"</script>', "s:a\u2028b", "s:\u202etxt", 's:b\\s"q']
    nodes = [P(i) for i in ids]
    pos = {ids[i]: (150000 + 250000 * (i % 3), 150000 + 250000 * (i // 3)) for i in range(6)}
    edges = [(P(ids[0]), "<&>", P(ids[1])), (P(ids[2]), "R", P(ids[2])), (P(ids[3]), "}{", P(ids[4]))]
    sb, lb = add_scene("hostile", True, nodes, edges, pos)
    return core.build_model(sb, lb)


def build_pick_scenes():
    m = {}
    # pickh: horizontal edge 200..700 at y 300 (screen milli-px)
    sb, lb = add_scene("pickh", True, [P("s:a"), P("s:b")], [(P("s:a"), "R", P("s:b"))],
                       {"s:a": (200000, 300000), "s:b": (700000, 300000)})
    m["pickh"] = core.build_model(sb, lb)
    # pickd: Pythagorean diagonal (300, 400 -> 500 px)
    sb, lb = add_scene("pickd", True, [P("s:a"), P("s:b")], [(P("s:a"), "R", P("s:b"))],
                       {"s:a": (100000, 100000), "s:b": (400000, 500000)})
    m["pickd"] = core.build_model(sb, lb)
    # pickv: a short antiparallel pair (strong curvature): 60 px apart
    sb, lb = add_scene("pickv", True, [P("s:a"), P("s:b")],
                       [(P("s:a"), "R", P("s:b")), (P("s:b"), "R", P("s:a"))],
                       {"s:a": (437000, 300000), "s:b": (463000, 300000)})
    m["pickv"] = core.build_model(sb, lb)
    # pickt: two parallel horizontal edges 10 px apart: a point halfway ties
    sb, lb = add_scene("pickt", True, [P("s:a"), P("s:b"), P("s:c"), P("s:d")],
                       [(P("s:a"), "R", P("s:b")), (P("s:c"), "R", P("s:d"))],
                       {"s:a": (100000, 200000), "s:b": (700000, 200000), "s:c": (100000, 210000),
                        "s:d": (700000, 210000)})
    m["pickt"] = core.build_model(sb, lb)
    # pickn: a node 10 px below a long edge
    sb, lb = add_scene("pickn", True, [P("s:a"), P("s:b"), P("s:n")], [(P("s:a"), "R", P("s:b"))],
                       {"s:a": (100000, 300000), "s:b": (800000, 300000), "s:n": (450000, 310000)})
    m["pickn"] = core.build_model(sb, lb)
    # pickb: an edge whose route crosses both borders of the 900x600 viewport
    sb, lb = add_scene("pickb", True, [P("s:a"), P("s:b")], [(P("s:a"), "R", P("s:b"))],
                       {"s:a": (-100000, 300000), "s:b": (1000000, 300000)})
    m["pickb"] = core.build_model(sb, lb)
    for k, mod in m.items():
        CORPUS["states/%s.state.json" % k] = cjb(ident_state(mod, 900, 600))
    return m


def build_all():
    models = {}
    models["arrows"] = build_arrows()
    models["quadcub"] = build_quadcub()
    models["zerotrim"] = build_zerotrim()
    models["far"] = build_far()
    models["far-u"] = build_far_u()
    models["brackets"] = build_brackets()
    models["hostile"] = build_hostile()
    models.update(build_pick_scenes())
    return models
