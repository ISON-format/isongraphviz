"""Seeded scene search for the rev 2 fallback rows (deterministic: random.Random(int) only).

A scene is (nodes, labels). `find` returns the first scene (in seed order) accepted by a predicate; the generator
stops if none is found. Predicates compare the reference (lp.py) with a faulty engine (mut.py) or inspect the
reference result, so every found row provably separates the reading from the fault it is meant to catch.
"""
import random

import lp
import mut
from lp import PX


def dense_single(rng, kind, u, dups=False, nmin=35, nmax=70):
    """One label at (300, 300) px and 35..70 random whole-pixel nodes around it (all 29 candidates usually blocked)."""
    h = lp.half_h(u) + (14 if kind == "node" else 10)
    X, Y = 300, 300
    if kind == "node":
        label = ("node", u, P(X), P(Y + 24))
        nodes = [(P(X), P(Y))]
        ylo, yhi = Y - 110, Y + 100
    else:
        label = ("edge", u, P(X), P(Y - 4))
        nodes = []
        ylo, yhi = Y - 80, Y + 80
    xr = h + (9 * u) // 2 + 20
    n = rng.randrange(nmin, nmax)
    while len(nodes) < n:
        c = (P(X + rng.randrange(-xr, xr + 1)), P(rng.randrange(ylo, yhi + 1)))
        nodes.append(c)
        if dups and rng.random() < 0.35:
            nodes.append(c)                      # identical node box
    return nodes, [label]


def multi(rng, kind, u, nl, dups=False):
    """nl identical or nearly identical labels plus a few nodes: later labels fall back onto earlier label boxes."""
    h = lp.half_h(u) + (14 if kind == "node" else 10)
    X, Y = 300, 300
    nodes = []
    labels = []
    xr = h + (9 * u) // 2 + 20
    for _ in range(rng.randrange(8, 25)):
        nodes.append((P(X + rng.randrange(-xr, xr + 1)), P(Y + rng.randrange(-100, 101))))
    for i in range(nl):
        dx = 0 if (dups and rng.random() < 0.6) else rng.randrange(-3, 4)
        dy = 0 if (dups and rng.random() < 0.6) else rng.randrange(-3, 4)
        if kind == "node":
            labels.append(("node", u, P(X + dx), P(Y + 24 + dy)))
        else:
            labels.append(("edge", u, P(X + dx), P(Y - 4 + dy)))
    return nodes, labels


def P(v):
    return v * PX


def find(make, accept, seed0, tries=4000):
    for t in range(tries):
        rng = random.Random(seed0 * 100000 + t)
        nodes, labels = make(rng)
        if accept(nodes, labels):
            return nodes, labels, t
    raise SystemExit("scene search failed (seed %d)" % seed0)


def all_fallback(res):
    return res[-1][0] < 0


def costs(nodes, labels, upto):
    """Independent recomputation of the candidate costs of label number `upto` (0-based) given the reference placements
    of the labels before it: returns (list of distinct-colliding-box counts, list of raw counts)."""
    res = lp.place_labels_idx(nodes, labels)
    obst = [lp.node_box(cx, cy) for cx, cy in nodes]
    for (kind, u, x, y), (_i, dx, dy) in list(zip(labels, res))[:upto]:
        obst.append(lp.label_box(x + dx * PX, y + dy * PX, u))
    kind, u, x, y = labels[upto]
    cands = lp.node_candidates(u) if kind == "node" else lp.edge_candidates(u)
    out, raw = [], []
    for (dx, dy) in cands:
        b = lp.label_box(x + dx * PX, y + dy * PX, u)
        hit = [o for o in obst if lp.collide(b, o)]
        out.append(len({tuple(o) for o in hit}))
        raw.append(len(hit))
    return out, raw
