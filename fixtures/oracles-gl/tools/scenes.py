"""Authored scenes, FIXED layouts and states of this corpus (design 31 13.3/13.4: `far` and friends).

Convention used for every authored layout: the viewport state VP (900 x 600, zoom 1000, centre (450000, 300000)) maps a
layout coordinate (thousandths) to the SAME number of milli-pixels: m-px = layout value (X = (x - 450000)*1000 + 450,000,000
micro-pixels = 1000*x).  So a row can say "node at m-px (1178000, 300000)" and the layout holds exactly that.
"""
import json

import dlist
import ju
import plan as P
import scn

VP = {"center_x": 450000, "center_y": 300000, "zoom": 1000, "width": 900, "height": 600}
W, H = 900, 600


def _node(i, t="p"):
    return (t, "s:" + i)


def author(name, directed, nodes, edges):
    """nodes: [(id, x_mpx, y_mpx[, type])]; edges: [(src_id, rel, tgt_id)] (all type p unless a node says otherwise).
    Writes scenes/<name>.scene.json and layouts/<name>.layout.json into AUTH; returns the two paths."""
    types = {}
    nd = []
    pos = {}
    for n in nodes:
        i, x, y = n[0], n[1], n[2]
        t = n[3] if len(n) > 3 else "p"
        types[i] = t
        nd.append((t, "s:" + i))
        pos[(t, "s:" + i)] = (x, y)
    es = [((types[a], "s:" + a), rel, (types[b], "s:" + b)) for a, rel, b in edges]
    sb = scn.make_scene(name, directed, nd, es)
    lb = scn.make_layout(sb, pos)
    sp = scn.put("scenes/%s.scene.json" % name, sb)
    lp = scn.put("layouts/%s.layout.json" % name, lb)
    return sp, lp


def vp_state(model, name=None, selected_nodes=(), selected_edges=(), focus=None, hidden_nodes=(), hidden_edges=(), vp=None):
    v = vp or VP
    st = scn.make_state(model, v["width"], v["height"], v["center_x"], v["center_y"], v["zoom"], selected_nodes, selected_edges, focus, hidden_nodes, hidden_edges)
    if name:
        scn.put("states/%s.state.json" % name, scn.state_bytes(st))
    return st


def nidx(model, i, t="p"):
    return model.node_index[(t, "s:" + i)]


def eidx(model, a, rel, b, t="p"):
    for e in model.edges:
        r = e["ref"]
        if r["src"]["id"] == "s:" + a and r["tgt"]["id"] == "s:" + b and r["rel"] == rel:
            return e["index"]
    raise KeyError((a, rel, b))


def edge_max_coord(d, pid):
    for r in d.records:
        if r[0] == "E" and r[1] == pid:
            return max(abs(v) for v in r[4:])


