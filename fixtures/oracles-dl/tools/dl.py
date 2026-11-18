"""Display list igr-dl/1: build, canonical bytes, strict reader (design 31 sections 3-5).

Written from the design text alone.  Mutants are switched with core.MUT (M('Knnn')).
"""
import math
import unicodedata

from core import (M, IgrError, S, cj, cjb, div_round, floor_div, isqrt, len16, eff_hidden, state_sets,
                  screen_xy, validate_state, serialize_state, q_milli, check_point, hit_test)
import core

DL_FORMAT = "igr-dl/1"
DEFAULT_MAX_DL_BYTES = 67_108_864
DEFAULT_MAX_LABEL_UNITS = 1_048_576
DEFAULT_READ_BYTES = 67_108_864
DEFAULT_LINE_UNITS = 16_777_216
DL_COORD_MAX = 1 << 40
GUARD = 256_000
TRIM = 12
DEGENERATE = 24
PAR_STEP = 16
ARROW_LEN, ARROW_HALF = 10000, 5000
PALETTE = [(42, 120, 214), (235, 104, 52), (27, 175, 122), (237, 161, 0), (232, 123, 164),
           (0, 131, 0), (74, 58, 167), (227, 73, 72), (122, 121, 117)]
PICK_SEG = 16
EDGE_TOL = 6000


# --------------------------------------------------------------------- text
def xs_char(c):
    o = ord(c)
    if o in (0x9, 0xA, 0xD) or 0x20 <= o <= 0xD7FF or 0xE000 <= o <= 0xFFFD or o >= 0x10000:
        return c
    return "\ufffd"


def xs(s):
    if M("K39"):
        return s
    if M("K40"):
        return "".join(c for c in s if xs_char(c) == c)
    return "".join(xs_char(c) for c in s)


def trunc24(s):
    """truncate to <= 24 UTF-16 units: keep, or longest whole-scalar prefix <= 23 units plus U+2026."""
    if M("K36"):
        # ellipsis not counted: cut at 24 units then add the ellipsis (25 units)
        if len16(s) <= 24:
            return s
        out, n = [], 0
        for c in s:
            w = 2 if ord(c) > 0xFFFF else 1
            if n + w > 24:
                break
            out.append(c)
            n += w
        return "".join(out) + "\u2026"
    if len16(s) <= 24:
        return s
    if M("K37"):
        # cut by units: a pair may be split; the lone half prints as U+FFFD
        units = []
        for c in s:
            if ord(c) > 0xFFFF:
                o = ord(c) - 0x10000
                units.append(chr(0xD800 + (o >> 10)))
                units.append(chr(0xDC00 + (o & 0x3FF)))
            else:
                units.append(c)
        cut = units[:23]
        if cut and 0xD800 <= ord(cut[-1]) <= 0xDBFF:
            cut[-1] = "\ufffd"
        return "".join(cut) + "\u2026"
    out, n = [], 0
    for c in s:
        w = 2 if ord(c) > 0xFFFF else 1
        if n + w > 23:
            break
        out.append(c)
        n += w
    return "".join(out) + "\u2026"


def dl_text(s):
    """dl(s) of 30 7.5(a) without XML escaping (D-DRAW)."""
    if not M("K38"):
        s = s.replace("\t", " ").replace("\n", " ").replace("\r", " ")
    if M("K41"):
        s = unicodedata.normalize("NFC", s)
    s = xs(s)
    if M("K46"):
        s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return trunc24(s)


def plain_text(s):
    """xs of the label with TAB, LF, CR replaced by spaces (for the elision test)."""
    return xs(s.replace("\t", " ").replace("\n", " ").replace("\r", " "))


