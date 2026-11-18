#!/usr/bin/env python3
"""Independent IGR/1 oracle generator: every expected byte comes from tools/igr.py (Python only).

Written from docs/isongraph-visualize-blueprint/27-IGR1-DESIGN.md (rev 2) and the frozen IGS/IGL specs and
fixtures.  No TypeScript was read or run.  Deterministic: no clock, no randomness, no environment reads.

Usage:  python tools/appendix_a.py && python tools/make_oracles.py && python tools/make_sums.py
"""
import copy, json, math, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import igr
from igr import (IgrError, cj, cjb, sha, q, S, u8, node_key, edge_key)

OUT = os.path.dirname(HERE)                         # .../fixtures/oracles-igr
FIX = os.path.normpath(os.path.join(OUT, ".."))     # .../fixtures

ROWS = []
FILES = {}


# ----------------------------------------------------------------------------------------------
# file helpers
# ----------------------------------------------------------------------------------------------
def put(rel, data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    FILES[rel] = data
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data)


def read(rel):
    """read a corpus-relative path (may start with ../)"""
    return open(os.path.normpath(os.path.join(OUT, rel)), "rb").read()


def tok(o):
    if isinstance(o, float):
        if math.isnan(o):
            return "NaN"
        if math.isinf(o):
            return "Infinity" if o > 0 else "-Infinity"
        return o
    if isinstance(o, list):
        return [tok(x) for x in o]
    if isinstance(o, dict):
        return {k: tok(v) for k, v in o.items()}
    return o


def jdump(o):
    return json.dumps(tok(o), indent=1, ensure_ascii=True)


def inline(o):
    return json.dumps(o, separators=(",", ":"), sort_keys=True, ensure_ascii=True)


def row(id, group, tier, scene="", layout="", input="", expected="", error=""):
    for v in (scene, layout, input, expected, error):
        assert "\t" not in v and "\n" not in v, (id, v)
    ROWS.append(dict(id=id, group=group, tier=tier, scene=scene, layout=layout, input=input, expected=expected, error=error))


# ----------------------------------------------------------------------------------------------
# frozen inputs
# ----------------------------------------------------------------------------------------------
O1S = "../oracles/o1-basic.scene.json"
O4S = "../oracles/o4-undirected.scene.json"
GS = lambda n: f"../oracles-igl/scenes/{n}.scene.json"
GL = lambda n: f"../oracles-igl/layouts/{n}.layout.json"
GV = lambda n: f"../oracles-igl/verify/{n}.layout.json"
GB = lambda n: f"../oracles-igl/bind/{n}.layout.json"


def load(scene_rel, layout_rel, limits=None):
    return igr.build_model(read(scene_rel), read(layout_rel), limits)


# ----------------------------------------------------------------------------------------------
# scene and FIXED layout builders (own inputs only where no frozen one serves)
# ----------------------------------------------------------------------------------------------
def make_scene(nodes, edges=(), directed=True, artifact=None, node_x=None, edge_x=None):
    """nodes: [(type, taggedid)]; edges: [(rel, stype, sid, ttype, tid)] ; returns canonical scene bytes."""
    node_x = node_x or {}
    edge_x = edge_x or {}
    ns = []
    for t, i in nodes:
        n = {"category": t, "label": i[2:], "ref": {"id": i, "type": t}}
        n.update(node_x.get((t, i), {}))
        ns.append(n)
    ns.sort(key=lambda n: node_key(n["ref"]))
    es = []
    for rel, st, si, tt, ti in edges:
        a, b = {"id": si, "type": st}, {"id": ti, "type": tt}
        if not directed and node_key(a) > node_key(b):
            a, b = b, a
        e = {"label": rel, "ref": {"ord": "0", "rel": rel, "src": a, "tgt": b}}
        e.update(edge_x.get((rel, st, si, tt, ti), {}))
        es.append(e)
    es.sort(key=lambda e: edge_key(e["ref"]))
    art = artifact or ("0" * 64)
    sc = {"address_scheme": "igs-addr/1", "edges": es, "graph": {"directed": directed, "profile": "simple"}, "igs": "IGS/1",
          "nodes": ns, "source": {"artifact_sha256": art, "serialization_profile": "ison-v1"}}
    raw = cjb(sc)
    igr.verify_scene(raw)            # self-check with the lite verifier
    return raw


FIXED = {"algorithm": "igl-fixed/1", "config": {}, "family": "FIXED"}


def make_fixed_layout(scene_raw, positions):
    """positions: {(type,id): (x, y)} in layout UNITS (doubles); quantized once (IGL/1 section 4)."""
    sc = json.loads(scene_raw.decode("utf-8"))
    nodes = []
    for n in sc["nodes"]:
        k = (n["ref"]["type"], n["ref"]["id"])
        x, y = positions[k]
        qx, qy = q(x), q(y)
        assert abs(qx) <= igr.SAFE and abs(qy) <= igr.SAFE
        nodes.append({"ref": n["ref"], "x": qx, "y": qy})
    nodes.sort(key=lambda n: node_key(n["ref"]))
    lay = {"address_scheme": "igs-addr/1", "igl": "IGL/1", "nodes": nodes, "policy": FIXED, "scale": 1000, "scene_sha256": sha(scene_raw)}
    raw = cjb(lay)
    igr.verify_layout(raw)
    return raw


def own_input(name, scene_raw, positions):
    put(f"scenes/{name}.scene.json", scene_raw)
    lay = make_fixed_layout(scene_raw, positions)
    put(f"layouts/{name}.layout.json", lay)
    return f"scenes/{name}.scene.json", f"layouts/{name}.layout.json"


def ref(t, i):
    return {"id": i, "type": t}


def NODE(m, i):
    return {"node": dict(m.nodes[i]["ref"])}


def EDGE(m, j):
    return {"edge": json.loads(json.dumps(m.edges[j]["ref"]))}


def nid(m, id_, t=None):
    for n in m.nodes:
        if n["ref"]["id"] == id_ and (t is None or n["ref"]["type"] == t):
            return n["index"]
    raise KeyError(id_)


# ----------------------------------------------------------------------------------------------
# step runner shared by R and A groups
# ----------------------------------------------------------------------------------------------
def run_steps(m, rid, size, steps, limits=None, initial=None, extra=None):
    """steps: list of intents or (intent, intended_error_tag).  Writes state/event files; returns
    (script_obj, final_state, last_events, last_ok_state_rel)."""
    w, h = size
    if initial is None:
        state = igr.initial_state(m, w, h)
    else:
        state = initial[0]
    script = {"size": {"width": w, "height": h}}
    if limits:
        script["limits"] = limits
    if initial is not None:
        script["initial"] = initial[1]
    if extra:
        script.update(extra)
    script["steps"] = []
    last_events, last_rel = [], None
    ok_seen = False
    for k, st in enumerate(steps, 1):
        intent, want = st if isinstance(st, tuple) else (st, None)
        try:
            st2, ev = igr.reduce(m, state, intent, limits)
        except IgrError as e:
            assert want == e.tag(), (rid, k, intent, want, e.tag())
            script["steps"].append({"intent": intent, "error": e.tag()})
            last_events = []
            continue
        assert want is None, (rid, k, "expected error", want)
        sp, ep = f"states/{rid}.s{k}.state.json", f"events/{rid}.s{k}.events.json"
        put(sp, igr.serialize_state(m, st2))
        put(ep, igr.serialize_events(ev))
        script["steps"].append({"intent": intent, "expected_state": sp, "expected_events": ep})
        state, last_events, last_rel = st2, ev, sp
        ok_seen = True
    return script, state, last_events, last_rel


def final_state_rel(rid, script, init_rel=None):
    """expected cell of an R row: the state file of the last successful step"""
    rels = [s["expected_state"] for s in script["steps"] if "expected_state" in s]
    return rels[-1] if rels else init_rel


