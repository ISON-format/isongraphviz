"""Pick buffer, pickDrawn, bounds, backingSize, Canvas replay and stream, readouts, compare,
manifest and witness (design 31 sections 5, 6, 9)."""
import math

import core
from core import (M, IgrError, cj, cjb, div_round, floor_div, isqrt, len16, q_milli, check_point, hit_test,
                  validate_state, eff_hidden, S)
import dl as D

# ------------------------------------------------------------- pick buffer
def flatten(form, pts):
    """polyline (m-px) of an E record: 2 points (form 0) or 17 points."""
    if form == 0:
        return [pts[0], pts[1]]
    n = 15 if M("K94") else (17 if M("K94b") else 16)
    dv = n * n if form == 1 else n * n * n
    out = []
    rd = floor_div if M("K93") else div_round
    for k in range(n + 1):
        if form == 1:
            w = [(n - k) ** 2, 2 * k * (n - k), k * k]
        else:
            w = [(n - k) ** 3, 3 * (n - k) ** 2 * k, 3 * (n - k) * k * k, k ** 3]
        out.append(tuple(rd(sum(wi * p[c] for wi, p in zip(w, pts)), dv) for c in (0, 1)))
    return out


def list_edges(dl):
    """[(pid, flags, form, pts)] from the E records"""
    out = []
    for r in dl["records"]:
        if r[0] == "E":
            v = r[4:]
            out.append((r[1], r[2], r[3], [(v[i], v[i + 1]) for i in range(0, len(v), 2)]))
    return out


def list_nodes(dl):
    return [(r[1], r[2], r[3], r[4], r[5]) for r in dl["records"] if r[0] == "N"]


def build_pick(dl):
    nd = len(dl["nodes"])
    ed = len(dl["edges"])
    lines = [["P", "igr-pick/1", nd, ed]]
    for pid, kc, fl, x, y in list_nodes(dl):
        lines.append(["pn", pid, x, y])
    for pid, fl, form, pts in list_edges(dl):
        poly = flatten(form, pts)
        lines.append(["pe", pid] + [c for p in poly for c in p])
    return lines


def serialize_pick(lines):
    return b"".join(cjb(l) + b"\n" for l in lines)


def bounds(dl):
    out = []
    for pid, kc, fl, x, y in list_nodes(dl):
        h = 18000 if M("K106") else 19000
        out.append(["b", pid, x - h, y - h, x + h, y + h])
    for pid, fl, form, pts in list_edges(dl):
        poly = pts if (M("K108") and form != 0) else flatten(form, pts)
        if M("K108") and form != 0:
            poly = [pts[0], pts[-1]]
        xs_ = [p[0] for p in poly]
        ys_ = [p[1] for p in poly]
        e = 0 if M("K107") else 6000
        out.append(["b", pid, min(xs_) - e, min(ys_) - e, max(xs_) + e, max(ys_) + e])
    # pid order: nodes then edges already
    return out


def serialize_bounds(bs):
    return b"".join(cjb(b) + b"\n" for b in bs)


def seg_dist(P, S0, S1):
    """exact squared distance as (num, den)"""
    D_ = (S1[0] - S0[0], S1[1] - S0[1])
    L2 = D_[0] ** 2 + D_[1] ** 2
    v = (P[0] - S0[0], P[1] - S0[1])
    if L2 == 0:
        return (v[0] ** 2 + v[1] ** 2, 1)
    tn = v[0] * D_[0] + v[1] * D_[1]
    if tn <= 0:
        if M("K95"):
            return None
        return (v[0] ** 2 + v[1] ** 2, 1)
    if tn >= L2:
        if M("K95"):
            return None
        w = (P[0] - S1[0], P[1] - S1[1])
        return (w[0] ** 2 + w[1] ** 2, 1)
    cr = v[0] * D_[1] - v[1] * D_[0]
    return (cr * cr, L2)


def frac_lt(a, b):
    return a[0] * b[1] < b[0] * a[1]