# ------------------------------------------------------------------ options
def validate_options(options):
    """4.5 steps 2-3.  options: None or a python dict (JSON tokens already converted)."""
    if options is None:
        return {"edgeLabels": not M("K47") and True, "labels": True, "maxDrawnLabelUnits": DEFAULT_MAX_LABEL_UNITS}
    if not isinstance(options, dict):
        if M("K67") and isinstance(options, list):
            options = {}
        else:
            raise IgrError("INVALID_INPUT", "SCHEMA")
    opts = {k: v for k, v in options.items() if v is not Ellipsis}
    if not M("K66"):
        if not set(opts) <= {"edgeLabels", "labels", "maxDrawnLabelUnits"}:
            raise IgrError("INVALID_INPUT", "SCHEMA")
    else:
        opts = {k: v for k, v in opts.items() if k in ("edgeLabels", "labels", "maxDrawnLabelUnits")}
    order = ["edgeLabels", "labels", "maxDrawnLabelUnits"]
    if M("K156"):
        order = ["maxDrawnLabelUnits", "labels", "edgeLabels"]
    for k in order:
        if k not in opts:
            continue
        v = opts[k]
        if v is None and M("K153"):
            del opts[k]
            continue
        if k in ("edgeLabels", "labels"):
            if not isinstance(v, bool):
                if M("K151") and k == "labels":
                    raise IgrError("INVALID_INPUT", "INVALID_VALUE")
                raise IgrError("INVALID_INPUT", "SCHEMA")
        else:
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise IgrError("INVALID_INPUT", "SCHEMA")
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                if M("K152"):
                    raise IgrError("INVALID_INPUT", "INVALID_VALUE")
                raise IgrError("INVALID_INPUT", "NOT_FINITE")
            if isinstance(v, float) and v != math.floor(v):
                if M("K152"):
                    raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
                raise IgrError("INVALID_INPUT", "INVALID_VALUE")
            hi = (1 << 31) - (1 if M("K155") else 0) + (1 if M("K155b") else 0)
            if v < 0 or v > hi:
                if M("K152"):
                    raise IgrError("INVALID_INPUT", "NOT_FINITE")
                raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
    r = {"edgeLabels": opts.get("edgeLabels", False if M("K47") else True),
         "labels": opts.get("labels", True),
         "maxDrawnLabelUnits": int(opts.get("maxDrawnLabelUnits", DEFAULT_MAX_LABEL_UNITS))}
    return r


# ---------------------------------------------------------------- geometry
def m_px(v):
    if M("K01"):
        return int(v / 1000)  # truncation toward zero
    if M("K02"):
        return floor_div(v, 1000)
    return div_round(v, 1000)


def trim_pt(P, Q, t):
    qx, qy = Q[0] - P[0], Q[1] - P[1]
    n = qx * qx + qy * qy
    k = isqrt(n)
    if M("K06"):
        lam = k + 1 if n >= k * k + k + 1 else k
    else:
        lam = k
    if M("K08"):
        sq = math.sqrt(n)
        return (P[0] + math.floor(qx * t / sq + 0.5), P[1] + math.floor(qy * t / sq + 0.5))
    if M("K07"):
        return (P[0] + floor_div(qx * t, lam), P[1] + floor_div(qy * t, lam))
    return (P[0] + div_round(qx * t, lam), P[1] + div_round(qy * t, lam))


def half_mid(a, b, floor=False):
    if floor:
        return (floor_div(a[0] + b[0], 2), floor_div(a[1] + b[1], 2))
    return (div_round(a[0] + b[0], 2), div_round(a[1] + b[1], 2))


