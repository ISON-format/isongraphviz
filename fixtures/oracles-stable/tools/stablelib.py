#!/usr/bin/env python3
"""Independent V3 (stable and incremental layout) oracle library.

Written from docs/isongraph-visualize-blueprint/28-STABLE-LAYOUT-DESIGN.md (rev 2), IGS/1 and IGL/1 only.
No TypeScript was read or run. Exact integer arithmetic only (Python ints); no floating point except the
IGL/1 section 4 quantizer, which is used solely for the FORCE cold start (Core Python returns doubles).

The IGS-CJ/1 / IGL-CJ/1 writer, the NodeRef/2 order and the quantizer are written here (not imported)
from IGS/1 section 5 and IGL/1 sections 4 and 5.
"""
import hashlib, json, math, re, struct

COORD_LIMIT = 2 ** 50
MAX_NODE_KEY_UNITS = 2048
MAX_REL_UNITS = 2048
DEFAULT_BUDGET = dict(maxNodes=20_000, maxEdges=100_000, maxSceneBytes=16_777_216, maxLayoutBytes=16_777_216,
                      maxReportBytes=67_108_864, maxWork=50_000_000)
RECOMMENDED = dict(radius=60000, min_separation=40000, max_rings=32)
DIRS = [(1000, 0), (924, 383), (707, 707), (383, 924), (0, 1000), (-383, 924), (-707, 707), (-924, 383),
        (-1000, 0), (-924, -383), (-707, -707), (-383, -924), (0, -1000), (383, -924), (707, -707), (924, -383)]
ALGO = "igl-stable-place/1"


class SErr(Exception):
    """A structured error: CODE/REASON and optional detail."""
    def __init__(self, code, reason="", detail=""):
        super().__init__(f"{code}/{reason}" + (f"#{detail}" if detail else ""))
        self.code, self.reason, self.detail = code, reason, detail

    @property
    def tag(self):
        return f"{self.code}/{self.reason}"

    def full(self):
        return self.tag + (f"#{self.detail}" if self.detail else "")


# ---------------------------------------------------------------- arithmetic
def floor_div(a, b):
    assert b > 0
    return a // b


def div_round(a, b):
    assert b > 0
    return (2 * a + b) // (2 * b)


def isqrt(n):
    assert n >= 0
    return math.isqrt(n)


# ---------------------------------------------------------------- canonical bytes (IGS-CJ/1 / IGL-CJ/1)
def _esc(s):
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"': out.append('\\"')
        elif ch == '\\': out.append('\\\\')
        elif o == 8: out.append('\\b')
        elif o == 9: out.append('\\t')
        elif o == 10: out.append('\\n')
        elif o == 12: out.append('\\f')
        elif o == 13: out.append('\\r')
        elif o < 0x20: out.append('\\u%04x' % o)
        else: out.append(ch)
    out.append('"')
    return "".join(out)


