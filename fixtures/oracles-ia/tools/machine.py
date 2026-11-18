"""Input layer of the V11 oracle: events, key tokens, bindings, machine, navigation, lasso, reveal."""
import copy
import math
import re

from base import *  # noqa
import base

# ---------------------------------------------------------------- constants (3.3)
DRAG = 4000
LONG_MS = 500
NOTCH = 100000
MAX_NOTCHES = 8
ZIN, ZOUT = 1250, 800
PAN_STEP = 32
COORD_MAX = 2 ** 39
REVEAL_MARGIN = 24

NAMED = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter", "Escape",
         "Tab", "ContextMenu", "F10", "Backspace", "Delete"]
PUNCT = "+-=[],./;"
LEGACY = {"Esc": "Escape", "Left": "ArrowLeft", "Right": "ArrowRight", "Up": "ArrowUp", "Down": "ArrowDown",
          "Apps": "ContextMenu", "Spacebar": "Space", " ": "Space"}


def is_key_token(s):
    if not isinstance(s, str):
        return False
    if M("K78"):
        return True
    if s in NAMED or s == "Space":
        return True
    if len(s) == 1 and (("a" <= s <= "z") or ("0" <= s <= "9") or s in PUNCT):
        return True
    return False


def key_token(k):
    if k in NAMED or k == "Space":
        return k
    if k in LEGACY:
        return LEGACY[k]
    if len(k) == 1:
        if "A" <= k <= "Z":
            return k if M("K75") else k.lower()
        if ("a" <= k <= "z") or ("0" <= k <= "9") or k in PUNCT:
            return k
    return None


def shift_ignored(tok):
    return len(tok) == 1 and (("0" <= tok <= "9") or tok in PUNCT)


# ---------------------------------------------------------------- default bindings (6.3)
def _b(mode, key, mods, action):
    return {"action": action, "key": key, "mode": mode, "mods": mods}


def default_bindings():
    t = []
    dirs = [("ArrowRight", "right"), ("ArrowLeft", "left"), ("ArrowUp", "up"), ("ArrowDown", "down")]
    for k, d in dirs:
        t.append(_b("normal", k, 0, {"type": "spatial", "dir": d, "extend": False}))
    for k, d in dirs:
        t.append(_b("normal", k, 1, {"type": "spatial", "dir": d, "extend": True}))
    pans = {"ArrowRight": (-32, 0), "ArrowLeft": (32, 0), "ArrowUp": (0, 32), "ArrowDown": (0, -32)}
    for k, _ in dirs:
        dx, dy = pans[k]
        t.append(_b("normal", k, 2, {"type": "pan", "dx": dx, "dy": dy}))
    t.append(_b("normal", "Home", 0, {"type": "first"}))
    t.append(_b("normal", "End", 0, {"type": "last"}))
    t.append(_b("normal", "PageDown", 0, {"type": "step", "delta": 1}))
    t.append(_b("normal", "PageUp", 0, {"type": "step", "delta": -1}))
    t.append(_b("normal", "Space", 0, {"type": "toggle-focus"}))
    t.append(_b("normal", "Enter", 0, {"type": "activate"}))
    t.append(_b("normal", "Escape", 0, {"type": "clear-selection"}))
    t.append(_b("normal", "ContextMenu", 0, {"type": "context"}))
    t.append(_b("normal", "F10", 1, {"type": "context"}))
    t.append(_b("normal", "e", 0, {"type": "incident", "delta": 1}))
    t.append(_b("normal", "e", 1, {"type": "incident", "delta": -1}))
    t.append(_b("normal", "s", 0, {"type": "endpoint", "end": "src"}))
    t.append(_b("normal", "t", 0, {"type": "endpoint", "end": "tgt"}))
    t.append(_b("normal", "+", 0, {"type": "zoom", "factor": 1250}))
    t.append(_b("normal", "=", 0, {"type": "zoom", "factor": 1250}))
    t.append(_b("normal", "-", 0, {"type": "zoom", "factor": 800}))
    t.append(_b("normal", "0", 0, {"type": "fit"}))
    t.append(_b("normal", "a", 2, {"type": "select-all"}))
    t.append(_b("normal", "m", 0, {"type": "marquee-start"}))
    t.append(_b("marquee", "Enter", 0, {"type": "marquee-commit"}))
    t.append(_b("marquee", "Escape", 0, {"type": "marquee-cancel"}))
    return t


DEFAULT_BINDINGS = default_bindings()

ACTION_FIELDS = {
    "spatial": ["dir", "extend"], "step": ["delta"], "first": [], "last": [], "incident": ["delta"],
    "endpoint": ["end"], "toggle-focus": [], "activate": [], "clear-selection": [], "context": [],
    "pan": ["dx", "dy"], "zoom": ["factor"], "fit": [], "select-all": [], "marquee-start": [],
    "marquee-commit": [], "marquee-cancel": []}

MODE_RE = re.compile(r"^x-[a-z0-9][a-z0-9._-]*$")


def _isint(v):
    return isinstance(v, int) and not isinstance(v, bool)


