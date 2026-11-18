"""Rows P, B, C, Z, R."""
import json
import math
import os
import re
import xml.etree.ElementTree as ET

import core
from core import cj, cjb, IgrError, len16
import dl as D
import view as V
import scenes
import base
from base import reg, Out, conv, model_of, state_of, fs, fs_json, jtxt
from rows_a import (O1, O4, EMPTY, SINGLE, MIXED, UNICODE, KEYBOUND, SV, OWN, SZ, A2VP, SVG_STATE, inp)

PRE = "../oracles-svg/svg/%s.svg"


def _dl_of(sc, size, state, options=None):
    mdl = model_of(*sc)
    st = state_of(mdl, state, size)
    return mdl, st, D.build_dl(mdl, st, options)


# ------------------------------------------------------------------ P rows
def pick_fn(sc, size, state, points):
    def fn():
        mdl = model_of(*sc)
        st = state_of(mdl, state, size)
        res = []
        newpts = []
        for p in points:
            pt = {"x": conv(p["x"]), "y": conv(p["y"])}
            q = {"x": p["x"], "y": p["y"]}
            try:
                a = V.pick_drawn(mdl, st, pt)
                if a is None:
                    r = {}
                elif isinstance(a, int):
                    r = {"pid": a}
                else:
                    r = {"hit": a}
            except IgrError as e:
                r = {"error": e.tag()}
            res.append(r)
            q.update(r)
            newpts.append(q)
        return Out(extra=res, inp={"size": size, "state": state, "points": newpts})
    return fn


def pickbuf_fn(sc, size, state, expected):
    def fn():
        mdl, st, d = _dl_of(sc, size, state)
        return Out(files={expected: V.serialize_pick(V.build_pick(d))})
    return fn


def boundsfn(sc, size, state, expected):
    def fn():
        mdl, st, d = _dl_of(sc, size, state)
        return Out(files={expected: V.serialize_bounds(V.bounds(d))})
    return fn


def parse_pick(b):
    t = b.decode("utf-8")
    assert t.endswith("\n")
    ls = t[:-1].split("\n")
    recs = []
    for l in ls:
        v = json.loads(l)
        assert cj(v) == l
        recs.append(v)
    h = recs[0]
    assert h[0] == "P" and h[1] == "igr-pick/1"
    nd, ed = h[2], h[3]
    assert len(recs) == 1 + nd + ed
    for i in range(nd):
        assert recs[1 + i][:2] == ["pn", i + 1] and len(recs[1 + i]) == 4
    for j in range(ed):
        r = recs[1 + nd + j]
        assert r[:2] == ["pe", nd + j + 1] and (len(r) - 2) in (4, 34)
    return recs


def pickparse_fn(files, expected):
    def fn():
        outs = []
        for f in files:
            outs.append(V.serialize_pick(parse_pick(fs(f))) == fs(f))
        return Out(files={expected: V.serialize_pick(parse_pick(fs(files[-1])))}, extra=outs)
    return fn


def find_wedge_point(sc, state):
    """a point within 6 px of an interior polyline vertex, beyond both perpendicular spans"""
    mdl = model_of(*sc)
    st = fs_json(state)
    d = D.build_dl(mdl, st)
    edges = V.list_edges(d)
    best = None
    for pid, fl, form, pts in edges:
        poly = V.flatten(form, pts)
        for k in range(2, len(poly) - 2):
            Vp = poly[k]
            for ang in range(0, 360, 2):
                for rad in (5800, 5400, 5000):
                    x = Vp[0] + round(rad * math.cos(math.radians(ang)))
                    y = Vp[1] + round(rad * math.sin(math.radians(ang)))
                    if not (0 < x < 900000 and 0 < y < 600000):
                        continue
                    pt = {"x": x / 1000, "y": y / 1000}
                    a = V.pick_drawn(mdl, st, pt)
                    if a is None or "edge" not in a:
                        continue
                    core.MUT.add("K95")
                    try:
                        b = V.pick_drawn(mdl, st, pt)
                    finally:
                        core.MUT.discard("K95")
                    if b != a:
                        return (x, y, pid, k)
    return None


