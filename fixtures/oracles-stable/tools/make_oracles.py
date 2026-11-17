#!/usr/bin/env python3
"""Independent V3 oracle generator (draft). Python only: no TypeScript produces an expected byte.

Specification: docs/isongraph-visualize-blueprint/28-STABLE-LAYOUT-DESIGN.md rev 2 (+ IGS/1, IGL/1).
Every expected byte comes from stablelib.py, whose arithmetic is exact integers.
Core Python (ison_graph, 1.4.1) is used only for FORCE cold starts and the TM03 baseline.
"""
import copy, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)                                  # .../oracles-stable
sys.path.insert(0, HERE)
from stablelib import *

ROWS = []
FILES = {}


def put(rel, data):
    data = data if isinstance(data, bytes) else data.encode("utf-8")
    if rel in FILES:
        assert FILES[rel] == data, "conflicting content for " + rel
        return rel
    FILES[rel] = data
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f: f.write(data)
    return rel


def ext(rel):
    """read a frozen file of a sibling corpus (read-only)."""
    return open(os.path.join(OUT, rel), "rb").read()


def J(o): return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def row(vid, grp, ps="", pl="", sc="", inp=None, el="", er="", ed="", err="", work=""):
    ROWS.append((vid, grp, ps, pl, sc, J(inp) if inp is not None else "", el, er, ed, err, str(work) if work != "" else ""))


# ---------------------------------------------------------------- helpers
def N(i, t="n"): return (t, "i:%d" % i if isinstance(i, int) else i)
def E(a, b, rel="e"): return (rel, a if isinstance(a, tuple) else N(a), b if isinstance(b, tuple) else N(b))


def _edges(edges):
    return [E(*e) if len(e) == 2 else e for e in edges]


def S(nodes, edges, directed=True, text="x"):
    return SE(nodes, edges, directed, text)


def SE(nodes, edges, directed=True, text="x"):
    """edges: (a, b) pairs of node numbers/refs, or full (rel, src, tgt)."""
    return build_scene([n if isinstance(n, tuple) else N(n) for n in nodes], _edges(edges), directed, text)


class D:
    """A previous drawing with its file paths."""
    def __init__(self, sp, lp, sraw, lraw): self.sp, self.lp, self.sraw, self.lraw = sp, lp, sraw, lraw
    @property
    def pair(self): return (self.sraw, self.lraw)


def drawing(name, nodes, edges, pos, directed=True, text=None, policy=None):
    """pos: {ref: (x,y)} thousandths."""
    sraw = SE(nodes, edges, directed, text or name)
    sc = verify_scene(sraw)
    lraw = build_layout(sc.sha, pos, policy or FIXED_POLICY)
    bind_drawing(sraw, lraw)
    return D(put(f"scenes/{name}.scene.json", sraw), put(f"layouts/{name}.layout.json", lraw), sraw, lraw)


def ext_drawing(sp, lp):
    sraw, lraw = ext(sp), ext(lp); bind_drawing(sraw, lraw)
    return D(sp, lp, sraw, lraw)


def scene_file(path, raw):
    verify_scene(raw); return put(path, raw)


RP = RECOMMENDED
CORE = dict(height=600, iterations=170, margin=60, seed=42, width=900)


def stable(vid, grp, prev, sraw, spath, opts, err=None, chk=None, reuse=None, work_on_err=False):
    """Run computeStableLayout and record a row. prev: D or None. Returns the result (or None on error)."""
    inp = {"fn": "computeStableLayout", "options": opts}
    ps, pl = (prev.sp, prev.lp) if prev else ("", "")
    try:
        r = compute_stable(prev.pair if prev else None, sraw, opts)
    except SErr as e:
        assert err is not None, f"{vid}: unexpected error {e.full()}"
        assert e.full() == err, f"{vid}: got {e.full()} expected {err}"
        w = ""
        if e.reason == "WORK_LIMIT":
            # W at refusal: re-run with the budget lifted and replay the meter to the failing charge is not needed;
            # the meter is part of the exception path, so recompute it by running with maxWork = failing-1 bisection.
            w = _w_at_refusal(prev, sraw, opts)
        row(vid, grp, ps, pl, spath, inp, err=err, work=w)
        return None
    assert err is None, f"{vid}: expected error {err} but succeeded"
    if chk: chk(r)
    if reuse:
        lp, rp = reuse
        assert FILES[lp] == r["layout_raw"] and FILES[rp] == r["report_raw"], vid
    else:
        lp = put(f"layouts/{vid}.layout.json", r["layout_raw"]); rp = put(f"reports/{vid}.report.json", r["report_raw"])
    # self-checks: every produced pair verifies, binds and reproduces
    pp = prev.pair if prev else None
    verify_report(r["report_raw"])
    verify_stable(pp, sraw, r["layout_raw"], r["report_raw"])
    ropts = dict(opts); ropts.pop("budget", None)
    verify_stable_reproducible(pp, sraw, r["layout_raw"], r["report_raw"])
    ed = ""
    if prev:
        ed = put(f"diffs/{vid}.diff.json", r["diff"]) if not reuse else ""
    row(vid, grp, ps, pl, spath, inp, el=lp, er=rp, ed=ed, work=r["work"])
    return r


def _w_at_refusal(prev, sraw, opts):
    """W (the sum of all charges accepted) at the moment the first charge that would pass maxWork is refused."""
    trace = []
    class T(Meter):
        def charge(self, c): trace.append(c); super().charge(c)
    o = dict(opts); cap = opts["budget"]["maxWork"]; o["budget"] = dict(opts["budget"], maxWork=10 ** 9)
    compute_stable(prev.pair if prev else None, sraw, o, meter=T(10 ** 9))
    run = 0
    for c in trace:
        if run + c > cap: return run
        run += c
    raise AssertionError("no refusal")


# ================================================================= the worked drawing (section 5.6)
WORKED_PLACE = dict(radius=1000, min_separation=800, max_rings=4)
WP = drawing("worked-prev", [1, 2, 3, 6], [(1, 2), (2, 3), (3, 6)],
             {N(1): (0, 0), N(2): (2000, 0), N(3): (2000, 1500), N(6): (3000, 700)}, text="worked-prev")
assert sha(WP.sraw) == "d6ca9f78605923160b0686df780736718e53fa863f4973ab3fb74042923776d5"
assert sha(WP.lraw) == "3f59c6804f0d487f14046f4351e6a676f7135d5f953535c8bad14d5404c2ec55"
SCENE_A = scene_file("scenes/worked-A.scene.json", S([1, 2, 3, 4, 6], [(1, 2), (2, 3), (3, 6), (1, 4)], text="worked-A"))
SCENE_B = scene_file("scenes/worked-B.scene.json", S([1, 2, 6], [(1, 2)], text="worked-B"))
SCENE_C = scene_file("scenes/worked-C.scene.json", S([2, 3, 4, 5, 6], [(2, 3), (3, 6), (2, 4), (3, 4), (4, 5)], text="worked-C"))
RAW = lambda p: FILES[p]
OPT_W = {"placement": WORKED_PLACE}
OPT_R = {"placement": RP}


# ================================================================= T-DIFF
def td(vid, praw, nraw, note=""):
    pp = put(f"scenes/{vid}.prev.scene.json", praw)
    npth = put(f"scenes/{vid}.scene.json", nraw)
    verify_scene(praw); verify_scene(nraw)
    d, w = diff_scenes(praw, nraw)
    # symmetry checks of the design (TD16)
    ed = put(f"diffs/{vid}.diff.json", d)
    row(vid, "T-DIFF", pp, "", npth, {"fn": "diffScenes"}, ed=ed, work=w)
    return d


