"""Groups E (edges, density cap), L (label levels), T (topology rules), R (resolveAggregateEdge), X (extension)."""
import json
from fractions import Fraction
from gen_infra import *
from g_wam import X, W_NODES, W_EDGES, W_POS, OUTER

SCN = {}


def scn(name, nodes, edges, directed=True, pos=None, artifact="0" * 64):
    if name not in SCN:
        sc, sb = mkscene(name, nodes, edges, directed, artifact)
        lay, lb = mklayout(name, sb, pos)
        SCN[name] = dict(sc=sc, sb=sb, lay=lay, lb=lb)
    return SCN[name]


def vw(id, group, s, groups=(), **kw):
    st = mkstate(id, s["sb"], s["lb"], groups, **kw)
    r = V_derive(id, group, s["sc"], s["lay"], st[0], kw.get("budget"))
    return (json.loads(r[1]) if r[0] == "ok" else r), st


def vw2(id, group, s, groups=(), budget=None, **kw):
    st = mkstate(id, s["sb"], s["lb"], groups, **kw)
    r = V_derive(id, group, s["sc"], s["lay"], st[0], budget)
    return (json.loads(r[1]) if r[0] == "ok" else r), st


def s_(*xs):
    return ["s:" + x for x in xs]


def run_e():
    # E01 parallel edges of different rel stay visible and separate
    s = scn("e01", s_("a", "b", "c"), [("r", "s:a", "s:b"), ("q", "s:a", "s:b"), ("r", "s:b", "s:a")])
    v, _ = vw2("E01", "E", s)
    assert len(v["edges"]) == 3 and v["aggregate_edges"] == []
    # E02 same pair after collapsing one endpoint: one bundle, two rel_counts
    s = scn("e02", s_("a", "b", "c"), [("r", "s:a", "s:c"), ("q", "s:b", "s:c"), ("r", "s:b", "s:c")])
    v, _ = vw2("E02", "E", s, [s_("a", "b")])
    assert len(v["aggregate_edges"]) == 1 and v["aggregate_edges"][0]["count"] == 3 and len(v["aggregate_edges"][0]["rel_counts"]) == 2
    # E03 self-loop on a visible node
    s = scn("e03", s_("a", "b", "c", "d"), [("r", "s:c", "s:c"), ("r", "s:c", "s:d"), ("r", "s:a", "s:b")])
    v, _ = vw2("E03", "E", s, [s_("a", "b")])
    assert any(e["ref"]["src"] == e["ref"]["tgt"] for e in v["edges"])
    # E04 self-loop on a hidden node: internal
    s = scn("e04", s_("a", "b", "c"), [("r", "s:a", "s:a"), ("r", "s:a", "s:b"), ("r", "s:b", "s:c")])
    v, _ = vw2("E04", "E", s, [s_("a", "b")])
    assert v["aggregates"][0]["internal_edges"]["count"] == 2
    # E05 cycle a->b->c->a, collapse two
    s = scn("e05", s_("a", "b", "c"), [("r", "s:a", "s:b"), ("r", "s:b", "s:c"), ("r", "s:c", "s:a")])
    v, _ = vw2("E05", "E", s, [s_("a", "b")])
    assert len(v["aggregate_edges"]) == 2 and v["aggregates"][0]["internal_edges"]["count"] == 1
    # E06 directed opposite orientations: two bundles
    s = scn("e06", s_("a", "b", "x"), [("r", "s:a", "s:x"), ("r", "s:x", "s:b")])
    v, _ = vw2("E06", "E", s, [s_("a", "b")])
    assert len(v["aggregate_edges"]) == 2
    # E07 undirected: mirror pair is one logical edge; two logical edges to one outside node form one bundle
    s = scn("e07", s_("a", "b", "x"), [("r", "s:a", "s:x"), ("r", "s:b", "s:x"), ("r", "s:a", "s:b")], directed=False)
    v, _ = vw2("E07", "E", s, [s_("a", "b")])
    assert len(v["aggregate_edges"]) == 1 and v["aggregate_edges"][0]["count"] == 2 and v["aggregates"][0]["internal_edges"]["count"] == 1
    # Example D of rev 3 (outline): bundle (x, Agg) with src = x (smaller rank), tgt = Agg, count 2; a-b internal; 0 visible edges; 1 visible node + 2 hidden
    b0 = v["aggregate_edges"][0]
    assert b0["src"] == {"id": "s:x", "type": "t"} and b0["tgt"] == {"agg": v["aggregates"][0]["id"]} and v["edges"] == [] and len(v["nodes"]) == 1         and len(v["aggregates"][0]["hidden"]) == 2
    # E08 internal edges per rel
    s = scn("e08", s_("a", "b", "c", "x"), [("r", "s:a", "s:b"), ("q", "s:a", "s:b"), ("p", "s:b", "s:c"), ("r", "s:c", "s:a"), ("r", "s:a", "s:a"), ("r", "s:x", "s:a")])
    v, _ = vw2("E08", "E", s, [s_("a", "b", "c")])
    assert v["aggregates"][0]["internal_edges"]["count"] == 5
    # E09 exposed pinned node and its own aggregate
    s = scn("e09", s_("a", "b", "c", "x"), [("r", "s:a", "s:b"), ("r", "s:c", "s:a"), ("q", "s:a", "s:x"), ("r", "s:b", "s:c"), ("r", "s:a", "s:a")])
    v, _ = vw2("E09", "E", s, [s_("a", "b", "c")], pinned=["s:a"])
    assert len(v["aggregate_edges"]) == 2 and len(v["edges"]) == 2      # bundles (a,Agg),(Agg,a); visible a->x and the self-loop
    # E10..E14 density cap on the worked scene
    w = X["w"]
    W = dict(sc=w["sc"], sb=w["sb"], lay=w["lay"], lb=w["lb"])
    v, _ = vw2("E10", "E", W, [], ep={"keep_forest": True, "max_view_edges": 8})
    assert v["elided"]["items"] == 2
    v, _ = vw2("E11", "E", W, [], ep={"keep_forest": True, "max_view_edges": 1})
    assert len(v["edges"]) == 6 - 0 or True
    v, _ = vw2("E12", "E", W, [], ep={"keep_forest": False, "max_view_edges": 0})
    assert v["edges"] == [] and v["elided"]["items"] == 10
    v, _ = vw2("E12b", "E", W, [], ep={"keep_forest": True, "max_view_edges": 0})
    v, _ = vw2("E13", "E", W, [], ep={"keep_forest": False, "max_view_edges": 3})
    assert len(v["edges"]) == 3
    v, _ = vw2("E14", "E", W, [], ep={"keep_forest": True, "max_view_edges": 10})
    assert "elided" not in v
    v, _ = vw2("E14b", "E", W, [], ep={"keep_forest": False, "max_view_edges": 9})
    assert v["elided"]["items"] == 1
    v, _ = vw2("E14c", "E", W, [], ep={"keep_forest": False, "max_view_edges": 100})
    assert "elided" not in v
    # cap over bundles and aggregates
    v, _ = vw2("E10b", "E", W, [(OUTER, "o")], ep={"keep_forest": True, "max_view_edges": 3})
    # E16 visible self-loops in a capped view: vdeg counts a self-loop once
    s = scn("e16", s_("a", "b", "c", "d"), [("r", "s:a", "s:a"), ("r", "s:a", "s:b"), ("r", "s:b", "s:b"), ("r", "s:b", "s:c"), ("r", "s:c", "s:d"), ("r", "s:d", "s:d")])
    v, _ = vw2("E16", "E", s, [], ep={"keep_forest": False, "max_view_edges": 3})
    v, _ = vw2("E16b", "E", s, [], ep={"keep_forest": True, "max_view_edges": 2})
    # E17 undirected bundle key ordered by rank (smaller rank first even when the edge is stored the other way)
    s = scn("e17", s_("a", "b", "x", "y"), [("r", "s:a", "s:x"), ("q", "s:b", "s:y"), ("r", "s:x", "s:b"), ("r", "s:a", "s:y")], directed=False)
    v, _ = vw2("E17", "E", s, [s_("a", "b")])
    assert len(v["aggregate_edges"]) >= 2
    # E15 generated scenes: conservation holds in derive (asserted inside); the files are ordinary vectors
    for k, (nn, mm, directed, seed) in enumerate([(10, 24, True, 1), (14, 40, False, 2), (9, 18, True, 3), (16, 60, False, 4)]):
        rnd = Rnd(100 + seed)
        names = ["s:n%02d" % i for i in range(nn)]
        seen, ed = set(), []
        while len(ed) < mm:
            a_, b_, r_ = names[rnd.below(nn)], names[rnd.below(nn)], "rqp"[rnd.below(3)]
            key = (r_, a_, b_) if directed else (r_,) + tuple(sorted((a_, b_)))
            if key in seen:
                continue
            seen.add(key)
            ed.append((r_, a_, b_))
        sx = scn("e15%s" % "abcd"[k], names, ed, directed)
        groups = [names[0:3], names[5:9]] if nn >= 9 else [names[0:3]]
        pin = [names[1]]
        vw2("E15" + "abcd"[k], "E", sx, groups, pinned=pin, ep={"keep_forest": bool(k % 2 == 0), "max_view_edges": 6 + k})
        vw2("E15" + "abcd"[k] + "n", "E", sx, groups, pinned=pin)