def find_chord_point(sc, state):
    """frozen hitTest returns an edge, pick returns nothing"""
    mdl = model_of(*sc)
    st = fs_json(state)
    for xi in range(0, 400):
        for yi in range(-24, 25):
            x = 440.0 + xi * 0.125
            y = 300.0 + yi * 0.25
            pt = {"x": x, "y": y}
            h = core.hit_test(mdl, st, pt)
            if h is not None and h[0] == "edge" and V.pick_drawn(mdl, st, pt) is None:
                return (x, y)
    return None


def register_pb():
    IDS = "state"
    pst = lambda n: "states/%s.state.json" % n
    # P01-P03 ------------------------------------------------------
    for pid, sc in (("P01", O1), ("P02", MIXED), ("P03", SV("loops2"))):
        reg(pid, "core", sc[0], sc[1], inp(), "pick/%s.pick" % pid, pickbuf_fn(sc, SZ, "initial", "pick/%s.pick" % pid))
    h = OWN("pickh")
    pts = [{"x": 450, "y": 306.00048828125}, {"x": 450, "y": 306.0009765625},
           {"x": 450, "y": 293.99951171875}, {"x": 450, "y": 293.9990234375}]
    r = reg("P04", "both", h[0], h[1], "", "", pick_fn(h, SZ, pst("pickh"), pts))
    # P05 loops2 apexes
    lo = SV("loops2")
    pts5 = [{"x": 32.1, "y": 275.0}, {"x": 32.1, "y": 266.0}, {"x": 32.1, "y": 280.0}]
    reg("P05", "both", lo[0], lo[1], "", "", pick_fn(lo, SZ, "initial", pts5))
    # P06 antiparallel pair of mixed20: apexes
    mm = model_of(*MIXED)
    st = state_of(mm, "initial", SZ)
    d = D.build_dl(mm, st)
    es = {pid: (form, pts) for pid, fl, form, pts in V.list_edges(d)}
    nd = len(d["nodes"])
    pts6 = []
    for ei in (7, 26):
        form, pp = es[nd + ei + 1]
        assert form == 1, "mixed20 edge %d is not a parallel member" % ei
        ap = V.flatten(form, pp)[8]
        pts6.append({"x": ap[0] / 1000, "y": ap[1] / 1000})
    reg("P06", "both", MIXED[0], MIXED[1], "", "", pick_fn(MIXED, SZ, "initial", pts6))
    # P07 exactly 6 px from a diagonal segment
    dd = OWN("pickd")
    reg("P07", "both", dd[0], dd[1], "", "", pick_fn(dd, SZ, pst("pickd"), [
        {"x": 254.8, "y": 296.4}, {"x": 245.2, "y": 303.6}, {"x": 254.801, "y": 296.4}, {"x": 245.199, "y": 303.6}]))
    # P08 endpoint branch of an interior vertex
    pv = OWN("pickv")
    wp = find_wedge_point(pv, pst("pickv"))
    assert wp is not None, "no wedge point found for P08"
    scenes.INFO["P08"] = {"x": wp[0], "y": wp[1], "pid": wp[2], "vertex": wp[3]}
    reg("P08", "both", pv[0], pv[1], "", "", pick_fn(pv, SZ, pst("pickv"), [{"x": wp[0] / 1000, "y": wp[1] / 1000}]))
    pt_ = OWN("pickt")
    reg("P09", "both", pt_[0], pt_[1], "", "", pick_fn(pt_, SZ, pst("pickt"), [{"x": 450, "y": 205}]))
    pn = OWN("pickn")
    reg("P10", "both", pn[0], pn[1], "", "", pick_fn(pn, SZ, pst("pickn"), [{"x": 450, "y": 303}]))
    reg("P11", "both", O1[0], O1[1], "", "", pick_fn(O1, SZ, pst("P11"), [{"x": 500, "y": 308}, {"x": 450, "y": 300}]))
    reg("P12", "both", O1[0], O1[1], "", "", pick_fn(O1, SZ, "initial", [
        {"x": "NaN", "y": 0}, {"x": "Infinity", "y": 0}, {"x": 0, "y": "-Infinity"}, {"x": 1099511627776, "y": 0},
        {"x": 2147483648, "y": 0}, {"x": 0, "y": -2147483649}]))
    cp = find_chord_point(pv, pst("pickv"))
    assert cp is not None, "no chord point found for P13"
    scenes.INFO["P13"] = {"x": cp[0], "y": cp[1]}
    reg("P13", "both", pv[0], pv[1], "", "", pick_fn(pv, SZ, pst("pickv"), [{"x": cp[0], "y": cp[1]}]))
    pb = OWN("pickb")
    reg("P14", "both", pb[0], pb[1], "", "", pick_fn(pb, SZ, pst("pickb"), [
        {"x": -3, "y": 300}, {"x": 903, "y": 300}, {"x": 450, "y": 300}]))
    reg("P15", "both", pb[0], pb[1], "", "", pick_fn(pb, SZ, pst("pickb"), [
        {"x": -0.00048828125, "y": 300}, {"x": -0.0009765625, "y": 300},
        {"x": 900.00048828125, "y": 300}, {"x": 900.0009765625, "y": 300}]))
    reg("P16", "core", O1[0], O1[1], {"file": "pick/P01.pick", "also": [{"file": "pick/P02.pick"}, {"file": "pick/P03.pick"}]},
        "pick/P16.pick", pickparse_fn(["pick/P01.pick", "pick/P02.pick", "pick/P03.pick"], "pick/P16.pick"))
    # B ------------------------------------------------------------
    reg("B01", "both", O1[0], O1[1], inp(), "bounds/B01.bounds", boundsfn(O1, SZ, "initial", "bounds/B01.bounds"))
    tr = SV("trim")
    reg("B02", "both", tr[0], tr[1], inp(), "bounds/B02.bounds", boundsfn(tr, SZ, "initial", "bounds/B02.bounds"))
    lo = SV("loops2")
    reg("B03", "both", lo[0], lo[1], inp(), "bounds/B03.bounds", boundsfn(lo, SZ, "initial", "bounds/B03.bounds"))
    reg("B04", "both", EMPTY[0], EMPTY[1], inp(), "bounds/B04.bounds", boundsfn(EMPTY, SZ, "initial", "bounds/B04.bounds"))


