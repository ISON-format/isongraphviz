"""Core helpers of the display-list oracle: arithmetic, canonical JSON, IGS/IGL
models, semantic state, a reducer subset, the frozen hit test.

Standard library only.  Everything is written from the design texts (27, 30, 31)
and the frozen specifications IGS-1 and IGL-1; nothing is imported from another
corpus.  `MUT` holds the names of the mutants that are switched on (see M()).
"""
import hashlib
import json
import math
import os
import re

MUT = set()


def M(name):
    return name in MUT


S = 1_000_000
ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT = 10, 100000, 1000
VIEWPORT_MAX = 16384
FIT_PADDING = 32
SAFE = (1 << 53) - 1


class Model(dict):
    """the branded render model (a plain dict copy is not a model)"""


class IgrError(Exception):
    def __init__(self, code, reason="", path=None, detail=None):
        self.code, self.reason, self.path, self.detail = code, reason, path, detail
        super().__init__(self.tag())

    def tag(self):
        return self.code + "/" + (self.reason or "")


# ----------------------------------------------------------------- arithmetic
def floor_div(a, b):
    return a // b


def div_round(a, b):
    return (2 * a + b) // (2 * b)


isqrt = math.isqrt


def quantize_px(s):
    """quantizePx(s): floor(s) + (1 if s - floor(s) >= 0.5) on a binary64 value."""
    f = math.floor(s)
    return int(f) + (1 if (s - f) >= 0.5 else 0)


def q_milli(p):
    """q(p): one binary64 multiplication by 1000, then quantizePx."""
    return quantize_px(p * 1000)


# --------------------------------------------------------- canonical JSON text
def _utf16key(k):
    return k.encode("utf-16-be", "surrogatepass")


_ESC = {0x22: '\\"', 0x5C: "\\\\", 0x08: "\\b", 0x09: "\\t", 0x0A: "\\n", 0x0C: "\\f", 0x0D: "\\r"}