def tdiff():
    P = lambda *a, **k: S(*a, **k)
    # TD01 identical
    a = S([1, 2], [(1, 2)], text="td01"); td("TD01", a, a)
    # TD02 pure removal (node and incident edges)
    td("TD02", S([1, 2, 3], [(1, 2), (2, 3)], text="td02a"), S([1, 2], [(1, 2)], text="td02b"))
    # TD03 pure addition
    td("TD03", S([1, 2], [(1, 2)], text="td03a"), S([1, 2, 3], [(1, 2), (2, 3)], text="td03b"))
    # TD04 rename s:ann -> s:anne (remove plus add)
    pn, an, ann = ("person", "i:1"), ("person", "s:ann"), ("person", "s:anne")
    td("TD04", SE([pn, an], [("KNOWS", pn, an)], text="td04a"), SE([pn, ann], [("KNOWS", pn, ann)], text="td04b"))
    # TD05 id twin i:7 -> s:7, same type
    td("TD05", SE([("p", "i:7")], [], text="td05a"), SE([("p", "s:7")], [], text="td05b"))
    # TD06 twin survives
    td("TD06", SE([("p", "i:7"), ("p", "s:7")], [], text="td06a"), SE([("p", "s:7")], [], text="td06b"))
    # TD07 same id, different type
    td("TD07", SE([("a", "i:1")], [], text="td07a"), SE([("b", "i:1")], [], text="td07b"))
    # TD08 edge-only change
    td("TD08", S([1, 2, 3], [(1, 2)], text="td08a"), S([1, 2, 3], [(1, 3)], text="td08b"))
    # TD09 directedness flip (undirected -> directed): stored addresses; (1,2) kept, (2,3) -> (3,2) is remove plus add
    td("TD09", S([1, 2, 3], [(1, 2), (2, 3)], directed=False, text="td09a"), S([1, 2, 3], [(1, 2), (3, 2)], directed=True, text="td09b"))
    # TD10 undirected self-loop kept
    td("TD10", S([1, 2], [(1, 1), (1, 2)], directed=False, text="td10a"), S([1, 2, 3], [(1, 1), (1, 2), (2, 3)], directed=False, text="td10b"))
    # TD11 UTF-8 versus UTF-16 order: U+FF5E before U+1F600 in UTF-8 (reverse in UTF-16)
    t, a_, f_, e_ = "t", ("t", "s:a"), ("t", "s:\uFF5E"), ("t", "s:\U0001F600")
    d11 = td("TD11", SE([a_], [], text="td11a"), SE([a_, f_, e_], [("e", f_, e_), ("e", e_, f_), ("e", e_, a_)], text="td11b"))
    dd = json.loads(d11)
    assert [n["id"] for n in dd["nodes"]["added"]] == ["s:\uFF5E", "s:\U0001F600"]
    # TD12 empty to empty (different source hashes)
    td("TD12", SE([], [], text="td12a"), SE([], [], text="td12b"))
    # TD13 empty previous to non-empty
    td("TD13", SE([], [], text="td13a"), S([1, 2], [(1, 2)], text="td13b"))
    # TD14 rel renamed, nodes kept
    td("TD14", SE([N(1), N(2)], [("e", N(1), N(2))], text="td14a"), SE([N(1), N(2)], [("f", N(1), N(2))], text="td14b"))
    # TD15 same graph, different source hash: empty diff, different scene hashes, identical false
    d15 = td("TD15", S([1, 2], [(1, 2)], text="td15a"), S([1, 2], [(1, 2)], text="td15b"))
    j = json.loads(d15); assert j["identical"] is False and not j["nodes"]["added"] and not j["edges"]["added"] and j["edges"]["common"] == 1
    # TD16 determinism and symmetry: diff(A,B), and diff(B,A) with added/removed swapped and kept equal
    A16 = S([1, 2, 3], [(1, 2), (2, 3)], text="td16a"); B16 = S([2, 3, 4], [(2, 3), (3, 4)], text="td16b")
    d_ab = td("TD16", A16, B16)
    d_ba = td("TD16R", B16, A16)
    x, y = json.loads(d_ab), json.loads(d_ba)
    assert x["nodes"]["added"] == y["nodes"]["removed"] and x["nodes"]["removed"] == y["nodes"]["added"] and x["nodes"]["kept"] == y["nodes"]["kept"]
    assert x["edges"]["added"] == y["edges"]["removed"] and x["edges"]["common"] == y["edges"]["common"]
    assert d_ab == diff_scenes(A16, B16)[0]
    # the `td` helper wrote scenes/TD16.prev.scene.json (A) and scenes/TD16R.prev.scene.json (B)


# ================================================================= T-PLACE
def P(name, nodes, edges, pos, **k): return drawing(name, nodes, edges, {N(i): p for i, p in pos.items()}, **k)


def tp(vid, prev, nodes, edges, opts=None, directed=True, err=None, chk=None, text=None, sraw=None):
    sraw = sraw or SE([n if isinstance(n, tuple) else N(n) for n in nodes], [E(a, b) for a, b in edges], directed, text or vid)
    spath = scene_file(f"scenes/{vid}.scene.json", sraw)
    return stable(vid, "T-PLACE", prev, sraw, spath, opts if opts is not None else OPT_R, err=err, chk=chk)


def rec(r, i):
    return next(x for x in r["report"]["nodes"] if x["ref"]["id"] == "i:%d" % i)


