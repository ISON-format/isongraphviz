"""Groups C (collapse, expand, round trip), N (nested), P (pins), S (selection mapping)."""
import json
from gen_infra import *
from g_wam import X, W_NODES, W_EDGES, W_POS, OUTER


def G12():
    nodes = ["i:1", "i:2", "i:3"] + ["s:" + c for c in "abcdefghi"]
    rnd = Rnd(12)
    seen, edges = set(), []
    rels = ["r", "q", "p"]
    while len(edges) < 30:
        u, v, r = nodes[rnd.below(12)], nodes[rnd.below(12)], rels[rnd.below(3)]
        if (u, v, r) in seen:
            continue
        seen.add((u, v, r))
        edges.append((r, u, v))
    return nodes, edges


def run_c():
    w = X["w"]
    sc, sb, lay, lb = w["sc"], w["sb"], w["lay"], w["lb"]

    def view_of(id, groups, group="C", **kw):
        st = mkstate(id, sb, lb, groups, **kw)
        r = V_derive(id, group, sc, lay, st[0])
        assert r[0] == "ok", (id, r)
        return json.loads(r[1]), st

    # C01 identity view (RT1)
    v, st = view_of("C01", [])
    scene = verify_scene(sb)
    assert v["aggregates"] == [] and v["aggregate_edges"] == [] and "elided" not in v
    assert [x["ref"] for x in v["nodes"]] == scene["nodes"]
    assert [x["ref"] for x in v["edges"]] == [e["ref"] for e in scene["edges"]]
    for x in v["nodes"]:
        assert (x["x"], x["y"]) == W_POS[x["ref"]["id"]]
    view_of("C02", [["s:a", "s:b"]])
    v, _ = view_of("C03", [W_NODES])
    assert v["nodes"] == [] and v["aggregates"][0]["internal_edges"]["count"] == 10
    view_of("C04", [["s:a", "s:b"], ["s:d", "s:e"]])
    view_of("C05", [["i:1", "i:2"]])
    view_of("C06", [W_NODES[1:]])

    def raw_state(id, groups, pinned=()):
        o = json.loads(rd(X["stA"][0]).decode())
        o["collapsed"] = [{"members": [R(x) for x in g]} for g in groups]
        o["pinned"] = [R(x) for x in pinned]
        return put("states/%s.state.json" % id, cjb(o))
    V_verify("C07", "C", raw_state("C07", [[]]))
    V_verify("C08", "C", raw_state("C08", [["s:a"]]))
    V_verify("C09", "C", raw_state("C09", [["s:a", "s:a"]]))
    V_verify("C10", "C", raw_state("C10", [["s:a", "s:b"], ["s:a", "s:b"]]))
    V_verify("C11", "C", raw_state("C11", [["s:a", "s:b"], ["s:b", "s:c"]]))
    V_verify("C11c", "C", raw_state("C11c", [["s:b", "s:c"], ["s:a", "s:b"], ["s:a", "s:b"]]))     # rev 3: the same family as an UNSORTED state file
    V_verify("C11d", "C", raw_state("C11d", [["s:a", "s:b"], ["s:a", "s:b"], ["s:b", "s:c"]]))     # canonical order: DUPLICATE_GROUP before OVERLAPPING_GROUPS
    base = mkstate("C11b-base", sb, lb, [])
    g1, g1d, g2 = {"members": [R("s:a"), R("s:b")]}, {"members": [R("s:a"), R("s:b")]}, {"members": [R("s:b"), R("s:c")]}
    V_ops("C11b", "C", base[0], [{"api": "replaceGroups", "args": {"groups": [g2, g1, g1d]}}])
    V_ops("C11b2", "C", base[0], [{"api": "replaceGroups", "args": {"groups": [g1, g2, g1d]}}])
    V_derive("C12", "C", sc, lay, raw_state("C12", [["s:a", "s:zz"]]))
    V_verify("C13", "C", raw_state("C13", [["s:d", "s:e"], ["s:a", "s:b"]]))
    V_verify("C14", "C", raw_state("C14", [["s:a", "s:b", "s:a"]]))

    # C15 round trips
    empty = mkstate("C15-empty", sb, lb, [])
    ga = {"members": [R("s:a"), R("s:b"), R("s:c")]}
    r = V_ops("C15a", "C", empty[0], [{"api": "collapseGroup", "args": {"group": ga}}, {"api": "expandGroup", "args": {"target": {"members": ga["members"]}}}])
    # not a round trip of removed group: the last op is expandGroup so the expected is {"removed","state"}; the state equals the original
    out = json.loads(r[1])
    assert cjb(out["state"]) == empty[1] and out["removed"] == ga
    # RT2 first form, with the expected file being the original state (the round trip needs a plain-state last op)
    withg = mkstate("C15b-state", sb, lb, [["s:a", "s:b", "s:c"]])
    r = V_ops("C15b", "C", withg[0], [{"api": "expandGroup", "args": {"target": {"members": ga["members"]}}}, {"api": "collapseGroup", "args": {"group": ga}}])
    assert r[1] == withg[1]
    aid = agg_id(sha(sb), [verify_scene(sb)["nodes"][x] for x in (2, 3, 4)])[0]
    withl = mkstate("C15c-state", sb, lb, [(["s:a", "s:b", "s:c"], "lbl")])
    gl = {"label": "lbl", "members": ga["members"]}
    r = V_ops("C15c", "C", withl[0], [{"api": "expandGroup", "args": {"target": {"agg": aid}}}, {"api": "collapseGroup", "args": {"group": gl}}], sc)
    assert r[1] == withl[1]
    r = V_ops("C15d", "C", withl[0], [{"api": "expandGroup", "args": {"target": {"agg": aid}}}], sc)
    assert json.loads(r[1])["removed"] == gl
    V_ops("C15e", "C", empty[0], [{"api": "collapseGroup", "args": {"group": {"members": [R("s:e"), R("s:d")]}}}])
    # the same state restored: RT3 (identical view bytes), RT4 (positions)
    rA = V_derive("C16", "C", sc, lay, withg[0])
    assert rA[0] == "ok"
    for x in json.loads(rA[1])["nodes"]:
        assert (x["x"], x["y"]) == W_POS[x["ref"]["id"]]
    # RT5 order independence
    g3 = {"members": [R("s:d"), R("s:e")]}
    ga2 = {"members": [R("i:1"), R("i:2")]}
    a = V_ops("C17a", "C", empty[0], [{"api": "collapseGroup", "args": {"group": x}} for x in (ga, g3, ga2)])
    b = V_ops("C17b", "C", empty[0], [{"api": "collapseGroup", "args": {"group": x}} for x in (ga2, g3, ga)])
    assert a == b
    # C18 not active
    V_ops("C18a", "C", withg[0], [{"api": "expandGroup", "args": {"target": {"members": [R("s:d"), R("s:e")]}}}])
    V_ops("C18b", "C", withg[0], [{"api": "expandGroup", "args": {"target": {"agg": "igagg1:" + "0" * 64}}}], sc)
    V_ops("C18c", "C", withg[0], [{"api": "expandGroup", "args": {"target": {"agg": "igagg1:xyz"}}}], sc)
    V_ops("C18d", "C", withg[0], [{"api": "expandGroup", "args": {"target": {"agg": aid.upper()}}}], sc)
    # builders that fail: C09/C10/C11 shaped
    V_ops("C18e", "C", withg[0], [{"api": "collapseGroup", "args": {"group": {"members": [R("s:b"), R("s:d")]}}}])      # overlaps
    V_ops("C18f", "C", withg[0], [{"api": "collapseGroup", "args": {"group": ga}}])                                     # duplicate group
    V_ops("C18g", "C", withg[0], [{"api": "collapseGroup", "args": {"group": {"members": [R("s:d"), R("s:d")]}}}])      # duplicate member
    V_ops("C18h", "C", withg[0], [{"api": "collapseGroup", "args": {"group": {"members": [R("s:d")]}}}])                # too small
    V_ops("C18i", "C", withg[0], [{"api": "collapseGroup", "args": {"group": {"members": [{"agg": aid}, R("s:d")]}}}])  # aggregate as member
    # C20 builders preserve x- keys
    xs = mkstate("C20-state", sb, lb, [], xs={"x-keep": {"a": [1, 2, True]}, "x-n": 5})
    V_ops("C20", "C", xs[0], [{"api": "collapseGroup", "args": {"group": ga}}, {"api": "setPinned", "args": {"refs": [R("s:d")]}},
                              {"api": "withZoom", "args": {"zoom_milli": 1500}}])
    # C21 empty-string label
    v, st = view_of("C21", [(["s:d", "s:e"], "")])
    assert v["aggregates"][0]["label"] == ""
    V_verify("C21b", "C", st[0])
    # builders: remaining
    V_ops("C22a", "C", withg[0], [{"api": "withLayout", "args": {"layout_sha256": "f" * 64}}])
    V_ops("C22b", "C", withg[0], [{"api": "withLayout", "args": {"layout_sha256": "F" * 64}}])
    V_ops("C22c", "C", withg[0], [{"api": "withZoom", "args": {"zoom_milli": 2147483648}}])