def pick_drawn(model, state, point, return_pid=False):
    """createPicker(model, state).pick(point): returns an ElementAddress dict or None."""
    if not isinstance(model, core.Model):
        raise IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL")
    core.serialize_state(model, state)
    if not M("K159"):
        check_point(point)
    st = state
    if M("K103"):
        import copy
        st = copy.deepcopy(state)
        st["hidden"] = {"edges": [], "nodes": []}
    dl = D.build_dl(model, st, None)
    vp = state["viewport"]
    if M("K102"):
        Pm = (round(float(point["x"])) * 1000, round(float(point["y"])) * 1000)
    else:
        Pm = (q_milli(float(point["x"])), q_milli(float(point["y"])))
    if not M("K157"):
        if M("K158"):
            px, py = float(point["x"]), float(point["y"])
            if not (0 <= px <= vp["width"] and 0 <= py <= vp["height"]):
                return None
        else:
            if not (0 <= Pm[0] <= vp["width"] * 1000 and 0 <= Pm[1] <= vp["height"] * 1000):
                return None
    nd = len(dl["nodes"])

    def edge_step():
        tol = {True: 5000, False: EDGE}[bool(M("K96"))] if False else None
        tolv = 5000 if M("K96") else (7000 if M("K97") else 6000)
        best = None
        for pid, fl, form, pts in list_edges(dl):
            poly = flatten(form, pts)
            d = None
            for i in range(len(poly) - 1):
                sd = seg_dist(Pm, poly[i], poly[i + 1])
                if sd is None:
                    continue
                if d is None or frac_lt(sd, d):
                    d = sd
            if d is None:
                continue
            hit = (d[0] < tolv * tolv * d[1]) if M("K98") else (d[0] <= tolv * tolv * d[1])
            if not hit:
                continue
            if best is None:
                best = (d, pid)
            elif M("K99"):
                if not frac_lt(best[0], d):
                    best = (d, pid)
            elif frac_lt(d, best[0]):
                best = (d, pid)
        return best

    def addr_of_pid(pid):
        if pid <= nd:
            return {"node": dl["nodes"][pid - 1]}
        return {"edge": dl["edges"][pid - nd - 1]}

    if M("K100"):
        b = edge_step()
        if b:
            return b[1] if M("K104") else addr_of_pid(b[1])
    if M("K101"):
        h = hit_test(model, state, point)
        return core.element_address(model, h)
    h = hit_test(model, state, point)
    if h is not None and h[0] == "node":
        return core.element_address(model, h)
    b = edge_step()
    if b:
        return b[1] if M("K104") else addr_of_pid(b[1])
    if M("K105") and h is not None and h[0] == "edge":
        return core.element_address(model, h)
    return None


# ------------------------------------------------------------- backing size
def backing_size(w, h, dpr):
    def chk(v, lo, hi, zero_ok=False):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            raise IgrError("INVALID_INPUT", "NOT_FINITE")
        if isinstance(v, float) and v != math.floor(v):
            raise IgrError("INVALID_INPUT", "INVALID_VALUE")
        if v < lo or v > hi:
            raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
    chk(w, 0 if M("K186") else 1, 16384)
    chk(h, 1, 16384)
    if not M("K166"):
        chk(dpr, 250, 8000)
    w, h, dpr = int(w), int(h), int(dpr)
    cands = [dpr]
    if not M("K164"):
        cands.append(floor_div(16384 * 1000, max(w, h)))
    if not M("K165"):
        cands.append(isqrt(floor_div((1 << 26) * 10 ** 6, w * h)))
    e = min(cands)
    if M("K163"):
        return {"bh": floor_div(h * e, 1000), "bw": floor_div(w * e, 1000), "e": e}
    return {"bh": div_round(h * e, 1000), "bw": div_round(w * e, 1000), "e": e}


# --------------------------------------------------------------- replay
TAU = "TAU"
PALETTE = list(D.PALETTE)
if True:
    pass


def _tok(a):
    if isinstance(a, bool):
        raise ValueError
    if isinstance(a, str):
        return a
    x = a * 1000
    r = math.floor(x + 0.5)
    if abs(x - r) > 2 ** -30 * max(1, abs(r)):
        raise ValueError("not integral token %r" % a)
    return int(r)


class Rec:
    def __init__(self):
        self.lines = []
        self.cache = {}

    def reset(self):
        self.lines = []
        if not M("K113"):
            self.cache = {}

    def m(self, name, *args):
        toks = []
        for a in args:
            if isinstance(a, (list, tuple)):
                toks.append([(_tok(x) if not M("K176") else x) for x in a])
            elif name == "arc" and a == 2 * math.pi:
                toks.append(TAU)
            elif name == "arc" and a == math.pi and M("K132"):
                toks.append("PI")
            else:
                toks.append(_tok(a))
        self.lines.append(["m", name] + toks)

    def assign(self, prop, val):
        if not M("K112"):
            if prop in self.cache and self.cache[prop] == val:
                return
        self.cache[prop] = val
        if prop == "lineDash":
            self.lines.append(["m", "setLineDash", [(_tok(x) if not M("K176") else x) for x in val]])
        elif isinstance(val, str):
            self.lines.append(["s", prop, val])
        else:
            self.lines.append(["s", prop, _tok(val)])

    def marker(self, pid, layer):
        self.lines.append(["#", pid, layer])

    def bytes(self):
        return b"".join(cjb(l) + b"\n" for l in self.lines)