def verify_bindings(table):
    if not isinstance(table, list):
        raise IaErr("INVALID_BINDINGS", "SCHEMA")
    for r in table:
        if not isinstance(r, dict) or set(r.keys()) != {"action", "key", "mode", "mods"}:
            raise IaErr("INVALID_BINDINGS", "SCHEMA")
    seen = set()
    modes = []
    for r in table:
        mode = r["mode"]
        if not (isinstance(mode, str) and (mode in ("normal", "marquee") or MODE_RE.match(mode))):
            raise IaErr("INVALID_BINDINGS", "INVALID_VALUE")
        mods = r["mods"]
        if not (_isint(mods) and 0 <= mods <= 15):
            raise IaErr("INVALID_BINDINGS", "INVALID_VALUE")
        key = r["key"]
        if not is_key_token(key):
            raise IaErr("INVALID_BINDINGS", "UNKNOWN_KEY")
        a = r["action"]
        if not isinstance(a, dict) or not isinstance(a.get("type"), str) or a["type"] not in ACTION_FIELDS:
            raise IaErr("INVALID_BINDINGS", "UNKNOWN_ACTION")
        flds = ACTION_FIELDS[a["type"]]
        if set(a.keys()) != set(flds) | {"type"}:
            raise IaErr("INVALID_BINDINGS", "INVALID_VALUE")
        t = a["type"]
        ok = True
        if t == "spatial":
            ok = a["dir"] in ("left", "right", "up", "down") and isinstance(a["extend"], bool)
        elif t in ("step", "incident"):
            ok = _isint(a["delta"]) and a["delta"] in (1, -1)
        elif t == "endpoint":
            ok = a["end"] in ("src", "tgt")
        elif t == "pan":
            ok = _isint(a["dx"]) and _isint(a["dy"])
        elif t == "zoom":
            ok = _isint(a["factor"])
        if not ok:
            raise IaErr("INVALID_BINDINGS", "INVALID_VALUE")
        if key == "Tab":
            if not (M("K81") and mode != "normal"):
                raise IaErr("INVALID_BINDINGS", "TAB_BOUND")
        km = mods
        if shift_ignored(key) and not M("K80"):
            km = mods & ~1
        ident = (mode, key, km)
        if ident in seen:
            raise IaErr("INVALID_BINDINGS", "DUPLICATE_BINDING")
        seen.add(ident)
        if mode not in modes:
            modes.append(mode)
    for mode in modes:
        if mode != "normal" and not any(r["mode"] == mode and r["key"] == "Escape" and r["mods"] == 0 for r in table):
            raise IaErr("INVALID_BINDINGS", "NO_ESCAPE_EXIT")
    return table


# ---------------------------------------------------------------- event validation (4.2)
EVFIELDS = {
    "pointerdown": ["t", "id", "ptype", "button", "x", "y", "mods", "target"],
    "pointermove": ["t", "id", "x", "y", "mods"],
    "pointerup": ["t", "id", "x", "y", "mods"],
    "pointercancel": ["t", "id"],
    "wheel": ["t", "x", "y", "dy", "unit", "mods"],
    "key": ["t", "key", "mods"],
    "tick": ["t"],
    "contextmenu": ["t", "x", "y", "mods", "target"],
    "dblclick": ["t", "x", "y", "mods", "target"],
}
DOM = {"t": (0, 2 ** 52), "id": (0, 2 ** 31 - 1), "x": (-2 ** 39, 2 ** 39), "y": (-2 ** 39, 2 ** 39),
       "dy": (-2 ** 40, 2 ** 40), "mods": (0, 15), "button": None, "unit": None}


def decode_tokens(v):
    if v == "NaN":
        return float("nan")
    if v == "Infinity":
        return float("inf")
    if v == "-Infinity":
        return float("-inf")
    return v


def chk_num(v, dom, errc, enum=None):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise IaErr(errc, "SCHEMA")
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            raise IaErr(errc, "NOT_FINITE")
        if v != math.floor(v):
            if M("K76"):
                v = int(math.floor(v + 0.5))
            else:
                raise IaErr(errc, "NOT_INTEGER")
        else:
            v = int(v)
    if dom is not None and not (dom[0] <= v <= dom[1]):
        raise IaErr(errc, "OUT_OF_RANGE")
    if enum is not None and v not in enum:
        raise IaErr(errc, "INVALID_VALUE")
    return v


def validate_event(ev, last_t=-1, tokens=True):
    E = "INVALID_EVENT"
    if not isinstance(ev, dict):
        raise IaErr(E, "SCHEMA")
    if "type" not in ev:
        raise IaErr(E, "SCHEMA")
    ty = ev["type"]
    if not isinstance(ty, str) or ty not in EVFIELDS:
        raise IaErr(E, "UNKNOWN_TYPE")
    flds = EVFIELDS[ty]
    keys = set(ev.keys()) - {"type"}
    allowed = set(flds)
    req = set(f for f in flds if f != "target")
    if not M("K79"):
        if not keys <= allowed:
            raise IaErr(E, "SCHEMA")
    else:
        keys = keys & allowed
    if not req <= keys:
        raise IaErr(E, "SCHEMA")
    out = {"type": ty}
    for f in flds:
        if f not in ev:
            continue
        v = ev[f]
        if f in DOM and DOM[f] is not None or f in ("button", "unit"):
            if tokens:
                v = decode_tokens(v)
            if f == "button":
                v = chk_num(v, None, E, (0, 1, 2))
            elif f == "unit":
                v = chk_num(v, None, E, (0, 1, 2))
            else:
                v = chk_num(v, DOM[f], E)
        elif f == "ptype":
            if not isinstance(v, str):
                raise IaErr(E, "SCHEMA")
            if v not in ("mouse", "touch", "pen"):
                raise IaErr(E, "INVALID_VALUE")
        elif f == "key":
            if not isinstance(v, str):
                raise IaErr(E, "SCHEMA")
            if not is_key_token(v):
                raise IaErr(E, "UNKNOWN_KEY")
        elif f == "target":
            if not (isinstance(v, dict) and len(v) == 1 and list(v.keys())[0] in ("node", "edge")
                    and isinstance(list(v.values())[0], dict)):
                raise IaErr(E, "SCHEMA")
        out[f] = v
    if out["t"] < last_t and not M("K77"):
        raise IaErr(E, "NON_MONOTONIC_TIME")
    return out