# ------------------------------------------------------------------ C rows
def calls_fn(sc, size, state, options, replay, expected, two=False, nohook=False):
    def fn():
        mdl = model_of(*sc)
        st = state_of(mdl, state, size)
        d = D.build_dl(mdl, st, options)
        ro = conv(replay) if replay is not None else None
        if two:
            rec = V.Rec()
            V.replay(d, rec, ro)
            b1 = rec.bytes()
            rec.reset()
            V.replay(d, rec, ro)
            b2 = rec.bytes()
            return Out(files={expected: b2}, extra=(b1 == b2))
        if nohook:
            with_h = V.record_calls(d, ro, True)
            without = V.record_calls(d, ro, False)
            return Out(files={expected: V.strip_markers(with_h)}, extra=(without == V.strip_markers(with_h)),
                       )
        return Out(files={expected: V.record_calls(d, ro)})
    return fn


def reg_c(id, sc, state="initial", options=None, replay=None, two=False, nohook=False, err=False, tier="both"):
    d = {"size": SZ, "state": state}
    if options is not None:
        d["options"] = options
    if replay is not None:
        d["replay"] = replay
    exp = "calls/%s.calls" % id
    r = reg(id, tier, sc[0], sc[1], d, "" if err else exp, calls_fn(sc, SZ, state, options, replay, exp, two, nohook))
    return r