def compute_routes(model, state):
    """Per drawn edge: dict(index, form, pts_u (micro-px control points), anchor_u).
    Returns (scr, routes)."""
    hn, he = eff_hidden(model, state)
    if M("K50"):
        # hide does not cascade: only the explicit hidden edges
        he = {model["edge_idx"][core.edge_key(a)] for a in state["hidden"]["edges"]}
    scr = {n["index"]: screen_xy(model, state, n) for n in model["nodes"]}
    edges = model["edges"]
    vis = [e for e in edges if e["index"] not in he]
    group_pool = edges if M("K20") else vis
    # grouping
    groups = {}
    for e in group_pool:
        if e["src"] == e["tgt"]:
            continue
        key = (e["src"], e["tgt"]) if M("K19") else (min(e["src"], e["tgt"]), max(e["src"], e["tgt"]))
        groups.setdefault(key, []).append(e["index"])
    loops = {}
    allloops = []
    for e in vis:
        if e["src"] == e["tgt"]:
            loops.setdefault(e["src"], []).append(e["index"])
            allloops.append(e["index"])
    routes = []
    for e in vis:
        i = e["index"]
        A, B = scr[e["src"]], scr[e["tgt"]]
        if e["src"] == e["tgt"]:
            lst = allloops if M("K21") else loops[e["src"]]
            r = lst.index(i)
            u, h = 8 + 4 * r, 24 + 12 * r
            X, Y = A
            pts = [(X - 7 * S, Y - 7 * S), (X - (7 + u) * S, Y - (7 + h) * S), (X + (7 + u) * S, Y - (7 + h) * S),
                   (X + 7 * S, Y - 7 * S)]
            anc = (X, Y - (25 + 9 * r) * S)
            if M("K22"):
                anc = (X, Y - (25 + 8 * r) * S)
            routes.append({"index": i, "form": 2, "pts": pts, "anchor": anc})
            continue
        dx, dy = B[0] - A[0], B[1] - A[1]
        L = isqrt(dx * dx + dy * dy)
        deg_lim = 24 * S
        if M("K15"):
            degenerate = L < deg_lim
        else:
            degenerate = L <= deg_lim
        if M("K17") and L == 0:
            raise ZeroDivisionError("coincident nodes")
        if degenerate:
            if M("K16") and L > 0:
                A2 = trim_pt(A, B, TRIM * S)
                B2 = trim_pt(B, A, TRIM * S)
                routes.append({"index": i, "form": 0, "pts": [A2, B2], "anchor": half_mid(A2, B2)})
                continue
            routes.append({"index": i, "form": 0, "pts": [A, B], "anchor": half_mid(A, B, M("K12"))})
            continue
        key = (e["src"], e["tgt"]) if M("K19") else (min(e["src"], e["tgt"]), max(e["src"], e["tgt"]))
        grp = groups[key]
        if len(grp) == 1:
            t_ = (11 if M("K05") else (13 if M("K05b") else TRIM)) * S
            A2 = trim_pt(A, B, t_)
            B2 = trim_pt(B, A, t_)
            routes.append({"index": i, "form": 0, "pts": [A2, B2], "anchor": half_mid(A2, B2, M("K09"))})
            continue
        k = len(grp)
        p = grp.index(i)
        lo, hi = min(e["src"], e["tgt"]), max(e["src"], e["tgt"])
        if M("K18"):
            F = (B[0] - A[0], B[1] - A[1])
        else:
            F = (scr[hi][0] - scr[lo][0], scr[hi][1] - scr[lo][1])
        n2 = F[0] * F[0] + F[1] * F[1]
        Lf = isqrt(n2)
        if M("K14"):
            Lf = Lf + 1 if n2 >= Lf * Lf + Lf + 1 else Lf
        off = (2 * p - (k - 1)) * PAR_STEP * S
        Mid = half_mid(A, B, M("K13"))
        if M("K11"):
            C = (Mid[0] + floor_div(-F[1] * off, Lf), Mid[1] + floor_div(F[0] * off, Lf))
        else:
            C = (Mid[0] + div_round(-F[1] * off, Lf), Mid[1] + div_round(F[0] * off, Lf))
        t_ = (11 if M("K05") else (13 if M("K05b") else TRIM)) * S
        if M("K18") is False and False:
            pass
        A2 = trim_pt(A, C, t_)
        B2 = trim_pt(B, C, t_)
        if M("K10"):
            anc = (floor_div(A2[0] + 2 * C[0] + B2[0], 4), floor_div(A2[1] + 2 * C[1] + B2[1], 4))
        else:
            anc = (div_round(A2[0] + 2 * C[0] + B2[0], 4), div_round(A2[1] + 2 * C[1] + B2[1], 4))
        routes.append({"index": i, "form": 1, "pts": [A2, C, B2], "anchor": anc})
    return scr, routes


def arrow_for(form, pts_m, directed_tip_override=None):
    """4.4(e) on the m-px points of an E record."""
    tip = pts_m[-1]
    if M("K23"):
        tip = pts_m[0]
    if form == 0:
        prev = pts_m[0]
    elif form == 1:
        prev = pts_m[1]
        if M("K31"):
            prev = pts_m[0]
    else:
        prev = pts_m[2]
        if M("K32"):
            prev = pts_m[1]
    dx, dy = tip[0] - prev[0], tip[1] - prev[1]
    if dx == 0 and dy == 0:
        if M("K29"):
            return (tip[0], tip[1], tip[0], tip[1], tip[0], tip[1])
        dx, dy = (0, 1) if M("K30") else (1, 0)
    lam = isqrt(dx * dx + dy * dy)
    alen = 9000 if M("K24") else (11000 if M("K24b") else ARROW_LEN)
    ahalf = 4000 if M("K25") else (6000 if M("K25b") else ARROW_HALF)
    rd = floor_div if M("K27") else div_round
    bc = (tip[0] - rd(dx * alen, lam), tip[1] - rd(dy * alen, lam))
    b1 = (bc[0] + div_round(-dy * ahalf, lam), bc[1] + div_round(dx * ahalf, lam))
    if M("K26"):
        b2 = (bc[0] - (b1[0] - bc[0]), bc[1] - (b1[1] - bc[1]))
    else:
        b2 = (bc[0] + div_round(dy * ahalf, lam), bc[1] + div_round(-dx * ahalf, lam))
    return (tip[0], tip[1], b1[0], b1[1], b2[0], b2[1])