def validate_replay_options(opt):
    r = {"dprMilli": 1000, "ink": (34, 34, 34), "layers": [1, 2, 3, 4, 5, 6, 7, 8], "onElement": None}
    if opt is None:
        return r
    if not isinstance(opt, dict):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if not set(opt) <= {"dprMilli", "ink", "layers", "onElement"}:
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if "dprMilli" in opt and not M("K129"):
        v = opt["dprMilli"]
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            raise IgrError("INVALID_INPUT", "NOT_FINITE")
        if isinstance(v, float) and v != math.floor(v):
            raise IgrError("INVALID_INPUT", "INVALID_VALUE")
        if v < 250 or v > 8000:
            raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
        r["dprMilli"] = int(v)
    elif "dprMilli" in opt:
        r["dprMilli"] = opt["dprMilli"]
    if "ink" in opt:
        v = opt["ink"]
        if not M("K130"):
            if not isinstance(v, list) or (len(v) != 3 and not M("K167")):
                raise IgrError("INVALID_INPUT", "SCHEMA")
            for c in v:
                if isinstance(c, bool) or not isinstance(c, (int, float)) or (isinstance(c, float) and c != math.floor(c)):
                    raise IgrError("INVALID_INPUT", "INVALID_VALUE")
                if c < 0 or c > 255:
                    raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
        r["ink"] = tuple(v) if isinstance(v, list) else (0, 0, 0)
    if "layers" in opt:
        v = opt["layers"]
        if not M("K131"):
            if not isinstance(v, list):
                raise IgrError("INVALID_INPUT", "SCHEMA")
            if M("K168") and not v:
                raise IgrError("INVALID_INPUT", "INVALID_VALUE")
            for c in v:
                if isinstance(c, bool) or not isinstance(c, (int, float)) or (isinstance(c, float) and c != math.floor(c)):
                    raise IgrError("INVALID_INPUT", "INVALID_VALUE")
                if not M("K169") and (c < 1 or c > 8):
                    raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
            for a, b in zip(v, v[1:]):
                if (b < a) if M("K170") else (b <= a):
                    raise IgrError("INVALID_INPUT", "INVALID_VALUE")
        r["layers"] = list(v)
    if "onElement" in opt:
        if opt["onElement"] != "function" and not M("K171"):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        r["onElement"] = True
    return r


def rgb(c):
    return "rgb(%d,%d,%d)" % tuple(c)


