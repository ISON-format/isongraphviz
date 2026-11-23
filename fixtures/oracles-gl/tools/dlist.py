"""The display list igr-dl/1 (design 31 sections 3-4; geometry of design 30 sections 3, 6, 7 by reference).

Re-implemented from the written rules.  Only what the gl: rows need: builder, label pass, serializer,
element bounds are not needed.  Integer arithmetic only.
"""
import hashlib
import importlib.util
import os

import ju
import mut
import scn
from ju import div_round, isqrt

DL_COORD_MAX = 1 << 40
DEFAULT_MAX_UNITS = 1_048_576
TRIM, DEGEN, LABEL_DY, ELABEL_DY, PAR_STEP, LOOP_END = 12_000_000, 24_000_000, 24_000_000, 4_000_000, 16_000_000, 7_000_000


# ------------------------------------------------- LP/1 (design 37 rev 2, ruling R-H of 2026-11-22): the label placement reference, read by path
LP_REF_PATH = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "oracles-lp", "tools", "lp.py"))
LP_REF_SHA256 = "1c62862fe9137fb1e95403a47cb58f98cda8e7d3834de6c1789716b973629b95"
# False only for the pre-LP/1 lists that tools/regen_all.py hands to the gap and rev 6 tools (hand-built inputs, A-67), through ORACLE_GL_LP=0
LP_ON = [os.environ.get("ORACLE_GL_LP", "1") != "0"]