def tplace():
    # TP01 pure addition: a leaf on one kept node, ring 0 direction 0
    p = P("TP01.prev", [1, 2], [(1, 2)], {1: (0, 0), 2: (0, 200000)})
    r = tp("TP01", p, [1, 2, 3], [(1, 2), (1, 3)], chk=lambda r: (rec(r, 3)["ring"] == 0 and rec(r, 3)["direction"] == 0) or 1 / 0)
    # TP02 two kept neighbours at x = 0 and 1: anchor divRound(1,2) = 1
    p = P("TP02.prev", [1, 2], [], {1: (0, 0), 2: (1, 0)})
    tp("TP02", p, [1, 2, 3], [(3, 1), (3, 2)], chk=lambda r: rec(r, 3)["anchor_x"] == 1 or 1 / 0)
    # TP03 chain of three added nodes: waves 0, 1, 2 (ids deliberately not in numeric order of the chain)
    p = P("TP03.prev", [1], [], {1: (0, 0)})
    tp("TP03", p, [1, 9, 2, 5], [(1, 9), (9, 2), (2, 5)], chk=lambda r: [rec(r, i)["wave"] for i in (9, 2, 5)] == [0, 1, 2] or 1 / 0)
    # TP04 isolated added node: seed, wave 0
    p = P("TP04.prev", [1, 2], [(1, 2)], {1: (0, 0), 2: (10000, 5000)})
    tp("TP04", p, [1, 2, 3], [(1, 2)], chk=lambda r: (rec(r, 3)["anchor_kind"] == "seed" and rec(r, 3)["wave"] == 0 and (rec(r, 3)["anchor_x"], rec(r, 3)["anchor_y"]) == (70000, 2500)) or 1 / 0)
    # TP05 added component of two, no kept neighbour: seed wave 0, neighbour wave 1
    p = P("TP05.prev", [1, 2], [(1, 2)], {1: (0, 0), 2: (10000, 5000)})
    tp("TP05", p, [1, 2, 3, 4], [(1, 2), (3, 4)], chk=lambda r: (rec(r, 3)["anchor_kind"] == "seed" and rec(r, 4)["anchor_kind"] == "neighbours" and rec(r, 4)["wave"] == 1) or 1 / 0)
    # TP06 two siblings on one anchor: the second takes direction 1 (needs S <= about 23,400; RECOMMENDED gives direction 2, see AMBIGUITIES)
    p = P("TP06.prev", [1], [], {1: (0, 0)})
    cfg6 = dict(radius=60000, min_separation=20000, max_rings=32)
    tp("TP06", p, [1, 2, 3], [(1, 2), (1, 3)], opts={"placement": cfg6}, chk=lambda r: (rec(r, 2)["direction"] == 0 and rec(r, 3)["direction"] == 1) or 1 / 0)
    # companion row: the same scene under RECOMMENDED_PLACEMENT (documents A-xx)
    r6 = compute_stable(p.pair, FILES["scenes/TP06.scene.json"], OPT_R)
    assert [x for x in r6["report"]["nodes"] if x["status"] == "added"][1]["direction"] == 2
    tp("TP06r", p, [1, 2, 3], [(1, 2), (1, 3)], opts=OPT_R, text="TP06")
    # TP07 direction 0 blocked by a kept node
    p = P("TP07.prev", [1, 2], [], {1: (0, 0), 2: (60000, 5000)})
    tp("TP07", p, [1, 2, 3], [(1, 3)], chk=lambda r: (rec(r, 3)["direction"] != 0 and rec(r, 3)["ring"] == 0) or 1 / 0)
    # TP08 all 16 ring-0 candidates blocked: ring 1 (S > R)
    p = P("TP08.prev", [1], [], {1: (0, 0)})
    tp("TP08", p, [1, 2], [(1, 2)], opts={"placement": dict(radius=1000, min_separation=1500, max_rings=4)}, chk=lambda r: (rec(r, 2)["ring"] == 1 and rec(r, 2)["direction"] == 0) or 1 / 0)
    # TP09 mixed add and remove
    p = P("TP09.prev", [1, 2, 3, 4], [(1, 2), (2, 4), (4, 3), (3, 1)], {1: (0, 0), 2: (60000, 0), 3: (0, 60000), 4: (60000, 60000)})
    tp("TP09", p, [1, 3, 4, 5, 6], [(4, 3), (3, 1), (1, 5), (4, 5), (3, 6)])
    # TP10 a removed node's position is reused (not reserved)
    p = P("TP10.prev", [1, 2], [(1, 2)], {1: (0, 0), 2: (60000, 0)})
    tp("TP10", p, [1, 3], [(1, 3)], chk=lambda r: (rec(r, 3)["x"], rec(r, 3)["y"]) == (60000, 0) or 1 / 0)
    # TP11 negative coordinates: (a) divRound(-2,3) = -1 ; (b) divRound(-1,2) = 0
    p = P("TP11a.prev", [1, 2, 3], [], {1: (-1, 0), 2: (-1, 0), 3: (0, 0)})
    tp("TP11a", p, [1, 2, 3, 4], [(4, 1), (4, 2), (4, 3)], chk=lambda r: rec(r, 4)["anchor_x"] == -1 or 1 / 0)
    p = P("TP11b.prev", [1, 2], [], {1: (-1, 0), 2: (0, 0)})
    tp("TP11b", p, [1, 2, 3], [(3, 1), (3, 2)], chk=lambda r: rec(r, 3)["anchor_x"] == 0 or 1 / 0)
    # TP12 clearance boundary: a kept node at exactly S from the first candidate is admissible; at S-1 it blocks
    p = P("TP12a.prev", [1, 2], [], {1: (0, 0), 2: (100000, 0)})
    tp("TP12a", p, [1, 2, 3], [(1, 3)], chk=lambda r: rec(r, 3)["direction"] == 0 or 1 / 0)
    p = P("TP12b.prev", [1, 2], [], {1: (0, 0), 2: (99999, 0)})
    tp("TP12b", p, [1, 2, 3], [(1, 3)], chk=lambda r: rec(r, 3)["direction"] != 0 or 1 / 0)
    # TP13 NO_FREE_SLOT (max_rings 1, every candidate within S of the kept node)
    p = P("TP13.prev", [1], [], {1: (0, 0)})
    tp("TP13", p, [1, 2], [(1, 2)], opts={"placement": dict(radius=1000, min_separation=5000, max_rings=1)},
       err='PLACEMENT_FAILED/NO_FREE_SLOT#{"id":"i:2","type":"n"}')
    # TP14 coordinate domain
    p = P("TP14a.prev", [1, 2], [(1, 2)], {1: (2 ** 50, 0), 2: (0, 0)})
    tp("TP14a", p, [1, 2, 3], [(1, 2), (1, 3)])
    p = P("TP14b.prev", [1, 2], [(1, 2)], {1: (2 ** 50 + 1, 0), 2: (0, 0)})
    tp("TP14b", p, [1, 2, 3], [(1, 2), (1, 3)], err="INVALID_PREVIOUS/COORDINATE_DOMAIN")
    p = P("TP14c.prev", [1, 2], [(1, 2)], {1: (0, 0), 2: (2 ** 50 + 1, 0)})
    tp("TP14c", p, [1, 3], [(1, 3)], err="INVALID_PREVIOUS/COORDINATE_DOMAIN")      # the out-of-domain node is removed
    # TP15 previous is an igl-force/1 layout (frozen F01): output FIXED, kept equal F01
    f01 = ext_drawing("../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json")
    pn, an, bn = ("person", "i:1"), ("person", "s:ann"), ("person", "s:bob")
    s15 = SE([pn, an, bn], [("KNOWS", pn, an), ("KNOWS", an, bn)], text="TP15")
    r = tp("TP15", f01, [], [], sraw=s15)
    f01l = verify_layout(f01.lraw)
    assert all(r["layout"].pos[k] == f01l.pos[k] for k in (pn, an)) and r["layout"].family == "FIXED"
    # TP16 previous igl-fixed/1 with X01's negative coordinate
    x01 = ext_drawing("../oracles/o1-basic.scene.json", "../oracles-igl/layouts/X01.layout.json")
    r = tp("TP16", x01, [], [], sraw=s15)
    assert min(v[0] for v in verify_layout(x01.lraw).pos.values()) < 0
    # TP17 s:7 added while i:7 kept (FORCE would refuse the scene)
    p = drawing("TP17.prev", [N(7), N(8)], [E(7, 8)], {N(7): (0, 0), N(8): (0, 200000)})
    s17 = SE([N(7), N(8), ("n", "s:7")], [E(7, 8), E(N(7), ("n", "s:7"))], text="TP17")
    tp("TP17", p, [], [], sraw=s17)
    # TP18 self-loop-only added node (orphan: a seed)
    p = P("TP18.prev", [1, 2], [(1, 2)], {1: (0, 0), 2: (10000, 5000)})
    tp("TP18", p, [1, 2, 3], [(1, 2), (3, 3)], chk=lambda r: rec(r, 3)["anchor_kind"] == "seed" or 1 / 0)
    # TP19 / TP22 / TP23 the section 5.6 worked examples
    rA = stable("TP22", "T-PLACE", WP, RAW(SCENE_A), SCENE_A, OPT_W)
    rB = stable("TP19", "T-PLACE", WP, RAW(SCENE_B), SCENE_B, OPT_W)
    rC = stable("TP23", "T-PLACE", WP, RAW(SCENE_C), SCENE_C, OPT_W)
    assert sha(rA["layout_raw"]) == "318c404cbea3a274b6c5bff3b4141f7c68b48b7e67e879a046bc665f13163460" and sha(rA["report_raw"]) == "9642990ad784768d8311bc548ffde2e7cc0a35af4375862c5a6f6d4528914ea8"
    assert sha(rB["layout_raw"]) == "2b98f86369baaf8e80e083a7a1ae44c8ace6c01308e5c178c4cde959267ce623" and sha(rB["report_raw"]) == "f019567f4a35bdc61eec631ffd61e4ee16e66f796de9901b72775a6513362863"
    assert sha(rC["layout_raw"]) == "5574bf704c5e0331a17b77390e6ca64e6ed1254c970525de0d6983ffebe13bc4" and sha(rC["report_raw"]) == "f20470354ac9f7a43a54691781c5b23421570306b212d0f0daea9b0b4cfaec3f"
    assert [(x["work"], x["waves"], x["placed"]) for x in (rA, rB, rC)] == [(61, 1, 1), (39, 0, 0), (105, 2, 2)]
    assert [len(x["report_raw"]) for x in (rA, rB, rC)] == [1703, 1499, 2099]
    # TP20 new scene with zero nodes and a previous drawing: empty FIXED layout, placement required, recorded {present:false}
    r = tp("TP20", WP, [], [], text="TP20")
    assert r["mode"] == "incremental" and r["report"]["placement"] == {"present": False} and r["layout"].family == "FIXED"
    # TP21 wave numbering with both kinds: kept-attached chain of two (waves 0,1), then an orphan seed (wave 2)
    p = P("TP21.prev", [1, 2], [(1, 2)], {1: (0, 0), 2: (30000, 0)})
    tp("TP21", p, [1, 2, 3, 4, 5], [(1, 2), (1, 3), (3, 4)], chk=lambda r: [(rec(r, i)["wave"], rec(r, i)["anchor_kind"]) for i in (3, 4, 5)] == [(0, "neighbours"), (1, "neighbours"), (2, "seed")] or 1 / 0)
    # TP24 two added nodes adjacent to each other and both to a kept node: same wave
    p = P("TP24.prev", [1], [], {1: (0, 0)})
    tp("TP24", p, [1, 2, 3], [(1, 2), (1, 3), (2, 3)],
       chk=lambda r: (rec(r, 2)["wave"] == rec(r, 3)["wave"] == 0 and (rec(r, 3)["anchor_x"], rec(r, 3)["anchor_y"]) == (0, 0)) or 1 / 0)