def register_c():
    reg_c("C01", O1)
    reg_c("C02", O1, "states/Y03.state.json")
    reg_c("C03", MIXED, "states/C03.state.json")
    reg_c("C04", O4)
    reg_c("C05", O1, replay={"dprMilli": 1500})
    reg_c("C06", O1, replay={"ink": [255, 0, 128]})
    reg_c("C07", MIXED)
    reg_c("C08", EMPTY)
    reg_c("C09", O1, options={"labels": False})
    reg_c("C10", OWN("hostile"))
    reg_c("C11", O1, replay={"dprMilli": 249}, err=True)
    reg_c("C12", O1, replay={"dprMilli": 1000.5}, err=True)
    reg_c("C13", O1, two=True)
    reg_c("C14", O1, replay={"ink": [256, 0, 0]}, err=True)
    reg_c("C15", O1, replay={"ink": "red"}, err=True)
    reg_c("C16", O1, replay={"layers": [8]})
    reg_c("C17", O1, replay={"layers": [3, 1]}, err=True)
    reg_c("C18", O1, nohook=True)
    reg_c("C19", SV("loops2"), "states/C19.state.json")
    reg_c("C20", SV("ten"), "states/C20.state.json")
    reg_c("C21", O1, replay={"ink": [0, 0]}, err=True)
    reg_c("C22", O1, replay={"layers": []})
    reg_c("C23", O1, replay={"layers": [9]}, err=True)
    reg_c("C24", O1, replay={"layers": [8, 8]}, err=True)
    reg_c("C25", O1, replay={"onElement": "not-a-function"}, err=True)


# ------------------------------------------------------------------ Z rows
def z_fn(w, h, dpr, exp):
    def fn():
        r = V.backing_size(w, h, dpr)
        return Out(files={exp: cjb(r) + b"\n"})
    return fn


def register_z():
    cases = [("Z01", 900, 600, 1333), ("Z02", 16384, 100, 2000), ("Z03", 16384, 16384, 2000),
             ("Z04", 16384, 16384, 250), ("Z05", 900, 600, 249), ("Z06", 900, 600, 8001), ("Z07", 0, 600, 1000)]
    for id, w, h, dpr in cases:
        exp = "json/%s.json" % id
        err = id in ("Z05", "Z06", "Z07")
        reg(id, "core", "", "", {"width": w, "height": h, "dprMilli": dpr}, "" if err else exp, z_fn(w, h, dpr, exp))


# ------------------------------------------------------------------ R rows
def scrape_svg(path):
    """the oracle's own scrape of an expected SVG document into a SvgReadoutLike"""
    t = fs(path).decode("utf-8")
    root = ET.fromstring(t)
    ns = "{http://www.w3.org/2000/svg}"
    nodes, edges = [], []
    directed = False

    def addr(gid):
        m = re.fullmatch(r"[^-]+-[ne]-([0-9a-f]+)", gid)
        return json.loads(bytes.fromhex(m.group(1)).decode("utf-8"))
    for g in root.iter(ns + "g"):
        cls = g.get("class", "").split()
        if "igr-node" in cls:
            c = g.find(ns + "circle[@class='igr-shape']")
            tx = g.find(ns + "text")
            n = {"address": addr(g.get("id")), "cx": c.get("cx"), "cy": c.get("cy"),
                 "selected": "igr-selected" in cls, "focused": "igr-focused" in cls}
            if tx is not None:
                n["label"] = tx.text or ""
            nodes.append(n)
        elif "igr-edge" in cls:
            ln = g.find(ns + "path[@class='igr-line']")
            tx = g.find(ns + "text")
            mk = ln.get("marker-end") is not None
            directed = directed or mk
            e = {"address": addr(g.get("id")), "selected": "igr-selected" in cls, "focused": "igr-focused" in cls,
                 "marker": mk}
            if tx is not None:
                e["label"] = tx.text or ""
            edges.append(e)
    return {"scene_sha256": root.get("data-igr-scene"), "layout_sha256": root.get("data-igr-layout"),
            "width": int(root.get("width")), "height": int(root.get("height")), "directed": directed,
            "nodes": nodes, "edges": edges}