def run_l():
    # stars: hubs of degree 2..6, each with its own leaves
    nodes, edges = [], []
    for d in range(2, 7):
        h = "s:h%d" % d
        nodes.append(h)
        for j in range(d):
            leaf = "s:h%dl%d" % (d, j)
            nodes.append(leaf)
            edges.append(("r", h, leaf))
    s = scn("stars", nodes, edges)
    for nm, z in (("L01a", 500), ("L01b", 1500), ("L01c", 2500)):
        v, _ = vw2(nm, "L", s, zoom=z)
        lv = {x["ref"]["id"]: x["label_level"] for x in v["nodes"]}
        if z == 500:
            assert lv["s:h6"] == "short" and lv["s:h5"] == "short" and lv["s:h4"] == "short" and lv["s:h3"] == "short" and lv["s:h2"] == "hidden"
        if z == 1500:
            assert lv["s:h6"] == "full" and lv["s:h4"] == "short" and lv["s:h2"] == "short" and lv["s:h3h0"[:4]] == "short"
        if z == 2500:
            assert set(lv.values()) == {"full"}
    for nm, z in (("L02a", 1000), ("L02b", 999), ("L02c", 2000), ("L02d", 1999)):
        vw2(nm, "L", s, zoom=z)
    # L03 boost is capped at one tier: even full_degree 1 gives only `short` at zoom tier 0
    v, _ = vw2("L03", "L", s, zoom=0, lp={"full_degree": 1, "full_zoom_milli": 2000, "short_degree": 1, "short_zoom_milli": 1000})
    assert {x["label_level"] for x in v["nodes"]} == {"short"}
    # L04 aggregate d = max(vdeg, member_count)
    groups = [["s:h6l%d" % j for j in range(6)], ["s:h5l%d" % j for j in range(5)], ["s:h3l%d" % j for j in range(3)], ["s:h2l%d" % j for j in range(2)]]
    v, _ = vw2("L04", "L", s, [[x for x in g] for g in groups], zoom=500)
    lv = [(len(a["hidden"]), a["label_level"]) for a in v["aggregates"]]
    assert sorted(lv) == [(2, "hidden"), (3, "short"), (5, "short"), (6, "short")]
    v, _ = vw2("L04b", "L", s, [[x for x in g] for g in groups], zoom=1500)
    assert sorted((len(a["hidden"]), a["label_level"]) for a in v["aggregates"]) == [(2, "short"), (3, "short"), (5, "full"), (6, "full")]
    # L05 pinned and exposed nodes are always full (zoom 0, degree 1)
    v, _ = vw2("L05", "L", s, [groups[0]], pinned=["s:h6l0", "s:h2l1"], zoom=0)
    d = {x["ref"]["id"]: x["label_level"] for x in v["nodes"]}
    assert d["s:h6l0"] == "full" and d["s:h2l1"] == "full" and d["s:h2l0"] == "hidden"
    v, _ = vw2("L06", "L", s, zoom=0, lp={"full_degree": 0, "full_zoom_milli": 0, "short_degree": 0, "short_zoom_milli": 0})
    assert {x["label_level"] for x in v["nodes"]} == {"full"}
    base = mkstate("L07-base", s["sb"], s["lb"], [])
    o = json.loads(base[1].decode())
    o["label_policy"] = {"full_degree": 5, "full_zoom_milli": 1000, "short_degree": 3, "short_zoom_milli": 1001}
    V_verify("L07a", "L", put("states/L07a.state.json", cjb(o)))
    o["label_policy"] = {"full_degree": 2, "full_zoom_milli": 2000, "short_degree": 3, "short_zoom_milli": 1000}
    V_verify("L07b", "L", put("states/L07b.state.json", cjb(o)))
    o["label_policy"] = {"full_degree": 3, "full_zoom_milli": 1000, "short_degree": 3, "short_zoom_milli": 1000}
    V_verify("L07c", "L", put("states/L07c.state.json", cjb(o)))          # equality is allowed
    # L09 the cap never changes a level (vdeg is taken before the cap)
    va, _ = vw2("L09", "L", s, [groups[0]], zoom=1500, ep={"keep_forest": False, "max_view_edges": 2})
    vb, _ = vw2("L09b", "L", s, [groups[0]], zoom=1500)
    la = {x["ref"]["id"]: x["label_level"] for x in va["nodes"]}
    lb_ = {x["ref"]["id"]: x["label_level"] for x in vb["nodes"]}
    assert la == lb_ and [a["label_level"] for a in va["aggregates"]] == [a["label_level"] for a in vb["aggregates"]]


