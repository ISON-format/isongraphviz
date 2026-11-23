"""Rows G, N, X, Y, O, F, S and the state files they need."""
import json

import core
from core import cj, cjb
import dl as D
import scenes
from base import *      # noqa
import base

O1 = ("../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json")
O4 = ("../oracles/o4-undirected.scene.json", "../oracles-igl/layouts/F02.layout.json")
EMPTY = ("../oracles-igl/scenes/empty.scene.json", "../oracles-igl/layouts/F07.layout.json")
SINGLE = ("../oracles-igl/scenes/single.scene.json", "../oracles-igl/layouts/F08.layout.json")
MIXED = ("../oracles-igl/scenes/mixed20.scene.json", "../oracles-igl/layouts/F04.layout.json")
UNICODE = ("../oracles-igl/scenes/unicode.scene.json", "../oracles-igl/layouts/F09.layout.json")
KEYBOUND = ("../oracles-igl/scenes/keybound.scene.json", "../oracles-igl/layouts/F13.layout.json")
O1_V45 = (O1[0], "../oracles-igl/verify/V45.layout.json")
O1_V46 = (O1[0], "../oracles-igl/verify/V46.layout.json")


def SV(name):
    return ("../oracles-svg/scenes/%s.scene.json" % name, "../oracles-svg/layouts/%s.layout.json" % name)


def OWN(name):
    return ("scenes/%s.scene.json" % name, "layouts/%s.layout.json" % name)


SVG_STATE = "../oracles-svg/states/%s.state.json"
SZ = {"width": 900, "height": 600}
A2VP = {"center_x": 383554, "center_y": 134563, "height": 600, "width": 900, "zoom": 1994}


def mkstate(model, vp, selN=(), selE=(), hidN=(), hidE=(), focus=None):
    st = core.empty_state(model, vp)
    nodes = {n["ref"]["id"]: n for n in model["nodes"]}

    def srt(items, idx):
        return [i for _, i in sorted(items, key=lambda t: t[0])]
    st["selection"]["nodes"] = srt([(nodes[i]["index"], nodes[i]["ref"]) for i in selN], 0)
    st["selection"]["edges"] = srt([(e["index"], e["ref"]) for e in model["edges"] if (e["index"] in selE)], 0)
    st["hidden"]["nodes"] = srt([(nodes[i]["index"], nodes[i]["ref"]) for i in hidN], 0)
    st["hidden"]["edges"] = srt([(e["index"], e["ref"]) for e in model["edges"] if (e["index"] in hidE)], 0)
    if focus is not None:
        st["focus"] = focus
    return st


def put_state(name, st):
    scenes.CORPUS["states/%s.state.json" % name] = cjb(st)
    return "states/%s.state.json" % name