def r_list_fn(sc, size, state, options, exp):
    def fn():
        mdl, st, d = _dl_of(sc, size, state, options)
        return Out(files={exp: V.serialize_readout(V.readout_from_list(d, mdl))})
    return fn


def r_svg_fn(sc, size, state, svgpath, exp):
    def fn():
        obj = scrape_svg(svgpath)
        return Out(files={exp: V.serialize_readout(V.readout_from_svg(obj))})
    return fn


def r_calls_fn(sc, size, state, callspath, exp, options=None):
    def fn():
        mdl, st, d = _dl_of(sc, size, state, options)
        return Out(files={exp: V.serialize_readout(V.readout_from_stream(fs(callspath), d, mdl))})
    return fn


def r_object_fn(obj, exp):
    def fn():
        return Out(files={exp: V.serialize_readout(V.readout_from_svg(conv(obj)))})
    return fn


def r_compare_fn(entries, exp):
    def fn():
        ents = [{"renderer": e["renderer"], "readout": json.loads(fs(e["readout"]).decode("utf-8"))} for e in entries]
        res = V.compare_readouts(ents)
        return Out(files={exp: cjb(res) + b"\n"})
    return fn


XR_INPUTS = {}


def ensure_xr():
    """derived input readouts of the compare rows (from the unmutated R01)."""
    if "xr/R17.b.xr.json" in base.BASE:
        return
    _m, _s, _d = _dl_of(SV("astral"), SZ, "initial")
    base.BASE["calls/X13.calls"] = V.record_calls(_d)
    # R44: the G01 stream whose layer-7 section for pid 1 keeps its marker but has neither fill nor stroke
    _out, _in = [], False
    for _l in base.BASE["calls/C01.calls"].split(b"\n"):
        if not _l:
            continue
        if _l.startswith(b'["#",'):
            _in = (_l == b'["#",1,7]')
        elif _in and _l in (b'["m","fill"]', b'["m","stroke"]'):
            continue
        _out.append(_l + b"\n")
    base.BASE["calls/R44.calls"] = b"".join(_out)
    r01 = json.loads(fs("xr/R01.xr.json").decode("utf-8"))
    import copy
    b17 = copy.deepcopy(r01)
    b17["labels"]["nodes"][0]["text"] = "2"
    base.BASE["xr/R17.b.xr.json"] = V.serialize_readout(b17)
    b18 = copy.deepcopy(r01)
    b18["scene_sha256"] = "0" * 64
    base.BASE["xr/R18.b.xr.json"] = V.serialize_readout(b18)
    b19 = copy.deepcopy(r01)
    del b19["arrows"]
    b19["xr"] = "igr-xr/2"
    base.BASE["xr/R19.a.xr.json"] = (cj(b19) + "\n").encode("utf-8")
    b36 = copy.deepcopy(r01)
    b36["nodes_far"] = []
    b36["nodes_at"] = b36["nodes_at"][:1]
    base.BASE["xr/R36.a.xr.json"] = V.serialize_readout(b36)
    b37 = copy.deepcopy(r01)
    b37["xr"] = "igr-xr/2"
    base.BASE["xr/R37.a.xr.json"] = V.serialize_readout(b37)
    b38 = copy.deepcopy(r01)
    b38["__proto__"] = {}
    base.BASE["xr/R38.a.xr.json"] = V.serialize_readout(b38)


def ens(fn):
    def w():
        ensure_xr()
        return fn()
    return w