# ================================================================= T-COLD
def tcold():
    G = "T-COLD"
    o1 = "../oracles/o1-basic.scene.json"
    f01 = ext("../oracles-igl/layouts/F01.layout.json")
    CO = {"coldStart": CORE}
    # TC01 previous null with ForceConfig: layout bytes equal frozen F01, report cold
    r = stable("TC01", G, None, ext(o1), o1, CO, reuse=None)
    assert r["layout_raw"] == f01 and r["mode"] == "cold"
    # TC02 empty previous scene to non-empty: cold (layout again F01)
    e = ext_drawing("../oracles-igl/scenes/empty.scene.json", "../oracles-igl/layouts/X03.layout.json")
    r = stable("TC02", G, e, ext(o1), o1, {"coldStart": CORE, "placement": RP})
    assert r["layout_raw"] == f01 and r["mode"] == "cold" and r["report"]["previous"]["present"]
    # TC03 total replacement: cold, every previous node removed, every new node added
    s3 = scene_file("scenes/TC03.scene.json", S([7, 8], [(7, 8)], text="TC03"))
    r = stable("TC03", G, WP, RAW(s3), s3, {"coldStart": CORE, "placement": RP})
    assert r["mode"] == "cold" and r["report"]["aggregate"]["removed"] == 4 and r["report"]["aggregate"]["added"] == 2 and r["layout"].family == "FORCE"
    # TC04 cold needed, no coldStart
    stable("TC04", G, None, ext(o1), o1, {}, err="INVALID_REQUEST/COLD_START_REQUIRED")
    stable("TC04b", G, WP, RAW(s3), s3, {"placement": RP}, err="INVALID_REQUEST/COLD_START_REQUIRED")
    stable("TC04c", G, e, ext(o1), o1, {"placement": RP}, err="INVALID_REQUEST/COLD_START_REQUIRED")
    # TC05 cold on a scene FORCE refuses (i:7 and s:7 in one type): passes through, no FIXED fallback
    s5 = scene_file("scenes/TC05.scene.json", SE([("p", "i:7"), ("p", "s:7")], [], text="TC05"))
    stable("TC05", G, None, RAW(s5), s5, CO, err="UNSUPPORTED_SCENE/AMBIGUOUS_ORDER_KEY")
    # TC06 placement required whenever previous is non-null
    stable("TC06a", G, WP, RAW(SCENE_A), SCENE_A, {}, err="INVALID_REQUEST/PLACEMENT_REQUIRED")
    s6e = scene_file("scenes/TC06b.scene.json", SE([], [], text="TC06b"))
    stable("TC06b", G, WP, RAW(s6e), s6e, {}, err="INVALID_REQUEST/PLACEMENT_REQUIRED")                       # empty new scene
    stable("TC06c", G, WP, RAW(s3), s3, CO, err="INVALID_REQUEST/PLACEMENT_REQUIRED")                         # total replacement
    junk = D(put("scenes/TC06e.prev.scene.json", b"this is not a scene"), put("layouts/TC06e.prev.layout.json", b"nor a layout"), b"this is not a scene", b"nor a layout")
    stable("TC06e", G, junk, RAW(SCENE_A), SCENE_A, {}, err="INVALID_REQUEST/PLACEMENT_REQUIRED")          # before any input byte is read
    # TC06d unused coldStart is ignored: identical to TP22
    stable("TC06d", G, WP, RAW(SCENE_A), SCENE_A, {"placement": WORKED_PLACE, "coldStart": CORE}, reuse=("layouts/TP22.layout.json", "reports/TP22.report.json"))
    # TC07 reserved and unknown options
    stable("TC07a", G, WP, RAW(SCENE_A), SCENE_A, {"placement": WORKED_PLACE, "relax": True}, err="INVALID_REQUEST/UNSUPPORTED_OPTION#relax")
    stable("TC07b", G, WP, RAW(SCENE_A), SCENE_A, {"placement": WORKED_PLACE, "groups": True}, err="INVALID_REQUEST/UNSUPPORTED_OPTION#groups")
    stable("TC07c", G, WP, RAW(SCENE_A), SCENE_A, {"placement": WORKED_PLACE, "viewport": True}, err="INVALID_REQUEST/UNSUPPORTED_OPTION#viewport")
    stable("TC07d", G, WP, RAW(SCENE_A), SCENE_A, {"placement": WORKED_PLACE, "frobnicate": 1}, err="INVALID_REQUEST/UNKNOWN_KEY#frobnicate")
    # TC08 previous null and an empty new scene: empty FIXED layout, no coldStart, mode cold
    r = stable("TC08", G, None, RAW(s6e), s6e, {})
    assert r["mode"] == "cold" and r["layout"].family == "FIXED" and r["layout"].pos == {}


# ================================================================= T-MEASURE
def tm(vid, prev, nsc_nodes, nsc_edges, npos, directed=True, text=None, nlayout=None, nscene=None, note=None):
    nraw = nscene if nscene is not None else SE([n if isinstance(n, tuple) else N(n) for n in nsc_nodes], [E(a, b) for a, b in nsc_edges], directed, text or vid)
    sc = verify_scene(nraw)
    spath = put(f"scenes/{vid}.scene.json", nraw)
    lraw = nlayout if nlayout is not None else build_layout(sc.sha, {N(i) if isinstance(i, int) else i: v for i, v in npos.items()})
    lpath = put(f"layouts/{vid}.next.layout.json", lraw)
    raw, rep, w = measure(prev.pair, (nraw, lraw))
    verify_report(raw)
    verify_stable(prev.pair, nraw, lraw, raw)
    rp = put(f"reports/{vid}.report.json", raw)
    row(vid, "T-MEASURE", prev.sp, prev.lp, spath, {"fn": "measureDisplacement", "next_layout": lpath}, er=rp, work=w)
    return rep