def run_n():
    nodes, edges = G12()
    sc, sb = mkscene("g12", nodes, edges, True)
    lay, lb = mklayout("g12", sb)
    X["g12"] = dict(sc=sc, sb=sb, lay=lay, lb=lb)

    def view_of(id, groups, group="N", **kw):
        st = mkstate(id, sb, lb, groups, **kw)
        r = V_derive(id, group, sc, lay, st[0])
        assert r[0] == "ok", (id, r)
        return json.loads(r[1]), st
    outer = ["i:1", "i:2", "s:a", "s:b", "s:c", "s:d"]
    v, _ = view_of("N01", [(outer, "outer"), ["s:a", "s:b"]])
    assert len(v["aggregates"]) == 1 and len(v["aggregates"][0]["children"]) == 1
    v, _ = view_of("N02", [["s:a", "s:b"]])
    assert len(v["aggregates"]) == 1 and "children" not in v["aggregates"][0]
    st01 = rd("states/N01.state.json")
    V_ops("N02o", "N", "states/N01.state.json", [{"api": "expandGroup", "args": {"target": {"members": [R(x) for x in sorted(outer, key=lambda s: ref_key(R(s)))]}}}], sc)
    v, _ = view_of("N03", [(outer, "top"), (["i:1", "i:2", "s:a", "s:b"], "mid"), ["s:a", "s:b"]])
    assert len(v["aggregates"]) == 1 and len(v["aggregates"][0]["children"]) == 1
    # depth 16 / 17 on a 20-node path
    pn = ["s:p%02d" % i for i in range(20)]
    sc2, sb2 = mkscene("chain20", pn, [("r", pn[i], pn[i + 1]) for i in range(19)])
    lay2, lb2 = mklayout("chain20", sb2)

    def chain(k):
        return [pn[:j] for j in range(2, k + 2)]       # k nested groups of sizes 2..k+1
    st = mkstate("N04", sb2, lb2, chain(16))
    r = V_derive("N04", "N", sc2, lay2, st[0])
    assert r[0] == "ok"
    st = mkstate("N05", sb2, lb2, chain(17))
    V_derive("N05", "N", sc2, lay2, st[0])
    V_verify("N05v", "N", st[0])
    # N06 siblings under one parent
    big = ["s:a", "s:b", "s:c", "s:d", "s:e", "s:f", "s:g", "s:h"]
    v, _ = view_of("N06", [(big, "parent"), ["s:a", "s:b"], ["s:c", "s:d"]])
    assert len(v["aggregates"][0]["children"]) == 2 and v["aggregates"][0]["children"] == sorted(v["aggregates"][0]["children"])
    # N07 pinned deep in a nest
    v, _ = view_of("N07", [(outer, "outer"), ["s:a", "s:b"]], pinned=["s:a"])
    assert v["aggregates"][0]["exposed"] == [R("s:a")]
    # N09: two top groups, one inside nothing, plus children ordering across emitted aggregates
    view_of("N09", [["i:1", "i:2", "i:3"], ["s:a", "s:b", "s:c"], ["s:a", "s:b"]])