def validate_config(cfg):
    C = "INVALID_CONFIG"
    if not isinstance(cfg, dict):
        raise IaErr(C, "SCHEMA")
    if not set(cfg.keys()) <= {"bindings", "wrap", "maxTargets", "reveal"}:
        raise IaErr(C, "SCHEMA")
    out = {"bindings": DEFAULT_BINDINGS, "wrap": False, "maxTargets": 60000, "reveal": True}
    if "bindings" in cfg:
        out["bindings"] = verify_bindings(cfg["bindings"])
    if "wrap" in cfg:
        if not isinstance(cfg["wrap"], bool):
            raise IaErr(C, "SCHEMA")
        out["wrap"] = cfg["wrap"]
    if "maxTargets" in cfg:
        out["maxTargets"] = chk_num(cfg["maxTargets"], (0, 2 ** 31), C)
    if "reveal" in cfg:
        if not isinstance(cfg["reveal"], bool):
            raise IaErr(C, "SCHEMA")
        out["reveal"] = cfg["reveal"]
    return out


def validate_command(cmd):
    C = "INVALID_COMMAND"
    if not isinstance(cmd, dict) or not isinstance(cmd.get("type"), str):
        raise IaErr(C, "SCHEMA")
    t = cmd["type"]
    spec = {"nav-spatial": ({"dir"}, {"extend"}), "nav-incident": ({"delta"}, set()),
            "nav-endpoint": ({"end"}, set()), "nav-step": ({"delta"}, set())}
    if t not in spec:
        raise IaErr(C, "UNKNOWN_TYPE")
    req, opt = spec[t]
    keys = set(cmd.keys()) - {"type"}
    if not (req <= keys <= req | opt):
        raise IaErr(C, "SCHEMA")
    if "dir" in cmd and cmd["dir"] not in ("left", "right", "up", "down"):
        raise IaErr(C, "INVALID_VALUE")
    if "end" in cmd and cmd["end"] not in ("src", "tgt"):
        raise IaErr(C, "INVALID_VALUE")
    if "delta" in cmd and not (_isint(cmd["delta"]) and cmd["delta"] in (1, -1)):
        raise IaErr(C, "INVALID_VALUE")
    if "extend" in cmd and not isinstance(cmd["extend"], bool):
        raise IaErr(C, "SCHEMA")
    return cmd


def validate_rect(r):
    I = "INVALID_INPUT"
    if not isinstance(r, dict) or set(r.keys()) != {"x0", "y0", "x1", "y1"}:
        raise IaErr(I, "SCHEMA")
    out = {}
    for k in ("x0", "y0", "x1", "y1"):
        out[k] = chk_num(decode_tokens(r[k]), (-COORD_MAX, COORD_MAX), I)
    return out


# ---------------------------------------------------------------- machine state (5.1)
def create_machine():
    return {"gesture": "idle", "last_t": -1, "mode": "normal", "pointers": [], "rem_x": 0, "rem_y": 0, "wheel_acc": 0}


def serialize_machine(m):
    return cjb(m)


PTR_KEYS = {"button", "id", "lasso", "long", "mods0", "moved", "ptype", "t0", "x", "x0", "y", "y0"}


def parse_machine(b):
    S = "INVALID_MACHINE"
    if len(b) > 1048576:
        raise IaErr("RESOURCE_LIMIT", "BYTES_LIMIT")
    try:
        v = json.loads(b.decode('utf-8'))
    except Exception:
        raise IaErr(S, "SCHEMA")
    if cjb_safe(v) != b:
        raise IaErr(S, "SCHEMA")
    if not isinstance(v, dict):
        raise IaErr(S, "SCHEMA")
    need = {"gesture", "last_t", "mode", "pointers", "rem_x", "rem_y", "wheel_acc"}
    opt = {"anchor", "pinch"}
    ks = set(v.keys())
    if not (need <= ks <= need | opt):
        raise IaErr(S, "SCHEMA")
    g = v["gesture"]
    if g not in ("idle", "press", "pan", "lasso", "pinch") or v["mode"] not in ("normal", "marquee"):
        raise IaErr(S, "SCHEMA")
    if not (_isint(v["last_t"]) and -1 <= v["last_t"] <= 2 ** 52):
        raise IaErr(S, "SCHEMA")
    ps = v["pointers"]
    if not isinstance(ps, list) or len(ps) > 2:
        raise IaErr(S, "SCHEMA")
    last = -1
    for p in ps:
        if not isinstance(p, dict) or not (PTR_KEYS <= set(p.keys()) <= PTR_KEYS | {"target"}):
            raise IaErr(S, "SCHEMA")
        if not _isint(p["id"]) or p["id"] <= last:
            raise IaErr(S, "SCHEMA")
        last = p["id"]
        for f in ("lasso", "long", "moved"):
            if not isinstance(p[f], bool):
                raise IaErr(S, "SCHEMA")
        if p["ptype"] not in ("mouse", "touch", "pen"):
            raise IaErr(S, "SCHEMA")
        if p["long"] and p["ptype"] != "touch":
            raise IaErr(S, "SCHEMA")
    for f in ("rem_x", "rem_y"):
        if not (_isint(v[f]) and -500 <= v[f] <= 499):
            raise IaErr(S, "SCHEMA")
    if not (_isint(v["wheel_acc"]) and abs(v["wheel_acc"]) < 100000):
        raise IaErr(S, "SCHEMA")
    if (len(ps) == 0) != (g == "idle"):
        raise IaErr(S, "SCHEMA")
    if g == "press" and not (len(ps) == 1 and not ps[0]["moved"] and not ps[0]["lasso"]):
        raise IaErr(S, "SCHEMA")
    if g == "pan" and not (len(ps) >= 1 and all(p["moved"] and not p["lasso"] for p in ps)):
        raise IaErr(S, "SCHEMA")
    if g == "lasso" and not (len(ps) == 1 and ps[0]["lasso"] and ps[0]["moved"]):
        raise IaErr(S, "SCHEMA")
    if g == "pinch" and not (len(ps) == 2 and all(p["moved"] and not p["lasso"] for p in ps)):
        raise IaErr(S, "SCHEMA")
    if ("pinch" in v) != (g == "pinch"):
        raise IaErr(S, "SCHEMA")
    if g not in ("pan", "pinch") and (v["rem_x"] != 0 or v["rem_y"] != 0):
        raise IaErr(S, "SCHEMA")
    if ("anchor" in v) != (v["mode"] == "marquee"):
        raise IaErr(S, "SCHEMA")
    return v


