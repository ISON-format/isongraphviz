"""Row definitions of the oracles-lp corpus (design 37 rev 3). Deterministic (seeded random.Random, integer maths only)."""
import random
from lp import (PX, node_candidates, edge_candidates, label_box, node_box, collide, half_h)
import r2
import search
import mut
import lp

TWO40 = 1 << 40
TWO62 = 1 << 62


class Row:
    def __init__(self, id, group, note, nodes, labels, exp, tier):
        self.id, self.group, self.note = id, group, note
        self.nodes, self.labels, self.exp, self.tier = nodes, labels, exp, tier


ROWS = []
BY_ID = {}


def add(id, group, note, nodes, labels, exp=None, tier="core"):
    assert id not in BY_ID, id
    r = Row(id, group, note, list(nodes), list(labels), exp, tier)
    ROWS.append(r)
    BY_ID[id] = r
    return r


def P(a, b=0):
    return a * PX + b


def nl(cx, cy, u):            # node label: default position (cx, cy + 24 px)
    return ("node", u, cx, cy + 24 * PX)


def el(ax, ay, u):            # edge label: default position (ax, ay - 4 px)
    return ("edge", u, ax, ay - 4 * PX)


def cands_of(kind, u):
    return node_candidates(u) if kind == "node" else edge_candidates(u)


def cand_boxes(kind, u, X, Y):
    return [label_box(X + dx * PX, Y + dy * PX, u) for dx, dy in cands_of(kind, u)]