def replay(dl, rec, options=None, hook=True):
    """replayCanvas(list, ctx, options) into a Rec."""
    o = validate_replay_options(options)
    ink = rgb((255, 255, 255) if False else o["ink"]) if not M("K119") else rgb((34, 34, 34))
    layers = list(o["layers"])
    if M("K109"):
        layers = [{5: 7, 7: 5}.get(l, l) for l in layers]
    if M("K110"):
        layers = [{1: 3, 3: 1}.get(l, l) for l in layers]
    if M("K111"):
        layers = [{3: 4, 4: 3}.get(l, l) for l in layers]
    rec.reset() if False else None
    if not M("K113"):
        rec.cache = {}
    rec.cache = rec.cache if M("K113") else {}
    W, H = dl["w"], dl["hh"]
    if M("K115"):
        rec.m("setTransform", 1, 0, 0, 1, 0, 0)
    else:
        rec.m("setTransform", o["dprMilli"] / 1000, 0, 0, o["dprMilli"] / 1000, 0, 0)
    if not M("K116"):
        rec.m("clearRect", 0, 0, W, H)
    edges = list_edges(dl)
    nodes = list_nodes(dl)
    arrows = [r for r in dl["records"] if r[0] == "A"]
    texts = [r for r in dl["records"] if r[0] == "T"]
    mark = (lambda pid, layer: None) if M("K136") else rec.marker

    def route(form, pts):
        pm = [(p[0] / 1000, p[1] / 1000) for p in pts]
        rec.m("beginPath")
        rec.m("moveTo", *pm[0])
        if form == 0:
            rec.m("lineTo", *pm[1])
        elif form == 1:
            if M("K178"):
                rec.m("bezierCurveTo", *pm[1], *pm[1], *pm[2])
            else:
                rec.m("quadraticCurveTo", *pm[1], *pm[2])
        else:
            if M("K177"):
                rec.m("quadraticCurveTo", *pm[1], *pm[3])
            else:
                rec.m("bezierCurveTo", *pm[1], *pm[2], *pm[3])

    halo_foc_w = 8 if M("K174") else 10
    halo_foc_dash = [6, 4] if not M("K174") else [6, 4]
    ring_dash = [3, 4] if M("K175") else [4, 3]
    for layer in layers:
        if M("K136") is False:
            pass
        if layer in (1, 2, 3):
            sel = [e for e in edges if (layer == 3) or (e[1] & (1 if layer == 1 else 2))]
            if layer == 3 and M("K133") and sel:
                rec.assign("strokeStyle", ink)
                rec.assign("lineWidth", 2)
                rec.assign("globalAlpha", 0.6)
                rec.assign("lineDash", [])
                rec.m("beginPath")
                for pid, fl, form, pts in sel:
                    if hook and o["onElement"] is not None or True:
                        mark(pid, layer)
                    pm = [(p[0] / 1000, p[1] / 1000) for p in pts]
                    rec.m("moveTo", *pm[0])
                    if form == 0:
                        rec.m("lineTo", *pm[1])
                    elif form == 1:
                        rec.m("quadraticCurveTo", *pm[1], *pm[2])
                    else:
                        rec.m("bezierCurveTo", *pm[1], *pm[2], *pm[3])
                rec.m("stroke")
                continue
            for pid, fl, form, pts in sel:
                mark(pid, layer)
                rec.assign("strokeStyle", ink)
                if layer == 1:
                    rec.assign("lineWidth", 6)
                    rec.assign("globalAlpha", 0.35)
                    rec.assign("lineDash", [])
                elif layer == 2:
                    rec.assign("lineWidth", halo_foc_w)
                    rec.assign("globalAlpha", 0.25)
                    rec.assign("lineDash", halo_foc_dash)
                else:
                    rec.assign("lineWidth", 2)
                    rec.assign("globalAlpha", 0.6)
                    rec.assign("lineDash", [])
                if M("K134"):
                    rec.m("save")
                route(form, pts)
                rec.m("stroke")
                if M("K134"):
                    rec.m("restore")
        elif layer == 4:
            for r in arrows:
                pid = r[1]
                mark(pid, 4)
                if not (M("K137") and not hook):
                    rec.assign("fillStyle", ink)
                rec.assign("globalAlpha", 0.6)
                rec.m("beginPath")
                rec.m("moveTo", r[2] / 1000, r[3] / 1000)
                rec.m("lineTo", r[4] / 1000, r[5] / 1000)
                rec.m("lineTo", r[6] / 1000, r[7] / 1000)
                rec.m("closePath")
                rec.m("fill")
        elif layer in (5, 6):
            for pid, kc, fl, x, y in nodes:
                if not (fl & (1 if layer == 5 else 2)):
                    continue
                mark(pid, layer)
                rec.assign("strokeStyle", ink)
                if layer == 5:
                    rec.assign("lineWidth", 3)
                    rec.assign("globalAlpha", 1)
                    rec.assign("lineDash", [])
                else:
                    rec.assign("lineWidth", 2)
                    rec.assign("globalAlpha", 1)
                    rec.assign("lineDash", ring_dash)
                rec.m("beginPath")
                rec.m("arc", x / 1000, y / 1000, 14 if layer == 5 else 18, 0, 2 * math.pi if not M("K132") else math.pi)
                rec.m("stroke")
        elif layer == 7:
            for pid, kc, fl, x, y in nodes:
                mark(pid, 7)
                pal = list(PALETTE)
                if M("K173"):
                    pal[5] = (0, 130, 0)
                rec.assign("fillStyle", rgb(pal[kc]))
                rec.assign("globalAlpha", 1)
                rec.m("beginPath")
                rec.m("arc", x / 1000, y / 1000, 10, 0, 2 * math.pi if not M("K132") else math.pi)
                rec.m("fill")
                rec.assign("strokeStyle", "rgb(255,255,255)")
                rec.assign("lineWidth", 2)
                rec.assign("globalAlpha", 1)
                if not M("K114"):
                    rec.assign("lineDash", [])
                rec.m("stroke")
        elif layer == 8:
            def styles():
                rec.assign("fillStyle", ink)
                rec.assign("globalAlpha", 1)
                rec.assign("font", "13px sans-serif" if M("K118") else "12px sans-serif")
                rec.assign("textAlign", "center")
                rec.assign("textBaseline", "alphabetic")
                rec.assign("direction", "ltr")
            if (texts or M("K135")) and not M("K172"):
                styles()
            first = True
            for r in texts:
                if first and M("K172"):
                    mark(r[1], 8)
                    styles()
                    first = False
                else:
                    mark(r[1], 8)
                tx = r[5]
                if M("K117"):
                    tx = tx.strip()
                rec.m("fillText", tx, r[3] / 1000, r[4] / 1000)
    return rec


