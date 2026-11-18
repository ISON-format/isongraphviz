"""Corpus infrastructure: scene registry, auxiliary files, row objects, event helpers."""
import os

from base import *  # noqa
import base

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # fixtures/oracles-ia
FIX = os.path.dirname(ROOT)           # fixtures

AUX = {}      # path -> bytes (every non-row-specific file)
ROWS = {}     # id -> Row


def aux(path, data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    if path in AUX and AUX[path] != data:
        raise AssertionError("conflicting aux file " + path)
    AUX[path] = data
    return path


class Row:
    def __init__(self, id_, scene="", layout="", input_="", expected="", error="", ev=None, tier=None, extra=None):
        self.id = id_
        self.group = id_[0]
        self.tier = tier if tier is not None else ("diff" if self.group == "D" else ("" if self.group == "K" else "core"))
        self.scene = scene
        self.layout = layout
        self.input = input_
        self.expected = expected
        self.error = error
        self.ev = ev            # callable -> (dict path->bytes, error str)
        self.extra = extra or {}  # files authored for this row (inputs)

    def evaluate(self):
        if self.ev is None:
            return {}, ""
        return self.ev()


def add_row(row):
    assert row.id not in ROWS, row.id
    ROWS[row.id] = row
    return row


# ---------------------------------------------------------------- scenes
class Sc:
    pass


SC = {}


def reg_scene(name, scene_bytes, layout_bytes, layout_name=None):
    s = Sc()
    s.name = name
    s.scene = scene_bytes
    s.layout = layout_bytes
    s.model = build_model(scene_bytes, layout_bytes)
    s.scene_path = aux("scenes/%s.scene.json" % name, scene_bytes)
    s.layout_path = aux("layouts/%s.layout.json" % (layout_name or name), layout_bytes)
    SC[name] = s
    return s


def mk(name, ids, edges, pos, directed=True, typ="p"):
    """ids: list of label strings (without tag); edges: (src,tgt) label pairs; pos: dict label->(x,y)"""
    nodes = [(typ, "s:" + i) for i in ids]
    es = [(typ, "s:" + a, "R", typ, "s:" + b) for a, b in edges]
    sb = make_scene(nodes, es, directed)
    lb = make_layout(sb, {(typ, "s:" + i): pos[i] for i in ids})
    return reg_scene(name, sb, lb)


def read_frozen(rel):
    with open(os.path.join(FIX, rel), "rb") as f:
        return f.read()


def init_scenes():
    SC.clear()
    # O1 and its layout: bytes of igs:O1 and igl:F01
    sb = read_frozen("oracles/o1-basic.scene.json")
    lb = read_frozen("oracles-igl/layouts/F01.layout.json")
    assert sha(sb) == "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc"
    assert sha(lb) == "2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db"
    reg_scene("O1", sb, lb)
    alt = make_layout(sb, {("person", "i:1"): (100000, 100000), ("person", "s:ann"): (500000, 300000)})
    aux("layouts/O1.alt.layout.json", alt)
    # G9: 3x3 grid
    ids = list("abcdefghi")
    pos = {c: (100000 * (i % 3), 100000 * (i // 3)) for i, c in enumerate(ids)}
    mk("G9", ids, [("a", "b"), ("a", "d"), ("b", "c"), ("b", "e"), ("d", "g"), ("e", "e"), ("e", "h"), ("f", "i"), ("h", "i")], pos)
    mk("T4", list("opqrv"), [], {"o": (0, 0), "p": (100000, 300000), "q": (200000, -250000), "r": (-50000, 0), "v": (100000, -300000)})
    mk("T5", list("abc"), [], {"a": (0, 0), "b": (300000, 300000), "c": (100000, 200000)})
    mk("S1", list("abc"), [], {"a": (0, 0), "b": (10000, 10000), "c": (12000, 0)})
    mk("S2", list("abc"), [], {"a": (0, 0), "b": (5000, 5000), "c": (7000, 1000)})
    mk("S3", list("abc"), [], {"a": (0, 0), "b": (7000, 7000), "c": (10000, 0)})
    w = ["n%03d" % i for i in range(520)]
    mk("W520", w, [], {c: (10000 * i, 0) for i, c in enumerate(w)})
    mk("H1", ["x" * 498], [], {"x" * 498: (0, 0)})
    mk("H2", ["x" * 398], [], {"x" * 398: (0, 0)})
    mk("PROTO", ["__proto__", "constructor", "toString"], [("__proto__", "constructor")],
       {"__proto__": (0, 0), "constructor": (100000, 0), "toString": (200000, 0)})
    h = ["", '"q"', "<b>x</b>", "a&b", "a b", "‮abc"]
    mk("HOST", h, [], {c: (100000 * i, 0) for i, c in enumerate(h)})
    sb = make_scene([], [], True)
    reg_scene("EMPTY", sb, make_layout(sb, {}))


# ---------------------------------------------------------------- G9 element names
def g9():
    return SC["G9"].model


def nd(m, name):
    for n in m.nodes:
        if n["ref"]["id"] == "s:" + name:
            return ("n", n["index"])
    raise KeyError(name)


def ed(m, i):
    return ("e", i)


# ---------------------------------------------------------------- state files
def state_file(scname, name, **kw):
    s = SC[scname]
    st = mk_state(s.model, **kw)
    return aux("states/%s.state.json" % name, state_bytes(st)), st


# ---------------------------------------------------------------- event helpers
def addr_n(m, name):
    return {"node": wire(m, nd(m, name))}


def pdown(t, x, y, id_=0, target=None, mods=0, ptype="mouse", button=0):
    e = {"button": button, "id": id_, "mods": mods, "ptype": ptype, "t": t, "type": "pointerdown", "x": x, "y": y}
    if target is not None:
        e["target"] = target
    return e


def pmove(t, x, y, id_=0, mods=0):
    return {"id": id_, "mods": mods, "t": t, "type": "pointermove", "x": x, "y": y}


def pup(t, x, y, id_=0, mods=0):
    return {"id": id_, "mods": mods, "t": t, "type": "pointerup", "x": x, "y": y}


def pcancel(t, id_=0):
    return {"id": id_, "t": t, "type": "pointercancel"}


def wheel(t, dy, x=450000, y=300000, unit=0, mods=0):
    return {"dy": dy, "mods": mods, "t": t, "type": "wheel", "unit": unit, "x": x, "y": y}


def key(t, k, mods=0):
    return {"key": k, "mods": mods, "t": t, "type": "key"}


def tick(t):
    return {"t": t, "type": "tick"}


def ctxmenu(t, x, y, target=None, mods=0):
    e = {"mods": mods, "t": t, "type": "contextmenu", "x": x, "y": y}
    if target is not None:
        e["target"] = target
    return e


def dbl(t, x, y, target=None, mods=0):
    e = {"mods": mods, "t": t, "type": "dblclick", "x": x, "y": y}
    if target is not None:
        e["target"] = target
    return e