def tmeasure():
    # TM01 identical scene
    p = P("TM01.prev", [1, 2, 3], [(1, 2), (2, 3)], {1: (0, 0), 2: (5000, 0), 3: (5000, 5000)})
    rep = tm("TM01", p, [], [], {}, nscene=p.sraw, nlayout=p.lraw)
    a = rep["aggregate"]; assert a["moved"] == 0 and a["moved_ppm"] == 0 and a["max_dist"] == 0 and a["common"] == 3
    # TM02 isqrt: (3,4)->5; d2 = 2,4,8,9,5 -> 1,2,2,3,2 (d2 = 3 is not a sum of two squares, see AMBIGUITIES)
    pos0 = {1: (0, 0), 2: (0, 0), 3: (0, 0), 4: (0, 0), 5: (0, 0), 6: (0, 0)}
    d = {1: (3, 4), 2: (-1, 1), 3: (2, 0), 4: (-2, 2), 5: (0, -3), 6: (1, 2)}
    p = P("TM02.prev", [1, 2, 3, 4, 5, 6], [], pos0)
    rep = tm("TM02", p, [1, 2, 3, 4, 5, 6], [], {i: d[i] for i in d})
    assert [x["dist"] for x in rep["nodes"]] == [5, 1, 2, 2, 3, 2]
    # TM03 baseline: the previous drawing against a fresh FORCE layout of the new scene
    fresh = force_positions(verify_scene(RAW(SCENE_A)), CORE)
    nl = build_layout(verify_scene(RAW(SCENE_A)).sha, fresh, force_policy(CORE))
    rep = tm("TM03", WP, [], [], {}, nscene=RAW(SCENE_A), nlayout=nl)
    assert rep["mode"] == "measured" and rep["aggregate"]["moved"] > 0
    # TM04 sums beyond 2^53: coordinates 2^50 apart
    L = 2 ** 50
    p = P("TM04.prev", [1, 2], [], {1: (-L, -L), 2: (L, L)})
    rep = tm("TM04", p, [1, 2], [], {1: (L, L), 2: (-L, -L)})
    assert int(rep["aggregate"]["sum_dist_sq"]) > 2 ** 53 and rep["nodes"][0]["dx"] == 2 ** 51
    # TM05 mean_dist / rms_dist floors: dists 3, 4, 4 -> sum 11 (mean 3), sum_sq 41 -> floor(41/3) = 13 -> rms 3
    p = P("TM05.prev", [1, 2, 3], [], {1: (0, 0), 2: (0, 0), 3: (0, 0)})
    rep = tm("TM05", p, [1, 2, 3], [], {1: (3, 0), 2: (0, 4), 3: (-4, 0)})
    assert (rep["aggregate"]["mean_dist"], rep["aggregate"]["rms_dist"]) == (3, 3)
    # TM06 moved_ppm floor: 1 of 3 moved
    p = P("TM06.prev", [1, 2, 3], [], {1: (0, 0), 2: (7, 7), 3: (9, 9)})
    rep = tm("TM06", p, [1, 2, 3], [], {1: (0, 0), 2: (7, 8), 3: (9, 9)})
    assert rep["aggregate"]["moved_ppm"] == 333333
    # TM07 transform_hint with negative sums, half up: sum dx = -1 over 2 -> 0 ; sum dy = -3 over 2 -> -1
    p = P("TM07.prev", [1, 2], [], {1: (0, 0), 2: (10, 10)})
    rep = tm("TM07", p, [1, 2], [], {1: (-1, -1), 2: (10, 8)})
    assert rep["transform_hint"] == {"dx": 0, "dy": -1, "present": True}
    # TM08 extent including an empty layout
    p = P("TM08.prev", [1, 2], [(1, 2)], {1: (-5, 7), 2: (100, -50)})
    rep = tm("TM08", p, [], [], {}, nscene=SE([], [], text="TM08"))               # next layout empty
    assert rep["extent"]["next"] == {"present": False} and rep["extent"]["previous"]["present"]
    pe = drawing("TM08b.prev", [], [], {}, text="TM08b.prev")
    rep = tm("TM08b", pe, [1, 2], [(1, 2)], {1: (3, 4), 2: (-3, -4)})
    assert rep["extent"]["previous"] == {"present": False} and rep["previous"]["present"]
    # TM09 common = 0
    p = P("TM09.prev", [1, 2], [(1, 2)], {1: (0, 0), 2: (10, 10)})
    rep = tm("TM09", p, [3, 4], [(3, 4)], {3: (1, 1), 4: (2, 2)})
    assert rep["aggregate"]["common"] == 0 and rep["transform_hint"] == {"present": False}
    # TM10 directedness flip recorded
    p = P("TM10.prev", [1, 2, 3], [(1, 2), (2, 3)], {1: (0, 0), 2: (10, 10), 3: (20, 20)}, directed=False)
    rep = tm("TM10", p, [1, 2, 3], [(1, 2), (3, 2)], {1: (0, 0), 2: (10, 10), 3: (20, 20)}, directed=True)
    assert rep["next"]["directed"] is True and rep["previous"]["directed"] is False


# ================================================================= T-REPORT
def rebuild(base, records, mode=None, cfg=None, edges=None):
    mode = mode or base["mode"]
    ph = None if not base["previous"]["present"] else {k: v for k, v in base["previous"].items() if k != "present"}
    plc = base["placement"]
    cfg = cfg or ({k: plc[k] for k in ("radius", "min_separation", "max_rings")} if plc["present"] else None)
    return assemble_report(mode, ph, base["next"], records, edges if edges is not None else base["edges"], cfg)


def tr_put(vid, content):
    raw = content if isinstance(content, bytes) else (cjb(content) if not isinstance(content, str) else content.encode("utf-8"))
    return put(f"reports/{vid}.report.json", raw), raw


def tr_row(vid, content, err, fn="verifyDisplacementReport", prev=None, scene=None, layout=None, budget=None, work=""):
    rp, raw = tr_put(vid, content)
    inp = {"fn": fn, "report": rp}
    if layout: inp["layout"] = layout
    if budget: inp["budget"] = budget
    # execute with my verifier and compare with the design's stated expectation
    try:
        if fn == "verifyDisplacementReport": _, _, m = verify_report(raw, budget); w = m.W
        elif fn == "verifyStable": out = verify_stable(prev.pair if prev else None, FILES[scene], FILES[layout], raw, budget); w = out[4].W
        elif fn == "verifyStableReproducible": _, w = verify_stable_reproducible(prev.pair if prev else None, FILES[scene], FILES[layout], raw, budget)
        else: raise AssertionError(fn)
        got = ""
    except SErr as e:
        got, w = e.tag + (f"#{e.detail}" if e.detail and e.reason in ("REPORT_MISMATCH", "NOT_REPRODUCED") else ""), ""
    assert got == err, f"{vid}: verifier gave {got!r}, design expects {err!r}"
    row(vid, "T-REPORT", prev.sp if prev else "", prev.lp if prev else "", scene or "", inp, err=err, work=w)


