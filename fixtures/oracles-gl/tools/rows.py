"""The gl: rows (design 31 section 13.4) as pure functions of the reference.  rows(group) -> list of Row."""
import copy
import json
import struct

import cvs
import dlist
import exe
import ju
import mut
import plan as P
import rend
import scenes
import scn
import shaders
from scn import Err

O1 = ("../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json")
O4 = ("../oracles/o4-undirected.scene.json", "../oracles-igl/layouts/F02.layout.json")
EMPTY = ("../oracles-igl/scenes/empty.scene.json", "../oracles-igl/layouts/F07.layout.json")
SINGLE = ("../oracles-igl/scenes/single.scene.json", "../oracles-igl/layouts/F08.layout.json")
MIXED = ("../oracles-igl/scenes/mixed20.scene.json", "../oracles-igl/layouts/F04.layout.json")
KEYB = ("../oracles-igl/scenes/keybound.scene.json", "../oracles-igl/layouts/F13.layout.json")
LOOPS = ("../oracles-svg/scenes/loops2.scene.json", "../oracles-svg/layouts/loops2.layout.json")
TEN = ("../oracles-svg/scenes/ten.scene.json", "../oracles-svg/layouts/ten.layout.json")
ZERO = ("../oracles-svg/scenes/zero.scene.json", "../oracles-svg/layouts/zero.layout.json")
HOSTILE = ("../oracles-svg/scenes/hostile-svg.scene.json", "../oracles-svg/layouts/hostile-svg.layout.json")
IDS12 = ("../oracles-svg/scenes/ids12.scene.json", "../oracles-svg/layouts/ids12.layout.json")
MARKUP = ("../oracles-svg/scenes/markup.scene.json", "../oracles-svg/layouts/markup.layout.json")
ILLEGAL = ("../oracles-svg/scenes/illegal.scene.json", "../oracles-svg/layouts/illegal.layout.json")


def A(n):
    return (("scenes/%s.scene.json" % n), ("layouts/%s.layout.json" % n))


class Row:
    def __init__(self, id, tier="", scene="", layout="", input="", expected="", error="", files=None):
        self.id, self.tier = id, tier
        self.scene, self.layout = scene, layout
        self.input = input
        self.expected, self.error = expected, error
        self.files = files or {}

    @property
    def group(self):
        return self.id[0]

    def input_text(self):
        if isinstance(self.input, str):
            return self.input
        return ju.ijson(self.input)

    def sig(self):
        return (self.tier, self.scene, self.layout, self.input_text(), self.expected, self.error, tuple(sorted((k, ju.sha256_hex(v)) for k, v in self.files.items())))


_MC = {}


def model(sl):
    if sl not in _MC:
        _MC[sl] = scn.load_model(*sl)
    return _MC[sl]


def size_in(w=900, h=600):
    return {"height": h, "width": w}


def mk(sl, state="initial", size=(900, 600), labels=True, edge_labels=True, max_units=dlist.DEFAULT_MAX_UNITS):
    m = model(sl)
    if state == "initial":
        st = scn.initial_state(m, size[0], size[1])
    elif isinstance(state, str):
        st = scn.read_state(m, state)
    else:
        st = state
    d = dlist.build_dl(m, st, labels, edge_labels, max_units)
    p, b = P.build_plan(d)
    return m, st, d, p, b


def plan_row(rid, sl, state="initial", size=(900, 600), tier="both", extra_input=None, path=None):
    m, st, d, p, b = mk(sl, state, size)
    path = path or "plan/%s.glplan" % rid
    inp = {"size": size_in(*size), "state": state if isinstance(state, str) else "initial"}
    if extra_input:
        inp.update(extra_input)
    return Row(rid, tier, sl[0], sl[1], inp, path, "", {path: b}), (m, st, d, p, b)


# ---------------------------------------------------------------- G

def rows_G():
    out = []
    specs = [
        ("G01", O1, "initial"),
        ("G02", O4, "initial"),
        ("G03", EMPTY, "initial"),
        ("G04", SINGLE, "initial"),
        ("G05", MIXED, "initial"),
        ("G06", O1, "../oracles-svg/states/Y03.state.json"),
        ("G07", LOOPS, "initial"),
        ("G08", MIXED, None),
        ("G09", O1, "../oracles-svg/states/Y07.state.json"),
        ("G10", MIXED, None),
        ("G11", TEN, "initial"),
    ]
    for rid, sl, state in specs:
        if rid in ("G08", "G10"):
            m = model(sl)
            allN = list(range(len(m.nodes)))
            allE = list(range(len(m.edges)))
            if rid == "G08":
                foc = ("e", 0)
            else:
                k = [i for i, n in enumerate(m.nodes) if m.categories.index(n["category"]) == 1][0]
                foc = ("n", k)
            st = scn.make_state(m, 900, 600, None, None, None, allN, allE, foc)
            spath = "states/%s.state.json" % rid
            scn.put(spath, scn.state_bytes(st))
            state = spath
        row, _ = plan_row(rid, sl, state)
        out.append(row)
    return out