def record_calls(dl, options=None, with_hook=True):
    rec = Rec()
    replay(dl, rec, options, hook=with_hook)
    if not with_hook:
        rec.lines = [l for l in rec.lines if l[0] != "#"]
    return rec.bytes()


def strip_markers(stream):
    return b"".join(l + b"\n" for l in stream.split(b"\n") if l and not l.startswith(b'["#"'))


# ------------------------------------------------------- stream reader / witness
def parse_stream(stream):
    """returns sections: list of (pid, layer, [lines]) plus the prologue lines"""
    import json
    lines = stream.decode("utf-8").split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
    pro = []
    secs = []
    for l in lines:
        v = json.loads(l)
        if cj(v) != l:
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if v[0] == "#":
            secs.append([v[1], v[2], []])
        elif secs:
            secs[-1][2].append(v)
        else:
            pro.append(v)
    last_layer = 0
    last_pid = -1
    for pid, layer, _ in secs:
        if layer < last_layer or not (1 <= layer <= 8):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if layer == last_layer and pid <= last_pid:
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if layer != last_layer:
            last_pid = -1
        last_layer, last_pid = layer, pid
    # 6.6 (rev 5): layers 2 and 6 together hold at most one pid (at most one focused element)
    if sum(1 for pid, layer, _ in secs if layer in (2, 6)) > 1:
        raise IgrError("INVALID_INPUT", "SCHEMA")
    return pro, secs


def painted(layer, body):
    names = [b[1] for b in body if b[0] == "m"]
    if layer in (1, 2, 3, 5, 6):
        return "stroke" in names
    if layer == 4:
        return "fill" in names
    if layer == 7:
        return "fill" in names and "stroke" in names
    return "fillText" in names


def canvas_witness(stream, dl):
    pro, secs = parse_stream(stream)
    nd = len(dl["nodes"])
    nodes, edges = set(), set()
    for pid, layer, body in secs:
        if not (1 <= pid <= nd + len(dl["edges"])):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if layer == 7 and painted(7, body):
            nodes.add(pid)
        if layer == 3 and painted(3, body):
            edges.add(pid)
    return {"backend": "igr-cv/1", "elements": {"edges": [dl["edges"][p - nd - 1] for p in sorted(edges)],
                                               "nodes": [dl["nodes"][p - 1] for p in sorted(nodes)]},
            "texts": []}


# ---------------------------------------------------------------- readouts
def make_readout(scene, layout, W, Hh, drawn_nodes, drawn_edges, sel_nodes, sel_edges, focus, nodes_xy, arrows,
                 lab_nodes, lab_edges, units):
    gb = (-GUARD_, 1000 * W + GUARD_, -GUARD_, 1000 * Hh + GUARD_)
    at, far = [], []
    for addr, x, y in nodes_xy:
        inside = (gb[0] <= x <= gb[1] and gb[2] <= y <= gb[3])
        if M("K150"):
            inside = (0 <= x <= 1000 * W and 0 <= y <= 1000 * Hh)
        if M("K139"):
            inside = True
        (at if inside else far).append({"address": addr, "x": x, "y": y} if inside else addr)
    marked = {"selected": {"edges": sel_edges, "nodes": sel_nodes}}
    if focus is not None:
        marked["focus"] = focus
    return {"arrows": arrows, "drawn": {"edges": drawn_edges, "nodes": drawn_nodes}, "igr": "IGR/1",
            "label_units": units, "labels": {"edges": lab_edges, "nodes": lab_nodes},
            "layout_sha256": layout, "marked": marked, "nodes_at": at, "nodes_far": far,
            "scene_sha256": scene, "xr": "igr-xr/1"}


GUARD_ = D.GUARD


def readout_from_list(dl, model):
    nd = len(dl["nodes"])
    nodes = dl["nodes"]
    edges = dl["edges"]
    sel_n, sel_e = [], []
    focus = None
    pos = []
    for pid, kc, fl, x, y in list_nodes(dl):
        a = nodes[pid - 1]
        s_bit, f_bit = (1, 2)
        if M("K60"):
            s_bit, f_bit = 2, 1
        if fl & s_bit:
            sel_n.append(a)
        if fl & f_bit:
            focus = {"node": a} if not M("K144") else {"edge": a}
        pos.append((a, x, y))
    for pid, fl, form, pts in list_edges(dl):
        a = edges[pid - nd - 1]
        s_bit, f_bit = (1, 2)
        if M("K60"):
            s_bit, f_bit = 2, 1
        if fl & s_bit:
            sel_e.append(a)
        if fl & f_bit:
            focus = {"edge": a} if not M("K144") else {"node": a}
    arrows = [edges[r[1] - nd - 1] for r in dl["records"] if r[0] == "A"]
    ln, le = [], []
    units = 0
    for r in dl["records"]:
        if r[0] == "T":
            if r[2] == 0:
                ln.append({"address": nodes[r[1] - 1], "text": r[5]})
            else:
                le.append({"address": edges[r[1] - nd - 1], "text": r[5]})
            units += (len(r[5].encode("utf-8")) if M("K143") else len16(r[5])) if False else len16(r[5])
    if M("K143"):
        units = sum(len(r[5]) for r in dl["records"] if r[0] == "T")
    return make_readout(model["scene"], model["layout"], dl["w"], dl["hh"], list(nodes), list(edges), sel_n, sel_e,
                        focus, pos, arrows, ln, le, units)