def run_p():
    w = X["w"]
    sc, sb, lay, lb = w["sc"], w["sb"], w["lay"], w["lb"]
    base = json.loads(rd("expected/W01.view.json"))

    def view_of(id, groups, **kw):
        st = mkstate(id, sb, lb, groups, **kw)
        r = V_derive(id, "P", sc, lay, st[0])
        return (json.loads(r[1]) if r[0] == "ok" else r), st
    v, _ = view_of("P01", [["s:d", "s:e"]], pinned=["s:d"])
    a = v["aggregates"][0]
    assert a["id"] == base["aggregates"][0]["id"] and a["exposed"] == [R("s:d")] and a["hidden"] == [R("s:e")] and a["member_count"] == 2
    v, _ = view_of("P02", [["s:d", "s:e"]], pinned=["s:d", "s:e"])
    assert v["aggregates"] == [] and v["aggregate_edges"] == [] and len(v["nodes"]) == 7 and len(v["edges"]) == 10
    v, _ = view_of("P03", [["s:d", "s:e"]], pinned=["s:a"])
    assert v["aggregates"] == base["aggregates"] and v["aggregate_edges"] == base["aggregate_edges"] and v["edges"] == base["edges"]
    assert [x["label_level"] for x in v["nodes"] if x["ref"]["id"] == "s:a"] == ["full"]
    assert v["state_sha256"] != base["state_sha256"]
    st = mkstate("P04", sb, lb, [["s:d", "s:e"]], pinned=["s:zz"])
    V_derive("P04", "P", sc, lay, st[0])
    v, _ = view_of("P05", [["s:a", "s:b", "s:c"]], pinned=["s:a", "s:b"])
    assert len(v["aggregates"][0]["hidden"]) == 1 and len(v["aggregates"][0]["exposed"]) == 2
    s1 = mkstate("P06-state", sb, lb, [["s:d", "s:e"]], pinned=["s:a"])
    V_ops("P06a", "P", s1[0], [{"api": "setPinned", "args": {"refs": [R("s:b")]}}])
    V_ops("P06b", "P", s1[0], [{"api": "setPinned", "args": {"refs": []}}])
    V_ops("P06c", "P", s1[0], [{"api": "setPinned", "args": {"refs": [R("s:e"), R("s:b")]}}])         # unsorted input is sorted by the builder
    o = json.loads(s1[1].decode())
    o["pinned"] = [R("s:a"), R("s:a")]
    V_verify("P07", "P", put("states/P07.state.json", cjb(o)))
    V_ops("P07b", "P", s1[0], [{"api": "setPinned", "args": {"refs": [R("s:a"), R("s:a")]}}])
    # P08: pin in a deep position of a group whose other members are all pinned: group not emitted but nested group stays unemitted too
    v, _ = view_of("P08", [(OUTER, "o"), ["s:d", "s:e"]], pinned=OUTER)
    assert v["aggregates"] == []