# ---------------------------------------------------------------- B

def _vp_row(rid, name, tier="both", state=None, extra=None):
    sl = A(name)
    st_path = "states/%s.state.json" % (state or name)
    row, tup = plan_row(rid, sl, st_path, tier=tier, extra_input=extra)
    return row, tup


def rows_B():
    out = []
    # B01 threshold
    row, (m, st, d, p, b) = _vp_row("B01", "far-thr")
    out.append(row)
    # B02 zero is +0
    row, _ = plan_row("B02", ZERO, "../oracles-svg/states/N02.state.json")
    out.append(row)
    # B03 pid/kind/style/cat bytes and padding
    m = model(LOOPS)
    e0 = scenes.eidx(m, "a", "R0", "a")
    e1 = scenes.eidx(m, "a", "R1", "a")
    st = scn.make_state(m, 900, 600, None, None, None, [scenes.nidx(m, "a")], [e0], ("e", e1))
    scn.put("states/B03.state.json", scn.state_bytes(st))
    row, _ = plan_row("B03", LOOPS, "states/B03.state.json")
    out.append(row)
    # B04 unused control points: kinds 0 and 1 at 400x300
    row, _ = plan_row("B04", MIXED, "initial", (400, 300))
    out.append(row)
    # B05 contiguous draws (two cases: an edge focus, then a node focus; one state cannot hold both, A-xx)
    m = model(MIXED)
    sel_n = [0, 1]
    sel_e = [0, 1, 2]
    st1 = scn.make_state(m, 900, 600, None, None, None, sel_n, sel_e, ("e", 3))
    st2 = scn.make_state(m, 900, 600, None, None, None, sel_n, sel_e, ("n", 2))
    scn.put("states/B05.state.json", scn.state_bytes(st1))
    scn.put("states/B05b.state.json", scn.state_bytes(st2))
    row, _ = plan_row("B05", MIXED, "states/B05.state.json")
    _, _, _, p2, b2 = mk(MIXED, "states/B05b.state.json")
    row.files["plan/B05b.glplan"] = b2
    row.input["also"] = [{"expected": "plan/B05b.glplan", "state": "states/B05b.state.json"}]
    out.append(row)
    # B06 stride constants and sizes equal the buffer lengths
    row, (m, st, d, p, b) = plan_row("B06", MIXED, "../oracles-svg/states/Y12.state.json")
    out.append(row)
    # B07 empty layers omitted
    row, _ = plan_row("B07", O1, "../oracles-svg/states/Y01.state.json")
    out.append(row)
    # B08 renderer level: label options change nothing but nt and the text lines
    variants = [("a", "dl", {"labels": False}), ("b", "dl", {"edgeLabels": False}), ("c", "list", {"maxDrawnLabelUnits": 0})]
    files = {}
    base_m, base_st, base_d, base_p, base_b = mk(O1)
    also = []
    for tag, level, opt in variants:
        if level == "dl":
            # renderer level: createWebglRenderer({dl: opt}) then loadScene, planBytes()
            r = rend.Renderer({"dl": opt})
            r.initialize({"size": {"width": 900, "height": 600}})()
            r.phase = "initialized"
            r.load(model(O1))()
            p_, b_ = r.plan()
            case_in = {"options": {"dl": opt}}
        else:
            # list/plan level, no renderer (a renderer with budget 0 is refused, 6.5): planGl(buildDisplayList(model, state, opt))
            m_ = model(O1)
            d_ = dlist.build_dl(m_, scn.initial_state(m_, 900, 600), max_units=opt["maxDrawnLabelUnits"])
            p_, b_ = P.build_plan(d_)
            case_in = {"list": opt}
        path = "plan/B08.%s.glplan" % tag
        files[path] = b_
        same = p_.buf == base_p.buf
        rec = {"buffers_equal_to_G01": same, "nt": p_.hdr["nt"], "plan_bytes": len(b_)}
        rec.update(case_in if level == "list" else {"options": opt})
        files["json/B08.%s.json" % tag] = ju.ojson(rec)
        case = {"expected": path, "outcome": "json/B08.%s.json" % tag}
        case.update(case_in)
        also.append(case)
    row_in = {"also": also[1:], "options": {"dl": variants[0][2]}, "size": size_in(), "state": "initial"}
    out.append(Row("B08", "subject", O1[0], O1[1], row_in, "plan/B08.a.glplan", "", files))
    # B09 / B10 limits
    m, st, d, p, b = mk(O1)
    row = Row("B09", "core", O1[0], O1[1], {"limits": {"maxBytes": len(b)}, "size": size_in(), "state": "initial"}, "plan/B09.glplan", "", {})
    try:
        p9, b9 = P.build_plan(d, len(b))
        row.files["plan/B09.glplan"] = b9
    except Err as e:
        row.expected, row.error = "", e.cr()
    out.append(row)
    row = Row("B10", "core", O1[0], O1[1], {"limits": {"maxBytes": len(b) - 1}, "size": size_in(), "state": "initial"}, "", "", {})
    try:
        p10, b10 = P.build_plan(d, len(b) - 1)
        row.expected = "plan/B10.glplan"
        row.files["plan/B10.glplan"] = b10
    except Err as e:
        row.error = e.cr()
    out.append(row)
    # B11 .. B21
    row, _ = _vp_row("B11", "far-a")
    out.append(row)
    row, _ = _vp_row("B12", "far-pair")
    out.append(row)
    row, _ = _vp_row("B13", "far-out")
    out.append(row)
    row, _ = _vp_row("B14", "far-a", state="far-a.sel")
    out.append(row)
    row, _ = _vp_row("B15", "far-b")
    out.append(row)
    row, _ = _vp_row("B16", "far-node")
    out.append(row)
    # B17 table and T lines equal the list's
    row, (m, st, d, p, b) = plan_row("B17", IDS12, "initial")
    out.append(row)
    row, _ = _vp_row("B18", "far-par")
    out.append(row)
    row, _ = _vp_row("B19", "far-incl")
    out.append(row)
    row, _ = _vp_row("B20", "far-coinc")
    out.append(row)
    row, _ = _vp_row("B21", "far-away")
    row.input["search"] = "inputs/B21.search.json"
    out.append(row)
    for r in out:
        if r.id == "B01":
            r.input["search"] = "inputs/B01.search.json"
    return out


