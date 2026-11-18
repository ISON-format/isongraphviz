"""The Canvas 2D replay and its recorded stream igr-cv/1 (design 31 sections 6.2, 6.3) and the stream readout (9.3).

Needed here for the gl: rows that compare the Canvas layer-8 stream with the WebGL text calls (U13), for the
three-way readout row (X05) and for the Appendix A.4 gate.  The replay is re-implemented from the written rules.
"""
import json

import dlist
import ju
import mut
import scn
from plan import IGR, XR

PALETTE = [(42, 120, 214), (235, 104, 52), (27, 175, 122), (237, 161, 0), (232, 123, 164), (0, 131, 0), (74, 58, 167), (227, 73, 72), (122, 121, 117)]
FONT = "12px sans-serif"
TAU = "TAU"


def rgb(c):
    return "rgb(%d,%d,%d)" % tuple(c)


def validate_replay_options(dpr=1000, ink=(34, 34, 34), layers=None):
    if isinstance(dpr, bool) or not isinstance(dpr, int):
        raise scn.Err("INVALID_INPUT", "INVALID_VALUE" if isinstance(dpr, float) and dpr == dpr and dpr not in (float("inf"), float("-inf")) else "NOT_FINITE" if isinstance(dpr, float) else "SCHEMA")
    if not (250 <= dpr <= 8000):
        raise scn.Err("INVALID_INPUT", "OUT_OF_RANGE")
    return dpr


class Recorder:
    def __init__(self):
        self.lines = []
        self.cache = {}

    def m(self, name, *args):
        self.lines.append(["m", name] + list(args))

    def assign(self, prop, tok, key=None):
        k = tok if not isinstance(tok, list) else tuple(tok)
        if self.cache.get(prop, object()) != k:
            self.cache[prop] = k
            if prop == "lineDash":
                self.lines.append(["m", "setLineDash", tok])
            else:
                self.lines.append(["s", prop, tok])

    def marker(self, pid, layer):
        self.lines.append(["#", pid, layer])

    def bytes(self):
        return b"".join(ju.line(l) for l in self.lines)


def record_stream(source, dpr=1000, ink=(34, 34, 34), layers=(1, 2, 3, 4, 5, 6, 7, 8)):
    """source: object with .width .height .records (E A N T records)"""
    r = Recorder()
    W, H = source.width, source.height
    r.m("setTransform", dpr, 0, 0, dpr, 0, 0)
    r.m("clearRect", 0, 0, W * 1000, H * 1000)
    inkc = rgb(ink)
    E = [x for x in source.records if x[0] == "E"]
    A = [x for x in source.records if x[0] == "A"]
    N = [x for x in source.records if x[0] == "N"]
    T = [x for x in source.records if x[0] == "T"]

    def route(x):
        form = x[3]
        p = x[4:]
        r.m("moveTo", p[0], p[1])
        if form == 0:
            r.m("lineTo", p[2], p[3])
        elif form == 1:
            r.m("quadraticCurveTo", p[2], p[3], p[4], p[5])
        else:
            r.m("bezierCurveTo", p[2], p[3], p[4], p[5], p[6], p[7])

    for L in layers:
        if L in (1, 2, 3):
            for x in E:
                if L == 1 and not (x[2] & 1):
                    continue
                if L == 2 and not (x[2] & 2):
                    continue
                r.marker(x[1], L)
                r.assign("strokeStyle", inkc)
                r.assign("lineWidth", {1: 6000, 2: 10000, 3: 2000}[L])
                r.assign("globalAlpha", {1: 350, 2: 250, 3: 600}[L])
                r.assign("lineDash", [6000, 4000] if L == 2 else [])
                r.m("beginPath")
                route(x)
                r.m("stroke")
        elif L == 4:
            for x in A:
                r.marker(x[1], 4)
                r.assign("fillStyle", inkc)
                r.assign("globalAlpha", 600)
                r.m("beginPath")
                r.m("moveTo", x[2], x[3])
                r.m("lineTo", x[4], x[5])
                r.m("lineTo", x[6], x[7])
                r.m("closePath")
                r.m("fill")
        elif L in (5, 6):
            for x in N:
                if not (x[3] & (1 if L == 5 else 2)):
                    continue
                r.marker(x[1], L)
                r.assign("strokeStyle", inkc)
                r.assign("lineWidth", 3000 if L == 5 else 2000)
                r.assign("globalAlpha", 1000)
                r.assign("lineDash", [] if L == 5 else [4000, 3000])
                r.m("beginPath")
                r.m("arc", x[4], x[5], 14000 if L == 5 else 18000, 0, TAU)
                r.m("stroke")
        elif L == 7:
            for x in N:
                r.marker(x[1], 7)
                r.assign("fillStyle", rgb(PALETTE[x[2]]))
                r.assign("globalAlpha", 1000)
                r.m("beginPath")
                r.m("arc", x[4], x[5], 10000, 0, TAU)
                r.m("fill")
                r.assign("strokeStyle", "rgb(255,255,255)")
                r.assign("lineWidth", 2000)
                r.assign("globalAlpha", 1000)
                r.assign("lineDash", [])
                r.m("stroke")
        elif L == 8:
            first = True
            for x in T:
                if first:
                    r.assign("fillStyle", inkc)
                    r.assign("globalAlpha", 1000)
                    if not (mut.on("K111") and isinstance(source, TextSource)):
                        r.assign("font", FONT)
                    r.assign("textAlign", "center")
                    r.assign("textBaseline", "alphabetic")
                    r.assign("direction", "ltr")
                    first = False
                r.marker(x[1], 8)
                r.m("fillText", x[5], x[3], x[4])
    return r.bytes()


