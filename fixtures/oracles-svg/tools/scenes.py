"""Authored scenes and FIXED layouts of the V5 corpus (generator input, no renderer logic).

Everything here is deterministic.  Scene bytes follow IGS-CJ/1 (IGS-1 section 5), node and
edge order follow IGS-1 section 5.5, layouts follow IGL-1 section 5 (igl-fixed/1).
"""
import hashlib
from svg import cjb, sha256_hex


def _nkey(t, i):
    if i.startswith("i:"):
        return (t.encode("utf-8"), 0, int(i[2:]), b"")
    return (t.encode("utf-8"), 1, 0, i[2:].encode("utf-8"))


def _label(i):
    return i[2:]


def ref(t, i):
    return {"id": i, "type": t}


def make_scene(name, directed, nodes, edges):
    """nodes: [(type, id)], edges: [((type,id), rel, (type,id))].  Returns scene bytes."""
    nd = sorted(set(nodes), key=lambda n: _nkey(*n))
    assert len(nd) == len(nodes), f"{name}: duplicate nodes"
    es = []
    for s, rel, t in edges:
        if not directed and _nkey(*s) > _nkey(*t):
            s, t = t, s
        es.append((s, rel, t))
    es = sorted(es, key=lambda e: (_nkey(*e[0]), e[1].encode("utf-8"), _nkey(*e[2]), b"0"))
    assert len(set(es)) == len(es), f"{name}: duplicate edges"
    sc = {
        "address_scheme": "igs-addr/1",
        "edges": [{"label": rel, "ref": {"ord": "0", "rel": rel, "src": ref(*s), "tgt": ref(*t)}} for s, rel, t in es],
        "graph": {"directed": directed, "profile": "simple"},
        "igs": "IGS/1",
        "nodes": [{"category": t, "label": _label(i), "ref": ref(t, i)} for t, i in nd],
        "source": {"artifact_sha256": hashlib.sha256(("oracles-svg synthetic source: " + name).encode()).hexdigest(),
                   "serialization_profile": "ison-v1"},
    }
    return cjb(sc), nd


def make_fixed_layout(scene_bytes, nd, pos):
    """pos: {(type,id): (x, y)} in THOUSANDTHS (integers)."""
    nodes = [{"ref": ref(t, i), "x": pos[(t, i)][0], "y": pos[(t, i)][1]} for t, i in nd]
    ly = {"address_scheme": "igs-addr/1", "igl": "IGL/1", "nodes": nodes,
          "policy": {"algorithm": "igl-fixed/1", "config": {}, "family": "FIXED"}, "scale": 1000,
          "scene_sha256": sha256_hex(scene_bytes)}
    return cjb(ly)


