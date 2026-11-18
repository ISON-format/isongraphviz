"""Scenes, layouts, states, model derivation, effective visibility, initialState, reducer (subset).

Everything is re-implemented from the written rules (27 sections 2-6, IGS/1, IGL/1).  Files of the
other (frozen or draft, read-only) corpora are read as DATA and verified against the SHA256SUMS of
their own corpus; files authored here live in the in-memory store AUTH and are written to the corpus.
"""
import json
import os

import ju

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.dirname(HERE)  # fixtures/oracles-gl
FIXTURES = os.path.dirname(CORPUS)  # fixtures

VIEWPORT_MAX = 16384
ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT = 10, 100000, 1000
FIT_PADDING = 32
S = 1_000_000


class Err(Exception):
    """IgrError: code, reason"""

    def __init__(self, code, reason="", detail=""):
        Exception.__init__(self, "%s/%s" % (code, reason))
        self.code = code
        self.reason = reason
        self.detail = detail

    def cr(self):
        return "%s/%s" % (self.code, self.reason)


# ---------------------------------------------------------------- file access

AUTH = {}  # path (relative to the corpus) -> bytes, authored here
_SUMS = {}
VERIFIED = {}  # external path -> sha256


def _sums(corpus):
    if corpus not in _SUMS:
        d = {}
        p = os.path.join(FIXTURES, corpus, "SHA256SUMS")
        with open(p, "rb") as f:
            for ln in f.read().decode("utf-8").splitlines():
                if not ln.strip():
                    continue
                h, rest = ln.split(" ", 1)
                d[rest[1:]] = h
        _SUMS[corpus] = d
    return _SUMS[corpus]


def read(rel):
    """bytes of a corpus-relative path (authored, or ../<corpus>/<path> verified against its SHA256SUMS)"""
    if rel in AUTH:
        return AUTH[rel]
    if rel.startswith("../"):
        corpus, _, path = rel[3:].partition("/")
        with open(os.path.join(FIXTURES, corpus, path), "rb") as f:
            b = f.read()
        want = _sums(corpus).get(path)
        h = ju.sha256_hex(b)
        if want is None or want != h:
            raise RuntimeError("frozen/draft file does not match its corpus SHA256SUMS: %s" % rel)
        VERIFIED[rel] = h
        return b
    raise RuntimeError("unknown path %s" % rel)


def read_json(rel):
    return json.loads(read(rel).decode("utf-8"))


def put(rel, b):
    AUTH[rel] = b
    return rel


# ---------------------------------------------------------------- authored scenes

def decode_id_text(i):
    return i[2:]


def _id_key(i):
    # IGS/1 5.5: INT64 ids before STRING ids, INT64 by value, STRING by UTF-8 bytes
    if i.startswith("i:"):
        return (0, int(i[2:]), b"")
    return (1, 0, i[2:].encode("utf-8"))


def node_order_key(ref):
    return (ref["type"].encode("utf-8"), _id_key(ref["id"]))


def make_scene(name, directed, nodes, edges):
    """nodes: [(type, id)], edges: [(src_ref_tuple, rel, tgt_ref_tuple)] with ref tuples (type,id).
    Returns canonical scene bytes (no trailing LF)."""
    nrefs = sorted([{"id": i, "type": t} for t, i in nodes], key=node_order_key)
    keyof = {(r["type"], r["id"]): k for k, r in enumerate(nrefs)}
    es = []
    for (st, si), rel, (tt, ti) in edges:
        a, b = (st, si), (tt, ti)
        if not directed and node_order_key({"type": tt, "id": ti}) < node_order_key({"type": st, "id": si}):
            a, b = b, a
        es.append({"ord": "0", "rel": rel, "src": {"id": a[1], "type": a[0]}, "tgt": {"id": b[1], "type": b[0]}})

    def ekey(e):
        return (keyof[(e["src"]["type"], e["src"]["id"])], e["rel"].encode("utf-8"), keyof[(e["tgt"]["type"], e["tgt"]["id"])], e["ord"].encode())

    es.sort(key=ekey)
    scene = {
        "address_scheme": "igs-addr/1",
        "edges": [{"label": e["rel"], "ref": e} for e in es],
        "graph": {"directed": bool(directed), "profile": "simple"},
        "igs": "IGS/1",
        "nodes": [{"category": r["type"], "label": decode_id_text(r["id"]), "ref": r} for r in nrefs],
        "source": {
            "artifact_sha256": ju.sha256_hex(("oracles-gl authored source: " + name).encode("utf-8")),
            "serialization_profile": "ison-v1",
        },
    }
    return ju.cjb(scene)