class TextSource:
    """ReplaySource of a plan: {width, height, records: the T lines}"""

    def __init__(self, plan):
        self.width = plan.hdr["w"]
        self.height = plan.hdr["h"]
        self.records = [list(t) for t in plan.texts]


def readout_from_calls(stream, d):
    """9.3: reads the recorded stream (addresses by pid through the list's table)"""
    lines = [json.loads(l) for l in stream.decode("utf-8").split("\n") if l]
    sections = []
    cur = None
    for l in lines:
        if l[0] == "#":
            cur = {"pid": l[1], "layer": l[2], "calls": []}
            sections.append(cur)
        elif cur is not None:
            cur["calls"].append(l)
    nodes, edges = d.nodes, d.edges
    nd = len(nodes)
    drawn_n, drawn_e, sel_n, sel_e, foc_n, foc_e, arrows = [], [], [], [], [], [], []
    centre = {}
    labels = {}
    for s in sections:
        L, pid, calls = s["layer"], s["pid"], s["calls"]
        names = [c[1] for c in calls if c[0] == "m"]
        if L == 7 and "fill" in names and "stroke" in names:
            drawn_n.append(pid)
            for c in calls:
                if c[0] == "m" and c[1] == "arc":
                    centre[pid] = (c[2], c[3])
        elif L == 3 and "stroke" in names:
            drawn_e.append(pid)
        elif L == 4 and "fill" in names:
            arrows.append(pid)
        elif L == 1 and "stroke" in names:
            sel_e.append(pid)
        elif L == 2 and "stroke" in names:
            foc_e.append(pid)
        elif L == 5 and "stroke" in names:
            sel_n.append(pid)
        elif L == 6 and "stroke" in names:
            foc_n.append(pid)
        elif L == 8:
            for c in calls:
                if c[0] == "m" and c[1] == "fillText":
                    labels[pid] = c[2]
    W, H = d.width, d.height
    G = 256000
    at, far = [], []
    for pid in sorted(drawn_n):
        x, y = centre[pid]
        ref = nodes[pid - 1]
        if -G <= x <= 1000 * W + G and -G <= y <= 1000 * H + G:
            at.append({"address": ref, "x": x, "y": y})
        else:
            far.append(ref)
    ln, le, units = [], [], 0
    for pid in sorted(labels):
        units += ju.u16len(labels[pid])
        if pid <= nd:
            ln.append({"address": nodes[pid - 1], "text": labels[pid]})
    for pid in sorted(labels):
        if pid > nd:
            le.append({"address": edges[pid - nd - 1], "text": labels[pid]})
    marked = {"selected": {"edges": [edges[p - nd - 1] for p in sorted(sel_e)], "nodes": [nodes[p - 1] for p in sorted(sel_n)]}}
    if foc_n:
        marked["focus"] = {"node": nodes[sorted(foc_n)[0] - 1]}
    if foc_e:
        marked["focus"] = {"edge": edges[sorted(foc_e)[0] - nd - 1]}
    return {"igr": IGR, "xr": XR, "scene_sha256": d.scene, "layout_sha256": d.layout,
            "drawn": {"edges": [edges[p - nd - 1] for p in sorted(drawn_e)], "nodes": [nodes[p - 1] for p in sorted(drawn_n)]},
            "marked": marked, "nodes_at": at, "nodes_far": far, "arrows": [edges[p - nd - 1] for p in sorted(arrows)],
            "labels": {"edges": le, "nodes": ln}, "label_units": units}


def backing_size(width, height, dpr):
    """6.4 (shared by the adapters); validated"""
    for v in (width, height):
        if isinstance(v, bool) or not isinstance(v, int):
            raise scn.Err("INVALID_INPUT", "SCHEMA")
    if not (1 <= width <= 16384 and 1 <= height <= 16384):
        raise scn.Err("INVALID_INPUT", "OUT_OF_RANGE")
    if isinstance(dpr, bool) or not isinstance(dpr, int):
        raise scn.Err("INVALID_INPUT", "SCHEMA")
    if not (250 <= dpr <= 8000):
        raise scn.Err("INVALID_INPUT", "OUT_OF_RANGE")
    e = min(dpr, ju.floor_div(16384 * 1000, max(width, height)), ju.isqrt(ju.floor_div((1 << 26) * 10 ** 6, width * height)))
    return {"bh": ju.div_round(height * e, 1000), "bw": ju.div_round(width * e, 1000), "e": e}