def readout_from_stream(stream, dl, model):
    pro, secs = parse_stream(stream)
    nd = len(dl["nodes"])
    nodes, edges = dl["nodes"], dl["edges"]
    dn, de, sn, se, fnode, fedge, arr = set(), set(), set(), set(), None, None, set()
    centres = {}
    texts = {}
    for pid, layer, body in secs:
        if not painted(layer, body) and not (M("K142") and layer in (3, 7)):
            continue
        if layer == 7:
            dn.add(pid)
            for b in body:
                if b[0] == "m" and b[1] == "arc":
                    centres[pid] = (b[2], b[3])
        elif layer == 3:
            de.add(pid)
        elif layer == 5:
            sn.add(pid)
        elif layer == 1:
            se.add(pid)
        elif layer == 6:
            if M("K146"):
                pass
            else:
                fnode = pid
        elif layer == 2:
            fedge = pid
        elif layer == 4:
            arr.add(pid)
        elif layer == 8:
            for b in body:
                if b[0] == "m" and b[1] == "fillText":
                    texts[pid] = (b[2], b[3], b[4])
    if M("K146"):
        for pid, layer, body in secs:
            if layer == 5 and painted(5, body):
                fnode = pid
    if M("K145"):
        sn = set(dn)
    if M("K147"):
        arr = set(de)
    if M("K148"):
        for pid, t in texts.items():
            if pid <= nd:
                centres[pid] = (t[1], t[2])
    focus = None
    if fnode is not None:
        focus = {"node": nodes[fnode - 1]}
    elif fedge is not None:
        focus = {"edge": edges[fedge - nd - 1]}
    ln, le = [], []
    units = 0
    for pid in sorted(texts):
        t = texts[pid][0]
        if pid <= nd:
            ln.append({"address": nodes[pid - 1], "text": t})
        else:
            le.append({"address": edges[pid - nd - 1], "text": t})
        units += len(t.encode("utf-8")) if M("K149") else len16(t)
    return make_readout(model["scene"], model["layout"], dl["w"], dl["hh"],
                        [nodes[p - 1] for p in sorted(dn)], [edges[p - nd - 1] for p in sorted(de)],
                        [nodes[p - 1] for p in sorted(sn)], [edges[p - nd - 1] for p in sorted(se)], focus,
                        [(nodes[p - 1], centres[p][0], centres[p][1]) for p in sorted(dn)],
                        [edges[p - nd - 1] for p in sorted(arr)], ln, le, units)


def serialize_readout(r):
    return cjb(r) + b"\n"


# ---- from an SVG-document readout (hand-built or scraped)
import re
DEC = re.compile(r"-?(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$")


def dec_to_mpx(s):
    if not isinstance(s, str):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if M("K187"):
        try:
            float(s)
        except ValueError:
            return 0
    if M("K138"):
        try:
            return int(float(s) * 1000)
        except ValueError:
            raise IgrError("INVALID_INPUT", "SCHEMA")
    if not M("K181"):
        if not DEC.match(s) or s == "-0" or re.fullmatch(r"-0(\.0+)?", s):
            raise IgrError("INVALID_INPUT", "SCHEMA")
    else:
        try:
            return int(round(float(s) * 1000))
        except (ValueError, OverflowError):
            raise IgrError("INVALID_INPUT", "SCHEMA")
    neg = s.startswith("-")
    t = s[1:] if neg else s
    if "." in t:
        a, b = t.split(".")
        b = (b + "000")[:3]
    else:
        a, b = t, "000"
    v = int(a) * 1000 + int(b)
    return -v if neg else v