def arrow_k28(route_pts_u, pts_m):
    """K28: direction from the unrounded micro-px points."""
    tip_m = pts_m[-1]
    form = route_pts_u["form"]
    pu = route_pts_u["pts"]
    tip_u = pu[-1]
    prev_u = pu[0] if form == 0 else (pu[1] if form == 1 else pu[2])
    dx, dy = tip_u[0] - prev_u[0], tip_u[1] - prev_u[1]
    if dx == 0 and dy == 0:
        dx, dy = 1, 0
    lam = isqrt(dx * dx + dy * dy)
    bc = (tip_m[0] - div_round(dx * ARROW_LEN, lam), tip_m[1] - div_round(dy * ARROW_LEN, lam))
    b1 = (bc[0] + div_round(-dy * ARROW_HALF, lam), bc[1] + div_round(dx * ARROW_HALF, lam))
    b2 = (bc[0] + div_round(dy * ARROW_HALF, lam), bc[1] + div_round(-dx * ARROW_HALF, lam))
    return (tip_m[0], tip_m[1], b1[0], b1[1], b2[0], b2[1])


# ----------------------------------------------------------------- label pass
def label_pass(model, state, opts, node_vis, edge_vis, scr, routes_by_edge):
    """returns (texts: list of (kind,index,text), fidelity)"""
    labels, edge_labels, budget = opts["labels"], opts["edgeLabels"], opts["maxDrawnLabelUnits"]
    if not labels and not M("K184"):
        return [], {"labels": "none", "edge_labels": False, "label_units": 0}
    if not labels:
        edge_labels = False
    cands = []
    for n in node_vis:
        t = dl_text(n["label"])
        if t != "" or M("K42"):
            cands.append(("n", n["index"], t, n["label"]))
    ecands = []
    if edge_labels or M("K185"):
        for e in edge_vis:
            t = dl_text(e["label"])
            if t != "" or M("K42"):
                ecands.append(("e", e["index"], t, e["label"]))
    walk = (ecands + cands) if M("K45") else (cands + ecands)
    total = 0
    kept = []
    omitted = False
    for c in walk:
        ln = len16(c[2])
        over = (total + ln >= budget and not (budget == 0 and False)) if M("K43") else (total + ln > budget)
        if over:
            omitted = True
            if M("K44"):
                continue
            break
        total += ln
        kept.append(c)
    elided = omitted
    for c in cands + ecands:
        if c[2] != plain_text(c[3]):
            elided = True
    fid = {"labels": "none" if not labels else ("elided" if elided else "full"),
           "edge_labels": bool(labels and opts["edgeLabels"]), "label_units": total}
    return kept, fid


def dry_label_pass(model, state, options):
    opts = validate_options(options)
    validate_state(model, state) if not M("K68") else None
    hn, he = eff_hidden(model, state)
    nv = [n for n in model["nodes"] if n["index"] not in hn]
    ev = [e for e in model["edges"] if e["index"] not in he]
    _, fid = label_pass(model, state, opts, nv, ev, None, None)
    return fid


