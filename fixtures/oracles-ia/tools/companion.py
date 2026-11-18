"""Companion tree, live text, DOM plan, executor, simulated DOM, accessibility gate, composed manifest."""
import re

from base import *  # noqa
import base
from machine import DEFAULT_BINDINGS  # noqa

LIVE_MAX = 400
FULL_MAX = 500
WINDOW_N = 200
ID_PREFIX_RE = re.compile(r"^[a-z][a-z0-9-]{0,31}$")


def cut_live(s):
    if M("K49"):
        return s
    lim, thr = (398, 399) if M("K50") else (399, 400)
    if u16len(s) <= thr:
        return s
    out = []
    n = 0
    for ch in s:
        l = 2 if ord(ch) > 0xFFFF else 1
        if n + l > lim:
            break
        out.append(ch)
        n += l
    return "".join(out) + "…"


NAV_TEXT = {
    "nav-none": {"NO_FOCUS": "No focused element.", "NOT_A_NODE": "Focus a node first.",
                 "NOT_AN_EDGE": "Focus an edge first.", "ANCHOR_GONE": "Marquee anchor is gone."},
}


def nav_text(e):
    t = e.get("type")
    if t == "nav-boundary":
        if e.get("nav") == "spatial":
            return "No element to the %s." % e["dir"]
        return "No next edge." if e["delta"] == 1 else "No previous edge."
    if t == "nav-wrapped":
        return "Wrapped to start." if e["end"] == "end" else "Wrapped to end."
    if t == "nav-none":
        return NAV_TEXT["nav-none"][e["reason"]]
    if t == "marquee-started":
        return "Marquee started. Move focus to the opposite corner, then press Enter."
    if t == "marquee-cancelled":
        return "Marquee cancelled."
    if t in ("lasso-too-large", "select-all-too-large"):
        return "Selection too large: %d elements." % e["count"]
    return None


NAV_TYPES = {"nav-none", "nav-boundary", "nav-wrapped", "marquee-started", "marquee-cancelled", "lasso-too-large",
             "select-all-too-large"}


def live_text(events, m, st, omit_focus=False):
    texts = []
    for e in events:
        if omit_focus and not M("K99") and e.get("type") == "focus-changed":
            continue
        if e.get("type") in NAV_TYPES:
            texts.append(nav_text(e))
        else:
            texts.append(announcement(m, st, e))
    if M("K121"):
        col = []
        for t in texts:
            if not col or col[-1] != t:
                col.append(t)
        texts = [t for t in col if t is not None]
    else:
        texts = [t for t in texts if t is not None]
        if not M("K51"):
            col = []
            for t in texts:
                if not col or col[-1] != t:
                    col.append(t)
            texts = col
    return cut_live(" ".join(texts))


def default_window(n, fpos):
    if n <= FULL_MAX:
        return {"count": n, "first": 1}
    p = fpos if fpos is not None else 1
    if M("K47"):
        first = max(1, min(p - 100, n - WINDOW_N))
    else:
        first = max(1, min(p - 100, n - WINDOW_N + 1))
    return {"count": WINDOW_N, "first": first}


def resolve_window(opt, n, fpos):
    if opt is None or opt == "auto":
        return default_window(n, fpos)
    if opt == "all":
        return {"count": n, "first": 1}
    if isinstance(opt, dict) and set(opt.keys()) == {"first", "count"}:
        vals = []
        for k in ("first", "count"):
            v = opt[k]
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise IaErr("INVALID_CONFIG", "SCHEMA")
            if isinstance(v, float):
                if v != v or v in (float("inf"), float("-inf")) or v != int(v):
                    raise IaErr("INVALID_CONFIG", "NOT_INTEGER")
                v = int(v)
            vals.append(v)
        f, c = vals
        if not (f >= 1 and 0 <= c <= 5000):
            raise IaErr("INVALID_CONFIG", "OUT_OF_RANGE")
        return {"count": c, "first": f}
    raise IaErr("INVALID_CONFIG", "SCHEMA")


