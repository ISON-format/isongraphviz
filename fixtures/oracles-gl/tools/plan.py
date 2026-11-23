"""The GPU draw plan igr-gl/1: planner with guard rule, serializer, strict reader G1-G16, readouts.

Design 31 sections 7.2, 7.3, 9.  Mutants of the GL table are consulted through mut.on().
"""
import json
import struct

import dlist
import ju
import mut
import scn
from ju import div_round

GL_FORMAT = "igr-gl/1"
SEG = 16
GUARD_MARGIN = 256_000
NODE_EXPAND = 22_000
EDGE_EXPAND = 12_000
LIM24 = 1 << 24
DEFAULT_MAX_GL = 268_435_456
STRIDE = {"arrow": 28, "disc": 16, "edge": 40}
LAYER_PROGRAM = {1: "edge", 2: "edge", 3: "edge", 4: "arrow", 5: "disc", 6: "disc", 7: "disc"}
EDGE_STYLE_OF_LAYER = {1: 0, 2: 1, 3: 2}
DISC_STYLE_OF_LAYER = {5: 0, 6: 1, 7: 2}


def guard():
    return 128_000 if mut.on("K84") else GUARD_MARGIN


def node_expand():
    return 0 if mut.on("K88") else NODE_EXPAND


def edge_expand():
    return 6_000 if mut.on("K87") else EDGE_EXPAND


# ---------------------------------------------------------------- flatten and clip

def flatten(pts):
    """5.1 polyline of an E record (flat list): the end points for form 0, 17 points for forms 1 and 2"""
    n = len(pts) // 2
    P = [(pts[2 * i], pts[2 * i + 1]) for i in range(n)]
    if n == 2:
        return P
    out = []
    for k in range(17):
        if n == 3:
            w = ((16 - k) ** 2, 2 * k * (16 - k), k * k)
            den = 256
        else:
            w = ((16 - k) ** 3, 3 * (16 - k) ** 2 * k, 3 * (16 - k) * k * k, k ** 3)
            den = 4096
        x = div_round(sum(wi * p[0] for wi, p in zip(w, P)), den)
        y = div_round(sum(wi * p[1] for wi, p in zip(w, P)), den)
        out.append((x, y))
    return out


def _frac_norm(q, p):
    """q/p normalised to a positive denominator"""
    if p < 0:
        return (-q, -p)
    return (q, p)


def _lt(a, b):
    return a[0] * b[1] < b[0] * a[1]