def cjb_safe(v):
    try:
        return cjb(v)
    except Exception:
        return b""


# ---------------------------------------------------------------- reveal (7.5)
def reveal_pan(m, st, el, margin_override=None):
    vp = st["viewport"]
    w, h = vp["width"], vp["height"]
    if M("K124"):
        mg = REVEAL_MARGIN
    else:
        mg = min(REVEAL_MARGIN, floor_div(min(w, h) - 1, 2))
    if M("K90"):
        mg = 0
    if el[0] == "e" and M("K123"):
        X, Y = screen_node(m, st, m.edges[el[1]]["src"])
    else:
        X, Y = screen_el(m, st, el)
    lo_x, hi_x = mg * 10 ** 6, (w - mg) * 10 ** 6
    lo_y, hi_y = mg * 10 ** 6, (h - mg) * 10 ** 6
    if lo_x <= X <= hi_x and lo_y <= Y <= hi_y:
        return None

    def comp(V, lo, hi, skip_low=False):
        if V < lo and not skip_low:
            return ceil_div(lo - V, 10 ** 6)
        if V > hi:
            return -ceil_div(V - hi, 10 ** 6)
        return 0
    dx = comp(X, lo_x, hi_x, M("K122"))
    dy = comp(Y, lo_y, hi_y, M("K122"))
    if abs(dx) > 2 ** 31 or abs(dy) > 2 ** 31:
        return None
    if M("K91"):
        dx, dy = -dx, -dy
    if dx == 0 and dy == 0:
        return None
    return {"type": "pan", "dx": dx, "dy": dy}


# ---------------------------------------------------------------- lasso (8)
def lasso_targets_micro(m, st, X0, Y0, X1, Y1):
    if not M("K28"):
        pass
    _, _, _, _, vn, ve = st_sets(m, st)
    nodes = list(range(len(m.nodes))) if M("K31") else vn
    inside = set()
    for i in nodes:
        X, Y = screen_node(m, st, i)
        if M("K29"):
            ok = X0 < X < X1 and Y0 < Y < Y1
        else:
            ok = X0 <= X <= X1 and Y0 <= Y <= Y1
        if ok:
            inside.add(i)
    res = [("n", i) for i in sorted(inside)]
    edges = list(range(len(m.edges))) if M("K31") else ve
    for ei in edges:
        e = m.edges[ei]
        if M("K30"):
            ok = e["src"] in inside or e["tgt"] in inside
        else:
            ok = e["src"] in inside and e["tgt"] in inside
        if ok:
            res.append(("e", ei))
    return res


def lasso_targets(m, st, rect, normalize=True):
    x0, x1 = (min(rect["x0"], rect["x1"]), max(rect["x0"], rect["x1"]))
    y0, y1 = (min(rect["y0"], rect["y1"]), max(rect["y0"], rect["y1"]))
    if not normalize:
        x0, x1, y0, y1 = rect["x0"], rect["x1"], rect["y0"], rect["y1"]
    return lasso_targets_micro(m, st, x0 * 1000, y0 * 1000, x1 * 1000, y1 * 1000)


# ---------------------------------------------------------------- navigation (7)
def _inc(m, st, ni):
    _, _, _, _, vn, ve = st_sets(m, st)
    lst = []
    pool = [e["index"] for e in m.edges] if M("K38") else ve
    for ei in pool:
        e = m.edges[ei]
        if e["src"] == ni or e["tgt"] == ni:
            lst.append(ei)
            if M("K39") and e["src"] == e["tgt"]:
                lst.append(ei)
    return lst


def _spatial_winner(m, st, foc, d):
    _, _, _, _, vn, ve = st_sets(m, st)
    if foc[0] == "n":
        ox, oy = m.nodes[foc[1]]["x"], m.nodes[foc[1]]["y"]
    else:
        e = m.edges[foc[1]]
        if M("K36"):
            ox, oy = m.nodes[e["src"]]["x"], m.nodes[e["src"]]["y"]
        else:
            a, b = m.nodes[e["src"]], m.nodes[e["tgt"]]
            ox, oy = div_round(a["x"] + b["x"], 2), div_round(a["y"] + b["y"], 2)
    if M("K35") and d in ("up", "down"):
        d = "down" if d == "up" else "up"
    t1, t2 = [], []
    for i in vn:
        if foc[0] == "n" and i == foc[1]:
            continue
        dx, dy = m.nodes[i]["x"] - ox, m.nodes[i]["y"] - oy
        if d == "right":
            p, s = dx, abs(dy)
        elif d == "left":
            p, s = -dx, abs(dy)
        elif d == "down":
            p, s = dy, abs(dx)
        else:
            p, s = -dy, abs(dx)
        if p <= 0:
            continue
        if M("K86"):
            key = (p * p + s * s, i)
        elif M("K87"):
            key = (p, s, i)
        elif M("K88"):
            key = (p + s, s, i)
        elif M("K89"):
            key = (p * p + s * s, -s, i)
        elif M("K33"):
            key = (p * p + s * s, s, -i)
        else:
            key = (p * p + s * s, s, i)
        tier1 = (s < p) if M("K34") else (s <= p)
        (t1 if tier1 else t2).append((key, i))
    if t1:
        return min(t1)[1]
    if t2 and not M("K32"):
        return min(t2)[1]
    return None