def make_states():
    mo1 = base.model_of(*O1)
    mmx = base.model_of(*MIXED)
    mlo = base.model_of(*SV("loops2"))
    mten = base.model_of(*SV("ten"))
    mo4 = base.model_of(*O4)
    n1, ann = base.wire_node(mo1, "i:1"), base.wire_node(mo1, "s:ann")
    e1 = mo1["edges"][0]["ref"]
    put_state("Y01", mkstate(mo1, A2VP, selN=["i:1"]))
    put_state("Y02", mkstate(mo1, A2VP, selE={0}))
    put_state("Y03", mkstate(mo1, A2VP, selN=["i:1"], selE={0}, focus={"node": ann}))
    put_state("Y04", mkstate(mo1, A2VP, focus={"node": ann}))
    put_state("Y05", mkstate(mo1, A2VP, focus={"edge": e1}))
    put_state("Y06", mkstate(mo1, A2VP, selN=["i:1"], focus={"node": n1}))
    put_state("Y07", mkstate(mo1, A2VP, hidN=["s:ann"]))
    vpm = core.initial_state(mmx, 900, 600)["viewport"]
    he = base.wire_edge(mmx, "i:16", "R3", "i:8")
    idx = [e["index"] for e in mmx["edges"] if e["ref"] == he][0]
    put_state("Y08", mkstate(mmx, vpm, hidE={idx}))
    put_state("Y09", mkstate(mo1, A2VP, hidN=["i:1", "s:ann"]))
    put_state("Y10", mkstate(mo1, A2VP, hidN=["i:1"]))
    put_state("Y11", mkstate(mmx, vpm, selN=[n["ref"]["id"] for n in mmx["nodes"]],
                             selE={e["index"] for e in mmx["edges"]}))
    put_state("Y12", mkstate(mmx, vpm, hidN=["i:8"], focus={"node": base.wire_node(mmx, "i:4")}))
    put_state("Y13", mkstate(mo1, {"center_x": 10000000, "center_y": 10000000, "height": 600, "width": 900,
                                   "zoom": 1994}))
    put_state("Y14", core.initial_state(mo4, 900, 600))
    st15 = mkstate(mo1, A2VP)
    st15["selection"]["nodes"] = [ann, n1]
    put_state("Y15", st15)
    put_state("Y16", mkstate(mo1, A2VP, selE={0}, focus={"edge": e1}))
    comp = [n["ref"]["id"] for n in mmx["nodes"] if n["category"] == "company"]
    assert len(comp) == 7, comp
    put_state("Y17", mkstate(mmx, vpm, hidN=comp))
    put_state("N15", core.empty_state(mo1, {"center_x": 383554, "center_y": 134563, "height": 600, "width": 900,
                                          "zoom": 100000}))
    put_state("P11", mkstate(mo1, A2VP, hidE={0}))
    # C03: an edge both selected and focused (a parallel member), one node selected
    par = [e["index"] for e in mmx["edges"] if e["index"] in (7, 26)]
    put_state("C03", mkstate(mmx, vpm, selN=["i:1"], selE={7}, focus={"edge": mmx["edges"][7]["ref"]}))
    put_state("C19", mkstate(mlo, core.initial_state(mlo, 900, 600)["viewport"],
                             focus={"node": base.wire_node(mlo, "s:a")}))
    put_state("C20", mkstate(mten, core.initial_state(mten, 900, 600)["viewport"],
                             selN=[mten["nodes"][0]["ref"]["id"]]))
    mfar = base.model_of(*OWN("far"))
    put_state("R21", scenes.ident_state(mfar, 900, 600))
    # a state against the empty scene (U rows)
    return True


def cmp_with_svg_states():
    """Informational: states that the oracles-svg corpus also holds (same description)."""
    res = {}
    import os
    for nm in ["Y01", "Y02", "Y03", "Y04", "Y05", "Y06", "Y07", "Y08", "Y09", "Y10", "Y11", "Y12", "Y13", "Y14",
               "Y15", "Y16", "Y17"]:
        p = os.path.join(base.CORPUS_DIR, "..", "oracles-svg", "states", nm + ".state.json")
        if os.path.exists(p):
            res[nm] = (open(p, "rb").read() == scenes.CORPUS["states/%s.state.json" % nm])
    return res


def reg_dl(id, tier, sc, inp, killer=None):
    exp = "dl/%s.dl" % id
    return reg(id, tier, sc[0], sc[1], inp, exp, dl_row_fn(sc[0], sc[1], inp, exp))


def reg_err(id, tier, sc, inp):
    return reg(id, tier, sc[0], sc[1], inp, "", dl_row_fn(sc[0], sc[1], inp, "dl/%s.dl" % id))


def inp(state="initial", size=SZ, **kw):
    d = {"size": size, "state": state}
    d.update(kw)
    return d