def run_s():
    w = X["w"]
    sc, sb, lay, lb = w["sc"], w["sb"], w["lay"], w["lb"]
    stA = X["stA"][0]
    P = lambda *xs: [R(x) for x in xs]
    V_project("S01", "S", sc, lay, stA, P("s:d"))
    V_project("S02", "S", sc, lay, stA, P("s:d", "s:e"))
    aidA = json.loads(rd("expected/W01.view.json"))["aggregates"][0]["id"]
    V_resolve("S03", "S", sc, lay, stA, [{"agg": aidA}])
    stP = mkstate("S04-state", sb, lb, [["s:d", "s:e"]], pinned=["s:d"])
    V_resolve("S04a", "S", sc, lay, stP[0], P("s:d"))
    V_resolve("S04b", "S", sc, lay, stP[0], [{"agg": aidA}])
    V_project("S05a", "S", sc, lay, stA, P("s:d"))
    V_project("S05b", "S", sc, lay, stP[0], P("s:d"))
    stE = mkstate("S06-state", sb, lb, [])
    V_project("S06", "S", sc, lay, stE[0], P("s:d", "s:a"))
    V_resolve("S07", "S", sc, lay, stE[0], [{"agg": aidA}])
    st2 = mkstate("S09-state", sb, lb, [["s:a", "s:b"], ["s:d", "s:e"]])
    v2 = json.loads(derive_view(sb, lb, st2[1])[1].decode())
    ids = [a["id"] for a in v2["aggregates"]]
    V_project("S09a", "S", sc, lay, st2[0], P("s:e", "i:2", "s:b", "s:d", "i:1", "s:a", "i:2", "s:c"))
    V_resolve("S09b", "S", sc, lay, st2[0], [{"agg": ids[1]}, R("i:2"), {"agg": ids[0]}, R("i:2"), R("s:c")])
    V_resolve("S11", "S", sc, lay, stA, P("s:d"))                       # a hidden scene node is not in nodes[]
    V_project("S12", "S", sc, lay, stA, P("s:zz"))                       # not in the scene
    good = json.loads(rd("expected/W01.view.json"))
    def bad(f):
        o = json.loads(json.dumps(good))
        f(o)
        return o
    cases = {"a": bad(lambda o: o.pop("edges")), "b": bad(lambda o: o.update(nodes={})), "c": bad(lambda o: o["aggregate_edges"][0].update(src={"id": "s:a"})),
             "d": [], "e": bad(lambda o: o["nodes"][0].update(extra=1)), "f": bad(lambda o: o["aggregates"][0].update(hidden="x")),
             "g": bad(lambda o: o["aggregate_edges"][0].update(tgt={"agg": "x", "id": "s:c", "type": "t"}))}
    for k, v in cases.items():
        V_project("S10" + k, "S", sc, lay, stA, P("s:a"), view=v)
    V_resolve("S10h", "S", sc, lay, stA, P("s:a"), view=cases["a"])
    V_resolve("S10i", "S", sc, lay, stA, [{"id": "s:a"}])                # malformed ref (no type)
    V_resolve("S10j", "S", sc, lay, stA, [{"agg": aidA, "id": "s:a", "type": "t"}])