def cj(v):
    """IGL-CJ/1: compact, keys in UTF-16 code unit order, signed integers (never -0), no floats, no null."""
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, int):
        assert abs(v) <= 2 ** 53 - 1, v
        return str(v)
    if isinstance(v, str): return _esc(v)
    if isinstance(v, (list, tuple)): return "[" + ",".join(cj(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(_esc(k) + ":" + cj(v[k]) for k in sorted(v, key=lambda s: s.encode("utf-16-be", "surrogatepass"))) + "}"
    raise TypeError(type(v))


def cjb(v):
    return cj(v).encode("utf-8")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def units(s):
    """UTF-16 code units of s."""
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


def js_json_str(s):
    """JSON.stringify of a string, ES2019 well-formed semantics (U+2028/2029 literal, lone surrogates escaped)."""
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"': out.append('\\"')
        elif ch == '\\': out.append('\\\\')
        elif o == 8: out.append('\\b')
        elif o == 9: out.append('\\t')
        elif o == 10: out.append('\\n')
        elif o == 12: out.append('\\f')
        elif o == 13: out.append('\\r')
        elif o < 0x20: out.append('\\u%04x' % o)
        elif 0xD800 <= o <= 0xDFFF: out.append('\\u%04x' % o)
        else: out.append(ch)
    out.append('"')
    return "".join(out)


def node_key_str(t, wid):
    """nodeKey(ref) = JSON.stringify([type, wireId])."""
    return "[" + js_json_str(t) + "," + js_json_str(wid) + "]"


def edge_key_str(src, rel, tgt, ord_="0"):
    return "[" + js_json_str(node_key_str(*src)) + "," + js_json_str(rel) + "," + js_json_str(node_key_str(*tgt)) + "," + js_json_str(ord_) + "]"


# ---------------------------------------------------------------- NodeRef/2 and edge order
def ref_key(ref):
    """ref = (type, wireid). type by UTF-8 bytes; INT64 ids numerically before STRING ids by UTF-8 bytes."""
    t, i = ref
    tb = t.encode("utf-8")
    if i.startswith("i:"): return (tb, 0, int(i[2:]), b"")
    return (tb, 1, 0, i[2:].encode("utf-8"))


def edge_key(e):
    """e = (rel, src, tgt, ord)."""
    rel, s, t, o = e
    return (ref_key(s), rel.encode("utf-8"), ref_key(t), o.encode("utf-8"))


def wref(ref):
    return {"id": ref[1], "type": ref[0]}


def wedge(e):
    rel, s, t, o = e
    return {"ord": o, "rel": rel, "src": wref(s), "tgt": wref(t)}


def tref(w):
    return (w["type"], w["id"])


def tedge(w):
    return (w["rel"], tref(w["src"]), tref(w["tgt"]), w["ord"])


# ---------------------------------------------------------------- scene
IDENT_BAD = re.compile(r'[\s:|"\\]')
I64 = re.compile(r"^(0|-?[1-9][0-9]*)$")


def label_of(wid):
    return wid[2:]


def build_scene(nodes, edges, directed=True, src_text="x", src_hash=None):
    """nodes: [(type, wireid)], edges: [(rel, (t,id), (t,id))]. Returns canonical IGS/1 bytes."""
    nodes = sorted(set(nodes), key=ref_key)
    es = []
    for rel, s, t in edges:
        if not directed and ref_key(s) > ref_key(t): s, t = t, s
        es.append((rel, s, t, "0"))
    es = sorted(set(es), key=edge_key)
    h = src_hash or sha(src_text.encode("ascii"))
    obj = {"address_scheme": "igs-addr/1",
           "edges": [{"label": e[0], "ref": wedge(e)} for e in es],
           "graph": {"directed": directed, "profile": "simple"}, "igs": "IGS/1",
           "nodes": [{"category": t, "label": label_of(i), "ref": {"id": i, "type": t}} for t, i in nodes],
           "source": {"artifact_sha256": h, "serialization_profile": "ison-v1"}}
    return cjb(obj)


class Scene:
    def __init__(self, raw, obj):
        self.raw, self.obj = raw, obj
        self.sha = sha(raw)
        self.directed = obj["graph"]["directed"]
        self.nodes = [tref(n["ref"]) for n in obj["nodes"]]          # NodeRef/2 order (verified)
        self.edges = [tedge(e["ref"]) for e in obj["edges"]]
        self.nodeset = set(self.nodes)
        self.adj = {n: set() for n in self.nodes}
        for rel, s, t, o in self.edges:
            if s != t:
                self.adj[s].add(t); self.adj[t].add(s)


def _id_ok(i):
    if i.startswith("i:"):
        d = i[2:]
        return bool(I64.match(d)) and -2 ** 63 <= int(d) <= 2 ** 63 - 1
    return i.startswith("s:")


def verify_scene(raw):
    """IGS/1 section 5.8 consumer (the subset a hand-written scene can violate). Raises SErr('IGS:INVALID_SCENE', reason)."""
    def bad(r): raise SErr("IGS:INVALID_SCENE", r)
    try:
        obj = json.loads(raw.decode("utf-8"))
    except Exception:
        bad("SCHEMA")
    need = {"address_scheme", "edges", "graph", "igs", "nodes", "source"}
    if not isinstance(obj, dict) or set(obj) != need: bad("SCHEMA")
    if obj["igs"] != "IGS/1" or obj["address_scheme"] != "igs-addr/1": bad("SCHEMA")
    for n in obj["nodes"]:
        t, i = n["ref"]["type"], n["ref"]["id"]
        if not _id_ok(i): bad("INVALID_ID")
        if not t or IDENT_BAD.search(t): bad("INVALID_IDENTIFIER")
    for e in obj["edges"]:
        if not e["ref"]["rel"] or IDENT_BAD.search(e["ref"]["rel"]): bad("INVALID_IDENTIFIER")
    # canonical form including the section 5.5 order
    canon = dict(obj)
    canon["nodes"] = sorted(obj["nodes"], key=lambda n: ref_key(tref(n["ref"])))
    canon["edges"] = sorted(obj["edges"], key=lambda e: edge_key(tedge(e["ref"])))
    if cjb(canon) != raw: bad("NON_CANONICAL")
    seen = set()
    for n in obj["nodes"]:
        r = tref(n["ref"])
        if r in seen: bad("DUPLICATE_NODE_REF")
        seen.add(r)
    seen_e = set()
    for e in obj["edges"]:
        k = tedge(e["ref"])
        if k in seen_e: bad("DUPLICATE_EDGE_REF")
        seen_e.add(k)
        if k[1] not in seen or k[2] not in seen: bad("DANGLING_EDGE_ENDPOINT")
        if not obj["graph"]["directed"] and ref_key(k[1]) > ref_key(k[2]): bad("NON_CANONICAL_ENDPOINTS")
    for n in obj["nodes"]:
        if n["category"] != n["ref"]["type"]: bad("CATEGORY_MISMATCH")
        if n["label"] != label_of(n["ref"]["id"]): bad("LABEL_MISMATCH")
    for e in obj["edges"]:
        if e["label"] != e["ref"]["rel"]: bad("LABEL_MISMATCH")
        if e["ref"]["ord"] != "0": bad("UNEXPECTED_ORDINAL")
    return Scene(raw, obj)


# ---------------------------------------------------------------- layout (IGL/1)
FIXED_POLICY = {"algorithm": "igl-fixed/1", "config": {}, "family": "FIXED"}


def force_policy(cfg):
    return {"algorithm": "igl-force/1", "config": dict(cfg), "family": "FORCE"}


def build_layout(scene_sha, positions, policy=FIXED_POLICY):
    """positions: {(type,id): (x,y)} in integer thousandths."""
    nodes = [{"ref": wref(r), "x": x, "y": y} for r, (x, y) in sorted(positions.items(), key=lambda kv: ref_key(kv[0]))]
    return cjb({"address_scheme": "igs-addr/1", "igl": "IGL/1", "nodes": nodes, "policy": policy, "scale": 1000, "scene_sha256": scene_sha})


class Layout:
    def __init__(self, raw, obj):
        self.raw, self.obj, self.sha = raw, obj, sha(raw)
        self.pos = {tref(n["ref"]): (n["x"], n["y"]) for n in obj["nodes"]}
        self.scene_sha = obj["scene_sha256"]
        self.family = obj["policy"]["family"]


def verify_layout(raw):
    """IGL/1 section 6.1 subset sufficient for generator-made layouts."""
    def bad(c, r): raise SErr(c, r)
    try:
        obj = json.loads(raw.decode("utf-8"))
    except Exception:
        bad("INVALID_LAYOUT", "SCHEMA")
    if set(obj) != {"address_scheme", "igl", "nodes", "policy", "scale", "scene_sha256"}: bad("INVALID_LAYOUT", "SCHEMA")
    for n in obj["nodes"]:
        for c in ("x", "y"):
            if not isinstance(n[c], int) or isinstance(n[c], bool): bad("INVALID_COORDINATE", "NOT_INTEGER")
            if abs(n[c]) > 2 ** 53 - 1: bad("INVALID_COORDINATE", "OUT_OF_RANGE")
    canon = dict(obj)
    canon["nodes"] = sorted(obj["nodes"], key=lambda n: ref_key(tref(n["ref"])))
    if cjb(canon) != raw: bad("INVALID_LAYOUT", "NON_CANONICAL")
    if len({tref(n["ref"]) for n in obj["nodes"]}) != len(obj["nodes"]): bad("INVALID_LAYOUT", "DUPLICATE_NODE_REF")
    return Layout(raw, obj)


class Drawing:
    def __init__(self, scene, layout):
        self.scene, self.layout = scene, layout
        self.pos = layout.pos


def bind_drawing(scene_raw, layout_raw):
    scene = verify_scene(scene_raw)
    lay = verify_layout(layout_raw)
    if lay.scene_sha != scene.sha: raise SErr("SCENE_MISMATCH")
    ls = set(lay.pos)
    if scene.nodeset - ls: raise SErr("INCOMPLETE_LAYOUT", "MISSING_NODE")
    if ls - scene.nodeset: raise SErr("INCOMPLETE_LAYOUT", "UNKNOWN_NODE")
    return Drawing(scene, lay)


# ---------------------------------------------------------------- budget, meter
def check_budget(b):
    out = dict(DEFAULT_BUDGET)
    if b is None: return out
    if not isinstance(b, dict): raise SErr("INVALID_REQUEST", "INVALID_BUDGET")
    for k, v in b.items():
        if k not in DEFAULT_BUDGET: raise SErr("INVALID_REQUEST", "INVALID_BUDGET")
        if isinstance(v, bool) or not isinstance(v, int) or not (1 <= v <= 2 ** 53 - 1):
            raise SErr("INVALID_REQUEST", "INVALID_BUDGET")
        out[k] = v
    return out


class Meter:
    def __init__(self, max_work):
        self.W, self.max = 0, max_work

    def charge(self, c):
        if self.W + c > self.max: raise SErr("RESOURCE_LIMIT", "WORK_LIMIT")
        self.W += c


def check_placement(p):
    if not isinstance(p, dict): raise SErr("INVALID_REQUEST", "INVALID_PLACEMENT", "SCHEMA")
    for k in ("radius", "min_separation", "max_rings"):
        if k not in p: raise SErr("INVALID_REQUEST", "INVALID_PLACEMENT", "MISSING_KEY")
    for k in p:
        if k not in ("radius", "min_separation", "max_rings"): raise SErr("INVALID_REQUEST", "INVALID_PLACEMENT", "UNKNOWN_KEY")
    lim = {"radius": 2 ** 26, "min_separation": 2 ** 26, "max_rings": 1024}
    for k, hi in lim.items():
        v = p[k]
        if isinstance(v, bool) or not isinstance(v, int) or not (1 <= v <= hi): raise SErr("INVALID_REQUEST", "INVALID_PLACEMENT", "INVALID_VALUE")
    return dict(p)


def check_options(opts, previous_present):
    """Admission step (1): options and placement validity, before any input byte is touched."""
    opts = opts or {}
    known = {"placement", "coldStart", "budget", "forceBudget", "relax", "groups", "viewport"}
    for k in opts:
        if k not in known: raise SErr("INVALID_REQUEST", "UNKNOWN_KEY", k)
    for k in ("relax", "groups", "viewport"):
        if opts.get(k) is not None: raise SErr("INVALID_REQUEST", "UNSUPPORTED_OPTION", k)
    budget = check_budget(opts.get("budget"))
    placement = None
    if opts.get("placement") is not None: placement = check_placement(opts["placement"])
    if previous_present and placement is None: raise SErr("INVALID_REQUEST", "PLACEMENT_REQUIRED")
    return budget, placement


def key_check_scene(sc):
    for t, i in sc.nodes:
        if units(node_key_str(t, i)) > MAX_NODE_KEY_UNITS: raise SErr("RESOURCE_LIMIT", "KEY_LENGTH")
    for rel, s, t, o in sc.edges:
        if units(js_json_str(rel)) > MAX_REL_UNITS: raise SErr("RESOURCE_LIMIT", "KEY_LENGTH")


def count_check(sc, budget):
    if len(sc.nodes) > budget["maxNodes"]: raise SErr("RESOURCE_LIMIT", "NODE_LIMIT")
    if len(sc.edges) > budget["maxEdges"]: raise SErr("RESOURCE_LIMIT", "EDGE_LIMIT")


def domain_check(lay, code):
    for r, (x, y) in lay.pos.items():
        if abs(x) > COORD_LIMIT or abs(y) > COORD_LIMIT: raise SErr(code, "COORDINATE_DOMAIN")


def byte_check(raw, cap):
    if len(raw) > cap: raise SErr("RESOURCE_LIMIT", "INPUT_BYTES")


# ---------------------------------------------------------------- diff
def diff_sets(psc, nsc):
    pk, nk = set(psc.nodes), set(nsc.nodes)
    pe, ne = set(psc.edges), set(nsc.edges)
    return dict(kept=sorted(pk & nk, key=ref_key), added=sorted(nk - pk, key=ref_key), removed=sorted(pk - nk, key=ref_key),
                e_common=len(pe & ne), e_added=sorted(ne - pe, key=edge_key), e_removed=sorted(pe - ne, key=edge_key))


def diff_obj(psc, nsc):
    d = diff_sets(psc, nsc)
    return {"directed": {"next": nsc.directed, "previous": psc.directed},
            "edges": {"added": [wedge(e) for e in d["e_added"]], "common": d["e_common"], "removed": [wedge(e) for e in d["e_removed"]]},
            "identical": psc.sha == nsc.sha, "igls_diff": "IGLS-DIFF/1",
            "nodes": {"added": [wref(r) for r in d["added"]], "kept": [wref(r) for r in d["kept"]], "removed": [wref(r) for r in d["removed"]]}}


def c1(prev_sc, nsc, n_kept):
    """C1 admission and diff charge."""
    np_, ep = (len(prev_sc.nodes), len(prev_sc.edges)) if prev_sc else (0, 0)
    return np_ + len(nsc.nodes) + 2 * (ep + len(nsc.edges)) + n_kept


def diff_scenes(prev_raw, next_raw, budget=None):
    budget = check_budget(budget)
    byte_check(prev_raw, budget["maxSceneBytes"]); byte_check(next_raw, budget["maxSceneBytes"])
    p, n = verify_scene(prev_raw), verify_scene(next_raw)
    count_check(p, budget); count_check(n, budget)
    key_check_scene(p); key_check_scene(n)
    d = diff_sets(p, n)
    m = Meter(budget["maxWork"]); m.charge(c1(p, n, len(d["kept"])))
    return cjb(diff_obj(p, n)), m.W


# ---------------------------------------------------------------- placement (igl-stable-place/1)
def place(prev, nsc, cfg, meter, maxwork_unused=None):
    """prev: Drawing; nsc: Scene. Returns (positions {ref:(x,y)}, added_info {ref: dict}, waves, placed)."""
    R, S, MR = cfg["radius"], cfg["min_separation"], cfg["max_rings"]
    d = diff_sets(prev.scene, nsc)
    kept, added = d["kept"], d["added"]
    kept_set, added_set = set(kept), set(added)
    pos = {r: prev.pos[r] for r in kept}                 # P (occupants), by ref
    grid = {}
    for r in kept:
        x, y = pos[r]; grid.setdefault((x // S, y // S), []).append((x, y))
    kcount = len(kept)
    assert kcount >= 1
    maxX = max(pos[r][0] for r in kept)
    Sy = sum(pos[r][1] for r in kept)
    unplaced = set(added)
    wave_no = 0
    frontier = sorted([u for u in added if any(nb in kept_set for nb in nsc.adj[u])], key=ref_key)
    info = {}
    while True:
        seed = False
        if not frontier:
            if not unplaced: break
            frontier = [min(unplaced, key=ref_key)]
            seed = True
        start = set(pos)                                   # wave start
        wave_nodes = []
        for u in frontier:
            if seed:
                m = 0; anchor = (maxX + R, div_round(Sy, kcount))
            else:
                N = [nb for nb in nsc.adj[u] if nb in start]
                m = len(N)
                assert m >= 1
                anchor = (div_round(sum(pos[nb][0] for nb in N), m), div_round(sum(pos[nb][1] for nb in N), m))
            meter.charge(2 + m)
            ax, ay = anchor
            chosen = None
            for j in range(MR):
                rad = R * (j + 1)
                for k, (ux, uy) in enumerate(DIRS):
                    cx = ax + div_round(rad * ux, 1000); cy = ay + div_round(rad * uy, 1000)
                    if abs(cx) > COORD_LIMIT or abs(cy) > COORD_LIMIT:
                        meter.charge(1); continue
                    gx, gy = cx // S, cy // S
                    occ = []
                    for ddx in (-1, 0, 1):
                        for ddy in (-1, 0, 1):
                            occ.extend(grid.get((gx + ddx, gy + ddy), ()))
                    meter.charge(1 + len(occ))
                    if all((cx - px) ** 2 + (cy - py) ** 2 >= S * S for px, py in occ):
                        chosen = (j, k, cx, cy); break
                if chosen: break
            if not chosen:
                raise SErr("PLACEMENT_FAILED", "NO_FREE_SLOT", cj(wref(u)))
            j, k, cx, cy = chosen
            pos[u] = (cx, cy); grid.setdefault((cx // S, cy // S), []).append((cx, cy))
            unplaced.discard(u); wave_nodes.append(u)
            info[u] = dict(anchor_kind="seed" if seed else "neighbours", anchor_x=ax, anchor_y=ay, direction=k,
                           offset=isqrt((cx - ax) ** 2 + (cy - ay) ** 2), ring=j, wave=wave_no, x=cx, y=cy)
        wave_no += 1
        nxt = set()
        for u in wave_nodes:
            for nb in nsc.adj[u]:
                if nb in unplaced: nxt.add(nb)
        frontier = sorted(nxt, key=ref_key)
    return pos, info, wave_no, len(added)


# ---------------------------------------------------------------- report assembly
def extent_of(points):
    if not points: return {"present": False}
    xs = [p[0] for p in points]; ys = [p[1] for p in points]
    return {"max_x": max(xs), "max_y": max(ys), "min_x": min(xs), "min_y": min(ys), "present": True}


def aggregates(kept_recs, n_added, n_removed, added_recs_inc):
    c = len(kept_recs)
    dists = [r["dist"] for r in kept_recs]
    sd = sum(dists)
    sdq = sum(r["dx"] ** 2 + r["dy"] ** 2 for r in kept_recs)
    moved = sum(1 for d in dists if d > 0)
    return {"added": n_added, "common": c, "max_dist": max(dists) if c else 0,
            "max_offset": max((r["offset"] for r in added_recs_inc), default=0),
            "mean_dist": floor_div(sd, c) if c else 0, "moved": moved,
            "moved_ppm": floor_div(1000000 * moved, c) if c else 0, "removed": n_removed,
            "rms_dist": isqrt(floor_div(sdq, c)) if c else 0, "sum_dist": str(sd), "sum_dist_sq": str(sdq)}


def hint_of(kept_recs):
    c = len(kept_recs)
    if not c: return {"present": False}
    return {"dx": div_round(sum(r["x"] - r["x_prev"] for r in kept_recs), c),
            "dy": div_round(sum(r["y"] - r["y_prev"] for r in kept_recs), c), "present": True}


def assemble_report(mode, prev_hdr, next_hdr, records, edges, placement_cfg):
    """records: list of record dicts (already sorted, with status). Aggregates/extents/hint are derived from the
    records exactly as section 8 defines them. prev_hdr: None or dict(directed, layout_sha256, scene_sha256)."""
    kept = [r for r in records if r["status"] == "kept"]
    added = [r for r in records if r["status"] == "added"]
    removed = [r for r in records if r["status"] == "removed"]
    inc_added = added if mode == "incremental" else []
    plc = ({"algorithm": ALGO, "max_rings": placement_cfg["max_rings"], "min_separation": placement_cfg["min_separation"],
            "present": True, "radius": placement_cfg["radius"]} if (mode == "incremental" and added) else {"present": False})
    prev = {"present": False} if prev_hdr is None else dict(prev_hdr, present=True)
    ext_prev = extent_of([(r["x_prev"], r["y_prev"]) for r in kept + removed]) if prev_hdr is not None else {"present": False}
    ext_next = extent_of([(r["x"], r["y"]) for r in kept + added])
    return {"address_scheme": "igs-addr/1",
            "aggregate": aggregates(kept, len(added), len(removed), inc_added),
            "edges": edges, "extent": {"next": ext_next, "previous": ext_prev},
            "igls": "IGLS/1", "mode": mode, "next": next_hdr, "nodes": records, "placement": plc, "previous": prev,
            "scale": 1000, "transform_hint": hint_of(kept)}


def kept_rec(r, px, py, x, y):
    dx, dy = x - px, y - py
    return {"dist": isqrt(dx * dx + dy * dy), "dx": dx, "dy": dy, "ref": wref(r), "status": "kept", "x": x, "x_prev": px, "y": y, "y_prev": py}


def records_for(prev, nxt_pos, nsc, mode, info):
    """Union records from a previous Drawing (or None), next positions and the next scene."""
    pp = prev.pos if prev else {}
    out = []
    for r in sorted(set(pp) | set(nxt_pos), key=ref_key):
        if r in pp and r in nxt_pos:
            out.append(kept_rec(r, pp[r][0], pp[r][1], nxt_pos[r][0], nxt_pos[r][1]))
        elif r in nxt_pos:
            x, y = nxt_pos[r]
            if mode == "incremental":
                out.append(dict(info[r], ref=wref(r), status="added"))
            else:
                out.append({"ref": wref(r), "status": "added", "x": x, "y": y})
        else:
            out.append({"ref": wref(r), "status": "removed", "x_prev": pp[r][0], "y_prev": pp[r][1]})
    return out


def edges_obj(psc, nsc):
    if psc is None:
        return {"added": [wedge(e) for e in sorted(set(nsc.edges), key=edge_key)], "common": 0, "removed": []}
    d = diff_sets(psc, nsc)
    return {"added": [wedge(e) for e in d["e_added"]], "common": d["e_common"], "removed": [wedge(e) for e in d["e_removed"]]}


def headers(prev, nlay, nsc):
    ph = None if prev is None else {"directed": prev.scene.directed, "layout_sha256": prev.layout.sha, "scene_sha256": prev.scene.sha}
    nh = {"directed": nsc.directed, "layout_sha256": nlay.sha, "scene_sha256": nsc.sha}
    return ph, nh


# ---------------------------------------------------------------- Core Python FORCE (cold start)
def _u16(s):
    b = s.encode("utf-16-le", "surrogatepass")
    return "".join(chr(u) for u in struct.unpack("<%dH" % (len(b) // 2), b))


def quantize(v):
    """IGL/1 section 4 rule 2."""
    if not math.isfinite(v): raise ValueError("not finite")
    s = v * 1000.0; f = math.floor(s)
    q = f + (1 if s - f >= 0.5 else 0)
    if abs(q) > 2 ** 53 - 1: raise ValueError("range")
    return 0 if q == 0 else q


def force_preflight(sc):
    """IGL/1 section 7.1 preflight, checks 1-4 (check 5, the edge cap, is not reachable by any vector here)."""
    seen = {}
    for t, i in sc.nodes:
        if i.startswith("i:") and abs(int(i[2:])) > 2 ** 53 - 1: raise SErr("UNSUPPORTED_SCENE", "UNSAFE_NODE_ID")
        if i.startswith("s:") and (i[2:] == "" or re.search(r"[\s:|]", i[2:])): raise SErr("UNSUPPORTED_SCENE", "CORE_UNREPRESENTABLE_ID")
        key = t + " " + label_of(i)
        if key in seen: raise SErr("UNSUPPORTED_SCENE", "AMBIGUOUS_ORDER_KEY")
        seen[key] = 1
    ints = {(t, int(i[2:])) for t, i in sc.nodes if i.startswith("i:")}
    for t, i in sc.nodes:
        if i.startswith("s:") and re.match(r"^-?[0-9]+$", i[2:]) and (t, int(i[2:])) in ints: raise SErr("UNSUPPORTED_SCENE", "CORE_ID_TWIN")


def force_positions(sc, cfg):
    from ison_graph import ISONGraph
    from ison_graph.viz import compute_layout
    force_preflight(sc)
    g = ISONGraph("g", directed=sc.directed); back = {}
    pid = lambda wid: int(wid[2:]) if wid.startswith("i:") else _u16(wid[2:])
    for t, i in sc.nodes:
        k = (_u16(t), pid(i)); g.add_node(*k); back[k] = (t, i)
    for rel, s, t, o in sc.edges:
        g.add_edge(rel, (_u16(s[0]), pid(s[1])), (_u16(t[0]), pid(t[1])))
    lay = compute_layout(g, width=cfg["width"], height=cfg["height"], iterations=cfg["iterations"], seed=cfg["seed"], margin=cfg["margin"])
    assert len(lay) == len(sc.nodes)
    return {back[k]: (quantize(v[0]), quantize(v[1])) for k, v in lay.items()}


def check_force_cfg(c):
    keys = {"width", "height", "margin", "iterations", "seed"}
    if not isinstance(c, dict): raise SErr("INVALID_POLICY", "SCHEMA")
    for k in keys:
        if k not in c: raise SErr("INVALID_POLICY", "MISSING_KEY")
    for k in c:
        if k not in keys: raise SErr("INVALID_POLICY", "UNKNOWN_KEY")
    if not (c["width"] > 2 * c["margin"] and c["height"] > 2 * c["margin"]): raise SErr("INVALID_POLICY", "MARGIN_TOO_LARGE")
    return c


# ---------------------------------------------------------------- the producer
def mode_of(prev, nsc):
    """Section 11 table. Returns (mode, kept_count)."""
    if prev is None:
        return ("cold" if nsc.nodes else "cold"), 0
    kept = len(set(prev.scene.nodes) & nsc.nodeset)
    if not nsc.nodes: return "incremental", kept
    if kept == 0: return "cold", 0
    return "incremental", kept


def compute_stable(prev_pair, scene_raw, opts=None, meter=None):
    """prev_pair: None or (scene_raw, layout_raw). Returns dict(mode, layout_raw, report_raw, work, waves, placed, report, diff)."""
    opts = opts or {}
    budget, placement = check_options(opts, prev_pair is not None)
    byte_check(scene_raw, budget["maxSceneBytes"])
    if prev_pair:
        byte_check(prev_pair[0], budget["maxSceneBytes"]); byte_check(prev_pair[1], budget["maxLayoutBytes"])
    prev = bind_drawing(*prev_pair) if prev_pair else None
    nsc = verify_scene(scene_raw)
    for sc in ([prev.scene] if prev else []) + [nsc]: count_check(sc, budget)
    for sc in ([prev.scene] if prev else []) + [nsc]: key_check_scene(sc)
    if prev: _dom_prev(prev)
    mode, kept = mode_of(prev, nsc)
    meter = meter or Meter(budget["maxWork"])
    pscene = prev.scene if prev else None
    waves = placed = 0
    info = {}
    if not nsc.nodes:
        pos = {}
        layout_raw = build_layout(nsc.sha, pos)
    elif mode == "cold":
        cs = opts.get("coldStart")
        if cs is None: raise SErr("INVALID_REQUEST", "COLD_START_REQUIRED")
        cs = check_force_cfg(cs)
        pos = force_positions(nsc, cs)
        layout_raw = build_layout(nsc.sha, pos, force_policy(cs))
    else:
        pass
    meter.charge(c1(pscene, nsc, kept))
    if nsc.nodes and mode == "incremental":
        pos, info, waves, placed = place(prev, nsc, placement, meter)
        pos_all = dict(pos)
        layout_raw = build_layout(nsc.sha, pos_all)
    nlay = verify_layout(layout_raw)
    meter.charge(3 * ((len(pscene.nodes) if pscene else 0) + len(nsc.nodes)))
    ph, nh = headers(prev, nlay, nsc)
    recs = records_for(prev, nlay.pos, nsc, mode, info)
    rep = assemble_report(mode, ph, nh, recs, edges_obj(pscene, nsc), placement)
    rep_raw = cjb(rep)
    byte_check(rep_raw, budget["maxReportBytes"])
    return dict(mode=mode, layout_raw=layout_raw, layout=nlay, report=rep, report_raw=rep_raw, work=meter.W, waves=waves, placed=placed,
                diff=(cjb(diff_obj(pscene, nsc)) if pscene else None), scene=nsc, prev=prev)


def _dom_prev(prev):
    domain_check(prev.layout, "INVALID_PREVIOUS")


# ---------------------------------------------------------------- measureDisplacement
def measure(prev_pair, next_pair, budget=None):
    budget = check_budget(budget)
    for p in (prev_pair, next_pair):
        byte_check(p[0], budget["maxSceneBytes"]); byte_check(p[1], budget["maxLayoutBytes"])
    prev = bind_drawing(*prev_pair); nxt = bind_drawing(*next_pair)
    for d in (prev, nxt): count_check(d.scene, budget); key_check_scene(d.scene)
    domain_check(prev.layout, "INVALID_PREVIOUS"); domain_check(nxt.layout, "INVALID_NEXT")
    m = Meter(budget["maxWork"])
    kept = len(set(prev.scene.nodes) & nxt.scene.nodeset)
    m.charge(c1(prev.scene, nxt.scene, kept))
    m.charge(3 * (len(prev.scene.nodes) + len(nxt.scene.nodes)))
    ph, nh = headers(prev, nxt.layout, nxt.scene)
    recs = records_for(prev, nxt.pos, nxt.scene, "measured", {})
    rep = assemble_report("measured", ph, nh, recs, edges_obj(prev.scene, nxt.scene), None)
    return cjb(rep), rep, m.W


# ---------------------------------------------------------------- report verification
class Flt(float):
    pass


def _parse_report(raw):
    try:
        text = raw.decode("utf-8")
    except Exception:
        raise SErr("INVALID_REPORT", "SCHEMA")
    if text.startswith("﻿"): raise SErr("INVALID_REPORT", "SCHEMA")
    try:
        def pf(s): return Flt(s)
        def pc(s): raise ValueError(s)
        return json.loads(text, parse_float=pf, parse_constant=pc)
    except Exception:
        raise SErr("INVALID_REPORT", "SCHEMA")


TOP_KEYS = {"address_scheme", "aggregate", "edges", "extent", "igls", "mode", "next", "nodes", "placement", "previous", "scale", "transform_hint"}
RESERVED = {"groups", "relax", "viewport", "report_sha256"}
AGG_KEYS = {"added", "common", "max_dist", "max_offset", "mean_dist", "moved", "moved_ppm", "removed", "rms_dist", "sum_dist", "sum_dist_sq"}
KEPT_KEYS = {"dist", "dx", "dy", "ref", "status", "x", "x_prev", "y", "y_prev"}
ADDED_INC = {"anchor_kind", "anchor_x", "anchor_y", "direction", "offset", "ref", "ring", "status", "wave", "x", "y"}
ADDED_BARE = {"ref", "status", "x", "y"}
REMOVED_KEYS = {"ref", "status", "x_prev", "y_prev"}


def _closed(o, keys, reserved_ok=False):
    if not isinstance(o, dict): raise SErr("INVALID_REPORT", "SCHEMA")
    if not reserved_ok:
        pass
    for k in o:
        if k in RESERVED and keys is TOP_KEYS: raise SErr("INVALID_REPORT", "RESERVED_FIELD")
    for k in o:
        if k not in keys: raise SErr("INVALID_REPORT", "UNKNOWN_FIELD")
    for k in keys:
        if k not in o: raise SErr("INVALID_REPORT", "MISSING_FIELD")


def _present(o, keys_when_present):
    if not isinstance(o, dict): raise SErr("INVALID_REPORT", "SCHEMA")
    if "present" not in o: raise SErr("INVALID_REPORT", "MISSING_FIELD")
    if not isinstance(o["present"], bool): raise SErr("INVALID_REPORT", "SCHEMA")
    _closed(o, keys_when_present if o["present"] else {"present"})
    return o["present"]


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _walk_values(rep, fn):
    pass


def verify_report(raw, budget=None, meter=None):
    """verifyDisplacementReport. Returns (report, sha, meter). Raises SErr."""
    budget = check_budget(budget)
    byte_check(raw, budget["maxReportBytes"])
    meter = meter or Meter(budget["maxWork"])
    rep = _parse_report(raw)
    inv = lambda r: SErr("INVALID_REPORT", r)
    if not isinstance(rep, dict): raise inv("SCHEMA")
    # counts (admission), then V1 charge
    if isinstance(rep.get("nodes"), list) and len(rep["nodes"]) > 2 * budget["maxNodes"]: raise SErr("RESOURCE_LIMIT", "NODE_LIMIT")
    ed = rep.get("edges")
    if isinstance(ed, dict):
        na = len(ed["added"]) if isinstance(ed.get("added"), list) else 0
        nr = len(ed["removed"]) if isinstance(ed.get("removed"), list) else 0
        if na + nr > 2 * budget["maxEdges"]: raise SErr("RESOURCE_LIMIT", "EDGE_LIMIT")
        meter.charge(3 * ((len(rep["nodes"]) if isinstance(rep.get("nodes"), list) else 0) + na + nr))
    # ---- schema: closed objects
    _closed(rep, TOP_KEYS)
    mode = rep["mode"]
    if mode not in ("incremental", "cold", "measured"): raise inv("SCHEMA")
    _closed(rep["aggregate"], AGG_KEYS)
    _closed(rep["edges"], {"added", "common", "removed"})
    if not isinstance(rep["edges"]["added"], list) or not isinstance(rep["edges"]["removed"], list): raise inv("SCHEMA")
    for e in rep["edges"]["added"] + rep["edges"]["removed"]:
        _closed(e, {"ord", "rel", "src", "tgt"}); _closed(e["src"], {"id", "type"}); _closed(e["tgt"], {"id", "type"})
    _closed(rep["extent"], {"next", "previous"})
    ext_ok = {"max_x", "max_y", "min_x", "min_y", "present"}
    ext_p = {k: _present(rep["extent"][k], ext_ok) for k in ("next", "previous")}
    _closed(rep["next"], {"directed", "layout_sha256", "scene_sha256"})
    prev_present = _present(rep["previous"], {"directed", "layout_sha256", "present", "scene_sha256"})
    plc_present = _present(rep["placement"], {"algorithm", "max_rings", "min_separation", "present", "radius"})
    hint_present = _present(rep["transform_hint"], {"dx", "dy", "present"})
    if not isinstance(rep["nodes"], list): raise inv("SCHEMA")
    for r in rep["nodes"]:
        if not isinstance(r, dict) or "status" not in r: raise inv("SCHEMA" if not isinstance(r, dict) else "MISSING_FIELD")
        st = r["status"]
        if st == "kept": _closed(r, KEPT_KEYS)
        elif st == "removed": _closed(r, REMOVED_KEYS)
        elif st == "added": _closed(r, ADDED_INC if mode == "incremental" else ADDED_BARE)
        else: raise inv("SCHEMA")
        _closed(r["ref"], {"id", "type"})
    # version, scale, hash shapes
    if rep["igls"] != "IGLS/1": raise SErr("INVALID_REPORT", "UNSUPPORTED_VERSION")
    if rep["address_scheme"] != "igs-addr/1": raise SErr("INVALID_REPORT", "UNSUPPORTED_VERSION")
    if rep["scale"] != 1000 or isinstance(rep["scale"], bool): raise SErr("INVALID_REPORT", "INVALID_VALUE")
    hx = re.compile(r"^[0-9a-f]{64}$")
    for h in [rep["next"]["layout_sha256"], rep["next"]["scene_sha256"]] + ([rep["previous"]["layout_sha256"], rep["previous"]["scene_sha256"]] if prev_present else []):
        if not isinstance(h, str) or not hx.match(h): raise SErr("INVALID_REPORT", "INVALID_HASH")
    if plc_present and rep["placement"]["algorithm"] != ALGO: raise SErr("INVALID_REPORT", "UNSUPPORTED_VERSION")
    # ---- INVALID_VALUE group
    def val(c, why=None):
        if not c: raise SErr("INVALID_REPORT", "INVALID_VALUE", why or "")
    LIM = {"x": 2 ** 50, "y": 2 ** 50, "x_prev": 2 ** 50, "y_prev": 2 ** 50, "anchor_x": 2 ** 50 + 2 ** 26, "anchor_y": 2 ** 50 + 2 ** 26,
           "dx": 2 ** 51, "dy": 2 ** 51}
    SAFE = 2 ** 53 - 1
    def intcheck(v):
        val(not isinstance(v, Flt), "float"); val(_is_int(v), "type"); val(abs(v) <= SAFE, "safe")
    for k, v in rep["aggregate"].items():
        if k in ("sum_dist", "sum_dist_sq"): continue
        intcheck(v)
    for k in ("next", "previous"):
        if ext_p[k]:
            for kk in ("max_x", "max_y", "min_x", "min_y"): intcheck(rep["extent"][k][kk])
    if plc_present:
        for kk in ("max_rings", "min_separation", "radius"): intcheck(rep["placement"][kk])
    if hint_present:
        for kk in ("dx", "dy"): intcheck(rep["transform_hint"][kk])
    intcheck(rep["edges"]["common"])
    for r in rep["nodes"]:
        for k, v in r.items():
            if k in ("ref", "status", "anchor_kind"): continue
            intcheck(v)
    for k in ("sum_dist", "sum_dist_sq"):
        s = rep["aggregate"][k]
        val(isinstance(s, str) and re.match(r"^(0|[1-9][0-9]*)$", s), "decimal")
    max_rings = rep["placement"]["max_rings"] if plc_present else None
    for r in rep["nodes"]:
        if r["status"] == "added" and mode == "incremental":
            val(0 <= r["direction"] <= 15, "direction")
            val(r["anchor_kind"] in ("neighbours", "seed"), "anchor_kind")
            if max_rings is not None: val(0 <= r["ring"] < max_rings, "ring")
            else: val(r["ring"] >= 0, "ring")
    for e in rep["edges"]["added"] + rep["edges"]["removed"]:
        val(e["ord"] == "0", "ord")
    for r in rep["nodes"]:
        for k, lim in LIM.items():
            if k in r: val(abs(r[k]) <= lim, k)
        if "dist" in r: val(0 <= r["dist"] < 2 ** 52, "dist")
    for k in ("next", "previous"):
        if ext_p[k]:
            for kk in ("max_x", "max_y", "min_x", "min_y"): val(abs(rep["extent"][k][kk]) <= 2 ** 50, "extent")
    # key limits, per element, before any Map is built
    def key_ref(w):
        if units(node_key_str(w["type"], w["id"])) > MAX_NODE_KEY_UNITS: raise SErr("RESOURCE_LIMIT", "KEY_LENGTH")
    for r in rep["nodes"]: key_ref(r["ref"])
    for e in rep["edges"]["added"] + rep["edges"]["removed"]:
        key_ref(e["src"]); key_ref(e["tgt"])
        if units(js_json_str(e["rel"])) > MAX_REL_UNITS: raise SErr("RESOURCE_LIMIT", "KEY_LENGTH")
    # ---- canonical: serialize again without reordering any array
    if cjb(rep) != raw: raise inv("NON_CANONICAL")
    # ---- integrity
    prevk = None
    for r in rep["nodes"]:
        k = ref_key(tref(r["ref"]))
        if prevk is not None:
            if k == prevk: raise inv("DUPLICATE_NODE_REF")
            if k < prevk: raise inv("NON_CANONICAL_ORDER")
        prevk = k
    for arr in (rep["edges"]["added"], rep["edges"]["removed"]):
        pk = None
        for e in arr:
            k = edge_key(tedge(e))
            if pk is not None:
                if k == pk: raise inv("DUPLICATE_EDGE_REF")
                if k < pk: raise inv("NON_CANONICAL_ORDER")
            pk = k
    # ---- consistency
    recs = rep["nodes"]
    kept = [r for r in recs if r["status"] == "kept"]
    added = [r for r in recs if r["status"] == "added"]
    removed = [r for r in recs if r["status"] == "removed"]
    ic = lambda: SErr("INVALID_REPORT", "INCONSISTENT_RECORD")
    for r in kept:
        dx, dy = r["x"] - r["x_prev"], r["y"] - r["y_prev"]
        if r["dx"] != dx or r["dy"] != dy or r["dist"] != isqrt(dx * dx + dy * dy): raise ic()
    if mode == "incremental":
        for r in added:
            if plc_present is False: raise ic()
            R = rep["placement"]["radius"]
            ux, uy = DIRS[r["direction"]]
            rad = R * (r["ring"] + 1)
            ex, ey = r["anchor_x"] + div_round(rad * ux, 1000), r["anchor_y"] + div_round(rad * uy, 1000)
            if (r["x"], r["y"]) != (ex, ey): raise ic()
            if r["offset"] != isqrt((r["x"] - r["anchor_x"]) ** 2 + (r["y"] - r["anchor_y"]) ** 2): raise ic()
            if r["anchor_kind"] == "seed":
                if not kept: raise ic()                      # divRound(Sy, 0) is undefined (see AMBIGUITIES)
                if (r["anchor_x"], r["anchor_y"]) != (max(k["x"] for k in kept) + R, div_round(sum(k["y"] for k in kept), len(kept))): raise ic()
    if plc_present != (mode == "incremental" and len(added) > 0): raise ic()
    ia = lambda: SErr("INVALID_REPORT", "INCONSISTENT_AGGREGATE")
    inc_added = added if mode == "incremental" else []
    if rep["aggregate"] != aggregates(kept, len(added), len(removed), inc_added): raise ia()
    if rep["extent"]["next"] != extent_of([(r["x"], r["y"]) for r in kept + added]): raise ia()
    if rep["extent"]["previous"] != (extent_of([(r["x_prev"], r["y_prev"]) for r in kept + removed]) if prev_present else {"present": False}):
        raise ia()
    if rep["transform_hint"] != hint_of(kept): raise ia()
    if mode == "incremental":
        if any(r["dist"] != 0 for r in kept): raise SErr("INVALID_REPORT", "KEPT_MOVED")
    return rep, sha(raw), meter


# ---------------------------------------------------------------- verifyStable / verifyStableReproducible
def verify_stable(prev_pair, scene_raw, layout_raw, report_raw, budget=None):
    b = check_budget(budget)
    byte_check(scene_raw, b["maxSceneBytes"]); byte_check(layout_raw, b["maxLayoutBytes"])
    if prev_pair: byte_check(prev_pair[0], b["maxSceneBytes"]); byte_check(prev_pair[1], b["maxLayoutBytes"])
    byte_check(report_raw, b["maxReportBytes"])
    prev = bind_drawing(*prev_pair) if prev_pair else None
    nxt = bind_drawing(scene_raw, layout_raw)
    for sc in ([prev.scene] if prev else []) + [nxt.scene]: count_check(sc, b); key_check_scene(sc)
    if prev: _dom_prev(prev)
    domain_check(nxt.layout, "INVALID_NEXT")
    meter = Meter(b["maxWork"])
    rep, rsha, meter = verify_report(report_raw, budget, meter)
    mm = lambda d: SErr("INVALID_REPORT", "REPORT_MISMATCH", d)
    # V2
    pscene = prev.scene if prev else None
    kept_n = len(set(pscene.nodes) & nxt.scene.nodeset) if pscene else 0
    meter.charge(c1(pscene, nxt.scene, kept_n) + 2 * len(nxt.scene.edges) + len(rep["nodes"]))
    if rep["next"] != {"directed": nxt.scene.directed, "layout_sha256": nxt.layout.sha, "scene_sha256": nxt.scene.sha}: raise mm("HASH")
    exp_prev = {"present": False} if prev is None else {"directed": prev.scene.directed, "layout_sha256": prev.layout.sha, "present": True, "scene_sha256": prev.scene.sha}
    if rep["previous"] != exp_prev: raise mm("HASH")
    pset = set(prev.scene.nodes) if prev else set()
    nset = nxt.scene.nodeset
    rset = [tref(r["ref"]) for r in rep["nodes"]]
    if set(rset) != (pset | nset) or len(rset) != len(set(rset)): raise mm("NODE_SET")
    for r in rep["nodes"]:
        t = tref(r["ref"])
        exp = "kept" if (t in pset and t in nset) else ("added" if t in nset else "removed")
        if r["status"] != exp: raise mm("STATUS")
    for r in rep["nodes"]:
        t = tref(r["ref"])
        if r["status"] in ("kept", "added") and (r["x"], r["y"]) != nxt.pos[t]: raise mm("POSITION")
        if r["status"] in ("kept", "removed") and (r["x_prev"], r["y_prev"]) != prev.pos[t]: raise mm("POSITION")
    if rep["edges"] != edges_obj(pscene, nxt.scene): raise mm("EDGES")
    if rep["mode"] == "incremental":
        wave_of = {tref(r["ref"]): r["wave"] for r in rep["nodes"] if r["status"] == "added"}
        for r in rep["nodes"]:
            if r["status"] != "added": continue
            t = tref(r["ref"])
            N = [nb for nb in nxt.scene.adj[t] if (nb in pset and nb in nset) or (nb in wave_of and wave_of[nb] < r["wave"])]
            if r["anchor_kind"] == "neighbours" and N:
                ax = div_round(sum(nxt.pos[n][0] for n in N), len(N)); ay = div_round(sum(nxt.pos[n][1] for n in N), len(N))
                if (r["anchor_x"], r["anchor_y"]) != (ax, ay): raise mm("ANCHOR")
        for r in rep["nodes"]:
            if r["status"] != "added": continue
            t = tref(r["ref"])
            N = [nb for nb in nxt.scene.adj[t] if (nb in pset and nb in nset) or (nb in wave_of and wave_of[nb] < r["wave"])]
            if (r["anchor_kind"] == "neighbours") != bool(N): raise mm("WAVE")
    return rep, rsha, nxt, prev, meter, b


def verify_stable_reproducible(prev_pair, scene_raw, layout_raw, report_raw, budget=None, cold_cfg_from_layout=True):
    rep, rsha, nxt, prev, meter, b = verify_stable(prev_pair, scene_raw, layout_raw, report_raw, budget)
    mode, kept = mode_of(prev, nxt.scene)
    if not nxt.scene.nodes: mode = "cold" if prev is None else "incremental"
    if rep["mode"] != mode: raise SErr("INVALID_REPORT", "NOT_REPRODUCED", "MODE")
    opts = {"budget": budget}
    if mode == "incremental":
        opts["placement"] = rep["placement"] if rep["placement"]["present"] else RECOMMENDED
        if rep["placement"]["present"]:
            opts["placement"] = {k: rep["placement"][k] for k in ("radius", "min_separation", "max_rings")}
    elif nxt.scene.nodes:
        if nxt.layout.family != "FORCE": raise SErr("INVALID_REPORT", "NOT_REPRODUCED", "BYTES")
        opts["coldStart"] = nxt.layout.obj["policy"]["config"]
        if prev_pair: opts["placement"] = RECOMMENDED
    elif prev_pair:
        opts["placement"] = RECOMMENDED
    # production runs on its own meter (the verifier's meter is cumulative: continue it)
    res = compute_stable(prev_pair, scene_raw, opts, meter=meter)
    if res["layout_raw"] != layout_raw or res["report_raw"] != report_raw: raise SErr("INVALID_REPORT", "NOT_REPRODUCED", "BYTES")
    return "reproduced", meter.W