def build_tree(m, st, opts=None):
    opts = opts or {}
    prefix = opts.get("idPrefix", "igc")
    if not isinstance(prefix, str) or not ID_PREFIX_RE.match(prefix):
        raise IaErr("INVALID_CONFIG", "INVALID_VALUE")
    mode = opts.get("mode", "normal")
    tr = traversal(m, st)
    n = len(tr)
    _, _, sel, foc, _, _ = st_sets(m, st)
    fpos = (tr.index(foc) + 1) if foc is not None else None
    win = resolve_window(opts.get("window"), n, fpos)
    stop = (fpos if fpos is not None else (1 if n > 0 else None))
    if M("K45") and n > 0:
        stop = 1
    pos = set(range(win["first"], win["first"] + win["count"]))
    pos = set(p for p in pos if 1 <= p <= n)
    if not M("K48"):
        if fpos is not None:
            pos.add(fpos)
        if stop is not None:
            pos.add(stop)
    items = []
    for p in sorted(pos):
        el = tr[p - 1]
        kind = "node" if el[0] == "n" else "edge"
        w = wire(m, el)
        it = {"address": eaddr(m, el), "focused": el == foc,
              "id": element_hex_id(prefix, w, "n" if el[0] == "n" else "e"), "kind": kind,
              "name": (m.nodes[el[1]]["label"] if (M("K53") and el[0] == "n") else el_name(m, el)),
              "position": (p - 1) if M("K54") else p, "roledescription": kind,
              "selected": (el == foc) if M("K46") else (el in sel), "set_size": n, "tabindex": 0 if p == stop else -1}
        if el[0] == "e" and not M("K52"):
            it["description"] = edge_desc(m, el[1])
        items.append(it)
    live = live_text(opts.get("events", []), m, st, bool(opts.get("omitFocusAnnouncement", False)))
    tree = {"companion": "igr-companion/1",
            "container": {"description": status_text(m, st), "name": summary_text(m), "role": "application"},
            "id_prefix": prefix, "items": items, "layout_sha256": m.layout_sha,
            "list": {"multiselectable": True, "role": "listbox", "set_size": n, "window": win},
            "live": {"atomic": True, "politeness": "polite", "role": "status", "text": live},
            "mode": mode, "scene_sha256": m.scene_sha}
    return tree


def tree_bytes(t):
    return cjb(t)


# ---------------------------------------------------------------- plan (9.5)
def _item_ops(it, before, bd, T, D):
    i = it["id"]
    ops = [["c", i, "div"], ["a", i, "role", "option"], ["a", i, "aria-roledescription", it["roledescription"]],
           ["a", i, "tabindex", str(it["tabindex"])], ["a", i, "aria-selected", "true" if it["selected"] else "false"],
           ["a", i, "aria-posinset", str(it["position"])], ["a", i, "aria-setsize", str(it["set_size"])],
           ["t", i, it["name"]]]
    if it["kind"] == "edge" and "description" in it:
        d = i + "-d"
        ops += [["c", d, "div"], ["t", d, it["description"]], ["a", i, "aria-describedby", d],
                ["p", T if M("K101") else D, d, "" if M("K101") else bd]]
    ops.append(["p", T, i, before])
    return ops


def _next_edge_desc(items, k):
    for it in items[k + 1:]:
        if it["kind"] == "edge" and "description" in it:
            return it["id"] + "-d"
    return ""


def keys(prefix):
    return prefix + "-root", prefix + "-status", prefix + "-live", prefix + "-desc", prefix + "-list"