def register_dl_rows():
    # G ------------------------------------------------------------
    reg_dl("G01", "both", O1, inp())
    reg_dl("G02", "both", O4, inp())
    reg_dl("G03", "both", EMPTY, inp())
    reg_dl("G04", "both", SINGLE, inp())
    reg_dl("G05", "both", MIXED, inp())
    reg_dl("G06", "both", UNICODE, inp())
    reg_dl("G07", "both", KEYBOUND, inp())
    reg_dl("G08", "both", MIXED, inp(size={"width": 400, "height": 300}))
    reg_dl("G09", "both", O1, inp(size={"width": 1, "height": 1}))
    reg_dl("G10", "both", O1, inp(size={"width": 901, "height": 601}))
    reg_dl("G11", "both", SV("loops2"), inp())
    # N ------------------------------------------------------------
    reg_dl("N01", "both", SV("ties"), inp(SVG_STATE % "N01"))
    reg_dl("N02", "both", SV("zero"), inp(SVG_STATE % "N02"))
    reg_dl("N03", "both", OWN("arrows"), inp("states/N03.state.json", search="inputs/N03.search.json"))
    reg_dl("N04", "both", OWN("quadcub"), inp())
    reg_dl("N05", "both", SV("coincident"), inp())
    reg_dl("N06", "both", SV("deg"),
           inp(SVG_STATE % "N04", also=[{"state": SVG_STATE % "N05", "expected": "dl/N06b.dl"},
                                         {"state": SVG_STATE % "N06", "expected": "dl/N06c.dl"}]))
    reg_dl("N07", "both", OWN("zerotrim"), inp("states/N07.state.json"))
    reg_dl("N08", "both", SV("loops2"), inp())
    reg_dl("N09", "both", SV("multi4"), inp())
    reg_dl("N10", "both", SV("multi4"), inp(SVG_STATE % "N10"))
    reg_err("N11", "both", O1_V45, inp())
    reg_err("N12", "both", O1_V46, inp())
    reg_dl("N13", "both", OWN("far-u"), inp("states/N13.state.json"))
    reg_err("N14", "both", OWN("far-u"), inp("states/N14.state.json"))
    reg_dl("N15", "both", O1, inp("states/N15.state.json"))
    reg_dl("N16", "both", SV("trim"), inp(SVG_STATE % "N03"))
    reg_dl("N17", "both", SV("anchors"), inp(SVG_STATE % "N15"))
    # X ------------------------------------------------------------
    reg_dl("X01", "both", SV("trunc"), inp())
    reg_dl("X02", "both", SV("markup"), inp())
    reg_dl("X03", "both", SV("ctl"), inp())
    reg_dl("X04", "both", SV("illegal"), inp())
    reg_dl("X05", "both", SV("emptylabels"), inp())
    reg_dl("X06", "both", SV("nfc"), inp())
    reg_dl("X07", "both", SV("bidi"), inp())
    reg_dl("X08", "both", SV("ids12"), inp())
    reg_dl("X09", "both", O1, inp(options={"maxDrawnLabelUnits": 4}))
    reg_dl("X10", "both", SV("ten"), inp())
    reg_dl("X11", "both", MIXED, inp("states/Y17.state.json"))
    reg_dl("X12", "both", OWN("brackets"), inp())
    reg_dl("X13", "both", SV("astral"), inp())
    # Y ------------------------------------------------------------
    for k, sc in (("Y01", O1), ("Y02", O1), ("Y03", O1), ("Y04", O1), ("Y05", O1), ("Y06", O1), ("Y07", O1),
                  ("Y08", MIXED), ("Y09", O1), ("Y10", O1), ("Y11", MIXED), ("Y12", MIXED), ("Y13", O1)):
        reg_dl(k, "both", sc, inp("states/%s.state.json" % k))
    reg_err("Y14", "core", O1, inp("states/Y14.state.json"))
    reg_err("Y15", "core", O1, inp("states/Y15.state.json"))
    reg_dl("Y16", "both", O1, inp("states/Y16.state.json"))
    reg_dl("Y17", "both", MIXED, inp("states/Y17.state.json"))
    # O ------------------------------------------------------------
    reg_dl("O01", "both", O1, inp(options={"labels": False}))
    reg_dl("O02", "core", O1, inp(options={"edgeLabels": False}))
    reg_dl("O03", "core", O1, inp(options={"maxDrawnLabelUnits": 9}))
    reg_dl("O04", "core", O1, inp(options={"maxDrawnLabelUnits": 8}))
    reg_dl("O05", "core", O1, inp(options={"maxDrawnLabelUnits": 0}))
    reg_dl("O06", "core", SV("trunc3"), inp(options={"maxDrawnLabelUnits": 5}))
    reg_err("O07", "core", O1, inp(options={"bogus": True}))
    reg_err("O08", "core", O1, inp(options={"labels": "yes"}))
    reg_err("O09", "core", O1, inp(options={"maxDrawnLabelUnits": 1.5}))
    reg_err("O10", "core", O1, inp(options={"maxDrawnLabelUnits": "NaN"}))
    reg_err("O11", "core", O1, inp(options={"maxDrawnLabelUnits": -1}))
    reg_err("O12", "core", O1, inp(options=[]))
    reg_err("O13", "core", O1, inp(options={"labels": None}))
    reg_err("O14", "core", O1, inp(plain_object_model=True))
    reg_dl("O15", "core", O1, inp(options={"maxDrawnLabelUnits": 2147483648}))
    reg_err("O16", "core", O1, inp(options={"maxDrawnLabelUnits": 2147483649}))
    reg_err("O17", "core", O1, inp(options={"labels": "yes", "maxDrawnLabelUnits": "NaN"}))
    # F ------------------------------------------------------------
    g01len = len(D.serialize_dl(D.build_dl(base.model_of(*O1), core.initial_state(base.model_of(*O1), 900, 600))))
    assert g01len == 637
    reg("F01", "core", O1[0], O1[1], inp(limits={"maxBytes": 637}), "dl/F01.dl", dl_row_fn(O1[0], O1[1], inp(limits={"maxBytes": 637}), "dl/F01.dl"))
    reg("F02", "core", O1[0], O1[1], inp(limits={"maxBytes": 636}), "", dl_row_fn(O1[0], O1[1], inp(limits={"maxBytes": 636}), "dl/F02.dl"))
    hub = SV("hub")
    hm = base.model_of(*hub)
    hlen = len(D.serialize_dl(D.build_dl(hm, core.initial_state(hm, 900, 600))))
    reg("F03", "core", hub[0], hub[1], inp(limits={"maxBytes": 4096}), "", dl_row_fn(hub[0], hub[1], inp(limits={"maxBytes": 4096}), "dl/F03.dl"))
    reg("F04", "core", hub[0], hub[1], inp(limits={"maxBytes": hlen}), "dl/F04.dl", dl_row_fn(hub[0], hub[1], inp(limits={"maxBytes": hlen}), "dl/F04.dl"))
    reg("F05", "core", O1[0], O1[1], inp(limits={"maxBytes": 0}), "", dl_row_fn(O1[0], O1[1], inp(limits={"maxBytes": 0}), "dl/F05.dl"))