def register_r():
    L = lambda id, sc, state="initial", options=None, tier="both": reg(
        id, tier, sc[0], sc[1], dict({"from": "list", "size": SZ, "state": state}, **({"options": options} if options else {})),
        "xr/%s.xr.json" % id, r_list_fn(sc, SZ, state, options, "xr/%s.xr.json" % id))
    scs = [O1, O4, EMPTY, SINGLE, MIXED, UNICODE, KEYBOUND, MIXED, O1, O1, SV("loops2")]
    for i, sc in enumerate(scs):
        size = SZ
        id = "R%02d" % (i + 1)
        if id == "R08":
            size = {"width": 400, "height": 300}
        elif id == "R09":
            size = {"width": 1, "height": 1}
        elif id == "R10":
            size = {"width": 901, "height": 601}
        reg(id, "both", sc[0], sc[1], {"from": "list", "size": size, "state": "initial"}, "xr/%s.xr.json" % id,
            r_list_fn(sc, size, "initial", None, "xr/%s.xr.json" % id))

    def svgrow(id, sc, state, svgname):
        reg(id, "core", sc[0], sc[1], {"from": "svg", "svg": PRE % svgname}, "xr/%s.xr.json" % id,
            r_svg_fn(sc, SZ, state, PRE % svgname, "xr/%s.xr.json" % id))
    svgrow("R12", O1, "initial", "G01")
    svgrow("R13", MIXED, "initial", "G05")
    svgrow("R14", O1, "states/Y03.state.json", "Y03")
    svgrow("R15", SV("trunc"), "initial", "X03")
    reg("R16", "core", O1[0], O1[1], {"from": "calls", "calls": "calls/C01.calls"}, "xr/R16.xr.json",
        r_calls_fn(O1, SZ, "initial", "calls/C01.calls", "xr/R16.xr.json"))
    ents = lambda a, b: [{"renderer": "a", "readout": a}, {"renderer": "b", "readout": b}]
    e17 = ents("xr/R01.xr.json", "xr/R17.b.xr.json")
    reg("R17", "core", "", "", {"from": "compare", "entries": e17}, "xr/R17.compare.json", ens(r_compare_fn(e17, "xr/R17.compare.json")))
    e18 = ents("xr/R01.xr.json", "xr/R18.b.xr.json")
    reg("R18", "core", "", "", {"from": "compare", "entries": e18}, "xr/R18.compare.json", ens(r_compare_fn(e18, "xr/R18.compare.json")))
    e19 = ents("xr/R19.a.xr.json", "xr/R01.xr.json")
    reg("R19", "core", "", "", {"from": "compare", "entries": e19}, "", ens(r_compare_fn(e19, "xr/R19.compare.json")))
    h1, h2 = "1" * 64, "2" * 64
    nd = lambda a, x, y: {"address": {"id": "s:" + a, "type": "p"}, "cx": x, "cy": y, "selected": False,
                          "focused": False, "label": a}
    obj20 = {"scene_sha256": h1, "layout_sha256": h2, "width": 900, "height": 600, "directed": False,
             "nodes": [nd("a", "1.001", "4.35"), nd("b", "0.007", "-0.001"), nd("c", "867.928", "0.1")], "edges": []}
    reg("R20", "core", "", "", {"from": "object", "object": obj20}, "xr/R20.xr.json", r_object_fn(obj20, "xr/R20.xr.json"))
    far = OWN("far")
    reg("R21", "both", far[0], far[1], {"from": "list", "size": SZ, "state": "states/R21.state.json"}, "xr/R21.xr.json",
        r_list_fn(far, SZ, "states/R21.state.json", None, "xr/R21.xr.json"))
    reg("R22", "both", SV("astral")[0], SV("astral")[1], {"from": "list", "size": SZ, "state": "initial"}, "xr/R22.xr.json",
        r_list_fn(SV("astral"), SZ, "initial", None, "xr/R22.xr.json"))
    for id, txt in (("R23", "1.0005"), ("R24", "abc"), ("R25", "-0"), ("R26", ""), ("R27", "1e3")):
        o = {"scene_sha256": h1, "layout_sha256": h2, "width": 900, "height": 600, "directed": False,
             "nodes": [nd("a", txt, "1")], "edges": []}
        reg(id, "core", "", "", {"from": "object", "object": o}, "", r_object_fn(o, "xr/%s.xr.json" % id))
    fu = OWN("far-u")
    reg("R28", "both", fu[0], fu[1], {"from": "list", "size": SZ, "state": "states/R28.state.json"}, "xr/R28.xr.json",
        r_list_fn(fu, SZ, "states/R28.state.json", None, "xr/R28.xr.json"))
    reg("R29", "both", fu[0], fu[1], {"from": "list", "size": SZ, "state": "states/R29.state.json"}, "xr/R29.xr.json",
        r_list_fn(fu, SZ, "states/R29.state.json", None, "xr/R29.xr.json"))
    for id, sc, st in (("R30", O1, "states/Y03.state.json"), ("R31", O1, "states/Y05.state.json"),
                       ("R32", O1, "states/Y06.state.json"), ("R33", O1, "states/Y16.state.json"),
                       ("R34", O1, "states/Y07.state.json"), ("R35", O4, "initial")):
        reg(id, "both", sc[0], sc[1], {"from": "list", "size": SZ, "state": st}, "xr/%s.xr.json" % id,
            r_list_fn(sc, SZ, st, None, "xr/%s.xr.json" % id))
    e36 = ents("xr/R36.a.xr.json", "xr/R01.xr.json")
    reg("R36", "core", "", "", {"from": "compare", "entries": e36}, "", ens(r_compare_fn(e36, "xr/R36.compare.json")))
    e37 = ents("xr/R37.a.xr.json", "xr/R01.xr.json")
    reg("R37", "core", "", "", {"from": "compare", "entries": e37}, "", ens(r_compare_fn(e37, "xr/R37.compare.json")))
    e38 = ents("xr/R38.a.xr.json", "xr/R01.xr.json")
    reg("R38", "core", "", "", {"from": "compare", "entries": e38}, "", ens(r_compare_fn(e38, "xr/R38.compare.json")))
    for id, sc, st, c in (("R39", O1, "states/Y03.state.json", "calls/C02.calls"),
                          ("R40", MIXED, "states/C03.state.json", "calls/C03.calls"),
                          ("R41", SV("loops2"), "states/C19.state.json", "calls/C19.calls"),
                          ("R42", O4, "initial", "calls/C04.calls"),
                          ("R43", SV("astral"), "initial", "calls/R43.calls")):
        if id == "R43":
            # the stream of X13 (no C row exists for it) is a derived input file, calls/X13.calls
            reg(id, "core", sc[0], sc[1], {"from": "calls", "calls": "calls/X13.calls"},
                "xr/%s.xr.json" % id, ens(r_calls_fn(sc, SZ, st, "calls/X13.calls", "xr/%s.xr.json" % id)))
        else:
            reg(id, "core", sc[0], sc[1], {"from": "calls", "calls": c}, "xr/%s.xr.json" % id,
                r_calls_fn(sc, SZ, st, c, "xr/%s.xr.json" % id))


