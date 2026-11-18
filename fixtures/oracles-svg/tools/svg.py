#!/usr/bin/env python3
"""IGR-SVG/1 reference implementation (Python 3.12, standard library only).

Written from `30-SVG-RENDERER-DESIGN.md` rev 2 and `27-IGR1-DESIGN.md` rev 5 alone.
It contains: the integer arithmetic of the design, the IGR/1 pieces V5 relies on
(model, state, reducer subset, accessible text, exact hit test), the document
writer (`render_svg`, `write_svg`), the strict reader (`read_svg`), the id codec
and `pick_element`, a small renderer/lifecycle simulation, and the switchable
mutants of design section 15.6 (`MUT`, set by `--mutant Knn`).

The corpus generator is `corpus.py`; run `python tools/svg.py` to regenerate.
"""
import sys, os, json, math, hashlib, re, unicodedata
from fractions import Fraction

MUT = set()


def M(k):
    return k in MUT


# ----------------------------------------------------------------------------
# errors
# ----------------------------------------------------------------------------
class IgrError(Exception):
    def __init__(self, code, reason="", detail=""):
        Exception.__init__(self, f"{code}/{reason} {detail}")
        self.code = code
        self.reason = reason
        self.detail = detail

    def tag(self):
        return f"{self.code}/{self.reason}"


# ----------------------------------------------------------------------------
# canonical JSON (IGS-CJ/1 + signed integers == "IGR-CJ/1")
# ----------------------------------------------------------------------------
def _cj_str(s):
    return json.dumps(s, ensure_ascii=False)