def find_blocker(box, avoid):
    """A node (whole-pixel centre) whose box collides with `box` and with no box of `avoid`; nearest to the box centre."""
    bl, bt, br, bb = box                  # edges may be half pixels (odd u); the blocker centre is a whole pixel
    cxc, cyc = (bl + br) // 2 // PX, (bt + bb) // 2 // PX
    best = None
    for cx in range((bl - 14 * PX) // PX, (br + 14 * PX) // PX + 2):
        for cy in range((bt - 14 * PX) // PX, (bb + 14 * PX) // PX + 2):
            nb = node_box(cx * PX, cy * PX)
            if not collide(nb, box) or any(collide(nb, a) for a in avoid):
                continue
            key = (abs(cx - cxc) + abs(cy - cyc), cx, cy)
            if best is None or key < best[0]:
                best = (key, (cx * PX, cy * PX))
    assert best is not None
    return best[1]


def blockers(kind, u, X, Y, block, avoid=(), nodes=()):
    """`nodes` plus nodes that block the candidates (0-based indices) `block`."""
    cb = cand_boxes(kind, u, X, Y)
    nodes = list(nodes)
    for j in block:
        if any(collide(cb[j], node_box(*n)) for n in nodes):
            continue
        nodes.append(find_blocker(cb[j], list(avoid)))
    return nodes


def forced(kind, u, k, X, Y, own=True, avoid=()):
    """Nodes such that the first free candidate of a lone label at (X, Y) is number k (1-based)."""
    nodes = [(X, Y - 24 * PX)] if (kind == "node" and own) else []
    cb = cand_boxes(kind, u, X, Y)
    return blockers(kind, u, X, Y, range(k - 1), list(avoid) + [cb[k - 1]], nodes)


def own_of(kind, X, Y):
    return [(X, Y - 24 * PX)] if kind == "node" else []


# ----------------------------------------------------------------------------- E: basic and degenerate
def rows_E():
    add("E01", "E", "empty input: no nodes, no labels -> []", [], [], [])
    add("E02", "E", "20 nodes, no labels -> []", [(P(100 * i), P(50 * (i % 3))) for i in range(20)], [], [])
    add("E03", "E", "one node, its node label at the default position: free (gap to own node exactly 1 px)",
        [(P(200), P(200))], [nl(P(200), P(200), 5)], [1])
    add("E04", "E", "one node label, no nodes: default", [], [("node", 3, P(10), P(34))], [1])
    add("E05", "E", "one edge label, no nodes: default", [], [("edge", 3, P(10), P(34))], [1])
    add("E06", "E", "100 nodes, no labels -> []", [(P(30 * (i % 10)), P(30 * (i // 10))) for i in range(100)], [], [])
    add("E07", "E", "five edge labels far apart, no nodes: all default",
        [], [("edge", 2 + i, P(1000 * i), P(0)) for i in range(5)], [1] * 5)
    add("E08", "E", "edge label whose anchor is the centre of a node: default (u=2: box 294..306 x 286..299 vs node 287..313) collides, (0,-14) is 2 px above the node",
        [(P(300), P(300))], [el(P(300), P(300), 2)], [2])
    add("E09", "E", "node label blocked at the default by ANOTHER node 40 px below its own node (box 227..253 touches the label box 214..227): (0,-41) is free",
        [(P(200), P(200)), (P(200), P(240))], [nl(P(200), P(200), 3)], [2])
    add("E10", "E", "units 1 label with own node: default", [(P(0), P(0))], [nl(P(0), P(0), 1)], [1])
    add("E11", "E", "own node with half-pixel coordinates (500000 micro-px): default, flush at exactly 1 px",
        [(P(200, 500000), P(200, 500000))], [nl(P(200, 500000), P(200, 500000), 4)], [1])
    add("E12", "E", "three identical nodes (same position) are one obstacle: same result as one node (E03)",
        [(P(200), P(200))] * 3, [nl(P(200), P(200), 5)], [1])
    add("E13", "E", "only edge labels in the list (u 2, 4, 6 on one anchor)",
        [(P(0), P(0)), (P(300), P(0))], [el(P(150), P(0), 2), el(P(150), P(0), 4), el(P(150), P(0), 6)], [1, 2, 3])
    add("E14", "E", "node label whose own node is NOT in nodes: no obstacle, default",
        [(P(900), P(900))], [nl(P(200), P(200), 5)], [1])
    add("E15", "E", "node label whose default position is inside its own node (y = cy + 10): (0,-41) is the first free one",
        [(P(100), P(100))], [("node", 1, P(100), P(110))], [2])
    add("E16", "E", "short edge: endpoints 30 px apart, u=2 label at the midpoint (box 109..121 x 86..99) collides with both endpoint boxes (87..113 and 117..143 x 87..113); (0,-14) (box y 72..85) is free",
        [(P(100), P(100)), (P(130), P(100))], [el(P(115), P(100), 2)], [2])


# ----------------------------------------------------------------------------- C: every candidate in turn
def rows_C():
    for kind, tag, X, Y in (("node", "CN", P(200), P(224)), ("edge", "CE", P(300), P(296))):
        for u in (1, 4):
            for k in range(1, 30):
                nodes = forced(kind, u, k, X, Y)
                add("%s%02du%d" % (tag, k, u), "C",
                    "%s label u=%d: candidates 1..%d blocked by node(s), candidate %d free (blockers found by a whole-pixel search)"
                    % (kind, u, k - 1, k),
                    nodes, [(kind, u, X, Y)], [k])


# ----------------------------------------------------------------------------- W: widths and h
def rows_W():
    n = 0
    for u in (1, 2, 3, 12, 40, 200):
        for kind, k, dxs in (("node", 3, 1), ("node", 4, -1), ("edge", 4, 1), ("edge", 5, -1)):
            X, Y = (P(1000), P(1024)) if kind == "node" else (P(1000), P(996))
            h = half_h(u) + (14 if kind == "node" else 10)
            dy = -20 if kind == "node" else 0
            nodes = forced(kind, u, k, X, Y)
            n += 1
            add("W%02d" % n, "W", "%s label u=%d: candidate %d is (%dh, %d), h = ceil(7*%d/2)+%d = %d" %
                (kind, u, k, dxs, dy, u, 14 if kind == "node" else 10, h),
                nodes, [(kind, u, X, Y)], [("xy", dxs * h, dy)])


# ----------------------------------------------------------------------------- F: fallback
def rows_F():
    """Fallback (rev 2): no candidate is free -> the first candidate with the fewest DISTINCT colliding boxes."""
    n = 0
    for kind in ("node", "edge"):
        for u in (1, 3, 12):
            n += 1
            X, Y = (P(400), P(424)) if kind == "node" else (P(400), P(396))
            nodes = blockers(kind, u, X, Y, range(29), (), own_of(kind, X, Y))
            add("F%02d" % n, "F", "%s label u=%d with all 29 candidates blocked by nodes (found by search): fallback to the candidate of least cost (value from the reference, cost recomputed independently by the generator)" % (kind, u),
                nodes, [(kind, u, X, Y)], [("fb",)])
    n += 1
    add("F%02d" % n, "F", "31 identical edge labels u=2 on one anchor: all 29 candidates are mutually free (candidates 1..29 in order), then the 30th and 31st have no free candidate",
        [], [("edge", 2, P(0), P(0))] * 31, list(range(1, 30)) + [("fb",), ("fb",)])
    n += 1
    add("F%02d" % n, "F", "31 identical node labels u=2 on one node: candidates 1..29 in order, then two fallbacks",
        [(P(200), P(200))], [("node", 2, P(200), P(224))] * 31, list(range(1, 30)) + [("fb",), ("fb",)])

    def scene(kind, u, accept, seed, dups=False, multi=None):
        if multi:
            mk = lambda rng: search.multi(rng, kind, u, multi, dups)
        else:
            mk = lambda rng: search.dense_single(rng, kind, u, dups)
        nodes, labels, t = search.find(mk, accept, seed)
        return nodes, labels

    def res(nodes, labels):
        return lp.place_labels_idx(nodes, labels)

    def costs_last(nodes, labels):
        return search.costs(nodes, labels, len(labels) - 1)[0]

    def mid(nodes, labels):
        r = res(nodes, labels)[-1][0]
        return -28 <= r <= -2
    def first(nodes, labels):
        return res(nodes, labels)[-1][0] == -1
    def last(nodes, labels):
        return res(nodes, labels)[-1][0] == -29

    def tie(nodes, labels):
        r = res(nodes, labels)[-1][0]
        if r >= 0:
            return False
        c = costs_last(nodes, labels)
        m = min(c)
        ids = [i for i, v in enumerate(c) if v == m]
        return len(ids) >= 2 and ids[0] + 1 == -r and ids[-1] != ids[0]

    def differs(cfg, dups_only=False):
        def acc(nodes, labels):
            r = res(nodes, labels)
            if r[-1][0] >= 0:
                return False
            return mut.place_idx(nodes, labels, cfg) != r
        return acc

    plan = [
        ("node", 2, mid, 11, False, None, "node label u=2, all 29 blocked, the least-cost candidate is neither the first nor the last (candidate %d, cost %d)"),
        ("edge", 2, mid, 12, False, None, "edge label u=2, all 29 blocked, the least-cost candidate is neither the first nor the last (candidate %d, cost %d)"),
        ("node", 3, first, 13, False, None, "node label u=3, all 29 blocked, the least-cost candidate is the first (the default, candidate %d, cost %d)"),
        ("edge", 3, first, 14, False, None, "edge label u=3, all 29 blocked, the least-cost candidate is the first (the default, candidate %d, cost %d)"),
        ("node", 2, last, 15, False, None, "node label u=2, all 29 blocked, the least-cost candidate is the last (candidate %d, cost %d)"),
        ("edge", 2, last, 16, False, None, "edge label u=2, all 29 blocked, the least-cost candidate is the last (candidate %d, cost %d)"),
        ("node", 2, tie, 17, False, None, "node label u=2, all 29 blocked, the minimum cost is reached by several candidates (first-minimum wins, last-minimum would differ; candidate %d, cost %d)"),
        ("edge", 2, tie, 18, False, None, "edge label u=2, all 29 blocked, a tie for the minimum cost (first wins; candidate %d, cost %d)"),
        ("node", 2, differs({"fallback": "min_nodistinct"}), 19, True, None, "node label u=2, duplicated (identical) node boxes: counting identical boxes once changes the winner (candidate %d, cost %d; counting copies would pick another)"),
        ("edge", 2, differs({"fallback": "min_nodistinct"}), 20, True, None, "edge label u=2, duplicated node boxes: distinct counting changes the winner (candidate %d, cost %d)"),
        ("node", 2, differs({"fallback": "min_nodes"}), 21, False, 6, "six node labels, the last falls back and its cost depends on earlier PLACED LABEL boxes (ignoring them changes the winner; candidate %d, cost %d)"),
        ("edge", 2, differs({"fallback": "min_labels"}), 22, False, 6, "six edge labels, the last falls back and its cost depends on NODE boxes (ignoring them changes the winner; candidate %d, cost %d)"),
        ("node", 2, differs({"fallback": "min_gap0"}), 23, False, 6, "six node labels, the last falls back; costing with a gap of 0 instead of 1 px would change the winner (candidate %d, cost %d)"),
        ("edge", 2, differs({"record": "default"}), 24, False, 6, "six edge labels with fallbacks: recording a placed box at the default instead of its chosen position changes a later result (candidate %d, cost %d)"),
        ("node", 2, differs({"record": "skip_fallback"}), 25, False, 6, "six node labels: a fallback label that is not recorded changes a later result (candidate %d, cost %d)"),
        ("edge", 2, differs({"record": "none"}), 26, True, 6, "six edge labels, identical-ish anchors: labels that never see earlier labels give another result (candidate %d, cost %d)"),
        ("node", 2, differs({"fallback": "min_nodistinct"}), 27, True, 8, "eight node labels, mostly identical defaults: earlier identical placed boxes count once in the cost (counting copies changes the winner; candidate %d, cost %d)"),
        ("node", 2, lambda nd, lb: res(nd, lb)[-1][0] < -11 and differs({"fallback": "min_first11"})(nd, lb), 28, False, None, "node label u=2: the winner lies beyond candidate 11 (a min over the first 11 only would differ; candidate %d, cost %d)"),
        ("edge", 2, lambda nd, lb: res(nd, lb)[-1][0] < -11 and differs({"fallback": "min_first11"})(nd, lb), 29, False, None, "edge label u=2: the winner lies beyond candidate 11 (candidate %d, cost %d)"),
    ]
    for kind, u, acc, seed, dups, multi, note in plan:
        n += 1
        nodes, labels = scene(kind, u, acc, seed, dups, multi)
        r = res(nodes, labels)[-1][0]
        c = costs_last(nodes, labels)
        add("F%02d" % n, "F", note % (-r, c[-r - 1]) + " [seeded search %d]" % seed, nodes, labels,
            [("fb", -r)] if len(labels) == 1 else None)


# ----------------------------------------------------------------------------- G: the 1 px gap
def rows_G():
    U = 2
    X, Y = P(500), P(500)               # edge label u=2 (9u = 18 px wide): box 491..509 x 490..503
    L, T, R_, B = 491, 490, 509, 503
    gaps = (("1px", PX), ("1px-1", PX - 1), ("0", 0))
    exp_move = {"R": 5, "L": 4, "T": 3, "B": 2}
    for side in "RLTB":
        for gname, g in gaps:
            if side == "R":
                node = (P(R_ + 13) + g, P(496))
            elif side == "L":
                node = (P(L - 13) - g, P(496))
            elif side == "T":
                node = (P(500), P(T - 13) - g)
            else:
                node = (P(500), P(B + 13) + g)
            free = g >= PX
            add("G-N%s-%s" % (side, gname), "G",
                "node box %s the label box at a gap of %s px (u=2 edge label 491..509 x 490..503): %s" %
                ({"R": "right of", "L": "left of", "T": "above", "B": "below"}[side], gname,
                 "free, default stays" if free else "collides, hand-derived first free candidate is %d" % exp_move[side]),
                [node], [("edge", U, X, Y)], [1 if free else exp_move[side]])
    exp_move_b = {"R": 2, "L": 2, "T": 3, "B": 2}
    for side in "RLTB":
        for gname, g in gaps:
            if side == "R":
                bx, by = X + P(18) + g, Y
            elif side == "L":
                bx, by = X - P(18) - g, Y
            elif side == "T":      # B below A
                bx, by = X, Y + P(13) + g
            else:                  # B above A
                bx, by = X, Y - P(13) - g
            free = g >= PX
            add("G-L%s-%s" % (side, gname), "G",
                "label B %s label A (both u=2 edge labels) at a gap of %s px: %s" %
                ({"R": "right of", "L": "left of", "T": "below", "B": "above"}[side], gname,
                 "B free at its default" if free else "B collides, hand-derived candidate %d" % exp_move_b[side]),
                [], [("edge", U, X, Y), ("edge", U, bx, by)], [1, 1 if free else exp_move_b[side]])
    cases = [("1px-1px", PX, PX, True), ("1px-0", PX, 0, True), ("0-1px", 0, PX, True),
             ("0.8-0.8", 800000, 800000, False), ("0.999999-0.999999", PX - 1, PX - 1, False), ("0-0", 0, 0, False),
             ("1px-0.999999", PX, PX - 1, True)]
    corners = ((1, -1), (-1, -1), (1, 1), (-1, 1))            # NE, NW, SE, SW
    for cname, gx, gy, free in cases:
        nodes, labels, exp = [], [], []
        for si, (sx, sy) in enumerate(corners):
            lx, ly = X + P(4000 * si), Y
            cx = lx + sx * (P(9 + 13) + gx)
            cy = ly - P(10 + 13) - gy if sy == -1 else ly + P(3 + 13) + gy
            nodes.append((cx, cy))
            labels.append(("edge", U, lx, ly))
            exp.append(1 if free else ("ne", 1))
        add("G-NC-%s" % cname, "G",
            "node boxes at the four corners (NE, NW, SE, SW) of a u=2 label, x gap %d micro-px, y gap %d micro-px: %s (4 scenes 4000 px apart)" %
            (gx, gy, "free (a gap of 1 px on either axis separates)" if free else "collide (both axis gaps < 1 px)"),
            nodes, labels, exp)
        labels, exp = [], []
        for si, (sx, sy) in enumerate(corners):
            lx, ly = X + P(4000 * si), Y
            bx = lx + sx * (P(18) + gx)
            by = ly + sy * (P(13) + gy)
            labels += [("edge", U, lx, ly), ("edge", U, bx, by)]
            exp += [1, 1 if free else ("ne", 1)]
        add("G-LC-%s" % cname, "G",
            "label B at the four corners of label A (both u=2), x gap %d micro-px, y gap %d micro-px: %s (4 scenes 4000 px apart)" %
            (gx, gy, "free" if free else "collide"), [], labels, exp)


def rows_GH():
    """The 1 px gap with half-pixel box edges: odd u (4.5u px half width, e.g. u=3: 13.5 px)."""
    X, Y = P(500), P(500)               # edge label u=3: box 486.5..513.5 x 490..503
    gaps = (("1px", PX), ("1px-1", PX - 1), ("0", 0))
    for side in "RL":
        for gname, g in gaps:
            node = (P(526) + 500000 + g, P(496)) if side == "R" else (P(473) + 500000 - g, P(496))
            free = g >= PX
            hand = 5 if side == "R" else 4
            add("G-HN%s-%s" % (side, gname), "G",
                "odd u=3 edge label (box 486.5..513.5 x 490..503), node box %s at a gap of %s px (half-pixel edge): %s" %
                ("right of it" if side == "R" else "left of it", gname, "free" if free else "collides, hand-derived candidate %d (h = 14+10 = 24)" % hand),
                [node], [("edge", 3, X, Y)], [1 if free else hand])
    for side in "RL":
        for gname, g in gaps:
            bx = X + P(27) + g if side == "R" else X - P(27) - g
            free = g >= PX
            add("G-HL%s-%s" % (side, gname), "G",
                "odd u=3: label B %s label A (both u=3 edge labels, half-pixel edges) at a gap of %s px: %s" %
                ("right of" if side == "R" else "left of", gname, "B free at its default" if free else "B collides, hand-derived candidate 2"),
                [], [("edge", 3, X, Y), ("edge", 3, bx, Y)], [1, 1 if free else 2])
    # odd u: the side candidate is 1.5 px (not 1 px) from the own node: a node 1 px beyond that edge does not collide, 1 px - 1 micro-px does
    X2, Y2 = P(200), P(224)
    for gname, g in (("1px", PX), ("1px-1", PX - 1)):
        # node label u=1: candidate 3 (h=18,-20) box x = cx+14.5 .. cx+21.5, y = cy-6 .. cy+7 ; blocker above-left forcing candidates 1,2 blocked is
        # built by search; here a node whose box bottom edge lies g above the candidate-3 box top (cy-6): bottom = cy-6-g
        nodes = [(X2, Y2 - 24 * PX)] + blockers("node", 1, X2, Y2, [0, 1], [label_box(X2 + 19 * PX, Y2 - 20 * PX, 1)])
        cand = label_box(X2 + 19 * PX, Y2 - 20 * PX, 1)
        # extra node directly above candidate 3, at a vertical gap g (whole pixels in x, y with micro-pixel g)
        nodes.append((X2 + 19 * PX, cand[1] - g - 13 * PX))
        add("G-HC3-%s" % gname.replace("-", "m"), "G",
            "odd u=1 node label: candidates 1 and 2 blocked, an extra node box %s above the box of candidate 3 (h = 5+14 = 19): %s" %
            (gname, "candidate 3 taken" if g >= PX else "candidate 3 collides, first free one derived by the reference"),
            nodes, [("node", 1, X2, Y2)], [3] if g >= PX else [("ne", 3)])


# ----------------------------------------------------------------------------- O, B, I: order and blocking
def rows_O():
    A = ("edge", 2, P(500), P(500))
    Bq = ("edge", 2, P(500), P(505))
    C3 = ("edge", 2, P(500), P(495))
    add("O01", "O", "order A,B (edge u=2, defaults 5 px apart): A default, B moves", [], [A, Bq], [1, ("ne", 1)])
    add("O02", "O", "order B,A (the same labels swapped): B default, A moves; the result differs from O01 (asserted)", [], [Bq, A], [1, ("ne", 1)])
    add("O03", "O", "three labels, order A,B,C", [], [A, Bq, C3], [1, ("ne", 1), ("ne", 1)])
    add("O04", "O", "three labels, order C,A,B", [], [C3, A, Bq], [1, ("ne", 1), ("ne", 1)])
    add("O05", "O", "three labels, order B,C,A", [], [Bq, C3, A], [1, ("ne", 1), ("ne", 1)])
    N = ("node", 3, P(200), P(224))
    E = ("edge", 3, P(200), P(224))
    own = [(P(200), P(200))]
    add("O06", "O", "node label before edge label (the caller's order): node label default, the edge label on the same default moves", own, [N, E], [1, ("ne", 1)])
    add("O07", "O", "edge label before node label (the function does not reorder): edge label default, the node label moves", own, [E, N], [1, ("ne", 1)])
    X, Y = P(500), P(500)
    Bd = label_box(X, Y - 14 * PX, 2)
    nodes = blockers("edge", 2, X, Y, [0], [Bd])
    add("B01", "B", "A is pushed to (0,-14) by a node; B's default is exactly A's chosen box: B must see A at its CHOSEN position",
        nodes, [("edge", 2, X, Y), ("edge", 2, X, Y - 14 * PX)], [2, ("ne", 1)])
    add("B02", "B", "chain: A default; B (5 px below) pushed; C on B's neighbourhood collides",
        [], [("edge", 2, P(500), P(500)), ("edge", 2, P(500), P(505)), ("edge", 2, P(500), P(490))], [1, ("ne", 1), ("ne", 1)])
    add("B03", "B", "node label first (own node (200,200)); an edge label with the same default (box 214..227, free of the own node) must move: edge labels see node labels",
        own, [("node", 3, P(200), P(224)), ("edge", 3, P(200), P(224))], [1, ("ne", 1)])
    add("B04", "B", "edge label then edge label on the same default: edge labels see earlier edge labels", [], [("edge", 3, P(0), P(0)), ("edge", 3, P(0), P(0))], [1, 2])
    add("B05", "B", "edge label default on top of a node box, no label near it: edge labels see node boxes",
        [(P(300), P(300))], [("edge", 6, P(300), P(300))], [("ne", 1)])
    add("B06", "B", "node label whose default is blocked by another node's box (node at (212,224)): node labels see other nodes",
        [(P(200), P(200)), (P(212), P(224))], [nl(P(200), P(200), 3)], [("ne", 1)])
    add("B07", "B", "two node labels of nodes 14 px apart (the labels overlap): second moves, first stays",
        [(P(200), P(200)), (P(214), P(200))], [nl(P(200), P(200), 3), nl(P(214), P(200), 3)], [1, ("ne", 1)])


def rows_I():
    own = [(P(200), P(200))]
    L3 = ("node", 3, P(200), P(224))
    L8 = ("node", 8, P(200), P(224))
    add("I01", "I", "two node labels, identical defaults (u=3)", own, [L3] * 2, [1, 2])
    add("I02", "I", "three identical node labels", own, [L3] * 3, [1, 2, 3])
    add("I03", "I", "five identical node labels", own, [L3] * 5, [1, 2, 3, 4, 5])
    add("I04", "I", "twelve identical node labels u=3 (half width 13.5): the side candidate (h,-34) has its left edge at cx+14.5, exactly 1 px from the right edge cx+13.5 of the column label (0,-41), so it is free: candidates 1..12 in order", own, [L3] * 12,
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    add("I12", "I", "twelve identical node labels u=4 (half width 18 > 13): the side candidates (+-h,-34) and (+-h,-6) overlap the column candidates, so candidates 7..10 are skipped: 1..6, 11, 12 (hand-derived prefix; the rest from the reference)", own, [("node", 4, P(200), P(224))] * 12,
        [1, 2, 3, 4, 5, 6, 11, 12])
    add("I05", "I", "twelve identical node labels u=8 (half width 36 > 13): the side candidates (+-h,-34) overlap the column candidate (0,-41) in x and y, (+-h,-6) overlap the box at the default, so candidates 7..10 are skipped, label 7 takes candidate 11, label 8 candidate 12 (hand-derived prefix; the rest from the reference)",
        own, [L8] * 12, [1, 2, 3, 4, 5, 6, 11, 12])
    E2 = ("edge", 2, P(0), P(0))
    E4 = ("edge", 4, P(0), P(0))
    add("I06", "I", "five identical edge labels u=2", [], [E2] * 5, [1, 2, 3, 4, 5])
    add("I07", "I", "six identical edge labels u=4: (+-h,0) collide with the label at the default (10 < 4.5u+1 for u >= 3), so the column candidates 6, 7 and 12 follow candidate 3 (hand-derived: 1, 2, 3, 6, 7, 12)",
        [], [E4] * 6, [1, 2, 3, 6, 7, 12])
    add("I08", "I", "two identical edge labels u=1", [], [("edge", 1, P(5), P(5))] * 2, [1, 2])
    add("I10", "I", "thirty-one identical node labels u=8: the wide labels stack in the column and the sides, then fallbacks (values from the reference)", own, [L8] * 31)
    add("I11", "I", "thirty-one identical edge labels u=4: the eleven column slots 1, 2, 3, 6, 7, 12, 15, 18, 21, 24, 27 (hand-derived prefix), then fallbacks", [], [E4] * 31,
        [1, 2, 3, 6, 7, 12, 15, 18, 21, 24, 27])
    add("I09", "I", "identical anchor, units 1,2,3,4,5 (edge labels): spreads through the candidates (values from the reference)",
        [], [("edge", u, P(0), P(0)) for u in (1, 2, 3, 4, 5)], None)


# ----------------------------------------------------------------------------- D: dense clusters
S5 = [0, 309017, 587785, 809017, 951057, 1000000]       # sin(18 j degrees) in micro units


def unit(j):
    q, r = divmod(j % 20, 5)
    c, s = S5[5 - r], S5[r]
    for _ in range(q):
        c, s = -s, c
    return c, s


def ring(R, cx0, cy0, chord_off=5):
    nodes = []
    for i in range(20):
        c, s = unit(i)
        nodes.append((cx0 + R // PX * c, cy0 + R // PX * s))
    edges = [(i, (i + 1) % 20) for i in range(20)]
    edges += [(i, (i + chord_off + i % 4) % 20) for i in range(17)]
    assert len(edges) == 37
    labels = [nl(nodes[i][0], nodes[i][1], 3 + (7 * i) % 6) for i in range(20)]
    for e, (a, b) in enumerate(edges):
        mx, my = (nodes[a][0] + nodes[b][0]) // 2, (nodes[a][1] + nodes[b][1]) // 2
        labels.append(el(mx, my, 2 + (5 * e) % 7))
    return nodes, labels


def gridlayout(cols, rows_, step, cx0, cy0):
    nodes = [(cx0 + step * (i % cols), cy0 + step * (i // cols)) for i in range(cols * rows_)]
    edges = []
    for i in range(cols * rows_):
        if i % cols + 1 < cols:
            edges.append((i, i + 1))
        if i // cols + 1 < rows_:
            edges.append((i, i + cols))
    k = 0
    while len(edges) < 37:
        i = (k * 3) % ((rows_ - 1) * cols - 1)
        if i % cols + 1 < cols:
            edges.append((i, i + cols + 1))
        k += 1
    labels = [nl(nodes[i][0], nodes[i][1], 3 + (7 * i) % 6) for i in range(len(nodes))]
    for e, (a, b) in enumerate(edges):
        mx, my = (nodes[a][0] + nodes[b][0]) // 2, (nodes[a][1] + nodes[b][1]) // 2
        labels.append(el(mx, my, 2 + (5 * e) % 7))
    return nodes, labels


DENSE = {}


def rows_D():
    for rid, R in (("D01", 90), ("D02", 140), ("D03", 220), ("D04", 400)):
        nodes, labels = ring(P(R), P(500), P(500))
        DENSE[rid] = (nodes, labels)
        add(rid, "D", "20 nodes on a 20-gon of radius %d px, 20 node labels (u 3..8) then 37 edge labels (20 ring edges + 17 chords) at chord midpoints (u 2..8)" % R, nodes, labels)
    nodes, labels = gridlayout(5, 4, P(60), P(100), P(100))
    DENSE["D05"] = (nodes, labels)
    add("D05", "D", "5x4 grid of 20 nodes (60 px apart), 20 node labels and 37 edge labels (31 grid edges + 6 diagonals)", nodes, labels)
    nodes, labels = ring(P(120), P(500), P(500), 9)
    DENSE["D06"] = (nodes, labels)
    add("D06", "D", "ring of radius 120 with another chord pattern", nodes, labels)
    nodes, labels = ring(P(90), P(500), P(500))
    add("D07", "D", "ring of radius 90 with the 20 node labels only (no edge labels)", nodes, labels[:20])
    add("D08", "D", "ring of radius 90 with the 37 edge labels only", nodes, labels[20:])


def shift(nodes, labels, dx, dy):
    return ([(a + dx, b + dy) for a, b in nodes], [(k, u, x + dx, y + dy) for k, u, x, y in labels])


TRANS = {}


def rows_T():
    base_id = "D02"
    bn, bl = DENSE[base_id]
    shifts = [("T01", P(64), P(64), "shift (+64,+64) px: one whole cell"),
              ("T02", P(-64), P(-64), "shift (-64,-64) px"),
              ("T03", P(-500), P(-500), "cluster centred on the origin: labels straddle zero in both axes"),
              ("T04", P(-1000), P(-1000), "all coordinates negative"),
              ("T05", P(-500) - 37, P(-500) + 999999, "origin-centred, off by (-37, +999999) micro-px"),
              ("T06", TWO40 * PX, TWO40 * PX, "shift (2^40, 2^40) px (about 1.1e18 micro-px: beyond float64 integers)"),
              ("T07", -TWO40 * PX, -TWO40 * PX, "shift (-2^40, -2^40) px"),
              ("T08", TWO40 * PX + 123457, -TWO40 * PX - 500001, "mixed signs, odd micro-px fractions"),
              ("T09", P(-500) + 500000, P(-500) + 1, "origin-centred, half a pixel and 1 micro-px"),
              ("T10", P(-32), P(-32) - 1, "shift of (-32 px, -32 px - 1 micro-px): boxes straddle cell boundaries elsewhere")]
    for rid, dx, dy, note in shifts:
        n2, l2 = shift(bn, bl, dx, dy)
        TRANS[rid] = base_id
        add(rid, "T", "translation of D02: " + note + "; the expected file equals D02's (translation invariance, asserted)", n2, l2)


# ----------------------------------------------------------------------------- N: cell boundaries, far coordinates; M: fractions
def rows_N():
    for k in (-1, 0, 1):
        for gname, g in (("1px", PX), ("1px-1", PX - 1)):
            node = (P(64 * k - 13), P(500))
            X = P(64 * k + 9) + g
            add("N-B%d-%s" % (k, gname.replace("-", "m")), "N",
                "node box right edge exactly at %d px (a multiple of 64 px), u=2 edge label left edge %s to the right of it: %s" %
                (64 * k, gname, "free" if g >= PX else "collides"),
                [node], [("edge", 2, X, P(500))], [1 if g >= PX else ("ne", 1)])
    for k in (-1, 0, 1):
        for axis in "xy":
            for cname, a, b in (("0.5+0.2", 500000, 200000), ("0.5+0.5", 500000, 500000), ("0.5+0.499999", 500000, 499999)):
                free = a + b >= PX
                if axis == "x":
                    node = (P(64 * k) - a - P(13), P(500))
                    lab = ("edge", 2, P(64 * k) + b + P(9), P(500))
                else:
                    node = (P(500), P(64 * k) - a - P(13))
                    lab = ("edge", 2, P(500), P(64 * k) + b + P(10))
                add("N-A%d%s-%s" % (k, axis, cname.replace("+", "p").replace(".", "")), "N",
                    "%s axis: node box edge at %d px - %d micro-px, label box edge at %d px + %d micro-px (gap %d micro-px; the two edges lie in different 64 px cells): %s" %
                    (axis, 64 * k, a, 64 * k, b, a + b, "free" if free else "collides"),
                    [node], [lab], [1 if free else ("ne", 1)])
    add("N01", "N", "negative coordinates: node and its label at (-200,-200) px", [(P(-200), P(-200))], [nl(P(-200), P(-200), 4)], [1])
    for gname, g in (("1px", PX), ("1px-1", PX - 1)):
        add("N-Z%s" % gname.replace("-", "m"), "N",
            "straddling x=0: u=3 label (box -13.5..13.5 px) at the origin, a node box whose right edge is at -13.5 px minus the gap %s (label left edge is -13.5 px): %s" % (gname, "free" if g >= PX else "collides"),
            [(-P(13) - 500000 - g - P(13), P(-5))], [("edge", 3, P(0), P(0))], [1 if g >= PX else ("ne", 1)])
    for rid, sx, sy, nm in (("NF01", TWO40, TWO40, "(+2^40,+2^40) px"), ("NF02", -TWO40, -TWO40, "(-2^40,-2^40) px"), ("NF03", TWO40, -TWO40, "(+2^40,-2^40) px")):
        add(rid, "N", "node label with its own node at " + nm + ": default", [(P(sx), P(sy))], [nl(P(sx), P(sy), 6)], [1])
    for sgn, nm in ((1, "p"), (-1, "m")):
        for gname, g in (("1px", PX), ("1px-1", PX - 1)):
            base = sgn * TWO40
            add("NF-%s%s" % (nm, gname.replace("-", "m")), "N",
                "far %s2^40 px: node box right edge at %s2^40 px exactly, u=2 label left edge %s to the right (1 micro-px resolution at 1e18): %s" %
                ("+" if sgn > 0 else "-", "+" if sgn > 0 else "-", gname, "free" if g >= PX else "collides"),
                [(P(base - 13), P(500))], [("edge", 2, P(base + 9) + g, P(500))], [1 if g >= PX else ("ne", 1)])
    add("NF-P62", "N", "coordinates exactly +2^62 micro-px (the allowed bound): node (2^62, 2^62-24px), its label at (2^62, 2^62)",
        [(TWO62, TWO62 - P(24))], [("node", 3, TWO62, TWO62)], [1])
    add("NF-M62", "N", "coordinates exactly -2^62 micro-px: node (-2^62,-2^62), label at (-2^62, -2^62+24px)",
        [(-TWO62, -TWO62)], [("node", 3, -TWO62, -TWO62 + P(24))], [1])
    add("NF-C62", "N", "collision near 2^62: node box right edge 2^62-20px, u=2 label left edge 1px-1 micro-px to its right: collides",
        [(TWO62 - P(33), P(0))], [("edge", 2, TWO62 - P(20) + P(9) + PX - 1, P(0))], [("ne", 1)])


def rows_M():
    for f in (1, 500000, 999999):
        for gname, g in (("1px", PX), ("1px-1", PX - 1)):
            node = (P(522) + g + f, P(496) + f)
            add("M-%d-%s" % (f, gname.replace("-", "m")), "M", "fraction %d micro-px on every coordinate; node box %s to the right of the u=2 label box: %s" %
                (f, gname, "free" if g >= PX else "collides (hand-derived candidate 5)"),
                [node], [("edge", 2, P(500) + f, P(500) + f)], [1 if g >= PX else 5])
    add("M07", "M", "own node 1 micro-px off in x: still flush vertically, default",
        [(P(100) + 1, P(100))], [("node", 3, P(100), P(124))], [1])
    add("M08", "M", "label B 1 micro-px closer than 1 px (vertically) to label A: collides",
        [], [("edge", 3, P(50) + 7, P(50) + 3), ("edge", 3, P(50) + 7, P(50) + 3 + P(13) + PX - 1)], [1, ("ne", 1)])
    add("M09", "M", "label B exactly 1 px from label A vertically (fractional coordinates): free",
        [], [("edge", 3, P(50) + 7, P(50) + 3), ("edge", 3, P(50) + 7, P(50) + 3 + P(13) + PX)], [1, 1])
    n2, l2 = shift(*DENSE["D02"], 999999, 1)
    add("M10", "M", "ring D02 shifted by (999999, 1) micro-px (every midpoint rounds differently)", n2, l2)


# ----------------------------------------------------------------------------- X: own node, H: huge units
def rows_X():
    nodes, labels, exp = [], [], []
    for i, u in enumerate((1, 2, 3, 12, 40, 200)):
        cx, cy = P(5000 * i), P(0)
        nodes.append((cx, cy))
        labels.append(nl(cx, cy, u))
        exp.append(1)
    add("X01", "X", "default (0,0) is free of the own node by construction for u = 1, 2, 3, 12, 40, 200 (six scenes 5000 px apart)", nodes, labels, exp)
    add("X02", "X", "label default y = cy + 20: box overlaps the own node; (0,-41) is free (5 px above the node top)",
        [(P(100), P(100))], [("node", 1, P(100), P(120))], [2])
    add("X03", "X", "label 20 px to the right of its node (u=2): default free (the node is at the label's left)",
        [(P(100), P(100))], [("node", 2, P(120), P(124))], [1])
    cb = cand_boxes("node", 2, P(120), P(124))
    add("X04", "X", "as X03, default and (0,-41) blocked by other nodes: (h,-20) is taken",
        [(P(100), P(100))] + blockers("node", 2, P(120), P(124), [0, 1], [cb[2]]),
        [("node", 2, P(120), P(124))], [3])
    add("X05", "X", "as X03, candidates 1..3 blocked: candidate 4 (-h,-20) has right edge cx+6 and overlaps the OWN node (the function cannot know it is the own one), so candidate 5 (0,14) is taken",
        [(P(100), P(100))] + blockers("node", 2, P(120), P(124), [0, 1, 2], [cb[4]]),
        [("node", 2, P(120), P(124))], None)


def rows_H():
    X, Y = P(0), P(0)
    U = 10 ** 6
    add("H01", "H", "edge label u=10^6 (box 9e6 px wide), no obstacles: default", [], [("edge", U, X, Y)], [1])
    add("H02", "H", "node label u=10^6 with its own node: default", [(P(0), P(-24))], [("node", U, P(0), P(0))], [1])
    add("H03", "H", "edge label u=10^6, one node inside the box at x = 10^6 px: (0,*) and (h,0) still hit it; (-h,0) (h = 4.5e6+10, box x -9e6-10..-10) clears it",
        [(P(1000000), P(0))], [("edge", U, X, Y)], [5])
    add("H04", "H", "three identical edge labels u=10^6", [], [("edge", U, X, Y)] * 3, [1, 2, 3])
    add("H05", "H", "twelve identical edge labels u=10^5: the eleven column slots 1, 2, 3, 6, 7, 12, 15, 18, 21, 24, 27, then the twelfth has no free candidate (fallback)",
        [], [("edge", 10 ** 5, X, Y)] * 12, [1, 2, 3, 6, 7, 12, 15, 18, 21, 24, 27, ("fb",)])
    add("H06", "H", "wide node label (u=10^6) first, then a u=1 edge label 5000 px away inside the wide box: it must move",
        [(P(0), P(-24))], [("node", U, P(0), P(0)), ("edge", 1, P(5000), P(5))], [1, ("ne", 1)])


# ----------------------------------------------------------------------------- R: seeded random rows
def rows_R2():
    for rid, note, nodes, labels, name in r2.rows():
        add(rid, "R2", note, nodes, labels)


def rows_R():
    for n in range(1, 16):
        r = random.Random(9000 + n)
        W = r.choice((60, 90, 140, 220, 400))
        frac = r.choice((0, 0, 1, 2))
        org = r.choice((0, 0, -100, 5000, -3000))

        def co():
            v = P(org + r.randrange(0, W))
            if frac == 1:
                v += r.choice((1, 500000, 999999))
            elif frac == 2:
                v += r.randrange(0, PX)
            return v
        nn = r.randrange(0, 15)
        nodes = [(co(), co()) for _ in range(nn)]
        nlab = r.randrange(1, 18)
        kinds = ["node"] * r.randrange(0, nlab + 1)
        kinds += ["edge"] * (nlab - len(kinds))
        if r.random() < 0.25:
            r.shuffle(kinds)
        labels = []
        for kd in kinds:
            u = r.choice((1, 1, 2, 3, 4, 5, 6, 8, 12))
            if kd == "node" and nodes and r.random() < 0.7:
                cx, cy = nodes[r.randrange(nn)]
                labels.append(nl(cx, cy, u))
            else:
                labels.append((kd, u, co(), co()))
        add("R%02d" % n, "R", "seeded random scene (seed %d): %d nodes, %d labels, window %d px, fraction mode %d, origin %d px" %
            (9000 + n, nn, nlab, W, frac, org), nodes, labels)


# ----------------------------------------------------------------------------- S: stress
def rows_S():
    nodes, labels = [], []
    cols = 24
    step = 60
    for i in range(cols * cols):
        nodes.append((P(step * (i % cols)), P(step * (i // cols))))
    for i in range(cols * cols):
        labels.append(nl(nodes[i][0], nodes[i][1], 2 + (3 * (i // cols) + 7 * (i % cols)) % 9))
    e = 0
    for i in range(cols * cols):
        for j in ((i + 1) if i % cols + 1 < cols else None, (i + cols) if i // cols + 1 < cols else None):
            if j is None:
                continue
            mx, my = (nodes[i][0] + nodes[j][0]) // 2, (nodes[i][1] + nodes[j][1]) // 2
            labels.append(el(mx, my, 1 + (5 * e + 11 * (e // 7)) % 8))
            e += 1
    add("S01", "S", "24x24 grid of nodes (60 px), 576 node labels (u 2..10) then %d edge labels (right and down neighbours)" % e, nodes, labels, tier="stress")
    r = random.Random(777)
    fr = (0, 0, 500000, 1, 999999)
    nodes = [(P(r.randrange(0, 5000), r.choice(fr)), P(r.randrange(0, 5000), r.choice(fr))) for _ in range(2500)]
    labels = []
    for i in range(2500):
        labels.append(nl(nodes[i][0], nodes[i][1], r.choice((1, 2, 3, 4, 5, 6, 8, 10))))
    for _ in range(2500):
        i = r.randrange(2500)
        j = min(2499, max(0, i + r.randrange(-40, 41)))
        mx, my = (nodes[i][0] + nodes[j][0]) // 2, (nodes[i][1] + nodes[j][1]) // 2
        labels.append(el(mx, my, r.choice((1, 2, 3, 4, 5, 6, 8, 10, 14))))
    add("S02", "S", "5,000 labels (2,500 node labels then 2,500 edge labels) over 2,500 random nodes in a 5000x5000 px window, fractional coordinates", nodes, labels, tier="stress")
    add("S03", "S", "adversarial density: 600 identical node labels u=3 on one node (all boxes in the same cells; 29 take candidates, the rest fall back with a full cost pass)",
        [(P(0), P(0))], [("node", 3, P(0), P(24))] * 600, tier="stress")


def build():
    del ROWS[:]
    BY_ID.clear()
    DENSE.clear()
    TRANS.clear()
    rows_E(); rows_C(); rows_W(); rows_F(); rows_G(); rows_GH(); rows_O(); rows_I()
    rows_D(); rows_T(); rows_N(); rows_M(); rows_X(); rows_H(); rows_R(); rows_R2(); rows_S()
    return ROWS
