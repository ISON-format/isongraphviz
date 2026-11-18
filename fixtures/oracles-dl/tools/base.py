"""Row registry and shared runners of the oracles-dl generator."""
import json
import math
import os

import core
from core import IgrError, cj, cjb
import dl as D
import view as V
import scenes

CORPUS_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BASE = {}            # path -> bytes, outputs of the baseline (unmutated) run; inputs of later rows
ROWS = []            # Row objects in registration order
ROW_BY_ID = {}
_MODELS = {}


class Out:
    def __init__(self, files=None, error="", extra=None, inp=None):
        self.files = files or {}
        self.error = error
        self.extra = extra
        self.inp = inp          # replacement of the row's input (rows whose input embeds results)

    def key(self):
        return (tuple(sorted((k, v) for k, v in self.files.items())), self.error,
                json.dumps(self.extra, sort_keys=True, default=repr) if self.extra is not None else None,
                json.dumps(self.inp, sort_keys=True) if self.inp is not None else None)


class Row:
    def __init__(self, id, tier, scene, layout, inp, expected, fn, killers=()):
        self.id = id
        self.group = id[0]
        self.tier = tier
        self.scene = scene
        self.layout = layout
        self.inp = inp
        self.expected = expected
        self.fn = fn


def reg(id, tier, scene="", layout="", inp="", expected="", fn=None):
    r = Row(id, tier, scene, layout, inp, expected, fn)
    ROWS.append(r)
    ROW_BY_ID[id] = r
    return r


def fs(path):
    if path in BASE:
        return BASE[path]
    if path in scenes.CORPUS:
        return scenes.CORPUS[path]
    with open(os.path.join(CORPUS_DIR, path), "rb") as f:
        return f.read()


def fs_json(path):
    return json.loads(fs(path).decode("utf-8"))


def model_of(scene, layout):
    k = (scene, layout)
    if k not in _MODELS:
        _MODELS[k] = core.build_model(fs(scene), fs(layout))
    return _MODELS[k]


def state_of(model, spec, size):
    if spec == "initial":
        return core.initial_state(model, size["width"], size["height"])
    return fs_json(spec)


TOKENS = {"NaN": float("nan"), "Infinity": float("inf"), "-Infinity": float("-inf")}


def conv(v):
    if isinstance(v, str) and v in TOKENS:
        return TOKENS[v]
    if isinstance(v, list):
        return [conv(x) for x in v]
    if isinstance(v, dict):
        return {k: conv(x) for k, x in v.items()}
    return v


def wire_node(model, nid):
    for n in model["nodes"]:
        if n["ref"]["id"] == nid:
            return n["ref"]
    raise KeyError(nid)


def wire_edge(model, src, rel, tgt):
    for e in model["edges"]:
        r = e["ref"]
        if r["src"]["id"] == src and r["rel"] == rel and r["tgt"]["id"] == tgt:
            return r
    raise KeyError((src, rel, tgt))


def jtxt(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def run_row(row):
    """Execute one row under the current mutant set; never raises."""
    try:
        out = row.fn()
        return out if isinstance(out, Out) else Out(files=out)
    except IgrError as e:
        return Out(error=e.tag())
    except D.ReadError as e:
        return Out(error=e.tag())
    except ZeroDivisionError as e:
        return Out(error="CRASH:ZeroDivisionError")
    except (ValueError, KeyError, TypeError, AssertionError, IndexError, AttributeError) as e:
        return Out(error="CRASH:" + type(e).__name__)


def addr_json(a):
    return a


def dl_row_fn(scene, layout, inp, expected):
    def fn():
        mdl = model_of(scene, layout)
        size = inp["size"]
        st = state_of(mdl, inp["state"], size)
        model_arg = {"plain": True} if inp.get("plain_object_model") else mdl
        opts = conv(inp.get("options")) if "options" in inp else None
        d = D.build_dl(model_arg, st, opts)
        lim = inp.get("limits", {})
        try:
            b = D.serialize_dl(d, lim.get("maxBytes", D.DEFAULT_MAX_DL_BYTES))
        except IgrError as e:
            return Out(error=e.tag(), extra=D.last_partial[0].hex() if D.last_partial[0] is not None else None)
        files = {expected: b}
        for alt in inp.get("also", []):
            st2 = state_of(mdl, alt["state"], size)
            d2 = D.build_dl(mdl, st2, opts)
            files[alt["expected"]] = D.serialize_dl(d2)
        return Out(files=files)
    return fn