def cj(v):
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return _cj_str(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(cj(x) for x in v) + "]"
    if isinstance(v, dict):
        ks = sorted(v.keys(), key=lambda k: k.encode("utf-16-be"))
        return "{" + ",".join(_cj_str(k) + ":" + cj(v[k]) for k in ks) + "}"
    raise TypeError(f"not canonical: {v!r}")


def cjb(v):
    return cj(v).encode("utf-8")


def sha256_hex(b):
    return hashlib.sha256(b).hexdigest()


def len16(s):
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


# ----------------------------------------------------------------------------
# arithmetic (design section 3)
# ----------------------------------------------------------------------------
S = 1_000_000
isqrt = math.isqrt


def floor_div(a, b):
    return a // b


def div_round(a, b):
    return (2 * a + b) // (2 * b)


def fmt(v):
    """Number text of a micro-pixel integer (3.2) with the K01-K05 mutants."""
    if M("K01"):
        x = v / 1e6
        s = "%.3f" % x
        s = s.rstrip("0").rstrip(".") if "." in s else s
        if s in ("-0", ""):
            s = "0"
        return s
    if M("K04"):
        m = int(v / 1000) if abs(v) < 2**52 else (abs(v) // 1000) * (1 if v >= 0 else -1)
    elif M("K05"):
        m = -div_round(-v, 1000)
    else:
        m = div_round(v, 1000)
    if m == 0:
        if M("K03") and v < 0:
            return "-0"
        return "0"
    sign = "-" if m < 0 else ""
    q, r = divmod(abs(m), 1000)
    if M("K02"):
        return f"{sign}{q}.{r:03d}"
    if r == 0:
        return f"{sign}{q}"
    return f"{sign}{q}.{r:03d}".rstrip("0")


def quantize(v):
    """IGL/1 section 4 rule 2 applied once to a finite double."""
    s = v * 1000
    fl = math.floor(s)
    return fl + (1 if (s - fl) >= 0.5 else 0)


# ----------------------------------------------------------------------------
# text helpers (7.1, 7.2, 7.5)
# ----------------------------------------------------------------------------
def xs(s):
    if M("K37"):
        return s
    out = []
    for ch in s:
        c = ord(ch)
        if c in (9, 10, 13) or 0x20 <= c <= 0xD7FF or 0xE000 <= c <= 0xFFFD or c >= 0x10000:
            out.append(ch)
        else:
            if not M("K38"):
                out.append("�")
    return "".join(out)


def TEXT(s):
    s = xs(s)
    out = []
    for ch in s:
        if ch == "&":
            out.append("&" if M("K29") else "&amp;")
        elif ch == "<":
            out.append("<" if M("K29") else "&lt;")
        elif ch == ">":
            out.append(">" if M("K30") else "&gt;")
        elif ch == "\n":
            out.append("\n" if M("K33") else "&#10;")
        elif ch == "\r":
            out.append("\r" if M("K34") else "&#13;")
        elif ch == "\t":
            out.append("&#9;" if M("K36") else "\t")
        else:
            out.append(ch)
    return "".join(out)


def ATTR(s):
    s = xs(s)
    out = []
    for ch in s:
        if ch == "&":
            out.append("&amp;")
        elif ch == "<":
            out.append("&lt;")
        elif ch == ">":
            out.append("&gt;")
        elif ch == '"':
            out.append('"' if M("K31") else "&quot;")
        elif ch == "\t":
            out.append("\t" if M("K32") else "&#9;")
        elif ch == "\n":
            out.append("\n" if M("K32") else "&#10;")
        elif ch == "\r":
            out.append("\r" if M("K32") else "&#13;")
        else:
            out.append(ch)
    return "".join(out)


def dl(s):
    """Drawn label (7.5a)."""
    if not M("K35"):
        s = s.replace("\t", " ").replace("\n", " ").replace("\r", " ")
    s = xs(s)
    lim, keep = (25, 24) if M("K40") else (24, 23)
    if len16(s) <= lim:
        return s
    out = []
    n = 0
    for ch in s:
        w = 2 if ord(ch) >= 0x10000 else 1
        if n + w > keep:
            if M("K39") and w == 2 and n + 1 <= keep:
                # splits the pair: keeps a lone high surrogate (as a replacement char in Python)
                out.append("\ufffd")
                n += 1
            break
        out.append(ch)
        n += w
    return "".join(out) + "…"


# ----------------------------------------------------------------------------
# element ids (7.3)
# ----------------------------------------------------------------------------
PREFIX_RE = re.compile(r"^[a-z][a-z0-9-]{0,31}$")


def addr_json(wire):
    return json.dumps(wire, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _is_node_wire(a):
    return isinstance(a, dict) and set(a.keys()) == {"id", "type"} and all(isinstance(a[k], str) for k in a)


def _is_edge_wire(a):
    return (isinstance(a, dict) and set(a.keys()) == {"ord", "rel", "src", "tgt"}
            and isinstance(a["ord"], str) and isinstance(a["rel"], str)
            and _is_node_wire(a["src"]) and _is_node_wire(a["tgt"]))


def _has_lone_surrogate(s):
    return any(0xD800 <= ord(c) <= 0xDFFF for c in s)


def element_dom_id(prefix, address):
    if not PREFIX_RE.match(prefix) and not M("K48"):
        raise IgrError("INVALID_INPUT", "INVALID_VALUE")
    if not isinstance(address, dict) or len(address) != 1:
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if "node" in address:
        kind, w = "n", address["node"]
        ok = _is_node_wire(w)
    elif "edge" in address:
        kind, w = "e", address["edge"]
        ok = _is_edge_wire(w)
    else:
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if not ok:
        raise IgrError("INVALID_INPUT", "SCHEMA")
    txt = addr_json(w)
    if _has_lone_surrogate(txt):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if M("K44"):
        txt = json.dumps(w, ensure_ascii=False)  # spaces, insertion order
    elif M("K47"):
        w2 = json.loads(txt)
        if "id" in w2:
            w2["id"] = w2["id"][2:]
        else:
            for k in ("src", "tgt"):
                w2[k]["id"] = w2[k]["id"][2:]
        txt = addr_json(w2)
    if M("K45"):
        hx = txt.encode("utf-16-le").hex()
    else:
        hx = txt.encode("utf-8").hex()
    if M("K46"):
        hx = hx.upper()
    return f"{prefix}-{kind}-{hx}"


DEFAULT_MAX_ID_HEX = 4_194_304


def _json_depth_ok(txt, limit=3):
    depth = 0
    instr = False
    esc = False
    for ch in txt:
        if instr:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                instr = False
            continue
        if ch == '"':
            instr = True
        elif ch in "{[":
            depth += 1
            if depth > limit:
                return False
        elif ch in "}]":
            depth -= 1
    return True


def decode_element_id(prefix, id_, max_hex=DEFAULT_MAX_ID_HEX):
    """Strict decoder (7.3). Returns an ElementAddress dict or None."""
    if not isinstance(id_, str):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if not PREFIX_RE.match(prefix) and not M("K48"):
        raise IgrError("INVALID_INPUT", "INVALID_VALUE")
    if id_.startswith(prefix + "-n-"):
        kind, rest = "n", id_[len(prefix) + 3:]
    elif id_.startswith(prefix + "-e-"):
        kind, rest = "e", id_[len(prefix) + 3:]
    elif M("K80") and id_.startswith(prefix + "-a-"):
        kind, rest = "a", id_[len(prefix) + 3:]
    else:
        return None
    if rest == "" or len(rest) % 2 == 1:
        return None
    if not M("K81") and len(rest) > max_hex:
        return None
    if M("K79"):
        okhex = re.fullmatch(r"[0-9a-fA-F]+", rest)
    else:
        okhex = re.fullmatch(r"[0-9a-f]+", rest)
    if not okhex:
        return None
    try:
        raw = bytes.fromhex(rest)
        txt = raw.decode("utf-8", "strict")
    except (ValueError, UnicodeDecodeError):
        return None
    if not M("K81") and not _json_depth_ok(txt, 3):
        return None
    try:
        v = json.loads(txt)
    except (ValueError, RecursionError):
        return None
    if kind == "a":
        return {"node": v} if _is_node_wire(v) else None
    if kind == "n":
        if not _is_node_wire(v):
            return None
    else:
        if not _is_edge_wire(v):
            return None
    if not M("K79"):
        try:
            if addr_json(v).encode("utf-8") != raw:
                return None
        except UnicodeEncodeError:
            return None
    return {"node": v} if kind == "n" else {"edge": v}


# ----------------------------------------------------------------------------
# model (IGR/1 section 2.2, derived here from scene + layout bytes)
# ----------------------------------------------------------------------------
class Model:
    def __init__(self, scene_bytes, layout_bytes):
        sc = json.loads(scene_bytes.decode("utf-8"))
        ly = json.loads(layout_bytes.decode("utf-8"))
        self.scene_bytes = scene_bytes
        self.layout_bytes = layout_bytes
        self.scene_sha = sha256_hex(scene_bytes)
        self.layout_sha = sha256_hex(layout_bytes)
        assert ly["scene_sha256"] == self.scene_sha, "layout not bound to scene"
        assert len(ly["nodes"]) == len(sc["nodes"])
        self.artifact = sc["source"]["artifact_sha256"]
        self.directed = sc["graph"]["directed"]
        self.nodes = []
        self.node_index = {}
        for i, (n, l) in enumerate(zip(sc["nodes"], ly["nodes"])):
            assert n["ref"] == l["ref"], "layout order differs from scene order"
            self.nodes.append({"index": i, "ref": n["ref"], "category": n["category"],
                               "label": n["label"], "x": l["x"], "y": l["y"]})
            self.node_index[(n["ref"]["type"], n["ref"]["id"])] = i
        self.edges = []
        self.edge_index = {}
        for i, e in enumerate(sc["edges"]):
            r = e["ref"]
            s = self.node_index[(r["src"]["type"], r["src"]["id"])]
            t = self.node_index[(r["tgt"]["type"], r["tgt"]["id"])]
            self.edges.append({"index": i, "ref": r, "label": e["label"], "src": s, "tgt": t})
            self.edge_index[(r["ord"], r["rel"], r["src"]["type"], r["src"]["id"],
                             r["tgt"]["type"], r["tgt"]["id"])] = i
        self.categories = sorted({n["category"] for n in self.nodes}, key=lambda s: s.encode("utf-8"))

    # lookup of a WIRE address (27 2.2); strict, non-throwing
    def lookup_node(self, w):
        if not _is_node_wire(w):
            return None
        return self.node_index.get((w["type"], w["id"]))

    def lookup_edge(self, w):
        if not _is_edge_wire(w):
            return None
        return self.edge_index.get((w["ord"], w["rel"], w["src"]["type"], w["src"]["id"],
                                    w["tgt"]["type"], w["tgt"]["id"]))

    def lookup(self, wire_or_elem):
        """Returns ('n', i) or ('e', i) or None for an ElementAddress."""
        a = wire_or_elem
        if isinstance(a, dict) and len(a) == 1 and "node" in a:
            i = self.lookup_node(a["node"])
            return None if i is None else ("n", i)
        if isinstance(a, dict) and len(a) == 1 and "edge" in a:
            i = self.lookup_edge(a["edge"])
            return None if i is None else ("e", i)
        return None

    def elem_addr(self, kind, i):
        return {"node": self.nodes[i]["ref"]} if kind == "n" else {"edge": self.edges[i]["ref"]}

    def bounds(self):
        if not self.nodes:
            return None
        xs_ = [n["x"] for n in self.nodes]
        ys_ = [n["y"] for n in self.nodes]
        return (min(xs_), min(ys_), max(xs_), max(ys_))


# ----------------------------------------------------------------------------
# state (27 section 4)
# ----------------------------------------------------------------------------
def fit_viewport(model, vis_nodes, w, h, padding=None, cur=None):
    pad = min(32, floor_div(min(w, h) - 1, 2)) if padding is None else padding
    pts = [(n["x"], n["y"]) for n in model.nodes if vis_nodes[n["index"]]]
    if not pts:
        if cur is not None:
            return dict(cur)
        return {"center_x": 0, "center_y": 0, "height": h, "width": w, "zoom": 1000}
    minx = min(p[0] for p in pts); maxx = max(p[0] for p in pts)
    miny = min(p[1] for p in pts); maxy = max(p[1] for p in pts)
    cx = div_round(minx + maxx, 2)
    cy = div_round(miny + maxy, 2)
    ax = w - 2 * pad
    ay = h - 2 * pad
    sx = maxx - minx
    sy = maxy - miny
    cands = []
    if sx > 0:
        cands.append(floor_div(ax * S, sx))
    if sy > 0:
        cands.append(floor_div(ay * S, sy))
    z = min(cands) if cands else 1000
    z = max(10, min(100000, z))
    return {"center_x": cx, "center_y": cy, "height": h, "width": w, "zoom": z}


def initial_state(model, w, h):
    vis = [True] * len(model.nodes)
    return {"hidden": {"edges": [], "nodes": []}, "igr": "IGR/1", "layout_sha256": model.layout_sha,
            "scene_sha256": model.scene_sha, "selection": {"edges": [], "nodes": []},
            "viewport": fit_viewport(model, vis, w, h)}


def mk_state(model, viewport, sel_nodes=(), sel_edges=(), hid_nodes=(), hid_edges=(), focus=None):
    """Build a canonical state from index lists. focus = ('n', i) | ('e', i) | None."""
    st = {"hidden": {"edges": [model.edges[i]["ref"] for i in sorted(set(hid_edges))],
                     "nodes": [model.nodes[i]["ref"] for i in sorted(set(hid_nodes))]},
          "igr": "IGR/1", "layout_sha256": model.layout_sha, "scene_sha256": model.scene_sha,
          "selection": {"edges": [model.edges[i]["ref"] for i in sorted(set(sel_edges))],
                        "nodes": [model.nodes[i]["ref"] for i in sorted(set(sel_nodes))]},
          "viewport": dict(viewport)}
    if focus is not None:
        k, i = focus
        st["focus"] = {"node": model.nodes[i]["ref"]} if k == "n" else {"edge": model.edges[i]["ref"]}
    return st


def vp(cx, cy, z, w, h):
    return {"center_x": cx, "center_y": cy, "height": h, "width": w, "zoom": z}


def effective_visibility(model, state):
    hn = {model.lookup_node(r) for r in state["hidden"]["nodes"]}
    he = {model.lookup_edge(r) for r in state["hidden"]["edges"]}
    vn = [i not in hn for i in range(len(model.nodes))]
    ve = []
    for e in model.edges:
        hid = e["index"] in he
        if not M("K52"):
            hid = hid or not vn[e["src"]] or not vn[e["tgt"]]
        ve.append(not hid)
    return vn, ve


def _state_idx(model, refs, kind):
    f = model.lookup_node if kind == "n" else model.lookup_edge
    return [f(r) for r in refs]


def validate_state(model, st, raw_bytes=None):
    """27 4.2 steps 2-6 (schema checked only to the extent the corpus needs)."""
    if st["scene_sha256"] != model.scene_sha:
        raise IgrError("INVALID_STATE", "SCENE_MISMATCH")
    if st["layout_sha256"] != model.layout_sha:
        raise IgrError("INVALID_STATE", "LAYOUT_MISMATCH")
    seq = []
    if "focus" in st:
        f = st["focus"]
        if "node" in f:
            seq.append(("n", f["node"]))
        else:
            seq.append(("e", f["edge"]))
    arrays = [("hidden.edges", "e", st["hidden"]["edges"]), ("hidden.nodes", "n", st["hidden"]["nodes"]),
              ("selection.edges", "e", st["selection"]["edges"]), ("selection.nodes", "n", st["selection"]["nodes"])]
    idx = {}
    for name, k, arr in arrays:
        idx[name] = _state_idx(model, arr, k)
        if any(i is None for i in idx[name]):
            raise IgrError("INVALID_STATE", "UNRESOLVED_ELEMENT")
    if seq:
        k, w = seq[0]
        i = (model.lookup_node if k == "n" else model.lookup_edge)(w)
        if i is None:
            raise IgrError("INVALID_STATE", "UNRESOLVED_ELEMENT")
    for name, k, arr in arrays:
        if len(set(idx[name])) != len(idx[name]):
            raise IgrError("INVALID_STATE", "DUPLICATE_ELEMENT")
    for name, k, arr in arrays:
        if idx[name] != sorted(idx[name]):
            raise IgrError("INVALID_STATE", "NON_CANONICAL")
    vn, ve = effective_visibility(model, st)
    for name in ("selection.edges", "selection.nodes"):
        vis = ve if name.endswith("edges") else vn
        for i in idx[name]:
            if not vis[i]:
                raise IgrError("INVALID_STATE", "SELECTED_HIDDEN")
    if seq:
        k, w = seq[0]
        i = (model.lookup_node if k == "n" else model.lookup_edge)(w)
        if not (vn if k == "n" else ve)[i]:
            raise IgrError("INVALID_STATE", "FOCUS_HIDDEN")
    if raw_bytes is not None and raw_bytes != cjb(st):
        raise IgrError("INVALID_STATE", "NON_CANONICAL")


def parse_state(model, raw):
    st = json.loads(raw.decode("utf-8"))
    validate_state(model, st, raw)
    return st


def serialize_state(model, st):
    validate_state(model, st)
    return cjb(st)


# ----------------------------------------------------------------------------
# reducer subset (27 section 5/6) - only what the corpus scripts need
# ----------------------------------------------------------------------------
def _sorted_refs(model, kind, idxs):
    lst = model.nodes if kind == "n" else model.edges
    return [lst[i]["ref"] for i in sorted(set(idxs))]


def traversal(model, st):
    vn, ve = effective_visibility(model, st)
    return [("n", i) for i in range(len(model.nodes)) if vn[i]] + [("e", i) for i in range(len(model.edges)) if ve[i]]


def _focus_of(model, st):
    if "focus" not in st:
        return None
    f = st["focus"]
    if "node" in f:
        return ("n", model.lookup_node(f["node"]))
    return ("e", model.lookup_edge(f["edge"]))


def reduce(model, st, intent):
    st = json.loads(json.dumps(st))
    t = intent["type"]
    vn, ve = effective_visibility(model, st)
    cur_sel_n = set(model.lookup_node(r) for r in st["selection"]["nodes"])
    cur_sel_e = set(model.lookup_edge(r) for r in st["selection"]["edges"])
    if t in ("select", "clear-selection"):
        if t == "clear-selection":
            cur_sel_n, cur_sel_e = set(), set()
        else:
            tg = []
            for a in intent["targets"]:
                el = model.lookup(a)
                if el is None:
                    raise IgrError("INVALID_INTENT", "UNRESOLVED_ELEMENT")
                tg.append(el)
            tg = list(dict.fromkeys(tg))
            mode = intent["mode"]
            if mode != "remove":
                for k, i in tg:
                    if not (vn if k == "n" else ve)[i]:
                        raise IgrError("INVALID_INTENT", "ELEMENT_HIDDEN")
            tn = {i for k, i in tg if k == "n"}
            te = {i for k, i in tg if k == "e"}
            if mode == "replace":
                cur_sel_n, cur_sel_e = tn, te
            elif mode == "add":
                cur_sel_n |= tn; cur_sel_e |= te
            elif mode == "remove":
                cur_sel_n -= tn; cur_sel_e -= te
            else:
                cur_sel_n ^= tn; cur_sel_e ^= te
        st["selection"] = {"edges": _sorted_refs(model, "e", cur_sel_e), "nodes": _sorted_refs(model, "n", cur_sel_n)}
    elif t == "focus":
        if "target" in intent and intent["target"] is not None:
            el = model.lookup(intent["target"])
            if el is None:
                raise IgrError("INVALID_INTENT", "UNRESOLVED_ELEMENT")
            if not (vn if el[0] == "n" else ve)[el[1]]:
                raise IgrError("INVALID_INTENT", "ELEMENT_HIDDEN")
            st["focus"] = {"node": model.nodes[el[1]]["ref"]} if el[0] == "n" else {"edge": model.edges[el[1]]["ref"]}
        else:
            st.pop("focus", None)
    elif t in ("focus-step", "focus-first", "focus-last"):
        tr = traversal(model, st)
        f = _focus_of(model, st)
        if tr:
            if t == "focus-first":
                nf = tr[0]
            elif t == "focus-last":
                nf = tr[-1]
            else:
                d = intent["delta"]
                if f is None:
                    nf = tr[0] if d == 1 else tr[-1]
                else:
                    p = tr.index(f) + d
                    nf = tr[p] if 0 <= p < len(tr) else f
            st["focus"] = {"node": model.nodes[nf[1]]["ref"]} if nf[0] == "n" else {"edge": model.edges[nf[1]]["ref"]}
    elif t == "set-hidden":
        hn = set(model.lookup_node(r) for r in st["hidden"]["nodes"])
        he = set(model.lookup_edge(r) for r in st["hidden"]["edges"])
        for a in intent["targets"]:
            el = model.lookup(a)
            if el is None:
                raise IgrError("INVALID_INTENT", "UNRESOLVED_ELEMENT")
            s_ = hn if el[0] == "n" else he
            if intent["hidden"]:
                s_.add(el[1])
            else:
                s_.discard(el[1])
        st["hidden"] = {"edges": _sorted_refs(model, "e", he), "nodes": _sorted_refs(model, "n", hn)}
        vn2, ve2 = effective_visibility(model, st)
        st["selection"] = {
            "edges": [r for r in st["selection"]["edges"] if ve2[model.lookup_edge(r)]],
            "nodes": [r for r in st["selection"]["nodes"] if vn2[model.lookup_node(r)]]}
        f = _focus_of(model, st)
        if f is not None and not (vn2 if f[0] == "n" else ve2)[f[1]]:
            st.pop("focus", None)
    elif t == "pan":
        v = st["viewport"]
        v["center_x"] -= div_round(intent["dx"] * S, v["zoom"])
        v["center_y"] -= div_round(intent["dy"] * S, v["zoom"])
    elif t == "zoom":
        v = st["viewport"]
        z = v["zoom"]
        z2 = max(10, min(100000, div_round(z * intent["factor_milli"], 1000)))
        if intent.get("anchor"):
            u = 2 * intent["anchor"]["x"] - v["width"]
            w_ = 2 * intent["anchor"]["y"] - v["height"]
            v["center_x"] += div_round(u * S, 2 * z) - div_round(u * S, 2 * z2)
            v["center_y"] += div_round(w_ * S, 2 * z) - div_round(w_ * S, 2 * z2)
        v["zoom"] = z2
    elif t == "fit":
        v = st["viewport"]
        st["viewport"] = fit_viewport(model, vn, v["width"], v["height"], intent.get("padding"), v)
    elif t == "set-viewport":
        v = st["viewport"]
        v["center_x"] = intent["center_x"]; v["center_y"] = intent["center_y"]; v["zoom"] = intent["zoom"]
    elif t == "resize":
        v = st["viewport"]
        v["width"] = intent["width"]; v["height"] = intent["height"]
    else:
        raise IgrError("INVALID_INTENT", "UNKNOWN_TYPE")
    validate_state(model, st)
    return st


# ----------------------------------------------------------------------------
# accessible text (27 section 10)
# ----------------------------------------------------------------------------
def noun(n, sing, plur):
    if M("K58"):
        return sing if n <= 1 else plur     # zero is treated as singular
    return sing if n == 1 else plur


def summary_text(model):
    kind = "Directed" if model.directed else "Undirected"
    N, E = len(model.nodes), len(model.edges)
    t = f"{kind} graph with {N} {noun(N, 'node', 'nodes')} and {E} {noun(E, 'edge', 'edges')}."
    if N > 0:
        cnt = {}
        for n in model.nodes:
            cnt[n["category"]] = cnt.get(n["category"], 0) + 1
        items = [f"{c} ({cnt[c]})" for c in model.categories[:8]]
        lst = ", ".join(items)
        if len(model.categories) > 8:
            lst += f", and {len(model.categories) - 8} more"
        t += f" Node categories: {lst}."
    return t


def node_name(model, i):
    n = model.nodes[i]
    return f"{n['category']} {n['label']}"


def edge_name(model, i):
    return model.edges[i]["label"]


def edge_desc(model, i):
    e = model.edges[i]
    return f"{model.nodes[e['src']]['label']} {e['label']} {model.nodes[e['tgt']]['label']}"


def status_text(model, state):
    vn, ve = effective_visibility(model, state)
    s = len(state["selection"]["nodes"]) + len(state["selection"]["edges"])
    if M("K57"):
        h = len(state["hidden"]["nodes"]) + len(state["hidden"]["edges"])
    else:
        h = vn.count(False) + ve.count(False)
    t = f"{s} selected, {h} hidden."
    f = _focus_of(model, state)
    if f is not None:
        t += f" Focus: {node_name(model, f[1]) if f[0] == 'n' else edge_desc(model, f[1])}."
    return t


def accessible_items(model, state):
    items = []
    sel_n = {model.lookup_node(r) for r in state["selection"]["nodes"]}
    sel_e = {model.lookup_edge(r) for r in state["selection"]["edges"]}
    f = _focus_of(model, state)
    tr = traversal(model, state)
    for pos, (k, i) in enumerate(tr):
        it = {"role": "node" if k == "n" else "edge", "address": model.elem_addr(k, i),
              "name": node_name(model, i) if k == "n" else edge_name(model, i),
              "selected": (i in sel_n) if k == "n" else (i in sel_e),
              "focused": f == (k, i), "position": pos + 1, "set_size": len(tr)}
        if k == "e":
            it["description"] = edge_desc(model, i)
        items.append(it)
    return items


# ----------------------------------------------------------------------------
# screen geometry and hit test (27 section 6, 7.1)
# ----------------------------------------------------------------------------
def screen_positions(model, state):
    v = state["viewport"]
    cx, cy, z, w, h = v["center_x"], v["center_y"], v["zoom"], v["width"], v["height"]
    X, Y = [], []
    sgn = 1 if M("K07") else -1
    ox = (w // 2) * S if M("K06") else w * 500000
    oy = (h // 2) * S if M("K06") else h * 500000
    for n in model.nodes:
        X.append((n["x"] - sgn * -1 * 0 - cx if not M("K07") else n["x"] + cx) * z + ox)
        Y.append((n["y"] - cy if not M("K07") else n["y"] + cy) * z + oy)
    return X, Y


def hit_test(model, state, point):
    px, py = point["x"], point["y"]
    for c in (px, py):
        if not isinstance(c, (int, float)) or isinstance(c, bool):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if math.isnan(c) or math.isinf(c):
            raise IgrError("INVALID_INPUT", "NOT_FINITE")
        if abs(c) > 2**31:
            raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
    Px = quantize(float(px)) * 1000
    Py = quantize(float(py)) * 1000
    v = state["viewport"]
    if not (0 <= Px <= v["width"] * S and 0 <= Py <= v["height"] * S):
        return None
    vn, ve = effective_visibility(model, state)
    X, Y = screen_positions(model, state)
    best = None
    for i, n in enumerate(model.nodes):
        if not vn[i]:
            continue
        d2 = (X[i] - Px) ** 2 + (Y[i] - Py) ** 2
        if d2 <= (12 * S) ** 2 and (best is None or d2 < best[0]):
            best = (d2, i)
    if best is not None:
        return {"node": model.nodes[best[1]]["ref"]}
    bestE = None  # (num, den, idx): distance^2 = num/den
    for e in model.edges:
        if not ve[e["index"]]:
            continue
        ax, ay = X[e["src"]], Y[e["src"]]
        bx, by = X[e["tgt"]], Y[e["tgt"]]
        if (ax, ay) == (bx, by):
            continue
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        tn = (Px - ax) * dx + (Py - ay) * dy
        if not (0 < tn < L2):
            continue
        cross = (Px - ax) * dy - (Py - ay) * dx
        if cross * cross <= (6 * S) ** 2 * L2:
            num, den = cross * cross, L2
            if bestE is None or num * bestE[1] < bestE[0] * den:
                bestE = (num, den, e["index"])
    if bestE is not None:
        return {"edge": model.edges[bestE[2]]["ref"]}
    return None


# ----------------------------------------------------------------------------
# document writer (sections 5-8, 14)
# ----------------------------------------------------------------------------
CSS = [
    ".igr-svg{font:12px sans-serif}",
    ".igr-shape{stroke:#fff;stroke-width:2}",
    ".igr-k0 .igr-shape{fill:#2a78d6}",
    ".igr-k1 .igr-shape{fill:#eb6834}",
    ".igr-k2 .igr-shape{fill:#1baf7a}",
    ".igr-k3 .igr-shape{fill:#eda100}",
    ".igr-k4 .igr-shape{fill:#e87ba4}",
    ".igr-k5 .igr-shape{fill:#008300}",
    ".igr-k6 .igr-shape{fill:#4a3aa7}",
    ".igr-k7 .igr-shape{fill:#e34948}",
    ".igr-kx .igr-shape{fill:#7a7975}",
    ".igr-line{fill:none;stroke:currentColor;stroke-opacity:.6;stroke-width:2}",
    ".igr-pick{fill:none;stroke:transparent;stroke-width:10;pointer-events:stroke}",
    ".igr-arrow{fill:currentColor;fill-opacity:.6}",
    ".igr-ring-sel{fill:none;stroke:currentColor;stroke-width:3}",
    ".igr-ring-foc{fill:none;stroke:currentColor;stroke-width:2;stroke-dasharray:4 3}",
    ".igr-halo-sel{fill:none;stroke:currentColor;stroke-width:6;stroke-opacity:.35}",
    ".igr-halo-foc{fill:none;stroke:currentColor;stroke-width:10;stroke-opacity:.25;stroke-dasharray:6 4}",
    ".igr-label,.igr-elabel{fill:currentColor;unicode-bidi:isolate;pointer-events:none}",
]
assert len(CSS) == 19

SVG_FORMAT = "igr-svg/1"
DEFAULT_SVG_LIMITS = {"maxSvgBytes": 67108864, "maxDrawnLabelUnits": 1048576}
OPTION_KEYS = ("edgeLabels", "idPrefix", "labels", "maxDrawnLabelUnits", "maxSvgBytes", "style", "xmlDeclaration")
NODE_R, TRIM, PAR_STEP = 10, 12, 16
DEGENERATE = 24 * S


def _tok(v):
    if isinstance(v, str) and v in ("NaN", "Infinity", "-Infinity"):
        return float(v.replace("Infinity", "inf"))
    return v


def validate_options(options):
    """2.1 steps (2) and (3). Returns the resolved option dict."""
    o = {"edgeLabels": not M("K66"), "idPrefix": "igr", "labels": True,
         "maxDrawnLabelUnits": DEFAULT_SVG_LIMITS["maxDrawnLabelUnits"],
         "maxSvgBytes": DEFAULT_SVG_LIMITS["maxSvgBytes"], "style": True, "xmlDeclaration": False}
    if options is None:
        return o
    if isinstance(options, list) and M("K71"):
        return o
    if not isinstance(options, dict):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if not M("K70"):
        for k in options:
            if k not in OPTION_KEYS:
                raise IgrError("INVALID_INPUT", "SCHEMA", f"unknown key {k}")
    for k in OPTION_KEYS:
        if k not in options:
            continue
        v = options[k]
        if k in ("edgeLabels", "labels", "style", "xmlDeclaration"):
            if not isinstance(v, bool):
                raise IgrError("INVALID_INPUT", "SCHEMA")
        elif k == "idPrefix":
            if not isinstance(v, str):
                raise IgrError("INVALID_INPUT", "SCHEMA")
            if not PREFIX_RE.match(v) and not M("K48"):
                raise IgrError("INVALID_INPUT", "INVALID_VALUE")
        else:
            v = _tok(v)
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise IgrError("INVALID_INPUT", "SCHEMA")
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                raise IgrError("INVALID_INPUT", "NOT_FINITE")
            if isinstance(v, float) and v != math.floor(v):
                raise IgrError("INVALID_INPUT", "INVALID_VALUE")
            if v < 0 or v > 2**31:
                raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
            v = int(v)
        o[k] = v
    return o


def _trim(P, Q, t):
    qx, qy = Q[0] - P[0], Q[1] - P[1]
    n = qx * qx + qy * qy
    k = isqrt(n)
    if M("K11"):
        sq = math.sqrt(float(n))
        return (P[0] + math.floor(float(qx) * t / sq + 0.5), P[1] + math.floor(float(qy) * t / sq + 0.5))
    lam = k
    if M("K09"):
        lam = k + 1 if n >= k * k + k + 1 else k
    if M("K10"):
        return (P[0] + floor_div(qx * t, lam), P[1] + floor_div(qy * t, lam))
    return (P[0] + div_round(qx * t, lam), P[1] + div_round(qy * t, lam))


def _pt(p):
    return f"{fmt(p[0])} {fmt(p[1])}"


def edge_plan(model, state, vn, ve, X, Y):
    """Returns {edge_index: (d, anchor, cls)} for visible edges (6.2-6.6)."""
    trimv = 11 * S if M("K08") else TRIM * S
    pstep = (15 if M("K26") else PAR_STEP) * S
    vis = [e for e in model.edges if ve[e["index"]]]
    groups = {}
    for e in model.edges:
        if e["src"] == e["tgt"]:
            continue
        if not M("K25") and not ve[e["index"]]:
            continue
        key = (e["src"], e["tgt"]) if M("K24") else (min(e["src"], e["tgt"]), max(e["src"], e["tgt"]))
        groups.setdefault(key, []).append(e["index"])
    loop_rank = {}
    loop_ct = {}
    glob = 0
    plan = {}
    for e in vis:
        i = e["index"]
        s, t = e["src"], e["tgt"]
        A = (X[s], Y[s]); B = (X[t], Y[t])
        if s == t:
            r = glob if M("K21") else loop_ct.get(s, 0)
            glob += 1
            loop_ct[s] = loop_ct.get(s, 0) + 1
            u = 8 + 4 * r
            h = 24 + 12 * r
            x, y = A
            d = ("M " + fmt(x - 7 * S) + " " + fmt(y - 7 * S) + " C " + fmt(x - (7 + u) * S) + " " + fmt(y - (7 + h) * S)
                 + " " + fmt(x + (7 + u) * S) + " " + fmt(y - (7 + h) * S) + " " + fmt(x + 7 * S) + " " + fmt(y - 7 * S))
            anchor = (x, y - (25 + (8 if M("K28") else 9) * r) * S)
            plan[i] = (d, anchor, "loop")
            continue
        dx, dy = B[0] - A[0], B[1] - A[1]
        L = isqrt(dx * dx + dy * dy)
        if M("K16"):
            degen = math.sqrt(float(dx * dx + dy * dy)) <= DEGENERATE
        elif M("K15"):
            degen = L < DEGENERATE
        else:
            degen = L <= DEGENERATE
        if degen and not (M("K17") and L > 0):
            if M("K18") and L == 0:
                plan[i] = ("M NaN NaN L NaN NaN", (0, 0), "degen")
                continue
            d = f"M {_pt(A)} L {_pt(B)}"
            if M("K109"):
                anchor = (floor_div(A[0] + B[0], 2), floor_div(A[1] + B[1], 2))
            else:
                anchor = (div_round(A[0] + B[0], 2), div_round(A[1] + B[1], 2))
            plan[i] = (d, anchor, "degen")
            continue
        if degen:  # K17: trimmed anyway
            A2 = _trim(A, B, trimv); B2 = _trim(B, A, trimv)
            plan[i] = (f"M {_pt(A2)} L {_pt(B2)}", (div_round(A2[0] + B2[0], 2), div_round(A2[1] + B2[1], 2)), "degen")
            continue
        key = (s, t) if M("K24") else (min(s, t), max(s, t))
        grp = groups[key]
        if len(grp) == 1:
            A2 = _trim(A, B, trimv); B2 = _trim(B, A, trimv)
            d = f"M {_pt(A2)} L {_pt(B2)}"
            if M("K12"):
                anchor = (floor_div(A2[0] + B2[0], 2), floor_div(A2[1] + B2[1], 2))
            else:
                anchor = (div_round(A2[0] + B2[0], 2), div_round(A2[1] + B2[1], 2))
            plan[i] = (d, anchor, "straight")
            continue
        k = len(grp)
        p = grp.index(i)
        lo, hi = min(s, t), max(s, t)
        if M("K23"):
            Fx, Fy = B[0] - A[0], B[1] - A[1]
        else:
            Fx, Fy = X[hi] - X[lo], Y[hi] - Y[lo]
        nf = Fx * Fx + Fy * Fy
        Lf = isqrt(nf)
        if M("K111"):
            Lf = Lf + 1 if nf >= Lf * Lf + Lf + 1 else Lf
        off = (2 * p - (k - 1)) * pstep
        if M("K110"):
            Mx, My = floor_div(A[0] + B[0], 2), floor_div(A[1] + B[1], 2)
        else:
            Mx, My = div_round(A[0] + B[0], 2), div_round(A[1] + B[1], 2)
        if M("K14"):
            C = (Mx + floor_div(-Fy * off, Lf), My + floor_div(Fx * off, Lf))
        else:
            C = (Mx + div_round(-Fy * off, Lf), My + div_round(Fx * off, Lf))
        if M("K27"):
            A2 = _trim(A, B, trimv); B2 = _trim(B, A, trimv)
        else:
            A2 = _trim(A, C, trimv); B2 = _trim(B, C, trimv)
        d = f"M {_pt(A2)} Q {_pt(C)} {_pt(B2)}"
        if M("K13"):
            anchor = (floor_div(A2[0] + 2 * C[0] + B2[0], 4), floor_div(A2[1] + 2 * C[1] + B2[1], 4))
        else:
            anchor = (div_round(A2[0] + 2 * C[0] + B2[0], 4), div_round(A2[1] + 2 * C[1] + B2[1], 4))
        plan[i] = (d, anchor, "parallel")
    return plan


def label_plan(model, vn, ve, o):
    """7.5: returns (node_text {i: text|None}, edge_text {i: text|None}, fidelity, units)."""
    lbl = o["labels"]
    elabel = lbl and o["edgeLabels"]
    ntext, etext = {}, {}
    total = 0
    truncated = False
    omitted = False
    stopped = False
    budget = o["maxDrawnLabelUnits"]
    seq = []
    if lbl:
        for n in model.nodes:
            if vn[n["index"]]:
                seq.append(("n", n["index"], n["label"]))
        if elabel:
            for e in model.edges:
                if ve[e["index"]]:
                    seq.append(("e", e["index"], e["label"]))
    for k, i, s in seq:
        base = xs(s.replace("\t", " ").replace("\n", " ").replace("\r", " ")) if not M("K35") else xs(s)
        t = dl(s)
        if t != base:
            truncated = True
        if t == "" and not M("K61"):
            (ntext if k == "n" else etext)[i] = None
            continue
        ln = len16(t)
        if stopped:
            (ntext if k == "n" else etext)[i] = None
            omitted = True
            continue
        over = (total + ln >= budget) if M("K64") else (total + ln > budget)
        if over:
            (ntext if k == "n" else etext)[i] = None
            omitted = True
            if not M("K65"):
                stopped = True
            continue
        total += ln
        (ntext if k == "n" else etext)[i] = t
    fid = {"labels": "none" if not lbl else ("elided" if (truncated or omitted) else "full"),
           "edge_labels": bool(elabel)}
    return ntext, etext, fid, total


def _cat_class(model, cat, vn=None):
    cats = model.categories
    if M("K60") and vn is not None:
        # redefined K60: the index is taken over the categories of VISIBLE nodes only
        vis = {n["category"] for n in model.nodes if vn[n["index"]]}
        cats = [c for c in model.categories if c in vis]
    c = cats.index(cat)
    if M("K59"):
        return f"igr-k{c % 8}"
    return f"igr-k{c}" if c < 8 else "igr-kx"


def doc_lines(model, state, o):
    """Generator of the document lines (each ends with LF). Pure function of its arguments."""
    P = o["idPrefix"]
    pre_url = "igr" if M("K49") else P
    vn, ve = effective_visibility(model, state)
    X, Y = screen_positions(model, state)
    plan = edge_plan(model, state, vn, ve, X, Y)
    ntext, etext, fid, units = label_plan(model, vn, ve, o)
    v = state["viewport"]
    W, H = v["width"], v["height"]
    f = _focus_of(model, state)
    sel_n = {model.lookup_node(r) for r in state["selection"]["nodes"]}
    sel_e = {model.lookup_edge(r) for r in state["selection"]["edges"]}
    nodes_vis = [i for i in range(len(model.nodes)) if vn[i] or M("K51")]
    edges_vis = [i for i in range(len(model.edges)) if ve[i] or M("K51")]
    if M("K51"):
        nodes_vis = list(range(len(model.nodes)))
        edges_vis = [i for i in range(len(model.edges))]
        for i in edges_vis:
            if i not in plan:
                e = model.edges[i]
                A = (X[e["src"]], Y[e["src"]]); B = (X[e["tgt"]], Y[e["tgt"]])
                plan[i] = (f"M {_pt(A)} L {_pt(B)}", (div_round(A[0] + B[0], 2), div_round(A[1] + B[1], 2)), "x")
    if M("K77"):
        on = lambda k: 0 <= X[k] <= W * S and 0 <= Y[k] <= H * S
        nodes_vis = [i for i in nodes_vis if on(i)]
        edges_vis = [i for i in edges_vis if on(model.edges[i]["src"]) or on(model.edges[i]["tgt"])]
    # tab stop
    tab = None
    if M("K53"):
        # two stops (focus and the first model node) or none (first model node hidden)
        tab = {f, ("n", 0) if model.nodes else None} - {None}
    elif f is not None:
        tab = f
    elif nodes_vis:
        tab = ("n", nodes_vis[0])
    elif edges_vis:
        tab = ("e", edges_vis[0])
    if M("K76") and model.bounds():
        b = model.bounds()
        VW, VH = max(1, (b[2] - b[0]) // 1000), max(1, (b[3] - b[1]) // 1000)
    else:
        VW, VH = W, H
    artifact_attr = model.scene_sha if M("K78") else model.artifact
    if o["xmlDeclaration"]:
        yield '<?xml version="1.0" encoding="UTF-8"?>' + ("" if M("K73") else "\n")
    if M("K75"):
        yield (f'<svg xmlns="http://www.w3.org/2000/svg" role="graphics-document" class="igr-svg" width="{W}" height="{H}" viewBox="0 0 {VW} {VH}"'
               f' aria-roledescription="graph" aria-labelledby="{pre_url}-title" aria-describedby="{pre_url}-desc" data-igr-svg="igr-svg/1" data-igr-artifact="{artifact_attr}"'
               f' data-igr-scene="{model.scene_sha}" data-igr-layout="{model.layout_sha}">\n')
    else:
        yield (f'<svg xmlns="http://www.w3.org/2000/svg" class="igr-svg" width="{W}" height="{H}" viewBox="0 0 {VW} {VH}"'
               f' role="graphics-document" aria-roledescription="graph" aria-labelledby="{pre_url}-title" aria-describedby="{pre_url}-desc"'
               f' data-igr-svg="igr-svg/1" data-igr-artifact="{artifact_attr}" data-igr-scene="{model.scene_sha}" data-igr-layout="{model.layout_sha}">\n')
    yield f'<title id="{P}-title">{TEXT(summary_text(model))}</title>\n'
    yield f'<desc id="{P}-desc">{TEXT(status_text(model, state))}</desc>\n'
    if o["style"] or M("K67"):
        yield "<style>\n"
        for ln in CSS:
            yield ln + "\n"
        yield "</style>\n"
    show_defs = model.directed and (bool(edges_vis) if M("K62") else True)
    if show_defs:
        yield (f'<defs><marker id="{P}-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10"'
               f' markerUnits="userSpaceOnUse" orient="auto"><path class="igr-arrow" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>\n')

    def gen_nodes():
        yield '<g class="igr-nodes">\n'
        for i in nodes_vis:
            n = model.nodes[i]
            sel = i in sel_n
            foc = f == ("n", i)
            cls = "igr-node " + _cat_class(model, n["category"], vn)
            if M("K56"):
                cls += (" igr-focused" if foc else "") + (" igr-selected" if sel else "")
            else:
                cls += (" igr-selected" if sel else "") + (" igr-focused" if foc else "")
            tb = "0" if ((tab == ("n", i)) if not isinstance(tab, set) else (("n", i) in tab)) else "-1"
            nm = node_name(model, i)
            if M("K41"):
                nm = dl(nm.strip())
            if M("K42"):
                nm = unicodedata.normalize("NFC", nm)
            nid = element_dom_id(P, {"node": n["ref"]}) if not M("K43") else f"{P}-n-{i}"
            yield (f'<g id="{nid}" class="{cls}" role="graphics-symbol"'
                   f' aria-roledescription="node" aria-label="{ATTR(nm)}" tabindex="{tb}">\n')
            yield f"<title>{TEXT(nm)}</title>\n"
            cx, cy = fmt(X[i]), fmt(Y[i])
            rs = f'<circle class="igr-ring-sel" cx="{cx}" cy="{cy}" r="14"/>\n'
            rf = f'<circle class="igr-ring-foc" cx="{cx}" cy="{cy}" r="18"/>\n'
            shape = f'<circle class="igr-shape" cx="{cx}" cy="{cy}" r="10"/>\n'
            if not M("K54"):
                if M("K55"):
                    if foc:
                        yield rf
                    if sel:
                        yield rs
                else:
                    if sel:
                        yield rs
                    if foc:
                        yield rf
            yield shape
            t = ntext.get(i)
            if t is not None:
                yield f'<text class="igr-label" x="{cx}" y="{fmt(Y[i] + 24 * S)}" text-anchor="middle">{TEXT(t)}</text>\n'
            yield "</g>\n"
        yield "</g>\n"

    def gen_edges():
        yield '<g class="igr-edges">\n'
        for i in edges_vis:
            e = model.edges[i]
            sel = i in sel_e
            foc = f == ("e", i)
            cls = "igr-edge"
            if M("K56"):
                cls += (" igr-focused" if foc else "") + (" igr-selected" if sel else "")
            else:
                cls += (" igr-selected" if sel else "") + (" igr-focused" if foc else "")
            tb = "0" if ((tab == ("e", i)) if not isinstance(tab, set) else (("e", i) in tab)) else "-1"
            d, anchor, _c = plan[i]
            nm = edge_name(model, i)
            ds = edge_desc(model, i)
            if M("K41"):
                nm = dl(nm.strip()); ds = dl(ds.strip())
            if M("K42"):
                nm = unicodedata.normalize("NFC", nm); ds = unicodedata.normalize("NFC", ds)
            eid = element_dom_id(P, {"edge": e["ref"]}) if not M("K43") else f"{P}-e-{i}"
            yield (f'<g id="{eid}" class="{cls}" role="graphics-symbol"'
                   f' aria-roledescription="edge" aria-label="{ATTR(nm)}" tabindex="{tb}">\n')
            yield f"<title>{TEXT(nm)}</title>\n"
            yield f"<desc>{TEXT(ds)}</desc>\n"
            hs = f'<path class="igr-halo-sel" d="{d}"/>\n'
            hf = f'<path class="igr-halo-foc" d="{d}"/>\n'
            marker = f' marker-end="url(#{pre_url}-arrow)"'
            if M("K19"):
                mk = marker
            elif M("K20"):
                mk = ""
            elif M("K22") and plan[i][2] == "loop":
                mk = marker
            else:
                mk = marker if model.directed else ""
            line = f'<path class="igr-line" d="{d}"{mk}/>\n'
            pick = f'<path class="igr-pick" d="{d}"{mk if M("K63") else ""}/>\n'
            halos = []
            if not M("K54"):
                if M("K55"):
                    if foc:
                        halos.append(hf)
                    if sel:
                        halos.append(hs)
                else:
                    if sel:
                        halos.append(hs)
                    if foc:
                        halos.append(hf)
            if M("K55"):
                yield line
                for h_ in halos:
                    yield h_
            else:
                for h_ in halos:
                    yield h_
                yield line
            yield pick
            t = etext.get(i)
            if t is not None:
                yield f'<text class="igr-elabel" x="{fmt(anchor[0])}" y="{fmt(anchor[1] - 4 * S)}" text-anchor="middle">{TEXT(t)}</text>\n'
            yield "</g>\n"
        yield "</g>\n"

    if M("K50"):
        yield from gen_edges()
        yield from gen_nodes()
    else:
        yield from gen_nodes()
        yield from gen_edges()
    yield ("</svg>" if M("K74") else "</svg>\n")


def _utf8len(s):
    return len(s.encode("utf-8"))


def write_svg(model, state, options, sink):
    """Streaming writer. Returns {fidelity, label_units, bytes}."""
    if not callable(sink):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if not isinstance(model, Model):
        raise IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL")
    o = validate_options(options)
    if not M("K72"):
        validate_state(model, state)
    vn, ve = effective_visibility(model, state)
    _nt, _et, fid, units = label_plan(model, vn, ve, o)
    limit = o["maxSvgBytes"]
    total = 0
    if M("K69"):
        lines = list(doc_lines(model, state, o))
        for ln in lines:
            sink(ln)
            total += _utf8len(ln)
        if total > limit:
            raise IgrError("RESOURCE_LIMIT", "BYTES_LIMIT")
    else:
        for ln in doc_lines(model, state, o):
            n = _utf8len(ln)
            if (total + n >= limit) if M("K68") else ((total + n > limit + 1) if M("K114") else (total + n > limit)):
                raise IgrError("RESOURCE_LIMIT", "BYTES_LIMIT")
            sink(ln)
            total += n
    return {"fidelity": fid, "label_units": units, "bytes": total}


def render_svg_detailed(model, state, options=None):
    buf = []
    r = write_svg(model, state, options, buf.append)
    r = dict(r)
    r["svg"] = "".join(buf)
    return r


def render_svg(model, state, options=None):
    return render_svg_detailed(model, state, options)["svg"]


# ----------------------------------------------------------------------------
# pickElement (9.3)
# ----------------------------------------------------------------------------
def _effectively_visible(model, state, el):
    vn, ve = effective_visibility(model, state)
    return (vn if el[0] == "n" else ve)[el[1]]


def pick_element(model, state, prefix, inp):
    if not isinstance(model, Model):
        raise IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL")
    validate_state(model, state)
    if not isinstance(prefix, str) or not PREFIX_RE.match(prefix):
        raise IgrError("INVALID_INPUT", "INVALID_VALUE")
    if not isinstance(inp, dict) or not set(inp.keys()) <= {"targetId", "point"}:
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if "targetId" in inp and not isinstance(inp["targetId"], str):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    pt = inp.get("point")
    if "point" in inp:
        if not isinstance(pt, dict) or set(pt.keys()) != {"x", "y"}:
            raise IgrError("INVALID_INPUT", "SCHEMA")
        for c in (pt["x"], pt["y"]):
            c = _tok(c)
            if isinstance(c, bool) or not isinstance(c, (int, float)):
                raise IgrError("INVALID_INPUT", "SCHEMA")
            if math.isnan(c) or math.isinf(c):
                raise IgrError("INVALID_INPUT", "NOT_FINITE")
            if abs(c) > 2**31:
                raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
    a = None
    if "targetId" in inp:
        a = decode_element_id(prefix, inp["targetId"])
    if M("K100") and pt is not None:
        h = hit_test(model, state, pt)
        if h is not None:
            return h
    if a is not None:
        el = model.lookup(a)
        ok = el is not None and (_effectively_visible(model, state, el) or M("K99"))
        if M("K99") and el is None:
            ok = False
        if ok:
            if "node" in a:
                return a
            if pt is not None and not M("K112"):
                h = hit_test(model, state, pt)
                if h is not None and "node" in h:
                    return h
            return a
    if pt is not None:
        return hit_test(model, state, pt)
    return None


# ----------------------------------------------------------------------------
# strict reader (5.6) with per-rule switches (DIS) and the mutants K82-K97, K113
# ----------------------------------------------------------------------------
DEFAULT_READ_LIMITS = {"maxBytes": 67108864, "maxLineUnits": 16777216}

_NUM = r"-?(?:0|[1-9][0-9]*)(?:\.(?:[0-9]{2}[1-9]|[0-9][1-9]|[1-9]))?"
_NUM_RE = re.compile("^" + _NUM + "$")
_D_RE = re.compile(r"^M N N (?:L N N|Q N N N N|C N N N N N N)$".replace("N", _NUM))
_ATTRV = re.compile(r"^(?:[^\"<>&\n\r\t\x00-\x08\x0b\x0c\x0e-\x1f￾￿]|&(?:amp|lt|gt|quot|#9|#10|#13);)*$")
_TEXTV = re.compile(r"^(?:[^<>&\n\r\x00-\x08\x0b\x0c\x0e-\x1f￾￿]|&(?:amp|lt|gt|#10|#13);)*$")
_TEXTV_LENIENT_ENT = re.compile(r"^(?:[^<>&\n\r\x00-\x08\x0b\x0c\x0e-\x1f￾￿]|&[A-Za-z0-9#]+;)*$")
_TEXTV_LENIENT_LT = re.compile(r"^(?:[^>&\n\r]|&(?:amp|lt|gt|#10|#13);)*$")
_ENT = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#9;": "\t", "&#10;": "\n", "&#13;": "\r"}
_ENT_RE = re.compile(r"&(?:amp|lt|gt|quot|#9|#10|#13);")


def _decode(s):
    return _ENT_RE.sub(lambda m: _ENT[m.group(0)], s)


def _schema(line_no, why):
    return IgrError("INVALID_INPUT", "SCHEMA", f"line {line_no}: {why}")


class _Reader:
    def __init__(self, text, dis):
        self.dis = dis
        self.lines = text.split("\n")
        self.pos = 0

    def cur(self):
        return self.lines[self.pos] if self.pos < len(self.lines) else None

    def fail(self, why):
        raise _schema(self.pos + 1, why)


_SVG_OPEN = re.compile(
    r'^<svg xmlns="http://www\.w3\.org/2000/svg" class="igr-svg" width="([0-9]+)" height="([0-9]+)" viewBox="0 0 ([0-9]+) ([0-9]+)"'
    r' role="graphics-document" aria-roledescription="graph" aria-labelledby="([^"]*)" aria-describedby="([^"]*)"'
    r' data-igr-svg="igr-svg/1" data-igr-artifact="([0-9a-f]{64})" data-igr-scene="([0-9a-f]{64})" data-igr-layout="([0-9a-f]{64})">$')
_TITLE = re.compile(r'^<title id="([^"]*)">(.*)</title>$')
_DESC = re.compile(r'^<desc id="([^"]*)">(.*)</desc>$')
_DEFS = re.compile(
    r'^<defs><marker id="([^"]*)" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10"'
    r' markerUnits="userSpaceOnUse" orient="auto"><path class="igr-arrow" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>$')
_NODE_G = re.compile(
    r'^<g id="([^"]*)" class="igr-node igr-(k[0-7]|kx)( igr-selected)?( igr-focused)?" role="graphics-symbol"'
    r' aria-roledescription="node" aria-label="([^"]*)" tabindex="(0|-1)">$')
_EDGE_G = re.compile(
    r'^<g id="([^"]*)" class="igr-edge( igr-selected)?( igr-focused)?" role="graphics-symbol"'
    r' aria-roledescription="edge" aria-label="([^"]*)" tabindex="(0|-1)">$')
_CIRC = re.compile(r'^<circle class="(igr-ring-sel|igr-ring-foc|igr-shape)" cx="([^"]*)" cy="([^"]*)" r="(14|18|10)"/>$')
_PATH = re.compile(r'^<path class="(igr-halo-sel|igr-halo-foc|igr-line|igr-pick)" d="([^"]*)"( marker-end="url\(#([^"]*)\)")?/>$')
_TEXTEL = re.compile(r'^<text class="(igr-label|igr-elabel)" x="([^"]*)" y="([^"]*)" text-anchor="middle">(.*)</text>$')
_PREFIX_TITLE = re.compile(r"^([a-z][a-z0-9-]{0,31})-title$")
_DESC_W8 = re.compile(r"^[0-9]+ selected, [0-9]+ hidden\.( Focus: .+\.)?$", re.S)


def read_svg(svg, limits=None, dis=frozenset()):
    """Strict reader. Raises IgrError(INVALID_INPUT/SCHEMA | RESOURCE_LIMIT/BYTES_LIMIT)."""
    lim = dict(DEFAULT_READ_LIMITS)
    if limits:
        lim.update({k: v for k, v in limits.items() if v is not None})
    dis = set(dis)
    # mutant-induced leniences
    if M("K82"): dis.add("script")
    if M("K83"): dis.add("attr")
    if M("K84"): dis |= {"crlf", "indent"}
    if M("K85"): dis.add("multiline")
    if M("K86"): dis.add("W1dup")
    if M("K87"): dis.add("W1dec")
    if M("K88"): dis.add("W2")
    if M("K89"): dis.add("W3")
    if M("K90"): dis.add("W4")
    if M("K91"): dis.add("W5")
    if M("K92"): dis.add("W6")
    if M("K93"): dis.add("W7")
    if M("K94"): dis.add("W8")
    if M("K95"): dis.add("W9")
    if M("K96"): dis.add("W10")
    if M("K97"): dis.add("bounds")
    if M("K113"): dis.add("style")
    if not isinstance(svg, str):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if "bounds" not in dis:
        if len(svg.encode("utf-8", "surrogatepass")) > lim["maxBytes"]:
            raise IgrError("RESOURCE_LIMIT", "BYTES_LIMIT")
        for ln in svg.split("\n"):
            if len16(ln) > lim["maxLineUnits"]:
                raise IgrError("RESOURCE_LIMIT", "BYTES_LIMIT")
    text = svg
    if "crlf" in dis:
        text = text.replace("\r\n", "\n")
    if "indent" in dis:
        text = "\n".join(l.lstrip(" ") for l in text.split("\n"))
    if "\r" in text:
        raise _schema(1, "CR")
    if not text.endswith("\n"):
        raise _schema(text.count("\n") + 1, "missing final LF")
    R = _Reader(text, dis)
    R.lines = text.split("\n")[:-1]  # drop the empty tail
    if "script" in dis:
        R.lines = [l for l in R.lines if not re.match(r"^<script>.*</script>$", l)]
    if "multiline" in dis:
        # join a <title>/<desc> line that is not closed with its following lines
        out, i = [], 0
        L = R.lines
        while i < len(L):
            cur = L[i]
            while (cur.startswith("<title") or cur.startswith("<desc")) and not (cur.endswith("</title>") or cur.endswith("</desc>")) and i + 1 < len(L):
                i += 1
                cur = cur + "&#10;" + L[i]
            out.append(cur)
            i += 1
        R.lines = out

    def strip_unknown_attrs(line):
        if "attr" in dis:
            line = re.sub(r' (?:onclick|xlink:href|href)="[^"]*"', "", line)
        return line

    def cur():
        if R.pos >= len(R.lines):
            return None
        return strip_unknown_attrs(R.lines[R.pos])

    def need(rx, why):
        ln = cur()
        if ln is None:
            R.fail("unexpected end: " + why)
        m = rx.match(ln)
        if not m:
            R.fail(why)
        R.pos += 1
        return m

    def text_ok(s):
        if "entity" in dis:
            return bool(_TEXTV_LENIENT_ENT.match(s))
        if "rawlt" in dis:
            return bool(_TEXTV_LENIENT_LT.match(s))
        return bool(_TEXTV.match(s))

    def attr_ok(s):
        return bool(_ATTRV.match(s))

    out = {"styled": False, "directed": False, "nodes": [], "edges": []}
    # declaration / doctype
    ln = cur()
    if ln == '<?xml version="1.0" encoding="UTF-8"?>':
        R.pos += 1
    if "doctype" in dis and cur() is not None and cur().startswith("<!DOCTYPE"):
        R.pos += 1
    m = need(_SVG_OPEN, "svg root")
    W, H, VW, VH, lab, desc_, a, s_, l_ = m.groups()
    if "W9" not in dis:
        if (W, H) != (VW, VH):
            R.pos -= 1
            R.fail("width/height differ from viewBox (W9)")
        if not (1 <= int(W) <= 16384 and 1 <= int(H) <= 16384):
            R.pos -= 1
            R.fail("size out of range (W9)")
    pm = _PREFIX_TITLE.match(lab)
    if not pm:
        R.pos -= 1
        R.fail("aria-labelledby is not P-title")
    P = pm.group(1)
    out.update(idPrefix=P, width=int(W), height=int(H), artifact_sha256=a, scene_sha256=s_, layout_sha256=l_)
    # title / desc
    tm = need(_TITLE, "root title")
    if not text_ok(tm.group(2)):
        R.pos -= 1
        R.fail("bad title text")
    dm = need(_DESC, "root desc")
    if not text_ok(dm.group(2)):
        R.pos -= 1
        R.fail("bad desc text")
    if "W2" not in dis:
        if tm.group(1) != lab or dm.group(1) != desc_ or desc_ != P + "-desc":
            R.fail("root ids do not agree with aria-labelledby/describedby (W2)")
    out["title"] = _decode(tm.group(2))
    out["desc"] = _decode(dm.group(2))
    if "W8" not in dis:
        if not (tm.group(2).startswith("Directed graph with ") or tm.group(2).startswith("Undirected graph with ")):
            R.fail("root title form (W8)")
        if not _DESC_W8.match(dm.group(2)):
            R.fail("root desc form (W8)")
    # style
    if cur() == "<style>":
        R.pos += 1
        body = []
        while cur() is not None and cur() != "</style>":
            body.append(cur())
            R.pos += 1
        if cur() != "</style>":
            R.fail("unterminated style")
        R.pos += 1
        if "style" not in dis and body != CSS:
            R.pos -= 1
            R.fail("style body differs from the theme")
        out["styled"] = True
    # defs
    marker_id = None
    if cur() is not None and cur().startswith("<defs>"):
        dm2 = need(_DEFS, "defs")
        marker_id = dm2.group(1)
        out["directed"] = True
        if "W2" not in dis and marker_id != P + "-arrow":
            R.pos -= 1
            R.fail("marker id (W2)")

    def read_group(kind):
        want = '<g class="igr-nodes">' if kind == "n" else '<g class="igr-edges">'
        if cur() != want:
            R.fail(f"expected {want}")
        R.pos += 1
        lst = []
        while cur() is not None and cur() != "</g>":
            lst.append(read_node() if kind == "n" else read_edge())
        if cur() != "</g>":
            R.fail("unterminated group")
        R.pos += 1
        return lst

    def read_node():
        m = need(_NODE_G, "node group")
        id_, cat, sel, foc, label, tab = m.groups()
        if not attr_ok(label):
            R.pos -= 1
            R.fail("bad aria-label")
        tm = need(re.compile(r"^<title>(.*)</title>$"), "node title")
        if not text_ok(tm.group(1)):
            R.pos -= 1
            R.fail("bad node title")
        circles = {}
        order = []
        while cur() is not None and _CIRC.match(cur()):
            c = _CIRC.match(cur())
            R.pos += 1
            k = c.group(1)
            if k in circles or not (_is_num(c.group(2)) and _is_num(c.group(3))):
                R.pos -= 1
                R.fail("circle")
            if (k, c.group(4)) not in (("igr-ring-sel", "14"), ("igr-ring-foc", "18"), ("igr-shape", "10")):
                R.pos -= 1
                R.fail("circle radius")
            circles[k] = (c.group(2), c.group(3))
            order.append(k)
        if order not in (["igr-shape"], ["igr-ring-sel", "igr-shape"], ["igr-ring-foc", "igr-shape"],
                         ["igr-ring-sel", "igr-ring-foc", "igr-shape"]):
            R.fail("node circles")
        label_el = None
        if cur() is not None and cur().startswith("<text"):
            t = need(_TEXTEL, "node text")
            if t.group(1) != "igr-label" or not text_ok(t.group(4)) or not (_is_num(t.group(2)) and _is_num(t.group(3))):
                R.pos -= 1
                R.fail("node text")
            label_el = _decode(t.group(4))
        if cur() != "</g>":
            R.fail("node end")
        R.pos += 1
        if "W4" not in dis:
            if bool(sel) != ("igr-ring-sel" in circles) or bool(foc) != ("igr-ring-foc" in circles):
                R.fail("ring/class mismatch (W4)")
            if len({v for v in circles.values()}) != 1:
                R.fail("circle centres differ (W4)")
        return {"id": id_, "category_class": "igr-" + cat, "selected": bool(sel), "focused": bool(foc),
                "tabindex": tab, "name": _decode(label), "title": _decode(tm.group(1)),
                "label": label_el, "cx": circles["igr-shape"][0], "cy": circles["igr-shape"][1]}

    def read_edge():
        m = need(_EDGE_G, "edge group")
        id_, sel, foc, label, tab = m.groups()
        if not attr_ok(label):
            R.pos -= 1
            R.fail("bad aria-label")
        tm = need(re.compile(r"^<title>(.*)</title>$"), "edge title")
        dm = need(re.compile(r"^<desc>(.*)</desc>$"), "edge desc")
        if not text_ok(tm.group(1)) or not text_ok(dm.group(1)):
            R.pos -= 1
            R.fail("bad edge text")
        paths = []
        while cur() is not None and _PATH.match(cur()):
            p = _PATH.match(cur())
            R.pos += 1
            if not _D_RE.match(p.group(2)):
                R.pos -= 1
                R.fail("bad path data")
            paths.append(p)
        kinds = [p.group(1) for p in paths]
        if kinds not in (["igr-line", "igr-pick"], ["igr-halo-sel", "igr-line", "igr-pick"],
                         ["igr-halo-foc", "igr-line", "igr-pick"], ["igr-halo-sel", "igr-halo-foc", "igr-line", "igr-pick"]):
            R.fail("edge paths " + ",".join(kinds))
        d_line = [p for p in paths if p.group(1) == "igr-line"][0]
        marker = d_line.group(3) is not None
        if marker and "W2" not in dis and d_line.group(4) != P + "-arrow":
            R.fail("marker-end target (W2)")
        for p in paths:
            if p.group(1) != "igr-line" and p.group(3):
                R.fail("marker on non-line path")
        if "W10" not in dis and len({p.group(2) for p in paths}) != 1:
            R.fail("path data differ (W10)")
        if "W4" not in dis:
            if bool(sel) != ("igr-halo-sel" in kinds) or bool(foc) != ("igr-halo-foc" in kinds):
                R.fail("halo/class mismatch (W4)")
        el = None
        lx = ly = None
        if cur() is not None and cur().startswith("<text"):
            t = need(_TEXTEL, "edge text")
            if t.group(1) != "igr-elabel" or not text_ok(t.group(4)) or not (_is_num(t.group(2)) and _is_num(t.group(3))):
                R.pos -= 1
                R.fail("edge text")
            el, lx, ly = _decode(t.group(4)), t.group(2), t.group(3)
        if cur() != "</g>":
            R.fail("edge end")
        R.pos += 1
        return {"id": id_, "selected": bool(sel), "focused": bool(foc), "tabindex": tab, "name": _decode(label),
                "title": _decode(tm.group(1)), "description": _decode(dm.group(1)), "d": d_line.group(2),
                "marker": marker, "label": el, "label_x": lx, "label_y": ly}

    def _is_num(s):
        return bool(_NUM_RE.match(s)) and s != "-0"

    # body: nodes then edges (or either order when W7 is disabled)
    if "script" in dis:
        pass
    first = cur()
    if "W7" in dis and first == '<g class="igr-edges">':
        edges = read_group("e")
        nodes = read_group("n")
    else:
        nodes = read_group("n")
        edges = read_group("e")
    if "script" in dis:
        pass
    if cur() != "</svg>":
        R.fail("expected </svg>")
    R.pos += 1
    if R.pos != len(R.lines):
        R.fail("content after </svg>")
    out["nodes"], out["edges"] = nodes, edges
    # consistency rules
    seen = set()
    for kind, lst in (("n", nodes), ("e", edges)):
        for el in lst:
            pre = f"{P}-{kind}-"
            addr = decode_element_id(P, el["id"]) if el["id"].startswith(pre) else None
            if "W1dec" not in dis:
                if not el["id"].startswith(pre) or addr is None or ("node" in addr) != (kind == "n"):
                    raise _schema(0, "id does not decode (W1)")
            if "W1dup" not in dis and el["id"] in seen:
                raise _schema(0, "duplicate id (W1)")
            seen.add(el["id"])
            el["address"] = None if addr is None else (addr.get("node") or addr.get("edge"))
    if "W3" not in dis:
        marks = [e["marker"] for e in edges]
        if marks and (any(marks) and not all(marks)):
            raise _schema(0, "marker-end on some edges only (W3)")
        if any(marks) and not out["directed"]:
            raise _schema(0, "marker-end without defs (W3)")
    if "W5" not in dis:
        tz = sum(1 for e in nodes + edges if e["tabindex"] == "0")
        want = 1 if (nodes or edges) else 0
        if tz != want:
            raise _schema(0, "tabindex=0 count (W5)")
    if "W6" not in dis:
        for e in nodes + edges:
            if e["title"] != e["name"]:
                raise _schema(0, "title differs from aria-label (W6)")
    return out


def _wire_of_readout(el):
    return el["address"]


def svg_witness(svg):
    ro = read_svg(svg)
    return {"backend": "igr-svg/1",
            "elements": {"edges": [e["address"] for e in ro["edges"]], "nodes": [n["address"] for n in ro["nodes"]]},
            "texts": [{"address": {"node": n["address"]}, "text": n["name"]} for n in ro["nodes"]]
                     + [{"address": {"edge": e["address"]}, "text": e["name"]} for e in ro["edges"]]}


def readout_projection(ro):
    """The canonical projection hashed by row T14 (documented in the corpus README)."""
    return {
        "idPrefix": ro["idPrefix"], "width": ro["width"], "height": ro["height"],
        "artifact_sha256": ro["artifact_sha256"], "scene_sha256": ro["scene_sha256"], "layout_sha256": ro["layout_sha256"],
        "title": ro["title"], "desc": ro["desc"], "styled": ro["styled"], "directed": ro["directed"],
        "nodes": [{"address": n["address"], "id": n["id"], "category_class": n["category_class"], "selected": n["selected"],
                   "focused": n["focused"], "tabindex": n["tabindex"], "name": n["name"],
                   **({"label": n["label"]} if n["label"] is not None else {}), "cx": n["cx"], "cy": n["cy"]} for n in ro["nodes"]],
        "edges": [{"address": e["address"], "id": e["id"], "selected": e["selected"], "focused": e["focused"],
                   "tabindex": e["tabindex"], "name": e["name"], "description": e["description"], "d": e["d"],
                   "marker": e["marker"],
                   **({"label": e["label"], "label_x": e["label_x"], "label_y": e["label_y"]} if e["label"] is not None else {})}
                  for e in ro["edges"]]}


# ----------------------------------------------------------------------------
# manifest (12.2)
# ----------------------------------------------------------------------------
def svg_manifest(host, options=None):
    # 12.2 gives a default renderer name that contains the product name; it is not reproduced in this corpus (A-53):
    # every row that records a manifest passes an explicit name.
    options = options or {}
    sv = options.get("svg") or {}
    cap_in = options.get("capacity") or {}
    dflt = {"headless": {"maxNodes": 20000, "maxEdges": 40000, "maxDrawnLabelUnits": 1048576},
            "dom": {"maxNodes": 2000, "maxEdges": 4000, "maxDrawnLabelUnits": 262144}}[host]
    if M("K106") and host == "dom":
        dflt = {"maxNodes": 20000, "maxEdges": 40000, "maxDrawnLabelUnits": 1048576}
    cap = dict(dflt)
    cap.update({k: v for k, v in cap_in.items() if v is not None})
    a, b = cap_in.get("maxDrawnLabelUnits"), sv.get("maxDrawnLabelUnits")
    if a is not None and b is not None and a != b and not M("K108"):
        raise IgrError("INVALID_INPUT", "INVALID_VALUE")
    if a is None and b is not None:
        cap["maxDrawnLabelUnits"] = b
    validate_options(sv)  # same codes as O10-O19
    sup = {"status": "supported"}
    edge_on = sv.get("labels") is not False and sv.get("edgeLabels") is not False
    caps = {"scene.load": sup, "viewport": sup, "hit-test": sup, "selection": sup, "focus": sup, "visibility": sup,
            "direction-cue": sup, "indicators.non-color": sup, "a11y.model": sup, "state.report": sup, "lifecycle": sup,
            "export.scene": sup,
            "labels": {"status": "degraded", "degradations": ["LABELS_ELIDED"]},
            "labels.edge": sup if (edge_on or M("K106")) else {"status": "degraded", "degradations": ["EDGE_LABELS_OMITTED"]},
            "export.svg": {"status": "unsupported", "reason": "NOT_IMPLEMENTED"},
            "export.png": {"status": "unsupported", "reason": "NOT_IMPLEMENTED"},
            "motion.animated": {"status": "unsupported", "reason": "NOT_IMPLEMENTED"},
            "a11y.companion-dom": {"status": "unsupported", "reason": "NOT_IMPLEMENTED"},
            "scene.apply-delta": {"status": "unsupported", "reason": "RESERVED"},
            "a11y.native-dom": sup if host == "dom" else {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}}
    return {"igr": "IGR/1", "renderer": {"host": host, "name": options.get("name", "svg-renderer"),
                                         "version": options.get("version", "0.0.0")},
            "capabilities": caps, "capacity": cap}


# ----------------------------------------------------------------------------
# renderer simulation (section 12, lifecycle of 27 section 9) - just enough for the U rows
# ----------------------------------------------------------------------------
class RefRenderer:
    def __init__(self, options=None, host="headless"):
        self.options = options or {}
        self.host = host
        self.manifest = svg_manifest(host, self.options)
        cap = self.manifest["capacity"]
        sv = dict(self.options.get("svg") or {})
        if "maxDrawnLabelUnits" not in sv:
            sv["maxDrawnLabelUnits"] = cap["maxDrawnLabelUnits"]
        self.svg_opts = sv
        self.phase = "created"
        self.pending = []
        self.model = None
        self.state = None
        self.prev_state = None
        self.size = None
        self.reduced = False
        self.disposed = False
        self.on_event = None

    # --- helpers
    def _busy(self):
        if self.pending and not M("K103") or (self.pending and M("K103") and False):
            raise IgrError("INVALID_LIFECYCLE", "BUSY")

    def _sync_guard(self, need_loaded=True, allow_busy=False):
        if self.pending and not allow_busy:
            raise IgrError("INVALID_LIFECYCLE", "BUSY")
        if self.disposed:
            raise IgrError("INVALID_LIFECYCLE", "DISPOSED")
        if need_loaded:
            if self.phase == "created":
                raise IgrError("INVALID_LIFECYCLE", "NOT_INITIALIZED")
            if self.phase == "initialized":
                raise IgrError("INVALID_LIFECYCLE", "NOT_LOADED")

    def settle(self):
        errs = []
        for fn in self.pending:
            try:
                fn()
            except IgrError as e:
                errs.append(e)
        self.pending = []
        return errs

    def call_async(self, fn, await_=True):
        """FIFO: evaluate at processing time."""
        if not await_:
            holder = {}

            def run():
                try:
                    holder["r"] = fn()
                except IgrError as e:
                    holder["e"] = e
                    raise
            self.pending.append(run)
            return holder
        self.settle()
        return fn()

    # --- methods (their bodies run at processing time)
    def initialize(self, size, reduced=False):
        if self.disposed:
            raise IgrError("INVALID_LIFECYCLE", "DISPOSED")
        if self.phase != "created":
            raise IgrError("INVALID_LIFECYCLE", "ALREADY_INITIALIZED")
        for k in ("width", "height"):
            v = size[k]
            if not isinstance(v, int) or isinstance(v, bool) or not (1 <= v <= 16384):
                raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
        self.size = dict(size)
        self.reduced = reduced
        self.phase = "initialized"

    def load_scene(self, model, initial=None):
        if self.disposed:
            raise IgrError("INVALID_LIFECYCLE", "DISPOSED")
        if self.phase == "created":
            raise IgrError("INVALID_LIFECYCLE", "NOT_INITIALIZED")
        if not isinstance(model, Model):
            raise IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL")
        if initial is not None:
            validate_state(model, initial)
        cap = self.manifest["capacity"]
        if len(model.nodes) > cap["maxNodes"]:
            raise IgrError("RESOURCE_LIMIT", "NODE_LIMIT")
        if len(model.edges) > cap["maxEdges"]:
            raise IgrError("RESOURCE_LIMIT", "EDGE_LIMIT")
        st = initial if initial is not None else initial_state(model, self.size["width"], self.size["height"])
        self.model, self.state, self.prev_state = model, st, st
        self.phase = "loaded"

    def dispatch(self, intent):
        self._sync_guard()
        if getattr(self, "in_event", False):
            raise IgrError("INVALID_LIFECYCLE", "REENTRANT")
        new = reduce(self.model, self.state, intent)
        self.prev_state, self.state = self.state, new
        if self.on_event is not None and new != self.prev_state:
            self.in_event = True
            try:
                self.on_event({"type": "state-committed"}, self)
            finally:
                self.in_event = False
        return new

    def get_state(self):
        self._sync_guard()
        return self.state

    def svg(self):
        if M("K103"):
            self._sync_guard(allow_busy=True)
        else:
            self._sync_guard()
        st = self.prev_state if M("K104") else self.state
        return render_svg(self.model, st, self.svg_opts)

    def render(self):
        self._sync_guard_async()
        if M("K107"):
            render_svg(self.model, self.state, self.svg_opts)

    def _sync_guard_async(self):
        if self.disposed:
            raise IgrError("INVALID_LIFECYCLE", "DISPOSED")
        if self.phase == "created":
            raise IgrError("INVALID_LIFECYCLE", "NOT_INITIALIZED")
        if self.phase == "initialized":
            raise IgrError("INVALID_LIFECYCLE", "NOT_LOADED")

    def probe_fidelity(self):
        self._sync_guard()
        o = validate_options(self.svg_opts)
        o = dict(o); o["maxSvgBytes"] = 2**40
        vn, ve = effective_visibility(self.model, self.state)
        _n, _e, fid, _u = label_plan(self.model, vn, ve, o)
        if M("K102") and fid["labels"] == "elided":
            fid = dict(fid); fid["labels"] = "full"
        degr = []
        if fid["labels"] == "elided":
            degr.append("LABELS_ELIDED")
        if not fid["edge_labels"]:
            degr.append("EDGE_LABELS_OMITTED")
        return {"degradations": sorted(degr), "edge_labels": fid["edge_labels"], "labels": fid["labels"], "motion": "none"}

    def probe_drawn(self):
        self._sync_guard()
        vn, ve = effective_visibility(self.model, self.state)
        return {"edges": [model_ref(self.model, "e", i) for i in range(len(ve)) if ve[i]],
                "nodes": [model_ref(self.model, "n", i) for i in range(len(vn)) if vn[i]]}

    def export(self, fmt_):
        self._sync_guard_async()
        if not isinstance(fmt_, str):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if fmt_ not in ("scene", "svg", "png"):
            raise IgrError("INVALID_INPUT", "UNKNOWN_FORMAT")
        if fmt_ == "scene":
            return {"format": "scene", "media_type": "application/octet-stream", "bytes_sha256": sha256_hex(self.model.scene_bytes)}
        if fmt_ == "svg" and M("K105"):
            b = render_svg(self.model, self.state, self.svg_opts).encode("utf-8")
            return {"format": "svg", "media_type": "image/svg+xml", "bytes_sha256": sha256_hex(b)}
        raise IgrError("UNSUPPORTED_CAPABILITY", "NOT_SUPPORTED")

    def dispose(self):
        self.disposed = True
        self.phase = "disposed"

    def witness(self):
        if M("K101"):
            d = self.probe_drawn()
            return {"backend": "igr-svg/1", "elements": d,
                    "texts": [{"address": it["address"], "text": it["name"]}
                              for it in accessible_items(self.model, self.state)]}
        return svg_witness(self.svg())


def model_ref(model, kind, i):
    return model.nodes[i]["ref"] if kind == "n" else model.edges[i]["ref"]


def collapse_ws(s):
    return " ".join(s.split())


def kit_w01(model, state, witness_report, drawn_probe):
    """CHK-W / W01: elements equal probe().drawn and every text equals the accessible name (whitespace-collapsed)."""
    if witness_report["elements"] != drawn_probe:
        return False
    names = {cj(it["address"]): collapse_ws(it["name"]) for it in accessible_items(model, state)}
    for t in witness_report["texts"]:
        if names.get(cj(t["address"])) != collapse_ws(t["text"]):
            return False
    return len(witness_report["texts"]) == len(names)


def utf8_sort_key(s):
    return s.encode("utf-8")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import corpus
    sys.exit(corpus.main(sys.argv[1:]))