def build_all():
    # ------------------------------------------------------------ wbase (rows W)
    author("wbase", True,
           [("n0", 100000, 100000, "a"), ("n1", 500000, 150000, "b"), ("n2", 300000, 450000, "a"), ("n3", 2000000000, 300000, "b"), ("n4", 3000000000, 4000000000, "a")],
           [("n0", "R", "n1"), ("n1", "R", "n2"), ("n2", "R", "n1"), ("n0", "R", "n3"), ("n3", "R", "n0"), ("n3", "R", "n4")])
    m = scn.load_model("scenes/wbase.scene.json", "layouts/wbase.layout.json")
    vp_state(m, "wbase", selected_nodes=[nidx(m, "n0", "a"), nidx(m, "n3", "b")],
             selected_edges=[eidx(m, "n0", "R", "n1", "a"), eidx(m, "n3", "R", "n4", "b")], focus=("e", eidx(m, "n1", "R", "n2", "b")))
    # ------------------------------------------------------------ far-a: the A.10 geometry (B11, B14, X06, X08)
    build_far_a()
    m = scn.load_model("scenes/far-a.scene.json", "layouts/far-a.layout.json")
    # ------------------------------------------------------------ far-b: a far end with an in-view start (B15)
    author("far-b", True, [("c", 500000, 300000), ("d", -1500000000, 2000000000)], [("c", "R", "d")])
    m = scn.load_model("scenes/far-b.scene.json", "layouts/far-b.layout.json")
    vp_state(m, "far-b")
    # ------------------------------------------------------------ far-pair (B12)
    build_far_pair()
    # ------------------------------------------------------------ far-out (B13): an edge wholly outside, selected; both ends omitted
    author("far-out", True, [("u", 2000000000, 2000000000), ("v", 2500000000, 2200000000), ("w", 450000, 300000)], [("u", "R", "v")])
    m = scn.load_model("scenes/far-out.scene.json", "layouts/far-out.layout.json")
    vp_state(m, "far-out", selected_edges=[0], selected_nodes=[nidx(m, "u")])
    # ------------------------------------------------------------ far-node (B16): node inclusion boundary 1178000 = 1156000 + 22000
    author("far-node", False,
           [("r0", 1178000, 300000), ("r1", 1178001, 300000), ("l0", -278000, 300000), ("l1", -278001, 300000),
            ("t0", 450000, -278000), ("t1", 450000, -278001), ("b0", 450000, 878000), ("b1", 450000, 878001)], [])
    m = scn.load_model("scenes/far-node.scene.json", "layouts/far-node.layout.json")
    vp_state(m, "far-node")
    # ------------------------------------------------------------ far-edge (X04): the readout's guard-box boundary 256000
    author("far-edge", False,
           [("e0", -256000, 300000), ("e1", -256001, 300000), ("f0", 1156000, 300000), ("f1", 1156001, 300000),
            ("g0", 450000, -256000), ("g1", 450000, -256001), ("h0", 450000, 856000), ("h1", 450000, 856001)], [])
    m = scn.load_model("scenes/far-edge.scene.json", "layouts/far-edge.layout.json")
    vp_state(m, "far-edge", selected_nodes=[nidx(m, "e1"), nidx(m, "g0")])
    # ------------------------------------------------------------ far-par (B18): an axis-parallel edge 5000 m-px above the top side
    author("far-par", True, [("h1", -20000000, -261000), ("h2", 300000, -261000)], [("h1", "R", "h2")])
    m = scn.load_model("scenes/far-par.scene.json", "layouts/far-par.layout.json")
    vp_state(m, "far-par")
    # ------------------------------------------------------------ far-incl (B19): edge inclusion boundary at exactly 12000
    author("far-incl", True, [("i1", 100000, -268000), ("i2", 300000, -268000), ("j1", 500000, -268001), ("j2", 700000, -268001)],
           [("i1", "R", "i2"), ("j1", "R", "j2")])
    m = scn.load_model("scenes/far-incl.scene.json", "layouts/far-incl.layout.json")
    vp_state(m, "far-incl")
    # ------------------------------------------------------------ far-coinc (B20)
    author("far-coinc", True, [("c1", 1164000, 300000), ("c2", 1164000, 300000)], [("c1", "R", "c2")])
    m = scn.load_model("scenes/far-coinc.scene.json", "layouts/far-coinc.layout.json")
    vp_state(m, "far-coinc")
    # ------------------------------------------------------------ far-away (B21): searched
    build_far_away()
    # ------------------------------------------------------------ far-thr (B01): searched threshold
    build_far_thr()


# ---------------------------------------------------------------- B21: seeded-free deterministic search

def build_far_away():
    """A directed, slightly tilted edge that ends above the top side of the guard box: its box expanded by 12000
    meets the guard box, one of its coordinates is beyond 2^24 so it is clipped, the clip leaves nothing (t0 > t1, p != 0)
    while its arrow triangle meets the guard box.  Found by scanning the y offset of the near end."""
    found = None
    for dy in range(1, 400):
        for yb in range(-262000, -255000):
            ya = yb - dy
            author("far-away", True, [("a", -20000000, ya), ("b", 300000, yb)], [("a", "R", "b")])
            m = scn.load_model("scenes/far-away.scene.json", "layouts/far-away.layout.json")
            st = vp_state(m)
            d = dlist.build_dl(m, st)
            E = [r for r in d.records if r[0] == "E"][0]
            A = [r for r in d.records if r[0] == "A"][0]
            pts = E[4:]
            xs, ys = pts[0::2], pts[1::2]
            GB = (-P.GUARD_MARGIN, -P.GUARD_MARGIN, 1000 * W + P.GUARD_MARGIN, 1000 * H + P.GUARD_MARGIN)
            box = (min(xs) - 12000, min(ys) - 12000, max(xs) + 12000, max(ys) + 12000)
            ab = (min(A[2], A[4], A[6]), min(A[3], A[5], A[7]), max(A[2], A[4], A[6]), max(A[3], A[5], A[7]))
            if not P.boxes_meet(box, GB) or not P.boxes_meet(ab, GB):
                continue
            if all(abs(v) < P.LIM24 for v in pts):
                continue
            if P.clip_segment((pts[0], pts[1]), (pts[2], pts[3]), W, H, P.GUARD_MARGIN) is not None:
                continue
            # p != 0 for the top boundary: the edge is not exactly horizontal
            if pts[1] == pts[3]:
                continue
            found = (dy, yb)
            break
        if found:
            break
    assert found, "B21 search failed"
    scn.put("inputs/B21.search.json", ju.ojson({"dy": found[0], "yb": found[1]}))
    vp_state(m, "far-away")