def full_build(tree):
    P = tree["id_prefix"]
    R, S, L, D, T = keys(P)
    c = tree["container"]
    ops = [["c", R, "div"], ["a", R, "class", "igr-companion-hidden"], ["a", R, "role", "application"],
           ["a", R, "aria-label", c["name"]], ["a", R, "aria-describedby", S],
           ["c", S, "div"], ["t", S, c["description"]], ["p", R, S, ""],
           ["c", L, "div"], ["a", L, "role", "status"], ["a", L, "aria-live", "polite"], ["a", L, "aria-atomic", "true"],
           ["t", L, tree["live"]["text"]], ["p", R, L, ""],
           ["c", D, "div"], ["p", R, D, ""],
           ["c", T, "div"], ["a", T, "role", "listbox"], ["a", T, "aria-multiselectable", "true"],
           ["a", T, "aria-labelledby", R], ["p", R, T, ""]]
    items = tree["items"]
    for k in range(len(items) - 1, -1, -1):
        before = items[k + 1]["id"] if k + 1 < len(items) else ""
        bd = _next_edge_desc(items, k)
        ops += _item_ops(items[k], before, bd, T, D)
    ops.append(["p", "@host", R, ""])
    return ops


def plan_update(prev, nxt, max_bytes=16777216):
    if prev is not None and prev["id_prefix"] != nxt["id_prefix"]:
        raise IaErr("INVALID_TREE", "SCHEMA")
    ops = []
    if prev is None or prev["scene_sha256"] != nxt["scene_sha256"] or prev["layout_sha256"] != nxt["layout_sha256"]:
        if prev is not None:
            ops.append(["r", keys(prev["id_prefix"])[0]])
        ops += full_build(nxt)
    else:
        P = nxt["id_prefix"]
        R, S, L, D, T = keys(P)
        if prev["container"]["description"] != nxt["container"]["description"]:
            ops.append(["t", S, nxt["container"]["description"]])
        pt, nt = prev["live"]["text"], nxt["live"]["text"]
        if pt != nt:
            ops.append(["t", L, nt])
        elif nt != "" and not M("K100"):
            ops.append(["t", L, ""])
            ops.append(["t", L, nt])
        nids = set(i["id"] for i in nxt["items"])
        pids = {i["id"]: i for i in prev["items"]}
        for it in prev["items"]:
            if it["id"] not in nids:
                ops.append(["r", it["id"]])
                if "description" in it:
                    ops.append(["r", it["id"] + "-d"])
        # retained items never move
        rp = [i["id"] for i in prev["items"] if i["id"] in nids]
        rn = [i["id"] for i in nxt["items"] if i["id"] in pids]
        if rp != rn:
            raise IaErr("INVALID_TREE", "INCONSISTENT")
        items = nxt["items"]
        for k in range(len(items) - 1, -1, -1):
            if items[k]["id"] in pids:
                continue
            before = items[k + 1]["id"] if k + 1 < len(items) else ""
            if M("K56"):
                before = ""
            ops += _item_ops(items[k], before, _next_edge_desc(items, k), T, D)
        for it in items:
            if it["id"] not in pids:
                continue
            po = pids[it["id"]]
            for name, f in (("tabindex", lambda x: str(x["tabindex"])), ("aria-selected", lambda x: "true" if x["selected"] else "false"),
                            ("aria-posinset", lambda x: str(x["position"])), ("aria-setsize", lambda x: str(x["set_size"]))):
                if f(po) != f(it) or M("K55"):
                    ops.append(["a", it["id"], name, f(it)])
    if len(serialize_plan(ops)) > max_bytes:
        raise IaErr("RESOURCE_LIMIT", "BYTES_LIMIT")
    return ops


def serialize_plan(ops):
    return "".join(cj(o) + "\n" for o in ops).encode("utf-8")


def parse_lines(b):
    s = b.decode("utf-8")
    if s == "":
        return []
    assert s.endswith("\n")
    return [json.loads(x) for x in s[:-1].split("\n")]


# ---------------------------------------------------------------- executor and DOMs
ATTR_ALLOW = {"id", "class", "role", "aria-label", "aria-labelledby", "aria-describedby", "aria-live", "aria-atomic",
              "aria-multiselectable", "aria-selected", "aria-posinset", "aria-setsize", "aria-roledescription", "tabindex"}


class SimEl:
    def __init__(self):
        self.attrs = {}
        self.text = None
        self.children = []
        self.parent = None