def _load_lp():
    data = open(LP_REF_PATH, "rb").read()
    if hashlib.sha256(data).hexdigest() != LP_REF_SHA256:
        raise SystemExit("GATE FAILED: oracles-lp/tools/lp.py digest %s != %s" % (hashlib.sha256(data).hexdigest(), LP_REF_SHA256))
    spec = importlib.util.spec_from_file_location("lp_reference", LP_REF_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


LP = _load_lp()
_LP_CACHE = {}


def lp_place(nodes, labels):
    """place_labels of oracles-lp (pure; memoized because the mutant matrix repeats identical calls)."""
    key = (tuple(nodes), tuple(labels))
    r = _LP_CACHE.get(key)
    if r is None:
        r = _LP_CACHE[key] = LP.place_labels(list(nodes), list(labels))
    return r


def m(v):
    """micro-pixels -> milli-pixels, once, from the exact value (3.2)"""
    return div_round(v, 1000)


def trim(P, Q, t):
    qx, qy = Q[0] - P[0], Q[1] - P[1]
    lam = isqrt(qx * qx + qy * qy)
    assert lam > 0
    return (P[0] + div_round(qx * t, lam), P[1] + div_round(qy * t, lam))


def arrow_record(pid, pts):
    """4.4(e) on the m-px points of the E record (flat list)"""
    n = len(pts) // 2
    tx, ty = pts[-2], pts[-1]
    px, py = pts[-4], pts[-3]
    # form 0: first point; form 1: control point; form 2: second control point  == the point before the last
    dx, dy = tx - px, ty - py
    if dx == 0 and dy == 0:
        dx, dy = 1, 0
    lam = isqrt(dx * dx + dy * dy)
    bcx = tx - div_round(dx * 10000, lam)
    bcy = ty - div_round(dy * 10000, lam)
    b1x = bcx + div_round(-dy * 5000, lam)
    b1y = bcy + div_round(dx * 5000, lam)
    b2x = bcx + div_round(dy * 5000, lam)
    b2y = bcy + div_round(-dx * 5000, lam)
    return ["A", pid, tx, ty, b1x, b1y, b2x, b2y]


class DL:
    pass


def label_pass(texts_nodes, texts_edges, labels, edge_labels, max_units):
    """4.4(g): texts are dl() strings in scene order (one per drawn node / drawn edge, '' = nothing to draw).
    returns (kept_nodes: {pos: text}, kept_edges: {pos: text}, fidelity)"""
    if not labels:
        return {}, {}, {"labels": "none", "edge_labels": False, "label_units": 0}
    cand = [(0, i, t) for i, t in enumerate(texts_nodes) if t != ""]
    if edge_labels:
        cand += [(1, i, t) for i, t in enumerate(texts_edges) if t != ""]
    total = 0
    kept_n, kept_e = {}, {}
    omitted = False
    for role, i, t in cand:
        l = ju.u16len(t)
        if total + l > max_units:
            omitted = True
            break
        total += l
        (kept_n if role == 0 else kept_e)[i] = t
    return kept_n, kept_e, omitted, total


def lp_offsets(nodes, items):
    """Whole-pixel offsets (dx, dy) of the drawn labels `items` (label-pass order); `nodes` are the micro-pixel centres of every visible node."""
    if not LP_ON[0]:
        return [(0, 0)] * len(items)
    res = lp_place(nodes, [("node" if role == 0 else "edge", ju.u16len(text), x, y) for (role, _k, text, x, y) in items])
    return res


def build_dl(model, state, labels=True, edge_labels=True, max_units=DEFAULT_MAX_UNITS):
    vp = state["viewport"]
    nv, ev = scn.vis(model, state)
    sel_n = {model.node_index[(r["type"], r["id"])] for r in state["selection"]["nodes"]}
    sel_e = {model.edge_index[scn._ekey(r)] for r in state["selection"]["edges"]}
    foc = state.get("focus")
    foc_n = foc_e = None
    if foc is not None:
        if "node" in foc:
            foc_n = model.node_index[(foc["node"]["type"], foc["node"]["id"])]
        else:
            foc_e = model.edge_index[scn._ekey(foc["edge"])]

    pos = {}
    for k, n in enumerate(model.nodes):
        if nv[k]:
            pos[k] = scn.screen(vp, n["x"], n["y"])
    dn = [k for k in range(len(model.nodes)) if nv[k]]
    de = [k for k in range(len(model.edges)) if ev[k]]
    ND, ED = len(dn), len(de)
    pid_n = {k: i + 1 for i, k in enumerate(dn)}
    pid_e = {k: ND + i + 1 for i, k in enumerate(de)}

    # groups and loop ranks over visible edges only
    groups = {}
    loops = {}
    rank = {}
    for k in de:
        e = model.edges[k]
        if e["src"] == e["tgt"]:
            r = loops.get(e["src"], 0)
            loops[e["src"]] = r + 1
            rank[k] = r
        else:
            key = (min(e["src"], e["tgt"]), max(e["src"], e["tgt"]))
            g = groups.setdefault(key, [])
            rank[k] = len(g)
            g.append(k)

    E_recs, A_recs, anchors = [], [], {}
    for k in de:
        e = model.edges[k]
        pid = pid_e[k]
        flags = (1 if k in sel_e else 0) + (2 if k == foc_e else 0)
        A, B = pos[e["src"]], pos[e["tgt"]]
        if e["src"] == e["tgt"]:
            r = rank[k]
            u, h = 8 + 4 * r, 24 + 12 * r
            X, Y = A
            M = 1_000_000
            pts_u = [X - 7 * M, Y - 7 * M, X - (7 + u) * M, Y - (7 + h) * M, X + (7 + u) * M, Y - (7 + h) * M, X + 7 * M, Y - 7 * M]
            form = 2
            anchor = (X, Y - (25 + 9 * r) * M)
        else:
            dx, dy = B[0] - A[0], B[1] - A[1]
            L = isqrt(dx * dx + dy * dy)
            if L <= DEGEN:
                pts_u = [A[0], A[1], B[0], B[1]]
                form = 0
                anchor = (div_round(A[0] + B[0], 2), div_round(A[1] + B[1], 2))
            else:
                key = (min(e["src"], e["tgt"]), max(e["src"], e["tgt"]))
                g = groups[key]
                if len(g) == 1:
                    A2, B2 = trim(A, B, TRIM), trim(B, A, TRIM)
                    pts_u = [A2[0], A2[1], B2[0], B2[1]]
                    form = 0
                    anchor = (div_round(A2[0] + B2[0], 2), div_round(A2[1] + B2[1], 2))
                else:
                    kk = len(g)
                    lo, hi = key
                    Slo, Shi = pos[lo], pos[hi]
                    Fx, Fy = Shi[0] - Slo[0], Shi[1] - Slo[1]
                    Lf = isqrt(Fx * Fx + Fy * Fy)
                    off = (2 * rank[k] - (kk - 1)) * PAR_STEP
                    Mx, My = div_round(A[0] + B[0], 2), div_round(A[1] + B[1], 2)
                    C = (Mx + div_round(-Fy * off, Lf), My + div_round(Fx * off, Lf))
                    A2, B2 = trim(A, C, TRIM), trim(B, C, TRIM)
                    pts_u = [A2[0], A2[1], C[0], C[1], B2[0], B2[1]]
                    form = 1
                    anchor = (div_round(A2[0] + 2 * C[0] + B2[0], 4), div_round(A2[1] + 2 * C[1] + B2[1], 4))
        pts = [m(v) for v in pts_u]
        E_recs.append(["E", pid, flags, form] + pts)
        if model.directed:
            A_recs.append(arrow_record(pid, pts))
        anchors[k] = anchor

    N_recs = []
    for k in dn:
        n = model.nodes[k]
        X, Y = pos[k]
        flags = (1 if k in sel_n else 0) + (2 if k == foc_n else 0)
        kcls = min(model.categories.index(n["category"]), 8)
        N_recs.append(["N", pid_n[k], kcls, flags, m(X), m(Y)])

    tn = [ju.dl_text(model.nodes[k]["label"]) for k in dn]
    te = [ju.dl_text(model.edges[k]["label"]) for k in de]
    fid = {"labels": "none", "edge_labels": False, "label_units": 0}
    T_recs = []
    if labels:
        kn, ke, omitted, total = label_pass(tn, te, labels, edge_labels, max_units)
        # the default micro-pixel positions of the drawn labels in the order of the label pass (node labels, then edge labels), then LP/1 (design 37)
        items = []                  # (role, k, text, x, y)
        for i, k in enumerate(dn):
            if i in kn:
                X, Y = pos[k]
                items.append((0, k, kn[i], X, Y + LABEL_DY))
        for i, k in enumerate(de):
            if i in ke:
                ax, ay = anchors[k]
                items.append((1, k, ke[i], ax, ay - ELABEL_DY))
        offs = lp_offsets([pos[k] for k in dn], items)
        for (role, k, text, x, y), (dx, dy) in zip(items, offs):
            T_recs.append(["T", pid_n[k] if role == 0 else pid_e[k], role, m(x + dx * 1_000_000), m(y + dy * 1_000_000), text])
        elided = omitted
        for i, k in enumerate(dn):
            if tn[i] != "" and tn[i] != ju.xs(model.nodes[k]["label"].replace("\t", " ").replace("\n", " ").replace("\r", " ")):
                elided = True
        if edge_labels:
            for i, k in enumerate(de):
                if te[i] != "" and te[i] != ju.xs(model.edges[k]["label"].replace("\t", " ").replace("\n", " ").replace("\r", " ")):
                    elided = True
        fid = {"labels": "elided" if elided else "full", "edge_labels": bool(edge_labels), "label_units": total}

    d = DL()
    d.width, d.height = vp["width"], vp["height"]
    d.directed = model.directed
    d.artifact, d.scene, d.layout = model.artifact, model.scene_sha, model.layout_sha
    d.nodes = [model.nodes[k]["ref"] for k in dn]
    d.edges = [model.edges[k]["ref"] for k in de]
    d.nd, d.ed = ND, ED
    recs = []
    A_by_pid = {r[1]: r for r in A_recs}
    for r in E_recs:
        recs.append(r)
        if r[1] in A_by_pid:
            recs.append(A_by_pid[r[1]])
    recs.extend(N_recs)
    recs.extend(T_recs)
    d.records = recs
    d.fidelity = fid
    check_coords(d)
    return d


def check_coords(d):
    for r in d.records:
        if r[0] == "E":
            nums = r[4:]
        elif r[0] == "A":
            nums = r[2:]
        elif r[0] == "N":
            nums = r[4:6]
        else:
            nums = r[3:5]
        for v in nums:
            if abs(v) > DL_COORD_MAX:
                raise scn.Err("INVALID_INPUT", "OUT_OF_RANGE", "dl.coord")


def dry_fidelity(model, state, labels=True, edge_labels=True, max_units=DEFAULT_MAX_UNITS):
    """4.4(g) alone: no geometry, no coordinate check"""
    nv, ev = scn.vis(model, state)
    tn = [ju.dl_text(model.nodes[k]["label"]) for k in range(len(model.nodes)) if nv[k]]
    te = [ju.dl_text(model.edges[k]["label"]) for k in range(len(model.edges)) if ev[k]]
    nk = [k for k in range(len(model.nodes)) if nv[k]]
    ek = [k for k in range(len(model.edges)) if ev[k]]
    if not labels:
        return {"labels": "none", "edge_labels": False, "label_units": 0}
    kn, ke, omitted, total = label_pass(tn, te, labels, edge_labels, max_units)
    elided = omitted
    for i, k in enumerate(nk):
        if tn[i] != "" and tn[i] != ju.xs(model.nodes[k]["label"].replace("\t", " ").replace("\n", " ").replace("\r", " ")):
            elided = True
    if edge_labels:
        for i, k in enumerate(ek):
            if te[i] != "" and te[i] != ju.xs(model.edges[k]["label"].replace("\t", " ").replace("\n", " ").replace("\r", " ")):
                elided = True
    return {"labels": "elided" if elided else "full", "edge_labels": bool(edge_labels), "label_units": total}


def header_record(d):
    return ["H", "igr-dl/1", d.width, d.height, 1 if d.directed else 0, d.artifact, d.scene, d.layout, d.nd, d.ed]


def serialize_dl(d, max_bytes=None):
    out = [ju.line(header_record(d))]
    for r in d.nodes:
        out.append(ju.line(["n", r]))
    for r in d.edges:
        out.append(ju.line(["e", r]))
    for r in d.records:
        out.append(ju.line(r))
    b = b"".join(out)
    return b


def table_lines(d):
    """n, e lines of the element table"""
    return [ju.line(["n", r]) for r in d.nodes] + [ju.line(["e", r]) for r in d.edges]


def text_records(d):
    return [r for r in d.records if r[0] == "T"]