def resolve_navigation(m, st, cmd, wrap=False, reveal=True):
    """cmd already a compiled command dict {type:'nav-*',...}. returns outputs list."""
    _, _, _, foc, vn, ve = st_sets(m, st)
    tr = traversal(m, st)
    outs = []

    def I(i):
        outs.append({"kind": "intent", "intent": i})

    def N(e):
        outs.append({"kind": "nav", "event": e})
    t = cmd["type"]
    target = None  # element that a focus-class intent moves to (for reveal)

    def no_focus():
        nonlocal target
        fwd = True
        if t == "nav-spatial":
            fwd = cmd["dir"] in ("right", "down")
            if M("K42") and not fwd:
                fwd = True
        elif t in ("nav-incident", "nav-step"):
            fwd = cmd["delta"] == 1
            if M("K42") and not fwd:
                fwd = True
        if fwd:
            I({"type": "focus-first"})
            target = tr[0] if tr else None
        else:
            I({"type": "focus-last"})
            target = tr[-1] if tr else None

    if foc is None:
        no_focus()
    elif t == "nav-endpoint":
        if foc[0] != "e":
            N({"type": "nav-none", "reason": "NOT_AN_EDGE"})
        else:
            e = m.edges[foc[1]]
            ni = e["src"] if cmd["end"] == "src" else e["tgt"]
            target = ("n", ni)
            I({"type": "focus", "target": eaddr(m, target)})
    elif t == "nav-incident":
        delta = cmd["delta"]
        if foc[0] == "n":
            l = _inc(m, st, foc[1])
            if not l:
                N({"type": "nav-boundary", "nav": "incident", "delta": delta})
            else:
                pick = l[0] if delta == 1 else l[-1]
                if M("K37"):
                    pick = l[-1] if delta == 1 else l[0]
                target = ("e", pick)
                I({"type": "focus", "target": eaddr(m, target)})
        else:
            e = m.edges[foc[1]]
            l = _inc(m, st, e["src"])
            i = l.index(foc[1])
            if 0 <= i + delta < len(l):
                target = ("e", l[i + delta])
                I({"type": "focus", "target": eaddr(m, target)})
            elif wrap or M("K40"):
                pick = l[0] if delta == 1 else l[-1]
                target = ("e", pick)
                I({"type": "focus", "target": eaddr(m, target)})
                if not M("K41"):
                    N({"type": "nav-wrapped", "end": "end" if delta == 1 else "start"})
            else:
                N({"type": "nav-boundary", "nav": "incident", "delta": delta})
    elif t == "nav-step":
        delta = cmd["delta"]
        w = wrap and not M("K74")
        idx = tr.index(foc)
        if w and delta == 1 and idx == len(tr) - 1:
            I({"type": "focus-first"})
            N({"type": "nav-wrapped", "end": "end"})
            target = tr[0]
        elif w and delta == -1 and idx == 0:
            I({"type": "focus-last"})
            N({"type": "nav-wrapped", "end": "start"})
            target = tr[-1]
        else:
            I({"type": "focus-step", "delta": delta})
            j = idx + delta
            target = tr[j] if 0 <= j < len(tr) else None
            if M("K92"):
                target = None
    elif t == "nav-spatial":
        win = _spatial_winner(m, st, foc, cmd["dir"])
        if win is None:
            N({"type": "nav-boundary", "nav": "spatial", "dir": cmd["dir"]})
        else:
            target = ("n", win)
            if cmd.get("extend") and M("K43"):
                I({"type": "select", "mode": "add", "targets": [eaddr(m, target)]})
                I({"type": "focus", "target": eaddr(m, target)})
            else:
                I({"type": "focus", "target": eaddr(m, target)})
                if cmd.get("extend"):
                    I({"type": "select", "mode": "add", "targets": [eaddr(m, target)]})
    if (reveal or M("K93")) and target is not None and target != foc:
        p = reveal_pan(m, st, target)
        if p is not None:
            outs.append({"kind": "intent", "intent": p})
    return outs


# ---------------------------------------------------------------- the step (5)
def sel_mode(mods, lasso=False):
    if lasso and M("K27"):
        if mods & 2 or (mods & 8 and not M("K09")):
            return "add"
        if mods & 1:
            return "toggle"
        return "replace"
    if M("K08"):
        if mods & 1:
            return "add"
        if mods & 2 or (mods & 8 and not M("K09")):
            return "toggle"
        return "replace"
    if mods & 2 or (mods & 8 and not M("K09")):
        return "toggle"
    if mods & 1:
        return "add"
    return "replace"


def _find(m, mach, id_):
    for p in mach["pointers"]:
        if p["id"] == id_:
            return p
    return None