def build_far_thr():
    """B01: two parallel pairs a<->b1, a<->b2 whose far ends make the largest coordinate of the pair 16777215 (kept as
    written) and 16777216 (clipped); b2 = b1 + 1 layout unit."""
    target = 16777215
    # scan outward from the estimate x_b = target + 12000
    cand = None
    for bx in range(target + 11000, target + 13000):
        author("far-thr", True, [("a", 450000, 300000), ("b1", bx, 300000), ("b2", bx + 1, 300000)],
               [("a", "R", "b1"), ("b1", "R", "a"), ("a", "R", "b2"), ("b2", "R", "a")])
        m = scn.load_model("scenes/far-thr.scene.json", "layouts/far-thr.layout.json")
        st = vp_state(m)
        d = dlist.build_dl(m, st)
        mx = {}
        for r in d.records:
            if r[0] == "E":
                mx[r[1]] = max(abs(v) for v in r[4:])
        # edges are ordered by (src, rel, tgt): a->b1, a->b2, b1->a, b2->a
        ms = [mx[k] for k in sorted(mx)]
        if ms[0] == target and ms[2] == target and ms[1] == target + 1 and ms[3] == target + 1:
            cand = bx
            break
    assert cand is not None, "B01 search failed"
    scn.put("inputs/B01.search.json", ju.ojson({"b1_x": cand, "target": target}))
    vp_state(m, "far-thr")


# ---------------------------------------------------------------- the K85 separation: a clipped coordinate with fraction >= 1/2

def exact_clip(P0, P1, Wd, Hd, G):
    """Liang-Barsky with exact fractions: returns None or the two clipped points as Fractions"""
    from fractions import Fraction
    dx, dy = P1[0] - P0[0], P1[1] - P0[1]
    t0, t1 = Fraction(0), Fraction(1)
    for p, q in ((-dx, P0[0] + G), (dx, 1000 * Wd + G - P0[0]), (-dy, P0[1] + G), (dy, 1000 * Hd + G - P0[1])):
        if p == 0:
            if q < 0:
                return None
        elif p < 0:
            t0 = max(t0, Fraction(q, p))
        else:
            t1 = min(t1, Fraction(q, p))
    if t0 > t1:
        return None
    return ((P0[0] + dx * t0, P0[1] + dy * t0), (P0[0] + dx * t1, P0[1] + dy * t1))


def frac_hits(d):
    """number of clipped end-point coordinates (of every clipped edge of the list) whose exact fraction is >= 1/2"""
    from fractions import Fraction
    n = 0
    for r in d.records:
        if r[0] != "E":
            continue
        pts = r[4:]
        if all(abs(v) < P.LIM24 for v in pts):
            continue
        poly = P.flatten(pts)
        for a, b in zip(poly, poly[1:]):
            c = exact_clip(a, b, d.width, d.height, P.GUARD_MARGIN)
            if c is None:
                continue
            for pt in c:
                for v in pt:
                    fr = v - (v.numerator // v.denominator)
                    if fr >= Fraction(1, 2):
                        n += 1
    return n


def build_far_a():
    """B11/B14/X06/X08: the A.10 geometry (a node at m-px (-2000000000, 300000), the other far right and below), the y of the
    second node scanned from 700003 until a clipped coordinate has a fraction >= 1/2 (the straight edge is trimmed by 12 px,
    so A.10's untrimmed numbers cannot be reproduced through a scene)"""
    for yb in range(700003, 700400):
        author("far-a", True, [("a", -2000000000, 300000), ("b", 1000000001, yb)], [("a", "R", "b")])
        m = scn.load_model("scenes/far-a.scene.json", "layouts/far-a.layout.json")
        d = dlist.build_dl(m, vp_state(m))
        if frac_hits(d) >= 1:
            break
    else:
        raise AssertionError("far-a search failed")
    scn.put("inputs/B11.search.json", ju.ojson({"b_y": yb, "fraction_hits": frac_hits(d)}))
    vp_state(m, "far-a")
    vp_state(m, "far-a.sel", selected_nodes=[nidx(m, "a")])


def build_far_pair():
    """B12: a parallel pair from a node just inside the left of the guard box to one beyond 2^24: each member becomes a chain of two kind-0 instances"""
    for yq in range(400000, 400400):
        author("far-pair", True, [("p", -200000, 300000), ("q", 17000000, yq)], [("p", "R", "q"), ("q", "R", "p")])
        m = scn.load_model("scenes/far-pair.scene.json", "layouts/far-pair.layout.json")
        d = dlist.build_dl(m, vp_state(m))
        if frac_hits(d) >= 1:
            break
    else:
        raise AssertionError("far-pair search failed")
    scn.put("inputs/B12.search.json", ju.ojson({"q_y": yq, "fraction_hits": frac_hits(d)}))
    vp_state(m, "far-pair")