def treport():
    base = json.loads(RAW("reports/TP23.report.json"))
    C = lambda: copy.deepcopy(base)
    nodes = lambda o: o["nodes"]
    rC = lambda: copy.deepcopy(base["nodes"])
    # TR01 good incremental report accepted (plus the two binding verifiers over the same report)
    tr_row("TR01", RAW("reports/TP23.report.json"), "")
    tr_row("TR01s", RAW("reports/TP23.report.json"), "", fn="verifyStable", prev=WP, scene=SCENE_C, layout="layouts/TP23.layout.json")
    tr_row("TR01r", RAW("reports/TP23.report.json"), "", fn="verifyStableReproducible", prev=WP, scene=SCENE_C, layout="layouts/TP23.layout.json")
    txt = RAW("reports/TP23.report.json").decode()
    tr_row("TR02", txt.replace('"igls":"IGLS/1"', '"igls": "IGLS/1"'), "INVALID_REPORT/NON_CANONICAL")
    o = C(); o["extra"] = 1; tr_row("TR03", o, "INVALID_REPORT/UNKNOWN_FIELD")
    for vid, k in (("TR04", "groups"), ("TR05", "relax"), ("TR06", "viewport"), ("TR07", "report_sha256")):
        o = C(); o[k] = {"present": False} if k != "report_sha256" else "0" * 64; tr_row(vid, o, "INVALID_REPORT/RESERVED_FIELD")
    o = C(); o["igls"] = "IGLS/2"; tr_row("TR08", o, "INVALID_REPORT/UNSUPPORTED_VERSION")
    o = C(); o["aggregate"]["sum_dist"] = "1"; tr_row("TR09", o, "INVALID_REPORT/INCONSISTENT_AGGREGATE")
    o = C(); o["nodes"][1]["dist"] = 1; tr_row("TR10", o, "INVALID_REPORT/INCONSISTENT_RECORD")
    o = C(); o["nodes"].insert(2, copy.deepcopy(o["nodes"][1])); tr_row("TR11", o, "INVALID_REPORT/DUPLICATE_NODE_REF")
    o = C(); o["nodes"][1], o["nodes"][2] = o["nodes"][2], o["nodes"][1]; tr_row("TR12", o, "INVALID_REPORT/NON_CANONICAL_ORDER")
    o = C(); del o["nodes"][1]["x_prev"]; tr_row("TR13", o, "INVALID_REPORT/MISSING_FIELD")
    # TR14 cold report with anchor fields on an added record (base: TC03, a cold report)
    cold = json.loads(RAW("reports/TC03.report.json")); o = copy.deepcopy(cold)
    a = next(r for r in o["nodes"] if r["status"] == "added")
    a.update(anchor_kind="neighbours", anchor_x=0, anchor_y=0, direction=0, offset=0, ring=0, wave=0)
    tr_row("TR14", o, "INVALID_REPORT/UNKNOWN_FIELD")
    # TR15 incremental kept node moved (self-consistent report, so only KEPT_MOVED fires)
    recs = rC(); k = next(r for r in recs if r["ref"]["id"] == "i:2")
    recs[recs.index(k)] = kept_rec(tref(k["ref"]), k["x_prev"], k["y_prev"], k["x"] + 1, k["y"])
    tr_row("TR15", rebuild(base, recs), "INVALID_REPORT/KEPT_MOVED")
    # TR16 placement arithmetic wrong (x one thousandth off, offset recomputed so the formula is the only fault)
    recs = rC(); a = next(r for r in recs if r["ref"]["id"] == "i:4"); a["x"] += 1; a["offset"] = isqrt((a["x"] - a["anchor_x"]) ** 2 + (a["y"] - a["anchor_y"]) ** 2)
    tr_row("TR16", rebuild(base, recs), "INVALID_REPORT/INCONSISTENT_RECORD")
    o = C(); o["aggregate"]["sum_dist"] = "00"; tr_row("TR17", o, "INVALID_REPORT/INVALID_VALUE")
    t18 = RAW("reports/TP23.report.json").decode().replace('"x":2000,"x_prev":2000,"y":0', '"x":2000.5,"x_prev":2000,"y":0', 1)
    assert t18 != txt; tr_row("TR18", t18, "INVALID_REPORT/INVALID_VALUE")
    # TR19 (verifyStable) a report of a different layout
    o = C(); o["next"]["layout_sha256"] = sha(RAW("layouts/TP22.layout.json"))
    tr_row("TR19", o, "INVALID_REPORT/REPORT_MISMATCH#HASH", fn="verifyStable", prev=WP, scene=SCENE_C, layout="layouts/TP23.layout.json")
    # TR20 (verifyStable) a self-consistent report whose added node sits on another candidate (direction 6) than the layout
    recs = rC(); a = next(r for r in recs if r["ref"]["id"] == "i:4")
    ux, uy = DIRS[6]; a["direction"] = 6; a["x"] = a["anchor_x"] + div_round(1000 * ux, 1000); a["y"] = a["anchor_y"] + div_round(1000 * uy, 1000)
    a["offset"] = isqrt((a["x"] - a["anchor_x"]) ** 2 + (a["y"] - a["anchor_y"]) ** 2)
    tr_row("TR20", rebuild(base, recs), "INVALID_REPORT/REPORT_MISMATCH#POSITION", fn="verifyStable", prev=WP, scene=SCENE_C, layout="layouts/TP23.layout.json")
    # TR21 (verifyStableReproducible) a cold report where kept >= 1: kept records stay `kept`, added records are bare
    recs = rC()
    for r in recs:
        if r["status"] == "added":
            for kk in ("anchor_kind", "anchor_x", "anchor_y", "direction", "offset", "ring", "wave"): del r[kk]
    tr_row("TR21", rebuild(base, recs, mode="cold"), "INVALID_REPORT/NOT_REPRODUCED#MODE", fn="verifyStableReproducible", prev=WP, scene=SCENE_C, layout="layouts/TP23.layout.json")
    # TR22 (verifyStableReproducible): a `cold` report for an empty new scene with a previous drawing (derived mode incremental)
    b20 = json.loads(RAW("reports/TP20.report.json")); o22 = copy.deepcopy(b20); o22["mode"] = "cold"
    tr_row("TR22", o22, "INVALID_REPORT/NOT_REPRODUCED#MODE", fn="verifyStableReproducible", prev=WP, scene="scenes/TP20.scene.json", layout="layouts/TP20.layout.json")
    # TR31 an incremental report with a seed record and no kept record: the seed anchor divRound(Sy, 0) cannot be recomputed
    ph = {"directed": True, "layout_sha256": WP.lraw and sha(WP.lraw), "scene_sha256": sha(WP.sraw)}
    recs31 = [{"ref": wref(N(i)), "status": "removed", "x_prev": p_[0], "y_prev": p_[1]} for i, p_ in ((1, (0, 0)), (2, (2000, 0)), (3, (2000, 1500)), (6, (3000, 700)))]
    recs31.append({"anchor_kind": "seed", "anchor_x": 0, "anchor_y": 0, "direction": 0, "offset": 1000, "ref": wref(N(7)), "ring": 0, "status": "added", "wave": 0, "x": 1000, "y": 0})
    o31 = assemble_report("incremental", ph, {"directed": True, "layout_sha256": "0" * 64, "scene_sha256": "1" * 64}, recs31, {"added": [], "common": 0, "removed": []}, WORKED_PLACE)
    tr_row("TR31", o31, "INVALID_REPORT/INCONSISTENT_RECORD")
    # TR23 ring >= max_rings (self-consistent for ring 4 with max_rings 4)
    recs = rC(); a = next(r for r in recs if r["ref"]["id"] == "i:4"); a["ring"] = 4
    ux, uy = DIRS[a["direction"]]; a["x"] = a["anchor_x"] + div_round(1000 * 5 * ux, 1000); a["y"] = a["anchor_y"] + div_round(1000 * 5 * uy, 1000)
    a["offset"] = isqrt((a["x"] - a["anchor_x"]) ** 2 + (a["y"] - a["anchor_y"]) ** 2)
    tr_row("TR23", rebuild(base, recs), "INVALID_REPORT/INVALID_VALUE")
    o = C(); next(r for r in o["nodes"] if r["ref"]["id"] == "i:4")["direction"] = 16; tr_row("TR24", o, "INVALID_REPORT/INVALID_VALUE")
    # TR25 placement.present true with no added record (base: Case B report)
    bB = json.loads(RAW("reports/TP19.report.json")); o = copy.deepcopy(bB)
    o["placement"] = {"algorithm": ALGO, "max_rings": 4, "min_separation": 800, "present": True, "radius": 1000}
    tr_row("TR25a", o, "INVALID_REPORT/INCONSISTENT_RECORD")
    # TR25b placement.present false with incremental added records (base: Case C report)
    o = C(); o["placement"] = {"present": False}; tr_row("TR25b", o, "INVALID_REPORT/INCONSISTENT_RECORD")
    # TR26 (verifyStable) a `neighbours` anchor that is not the centroid: anchor (2001,750) with a layout that agrees
    pos = {tref(n["ref"]): (n["x"], n["y"]) for n in json.loads(RAW("layouts/TP23.layout.json"))["nodes"]}
    pos[N(4)] = (1077, 1133); pos[N(5)] = (1077, 2133)
    sceneC = verify_scene(RAW(SCENE_C))
    l26 = put("layouts/TR26.layout.json", build_layout(sceneC.sha, pos))
    recs = rC()
    a4 = next(r for r in recs if r["ref"]["id"] == "i:4"); a4.update(anchor_x=2001, x=1077)
    a5 = next(r for r in recs if r["ref"]["id"] == "i:5"); a5.update(anchor_x=1077, x=1077)
    o = rebuild(base, recs); o["next"]["layout_sha256"] = sha(RAW(l26))
    tr_row("TR26", o, "INVALID_REPORT/REPORT_MISMATCH#ANCHOR", fn="verifyStable", prev=WP, scene=SCENE_C, layout=l26)
    # TR27 wrong seed anchor (base: TP05, which has a seed record)
    b5 = json.loads(RAW("reports/TP05.report.json")); recs = copy.deepcopy(b5["nodes"])
    s = next(r for r in recs if r.get("anchor_kind") == "seed"); s["anchor_y"] += 1; s["y"] += 1
    tr_row("TR27", rebuild(b5, recs), "INVALID_REPORT/INCONSISTENT_RECORD")
    o = C(); o["edges"]["added"][0]["ord"] = "1"; tr_row("TR28", o, "INVALID_REPORT/INVALID_VALUE")
    # TR29 (verifyStable) a measured report listing a moved kept node as a bare `added` record
    pos29 = {N(1): (0, 0), N(2): (2000, 0), N(3): (2500, 1500), N(6): (3000, 700)}
    s29 = put("scenes/TR29.scene.json", RAW("scenes/worked-prev.scene.json"))
    l29 = put("layouts/TR29.layout.json", build_layout(sha(RAW(s29)), pos29))
    honest, rep29, _ = measure(WP.pair, (RAW(s29), RAW(l29)))
    recs = copy.deepcopy(rep29["nodes"]); i3 = next(i for i, r in enumerate(recs) if r["ref"]["id"] == "i:3")
    recs[i3] = {"ref": recs[i3]["ref"], "status": "added", "x": 2500, "y": 1500}
    tr_row("TR29", rebuild(rep29, recs), "INVALID_REPORT/REPORT_MISMATCH#STATUS", fn="verifyStable", prev=WP, scene=s29, layout=l29)
    # TR30 a record coordinate 2^50 + 1 (a removed record's x_prev)
    recs = rC(); r1 = next(r for r in recs if r["status"] == "removed"); r1["x_prev"] = 2 ** 50 + 1
    tr_row("TR30", rebuild(base, recs), "INVALID_REPORT/INVALID_VALUE")