# --------------------------------------------------------------------- build
def build_dl(model, state, options=None):
    """buildDisplayList: returns a dict with 'h','nodes','edges','records','fid'."""
    if not isinstance(model, core.Model):
        if not M("K154"):
            raise IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL")
    opts = validate_options(options)
    serialize_state(model, state)
    vp = state["viewport"]
    hn, he = eff_hidden(model, state)
    if M("K50"):
        he = {model["edge_idx"][core.edge_key(a)] for a in state["hidden"]["edges"]}
    sn, se, fn, fe = state_sets(model, state)
    scr, routes = compute_routes(model, state)
    if M("K49"):
        nv = list(model["nodes"])
        routes_all = routes
    else:
        nv = [n for n in model["nodes"] if n["index"] not in hn]
    ev = [e for e in model["edges"] if e["index"] not in he]
    routes_by = {r["index"]: r for r in routes}
    ND = len(nv)
    ED = len(ev)
    pid_n = {}
    pid_e = {}
    for k, n in enumerate(nv):
        pid_n[n["index"]] = n["index"] + 1 if M("K53") else k + 1
    for k, e in enumerate(ev):
        pid_e[e["index"]] = (len(model["nodes"]) + e["index"] + 1) if M("K53") else ND + k + 1
    H_W, H_H = vp["width"], vp["height"]
    if M("K57") and model["nodes"]:
        xs_ = [n["x"] for n in model["nodes"]]
        ys_ = [n["y"] for n in model["nodes"]]
        H_W = max(1, div_round(max(xs_) - min(xs_), 1000))
        H_H = max(1, div_round(max(ys_) - min(ys_), 1000))
    D = 1 if model["directed"] else 0
    ND_h = len(model["nodes"]) if M("K56") else ND
    ED_h = len(model["edges"]) if M("K56") else ED
    sc_h, ly_h = model["scene"], model["layout"]
    if M("K58"):
        sc_h, ly_h = ly_h, sc_h
    header = ["H", DL_FORMAT, H_W, H_H, D, model["artifact"], sc_h, ly_h, ND_h, ED_h]

    def flags(sel, foc):
        a = 1 if sel else 0
        b = 2 if foc else 0
        if M("K51"):
            return (2 if sel else 0) + (1 if foc else 0)
        return a + b

    erecs, nrecs, trecs = [], [], []
    for e in ev:
        r = routes_by[e["index"]]
        pts_m = [(m_px(p[0]), m_px(p[1])) for p in r["pts"]]
        fl = flags(e["index"] in se, e["index"] == fe)
        if M("K52"):
            fl = fl & 1
        flat = [c for p in pts_m for c in p]
        erecs.append((pid_e[e["index"]], ["E", pid_e[e["index"]], fl, r["form"]] + flat, r, pts_m))
    arecs = {}
    want_a = (model["directed"] and not M("K34")) or (not model["directed"] and M("K33"))
    if want_a:
        for pid, rec, r, pts_m in erecs:
            if M("K28"):
                t = arrow_k28(r, pts_m)
            else:
                t = arrow_for(r["form"], pts_m)
            arecs[pid] = ["A", pid] + list(t)
    for n in nv:
        X, Y = scr[n["index"]]
        kc = n["index"]
        cats = model["categories"]
        if M("K55"):
            cats = sorted({m["category"] for m in nv}, key=lambda s: s.encode("utf-8"))
        c = cats.index(n["category"])
        kcls = c % 8 if M("K54") else min(c, 8)
        nrecs.append(["N", pid_n[n["index"]], kcls, flags(n["index"] in sn, n["index"] == fn), m_px(X), m_px(Y)])
    kept, fid = label_pass(model, state, opts, nv, ev, scr, routes_by)
    for kind, idx, text, raw in kept:
        if kind == "n":
            X, Y = scr[idx]
            trecs.append(("n", ["T", pid_n[idx], 0, m_px(X), m_px(Y + 24 * S), text]))
        else:
            r = routes_by[idx]
            ax, ay = r["anchor"]
            trecs.append(("e", ["T", pid_e[idx], 1, m_px(ax), m_px(ay - 4 * S), text]))
    if M("K48"):
        trecs = [t for t in trecs if t[0] == "e"] + [t for t in trecs if t[0] == "n"]
    records = []
    if M("K35"):
        records += [rec for _, rec, _, _ in erecs]
        records += [arecs[p] for p in sorted(arecs)]
    else:
        for pid, rec, r, pts_m in erecs:
            records.append(rec)
            if pid in arecs:
                records.append(arecs[pid])
    records += nrecs
    records += [t[1] for t in trecs]
    dl = {"h": header, "nodes": [n["ref"] for n in nv], "edges": [e["ref"] for e in ev], "records": records,
          "fid": fid, "directed": model["directed"], "w": H_W, "hh": H_H}
    # coordinate check over every emitted integer
    lim = DL_COORD_MAX
    for rec in records:
        k = rec[0]
        if k == "E":
            vals = rec[4:]
        elif k == "A":
            vals = rec[2:]
        elif k == "N":
            vals = rec[4:6]
        else:
            vals = rec[3:5]
        for v in vals:
            if M("K65"):
                continue
            if (abs(v) >= lim) if M("K64") else (abs(v) > lim):
                raise IgrError("INVALID_INPUT", "OUT_OF_RANGE", path="dl.coord")
    return dl


def _tbl_line(addr, kind):
    if M("K62"):
        import json
        return json.dumps([kind, addr])
    return cj([kind, addr])


def dl_lines(dl):
    lines = [cj(dl["h"])]
    if M("K59"):
        for a in dl["edges"]:
            lines.append(_tbl_line(a, "e"))
        for a in dl["nodes"]:
            lines.append(_tbl_line(a, "n"))
    else:
        for a in dl["nodes"]:
            lines.append(_tbl_line(a, "n"))
        for a in dl["edges"]:
            lines.append(_tbl_line(a, "e"))
    for r in dl["records"]:
        lines.append(cj(r))
    if M("K63"):
        lines = [l.replace("\u2028", "\\u2028").replace("\u007f", "\\u007f") for l in lines]
    return lines