class SimDom:
    def __init__(self, log=None):
        self.log = log
        self.host = SimEl()
        self.host.attrs["@host"] = "1"

    def _k(self, el):
        if el is self.host:
            return "@host"
        return el.attrs.get("id", "")

    def create(self):
        if self.log is not None:
            self.log.append(["createElement", "div"])
        return SimEl()

    def set_attr(self, el, name, value):
        el.attrs[name] = value
        if self.log is not None:
            self.log.append(["setAttribute", el.attrs.get("id", "") if name != "id" else value, name, value])

    def set_text(self, el, text):
        el.text = text
        if self.log is not None:
            self.log.append(["textContent", self._k(el), text])

    def insert(self, parent, child, before):
        if child.parent is not None:
            child.parent.children.remove(child)
        if before is None:
            parent.children.append(child)
        else:
            parent.children.insert(parent.children.index(before), child)
        child.parent = parent
        if self.log is not None:
            self.log.append(["insertBefore", self._k(parent), self._k(child), "" if before is None else self._k(before)])

    def remove(self, parent, child):
        parent.children.remove(child)
        child.parent = None
        if self.log is not None:
            self.log.append(["removeChild", self._k(parent), self._k(child)])


class ExecState:
    def __init__(self, dom):
        self.elements = {"@host": dom.host}
        self.parent = {}


def execute_plan(dom, ops, es):
    for op in ops:
        k = op[0]
        if k == "c":
            key = op[1]
            if key in es.elements or key == "@host":
                raise IaErr("INVALID_PLAN", "UNKNOWN_KEY")
            el = dom.create()
            dom.set_attr(el, "id", key)
            es.elements[key] = el
        elif k == "a":
            key, name, value = op[1], op[2], op[3]
            if key == "@host" or key not in es.elements:
                raise IaErr("INVALID_PLAN", "UNKNOWN_KEY")
            if name not in ATTR_ALLOW:
                raise IaErr("INVALID_PLAN", "SCHEMA")
            dom.set_attr(es.elements[key], name, value)
        elif k == "t":
            key = op[1]
            if key == "@host" or key not in es.elements:
                raise IaErr("INVALID_PLAN", "UNKNOWN_KEY")
            dom.set_text(es.elements[key], op[2])
        elif k == "p":
            pk, ck, bk = op[1], op[2], op[3]
            if pk not in es.elements or ck not in es.elements or (bk != "" and bk not in es.elements):
                raise IaErr("INVALID_PLAN", "UNKNOWN_KEY")
            dom.insert(es.elements[pk], es.elements[ck], None if bk == "" else es.elements[bk])
            es.parent[ck] = pk
        elif k == "r":
            key = op[1]
            if key == "@host" or key not in es.elements:
                raise IaErr("INVALID_PLAN", "UNKNOWN_KEY")
            pk = es.parent.get(key)
            if pk is None:
                raise IaErr("INVALID_PLAN", "UNKNOWN_KEY")
            dom.remove(es.elements[pk], es.elements[key])
            # forget the key and its descendants
            dead = {key}
            changed = True
            while changed:
                changed = False
                for ck, pk2 in list(es.parent.items()):
                    if pk2 in dead and ck not in dead:
                        dead.add(ck)
                        changed = True
            for dk in dead:
                es.elements.pop(dk, None)
                es.parent.pop(dk, None)
        else:
            raise IaErr("INVALID_PLAN", "SCHEMA")
    return es


def log_bytes(log):
    return "".join(cj(x) + "\n" for x in log).encode("utf-8")


def dom_dump(el):
    return {"a": dict(el.attrs), "t": el.text, "c": [dom_dump(c) for c in el.children]}


def sim_build(tree):
    d = SimDom()
    es = ExecState(d)
    execute_plan(d, full_build(tree), es)
    return d, es


# ---------------------------------------------------------------- gate (10)
NOT_CLAIMED = ["assistive-technology-behaviour", "character-key-shortcuts", "colour-contrast",
               "keyboard-behaviour-in-real-browsers", "pointer-gesture-alternatives", "reflow-and-text-spacing",
               "screen-reader-browse-mode", "scroll-trap-behaviour", "selection-state-in-svg",
               "set-hidden-keyboard-access", "target-size-of-real-pixels", "wcag-conformance"]