# ================================================================= T-LIMIT
def long_id(units_wanted, t="n", ch="a"):
    """a string id such that nodeKey has exactly `units_wanted` UTF-16 units."""
    base = units(node_key_str(t, "s:"))
    n = units_wanted - base
    assert n > 0
    ident = "s:" + ch * n
    assert units(node_key_str(t, ident)) == units_wanted
    return ident


def tlimit():
    G = "T-LIMIT"
    # TL01 previous over maxNodes (previous 4 nodes, new 3, maxNodes 3)
    stable("TL01", G, WP, RAW(SCENE_B), SCENE_B, dict(OPT_W, budget={"maxNodes": 3}), err="RESOURCE_LIMIT/NODE_LIMIT")
    # TL02 new over maxNodes (previous = Case B output, 3 nodes; new Case A has 5; maxNodes 4)
    pB = D(SCENE_B, "layouts/TP19.layout.json", RAW(SCENE_B), RAW("layouts/TP19.layout.json"))
    stable("TL02", G, pB, RAW(SCENE_A), SCENE_A, dict(OPT_W, budget={"maxNodes": 4}), err="RESOURCE_LIMIT/NODE_LIMIT")
    # TL03 maxEdges (previous 3 edges, new 4)
    stable("TL03", G, WP, RAW(SCENE_A), SCENE_A, dict(OPT_W, budget={"maxEdges": 3}), err="RESOURCE_LIMIT/EDGE_LIMIT")
    # TL04 byte caps are checked before parsing
    cap = len(RAW(SCENE_A)) + 10
    stable("TL04", G, WP, RAW(SCENE_A), SCENE_A, dict(OPT_W, budget={"maxSceneBytes": len(RAW(SCENE_A)) - 1}), err="RESOURCE_LIMIT/INPUT_BYTES")
    junk = b"x" * (cap + 1)
    jd = D(put("scenes/TL04b.prev.scene.json", junk), WP.lp, junk, WP.lraw)
    stable("TL04b", G, jd, RAW(SCENE_A), SCENE_A, dict(OPT_W, budget={"maxSceneBytes": cap}), err="RESOURCE_LIMIT/INPUT_BYTES")   # not an IgsError: refused before parsing
    stable("TL04c", G, WP, RAW(SCENE_A), SCENE_A, dict(OPT_W, budget={"maxLayoutBytes": len(WP.lraw) - 1}), err="RESOURCE_LIMIT/INPUT_BYTES")
    # TL05 / TL06 node key exactly 2048 passes, 2049 refused
    for vid, want, err in (("TL05", 2048, None), ("TL06", 2049, "RESOURCE_LIMIT/KEY_LENGTH")):
        big = N(long_id(want))
        p = drawing(f"{vid}.prev", [N(1), big], [], {N(1): (0, 0), big: (0, 200000)})
        sraw = SE([N(1), big, N(3)], [E(1, 3)], text=vid)
        stable(vid, G, p, sraw, scene_file(f"scenes/{vid}.scene.json", sraw), OPT_R, err=err)
    # TL07 budget exceeded; boundary values
    r = stable("TL07a", G, WP, RAW(SCENE_C), SCENE_C, dict(OPT_W, budget={"maxWork": 104}), err="RESOURCE_LIMIT/WORK_LIMIT")
    assert ROWS[-1][-1] == "78"
    stable("TL07b", G, WP, RAW(SCENE_C), SCENE_C, dict(OPT_W, budget={"maxWork": 105}), reuse=("layouts/TP23.layout.json", "reports/TP23.report.json"))
    stable("TL07c", G, WP, RAW(SCENE_A), SCENE_A, dict(OPT_W, budget={"maxWork": 60}), err="RESOURCE_LIMIT/WORK_LIMIT")
    stable("TL07d", G, WP, RAW(SCENE_A), SCENE_A, dict(OPT_W, budget={"maxWork": 61}), reuse=("layouts/TP22.layout.json", "reports/TP22.report.json"))
    # TL08 worst case of the model: W = 10k + 10
    for vid, k, x0, want in (("TL08a", 1, 0, 20), ("TL08b", 5, 0, 60), ("TL08c", 50, 0, 510), ("TL08d", 5, 39999, 55)):
        ids = list(range(1, k + 1))
        p = drawing(f"{vid}.prev", [N(i) for i in ids], [], {N(i): (x0, 0) for i in ids})
        sraw = SE([N(i) for i in ids] + [N(k + 1)], [E(1, k + 1)], text=vid)
        r = stable(vid, G, p, sraw, scene_file(f"scenes/{vid}.scene.json", sraw), OPT_R)
        assert r["work"] == want, (vid, r["work"])
    # TL09 invalid budget values
    for vid, b in (("TL09a", {"maxNodes": 0}), ("TL09b", {"maxNodes": -1}), ("TL09c", {"maxNodes": 1.5}), ("TL09d", {"maxNodes": "10"}),
                   ("TL09e", []), ("TL09f", {"unknown": 1}), ("TL09g", {"maxWork": 2 ** 53}), ("TL09h", {"maxWork": True})):
        stable(vid, G, WP, RAW(SCENE_A), SCENE_A, dict(OPT_W, budget=b), err="INVALID_REQUEST/INVALID_BUDGET")
    # TL10 raising the budget never changes output bytes
    stable("TL10", G, WP, RAW(SCENE_C), SCENE_C, dict(OPT_W, budget={"maxNodes": 10 ** 6, "maxEdges": 10 ** 6, "maxWork": 10 ** 9, "maxSceneBytes": 10 ** 9, "maxLayoutBytes": 10 ** 9, "maxReportBytes": 10 ** 9}),
           reuse=("layouts/TP23.layout.json", "reports/TP23.report.json"))
    # TL12 a 5,000-unit identifier: refused by V3 KEY_LENGTH (the previous layout was made by FIXED rules, X05-style)
    big12 = ("n", "s:" + "a" * 4990)
    p = drawing("TL12.prev", [N(1), big12], [], {N(1): (0, 0), big12: (0, 200000)})
    sraw = SE([N(1), big12, N(3)], [E(1, 3)], text="TL12")
    stable("TL12", G, p, sraw, scene_file("scenes/TL12.scene.json", sraw), OPT_R, err="RESOURCE_LIMIT/KEY_LENGTH")
    # TL13 a control-character id of 1,022 characters: raw 1,024 units, nodeKey 6,142 units: refused
    big13 = ("t", "s:" + "\x01" * 1022)
    assert units(node_key_str(*big13)) == 6142
    p = drawing("TL13.prev", [("t", "i:1"), big13], [], {("t", "i:1"): (0, 0), big13: (0, 200000)})
    sraw = SE([("t", "i:1"), big13, ("t", "i:3")], [E(("t", "i:1"), ("t", "i:3"))], text="TL13")
    stable("TL13", G, p, sraw, scene_file("scenes/TL13.scene.json", sraw), OPT_R, err="RESOURCE_LIMIT/KEY_LENGTH")
    # TL14 relation JSON length 2,048 passes, 2,049 refused
    for vid, rl, err in (("TL14a", "r" * 2046, None), ("TL14b", "r" * 2047, "RESOURCE_LIMIT/KEY_LENGTH")):
        p = drawing(f"{vid}.prev", [N(1), N(2)], [], {N(1): (0, 0), N(2): (0, 200000)})
        sraw = SE([N(1), N(2), N(3)], [(rl, N(1), N(3))], text=vid)
        stable(vid, G, p, sraw, scene_file(f"scenes/{vid}.scene.json", sraw), OPT_R, err=err)
    # TL15 the worst-case edge key (backslash ids and quote ids, relation at the cap) is 10,240 units, below 10,252, and is accepted
    A = ("n", "s:" + "\\" * 1019); B = ("n", "s:" + '"' * 1019)
    assert units(node_key_str(*A)) == 2048 and units(node_key_str(*B)) == 2048
    rel15 = "\x01" * 341; assert units(js_json_str(rel15)) == 2048
    assert units(edge_key_str(A, rel15, B)) == 10240 <= 10252
    p = drawing("TL15.prev", [A, B], [], {A: (0, 0), B: (0, 200000)})
    sraw = SE([A, B, N(3)], [(rel15, A, B), ("e", N(3), A)], text="TL15")
    stable("TL15", G, p, sraw, scene_file("scenes/TL15.scene.json", sraw), OPT_R)
    # TL16 out-of-domain candidates are charged 1 (seed anchor near 2^50)
    kx = 2 ** 50 - 10
    p = drawing("TL16.prev", [N(1)], [], {N(1): (kx, 0)})
    sraw = SE([N(1), N(2)], [], text="TL16")
    r = stable("TL16", G, p, sraw, scene_file("scenes/TL16.scene.json", sraw), OPT_R)
    # TL17 report over maxReportBytes, refused before parsing
    rp = RAW("reports/TP23.report.json")
    jr = b"y" * (len(rp) + 1)
    put("reports/TL17.report.json", rp); put("reports/TL17b.report.json", jr)
    for vid, rpath, raw, bud in (("TL17", "reports/TL17.report.json", rp, {"maxReportBytes": len(rp) - 1}), ("TL17b", "reports/TL17b.report.json", jr, {"maxReportBytes": len(rp)})):
        try: verify_report(raw, bud); raise AssertionError
        except SErr as e: assert e.full() == "RESOURCE_LIMIT/INPUT_BYTES"
        row(vid, G, inp={"fn": "verifyDisplacementReport", "report": rpath, "budget": bud}, err="RESOURCE_LIMIT/INPUT_BYTES")
    # TL18 report with records > 2*maxNodes (6 records, maxNodes 2)
    for vid, bud, err, w in (("TL18", {"maxNodes": 2}, "RESOURCE_LIMIT/NODE_LIMIT", ""),):
        try: verify_report(rp, bud); raise AssertionError
        except SErr as e: assert e.full() == err
        put("reports/TL18.report.json", rp)
        row(vid, G, inp={"fn": "verifyDisplacementReport", "report": "reports/TL18.report.json", "budget": bud}, err=err)
    # TL19 a report that decodes but exceeds maxWork under V1 (V1 = 3*(6 + 3 + 1) = 30)
    for vid, mw, err in (("TL19", 29, "RESOURCE_LIMIT/WORK_LIMIT"), ("TL19b", 30, "")):
        put(f"reports/{vid}.report.json", rp)
        try:
            _, _, m = verify_report(rp, {"maxWork": mw}); got, w = "", m.W
        except SErr as e: got, w = e.full(), ""
        assert got == err
        row(vid, G, inp={"fn": "verifyDisplacementReport", "report": f"reports/{vid}.report.json", "budget": {"maxWork": mw}}, err=err, work=w)
    # TL20 measureDisplacement with a next-layout coordinate 2^50 + 1
    sc20 = verify_scene(RAW(WP.sp))
    l20 = put("layouts/TL20.next.layout.json", build_layout(sc20.sha, {N(1): (0, 0), N(2): (2000, 0), N(3): (2 ** 50 + 1, 1500), N(6): (3000, 700)}))
    try: measure(WP.pair, (RAW(WP.sp), RAW(l20))); raise AssertionError
    except SErr as e: assert e.full() == "INVALID_NEXT/COORDINATE_DOMAIN"
    row("TL20", G, WP.sp, WP.lp, WP.sp, {"fn": "measureDisplacement", "next_layout": l20}, err="INVALID_NEXT/COORDINATE_DOMAIN")
    # TL21 report edge entries: endpoint key 2,049 units, relation 2,049 escaped units; 2,048 passes
    bB = json.loads(RAW("reports/TP19.report.json"))
    def with_edge(src_id, rel):
        o = copy.deepcopy(bB)
        o["edges"]["added"] = [{"ord": "0", "rel": rel, "src": {"id": src_id, "type": "n"}, "tgt": {"id": "i:1", "type": "n"}}]
        return o
    rel_ok = "\x01" * 341; rel_bad = "\x01" * 341 + "r"; assert units(js_json_str(rel_ok)) == 2048 and units(js_json_str(rel_bad)) == 2049
    for vid, o, err in (("TL21a", with_edge(long_id(2049), "e"), "RESOURCE_LIMIT/KEY_LENGTH"), ("TL21b", with_edge("i:2", rel_bad), "RESOURCE_LIMIT/KEY_LENGTH"),
                        ("TL21c", with_edge(long_id(2048), rel_ok), "")):
        rpath, raw = tr_put(vid, o)
        try: _, _, m = verify_report(raw); got, w = "", m.W
        except SErr as e: got, w = e.full(), ""
        assert got == err, (vid, got)
        row(vid, G, inp={"fn": "verifyDisplacementReport", "report": rpath}, err=err, work=w)


# ================================================================= main
def main():
    for g in (tdiff, tplace, tcold, tmeasure, treport, tlimit):
        g()
    header = "id\tgroup\tprevious_scene\tprevious_layout\tscene\tinput\texpected_layout\texpected_report\texpected_diff\terror\twork\n"
    put("EXPECT.tsv", header + "".join("\t".join(r) + "\n" for r in ROWS))
    by = {}
    for r in ROWS: by[r[1]] = by.get(r[1], 0) + 1
    print(len(ROWS), "rows", by)


if __name__ == "__main__":
    main()