def _acc(mach, ax, ay, outs):
    if M("K03"):
        mach["rem_x"] = 0
        mach["rem_y"] = 0
    bx, by = mach["rem_x"] + ax, mach["rem_y"] + ay
    if M("K04"):
        dx, dy = floor_div(bx, 1000), floor_div(by, 1000)
    elif M("K05"):
        dx, dy = int(bx / 1000), int(by / 1000)
    else:
        dx, dy = div_round(bx, 1000), div_round(by, 1000)
    mach["rem_x"] = bx - 1000 * dx
    mach["rem_y"] = by - 1000 * dy
    if (dx, dy) != (0, 0):
        outs.append({"kind": "intent", "intent": {"type": "pan", "dx": dx, "dy": dy}})


def _rect_out(x0, y0, x1, y1):
    return {"x0": min(x0, x1), "x1": max(x0, x1), "y0": min(y0, y1), "y1": max(y0, y1)}


def _drawn_target(m, st, wtarget):
    """wtarget: wire address with kind implied by keys. returns el if still drawn."""
    if wtarget is None:
        return None
    el = lookup_wire(m, "e" if "ord" in wtarget else "n", wtarget)
    if el is None:
        return None
    if visible(m, st, el):
        return el
    return None


def _wake(mach):
    if M("K97"):
        for p in mach["pointers"]:
            if p["ptype"] == "touch" and not p["long"] and mach["gesture"] in ("press", "pan"):
                return p["t0"] + LONG_MS
        return None
    for p in mach["pointers"]:
        if p["ptype"] == "touch" and mach["gesture"] == "press" and not p["moved"] and not p["long"]:
            return p["t0"] + LONG_MS
    return None


