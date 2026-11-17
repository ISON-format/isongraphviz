#!/usr/bin/env python3
"""Independent IGLOD/1 oracle library. Python standard library only.

Written from docs/isongraph-visualize-blueprint/29-LOD-DESIGN.md (rev 2) and the frozen IGS/1 and IGL/1 texts.
No TypeScript was read or run. Every function below is this author's own implementation of a rule of the design;
where the text is ambiguous the chosen reading is recorded in ../AMBIGUITIES.md.
"""
import hashlib, re

MAXSAFE = 2 ** 53 - 1
INT31 = 2 ** 31 - 1
MAX_INPUT_BYTES = 268435456
MAX_STATE_BYTES = 33554432
MAX_NODES, MAX_EDGES = 100000, 500000
MAX_GROUPS, MAX_MEMBER_ENTRIES, MAX_AGG_DEPTH, MAX_LABEL_UNITS, MAX_RULES = 20000, 500000, 16, 256, 8
MAX_WORK_HARD = 1000000000
MUT = {}      # seeded mutants for the self-check of the corpus (tools/mutants.py); empty in every normal run
DEFAULT_BUDGET = {"maxNodes": 20000, "maxEdges": 100000, "maxWork": 100000000}
HARD = {"maxNodes": MAX_NODES, "maxEdges": MAX_EDGES, "maxWork": MAX_WORK_HARD}


def sha(b):
    return hashlib.sha256(b).hexdigest()


class LODErr(Exception):
    def __init__(self, code, reason="", prefix="", detail=""):
        super().__init__("%s%s/%s %s" % (prefix, code, reason, detail))
        self.code, self.reason, self.prefix, self.detail = code, reason, prefix, detail

    def tag(self):
        return "%s%s/%s" % (self.prefix, self.code, self.reason)


def E(code, reason="", detail=""):
    return LODErr(code, reason, "", detail)


def IE(code, reason="", detail=""):
    return LODErr(code, reason, "IGS:", detail)


def LE(code, reason="", detail=""):
    return LODErr(code, reason, "LAYOUT:", detail)