def cj_str(s):
    out = ['"']
    for ch in s:
        o = ord(ch)
        if 0xD800 <= o <= 0xDFFF:
            raise IgrError("INVALID_INPUT", "SCHEMA", detail="lone surrogate")
        if o in _ESC:
            out.append(_ESC[o])
        elif o < 0x20:
            out.append("\\u%04x" % o)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def cj(v):
    """IGS-CJ/1 with signed integers: no whitespace, UTF-16 key order, no floats."""
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return cj_str(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(cj(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(cj_str(k) + ":" + cj(v[k]) for k in sorted(v, key=_utf16key)) + "}"
    raise TypeError("cj: unsupported %r" % (type(v),))


def cjb(v):
    return cj(v).encode("utf-8")


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def len16(s):
    return sum(2 if ord(c) > 0xFFFF else 1 for c in s)


# ------------------------------------------------------------------ file utils
def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def read_json(path):
    return json.loads(read_bytes(path).decode("utf-8"))


# ------------------------------------------------------------ scene / layout
ID_TAG = re.compile(r"^(i:(0|-?[1-9][0-9]*)|s:.*)$", re.S)


def node_sort_key(ref):
    """IGS/1 5.5: type bytes; then id: INT64 before STRING, INT64 numeric, STRING by UTF-8 bytes."""
    t = ref["type"].encode("utf-8")
    i = ref["id"]
    if i.startswith("i:"):
        return (t, 0, int(i[2:]), b"")
    return (t, 1, 0, i[2:].encode("utf-8"))


def edge_sort_key(ref):
    return (node_sort_key(ref["src"]), ref["rel"].encode("utf-8"), node_sort_key(ref["tgt"]),
            ref["ord"].encode("utf-8"))


def id_text(i):
    return i[2:]


def make_scene(directed, nodes, edges, artifact_hex):
    """nodes: list of (id, type); edges: list of (src(id,type), rel, tgt(id,type)).
    Returns canonical scene bytes (sorted, canonical endpoints for undirected)."""
    nrefs = [{"id": i, "type": t} for (i, t) in nodes]
    nrefs.sort(key=node_sort_key)
    erefs = []
    for (s, rel, t) in edges:
        a, b = {"id": s[0], "type": s[1]}, {"id": t[0], "type": t[1]}
        if not directed and node_sort_key(a) > node_sort_key(b):
            a, b = b, a
        erefs.append({"ord": "0", "rel": rel, "src": a, "tgt": b})
    erefs.sort(key=edge_sort_key)
    scene = {
        "address_scheme": "igs-addr/1",
        "edges": [{"label": e["rel"], "ref": e} for e in erefs],
        "graph": {"directed": bool(directed), "profile": "simple"},
        "igs": "IGS/1",
        "nodes": [{"category": r["type"], "label": id_text(r["id"]), "ref": r} for r in nrefs],
        "source": {"artifact_sha256": artifact_hex, "serialization_profile": "ison-v1"},
    }
    return cjb(scene)


def make_layout(scene_bytes, pos):
    """pos: dict id -> (x, y) in thousandths, keyed by node id string 'i:..'/'s:..' (ids are unique
    across types in the authored scenes).  Fixed layout, scene order."""
    sc = json.loads(scene_bytes.decode("utf-8"))
    nodes = []
    for n in sc["nodes"]:
        x, y = pos[n["ref"]["id"]]
        nodes.append({"ref": n["ref"], "x": x, "y": y})
    lay = {"address_scheme": "igs-addr/1", "igl": "IGL/1", "nodes": nodes,
           "policy": {"algorithm": "igl-fixed/1", "config": {}, "family": "FIXED"},
           "scale": 1000, "scene_sha256": sha256(scene_bytes)}
    return cjb(lay)


def verify_scene_lite(b):
    sc = json.loads(b.decode("utf-8"))
    assert cjb(sc) == b, "scene not canonical"
    ns = [n["ref"] for n in sc["nodes"]]
    assert ns == sorted(ns, key=node_sort_key), "nodes not in 5.5 order"
    assert len({cj(r) for r in ns}) == len(ns), "duplicate node"
    es = [e["ref"] for e in sc["edges"]]
    assert es == sorted(es, key=edge_sort_key), "edges not in 5.5 order"
    assert len({cj(r) for r in es}) == len(es), "duplicate edge"
    nset = {cj(r) for r in ns}
    for e in sc["edges"]:
        r = e["ref"]
        assert cj(r["src"]) in nset and cj(r["tgt"]) in nset, "dangling"
        assert r["ord"] == "0" and e["label"] == r["rel"]
        if not sc["graph"]["directed"]:
            assert node_sort_key(r["src"]) <= node_sort_key(r["tgt"]), "undirected endpoint order"
    for n in sc["nodes"]:
        assert n["category"] == n["ref"]["type"] and n["label"] == id_text(n["ref"]["id"])
        assert ID_TAG.match(n["ref"]["id"]), "bad id"
    return sc


def verify_layout_lite(lb, sb):
    lay = json.loads(lb.decode("utf-8"))
    assert cjb(lay) == lb, "layout not canonical"
    assert lay["scene_sha256"] == sha256(sb), "layout not bound"
    sc = json.loads(sb.decode("utf-8"))
    assert [n["ref"] for n in lay["nodes"]] == [n["ref"] for n in sc["nodes"]], "layout order"
    for n in lay["nodes"]:
        assert isinstance(n["x"], int) and isinstance(n["y"], int)
        assert abs(n["x"]) <= SAFE and abs(n["y"]) <= SAFE
    return lay


def build_model(scene_bytes, layout_bytes):
    sc = json.loads(scene_bytes.decode("utf-8"))
    lay = json.loads(layout_bytes.decode("utf-8"))
    if lay["scene_sha256"] != sha256(scene_bytes):
        raise IgrError("LAYOUT", "SCENE_MISMATCH")
    nodes = []
    idx = {}
    for i, n in enumerate(sc["nodes"]):
        ln = lay["nodes"][i]
        assert ln["ref"] == n["ref"]
        nodes.append({"index": i, "ref": n["ref"], "category": n["category"], "label": n["label"],
                      "x": ln["x"], "y": ln["y"], "degree": 0})
        idx[(n["ref"]["type"], n["ref"]["id"])] = i
    edges = []
    eidx = {}
    for j, e in enumerate(sc["edges"]):
        r = e["ref"]
        s = idx[(r["src"]["type"], r["src"]["id"])]
        t = idx[(r["tgt"]["type"], r["tgt"]["id"])]
        edges.append({"index": j, "ref": r, "label": e["label"], "src": s, "tgt": t})
        eidx[(r["ord"], r["rel"], r["src"]["type"], r["src"]["id"], r["tgt"]["type"], r["tgt"]["id"])] = j
        nodes[s]["degree"] += 1
        if t != s:
            nodes[t]["degree"] += 1
    cats = sorted({n["category"] for n in nodes}, key=lambda s: s.encode("utf-8"))
    return Model({"igr_model": "igr-model/1", "artifact": sc["source"]["artifact_sha256"],
            "scene": sha256(scene_bytes), "layout": sha256(layout_bytes),
            "directed": sc["graph"]["directed"], "nodes": nodes, "edges": edges, "categories": cats,
            "node_idx": idx, "edge_idx": eidx, "scene_bytes": scene_bytes})


def load_model(scene_path, layout_path):
    return build_model(read_bytes(scene_path), read_bytes(layout_path))


def node_key(a):
    return (a["type"], a["id"])


def edge_key(a):
    return (a["ord"], a["rel"], a["src"]["type"], a["src"]["id"], a["tgt"]["type"], a["tgt"]["id"])


# --------------------------------------------------------------------- state
def empty_state(model, viewport):
    return {"hidden": {"edges": [], "nodes": []}, "igr": "IGR/1", "layout_sha256": model["layout"],
            "scene_sha256": model["scene"], "selection": {"edges": [], "nodes": []}, "viewport": viewport}


def fit_viewport(model, w, h, hidden_nodes=(), padding=None):
    p = min(FIT_PADDING, floor_div(min(w, h) - 1, 2)) if padding is None else padding
    vis = [n for n in model["nodes"] if n["index"] not in hidden_nodes]
    if not vis:
        return {"center_x": 0, "center_y": 0, "height": h, "width": w, "zoom": ZOOM_DEFAULT}
    minx = min(n["x"] for n in vis)
    maxx = max(n["x"] for n in vis)
    miny = min(n["y"] for n in vis)
    maxy = max(n["y"] for n in vis)
    cx = div_round(minx + maxx, 2)
    cy = div_round(miny + maxy, 2)
    ax, ay = w - 2 * p, h - 2 * p
    sx, sy = maxx - minx, maxy - miny
    cands = []
    if sx > 0:
        cands.append(floor_div(ax * S, sx))
    if sy > 0:
        cands.append(floor_div(ay * S, sy))
    z = min(cands) if cands else ZOOM_DEFAULT
    z = max(ZOOM_MIN, min(ZOOM_MAX, z))
    return {"center_x": cx, "center_y": cy, "height": h, "width": w, "zoom": z}


def initial_state(model, w, h):
    if not (1 <= w <= VIEWPORT_MAX and 1 <= h <= VIEWPORT_MAX):
        raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
    return empty_state(model, fit_viewport(model, w, h))


def eff_hidden(model, state):
    hn = {model["node_idx"][node_key(a)] for a in state["hidden"]["nodes"]}
    he = {model["edge_idx"][edge_key(a)] for a in state["hidden"]["edges"]}
    for e in model["edges"]:
        if e["src"] in hn or e["tgt"] in hn:
            he.add(e["index"])
    return hn, he


def state_sets(model, state):
    """selection / focus as index sets"""
    sn = {model["node_idx"][node_key(a)] for a in state["selection"]["nodes"]}
    se = {model["edge_idx"][edge_key(a)] for a in state["selection"]["edges"]}
    foc = state.get("focus")
    fn = fe = None
    if foc is not None:
        if "node" in foc:
            fn = model["node_idx"][node_key(foc["node"])]
        else:
            fe = model["edge_idx"][edge_key(foc["edge"])]
    return sn, se, fn, fe


def validate_state(model, state):
    """serializeState subset: binding (step 2), integrity (3), ordering (4), consistency (5)."""
    if state["scene_sha256"] != model["scene"]:
        raise IgrError("INVALID_STATE", "SCENE_MISMATCH")
    if state["layout_sha256"] != model["layout"]:
        raise IgrError("INVALID_STATE", "LAYOUT_MISMATCH")
    foc = state.get("focus")
    seq = []
    if foc is not None:
        seq.append(("f", foc))
    for nm, arr in (("hidden.edges", state["hidden"]["edges"]), ("hidden.nodes", state["hidden"]["nodes"]),
                    ("selection.edges", state["selection"]["edges"]), ("selection.nodes", state["selection"]["nodes"])):
        seq.append((nm, arr))

    def res_node(a):
        return model["node_idx"].get(node_key(a))

    def res_edge(a):
        return model["edge_idx"].get(edge_key(a))
    lists = {}
    if foc is not None:
        k = res_node(foc["node"]) if "node" in foc else res_edge(foc["edge"])
        if k is None:
            raise IgrError("INVALID_STATE", "UNRESOLVED_ELEMENT")
    for nm, arr in seq[1 if foc is not None else 0:]:
        ids = []
        for a in arr:
            k = res_edge(a) if nm.endswith("edges") else res_node(a)
            if k is None:
                raise IgrError("INVALID_STATE", "UNRESOLVED_ELEMENT")
            ids.append(k)
        lists[nm] = ids
    for nm, ids in lists.items():
        if len(set(ids)) != len(ids):
            raise IgrError("INVALID_STATE", "DUPLICATE_ELEMENT")
    for nm, ids in lists.items():
        if any(ids[i] >= ids[i + 1] for i in range(len(ids) - 1)):
            raise IgrError("INVALID_STATE", "NON_CANONICAL")
    hn, he = eff_hidden(model, state)
    for e in lists["selection.edges"]:
        if e in he:
            raise IgrError("INVALID_STATE", "SELECTED_HIDDEN")
    for n in lists["selection.nodes"]:
        if n in hn:
            raise IgrError("INVALID_STATE", "SELECTED_HIDDEN")
    if foc is not None:
        if "node" in foc and res_node(foc["node"]) in hn:
            raise IgrError("INVALID_STATE", "FOCUS_HIDDEN")
        if "edge" in foc and res_edge(foc["edge"]) in he:
            raise IgrError("INVALID_STATE", "FOCUS_HIDDEN")
    return True


def serialize_state(model, state):
    if not M("K68"):
        validate_state(model, state)
    return cjb(state)


# ------------------------------------------------------------------- reducer
def _addr_idx(model, target):
    if not isinstance(target, dict) or len(target) != 1:
        raise IgrError("INVALID_INTENT", "SCHEMA")
    if "node" in target:
        k = model["node_idx"].get(node_key(target["node"]))
        kind = "node"
    elif "edge" in target:
        k = model["edge_idx"].get(edge_key(target["edge"]))
        kind = "edge"
    else:
        raise IgrError("INVALID_INTENT", "SCHEMA")
    if k is None:
        raise IgrError("INVALID_INTENT", "UNRESOLVED_ELEMENT")
    return kind, k


def reduce_intent(model, state, intent):
    """A subset of 27 5.2-5.3 / 6 that the lifecycle scripts need.  Returns the new state."""
    import copy
    st = copy.deepcopy(state)
    t = intent.get("type")
    vp = st["viewport"]
    hn, he = eff_hidden(model, st)
    sn, se, fn, fe = state_sets(model, st)

    def node_ref(i):
        return model["nodes"][i]["ref"]

    def edge_ref(i):
        return model["edges"][i]["ref"]

    def write_sel(sn_, se_):
        st["selection"]["nodes"] = [node_ref(i) for i in sorted(sn_)]
        st["selection"]["edges"] = [edge_ref(i) for i in sorted(se_)]

    def set_focus(kind, k):
        st.pop("focus", None)
        if kind == "node":
            st["focus"] = {"node": node_ref(k)}
        elif kind == "edge":
            st["focus"] = {"edge": edge_ref(k)}

    if t == "select":
        mode = intent["mode"]
        tg = [_addr_idx(model, x) for x in intent["targets"]]
        for kind, k in tg:
            hid = (k in hn) if kind == "node" else (k in he)
            if hid and mode != "remove":
                raise IgrError("INVALID_INTENT", "ELEMENT_HIDDEN")
        tn = {k for kind, k in tg if kind == "node"}
        te = {k for kind, k in tg if kind == "edge"}
        if mode == "replace":
            write_sel(tn, te)
        elif mode == "add":
            write_sel(sn | tn, se | te)
        elif mode == "remove":
            write_sel(sn - tn, se - te)
        elif mode == "toggle":
            write_sel(sn ^ tn, se ^ te)
        else:
            raise IgrError("INVALID_INTENT", "INVALID_VALUE")
    elif t == "clear-selection":
        write_sel(set(), set())
    elif t == "focus":
        if "target" in intent:
            kind, k = _addr_idx(model, intent["target"])
            if ((k in hn) if kind == "node" else (k in he)):
                raise IgrError("INVALID_INTENT", "ELEMENT_HIDDEN")
            set_focus(kind, k)
        else:
            set_focus(None, None)
    elif t in ("focus-step", "focus-first", "focus-last"):
        trav = [("node", n["index"]) for n in model["nodes"] if n["index"] not in hn] + \
               [("edge", e["index"]) for e in model["edges"] if e["index"] not in he]
        if trav:
            cur = ("node", fn) if fn is not None else (("edge", fe) if fe is not None else None)
            if t == "focus-first":
                set_focus(*trav[0])
            elif t == "focus-last":
                set_focus(*trav[-1])
            else:
                d = intent["delta"]
                if cur is None:
                    set_focus(*(trav[0] if d == 1 else trav[-1]))
                else:
                    p = trav.index(cur) + d
                    if 0 <= p < len(trav):
                        set_focus(*trav[p])
    elif t == "set-hidden":
        tg = [_addr_idx(model, x) for x in intent["targets"]]
        hnodes = {model["node_idx"][node_key(a)] for a in st["hidden"]["nodes"]}
        hedges = {model["edge_idx"][edge_key(a)] for a in st["hidden"]["edges"]}
        for kind, k in tg:
            tgt = hnodes if kind == "node" else hedges
            if intent["hidden"]:
                tgt.add(k)
            else:
                tgt.discard(k)
        st["hidden"]["nodes"] = [node_ref(i) for i in sorted(hnodes)]
        st["hidden"]["edges"] = [edge_ref(i) for i in sorted(hedges)]
        hn2, he2 = eff_hidden(model, st)
        write_sel({i for i in sn if i not in hn2}, {i for i in se if i not in he2})
        if fn is not None and fn in hn2:
            set_focus(None, None)
        if fe is not None and fe in he2:
            set_focus(None, None)
    elif t == "pan":
        z = vp["zoom"]
        vp["center_x"] -= div_round(intent["dx"] * S, z)
        vp["center_y"] -= div_round(intent["dy"] * S, z)
    elif t == "zoom":
        z = vp["zoom"]
        z2 = max(ZOOM_MIN, min(ZOOM_MAX, div_round(z * intent["factor_milli"], 1000)))
        if "anchor" in intent:
            u = 2 * intent["anchor"]["x"] - vp["width"]
            v = 2 * intent["anchor"]["y"] - vp["height"]
            vp["center_x"] += div_round(u * S, 2 * z) - div_round(u * S, 2 * z2)
            vp["center_y"] += div_round(v * S, 2 * z) - div_round(v * S, 2 * z2)
        vp["zoom"] = z2
    elif t == "fit":
        nv = fit_viewport(model, vp["width"], vp["height"], hidden_nodes=hn,
                          padding=intent.get("padding"))
        st["viewport"] = nv
    elif t == "set-viewport":
        vp["center_x"], vp["center_y"], vp["zoom"] = intent["center_x"], intent["center_y"], intent["zoom"]
        if not (ZOOM_MIN <= intent["zoom"] <= ZOOM_MAX):
            raise IgrError("INVALID_INTENT", "OUT_OF_RANGE")
    elif t == "resize":
        if not (1 <= intent["width"] <= VIEWPORT_MAX and 1 <= intent["height"] <= VIEWPORT_MAX):
            raise IgrError("INVALID_INTENT", "OUT_OF_RANGE")
        vp["width"], vp["height"] = intent["width"], intent["height"]
    else:
        raise IgrError("INVALID_INTENT", "UNKNOWN_TYPE")
    return st


# ------------------------------------------------------- screen / frozen hitTest
def screen_xy(model, state, node):
    vp = state["viewport"]
    z = vp["zoom"]
    if M("K04"):
        X = (node["x"] + vp["center_x"]) * z + vp["width"] * 500000
        Y = (node["y"] + vp["center_y"]) * z + vp["height"] * 500000
    elif M("K03"):
        X = (node["x"] - vp["center_x"]) * z + (vp["width"] // 2) * 1000000
        Y = (node["y"] - vp["center_y"]) * z + (vp["height"] // 2) * 1000000
    else:
        X = (node["x"] - vp["center_x"]) * z + vp["width"] * 500000
        Y = (node["y"] - vp["center_y"]) * z + vp["height"] * 500000
    return X, Y


def check_point(point):
    if not isinstance(point, dict) or set(point) != {"x", "y"}:
        raise IgrError("INVALID_INPUT", "SCHEMA")
    for k in ("x", "y"):
        v = point[k]
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            raise IgrError("INVALID_INPUT", "NOT_FINITE")
        if abs(v) > (1 << 31):
            raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")


def hit_test(model, state, point):
    """27 7.1: returns None, ('node', index) or ('edge', index)."""
    validate_state(model, state)
    check_point(point)
    vp = state["viewport"]
    Pm = (q_milli(float(point["x"])), q_milli(float(point["y"])))
    P = (Pm[0] * 1000, Pm[1] * 1000)
    if not (0 <= P[0] <= vp["width"] * S and 0 <= P[1] <= vp["height"] * S):
        return None
    hn, he = eff_hidden(model, state)
    scr = {n["index"]: screen_xy(model, state, n) for n in model["nodes"]}
    best = None
    for n in model["nodes"]:
        if n["index"] in hn:
            continue
        X, Y = scr[n["index"]]
        d2 = (X - P[0]) ** 2 + (Y - P[1]) ** 2
        if d2 <= (12 * S) ** 2 and (best is None or d2 < best[0]):
            best = (d2, n["index"])
    if best:
        return ("node", best[1])
    cand = None
    for e in model["edges"]:
        if e["index"] in he:
            continue
        A, B = scr[e["src"]], scr[e["tgt"]]
        if A == B:
            continue
        D = (B[0] - A[0], B[1] - A[1])
        L2 = D[0] ** 2 + D[1] ** 2
        tn = (P[0] - A[0]) * D[0] + (P[1] - A[1]) * D[1]
        if not (0 < tn < L2):
            continue
        cross = (P[0] - A[0]) * D[1] - (P[1] - A[1]) * D[0]
        if cross * cross <= (6 * S) ** 2 * L2:
            # distance^2 = cross^2 / L2 ; compare fractions
            if cand is None or cross * cross * cand[1] < cand[0] * L2:
                cand = (cross * cross, L2, e["index"])
    if cand:
        return ("edge", cand[2])
    return None


def element_address(model, hit):
    if hit is None:
        return None
    kind, i = hit
    return {"node": model["nodes"][i]["ref"]} if kind == "node" else {"edge": model["edges"][i]["ref"]}