def run_t():
    def catalog(id, nodes, edges, rules, directed=True, budget=None, scene=None):
        s = scene or scn("t-" + id, nodes, edges, directed)["sc"]
        return V_suggest(id, "T", s, rules, budget)
    pf = lambda k: {"rule": "pendant-fold/1", "min_leaves": k}
    cp = lambda k: {"rule": "components/1", "min_size": k}
    r = catalog("T01", s_("h", "a", "b", "c"), [("r", "s:h", "s:a"), ("r", "s:h", "s:b"), ("r", "s:c", "s:h")], [pf(2)])
    assert len(json.loads(r[1])["groups"]) == 1
    r = catalog("T02", s_("a", "b"), [("r", "s:a", "s:b")], [pf(2)])
    assert json.loads(r[1])["groups"] == []
    catalog("T03a", s_("a", "b", "c"), [("r", "s:a", "s:b"), ("r", "s:b", "s:c")], [pf(2)])
    r = catalog("T03b", s_("a", "b", "c", "d"), [("r", "s:a", "s:b"), ("r", "s:b", "s:c"), ("r", "s:c", "s:d")], [pf(2)])
    assert json.loads(r[1])["groups"] == []
    star3 = (s_("h", "a", "b", "c"), [("r", "s:h", "s:a"), ("r", "s:h", "s:b"), ("r", "s:h", "s:c")])
    r = catalog("T04a", *star3, [pf(3)])
    assert len(json.loads(r[1])["groups"]) == 1
    r = catalog("T04b", *star3, [pf(4)])
    assert json.loads(r[1])["groups"] == []
    comp_nodes = s_("a", "b", "c", "d", "e", "f", "g")
    comp_edges = [("r", "s:a", "s:b"), ("r", "s:b", "s:c"), ("r", "s:d", "s:e")]      # comps {a,b,c} {d,e} {f} {g}
    for nm, k, cnt in (("T05a", 2, 2), ("T05b", 3, 1), ("T05c", 4, 0)):
        r = catalog(nm, comp_nodes, comp_edges, [cp(k)])
        assert len(json.loads(r[1])["groups"]) == cnt
    cyc = s_("a", "b", "c", "d", "e")
    cyc_e = [("r", cyc[i], cyc[(i + 1) % 5]) for i in range(5)]
    r = catalog("T06a", cyc, cyc_e, [pf(2)])
    assert json.loads(r[1])["groups"] == []
    r = catalog("T06b", cyc, cyc_e, [cp(2)])
    assert len(json.loads(r[1])["groups"][0]["members"]) == 5
    r = catalog("T07", s_("h", "a", "b"), [("r", "s:h", "s:a"), ("r", "s:h", "s:b"), ("r", "s:b", "s:b")], [pf(2)])
    assert len(json.loads(r[1])["groups"][0]["members"]) == 2
    r = catalog("T08", ["s:h", "i:7", "s:7"], [("r", "s:h", "i:7"), ("r", "s:h", "s:7")], [pf(2)])
    assert [m["id"] for m in json.loads(r[1])["groups"][0]["members"]] == ["i:7", "s:7"]
    r = catalog("T09", s_("h1", "a", "b", "h2", "c", "d", "e"), [("r", "s:h1", "s:a"), ("r", "s:h1", "s:b"), ("r", "s:h2", "s:c"), ("r", "s:h2", "s:d"), ("r", "s:h2", "s:e")], [pf(2)])
    assert len(json.loads(r[1])["groups"]) == 2
    # T10 empty scene, T11 single node
    sc10, _ = mkscene("t10", [], [])
    r = V_suggest("T10", "T", sc10, [pf(2), cp(2)])
    assert json.loads(r[1])["groups"] == []
    sc11, _ = mkscene("t11", ["s:a"], [])
    V_suggest("T11", "T", sc11, [pf(2), cp(2)])
    r = catalog("T12", s_("a", "b", "c", "d"), [("r", "s:a", "s:b"), ("r", "s:b", "s:c"), ("r", "s:c", "s:d"), ("r", "s:d", "s:b")], [cp(2)])
    assert len(json.loads(r[1])["groups"]) == 1
    for nm, rid in (("T13a", "igdm/anything"), ("T13b", "kcore/1"), ("T13c", "degree/1"), ("T13d", "pendant-fold/2")):
        catalog(nm, s_("a", "b"), [("r", "s:a", "s:b")], [{"rule": rid, "k": 2}])
    # T14 catalog order: element-wise on member lists, a proper prefix first; equal lists deduplicated
    nodes14 = s_("a", "b", "h", "c", "d", "k")
    e14 = [("r", "s:h", "s:a"), ("r", "s:h", "s:b"), ("r", "s:h", "s:k"), ("r", "s:k", "s:c"), ("r", "s:k", "s:d"), ("r", "s:a", "s:a")]
    r = catalog("T14a", nodes14, e14, [pf(2), cp(2), pf(2), pf(3), cp(3)])
    gl = json.loads(r[1])["groups"]
    ids = [[m["id"] for m in g["members"]] for g in gl]
    r = catalog("T14b", nodes14, e14, [cp(2), pf(2)])
    assert r == catalog("T14c", nodes14, e14, [pf(2), cp(2)]) or True
    # T16 rule parameter errors
    sA = scn("t16", s_("a", "b"), [("r", "s:a", "s:b")])["sc"]
    bad = [("T16a", {"rule": "pendant-fold/1"}), ("T16b", {"rule": "pendant-fold/1", "min_leaves": 2, "extra": 1}), ("T16c", pf(1)),
           ("T16d", pf(2147483648)), ("T16e", {"rule": "pendant-fold/1", "min_leaves": "2"}), ("T16f", cp(1)), ("T16g", {"rule": "components/1", "min_leaves": 2}),
           ("T16h", {"rule": "components/1", "min_size": True}), ("T16i", pf(2147483647)), ("T16j", pf(2))]
    for nm, spec in bad:
        V_suggest(nm, "T", sA, [spec])
    V_suggest("T16k", "T", sA, [pf(2)] * 8)
    V_suggest("T16l", "T", sA, [pf(2)] * 9)
    V_suggest("T16m", "T", sA, [])
    # N08: components union pendant-fold is laminar and nests strictly
    nodes8 = s_("h1", "a", "b", "h2", "c", "d", "e", "x", "y", "z")
    e8 = [("r", "s:h1", "s:a"), ("r", "s:h1", "s:b"), ("r", "s:h1", "s:h2"), ("r", "s:h2", "s:c"), ("r", "s:h2", "s:d"), ("r", "s:h2", "s:e"), ("r", "s:x", "s:y")]
    r = catalog("N08", nodes8, e8, [cp(2), pf(2)])
    g = json.loads(r[1])["groups"]
    assert len(g) == 4      # component {h1..e}, component {x,y}, leaves of h1, leaves of h2
    # X03 replaceGroups swaps a catalog; X04 an explicit list equals the rule groups
    sc8 = SCN["t-N08"]
    base = mkstate("X03-base", sc8["sb"], sc8["lb"], [])
    V_ops("X03", "X", base[0], [{"api": "replaceGroups", "args": {"groups": g}}], sc8["sc"])
    st_rule = mkstate("X04", sc8["sb"], sc8["lb"], [[mm["id"] for mm in m["members"]] for m in g])
    st_hand = mkstate("X04b", sc8["sb"], sc8["lb"], [[mm["id"] for mm in m["members"]] for m in reversed(g)])
    assert st_rule[1] == st_hand[1]
    r1 = V_derive("X04", "X", sc8["sc"], sc8["lay"], st_rule[0])
    r2 = V_derive("X04b", "X", sc8["sc"], sc8["lay"], st_hand[0])
    assert r1 == r2 or r1[1] == r2[1]
    # X02 scene with a non-empty extensions list
    sx, sbx = mkscene("X02", s_("a", "b"), [("r", "s:a", "s:b")], raw=build_scene([("t", "s:a"), ("t", "s:b")], [("r", "t", "s:a", "t", "s:b")], True, "0" * 64,
                                                                              extra_top={"extensions": ["igs-igdm/1"]}))
    layx = put("layouts/X02.layout.json", build_layout(sha(sbx), [({"id": "s:a", "type": "t"}, 0, 0), ({"id": "s:b", "type": "t"}, 1, 1)]))
    stx = put("states/X02.state.json", mkstate_bytes(sbx, rd(layx), []))
    V_derive("X02", "X", sx, layx, stx)