def step(mach0, ev0, m, st, cfg=None, tokens=True):
    cfg = validate_config(cfg or {})
    ev = validate_event(ev0, mach0["last_t"], tokens)
    mach = copy.deepcopy(mach0)
    mach["last_t"] = ev["t"]
    outs = []
    handled = True
    ty = ev["type"]

    def ptr_target_el(w):
        return _drawn_target(m, st, w)

    if ty == "pointerdown":
        if ev["button"] != 0:
            handled = bool(M("K98"))
        elif _find(m, mach, ev["id"]) is not None:
            pass
        elif len(mach["pointers"]) >= 2 and not M("K20"):
            pass
        else:
            tw = None
            if "target" in ev:
                ea = ev["target"]
                el = lookup_eaddr(m, ea)
                if el is not None and visible(m, st, el):
                    tw = wire(m, el)
            p = {"button": ev["button"], "id": ev["id"], "lasso": False, "long": False, "mods0": ev["mods"], "moved": False,
                 "ptype": ev["ptype"], "t0": ev["t"], "x": ev["x"], "x0": ev["x"], "y": ev["y"], "y0": ev["y"]}
            if tw is not None:
                p["target"] = tw
            if len(mach["pointers"]) >= 2:  # K20: replace the first
                mach["pointers"] = mach["pointers"][1:]
            mach["pointers"].append(p)
            mach["pointers"].sort(key=lambda q: q["id"])
            if len(mach["pointers"]) == 1:
                mach["gesture"] = "press"
            else:
                if mach["gesture"] == "lasso":
                    outs.append({"kind": "lasso-end"})
                a, b = mach["pointers"]
                for q in (a, b):
                    q["moved"] = True
                    q["lasso"] = False
                mach["gesture"] = "pinch"
                mach["rem_x"] = mach["rem_y"] = 0
                mach["pinch"] = {"d": isqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2),
                                 "mx": floor_div(a["x"] + b["x"], 2), "my": floor_div(a["y"] + b["y"], 2)}
    elif ty == "pointermove":
        p = _find(m, mach, ev["id"])
        if p is None:
            handled = False
        else:
            px, py = p["x"], p["y"]
            g = mach["gesture"]
            if g == "press":
                if p["long"] and not M("K95"):
                    pass
                elif p["long"] and M("K95"):
                    p["moved"] = True
                    mach["gesture"] = "pan"
                    p["x"], p["y"] = ev["x"], ev["y"]
                    _acc(mach, ev["x"] - p["x0"], ev["y"] - p["y0"], outs)
                    px = None
                else:
                    dx, dy = ev["x"] - p["x0"], ev["y"] - p["y0"]
                    if M("K02"):
                        over = max(abs(dx), abs(dy)) > DRAG
                    elif M("K01"):
                        over = dx * dx + dy * dy >= DRAG * DRAG
                    else:
                        over = dx * dx + dy * dy > DRAG * DRAG
                    if over:
                        p["moved"] = True
                        mach["rem_x"] = mach["rem_y"] = 0
                        if p["mods0"] & 4:
                            p["lasso"] = True
                            mach["gesture"] = "lasso"
                            outs.append({"kind": "lasso-preview", "rect": _rect_out(p["x0"], p["y0"], ev["x"], ev["y"])})
                        else:
                            mach["gesture"] = "pan"
                            if M("K06"):
                                _acc(mach, 0, 0, outs)
                            else:
                                _acc(mach, dx, dy, outs)
            elif g == "pan":
                _acc(mach, ev["x"] - px, ev["y"] - py, outs)
            elif g == "lasso":
                outs.append({"kind": "lasso-preview", "rect": _rect_out(p["x0"], p["y0"], ev["x"], ev["y"])})
            elif g == "pinch":
                p["x"], p["y"] = ev["x"], ev["y"]
                a, b = mach["pointers"]
                mx, my = floor_div(a["x"] + b["x"], 2), floor_div(a["y"] + b["y"], 2)
                d1 = isqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2)
                pz = mach["pinch"]
                zouts = []
                pouts = []
                _acc(mach, mx - pz["mx"], my - pz["my"], pouts)
                pz["mx"], pz["my"] = mx, my
                if pz["d"] > 0 and d1 > 0:
                    if M("K17"):
                        f = (d1 * 1000) // pz["d"]
                    else:
                        f = div_round(d1 * 1000, pz["d"])
                    f = max(1, min(1000000, f))
                    if f != 1000:
                        zouts.append({"kind": "intent", "intent": {"type": "zoom", "factor_milli": f,
                                                                    "anchor": {"x": div_round(mx, 1000), "y": div_round(my, 1000)}}})
                        pz["d"] = d1
                    elif M("K19"):
                        pz["d"] = d1
                elif pz["d"] == 0 and d1 > 0:
                    pz["d"] = d1
                outs.extend(zouts + pouts if M("K18") else pouts + zouts)
            p["x"], p["y"] = ev["x"], ev["y"]
    elif ty in ("pointerup", "pointercancel"):
        p = _find(m, mach, ev["id"])
        if p is None:
            handled = False
        else:
            cancel = ty == "pointercancel"
            if M("K25") and cancel:
                cancel = False
            if not cancel and "x" in ev:
                p["x"], p["y"] = ev["x"], ev["y"]
            g = mach["gesture"]
            mach["pointers"] = [q for q in mach["pointers"] if q["id"] != ev["id"]]
            if g == "press":
                if not cancel and (not p["long"] or M("K23")):
                    if "target" in p:
                        el = _drawn_target(m, st, p["target"])
                        if el is None and M("K24"):
                            el = lookup_wire(m, "e" if "ord" in p["target"] else "n", p["target"])
                        if el is not None:
                            cm = ev["mods"] if (M("K07") and "mods" in ev) else p["mods0"]
                            outs.append({"kind": "intent", "intent": {"type": "select", "mode": sel_mode(cm),
                                                                       "targets": [eaddr(m, el)]}})
                    else:
                        mods = p["mods0"]
                        if M("K07"):
                            mods = ev["mods"]
                        if M("K10") or not (mods & (1 | 2 | 8)):
                            outs.append({"kind": "intent", "intent": {"type": "clear-selection"}})
            elif g == "lasso":
                if not (cancel and M("K96")):
                    outs.append({"kind": "lasso-end"})
                if not cancel:
                    rect = {"x0": p["x0"], "y0": p["y0"], "x1": p["x"], "y1": p["y"]}
                    tg = lasso_targets(m, st, rect, normalize=not M("K28"))
                    cnt = len(tg)
                    over = (cnt >= cfg["maxTargets"]) if M("K126") else (cnt > cfg["maxTargets"])
                    if over:
                        outs.append({"kind": "nav", "event": {"type": "lasso-too-large", "count": cnt}})
                    else:
                        outs.append({"kind": "intent", "intent": {"type": "select", "mode": sel_mode(p["mods0"], True),
                                                                   "targets": [eaddr(m, e) for e in tg]}})
            elif g == "pinch":
                for q in mach["pointers"]:
                    q["moved"] = True
                mach["gesture"] = "pan"
                mach["rem_x"] = mach["rem_y"] = 0
                mach.pop("pinch", None)
            if not mach["pointers"]:
                mach["gesture"] = "idle"
                mach["rem_x"] = mach["rem_y"] = 0
                mach.pop("pinch", None)
    elif ty == "wheel":
        u = {0: 1, 1: (10 if M("K14") else 16), 2: (st["viewport"]["width"] if M("K15") else st["viewport"]["height"])}[ev["unit"]]
        d = ev["dy"] * u
        if M("K13"):
            d = -d
        acc = mach["wheel_acc"]
        if acc != 0 and d != 0 and ((acc < 0) != (d < 0)) and not M("K11"):
            acc = 0
        if d == 0 and M("K94"):
            acc = 0
        acc += d
        cap = 16 if M("K12") else MAX_NOTCHES
        n = 0
        while abs(acc) >= NOTCH and n < cap:
            ax = floor_div(ev["x"], 1000) if M("K16") else div_round(ev["x"], 1000)
            ay = floor_div(ev["y"], 1000) if M("K16") else div_round(ev["y"], 1000)
            outs.append({"kind": "intent", "intent": {"type": "zoom", "factor_milli": ZIN if acc < 0 else ZOUT,
                                                       "anchor": {"x": ax, "y": ay}}})
            acc += NOTCH if acc < 0 else -NOTCH
            n += 1
        if abs(acc) >= NOTCH:
            q = abs(acc) // NOTCH
            acc = acc - (q if acc > 0 else -q) * NOTCH
        mach["wheel_acc"] = acc
    elif ty == "tick":
        for p in mach["pointers"]:
            if p["ptype"] == "touch" and (not p["moved"] or M("K22")) and not p["long"]:
                dt = ev["t"] - p["t0"]
                if (dt > LONG_MS) if M("K21") else (dt >= LONG_MS):
                    p["long"] = True
                    o = {"kind": "context-action", "source": "long-press", "x": div_round(p["x"], 1000), "y": div_round(p["y"], 1000)}
                    el = _drawn_target(m, st, p.get("target"))
                    if el is not None and not M("K26"):
                        o["target"] = object_ref(m, el)
                    outs.append(o)
    elif ty == "contextmenu":
        o = {"kind": "context-action", "source": "pointer", "x": div_round(ev["x"], 1000), "y": div_round(ev["y"], 1000)}
        if "target" in ev:
            el = lookup_eaddr(m, ev["target"])
            if el is not None and visible(m, st, el) and not M("K26"):
                o["target"] = object_ref(m, el)
        outs.append(o)
    elif ty == "dblclick":
        if not ("target" in ev and M("K85")):
            outs.append({"kind": "intent", "intent": {"type": "fit"}})
    elif ty == "key":
        outs, handled = _key(mach, ev, m, st, cfg)
    return mach, handled, outs, _wake(mach)