# ----------------------------------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------------------------------
def main():
    for d in ("models", "states", "events", "scripts", "hits", "a11y", "manifests", "lifecycle", "compare", "scenes", "layouts"):
        p = os.path.join(OUT, d)
        if os.path.isdir(p):
            shutil.rmtree(p)
    for f in ("EXPECT.tsv", "SHA256SUMS"):
        p = os.path.join(OUT, f)
        if os.path.exists(p):
            os.remove(p)

    # ---------------- models used by many groups ----------------
    M = {}
    M["F01"] = (O1S, GL("F01"))
    M["F02"] = (O4S, GL("F02"))
    for name, sc, ly in [("empty", "empty", "F07"), ("single", "single", "F08"), ("unicode", "unicode", "F09"),
                         ("mixed", "mixed20", "F04"), ("keybound", "keybound", "F13")]:
        M[name] = (GS(sc), GL(ly))
    m1 = load(*M["F01"])
    m4 = load(*M["F02"])
    mE = load(*M["empty"])
    mS = load(*M["single"])
    mU = load(*M["unicode"])
    mX = load(*M["mixed"])
    mK = load(*M["keybound"])

    # ---------------- own inputs ----------------
    # hit geometry scene (section 13.3a: the author's design).  At viewport 800x600, centre (400,300) units, zoom 1000,
    # one layout unit is exactly one CSS pixel and every node lies on an exact milli-pixel.
    HG = {1: (100, 100), 2: (118, 100), 3: (200, 100), 4: (300, 200), 5: (500, 200), 6: (400, 206), 7: (100, 400), 8: (200, 400),
          9: (155, 380), 10: (155, 580), 11: (700, 100), 12: (600, 500), 13: (600, 500), 14: (1000000, 1000000), 15: (0, 300),
          16: (800, 600), 17: (600, 300), 18: (660, 380)}
    hg_nodes = [("n", f"i:{k}") for k in HG]
    hg_edges = [("E", "n", "i:4", "n", "i:5"), ("E", "n", "i:7", "n", "i:8"), ("E", "n", "i:9", "n", "i:10"),
                ("E", "n", "i:11", "n", "i:11"), ("E", "n", "i:12", "n", "i:13"), ("E", "n", "i:17", "n", "i:18")]
    hg_raw = make_scene(hg_nodes, hg_edges, True, sha(b"hitgeo"))
    HGS, HGL = own_input("hitgeo", hg_raw, {("n", f"i:{k}"): (float(v[0]), float(v[1])) for k, v in HG.items()})
    mH = load(HGS, HGL)

    # hostile labels (M10, A08)
    hostile_nodes = [("t", 's:<script>alert("x")</script>'), ("t", "s:\u202eevil"), ("t", 's:quote"back\\slash'), ("t", "s:nul\x00byte"),
                     ("t", "s:del\x7fchar"), ("t", "s:ls\u2028ps\u2029end"), ("t", "s:&amp;<>'"), ("t", "s:\U0001F600astral"),
                     ("<b>", "s:markup type"), ("\u202etype", "s:rlo-type"), ("t", "i:42")]
    hostile_edges = [("<svg/onload=alert(1)>", "t", 's:<script>alert("x")</script>', "t", "s:\u202eevil"), ("a&b", "t", "s:nul\x00byte", "t", "s:del\x7fchar"),
                     ("\u202ex", "t", "i:42", "<b>", "s:markup type")]
    hostile_raw = make_scene(hostile_nodes, hostile_edges, True, sha(b"hostile"))
    hpos = {k: (float(10 * (n + 1)), float(7 * (n + 1))) for n, k in enumerate(hostile_nodes)}
    HOS, HOL = own_input("hostile", hostile_raw, hpos)
    mHo = load(HOS, HOL)

    # M26: FIXED layout with exactly F01's coordinates
    M26S, M26L = O1S, "layouts/M26.layout.json"
    put(M26L, make_fixed_layout(read(O1S), {("person", "i:1"): (173.961, 81.203), ("person", "s:ann"): (593.147, 187.923)}))
    # M28: scene with x- keys on nodes and edges (ignored by the model)
    xn = {("person", "i:1"): {"x-badge": "gold", "x-n": {"a": [1, 2, {"b": True}]}}, ("person", "s:ann"): {"x-note": "hello"}}
    xe = {("KNOWS", "person", "i:1", "person", "s:ann"): {"x-weight": 3}}
    m28_raw = make_scene([("person", "i:1"), ("person", "s:ann")], [("KNOWS", "person", "i:1", "person", "s:ann")], True,
                         "1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a", xn, xe)
    M28S, M28L = own_input("M28", m28_raw, {("person", "i:1"): (173.961, 81.203), ("person", "s:ann"): (593.147, 187.923)})
    # M29/A17: igl:S09 (empty label) with a FIXED layout
    M29S, M29L = GS("S09"), "layouts/M29.layout.json"
    put(M29L, make_fixed_layout(read(GS("S09")), {("p", "s:"): (10.0, 20.0)}))
    # A-group scenes
    a05_raw = make_scene([("p", "i:1")], [("loop", "p", "i:1", "p", "i:1")], True, sha(b"a05"))
    A05S, A05L = own_input("A05", a05_raw, {("p", "i:1"): (50.0, 50.0)})
    ten_raw = make_scene([(c, "i:1") for c in "abcdefghij"], [], True, sha(b"ten"))
    TENS, TENL = own_input("ten", ten_raw, {(c, "i:1"): (float(30 * k), float(20 * k)) for k, c in enumerate("abcdefghij")})
    nfc, nfd = "\u00e9", "e\u0301"
    nf_raw = make_scene([("t", "s:" + nfc), ("t", "s:" + nfd), (nfc, "s:x"), (nfd, "s:x")], [("r", "t", "s:" + nfc, "t", "s:" + nfd)], True, sha(b"nf"))
    NFS, NFL = own_input("nfc", nf_raw, {("t", "s:" + nfc): (10.0, 10.0), ("t", "s:" + nfd): (50.0, 10.0), (nfc, "s:x"): (10.0, 50.0), (nfd, "s:x"): (50.0, 50.0)})
    tw_raw = make_scene([("p", "i:1"), ("p", "s:1")], [("r", "p", "i:1", "p", "s:1")], True, sha(b"twins"))
    TWS, TWL = own_input("twins", tw_raw, {("p", "i:1"): (10.0, 10.0), ("p", "s:1"): (90.0, 40.0)})
    mA05, mTen, mNf, mTw = load(A05S, A05L), load(TENS, TENL), load(NFS, NFL), load(TWS, TWL)
    assert igr.summary_text(igr.graph_summary(mTen)) == "Directed graph with 10 nodes and 0 edges. Node categories: a (1), b (1), c (1), d (1), e (1), f (1), g (1), h (1), and 2 more."

    # =============================================================================================
    # M  model (core)
    # =============================================================================================
    def mrow(mid, name, models, limits=None, expected_from=None, scene_rel=None, layout_rel=None, intended_error=None, input_override=None):
        s_rel, l_rel = models
        inp = input_override if input_override is not None else (inline({"limits": limits}) if limits else "")
        try:
            mm = load(s_rel, l_rel, limits)
            err = ""
            data = igr.model_bytes(mm)
            if expected_from:
                exp_rel = expected_from
                assert read_corpus(exp_rel) == data, mid
            else:
                exp_rel = f"models/{mid}.model.json"
                put(exp_rel, data)
        except IgrError as e:
            err, exp_rel = e.tag(), ""
        assert (intended_error or "") == err, (mid, intended_error, err)
        row(mid, "M", "core", s_rel, l_rel, inp, exp_rel, err)

    def read_corpus(rel):
        return FILES[rel]

    mrow("M01", "O1", M["F01"])
    mrow("M02", "O4", M["F02"])
    mrow("M03", "empty", M["empty"])
    mrow("M04", "single", M["single"])
    mrow("M05", "unicode", M["unicode"])
    mrow("M06", "mixed", M["mixed"])
    mrow("M07", "O1+X01", (O1S, GL("X01")))
    mrow("M08", "keybound", M["keybound"])
    mrow("M09", "S18+X05", (GS("S18"), GL("X05")))
    mrow("M10", "hostile", (HOS, HOL))
    mrow("M11", "bind-a+B01", (GS("bind-a"), GB("B01")), intended_error="LAYOUT:SCENE_MISMATCH/")
    mrow("M12", "bind-a+B03", (GS("bind-a"), GB("B03")), intended_error="LAYOUT:INCOMPLETE_LAYOUT/MISSING_NODE")
    mrow("M13", "B07+F11", (GS("B07"), GL("F11")), intended_error="IGS:INVALID_SCENE/NON_CANONICAL")
    mrow("M14", "maxNodes=20", M["mixed"], {"maxNodes": 20})
    mrow("M15", "maxNodes=19", M["mixed"], {"maxNodes": 19}, intended_error="RESOURCE_LIMIT/NODE_LIMIT")
    mrow("M16", "maxEdges=37", M["mixed"], {"maxEdges": 37})
    mrow("M17", "maxEdges=36", M["mixed"], {"maxEdges": 36}, intended_error="RESOURCE_LIMIT/EDGE_LIMIT")
    label_sum = sum(igr.utf16_len(n["label"]) + igr.utf16_len(n["category"]) for n in mX.nodes) + sum(igr.utf16_len(e["label"]) for e in mX.edges)
    mrow("M18", "labels=N", M["mixed"], {"maxTotalLabelUnits": label_sum})
    mrow("M19", "labels=N-1", M["mixed"], {"maxTotalLabelUnits": label_sum - 1}, intended_error="RESOURCE_LIMIT/LABEL_LIMIT")
    slen = len(read(M["mixed"][0]))
    llen = len(read(M["mixed"][1]))
    mrow("M20", "scene bytes=len", M["mixed"], {"maxSceneBytes": slen})
    mrow("M21", "scene bytes=len-1", M["mixed"], {"maxSceneBytes": slen - 1}, intended_error="RESOURCE_LIMIT/BYTES_LIMIT")
    mrow("M22", "layout bytes=len-1", M["mixed"], {"maxLayoutBytes": llen - 1}, intended_error="RESOURCE_LIMIT/BYTES_LIMIT")
    # M23: V21 only (a row carries one layout); expectation is NOT M01's bytes (layout_sha256 differs) - see AMBIGUITIES
    m23 = load(O1S, GV("V21"))
    assert igr.model_obj(m23)["nodes"] == igr.model_obj(m1)["nodes"] and m23.layout_sha256 != m1.layout_sha256
    mrow("M23", "O1+V21", (O1S, GV("V21")))
    m24 = load(O1S, GV("V45"))
    mrow("M24", "O1+V45", (O1S, GV("V45")))
    # M25: plain object shaped like a model
    row("M25", "M", "core", O1S, GL("F01"), inline({"plain_object_model": True}), "", "INVALID_INPUT/NOT_A_RENDER_MODEL")
    m26 = load(M26S, M26L)
    assert igr.model_obj(m26)["nodes"] == igr.model_obj(m1)["nodes"]
    mrow("M26", "F01 vs FIXED same coordinates", (M26S, M26L))
    # M27: larger limits, M01's file
    big = {"maxSceneBytes": 16777216, "maxLayoutBytes": 8388608, "maxNodes": 40000, "maxEdges": 80000, "maxTotalLabelUnits": 8388608,
           "maxStateBytes": 16777216, "maxIntentTargets": 120000}
    assert igr.model_bytes(load(*M["F01"], big)) == igr.model_bytes(m1)
    mrow("M27", "larger limits", M["F01"], big, expected_from="models/M01.model.json")
    m28 = load(M28S, M28L)
    assert igr.model_obj(m28)["nodes"] == igr.model_obj(m1)["nodes"] and "x-weight" not in igr.model_bytes(m28).decode()
    mrow("M28", "scene x- keys", (M28S, M28L))
    mrow("M29", "S09 empty label", (M29S, M29L))
    # supplementary ids (added by the oracle author; see AMBIGUITIES A-23)
    mrow("M23b", "O1+V24", (O1S, GV("V24")))
    mrow("M24b", "O1+V46", (O1S, GV("V46")))

    # M30 / A21: category order is UTF-8, not UTF-16 (13.3b)
    FW, EMO = "\uff5e", "\U0001F600"
    m30_raw = make_scene([(FW, "i:1"), (EMO, "i:1")], [("R", FW, "i:1", EMO, "i:1")], True, sha(b"m30"))
    M30S, M30L = own_input("M30", m30_raw, {(FW, "i:1"): (0.0, 0.0), (EMO, "i:1"): (1.0, 1.0)})
    mM30 = load(M30S, M30L)
    assert mM30.categories == [FW, EMO] and mM30.nodes[0]["category"] == FW and sorted([FW, EMO]) == [FW, EMO] and [c.encode("utf-16-be") for c in (FW, EMO)] != sorted(c.encode("utf-16-be") for c in (FW, EMO))
    mrow("M30", "UTF-8 category order", (M30S, M30L))

    # =============================================================================================
    # S  state
    # =============================================================================================
    O1sel = {"nodes": [NODE(m1, 0)["node"], NODE(m1, 1)["node"]], "edges": [EDGE(m1, 0)["edge"]]}
    vp1 = igr.initial_state(m1, 900, 600)["viewport"]

    def obj_state(m, sel_n=(), sel_e=(), hid_n=(), hid_e=(), focus=None, vp=None):
        sel = {("n", i) for i in sel_n} | {("e", j) for j in sel_e}
        hid = {("n", i) for i in hid_n} | {("e", j) for j in hid_e}
        return igr.mk_state(m, sel, hid, focus, vp)

    def accepted_state(sid, m, st, models):
        raw = igr.serialize_state(m, st)
        assert igr.parse_state(m, raw) == json.loads(raw.decode("utf-8"))
        rel = f"states/{sid}.state.json"
        put(rel, raw)
        return rel, raw

    S_rows = {}
    # (b) initial rows
    for sid, m, models, (w, h) in [("S01", m1, M["F01"], (900, 600)), ("S07", mE, M["empty"], (900, 600)), ("S08", m1, M["F01"], (1, 1)),
                                   ("S09", m1, M["F01"], (64, 64)), ("S10", m1, M["F01"], (65, 65))]:
        st = igr.initial_state(m, w, h)
        rel, raw = accepted_state(sid, m, st, models)
        tier = "both"
        row(sid, "S", tier, models[0], models[1], inline({"initial": {"height": h, "width": w}}), rel, "")
    assert igr.initial_state(mE, 900, 600)["viewport"] == {"center_x": 0, "center_y": 0, "height": 600, "width": 900, "zoom": 1000}
    # accepted (a)
    S02 = obj_state(m1, [0, 1], [0], vp=vp1)
    S03 = obj_state(m1, [0, 1], [0], focus=("n", 1), vp=vp1)
    S04 = obj_state(m1, [0], [], [1], [0], focus=("n", 0), vp=vp1)
    S05 = obj_state(m1, [1], [], vp=dict(center_x=-500000, center_y=-250000, height=600, width=900, zoom=1000))
    S06 = obj_state(m1, [0, 1], [], [], [0], vp=vp1)
    vp4 = igr.initial_state(m4, 900, 600)["viewport"]
    S11 = obj_state(m4, [], [0], focus=("n", 1), vp=vp4)
    S32 = obj_state(m1, vp=dict(center_x=-igr.SAFE, center_y=igr.SAFE, height=600, width=900, zoom=1000))
    paths = {}
    for sid, m, st, models in [("S02", m1, S02, M["F01"]), ("S03", m1, S03, M["F01"]), ("S04", m1, S04, M["F01"]), ("S05", m1, S05, M["F01"]),
                               ("S06", m1, S06, M["F01"]), ("S11", m4, S11, M["F02"]), ("S32", m1, S32, M["F01"])]:
        rel, raw = accepted_state(sid, m, st, models)
        paths[sid] = (rel, raw)
        row(sid, "S", "both", models[0], models[1], rel, "", "")
    s03 = json.loads(paths["S03"][1].decode("utf-8"))
    s11 = json.loads(paths["S11"][1].decode("utf-8"))
    DUMP = lambda o: json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

    def mut(base, f):
        o = copy.deepcopy(base)
        f(o)
        return o

    s03text = paths["S03"][1].decode("utf-8")
    rejected = []

    def rej(sid, raw, want, m=m1, models=M["F01"], tier="both"):
        rejected.append((sid, raw, want, m, models, tier))

    # S12 key order, S13 whitespace, S14 duplicate JSON key
    ordered = {k: s03[k] for k in ["viewport", "selection", "scene_sha256", "layout_sha256", "igr", "hidden", "focus"]}
    rej("S12", json.dumps(ordered, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), "INVALID_STATE/NON_CANONICAL", tier="core")
    rej("S13", json.dumps(s03, sort_keys=True).encode("utf-8"), "INVALID_STATE/NON_CANONICAL", tier="core")
    assert '"igr":"IGR/1"' in s03text
    rej("S14", s03text.replace('"igr":"IGR/1"', '"igr":"IGR/1","igr":"IGR/1"').encode("utf-8"), "INVALID_STATE/NON_CANONICAL", tier="core")
    rej("S15", DUMP(mut(s03, lambda o: o["selection"].__setitem__("nodes", o["selection"]["nodes"][::-1]))), "INVALID_STATE/NON_CANONICAL")
    n0, n1 = NODE(m1, 0)["node"], NODE(m1, 1)["node"]
    rej("S16", DUMP(mut(s03, lambda o: o["selection"].__setitem__("nodes", [n0, n0]))), "INVALID_STATE/DUPLICATE_ELEMENT")
    rej("S17", DUMP(mut(s03, lambda o: o["selection"].__setitem__("nodes", [n1, n0, n1]))), "INVALID_STATE/DUPLICATE_ELEMENT")
    rej("S18", DUMP(mut(s03, lambda o: o["selection"].__setitem__("nodes", [{"id": "i:99", "type": "person"}]))), "INVALID_STATE/UNRESOLVED_ELEMENT")

    def swap_edge(o):
        e = o["selection"]["edges"][0]
        e["src"], e["tgt"] = e["tgt"], e["src"]
    rej("S19", DUMP(mut(s11, swap_edge)), "INVALID_STATE/UNRESOLVED_ELEMENT", m4, M["F02"])
    rej("S20", DUMP(mut(s03, lambda o: o.__setitem__("scene_sha256", "0" * 64))), "INVALID_STATE/SCENE_MISMATCH")
    rej("S21", DUMP(mut(s03, lambda o: o.__setitem__("layout_sha256", "0" * 64))), "INVALID_STATE/LAYOUT_MISMATCH")
    rej("S22", paths["S11"][1], "INVALID_STATE/SCENE_MISMATCH")      # state of another scene (O4) against O1
    rej("S23", DUMP(mut(s03, lambda o: o["hidden"].__setitem__("nodes", [n0]))), "INVALID_STATE/SELECTED_HIDDEN")

    def s24(o):
        o["selection"] = {"edges": [], "nodes": []}
        o["hidden"] = {"edges": [], "nodes": [n1]}
        o["focus"] = {"edge": EDGE(m1, 0)["edge"]}
    rej("S24", DUMP(mut(s03, s24)), "INVALID_STATE/FOCUS_HIDDEN")
    vpm = lambda **kw: (lambda o: o["viewport"].update(kw))
    rej("S25", DUMP(mut(s03, vpm(zoom=0))), "INVALID_STATE/INVALID_VIEWPORT")
    rej("S26", DUMP(mut(s03, vpm(zoom=100001))), "INVALID_STATE/INVALID_VIEWPORT")
    assert '"zoom":1994' in s03text
    rej("S27", s03text.replace('"zoom":1994', '"zoom":1000.5').encode("utf-8"), "INVALID_STATE/INVALID_NUMBER")
    rej("S28", s03text.replace('"zoom":1994', '"zoom":1e3').encode("utf-8"), "INVALID_STATE/NON_CANONICAL", tier="core")
    rej("S29", DUMP(mut(s03, vpm(width=0))), "INVALID_STATE/INVALID_VIEWPORT")
    rej("S30", DUMP(mut(s03, vpm(width=16385))), "INVALID_STATE/INVALID_VIEWPORT")
    rej("S31", s03text.replace('"center_x":383554', '"center_x":9007199254740992').encode("utf-8"), "INVALID_STATE/INVALID_NUMBER")
    rej("S33", DUMP(mut(s03, lambda o: o.__setitem__("foo", 1))), "INVALID_STATE/UNKNOWN_FIELD")
    rej("S34", DUMP(mut(s03, lambda o: o.__setitem__("x-note", 1))), "INVALID_STATE/UNKNOWN_FIELD")
    rej("S35", DUMP(mut(s03, lambda o: o.pop("viewport"))), "INVALID_STATE/MISSING_FIELD")
    rej("S36", DUMP(mut(s03, lambda o: o.__setitem__("igr", "IGR/2"))), "INVALID_STATE/UNSUPPORTED_VERSION")
    rej("S37", b"\xef\xbb\xbf" + paths["S03"][1], "INVALID_STATE/INVALID_ENCODING", tier="core")
    rej("S38", paths["S03"][1][:20] + b"\xff" + paths["S03"][1][20:], "INVALID_STATE/INVALID_ENCODING", tier="core")
    rej("S39", DUMP(mut(s03, lambda o: o.__setitem__("focus", None))), "INVALID_STATE/SCHEMA")
    rej("S40", DUMP(mut(s03, lambda o: o.__setitem__("scene_sha256", "E8A4"))), "INVALID_STATE/INVALID_HASH")
    nsel = lambda i, v: (lambda o: o["selection"]["nodes"].__setitem__(i, v))
    rej("S42", DUMP(mut(s03, nsel(0, {"id": "i:1", "type": "person", "x-a": "i:1"}))), "INVALID_STATE/UNKNOWN_FIELD")
    rej("S43", DUMP(mut(s03, nsel(0, {"id": "i:1"}))), "INVALID_STATE/MISSING_FIELD")
    rej("S44", DUMP(mut(s03, lambda o: o["selection"]["edges"][0].pop("ord"))), "INVALID_STATE/MISSING_FIELD")
    rej("S45", DUMP(mut(s03, nsel(0, {"id": 5, "type": "person"}))), "INVALID_STATE/SCHEMA")
    rej("S46", DUMP(mut(s03, nsel(0, {"id": "i:1", "x": 1}))), "INVALID_STATE/UNKNOWN_FIELD")

    def s48(o):
        o["selection"] = {"edges": [], "nodes": [n0]}
        o["hidden"] = {"edges": [], "nodes": [n0]}
        o["focus"] = {"node": n0}
    rej("S48", DUMP(mut(s03, s48)), "INVALID_STATE/SELECTED_HIDDEN")
    s49 = DUMP(mut(s03, nsel(0, {"id": "s:XX", "type": "person"})))
    assert b"s:XX" in s49
    rej("S49", s49.replace(b"s:XX", b"s:\\ud800"), "INVALID_STATE/INVALID_STRING")
    ZZZ = {"id": "s:zzz", "type": "person"}
    rej("S51", DUMP(mut(s03, nsel(0, n1))) if False else DUMP(mut(s03, lambda o: o["selection"].__setitem__("nodes", [n1, n0, ZZZ]))), "INVALID_STATE/UNRESOLVED_ELEMENT")

    def s52(o):
        o["selection"]["nodes"] = [n1, n0]
        o["hidden"] = {"edges": [], "nodes": [n1]}
    rej("S52", DUMP(mut(s03, s52)), "INVALID_STATE/NON_CANONICAL")
    t53 = DUMP(mut(s03, lambda o: o.__setitem__("scene_sha256", "1" * 64))).decode("utf-8")
    assert '"zoom":1994' in t53
    rej("S53", t53.replace('"zoom":1994', '"zoom":1000.5').encode("utf-8"), "INVALID_STATE/INVALID_NUMBER")

    def s54(o):
        o["layout_sha256"] = "1" * 64
        o["selection"]["nodes"][0] = ZZZ
    rej("S54", DUMP(mut(s03, s54)), "INVALID_STATE/LAYOUT_MISMATCH")
    s02j = json.loads(paths["S02"][1].decode("utf-8"))
    rej("S55", DUMP(mut(s02j, lambda o: o["selection"]["edges"][0].__setitem__("ord", "01"))), "INVALID_STATE/INVALID_VALUE")
    for sid, raw, want, m, models, tier in rejected:
        try:
            igr.parse_state(m, raw)
            got = ""
        except IgrError as e:
            got = e.tag()
        assert got == want, (sid, got, want)
        rel = f"states/{sid}.state.json"
        put(rel, raw)
        row(sid, "S", tier, models[0], models[1], rel, "", got)
    # S41: bytes over maxStateBytes
    lim41 = {"maxStateBytes": len(paths["S03"][1]) - 1}
    try:
        igr.parse_state(m1, paths["S03"][1], lim41)
        raise AssertionError
    except IgrError as e:
        e41 = e.tag()
    assert e41 == "RESOURCE_LIMIT/BYTES_LIMIT"
    row("S41", "S", "core", M["F01"][0], M["F01"][1], inline({"file": paths["S03"][0], "limits": lim41}), "", e41)
    # S47: fit rounding (13.3b): a FIXED layout placing i:1 at (1.000, 1.000) and s:ann at (2.001, 3.001) layout units
    S47L = "layouts/S47.layout.json"
    put(S47L, make_fixed_layout(read(O1S), {("person", "i:1"): (1.0, 1.0), ("person", "s:ann"): (2.001, 3.001)}))
    m47 = load(O1S, S47L)
    st47 = igr.initial_state(m47, 900, 600)
    assert st47["viewport"] == {"center_x": 1501, "center_y": 2001, "height": 600, "width": 900, "zoom": 100000}, st47["viewport"]
    assert (igr.floor_div(836 * 10 ** 6, 1001), igr.floor_div(536 * 10 ** 6, 2001), igr.div_round(3001, 2), igr.div_round(4001, 2)) == (835164, 267866, 1501, 2001)
    put("states/S47.state.json", igr.serialize_state(m47, st47))
    row("S47", "S", "both", O1S, S47L, inline({"initial": {"height": 600, "width": 900}}), "states/S47.state.json", "")
    # S50: the inclusive state-size limit
    lim50 = {"maxStateBytes": len(paths["S03"][1])}
    assert igr.parse_state(m1, paths["S03"][1], lim50)
    row("S50", "S", "core", M["F01"][0], M["F01"][1], inline({"file": paths["S03"][0], "limits": lim50}), "", "")

    # =============================================================================================
    # R  reducer scripts
    # =============================================================================================
    R = {}
    n_ = lambda m, i: NODE(m, i)
    e_ = lambda m, j: EDGE(m, j)
    sel = lambda mode, *t: {"type": "select", "mode": mode, "targets": list(t)}
    hide = lambda hidden, *t: {"type": "set-hidden", "hidden": hidden, "targets": list(t)}
    fstep = lambda d: {"type": "focus-step", "delta": d}
    NOPE = {"node": {"id": "i:99", "type": "person"}}

    def rrow(rid, models, m, steps, size=(900, 600), limits=None, initial=None, tier="both", init_rel=None):
        script, state, lev, last = run_steps(m, rid, size, steps, limits, initial)
        sp = f"scripts/{rid}.script.json"
        put(sp, jdump(script))
        exp = final_state_rel(rid, script, init_rel if initial else None)
        if not exp:
            exp = "states/S01.state.json"            # no successful step: the unchanged initial state (C-03)
        assert exp, rid
        row(rid, "R", tier, models[0], models[1], sp, exp, "")
        return state

    I = lambda m: igr.initial_state(m, 900, 600)
    rrow("R01", M["F01"], m1, [sel("replace", n_(m1, 0)), sel("replace", n_(m1, 1), e_(m1, 0)), sel("replace")])
    rrow("R02", M["F01"], m1, [sel("add", n_(m1, 1)), sel("add", e_(m1, 0)), sel("add", n_(m1, 1))])
    rrow("R03", M["F01"], m1, [sel("toggle", n_(m1, 0)), sel("toggle", n_(m1, 0), e_(m1, 0)), sel("toggle", n_(m1, 1))])
    rrow("R04", M["F01"], m1, [sel("add", n_(m1, 0), n_(m1, 1)), sel("remove", n_(m1, 0)), sel("remove", n_(m1, 0)),
                               hide(True, n_(m1, 1)), sel("remove", n_(m1, 1))])
    rrow("R05", M["F01"], m1, [sel("replace", e_(m1, 0), n_(m1, 1), n_(m1, 0)), sel("toggle", e_(m1, 0), n_(m1, 1), n_(m1, 0))])
    rrow("R06", M["F01"], m1, [sel("replace", n_(m1, 0), n_(m1, 0)), sel("toggle", n_(m1, 0), n_(m1, 0)), sel("add", n_(m1, 1), n_(m1, 1), n_(m1, 1))])
    rrow("R07", M["F01"], m1, [sel("replace", n_(m1, 0)), (sel("add", n_(m1, 1), NOPE), "INVALID_INTENT/UNRESOLVED_ELEMENT"),
                               (sel("replace", NOPE), "INVALID_INTENT/UNRESOLVED_ELEMENT"), sel("add", n_(m1, 1))])
    rrow("R08", M["F01"], m1, [sel("replace", n_(m1, 0)), hide(True, n_(m1, 1)),
                               (sel("replace", n_(m1, 1)), "INVALID_INTENT/ELEMENT_HIDDEN"), (sel("add", e_(m1, 0)), "INVALID_INTENT/ELEMENT_HIDDEN"),
                               (sel("toggle", n_(m1, 1)), "INVALID_INTENT/ELEMENT_HIDDEN"), ({"type": "focus", "target": n_(m1, 1)}, "INVALID_INTENT/ELEMENT_HIDDEN"),
                               sel("add", n_(m1, 0))])
    rrow("R09", M["F01"], m1, [sel("add"), {"type": "clear-selection"}, {"type": "focus"}, {"type": "pan", "dx": 0, "dy": 0},
                               {"type": "zoom", "factor_milli": 1000}, {"type": "fit"}, {"type": "resize", "width": 900, "height": 600},
                               {"type": "set-viewport", "center_x": 383554, "center_y": 134563, "zoom": 1994}, hide(False, n_(m1, 0)), hide(True),
                               {"type": "focus-first"}, {"type": "focus-first"}])
    rrow("R10", M["F01"], m1, [sel("replace", n_(m1, 0), n_(m1, 1), e_(m1, 0)), {"type": "focus", "target": e_(m1, 0)}, hide(True, n_(m1, 1))])
    rrow("R11", M["F01"], m1, [sel("replace", n_(m1, 0), n_(m1, 1), e_(m1, 0)), {"type": "focus", "target": e_(m1, 0)}, hide(True, n_(m1, 1)), hide(False, n_(m1, 1))])
    rrow("R12", M["F01"], m1, [sel("replace", n_(m1, 0), e_(m1, 0)), hide(True, e_(m1, 0)), hide(False, e_(m1, 0))])
    rrow("R13", M["F01"], m1, [{"type": "focus", "target": n_(m1, 0)}, sel("replace", n_(m1, 1)), hide(True, n_(m1, 0))])
    rrow("R14", M["F02"], m4, [fstep(1)] * 5)
    rrow("R15", M["F01"], m1, [fstep(-1), fstep(1), {"type": "focus-first"}, fstep(-1), {"type": "focus-last"}, fstep(1), fstep(-1)])
    rrow("R16", M["F02"], m4, [hide(True, n_(m4, 0)), fstep(1), fstep(1), fstep(1), fstep(-1), fstep(-1), fstep(-1)])
    rrow("R17", M["empty"], mE, [fstep(1), fstep(-1), {"type": "focus-first"}, {"type": "focus-last"}])
    rrow("R18", M["F01"], m1, [fstep(-1), {"type": "focus"}, fstep(1)])
    rrow("R19", M["F01"], m1, [{"type": "focus", "target": n_(m1, 1)}, {"type": "focus", "target": e_(m1, 0)}, {"type": "focus", "target": e_(m1, 0)},
                               {"type": "focus"}, {"type": "focus"}, sel("replace", n_(m1, 0)), {"type": "focus", "target": n_(m1, 0)}])
    rrow("R20", M["F01"], m1, [{"type": "pan", "dx": 10, "dy": 0}, {"type": "fit", "padding": 32}, {"type": "pan", "dx": -7, "dy": 0},
                               {"type": "pan", "dx": 0, "dy": -13}, {"type": "pan", "dx": 3, "dy": 5},
                               {"type": "set-viewport", "center_x": 0, "center_y": 0, "zoom": 128}, {"type": "pan", "dx": 1, "dy": 0},
                               {"type": "pan", "dx": -1, "dy": 0}, {"type": "pan", "dx": 0, "dy": -1}, {"type": "pan", "dx": 0, "dy": 1}])
    rrow("R21", M["F01"], m1, [{"type": "zoom", "factor_milli": 2000}, {"type": "zoom", "factor_milli": 500}, {"type": "zoom", "factor_milli": 1000},
                               {"type": "zoom", "factor_milli": 1333}, {"type": "zoom", "factor_milli": 1}])
    rrow("R22", M["F01"], m1, [{"type": "zoom", "factor_milli": 2000, "anchor": {"x": 0, "y": 300}}, {"type": "fit", "padding": 32},
                               {"type": "zoom", "factor_milli": 3000, "anchor": {"x": -500, "y": 1000}}, {"type": "fit", "padding": 32},
                               {"type": "zoom", "factor_milli": 250, "anchor": {"x": 1500, "y": -200}}, {"type": "fit", "padding": 32},
                               {"type": "zoom", "factor_milli": 1777, "anchor": {"x": 900, "y": 600}}])
    rrow("R23", M["F01"], m1, [{"type": "set-viewport", "center_x": 5, "center_y": 6, "zoom": 10}, {"type": "zoom", "factor_milli": 500},
                               {"type": "zoom", "factor_milli": 500, "anchor": {"x": 10, "y": 10}},
                               {"type": "set-viewport", "center_x": 5, "center_y": 6, "zoom": 100000}, {"type": "zoom", "factor_milli": 2000},
                               {"type": "zoom", "factor_milli": 2000, "anchor": {"x": 10, "y": 10}}, {"type": "fit", "padding": 32},
                               {"type": "zoom", "factor_milli": 1000000, "anchor": {"x": 100, "y": 50}}, {"type": "zoom", "factor_milli": 1, "anchor": {"x": 100, "y": 50}}])
    rrow("R24", M["F01"], m1, [{"type": "pan", "dx": 40, "dy": -25}, {"type": "fit", "padding": 32}, {"type": "pan", "dx": 40, "dy": -25}, {"type": "fit"},
                               {"type": "fit", "padding": 0}, {"type": "fit", "padding": 100}, {"type": "fit", "padding": 299}])
    rrow("R25", M["single"], mS, [{"type": "set-viewport", "center_x": 7, "center_y": 8, "zoom": 3000}, {"type": "fit"}, {"type": "fit", "padding": 0}])
    allnodes = [n_(mX, i) for i in range(len(mX.nodes))]
    ext = sorted(range(len(mX.nodes)), key=lambda i: (mX.nodes[i]["x"], mX.nodes[i]["y"]))
    ext_n = [ext[0], ext[1], ext[-1], ext[-2]]
    rrow("R26", M["mixed"], mX, [{"type": "fit"}, hide(True, *[n_(mX, i) for i in ext_n]), {"type": "fit"}, hide(False, *[n_(mX, i) for i in ext_n]), {"type": "fit"},
                                 hide(True, *allnodes), {"type": "fit"}, hide(True, e_(mX, 0)), {"type": "fit"}])
    rrow("R27", M["F01"], m1, [({"type": "fit", "padding": 500}, "INVALID_INTENT/OUT_OF_RANGE"), ({"type": "fit", "padding": 300}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "fit", "padding": 16385}, "INVALID_INTENT/OUT_OF_RANGE"), ({"type": "fit", "padding": 16384}, "INVALID_INTENT/OUT_OF_RANGE"),
                               {"type": "fit", "padding": 299}])
    rrow("R28", M["F01"], m1, [({"type": "fit", "padding": -1}, "INVALID_INTENT/INVALID_VALUE"), ({"type": "fit", "padding": -100000}, "INVALID_INTENT/INVALID_VALUE"),
                               {"type": "pan", "dx": 1, "dy": 1}])
    rrow("R29", M["F01"], m1, [{"type": "resize", "width": 1000, "height": 700}, {"type": "resize", "width": 1000, "height": 700},
                               {"type": "resize", "width": 1, "height": 16384}, {"type": "resize", "width": 16384, "height": 1}, {"type": "resize", "width": 900, "height": 600}])
    rrow("R30", M["F01"], m1, [({"type": "set-viewport", "center_x": 0, "center_y": 0, "zoom": 9}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "set-viewport", "center_x": 0, "center_y": 0, "zoom": 100001}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "set-viewport", "center_x": 2 ** 53, "center_y": 0, "zoom": 1000}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "set-viewport", "center_x": 0, "center_y": -(2 ** 53), "zoom": 1000}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "set-viewport", "center_x": 0, "center_y": 0, "zoom": 1000.5}, "INVALID_INTENT/INVALID_VALUE"),
                               {"type": "set-viewport", "center_x": igr.SAFE, "center_y": -igr.SAFE, "zoom": 10},
                               {"type": "set-viewport", "center_x": 0, "center_y": 0, "zoom": 100000}])
    mV46 = load(O1S, GV("V46"))
    mV45 = load(O1S, GV("V45"))
    rrow("R31", (O1S, GV("V46")), mV46, [{"type": "fit"}, {"type": "pan", "dx": 100, "dy": 0}, {"type": "fit", "padding": 0}, {"type": "zoom", "factor_milli": 1000000}])
    rrow("R31b", (O1S, GV("V45")), mV45, [{"type": "fit"}, {"type": "pan", "dx": 100, "dy": 0}, {"type": "fit", "padding": 0}, {"type": "zoom", "factor_milli": 1000000}])
    near = dict(center_x=9007199254740000, center_y=-9007199254740000, height=600, width=900, zoom=10)
    init32 = igr.mk_state(m1, set(), set(), None, near)
    put("states/R32.init.state.json", igr.serialize_state(m1, init32))
    rrow("R32", M["F01"], m1, [({"type": "pan", "dx": -(2 ** 31), "dy": 0}, "INVALID_INTENT/OUT_OF_RANGE"), ({"type": "pan", "dx": 0, "dy": 2 ** 31}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "pan", "dx": 2 ** 31 + 1, "dy": 0}, "INVALID_INTENT/OUT_OF_RANGE"), {"type": "pan", "dx": 1, "dy": -1}],
         initial=(init32, "states/R32.init.state.json"))
    rrow("R33", M["F01"], m1, [({"type": "zoom", "factor_milli": 1000000, "anchor": {"x": 2 ** 31, "y": 0}}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "zoom", "factor_milli": 1000, "anchor": {"x": 2 ** 31 + 1, "y": 0}}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "zoom", "factor_milli": 1000000, "anchor": {"x": 900, "y": 600}}, "INVALID_INTENT/OUT_OF_RANGE"),
                               {"type": "zoom", "factor_milli": 1000000, "anchor": {"x": 450, "y": 300}}],
         initial=(init32, "states/R32.init.state.json"))
    rrow("R34", M["F01"], m1, [({"type": "teleport"}, "INVALID_INTENT/UNKNOWN_TYPE"), ({"type": "clear-selection", "x": 1}, "INVALID_INTENT/SCHEMA"),
                               ({"type": "pan", "dx": float("nan"), "dy": 0}, "INVALID_INTENT/NOT_FINITE"), ({"type": "pan", "dx": 1.5, "dy": 0}, "INVALID_INTENT/INVALID_VALUE"),
                               ({"type": "pan", "dx": "10", "dy": 0}, "INVALID_INTENT/SCHEMA"), ({"type": "pan", "dx": 1}, "INVALID_INTENT/SCHEMA"),
                               ({"type": "pan", "dx": float("inf"), "dy": 0}, "INVALID_INTENT/NOT_FINITE"), ({"type": "zoom", "factor_milli": 0}, "INVALID_INTENT/OUT_OF_RANGE"),
                               ({"type": "zoom", "factor_milli": 1000001}, "INVALID_INTENT/OUT_OF_RANGE"), ({"type": "select", "mode": "replace", "targets": [n_(m1, 0)], "extra": 1}, "INVALID_INTENT/SCHEMA"),
                               {"type": "pan", "dx": 2, "dy": 2}])
    rrow("R35", M["F01"], m1, [sel("replace", n_(m1, 0)), fstep(1), fstep(1), fstep(1), fstep(1), sel("add", e_(m1, 0)), hide(True, n_(m1, 0)), {"type": "pan", "dx": 5, "dy": 5}])
    rrow("R36", M["F01"], m1, [{"type": "set-viewport", "center_x": 0, "center_y": 0, "zoom": 10}, {"type": "zoom", "factor_milli": 1049},
                               {"type": "zoom", "factor_milli": 1050}, {"type": "zoom", "factor_milli": 1049, "anchor": {"x": 5, "y": 5}}, {"type": "zoom", "factor_milli": 1}])
    rrow("R37", M["F01"], m1, [({"type": "focus-endpoint", "target": e_(m1, 0)}, "INVALID_INTENT/UNKNOWN_TYPE"), ({"type": "focus-incident", "target": n_(m1, 0)}, "INVALID_INTENT/UNKNOWN_TYPE"),
                               ({"type": "focus-endpoint"}, "INVALID_INTENT/UNKNOWN_TYPE"), fstep(1)])
    rrow("R38", M["F01"], m1, [{"type": "fit"}, {"type": "resize", "width": 64, "height": 64}, {"type": "fit"}, {"type": "resize", "width": 65, "height": 65}, {"type": "fit"},
                               {"type": "resize", "width": 1, "height": 1}, {"type": "fit"}, {"type": "resize", "width": 2, "height": 3}, {"type": "fit"}],
         size=(1, 1))
    rrow("R39", M["F01"], m1, [sel("replace", n_(m1, 0), n_(m1, 1), e_(m1, 0))], limits={"maxIntentTargets": 3})
    olen = len(read(O1S))
    a_ann = n_(m1, 1)
    assert igr._addr_text_units(a_ann["node"]) == 11
    rrow("R40", M["F01"], m1, [(sel("replace", *([n_(m1, 0)] * 51)), "RESOURCE_LIMIT/TARGET_LIMIT"),
                               (sel("replace", *([a_ann] * 46)), "RESOURCE_LIMIT/TARGET_LIMIT"),
                               (hide(True, *([a_ann] * 46)), "RESOURCE_LIMIT/TARGET_LIMIT"),
                               sel("replace", *([a_ann] * 45)), hide(True, *([n_(m1, 0)] * 50))],
         limits={"maxIntentTargets": 50, "maxSceneBytes": olen})
    allel = [n_(mX, i) for i in range(len(mX.nodes))] + [e_(mX, j) for j in range(len(mX.edges))]
    rrow("R41", M["mixed"], mX, [sel("replace", *allel), sel("toggle", *allel)])

    rrow("R42", M["F01"], m1, [(sel("replace", {"node": {"id": "i:1"}}), "INVALID_INTENT/UNRESOLVED_ELEMENT")])
    rrow("R43", M["F01"], m1, [(sel("replace", {"node": {"id": "i:1", "type": 5}}), "INVALID_INTENT/UNRESOLVED_ELEMENT")])
    rrow("R44", M["F01"], m1, [(sel("replace", {"node": {"id": "i:1", "type": "person", "extra": 1}}), "INVALID_INTENT/UNRESOLVED_ELEMENT")])
    rrow("R45", M["F01"], m1, [(sel("replace", {}), "INVALID_INTENT/SCHEMA"), (sel("replace", {"node": {}, "edge": {}}), "INVALID_INTENT/SCHEMA"),
                               (sel("replace", {"node": 5}), "INVALID_INTENT/SCHEMA"), ({"type": "select", "mode": "replace", "targets": [5]}, "INVALID_INTENT/SCHEMA")])
    rrow("R46", M["F01"], m1, [({}, "INVALID_INTENT/SCHEMA")])
    rrow("R47", M["F01"], m1, [({"type": 5}, "INVALID_INTENT/UNKNOWN_TYPE"), ({"type": "bogus"}, "INVALID_INTENT/UNKNOWN_TYPE")])
    rrow("R48", M["F01"], m1, [({"type": "select", "mode": "bogus", "targets": 5}, "INVALID_INTENT/INVALID_VALUE"),
                               ({"type": "select", "mode": "replace", "targets": 5}, "INVALID_INTENT/SCHEMA")])
    rrow("R49", M["F01"], m1, [hide(True, n_(m1, 1)), ({"type": "focus", "target": n_(m1, 1)}, "INVALID_INTENT/ELEMENT_HIDDEN")])
    rrow("R50", M["F01"], m1, [({"type": "set-hidden", "targets": [], "hidden": "true"}, "INVALID_INTENT/SCHEMA")])
    r51_targets = [n_(m1, 0)] * 10 + [n_(m1, 1)] * 10 + [e_(m1, 0)] * 10 + [n_(m1, 1)] * 4
    assert sum(igr._addr_text_units((t.get("node") or t.get("edge"))) for t in r51_targets) == 504 == olen
    st51 = rrow("R51", M["F01"], m1, [sel("replace", *r51_targets)], limits={"maxSceneBytes": 504})
    assert len(st51["selection"]["nodes"]) == 2 and len(st51["selection"]["edges"]) == 1
    rrow("R52", M["F01"], m1, [(sel("replace", *(r51_targets + [n_(m1, 0)])), "RESOURCE_LIMIT/TARGET_LIMIT")], limits={"maxSceneBytes": 504})
    # =============================================================================================
    # H  hit
    # =============================================================================================
    cx0, cy0 = 400000, 300000
    hg_vp = dict(center_x=cx0, center_y=cy0, height=600, width=800, zoom=1000)
    hg_state = igr.mk_state(mH, set(), set(), None, hg_vp)
    put("states/hitgeo.state.json", igr.serialize_state(mH, hg_state))
    HGSTATE = "states/hitgeo.state.json"
    ND = lambda i: ("node", f"i:{i}")

    def pts_file(hid, m, state_rel, state_obj, size, points):
        """points: list of dicts {x, y, want: None | ('node', id) | ('edge', j) | 'ERR:...', state?: (rel, obj)}"""
        out = []
        for p in points:
            stt = p.get("state", (state_rel, state_obj))[1]
            x, y, want = p["x"], p["y"], p["want"]
            ent = {"x": x, "y": y}
            if "state" in p:
                ent["state"] = p["state"][0]
            if isinstance(want, str) and want.startswith("ERR:"):
                try:
                    igr.hit_test(m, stt, (x, y))
                    raise AssertionError((hid, x, y, "expected error"))
                except IgrError as e:
                    assert e.tag() == want[4:], (hid, x, y, e.tag(), want)
                    ent["error"] = e.tag()
            else:
                got = igr.hit_test(m, stt, (x, y))
                if want is None:
                    assert got is None, (hid, x, y, got)
                elif want[0] == "node":
                    assert got == {"node": {"id": want[1], "type": want[2]}}, (hid, x, y, got, want)
                else:
                    assert got == EDGE(m, want[1]), (hid, x, y, got, want)
                if got is not None:
                    ent["hit"] = got
            out.append(ent)
        script = {"size": {"width": size[0], "height": size[1]}, "state": state_rel if state_rel else "initial", "points": out}
        put(f"hits/{hid}.hits.json", jdump(script))
        return f"hits/{hid}.hits.json"

    def hrow(hid, models, m, points, state_rel="initial", state_obj=None, size=(800, 600)):
        if state_rel == "initial":
            state_obj = igr.initial_state(m, size[0], size[1])
        inp = pts_file(hid, m, None if state_rel == "initial" else state_rel, state_obj, size, points)
        row(hid, "H", "both", models[0], models[1], inp, "", "")

    HGM = (HGS, HGL)
    nn = lambda i: ("node", f"i:{i}", "n")
    hrow("H01", HGM, mH, [dict(x=200, y=100, want=nn(3)), dict(x=200.5, y=99.25, want=nn(3)), dict(x=100, y=100, want=nn(1))], HGSTATE, hg_state)
    hrow("H02", HGM, mH, [dict(x=212, y=100, want=nn(3)), dict(x=200, y=112, want=nn(3)), dict(x=188, y=100, want=nn(3)), dict(x=200, y=88, want=nn(3)),
                          dict(x=212.001, y=100, want=None), dict(x=200, y=112.001, want=None), dict(x=211.999, y=100, want=nn(3))], HGSTATE, hg_state)
    hrow("H03", HGM, mH, [dict(x=212 + 2 ** -11, y=100, want=nn(3)), dict(x=200, y=112 + 2 ** -11, want=nn(3)), dict(x=212 + 2 ** -11, y=100 + 2 ** -10, want=None)],
         HGSTATE, hg_state)
    hrow("H04", HGM, mH, [dict(x=212 + 2 ** -10, y=100, want=None), dict(x=200, y=112 + 2 ** -10, want=None), dict(x=212 + 2 ** -12, y=100, want=nn(3))], HGSTATE, hg_state)
    hrow("H05", HGM, mH, [dict(x=188, y=100, want=nn(3)), dict(x=188 - 2 ** -11, y=100, want=nn(3)), dict(x=188 - 2 ** -10, y=100, want=None),
                          dict(x=200, y=88 - 2 ** -11, want=nn(3)), dict(x=200, y=88 - 2 ** -10, want=None), dict(x=188 - 2 ** -11 + 2 ** -13, y=100, want=nn(3))], HGSTATE, hg_state)
    hrow("H06", HGM, mH, [dict(x=110, y=100, want=nn(2)), dict(x=108, y=100, want=nn(1)), dict(x=109.5, y=100, want=nn(2)), dict(x=108.5, y=100, want=nn(1)), dict(x=109.001, y=100, want=nn(2)),
                          dict(x=108.999, y=100, want=nn(1))], HGSTATE, hg_state)
    hrow("H07", HGM, mH, [dict(x=109, y=100, want=nn(1)), dict(x=109, y=103, want=nn(1)), dict(x=109, y=95, want=nn(1)), dict(x=109, y=107, want=nn(1))], HGSTATE, hg_state)
    hrow("H08", HGM, mH, [dict(x=400, y=203, want=nn(6)), dict(x=400, y=206, want=nn(6)), dict(x=400, y=200, want=nn(6)), dict(x=400, y=194.5, want=nn(6)),
                          dict(x=400, y=194, want=nn(6)), dict(x=400, y=193.9, want=None), dict(x=380, y=200, want=("edge", 0)), dict(x=390, y=200, want=nn(6)),
                          dict(x=387, y=200, want=("edge", 0))], HGSTATE, hg_state)
    hrow("H09", (O1S, GL("F01")), m1, [dict(x=500, y=308, want=("edge", 0)), dict(x=500, y=300, want=None), dict(x=32.0, y=193.5, want=("node", "i:1", "person")),
                                       dict(x=250, y=260, want=None), dict(x=450, y=303, want=("edge", 0)), dict(x=500, y=304, want=None), dict(x=500, y=313, want=("edge", 0)),
                                       dict(x=500, y=318.5, want=("edge", 0)), dict(x=500, y=319.5, want=None), dict(x=868, y=406, want=("node", "s:ann", "person")),
                                       dict(x=600, y=337, want=("edge", 0)), dict(x=600, y=349, want=None)], size=(900, 600))
    # H10 exactly 6 px: horizontal, vertical-ish, and a 3-4-5 diagonal
    hrow("H10", HGM, mH, [dict(x=330, y=206, want=("edge", 0)), dict(x=330, y=194, want=("edge", 0)), dict(x=330, y=206.001, want=None), dict(x=330, y=193.999, want=None),
                          dict(x=330, y=205.999, want=("edge", 0)), dict(x=634.8, y=336.4, want=("edge", 5)), dict(x=625.2, y=323.6, want=("edge", 5)),
                          dict(x=634.801, y=336.4, want=None), dict(x=634.8, y=336.399, want=None), dict(x=634.799, y=336.4, want=("edge", 5))], HGSTATE, hg_state)
    hrow("H11", HGM, mH, [dict(x=513, y=200, want=None), dict(x=507, y=200, want=nn(5)), dict(x=504, y=200, want=nn(5)), dict(x=512, y=200, want=nn(5)),
                          dict(x=512.001, y=200, want=None), dict(x=287, y=200, want=None), dict(x=288, y=200, want=nn(4)), dict(x=250, y=200, want=None)], HGSTATE, hg_state)
    hrow("H12", HGM, mH, [dict(x=150, y=405, want=("edge", 1)), dict(x=150.001, y=405, want=("edge", 2)), dict(x=149.999, y=405, want=("edge", 1)),
                          dict(x=150, y=404, want=("edge", 1)), dict(x=151, y=406, want=("edge", 2)), dict(x=151, y=404, want=("edge", 1))], HGSTATE, hg_state)
    h13 = igr.mk_state(mH, set(), {("n", 2)}, None, hg_vp)
    put("states/H13.state.json", igr.serialize_state(mH, h13))
    hrow("H13", HGM, mH, [dict(x=200, y=100, want=None), dict(x=205, y=105, want=None), dict(x=100, y=100, want=nn(1)),
                          dict(x=200, y=100, want=nn(3), state=(HGSTATE, hg_state))], "states/H13.state.json", h13)
    h14a = igr.mk_state(mH, set(), {("n", 3)}, None, hg_vp)
    h14b = igr.mk_state(mH, set(), {("e", 0)}, None, hg_vp)
    put("states/H14a.state.json", igr.serialize_state(mH, h14a))
    put("states/H14b.state.json", igr.serialize_state(mH, h14b))
    hrow("H14", HGM, mH, [dict(x=330, y=200, want=None), dict(x=300, y=200, want=None), dict(x=500, y=200, want=nn(5)), dict(x=400, y=200, want=nn(6)), dict(x=430, y=200, want=None),
                          dict(x=330, y=200, want=("edge", 0), state=(HGSTATE, hg_state)), dict(x=330, y=200, want=None, state=("states/H14b.state.json", h14b)),
                          dict(x=300, y=200, want=nn(4), state=("states/H14b.state.json", h14b))], "states/H14a.state.json", h14a)
    hrow("H15", HGM, mH, [dict(x=700, y=100, want=nn(11)), dict(x=708, y=100, want=nn(11)), dict(x=720, y=100, want=None), dict(x=700, y=125, want=None),
                          dict(x=700, y=140, want=None), dict(x=712, y=100, want=nn(11)), dict(x=712.001, y=100, want=None)], HGSTATE, hg_state)
    hrow("H16", HGM, mH, [dict(x=600, y=500, want=nn(12)), dict(x=600, y=510, want=nn(12)), dict(x=605, y=495, want=nn(12)), dict(x=620, y=500, want=None),
                          dict(x=600, y=520, want=None), dict(x=612, y=500, want=nn(12))], HGSTATE, hg_state)
    hrow("H17", HGM, mH, [dict(x=0, y=300, want=nn(15)), dict(x=-1, y=300, want=None), dict(x=-0.5, y=300, want=None), dict(x=800, y=600, want=nn(16)),
                          dict(x=801, y=600, want=None), dict(x=800, y=601, want=None), dict(x=5, y=300, want=nn(15)), dict(x=0, y=0, want=None),
                          dict(x=800, y=0, want=None), dict(x=0, y=600, want=None), dict(x=795, y=595, want=nn(16)), dict(x=2 ** 31, y=300, want=None),
                          dict(x=-(2 ** 31), y=-(2 ** 31), want=None)], HGSTATE, hg_state)
    hrow("H18", HGM, mH, [dict(x=float("nan"), y=100, want="ERR:INVALID_INPUT/NOT_FINITE"), dict(x=100, y=float("nan"), want="ERR:INVALID_INPUT/NOT_FINITE"),
                          dict(x=float("inf"), y=100, want="ERR:INVALID_INPUT/NOT_FINITE"), dict(x=100, y=float("-inf"), want="ERR:INVALID_INPUT/NOT_FINITE"),
                          dict(x=2 ** 40, y=100, want="ERR:INVALID_INPUT/OUT_OF_RANGE"), dict(x=100, y=-(2 ** 40), want="ERR:INVALID_INPUT/OUT_OF_RANGE"),
                          dict(x=2 ** 31 + 1, y=100, want="ERR:INVALID_INPUT/OUT_OF_RANGE"), dict(x=2 ** 31, y=100, want=None), dict(x=200, y=100, want=nn(3))], HGSTATE, hg_state)
    node14 = mH.nodes[13]
    h19 = {}
    pts19 = []
    for tag, z in (("min", 10), ("def", 1000), ("max", 100000)):
        vp = dict(center_x=node14["x"], center_y=node14["y"], height=600, width=800, zoom=z)
        stz = igr.mk_state(mH, set(), set(), None, vp)
        rel = f"states/H19.{tag}.state.json"
        put(rel, igr.serialize_state(mH, stz))
        h19[tag] = (rel, stz)
        for (x, y, want) in [(412, 300, nn(14)), (388, 300, nn(14)), (400, 312, nn(14)), (400, 288, nn(14)), (412 + 2 ** -11, 300, nn(14)), (412 + 2 ** -10, 300, None),
                             (400, 300, nn(14)), (412.001, 300, None), (408, 308, nn(14)), (409, 309, None)]:
            pts19.append(dict(x=x, y=y, want=want, state=h19[tag]))
    hrow("H19", HGM, mH, pts19, h19["min"][0], h19["min"][1])
    # H20 undirected: choose points from the screen geometry of O4+F02
    st4 = igr.initial_state(m4, 900, 600)
    X4, Y4 = igr.layout_to_screen_micro(m4, st4["viewport"])
    mx, my = round((X4[0] + X4[1]) / 2e6, 3), round((Y4[0] + Y4[1]) / 2e6, 3)
    dxs, dys = X4[1] - X4[0], Y4[1] - Y4[0]
    ln = math.hypot(dxs, dys)
    nx, ny = -dys / ln, dxs / ln
    pts20 = [dict(x=mx, y=my, want=("edge", 0)), dict(x=round(mx + 5 * nx, 3), y=round(my + 5 * ny, 3), want=("edge", 0)),
             dict(x=round(mx + 7 * nx, 3), y=round(my + 7 * ny, 3), want=None), dict(x=round(X4[1] / 1e6, 3), y=round(Y4[1] / 1e6, 3), want=("node", "i:2", "p")),
             dict(x=round(X4[0] / 1e6 + 3, 3), y=round(Y4[0] / 1e6, 3), want=("node", "i:1", "p"))]
    hrow("H20", M["F02"], m4, pts20, size=(900, 600))
    # H21 after pan (state produced by the reducer)
    h21, _ = igr.reduce(mH, hg_state, {"type": "pan", "dx": -50, "dy": 25})
    put("states/H21.state.json", igr.serialize_state(mH, h21))
    hrow("H21", HGM, mH, [dict(x=150, y=125, want=nn(3)), dict(x=200, y=100, want=None), dict(x=162, y=125, want=nn(3)), dict(x=162.001, y=125, want=None),
                          dict(x=50, y=125, want=nn(1)), dict(x=68, y=125, want=nn(2)), dict(x=250, y=225, want=nn(4)), dict(x=230, y=225, want=None)], "states/H21.state.json", h21)
    stU = igr.initial_state(mU, 900, 600)
    XU, YU = igr.layout_to_screen_micro(mU, stU["viewport"])
    pts22 = []
    for n in mU.nodes:
        i = n["index"]
        pts22.append(dict(x=round(XU[i] / 1e6, 3), y=round(YU[i] / 1e6, 3), want=("node", n["ref"]["id"], n["ref"]["type"])))
        pts22.append(dict(x=round(XU[i] / 1e6 + 40, 3), y=round(YU[i] / 1e6, 3), want=None))
    hrow("H22", M["unicode"], mU, pts22, size=(900, 600))
    # H23 extreme zoom on exact huge integers (O1 + V45)
    n0v = mV45.nodes[0]
    vp23 = dict(center_x=n0v["x"] - 5, center_y=n0v["y"], height=600, width=800, zoom=100000)
    st23 = igr.mk_state(mV45, set(), set(), None, vp23)
    put("states/H23.state.json", igr.serialize_state(mV45, st23))
    hrow("H23", (O1S, GV("V45")), mV45, [dict(x=400.5, y=300, want=("node", "i:1", "person")), dict(x=412.5, y=300, want=("node", "i:1", "person")),
                                        dict(x=412.501, y=300, want=None), dict(x=388.5, y=300, want=("node", "i:1", "person")), dict(x=388.499, y=300, want=("edge", 0)),
                                        dict(x=400.5, y=312, want=("node", "i:1", "person")), dict(x=400.5, y=312.001, want=None)], "states/H23.state.json", st23)
    # H24 lattice (pruned == brute force is the kit's inline test; the lattice and exact results are given here)
    stX = igr.initial_state(mX, 900, 600)
    XX, YY = igr.layout_to_screen_micro(mX, stX["viewport"])
    pts24 = []
    seen = set()

    def add24(x, y):
        key = (x, y)
        if key in seen:
            return
        seen.add(key)
        got = igr.hit_test(mX, stX, (x, y))
        pts24.append(dict(x=x, y=y, want=None if got is None else (("node", got["node"]["id"], got["node"]["type"]) if "node" in got else ("edge", mX.eidx[("e", got["edge"]["ord"], got["edge"]["rel"], got["edge"]["src"]["type"], got["edge"]["src"]["id"], got["edge"]["tgt"]["type"], got["edge"]["tgt"]["id"])]))))
    for gx in range(0, 901, 20):
        for gy in range(0, 601, 20):
            add24(float(gx), float(gy))
    for e in mX.edges:
        a, b = e["src"], e["tgt"]
        if a == b:
            continue
        ax, ay, bx, by = XX[a] / 1e6, YY[a] / 1e6, XX[b] / 1e6, YY[b] / 1e6
        ln = math.hypot(bx - ax, by - ay)
        if ln == 0:
            continue
        nx, ny = -(by - ay) / ln, (bx - ax) / ln
        for t in (0.5, 0.31):
            for off in (0, 5.999, 6.001, -5.999, -6.001, 6):
                px, py = ax + (bx - ax) * t + off * nx, ay + (by - ay) * t + off * ny
                if 0 <= px <= 900 and 0 <= py <= 600:
                    add24(round(px, 3), round(py, 3))
    for n in mX.nodes:
        i = n["index"]
        for off in (11.999, 12.0, 12.001):
            px, py = XX[i] / 1e6 + off, YY[i] / 1e6
            if 0 <= px <= 900 and 0 <= py <= 600:
                add24(round(px, 3), round(py, 3))
    hrow("H24", M["mixed"], mX, pts24, size=(900, 600))
    assert any(p["want"] and p["want"][0] == "edge" for p in pts24) and any(p["want"] and p["want"][0] == "node" for p in pts24)
    # H25 horizontal edge exact tolerance
    hrow("H25", HGM, mH, [dict(x=400, y=206 + 2 ** -11 + 20, want=None) if False else dict(x=330, y=206 + 2 ** -11, want=("edge", 0)), dict(x=330, y=206 + 2 ** -10, want=None),
                          dict(x=330, y=194 - 2 ** -11, want=("edge", 0)), dict(x=330, y=194 - 2 ** -10, want=None), dict(x=450, y=206 + 2 ** -11, want=("edge", 0)),
                          dict(x=450, y=206 + 2 ** -10, want=None), dict(x=330, y=206, want=("edge", 0))], HGSTATE, hg_state)

    hrow("H26", HGM, mH, [dict(x=-2 ** -11, y=300, want=nn(15)), dict(x=-2 ** -10, y=300, want=None), dict(x=800 + 2 ** -11, y=600, want=nn(16)),
                          dict(x=800 + 2 ** -10, y=600, want=None), dict(x=800, y=600 + 2 ** -11, want=nn(16)), dict(x=800, y=600 + 2 ** -10, want=None),
                          dict(x=-2 ** -11, y=300.5, want=nn(15)), dict(x=-2 ** -10, y=300.5, want=None), dict(x=0, y=300, want=nn(15)), dict(x=-0.0004, y=300, want=nn(15)),
                          dict(x=-0.0006, y=300, want=None)], HGSTATE, hg_state)

    # H27: the quantizer tie at the hit radius (13.3b)
    H27L = "layouts/H27.layout.json"
    put(H27L, make_fixed_layout(read(O1S), {("person", "i:1"): (-13.875, 0.0), ("person", "s:ann"): (1000.0, 1000.0)}))
    m27 = load(O1S, H27L)
    s27, _ = igr.reduce(m27, igr.initial_state(m27, 14, 14), {"type": "set-viewport", "center_x": 0, "center_y": 0, "zoom": 500})
    put("states/H27.state.json", igr.serialize_state(m27, s27))
    X27, Y27 = igr.layout_to_screen_micro(m27, s27["viewport"])
    assert (X27[0], Y27[0]) == (62500, 7000000)
    assert igr.q(12.0625) == 12063 and 12063000 - X27[0] == 12000500 and 12000000 - X27[0] == 11937500
    hrow("H27", (O1S, H27L), m27, [dict(x=12.0, y=7.0, want=("node", "i:1", "person")), dict(x=12.0625, y=7.0, want=None)], "states/H27.state.json", s27, size=(14, 14))

    # =============================================================================================
    # A  accessibility
    # =============================================================================================
    def arow(aid, models, m, steps, size=(900, 600), extra=None, expected_events=False):
        script, state, lev, last = run_steps(m, aid, size, steps, None, None, extra)
        sp = f"scripts/{aid}.script.json"
        put(sp, jdump(script))
        ann = [a for a in (igr.announcement_for(m, ev, state) for ev in lev) if a is not None]
        doc = {"accessible": igr.build_accessible(m, state), "announcements": ann, "summary": igr.graph_summary(m)}
        rel = f"a11y/{aid}.a11y.json"
        put(rel, cjb(doc))
        exp = rel
        if expected_events:
            exp = f"events/{aid}.events.json"
            put(exp, igr.serialize_events(lev))
        row(aid, "A", "both", models[0], models[1], sp, exp, "")
        return state, lev, doc

    arow("A01", M["F01"], m1, [sel("replace", n_(m1, 1)), {"type": "focus", "target": e_(m1, 0)}])
    _, _, d = arow("A02", M["F01"], m1, [])
    assert d["accessible"]["summary"] == "Directed graph with 2 nodes and 1 edge. Node categories: person (2)."
    _, _, d = arow("A03", M["F02"], m4, [sel("replace", e_(m4, 1)), {"type": "focus", "target": e_(m4, 1)}])
    assert d["accessible"]["summary"] == "Undirected graph with 2 nodes and 2 edges. Node categories: p (2)." and d["accessible"]["items"][-1]["description"] == "2 R 2"
    _, _, d = arow("A04", M["empty"], mE, [])
    assert d["accessible"]["summary"] == "Directed graph with 0 nodes and 0 edges." and d["accessible"]["items"] == []
    _, _, d = arow("A05", (A05S, A05L), mA05, [sel("replace", n_(mA05, 0), e_(mA05, 0))])
    assert d["accessible"]["summary"] == "Directed graph with 1 node and 1 edge. Node categories: p (1)."
    _, _, d = arow("A06", (TENS, TENL), mTen, [])
    assert d["accessible"]["summary"].endswith("h (1), and 2 more.")
    _, _, d = arow("A07", (NFS, NFL), mNf, [sel("replace", n_(mNf, 0)), {"type": "focus", "target": n_(mNf, 1)}])
    names = [it["name"] for it in d["accessible"]["items"] if it["role"] == "node"]
    assert len(set(names)) == 4
    arow("A08", (HOS, HOL), mHo, [sel("replace", n_(mHo, 1), e_(mHo, 0)), {"type": "focus", "target": n_(mHo, 3)}])
    _, _, d = arow("A09", M["keybound"], mK, [{"type": "focus", "target": n_(mK, 0)}])
    arow("A10", M["F01"], m1, [fstep(1)] * 5)
    a20_raw = make_scene([("p", "s:a "), ("p", "s:b")], [("R", "p", "s:a ", "p", "s:b")], True, sha(b"a20"))
    A20S, A20L = own_input("A20", a20_raw, {("p", "s:a "): (10.0, 10.0), ("p", "s:b"): (60.0, 30.0)})
    mA20 = load(A20S, A20L)
    _, _, d = arow("A20", (A20S, A20L), mA20, [])
    its = d["accessible"]["items"]
    assert [i["name"] for i in its] == ["p a ", "p b", "R"] and its[2]["description"] == "a  R b"
    _, _, d = arow("A21", (M30S, M30L), mM30, [])
    assert d["accessible"]["summary"] == "Directed graph with 2 nodes and 1 edge. Node categories: " + FW + " (1), " + EMO + " (1)."
    assert [i["name"] for i in d["accessible"]["items"] if i["role"] == "node"] == [FW + " 1", EMO + " 1"]
    _, _, d = arow("A19", M["F01"], m1, [fstep(1), fstep(-1)])
    assert d["announcements"] == ["Start of graph."]
    arow("A11", M["mixed"], mX, [hide(True, n_(mX, 0), n_(mX, 7)), hide(True, e_(mX, 20)), fstep(1), fstep(1)])
    _, _, d = arow("A12", M["F01"], m1, [sel("replace", n_(m1, 0), n_(m1, 1)), {"type": "focus", "target": n_(m1, 1)}, hide(True, n_(m1, 0))])
    assert d["accessible"]["status"] == "1 selected, 2 hidden. Focus: person ann."
    arow("A13", M["mixed"], mX, [sel("replace", n_(mX, 3), n_(mX, 9), e_(mX, 4)), fstep(1), fstep(1), fstep(-1), {"type": "focus", "target": e_(mX, 30)}])
    _, _, d = arow("A14", (TWS, TWL), mTw, [sel("replace", n_(mTw, 1))])
    assert d["accessible"]["items"][0]["name"] == d["accessible"]["items"][1]["name"] == "p 1" and d["accessible"]["items"][0]["address"] != d["accessible"]["items"][1]["address"]
    _, lev, d = arow("A15", M["F01"], m1, [sel("replace", n_(m1, 0), n_(m1, 1), e_(m1, 0)), {"type": "focus", "target": e_(m1, 0)}, hide(True, n_(m1, 1))])
    assert d["announcements"] == ["2 hidden.", "1 selected.", "Focus cleared."], d["announcements"]
    arow("A16", M["F01"], m1, [sel("replace", n_(m1, 0)), {"type": "pan", "dx": 10, "dy": 10}], extra={"reducedMotion": True})
    _, _, d = arow("A17", (M29S, M29L), load(M29S, M29L), [])
    assert d["accessible"]["items"][0]["name"] == "p "
    arow("A18", M["F01"], m1, [sel("replace", n_(m1, 0), n_(m1, 1), e_(m1, 0)), {"type": "focus", "target": e_(m1, 0)}, hide(True, n_(m1, 1))], expected_events=True)
    # (A18 also writes its a11y document; the expected cell is the events file)

    # =============================================================================================
    # P  manifest
    # =============================================================================================
    def base_manifest(host="dom"):
        caps = {c: {"status": "supported"} for c in igr.MANDATORY + ["labels.edge", "motion.animated", "export.scene", "export.svg", "export.png"]}
        caps["a11y.native-dom"] = {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}
        caps["a11y.companion-dom"] = {"status": "supported"}
        caps["scene.apply-delta"] = {"status": "unsupported", "reason": "RESERVED"}
        return {"capabilities": caps, "capacity": {"maxDrawnLabelUnits": 4096, "maxEdges": 40000, "maxNodes": 20000},
                "igr": "IGR/1", "renderer": {"host": host, "name": "oracle-test", "version": "0.0.0"}}
    PM = {}
    b = base_manifest("headless")
    for c in ("labels", "direction-cue", "indicators.non-color"):
        b["capabilities"][c] = {"status": "unsupported", "reason": "HOST_LACKS"}
    PM["P01"] = (b, "")
    b = base_manifest("dom")
    b["capabilities"]["labels"] = {"status": "degraded", "degradations": ["LABELS_ELIDED"]}
    b["capabilities"]["direction-cue"] = {"status": "degraded", "degradations": ["EDGE_STYLE_SIMPLIFIED"]}
    b["capabilities"]["labels.edge"] = {"status": "degraded", "degradations": ["EDGE_LABELS_OMITTED"]}
    PM["P02"] = (b, "")
    b = base_manifest("dom")
    b["capabilities"]["x-experimental.lasso"] = {"status": "degraded", "degradations": ["EDGE_STYLE_SIMPLIFIED", "LABELS_ELIDED"]}
    b["capabilities"]["x-other"] = {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}
    PM["P03"] = (b, "")
    PM["P04"] = (base_manifest("headless"), "")

    def pm(pid, f, host="dom"):
        b = base_manifest(host)
        f(b)
        PM[pid] = (b, "?")
    pm("P05", lambda b: b["capabilities"].pop("visibility"))
    pm("P06", lambda b: b["capabilities"].__setitem__("teleport", {"status": "supported"}))
    pm("P07", lambda b: b["capabilities"].__setitem__("selection", {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}))
    pm("P08", lambda b: b["capabilities"].__setitem__("viewport", {"status": "degraded", "degradations": ["LABELS_ELIDED"]}))
    pm("P09", lambda b: b["capabilities"].__setitem__("scene.apply-delta", {"status": "supported"}))
    pm("P10", lambda b: b["capabilities"].__setitem__("scene.apply-delta", {"status": "degraded", "degradations": ["LABELS_ELIDED"]}))
    pm("P11", lambda b: b["capabilities"].__setitem__("scene.apply-delta", {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}))
    pm("P12", lambda b: b["capabilities"].__setitem__("labels", {"status": "degraded", "degradations": ["BLUR"]}))
    pm("P13", lambda b: b["capabilities"].__setitem__("export.svg", {"status": "degraded", "degradations": ["LABELS_ELIDED"]}))
    pm("P14", lambda b: b["capabilities"].__setitem__("labels", {"status": "degraded", "degradations": ["EDGE_LABELS_OMITTED"]}))
    pm("P15", lambda b: b["capabilities"].__setitem__("labels", {"status": "unsupported", "reason": "HOST_LACKS"}), "dom")
    pm("P16", lambda b: b.__setitem__("igr", "IGR/2"))
    pm("P17", lambda b: b["capacity"].__setitem__("maxNodes", 0))
    pm("P18", lambda b: b["capabilities"].__setitem__("x-Bad", {"status": "supported"}))
    pm("P19", lambda b: b["renderer"].__setitem__("name", "Bad Name"))
    pm("P20", lambda b: b["capabilities"].__setitem__("labels.edge", {"status": "unsupported", "reason": "RESERVED"}))
    pm("P27", lambda b: b["capabilities"].__setitem__("labels", {"status": "degraded", "degradations": ["LABELS_ELIDED", "LABELS_ELIDED"]}), "headless")
    pm("P22", lambda b: b["capabilities"].__setitem__("indicators.non-color", {"status": "degraded", "degradations": ["LABELS_ELIDED"]}), "headless")
    pm("P23", lambda b: b["capabilities"].__setitem__("labels.edge", {"status": "unsupported", "reason": "HOST_LACKS"}), "headless")
    pm("P24", lambda b: b["capacity"].__setitem__("maxNodes", "5"))
    pm("P25", lambda b: b["capabilities"].__setitem__("x-thing", {"status": "unsupported", "reason": "RESERVED"}))
    b26 = base_manifest("headless")
    b26["capabilities"]["x-thing"] = {"status": "unsupported", "reason": "HOST_LACKS"}
    PM["P26"] = (b26, "")
    pm("P21", lambda b: b["capacity"].__setitem__("maxNodes", 1.5))          # fractional maxNodes (split from P17 in rev 3)
    PERR = {}
    for pid in sorted(PM):
        man, tag = PM[pid]
        try:
            igr.verify_manifest(copy.deepcopy(man))
            got = ""
        except IgrError as e:
            got = e.tag()
        PERR[pid] = got
        p = f"manifests/{pid}.manifest.json"
        put(p, jdump(man))
        row(pid, "P", "core", "", "", p, "", got)
    want = dict(P01="", P02="", P03="", P04="", P05="INVALID_MANIFEST/MISSING_CAPABILITY", P06="INVALID_MANIFEST/UNKNOWN_CAPABILITY", P07="INVALID_MANIFEST/MANDATORY_UNSUPPORTED",
                P08="INVALID_MANIFEST/MANDATORY_DEGRADED", P09="INVALID_MANIFEST/RESERVED_CAPABILITY", P10="INVALID_MANIFEST/RESERVED_CAPABILITY", P11="INVALID_MANIFEST/RESERVED_CAPABILITY",
                P12="INVALID_MANIFEST/UNKNOWN_DEGRADATION", P13="INVALID_MANIFEST/DEGRADATION_NOT_ALLOWED", P14="INVALID_MANIFEST/DEGRADATION_NOT_ALLOWED",
                P15="INVALID_MANIFEST/HOST_LACKS_NOT_ALLOWED", P16="INVALID_MANIFEST/UNSUPPORTED_VERSION", P17="INVALID_MANIFEST/INVALID_LIMITS", P18="INVALID_MANIFEST/UNKNOWN_CAPABILITY",
                P19="INVALID_MANIFEST/INVALID_NAME", P20="INVALID_MANIFEST/RESERVED_CAPABILITY", P21="INVALID_MANIFEST/INVALID_LIMITS",
                P22="INVALID_MANIFEST/MANDATORY_DEGRADED", P23="INVALID_MANIFEST/HOST_LACKS_NOT_ALLOWED", P24="INVALID_MANIFEST/SCHEMA", P25="INVALID_MANIFEST/RESERVED_CAPABILITY", P26="", P27="INVALID_MANIFEST/SCHEMA")
    assert PERR == want, {k: (PERR[k], want[k]) for k in want if PERR[k] != want[k]}

    # =============================================================================================
    # L  lifecycle
    # =============================================================================================
    from lifecycle import run_lifecycle
    LCTX = dict(put=put, read=read, load=load, M=M, M29=(M29S, M29L), paths=paths, jdump=jdump, row=row, state_rel=None)

    def lrow(lid, models, env, listener, calls, extras=None, model_override=None):
        script = run_lifecycle(lid, models, env, listener, calls, LCTX, extras or {})
        sp = f"lifecycle/{lid}.script.json"
        put(sp, jdump(script))
        row(lid, "L", "subject", models[0], models[1], sp, "", "")

    ENV = lambda w=900, h=600: {"host": "headless", "size": {"height": h, "width": w}, "reducedMotion": False}
    c = lambda op, arg=None, aw=True: dict(op=op, arg=arg, aw=aw)
    F1 = M["F01"]
    lrow("L01", F1, ENV(), "record", [c("initialize"), c("loadScene"), c("render"), c("dispatch", sel("replace", n_(m1, 0))), c("getState"),
                                      c("hitTest", {"x": 32.0, "y": 193.5}), c("probe"), c("dispatch", {"type": "resize", "width": 640, "height": 480}), c("getState"),
                                      c("export", "scene"), c("setReducedMotion", True), c("probe"), c("dispose")])
    lrow("L02", F1, ENV(), "record", [c("dispatch", sel("replace", n_(m1, 0))), c("getState"), c("hitTest", {"x": 1, "y": 1}), c("probe"), c("render"), c("export", "scene"),
                                      c("loadScene")])
    lrow("L03", F1, ENV(), "record", [c("initialize"), c("render"), c("dispatch", fstep(1)), c("getState"), c("hitTest", {"x": 1, "y": 1}), c("probe"), c("export", "scene"),
                                      c("loadScene"), c("getState")])
    lrow("L04", F1, ENV(), "record", [c("initialize"), c("initialize"), c("loadScene"), c("initialize"), c("getState")])
    lrow("L05", F1, ENV(), "record", [c("initialize"), c("dispose"), c("dispose"), c("dispose")])
    lrow("L06", F1, ENV(), "record", [c("initialize"), c("loadScene"), c("dispose"), c("dispatch", fstep(1)), c("getState"), c("hitTest", {"x": 1, "y": 1}), c("probe"), c("render"),
                                      c("export", "scene"), c("loadScene"), c("initialize"), c("setReducedMotion", True), c("applySceneDelta", {}), c("dispose")])
    lrow("L07", F1, ENV(), "record", [c("initialize"), c("loadScene"), c("dispatch", sel("replace", n_(m1, 0))), c("getState"), c("dispatch", {"type": "resize", "width": 640, "height": 480}),
                                      c("loadScene", {"model": {"scene": M["F02"][0], "layout": M["F02"][1]}}), c("getState"), c("dispatch", fstep(1)), c("getState"),
                                      c("loadScene", {"model": {"scene": M["F01"][0], "layout": M["F01"][1]}}), c("getState")])
    lrow("L08", F1, ENV(), "record", [c("initialize"), c("loadScene", {"initial": paths["S11"][0]}), c("getState"), c("loadScene"), c("dispatch", sel("replace", n_(m1, 0))),
                                      c("getState"), c("loadScene", {"initial": paths["S11"][0]}), c("getState"), c("dispatch", fstep(1)), c("loadScene", {"plain_object_model": True}), c("getState")])
    lrow("L09", F1, ENV(), "record", [c("initialize"), c("loadScene", {"plain_object_model": True}), c("getState"), c("loadScene"), c("getState"),
                                      c("loadScene", {"plain_object_model": True}), c("getState")])
    lrow("L10", F1, ENV(), "record", [c("initialize"), c("loadScene", {"initial": paths["S11"][0]}), c("loadScene", {"initial": paths["S02"][0]}), c("getState")])
    lrow("L11", F1, ENV(), "record", [c("initialize"), c("applySceneDelta", {}), c("loadScene"), c("applySceneDelta", {}), c("applySceneDelta", {"type": "anything", "x": [1, 2]}),
                                      c("applySceneDelta", None), c("getState")])
    lrow("L12", F1, ENV(), "record", [c("applySceneDelta", {}), c("applySceneDelta", None), c("initialize"), c("applySceneDelta", {})])
    lrow("L13", F1, ENV(), "record", [c("initialize"), c("loadScene"), c("dispose"), c("applySceneDelta", {}), c("applySceneDelta", None)])
    lrow("L14", F1, ENV(), "record", [c("initialize"), c("loadScene"), c("getState"), c("export", "@first-undeclared-export-format"), c("getState")])
    lrow("L15", F1, ENV(), "record", [c("initialize"), c("loadScene"), c("getState"), c("export", "gif"), c("export", "SCENE"), c("export", ""), c("export", 5), c("getState")])
    lrow("L16", F1, ENV(), "record", [c("initialize"), c("loadScene"), c("dispatch", sel("replace", n_(m1, 0), e_(m1, 0))), c("getState"), c("export", "scene"), c("getState")])
    lrow("L17", F1, ENV(), "record", [c("initialize"), c("loadScene"), c("getState"), c("dispatch", {"type": "resize", "width": 0, "height": 600}),
                                      c("dispatch", {"type": "resize", "width": 900, "height": 16385}), c("dispatch", {"type": "resize", "width": 100.5, "height": 600}),
                                      c("dispatch", {"type": "resize", "width": 640}), c("getState"), c("dispatch", {"type": "resize", "width": 640, "height": 480}), c("getState")])
    lrow("L18", F1, ENV(), "record", [c("initialize", None, False), c("loadScene", None, False), c("initialize", None, False), c("render", None, False), c("export", "scene", False),
                                      c("dispose", None, True)], {"settle_order": True})
    lrow("L19", F1, ENV(), "record", [c("initialize", None, False), c("dispatch", fstep(1)), c("getState"), c("hitTest", {"x": 1, "y": 1}), c("probe"), c("applySceneDelta", {}), c("setReducedMotion", True),
                                      c("loadScene", None, False), c("dispatch", fstep(1)), c("probe"), c("setReducedMotion", False), c("render", None, True), c("getState"),
                                      c("dispatch", fstep(1)), c("export", "scene", False), c("getState"), c("dispose", None, True), c("getState")])
    lrow("L20", F1, ENV(), "dispatch-inside", [c("initialize"), c("loadScene"), c("dispatch", sel("replace", n_(m1, 0))), c("getState"),
                                               c("dispatch", hide(True, n_(m1, 0))), c("getState")])
    L21_CALLS = [c("initialize"), c("loadScene"), c("dispatch", sel("replace", n_(m1, 0), n_(m1, 1), e_(m1, 0))), c("getState"),
                 c("dispatch", {"type": "focus", "target": e_(m1, 0)}), c("dispatch", hide(True, n_(m1, 1))), c("getState"), c("dispatch", fstep(1)), c("getState")]
    lrow("L21", F1, ENV(), "throw", L21_CALLS)
    lrow("L21b", F1, ENV(), "record", L21_CALLS)
    lrow("L22", F1, ENV(), "record", [c("initialize"), c("loadScene", {"over_capacity": "nodes"}), c("getState"), c("loadScene", {"over_capacity": "edges"}), c("getState"), c("loadScene"), c("getState")])
    lrow("L23", F1, ENV(), "record", [c("initialize"), c("setReducedMotion", True), c("loadScene"), c("probe"), c("setReducedMotion", False), c("setReducedMotion", True), c("probe"),
                                      c("dispatch", {"type": "pan", "dx": 3, "dy": 3}), c("probe"), c("dispose"), c("setReducedMotion", True)])
    lrow("L24", F1, dict(ENV(), size={"height": 600, "width": 0}), "record", [c("initialize")])
    lrow("L24b", F1, dict(ENV(), size={"height": 16385, "width": 900}), "record", [c("initialize"), c("getState")])
    lrow("L24d", F1, ENV(), "record", [c("initialize", {"size": {"width": 0, "height": 600}}), c("initialize"), c("loadScene"), c("getState")])
    lrow("L25", F1, ENV(), "record", [c("dispose", None, False), c("applySceneDelta", {})], {"settle_order": True})
    nan = float("nan")
    lrow("L27", F1, ENV(), "record", [c("initialize", {"limits": {"maxNodes": 5.5}}), c("initialize", {"limits": {"maxNodes": "5"}}), c("initialize", {"limits": {"maxNodes": -1}}),
                                      c("initialize", {"limits": {"maxNodez": 5}}), c("initialize", {"limits": {"maxNodes": nan}}),
                                      c("initialize", {"limits": {"maxNodes": 9007199254740992}}), c("initialize", {"limits": {"maxNodes": 0}})])
    lrow("L26", F1, ENV(), "record", [c("initialize"), c("loadScene", {"at_capacity": "nodes"}), c("loadScene", {"at_capacity": "edges"})])
    lrow("L24c", F1, dict(ENV(), size={"height": 600, "width": 16384}), "record", [c("initialize"), c("loadScene"), c("getState")])

    # =============================================================================================
    # C  comparison
    # =============================================================================================
    def mk_reports(cid, entries, extra_model=None):
        """entries: [(name, report, extra)] -> compare files"""
        mdl = {"scene": O1S, "layout": GL("F01")}
        doc = {"model": mdl, "reports": [dict(renderer=n, report=r, **ex) for n, r, ex in entries]}
        put(f"compare/{cid}.reports.json", jdump(doc))
        res = igr.compare_projections(m1, [(n, r) for n, r, _ in entries])
        put(f"compare/{cid}.compare.json", cjb(res))
        row(cid, "C", "core", O1S, GL("F01"), f"compare/{cid}.reports.json", f"compare/{cid}.compare.json", "")
        return res
    s0 = igr.initial_state(m1, 900, 600)
    r0 = igr.build_report(m1, s0)
    res = mk_reports("C01", [("a", r0, {}), ("b", copy.deepcopy(r0), {})])
    assert res == {"agree": True, "differences": []}
    r_fid = igr.build_report(m1, s0, reduced_motion=True, edge_labels=False)
    res = mk_reports("C02", [("a", r0, {}), ("b", r_fid, {})])
    assert res == {"agree": True, "differences": []}
    s_focus, _ = igr.reduce(m1, s0, {"type": "focus", "target": n_(m1, 0)})
    res = mk_reports("C03", [("a", r0, {}), ("b", igr.build_report(m1, s_focus), {})])
    assert {"path": "state.focus", "renderers": ["b"]} in res["differences"] and not res["agree"]
    s_hid, _ = igr.reduce(m1, s0, hide(True, n_(m1, 1)))
    res = mk_reports("C04", [("a", r0, {}), ("b", igr.build_report(m1, s_hid), {})])
    assert any(d["path"] == "drawn.nodes" for d in res["differences"])
    r5 = copy.deepcopy(r0)
    r5["accessible"]["items"][1]["name"] = "person ann\u00a0"
    res = mk_reports("C05", [("a", r0, {}), ("b", r5, {})])
    assert res["differences"] == [{"path": "accessible.items[1].name", "renderers": ["b"]}]
    r6 = copy.deepcopy(r0)
    other = "0" * 64
    r6["scene_sha256"] = other
    r6["state"] = dict(r6["state"], scene_sha256=other)
    res = mk_reports("C06", [("a", r0, {}), ("b", r6, {})])
    assert res == {"comparable": False}
    res = mk_reports("C07", [("dom-r", r0, {"manifest": base_manifest("dom")}), ("headless-r", copy.deepcopy(r0), {"manifest": PM["P01"][0]})])
    assert res == {"agree": True, "differences": []}
    rc = igr.build_report(m1, s_focus)
    res = mk_reports("C08", [("a", r0, {}), ("b", copy.deepcopy(r0), {}), ("c", rc, {})])
    assert all(d["renderers"] == ["c"] for d in res["differences"]) and res["differences"]

    def err_report(cid, report, want):
        doc = {"model": {"scene": O1S, "layout": GL("F01")}, "reports": [{"renderer": "a", "report": report}, {"renderer": "b", "report": copy.deepcopy(r0)}]}
        put(f"compare/{cid}.reports.json", jdump(doc))
        try:
            igr.compare_projections(m1, [("a", report), ("b", r0)])
            raise AssertionError((cid, "no error"))
        except IgrError as e:
            assert e.tag() == want, (cid, e.tag(), want)
        row(cid, "C", "core", O1S, GL("F01"), f"compare/{cid}.reports.json", "", want)
    c9 = copy.deepcopy(r0)
    c9["drawn"]["nodes"] = c9["drawn"]["nodes"][:-1]
    err_report("C09", c9, "INVALID_REPORT/INCONSISTENT")
    c10 = copy.deepcopy(r0)
    c10["marked"]["selected"]["nodes"] = [{"id": "i:99", "type": "person"}]
    err_report("C10", c10, "INVALID_REPORT/UNRESOLVED_ELEMENT")
    c11 = copy.deepcopy(r0)
    del c11["accessible"]
    err_report("C11", c11, "INVALID_REPORT/SCHEMA")
    c12 = copy.deepcopy(r0)
    c12["igr"] = "IGR/2"
    err_report("C12", c12, "INVALID_REPORT/UNSUPPORTED_VERSION")
    s13 = igr.mk_state(m1, {("n", 0), ("n", 1)}, set(), None, s0["viewport"])
    s13["selection"]["nodes"] = s13["selection"]["nodes"][::-1]
    c13 = igr.build_report(m1, igr.mk_state(m1, {("n", 0), ("n", 1)}, set(), None, s0["viewport"]))
    c13["state"] = s13
    c13["marked"]["selected"]["nodes"] = c13["marked"]["selected"]["nodes"][::-1]
    err_report("C13", c13, "INVALID_REPORT/NON_CANONICAL")

    def err_entries(cid, entries, want, extra=None):
        doc = {"model": {"scene": O1S, "layout": GL("F01")}, "reports": [{"renderer": n, "report": r} for n, r in entries]}
        if extra:
            doc.update(extra)
        put(f"compare/{cid}.reports.json", jdump(doc))
        try:
            if extra and extra.get("op") == "serializeProjection":
                igr.serialize_projection(m1, entries[0][1])
            else:
                igr.compare_projections(m1, entries)
            raise AssertionError((cid, "no error"))
        except IgrError as e:
            assert e.tag() == want, (cid, e.tag(), want)
        row(cid, "C", "core", O1S, GL("F01"), f"compare/{cid}.reports.json", "", want)
    other_h = "0" * 64
    def rehash(rep_):
        r = copy.deepcopy(rep_)
        r["scene_sha256"] = other_h
        r["state"] = dict(r["state"], scene_sha256=other_h)
        return r
    err_entries("C14", [("a", r0), ("b", rehash(r0)), ("c", c9)], "INVALID_REPORT/INCONSISTENT")
    c15 = rehash(r0)
    c15["drawn"]["nodes"] = c15["drawn"]["nodes"] + [{"id": "i:99", "type": "person"}]
    err_entries("C15", [("a", r0), ("b", c15)], "INVALID_REPORT/UNRESOLVED_ELEMENT")
    c16 = copy.deepcopy(r0)
    c16["state"] = dict(c16["state"], scene_sha256="1" * 64)
    res = mk_reports("C16", [("a", r0, {}), ("b", c16, {})])
    assert res == {"agree": False, "differences": [{"path": "state.scene_sha256", "renderers": ["b"]}]}, res
    c17 = copy.deepcopy(r0)
    c17["drawn"]["nodes"] = c17["drawn"]["nodes"][::-1]
    res = mk_reports("C17", [("a", r0, {}), ("b", c17, {})])
    assert res == {"agree": False, "differences": [{"path": "drawn.nodes[0].id", "renderers": ["b"]}, {"path": "drawn.nodes[1].id", "renderers": ["b"]}]}, res
    c18 = igr.projection(r0)
    c18["scene_sha256"] = other_h
    err_entries("C18", [("a", c18)], "INVALID_REPORT/INCONSISTENT", {"op": "serializeProjection"})
    s19 = igr.mk_state(m1, {("n", 0)}, {("n", 0)}, None, s0["viewport"])
    c19 = igr.build_report(m1, s19)
    err_entries("C19", [("a", c19)], "INVALID_REPORT/NON_CANONICAL")
    reps20 = []
    for nm, z in (("a", 1000), ("b", 1994), ("c", 1994), ("d", 3000), ("e", 3000)):
        vp = dict(s0["viewport"], zoom=z)
        reps20.append((nm, igr.build_report(m1, igr.mk_state(m1, set(), set(), None, vp)), {}))
    res = mk_reports("C20", reps20)
    assert res == {"agree": False, "differences": [{"path": "state.viewport.zoom", "renderers": ["a", "d", "e"]}]}, res
    c21 = copy.deepcopy(r0)
    c21["state"] = dict(c21["state"], viewport=dict(c21["state"]["viewport"], zoom=0))
    err_entries("C21", [("a", c21)], "INVALID_REPORT/SCHEMA")

    # =============================================================================================
    # D, K rows (no oracle bytes)
    # =============================================================================================
    for k in range(1, 6):
        row(f"D{k:02d}", "D", "subject")
    for k in range(1, 83):
        row(f"K{k:02d}", "K", "")

    # =============================================================================================
    # EXPECT.tsv
    # =============================================================================================
    def key(r):
        return ("MSRHAPLDKC".index(r["id"][0]), r["id"])
    order = {}
    ids = [r["id"] for r in ROWS]
    assert len(ids) == len(set(ids))
    ROWS.sort(key=lambda r: ("MSRHAPLDKC".index(r["id"][0]), int("".join(ch for ch in r["id"][1:] if ch.isdigit())), r["id"]))
    header = "id\tgroup\ttier\tscene\tlayout\tinput\texpected\terror\n"
    put("EXPECT.tsv", header + "".join("\t".join([r["id"], r["group"], r["tier"], r["scene"], r["layout"], r["input"], r["expected"], r["error"]]) + "\n" for r in ROWS))
    from collections import Counter
    cnt = Counter(r["group"] for r in ROWS)
    print("rows:", len(ROWS), dict(sorted(cnt.items())))


if __name__ == "__main__":
    main()
