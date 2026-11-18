#!/usr/bin/env python3
"""Independent IGR/1 oracle library (pure Python standard library).

Written ONLY from docs/isongraph-visualize-blueprint/27-IGR1-DESIGN.md (rev 2), docs/specs/IGS-1.md,
docs/specs/IGL-1.md and the frozen fixtures.  No TypeScript was read, run or consulted.

Everything here is exact integer arithmetic (Python int is unbounded, like the bigint of the design);
the only floating point is the single binary64 multiplication of the quantizer (design section 3),
and the parsing of numbers as binary64 before integrality is judged (section 4.2).
"""
import hashlib, json, math, re, struct, sys

sys.dont_write_bytecode = True

# ----------------------------------------------------------------------------------------------
# constants (section 3, 6, 15)
# ----------------------------------------------------------------------------------------------
S = 1_000_000
NODE_HIT_RADIUS_PX = 12
EDGE_HIT_TOLERANCE_PX = 6
ZOOM_MIN_MILLI = 10
ZOOM_MAX_MILLI = 100000
ZOOM_DEFAULT_MILLI = 1000
FIT_PADDING_PX = 32
VIEWPORT_MAX_PX = 16384
SAFE = 2 ** 53 - 1
DEFAULT_LIMITS = dict(maxSceneBytes=8_388_608, maxLayoutBytes=4_194_304, maxNodes=20_000, maxEdges=40_000,
                      maxTotalLabelUnits=4_194_304, maxStateBytes=8_388_608, maxIntentTargets=60_000)


class IgrError(Exception):
    """code/reason pair; prefix is '' for IgrError, 'IGS:' or 'LAYOUT:' for propagated errors."""
    def __init__(self, code, reason="", prefix=""):
        super().__init__(f"{prefix}{code}/{reason}")
        self.code, self.reason, self.prefix = code, reason, prefix

    def tag(self):
        return f"{self.prefix}{self.code}/{self.reason}"


# ----------------------------------------------------------------------------------------------
# canonical serializer: IGS-CJ/1 + signed integers = IGL-CJ/1 ("IGR-CJ/1"), written from IGS/1 5.x and IGL/1 5
# ----------------------------------------------------------------------------------------------
def u16key(s):
    """UTF-16 code-unit order key (JCS key order)."""
    return s.encode("utf-16-be", "surrogatepass")


def u8(s):
    return s.encode("utf-8")