def _isi(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _depth(v, d=1):
    if isinstance(v, dict):
        return max([d] + [_depth(x, d + 1) for x in v.values()])
    if isinstance(v, list):
        return max([d] + [_depth(x, d + 1) for x in v])
    return d


def _tree_shape(t):
    S = IaErr("INVALID_TREE", "SCHEMA")
    if not isinstance(t, dict) or _depth(t) > 8:
        raise S
    c = t.get("container")
    if not isinstance(c, dict) or not all(isinstance(c.get(k), str) for k in ("description", "name", "role")):
        raise S
    l = t.get("list")
    if not isinstance(l, dict) or not _isi(l.get("set_size")) or not isinstance(l.get("window"), dict):
        raise S
    w = l["window"]
    if not (_isi(w.get("first")) and _isi(w.get("count"))):
        raise S
    if not isinstance(t.get("items"), list) or not isinstance(t.get("id_prefix"), str):
        raise S
    for it in t["items"]:
        if not isinstance(it, dict):
            raise S
        for k in ("id", "kind", "name", "roledescription"):
            if not isinstance(it.get(k), str):
                raise S
        for k in ("focused", "selected"):
            if not isinstance(it.get(k), bool):
                raise S
        for k in ("position", "set_size", "tabindex"):
            if not _isi(it.get(k)):
                raise S
        a = it.get("address")
        if not isinstance(a, dict) or len(a) != 1 or not (("node" in a) or ("edge" in a)):
            raise S
    if "live" in t and not isinstance(t["live"], dict):
        raise S


def run_gate(m, st, tree=None, composition="companion", bindings=None, window=None, fidelity=None, reduced=None,
             readout=None, canvas_label=None, svg=None, mode=None, tab_stops=None):
    I = "INVALID_INPUT"
    if composition not in ("companion", "svg-native"):
        raise IaErr(I, "SCHEMA")
    if composition == "companion":
        if svg is not None or tree is None:
            raise IaErr(I, "SCHEMA")
        _tree_shape(tree)
    else:
        if svg is None:
            raise IaErr(I, "SCHEMA")
    table = bindings if bindings is not None else DEFAULT_BINDINGS
    tr = traversal(m, st)
    n = len(tr)
    _, _, sel, foc, _, ve = st_sets(m, st)
    fpos = (tr.index(foc) + 1) if foc is not None else None
    stop = fpos if fpos is not None else (1 if n > 0 else None)
    comp = composition == "companion"
    checks = []

    def add(cid, findings, verdict=None):
        if verdict is None:
            verdict = "fail" if findings else "pass"
        checks.append({"findings": [dict(f) for f in findings], "id": cid, "verdict": verdict})

    def fnd(code, pos=None):
        d = {"code": code}
        if pos is not None:
            d["position"] = pos
        return d

    # G1
    def step_ok(delta):
        return any(r["mode"] == "normal" and (r["mods"] == 0 or M("K107")) and r["action"].get("type") == "step"
                   and r["action"]["delta"] == delta for r in table)
    f = []
    if not step_ok(1) and not M("K59"):
        f.append(fnd("NO_STEP_FORWARD_BINDING"))
    if not step_ok(-1):
        f.append(fnd("NO_STEP_BACKWARD_BINDING"))
    if comp:
        if tree["list"]["set_size"] != n:
            f.append(fnd("SETSIZE_WRONG"))
        exp = resolve_window(window, n, fpos)
        if tree["list"]["window"] != exp and not M("K102"):
            f.append(fnd("WINDOW_MISMATCH"))
        w = tree["list"]["window"]
        need = set(p for p in range(w["first"], w["first"] + w["count"]) if 1 <= p <= n)
        if fpos is not None:
            need.add(fpos)
        if stop is not None:
            need.add(stop)
        have = {}
        dups = []
        for it in tree["items"]:
            p = it["position"]
            if p in have:
                dups.append(p)
            have[p] = True
        for p in sorted(need):
            if p not in have:
                f.append(fnd("ITEM_MISSING", p))
        for p in dups:
            f.append(fnd("ITEM_DUPLICATE", p))
    add("G1-REACH", f)
    # G2
    if comp:
        f = []
        for it in tree["items"]:
            p = it["position"]
            if not (1 <= p <= n):
                f.append(fnd("POSITION_INVALID", p))
                continue
            k = tr[p - 1]
            if it["address"] != eaddr(m, k):
                f.append(fnd("ADDRESS_WRONG", p))
                continue
            kind = "node" if k[0] == "n" else "edge"
            if it["kind"] != kind:
                f.append(fnd("KIND_WRONG", p))
            if it["id"] != element_hex_id(tree["id_prefix"], wire(m, k), "n" if k[0] == "n" else "e"):
                f.append(fnd("ID_WRONG", p))
            if not has_nonws(it["name"]):
                f.append(fnd("NAME_EMPTY", p))
            elif it["name"] != el_name(m, k):
                f.append(fnd("NAME_MISMATCH", p))
            if it["roledescription"] == "":
                f.append(fnd("ROLE_MISSING", p))
            elif it["roledescription"] != kind:
                f.append(fnd("ROLE_WRONG", p))
            if k[0] == "e":
                if "description" not in it and not M("K61"):
                    f.append(fnd("DESCRIPTION_MISSING", p))
                elif "description" in it and it["description"] != edge_desc(m, k[1]):
                    f.append(fnd("DESCRIPTION_MISMATCH", p))
            elif "description" in it:
                f.append(fnd("DESCRIPTION_UNEXPECTED", p))
            if it["selected"] != (k in sel) and not M("K103"):
                f.append(fnd("SELECTED_WRONG", p))
            if it["set_size"] != n:
                f.append(fnd("ITEM_SETSIZE_WRONG", p))
        add("G2-NAME", f)
    else:
        add("G2-NAME", [], "not-applicable")
    # G3
    f = []
    if not M("K57"):
        if any(r["key"] == "Tab" for r in table) and not (M("K81") and all(r["mode"] != "normal" for r in table if r["key"] == "Tab")):
            f.append(fnd("TAB_BOUND"))
    modes = []
    for r in table:
        if r["mode"] not in modes:
            modes.append(r["mode"])
    for md in modes:
        if md != "normal" and not any(r["mode"] == md and r["key"] == "Escape" and r["mods"] == 0 for r in table):
            f.append(fnd("NO_ESCAPE_EXIT"))
    if comp:
        zeros = [it for it in tree["items"] if it["tabindex"] == 0]
        exp_cnt = 1 if n > 0 else 0
        if len(zeros) != exp_cnt and not M("K58"):
            f.append(fnd("TABSTOP_COUNT"))
        elif len(zeros) == 1 and n > 0:
            if zeros[0]["position"] != stop and not M("K104"):
                f.append(fnd("TABSTOP_WRONG"))
        for it in tree["items"]:
            if it["tabindex"] not in (0, -1):
                f.append(fnd("TABINDEX_INVALID", it["position"]))
    add("G3-TRAP", f)
    # G4
    if comp:
        f = []
        foc_items = [it for it in tree["items"] if it["focused"]]
        if foc is not None:
            if len(foc_items) == 0:
                f.append(fnd("FOCUS_ITEM_MISSING"))
            elif len(foc_items) > 1:
                f.append(fnd("FOCUS_COUNT"))
            elif foc_items[0]["position"] != fpos:
                f.append(fnd("FOCUSED_WRONG"))
        elif foc_items:
            f.append(fnd("FOCUS_COUNT"))
        add("G4-FOCUS", f)
    else:
        add("G4-FOCUS", [], "not-applicable")
    # G5
    if fidelity is None:
        add("G5-MOTION", [], "not-applicable")
    else:
        bad = bool(reduced) and fidelity != "none"
        add("G5-MOTION", [fnd("MOTION_NOT_NONE")] if bad else [])
    # G6
    if comp:
        f = []
        c = tree["container"]
        if c["name"] == "":
            f.append(fnd("SUMMARY_MISSING"))
        elif c["name"] != summary_text(m):
            f.append(fnd("SUMMARY_MISMATCH"))
        if c["description"] != status_text(m, st):
            f.append(fnd("STATUS_MISMATCH"))
        if canvas_label is not None and canvas_label != summary_text(m) + " " + status_text(m, st):
            f.append(fnd("CANVAS_LABEL_MISMATCH"))
        add("G6-TEXT", f)
    else:
        add("G6-TEXT", [], "not-applicable")
    # G7
    if comp:
        f = []
        tm = tree["mode"] if "mode" in tree else None
        if tm not in ("normal", "marquee"):
            f.append(fnd("MODE_INVALID"))
        elif mode is not None and tm != mode and not M("K128"):
            f.append(fnd("MODE_MISMATCH"))
        lv = tree.get("live")
        if lv is None:
            f.append(fnd("LIVE_MISSING"))
        else:
            if lv.get("politeness") != "polite":
                f.append(fnd("LIVE_NOT_POLITE"))
            if lv.get("atomic") is not True:
                f.append(fnd("LIVE_NOT_ATOMIC"))
            if not isinstance(lv.get("text"), str) or u16len(lv["text"]) > LIVE_MAX:
                f.append(fnd("LIVE_TOO_LONG"))
        add("G7-LIVE", f)
    else:
        add("G7-LIVE", [], "not-applicable")
    # G8
    add("G8-TARGET", [fnd("EDGE_TARGET_BELOW_24")] if len(ve) > 0 else [], "fail" if M("K62") and len(ve) > 0 else "info")
    # G9
    if not comp:
        f = []
        if svg["root"]["title"] != summary_text(m):
            f.append(fnd("SVG_TITLE"))
        if svg["root"]["desc"] != status_text(m, st):
            f.append(fnd("SVG_DESC"))
        its = svg["items"]
        zeros = [i + 1 for i, it in enumerate(its) if it["tabindex"] == 0]
        ok = (len(zeros) == 1 and zeros[0] == stop) if n > 0 else (len(zeros) == 0)
        if not ok and not M("K108"):
            f.append(fnd("SVG_TABSTOP"))
        for i, it in enumerate(its):
            if i < n:
                if it["name"] != el_name(m, tr[i]):
                    f.append(fnd("SVG_NAME", i + 1))
            else:
                f.append(fnd("SVG_ORDER", i + 1))
        if len(its) < n:
            f.append(fnd("SVG_ORDER", len(its) + 1))
        add("G9-MAP", f)
    else:
        add("G9-MAP", [], "not-applicable")
    # G10
    if readout is None:
        add("G10-MARKER", [], "not-applicable")
    else:
        rf = readout.get("focus")
        sf = st.get("focus")
        add("G10-MARKER", [] if (M("K60") or rf == sf) else [fnd("NO_BACKEND_MARKER")])
    # G11
    if tab_stops is None:
        add("G11-PAGE", [], "not-applicable")
    else:
        exp_ts = 1 if n > 0 else 0
        add("G11-PAGE", [] if (tab_stops == exp_ts or M("K106")) else [fnd("TABSTOP_COUNT_PAGE")])
    # G12
    f = []
    if foc is not None and not M("K105"):
        X, Y = screen_el(m, st, foc)
        w, h = st["viewport"]["width"] * 10 ** 6, st["viewport"]["height"] * 10 ** 6
        if M("K125"):
            off = X > w or Y > h
        else:
            off = not (0 <= X <= w and 0 <= Y <= h)
        if off:
            f.append(fnd("FOCUS_OFFSCREEN"))
    add("G12-VIEW", f)
    verdict = "fail" if any(c["verdict"] == "fail" for c in checks) else "pass"
    return {"checks": checks, "gate": "igr-a11y-gate/1", "layout_sha256": m.layout_sha, "not_claimed": NOT_CLAIMED,
            "scene_sha256": m.scene_sha, "scope": "listed-checks-only", "verdict": verdict}