def clip_segment(P0, P1, W, H, G):
    """Liang-Barsky on integers (7.3).  Returns None or (S, E) integer end points."""
    dx, dy = P1[0] - P0[0], P1[1] - P0[1]
    t0, t1 = (0, 1), (1, 1)
    gx = G
    if mut.on("K93"):
        gx = 0  # clip to the viewport instead of the guard box
    bounds = [(-dx, P0[0] + gx), (dx, 1000 * W + gx - P0[0]), (-dy, P0[1] + gx), (dy, 1000 * H + gx - P0[1])]
    for p, q in bounds:
        if p == 0:
            if q < 0 and not mut.on("K86"):
                return None
        elif p < 0:
            f = _frac_norm(q, p)
            if _lt(t0, f):
                t0 = f
        else:
            f = _frac_norm(q, p)
            if _lt(f, t1):
                t1 = f
    if _lt(t1, t0):
        return None

    def rnd(a, b):
        return (a // b) if mut.on("K85") else div_round(a, b)

    S = (P0[0] + rnd(dx * t0[0], t0[1]), P0[1] + rnd(dy * t0[0], t0[1]))
    E = (P0[0] + rnd(dx * t1[0], t1[1]), P0[1] + rnd(dy * t1[0], t1[1]))
    if S == E:
        return None
    return (S, E)


def boxes_meet(a, b):
    """closed boxes (x0,y0,x1,y1)"""
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


# ---------------------------------------------------------------- the planner

class Plan:
    pass


def encode_edge(ax, ay, c1x, c1y, c2x, c2y, bx, by, pid, kind, style):
    if mut.on("K10"):
        kind, style = style, kind
    pairs = [(ax, ay), (c1x, c1y), (c2x, c2y), (bx, by)]
    if mut.on("K21"):
        pairs = [(y, x) for x, y in pairs]
    flat = [v for p in pairs for v in p]
    e = ">" if mut.on("K03") else "<"
    ch = "d" if mut.on("K02") else "f"
    fl = [float(v) for v in flat]
    if mut.on("K04"):
        fl = [(-0.0 if v == 0 else v) for v in fl]
    b = struct.pack(e + ch * 8, *fl) + struct.pack(e + "IBBH", pid, kind, style, 0)
    if mut.on("K20"):
        b += b"\x00\x00\x00\x00"
    return b


def encode_disc(cx, cy, pid, style, cat):
    e = ">" if mut.on("K03") else "<"
    ch = "d" if mut.on("K02") else "f"
    xy = [float(cx), float(cy)]
    if mut.on("K21"):
        xy = [xy[1], xy[0]]
    if mut.on("K04"):
        xy = [(-0.0 if v == 0 else v) for v in xy]
    return struct.pack(e + ch * 2, *xy) + struct.pack(e + "IBBH", pid, style, cat, 0)


def encode_arrow(tx, ty, b1x, b1y, b2x, b2y, pid):
    e = ">" if mut.on("K03") else "<"
    ch = "d" if mut.on("K02") else "f"
    pairs = [(tx, ty), (b1x, b1y), (b2x, b2y)]
    if mut.on("K21"):
        pairs = [(y, x) for x, y in pairs]
    fl = [float(v) for p in pairs for v in p]
    if mut.on("K04"):
        fl = [(-0.0 if v == 0 else v) for v in fl]
    return struct.pack(e + ch * 6, *fl) + struct.pack(e + "I", pid)


def plan_header(d, draws, sizes, nt, cn, ce):
    stride = dict(STRIDE)
    if mut.on("K20"):
        stride["edge"] = 44
    sz = dict(sizes)
    if mut.on("K16"):
        sz["arrow"], sz["disc"] = sz["disc"], sz["arrow"]
    return {
        "artifact": d.artifact,
        "ce": [list(x) for x in ce],
        "cn": [list(x) for x in cn],
        "d": 1 if d.directed else 0,
        "draws": draws,
        "ed": d.ed,
        "format": GL_FORMAT,
        "g": guard(),
        "h": d.height,
        "layout": d.layout,
        "nd": d.nd,
        "nt": nt,
        "scene": d.scene,
        "seg": SEG,
        "sizes": sz,
        "stride": stride,
        "w": d.width,
    }


_LAST_STRING = [""]


def label_runs(d):
    """The label runs of the plan: the `T` records of the list, as given (7.2, 4.4(g)): after LP/1 (design 37) their x and y already carry the placement.
    K173-K177 (R-H) are the ways a plan builder could go wrong instead of reading them."""
    Trec = [r for r in d.records if r[0] == "T"]
    if not any(mut.on(k) for k in ("K173", "K174", "K175", "K176", "K177")):
        return Trec
    Npos = {r[1]: (r[4], r[5]) for r in d.records if r[0] == "N"}
    Epos = {r[1]: (r[4], r[5]) for r in d.records if r[0] == "E"}
    out = []
    for t in Trec:
        _, pid, role, x, y, text = t
        if role == 0 and pid in Npos:
            cx, cy = Npos[pid]
            if mut.on("K173"):                  # the unplaced default position (the fixed offset of rev 6: 24 px below the node centre)
                x, y = cx, cy + dlist.LABEL_DY // 1000
            elif mut.on("K174"):                # the position of the wrong record kind: the node's own `N` record
                x, y = cx, cy
            elif mut.on("K175"):                # the placement offset applied to x only
                y = cy + dlist.LABEL_DY // 1000
            elif mut.on("K176"):                # the placement offset applied to y only
                x = cx
        elif role == 1 and pid in Epos and mut.on("K174"):   # the wrong record kind for an edge label: the first point of its `E` record
            x, y = Epos[pid]
        if mut.on("K177"):                      # the plan's own rounding (whole pixels) instead of the T record as given
            x, y = div_round(x, 1000) * 1000, div_round(y, 1000) * 1000
        out.append(["T", pid, role, x, y, text])
    return out


def build_plan(d, max_bytes=DEFAULT_MAX_GL):
    W, H = d.width, d.height
    G = guard()
    GB = (-G, -G, 1000 * W + G, 1000 * H + G)
    _LAST_STRING[0] = d.nodes[0]["id"] if d.nodes else ""
    Erec = {r[1]: r for r in d.records if r[0] == "E"}
    Arec = {r[1]: r for r in d.records if r[0] == "A"}
    Nrec = [r for r in d.records if r[0] == "N"]
    Trec = label_runs(d)
    if mut.on("K17") and not Trec:
        Nrec = []  # buffers depend on the label options

    cn, ce = [], []
    # ---- nodes
    nx = node_expand()
    emitted_nodes = []
    for r in Nrec:
        _, pid, kcls, flags, x, y = r
        if x < GB[0] - nx or x > GB[2] + nx or y < GB[1] - nx or y > GB[3] + nx:
            cn.append((pid, 0 if mut.on("K90") else flags))
        else:
            emitted_nodes.append(r)
    # ---- edges
    ex = edge_expand()
    edge_inst = {1: [], 2: [], 3: []}  # (ax,ay,c1x,c1y,c2x,c2y,bx,by,pid,kind,style)
    emitted_edges = set()
    clipped_away = set()
    for pid in sorted(Erec):
        r = Erec[pid]
        flags, form, pts = r[2], r[3], r[4:]
        xs_, ys_ = pts[0::2], pts[1::2]
        box = (min(xs_) - ex, min(ys_) - ex, max(xs_) + ex, max(ys_) + ex)
        if not boxes_meet(box, GB):
            ce.append((pid, 0 if mut.on("K90") else flags))
            continue
        lim_ok = all(abs(v) <= LIM24 for v in pts) if mut.on("K01") else all(abs(v) < LIM24 for v in pts)
        segs = None if lim_ok else []
        if segs is None:
            if form == 0:
                if mut.on("K05"):
                    inst = [(pts[0], pts[1], pts[0], pts[1], pts[2], pts[3], pts[2], pts[3], pid, 0)]
                else:
                    inst = [(pts[0], pts[1], 0, 0, 0, 0, pts[2], pts[3], pid, 0)]
            elif form == 1:
                c2 = (pts[4], pts[5]) if mut.on("K05") else (0, 0)
                inst = [(pts[0], pts[1], pts[2], pts[3], c2[0], c2[1], pts[4], pts[5], pid, 1)]
            else:
                inst = [(pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[6], pts[7], pid, 2)]
        elif mut.on("K92") and form != 0:
            if form == 1:
                inst = [(pts[0], pts[1], pts[2], pts[3], 0, 0, pts[4], pts[5], pid, 1)]
            else:
                inst = [(pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[6], pts[7], pid, 2)]
        else:
            poly = flatten(pts)
            inst = []
            for a, b in zip(poly, poly[1:]):
                cs = clip_segment(a, b, W, H, G)
                if cs is None:
                    continue
                (sx, sy), (tx, ty) = cs
                inst.append((sx, sy, 0, 0, 0, 0, tx, ty, pid, 0))
            if not inst:
                ce.append((pid, 0 if mut.on("K90") else flags))
                clipped_away.add(pid)
                continue
        emitted_edges.add(pid)
        for layer, want in ((1, flags & 1), (2, flags & 2), (3, 1)):
            if want:
                if layer == 1 and mut.on("K08"):
                    continue
                for it in inst:
                    style = EDGE_STYLE_OF_LAYER[layer]
                    if layer == 2 and mut.on("K09"):
                        style = 0
                    edge_inst[layer].append(it[:10] + (style,))
    # ---- arrows
    arrow_inst = []
    omitted_by_box = {p for p, _ in ce} - clipped_away
    for pid in sorted(Arec):
        a = Arec[pid]
        _, _, tx, ty, b1x, b1y, b2x, b2y = a
        xs3, ys3 = (tx, b1x, b2x), (ty, b1y, b2y)
        abox = (min(xs3), min(ys3), max(xs3), max(ys3))
        meets = boxes_meet(abox, GB)
        keep = pid in emitted_edges and meets
        if mut.on("K91") and pid in emitted_edges:
            keep = True
        if mut.on("K94") and pid in omitted_by_box:
            keep = True
        if mut.on("K112") and pid in clipped_away:
            keep = True
        if keep:
            arrow_inst.append((tx, ty, b1x, b1y, b2x, b2y, pid))
    if mut.on("K13") and not d.directed:
        arrow_inst.append((0, 0, 0, 0, 0, 0, 1))
    # ---- discs
    disc_inst = {5: [], 6: [], 7: []}
    for r in emitted_nodes:
        _, pid, kcls, flags, x, y = r
        for layer, want in ((5, flags & 1), (6, flags & 2), (7, 1)):
            if want:
                cat = kcls if layer == 7 else (kcls if mut.on("K14") else 0)
                disc_inst[layer].append((x, y, pid, DISC_STYLE_OF_LAYER[layer], cat))

    # ---- buffers and draws
    buf = {"edge": b"", "disc": b"", "arrow": b""}
    counts = {"edge": 0, "disc": 0, "arrow": 0}
    draws = []
    layer_order = [1, 2, 3, 4, 5, 6, 7]
    if mut.on("K07"):
        layer_order = [1, 2, 3, 5, 6, 4, 7]
    insts = {}
    for L in (1, 2, 3):
        insts[L] = edge_inst[L]
    insts[4] = arrow_inst
    for L in (5, 6, 7):
        insts[L] = disc_inst[L]
    first_of = {"edge": 0, "disc": 0, "arrow": 0}
    # buffer content in layer order of each program (the K07 mutant changes only the draw list order)
    for L in range(1, 8):
        prog = LAYER_PROGRAM[L]
        lst = insts[L]
        if prog == "edge":
            enc = b"".join(encode_edge(*(x[:8] + x[8:11])) for x in lst)
        elif prog == "disc":
            enc = b"".join(encode_disc(*x) for x in lst)
        else:
            enc = b"".join(encode_arrow(*x) for x in lst)
        first_of_L = counts[prog]
        if mut.on("K06"):
            if prog == "edge":
                lst = [x[:8] + (first_of_L + j,) + x[9:] for j, x in enumerate(lst)]
                enc = b"".join(encode_edge(*(x[:8] + x[8:11])) for x in lst)
            elif prog == "disc":
                lst = [x[:2] + (first_of_L + j,) + x[3:] for j, x in enumerate(lst)]
                enc = b"".join(encode_disc(*x) for x in lst)
            else:
                lst = [x[:6] + (first_of_L + j,) for j, x in enumerate(lst)]
                enc = b"".join(encode_arrow(*x) for x in lst)
        counts[prog] += len(lst)
        buf[prog] += enc
        insts[L] = (lst, first_of_L)
    for L in layer_order:
        lst, first = insts[L]
        if len(lst) > 0 or mut.on("K12"):
            draws.append({"count": len(lst), "first": 0 if mut.on("K11") else first, "layer": L, "program": LAYER_PROGRAM[L]})
    if mut.on("K12"):
        draws = [x for x in draws]  # empty layers are emitted too
    sizes = {k: len(v) for k, v in buf.items()}
    nt = len(Trec)
    if mut.on("K89"):
        cn, ce = [], []
    hdr = plan_header(d, draws, sizes, nt, sorted(cn), sorted(ce))
    p = Plan()
    p.hdr = hdr
    p.nodes = list(d.nodes)
    p.edges = list(d.edges)
    p.texts = [list(t) for t in Trec]
    p.buf = buf
    if mut.on("K95"):
        p.texts = []
        p.hdr = dict(hdr)
    if mut.on("K96"):
        p.nodes, p.edges = p.edges, p.nodes
    if mut.on("K37"):
        pass
    b = serialize_plan(p, max_bytes)
    return p, b


def _hdr_bytes(h):
    if mut.on("K15"):
        import json as _j
        return _j.dumps(h, ensure_ascii=False).encode("utf-8")  # spaces, insertion order
    return ju.cjb(h)


def serialize_plan(p, max_bytes=DEFAULT_MAX_GL):
    out = [_hdr_bytes(p.hdr), b"\n"]
    for r in p.nodes:
        out.append(ju.line(["n", r]))
    for r in p.edges:
        out.append(ju.line(["e", r]))
    for t in p.texts:
        out.append(ju.line(t))
    out.append(p.buf["edge"])
    out.append(p.buf["disc"])
    out.append(p.buf["arrow"])
    b = b"".join(out)
    lim = max_bytes
    if mut.on("K18") and len(b) == max_bytes:
        raise scn.Err("RESOURCE_LIMIT", "BYTES_LIMIT", "gl")
    if mut.on("K19"):
        lim = max_bytes + 1
    if len(b) > lim:
        raise scn.Err("RESOURCE_LIMIT", "BYTES_LIMIT", "gl")
    return b


# ---------------------------------------------------------------- the strict reader

def _bad(rule, msg):
    raise scn.Err("INVALID_INPUT", "SCHEMA", "%s: %s" % (rule, msg))


def _hex64(s):
    return isinstance(s, str) and len(s) == 64 and all(c in "0123456789abcdef" for c in s)


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _wire_node_ok(a):
    return isinstance(a, dict) and set(a) == {"id", "type"} and all(isinstance(a[k], str) for k in a) and _addr_pat_ok(a)


def _addr_pat_ok(a):
    import re
    ws = "\t\n\x0b\x0c\r                  　﻿"
    bad = set(ws + ':|"' + chr(92))

    def ident(s):
        return len(s) > 0 and not any(c in bad for c in s)

    def tid(s):
        if s.startswith("i:"):
            return re.fullmatch(r"0|-?[1-9][0-9]*", s[2:]) is not None and -(1 << 63) <= int(s[2:]) <= (1 << 63) - 1
        return s.startswith("s:")

    if "ord" in a:
        return (re.fullmatch(r"0|[1-9][0-9]*", a["ord"]) is not None and ident(a["rel"]) and _wire_node_ok(a["src"]) and _wire_node_ok(a["tgt"]))
    return ident(a["type"]) and tid(a["id"])


def _wire_edge_ok(a):
    return isinstance(a, dict) and set(a) == {"ord", "rel", "src", "tgt"} and isinstance(a["ord"], str) and isinstance(a["rel"], str) and _wire_node_ok(a["src"]) and _wire_node_ok(a["tgt"]) and _addr_pat_ok(a)


def _text_ok(t):
    if not isinstance(t, str) or t == "" or ju.u16len(t) > 24:
        return False
    for c in t:
        o = ord(c)
        if o in (9, 10, 13) or c != ju.xs(c) or 0xD800 <= o <= 0xDFFF:
            return False
    return True


class Rd:
    """reader context: disabled rules are skipped (single-fault assertion, mutants K22-K33, K113-K116)"""

    def __init__(self, disabled):
        self.dis = set(disabled)

    def on(self, rule):
        return rule not in self.dis


def parse_plan(b, disabled=(), max_bytes=268_435_456):
    rd = Rd(disabled)
    if mut.on("K22") and False:
        pass
    mutdis = {"K22": "G1", "K23": "G2", "K24": "G3", "K25": "G4", "K26": "G5", "K27": "G6", "K28": "G7", "K29": "G8", "K30": "G9",
              "K31": "G10", "K32": "G11", "K33": "G12", "K113": "G13", "K114": "G14", "K115": "G15", "K116": "G16"}
    for k, r in mutdis.items():
        if mut.on(k):
            rd.dis.add(r)
    if len(b) > max_bytes:
        raise scn.Err("RESOURCE_LIMIT", "BYTES_LIMIT", "cv.read")
    pos = b.find(b"\n")
    if pos < 0:
        _bad("G1", "no header line")
    hl = b[:pos]
    try:
        hdr = json.loads(hl.decode("utf-8"))
    except Exception:
        _bad("G1", "header is not JSON")
    if not isinstance(hdr, dict):
        _bad("G1", "header is not an object")
    # --- G1
    if rd.on("G1"):
        try:
            canon = ju.cjb(hdr)
        except Exception:
            _bad("G1", "header not canonicalisable")
        if canon != hl:
            _bad("G1", "header is not canonical JSON")
        keys = {"artifact", "ce", "cn", "d", "draws", "ed", "format", "g", "h", "layout", "nd", "nt", "scene", "seg", "sizes", "stride", "w"}
        if set(hdr) != keys:
            _bad("G1", "header keys")
        if hdr["format"] != GL_FORMAT:
            _bad("G1", "format")
        if hdr["seg"] != 16 or hdr["g"] != guard():
            _bad("G1", "seg or g")
        if hdr["stride"] != STRIDE:
            _bad("G1", "stride")
        if not (_is_int(hdr["w"]) and _is_int(hdr["h"]) and 1 <= hdr["w"] <= 16384 and 1 <= hdr["h"] <= 16384):
            _bad("G1", "w, h")
        if hdr["d"] not in (0, 1) or isinstance(hdr["d"], bool):
            _bad("G1", "d")
        if not (_hex64(hdr["artifact"]) and _hex64(hdr["layout"]) and _hex64(hdr["scene"])):
            _bad("G1", "hashes")
    # structural (not a rule): fields later steps need
    for k in ("nd", "ed", "nt"):
        if not _is_int(hdr.get(k)) or hdr[k] < 0:
            _bad("G1", "count %s" % k)
    for k in ("w", "h", "d", "seg", "g"):
        if not _is_int(hdr.get(k)):
            _bad("G1", "int %s" % k)
    if not isinstance(hdr.get("sizes"), dict) or set(hdr["sizes"]) != {"arrow", "disc", "edge"} or not all(_is_int(v) and v >= 0 for v in hdr["sizes"].values()):
        _bad("G1", "sizes")
    if not isinstance(hdr.get("stride"), dict) or set(hdr["stride"]) != {"arrow", "disc", "edge"} or not all(_is_int(v) and v > 0 for v in hdr["stride"].values()):
        _bad("G1", "stride shape")
    if not isinstance(hdr.get("draws"), list):
        _bad("G1", "draws")
    for dr in hdr["draws"]:
        if not (isinstance(dr, dict) and set(dr) == {"count", "first", "layer", "program"} and _is_int(dr["count"]) and _is_int(dr["first"]) and _is_int(dr["layer"]) and isinstance(dr["program"], str)):
            _bad("G1", "draw shape")
    for k in ("cn", "ce"):
        if not isinstance(hdr.get(k), list) or not all(isinstance(x, list) and len(x) == 2 and _is_int(x[0]) and _is_int(x[1]) for x in hdr[k]):
            _bad("G15", "%s shape" % k)
    nd, ed, nt = hdr["nd"], hdr["ed"], hdr["nt"]
    # --- prefix lines by kind
    pos += 1
    nodes, edges, texts = [], [], []

    def next_line(pfx):
        nonlocal pos
        if not b.startswith(pfx, pos):
            return None
        e = b.find(b"\n", pos)
        if e < 0:
            _bad("G13", "unterminated line")
        raw = b[pos:e]
        pos = e + 1
        try:
            v = json.loads(raw.decode("utf-8"))
        except Exception:
            _bad("G13", "line is not JSON")
        if rd.on("G13") and ju.cjb(v) != raw:
            _bad("G13", "line is not canonical")
        if not isinstance(v, list) or len(v) < 2:
            _bad("G13", "line is not an array")
        return v

    while True:
        v = next_line(b'["n",')
        if v is None:
            break
        nodes.append(v)
    while True:
        v = next_line(b'["e",')
        if v is None:
            break
        edges.append(v)
    while True:
        v = next_line(b'["T",')
        if v is None:
            break
        texts.append(v)
    if rd.on("G13"):
        if len(nodes) != nd or len(edges) != ed:
            _bad("G13", "table counts")
        for v in nodes:
            if len(v) != 2 or not _wire_node_ok(v[1]):
                _bad("G13", "node address")
        for v in edges:
            if len(v) != 2 or not _wire_edge_ok(v[1]):
                _bad("G13", "edge address")
        ks = [ju.cj(v[1]) for v in nodes]
        if len(set(ks)) != len(ks):
            _bad("G13", "repeated node address")
        ks = [ju.cj(v[1]) for v in edges]
        if len(set(ks)) != len(ks):
            _bad("G13", "repeated edge address")
    # --- G14 text lines
    if rd.on("G14"):
        if len(texts) != nt:
            _bad("G14", "nt differs from the number of T lines")
        seen = set()
        last_key = None
        for v in texts:
            if len(v) != 6 or v[0] != "T" or not all(_is_int(x) for x in v[1:5]) or not isinstance(v[5], str):
                _bad("G14", "T shape")
            pid, role, x, y, tx = v[1], v[2], v[3], v[4], v[5]
            if not (1 <= pid <= nd + ed):
                _bad("G14", "T pid")
            if role != (0 if pid <= nd else 1):
                _bad("G14", "T role")
            if abs(x) > dlist.DL_COORD_MAX or abs(y) > dlist.DL_COORD_MAX:
                _bad("G14", "T coordinate")
            if not _text_ok(tx):
                _bad("G14", "T text")
            if pid in seen:
                _bad("G14", "two T for one pid")
            seen.add(pid)
            key = (role, pid)
            if last_key is not None and key < last_key:
                _bad("G14", "T order")
            last_key = key
    # --- buffers
    rest = b[pos:]
    sizes = hdr["sizes"]
    if rd.on("G2"):
        if len(rest) != sizes["edge"] + sizes["disc"] + sizes["arrow"]:
            _bad("G2", "sizes or trailing bytes")
    bufs = {}
    o = 0
    for prog in ("edge", "disc", "arrow"):
        bufs[prog] = rest[o:o + sizes[prog]]
        o += sizes[prog]
    stride = STRIDE
    ninst = {}
    for prog in ("edge", "disc", "arrow"):
        if rd.on("G3") and len(bufs[prog]) % stride[prog] != 0:
            _bad("G3", "%s buffer is not a multiple of its stride" % prog)
        ninst[prog] = len(bufs[prog]) // stride[prog]
    # --- G4 / G5 draws
    draws = hdr["draws"]
    if rd.on("G4"):
        last = 0
        for dr in draws:
            if not (1 <= dr["layer"] <= 7) or dr["layer"] <= last:
                _bad("G4", "layer order")
            last = dr["layer"]
            if dr["program"] != LAYER_PROGRAM[dr["layer"]]:
                _bad("G4", "program does not match the layer")
            if dr["count"] < 1:
                _bad("G4", "count < 1")
    layer_range = {}
    for dr in draws:
        if dr["layer"] in LAYER_PROGRAM:
            layer_range[dr["layer"]] = (dr["first"], dr["count"])
    if rd.on("G5"):
        end = {"edge": 0, "disc": 0, "arrow": 0}
        for dr in draws:
            prog = LAYER_PROGRAM.get(dr["layer"])
            if prog is None:
                _bad("G5", "unknown layer")
            if dr["first"] != end[prog]:
                _bad("G5", "draws are not contiguous")
            end[prog] = dr["first"] + dr["count"]
        for prog in end:
            if end[prog] != ninst[prog]:
                _bad("G5", "draws do not cover the %s buffer" % prog)
    # --- decode instances
    def inst_slice(layer):
        prog = LAYER_PROGRAM.get(layer)
        if layer not in layer_range or prog is None:
            return []
        f, c = layer_range[layer]
        f = max(0, f)
        return list(range(f, min(f + max(c, 0), ninst[prog])))

    def fl(bs, off):
        v = struct.unpack_from("<f", bs, off)[0]
        return v

    def checkf(v):
        if rd.on("G6"):
            if v != v or v in (float("inf"), float("-inf")):
                _bad("G6", "float not finite")
            if v == 0 and str(v).startswith("-"):
                _bad("G6", "negative zero")
            if v != int(v):
                _bad("G6", "float not integer-valued")
            if abs(v) >= LIM24:
                _bad("G6", "float beyond 2^24")
        try:
            return int(v)
        except Exception:
            return 0

    E = {1: [], 2: [], 3: []}
    A = []
    D = {5: [], 6: [], 7: []}
    for L in (1, 2, 3):
        for i in inst_slice(L):
            o = i * 40
            bs = bufs["edge"]
            vals = [checkf(fl(bs, o + 4 * j)) for j in range(8)]
            pid, kind, style, pad = struct.unpack_from("<IBBH", bs, o + 32)
            E[L].append((vals, pid, kind, style, pad))
    for i in inst_slice(4):
        bs = bufs["arrow"]
        o = i * 28
        vals = [checkf(fl(bs, o + 4 * j)) for j in range(6)]
        pid = struct.unpack_from("<I", bs, o + 24)[0]
        A.append((vals, pid))
    for L in (5, 6, 7):
        for i in inst_slice(L):
            bs = bufs["disc"]
            o = i * 16
            vals = [checkf(fl(bs, o + 4 * j)) for j in range(2)]
            pid, style, cat, pad = struct.unpack_from("<IBBH", bs, o + 8)
            D[L].append((vals, pid, style, cat, pad))
    # --- G7 G8 G9 G10
    for L in (1, 2, 3):
        for vals, pid, kind, style, pad in E[L]:
            if rd.on("G7"):
                if not (0 <= kind <= 2) or not (0 <= style <= 2) or style != EDGE_STYLE_OF_LAYER[L]:
                    _bad("G7", "edge kind or style")
            if rd.on("G8") and pad != 0:
                _bad("G8", "edge padding")
            if rd.on("G9") and pid < 1:
                _bad("G9", "pid >= 1")
            if rd.on("G10"):
                if kind == 0 and any(vals[2:6]):
                    _bad("G10", "unused control points of a line")
                if kind == 1 and any(vals[4:6]):
                    _bad("G10", "unused control point of a quadratic")
    for vals, pid in A:
        if rd.on("G9") and pid < 1:
            _bad("G9", "arrow pid")
    for L in (5, 6, 7):
        for vals, pid, style, cat, pad in D[L]:
            if rd.on("G7"):
                if not (0 <= style <= 2) or style != DISC_STYLE_OF_LAYER[L] or not (0 <= cat <= 8) or (L != 7 and cat != 0):
                    _bad("G7", "disc style or cat")
            if rd.on("G8") and pad != 0:
                _bad("G8", "disc padding")
            if rd.on("G9") and pid < 1:
                _bad("G9", "disc pid")
    # --- G11
    if rd.on("G11"):
        for L in (1, 2, 3):
            prev = None
            for vals, pid, kind, style, pad in E[L]:
                if prev is not None:
                    if pid < prev[0]:
                        _bad("G11", "pids not non-decreasing in layer %d" % L)
                    if pid == prev[0] and (kind != 0 or prev[1] != 0):
                        _bad("G11", "a repeated pid must be kind-0 instances only")
                prev = (pid, kind)
        prev = None
        for vals, pid in A:
            if prev is not None and pid <= prev:
                _bad("G11", "arrow pids not strictly ascending")
            prev = pid
        for L in (5, 6, 7):
            prev = None
            for vals, pid, style, cat, pad in D[L]:
                if prev is not None and pid <= prev:
                    _bad("G11", "disc pids not strictly ascending in layer %d" % L)
                prev = pid
    pids = {1: {x[1] for x in E[1]}, 2: {x[1] for x in E[2]}, 3: {x[1] for x in E[3]}, 4: {x[1] for x in A},
            5: {x[1] for x in D[5]}, 6: {x[1] for x in D[6]}, 7: {x[1] for x in D[7]}}
    # --- G12
    if rd.on("G12"):
        if not (pids[1] <= pids[3] and pids[2] <= pids[3] and pids[4] <= pids[3] and pids[5] <= pids[7] and pids[6] <= pids[7]):
            _bad("G12", "subset rule")
        nfoc = len(pids[2]) + len(pids[6]) + sum(1 for _, f_ in hdr["cn"] if f_ & 2) + sum(1 for _, f_ in hdr["ce"] if f_ & 2)
        if nfoc > 1:
            _bad("G12", "more than one focused element")
    # --- G13 pid ranges
    if rd.on("G13"):
        for L in (5, 6, 7):
            if any(p > nd for p in pids[L]):
                _bad("G13", "node pid outside 1..nd in layer %d" % L)
        for L in (1, 2, 3, 4):
            if any(not (nd + 1 <= p <= nd + ed) for p in pids[L]):
                _bad("G13", "edge pid outside nd+1..nd+ed in layer %d" % L)
    # --- G15
    cn, ce = hdr["cn"], hdr["ce"]
    if rd.on("G15"):
        for lst, lo, hi, emitted in ((cn, 1, nd, pids[7]), (ce, nd + 1, nd + ed, pids[3])):
            last = None
            for pid, fl_ in lst:
                if last is not None and pid <= last:
                    _bad("G15", "cn/ce not strictly ascending")
                last = pid
                if not (lo <= pid <= hi):
                    _bad("G15", "cn/ce pid out of range")
                if not (0 <= fl_ <= 3):
                    _bad("G15", "cn/ce flags")
                if pid in emitted:
                    _bad("G15", "cn/ce pid also emitted")
    # --- G16
    if rd.on("G16"):
        have_n = pids[7] | {p for p, _ in cn}
        have_e = pids[3] | {p for p, _ in ce}
        if not set(range(1, nd + 1)) <= have_n or not set(range(nd + 1, nd + ed + 1)) <= have_e:
            _bad("G16", "a pid of the table is not accounted for")
    p = Plan()
    p.hdr = hdr
    p.nodes, p.edges, p.texts = nodes, edges, texts
    p.nodes = [v for v in nodes]
    p.edges = [v for v in edges]
    p.buf = bufs
    p.E, p.A, p.D = E, A, D
    p.pids = pids
    # the plan object used by serialize_plan wants wire addresses
    p.nodes = [v[1] for v in nodes]
    p.edges = [v[1] for v in edges]
    p.texts = [list(v) for v in texts]
    return p


def parse_plan_lenient(b):
    return parse_plan(b, disabled={"G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15", "G16"})


# ---------------------------------------------------------------- readouts (igr-xr/1)

IGR = "IGR/1"
XR = "igr-xr/1"


def _in_guard(x, y, W, H):
    G = GUARD_MARGIN
    if mut.on("K72"):
        return (-G < x < 1000 * W + G) and (-G < y < 1000 * H + G)
    return (-G <= x <= 1000 * W + G) and (-G <= y <= 1000 * H + G)


def readout_from_list(d):
    nodes = d.nodes
    edges = d.edges
    sel_n, sel_e, foc = [], [], None
    N = {r[1]: r for r in d.records if r[0] == "N"}
    Er = {r[1]: r for r in d.records if r[0] == "E"}
    at, far = [], []
    for k, ref in enumerate(nodes):
        r = N[k + 1]
        if r[3] & 1:
            sel_n.append(ref)
        if r[3] & 2:
            foc = {"node": ref}
        if _in_guard(r[4], r[5], d.width, d.height):
            at.append({"address": ref, "x": r[4], "y": r[5]})
        else:
            far.append(ref)
    for k, ref in enumerate(edges):
        r = Er[len(nodes) + k + 1]
        if r[2] & 1:
            sel_e.append(ref)
        if r[2] & 2:
            foc = {"edge": ref}
    ln, le, units = [], [], 0
    for t in d.records:
        if t[0] == "T":
            units += ju.u16len(t[5])
            if t[2] == 0:
                ln.append({"address": nodes[t[1] - 1], "text": t[5]})
            else:
                le.append({"address": edges[t[1] - len(nodes) - 1], "text": t[5]})
    marked = {"selected": {"edges": sel_e, "nodes": sel_n}}
    if foc is not None:
        marked["focus"] = foc
    return {"igr": IGR, "xr": XR, "scene_sha256": d.scene, "layout_sha256": d.layout,
            "drawn": {"edges": list(edges), "nodes": list(nodes)}, "marked": marked,
            "nodes_at": at, "nodes_far": far, "arrows": list(edges) if d.directed else [],
            "labels": {"edges": le, "nodes": ln}, "label_units": units}


def readout_from_gl(p):
    """9.3: from the parsed plan alone"""
    hdr = p.hdr
    nd, ed = hdr["nd"], hdr["ed"]
    W, H = hdr["w"], hdr["h"]
    table = list(p.nodes) + list(p.edges)

    def addr(pid):
        if not (1 <= pid <= len(table)):
            raise scn.Err("INVALID_INPUT", "SCHEMA", "pid outside the table")
        return table[pid - 1]

    n7 = {x[1]: x[0] for x in p.D[7]}
    cn = {pid: fl for pid, fl in hdr["cn"]}
    ce = {pid: fl for pid, fl in hdr["ce"]}
    e3 = {x[1] for x in p.E[3]}
    node_pids = sorted(set(n7) | set(cn))
    edge_pids = sorted(e3 | set(ce))
    for pid in node_pids:
        if mut.on("K119"):
            continue
        if not (1 <= pid <= nd):
            raise scn.Err("INVALID_INPUT", "SCHEMA", "node pid outside the table")
    for pid in edge_pids:
        if mut.on("K119"):
            continue
        if not (nd + 1 <= pid <= nd + ed):
            raise scn.Err("INVALID_INPUT", "SCHEMA", "edge pid in a node layer or outside the table")
    for L in (1, 2, 3, 4):
        for pid in p.pids[L]:
            if not mut.on("K119") and not (nd + 1 <= pid <= nd + ed):
                raise scn.Err("INVALID_INPUT", "SCHEMA", "node pid in an edge layer")
    for L in (5, 6, 7):
        for pid in p.pids[L]:
            if not mut.on("K119") and not (1 <= pid <= nd):
                raise scn.Err("INVALID_INPUT", "SCHEMA", "edge pid in a node layer")

    def nref(pid):
        if mut.on("K119") and not (1 <= pid <= len(table)):
            return None
        return table[pid - 1] if 1 <= pid <= len(table) else addr(pid)

    sel_n = set(p.pids[5])
    foc_n = set(p.pids[6])
    if not mut.on("K74"):
        sel_n |= {pid for pid, fl in cn.items() if fl & 1}
        foc_n |= {pid for pid, fl in cn.items() if fl & 2}
    if mut.on("K73"):
        sel_n, foc_n = foc_n, sel_n
    sel_e = set(p.pids[1])
    foc_e = set(p.pids[2])
    if not mut.on("K74"):
        sel_e |= {pid for pid, fl in ce.items() if fl & 1}
        foc_e |= {pid for pid, fl in ce.items() if fl & 2}
    if mut.on("K119"):
        node_pids = [q for q in node_pids if 1 <= q <= len(table)]
    at, far = [], []
    for pid in node_pids:
        if pid in n7:
            x, y = n7[pid]
            if _in_guard(x, y, W, H):
                at.append({"address": nref(pid), "x": x, "y": y})
            else:
                far.append(nref(pid))
        else:
            far.append(nref(pid))
    marked = {"selected": {"edges": [nref(q) for q in sorted(sel_e)], "nodes": [nref(q) for q in sorted(sel_n)]}}
    focus = None
    if foc_n:
        focus = {"node": nref(sorted(foc_n)[0])}
    if foc_e:
        focus = {"edge": nref(sorted(foc_e)[0])}
    if focus is not None:
        marked["focus"] = focus
    ln, le, units = [], [], 0
    for t in p.texts:
        units += ju.u16len(t[5])
        if t[2] == 0:
            ln.append({"address": table[t[1] - 2] if mut.on("K71") else nref(t[1]), "text": t[5]})
        else:
            le.append({"address": table[t[1] - 2] if mut.on("K71") else nref(t[1]), "text": t[5]})
    if mut.on("K120"):
        arrows = [nref(q) for q in sorted({x[1] for x in p.A})]
    else:
        arrows = [nref(q) for q in edge_pids] if hdr["d"] == 1 else []
    return {"igr": IGR, "xr": XR, "scene_sha256": hdr["scene"], "layout_sha256": hdr["layout"],
            "drawn": {"edges": [nref(q) for q in edge_pids], "nodes": [nref(q) for q in node_pids]},
            "marked": marked, "nodes_at": at, "nodes_far": far, "arrows": arrows,
            "labels": {"edges": le, "nodes": ln}, "label_units": units}


def serialize_readout(r):
    return ju.cjb(r) + b"\n"