# ---------------------------------------------------------------- H

def _lint(src):
    res = {}
    res["H-1"] = (src.startswith("#version 300 es\n") and src.endswith("\n") and not src.endswith("\n\n") and src.isascii() and "\r" not in src
                  and "\t" not in src and not any(l != l.rstrip(" ") for l in src.split("\n")))
    res["H-2"] = not any(tok in src for tok in ("#include", "#extension", "#define", "#pragma", "#line"))
    return res


def _names(src):
    import re
    out = {"attributes": [], "constants": [], "uniforms": [], "varyings": [], "inputs": []}
    for ln in src.split("\n"):
        t = ln.strip()
        mt = re.match(r"^(flat\s+)?in\s+\w+\s+(\w+);", t)
        if mt:
            out["inputs"].append(mt.group(2))
        mt = re.match(r"^(flat\s+)?out\s+\w+\s+(\w+);", t)
        if mt:
            out["varyings"].append(mt.group(2))
        mt = re.match(r"^uniform\s+\w+\s+(\w+);", t)
        if mt:
            out["uniforms"].append(mt.group(1))
        mt = re.match(r"^const\s+\w+\s+(\w+)(\[\d+\])?\s*=", t)
        if mt:
            out["constants"].append(mt.group(1))
    return out


TABLE_74 = {
    "arrow": {"attributes": ["a_b2", "a_tb1"], "uniforms": {"vs": ["u_view"], "fs": ["u_ink"]}, "varyings": [], "constants": []},
    "disc": {"attributes": ["a_center", "a_meta"], "uniforms": {"vs": ["u_view"], "fs": ["u_ink"]}, "varyings": ["v_cat", "v_local", "v_style"], "constants": ["PAL"]},
    "edge": {"attributes": ["a_ab", "a_cb", "a_meta"], "uniforms": {"vs": ["u_view"], "fs": ["u_ink"]}, "varyings": ["v_across", "v_along", "v_style"], "constants": ["ALPHA", "SEG", "WIDTH"]},
}