def make_layout(scene_bytes, pos):
    """pos: {(type,id): (x, y)} integer thousandths.  Canonical igl-fixed/1 layout bytes."""
    sc = json.loads(scene_bytes.decode("utf-8"))
    nodes = []
    for n in sc["nodes"]:
        r = n["ref"]
        x, y = pos[(r["type"], r["id"])]
        nodes.append({"ref": r, "x": int(x), "y": int(y)})
    lay = {
        "address_scheme": "igs-addr/1",
        "igl": "IGL/1",
        "nodes": nodes,
        "policy": {"algorithm": "igl-fixed/1", "config": {}, "family": "FIXED"},
        "scale": 1000,
        "scene_sha256": ju.sha256_hex(scene_bytes),
    }
    return ju.cjb(lay)


# ---------------------------------------------------------------- model

class Model:
    pass


def build_model(scene_bytes, layout_bytes):
    sc = json.loads(scene_bytes.decode("utf-8"))
    lay = json.loads(layout_bytes.decode("utf-8"))
    m = Model()
    m.scene_bytes = scene_bytes
    m.scene_sha = ju.sha256_hex(scene_bytes)
    m.layout_sha = ju.sha256_hex(layout_bytes)
    assert lay["scene_sha256"] == m.scene_sha, "layout not bound to scene"
    m.artifact = sc["source"]["artifact_sha256"]
    m.directed = bool(sc["graph"]["directed"])
    assert len(lay["nodes"]) == len(sc["nodes"])
    idx = {}
    m.nodes = []
    for k, (sn, ln) in enumerate(zip(sc["nodes"], lay["nodes"])):
        assert sn["ref"] == ln["ref"]
        idx[(sn["ref"]["type"], sn["ref"]["id"])] = k
        m.nodes.append({"index": k, "ref": sn["ref"], "category": sn["category"], "label": sn["label"], "x": ln["x"], "y": ln["y"], "degree": 0})
    m.edges = []
    for k, se in enumerate(sc["edges"]):
        r = se["ref"]
        a = idx[(r["src"]["type"], r["src"]["id"])]
        b = idx[(r["tgt"]["type"], r["tgt"]["id"])]
        m.edges.append({"index": k, "ref": r, "label": se["label"], "src": a, "tgt": b})
        m.nodes[a]["degree"] += 1
        if b != a:
            m.nodes[b]["degree"] += 1
    m.categories = sorted({n["category"] for n in m.nodes}, key=lambda s: s.encode("utf-8"))
    m.node_index = idx
    m.edge_index = {_ekey(e["ref"]): e["index"] for e in m.edges}
    return m


def _ekey(r):
    return (r["ord"], r["rel"], r["src"]["type"], r["src"]["id"], r["tgt"]["type"], r["tgt"]["id"])


def load_model(scene_rel, layout_rel):
    return build_model(read(scene_rel), read(layout_rel))


# ---------------------------------------------------------------- state

def vis(model, state):
    """effectiveVisibility: (nodes[bool], edges[bool])"""
    hn = {(r["type"], r["id"]) for r in state["hidden"]["nodes"]}
    he = {_ekey(r) for r in state["hidden"]["edges"]}
    nv = [(n["ref"]["type"], n["ref"]["id"]) not in hn for n in model.nodes]
    ev = [(_ekey(e["ref"]) not in he) and nv[e["src"]] and nv[e["tgt"]] for e in model.edges]
    return nv, ev