# ------------------------------------------------------------------ S rows
def _lines(path):
    t = base.fs(path).decode("utf-8")
    assert t.endswith("\n")
    return t[:-1].split("\n")


def _join(ls):
    return ("\n".join(ls) + "\n").encode("utf-8")


def _rec(l):
    return json.loads(l)


def _legacy_lines(row_id):
    """The lines of an expected list as the builder wrote them BEFORE the label placement LP/1 (R-H, 2026-11-22): the hand-built bad lists of the S rows are
    inputs, not expected outputs, so they keep the old T positions (their T coordinates are only range-checked by the reader)."""
    D.LP_ON[0] = False
    try:
        o = base.run_row(base.ROW_BY_ID[row_id])
    finally:
        D.LP_ON[0] = True
    t = o.files["dl/%s.dl" % row_id].decode("utf-8")
    assert t.endswith(chr(10))
    return t[:-1].split(chr(10))


def build_bad():
    G01, G02, G11 = _legacy_lines("G01"), _legacy_lines("G02"), _legacy_lines("G11")
    out = {}
    SF = {}

    def put(id, content, rules, kind="lines"):
        b = _join(content) if kind == "lines" else content
        out["bad/%s.dl" % id] = b
        SF[id] = set(rules)

    def kind_idx(ls, k):
        return [i for i, l in enumerate(ls) if l.startswith('["%s"' % k)]

    put("S02", G01[1:], {"kind"})
    put("S03", [G01[0]] + G01, {"kind"})
    put("S04", [G01[0].replace("igr-dl/1", "igr-dl/2")] + G01[1:], {"format"})
    h = _rec(G01[0])
    h5 = list(h)
    h5[8] = 3
    put("S05", [cj(h5)] + G01[1:], {"count"})
    ni, ei = kind_idx(G01, "n"), kind_idx(G01, "e")
    s06 = [G01[0], G01[ei[0]]] + [G01[i] for i in ni] + G01[ei[0] + 1:]
    put("S06", s06, {"order"})
    s07 = list(G01)
    s07[ni[0]] = '["n",{"type":"person","id":"i:1"}]'
    put("S07", s07, {"canon_table"})
    s08 = list(G01)
    s08[ni[1]] = G01[ni[0]]
    put("S08", s08, {"dup"})
    # S09: an E with a node pid (undirected scene)
    E2 = kind_idx(G02, "E")
    f0 = [i for i in E2 if _rec(G02[i])[3] == 0][0]
    s09 = list(G02)
    r = _rec(s09[E2[0]])
    r[1] = 1
    s09[E2[0]] = cj(r)
    put("S09", s09, {"pid_e"})
    N1 = kind_idx(G01, "N")
    s10 = list(G01)
    s10[N1[0]], s10[N1[1]] = G01[N1[1]], G01[N1[0]]
    put("S10", s10, {"pid_n"})
    E1 = kind_idx(G01, "E")
    r = _rec(G01[E1[0]])
    r[2] = 4
    s11 = list(G01)
    s11[E1[0]] = cj(r)
    put("S11", s11, {"flags"})
    r = _rec(G02[f0])
    r[3] = 3
    s12 = list(G02)
    s12[f0] = cj(r)
    put("S12", s12, {"form"})
    r = _rec(G02[f0])
    r[3] = 1
    s13 = list(G02)
    s13[f0] = cj(r)
    put("S13", s13, {"ncoords"})
    # S14: an A on an undirected graph, geometry correct
    r = _rec(G02[f0])
    pts = [(r[i], r[i + 1]) for i in range(4, len(r), 2)]
    a = ["A", r[1]] + list(D.arrow_for(r[3], pts))
    s14 = G02[:f0 + 1] + [cj(a)] + G02[f0 + 1:]
    put("S14", s14, {"a_presence"})
    A1 = kind_idx(G01, "A")
    put("S15", [l for i, l in enumerate(G01) if i != A1[0]], {"a_presence"})
    r = _rec(G01[A1[0]])
    r[4] += 1
    s16 = list(G01)
    s16[A1[0]] = cj(r)
    put("S16", s16, {"a_geom"})
    EA = [i for i, l in enumerate(G11) if l[2:3] in ("E", "A") and l[:3] in ('["E', '["A')]
    s17 = list(G11)
    s17[EA[0]], s17[EA[1]], s17[EA[2]], s17[EA[3]] = G11[EA[0]], G11[EA[2]], G11[EA[1]], G11[EA[3]]
    put("S17", s17, {"a_adjacent"})
    T1 = kind_idx(G01, "T")
    s18 = G01[:N1[0]] + [G01[i] for i in T1] + [G01[i] for i in N1] + []
    s18 = [l for l in G01 if l[:3] not in ('["T', '["N')]
    first_n = [i for i, l in enumerate(s18)]
    s18 = [l for l in G01 if l[:3] not in ('["N', '["T')] + [G01[i] for i in T1] + [G01[i] for i in N1]
    put("S18", s18, {"order"})
    r = _rec(G01[T1[0]])
    r[2] = 1
    s19 = list(G01)
    s19[T1[0]] = cj(r)
    put("S19", s19, {"t_role"})

    def with_text(i, txt):
        r = _rec(G01[T1[i]])
        r[5] = txt
        ss = list(G01)
        ss[T1[i]] = cj(r)
        return ss
    put("S20", with_text(1, "a" * 25), {"t_text"})
    put("S21", with_text(1, "a\tb"), {"t_text"})
    put("S22", with_text(1, "a\u0000b"), {"t_text"})
    s23 = list(G01)
    s23[T1[0]], s23[T1[1]], s23[T1[2]] = G01[T1[2]], G01[T1[0]], G01[T1[1]]
    put("S23", s23, {"t_order"})
    s24 = list(G01)
    s24.insert(T1[0], G01[T1[0]])
    put("S24", s24, {"t_once"})
    r = _rec(G02[f0])
    r[4] = (1 << 40) + 1
    s25 = list(G02)
    s25[f0] = cj(r)
    put("S25", s25, {"ebound"})
    h = _rec(G01[0])
    h[2] = 0
    put("S26", [cj(h)] + G01[1:], {"wh"})
    put("S27", [G01[0].replace("1e23b156", "1E23b156")] + G01[1:], {"hash"})
    out["bad/S28.dl"] = G01 and ("\r\n".join(G01) + "\r\n").encode("utf-8")
    SF["S28"] = {"cr"}
    s29 = list(G01)
    s29[N1[0]] = " " + s29[N1[0]]
    put("S29", s29, {"indent"})
    out["bad/S30.dl"] = ("\n".join(G01)).encode("utf-8")
    SF["S30"] = {"finallf"}
    s31 = list(G01)
    s31.insert(N1[0], "")
    put("S31", s31, {"blank"})
    s32 = list(G01)
    s32[N1[0]] = '["N",1,0,0,32072,[[[193600]]]]'
    put("S32", s32, {"nesting"})
    s33 = list(G01)
    s33[E1[0]] = G01[E1[0]].replace(",43701,", ",43701.0,", 1)
    put("S33", s33, {"canon_num"})
    s34 = list(G01)
    s34[E1[0]] = G01[E1[0]].replace(",43701,", ",4.3701e4,", 1)
    put("S34", s34, {"canon_num"})
    s35 = list(G01)
    s35[E1[0]] = G01[E1[0]].replace(",3,0,0,", ",3,-0,0,", 1)
    put("S35", s35, {"canon_num"})
    put("S36", G01 + ['["X",1]'], {"kind"})
    # S40: a lone surrogate escape in a text (the one exception: D9 and D12 both reject)
    s40 = list(G01)
    s40[T1[1]] = '["T",2,0,867928,430400,"' + chr(92) + 'ud800"]'
    put("S40", s40, {"t_text"})
    r = _rec(G01[N1[0]])
    r[2] = 9
    s41 = list(G01)
    s41[N1[0]] = cj(r)
    put("S41", s41, {"kcls"})
    # S42: one E too many (undirected scene)
    r = _rec(G02[E2[-1]])
    r[1] += 1
    s42 = list(G02)
    s42.insert(E2[-1] + 1, cj(r))
    put("S42", s42, {"pid_e"})
    r = _rec(G01[T1[1]])
    r[3] = (1 << 40) + 1
    s43 = list(G01)
    s43[T1[1]] = cj(r)
    put("S43", s43, {"tbound"})
    return out, SF


