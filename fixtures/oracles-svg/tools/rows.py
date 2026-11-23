"""Row definitions of the V5 corpus (design section 15.4): phase 1 builds every input file,
phase 2 (the `run` closures) computes every expected byte with the reference in svg.py.

`MUT` of svg.py is empty while phase 1 runs; mutant runs only execute phase 2.
"""
import json, os, hashlib, re, math
import svg
from svg import (IgrError, cj, cjb, sha256_hex, fmt, S)
import scenes as SC
import searches as SR

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # fixtures/oracles-svg

O1S = "../oracles/o1-basic.scene.json"
O1SRC = "../oracles/o1-basic.source.ison"
O4S = "../oracles/o4-undirected.scene.json"
F01 = "../oracles-igl/layouts/F01.layout.json"
F02 = "../oracles-igl/layouts/F02.layout.json"
F04 = "../oracles-igl/layouts/F04.layout.json"
F07 = "../oracles-igl/layouts/F07.layout.json"
F08 = "../oracles-igl/layouts/F08.layout.json"
F09 = "../oracles-igl/layouts/F09.layout.json"
F13 = "../oracles-igl/layouts/F13.layout.json"
V45 = "../oracles-igl/verify/V45.layout.json"
V46 = "../oracles-igl/verify/V46.layout.json"
X05L = "../oracles-igl/layouts/X05.layout.json"
MIXS = "../oracles-igl/scenes/mixed20.scene.json"
MIXSRC = "../oracles-igl/sources/mixed20.source.ison"
EMPTYS = "../oracles-igl/scenes/empty.scene.json"
SINGLES = "../oracles-igl/scenes/single.scene.json"
UNIS = "../oracles-igl/scenes/unicode.scene.json"
KEYS = "../oracles-igl/scenes/keybound.scene.json"
S18S = "../oracles-igl/scenes/S18.scene.json"

BASE = {}            # path -> bytes: every input file of the corpus (phase 1)
ROWS = []            # row specs in id order of creation
ROWMAP = {}
OUTS = {}            # row id -> (files, error) cache of phase 2
NOTES = {}           # misc generator facts that the README reports
AUTH = SC.Authored()


def jdump(obj):
    return (json.dumps(obj, indent=1, sort_keys=True, ensure_ascii=True) + "\n").encode("ascii")