def _lookup_binding(mach, tok, mods, table):
    def match(mode):
        for r in table:
            if r["mode"] != mode or r["key"] != tok:
                continue
            a, b = r["mods"], mods
            if shift_ignored(tok) and not M("K72"):
                a, b = a & ~1, b & ~1
            if a == b:
                return r
        return None
    r = match(mach["mode"])
    if r is None and mach["mode"] != "normal" and not M("K73"):
        r = match("normal")
    return r


def _key(mach, ev, m, st, cfg):
    r = _lookup_binding(mach, ev["key"], ev["mods"], cfg["bindings"])
    if r is None:
        return [], False
    a = r["action"]
    t = a["type"]
    _, _, sel, foc, vn, ve = st_sets(m, st)
    tr = traversal(m, st)
    outs = []
    wrap, reveal = cfg["wrap"], cfg["reveal"]
    if t == "spatial":
        outs = resolve_navigation(m, st, {"type": "nav-spatial", "dir": a["dir"], "extend": a["extend"]}, wrap, reveal)
    elif t == "incident":
        outs = resolve_navigation(m, st, {"type": "nav-incident", "delta": a["delta"]}, wrap, reveal)
    elif t == "endpoint":
        outs = resolve_navigation(m, st, {"type": "nav-endpoint", "end": a["end"]}, wrap, reveal)
    elif t == "step":
        outs = resolve_navigation(m, st, {"type": "nav-step", "delta": a["delta"]}, wrap, reveal)
    elif t in ("first", "last"):
        outs = [{"kind": "intent", "intent": {"type": "focus-first" if t == "first" else "focus-last"}}]
        tg = (tr[0] if t == "first" else tr[-1]) if tr else None
        if (reveal or M("K93")) and tg is not None and tg != foc:
            p = reveal_pan(m, st, tg)
            if p:
                outs.append({"kind": "intent", "intent": p})
    elif t == "toggle-focus":
        if foc is not None:
            outs = [{"kind": "intent", "intent": {"type": "select", "mode": "toggle", "targets": [eaddr(m, foc)]}}]
    elif t == "activate":
        if foc is not None:
            outs = [{"kind": "activate", "target": object_ref(m, foc)}]
    elif t == "clear-selection":
        outs = [{"kind": "intent", "intent": {"type": "clear-selection"}}]
    elif t == "context":
        o = {"kind": "context-action", "source": "keyboard"}
        if foc is not None:
            o["target"] = object_ref(m, foc)
        outs = [o]
    elif t == "pan":
        outs = [{"kind": "intent", "intent": {"type": "pan", "dx": a["dx"], "dy": a["dy"]}}]
    elif t == "zoom":
        outs = [{"kind": "intent", "intent": {"type": "zoom", "factor_milli": a["factor"]}}]
    elif t == "fit":
        outs = [{"kind": "intent", "intent": {"type": "fit"}}]
    elif t == "select-all":
        els = [("n", i) for i in range(len(m.nodes))] + [("e", i) for i in range(len(m.edges))] if M("K44") else tr
        cnt = len(els)
        over = (cnt >= cfg["maxTargets"]) if M("K126") else (cnt > cfg["maxTargets"])
        if over:
            outs = [{"kind": "nav", "event": {"type": "select-all-too-large", "count": cnt}}]
        else:
            outs = [{"kind": "intent", "intent": {"type": "select", "mode": "replace", "targets": [eaddr(m, e) for e in els]}}]
    elif t == "marquee-start":
        if foc is None:
            outs = [{"kind": "nav", "event": {"type": "nav-none", "reason": "NO_FOCUS"}}]
        elif foc[0] != "n":
            outs = [{"kind": "nav", "event": {"type": "nav-none", "reason": "NOT_A_NODE"}}]
        else:
            mach["mode"] = "marquee"
            mach["anchor"] = wire(m, foc)
            outs = [{"kind": "nav", "event": {"type": "marquee-started"}}]
    elif t == "marquee-commit":
        anc = lookup_wire(m, "n", mach.get("anchor"))
        if anc is None or not visible(m, st, anc):
            mach["mode"] = "normal"
            mach.pop("anchor", None)
            outs = [{"kind": "nav", "event": {"type": "nav-none", "reason": "ANCHOR_GONE"}}]
        elif foc is None:
            outs = [{"kind": "nav", "event": {"type": "nav-none", "reason": "NO_FOCUS"}}]
        elif foc[0] != "n":
            outs = [{"kind": "nav", "event": {"type": "nav-none", "reason": "NOT_A_NODE"}}]
        else:
            ax, ay = screen_node(m, st, anc[1])
            fx, fy = screen_node(m, st, foc[1])
            tg = lasso_targets_micro(m, st, min(ax, fx), min(ay, fy), max(ax, fx), max(ay, fy))
            mach["mode"] = "normal"
            mach.pop("anchor", None)
            cnt = len(tg)
            over = (cnt >= cfg["maxTargets"]) if M("K126") else (cnt > cfg["maxTargets"])
            if over:
                outs = [{"kind": "nav", "event": {"type": "lasso-too-large", "count": cnt}}]
            else:
                outs = [{"kind": "intent", "intent": {"type": "select", "mode": "replace", "targets": [eaddr(m, e) for e in tg]}}]
    elif t == "marquee-cancel":
        mach["mode"] = "normal"
        mach.pop("anchor", None)
        outs = [{"kind": "nav", "event": {"type": "marquee-cancelled"}}]
    return outs, True


def serialize_step(handled, outs, wake):
    r = {"handled": handled, "outputs": outs}
    if wake is not None:
        r["wake_at"] = wake
    return r