def rows_H():
    out = []
    src = exe.shader_sources()
    setb = exe.shader_set_bytes()
    out.append(Row("H01", "core", "", "", "", "json/H01.set.json", "", {"json/H01.set.json": setb}))
    out.append(Row("H02", "core", "", "", "", "json/H02.sha256.json", "", {"json/H02.sha256.json": ju.ojson({"SHADER_SET_SHA256": ju.sha256_hex(setb), "bytes": len(setb)})}))
    d3 = [{"bytes": len(s.encode()), "name": k, "sha256": ju.sha256_hex(s.encode())} for k, s in sorted(src.items())]
    out.append(Row("H03", "core", "", "", "", "json/H03.sources.json", "", {"json/H03.sources.json": ju.ojson(d3)}))
    lint = {k: _lint(s) for k, s in sorted(src.items())}
    out.append(Row("H04", "core", "", "", "", "json/H04.lint.json", "", {"json/H04.lint.json": ju.ojson(lint)}))
    before = {k: ju.sha256_hex(s.encode()) for k, s in exe.shader_sources().items()}
    for sl in (MARKUP, HOSTILE):
        mk(sl)
        exe.shader_sources()
    mid = {k: ju.sha256_hex(s.encode()) for k, s in exe.shader_sources().items()}
    mk(ILLEGAL)
    after = {k: ju.sha256_hex(s.encode()) for k, s in exe.shader_sources().items()}
    out.append(Row("H05", "core", "", "", {"scenes": ["../oracles-svg/scenes/markup.scene.json", "../oracles-svg/scenes/hostile-svg.scene.json", "../oracles-svg/scenes/illegal.scene.json"]},
                   "json/H05.const.json", "", {"json/H05.const.json": ju.ojson({"after_hostile_plans": after, "before": before, "identical": before == mid == after})}))
    names = {}
    for prog in ("arrow", "disc", "edge"):
        vs, fs = _names(src[prog + ".vs"]), _names(src[prog + ".fs"])
        got = {"attributes": sorted(vs["inputs"]), "uniforms": {"fs": sorted(fs["uniforms"]), "vs": sorted(vs["uniforms"])},
               "varyings": sorted(vs["varyings"]), "constants": sorted(set(vs["constants"]) | set(fs["constants"]))}
        want = TABLE_74[prog]
        names[prog] = {"actual": got, "equals_table_7_4": got == want, "fs_inputs": sorted(fs["inputs"])}
    out.append(Row("H06", "core", "", "", "", "json/H06.names.json", "", {"json/H06.names.json": ju.ojson(names)}))
    return out


# ---------------------------------------------------------------- W (bad plans)

class PB:
    """plan builder on the decoded structure of a base plan; writes raw bytes with no validation"""

    def __init__(self, base):
        p = P.parse_plan_lenient(base)
        self.hdr = json.loads(json.dumps(p.hdr))
        self.nodes, self.edges, self.texts = list(p.nodes), list(p.edges), [list(t) for t in p.texts]
        self.E = {L: [list(v) + [pid, kind, style, pad] for v, pid, kind, style, pad in p.E[L]] for L in (1, 2, 3)}
        self.A = [list(v) + [pid] for v, pid in p.A]
        self.D = {L: [list(v) + [pid, style, cat, pad] for v, pid, style, cat, pad in p.D[L]] for L in (5, 6, 7)}
        self.trailing = b""
        self.edge_extra = b""
        self.sizes = None
        self.header_bytes = None
        self.table_lines = None
        self.keep_draws = False

    def enc(self):
        e = b"".join(struct.pack("<ffffffffIBBH", *[float(x) for x in i[:8]], i[8], i[9], i[10], i[11]) for L in (1, 2, 3) for i in self.E[L]) + self.edge_extra
        d = b"".join(struct.pack("<ffIBBH", float(i[0]), float(i[1]), i[2], i[3], i[4], i[5]) for L in (5, 6, 7) for i in self.D[L])
        a = b"".join(struct.pack("<ffffffI", *[float(x) for x in i[:6]], i[6]) for i in self.A)
        return e, d, a

    def bytes(self):
        e, d, a = self.enc()
        h = copy.deepcopy(self.hdr)
        if not self.keep_draws:
            cnt = {"edge": 0, "disc": 0, "arrow": 0}
            draws = []
            for L in range(1, 8):
                n = {1: len(self.E[1]), 2: len(self.E[2]), 3: len(self.E[3]), 4: len(self.A), 5: len(self.D[5]), 6: len(self.D[6]), 7: len(self.D[7])}[L]
                prog = P.LAYER_PROGRAM[L]
                if n:
                    draws.append({"count": n, "first": cnt[prog], "layer": L, "program": prog})
                cnt[prog] += n
            h["draws"] = draws
        h["sizes"] = self.sizes or {"arrow": len(a), "disc": len(d), "edge": len(e)}
        hb = self.header_bytes(h) if self.header_bytes else ju.cjb(h)
        out = [hb, b"\n"]
        if self.table_lines is not None:
            out += self.table_lines
        else:
            out += [ju.line(["n", r]) for r in self.nodes] + [ju.line(["e", r]) for r in self.edges]
        out += [ju.line(t) for t in self.texts]
        out += [e, d, a, self.trailing]
        return b"".join(out)