def readout_from_svg(obj):
    """SvgReadoutLike -> Readout"""
    req = {"scene_sha256": str, "layout_sha256": str, "width": int, "height": int, "directed": bool,
           "nodes": list, "edges": list}
    for k, t in req.items():
        if k not in obj or isinstance(obj[k], bool) != (t is bool) and t is not bool and False:
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if k not in obj or not isinstance(obj[k], t) or (t is int and isinstance(obj[k], bool)):
            raise IgrError("INVALID_INPUT", "SCHEMA")
    sel_n, sel_e, focus, pos, ln, le = [], [], None, [], [], []
    drawn_n, drawn_e, arrows = [], [], []
    units = 0
    for n in obj["nodes"]:
        for k, t in (("address", dict), ("cx", str), ("cy", str), ("selected", bool), ("focused", bool)):
            if k not in n or not isinstance(n[k], t):
                raise IgrError("INVALID_INPUT", "SCHEMA")
        x, y = dec_to_mpx(n["cx"]), dec_to_mpx(n["cy"])
        a = n["address"]
        drawn_n.append(a)
        pos.append((a, x, y))
        s_, f_ = (n["focused"], n["selected"]) if M("K182") else (n["selected"], n["focused"])
        if s_:
            sel_n.append(a)
        if f_:
            focus = {"node": a}
        if "label" in n:
            ln.append({"address": a, "text": n["label"]})
            units += len16(n["label"])
    for e in obj["edges"]:
        for k, t in (("address", dict), ("selected", bool), ("focused", bool), ("marker", bool)):
            if k not in e or not isinstance(e[k], t):
                raise IgrError("INVALID_INPUT", "SCHEMA")
        a = e["address"]
        drawn_e.append(a)
        s_, f_ = (e["focused"], e["selected"]) if M("K182") else (e["selected"], e["focused"])
        if s_:
            sel_e.append(a)
        if f_:
            focus = {"edge": a}
        if e["marker"]:
            arrows.append(a)
        if "label" in e:
            le.append({"address": a, "text": e["label"]})
            units += len16(e["label"])
    return make_readout(obj["scene_sha256"], obj["layout_sha256"], obj["width"], obj["height"], drawn_n, drawn_e,
                        sel_n, sel_e, focus, pos, arrows, ln, le, units)


# ---------------------------------------------------------------- compare
def _addr_ok(a, kind):
    if kind == "node":
        return isinstance(a, dict) and set(a) == {"id", "type"} and all(isinstance(v, str) for v in a.values())
    return (isinstance(a, dict) and set(a) == {"ord", "rel", "src", "tgt"} and isinstance(a["ord"], str)
            and isinstance(a["rel"], str) and _addr_ok(a["src"], "node") and _addr_ok(a["tgt"], "node"))


def _hash_ok(h):
    return isinstance(h, str) and re.fullmatch(r"[0-9a-f]{64}", h) is not None


