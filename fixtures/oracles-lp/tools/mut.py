"""Configurable all-pairs engine for the mutant table (reference faults), design 37 rev 3.

`place(nodes, labels, C)` with C = {} is the baseline; it is asserted equal to lp.py on every row (core tier)
and on the random inputs. Each mutant overrides some keys of C. Standard library only.
"""
from lp import PX


def build_lists(d_node=(-69, 42, -83, 56, -97, 70), d_edge=(-42, 46, -56, 60, -70, 74), node_off=20, edge_off=0,
                triple=("c", "+h", "-h")):
    node = [(0, 0), (0, -41), ("h", -20), ("-h", -20), (0, 14), (0, -55),
            ("h", -34), ("-h", -34), ("h", -6), ("-h", -6), (0, 28)]
    edge = [(0, 0), (0, -14), (0, 18), ("h", 0), ("-h", 0), (0, -28),
            (0, 32), ("h", -14), ("-h", -14), ("h", 18), ("-h", 18)]

    def trip(d, off):
        out = []
        for t in triple:
            out.append({"c": (0, d), "+h": ("h", d + off), "-h": ("-h", d + off)}[t])
        return out
    for d in d_node:
        node += trip(d, node_off)
    for d in d_edge:
        edge += trip(d, edge_off)
    return node, edge


BASE_NODE, BASE_EDGE = build_lists()

DEFAULTS = {
    "gaps": (PX, PX, PX, PX),          # the four sides of the collision test
    "nonstrict": (False,) * 4,         # <= instead of <
    "ignore": (False,) * 4,            # drop a condition
    "euclid": False,                   # gap measured as Euclidean distance
    "wpx2": 9,                         # width = wpx2 * u px (rev 3: 9u); half width wpx2*u/2 px
    "hw_round": None,                  # None | floor | ceil : half width rounded to whole pixels (fault)
    "top": -10, "bottom": 3,
    "nhalf": 13,
    "node_c": None, "edge_c": None,    # replacement candidate lists (with "h" expressions)
    "node_h": 14, "edge_h": 10,        # h = base + this
    "node_hmode": "ceil", "edge_hmode": "ceil",   # base of h: ceil(9u/2) | floor | 7/2 | 4u | 5u | 9u
    # fallback (no free candidate): min | min_last | min_nodistinct | min_nodes | min_labels | min_first11 | min_gap0
    #                               | default | last | second
    "fallback": "min",
    "node_sees_nodes": True, "node_sees_labels": True, "node_sees_own": True,
    "edge_sees_nodes": True, "edge_sees_node_labels": True, "edge_sees_edge_labels": True,
    "order": "given",                  # given | edge_first | reverse
    "record": "chosen",                # chosen | default | skip_fallback | only_default | none
    "choose": "first",                 # first | last_free
    "neg_dy": False, "neg_dx": False,
    "floor_px": False, "round_px": False, "float": False,
    "ucap": None,
    "skip_first": False,
}


def _hbase(u, mode):
    if mode == "ceil":
        return (9 * u + 1) // 2
    if mode == "floor":
        return (9 * u) // 2
    if mode == "7/2":                  # the rev 2 formula, ceil(7u/2)
        return (7 * u + 1) // 2
    if mode == "4u":
        return 4 * u
    if mode == "5u":
        return 5 * u
    if mode == "9u":
        return 9 * u
    raise ValueError(mode)


def _cands(kind, u, C):
    if kind == "node":
        lst = C["node_c"] or BASE_NODE
        h = _hbase(u, C["node_hmode"]) + C["node_h"]
    else:
        lst = C["edge_c"] or BASE_EDGE
        h = _hbase(u, C["edge_hmode"]) + C["edge_h"]
    out = []
    for dx, dy in lst:
        if isinstance(dx, str):
            dx = eval(dx.replace("h", str(h)), {"__builtins__": {}})
        out.append((dx, dy))
    return out


def _collide(a, b, C):
    g = C["gaps"]
    ns = C["nonstrict"]
    ig = C["ignore"]
    if C["euclid"]:
        dxg = max(a[0] - b[2], b[0] - a[2])
        dyg = max(a[1] - b[3], b[1] - a[3])
        dx0 = dxg if dxg > 0 else 0
        dy0 = dyg if dyg > 0 else 0
        return dx0 * dx0 + dy0 * dy0 < PX * PX
    lhs = (a[0], b[0], a[1], b[1])
    rhs = (b[2], a[2], b[3], a[3])
    for i in range(4):
        if ig[i]:
            continue
        v = rhs[i] + g[i]
        if ns[i]:
            if not (lhs[i] <= v):
                return False
        else:
            if not (lhs[i] < v):
                return False
    return True


def place(nodes, labels, C=None):
    return [(dx, dy) for (_i, dx, dy) in place_idx(nodes, labels, C)]


