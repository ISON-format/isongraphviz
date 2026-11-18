"""Base layer of the V11 oracle: canonical JSON, integer math, scenes, layouts, model, state, texts.

Standard library only.  Written from design 32 (rev 2), 27, 30, 31, IGS/1, IGL/1.
"""
import hashlib
import json
import math

# ---------------------------------------------------------------- mutants
MUT = set()


def M(k):
    return k in MUT


class IaErr(Exception):
    def __init__(self, code, reason=""):
        super().__init__("%s/%s" % (code, reason))
        self.code = code
        self.reason = reason

    def __str__(self):
        return "%s/%s" % (self.code, self.reason)


# ---------------------------------------------------------------- math
def floor_div(a, b):
    return a // b


def div_round(a, b):
    return (2 * a + b) // (2 * b)


def isqrt(n):
    return math.isqrt(n)


def ceil_div(a, b):
    return -((-a) // b)


# ---------------------------------------------------------------- canonical JSON (IGR-CJ/1)
def _esc(s):
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == '\\':
            out.append('\\\\')
        elif o == 8:
            out.append('\\b')
        elif o == 9:
            out.append('\\t')
        elif o == 10:
            out.append('\\n')
        elif o == 12:
            out.append('\\f')
        elif o == 13:
            out.append('\\r')
        elif o < 0x20:
            out.append('\\u%04x' % o)
        else:
            out.append(ch)
    out.append('"')
    return ''.join(out)


def cj(v):
    """Canonical text of a value (IGS-CJ/1 plus signed integers)."""
    if v is True:
        return 'true'
    if v is False:
        return 'false'
    if v is None:
        raise ValueError("null in canonical value")
    if isinstance(v, int):
        if abs(v) > 2 ** 53 - 1:
            raise ValueError("integer beyond safe range")
        return str(v)
    if isinstance(v, float):
        raise ValueError("float in canonical value")
    if isinstance(v, str):
        v.encode('utf-8')  # raises on lone surrogates
        return _esc(v)
    if isinstance(v, (list, tuple)):
        return '[' + ','.join(cj(x) for x in v) + ']'
    if isinstance(v, dict):
        ks = sorted(v.keys(), key=lambda k: k.encode('utf-16-be'))
        return '{' + ','.join(_esc(k) + ':' + cj(v[k]) for k in ks) + '}'
    raise ValueError("unsupported type %r" % type(v))


def cjb(v):
    return cj(v).encode('utf-8')


def sha(b):
    return hashlib.sha256(b).hexdigest()


ZERO64 = '0' * 64

# ---------------------------------------------------------------- scenes and layouts
def _idkey(idtext):
    # INT64 ids before STRING ids; int by value; strings by UTF-8 bytes
    if idtext.startswith('i:'):
        return (0, int(idtext[2:]), b'')
    return (1, 0, idtext[2:].encode('utf-8'))


def _nodekey(n):
    t, i = n
    return (t.encode('utf-8'), _idkey(i))


def idlabel(idtext):
    return idtext[2:]


def make_scene(nodes, edges, directed=True, artifact=ZERO64):
    """nodes: list of (type, idtext) any order; edges: list of (srctype, srcid, rel, tgttype, tgtid).
    returns scene bytes (canonical)."""
    ns = sorted(set(nodes), key=_nodekey)
    nl = [{"category": t, "label": idlabel(i), "ref": {"id": i, "type": t}} for t, i in ns]
    es = []
    for (st, si, rel, tt, ti) in edges:
        es.append(((_nodekey((st, si)), rel.encode('utf-8'), _nodekey((tt, ti)), b'0'),
                   {"label": rel, "ref": {"ord": "0", "rel": rel, "src": {"id": si, "type": st}, "tgt": {"id": ti, "type": tt}}}))
    es.sort(key=lambda p: p[0])
    scene = {"address_scheme": "igs-addr/1", "edges": [e for _, e in es],
             "graph": {"directed": directed, "profile": "simple"}, "igs": "IGS/1", "nodes": nl,
             "source": {"artifact_sha256": artifact, "serialization_profile": "ison-v1"}}
    return cjb(scene)


def make_layout(scene_bytes, pos):
    """pos: dict (type,idtext)->(x,y) thousandths. FIXED layout bytes."""
    sc = json.loads(scene_bytes.decode('utf-8'))
    nodes = []
    for n in sc["nodes"]:
        key = (n["ref"]["type"], n["ref"]["id"])
        x, y = pos[key]
        nodes.append({"ref": dict(n["ref"]), "x": x, "y": y})
    lay = {"address_scheme": "igs-addr/1", "igl": "IGL/1", "nodes": nodes,
           "policy": {"algorithm": "igl-fixed/1", "config": {}, "family": "FIXED"},
           "scale": 1000, "scene_sha256": sha(scene_bytes)}
    return cjb(lay)


# ---------------------------------------------------------------- model
class Model:
    pass


def build_model(scene_bytes, layout_bytes):
    sc = json.loads(scene_bytes.decode('utf-8'))
    lay = json.loads(layout_bytes.decode('utf-8'))
    m = Model()
    m.scene_bytes = scene_bytes
    m.layout_bytes = layout_bytes
    m.artifact = sc["source"]["artifact_sha256"]
    m.scene_sha = sha(scene_bytes)
    m.layout_sha = sha(layout_bytes)
    if lay["scene_sha256"] != m.scene_sha:
        raise IaErr("SCENE_MISMATCH", "")
    m.directed = sc["graph"]["directed"]
    m.nodes = []
    pos = {}
    for n in lay["nodes"]:
        pos[(n["ref"]["type"], n["ref"]["id"])] = (n["x"], n["y"])
    nidx = {}
    for i, n in enumerate(sc["nodes"]):
        r = n["ref"]
        x, y = pos[(r["type"], r["id"])]
        m.nodes.append({"index": i, "ref": r, "category": n["category"], "label": n["label"], "x": x, "y": y})
        nidx[(r["type"], r["id"])] = i
    m.edges = []
    for i, e in enumerate(sc["edges"]):
        r = e["ref"]
        m.edges.append({"index": i, "ref": r, "label": e["label"],
                        "src": nidx[(r["src"]["type"], r["src"]["id"])],
                        "tgt": nidx[(r["tgt"]["type"], r["tgt"]["id"])]})
    m.categories = sorted(set(n["category"] for n in m.nodes), key=lambda s: s.encode('utf-8'))
    m.nlook = {}
    for n in m.nodes:
        m.nlook[("n", n["ref"]["type"], n["ref"]["id"])] = ("n", n["index"])
    m.elook = {}
    for e in m.edges:
        r = e["ref"]
        m.elook[("e", r["ord"], r["rel"], r["src"]["type"], r["src"]["id"], r["tgt"]["type"], r["tgt"]["id"])] = ("e", e["index"])
    return m


def wire(m, el):
    return m.nodes[el[1]]["ref"] if el[0] == "n" else m.edges[el[1]]["ref"]


def eaddr(m, el):
    return {"node": wire(m, el)} if el[0] == "n" else {"edge": wire(m, el)}


def lookup_wire(m, kind, w):
    """strict lookup of a wire address; kind 'n' or 'e'. returns el or None"""
    try:
        if kind == "n":
            if not isinstance(w, dict) or set(w.keys()) != {"id", "type"}:
                return None
            if not (isinstance(w["id"], str) and isinstance(w["type"], str)):
                return None
            return m.nlook.get(("n", w["type"], w["id"]))
        if not isinstance(w, dict) or set(w.keys()) != {"ord", "rel", "src", "tgt"}:
            return None
        s, t = w["src"], w["tgt"]
        for x in (s, t):
            if not isinstance(x, dict) or set(x.keys()) != {"id", "type"}:
                return None
            if not (isinstance(x["id"], str) and isinstance(x["type"], str)):
                return None
        if not (isinstance(w["ord"], str) and isinstance(w["rel"], str)):
            return None
        return m.elook.get(("e", w["ord"], w["rel"], s["type"], s["id"], t["type"], t["id"]))
    except Exception:
        return None


def lookup_eaddr(m, ea):
    if not isinstance(ea, dict) or len(ea) != 1:
        return None
    if "node" in ea:
        return lookup_wire(m, "n", ea["node"])
    if "edge" in ea:
        return lookup_wire(m, "e", ea["edge"])
    return None


def object_ref(m, el):
    return {"address": wire(m, el), "artifact_sha256": m.artifact}


# ---------------------------------------------------------------- state
def mk_state(m, w=900, h=600, vp=None, focus=None, selection=(), hidden=()):
    """focus/selection/hidden given as els. Returns state dict (scene-order arrays)."""
    def eset(els):
        ns = sorted(e[1] for e in els if e[0] == "n")
        es = sorted(e[1] for e in els if e[0] == "e")
        return {"edges": [m.edges[i]["ref"] for i in es], "nodes": [m.nodes[i]["ref"] for i in ns]}
    st = {"hidden": eset(hidden), "igr": "IGR/1", "layout_sha256": m.layout_sha, "scene_sha256": m.scene_sha,
          "selection": eset(selection), "viewport": None}
    if vp is None:
        vp = initial_viewport(m, w, h)
    st["viewport"] = vp
    if focus is not None:
        st["focus"] = eaddr(m, focus)
    return st


def initial_viewport(m, w, h):
    if not m.nodes:
        return {"center_x": 0, "center_y": 0, "height": h, "width": w, "zoom": 1000}
    pad = min(32, floor_div(min(w, h) - 1, 2))
    return fit_viewport(m, w, h, pad, list(range(len(m.nodes))))


def fit_viewport(m, w, h, pad, idxs):
    xs = [m.nodes[i]["x"] for i in idxs]
    ys = [m.nodes[i]["y"] for i in idxs]
    mnx, mxx, mny, mxy = min(xs), max(xs), min(ys), max(ys)
    cx = div_round(mnx + mxx, 2)
    cy = div_round(mny + mxy, 2)
    ax, ay = w - 2 * pad, h - 2 * pad
    sx, sy = mxx - mnx, mxy - mny
    c = []
    S = 1000000
    if sx > 0:
        c.append(floor_div(ax * S, sx))
    if sy > 0:
        c.append(floor_div(ay * S, sy))
    z = min(c) if c else 1000
    z = max(10, min(100000, z))
    return {"center_x": cx, "center_y": cy, "height": h, "width": w, "zoom": z}


def vpz(cx, cy, w=900, h=600, z=2680):
    return {"center_x": cx, "center_y": cy, "height": h, "width": w, "zoom": z}


def state_bytes(st):
    return cjb(st)


def st_sets(m, st):
    """returns (hidden_nodes, hidden_edges, sel set, focus el|None, visible nodes set, visible edges set)"""
    hn = set()
    he = set()
    for r in st["hidden"]["nodes"]:
        hn.add(lookup_wire(m, "n", r)[1])
    for r in st["hidden"]["edges"]:
        he.add(lookup_wire(m, "e", r)[1])
    sel = set()
    for r in st["selection"]["nodes"]:
        sel.add(("n", lookup_wire(m, "n", r)[1]))
    for r in st["selection"]["edges"]:
        sel.add(("e", lookup_wire(m, "e", r)[1]))
    foc = None
    if "focus" in st:
        f = st["focus"]
        foc = lookup_eaddr(m, f)
    vn = [i for i in range(len(m.nodes)) if i not in hn]
    ve = [e["index"] for e in m.edges if e["index"] not in he and e["src"] not in hn and e["tgt"] not in hn]
    return hn, he, sel, foc, vn, ve


def validate_state(m, st):
    if st.get("scene_sha256") != m.scene_sha:
        raise IaErr("INVALID_STATE", "SCENE_MISMATCH")
    if st.get("layout_sha256") != m.layout_sha:
        raise IaErr("INVALID_STATE", "LAYOUT_MISMATCH")
    return st


def traversal(m, st):
    _, _, _, _, vn, ve = st_sets(m, st)
    return [("n", i) for i in vn] + [("e", i) for i in ve]


def visible(m, st, el):
    _, _, _, _, vn, ve = st_sets(m, st)
    return (el[1] in vn) if el[0] == "n" else (el[1] in ve)


def screen_node(m, st, i):
    v = st["viewport"]
    n = m.nodes[i]
    X = (n["x"] - v["center_x"]) * v["zoom"] + v["width"] * 500000
    Y = (n["y"] - v["center_y"]) * v["zoom"] + v["height"] * 500000
    return X, Y


def screen_el(m, st, el):
    """exact micro-pixel position of an element: node centre, edge integer midpoint"""
    if el[0] == "n":
        return screen_node(m, st, el[1])
    e = m.edges[el[1]]
    ax, ay = screen_node(m, st, e["src"])
    bx, by = screen_node(m, st, e["tgt"])
    return div_round(ax + bx, 2), div_round(ay + by, 2)


# ---------------------------------------------------------------- texts (27 section 10)
def plural(n, w):
    return "%d %s" % (n, w if n == 1 else w + "s")


def summary_text(m):
    n, e = len(m.nodes), len(m.edges)
    s = "%s graph with %s and %s." % ("Directed" if m.directed else "Undirected", plural(n, "node"), plural(e, "edge"))
    if n > 0:
        cnt = {}
        for nd in m.nodes:
            cnt[nd["category"]] = cnt.get(nd["category"], 0) + 1
        items = ["%s (%d)" % (c, cnt[c]) for c in m.categories[:8]]
        lst = ", ".join(items)
        if len(m.categories) > 8:
            lst += ", and %d more" % (len(m.categories) - 8)
        s += " Node categories: " + lst + "."
    return s


def node_name(m, i):
    n = m.nodes[i]
    return n["category"] + " " + n["label"]


def edge_desc(m, i):
    e = m.edges[i]
    return m.nodes[e["src"]]["label"] + " " + e["label"] + " " + m.nodes[e["tgt"]]["label"]


def el_name(m, el):
    return node_name(m, el[1]) if el[0] == "n" else m.edges[el[1]]["label"]


def el_text(m, el):
    """the focus text t: node name or edge description"""
    return node_name(m, el[1]) if el[0] == "n" else edge_desc(m, el[1])


def status_text(m, st):
    hn, he, sel, foc, vn, ve = st_sets(m, st)
    hidden = (len(m.nodes) - len(vn)) + (len(m.edges) - len(ve))
    s = "%d selected, %d hidden." % (len(sel), hidden)
    if foc is not None:
        s += " Focus: %s." % el_text(m, foc)
    return s


def hidden_count(m, st):
    _, _, _, _, vn, ve = st_sets(m, st)
    return (len(m.nodes) - len(vn)) + (len(m.edges) - len(ve))


def announcement(m, st, ev):
    t = ev.get("type")
    if t == "selection-changed":
        _, _, sel, _, _, _ = st_sets(m, st)
        return "%d selected." % len(sel)
    if t == "focus-changed":
        f = ev.get("focus")
        if f is None:
            return "Focus cleared."
        a = f.get("address") if isinstance(f, dict) else None
        el = None
        if isinstance(a, dict):
            el = lookup_wire(m, "e" if "ord" in a else "n", a)
        if el is None:
            # rev 3 (A-24): an event naming no element of the model is an error that liveText propagates
            raise IaErr("INVALID_INPUT", "INVALID_VALUE")
        return el_text(m, el)
    if t == "visibility-changed":
        return "%d hidden." % hidden_count(m, st)
    if t == "traversal-boundary":
        return "End of graph." if ev.get("end") == "end" else "Start of graph."
    return None


# JavaScript whitespace set
JS_WS = set("\u0009\u000a\u000b\u000c\u000d                  　﻿")


def has_nonws(s):
    return any(c not in JS_WS for c in s)


def u16len(s):
    return len(s.encode('utf-16-le')) // 2


def element_hex_id(prefix, m_wire, kind):
    return "%s-%s-%s" % (prefix, kind, cj(m_wire).encode('utf-8').hex())


def read_json(b):
    return json.loads(b.decode('utf-8'))