def validate_readout(r, entry_keys_check=True):
    def sch():
        raise IgrError("INVALID_REPORT", "SCHEMA")

    def ver():
        if r.get("igr") != "IGR/1" or r.get("xr") != "igr-xr/1":
            raise IgrError("INVALID_REPORT", "UNSUPPORTED_VERSION")

    def schema():
        if not isinstance(r, dict):
            sch()
        keys = {"arrows", "drawn", "igr", "label_units", "labels", "layout_sha256", "marked", "nodes_at", "nodes_far",
                "scene_sha256", "xr"}
        ks = set(r)
        if M("K183"):
            ks.discard("__proto__")
        if ks != keys:
            sch()
        if not (_hash_ok(r["scene_sha256"]) and _hash_ok(r["layout_sha256"])):
            sch()
        if not isinstance(r["igr"], str) or not isinstance(r["xr"], str):
            sch()
        d = r["drawn"]
        if not (isinstance(d, dict) and set(d) == {"nodes", "edges"} and isinstance(d["nodes"], list)
                and isinstance(d["edges"], list)):
            sch()
        if not all(_addr_ok(a, "node") for a in d["nodes"]) or not all(_addr_ok(a, "edge") for a in d["edges"]):
            sch()
        mk = r["marked"]
        if not (isinstance(mk, dict) and set(mk) <= {"selected", "focus"} and "selected" in mk):
            sch()
        sl = mk["selected"]
        if not (isinstance(sl, dict) and set(sl) == {"nodes", "edges"}):
            sch()
        if not all(_addr_ok(a, "node") for a in sl["nodes"]) or not all(_addr_ok(a, "edge") for a in sl["edges"]):
            sch()
        if "focus" in mk:
            f = mk["focus"]
            if not (isinstance(f, dict) and len(f) == 1 and (("node" in f and _addr_ok(f["node"], "node")) or
                                                             ("edge" in f and _addr_ok(f["edge"], "edge")))):
                sch()
        if not isinstance(r["nodes_at"], list) or not isinstance(r["nodes_far"], list) or not isinstance(r["arrows"], list):
            sch()
        for e in r["nodes_at"]:
            if not (isinstance(e, dict) and set(e) == {"address", "x", "y"} and _addr_ok(e["address"], "node")
                    and all(isinstance(e[k], int) and not isinstance(e[k], bool) and abs(e[k]) <= core.SAFE for k in "xy")):
                sch()
        if not all(_addr_ok(a, "node") for a in r["nodes_far"]) or not all(_addr_ok(a, "edge") for a in r["arrows"]):
            sch()
        lb = r["labels"]
        if not (isinstance(lb, dict) and set(lb) == {"nodes", "edges"}):
            sch()
        for k, kind in (("nodes", "node"), ("edges", "edge")):
            if not isinstance(lb[k], list):
                sch()
            for e in lb[k]:
                if not (isinstance(e, dict) and set(e) == {"address", "text"} and _addr_ok(e["address"], kind)
                        and isinstance(e["text"], str)):
                    sch()
        if not (isinstance(r["label_units"], int) and not isinstance(r["label_units"], bool) and r["label_units"] >= 0):
            sch()
    if M("K179"):
        if isinstance(r, dict):
            ver()
        schema()
    else:
        schema()
        ver()
    # V3
    dn = {cj(a) for a in r["drawn"]["nodes"]}
    de = {cj(a) for a in r["drawn"]["edges"]}
    at = [cj(e["address"]) for e in r["nodes_at"]]
    far = [cj(a) for a in r["nodes_far"]]
    allref = []
    allref += [(a, "n") for a in r["marked"]["selected"]["nodes"]] + [(a, "e") for a in r["marked"]["selected"]["edges"]]
    allref += [(a, "e") for a in r["arrows"]]
    for ent in r["labels"]["nodes"]:
        allref.append((ent["address"], "n"))
    for ent in r["labels"]["edges"]:
        allref.append((ent["address"], "e"))
    f = r["marked"].get("focus")
    if f:
        allref.append((f["node"], "n") if "node" in f else (f["edge"], "e"))
    for a, k in allref:
        if cj(a) not in (dn if k == "n" else de):
            raise IgrError("INVALID_REPORT", "INCONSISTENT")
    if not M("K180"):
        if sorted(at + far) != sorted(dn) or len(set(at + far)) != len(at + far):
            raise IgrError("INVALID_REPORT", "INCONSISTENT")


def _path_join(base, key):
    return key if base == "" else base + "." + key


def _diff(a, b, path, out):
    """a, b parsed values; _ABSENT sentinel"""
    if a == b:
        return
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=lambda s: s.encode("utf-8")):
            _diff(a.get(k, _ABSENT), b.get(k, _ABSENT), _path_join(path, k), out)
        return
    if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            _diff(x, y, path + "[%d]" % i, out)
        return
    out.append(path)


class _Absent:
    def __eq__(self, o):
        return isinstance(o, _Absent)

    def __hash__(self):
        return 1


_ABSENT = _Absent()


def compare_readouts(entries):
    for e in entries:
        validate_readout(e["readout"])
    first = entries[0]["readout"]
    if not M("K141"):
        for e in entries:
            if e["readout"]["scene_sha256"] != first["scene_sha256"] or e["readout"]["layout_sha256"] != first["layout_sha256"]:
                return {"comparable": False}
    # collect paths
    paths = set()
    for i in range(len(entries)):
        for j in range(i + 1, len(entries)):
            out = []
            _diff(entries[i]["readout"], entries[j]["readout"], "", out)
            paths.update(out)

    def get(v, path):
        cur = v
        for tok in re.findall(r"[^.\[\]]+|\[\d+\]", path):
            if tok.startswith("["):
                i = int(tok[1:-1])
                if not isinstance(cur, list) or i >= len(cur):
                    return _ABSENT
                cur = cur[i]
            else:
                if not isinstance(cur, dict) or tok not in cur:
                    return _ABSENT
                cur = cur[tok]
        return cur
    diffs = []
    for p in sorted(paths, key=lambda s: s.encode("utf-8")):
        vals = [get(e["readout"], p) for e in entries]
        groups = []
        for idx, v in enumerate(vals):
            for g in groups:
                if g[0] == v:
                    g[1].append(idx)
                    break
            else:
                groups.append([v, [idx]])
        best = max(len(g[1]) for g in groups)
        cand = [g for g in groups if len(g[1]) == best]
        ref = min(cand, key=lambda g: g[1][0])
        if M("K140"):
            ref = groups[-1] if len(groups) > 1 else ref
        names = sorted(entries[i]["renderer"] for i, v in enumerate(vals) if v != ref[0])
        if names:
            diffs.append({"path": p, "renderers": names})
    return {"agree": not diffs, "differences": diffs}