def scrape_svg_geom(path):
    """node centres, label anchors, edge d numbers (all in m-px) of an expected V5 document (C-V5 parity)."""
    t = fs(path).decode("utf-8")
    root = ET.fromstring(t)
    ns = "{http://www.w3.org/2000/svg}"
    nodes, edges = [], []
    for g in root.iter(ns + "g"):
        cls = g.get("class", "").split()
        if "igr-node" in cls:
            c = g.find(ns + "circle[@class='igr-shape']")
            tx = g.find(ns + "text")
            n = {"x": V.dec_to_mpx(c.get("cx")), "y": V.dec_to_mpx(c.get("cy"))}
            if tx is not None:
                n["lab"] = (V.dec_to_mpx(tx.get("x")), V.dec_to_mpx(tx.get("y")), tx.text or "")
            nodes.append(n)
        elif "igr-edge" in cls:
            ln = g.find(ns + "path[@class='igr-line']")
            toks = ln.get("d").split()
            form = {"L": 0, "Q": 1, "C": 2}[[x for x in toks if x in "LQC"][0]]
            nums = [V.dec_to_mpx(x) for x in toks if x not in ("M", "L", "Q", "C")]
            tx = g.find(ns + "text")
            e = {"form": form, "nums": nums, "marker": ln.get("marker-end") is not None}
            if tx is not None:
                e["lab"] = (V.dec_to_mpx(tx.get("x")), V.dec_to_mpx(tx.get("y")), tx.text or "")
            edges.append(e)
    return nodes, edges