def fit_viewport(model, state, padding=None):
    w, h = state["viewport"]["width"], state["viewport"]["height"]
    if padding is None:
        padding = min(FIT_PADDING, (min(w, h) - 1) // 2)
    nv, _ = vis(model, state)
    vn = [n for n, v in zip(model.nodes, nv) if v]
    vp = dict(state["viewport"])
    if not vn:
        return vp
    minx = min(n["x"] for n in vn)
    maxx = max(n["x"] for n in vn)
    miny = min(n["y"] for n in vn)
    maxy = max(n["y"] for n in vn)
    cx = ju.div_round(minx + maxx, 2)
    cy = ju.div_round(miny + maxy, 2)
    ax, ay = w - 2 * padding, h - 2 * padding
    sx, sy = maxx - minx, maxy - miny
    if ax < 1 or ay < 1:
        raise Err("INVALID_INTENT", "OUT_OF_RANGE")
    cands = []
    if sx > 0:
        cands.append(ju.floor_div(ax * S, sx))
    if sy > 0:
        cands.append(ju.floor_div(ay * S, sy))
    z = min(cands) if cands else ZOOM_DEFAULT
    z = max(ZOOM_MIN, min(ZOOM_MAX, z))
    vp.update({"center_x": cx, "center_y": cy, "zoom": z})
    return vp


def initial_state(model, width, height):
    if not (1 <= width <= VIEWPORT_MAX and 1 <= height <= VIEWPORT_MAX):
        raise Err("INVALID_INPUT", "OUT_OF_RANGE")
    st = {
        "hidden": {"edges": [], "nodes": []},
        "igr": "IGR/1",
        "layout_sha256": model.layout_sha,
        "scene_sha256": model.scene_sha,
        "selection": {"edges": [], "nodes": []},
        "viewport": {"center_x": 0, "center_y": 0, "height": height, "width": width, "zoom": ZOOM_DEFAULT},
    }
    if model.nodes:
        st["viewport"] = fit_viewport(model, st)
    return st


def state_bytes(state):
    return ju.cjb(state)


def check_state(model, state):
    """a subset of the parseState rules on an object (27 4.2 steps 2-5): enough for every state this corpus builds."""
    if state["scene_sha256"] != model.scene_sha:
        raise Err("INVALID_STATE", "SCENE_MISMATCH")
    if state["layout_sha256"] != model.layout_sha:
        raise Err("INVALID_STATE", "LAYOUT_MISMATCH")

    def nidx(r):
        k = model.node_index.get((r["type"], r["id"]))
        if k is None:
            raise Err("INVALID_STATE", "UNRESOLVED_ELEMENT")
        return k

    def eidx(r):
        k = model.edge_index.get(_ekey(r))
        if k is None:
            raise Err("INVALID_STATE", "UNRESOLVED_ELEMENT")
        return k

    foc = state.get("focus")
    if foc is not None:
        nidx(foc["node"]) if "node" in foc else eidx(foc["edge"])
    seqs = [([eidx(r) for r in state["hidden"]["edges"]]), ([nidx(r) for r in state["hidden"]["nodes"]]),
            ([eidx(r) for r in state["selection"]["edges"]]), ([nidx(r) for r in state["selection"]["nodes"]])]
    for s in seqs:
        if len(set(s)) != len(s):
            raise Err("INVALID_STATE", "DUPLICATE_ELEMENT")
    for s in seqs:
        if s != sorted(s):
            raise Err("INVALID_STATE", "NON_CANONICAL")
    nv, ev = vis(model, state)
    for r in state["selection"]["edges"]:
        if not ev[eidx(r)]:
            raise Err("INVALID_STATE", "SELECTED_HIDDEN")
    for r in state["selection"]["nodes"]:
        if not nv[nidx(r)]:
            raise Err("INVALID_STATE", "SELECTED_HIDDEN")
    if foc is not None:
        if "node" in foc and not nv[nidx(foc["node"])]:
            raise Err("INVALID_STATE", "FOCUS_HIDDEN")
        if "edge" in foc and not ev[eidx(foc["edge"])]:
            raise Err("INVALID_STATE", "FOCUS_HIDDEN")
    vp = state["viewport"]
    if not (ZOOM_MIN <= vp["zoom"] <= ZOOM_MAX) or not (1 <= vp["width"] <= VIEWPORT_MAX) or not (1 <= vp["height"] <= VIEWPORT_MAX):
        raise Err("INVALID_STATE", "INVALID_VIEWPORT")
    return state


def read_state(model, rel):
    st = json.loads(read(rel).decode("utf-8"))
    check_state(model, st)
    return st


def make_state(model, width, height, cx=None, cy=None, zoom=None, selected_nodes=(), selected_edges=(), focus=None, hidden_nodes=(), hidden_edges=()):
    """selected/hidden by index; focus = ('n', k) or ('e', k)"""
    st = initial_state(model, width, height)
    vp = st["viewport"]
    if cx is not None:
        vp["center_x"] = cx
    if cy is not None:
        vp["center_y"] = cy
    if zoom is not None:
        vp["zoom"] = zoom
    st["selection"] = {"edges": [model.edges[k]["ref"] for k in sorted(selected_edges)], "nodes": [model.nodes[k]["ref"] for k in sorted(selected_nodes)]}
    st["hidden"] = {"edges": [model.edges[k]["ref"] for k in sorted(hidden_edges)], "nodes": [model.nodes[k]["ref"] for k in sorted(hidden_nodes)]}
    if focus is not None:
        kind, k = focus
        st["focus"] = {"node": model.nodes[k]["ref"]} if kind == "n" else {"edge": model.edges[k]["ref"]}
    return st


# ---------------------------------------------------------------- screen position

def screen(vp, x, y):
    """layout thousandths -> micro-pixels (27 section 6), exact"""
    return ((x - vp["center_x"]) * vp["zoom"] + vp["width"] * 500000, (y - vp["center_y"]) * vp["zoom"] + vp["height"] * 500000)


# ---------------------------------------------------------------- traversal and reducer (subset)

def traversal(model, state):
    nv, ev = vis(model, state)
    out = [("n", k) for k, v in enumerate(nv) if v] + [("e", k) for k, v in enumerate(ev) if v]
    return out


def _focus_pos(model, state):
    f = state.get("focus")
    if f is None:
        return None
    if "node" in f:
        return ("n", model.node_index[(f["node"]["type"], f["node"]["id"])])
    return ("e", model.edge_index[_ekey(f["edge"])])


def _resolve(model, target):
    if not isinstance(target, dict) or len(target) != 1:
        raise Err("INVALID_INTENT", "SCHEMA")
    if "node" in target:
        r = target["node"]
        k = model.node_index.get((r.get("type"), r.get("id"))) if isinstance(r, dict) else None
        if k is None:
            raise Err("INVALID_INTENT", "UNRESOLVED_ELEMENT")
        return ("n", k)
    r = target["edge"]
    k = model.edge_index.get(_ekey(r)) if isinstance(r, dict) and set(r) == {"ord", "rel", "src", "tgt"} else None
    if k is None:
        raise Err("INVALID_INTENT", "UNRESOLVED_ELEMENT")
    return ("e", k)


def _num(v):
    if isinstance(v, bool) or not isinstance(v, int):
        raise Err("INVALID_INTENT", "SCHEMA")
    return v


def reduce_intent(model, state, intent):
    """the intents the U rows use; the rest of 5.2 is the renderer-core corpus's business (A-xx)"""
    st = json.loads(json.dumps(state))
    t = intent.get("type")
    nv, ev = vis(model, st)
    sel_n = {model.node_index[(r["type"], r["id"])] for r in st["selection"]["nodes"]}
    sel_e = {model.edge_index[_ekey(r)] for r in st["selection"]["edges"]}
    hid_n = {model.node_index[(r["type"], r["id"])] for r in st["hidden"]["nodes"]}
    hid_e = {model.edge_index[_ekey(r)] for r in st["hidden"]["edges"]}

    def put_sel():
        st["selection"] = {"edges": [model.edges[k]["ref"] for k in sorted(sel_e)], "nodes": [model.nodes[k]["ref"] for k in sorted(sel_n)]}

    def put_hid():
        st["hidden"] = {"edges": [model.edges[k]["ref"] for k in sorted(hid_e)], "nodes": [model.nodes[k]["ref"] for k in sorted(hid_n)]}

    def set_focus(p):
        if p is None:
            st.pop("focus", None)
        elif p[0] == "n":
            st["focus"] = {"node": model.nodes[p[1]]["ref"]}
        else:
            st["focus"] = {"edge": model.edges[p[1]]["ref"]}

    if t == "select":
        tg = [_resolve(model, x) for x in intent["targets"]]
        mode = intent["mode"]
        for kd, k in tg:
            if mode != "remove" and not (nv[k] if kd == "n" else ev[k]):
                raise Err("INVALID_INTENT", "ELEMENT_HIDDEN")
        tn = {k for kd, k in tg if kd == "n"}
        te = {k for kd, k in tg if kd == "e"}
        if mode == "replace":
            sel_n, sel_e = tn, te
        elif mode == "add":
            sel_n |= tn
            sel_e |= te
        elif mode == "remove":
            sel_n -= tn
            sel_e -= te
        elif mode == "toggle":
            sel_n ^= tn
            sel_e ^= te
        put_sel()
    elif t == "clear-selection":
        sel_n, sel_e = set(), set()
        put_sel()
    elif t == "focus":
        tg = intent.get("target")
        if tg is None:
            set_focus(None)
        else:
            kd, k = _resolve(model, tg)
            if not (nv[k] if kd == "n" else ev[k]):
                raise Err("INVALID_INTENT", "ELEMENT_HIDDEN")
            set_focus((kd, k))
    elif t in ("focus-step", "focus-first", "focus-last"):
        tr = traversal(model, st)
        cur = _focus_pos(model, st)
        if tr:
            if t == "focus-first":
                set_focus(tr[0])
            elif t == "focus-last":
                set_focus(tr[-1])
            else:
                d = intent["delta"]
                if cur is None:
                    set_focus(tr[0] if d == 1 else tr[-1])
                else:
                    i = tr.index(cur) + d
                    if 0 <= i < len(tr):
                        set_focus(tr[i])
    elif t == "set-hidden":
        tg = [_resolve(model, x) for x in intent["targets"]]
        for kd, k in tg:
            (hid_n if kd == "n" else hid_e).add(k) if intent["hidden"] else (hid_n if kd == "n" else hid_e).discard(k)
        put_hid()
        nv, ev = vis(model, st)
        sel_n = {k for k in sel_n if nv[k]}
        sel_e = {k for k in sel_e if ev[k]}
        put_sel()
        f = _focus_pos(model, st)
        if f is not None and not (nv[f[1]] if f[0] == "n" else ev[f[1]]):
            set_focus(None)
    elif t == "pan":
        vp = st["viewport"]
        dx, dy = _num(intent["dx"]), _num(intent["dy"])
        vp["center_x"] -= ju.div_round(dx * S, vp["zoom"])
        vp["center_y"] -= ju.div_round(dy * S, vp["zoom"])
    elif t == "zoom":
        vp = st["viewport"]
        z = vp["zoom"]
        f = _num(intent["factor_milli"])
        z2 = max(ZOOM_MIN, min(ZOOM_MAX, ju.div_round(z * f, 1000)))
        a = intent.get("anchor")
        if a is not None:
            u, v = 2 * a["x"] - vp["width"], 2 * a["y"] - vp["height"]
            vp["center_x"] += ju.div_round(u * S, 2 * z) - ju.div_round(u * S, 2 * z2)
            vp["center_y"] += ju.div_round(v * S, 2 * z) - ju.div_round(v * S, 2 * z2)
        vp["zoom"] = z2
    elif t == "fit":
        st["viewport"] = fit_viewport(model, st, intent.get("padding"))
    elif t == "set-viewport":
        vp = st["viewport"]
        z = _num(intent["zoom"])
        if not (ZOOM_MIN <= z <= ZOOM_MAX):
            raise Err("INVALID_INTENT", "OUT_OF_RANGE")
        vp["center_x"], vp["center_y"], vp["zoom"] = _num(intent["center_x"]), _num(intent["center_y"]), z
    elif t == "resize":
        w, h = _num(intent["width"]), _num(intent["height"])
        if not (1 <= w <= VIEWPORT_MAX and 1 <= h <= VIEWPORT_MAX):
            raise Err("INVALID_INTENT", "OUT_OF_RANGE")
        st["viewport"]["width"], st["viewport"]["height"] = w, h
    else:
        raise Err("INVALID_INTENT", "UNKNOWN_TYPE")
    return st