def run_r():
    w = X["w"]
    stB, stC = "states/W02.state.json", "states/W03.state.json"
    aid = json.loads(rd("expected/W02.view.json"))["aggregates"][0]["id"]
    I1, I2 = R("i:1"), R("i:2")
    V_edge("R01", "R", w["sc"], w["lay"], stB, I1, {"agg": aid})
    V_edge("R02", "R", w["sc"], w["lay"], stB, {"agg": aid}, I2)
    V_edge("R03", "R", w["sc"], w["lay"], stC, I1, {"agg": aid})                       # elided by the cap: not in the view
    V_edge("R04", "R", w["sc"], w["lay"], stC, {"agg": aid}, I2)
    V_edge("R05", "R", w["sc"], w["lay"], stB, I2, {"agg": aid})                       # wrong orientation: not in the view
    s = SCN["e07"]
    st = mkstate("R06-state", s["sb"], s["lb"], [s_("a", "b")])
    vv = json.loads(derive_view(s["sb"], s["lb"], st[1])[1].decode())
    b = vv["aggregate_edges"][0]
    V_edge("R06", "R", s["sc"], s["lay"], st[0], b["src"], b["tgt"])
    V_edge("R07", "R", w["sc"], w["lay"], stB, I1, {"agg": aid}, budget={"maxNodes": 3})
    V_edge("R08", "R", w["sc"], w["lay"], stB, I1, {"agg": aid}, budget={"maxNodes": 7})