def place_idx(nodes, labels, C=None):
    C = dict(DEFAULTS, **(C or {}))
    P = float(PX) if C["float"] else PX

    def conv(v):
        if C["float"]:
            return float(v)
        if C["floor_px"]:
            return (v // PX) * PX
        if C["round_px"]:
            return ((v + PX // 2) // PX) * PX
        return v

    half = C["nhalf"]
    nboxes = []
    for (cx, cy) in nodes:
        cx, cy = conv(cx), conv(cy)
        nboxes.append((cx - half * P, cy - half * P, cx + half * P, cy + half * P, cx, cy))

    def lbox(x, y, u):
        if C["float"]:
            hw = C["wpx2"] * u * P / 2
        elif C["hw_round"] == "floor":
            hw = (C["wpx2"] * u // 2) * PX
        elif C["hw_round"] == "ceil":
            hw = ((C["wpx2"] * u + 1) // 2) * PX
        else:
            hw = (C["wpx2"] * u * PX) // 2
        return (x - hw, y + C["top"] * P, x + hw, y + C["bottom"] * P)

    n = len(labels)
    if C["order"] == "given":
        seq = list(range(n))
    elif C["order"] == "reverse":
        seq = list(range(n - 1, -1, -1))
    else:  # edge_first
        seq = [i for i in range(n) if labels[i][0] == "edge"] + [i for i in range(n) if labels[i][0] == "node"]
    ordinals = {}
    cnt = 0
    for i in range(n):
        if labels[i][0] == "node":
            ordinals[i] = cnt
            cnt += 1
    placed = []        # (kind, box)
    res = [None] * n
    for li in seq:
        kind, u, x, y = labels[li]
        node_ordinal = ordinals.get(li, -1)
        if C["ucap"] is not None:
            u = min(u, C["ucap"])
        x, y = conv(x), conv(y)
        obstacles = []          # (type, box): "n" node box, "l" label box
        for ni_, nb in enumerate(nboxes):
            if kind == "node":
                if not C["node_sees_nodes"]:
                    continue
                if not C["node_sees_own"] and ni_ == node_ordinal:
                    continue
            else:
                if not C["edge_sees_nodes"]:
                    continue
            obstacles.append(("n", nb[:4]))
        for (pk, pb) in placed:
            if kind == "node":
                if not C["node_sees_labels"]:
                    continue
            else:
                if pk == "node" and not C["edge_sees_node_labels"]:
                    continue
                if pk == "edge" and not C["edge_sees_edge_labels"]:
                    continue
            obstacles.append(("l", pb))
        cands = _cands(kind, u, C)
        start = 1 if C["skip_first"] else 0
        boxes = [lbox(x + dx * P, y + dy * P, u) for (dx, dy) in cands]
        free = []
        for i in range(start, len(cands)):
            if not any(_collide(boxes[i], o[1], C) for o in obstacles):
                free.append(i)
                if C["choose"] == "first":
                    break
        fell = False
        if free:
            ci = free[-1] if C["choose"] == "last_free" else free[0]
        else:
            fell = True
            fb = C["fallback"]
            if fb == "default":
                ci = 0
            elif fb == "last":
                ci = len(cands) - 1
            elif fb == "second":
                ci = 1
            else:
                def cost(i):
                    box = boxes[i]
                    hit = []
                    for (t, o) in obstacles:
                        if fb == "min_nodes" and t != "n":
                            continue
                        if fb == "min_labels" and t != "l":
                            continue
                        if fb == "min_gap0":
                            ok = box[0] < o[2] and o[0] < box[2] and box[1] < o[3] and o[1] < box[3]
                        else:
                            ok = _collide(box, o, C)
                        if ok:
                            hit.append(o)
                    return len(hit) if fb == "min_nodistinct" else len(set(hit))
                rng = range(start, 11 if fb == "min_first11" else len(cands))
                best_i, best_c = None, None
                for i in rng:
                    c = cost(i)
                    if best_c is None or c < best_c or (fb == "min_last" and c == best_c):
                        best_i, best_c = i, c
                ci = best_i
        chosen = cands[ci]
        res[li] = (-(ci + 1) if fell else ci + 1, chosen[0], chosen[1])
        rec = C["record"]
        if rec == "chosen":
            pos = chosen
        elif rec == "default":
            pos = (0, 0)
        elif rec == "skip_fallback":
            pos = None if fell else chosen
        elif rec == "only_default":
            pos = chosen if chosen == (0, 0) else None
        else:
            pos = None
        if pos is not None:
            placed.append((kind, lbox(x + pos[0] * P, y + pos[1] * P, u)))
    out = []
    for (i, dx, dy) in res:
        if C["neg_dy"]:
            dy = -dy
        if C["neg_dx"]:
            dx = -dx
        out.append((i, int(dx), int(dy)))
    return out