def jstr(s):
    out = ['"']
    for ch in s:
        c = ord(ch)
        if 0xD800 <= c <= 0xDFFF:
            raise ValueError("lone surrogate")
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif c == 8:
            out.append("\\b")
        elif c == 9:
            out.append("\\t")
        elif c == 10:
            out.append("\\n")
        elif c == 12:
            out.append("\\f")
        elif c == 13:
            out.append("\\r")
        elif c < 0x20:
            out.append("\\u%04x" % c)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def cj(v):
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, bool):
        raise TypeError
    if isinstance(v, int):
        if abs(v) > SAFE:
            raise ValueError("integer out of range")
        return str(v)
    if isinstance(v, str):
        return jstr(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(cj(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(jstr(k) + ":" + cj(v[k]) for k in sorted(v, key=u16key)) + "}"
    raise TypeError(type(v))


def cjb(v):
    return cj(v).encode("utf-8")


def sha(b):
    return hashlib.sha256(b).hexdigest()


# ----------------------------------------------------------------------------------------------
# arithmetic (section 3, 6)
# ----------------------------------------------------------------------------------------------
def floor_div(a, b):
    assert b > 0
    q = abs(a) // b if a >= 0 else -(abs(a) // b)       # truncating, as the design's BigInt reference
    if a % b != 0 and a < 0:                             # ... then the design's correction (a % b follows the sign of b in Python,
        q -= 1                                           #     only its zero/non-zero matters here)
    return q


def div_round(a, b):
    return floor_div(2 * a + b, 2 * b)


def quantize_raw(s):
    f = math.floor(s)
    return f + (1 if s - f >= 0.5 else 0)


def q(v):
    """IGL/1 section 4 rule 2 applied once to a finite number: one binary64 multiplication."""
    return quantize_raw(float(v) * 1000.0)


def quantize_px(v):
    return quantize_raw(float(v))


def utf16_len(s):
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ----------------------------------------------------------------------------------------------
# identifiers (IGS/1 1.2, design 4.2)
# ----------------------------------------------------------------------------------------------
_WS = set("\t\n\v\f\r       　﻿") | {chr(c) for c in range(0x2000, 0x200B)}
_BADID = _WS | set(':|"\\')
_INT64 = re.compile(r"(0|-?[1-9][0-9]*)")
_ORD = re.compile(r"(0|[1-9][0-9]*)")
_HASH = re.compile(r"[0-9a-f]{64}")


def is_ident(s):
    return len(s) > 0 and not any(c in _BADID for c in s)


def is_tagged_id(s):
    if s.startswith("s:"):
        return True
    if s.startswith("i:"):
        body = s[2:]
        return bool(_INT64.fullmatch(body)) and -(2 ** 63) <= int(body) <= 2 ** 63 - 1
    return False


def node_key(ref):
    """NodeRef/2 order (IGS/1 5.5): type by UTF-8, INT64 before STRING, INT64 numeric, STRING by UTF-8."""
    i = ref["id"]
    t = u8(ref["type"])
    if i.startswith("i:"):
        return (t, 0, int(i[2:]), b"")
    return (t, 1, 0, i[2:].encode("utf-8", "surrogatepass"))


def edge_key(ref):
    return (node_key(ref["src"]), u8(ref["rel"]), node_key(ref["tgt"]), u8(ref["ord"]))


def node_label(ref):
    return ref["id"][2:]


# ----------------------------------------------------------------------------------------------
# scene / layout "lite" verification (only what the oracle needs: self-check of generated inputs and
# the propagated-error vectors M11-M13).  The authoritative verifiers are the frozen TypeScript ones,
# run by a third party (design 13.4).
# ----------------------------------------------------------------------------------------------
def canon_scene(scene):
    sc = dict(scene)
    sc["nodes"] = sorted(scene["nodes"], key=lambda n: node_key(n["ref"]))
    sc["edges"] = sorted(scene["edges"], key=lambda e: edge_key(e["ref"]))
    return cj(sc)


def verify_scene(raw):
    def bad(r):
        return IgrError("INVALID_SCENE", r, "IGS:")
    try:
        text = raw.decode("utf-8")
        if text.startswith("﻿"):
            raise IgrError("MALFORMED", "", "")
        scene = json.loads(text)
    except Exception:
        raise bad("SCHEMA")
    if not isinstance(scene, dict):
        raise bad("SCHEMA")
    try:
        canon = canon_scene(scene)
    except Exception:
        raise bad("SCHEMA")
    if canon.encode("utf-8") != raw:
        raise bad("NON_CANONICAL")
    seen = set()
    for n in scene["nodes"]:
        k = (n["ref"]["type"], n["ref"]["id"])
        if k in seen:
            raise bad("DUPLICATE_NODE_REF")
        seen.add(k)
        if n["category"] != n["ref"]["type"]:
            raise bad("CATEGORY_MISMATCH")
        if n["label"] != node_label(n["ref"]):
            raise bad("LABEL_MISMATCH")
        if not is_ident(n["ref"]["type"]) or not is_tagged_id(n["ref"]["id"]):
            raise bad("INVALID_ID")
    eseen = set()
    for e in scene["edges"]:
        r = e["ref"]
        k = (r["ord"], r["rel"], r["src"]["type"], r["src"]["id"], r["tgt"]["type"], r["tgt"]["id"])
        if k in eseen:
            raise bad("DUPLICATE_EDGE_REF")
        eseen.add(k)
        for end in (r["src"], r["tgt"]):
            if (end["type"], end["id"]) not in seen:
                raise bad("DANGLING_EDGE_ENDPOINT")
        if not scene["graph"]["directed"] and node_key(r["src"]) > node_key(r["tgt"]):
            raise bad("NON_CANONICAL_ENDPOINTS")
        if e["label"] != r["rel"]:
            raise bad("LABEL_MISMATCH")
        if r["ord"] != "0":
            raise bad("UNEXPECTED_ORDINAL")
        if not is_ident(r["rel"]) or not _ORD.fullmatch(r["ord"]):
            raise bad("INVALID_IDENTIFIER")
    return scene


def verify_layout(raw):
    def bad(c, r):
        return IgrError(c, r, "LAYOUT:")
    try:
        lay = json.loads(raw.decode("utf-8"))
    except Exception:
        raise bad("INVALID_LAYOUT", "SCHEMA")
    lay2 = dict(lay)
    lay2["nodes"] = sorted(lay["nodes"], key=lambda n: node_key(n["ref"]))
    if cj(lay2).encode("utf-8") != raw:
        raise bad("INVALID_LAYOUT", "NON_CANONICAL")
    return lay


# ----------------------------------------------------------------------------------------------
# RenderModel (section 2.2)
# ----------------------------------------------------------------------------------------------
class Model:
    pass


def validate_limits(lim):
    """15 `RenderLimits` validation: only the seven known keys; unknown key or non-number SCHEMA, NaN/Infinity NOT_FINITE,
    fraction INVALID_VALUE, negative or above 2^53-1 OUT_OF_RANGE; 0 is allowed.  Raises INVALID_INPUT."""
    if not isinstance(lim, dict):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    for k, v in lim.items():
        if k not in DEFAULT_LIMITS:
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if isinstance(v, float):
            if not math.isfinite(v):
                raise IgrError("INVALID_INPUT", "NOT_FINITE")
            if v != math.floor(v):
                raise IgrError("INVALID_INPUT", "INVALID_VALUE")
        if v < 0 or v > SAFE:
            raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")


def build_model(scene_raw, layout_raw, limits=None):
    lim = dict(DEFAULT_LIMITS)
    lim.update(limits or {})
    if len(scene_raw) > lim["maxSceneBytes"] or len(layout_raw) > lim["maxLayoutBytes"]:
        raise IgrError("RESOURCE_LIMIT", "BYTES_LIMIT")
    scene = verify_scene(scene_raw)
    layout = verify_layout(layout_raw)
    scene_sha = sha(scene_raw)
    if layout["scene_sha256"] != scene_sha:
        raise IgrError("SCENE_MISMATCH", "", "LAYOUT:")
    sref = {(n["ref"]["type"], n["ref"]["id"]) for n in scene["nodes"]}
    lref = {(n["ref"]["type"], n["ref"]["id"]) for n in layout["nodes"]}
    if sref - lref:
        raise IgrError("INCOMPLETE_LAYOUT", "MISSING_NODE", "LAYOUT:")
    if lref - sref:
        raise IgrError("INCOMPLETE_LAYOUT", "UNKNOWN_NODE", "LAYOUT:")
    if len(scene["nodes"]) > lim["maxNodes"]:
        raise IgrError("RESOURCE_LIMIT", "NODE_LIMIT")
    if len(scene["edges"]) > lim["maxEdges"]:
        raise IgrError("RESOURCE_LIMIT", "EDGE_LIMIT")
    units = sum(utf16_len(n["label"]) + utf16_len(n["category"]) for n in scene["nodes"]) + \
        sum(utf16_len(e["label"]) for e in scene["edges"])
    if units > lim["maxTotalLabelUnits"]:
        raise IgrError("RESOURCE_LIMIT", "LABEL_LIMIT")
    pos = {(n["ref"]["type"], n["ref"]["id"]): (n["x"], n["y"]) for n in layout["nodes"]}
    m = Model()
    m.scene_bytes = scene_raw
    m.layout_bytes = layout_raw
    m.artifact_sha256 = scene["source"]["artifact_sha256"]
    m.scene_sha256 = scene_sha
    m.layout_sha256 = sha(layout_raw)
    m.directed = scene["graph"]["directed"]
    m.nodes = []
    idx = {}
    for i, n in enumerate(scene["nodes"]):
        k = (n["ref"]["type"], n["ref"]["id"])
        idx[k] = i
        x, y = pos[k]
        m.nodes.append(dict(index=i, ref=n["ref"], category=n["category"], label=n["label"], x=x, y=y, degree=0))
    m.edges = []
    for j, e in enumerate(scene["edges"]):
        r = e["ref"]
        s, t = idx[(r["src"]["type"], r["src"]["id"])], idx[(r["tgt"]["type"], r["tgt"]["id"])]
        m.edges.append(dict(index=j, ref=r, label=e["label"], src=s, tgt=t))
        m.nodes[s]["degree"] += 1
        if t != s:
            m.nodes[t]["degree"] += 1
    m.categories = sorted({n["category"] for n in m.nodes}, key=u8)
    if m.nodes:
        xs = [n["x"] for n in m.nodes]
        ys = [n["y"] for n in m.nodes]
        m.bounds = dict(min_x=min(xs), min_y=min(ys), max_x=max(xs), max_y=max(ys))
    else:
        m.bounds = None
    # address index (section 2.2)
    m.nidx = {("n", n["ref"]["type"], n["ref"]["id"]): n["index"] for n in m.nodes}
    m.eidx = {("e", e["ref"]["ord"], e["ref"]["rel"], e["ref"]["src"]["type"], e["ref"]["src"]["id"],
               e["ref"]["tgt"]["type"], e["ref"]["tgt"]["id"]): e["index"] for e in m.edges}
    return m


def model_obj(m):
    o = {"artifact_sha256": m.artifact_sha256, "categories": list(m.categories), "directed": m.directed,
         "edges": [dict(label=e["label"], ref=e["ref"], src=e["src"], tgt=e["tgt"]) for e in m.edges],
         "igr_model": "igr-model/1", "layout_sha256": m.layout_sha256,
         "nodes": [dict(category=n["category"], degree=n["degree"], label=n["label"], ref=n["ref"], x=n["x"], y=n["y"]) for n in m.nodes],
         "scale": 1000, "scene_sha256": m.scene_sha256}
    if m.bounds is not None:
        o["bounds"] = m.bounds
    return o


def model_bytes(m):
    return cjb(model_obj(m))


def _prim(v):
    return isinstance(v, str)


def lookup_element(m, address):
    """Strict, non-throwing; returns ('n', i), ('e', j) or None (section 2.2)."""
    if not isinstance(address, dict):
        return None
    ks = set(address.keys())
    if ks == {"id", "type"}:
        if not (_prim(address["id"]) and _prim(address["type"])):
            return None
        i = m.nidx.get(("n", address["type"], address["id"]))
        return ("n", i) if i is not None else None
    if ks == {"ord", "rel", "src", "tgt"}:
        s, t = address["src"], address["tgt"]
        if not (isinstance(s, dict) and isinstance(t, dict) and set(s) == {"id", "type"} and set(t) == {"id", "type"}):
            return None
        vals = [address["ord"], address["rel"], s["type"], s["id"], t["type"], t["id"]]
        if not all(_prim(v) for v in vals):
            return None
        j = m.eidx.get(("e", *vals))
        return ("e", j) if j is not None else None
    return None


def elem_address(m, el):
    kind, i = el
    return dict(m.nodes[i]["ref"]) if kind == "n" else json.loads(json.dumps(m.edges[i]["ref"]))


def elem_wrap(m, el):
    """ElementAddress: {node: ref} or {edge: address}."""
    return {"node": elem_address(m, el)} if el[0] == "n" else {"edge": elem_address(m, el)}


def object_ref(m, el):
    return {"address": elem_address(m, el), "artifact_sha256": m.artifact_sha256}


def el_order(el):
    """scene order of elements: all nodes by index, then all edges by index."""
    return (0 if el[0] == "n" else 1, el[1])


# ----------------------------------------------------------------------------------------------
# state (section 4)
# ----------------------------------------------------------------------------------------------
def eff_hidden(m, hid):
    """hid: set of elements ('n',i)/('e',j).  Returns the set of effectively hidden elements (4.1)."""
    hn = {i for (k, i) in hid if k == "n"}
    out = set(hid)
    for e in m.edges:
        if e["src"] in hn or e["tgt"] in hn:
            out.add(("e", e["index"]))
    return out


def traversal(m, ehid):
    return [("n", n["index"]) for n in m.nodes if ("n", n["index"]) not in ehid] + \
           [("e", e["index"]) for e in m.edges if ("e", e["index"]) not in ehid]


def mk_state(m, sel, hid, focus, vp):
    def eset(s):
        return {"edges": [elem_address(m, el) for el in sorted(s, key=el_order) if el[0] == "e"],
                "nodes": [elem_address(m, el) for el in sorted(s, key=el_order) if el[0] == "n"]}
    st = {"hidden": eset(hid), "igr": "IGR/1", "layout_sha256": m.layout_sha256, "scene_sha256": m.scene_sha256,
          "selection": eset(sel), "viewport": dict(vp)}
    if focus is not None:
        st["focus"] = elem_wrap(m, focus)
    return st


def state_parts(m, st):
    """(selection set, hidden set, focus element or None, viewport) of an already valid state object."""
    def els(es):
        return {lookup_element(m, a) for a in es["nodes"]} | {lookup_element(m, a) for a in es["edges"]}
    focus = None
    if "focus" in st:
        f = st["focus"]
        focus = lookup_element(m, f["node"] if "node" in f else f["edge"])
    return els(st["selection"]), els(st["hidden"]), focus, dict(st["viewport"])


def _schema(r):
    return IgrError("INVALID_STATE", r)


def _node_addr_ok(o, patterns=True):
    if not isinstance(o, dict):
        raise _schema("SCHEMA")
    ks = set(o)
    if ks - {"id", "type"}:
        raise _schema("UNKNOWN_FIELD")
    if {"id", "type"} - ks:
        raise _schema("MISSING_FIELD")
    for k in sorted(ks, key=u16key):
        v = o[k]
        if not isinstance(v, str):
            raise _schema("SCHEMA")
        if patterns and k == "id" and not is_tagged_id(v):
            raise _schema("INVALID_VALUE")
        if patterns and k == "type" and not is_ident(v):
            raise _schema("INVALID_VALUE")


def _edge_addr_ok(o, patterns=True):
    if not isinstance(o, dict):
        raise _schema("SCHEMA")
    ks = set(o)
    if ks - {"ord", "rel", "src", "tgt"}:
        raise _schema("UNKNOWN_FIELD")
    if {"ord", "rel", "src", "tgt"} - ks:
        raise _schema("MISSING_FIELD")
    for k in sorted(ks, key=u16key):
        v = o[k]
        if k in ("src", "tgt"):
            _node_addr_ok(v, patterns)
            continue
        if not isinstance(v, str):
            raise _schema("SCHEMA")
        if patterns and k == "ord" and not _ORD.fullmatch(v):
            raise _schema("INVALID_VALUE")
        if patterns and k == "rel" and not is_ident(v):
            raise _schema("INVALID_VALUE")


def _closed(o, required, optional=()):
    ks = set(o)
    if ks - set(required) - set(optional):
        raise _schema("UNKNOWN_FIELD")
    if set(required) - ks:
        raise _schema("MISSING_FIELD")


def _int_field(v):
    if isinstance(v, bool) or not isinstance(v, float):
        raise _schema("SCHEMA")
    if not math.isfinite(v) or v != math.floor(v) or abs(v) > SAFE:
        raise _schema("INVALID_NUMBER")
    return int(v)


def _walk_set(o, patterns=True):
    if not isinstance(o, dict):
        raise _schema("SCHEMA")
    _closed(o, ("edges", "nodes"))
    for k in sorted(o, key=u16key):
        if not isinstance(o[k], list):
            raise _schema("SCHEMA")
        for a in o[k]:
            (_edge_addr_ok if k == "edges" else _node_addr_ok)(a, patterns)


def _no_const(c):
    raise ValueError("non-JSON constant")


def _strings_ok(v):
    if isinstance(v, str):
        if any(0xD800 <= ord(c) <= 0xDFFF for c in v):
            raise _schema("INVALID_STRING")
    elif isinstance(v, list):
        for x in v:
            _strings_ok(x)
    elif isinstance(v, dict):
        for k, x in v.items():
            _strings_ok(k)
            _strings_ok(x)


def walk_state(obj, patterns=True, check_igr=True):
    """Step 1 (schema) on a parsed document whose numbers are binary64 floats.  Returns the state with ints."""
    if not isinstance(obj, dict):
        raise _schema("SCHEMA")
    _closed(obj, ("hidden", "igr", "layout_sha256", "scene_sha256", "selection", "viewport"), ("focus",))
    for k in sorted(obj, key=u16key):
        v = obj[k]
        if k == "focus":
            if not isinstance(v, dict):
                raise _schema("SCHEMA")
            if set(v) - {"node", "edge"}:
                raise _schema("UNKNOWN_FIELD")
            if len(v) != 1:
                raise _schema("SCHEMA")
            (_node_addr_ok if "node" in v else _edge_addr_ok)(v["node"] if "node" in v else v["edge"], patterns)
        elif k in ("hidden", "selection"):
            _walk_set(v, patterns)
        elif k == "igr":
            if not isinstance(v, str):
                raise _schema("SCHEMA")
            if check_igr and v != "IGR/1":
                raise _schema("UNSUPPORTED_VERSION")
        elif k in ("layout_sha256", "scene_sha256"):
            if not isinstance(v, str):
                raise _schema("SCHEMA")
            if not _HASH.fullmatch(v):
                raise _schema("INVALID_HASH")
        elif k == "viewport":
            if not isinstance(v, dict):
                raise _schema("SCHEMA")
            _closed(v, ("center_x", "center_y", "height", "width", "zoom"))
            for vk in sorted(v, key=u16key):
                n = _int_field(v[vk])
                if vk == "zoom" and not (ZOOM_MIN_MILLI <= n <= ZOOM_MAX_MILLI):
                    raise _schema("INVALID_VIEWPORT")
                if vk in ("width", "height") and not (1 <= n <= VIEWPORT_MAX_PX):
                    raise _schema("INVALID_VIEWPORT")
    out = json.loads(json.dumps(obj), parse_float=float)   # deep copy
    out["viewport"] = {k: int(obj["viewport"][k]) for k in obj["viewport"]}
    return out


def check_state_obj(m, st, bind=True):
    """Steps 2-5 on a schema-valid state object (ints).  bind=False skips step 2 (used by report validation, where
    hashes are judged separately, 11)."""
    if bind and st["scene_sha256"] != m.scene_sha256:
        raise _schema("SCENE_MISMATCH")
    if bind and st["layout_sha256"] != m.layout_sha256:
        raise _schema("LAYOUT_MISMATCH")
    arrays = []
    if "focus" in st:
        f = st["focus"]
        arrays.append([f["node"] if "node" in f else f["edge"]])
    for sname in ("hidden", "selection"):
        arrays.append(st[sname]["edges"])
        arrays.append(st[sname]["nodes"])
    resolved = []
    for arr in arrays:
        r = []
        for a in arr:
            el = lookup_element(m, a)
            if el is None:
                raise _schema("UNRESOLVED_ELEMENT")
            r.append(el)
        resolved.append(r)
    for r in resolved:
        if len(set(r)) != len(r):
            raise _schema("DUPLICATE_ELEMENT")
    for r in resolved:
        idxs = [el[1] for el in r]
        if any(b <= a for a, b in zip(idxs, idxs[1:])):
            raise _schema("NON_CANONICAL")
    sel, hid, focus, _ = state_parts(m, st)
    ehid = eff_hidden(m, hid)
    if any(el in ehid for el in sel):
        raise _schema("SELECTED_HIDDEN")
    if focus is not None and focus in ehid:
        raise _schema("FOCUS_HIDDEN")


def parse_state(m, raw, limits=None):
    lim = dict(DEFAULT_LIMITS)
    lim.update(limits or {})
    if len(raw) > lim["maxStateBytes"]:
        raise IgrError("RESOURCE_LIMIT", "BYTES_LIMIT")
    if raw.startswith(b"\xef\xbb\xbf"):
        raise _schema("INVALID_ENCODING")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise _schema("INVALID_ENCODING")
    try:
        obj = json.loads(text, parse_int=float, parse_float=float, parse_constant=_no_const)
    except Exception:
        raise _schema("SCHEMA")
    _strings_ok(obj)
    st = walk_state(obj)
    check_state_obj(m, st)
    if cjb(st) != raw:
        raise _schema("NON_CANONICAL")
    return st


def serialize_state(m, st):
    """STRICT writer: validates, never reorders, throws INVALID_STATE."""
    st2 = json.loads(json.dumps(st))
    check_state_obj(m, st2)
    vp = st2["viewport"]
    if not (ZOOM_MIN_MILLI <= vp["zoom"] <= ZOOM_MAX_MILLI) or not all(1 <= vp[k] <= VIEWPORT_MAX_PX for k in ("width", "height")):
        raise _schema("INVALID_VIEWPORT")
    if abs(vp["center_x"]) > SAFE or abs(vp["center_y"]) > SAFE:
        raise _schema("INVALID_NUMBER")
    return cjb(st2)


# ----------------------------------------------------------------------------------------------
# viewport (section 6)
# ----------------------------------------------------------------------------------------------
def default_padding(w, h):
    return min(FIT_PADDING_PX, floor_div(min(w, h) - 1, 2))


def fit_vp(m, hid_nodes_idx, w, h, padding, cur):
    """fit over effectively visible nodes only.  cur: current viewport (returned unchanged if none)."""
    vis = [n for n in m.nodes if n["index"] not in hid_nodes_idx]
    vp = dict(cur)
    if not vis:
        return vp
    min_x = min(n["x"] for n in vis)
    max_x = max(n["x"] for n in vis)
    min_y = min(n["y"] for n in vis)
    max_y = max(n["y"] for n in vis)
    ax, ay = w - 2 * padding, h - 2 * padding
    sx, sy = max_x - min_x, max_y - min_y
    cands = []
    if sx > 0:
        cands.append(floor_div(ax * S, sx))
    if sy > 0:
        cands.append(floor_div(ay * S, sy))
    z = min(cands) if cands else ZOOM_DEFAULT_MILLI
    vp["center_x"] = div_round(min_x + max_x, 2)
    vp["center_y"] = div_round(min_y + max_y, 2)
    vp["zoom"] = clamp(z, ZOOM_MIN_MILLI, ZOOM_MAX_MILLI)
    return vp


def initial_state(m, w, h):
    if not (isinstance(w, int) and isinstance(h, int) and 1 <= w <= VIEWPORT_MAX_PX and 1 <= h <= VIEWPORT_MAX_PX):
        raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
    if not m.nodes:
        vp = dict(center_x=0, center_y=0, height=h, width=w, zoom=ZOOM_DEFAULT_MILLI)
    else:
        base = dict(center_x=0, center_y=0, height=h, width=w, zoom=ZOOM_DEFAULT_MILLI)
        vp = fit_vp(m, set(), w, h, default_padding(w, h), base)
    return mk_state(m, set(), set(), None, vp)


def layout_to_screen_micro(m, vp):
    """(X, Y) micro-pixel lists for every node, section 6."""
    cx, cy, z, w, h = vp["center_x"], vp["center_y"], vp["zoom"], vp["width"], vp["height"]
    return ([(n["x"] - cx) * z + w * 500_000 for n in m.nodes], [(n["y"] - cy) * z + h * 500_000 for n in m.nodes])


# ----------------------------------------------------------------------------------------------
# intents and the reducer (section 5)
# ----------------------------------------------------------------------------------------------
def _ie(reason):
    return IgrError("INVALID_INTENT", reason)


def _num(intent, key, lo=None, hi=None, optional=False):
    """read a number field following 5.2: SCHEMA / NOT_FINITE / INVALID_VALUE / OUT_OF_RANGE."""
    if key not in intent:
        if optional:
            return None
        raise _ie("SCHEMA")
    v = intent[key]
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise _ie("SCHEMA")
    if isinstance(v, float):
        if not math.isfinite(v):
            raise _ie("NOT_FINITE")
        if v != math.floor(v):
            raise _ie("INVALID_VALUE")
        v = int(v)
    if lo is not None and v < lo:
        raise _ie("OUT_OF_RANGE")
    if hi is not None and v > hi:
        raise _ie("OUT_OF_RANGE")
    return v


def _container_ok(t):
    """5.2 step 3: exactly one key, node or edge, holding an object; the content is not examined here."""
    return isinstance(t, dict) and len(t) == 1 and ("node" in t or "edge" in t) and isinstance(t.get("node", t.get("edge")), dict)


def _target_containers(intent):
    if "targets" not in intent or not isinstance(intent["targets"], list):
        raise _ie("SCHEMA")
    for t in intent["targets"]:
        if not _container_ok(t):
            raise _ie("SCHEMA")


def _targets(m, intent, lim):
    ts = intent["targets"]
    if len(ts) > lim["maxIntentTargets"]:
        raise IgrError("RESOURCE_LIMIT", "TARGET_LIMIT")
    total = 0
    for t in ts:
        a = t["node"] if "node" in t else t["edge"]
        total += _addr_text_units(a)
    if total > lim["maxSceneBytes"]:
        raise IgrError("RESOURCE_LIMIT", "TARGET_LIMIT")
    out = []
    for t in ts:
        el = lookup_element(m, t["node"] if "node" in t else t["edge"])
        if el is None:
            raise _ie("UNRESOLVED_ELEMENT")
        if ("node" in t) != (el[0] == "n"):
            raise _ie("UNRESOLVED_ELEMENT")
        out.append(el)
    return out


def _addr_text_units(a):
    n = 0
    if isinstance(a, dict):
        for k, v in a.items():
            if isinstance(v, str):
                n += utf16_len(v)
            elif isinstance(v, dict):
                n += _addr_text_units(v)
    return n


def _dedupe(els):
    seen, out = set(), []
    for e in els:
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out


def _closed_intent(intent, required, optional=()):
    """step 2 of the validation order (5.2): the field set is closed (extra field) and complete (missing field): SCHEMA."""
    if set(intent) - set(required) - set(optional):
        raise _ie("SCHEMA")
    if set(required) - set(intent):
        raise _ie("SCHEMA")


def reduce(m, st, intent, limits=None):
    """Pure reducer.  Returns (new_state_obj, events); raises IgrError for any invalid intent."""
    lim = dict(DEFAULT_LIMITS)
    lim.update(limits or {})
    if not isinstance(intent, dict) or "type" not in intent:
        raise _ie("SCHEMA")
    ty = intent["type"]
    if not isinstance(ty, str):
        raise _ie("UNKNOWN_TYPE")           # "type not a known string: UNKNOWN_TYPE" (5.2)
    sel, hid, focus, vp = state_parts(m, st)
    ehid = eff_hidden(m, hid)
    sel2, hid2, focus2, vp2 = set(sel), set(hid), focus, dict(vp)
    boundary = None
    w, h, z, cx, cy = vp["width"], vp["height"], vp["zoom"], vp["center_x"], vp["center_y"]

    if ty == "select":
        _closed_intent(intent, ("type", "mode", "targets"))
        if "mode" not in intent or not isinstance(intent["mode"], str):
            raise _ie("SCHEMA")
        mode = intent["mode"]
        if mode not in ("replace", "add", "remove", "toggle"):
            raise _ie("INVALID_VALUE")            # the enum check sits at its field position: before `targets`
        _target_containers(intent)
        tg = _dedupe(_targets(m, intent, lim))
        if mode != "remove" and any(t in ehid for t in tg):
            raise _ie("ELEMENT_HIDDEN")
        if mode == "replace":
            sel2 = set(tg)
        elif mode == "add":
            sel2 = sel | set(tg)
        elif mode == "remove":
            sel2 = sel - set(tg)
        else:
            sel2 = sel ^ set(tg)
    elif ty == "clear-selection":
        _closed_intent(intent, ("type",))
        sel2 = set()
    elif ty == "focus":
        _closed_intent(intent, ("type",), ("target",))
        if "target" in intent:
            t = intent["target"]
            if not _container_ok(t):
                raise _ie("SCHEMA")
            el = lookup_element(m, t["node"] if "node" in t else t["edge"])
            if el is None or (("node" in t) != (el[0] == "n")):
                raise _ie("UNRESOLVED_ELEMENT")
            if el in ehid:
                raise _ie("ELEMENT_HIDDEN")
            focus2 = el
        else:
            focus2 = None
    elif ty in ("focus-step", "focus-first", "focus-last"):
        _closed_intent(intent, ("type", "delta") if ty == "focus-step" else ("type",))
        order = traversal(m, ehid)
        if ty == "focus-step":
            d = _num(intent, "delta")
            if d not in (1, -1):
                raise _ie("INVALID_VALUE")
        if order:
            if ty == "focus-first":
                focus2 = order[0]
            elif ty == "focus-last":
                focus2 = order[-1]
            else:
                if focus is None:
                    focus2 = order[0] if d == 1 else order[-1]
                else:
                    pos = order.index(focus)
                    npos = pos + d
                    if npos < 0:
                        boundary = "start"
                    elif npos >= len(order):
                        boundary = "end"
                    else:
                        focus2 = order[npos]
    elif ty == "set-hidden":
        _closed_intent(intent, ("type", "targets", "hidden"))
        _target_containers(intent)                # field order: targets, then hidden
        if not isinstance(intent["hidden"], bool):
            raise _ie("SCHEMA")
        tg = _dedupe(_targets(m, intent, lim))
        hid2 = (hid | set(tg)) if intent["hidden"] else (hid - set(tg))
        ehid2 = eff_hidden(m, hid2)
        sel2 = {el for el in sel if el not in ehid2}
        if focus is not None and focus in ehid2:
            focus2 = None
    elif ty == "pan":
        _closed_intent(intent, ("type", "dx", "dy"))
        dx = _num(intent, "dx", -(2 ** 31), 2 ** 31)
        dy = _num(intent, "dy", -(2 ** 31), 2 ** 31)
        vp2["center_x"] = cx - div_round(dx * S, z)
        vp2["center_y"] = cy - div_round(dy * S, z)
    elif ty == "zoom":
        _closed_intent(intent, ("type", "factor_milli"), ("anchor",))
        f = _num(intent, "factor_milli", 1, 1_000_000)
        z2 = clamp(div_round(z * f, 1000), ZOOM_MIN_MILLI, ZOOM_MAX_MILLI)
        if "anchor" in intent:
            a = intent["anchor"]
            if not isinstance(a, dict):
                raise _ie("SCHEMA")
            if set(a) != {"x", "y"}:
                raise _ie("SCHEMA")
            ax = _num(a, "x", -(2 ** 31), 2 ** 31)
            ay = _num(a, "y", -(2 ** 31), 2 ** 31)
            u, v = 2 * ax - w, 2 * ay - h
            vp2["center_x"] = cx + div_round(u * S, 2 * z) - div_round(u * S, 2 * z2)
            vp2["center_y"] = cy + div_round(v * S, 2 * z) - div_round(v * S, 2 * z2)
        vp2["zoom"] = z2
    elif ty == "fit":
        _closed_intent(intent, ("type",), ("padding",))
        if "padding" in intent:
            p = _num(intent, "padding")
            if p < 0:
                raise _ie("INVALID_VALUE")
            if p > VIEWPORT_MAX_PX:
                raise _ie("OUT_OF_RANGE")
            if w - 2 * p < 1 or h - 2 * p < 1:
                raise _ie("OUT_OF_RANGE")
        else:
            p = default_padding(w, h)
        hn = {i for (k, i) in ehid if k == "n"}
        vp2 = fit_vp(m, hn, w, h, p, vp)
    elif ty == "set-viewport":
        _closed_intent(intent, ("type", "center_x", "center_y", "zoom"))
        vp2["center_x"] = _num(intent, "center_x", -SAFE, SAFE)
        vp2["center_y"] = _num(intent, "center_y", -SAFE, SAFE)
        vp2["zoom"] = _num(intent, "zoom", ZOOM_MIN_MILLI, ZOOM_MAX_MILLI)
    elif ty == "resize":
        _closed_intent(intent, ("type", "width", "height"))
        vp2["width"] = _num(intent, "width", 1, VIEWPORT_MAX_PX)
        vp2["height"] = _num(intent, "height", 1, VIEWPORT_MAX_PX)
    else:
        raise _ie("UNKNOWN_TYPE")

    # final stored values are range-checked (section 6)
    if abs(vp2["center_x"]) > SAFE or abs(vp2["center_y"]) > SAFE or not (ZOOM_MIN_MILLI <= vp2["zoom"] <= ZOOM_MAX_MILLI):
        raise _ie("OUT_OF_RANGE")

    events = []
    if hid2 != hid:
        events.append({"hidden": [object_ref(m, e) for e in sorted(hid2, key=el_order)], "type": "visibility-changed"})
    if sel2 != sel:
        events.append({"selection": [object_ref(m, e) for e in sorted(sel2, key=el_order)], "type": "selection-changed"})
    if focus2 != focus:
        ev = {"type": "focus-changed"}
        if focus2 is not None:
            ev["focus"] = object_ref(m, focus2)
        events.append(ev)
    if vp2 != vp:
        events.append({"type": "viewport-changed", "viewport": dict(vp2)})
    if boundary:
        events.append({"end": boundary, "type": "traversal-boundary"})
    return mk_state(m, sel2, hid2, focus2, vp2), events


def serialize_events(events):
    return cjb(list(events))


# ----------------------------------------------------------------------------------------------
# hit test (section 7.1) - exact integer work, no pruning (pruning is only an optimisation)
# ----------------------------------------------------------------------------------------------
def hit_test(m, st, point):
    px, py = point
    for v in (px, py):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if isinstance(v, float) and not math.isfinite(v):
            raise IgrError("INVALID_INPUT", "NOT_FINITE")
        if abs(v) > 2 ** 31:
            raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
    vp = st["viewport"]
    w, h = vp["width"], vp["height"]
    # rev 3 (7.1): the pointer is converted exactly once; the closed rectangle test uses the quantized micro-pixel point P.
    P = (q(px) * 1000, q(py) * 1000)
    if not (0 <= P[0] <= w * S and 0 <= P[1] <= h * S):
        return None
    sel, hid, focus, _ = state_parts(m, st)
    ehid = eff_hidden(m, hid)
    X, Y = layout_to_screen_micro(m, vp)
    best, bd = None, None
    r2 = (NODE_HIT_RADIUS_PX * S) ** 2
    for n in m.nodes:
        i = n["index"]
        if ("n", i) in ehid:
            continue
        d2 = (X[i] - P[0]) ** 2 + (Y[i] - P[1]) ** 2
        if d2 <= r2 and (bd is None or d2 < bd):
            best, bd = i, d2
    if best is not None:
        return {"node": dict(m.nodes[best]["ref"])}
    t2 = (EDGE_HIT_TOLERANCE_PX * S) ** 2
    ebest, bnum, bden = None, None, None
    for e in m.edges:
        j = e["index"]
        if ("e", j) in ehid:
            continue
        ax, ay, bx, by = X[e["src"]], Y[e["src"]], X[e["tgt"]], Y[e["tgt"]]
        if (ax, ay) == (bx, by):
            continue
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        tn = (P[0] - ax) * dx + (P[1] - ay) * dy
        if not (0 < tn < L2):               # rev 3: no endpoint branch; a candidate needs 0 < tn < L2
            continue
        cross = (P[0] - ax) * dy - (P[1] - ay) * dx
        num, den = cross * cross, L2
        if num <= t2 * den:
            if ebest is None or num * bden < bnum * den:
                ebest, bnum, bden = j, num, den
    if ebest is not None:
        return {"edge": json.loads(json.dumps(m.edges[ebest]["ref"]))}
    return None


# ----------------------------------------------------------------------------------------------
# accessibility data model (section 10)
# ----------------------------------------------------------------------------------------------
def plural(n, noun):
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def node_name(m, i):
    n = m.nodes[i]
    return f"{n['category']} {n['label']}"


def edge_name(m, j):
    return m.edges[j]["label"]


def edge_description(m, j):
    e = m.edges[j]
    return f"{m.nodes[e['src']]['label']} {e['label']} {m.nodes[e['tgt']]['label']}"


def graph_summary(m):
    cats = []
    for c in m.categories:
        cats.append({"category": c, "count": sum(1 for n in m.nodes if n["category"] == c)})
    return {"categories": cats, "directed": m.directed, "edges": len(m.edges), "nodes": len(m.nodes)}


def summary_text(gs):
    s = f"{'Directed' if gs['directed'] else 'Undirected'} graph with {plural(gs['nodes'], 'node')} and {plural(gs['edges'], 'edge')}."
    if gs["nodes"] > 0:
        items = [f"{c['category']} ({c['count']})" for c in gs["categories"][:8]]
        lst = ", ".join(items)
        if len(gs["categories"]) > 8:
            lst += f", and {len(gs['categories']) - 8} more"
        s += f" Node categories: {lst}."
    return s


def focus_text(m, el):
    return node_name(m, el[1]) if el[0] == "n" else edge_description(m, el[1])


def status_text(m, st):
    sel, hid, focus, _ = state_parts(m, st)
    ehid = eff_hidden(m, hid)
    s = f"{len(sel)} selected, {len(ehid)} hidden."
    if focus is not None:
        s += f" Focus: {focus_text(m, focus)}."
    return s


def announcement_for(m, event, st):
    sel, hid, focus, _ = state_parts(m, st)
    t = event["type"]
    if t == "selection-changed":
        return f"{len(sel)} selected."
    if t == "focus-changed":
        # literal reading of "focus-changed -> t as above, or 'Focus cleared.'": t itself, no appended full stop (AMBIGUITIES A-16)
        return "Focus cleared." if focus is None else focus_text(m, focus)
    if t == "visibility-changed":
        return f"{len(eff_hidden(m, hid))} hidden."
    if t == "traversal-boundary":
        return "End of graph." if event["end"] == "end" else "Start of graph."
    return None


def build_accessible(m, st):
    sel, hid, focus, _ = state_parts(m, st)
    ehid = eff_hidden(m, hid)
    order = traversal(m, ehid)
    items = []
    for k, el in enumerate(order):
        it = {"address": elem_wrap(m, el), "focused": focus == el, "position": k + 1, "selected": el in sel,
              "set_size": len(order)}
        if el[0] == "n":
            it["name"], it["role"] = node_name(m, el[1]), "node"
        else:
            it["name"], it["role"] = edge_name(m, el[1]), "edge"
            it["description"] = edge_description(m, el[1])
        items.append(it)
    return {"items": items, "status": status_text(m, st), "summary": summary_text(graph_summary(m))}


# ----------------------------------------------------------------------------------------------
# reports and comparison (section 11)
# ----------------------------------------------------------------------------------------------
def element_set(m, els):
    s = sorted(els, key=el_order)
    return {"edges": [elem_address(m, e) for e in s if e[0] == "e"], "nodes": [elem_address(m, e) for e in s if e[0] == "n"]}


def build_report(m, st, reduced_motion=False, labels="full", edge_labels=True, degradations=()):
    sel, hid, focus, _ = state_parts(m, st)
    ehid = eff_hidden(m, hid)
    visible = {el for el in traversal(m, ehid)}
    marked = {"selected": element_set(m, sel)}
    if focus is not None:
        marked["focus"] = elem_wrap(m, focus)
    return {"accessible": build_accessible(m, st), "drawn": element_set(m, visible),
            "fidelity": {"degradations": list(degradations), "edge_labels": edge_labels, "labels": labels,
                         "motion": "none" if reduced_motion else "full"},
            "igr": "IGR/1", "layout_sha256": m.layout_sha256, "marked": marked, "scene_sha256": m.scene_sha256, "state": st}


def projection(rep):
    return {k: rep[k] for k in ("igr", "scene_sha256", "layout_sha256", "state", "drawn", "marked", "accessible")}


_ABSENT = object()


def _same(a, b):
    if a is _ABSENT or b is _ABSENT:
        return a is b
    return cj(a) == cj(b)


def _floatify(o):
    if isinstance(o, bool):
        return o
    if isinstance(o, int):
        return float(o)
    if isinstance(o, list):
        return [_floatify(x) for x in o]
    if isinstance(o, dict):
        return {k: _floatify(v) for k, v in o.items()}
    return o


def _re(reason):
    return IgrError("INVALID_REPORT", reason)


def _addr_shape(a, kind):
    """exact key shape of 4.2 with string components; the content is not pattern-checked (V1)."""
    if not isinstance(a, dict):
        return False
    if kind == "node":
        return set(a) == {"id", "type"} and isinstance(a["id"], str) and isinstance(a["type"], str)
    return (set(a) == {"ord", "rel", "src", "tgt"} and isinstance(a["ord"], str) and isinstance(a["rel"], str)
            and _addr_shape(a["src"], "node") and _addr_shape(a["tgt"], "node"))


def _set_shape(o):
    return (isinstance(o, dict) and set(o) == {"nodes", "edges"} and isinstance(o["nodes"], list) and isinstance(o["edges"], list)
            and all(_addr_shape(a, "node") for a in o["nodes"]) and all(_addr_shape(a, "edge") for a in o["edges"]))


def _elem_addr_shape(a):
    return isinstance(a, dict) and len(a) == 1 and (("node" in a and _addr_shape(a["node"], "node")) or ("edge" in a and _addr_shape(a["edge"], "edge")))


def validate_report(m, rep, projection=False):
    """11 validateReport V1-V5 (no binding, no hash comparison); first failure wins."""
    keys = {"igr", "scene_sha256", "layout_sha256", "state", "drawn", "marked", "accessible"} | (set() if projection else {"fidelity"})
    # V1
    if not isinstance(rep, dict) or set(rep) != keys:
        raise _re("SCHEMA")
    if not isinstance(rep["igr"], str) or not all(isinstance(rep[k], str) and _HASH.fullmatch(rep[k]) for k in ("scene_sha256", "layout_sha256")):
        raise _re("SCHEMA")
    mk = rep["marked"]
    if not isinstance(mk, dict) or "selected" not in mk or set(mk) - {"selected", "focus"}:
        raise _re("SCHEMA")
    if not _set_shape(rep["drawn"]) or not _set_shape(mk["selected"]) or ("focus" in mk and not _elem_addr_shape(mk["focus"])):
        raise _re("SCHEMA")
    ac = rep["accessible"]
    if not isinstance(ac, dict) or set(ac) != {"summary", "status", "items"} or not isinstance(ac["summary"], str) or not isinstance(ac["status"], str) or not isinstance(ac["items"], list):
        raise _re("SCHEMA")
    for it in ac["items"]:
        need = {"role", "address", "name", "selected", "focused", "position", "set_size"}
        if not isinstance(it, dict) or not need <= set(it) or set(it) - need - {"description"}:
            raise _re("SCHEMA")
        if it["role"] not in ("node", "edge") or not isinstance(it["name"], str) or not isinstance(it["selected"], bool) or not isinstance(it["focused"], bool):
            raise _re("SCHEMA")
        if any(isinstance(it[k], bool) or not isinstance(it[k], (int, float)) for k in ("position", "set_size")) or ("description" in it and not isinstance(it["description"], str)):
            raise _re("SCHEMA")
        if not _elem_addr_shape(it["address"]):
            raise _re("SCHEMA")
    if not projection:
        fd = rep["fidelity"]
        if (not isinstance(fd, dict) or set(fd) != {"labels", "edge_labels", "motion", "degradations"} or not isinstance(fd["labels"], str) or not isinstance(fd["edge_labels"], bool)
                or not isinstance(fd["motion"], str) or not isinstance(fd["degradations"], list)):
            raise _re("SCHEMA")
    if not isinstance(rep["state"], dict):
        raise _re("SCHEMA")
    try:
        st = walk_state(_floatify(rep["state"]), patterns=False, check_igr=False)
    except IgrError:
        raise _re("SCHEMA")
    # V2
    if rep["igr"] != "IGR/1" or st["igr"] != "IGR/1":
        raise _re("UNSUPPORTED_VERSION")
    # V3: state (focus, hidden.edges, hidden.nodes, selection.edges, selection.nodes), drawn (edges, nodes),
    #     marked (focus, selected.edges, selected.nodes), accessible.items in index order
    groups = []
    if "focus" in st:
        groups.append([("node" if "node" in st["focus"] else "edge", st["focus"].get("node") or st["focus"].get("edge"))])
    for nm in ("hidden", "selection"):
        groups += [[("edge", a) for a in st[nm]["edges"]], [("node", a) for a in st[nm]["nodes"]]]
    groups += [[("edge", a) for a in rep["drawn"]["edges"]], [("node", a) for a in rep["drawn"]["nodes"]]]
    if "focus" in mk:
        groups.append([("node" if "node" in mk["focus"] else "edge", mk["focus"].get("node") or mk["focus"].get("edge"))])
    groups += [[("edge", a) for a in mk["selected"]["edges"]], [("node", a) for a in mk["selected"]["nodes"]]]
    groups.append([("node" if "node" in it["address"] else "edge", it["address"].get("node") or it["address"].get("edge")) for it in ac["items"]])
    for g in groups:
        for kind, a in g:
            el = lookup_element(m, a)
            if el is None or (el[0] == "n") != (kind == "node"):
                raise _re("UNRESOLVED_ELEMENT")
    # V4
    try:
        check_state_obj(m, st, bind=False)
    except IgrError:
        raise _re("NON_CANONICAL")
    # V5
    sel, hid, focus, _ = state_parts(m, st)
    visible = set(traversal(m, eff_hidden(m, hid)))
    dl = [lookup_element(m, a) for a in rep["drawn"]["nodes"]] + [lookup_element(m, a) for a in rep["drawn"]["edges"]]
    if len(dl) != len(set(dl)) or set(dl) != visible:
        raise _re("INCONSISTENT")
    if {lookup_element(m, a) for a in mk["selected"]["nodes"] + mk["selected"]["edges"]} != sel:
        raise _re("INCONSISTENT")
    mfocus = None
    if "focus" in mk:
        mfocus = lookup_element(m, mk["focus"].get("node") or mk["focus"].get("edge"))
    if mfocus != focus:
        raise _re("INCONSISTENT")


def serialize_projection(m, proj):
    validate_report(m, proj, projection=True)
    if (proj["scene_sha256"] != m.scene_sha256 or proj["layout_sha256"] != m.layout_sha256
            or proj["state"]["scene_sha256"] != m.scene_sha256 or proj["state"]["layout_sha256"] != m.layout_sha256):
        raise _re("INCONSISTENT")
    return cjb(proj)


def compare_projections(m, named):
    """named: [(name, report)].  11: validate each report; a hash differing from the model's gives {comparable: false};
    otherwise the path algorithm (deepest differing value, majority reference, tie -> first-listed)."""
    for n, r in named:
        validate_report(m, r)
    for n, r in named:
        if r["scene_sha256"] != m.scene_sha256 or r["layout_sha256"] != m.layout_sha256:
            return {"comparable": False}
    projs = [(n, projection(r)) for n, r in named]
    diffs = []

    def rec(path, vals):                       # vals: [(name, value-or-ABSENT)]
        if all(_same(vals[0][1], v) for _, v in vals[1:]):
            return
        if all(isinstance(v, dict) for _, v in vals):
            keys = sorted({k for _, v in vals for k in v}, key=u16key)
            for k in keys:
                rec(f"{path}.{k}" if path else k, [(n, v.get(k, _ABSENT)) for n, v in vals])
            return
        if all(isinstance(v, list) for _, v in vals) and len({len(v) for _, v in vals}) == 1:
            for i in range(len(vals[0][1])):
                rec(f"{path}[{i}]", [(n, v[i]) for n, v in vals])
            return
        groups = []
        for n, v in vals:
            for g in groups:
                if _same(g[0], v):
                    g[1].append(n)
                    break
            else:
                groups.append([v, [n]])
        best = groups[0]
        for g in groups[1:]:
            if len(g[1]) > len(best[1]):
                best = g
        odd = sorted(n for g in groups if g is not best for n in g[1])
        diffs.append({"path": path, "renderers": odd})

    rec("", [(n, p) for n, p in projs])
    diffs.sort(key=lambda d: u8(d["path"]))
    return {"agree": not diffs, "differences": diffs}


# ----------------------------------------------------------------------------------------------
# manifest verification (section 8)
# ----------------------------------------------------------------------------------------------
MANDATORY = ["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "labels", "direction-cue",
             "indicators.non-color", "a11y.model", "state.report", "lifecycle"]
OPTIONAL = ["export.scene", "export.svg", "export.png", "a11y.native-dom", "a11y.companion-dom", "labels.edge", "motion.animated"]
RESERVED = ["scene.apply-delta"]
DEGRADATIONS = ["LABELS_ELIDED", "EDGE_LABELS_OMITTED", "EDGE_STYLE_SIMPLIFIED"]
_XID = re.compile(r"x-[a-z0-9][a-z0-9._-]*")
_NAME = re.compile(r"[a-z][a-z0-9._-]*")
_VER = re.compile(r"[0-9A-Za-z._+-]+")
_STRICT_SUPPORTED = {"scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "a11y.model", "state.report", "lifecycle"}
_VISUAL = {"labels": ["LABELS_ELIDED"], "direction-cue": ["EDGE_STYLE_SIMPLIFIED"], "indicators.non-color": []}
_NOVISUAL_ALLOWED_DEG = {"labels.edge": ["EDGE_LABELS_OMITTED"]}


def _me(r):
    return IgrError("INVALID_MANIFEST", r)


def verify_manifest(man):
    if not isinstance(man, dict):
        raise _me("SCHEMA")
    if set(man) != {"igr", "renderer", "capabilities", "capacity"}:
        raise _me("SCHEMA")
    if not isinstance(man["igr"], str):
        raise _me("SCHEMA")
    if man["igr"] != "IGR/1":
        raise _me("UNSUPPORTED_VERSION")
    r = man["renderer"]
    if not isinstance(r, dict) or set(r) != {"name", "version", "host"}:
        raise _me("SCHEMA")
    if not all(isinstance(r[k], str) for k in r) or r["host"] not in ("dom", "headless"):
        raise _me("SCHEMA")
    if not _NAME.fullmatch(r["name"]) or not _VER.fullmatch(r["version"]) or not r["name"].isascii() or not r["version"].isascii():
        raise _me("INVALID_NAME")
    cap = man["capacity"]
    if not isinstance(cap, dict) or set(cap) != {"maxNodes", "maxEdges", "maxDrawnLabelUnits"}:
        raise _me("SCHEMA")
    for k in ("maxNodes", "maxEdges", "maxDrawnLabelUnits"):
        v = cap[k]
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise _me("SCHEMA")
        if isinstance(v, float) and (not math.isfinite(v) or v != math.floor(v)):
            raise _me("INVALID_LIMITS")
        if not (1 <= v <= SAFE):
            raise _me("INVALID_LIMITS")
    caps = man["capabilities"]
    if not isinstance(caps, dict):
        raise _me("SCHEMA")
    known = set(MANDATORY) | set(OPTIONAL) | set(RESERVED)
    for cid in MANDATORY + OPTIONAL + RESERVED:
        if cid not in caps:
            raise _me("MISSING_CAPABILITY")
    for cid in caps:
        if cid not in known and not _XID.fullmatch(cid):
            raise _me("UNKNOWN_CAPABILITY")
    for cid in sorted(caps, key=u16key):
        st = caps[cid]
        # (a) shape
        if not isinstance(st, dict) or not isinstance(st.get("status"), str):
            raise _me("SCHEMA")
        status = st["status"]
        if status not in ("supported", "degraded", "unsupported"):
            raise _me("SCHEMA")
        if status == "supported" and set(st) != {"status"}:
            raise _me("SCHEMA")
        if status == "degraded":
            if set(st) != {"status", "degradations"} or not isinstance(st["degradations"], list) or not st["degradations"]:
                raise _me("SCHEMA")
            degs = st["degradations"]
            if not all(isinstance(d, str) for d in degs):
                raise _me("SCHEMA")
            if degs != sorted(set(degs)) and all(d in DEGRADATIONS for d in degs):
                raise _me("SCHEMA")
            # (b) known degradation names
            if any(d not in DEGRADATIONS for d in degs):
                raise _me("UNKNOWN_DEGRADATION")
        if status == "unsupported":
            if set(st) != {"status", "reason"} or st["reason"] not in ("RESERVED", "NOT_IMPLEMENTED", "HOST_LACKS"):
                raise _me("SCHEMA")
        reason = st.get("reason")
        # (c) status rule, in the precedence of 8.1
        if cid in RESERVED:
            if not (status == "unsupported" and reason == "RESERVED"):
                raise _me("RESERVED_CAPABILITY")
            continue
        if status == "unsupported" and reason == "RESERVED":
            raise _me("RESERVED_CAPABILITY")
        if cid.startswith("x-"):
            continue                                   # table 8.2: x-... any status, any degradation (AMBIGUITIES B-06)
        if status == "unsupported" and reason == "HOST_LACKS":
            if not (cid in _VISUAL and r["host"] == "headless"):
                raise _me("HOST_LACKS_NOT_ALLOWED")
            continue
        if cid in _STRICT_SUPPORTED or cid == "indicators.non-color":
            if status == "unsupported":
                raise _me("MANDATORY_UNSUPPORTED")
            if status == "degraded":
                raise _me("MANDATORY_DEGRADED")
            continue
        if cid in ("labels", "direction-cue"):
            if status == "unsupported":
                raise _me("MANDATORY_UNSUPPORTED")
            if status == "degraded" and any(d not in _VISUAL[cid] for d in st["degradations"]):
                raise _me("DEGRADATION_NOT_ALLOWED")
            continue
        # optional capabilities: labels.edge may degrade (EDGE_LABELS_OMITTED); the others only supported/unsupported
        if status == "degraded" and (cid != "labels.edge" or any(d != "EDGE_LABELS_OMITTED" for d in st["degradations"])):
            raise _me("DEGRADATION_NOT_ALLOWED")
    return man