# ------------------------------------------------------------------ canonical JSON (IGS-CJ/1, IGL-CJ/1 when signed)
_ESC = {0x22: '\\"', 0x5C: '\\\\', 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r'}
_ESCRE = re.compile('["\\\\\x00-\x1f]')


def jstr(s):
    return '"' + _ESCRE.sub(lambda m: _ESC.get(ord(m.group()), '\\u%04x' % ord(m.group())), s) + '"'


def u16(s):
    return s.encode("utf-16-be", "surrogatepass")


def cj(v, signed=False):
    if v is None:
        return "null"      # never produced by the canonical writers; lets the generator spell hostile inputs
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        if v < 0 and not signed:
            raise ValueError("negative integer in IGS-CJ/1")
        if abs(v) > MAXSAFE:
            raise ValueError("integer out of range")
        return str(v)
    if isinstance(v, str):
        return jstr(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(cj(x, signed) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(jstr(k) + ":" + cj(v[k], signed) for k in sorted(v, key=u16)) + "}"
    raise TypeError(type(v))


def cjb(v, signed=False):
    return cj(v, signed).encode("utf-8")


# ------------------------------------------------------------------ strict-ish JSON parsing that keeps number tokens
class Tok:
    __slots__ = ("s", "isint")

    def __init__(self, s, isint):
        self.s, self.isint = s, isint


class Obj(dict):
    pass


def _pairs(pairs):
    o = Obj()
    for k, v in pairs:
        o[k] = v          # last wins
    return o


def _bad_const(c):
    raise ValueError("constant " + c)


import json as _json


def parse_json(text):
    return _json.loads(text, parse_int=lambda s: Tok(s, True), parse_float=lambda s: Tok(s, False),
                       parse_constant=_bad_const, object_pairs_hook=_pairs)


def plain(v):
    """Tok int -> int; Obj -> dict (only used after validation)."""
    if isinstance(v, Tok):
        if v.isint:
            return int(v.s)
        from decimal import Decimal
        d = Decimal(v.s)
        return int(d) if d == d.to_integral_value() else float(v.s)
    if isinstance(v, list):
        return [plain(x) for x in v]
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    return v


_LONE = re.compile("[\ud800-\udfff]")
_INTTOK = re.compile(r"0|[1-9][0-9]*")


def has_lone(s):
    return _LONE.search(s) is not None


# ------------------------------------------------------------------ identities and ordering
_I64 = re.compile(r"0|-?[1-9][0-9]*")


def valid_id(s):
    if s.startswith("i:"):
        t = s[2:]
        return _I64.fullmatch(t) is not None and -2 ** 63 <= int(t) <= 2 ** 63 - 1
    return s.startswith("s:")


# whitespace = the JavaScript \s class (design rev 3, section 3 stage 2), listed explicitly; not Python str.isspace
JS_WS = set(range(0x09, 0x0E)) | {0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF} | set(range(0x2000, 0x200B))


def valid_ident(t):
    return len(t) > 0 and not any(c in ':|"\\' or ord(c) in JS_WS for c in t)


def ref_key(ref):
    t, i = ref["type"].encode("utf-8"), ref["id"]
    if i.startswith("i:"):
        return (t, 0, int(i[2:]), b"")
    if MUT.get("utf16order"):
        return (t, 1, 0, u16(i[2:]))
    return (t, 1, 0, i[2:].encode("utf-8"))


def nkey(ref):
    """lookup key (scene-core nodeKey): JSON.stringify([type, idwire])"""
    return cj([ref["type"], ref["id"]])


def wref(ref):
    return {"id": ref["id"], "type": ref["type"]}


def is_agg_id(s):
    return isinstance(s, str) and re.fullmatch(r"igagg1:[0-9a-f]{64}", s) is not None and not s.endswith("\n")


def agg_id(scene_sha, members_in_order):
    pre = cjb({"agg": "IGLOD-AGG/1", "members": [wref(m) for m in members_in_order], "scene_sha256": scene_sha})
    return "igagg1:" + sha(pre), len(pre)


def floordiv(a, b):
    return a // b


def anchor_of(pts):
    k = len(pts)
    sx = sum(p[0] for p in pts)
    sy = sum(p[1] for p in pts)
    if MUT.get("trunc"):
        return int((2 * sx + k) / (2 * k)), int((2 * sy + k) / (2 * k))
    return floordiv(2 * sx + k, 2 * k), floordiv(2 * sy + k, 2 * k)


def bitlen(x):
    return x.bit_length()


def cdiv(a, b):
    return -(-a // b)


# ------------------------------------------------------------------ cjViolation for x- values
def _depth(v):
    if isinstance(v, list):
        return 1 + max([_depth(x) for x in v] or [0])
    if isinstance(v, dict):
        return 1 + max([_depth(x) for x in v.values()] or [0])
    return 0


def cjviolation(v, maxdepth=64):
    if _depth(v) > maxdepth:
        return "TOO_DEEP"
    return _cjv(v)


def _cjv(v):
    if v is None:
        return "INVALID_VALUE"
    if isinstance(v, bool):
        return None
    if isinstance(v, Tok):
        # rev 4: numbers inside x- values are judged by VALUE: a leading '-', a fraction, an infinite value or a value above 2^53-1 is
        # INVALID_NUMBER; an integer value spelled non-canonically (1.0, 1e3) passes here and is NON_CANONICAL at stage 4
        if v.s.startswith("-"):
            return "INVALID_NUMBER"
        if v.isint:
            return "INVALID_NUMBER" if int(v.s) > MAXSAFE else None
        from decimal import Decimal
        try:
            d = Decimal(v.s)
            if d != d.to_integral_value() or d > MAXSAFE:
                return "INVALID_NUMBER"
        except Exception:
            return "INVALID_NUMBER"
        return None
    if isinstance(v, str):
        return "INVALID_STRING" if has_lone(v) else None
    if isinstance(v, list):
        for x in v:
            r = _cjv(x)
            if r:
                return r
        return None
    if isinstance(v, dict):
        for k in sorted(v, key=u16):
            if has_lone(k):
                return "INVALID_STRING"
            r = _cjv(v[k])
            if r:
                return r
        return None
    return "INVALID_VALUE"


# ------------------------------------------------------------------ laminar painting (design 5.1)
def paint(groups, nnodes):
    """groups: list of lists of node indices (distinct members, sizes >= 2). Returns parent, depth, owner."""
    order = sorted(range(len(groups)), key=lambda g: -len(groups[g]))   # stable: ties keep input order
    owner = [-1] * nnodes
    parent = [-1] * len(groups)
    depth = [0] * len(groups)
    bad = False
    for g in order:
        ms = groups[g]
        o = owner[ms[0]]
        for m in ms:
            if owner[m] != o:
                bad = True
                break
        if bad:
            raise E("INVALID_GROUP", "OVERLAPPING_GROUPS")
        parent[g] = o
        depth[g] = 1 if o < 0 else depth[o] + 1
        for m in ms:
            owner[m] = g
    return parent, depth, owner


# ------------------------------------------------------------------ LODState verification (design 3)
RESERVED = {"groups", "lod_min", "visibility", "hulls", "levels", "group_source", "extensions", "selection", "viewport"}
XKEY = re.compile(r"x-[a-z0-9][a-z0-9._-]*")
SPEC = {
    "top": {"collapsed": "collapsed", "edge_policy": "edge", "label_policy": "label", "layout_sha256": "hash", "lod": "lod",
            "pinned": "pins", "scene_sha256": "hash", "zoom_milli": "int"},
    "group": {"label": "str", "members": "refs"},
    "edge": {"keep_forest": "bool", "max_view_edges": "int"},
    "label": {"full_degree": "int", "full_zoom_milli": "int", "short_degree": "int", "short_zoom_milli": "int"},
    "ref": {"id": "id", "type": "type"},
}
REQ = {"top": ["collapsed", "label_policy", "layout_sha256", "lod", "pinned", "scene_sha256", "zoom_milli"], "group": ["members"],
       "edge": ["keep_forest", "max_view_edges"], "label": ["full_degree", "full_zoom_milli", "short_degree", "short_zoom_milli"],
       "ref": ["id", "type"]}


def _int_ok(v):
    if isinstance(v, Tok):
        if not v.isint or not _INTTOK.fullmatch(v.s) or int(v.s) > INT31:
            raise E("INVALID_LOD", "INVALID_NUMBER")
        return
    raise E("INVALID_LOD", "SCHEMA")


def _check_value(kind, v):
    if kind == "int":
        return _int_ok(v)
    if kind == "bool":
        if not isinstance(v, bool):
            raise E("INVALID_LOD", "SCHEMA")
        return
    if kind in ("str", "hash", "lod", "id", "type"):
        if not isinstance(v, str):
            raise E("INVALID_LOD", "SCHEMA")
        if has_lone(v):
            raise E("INVALID_LOD", "INVALID_STRING")
        if kind == "hash" and re.fullmatch(r"[0-9a-f]{64}", v) is None:
            raise E("INVALID_LOD", "INVALID_HASH")
        if kind == "lod" and v != "IGLOD/1":
            raise E("INVALID_LOD", "UNSUPPORTED_VERSION")
        if kind == "id" and not valid_id(v):
            raise E("INVALID_LOD", "INVALID_ID")
        if kind == "type" and not valid_ident(v):
            raise E("INVALID_LOD", "INVALID_IDENTIFIER")
        return
    if kind == "collapsed":
        if not isinstance(v, list):
            raise E("INVALID_LOD", "SCHEMA")
        for g in v:
            _check_object("group", g)
        return
    if kind in ("refs", "pins"):
        if not isinstance(v, list):
            raise E("INVALID_LOD", "SCHEMA")
        for r in v:
            _check_object("ref", r)
        return
    if kind in ("edge", "label"):
        return _check_object(kind, v)
    raise AssertionError(kind)


def _check_object(kind, o, top=False):
    if not isinstance(o, dict):
        raise E("INVALID_LOD", "SCHEMA")
    if kind == "ref" and "agg" in o:
        raise E("INVALID_GROUP", "AGGREGATE_AS_MEMBER")
    spec = SPEC[kind]
    keys = sorted(o.keys(), key=u16)
    for k in keys:
        if top and k in RESERVED:
            raise E("INVALID_LOD", "RESERVED_FIELD")
        if k in spec:
            continue
        if top and XKEY.fullmatch(k):
            r = cjviolation(o[k], 64)
            if r:
                raise E("INVALID_LOD", r)
            continue
        raise E("INVALID_LOD", "UNKNOWN_FIELD")
    for k in REQ[kind]:          # REQ lists are in ascending order
        if k not in o:
            raise E("INVALID_LOD", "MISSING_FIELD")
    for k in keys:
        if k in spec:
            _check_value(spec[k], o[k])


def decode_utf8(b, errcls):
    if b[:3] == b"\xef\xbb\xbf":
        raise errcls("INVALID_ENCODING")
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        raise errcls("INVALID_ENCODING")


def canonical_state_obj(o):
    """o: parsed object with Tok -> already plain. Returns canonical-ordered plain dict (sort members, collapsed, pinned)."""
    out = {}
    for k, v in o.items():
        if k == "collapsed":
            gs = []
            for g in v:
                gg = {"members": sorted((wref(r) for r in g["members"]), key=ref_key)}
                if "label" in g:
                    gg["label"] = g["label"]
                gs.append(gg)
            gs.sort(key=lambda g: [ref_key(r) for r in g["members"]])
            out[k] = gs
        elif k == "pinned":
            out[k] = sorted((wref(r) for r in v), key=ref_key)
        else:
            out[k] = v
    return out


def verify_state(b):
    """returns (state(plain dict), canonical bytes, state_sha256)."""
    if len(b) > MAX_STATE_BYTES:                      # the standalone verifier applies this size limit too (rev 3)
        raise E("RESOURCE_LIMIT", "STATE_BYTES")
    txt = decode_utf8(b, lambda r: E("INVALID_LOD", r))
    try:
        obj = parse_json(txt)
    except (ValueError, RecursionError):
        raise E("INVALID_LOD", "SCHEMA")
    _check_object("top", obj, top=True)
    cols = obj["collapsed"]
    for g in cols:
        if "label" in g and len(g["label"].encode("utf-16-le", "surrogatepass")) // 2 > MAX_LABEL_UNITS:
            raise E("RESOURCE_LIMIT", "LABEL_LIMIT")
    if len(cols) > MAX_GROUPS:
        raise E("RESOURCE_LIMIT", "GROUP_LIMIT")
    if sum(len(g["members"]) for g in cols) > MAX_MEMBER_ENTRIES:
        raise E("RESOURCE_LIMIT", "MEMBER_LIMIT")
    st = plain(obj)
    canon = canonical_state_obj(st)
    cb = cjb(canon)
    if cb != b:
        raise E("INVALID_LOD", "NON_CANONICAL")
    # stage 5
    keyidx = {}
    groups = []
    for g in canon["collapsed"]:
        ms = g["members"]
        if len(ms) == 0:
            raise E("INVALID_GROUP", "EMPTY_GROUP")
        if len(ms) < 2:
            raise E("INVALID_GROUP", "GROUP_TOO_SMALL")
        ks = [ref_key(r) for r in ms]
        for i in range(1, len(ks)):
            if ks[i] == ks[i - 1]:
                raise E("INVALID_GROUP", "DUPLICATE_MEMBER")
    gk = [[ref_key(r) for r in g["members"]] for g in canon["collapsed"]]
    for i in range(1, len(gk)):
        if gk[i] == gk[i - 1] and not MUT.get("dupafter"):
            raise E("INVALID_GROUP", "DUPLICATE_GROUP")
    for g in canon["collapsed"]:
        idxs = []
        for r in g["members"]:
            kk = ref_key(r)
            if kk not in keyidx:
                keyidx[kk] = len(keyidx)
            idxs.append(keyidx[kk])
        groups.append(idxs)
    if MUT.get("dupafter"):
        gkk = [tuple(x) for x in groups]
        try:
            paint([sorted(set(g)) for g in groups], len(keyidx))
        except LODErr:
            raise
        for i in range(1, len(gk)):
            if gk[i] == gk[i - 1]:
                raise E("INVALID_GROUP", "DUPLICATE_GROUP")
    parent, depth, owner = paint(groups, len(keyidx))
    if depth and max(depth) > MAX_AGG_DEPTH:
        raise E("RESOURCE_LIMIT", "DEPTH_LIMIT")
    pk = [ref_key(r) for r in canon["pinned"]]
    for i in range(1, len(pk)):
        if pk[i] == pk[i - 1]:
            raise E("INVALID_LOD", "DUPLICATE_PIN")
    lp = canon["label_policy"]
    if lp["short_zoom_milli"] > lp["full_zoom_milli"] or lp["short_degree"] > lp["full_degree"]:
        raise E("INVALID_POLICY", "THRESHOLD_ORDER")
    return canon, cb, sha(cb)


# ------------------------------------------------------------------ IGS scene (own writer and a verifier sufficient for this corpus)
def scene_edge_key(e):
    r = e["ref"]
    return (ref_key(r["src"]), r["rel"].encode("utf-8"), ref_key(r["tgt"]), r["ord"].encode("utf-8"))


def build_scene(nodes, edges, directed=True, artifact="0" * 64, extra_top=None):
    """nodes: [(type, idwire)]; edges: [(rel, srctype, srcid, tgttype, tgtid)]. Canonical IGS-CJ/1 bytes."""
    ns = sorted(({"category": t, "label": i[2:], "ref": {"id": i, "type": t}} for t, i in nodes), key=lambda n: ref_key(n["ref"]))
    es = []
    seen = set()
    for rel, st, si, tt, ti in edges:
        s, t = {"id": si, "type": st}, {"id": ti, "type": tt}
        if not directed and ref_key(s) > ref_key(t):
            s, t = t, s
        key = (ref_key(s), rel, ref_key(t))
        if key in seen:
            raise ValueError("duplicate edge in builder")
        seen.add(key)
        es.append({"label": rel, "ref": {"ord": "0", "rel": rel, "src": s, "tgt": t}})
    es.sort(key=scene_edge_key)
    o = {"address_scheme": "igs-addr/1", "edges": es, "graph": {"directed": directed, "profile": "simple"}, "igs": "IGS/1", "nodes": ns,
         "source": {"artifact_sha256": artifact, "serialization_profile": "ison-v1"}}
    if extra_top:
        o.update(extra_top)
    return cjb(o)


SCENE_TOP = {"igs", "address_scheme", "source", "graph", "nodes", "edges", "extensions"}


def verify_scene(b):
    """Returns dict(directed, nodes=[wire refs in scene order], edges=[{src,tgt,rel,ref}], sha). Own implementation of IGS/1 5.8
    sufficient for the scenes of this corpus; reasons follow IGS-1.md 5.8."""
    txt = decode_utf8(b, lambda r: IE("INVALID_SCENE", r))
    try:
        o = parse_json(txt)
    except (ValueError, RecursionError):
        raise IE("INVALID_SCENE", "SCHEMA")
    if not isinstance(o, dict):
        raise IE("INVALID_SCENE", "SCHEMA")
    for k in sorted(o, key=u16):
        if k in ("groups", "enrichments", "layout_intent"):
            raise IE("INVALID_SCENE", "RESERVED_FIELD")
        if k == "scene_sha256":
            raise IE("INVALID_SCENE", "SCHEMA")
        if k not in SCENE_TOP and not XKEY.fullmatch(k):
            raise IE("INVALID_SCENE", "SCHEMA")
    for k in ("igs", "address_scheme", "source", "graph", "nodes", "edges"):
        if k not in o:
            raise IE("INVALID_SCENE", "SCHEMA")
    if o["igs"] != "IGS/1" or o["address_scheme"] != "igs-addr/1":
        raise IE("INVALID_SCENE", "SCHEMA")

    def chk_ref(r):
        if not isinstance(r, dict) or set(r) != {"id", "type"} or not isinstance(r["id"], str) or not isinstance(r["type"], str):
            raise IE("INVALID_SCENE", "SCHEMA")
        if not valid_id(r["id"]):
            raise IE("INVALID_SCENE", "INVALID_ID")
        if not valid_ident(r["type"]):
            raise IE("INVALID_SCENE", "INVALID_IDENTIFIER")
    if not isinstance(o["nodes"], list) or not isinstance(o["edges"], list):
        raise IE("INVALID_SCENE", "SCHEMA")
    for n in o["nodes"]:
        if not isinstance(n, dict) or set(n) != {"category", "label", "ref"}:
            raise IE("INVALID_SCENE", "SCHEMA")
        chk_ref(n["ref"])
        if not isinstance(n["category"], str) or not isinstance(n["label"], str):
            raise IE("INVALID_SCENE", "SCHEMA")
    for e in o["edges"]:
        if not isinstance(e, dict) or set(e) != {"label", "ref"} or not isinstance(e["ref"], dict) or set(e["ref"]) != {"ord", "rel", "src", "tgt"}:
            raise IE("INVALID_SCENE", "SCHEMA")
        chk_ref(e["ref"]["src"])
        chk_ref(e["ref"]["tgt"])
        if not isinstance(e["ref"]["rel"], str) or not valid_ident(e["ref"]["rel"]):
            raise IE("INVALID_SCENE", "INVALID_IDENTIFIER")
        if not isinstance(e["ref"]["ord"], str) or not re.fullmatch(r"0|[1-9][0-9]*", e["ref"]["ord"]):
            raise IE("INVALID_SCENE", "INVALID_ORDINAL")
    ext = o.get("extensions")
    g = o["graph"]
    if not isinstance(g, dict) or set(g) != {"directed", "profile"} or not isinstance(g["directed"], bool) or g["profile"] != "simple":
        raise IE("INVALID_SCENE", "SCHEMA")
    src = o["source"]
    if not isinstance(src, dict) or set(src) != {"artifact_sha256", "serialization_profile"} or src["serialization_profile"] != "ison-v1" \
            or not isinstance(src["artifact_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", src["artifact_sha256"]):
        raise IE("INVALID_SCENE", "SCHEMA")
    if ext is not None:
        if not isinstance(ext, list) or any(not isinstance(x, str) for x in ext):
            raise IE("INVALID_SCENE", "SCHEMA")
        if len(ext) == 0:
            raise IE("INVALID_SCENE", "NON_CANONICAL")
        raise IE("UNSUPPORTED_EXTENSION", "")
    p = plain(o)
    p["nodes"] = sorted(p["nodes"], key=lambda n: ref_key(n["ref"]))
    p["edges"] = sorted(p["edges"], key=scene_edge_key)
    if cjb(p) != b:
        raise IE("INVALID_SCENE", "NON_CANONICAL")
    seen = set()
    for n in p["nodes"]:
        k = ref_key(n["ref"])
        if k in seen:
            raise IE("INVALID_SCENE", "DUPLICATE_NODE_REF")
        seen.add(k)
    es = set()
    for e in p["edges"]:
        r = e["ref"]
        k = scene_edge_key(e)
        if k in es:
            raise IE("INVALID_SCENE", "DUPLICATE_EDGE_REF")
        es.add(k)
        if ref_key(r["src"]) not in seen or ref_key(r["tgt"]) not in seen:
            raise IE("INVALID_SCENE", "DANGLING_EDGE_ENDPOINT")
        if not g["directed"] and ref_key(r["src"]) > ref_key(r["tgt"]):
            raise IE("INVALID_SCENE", "NON_CANONICAL_ENDPOINTS")
        if e["label"] != r["rel"]:
            raise IE("INVALID_SCENE", "LABEL_MISMATCH")
    for n in p["nodes"]:
        if n["category"] != n["ref"]["type"]:
            raise IE("INVALID_SCENE", "CATEGORY_MISMATCH")
        if n["label"] != n["ref"]["id"][2:]:
            raise IE("INVALID_SCENE", "LABEL_MISMATCH")
    return {"directed": g["directed"], "nodes": [n["ref"] for n in p["nodes"]],
            "edges": [{"src": e["ref"]["src"], "tgt": e["ref"]["tgt"], "rel": e["ref"]["rel"], "ref": e["ref"]} for e in p["edges"]],
            "sha": sha(b)}


# ------------------------------------------------------------------ IGL layout (igl-fixed/1 only)
FIXED_POLICY = {"algorithm": "igl-fixed/1", "config": {}, "family": "FIXED"}


def build_layout(scene_sha, pos):
    """pos: list of (ref, x, y)"""
    ns = sorted(({"ref": wref(r), "x": x, "y": y} for r, x, y in pos), key=lambda n: ref_key(n["ref"]))
    return cjb({"address_scheme": "igs-addr/1", "igl": "IGL/1", "nodes": ns, "policy": FIXED_POLICY, "scale": 1000, "scene_sha256": scene_sha}, True)


def verify_layout(b):
    txt = decode_utf8(b, lambda r: LE("INVALID_LAYOUT", r))
    try:
        o = parse_json(txt)
    except (ValueError, RecursionError):
        raise LE("INVALID_LAYOUT", "SCHEMA")
    LREQ = {"address_scheme", "igl", "nodes", "policy", "scale", "scene_sha256"}
    if not isinstance(o, dict) or not LREQ <= set(o) or any(k not in LREQ and not XKEY.fullmatch(k) for k in o):
        raise LE("INVALID_LAYOUT", "SCHEMA")
    if o["igl"] != "IGL/1" or o["address_scheme"] != "igs-addr/1":
        raise LE("INVALID_LAYOUT", "UNSUPPORTED_VERSION")
    if not isinstance(o["scene_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", o["scene_sha256"]):
        raise LE("INVALID_LAYOUT", "INVALID_HASH")
    if not isinstance(o["nodes"], list):
        raise LE("INVALID_LAYOUT", "SCHEMA")
    for n in o["nodes"]:
        if not isinstance(n, dict) or not {"ref", "x", "y"} <= set(n) or any(k not in ("ref", "x", "y") and not XKEY.fullmatch(k) for k in n):
            raise LE("INVALID_LAYOUT", "SCHEMA")
        r = n["ref"]
        if not isinstance(r, dict) or set(r) != {"id", "type"} or not isinstance(r["id"], str) or not valid_id(r["id"]) or not valid_ident(r["type"]):
            raise LE("INVALID_LAYOUT", "SCHEMA")
        for c in ("x", "y"):
            t = n[c]
            if not isinstance(t, Tok) or not t.isint or not re.fullmatch(r"0|-?[1-9][0-9]*", t.s) or abs(int(t.s)) > MAXSAFE:
                raise LE("INVALID_COORDINATE", "NOT_INTEGER")
    p = plain(o)
    p["nodes"] = sorted(p["nodes"], key=lambda n: ref_key(n["ref"]))
    if cjb(p, True) != b:
        raise LE("INVALID_LAYOUT", "NON_CANONICAL")
    if p["policy"] != FIXED_POLICY or p["scale"] != 1000:
        raise LE("INVALID_LAYOUT", "SCHEMA")
    ks = [ref_key(n["ref"]) for n in p["nodes"]]
    if len(set(ks)) != len(ks):
        raise LE("INVALID_LAYOUT", "DUPLICATE_NODE_REF")
    return p


def bind_layout(scene_b, layout_b):
    sc = verify_scene(scene_b)
    lay = verify_layout(layout_b)
    if lay["scene_sha256"] != sc["sha"]:
        raise LE("SCENE_MISMATCH", "")
    sk = {ref_key(r) for r in sc["nodes"]}
    lk = {ref_key(n["ref"]) for n in lay["nodes"]}
    if sk - lk:
        raise LE("INCOMPLETE_LAYOUT", "MISSING_NODE")
    if lk - sk:
        raise LE("INCOMPLETE_LAYOUT", "UNKNOWN_NODE")
    pos = {ref_key(n["ref"]): (n["x"], n["y"]) for n in lay["nodes"]}
    return sc, lay, pos, sha(layout_b)


# ------------------------------------------------------------------ budget
def check_budget(budget):
    eff = dict(DEFAULT_BUDGET)
    if budget is None:
        return eff
    if not isinstance(budget, dict):
        raise E("INVALID_POLICY", "INVALID_BUDGET")
    for k, v in budget.items():
        if k not in eff:
            raise E("INVALID_POLICY", "INVALID_BUDGET")
        if isinstance(v, bool) or not isinstance(v, int) or v < 1 or v > MAXSAFE or v > HARD[k]:
            raise E("INVALID_POLICY", "INVALID_BUDGET")
        eff[k] = v
    return eff


def lkey_lrel(sc):
    lkey = max([len(nkey(r).encode("utf-8")) for r in sc["nodes"]] or [0])
    rels = {e["rel"] for e in sc["edges"]}
    lrel = max([len(r.encode("utf-8")) for r in rels] or [0])
    return lkey, lrel, len(rels)


def work_W(Hs, n, m, M, T, G, R, Lrel, Lkey, Hids, Hscene, Hlayout):
    Hv = 6 * Hscene + Hlayout + 160 * (n + m) + 2048 * G + 4096
    return (cdiv(Hs, 8) + 4 * n + 6 * m + 8 * M + 4 * T + 2 * G * bitlen(G) + 3 * m * bitlen(m)
            + 3 * R * bitlen(R) * (1 + 2 * cdiv(Lrel, 64))
            + m * (3 + 2 * cdiv(Lkey, 64) + cdiv(Lrel, 64)) + (n + M) * cdiv(Lkey, 64)
            + cdiv(Hids, 64) + G + cdiv(Hv + 9, 64) + cdiv(Hs + 9, 64) + cdiv(Hv, 8))


# ------------------------------------------------------------------ label level
LEVELS = ["hidden", "short", "full"]


def label_level(lp, zoom, d):
    tz = 2 if zoom >= lp["full_zoom_milli"] else 1 if zoom >= lp["short_zoom_milli"] else 0
    td = 2 if d >= lp["full_degree"] else 1 if d >= lp["short_degree"] else 0
    return LEVELS[max(tz, min(td, tz + 1))]


# ------------------------------------------------------------------ rep / bundling (shared by deriveView and resolveAggregateEdge)
def classify(sc, rep, n, directed):
    """rep: list of length n giving rep id (scene index < n, or aggregate token >= n). Returns visible(list of edge idx),
    internal{agg: {rel: count}}, bundles{key: (list of edge idx)} (key by (ru, rv))."""
    visible, internal, bundles = [], {}, {}
    idx = sc["_idx"]
    for ei, e in enumerate(sc["edges"]):
        u, v = idx[ref_key(e["src"])], idx[ref_key(e["tgt"])]
        ru, rv = rep[u], rep[v]
        if ru == u and rv == v:
            visible.append(ei)
        elif ru == rv and ru >= n:
            internal.setdefault(ru, []).append(ei)
        else:
            key = (ru, rv) if (directed and not MUT.get("dirkey")) else (min(ru, rv), max(ru, rv))
            bundles.setdefault(key, []).append(ei)
    return visible, internal, bundles


def relcounts(sc, edge_idxs):
    c = {}
    for ei in edge_idxs:
        r = sc["edges"][ei]["rel"]
        c[r] = c.get(r, 0) + 1
    return [{"count": c[r], "rel": r} for r in sorted(c, key=(u16 if MUT.get("relutf16") else (lambda s: s.encode("utf-8"))))]


def prep_scene(sc):
    sc["_idx"] = {ref_key(r): i for i, r in enumerate(sc["nodes"])}
    return sc


# ------------------------------------------------------------------ deriveView
def derive_view(scene_b, layout_b, state_b, budget=None, _trace=None):
    bud = check_budget(budget)
    if len(scene_b) + len(layout_b) + len(state_b) > MAX_INPUT_BYTES:
        raise E("RESOURCE_LIMIT", "INPUT_BYTES")
    if len(state_b) > MAX_STATE_BYTES:
        raise E("RESOURCE_LIMIT", "STATE_BYTES")
    st, canon_b, st_sha = verify_state(state_b)
    sc, lay, pos, lay_sha = bind_layout(scene_b, layout_b)
    prep_scene(sc)
    nodes, n, m = sc["nodes"], len(sc["nodes"]), len(sc["edges"])
    if n > min(bud["maxNodes"], MAX_NODES):
        raise E("RESOURCE_LIMIT", "NODE_LIMIT")
    if m > min(bud["maxEdges"], MAX_EDGES):
        raise E("RESOURCE_LIMIT", "EDGE_LIMIT")
    if st["scene_sha256"] != sc["sha"]:
        raise E("STATE_MISMATCH", "SCENE")
    if st["layout_sha256"] != lay_sha:
        raise E("STATE_MISMATCH", "LAYOUT")
    idx = sc["_idx"]
    groups, glabel = [], []
    for g in st["collapsed"]:
        li = []
        for r in g["members"]:
            k = ref_key(r)
            if k not in idx:
                raise E("UNRESOLVED_NODE", "MEMBER")
            li.append(idx[k])
        groups.append(li)
        glabel.append(g.get("label"))
    pins = set()
    for r in st["pinned"]:
        k = ref_key(r)
        if k not in idx:
            raise E("UNRESOLVED_NODE", "PINNED")
        pins.add(idx[k])
    G = len(groups)
    M = sum(len(g) for g in groups)
    lkey, lrel, R = lkey_lrel(sc)
    ids, pre_total = [], 0
    for g in groups:
        i, ln = agg_id(sc["sha"], [nodes[x] for x in g if not (MUT.get("idnopins") and x in pins)])
        ids.append(i)
        pre_total += ln
    W = work_W(len(state_b), n, m, M, len(pins), G, R, lrel, lkey, pre_total, len(scene_b), len(layout_b))
    if _trace is not None:
        _trace["W"] = W
        _trace["Hv"] = 6 * len(scene_b) + len(layout_b) + 160 * (n + m) + 2048 * G + 4096
    if W > bud["maxWork"]:
        raise E("RESOURCE_LIMIT", "WORK_LIMIT")
    if len(set(ids)) != len(ids):
        raise E("INTERNAL", "ID_COLLISION")
    view = build_view(sc, lay, pos, st, st_sha, groups, glabel, ids, pins)
    return view, cjb(view, True), sha(cjb(view, True))


def build_view(sc, lay, pos, st, st_sha, groups, glabel, ids, pins):
    nodes, n, m, directed = sc["nodes"], len(sc["nodes"]), len(sc["edges"]), sc["directed"]
    lp, zoom = st["label_policy"], st["zoom_milli"]
    parent, depth, owner = paint(groups, n)
    G = len(groups)
    topg = list(range(G))
    for g in range(G):
        t = g
        while parent[t] >= 0:
            t = parent[t]
        topg[g] = t
    top_of_node = [topg[owner[v]] if owner[v] >= 0 else -1 for v in range(n)]
    emitted = []
    for g in range(G):
        if parent[g] < 0 and any(x not in pins for x in groups[g]):
            emitted.append(g)
    emitted.sort(key=lambda g: ids[g])
    arank = {g: n + j for j, g in enumerate(emitted)}
    rep = list(range(n))
    for v in range(n):
        if v in pins or top_of_node[v] < 0:
            continue
        if top_of_node[v] in arank:
            rep[v] = arank[top_of_node[v]]
    visible, internal, bundles = classify(sc, rep, n, directed)
    # items
    items = []     # (kind, a, b, src, tgt, edge_idx_list)
    idx = sc["_idx"]
    for ei in visible:
        e = sc["edges"][ei]
        items.append((0, ei, 0, idx[ref_key(e["src"])], idx[ref_key(e["tgt"])], [ei]))
    for (s, t), lst in bundles.items():
        items.append((1, s, t, s, t, lst))
    vdeg = {}
    for it in items:
        vdeg[it[3]] = vdeg.get(it[3], 0) + 1
        if it[4] != it[3] or MUT.get("loop2"):
            vdeg[it[4]] = vdeg.get(it[4], 0) + 1
    removed = []
    ep = st.get("edge_policy")
    kept = items
    if ep is not None and len(items) > ep["max_view_edges"]:
        cap = ep["max_view_edges"]
        order = sorted(items, key=lambda it: (vdeg.get(it[3], 0) + vdeg.get(it[4], 0), it[0], it[1], it[2]))
        if ep["keep_forest"] and not MUT.get("noforest"):
            par = list(range(n + len(emitted)))

            def find(x):
                while par[x] != x:
                    par[x] = par[par[x]]
                    x = par[x]
                return x
            forest = []
            rest = []
            for it in order:
                a, b = find(it[3]), find(it[4])
                if a != b:
                    par[a] = b
                    forest.append(it)
                else:
                    rest.append(it)
            room = max(0, cap - len(forest))
            keep_set = set(id(x) for x in forest) | set(id(x) for x in rest[:room])
            removed = [x for x in order if id(x) not in keep_set]
            kept = [x for x in items if id(x) in keep_set]
        else:
            keep_set = set(id(x) for x in order[:cap])
            removed = order[cap:]
            kept = [x for x in items if id(x) in keep_set]
    # elision accounting
    eli = {}
    el_items, el_edges = 0, 0
    el_edge_list = []
    for it in removed:
        el_items += 1
        el_edges += len(it[5])
        el_edge_list += it[5]
        eli[it[3]] = eli.get(it[3], 0) + 1
        if it[4] != it[3]:
            eli[it[4]] = eli.get(it[4], 0) + 1
    # emit
    kept_vis = sorted(it[1] for it in kept if it[0] == 0)
    kept_bun = sorted(((it[1], it[2], it) for it in kept if it[0] == 1), key=lambda x: (x[0], x[1]))

    def vr(x):
        return {"agg": ids[emitted[x - n]]} if x >= n else wref(nodes[x])
    vnodes = []
    for v in range(n):
        if rep[v] != v:
            continue
        d = vdeg.get(v, 0)
        lvl = "full" if v in pins else label_level(lp, zoom, d)
        o = {"label_level": lvl, "ref": wref(nodes[v]), "x": pos[ref_key(nodes[v])][0], "y": pos[ref_key(nodes[v])][1]}
        if eli.get(v, 0):
            o["elided_edges"] = eli[v]
        vnodes.append(o)
    aggs = []
    for g in emitted:
        a = arank[g]
        mem = groups[g]
        hid = [x for x in mem if x not in pins]
        exp = [x for x in mem if x in pins]
        pts = [pos[ref_key(nodes[x])] for x in hid]
        ax, ay = anchor_of(pts)
        ie = internal.get(a, [])
        o = {"anchor": {"x": ax, "y": ay}, "hidden": [wref(nodes[x]) for x in hid], "id": ids[g],
             "internal_edges": {"count": len(ie), "rel_counts": relcounts(sc, ie)}, "member_count": len(mem)}
        if exp:
            o["exposed"] = [wref(nodes[x]) for x in exp]
        ch = sorted(ids[c] for c in range(G) if parent[c] == g)
        if ch:
            o["children"] = ch
        if glabel[g] is not None:
            o["label"] = glabel[g]
        d = max(vdeg.get(a, 0), len(mem))
        o["label_level"] = label_level(lp, zoom, d)
        if eli.get(a, 0):
            o["elided_edges"] = eli[a]
        aggs.append(o)
    view = {"address_scheme": "igs-addr/1", "aggregate_edges": [
        {"count": len(it[5]), "rel_counts": relcounts(sc, it[5]), "src": vr(s), "tgt": vr(t)} for s, t, it in kept_bun],
        "aggregates": aggs, "directed": directed,
        "edges": [{"ref": sc["edges"][ei]["ref"]} for ei in kept_vis], "igview": "IGLOD-VIEW/1", "layout_sha256": st["layout_sha256"],
        "nodes": vnodes, "scale": 1000, "scene_sha256": sc["sha"], "state_sha256": st_sha}
    if removed:
        view["elided"] = {"items": el_items, "rel_counts": relcounts(sc, el_edge_list), "scene_edges": el_edges}
    check_conservation(view, n, m)
    return view


def check_conservation(view, n, m):
    hid = sum(len(a["hidden"]) for a in view["aggregates"])
    if len(view["nodes"]) + hid != n:
        raise E("INTERNAL", "CONSERVATION")
    seen = set()
    for a in view["aggregates"]:
        for r in a["hidden"]:
            k = ref_key(r)
            if k in seen:
                raise E("INTERNAL", "CONSERVATION")
            seen.add(k)
        if a["member_count"] != len(a["hidden"]) + len(a.get("exposed", [])):
            raise E("INTERNAL", "CONSERVATION")
    vis = {ref_key(x["ref"]) for x in view["nodes"]}
    if vis & seen:
        raise E("INTERNAL", "CONSERVATION")
    for a in view["aggregates"]:
        for r in a.get("exposed", []):
            if ref_key(r) not in vis:
                raise E("INTERNAL", "CONSERVATION")
    tot = len(view["edges"]) + sum(b["count"] for b in view["aggregate_edges"]) + sum(a["internal_edges"]["count"] for a in view["aggregates"]) \
        + (view["elided"]["scene_edges"] if "elided" in view else 0)
    if tot != m:
        raise E("INTERNAL", "CONSERVATION")
    for b in view["aggregate_edges"]:
        if sum(x["count"] for x in b["rel_counts"]) != b["count"]:
            raise E("INTERNAL", "CONSERVATION")
    for a in view["aggregates"]:
        if sum(x["count"] for x in a["internal_edges"]["rel_counts"]) != a["internal_edges"]["count"]:
            raise E("INTERNAL", "CONSERVATION")
    # C-elided
    s = sum(x.get("elided_edges", 0) for x in view["nodes"]) + sum(a.get("elided_edges", 0) for a in view["aggregates"])
    if "elided" in view:
        # items whose endpoints coincide are not recoverable from the view alone; checked by the producer. Lower bound only.
        if s > 2 * view["elided"]["items"] or s < view["elided"]["items"]:
            raise E("INTERNAL", "CONSERVATION")
    elif s != 0:
        raise E("INTERNAL", "CONSERVATION")


# ------------------------------------------------------------------ suggestGroups (design 6)
def suggest_groups(scene_b, rules, budget=None):
    bud = check_budget(budget)
    if len(scene_b) > MAX_INPUT_BYTES:
        raise E("RESOURCE_LIMIT", "INPUT_BYTES")
    if not isinstance(rules, list):
        raise E("INVALID_POLICY", "INVALID_RULE_PARAM")
    if len(rules) > MAX_RULES:
        raise E("RESOURCE_LIMIT", "RULE_LIMIT")
    for r in rules:
        if not isinstance(r, dict) or not isinstance(r.get("rule"), str):
            raise E("INVALID_POLICY", "INVALID_RULE_PARAM")
        rid = r["rule"]
        if rid not in ("pendant-fold/1", "components/1"):
            raise E("UNSUPPORTED_RULE", "", rid)
        pname = "min_leaves" if rid == "pendant-fold/1" else "min_size"
        for k in r:
            if k not in ("rule", pname):
                raise E("INVALID_POLICY", "INVALID_RULE_PARAM")
        v = r.get(pname)
        if isinstance(v, bool) or not isinstance(v, int) or v < 2 or v > INT31:
            raise E("INVALID_POLICY", "INVALID_RULE_PARAM")
    sc = prep_scene(verify_scene(scene_b))
    n, m = len(sc["nodes"]), len(sc["edges"])
    if n > min(bud["maxNodes"], MAX_NODES):
        raise E("RESOURCE_LIMIT", "NODE_LIMIT")
    if m > min(bud["maxEdges"], MAX_EDGES):
        raise E("RESOURCE_LIMIT", "EDGE_LIMIT")
    lkey, lrel, R = lkey_lrel(sc)
    rr = len(rules)
    W = 10 * (n + m) * rr + rr * (n + 2 * m) * cdiv(lkey, 64)
    if W > bud["maxWork"]:
        raise E("RESOURCE_LIMIT", "WORK_LIMIT")
    idx = sc["_idx"]
    pairs = set()
    for e in sc["edges"]:
        u, v = idx[ref_key(e["src"])], idx[ref_key(e["tgt"])]
        if u != v:
            pairs.add((min(u, v), max(u, v)))
    adj = [[] for _ in range(n)]
    for u, v in pairs:
        adj[u].append(v)
        adj[v].append(u)
    found = []
    for r in rules:
        if r["rule"] == "pendant-fold/1":
            byhost = {}
            for u in range(n):
                if len(adj[u]) == 1:
                    byhost.setdefault(adj[u][0], []).append(u)
            for h, ls in byhost.items():
                if len(ls) >= r["min_leaves"]:
                    found.append(sorted(ls))
        else:
            seen = [False] * n
            for s0 in range(n):
                if seen[s0]:
                    continue
                comp, stack = [], [s0]
                seen[s0] = True
                while stack:
                    x = stack.pop()
                    comp.append(x)
                    for y in adj[x]:
                        if not seen[y]:
                            seen[y] = True
                            stack.append(y)
                if len(comp) >= r["min_size"]:
                    found.append(sorted(comp))
    uniq = sorted({tuple(g) for g in found})
    groups = [list(g) for g in uniq]
    if len(groups) > MAX_GROUPS:
        raise E("RESOURCE_LIMIT", "GROUP_LIMIT")
    if sum(len(g) for g in groups) > MAX_MEMBER_ENTRIES:
        raise E("RESOURCE_LIMIT", "MEMBER_LIMIT")
    parent, depth, owner = paint(groups, n)      # raises OVERLAPPING_GROUPS
    if depth and max(depth) > MAX_AGG_DEPTH:
        raise E("RESOURCE_LIMIT", "DEPTH_LIMIT")
    return {"groups": [{"members": [wref(sc["nodes"][x]) for x in g]} for g in groups], "scene_sha256": sc["sha"]}


# ------------------------------------------------------------------ builders (design 5.5, 12)
def _try_sorted_members(ms):
    try:
        return sorted(ms, key=ref_key)
    except Exception:
        return ms


def _resort(st):
    """canonical re-sort of a candidate plain state if it is sortable; otherwise leave for verification to report."""
    try:
        return canonical_state_obj(st)
    except Exception:
        return st


def _reverify(st):
    b = cjb(st, True)          # signed: a caller's negative number reaches the verifier and is INVALID_NUMBER (rev 4)
    return verify_state(b)[0]


def collapse_group(state, group):
    st = {k: (list(v) if isinstance(v, list) else v) for k, v in state.items()}
    g = dict(group)
    if isinstance(g.get("members"), list):
        g["members"] = _try_sorted_members(g["members"])
    st["collapsed"] = list(state["collapsed"]) + [g]
    return _reverify(_resort(st))


def replace_groups(state, groups):
    st = dict(state)
    gs = []
    for g in groups:
        g = dict(g)
        if isinstance(g.get("members"), list):
            g["members"] = _try_sorted_members(g["members"])
        gs.append(g)
    st["collapsed"] = gs
    return _reverify(_resort(st))


def set_pinned(state, refs):
    st = dict(state)
    st["pinned"] = _try_sorted_members(list(refs))
    return _reverify(_resort(st))


def with_zoom(state, z):
    st = dict(state)
    st["zoom_milli"] = z
    return _reverify(st)


def with_layout(state, h):
    st = dict(state)
    st["layout_sha256"] = h
    return _reverify(st)


def expand_group(state, target):
    state = _reverify(state)            # rev 4: expandGroup verifies its input state first (stages 2-6)
    cols = state["collapsed"]
    if "agg" in target:
        a = target["agg"]
        if not is_agg_id(a):
            raise E("INVALID_LOD", "INVALID_ID")
        hit = [g for g in cols if agg_id(state["scene_sha256"], sorted(g["members"], key=ref_key))[0] == a]
    else:
        ms = _try_sorted_members(target["members"])
        hit = [g for g in cols if [ref_key(r) for r in g["members"]] == [ref_key(r) for r in ms]]
    if not hit:
        raise E("INVALID_GROUP", "NOT_ACTIVE")
    st = dict(state)
    st["collapsed"] = [g for g in cols if g is not hit[0]]
    return _reverify(st), hit[0]


def derive_aggregate_id(scene_b, members):
    sc = verify_scene(scene_b)
    if not isinstance(members, list):
        raise E("INVALID_LOD", "SCHEMA")
    for r in members:
        _check_object("ref", r)          # malformed refs rejected with the state's own codes; any member count (0, 1, ...) is accepted
    ms = sorted(members, key=ref_key)
    ks = [ref_key(r) for r in ms]
    if len(set(ks)) != len(ks):
        raise E("INVALID_GROUP", "DUPLICATE_MEMBER")
    return {"id": agg_id(sc["sha"], ms)[0]}


# ------------------------------------------------------------------ view-level mappings (design 9) and resolveAggregateEdge
def view_shape(view):
    """rev 4 shape check: exact key sets at every level, numbers safe integers, strings not content-checked, label_level any string,
    every scene reference decodable (valid id and identifier); an aggregate reference {agg} is any string."""
    def bad():
        raise E("INVALID_LOD", "SCHEMA")

    def isint(x):
        return isinstance(x, int) and not isinstance(x, bool) and abs(x) <= MAXSAFE

    def keys(o, req, opt=()):
        if not isinstance(o, dict) or not set(req) <= set(o) or not set(o) <= set(req) | set(opt):
            bad()

    def noderef(r):
        if not isinstance(r, dict) or set(r) != {"id", "type"} or not isinstance(r["id"], str) or not isinstance(r["type"], str) \
                or not valid_id(r["id"]) or not valid_ident(r["type"]):
            bad()

    def viewref(r):
        if isinstance(r, dict) and set(r) == {"agg"}:
            if not isinstance(r["agg"], str):
                bad()
            return
        noderef(r)

    def relcounts(rc):
        if not isinstance(rc, list):
            bad()
        for x in rc:
            keys(x, ("count", "rel"))
            if not isint(x["count"]) or not isinstance(x["rel"], str):
                bad()
    keys(view, ("address_scheme", "aggregate_edges", "aggregates", "directed", "edges", "igview", "layout_sha256", "nodes", "scale",
                "scene_sha256", "state_sha256"), ("elided",))
    for k in ("address_scheme", "igview", "layout_sha256", "scene_sha256", "state_sha256"):
        if not isinstance(view[k], str):
            bad()
    if not isint(view["scale"]) or not isinstance(view["directed"], bool):
        bad()
    for k in ("nodes", "aggregates", "edges", "aggregate_edges"):
        if not isinstance(view[k], list):
            bad()
    for x in view["nodes"]:
        keys(x, ("label_level", "ref", "x", "y"), ("elided_edges",))
        noderef(x["ref"])
        if not isinstance(x["label_level"], str) or not isint(x["x"]) or not isint(x["y"]) or ("elided_edges" in x and not isint(x["elided_edges"])):
            bad()
    for a in view["aggregates"]:
        keys(a, ("anchor", "hidden", "id", "internal_edges", "label_level", "member_count"), ("children", "elided_edges", "exposed", "label"))
        keys(a["anchor"], ("x", "y"))
        if not isint(a["anchor"]["x"]) or not isint(a["anchor"]["y"]) or not isinstance(a["id"], str) or not isinstance(a["label_level"], str) \
                or not isint(a["member_count"]) or ("elided_edges" in a and not isint(a["elided_edges"])) or ("label" in a and not isinstance(a["label"], str)):
            bad()
        for k in ("hidden", "exposed"):
            if k in a:
                if not isinstance(a[k], list):
                    bad()
                for r in a[k]:
                    noderef(r)
        if "children" in a and (not isinstance(a["children"], list) or any(not isinstance(c, str) for c in a["children"])):
            bad()
        keys(a["internal_edges"], ("count", "rel_counts"))
        if not isint(a["internal_edges"]["count"]):
            bad()
        relcounts(a["internal_edges"]["rel_counts"])
    for e in view["edges"]:
        keys(e, ("ref",))
        keys(e["ref"], ("ord", "rel", "src", "tgt"))
        if not isinstance(e["ref"]["ord"], str) or not isinstance(e["ref"]["rel"], str):
            bad()
        noderef(e["ref"]["src"])
        noderef(e["ref"]["tgt"])
    for b in view["aggregate_edges"]:
        keys(b, ("count", "rel_counts", "src", "tgt"))
        if not isint(b["count"]):
            bad()
        relcounts(b["rel_counts"])
        viewref(b["src"])
        viewref(b["tgt"])
    if "elided" in view:
        keys(view["elided"], ("items", "rel_counts", "scene_edges"))
        if not isint(view["elided"]["items"]) or not isint(view["elided"]["scene_edges"]):
            bad()
        relcounts(view["elided"]["rel_counts"])


def project_to_view(view, refs):
    view_shape(view)
    for r in refs:
        if not isinstance(r, dict) or set(r) != {"id", "type"} or not isinstance(r["id"], str) or not valid_id(r["id"]) or not valid_ident(r["type"]):
            raise E("INVALID_LOD", "SCHEMA")
    vis = {ref_key(x["ref"]) for x in view["nodes"]}
    hid = {}
    for a in view["aggregates"]:
        for r in a["hidden"]:
            hid[ref_key(r)] = a["id"]
    out_nodes, out_aggs = {}, set()
    for r in refs:
        k = ref_key(r)
        if k in vis:
            out_nodes[k] = wref(r)
        elif k in hid:
            out_aggs.add(hid[k])
        else:
            raise E("UNRESOLVED_NODE", "PROJECTION")
    return [out_nodes[k] for k in sorted(out_nodes)] + [{"agg": a} for a in sorted(out_aggs)]


def resolve_from_view(view, refs):
    view_shape(view)
    for r in refs:
        if not isinstance(r, dict) or not (set(r) == {"agg"} or (set(r) == {"id", "type"} and isinstance(r["id"], str) and valid_id(r["id"]))):
            raise E("INVALID_LOD", "SCHEMA")
        if "agg" in r and not is_agg_id(r["agg"]):
            raise E("INVALID_LOD", "INVALID_ID")          # rev 4: a malformed {agg} argument is INVALID_ID
    vis = {ref_key(x["ref"]) for x in view["nodes"]}
    aggs = {a["id"]: a for a in view["aggregates"]}
    out = {}
    for r in refs:
        if "agg" in r:
            if r["agg"] not in aggs:
                raise E("NOT_IN_VIEW", "AGGREGATE")
            for h in aggs[r["agg"]]["hidden"]:
                out[ref_key(h)] = wref(h)
        else:
            k = ref_key(r)
            if k not in vis:
                raise E("NOT_IN_VIEW", "NODE")
            out[k] = wref(r)
    return [out[k] for k in sorted(out)]


def resolve_aggregate_edge(scene_b, view, edge, budget=None):
    view_shape(view)
    for r in (edge.get("src"), edge.get("tgt")) if isinstance(edge, dict) else (None,):      # the edge argument is shape-checked with the view
        if not isinstance(r, dict) or not (set(r) == {"agg"} and isinstance(r["agg"], str)
                                           or set(r) == {"id", "type"} and isinstance(r["id"], str) and isinstance(r["type"], str) and valid_id(r["id"]) and valid_ident(r["type"])):
            raise E("INVALID_LOD", "SCHEMA")
    bud = check_budget(budget)
    sc = prep_scene(verify_scene(scene_b))
    n, m = len(sc["nodes"]), len(sc["edges"])
    if n > min(bud["maxNodes"], MAX_NODES):
        raise E("RESOURCE_LIMIT", "NODE_LIMIT")
    if m > min(bud["maxEdges"], MAX_EDGES):
        raise E("RESOURCE_LIMIT", "EDGE_LIMIT")
    lkey, lrel, R = lkey_lrel(sc)
    V = len(view["nodes"]) + sum(len(a["hidden"]) + len(a.get("exposed", [])) for a in view["aggregates"]) + len(view["edges"]) + len(view["aggregate_edges"])         + sum(len(b["rel_counts"]) for b in view["aggregate_edges"]) + sum(len(a["internal_edges"]["rel_counts"]) for a in view["aggregates"])         + len(view.get("elided", {}).get("rel_counts", []))
    W = 6 * n + 8 * m + 8 * V + (n + 2 * m) * cdiv(lkey, 64)       # resolveAggregateEdge omits the hashing terms (design 11)
    if view["scene_sha256"] != sc["sha"]:
        raise E("STATE_MISMATCH", "SCENE")
    if W > bud["maxWork"]:
        raise E("RESOURCE_LIMIT", "WORK_LIMIT")
    hit = [b for b in view["aggregate_edges"] if b["src"] == edge["src"] and b["tgt"] == edge["tgt"]]
    if not hit:
        raise E("NOT_IN_VIEW", "EDGE")
    idx = sc["_idx"]
    ids = sorted(a["id"] for a in view["aggregates"])
    arank = {a: n + j for j, a in enumerate(ids)}
    rep = list(range(n))
    for a in view["aggregates"]:
        for r in a["hidden"]:
            rep[idx[ref_key(r)]] = arank[a["id"]]

    def tok(r):
        return arank[r["agg"]] if "agg" in r else idx[ref_key(r)]
    s, t = tok(edge["src"]), tok(edge["tgt"])
    key = (s, t) if sc["directed"] else (min(s, t), max(s, t))
    vis, internal, bundles = classify(sc, rep, n, sc["directed"])
    lst = bundles.get(key, [])
    return {"edges": [sc["edges"][ei]["ref"] for ei in sorted(lst)]}