SF_RULES = {}


def ensure_bad():
    if "bad/S02.dl" not in base.BASE:
        out, sf = build_bad()
        base.BASE.update(out)
        SF_RULES.update(sf)


def s_fn(path, limits=None, also=()):
    def fn():
        ensure_bad()
        res = []
        for p, lim in [(path, limits)] + [(a["file"], a.get("limits")) for a in also]:
            data = base.fs(p)
            kw = {}
            if lim:
                if "maxBytes" in lim:
                    kw["max_bytes"] = lim["maxBytes"]
                if "maxLineUnits" in lim:
                    kw["max_line"] = lim["maxLineUnits"]
            res.append(D.parse_tag(data, **kw))
        if len(res) == 1 and res[0] != "ok":
            return Out(error=res[0])
        bad = [r for r in res if r != "ok"]
        if bad:
            return Out(error=bad[0], extra=res)
        return Out(extra=res)
    return fn


def register_s_rows():
    all_lists = []
    for r in base.ROWS:
        if r.group in "GNXYO" and r.expected.startswith("dl/"):
            all_lists.append(r.expected)
        if r.id == "N06":
            all_lists += ["dl/N06b.dl", "dl/N06c.dl"]
    first = all_lists[0]
    also = [{"file": p} for p in all_lists[1:]]
    reg("S01", "core", "", "", inp={"file": first, "also": also}, expected="", fn=s_fn(first, None, also))
    for n in range(2, 44):
        sid = "S%02d" % n
        if sid in ("S37", "S38", "S39"):
            continue
        p = "bad/%s.dl" % sid
        reg(sid, "core", "", "", p, "", s_fn(p))
    g01len = 637
    reg("S37", "core", "", "", {"file": "dl/G01.dl", "limits": {"maxBytes": g01len}}, "",
        s_fn("dl/G01.dl", {"maxBytes": g01len}))
    reg("S38", "core", "", "", {"file": "dl/G01.dl", "limits": {"maxBytes": g01len - 1}}, "",
        s_fn("dl/G01.dl", {"maxBytes": g01len - 1}))
    reg("S39", "core", "", "", {"file": "dl/G01.dl", "limits": {"maxBytes": g01len, "maxLineUnits": 100}}, "",
        s_fn("dl/G01.dl", {"maxBytes": g01len, "maxLineUnits": 100}))