def rows_W(wbase_bytes=None):
    st = json.loads(scn.AUTH["states/wbase.state.json"])
    wsl = A("wbase")
    m = model(wsl)
    d = dlist.build_dl(m, st)
    base_b = P.build_plan.__wrapped__(d) if False else None
    saved = mut.active()
    mut.set_active(set())
    try:
        p0, base = P.build_plan(d)
    finally:
        mut.set_active(saved)
    faults = {}
    bads = {}

    def new(rid, rule, fn, base_bytes=None, note=""):
        pb = PB(base_bytes or base)
        r = fn(pb)
        data = pb.bytes() if r is None else r
        bads[rid] = (data, rule, note)

    def hdr_edit(f):
        def g(pb):
            f(pb.hdr)
        return g

    class OrderedHeader:
        pass

    def w02(pb):
        pb.header_bytes = lambda h: json.dumps({"w": h["w"], **{k: v for k, v in h.items() if k != "w"}}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    new("W02", "G1", w02)
    new("W03", "G1", hdr_edit(lambda h: h.__setitem__("format", "igr-gl/2")))
    new("W04", "G1", hdr_edit(lambda h: h["stride"].__setitem__("edge", 36)), note="the design names G3 for this row (K24) but the header's stride is a G1 constant: with G3 skipped the row is still rejected (A-01)")
    # W05: the disc buffer is the last non-empty one in a plan without arrows
    pb0 = PB(base)
    pb0.A = []

    def w05(pb):
        pb.A = []
        e, d_, a = pb.enc()
        pb.sizes = {"arrow": 0, "disc": len(d_) + 16, "edge": len(e)}

    new("W05", "G2", w05)
    new("W06", "G2", lambda pb: setattr(pb, "trailing", b"\x00\x00"))

    def w07(pb):
        pb.edge_extra = b"\x00"
        e, d_, a = pb.enc()
        pb.sizes = {"arrow": len(a), "disc": len(d_), "edge": len(e)}

    new("W07", "G3", w07)

    def w08(pb):
        pb.keep_draws = True
        pb.hdr["draws"] = PB(base).hdr["draws"]
        dr = pb.hdr["draws"]
        i3 = [k for k, x in enumerate(dr) if x["layer"] == 3][0]
        i4 = [k for k, x in enumerate(dr) if x["layer"] == 4][0]
        dr[i3], dr[i4] = dr[i4], dr[i3]

    new("W08", "G4", w08)

    def w09(pb):
        pb.keep_draws = True
        pb.hdr["draws"] = PB(base).hdr["draws"]
        for x in pb.hdr["draws"]:
            if x["layer"] == 5:
                x["program"] = "edge"

    new("W09", "G4", w09)

    def w10(pb):
        pb.keep_draws = True
        pb.hdr["draws"] = PB(base).hdr["draws"]
        for x in pb.hdr["draws"]:
            if x["layer"] == 7:
                x["count"] += 1

    new("W10", "G5", w10)

    def w11(pb):
        # a dummy instance between the layer-1 and layer-3 instances that no draw covers
        pb.keep_draws = True
        dr = PB(base).hdr["draws"]
        pb.hdr["draws"] = dr
        dummy = list(pb.E[3][0])
        pb.E[3] = [dummy] + pb.E[3]
        for x in dr:
            if x["layer"] == 3:
                x["first"] += 1
    new("W11", "G5", w11)

    def setf(L, i, j, v):
        def g(pb):
            pb.E[L][i][j] = v
        return g

    new("W12", "G6", setf(3, 0, 0, float("nan")))
    new("W13", "G6", setf(3, 0, 2, -0.0))
    new("W14", "G6", setf(3, 0, 1, 0.5))

    def w15(pb):
        pb.D[7][0][0] = 16777216

    new("W15", "G6", w15)
    new("W16", "G7", setf(3, 0, 9, 3))
    new("W17", "G7", setf(3, 0, 10, 1))

    def w18(pb):
        pb.D[7][0][3] = 3

    def w19(pb):
        pb.D[7][0][4] = 9

    new("W18", "G7", w18)
    new("W19", "G7", w19)
    new("W20", "G8", setf(3, 0, 11, 1))

    def w21(pb):
        pb.D[7].insert(0, [450000, 300000, 0, 2, 0, 0])

    new("W21", "G9", w21)
    new("W22", "G10", setf(3, 0, 2, 5))

    def w23(pb):
        pb.E[3].append(list(pb.E[3][0][:8]) + [pb.E[3][0][8], 0, 2, 0])

    new("W23", "G11", w23)

    def w24(pb):
        pb.E[1].append([0, 0, 0, 0, 0, 0, 100, 100, 11, 0, 0, 0])

    new("W24", "G12", w24)

    def w25(pb):
        pb.D[5].append([100000, 100000, 5, 0, 0, 0])

    new("W25", "G12", w25)
    new("W26", "G1", hdr_edit(lambda h: h.__setitem__("seg", 15)))

    def w27(pb):
        pb.D[7].append(list(pb.D[7][-1]))

    new("W27", "G11", w27)

    def w28(pb):
        pb.A.append([100, 100, 90, 90, 95, 95, 11])

    new("W28", "G12", w28)

    def w29(pb):
        pb.D[7].append([450000, 300000, 6, 2, 0, 0])

    new("W29", "G13", w29)

    def w30(pb):
        pb.E[3].insert(0, [450000, 300000, 0, 0, 0, 0, 460000, 310000, 1, 0, 2, 0])

    new("W30", "G13", w30)

    def w31(pb):
        pb.hdr["cn"] = list(reversed(pb.hdr["cn"]))

    new("W31", "G15", w31)

    def w32(pb):
        pb.D[7].insert(2, [450000, 300000, 3, 2, 0, 0])

    new("W32", "G15", w32)
    new("W33", "G1", hdr_edit(lambda h: h.__setitem__("g", 128000)))
    new("W34", "G14", hdr_edit(lambda h: h.__setitem__("nt", h["nt"] + 1)))

    def w35(pb):
        pb.texts[0][5] = "x" * 25

    new("W35", "G14", w35)

    def w36(pb):
        pb.table_lines = [b'["n",{"type":"a","id":"s:n0"}]\n'] + [ju.line(["n", r]) for r in pb.nodes[1:]] + [ju.line(["e", r]) for r in pb.edges]

    new("W36", "G13", w36)

    def w37(pb):
        i = [k for k, x in enumerate(pb.E[3]) if x[9] == 1][0]
        pb.E[3].insert(i + 1, list(pb.E[3][i]))

    new("W37", "G11", w37)

    def w38(pb):
        pb.D[7] = [x for x in pb.D[7] if x[2] != 2]

    new("W38", "G16", w38)
    rows = []
    for rid in sorted(bads):
        data, rule, note = bads[rid]
        path = "bad/%s.glplan" % rid
        err = ""
        try:
            P.parse_plan(data)
        except Err as e:
            err = e.cr()
        rows.append(Row(rid, "core", "", "", path, "", err, {path: data}))
        faults[rid] = (rule, note)
    w01 = Row("W01", "core", "", "", {"files": ["plan/G%02d.glplan" % k for k in range(1, 12)]}, "", "", {})
    rows.insert(0, w01)
    faults_tsv = "id\trule\tnote\n" + "".join("%s\t%s\t%s\n" % (k, v[0], v[1]) for k, v in sorted(faults.items()))
    rows[0].files["bad/FAULTS.tsv"] = faults_tsv.encode("utf-8")
    # keep the base for the self-check
    rows[0].files["bad/BASE.glplan"] = base
    return rows, bads, base


# ---------------------------------------------------------------- X (readouts)

def _xr_row(rid, plan_path, plan_bytes, scene="", layout="", note=None):
    try:
        p = P.parse_plan(plan_bytes)
        rb = P.serialize_readout(P.readout_from_gl(p))
        return Row(rid, "core", scene, layout, {"from": "gl", "plan": plan_path}, "xr/%s.xr.json" % rid, "", {"xr/%s.xr.json" % rid: rb})
    except Err as e:
        return Row(rid, "core", scene, layout, {"from": "gl", "plan": plan_path}, "", e.cr(), {})


def rows_X(G):
    """G: dict of plan bytes by row id (G01..), B: via mk"""
    out = []
    out.append(_xr_row("X01", "plan/G01.glplan", G["G01"], *O1))
    out.append(_xr_row("X02", "plan/G05.glplan", G["G05"], *MIXED))
    out.append(_xr_row("X03", "plan/G06.glplan", G["G06"], *O1))
    # X04
    sl = A("far-edge")
    st = "states/far-edge.state.json"
    m, s, d, p, b = mk(sl, st)
    r = _xr_row("X04", "plan/X04.glplan", b, *sl)
    r.files["plan/X04.glplan"] = b
    out.append(r)
    # X05 three-way
    m, s, d, p, b = mk(O1)
    stream = cvs.record_stream(d)
    svg = svg_scrape(scn.read("../oracles-svg/svg/G01.svg"))
    ro_svg = P.serialize_readout(readout_from_svg_like(svg))
    ro_cv = P.serialize_readout(cvs.readout_from_calls(stream, d))
    try:
        ro_gl = P.serialize_readout(P.readout_from_gl(P.parse_plan(b)))
    except Err as e:
        ro_gl = b"unreadable plan: " + e.cr().encode()
    ro_dl = P.serialize_readout(P.readout_from_list(d))
    same = ro_svg == ro_cv == ro_gl == ro_dl
    files = {"xr/X05.xr.json": ro_gl, "calls/X05.calls": stream}
    out.append(Row("X05", "core", O1[0], O1[1], {"calls": "calls/X05.calls", "from": "three-way", "plan": "plan/G01.glplan", "svg": "../oracles-svg/svg/G01.svg", "all_equal": same},
                   "xr/X05.xr.json", "", files))
    # X06 culled selected node
    sl = A("far-a")
    m, s, d, p, b = mk(sl, "states/far-a.sel.state.json")
    r = _xr_row("X06", "plan/X06.glplan", b, *sl)
    r.files["plan/X06.glplan"] = b
    out.append(r)
    # X07 a layer-7 pid outside the table (lenient read of a corrupted plan, then the readout function)
    data = X07_bytes()
    try:
        p = P.parse_plan_lenient(data)
        rb = P.serialize_readout(P.readout_from_gl(p))
        r = Row("X07", "core", "", "", {"from": "gl", "lenient": True, "plan": "bad/X07.glplan"}, "xr/X07.xr.json", "", {"xr/X07.xr.json": rb, "bad/X07.glplan": data})
    except Err as e:
        r = Row("X07", "core", "", "", {"from": "gl", "lenient": True, "plan": "bad/X07.glplan"}, "", e.cr(), {"bad/X07.glplan": data})
    out.append(r)
    # X08 a directed plan whose arrow was omitted
    sl = A("far-a")
    m, s, d, p, b = mk(sl, "states/far-a.state.json")
    r = _xr_row("X08", "plan/X08.glplan", b, *sl)
    r.files["plan/X08.glplan"] = b
    out.append(r)
    # X09 labels of a hostile-text scene
    m, s, d, p, b = mk(HOSTILE)
    r = _xr_row("X09", "plan/X09.glplan", b, *HOSTILE)
    r.files["plan/X09.glplan"] = b
    r.input["equals_list_readout"] = P.serialize_readout(P.readout_from_list(d)) == r.files["xr/X09.xr.json"] if "xr/X09.xr.json" in r.files else False
    out.append(r)
    return out


def X07_bytes():
    saved = mut.active()
    mut.set_active(set())
    try:
        m, s, d, p, b = mk(O1)
    finally:
        mut.set_active(saved)
    pb = PB(b)
    pb.D[7][0][2] = 99  # pid 99 is outside the table (nd + ed = 3)
    return pb.bytes()


def svg_scrape(b):
    """the oracle's own scrape of an igr-svg/1 document into a SvgReadoutLike (9.2)"""
    import re
    t = b.decode("utf-8")
    hdr = re.search(r'<svg [^>]*width="(\d+)" height="(\d+)"[^>]*data-igr-scene="([0-9a-f]{64})" data-igr-layout="([0-9a-f]{64})"', t)
    w, h, sc, lay = int(hdr.group(1)), int(hdr.group(2)), hdr.group(3), hdr.group(4)
    nodes, edges = [], []
    for g in re.finditer(r'<g id="igr-n-([0-9a-f]+)" class="([^"]*)"[^>]*>\n(.*?)\n</g>', t, re.S):
        addr = json.loads(bytes.fromhex(g.group(1)).decode("utf-8"))
        body = g.group(3)
        c = re.search(r'<circle class="igr-shape" cx="([^"]*)" cy="([^"]*)"', body)
        lab = re.search(r'<text class="igr-label"[^>]*>(.*?)</text>', body)
        nodes.append({"address": addr, "cx": c.group(1), "cy": c.group(2), "selected": "igr-ring-sel" in body, "focused": "igr-ring-foc" in body,
                      "label": _unx(lab.group(1)) if lab else None})
    for g in re.finditer(r'<g id="igr-e-([0-9a-f]+)" class="([^"]*)"[^>]*>\n(.*?)\n</g>', t, re.S):
        addr = json.loads(bytes.fromhex(g.group(1)).decode("utf-8"))
        body = g.group(3)
        lab = re.search(r'<text class="igr-elabel"[^>]*>(.*?)</text>', body)
        edges.append({"address": addr, "selected": "igr-halo-sel" in body, "focused": "igr-halo-foc" in body, "marker": "marker-end=" in body,
                      "label": _unx(lab.group(1)) if lab else None})
    return {"scene_sha256": sc, "layout_sha256": lay, "width": w, "height": h, "directed": "<marker " in t, "nodes": nodes, "edges": edges}


def _unx(s):
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&#10;", "\n").replace("&#13;", "\r").replace("&amp;", "&")


def dec_to_mpx(s):
    """exact decimal string -> milli-pixels (never through a float)"""
    neg = s.startswith("-")
    t = s[1:] if neg else s
    ip, _, fp = t.partition(".")
    fp = (fp + "000")[:3]
    v = int(ip) * 1000 + int(fp)
    return -v if neg else v


def readout_from_svg_like(r):
    W, H = r["width"], r["height"]
    G = 256000
    at, far, sel_n, sel_e, foc = [], [], [], [], None
    ln, le, units = [], [], 0
    for n in r["nodes"]:
        x, y = dec_to_mpx(n["cx"]), dec_to_mpx(n["cy"])
        if -G <= x <= 1000 * W + G and -G <= y <= 1000 * H + G:
            at.append({"address": n["address"], "x": x, "y": y})
        else:
            far.append(n["address"])
        if n["selected"]:
            sel_n.append(n["address"])
        if n["focused"]:
            foc = {"node": n["address"]}
        if n["label"] is not None:
            ln.append({"address": n["address"], "text": n["label"]})
            units += ju.u16len(n["label"])
    for e in r["edges"]:
        if e["selected"]:
            sel_e.append(e["address"])
        if e["focused"]:
            foc = {"edge": e["address"]}
        if e["label"] is not None:
            le.append({"address": e["address"], "text": e["label"]})
            units += ju.u16len(e["label"])
    marked = {"selected": {"edges": sel_e, "nodes": sel_n}}
    if foc:
        marked["focus"] = foc
    return {"igr": "IGR/1", "xr": "igr-xr/1", "scene_sha256": r["scene_sha256"], "layout_sha256": r["layout_sha256"],
            "drawn": {"edges": [e["address"] for e in r["edges"]], "nodes": [n["address"] for n in r["nodes"]]}, "marked": marked,
            "nodes_at": at, "nodes_far": far, "arrows": [e["address"] for e in r["edges"] if e["marker"]],
            "labels": {"edges": le, "nodes": ln}, "label_units": units}


# ---------------------------------------------------------------- E

def rows_E():
    out = []
    INK = (34, 34, 34)

    def frame_row(rid, sl, state, frame, plan_from=None):
        m, st, d, p, b = mk(sl, state)
        log = []
        exe.frame_log(log, p, frame)
        fr = {"heightPx": frame["heightPx"], "ink": list(frame["ink"]), "widthPx": frame["widthPx"]}
        return Row(rid, "core", sl[0], sl[1], {"frame": fr, "scenario": "frame", "size": size_in(), "state": state if state != "initial" else "initial"},
                   "gllog/%s.log" % rid, "", {"gllog/%s.log" % rid: exe.log_bytes(log)})

    def fr(w, h, ink=INK):
        return {"widthPx": w, "heightPx": h, "ink": ink}

    # E01 creation
    m, st, d, p, b = mk(O1)
    log = []
    exe.create_resources(log)
    out.append(Row("E01", "core", O1[0], O1[1], {"scenario": "create", "size": size_in(), "state": "initial"}, "gllog/E01.log", "", {"gllog/E01.log": exe.log_bytes(log)}))
    out.append(frame_row("E02", O1, "initial", fr(900, 600)))
    out.append(frame_row("E03", O1, "../oracles-svg/states/Y03.state.json", fr(900, 600)))
    out.append(frame_row("E04", EMPTY, "initial", fr(900, 600)))
    out.append(frame_row("E05", MIXED, "initial", fr(900, 600)))
    out.append(frame_row("E06", O1, "initial", fr(1200, 800)))
    out.append(frame_row("E07", O1, "initial", fr(900, 600, (255, 0, 128))))
    out.append(frame_row("E08", O4, "initial", fr(900, 600)))
    # E09 dispose in ready
    log = []
    exe.delete_resources(log)
    exe.release_context(log)
    out.append(Row("E09", "core", O1[0], O1[1], {"scenario": "dispose", "size": size_in(), "state": "initial"}, "gllog/E09.log", "", {"gllog/E09.log": exe.log_bytes(log)}))
    # E10 compile failure of disc.fs
    log = []
    kind, token = exe.create_resources(log, ("compile", "disc.fs"))
    det = exe.detail_of(token, kind)
    out.append(Row("E10", "core", O1[0], O1[1], {"expect_detail": det, "info_log": exe.INFO_LOG, "scenario": "fail-compile:disc.fs", "size": size_in(), "state": "initial"},
                   "gllog/E10.log", "INVALID_INPUT/INVALID_VALUE", {"gllog/E10.log": exe.log_bytes(log)}))
    log = []
    kind, token = exe.create_resources(log, ("link", "edge"))
    det = exe.detail_of(token, kind)
    out.append(Row("E11", "core", O1[0], O1[1], {"expect_detail": det, "info_log": exe.INFO_LOG, "scenario": "fail-link:edge", "size": size_in(), "state": "initial"},
                   "gllog/E11.log", "INVALID_INPUT/INVALID_VALUE", {"gllog/E11.log": exe.log_bytes(log)}))
    return out