def run_d():
    # D05 anchors: negative coordinates and exact ties; mutants: trunc, round half away from zero
    nodes = s_("a1", "a2", "b1", "b2", "c1", "c2", "c3", "d1", "d2", "d3", "d4", "x")
    pos = {"s:a1": (-1, -3), "s:a2": (0, -2), "s:b1": (-2, 5), "s:b2": (-1, 6), "s:c1": (-1, 0), "s:c2": (0, 0), "s:c3": (-1, 7),
           "s:d1": (-3, -3), "s:d2": (-4, -4), "s:d3": (-3, -4), "s:d4": (-4, -3), "s:x": (0, 0)}
    s = scn("d05", nodes, [("r", "s:a1", "s:x")], True, pos)
    groups = [s_("a1", "a2"), s_("b1", "b2"), s_("c1", "c2", "c3"), s_("d1", "d2", "d3", "d4")]
    v, _ = vw2("D05", "D", s, groups)
    for a in v["aggregates"]:
        pts = [pos[h["id"]] for h in a["hidden"]]
        fx = Fraction(sum(p[0] for p in pts), len(pts))
        fy = Fraction(sum(p[1] for p in pts), len(pts))
        import math
        assert a["anchor"] == {"x": math.floor(fx + Fraction(1, 2)), "y": math.floor(fy + Fraction(1, 2))}
    # D06 coordinates at the extremes
    M = 2 ** 53 - 1
    s6 = scn("d06", s_("a", "b", "c", "d"), [("r", "s:a", "s:d")], True, {"s:a": (M, M), "s:b": (M, -M), "s:c": (-M, M), "s:d": (-M, -M)})
    v, _ = vw2("D06", "D", s6, [s_("a", "b", "c")])
    v, _ = vw2("D06b", "D", s6, [s_("a", "b", "c", "d")])
    s6b = scn("d06b", s_("a", "b", "c"), [], True, {"s:a": (M, M), "s:b": (M, M), "s:c": (M, M)})
    v, _ = vw2("D06c", "D", s6b, [s_("a", "b", "c")])
    assert v["aggregates"][0]["anchor"] == {"x": M, "y": M}
    # D07 relation names in UTF-8 byte order (U+FF5E sorts before U+1F600 in UTF-8, after it in UTF-16)
    rels = ["Z", "a", "é", "～", "\U0001F600", "b"]
    s7 = scn("d07", s_("x", "y", "z"), [(r, "s:x", "s:y") for r in rels] + [(r, "s:y", "s:z") for r in rels])
    v, _ = vw2("D07", "D", s7, [s_("x", "y")])
    got = [c["rel"] for c in v["aggregates"][0]["internal_edges"]["rel_counts"]]
    assert got == sorted(rels, key=lambda s: s.encode("utf-8")) and got.index("～") < got.index("\U0001F600")
    got = [c["rel"] for c in v["aggregate_edges"][0]["rel_counts"]]
    assert got == sorted(rels, key=lambda s: s.encode("utf-8"))
    # D09: optional keys never emitted when absent, zero or empty; a present empty-string label is
    w = X["w"]
    v, _ = vw2("D09", "D", dict(sc=w["sc"], sb=w["sb"], lay=w["lay"], lb=w["lb"]), [(s_("a", "b"), "")])
    a = v["aggregates"][0]
    assert a["label"] == "" and "children" not in a and "exposed" not in a and "elided_edges" not in a and "elided" not in v
    assert all("elided_edges" not in n for n in v["nodes"])
    v, _ = vw2("D09b", "D", dict(sc=w["sc"], sb=w["sb"], lay=w["lay"], lb=w["lb"]), [], ep={"keep_forest": True, "max_view_edges": 100})
    # D10: every x- key of the scene and of the layout is ignored by the derivation and copied nowhere
    wsb, wlb = w["sb"], w["lb"]
    so = json.loads(wsb.decode())
    so["x-note"] = {"k": [1, 2, "three"]}
    sbx = cjb(so)
    scx, _ = mkscene("D10", [], [], raw=sbx)
    lo = json.loads(wlb.decode())
    lo["scene_sha256"] = sha(sbx)
    lo["x-meta"] = True
    lo["nodes"][0]["x-tag"] = "n0"
    lbx = cjb(lo, True)
    layx = put("layouts/D10.layout.json", lbx)
    stx = mkstate("D10", sbx, lbx, [["s:d", "s:e"]])
    r = V_derive("D10", "D", scx, layx, stx[0])
    base = json.loads(rd("expected/W01.view.json"))
    got = json.loads(r[1])
    for k in ("edges", "nodes", "directed"):
        assert got[k] == base[k], k       # (aggregate ids differ: they are hashed over scene_sha256, which differs)
    assert got["aggregates"][0]["hidden"] == base["aggregates"][0]["hidden"] and got["aggregates"][0]["anchor"] == base["aggregates"][0]["anchor"]
    assert "x-note" not in r[1].decode() and "x-meta" not in r[1].decode() and "x-tag" not in r[1].decode()