def ij(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def put(path, data):
    assert path not in BASE, path
    BASE[path] = data
    return path


def rd(path):
    if path in BASE:
        return BASE[path]
    with open(os.path.normpath(os.path.join(ROOT, path)), "rb") as f:
        return f.read()


_MODELS = {}


def mdl(scene, layout):
    k = (scene, layout)
    if k not in _MODELS:
        _MODELS[k] = svg.Model(rd(scene), rd(layout))
    return _MODELS[k]


RAW_STATE_ROWS = ("states/Y14.state.json", "states/Y15.state.json")


def state_of(model, size, spec):
    """'initial', a state file parsed with parseState (validating), or - for the two rows that test the
    validation inside renderSvg itself (Y14, Y15) - plain JSON of the file."""
    if spec == "initial":
        return svg.initial_state(model, size[0], size[1])
    if spec in RAW_STATE_ROWS:
        return json.loads(rd(spec).decode("utf-8"))
    return svg.parse_state(model, rd(spec))


def put_state(path, model, st):
    put(path, svg.serialize_state(model, st))
    return path


class Row:
    def __init__(self, id_, tier, scene="", layout="", inp="", run=None, expected_hint=""):
        self.id, self.tier, self.scene, self.layout, self.inp, self.run = id_, tier, scene, layout, inp, run
        self.hint = expected_hint


def add_row(id_, tier, scene="", layout="", inp="", run=None):
    assert id_ not in ROWMAP, id_
    r = Row(id_, tier, scene, layout, inp, run)
    ROWS.append(r)
    ROWMAP[id_] = r
    return r


def ensure(id_):
    if id_ not in OUTS:
        r = ROWMAP[id_]
        OUTS[id_] = r.run() if r.run else ({}, "")
    return OUTS[id_]


def ep(kind, model, i):
    return model.elem_addr(kind, i)


# ----------------------------------------------------------------------------------------
# generic document row
# ----------------------------------------------------------------------------------------
def doc_row(id_, scene, layout, size=(900, 600), state="initial", options=None, tier="both", fid=True,
            expect_error=None, extra=None):
    inp = {"size": {"width": size[0], "height": size[1]}, "state": state}
    if options is not None:
        inp["options"] = options
    if extra:
        inp.update(extra)
    if fid and expect_error is None:
        m = mdl(scene, layout)
        r = svg.render_svg_detailed(m, state_of(m, size, state), options)
        inp["expect_fidelity"] = {"edge_labels": r["fidelity"]["edge_labels"], "label_units": r["label_units"],
                                  "labels": r["fidelity"]["labels"]}
    out = f"svg/{id_}.svg"
    # phase-1 assertion: the reference gives the error the design states (or none)
    m0 = mdl(scene, layout)
    try:
        svg.render_svg(m0, state_of(m0, size, state), options)
        got_err = None
    except IgrError as e:
        got_err = e.tag()
    assert got_err == expect_error, (id_, got_err, expect_error)

    def run():
        m = mdl(scene, layout)
        try:
            st = state_of(m, size, state)
            txt = svg.render_svg(m, st, options)
        except IgrError as e:
            return {}, e.tag()
        return {out: txt.encode("utf-8")}, ""
    row = add_row(id_, tier, scene, layout, ij(inp), run)
    row.hint = out
    return row


def sizes(w, h):
    return (w, h)


# ----------------------------------------------------------------------------------------
def build_all():
    SC.build_simple_scenes(AUTH)
    build_ties_zero()
    build_trim_and_anchors()
    for name, (sb, lb) in sorted(AUTH.items.items()):
        put(f"scenes/{name}.scene.json", sb)
        put(f"layouts/{name}.layout.json", lb)
    # the row ids are created in family order below
    fam_G()
    fam_N()
    fam_X()
    fam_Y()
    fam_O()
    fam_F()
    fam_T()
    fam_U()
    fam_DK()
    fam_L()


def sp(name):
    return f"scenes/{name}.scene.json", f"layouts/{name}.layout.json"


# ----------------------------------------------------------------------------------------
# N01 ties and N02 zero (built by construction, recorded in NOTES)
# ----------------------------------------------------------------------------------------
def build_ties_zero():
    # N01: z = 1999, w=900, h=600, centre (0,0): X = 1999*d + 450e6, Y = 1999*d + 300e6 (x, y thousandths = d)
    z, C_X, C_Y = 1999, 450_000_000, 300_000_000
    targets = [499, 500, 501, 1499, 1500, 1501]

    def find(C, t, sign):
        d0 = -C // z
        for k in range(0, 9000):
            for d in (d0 + k, d0 - k):
                X = z * d + C
                if (sign > 0 and X <= 0) or (sign < 0 and X >= 0):
                    continue
                a = abs(X)
                if a % 1000 == t % 1000 and (a // 1000) % 2 == (t // 1000) % 2:
                    return d
        raise RuntimeError("no coordinate for target")
    nodes = []
    pos = {}
    info = []
    for k in range(12):
        sign = 1 if k < 6 else -1
        tx = targets[k % 6]
        ty = targets[(k + 2) % 6]
        dx = find(C_X, tx, sign)
        dy = find(C_Y, ty, sign)
        n = ("p", "s:t%02d" % k)
        nodes.append(n)
        pos[n] = (dx, dy)
        info.append((n[1], sign * tx, z * dx + C_X, sign * ty, z * dy + C_Y))
    AUTH.add("ties", False, nodes, [], pos=lambda nd: pos,
             note="N01: X,Y in micro-pixels at z=1999: " + "; ".join("%s X=%d Y=%d" % (a, b, d) for a, _, b, _, d in info))
    NOTES["ties"] = info
    # N02: z=10, centre (50000*w, 50000*h): X = 10*x, Y = 10*y
    xs_ = [-40, -50, -60, 50]
    ys_ = [-50, -60, 50, -40]
    zn = [("p", "s:z%d" % k) for k in range(4)]
    zp = {zn[k]: (xs_[k], ys_[k]) for k in range(4)}
    AUTH.add("zero", False, zn, [(zn[0], "R", zn[1]), (zn[1], "R", zn[2]), (zn[2], "R", zn[3])], pos=lambda nd: zp)


def build_trim_and_anchors():
    P = "p"
    # N03
    found, trials = SR.search_trim()
    NOTES["trim_search"] = {"seed": 20261117, "trials": trials, "found": {k: len(v) for k, v in found.items()}}
    edges, pos, nodes = [], {}, []
    cnt = [0]

    def add_edge(a, b, rel="R"):
        k = cnt[0]
        cnt[0] += 1
        na, nb = (P, "s:e%02da" % k), (P, "s:e%02db" % k)
        nodes.extend([na, nb])
        pos[na], pos[nb] = a, b
        edges.append((na, rel, nb))
    # baseline edges: horizontal, vertical, 45 degrees, 3-4-5, short (25 px), long
    base = [((100000, 100000), (125000, 100000)), ((100000, 150000), (250000, 150000)),
            ((100000, 200000), (100000, 500000)), ((300000, 100000), (500000, 300000)),
            ((600000, 100000), (900000, 500000)), ((100000, 600000), (800000, 600000)),
            ((120000, 700000), (130000, 724000 + 1))]
    for a, b in base:
        add_edge(a, b)
    for var in (1, 2, 3):
        for a, b in found[var]:
            add_edge(a, b)
    AUTH.add("trim", True, nodes, edges, pos=lambda nd: pos)
    put("inputs/N03.search.json", jdump({
        "prng": "s' = (1664525*s + 1013904223) mod 2^32, output s' >> 8 (24 bits); rng(lo,hi) = lo + ((next<<24 | next) mod (hi-lo+1))",
        "seed": 20261117, "trials": trials, "viewport": {"center_x": 0, "center_y": 0, "zoom": SR.Z, "width": 900, "height": 600},
        "witnesses_in_layout_thousandths": {"V%d" % k: [[list(a), list(b)] for a, b in v] for k, v in found.items()},
        "assertion": "printed text of at least one endpoint differs from the correct text for each of V1, V2, V3 (15.5a); re-checked with the real writer under K09, K10, K11"}))
    NOTES["trim_edges"] = len(edges)
    # N15
    found2, trials2 = SR.search_anchors()
    NOTES["anchor_search"] = {"seed": 20261118, "trials": trials2, "found": {k: len(v) for k, v in found2.items()}}
    nodes, edges, pos = [], [], {}
    cnt = [0]

    def pair(a, b):
        k = cnt[0]
        cnt[0] += 1
        na, nb = (P, "s:g%02da" % k), (P, "s:g%02db" % k)
        nodes.extend([na, nb])
        pos[na], pos[nb] = a, b
        return na, nb
    for a, b in found2["V4"]:
        na, nb = pair(a, b)
        edges.append((na, "R0", nb))
    for a, b in found2["V7"]:
        na, nb = pair(a, b)
        edges.append((na, "R0", nb))
    for key in ("V5", "V6", "V8", "V9"):
        for a, b in found2[key]:
            na, nb = pair(a, b)
            edges.append((na, "R0", nb))
            edges.append((nb, "R0", na))
    # a parallel group of three (k = 3) and a degenerate pair with a back edge
    na, nb = pair((200000, 800000), (650000, 900000))
    edges += [(na, "R0", nb), (na, "R1", nb), (nb, "R0", na)]
    na, nb = pair((900000, 800000), (905000, 806000))
    edges += [(na, "R0", nb), (nb, "R0", na)]
    AUTH.add("anchors", True, nodes, edges, pos=lambda nd: pos)
    put("inputs/N15.search.json", jdump({
        "prng": "same LCG as N03", "seed": 20261118, "trials": trials2,
        "viewport": {"center_x": 0, "center_y": 0, "zoom": SR.Z, "width": 900, "height": 600},
        "witnesses_in_layout_thousandths": {k: [[list(a), list(b)] for a, b in v] for k, v in sorted(found2.items())},
        "assertion": "printed text differs under each of V4-V9 (K12, K13, K14, K109, K110, K111); re-checked with the real writer"}))


# ----------------------------------------------------------------------------------------
def fam_G():
    doc_row("G01", O1S, F01)
    doc_row("G02", O4S, F02)
    doc_row("G03", EMPTYS, F07)
    doc_row("G04", SINGLES, F08)
    doc_row("G05", MIXS, F04)
    doc_row("G06", UNIS, F09)
    doc_row("G07", KEYS, F13)
    doc_row("G08", MIXS, F04, size=(400, 300))
    doc_row("G09", O1S, F01, size=(1, 1))
    doc_row("G10", O1S, F01, size=(901, 601))


def fam_N():
    m_ties = mdl(*sp("ties"))
    put_state("states/N01.state.json", m_ties, svg.mk_state(m_ties, svg.vp(0, 0, 1999, 900, 600)))
    doc_row("N01", *sp("ties"), state="states/N01.state.json")
    m_zero = mdl(*sp("zero"))
    put_state("states/N02.state.json", m_zero, svg.mk_state(m_zero, svg.vp(45_000_000, 30_000_000, 10, 900, 600)))
    doc_row("N02", *sp("zero"), state="states/N02.state.json")
    m_trim = mdl(*sp("trim"))
    put_state("states/N03.state.json", m_trim, svg.mk_state(m_trim, svg.vp(0, 0, SR.Z, 900, 600)))
    doc_row("N03", *sp("trim"), state="states/N03.state.json", extra={"search": "inputs/N03.search.json"})
    m_deg = mdl(*sp("deg"))
    for rid, cxy in (("N04", (112000, 100000)), ("N05", (112500, 200000)), ("N06", (112000, 300003))):
        put_state(f"states/{rid}.state.json", m_deg, svg.mk_state(m_deg, svg.vp(cxy[0], cxy[1], 1000, 900, 600)))
        doc_row(rid, *sp("deg"), state=f"states/{rid}.state.json")
    doc_row("N07", *sp("coincident"))
    doc_row("N07b", *sp("coincident-u"))
    doc_row("N08", *sp("loops2"))
    doc_row("N09", *sp("multi4"))
    m_mul = mdl(*sp("multi4"))
    hide = [i for i, e in enumerate(m_mul.edges) if (m_mul.nodes[e["src"]]["label"], e["label"], m_mul.nodes[e["tgt"]]["label"]) in
            (("a", "R1", "b"), ("c", "R1", "d"))]
    base_vp = svg.initial_state(m_mul, 900, 600)["viewport"]
    put_state("states/N10.state.json", m_mul, svg.mk_state(m_mul, base_vp, hid_edges=hide))
    doc_row("N10", *sp("multi4"), state="states/N10.state.json")
    doc_row("N11", O1S, V45)
    doc_row("N12", O1S, V46)
    m1 = mdl(O1S, F01)
    put_state("states/N13.state.json", m1, svg.mk_state(m1, svg.vp(383554, 134563, 100000, 900, 600)))
    doc_row("N13", O1S, F01, state="states/N13.state.json")
    put_state("states/N14.state.json", m1, svg.mk_state(m1, svg.vp(383554, 134563, 10, 900, 600)))
    doc_row("N14", O1S, F01, state="states/N14.state.json")
    doc_row("N15", *sp("anchors"), extra={"search": "inputs/N15.search.json"}, state=(lambda m: put_state("states/N15.state.json", m, svg.mk_state(m, svg.vp(0, 0, SR.Z, 900, 600))))(mdl(*sp("anchors"))))


def fam_X():
    doc_row("X01", *sp("ids4"))
    doc_row("X02", *sp("hostile-svg"))
    doc_row("X03", *sp("trunc"))
    doc_row("X04", *sp("longid1024"))
    doc_row("X05", S18S, X05L)
    doc_row("X06", *sp("ids12"))
    doc_row("X07", *sp("nfc"))
    doc_row("X08", *sp("emptylabels"))
    doc_row("X09", *sp("agg-id"))
    doc_row("X10", *sp("ctl"))
    doc_row("X11", *sp("illegal"))
    doc_row("X12", *sp("markup"))
    doc_row("X13", *sp("ten"))
    doc_row("X14", *sp("bidi"))
    doc_row("X15", *sp("astral"))


def fam_Y():
    m = mdl(O1S, F01)
    v0 = svg.initial_state(m, 900, 600)["viewport"]
    nI1, nAnn, eK = ("n", 0), ("n", 1), ("e", 0)

    def ystate(id_, mm, st):
        put_state(f"states/{id_}.state.json", mm, st)
        return f"states/{id_}.state.json"
    doc_row("Y01", O1S, F01, state=ystate("Y01", m, svg.mk_state(m, v0, sel_nodes=[0])))
    doc_row("Y02", O1S, F01, state=ystate("Y02", m, svg.mk_state(m, v0, sel_edges=[0])))
    doc_row("Y03", O1S, F01, state=ystate("Y03", m, svg.mk_state(m, v0, sel_nodes=[0], sel_edges=[0], focus=("n", 1))))
    doc_row("Y04", O1S, F01, state=ystate("Y04", m, svg.mk_state(m, v0, focus=("n", 1))))
    doc_row("Y05", O1S, F01, state=ystate("Y05", m, svg.mk_state(m, v0, focus=("e", 0))))
    doc_row("Y06", O1S, F01, state=ystate("Y06", m, svg.mk_state(m, v0, sel_nodes=[0], focus=("n", 0))))
    doc_row("Y07", O1S, F01, state=ystate("Y07", m, svg.mk_state(m, v0, hid_nodes=[1])))
    mm = mdl(MIXS, F04)
    vm = svg.initial_state(mm, 900, 600)["viewport"]
    doc_row("Y08", MIXS, F04, state=ystate("Y08", mm, svg.mk_state(mm, vm, hid_edges=[7])))
    doc_row("Y09", O1S, F01, state=ystate("Y09", m, svg.mk_state(m, v0, hid_nodes=[0, 1])))
    doc_row("Y10", O1S, F01, state=ystate("Y10", m, svg.mk_state(m, v0, hid_nodes=[0])))
    doc_row("Y11", MIXS, F04, state=ystate("Y11", mm, svg.mk_state(mm, vm, sel_nodes=range(20), sel_edges=range(37))))
    # Y12: hide the node i:8 (project, degree > 1), focus on a survivor (company i:4)
    i8 = mm.node_index[("project", "i:8")]
    i4 = mm.node_index[("company", "i:4")]
    doc_row("Y12", MIXS, F04, state=ystate("Y12", mm, svg.mk_state(mm, vm, hid_nodes=[i8], focus=("n", i4))))
    doc_row("Y13", O1S, F01, state=ystate("Y13", m, svg.mk_state(m, svg.vp(10_000_000, 10_000_000, 1994, 900, 600))))
    # Y14: the initial state of another scene (O4) against O1: SCENE_MISMATCH
    m4 = mdl(O4S, F02)
    put("states/Y14.state.json", svg.serialize_state(m4, svg.initial_state(m4, 900, 600)))
    doc_row("Y14", O1S, F01, state="states/Y14.state.json", tier="core", expect_error="INVALID_STATE/SCENE_MISMATCH")
    # Y15: click-ordered selection [s:ann, i:1] written by hand (canonical key order, nodes out of scene order)
    st = svg.mk_state(m, v0)
    st["selection"]["nodes"] = [m.nodes[1]["ref"], m.nodes[0]["ref"]]
    put("states/Y15.state.json", cjb(st))
    doc_row("Y16", O1S, F01, state=ystate("Y16", m, svg.mk_state(m, v0, sel_edges=[0], focus=("e", 0))))
    doc_row("Y15", O1S, F01, state="states/Y15.state.json", tier="core", expect_error="INVALID_STATE/NON_CANONICAL")
    comp = [i for i, n in enumerate(mm.nodes) if n["category"] == "company"]
    NOTES["company_nodes"] = len(comp)
    doc_row("Y17", MIXS, F04, state=ystate("Y17", mm, svg.mk_state(mm, vm, hid_nodes=comp)))


def fam_O():
    doc_row("O01", O1S, F01, options={"style": False})
    doc_row("O02", O1S, F01, options={"labels": False}, tier="core")
    doc_row("O03", O1S, F01, options={"edgeLabels": False}, tier="core")
    doc_row("O04", O1S, F01, options={"idPrefix": "g-1"}, tier="core")
    doc_row("O05", O1S, F01, options={"xmlDeclaration": True}, tier="core")
    doc_row("O06", O1S, F01, options={"maxDrawnLabelUnits": 9}, tier="core")
    doc_row("O07", O1S, F01, options={"maxDrawnLabelUnits": 8}, tier="core")
    doc_row("O08", O1S, F01, options={"maxDrawnLabelUnits": 0}, tier="core")
    doc_row("O09", *sp("trunc3"), options={"maxDrawnLabelUnits": 5}, tier="core")
    errs = [("O10", {"bogus": 1}, "INVALID_INPUT/SCHEMA"), ("O11", {"idPrefix": "1a"}, "INVALID_INPUT/INVALID_VALUE"),
            ("O12", {"idPrefix": ""}, "INVALID_INPUT/INVALID_VALUE")]
    for id_, o, e in errs:
        doc_row(id_, O1S, F01, options=o, tier="core", expect_error=e)
    pref32 = "a" + "b" * 31
    doc_row("O13", O1S, F01, options={"idPrefix": pref32}, tier="core")
    doc_row("O14", O1S, F01, options={"idPrefix": pref32 + "c"}, tier="core", expect_error="INVALID_INPUT/INVALID_VALUE")
    doc_row("O15", O1S, F01, options={"style": "yes"}, tier="core", expect_error="INVALID_INPUT/SCHEMA")
    doc_row("O16", O1S, F01, options={"maxSvgBytes": "NaN"}, tier="core", expect_error="INVALID_INPUT/NOT_FINITE")
    doc_row("O17", O1S, F01, options={"maxDrawnLabelUnits": 1.5}, tier="core", expect_error="INVALID_INPUT/INVALID_VALUE")
    doc_row("O18", O1S, F01, options={"maxSvgBytes": -1}, tier="core", expect_error="INVALID_INPUT/OUT_OF_RANGE")
    doc_row("O19", O1S, F01, options=[], tier="core", expect_error="INVALID_INPUT/SCHEMA")
    doc_row("O20", O1S, F01, options={"style": None}, tier="core", expect_error="INVALID_INPUT/SCHEMA")
    doc_row("O21", O1S, F01, options={"idPrefix": "A"}, tier="core", expect_error="INVALID_INPUT/INVALID_VALUE")

    # O22: a plain object shaped like a model
    def run22():
        plain = {"igr_model": "igr-model/1", "nodes": [], "edges": []}
        try:
            svg.render_svg(plain, svg.initial_state(mdl(O1S, F01), 900, 600), None)
        except IgrError as e:
            return {}, e.tag()
        return {}, ""
    add_row("O22", "core", O1S, F01, ij({"plain_object_model": True, "size": {"width": 900, "height": 600}, "state": "initial"}), run22)


def fam_F():
    m = mdl(O1S, F01)
    g01 = svg.render_svg(m, svg.initial_state(m, 900, 600)).encode("utf-8")
    L = len(g01)
    doc_row("F01", O1S, F01, options={"maxSvgBytes": L}, tier="core")
    doc_row("F02", O1S, F01, options={"maxSvgBytes": L - 1}, tier="core", expect_error="RESOURCE_LIMIT/BYTES_LIMIT")
    sc, ly = sp("hub")
    mh = mdl(sc, ly)
    hub_full = svg.render_svg(mh, svg.initial_state(mh, 900, 600)).encode("utf-8")
    NOTES["hub_bytes"] = len(hub_full)
    doc_row("F03", sc, ly, options={"maxSvgBytes": 262144}, tier="core", expect_error="RESOURCE_LIMIT/BYTES_LIMIT")
    doc_row("F04", sc, ly, options={"maxSvgBytes": len(hub_full)}, tier="core")

    def run05():
        buf = []
        try:
            svg.write_svg(mh, svg.initial_state(mh, 900, 600), {"maxSvgBytes": 4096}, buf.append)
            err = ""
        except IgrError as e:
            err = e.tag()
        got = sum(len(x.encode("utf-8")) for x in buf)
        rep = {"error": err, "sink_bytes": got, "sink_lines": len(buf), "sink_at_most": 4096,
               "ok": err == "RESOURCE_LIMIT/BYTES_LIMIT" and got <= 4096}
        return {"json/F05.sink.json": jdump(rep)}, ""
    r = add_row("F05", "core", sc, ly, ij({"expect_sink_bytes_at_most": 4096, "options": {"maxSvgBytes": 4096},
                                           "size": {"width": 900, "height": 600}, "state": "initial"}), run05)
    r.hint = "json/F05.sink.json"
    doc_row("F06", O1S, F01, options={"maxSvgBytes": 0}, tier="core", expect_error="RESOURCE_LIMIT/BYTES_LIMIT")


# ----------------------------------------------------------------------------------------
# T rows
# ----------------------------------------------------------------------------------------
def conflicting_points(model, state, drawn, plan_pts=True):
    """(n) centre of every other drawn node, (m) chord midpoint of every other drawn edge e'
    where hit_test returns e' and no node (computed with the exact hit test)."""
    X, Y = svg.screen_positions(model, state)
    vn, ve = svg.effective_visibility(model, state)
    pts = []
    for k, i in drawn:
        if k == "n":
            pts.append(("n", (k, i), X[i] / 1e6, Y[i] / 1e6))
        else:
            e = model.edges[i]
            ax, ay = X[e["src"]], Y[e["src"]]
            bx, by = X[e["tgt"]], Y[e["tgt"]]
            mx, my = (ax + bx) / 2 / 1e6, (ay + by) / 2 / 1e6
            h = svg.hit_test(model, state, {"x": mx, "y": my})
            if h is not None and "edge" in h and model.lookup(h) == ("e", i):
                pts.append(("m", (k, i), mx, my))
    return pts


def drawn_order(model, state):
    vn, ve = svg.effective_visibility(model, state)
    return [("n", i) for i in range(len(model.nodes)) if vn[i]] + [("e", i) for i in range(len(model.edges)) if ve[i]]


def chain_rows(id_, scene, layout, source=None, size=(900, 600), extra_points=None, prefix="igr"):
    inp = {"size": {"width": size[0], "height": size[1]}, "state": "initial", "idPrefix": prefix}
    if source:
        inp["source"] = source
    if extra_points:
        inp["points"] = [{"x": x, "y": y} for x, y in extra_points]

    def run():
        m = mdl(scene, layout)
        st = state_of(m, size, "initial")
        order = drawn_order(m, st)
        pos_of = {el: p for p, el in enumerate(order)}
        P = prefix
        srcb = rd(source) if source else None
        art = m.artifact
        if srcb is not None:
            assert sha256_hex(srcb) == art, "source bytes do not hash to the artifact"
        cps = conflicting_points(m, st, order)
        elems = []
        for (k, i) in order:
            addr = ep(k, m, i)
            eid = svg.element_dom_id(P, addr)
            if svg.M("K43"):
                eid = f"{P}-{k}-{i}"
            ent = {"element": addr, "id": eid}
            try:
                got = svg.pick_element(m, st, P, {"targetId": eid})
            except IgrError as e:
                got = {"error": e.tag()}
            ent["by_id"] = got
            ent["objectRef"] = None
            try:
                if svg.M("K98"):
                    wire = m.nodes[pos_of[(k, i)]]["ref"] if k == "n" else m.edges[pos_of[(k, i)]]["ref"]
                else:
                    wire = addr["node"] if k == "n" else addr["edge"]
                ent["objectRef"] = {"address": wire, "artifact_sha256": art}
                # the select intent must succeed and emit that reference
                svg.reduce(m, st, {"type": "select", "mode": "replace", "targets": [addr]})
            except (IndexError, IgrError):
                ent["objectRef"] = None
            if srcb is not None and ent["objectRef"] is not None:
                ent["identity"] = {"address": ent["objectRef"]["address"], "artifact_sha256": art,
                                   "kind": "node" if k == "n" else "edge"}
            cases = []
            for kind, other, px, py in cps:
                if other == (k, i):
                    continue
                try:
                    r = svg.pick_element(m, st, P, {"targetId": eid, "point": {"x": px, "y": py}})
                except IgrError as e:
                    r = {"error": e.tag()}
                if isinstance(r, dict) and "error" in r:
                    code = -2
                else:
                    code = pos_of[m.lookup(r)] if r is not None else -1
                cases.append([px, py, kind, code])
            ent["conflicts"] = cases
            elems.append(ent)
        # independent expectation of the rule of 15.4 (asserted when the reference is unmutated)
        if not svg.MUT:
            for p, ((k, i), ent) in enumerate(zip(order, elems)):
                assert ent["by_id"] == ep(k, m, i)
                for px, py, kind, code in ent["conflicts"]:
                    if k == "n":
                        assert code == p
                    elif kind == "n":
                        assert order[code][0] == "n"
                    else:
                        assert code == p, (id_, p, code)
        pointer = []
        for pt in (extra_points or []):
            try:
                r = svg.pick_element(m, st, P, {"point": {"x": pt[0], "y": pt[1]}})
            except IgrError as e:
                r = {"error": e.tag()}
            pointer.append({"x": pt[0], "y": pt[1], "pick": r})
        rep = {"drawn_order": [ep(k, m, i) for k, i in order], "elements": elems, "pointer": pointer,
               "conflict_case_format": "[x, y, kind, expected] with kind n=node centre, m=edge chord midpoint, "
                                        "expected = index into drawn_order (-1 none, -2 error)"}
        return {f"json/{id_}.chain.json": jdump(rep)}, ""
    r = add_row(id_, "both", scene, layout, ij(inp), run)
    r.hint = f"json/{id_}.chain.json"


def fam_T():
    m = mdl(O1S, F01)
    st0 = svg.initial_state(m, 900, 600)
    g01 = svg.render_svg(m, st0)
    y03 = svg.render_svg(m, state_of(m, (900, 600), "states/Y03.state.json"))
    # ---- T01
    def run01():
        d = ensure("X01")[0]["svg/X01.svg"].decode("utf-8")
        ids = re.findall(r'<g id="([^"]*)" class="igr-(?:node|edge)', d)
        out = []
        for i_ in ids:
            a = svg.decode_element_id("igr", i_)
            ent = {"id": i_}
            if a is not None:
                ent["address"] = a
            out.append(ent)
        return {"json/T01.ids.json": cjb(out)}, ""
    r = add_row("T01", "core", *sp("ids4"), ij({"svg": "svg/X01.svg", "idPrefix": "igr"}), run01)
    r.hint = "json/T01.ids.json"
    # ---- T02, T15, T16
    chain_rows("T02", O1S, F01, source=O1SRC, extra_points=[(32.0, 193.5), (500.0, 308.0), (500.0, 300.0), (867.9, 406.4)])
    # ---- T03
    nid = lambda k, w: svg.element_dom_id("igr", {k: w})
    nodeA = {"id": "i:1", "type": "person"}
    edgeA = {"ord": "0", "rel": "KNOWS", "src": nodeA, "tgt": {"id": "s:ann", "type": "person"}}
    good_n = nid("node", nodeA)
    good_e = nid("edge", edgeA)
    hexof = lambda s: s.encode("utf-8").hex()
    cases = [
        ("valid node", "igr", good_n),
        ("valid edge", "igr", good_e),
        ("wrong prefix", "igr", good_n.replace("igr-n-", "xyz-n-")),
        ("kind a (reserved)", "igr", "igr-a-" + good_n[6:]),
        ("uppercase hex", "igr", "igr-n-" + good_n[6:].upper()),
        ("odd hex", "igr", good_n + "0"),
        ("invalid utf-8", "igr", "igr-n-" + "ff" + good_n[6:]),
        ("json with a space", "igr", "igr-n-" + hexof('{"id": "i:1","type":"person"}')),
        ("keys reordered", "igr", "igr-n-" + hexof('{"type":"person","id":"i:1"}')),
        ("extra key", "igr", "igr-n-" + hexof('{"id":"i:1","type":"person","x":"y"}')),
        ("missing key", "igr", "igr-n-" + hexof('{"id":"i:1"}')),
        ("number as id", "igr", "igr-n-" + hexof('{"id":1,"type":"person"}')),
        ("empty rest", "igr", "igr-n-"),
        ("other kind letter", "igr", "igr-x-" + good_n[6:]),
        ("id of the other prefix", "g-1", good_n),
        ("valid json naming no scene element", "igr", nid("node", {"id": "s:nobody", "type": "ghost"})),
    ]
    assert len(cases) == 16
    put("inputs/T03.ids.json", jdump([{"case": c, "idPrefix": p, "id": i_} for c, p, i_ in cases]))

    def run03():
        res = []
        for c, p, i_ in cases:
            try:
                a = svg.decode_element_id(p, i_)
            except IgrError as e:
                a = {"error": e.tag()}
            res.append({"case": c, "address": a})
        return {"json/T03.decode.json": jdump(res)}, ""
    r = add_row("T03", "core", "", "", "inputs/T03.ids.json", run03)
    r.hint = "json/T03.decode.json"
    # ---- bad documents T04-T13, T19-T30, T32
    lines = g01.split("\n")
    assert lines[-1] == ""
    L = lines[:-1]
    idx = {k: next(i for i, l in enumerate(L) if k(l)) for k in ()}  # placeholder, keeps flake quiet

    def find(pred, nth=0):
        c = [i for i, l in enumerate(L) if pred(l)]
        return c[nth]
    first_node = find(lambda l: l.startswith('<g id="igr-n-'), 0)
    second_node = find(lambda l: l.startswith('<g id="igr-n-'), 1)
    edge_g = find(lambda l: l.startswith('<g id="igr-e-'))
    desc_edge = find(lambda l: l.startswith("<desc>"))
    pick_l = find(lambda l: l.startswith('<path class="igr-pick"'))
    line_l = find(lambda l: l.startswith('<path class="igr-line"'))
    defs_l = find(lambda l: l.startswith("<defs>"))
    rootdesc = find(lambda l: l.startswith('<desc id='))
    styleend = find(lambda l: l == "</style>")
    nodes_open = find(lambda l: l == '<g class="igr-nodes">')
    edges_open = find(lambda l: l == '<g class="igr-edges">')

    def mod(f):
        l2 = list(L)
        f(l2)
        return "\n".join(l2) + "\n"
    bad = {}

    def sub(i, a, b):
        def f(l2):
            assert a in l2[i], (a, l2[i])
            l2[i] = l2[i].replace(a, b, 1)
        return f
    bad["T04"] = (mod(lambda l2: l2.insert(rootdesc + 1, "<script>alert(1)</script>")), "script")
    bad["T05"] = (mod(sub(first_node, ' tabindex="0">', ' tabindex="0" onclick="x()">')), "attr")
    bad["T06"] = (mod(sub(pick_l, "/>", ' xlink:href="x"/>')), "attr")
    bad["T07"] = (g01.replace("\n", "\r\n"), "crlf")
    bad["T08"] = (mod(lambda l2: l2.__setitem__(first_node + 1, "  " + l2[first_node + 1])), "indent")
    bad["T09"] = (mod(sub(desc_edge, "1 KNOWS ann", "1 KNOWS &foo;ann")), "entity")
    bad["T10"] = (mod(sub(desc_edge, "1 KNOWS ann", "1 KNOWS a<b")), "rawlt")
    bad["T11"] = (mod(sub(second_node, 'tabindex="-1"', 'tabindex="0"')), "W5")
    bad["T12"] = (mod(sub(first_node + 1, "person 1", "person 2")), "W6")
    bad["T13"] = ("<!DOCTYPE svg>\n" + g01, "doctype")
    bad["T19"] = (mod(lambda l2: l2.__setitem__(second_node, l2[second_node].replace(
        re.search(r'id="([^"]*)"', l2[second_node]).group(1), re.search(r'id="([^"]*)"', l2[first_node]).group(1), 1))), "W1dup")
    bad["T20"] = (mod(lambda l2: l2.__setitem__(first_node, re.sub(r'id="igr-n-[0-9a-f]*"', 'id="igr-n-' + hexof('{"id":"i:1"}') + '"', l2[first_node], 1))), "W1dec")
    bad["T21"] = (g01.replace('aria-describedby="igr-desc"', 'aria-describedby="igr-title"', 1), "W2")
    bad["T22"] = (mod(lambda l2: l2.pop(defs_l)), "W3")
    bad["T23"] = (mod(sub(first_node, "igr-node igr-k0", "igr-node igr-k0 igr-selected")), "W4")
    bad["T24"] = (mod(lambda l2: l2.__setitem__(slice(nodes_open, len(l2) - 1), l2[edges_open:len(l2) - 1] + l2[nodes_open:edges_open])), "W7")
    bad["T25"] = (mod(lambda l2: l2.__setitem__(rootdesc, '<desc id="igr-desc">hello</desc>')), "W8")
    bad["T26"] = (g01.replace('width="900"', 'width="901"', 1), "W9")
    bad["T29"] = (mod(lambda l2: l2.__setitem__(first_node, l2[first_node].replace('aria-label="person 1"', 'aria-label="person&#10;1"', 1))
                      or l2.__setitem__(first_node + 1, "<title>person") or l2.insert(first_node + 2, "1</title>")), "multiline")
    bad["T30"] = (mod(sub(pick_l, "M 43.701", "M 43.702")), "W10")
    bad["T32"] = (mod(lambda l2: l2.insert(styleend, "@import url(x);")), "style")
    NOTES["bad_rules"] = {k: v[1] for k, v in bad.items()}
    for k, (txt, rule) in bad.items():
        put(f"bad/{k}.svg", txt.encode("utf-8"))
        # single-fault assertion (15.5 / 5.6): rejected by the strict reader, accepted with only that rule disabled
        try:
            svg.read_svg(txt)
            raise AssertionError(f"{k}: bad document accepted")
        except IgrError as e:
            assert e.tag() == "INVALID_INPUT/SCHEMA", (k, e)
        try:
            svg.read_svg(txt, dis={rule})
        except IgrError as e:
            raise AssertionError(f"{k}: still rejected with only {rule} disabled: {e}")

    def mk_bad(k):
        def run():
            try:
                svg.read_svg(rd(f"bad/{k}.svg").decode("utf-8"))
            except IgrError as e:
                return {}, e.tag()
            return {}, ""
        return run
    for k in sorted(bad):
        add_row(k, "core", "", "", f"bad/{k}.svg", mk_bad(k))
    # ---- T14: readSvg over every document of rows G, N, X, Y, O
    doc_ids = [r.id for r in ROWS if r.id[0] in "GNXYO"]

    def run14():
        res = []
        for rid in doc_ids:
            files, err = ensure(rid)
            key = f"svg/{rid}.svg"
            if key not in files:
                continue
            txt = files[key].decode("utf-8")
            row = ROWMAP[rid]
            try:
                ro = svg.read_svg(txt)
            except IgrError as e:
                res.append({"row": rid, "rejected": e.tag()})
                continue
            inp = json.loads(row.inp)
            mm = mdl(row.scene, row.layout)
            size = (inp["size"]["width"], inp["size"]["height"])
            stt = state_of(mm, size, inp["state"])
            res.append({"row": rid, "nodes": len(ro["nodes"]), "edges": len(ro["edges"]),
                        "agrees_with_model": readout_agrees(ro, mm, stt, inp.get("options")),
                        "readout_sha256": sha256_hex(cjb(svg.readout_projection(ro)))})
        return {"json/T14.readouts.json": jdump(res)}, ""
    r = add_row("T14", "both", "", "", ij({"rows": doc_ids}), run14)
    r.hint = "json/T14.readouts.json"
    chain_rows("T15", MIXS, F04, source=MIXSRC)
    chain_rows("T16", O4S, F02, source="../oracles/o4-undirected.source.ison")
    # ---- T17 limitation rows
    mm = mdl(MIXS, F04)
    sm = svg.initial_state(mm, 900, 600)
    m4 = mdl(O4S, F02)
    s4 = svg.initial_state(m4, 900, 600)

    def run17():
        res = []
        X, Y = svg.screen_positions(mm, sm)
        vn, ve = svg.effective_visibility(mm, sm)
        plan = svg.edge_plan(mm, sm, vn, ve, X, Y)
        i7, i26 = 7, 26
        a, b = mm.edges[i7], mm.edges[i26]
        mid = ((X[a["src"]] + X[a["tgt"]]) / 2 / 1e6, (Y[a["src"]] + Y[a["tgt"]]) / 2 / 1e6)
        pts = [("chord midpoint of the pair of edges 7 and 26", "mixed20", mid[0], mid[1], mm, sm)]
        for nm, i in (("apex of edge 7", i7), ("apex of edge 26", i26)):
            an = plan[i][1]
            pts.append((nm, "mixed20", float(fmt(an[0])), float(fmt(an[1])), mm, sm))
        X4, Y4 = svg.screen_positions(m4, s4)
        ve4 = svg.effective_visibility(m4, s4)
        plan4 = svg.edge_plan(m4, s4, *ve4, X4, Y4)
        loop = [i for i, e in enumerate(m4.edges) if e["src"] == e["tgt"]][0]
        an = plan4[loop][1]
        pts.append(("apex of the self-loop of i:2", "o4", float(fmt(an[0])), float(fmt(an[1])), m4, s4))
        for nm, sc_, x, y, mo, so in pts:
            h = svg.hit_test(mo, so, {"x": x, "y": y})
            res.append({"label": nm, "scene": sc_, "x": x, "y": y, "hit": h, "LIMITATION": True})
        return {"json/T17.hits.json": jdump({"points": res})}, ""
    r = add_row("T17", "core", MIXS, F04, ij({"size": {"width": 900, "height": 600}, "state": "initial",
                                              "also": {"scene": O4S, "layout": F02}}), run17)
    r.hint = "json/T17.hits.json"
    # ---- T18 stale and hidden ids
    sh = svg.mk_state(m, st0["viewport"], hid_nodes=[1])
    put_state("states/T18.state.json", m, sh)
    ghost = svg.element_dom_id("igr", {"node": {"id": "i:99", "type": "person"}})
    hidden_node = svg.element_dom_id("igr", {"node": m.nodes[1]["ref"]})
    hidden_edge = svg.element_dom_id("igr", {"edge": m.edges[0]["ref"]})
    visible_node = svg.element_dom_id("igr", {"node": m.nodes[0]["ref"]})
    c18 = [("hidden node id", {"targetId": hidden_node}),
           ("hidden node id with a point on its old position", {"targetId": hidden_node, "point": {"x": 867.9, "y": 406.4}}),
           ("hidden edge id", {"targetId": hidden_edge}),
           ("hidden edge id with a point on the chord", {"targetId": hidden_edge, "point": {"x": 450.0, "y": 300.0}}),
           ("decodes but names no element", {"targetId": ghost}),
           ("decodes but names no element, point on i:1", {"targetId": ghost, "point": {"x": 32.0, "y": 193.5}}),
           ("undecodable id", {"targetId": "garbage"}),
           ("undecodable id, point on i:1", {"targetId": "garbage", "point": {"x": 32.0, "y": 193.5}}),
           ("visible node id", {"targetId": visible_node}),
           ("no id, point on i:1", {"point": {"x": 32.0, "y": 193.5}})]

    def run18():
        res = []
        for lab, inp in c18:
            try:
                r_ = svg.pick_element(m, sh, "igr", inp)
            except IgrError as e:
                r_ = {"error": e.tag()}
            res.append({"label": lab, "input": inp, "pick": r_})
        return {"json/T18.pick.json": jdump(res)}, ""
    r = add_row("T18", "both", O1S, F01, ij({"size": {"width": 900, "height": 600}, "state": "states/T18.state.json",
                                             "cases": len(c18)}), run18)
    r.hint = "json/T18.pick.json"
    # ---- T27 reader bounds, T28 decoder bounds
    def run27():
        txt = svg.render_svg(m, st0)
        n = len(txt.encode("utf-8"))
        res = []
        for lab, lim in (("maxBytes = length", {"maxBytes": n}), ("maxBytes = length - 1", {"maxBytes": n - 1}),
                         ("maxLineUnits = 100", {"maxLineUnits": 100})):
            try:
                svg.read_svg(txt, lim)
                r_ = "ok"
            except IgrError as e:
                r_ = e.tag()
            res.append({"call": lab, "limits": lim, "result": r_})
        return {"json/T27.limits.json": jdump(res)}, ""
    r = add_row("T27", "core", O1S, F01, ij({"readSvg_of": "G01", "limits": ["maxBytes=len", "maxBytes=len-1", "maxLineUnits=100"]}), run27)
    r.hint = "json/T27.limits.json"

    def run28():
        res = []
        big = 4194304 + 2
        long_id = t28_long_id()
        a1 = svg.decode_element_id("igr", long_id)
        deep = '{"a":{"b":{"c":{"d":"x"}}}}'
        a2 = svg.decode_element_id("igr", "igr-n-" + deep.encode().hex())
        res.append({"case": "hex of maxIdHexDigits + 2 digits", "hex_digits": big, "decoded": a1 is not None})
        res.append({"case": "JSON nested four levels", "decoded": a2 is not None})
        return {"json/T28.decode.json": jdump(res)}, ""
    r = add_row("T28", "core", "", "", ij({"maxIdHexDigits": 4194304, "cases": ["hex digits maxIdHexDigits + 2", "json nested 4 levels"]}), run28)
    r.hint = "json/T28.decode.json"
    # ---- T31 node wins over an edge target
    m_o4 = mdl(O4S, F02)
    s_o4 = svg.initial_state(m_o4, 900, 600)
    kn = svg.element_dom_id("igr", {"edge": m.edges[0]["ref"]})
    loop_i = [i for i, e in enumerate(m_o4.edges) if e["src"] == e["tgt"]][0]
    lid = svg.element_dom_id("igr", {"edge": m_o4.edges[loop_i]["ref"]})
    c31 = [("o1", "states/N14.state.json", "KNOWS edge id, point on the centre of i:1", {"targetId": kn, "point": {"x": 447.904, "y": 299.466}}),
           ("o1", "states/N14.state.json", "KNOWS edge id, point on the centre of s:ann", {"targetId": kn, "point": {"x": 452.096, "y": 300.534}}),
           ("o4", "initial", "self-loop id, point on the loop end inside the disc of i:2", {"targetId": lid, "point": {"x": 874.928, "y": 399.4}}),
           ("o4", "initial", "self-loop id, point 40+ px from every centre", {"targetId": lid, "point": {"x": 450.0, "y": 100.0}})]

    def run31():
        res = []
        for which, stspec, lab, inp in c31:
            mo = m if which == "o1" else m_o4
            so = state_of(mo, (900, 600), stspec)
            try:
                r_ = svg.pick_element(mo, so, "igr", inp)
            except IgrError as e:
                r_ = {"error": e.tag()}
            res.append({"scene": which, "label": lab, "input": inp, "pick": r_})
        return {"json/T31.pick.json": jdump(res)}, ""
    r = add_row("T31", "both", O1S, F01, ij({"size": {"width": 900, "height": 600}, "state": "states/N14.state.json",
                                             "also": {"scene": O4S, "layout": F02, "state": "initial"}}), run31)
    r.hint = "json/T31.pick.json"


def t28_long_id():
    """A well-formed node id whose hex part has exactly maxIdHexDigits + 2 digits (generated, not stored)."""
    big = 4194304 + 2
    skeleton = '{"id":"s:","type":"p"}'
    body = "a" * (big // 2 - len(skeleton))
    txt = '{"id":"s:' + body + '","type":"p"}'
    assert len(txt.encode()) * 2 == big
    return "igr-n-" + txt.encode().hex()


def readout_agrees(ro, model, state, options):
    """T14: the readout against the model and state (set of addresses, names after xs, selected, focused,
    tabindex, class, cx, cy, marker iff directed)."""
    o = svg.validate_options(options) if options is not None else svg.validate_options(None)
    vn, ve = svg.effective_visibility(model, state)
    X, Y = svg.screen_positions(model, state)
    sel_n = {model.lookup_node(r) for r in state["selection"]["nodes"]}
    sel_e = {model.lookup_edge(r) for r in state["selection"]["edges"]}
    f = svg._focus_of(model, state)
    ns = [i for i in range(len(model.nodes)) if vn[i]]
    es = [i for i in range(len(model.edges)) if ve[i]]
    if [model.lookup_node(n["address"]) for n in ro["nodes"]] != ns:
        return False
    if [model.lookup_edge(e["address"]) for e in ro["edges"]] != es:
        return False
    tab_owner = f if f is not None else ((("n", ns[0]) if ns else (("e", es[0]) if es else None)))
    for el, i in zip(ro["nodes"], ns):
        if el["name"] != svg.xs(svg.node_name(model, i)):
            return False
        if el["selected"] != (i in sel_n) or el["focused"] != (f == ("n", i)):
            return False
        if el["tabindex"] != ("0" if tab_owner == ("n", i) else "-1"):
            return False
        if el["cx"] != fmt(X[i]) or el["cy"] != fmt(Y[i]):
            return False
        if el["category_class"] != svg._cat_class(model, model.nodes[i]["category"]):
            return False
    for el, i in zip(ro["edges"], es):
        if el["name"] != svg.xs(svg.edge_name(model, i)) or el["description"] != svg.xs(svg.edge_desc(model, i)):
            return False
        if el["selected"] != (i in sel_e) or el["focused"] != (f == ("e", i)):
            return False
        if el["tabindex"] != ("0" if tab_owner == ("e", i) else "-1"):
            return False
        if el["marker"] != model.directed:
            return False
    return True


# ----------------------------------------------------------------------------------------
# U rows
# ----------------------------------------------------------------------------------------
ENV = {"host": "headless", "reducedMotion": False, "size": {"width": 900, "height": 600}}


def run_script(id_, script, base_scene, base_layout):
    """Interpret a lifecycle script on the reference renderer; returns (files, filled_script)."""
    files = {}
    calls_out = []
    r = None
    listener_svgs = []
    created_opts = script.get("subject_options")
    r = svg.RefRenderer(created_opts)
    env = dict(script["env"])
    counter = {"svg": 0, "state": 0}
    handles = []
    if script.get("listener") == "svg-inside":
        def on_event(ev, rr):
            try:
                txt = rr.svg()
                p = f"svg/{id_}.l{len(listener_svgs)}.svg"
                files[p] = txt.encode("utf-8")
                listener_svgs.append(p)
            except IgrError as e:
                listener_svgs.append(e.tag())
        r.on_event = on_event
    cur_model = lambda arg: mdl(arg["model"]["scene"], arg["model"]["layout"]) if arg and "model" in arg else mdl(base_scene, base_layout)
    for ci, call in enumerate(script["calls"]):
        op = call["op"]
        arg = call.get("arg")
        aw = call.get("await", True)
        res = "ok"
        out = dict(call)

        def guard(fn):
            nonlocal res
            try:
                v = fn()
                return v
            except IgrError as e:
                res = e.tag()
                return None
        if op == "create":
            try:
                r = svg.RefRenderer(arg)
                if script.get("listener") == "svg-inside":
                    r.on_event = on_event
            except IgrError as e:
                res = e.tag()
        elif op == "initialize":
            e2 = dict(env)
            if arg:
                e2.update(arg)
            def fn():
                r.initialize(e2["size"], e2.get("reducedMotion", False))
            if aw:
                r.settle()
                guard(fn)
            else:
                r.pending.append(lambda fn=fn: fn())
        elif op == "loadScene":
            mo = cur_model(arg)
            init = None
            if arg and "initial" in arg:
                init = svg.parse_state(mo, rd(arg["initial"]))
            fn = lambda: r.load_scene(mo, init)
            if aw:
                r.settle()
                guard(fn)
            else:
                r.pending.append(fn)
        elif op == "dispatch":
            v = guard(lambda: r.dispatch(arg))
            if res == "ok":
                p = f"states/{id_}.c{ci}.state.json"
                files[p] = svg.serialize_state(r.model, r.state)
                out["expect_state"] = p
        elif op == "getState":
            v = guard(lambda: r.get_state())
            if res == "ok":
                p = f"states/{id_}.c{ci}.state.json"
                files[p] = svg.serialize_state(r.model, v)
                out["expect_state"] = p
        elif op == "svg":
            v = guard(lambda: r.svg())
            if res == "ok":
                p = f"svg/{id_}.c{ci}.svg"
                files[p] = v.encode("utf-8")
                out["expect_svg"] = p
        elif op == "probe":
            v = guard(lambda: r.probe_fidelity())
            if res == "ok":
                out["expect_fidelity"] = v
        elif op == "export":
            def fn():
                return r.export(arg)
            if aw:
                r.settle()
                v = guard(fn)
                if res == "ok":
                    out["expect_media_type"] = v["media_type"]
                    if arg == "scene":
                        out["expect_bytes"] = base_scene
                    else:
                        out["expect_bytes_sha256"] = v["bytes_sha256"]
            else:
                r.pending.append(fn)
        elif op == "render":
            if aw:
                errs = r.settle()
                guard(lambda: r.render())
            else:
                r.pending.append(lambda: r.render())
        elif op == "setReducedMotion":
            r.reduced = bool(arg)
        elif op == "dispose":
            if aw:
                r.settle()
            r.dispose()
        else:
            raise AssertionError(op)
        out["expect"] = res
        calls_out.append(out)
    filled = dict(script)
    filled["calls"] = calls_out
    if script.get("listener") == "svg-inside":
        filled["expect_listener_svgs"] = listener_svgs
    return files, filled


def u_script_row(id_, scene, layout, calls, listener="record", subject_options=None, extra=None):
    script = {"model": {"scene": scene, "layout": layout}, "env": ENV, "listener": listener, "calls": calls}
    if subject_options:
        script["subject_options"] = subject_options
    path = f"scripts/{id_}.script.json"

    def run():
        files, filled = run_script(id_, script, scene, layout)
        files[path] = jdump(filled)
        return files, ""
    r = add_row(id_, "subject", scene, layout, path, run)
    r.hint = ""
    return r


def verify_manifest(mf):
    mand = ["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "labels", "direction-cue",
            "indicators.non-color", "a11y.model", "state.report", "lifecycle"]
    opt = ["export.scene", "export.svg", "export.png", "a11y.native-dom", "a11y.companion-dom", "labels.edge", "motion.animated"]
    caps = mf["capabilities"]
    for k in mand + opt + ["scene.apply-delta"]:
        assert k in caps, k
    for k in mand:
        if k in ("labels", "direction-cue"):
            assert caps[k]["status"] in ("supported", "degraded")
        else:
            assert caps[k]["status"] == "supported", k
    assert caps["scene.apply-delta"] == {"status": "unsupported", "reason": "RESERVED"}
    for v in mf["capacity"].values():
        assert isinstance(v, int) and v > 0
    return True


def fam_U():
    sel_i1 = {"type": "select", "mode": "replace", "targets": [{"node": {"id": "i:1", "type": "person"}}]}
    hide_ann = lambda h: {"type": "set-hidden", "targets": [{"node": {"id": "s:ann", "type": "person"}}], "hidden": h}
    c = lambda op, arg=None, **kw: dict({"op": op, **({"arg": arg} if arg is not None else {})}, **kw)
    u01 = [c("initialize"), c("loadScene"), c("svg"), c("dispatch", sel_i1), c("svg"), c("dispatch", {"type": "focus-step", "delta": 1}),
           c("svg"), c("dispatch", hide_ann(True)), c("svg"), c("dispatch", hide_ann(False)), c("svg"),
           c("dispatch", {"type": "clear-selection"}), c("svg")]
    u_script_row("U01", O1S, F01, u01)
    u02 = [c("initialize"), c("loadScene"), c("dispatch", {"type": "resize", "width": 700, "height": 500}), c("svg"),
           c("dispatch", {"type": "set-viewport", "center_x": 383554, "center_y": 134563, "zoom": 3000}), c("svg")]
    u_script_row("U02", O1S, F01, u02)
    u03 = [c("svg"), c("initialize"), c("svg"), {"op": "loadScene", "await": False}, c("svg"), c("render"), c("svg"),
           c("dispatch", sel_i1), {"op": "dispose"}, c("svg")]
    u_script_row("U03", O1S, F01, u03, listener="svg-inside")
    kb = {"model": {"scene": KEYS, "layout": F13}}
    u04 = [c("initialize"), c("loadScene"), c("probe"),
           c("loadScene", kb), c("probe"),
           c("create", {"svg": {"labels": False}}), c("initialize"), c("loadScene"), c("probe"),
           c("create", {"svg": {"edgeLabels": False}}), c("initialize"), c("loadScene"), c("probe"),
           c("create", {}), c("initialize", {"reducedMotion": True}), c("loadScene"), c("probe"),
           c("setReducedMotion", False), c("probe")]
    u_script_row("U04", O1S, F01, u04)
    u05 = [c("initialize"), c("loadScene"), c("export", "scene"), c("export", "svg"), c("export", "png"), c("export", "SVG"),
           c("export", "")]
    u_script_row("U05", O1S, F01, u05)

    def run06():
        files = {}
        for h in ("headless", "dom"):
            mf = svg.svg_manifest(h)
            verify_manifest(mf)
            files[f"json/U06.{h}.manifest.json"] = cjb(mf)
        return files, ""
    r = add_row("U06", "subject", "", "", ij({"host": "headless", "expected": "json/U06.headless.manifest.json",
                                        "also": [{"host": "dom", "expected": "json/U06.dom.manifest.json"}]}), run06)
    r.hint = "json/U06.headless.manifest.json"
    u07 = [c("create", {"svg": {"idPrefix": "g-1"}}), c("initialize"), c("loadScene"), c("svg"),
           c("create", {"svg": {"bogus": 1}}), c("create", {"svg": {"idPrefix": "1a"}}), c("create", {"svg": {"style": "yes"}}),
           c("create", {"svg": {"maxSvgBytes": "NaN"}}), c("create", {"svg": {"maxDrawnLabelUnits": 1.5}}),
           c("create", {"svg": {"maxSvgBytes": -1}}),
           c("create", {"capacity": {"maxDrawnLabelUnits": 5}, "svg": {"maxDrawnLabelUnits": 6}})]
    u_script_row("U07", O1S, F01, u07)
    u08 = [c("create", {"capacity": {"maxNodes": 1}}), c("initialize"), c("loadScene", {"model": {"scene": SINGLES, "layout": F08}}),
           c("getState"), c("loadScene"), c("getState")]
    u_script_row("U08", O1S, F01, u08)

    def run09():
        files = {}
        for rid in ("G01", "G05"):
            txt = ensure(rid)[0][f"svg/{rid}.svg"].decode("utf-8")
            files[f"json/U09.{rid}.witness.json"] = cjb(svg.svg_witness(txt))
        return files, ""
    r = add_row("U09", "subject", O1S, F01, ij({"svg": "svg/G01.svg", "expected": "json/U09.G01.witness.json",
                                                "also": [{"svg": "svg/G05.svg", "expected": "json/U09.G05.witness.json",
                                                          "scene": MIXS, "layout": F04}]}), run09)
    r.hint = "json/U09.G01.witness.json"
    add_row("U10", "subject", "", "", ij({"kit": "igr-corpus", "subject": "createSvgSubject()",
                                          "expect": {"verdict": "not-fail", "level": 2, "claimable": False}}), None)

    def run11():
        m = mdl(O1S, F01)
        rr = svg.RefRenderer()
        rr.initialize({"width": 900, "height": 600})
        rr.load_scene(m)
        honest = rr

        class Double(svg.RefRenderer):
            def svg(self):
                t = svg.RefRenderer.svg(self)
                L = t.split("\n")
                i = [k for k, l in enumerate(L) if l.startswith('<g id="igr-n-')]
                j = i[1]
                end = next(k for k in range(j, len(L)) if L[k] == "</g>")
                del L[j:end + 1]
                f0 = i[0]
                L[f0] = L[f0].replace('aria-label="person 1"', 'aria-label="person one"')
                L[f0 + 1] = "<title>person one</title>"
                return "\n".join(L)
        d = Double()
        d.initialize({"width": 900, "height": 600})
        d.load_scene(m)
        res = {}
        try:
            w = d.witness()
            ok = svg.kit_w01(m, d.state, w, d.probe_drawn())
            res = {"witness_error": None, "W01": "pass" if ok else "fail", "level": 2 if ok else 1}
        except IgrError as e:
            res = {"witness_error": e.tag(), "W01": "fail", "level": 1}
        w2 = honest.witness()
        res["honest_subject_W01"] = "pass" if svg.kit_w01(m, honest.state, w2, honest.probe_drawn()) else "fail"
        return {"json/U11.witness-honesty.json": jdump(res)}, ""
    r = add_row("U11", "subject", O1S, F01, ij({"double": "svg() omits the second node and renames the first; probe() stays correct",
                                                "expect": {"W01": "fail", "level": 1}}), run11)
    r.hint = "json/U11.witness-honesty.json"

    def run12():
        o = {"name": "x-svg", "svg": {"edgeLabels": False}, "capacity": {"maxNodes": 5, "maxDrawnLabelUnits": 77}}
        res = {}
        try:
            rr = svg.RefRenderer(o)
            sub_mf = svg.svg_manifest("headless", o)
            res["manifest_bytes_equal"] = cjb(rr.manifest) == cjb(sub_mf)
            verify_manifest(rr.manifest)
            mo = mdl(O1S, F01)
            rr.initialize({"width": 900, "height": 600})
            rr.load_scene(mo)
            fid = rr.probe_fidelity()
            res["fidelity"] = fid
            edge_ok = (not fid["edge_labels"]) or rr.manifest["capabilities"]["labels.edge"]["status"] in ("supported", "degraded")
            res["fidelity_consistent"] = edge_ok and ("EDGE_LABELS_OMITTED" in fid["degradations"]) == (rr.manifest["capabilities"]["labels.edge"]["status"] == "degraded")
            res["labels_edge"] = rr.manifest["capabilities"]["labels.edge"]
            res["CHK-CAP"] = "pass" if res["manifest_bytes_equal"] and res["fidelity_consistent"] else "fail"
        except IgrError as e:
            res["error"] = e.tag()
        return {"json/U12.cap.json": jdump(res)}, ""
    r = add_row("U12", "subject", O1S, F01, ij({"options": {"name": "x-svg", "svg": {"edgeLabels": False},
                                                            "capacity": {"maxNodes": 5, "maxDrawnLabelUnits": 77}},
                                                "kit": {"only": ["L01"]}}), run12)
    r.hint = "json/U12.cap.json"

    def run13():
        mo = mdl(O1S, F01)
        rr = svg.RefRenderer({"svg": {"maxSvgBytes": 100}})
        rr.initialize({"width": 900, "height": 600})
        rr.load_scene(mo)
        res = {}
        try:
            rr.render()
            res["render"] = "ok"
        except IgrError as e:
            res["render"] = e.tag()
        try:
            rr.svg()
            res["svg"] = "ok"
        except IgrError as e:
            res["svg"] = e.tag()
        return {"json/U13.render.json": jdump(res)}, ""
    r = add_row("U13", "subject", O1S, F01, ij({"options": {"svg": {"maxSvgBytes": 100}}}), run13)
    r.hint = "json/U13.render.json"


def fam_DK():
    for k in range(1, 5):
        add_row("D%02d" % k, "subject", "", "", "", None)
    for k in range(1, 115):
        add_row("K%02d" % k if k < 100 else "K%d" % k, "", "", "", "", None)


def fam_L():
    """L01-L04 (R-H, design 30 rev 5 7.5 (e)): rows appended after the K rows for the placement integration. Viewport: centre (450, 300) layout px, zoom 1000."""
    vpt = svg.vp(450000, 300000, 1000, 900, 600)
    for rid, name, hid in (("L01", "lp-hid-box", ["i:2"]), ("L02", "lp-nolabel", []), ("L03", "lp-hid-label", ["i:1"]), ("L04", "lp-astral", [])):
        m = mdl(*sp(name))
        idx = [i for i, n in enumerate(m.nodes) if n["ref"]["id"] in hid]
        put_state(f"states/{rid}.state.json", m, svg.mk_state(m, vpt, hid_nodes=idx))
        doc_row(rid, *sp(name), state=f"states/{rid}.state.json")