def parity_svg(outs):
    """C-V5 (3.2): every coordinate of the list equals the number V5 prints times 1000."""
    pairs = [("G01", "G01"), ("G02", "G02"), ("G03", "G03"), ("G04", "G04"), ("G05", "G05"), ("G06", "G06"),
             ("G07", "G07"), ("G08", "G08"), ("G09", "G09"), ("G10", "G10"), ("G11", "N08"), ("N09", "N09"),
             ("N10", "N10"), ("N06", "N04"), ("N05", "N07"), ("N01", "N01"), ("N02", "N02"), ("N16", "N03"),
             ("N17", "N15"), ("Y01", "Y01"), ("Y02", "Y02"), ("Y03", "Y03"), ("Y04", "Y04"), ("Y05", "Y05"),
             ("Y06", "Y06"), ("Y07", "Y07"), ("Y08", "Y08"), ("Y10", "Y10"), ("Y11", "Y11"), ("Y12", "Y12"),
             ("Y13", "Y13"), ("Y16", "Y16"), ("Y17", "Y17"), ("X01", "X03"), ("X03", "X10"), ("X04", "X11"),
             ("X05", "X08"), ("X06", "X07"), ("X07", "X14"), ("X08", "X06"), ("X10", "X13"), ("X13", "X15"),
             ("X02", "X12"), ("N15", "N13")]
    res = {}
    for mine, svg in pairs:
        row = base.ROW_BY_ID[mine]
        o = outs.get(mine)
        if o is None or o.error or not row.expected:
            continue
        if not os.path.exists(os.path.join(base.CORPUS_DIR, "..", "oracles-svg", "svg", svg + ".svg")):
            continue
        inp = row.inp
        mdl = model_of(row.scene, row.layout)
        st = state_of(mdl, inp["state"], inp["size"])
        d = D.build_dl(mdl, st, conv(inp.get("options")) if "options" in inp else None)
        nodes, edges = scrape_svg_geom(PRE % svg)
        ok = True
        why = ""
        Ns = [r for r in d["records"] if r[0] == "N"]
        Es = [r for r in d["records"] if r[0] == "E"]
        As = {r[1]: r for r in d["records"] if r[0] == "A"}
        Ts = {r[1]: r for r in d["records"] if r[0] == "T"}
        if len(nodes) != len(Ns) or len(edges) != len(Es):
            ok, why = False, "counts"
        else:
            for n, r in zip(nodes, Ns):
                if (n["x"], n["y"]) != (r[4], r[5]):
                    ok, why = False, "node centre"
                t_ = Ts.get(r[1])
                if (t_ is None) != ("lab" not in n):
                    ok, why = False, "node label presence"
                elif t_ is not None and (t_[3], t_[4], t_[5]) != n["lab"]:
                    # V5 prints the xml-escaped text decoded by the parser; compare positions and text
                    ok, why = False, "node label %r %r" % ((t_[3], t_[4], t_[5]), n["lab"])
            for e, r in zip(edges, Es):
                if e["form"] != r[3] or e["nums"] != r[4:]:
                    ok, why = False, "edge route"
                if e["marker"] != (r[1] in As):
                    ok, why = False, "arrow presence"
                t_ = Ts.get(r[1])
                if (t_ is None) != ("lab" not in e):
                    ok, why = False, "edge label presence"
                elif t_ is not None and (t_[3], t_[4], t_[5]) != e["lab"]:
                    ok, why = False, "edge label"
        res["%s~svg:%s" % (mine, svg)] = True if ok else "DIFF " + why
    return res


def register_r44():
    reg("R44", "core", O1[0], O1[1], {"from": "calls", "calls": "calls/R44.calls"}, "xr/R44.xr.json",
        ens(r_calls_fn(O1, SZ, "initial", "calls/R44.calls", "xr/R44.xr.json")))