def grid_pos(nd, cols=4, step_x=150000, step_y=120000, x0=50000, y0=50000):
    return {n: (x0 + (k % cols) * step_x, y0 + (k // cols) * step_y) for k, n in enumerate(nd)}


class Authored:
    """Registry: name -> (scene_bytes, layout_bytes)."""

    def __init__(self):
        self.items = {}
        self.notes = {}

    def add(self, name, directed, nodes, edges, pos=None, note=None):
        sb, nd = make_scene(name, directed, nodes, edges)
        if pos is None:
            pos = grid_pos(nd)
        elif callable(pos):
            pos = pos(nd)
        lb = make_fixed_layout(sb, nd, pos)
        self.items[name] = (sb, lb)
        if note:
            self.notes[name] = note
        return nd


def build_simple_scenes(A):
    P = "p"
    # --- X01 ids4: seven distinct ids and one edge
    ids = ["i:7", "s:7", "s:007", "s:-0", "i:0", "s:0", "i:-1"]
    A.add("ids4", True, [(P, i) for i in ids], [((P, "i:7"), "R", (P, "s:7"))])

    # --- X02 hostile-svg
    n1 = ("<script>alert(x)</script>", 's:<script>alert("x")</script>')
    n2 = ("&amp;", "s:&amp;")
    n3 = ("a&b", "s:a&b")
    n4 = ("q'", 's:"')
    n5 = ("</title><g-onload=x>", "s:</title><g onload=x>")
    n6 = ("p", "s:'")
    A.add("hostile-svg", True, [n1, n2, n3, n4, n5, n6],
          [(n1, "<i>&amp;</i>", n2), (n2, "a&b", n3), (n3, "'", n4), (n4, "</desc>", n5), (n5, "R", n6)])

    # --- X03 trunc: 23/24/25 units and the astral cases of A.6
    def a(n):
        return "a" * n
    tn = [(P, "s:" + a(23)), (P, "s:" + a(24)), (P, "s:" + a(25)), (P, "s:" + a(22) + "\U0001F600"),
          (P, "s:" + a(23) + "\U0001F600"), (P, "s:" + a(22) + "\U0001F600" + "b")]
    A.add("trunc", True, tn, [((P, "s:" + a(23)), "R" * 25, (P, "s:" + a(24))),
                              ((P, "s:" + a(24)), "R" * 24, (P, "s:" + a(25))),
                              ((P, "s:" + a(25)), "R" * 23, (P, "s:" + a(22) + "\U0001F600"))])

    # --- O09 trunc3
    A.add("trunc3", True, [(P, "s:abc"), (P, "s:abcdefghij"), (P, "s:z")], [])

    # --- X06 ids12: hostile characters inside ids
    chars = ['"', "<", "&", "\\", "'", " ", "\t", "\n", "\u2028", "\x7f", "\u202e", "\U0001F600"]
    nodes = [(P, "s:a" + c + "b") for c in chars]
    edges = [(nodes[k], "R", nodes[k + 1]) for k in range(0, len(nodes) - 1, 2)]
    A.add("ids12", True, nodes, edges)

    # --- X07 nfc
    nfc, nfd = "\u00e9", "e\u0301"
    n_a, n_b = (P, "s:" + nfc), (P, "s:" + nfd)
    n_c, n_d = (nfc, "s:x"), (nfd, "s:x")
    A.add("nfc", True, [n_a, n_b, n_c, n_d], [(n_a, nfc, n_b), (n_a, nfd, n_b)])

    # --- X08 emptylabels
    e0, e1, e2 = (P, "s:"), (P, "s:   "), (P, "s: a ")
    A.add("emptylabels", True, [e0, e1, e2], [(e0, "R", e2), (e2, "R", e1)])

    # --- X09 agg-id
    hx = "0123456789abcdef" * 4
    g1, g2 = (P, "s:igagg1:" + hx), (P, "i:1")
    A.add("agg-id", True, [g1, g2], [(g2, "R", g1)])

    # --- X04 longid1024: wire id of exactly 1,024 UTF-16 units ("s:" + 1,022 characters)
    l1, l2 = (P, "s:" + "x" * 1022), (P, "i:1")
    A.add("longid1024", True, [l1, l2], [(l2, "R", l1)])

    # --- X10 ctl: TAB, LF, CR in labels (categories and relations cannot contain whitespace, IGS/1 1.2)
    c1 = (P, "s:a\nb\tc\r")
    c2 = (P, "s:\tx")
    c3 = (P, "s:y\r\nz")
    A.add("ctl", True, [c1, c2, c3], [(c1, "R", c2), (c2, "R", c3)])

    # --- X11 illegal: XML-illegal scalars in label, category and relation
    k1 = ("c\u0001d", "s:x\x00y\ufffez")
    k2 = ("k\uffff", "s:\x01\x1f")
    k3 = (P, "s:u\uffffv")
    A.add("illegal", True, [k1, k2, k3], [(k1, "r\u001f", k2), (k2, "r\x00\ufffe", k3), (k3, "R", k1)])

    # --- X12 markup
    m = [(P, "s:]]>"), (P, "s:-->"), (P, "s:<?pi?>"), (P, "s:&#x41;")]
    A.add("markup", True, m, [(m[0], "R", m[1]), (m[2], "R", m[3])])

    # --- X14 bidi
    b1, b2 = (P, "s:a\u202eb"), (P, "s:\u2066c")
    A.add("bidi", True, [b1, b2], [(b1, "R", b2)])

    # --- X15 non-BMP category and label
    u1, u2 = ("\U0001F600", "s:\U0001F600x"), ("\U0001D49C", "s:\U0001D49Cy")
    A.add("astral", True, [u1, u2], [(u1, "\U0001F600", u2)])

    # --- X13 ten: ten categories, one node each
    tens = [("c%d" % k, "s:n%d" % k) for k in range(10)]
    A.add("ten", True, tens, [(tens[0], "R", tens[9]), (tens[8], "R", tens[1])])

    # --- N04-N06 deg
    d = {}
    pos_nodes = [(P, "s:a1"), (P, "s:a2"), (P, "s:b1"), (P, "s:b2"), (P, "s:c1"), (P, "s:c2")]
    coords = {(P, "s:a1"): (100000, 100000), (P, "s:a2"): (124000, 100000),
              (P, "s:b1"): (100000, 200000), (P, "s:b2"): (125000, 200000),
              (P, "s:c1"): (100000, 300000), (P, "s:c2"): (124000, 300006)}
    A.add("deg", True, pos_nodes, [((P, "s:a1"), "R", (P, "s:a2")), ((P, "s:b1"), "R", (P, "s:b2")),
                                   ((P, "s:c1"), "R", (P, "s:c2"))], pos=lambda nd: coords)

    # --- N07 coincident / coincident-u
    ca, cb_, cc = (P, "s:a"), (P, "s:b"), (P, "s:c")
    cpos = {ca: (200000, 200000), cb_: (200000, 200000), cc: (400000, 250000)}
    for nm, dr in (("coincident", True), ("coincident-u", False)):
        A.add(nm, dr, [ca, cb_, cc], [(ca, "R0", cb_), (cb_, "R0", cc)], pos=lambda nd, cp=cpos: cp)

    # --- N08 loops2
    la, lb = (P, "s:a"), (P, "s:b")
    A.add("loops2", True, [la, lb], [(la, "R0", la), (la, "R1", la), (la, "R2", la), (lb, "R0", lb), (lb, "R1", lb)],
          pos=lambda nd: {la: (150000, 250000), lb: (450000, 250000)})

    # --- N09/N10 multi4
    ms = [(P, "s:" + c) for c in "abcdef"]
    a_, b_, c_, d_, e_, f_ = ms
    medges = [(a_, "R0", b_), (a_, "R1", b_), (b_, "R0", a_), (b_, "R1", a_),
              (c_, "R0", d_), (c_, "R1", d_), (d_, "R0", c_), (e_, "R0", f_)]
    mpos = {a_: (80000, 100000), b_: (320000, 140000), c_: (80000, 300000), d_: (300000, 380000),
            e_: (450000, 120000), f_: (560000, 330000)}
    A.add("multi4", True, ms, medges, pos=lambda nd: mpos)

    # --- F03-F05 hub: 200 leaves and one hub with a 1,022-unit label
    hub = (P, "s:" + "h" * 1022)
    leaves = [(P, "i:%d" % k) for k in range(1, 201)]
    hp = {hub: (500000, 300000)}
    for k, n in enumerate(leaves):
        hp[n] = (40000 + (k % 20) * 45000, 40000 + (k // 20) * 50000)
    A.add("hub", True, leaves + [hub], [(hub, "R", n) for n in leaves], pos=lambda nd: hp)

    # --- L01-L04 (R-H, LP/1 integration rows): two to three nodes each, positions in thousandths (zoom 1000 shows 1 layout unit as 1 px)
    # L01 lp-hid-box: the hidden node i:2 sits where the default label of i:1 would be (its disc box would block it)
    l1, l2 = (P, "i:1"), (P, "i:2")
    A.add("lp-hid-box", True, [l1, l2], [], pos=lambda nd: {l1: (200000, 200000), l2: (200000, 230000)})
    # L02 lp-nolabel: the visible node s: has an EMPTY label (no <text>) and sits where the default label of s:aaaa would be
    e0, e1 = (P, "s:"), (P, "s:aaaa")
    A.add("lp-nolabel", True, [e0, e1], [], pos=lambda nd: {e1: (200000, 200000), e0: (200000, 230000)})
    # L03 lp-hid-label: the hidden node i:1 (label "1", earlier in model order) has a default label box that overlaps the default label box of s:aaaa,
    # while the disc box of i:1 does not touch that label box
    h1, h2 = (P, "i:1"), (P, "s:aaaa")
    A.add("lp-hid-label", True, [h1, h2], [], pos=lambda nd: {h1: (300000, 200000), h2: (312000, 200000)})
    # L04 lp-astral: the label of s:<6 x U+1F600> is 12 UTF-16 units (6 code points) and its box overlaps the label box of s:bbbb only at 12 units
    u1, u2 = (P, "s:bbbb"), (P, "s:" + "\U0001F600" * 6)
    A.add("lp-astral", True, [u1, u2], [], pos=lambda nd: {u1: (248000, 200000), u2: (200000, 200000)})