last_partial = [None]


def serialize_dl(dl, max_bytes=DEFAULT_MAX_DL_BYTES):
    out = bytearray()
    total = 0
    last_partial[0] = None
    for l in dl_lines(dl):
        b = l.encode("utf-8") + b"\n"
        if M("K61") and False:
            pass
        lim_hit = ((total + len(b)) >= max_bytes) if M("K69") else ((total + len(b)) > max_bytes + (1 if M("K70") else 0))
        if lim_hit:
            if M("K71"):
                last_partial[0] = bytes(out)
            raise IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", path="dl")
        out += b
        total += len(b)
    res = bytes(out)
    if M("K61"):
        res = res[:-1]
    return res


# ------------------------------------------------------------------- reader
JS_WS = set(chr(c) for c in list(range(9, 14)) + [0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF]
            + list(range(0x2000, 0x200B)))


def _ident_ok(s):
    if not isinstance(s, str) or not s:
        return False
    for c in s:
        if c in JS_WS or c in ':|"\\':
            return False
    return True


def _id_ok(s):
    import re
    if not isinstance(s, str):
        return False
    if s.startswith("i:"):
        m = re.fullmatch(r"0|-?[1-9][0-9]*", s[2:])
        return bool(m) and -(1 << 63) <= int(s[2:]) < (1 << 63)
    return s.startswith("s:")


def _node_addr_ok(a):
    return (isinstance(a, dict) and set(a) == {"id", "type"} and _ident_ok(a["type"]) and _id_ok(a["id"]))


def _edge_addr_ok(a):
    import re
    return (isinstance(a, dict) and set(a) == {"ord", "rel", "src", "tgt"} and isinstance(a["ord"], str)
            and re.fullmatch(r"0|[1-9][0-9]*", a["ord"]) is not None and _ident_ok(a["rel"])
            and _node_addr_ok(a["src"]) and _node_addr_ok(a["tgt"]))


MUT_OFF = {"K72": {"cr"}, "K73": {"indent", "blank"}, "K74": {"finallf"}, "K75": {"format", "wh", "hash"},
           "K76": {"count"}, "K77": {"canon_table"}, "K78": {"dup"}, "K79": {"pid_e", "pid_n"},
           "K80": {"flags", "form", "ncoords"}, "K81": {"a_presence"}, "K82": {"a_geom"}, "K83": {"a_adjacent"},
           "K84": {"order", "t_role", "t_order", "t_once"}, "K85": {"t_text"}, "K86": {"ebound", "nbound"},
           "K87": {"order"}, "K88": {"canon_num"}, "K89": {"kind"}, "K91": {"maxline"}, "K92": {"kcls"},
           "K160": {"tbound"}}


class ReadError(Exception):
    def __init__(self, code, reason, rule, line=0):
        self.code, self.reason, self.rule, self.line = code, reason, rule, line
        super().__init__("%s/%s %s line %d" % (code, reason, rule, line))

    def tag(self):
        return self.code + "/" + self.reason


def depth_ok(line, limit=3):
    d = 0
    mx = 0
    in_s = False
    esc = False
    for c in line:
        if in_s:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_s = False
            continue
        if c == '"':
            in_s = True
        elif c in "[{":
            d += 1
            mx = max(mx, d)
        elif c in "]}":
            d -= 1
    return mx <= limit


def depth_ok_naive(line, limit=3):
    d = mx = 0
    for c in line:
        if c in "[{":
            d += 1
            mx = max(mx, d)
        elif c in "]}":
            d -= 1
    return mx <= limit


def _loads(line):
    import json
    from decimal import Decimal

    def bad(x):
        raise ValueError("constant")

    def pairs(p):
        d = {}
        for k, v in p:
            d[k] = v
        return d
    return json.loads(line, parse_float=Decimal, parse_constant=bad, object_pairs_hook=pairs)


def _norm_numbers(v):
    from decimal import Decimal
    if isinstance(v, Decimal):
        if v == v.to_integral_value() and v.is_finite():
            return int(v)
        raise ValueError("fraction")
    if isinstance(v, list):
        return [_norm_numbers(x) for x in v]
    if isinstance(v, dict):
        return {k: _norm_numbers(x) for k, x in v.items()}
    return v


def _isint(v):
    return isinstance(v, int) and not isinstance(v, bool)


def parse_dl(data, max_bytes=DEFAULT_READ_BYTES, max_line=DEFAULT_LINE_UNITS, off=frozenset()):
    """4.7 strict reader.  `off` names rules to disable (single-fault checks, reader mutants).
    Returns the parsed dl dict.  Raises ReadError(code, reason, rule, line)."""
    off = set(off)
    for mk, rules in MUT_OFF.items():
        if M(mk):
            off |= rules

    def fail(rule, line, code="INVALID_INPUT", reason="SCHEMA"):
        if rule in off:
            return
        raise ReadError(code, reason, rule, line)

    if (len(data) >= max_bytes) if M("K90") else (len(data) > max_bytes + (1 if M("K90b") else 0)):
        fail("maxbytes", 0, "RESOURCE_LIMIT", "BYTES_LIMIT")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        fail("utf8", 0)
        text = data.decode("utf-8", "replace")
    if text.startswith("\ufeff"):
        fail("bom", 1)
    if len(data) > 0 and not text.endswith("\n"):
        fail("finallf", 0)
    lines = text.splitlines() if M("K162") else text.split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
    # D1 per line
    for i, l in enumerate(lines, 1):
        if len16(l) > max_line:
            fail("maxline", i, "RESOURCE_LIMIT", "BYTES_LIMIT")
    for i, l in enumerate(lines, 1):
        if "\r" in l:
            fail("cr", i)
        if l == "" or l == "\r":
            fail("blank", i)
        elif l[0] in " \t":
            fail("indent", i)
        if not (depth_ok(l) if not M("K161") else depth_ok_naive(l)):
            fail("nesting", i)
    # a disabled D1 byte rule means a tolerant lexer: the tolerated byte is dropped before the
    # remaining rules (and D12 on the normalized line) run
    norm = []
    for l in lines:
        if "cr" in off and l.endswith("\r"):
            l = l[:-1]
        if "indent" in off:
            l = l.lstrip(" \t")
        norm.append(l)
    lines = norm
    recs = []
    for i, l in enumerate(lines, 1):
        if l == "":
            continue
        try:
            v = _loads(l)
            v = _norm_numbers(v)
        except Exception:
            fail("json", i)
            continue
        recs.append((i, v, l))
    # D2: kinds and order
    ORDER = {"H": 0, "n": 1, "e": 2, "E": 3, "A": 3, "N": 4, "T": 5}
    last = -1
    hdr = None
    n_t = e_t = 0
    t_seen = False
    for i, v, l in recs:
        if not isinstance(v, list) or not v or not isinstance(v[0], str):
            fail("kind", i)
            continue
        k = v[0]
        if k not in ORDER:
            fail("kind", i)
            continue
        if k == "H":
            if hdr is not None or i != 1:
                fail("kind", i)
            if hdr is None:
                hdr = v
        else:
            if hdr is None:
                fail("kind", i)
        o = ORDER[k]
        if o < last:
            fail("order", i)
        last = max(last, o)
    if hdr is None:
        fail("kind", 1)
        return None
    # D3 header
    if len(hdr) != 10:
        fail("format", 1)
    _, fmt, W, H, D, art, sc, ly, ND, ED = (hdr + [None] * 10)[:10]
    if fmt != DL_FORMAT:
        fail("format", 1)
    if not (_isint(W) and _isint(H) and 1 <= W <= 16384 and 1 <= H <= 16384):
        fail("wh", 1)
    if D not in (0, 1) or not _isint(D):
        fail("dflag", 1)
    import re
    for hx in (art, sc, ly):
        if not (isinstance(hx, str) and re.fullmatch(r"[0-9a-f]{64}", hx)):
            fail("hash", 1)
    if not (_isint(ND) and _isint(ED) and ND >= 0 and ED >= 0):
        fail("hcounts", 1)
    # table
    nodes, edges = [], []
    for i, v, l in recs:
        if not isinstance(v, list) or not v:
            continue
        k = v[0]
        if k == "n":
            if len(v) != 2 or not _node_addr_ok(v[1]):
                fail("addr", i)
            else:
                nodes.append(v[1])
        elif k == "e":
            if len(v) != 2 or not _edge_addr_ok(v[1]):
                fail("addr", i)
            else:
                edges.append(v[1])
    n_t, e_t = len(nodes), len(edges)
    if ND != n_t or ED != e_t:
        fail("count", 1)
    seen = set()
    for a in nodes:
        key = ("n", cj(a))
        if key in seen:
            fail("dup", 0)
        seen.add(key)
    for a in edges:
        key = ("e", cj(a))
        if key in seen:
            fail("dup", 0)
        seen.add(key)
    # E / A / N / T
    exp_e = n_t + 1
    exp_n = 1
    E_by_pid = {}
    prev = None
    a_pids = []
    e_pids = []
    lim = DL_COORD_MAX
    last_tpid, tpids = 0, set()
    for i, v, l in recs:
        if not isinstance(v, list) or not v or v[0] in ("H", "n", "e"):
            prev = v
            continue
        k = v[0]
        if k == "E":
            ok = len(v) >= 5 and all(_isint(x) for x in v[1:])
            if not ok:
                fail("ncoords", i)
                prev = v
                continue
            pid, fl, form = v[1], v[2], v[3]
            if pid != exp_e:
                fail("pid_e", i)
            exp_e = pid + 1
            if not (0 <= fl <= 3):
                fail("flags", i)
            if form not in (0, 1, 2):
                fail("form", i)
            else:
                if len(v) - 4 != {0: 4, 1: 6, 2: 8}[form]:
                    fail("ncoords", i)
            for x in v[4:]:
                if abs(x) > lim:
                    fail("ebound", i)
            E_by_pid[pid] = v
            e_pids.append(pid)
        elif k == "A":
            if len(v) != 8 or not all(_isint(x) for x in v[1:]):
                fail("a_shape", i)
                prev = v
                continue
            pid = v[1]
            a_pids.append(pid)
            if not (isinstance(prev, list) and prev and prev[0] == "E" and prev[1] == pid):
                fail("a_adjacent", i)
            ev_ = E_by_pid.get(pid)
            if ev_ is not None and ev_[3] in (0, 1, 2) and len(ev_) - 4 == {0: 4, 1: 6, 2: 8}[ev_[3]]:
                pts = [(ev_[j], ev_[j + 1]) for j in range(4, len(ev_), 2)]
                if tuple(v[2:]) != arrow_for(ev_[3], pts):
                    fail("a_geom", i)
        elif k == "N":
            if len(v) != 6 or not all(_isint(x) for x in v[1:]):
                fail("n_shape", i)
                prev = v
                continue
            pid, kc, fl, x, y = v[1:]
            if pid != exp_n:
                fail("pid_n", i)
            exp_n = pid + 1
            if not (0 <= kc <= 8):
                fail("kcls", i)
            if not (0 <= fl <= 3):
                fail("nflags", i)
            if abs(x) > lim or abs(y) > lim:
                fail("nbound", i)
        elif k == "T":
            if len(v) != 6 or not all(_isint(x) for x in v[1:5]) or not isinstance(v[5], str):
                fail("t_shape", i)
                prev = v
                continue
            pid, role, x, y, tx = v[1:]
            if not (1 <= pid <= n_t + e_t):
                fail("t_pid", i)
            if role != (0 if 1 <= pid <= n_t else 1):
                fail("t_role", i)
            if abs(x) > lim or abs(y) > lim:
                fail("tbound", i)
            bad = (tx == "" or len16(tx) > 24 or any(c in tx for c in "\t\n\r")
                   or any(xs_char(c) != c for c in tx))
            if bad:
                fail("t_text", i)
            if pid in tpids:
                fail("t_once", i)
            tpids.add(pid)
            if pid < last_tpid:
                fail("t_order", i)
            last_tpid = max(last_tpid, pid)
        prev = v
    if exp_n != n_t + 1:
        fail("pid_n", 0)
    if exp_e != n_t + e_t + 1:
        fail("pid_e", 0)
    if D == 1:
        if sorted(a_pids) != sorted(e_pids):
            fail("a_presence", 0)
    elif a_pids:
        fail("a_presence", 0)
    # D12 canonical
    for i, v, l in recs:
        if not isinstance(v, list):
            continue
        lc = l
        try:
            c = cj(v)
        except IgrError:
            c = None
        if c != lc:
            table = bool(v) and v[0] in ("n", "e")
            if table:
                if {"canon_table", "canon"} & set(off):
                    continue
                raise ReadError("INVALID_INPUT", "SCHEMA", "canon_table", i)
            if {"canon_num", "canon"} & set(off):
                continue
            raise ReadError("INVALID_INPUT", "SCHEMA", "canon_num", i)
    return {"h": hdr, "nodes": nodes, "edges": edges, "n": n_t, "e": e_t}


def parse_tag(data, **kw):
    """returns 'ok' or error tag"""
    try:
        parse_dl(data, **kw)
        return "ok"
    except ReadError as e:
        return e.tag()
