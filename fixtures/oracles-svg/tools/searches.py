"""Seeded searches that build the scenes of rows N01, N03 and N15 (15.4, 15.5, 15.5a).

The searches use the standalone integer formulas below (the variants V1-V9 of 15.5a written
out as functions); the generator then re-checks the result with the real renderer under the
mutants K09-K14 and K109-K111, so a mistake in these mirrors cannot reach the corpus.

PRNG: 32-bit LCG  s' = (1664525 * s + 1013904223) mod 2^32, output s' >> 8 (24 bits).
"""
from svg import fmt, div_round, floor_div, isqrt, S
import math

Z = 1001                     # odd zoom: screen coordinates get arbitrary micro-pixel residues
W, H = 900, 600
OX, OY = W * 500000, H * 500000


class Lcg:
    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def next(self):
        self.s = (1664525 * self.s + 1013904223) & 0xFFFFFFFF
        return self.s >> 8

    def rng(self, lo, hi):          # inclusive
        span = hi - lo + 1
        return lo + ((self.next() << 24 | self.next()) % span)


def scr(x, y):
    return (x * Z + OX, y * Z + OY)


# ---- variants of trim (15.5a V1-V3) ---------------------------------------------------------
def trim_v(P, Q, t, var=None):
    qx, qy = Q[0] - P[0], Q[1] - P[1]
    n = qx * qx + qy * qy
    k = isqrt(n)
    if var == 3:
        sq = math.sqrt(float(n))
        return (P[0] + math.floor(float(qx) * t / sq + 0.5), P[1] + math.floor(float(qy) * t / sq + 0.5))
    lam = (k + 1 if n >= k * k + k + 1 else k) if var == 1 else k
    if var == 2:
        return (P[0] + floor_div(qx * t, lam), P[1] + floor_div(qy * t, lam))
    return (P[0] + div_round(qx * t, lam), P[1] + div_round(qy * t, lam))


def straight_print(A, B, var=None):
    A2, B2 = trim_v(A, B, 12 * S, var), trim_v(B, A, 12 * S, var)
    return (fmt(A2[0]), fmt(A2[1]), fmt(B2[0]), fmt(B2[1]))


def search_trim(seed=20261117, want=3, cap=4_000_000):
    """Random straight edges 25..800 px; returns (witnesses {1,2,3: [edge,...]}, trials)."""
    g = Lcg(seed)
    found = {1: [], 2: [], 3: []}
    trials = 0
    while trials < cap and any(len(v) < want for v in found.values()):
        trials += 1
        xa = g.rng(-300000, 700000)
        ya = g.rng(-300000, 600000)
        dx = g.rng(-800000, 800000)
        dy = g.rng(-800000, 800000)
        A = scr(xa, ya)
        B = scr(xa + dx, ya + dy)
        ddx, ddy = B[0] - A[0], B[1] - A[1]
        L = isqrt(ddx * ddx + ddy * ddy)
        if L < 25 * S + 1000 or L > 800 * S:
            continue
        base = straight_print(A, B)
        for var in (1, 2, 3):
            if len(found[var]) < want and straight_print(A, B, var) != base:
                found[var].append(((xa, ya), (xa + dx, ya + dy)))
    return found, trials


# ---- anchors, midpoints, control points (V4-V9) -------------------------------------------
def par_print(A, B, F, k, p, v):
    """Printed numbers of a parallel member; v in {None, 5, 6, 8, 9}."""
    Fx, Fy = F
    nf = Fx * Fx + Fy * Fy
    Lf = isqrt(nf)
    if v == 9:
        Lf = Lf + 1 if nf >= Lf * Lf + Lf + 1 else Lf
    off = (2 * p - (k - 1)) * 16 * S
    if v == 8:
        M_ = (floor_div(A[0] + B[0], 2), floor_div(A[1] + B[1], 2))
    else:
        M_ = (div_round(A[0] + B[0], 2), div_round(A[1] + B[1], 2))
    dv = floor_div if v == 6 else div_round
    C = (M_[0] + dv(-Fy * off, Lf), M_[1] + dv(Fx * off, Lf))
    A2, B2 = trim_v(A, C, 12 * S), trim_v(B, C, 12 * S)
    if v == 5:
        an = (floor_div(A2[0] + 2 * C[0] + B2[0], 4), floor_div(A2[1] + 2 * C[1] + B2[1], 4))
    else:
        an = (div_round(A2[0] + 2 * C[0] + B2[0], 4), div_round(A2[1] + 2 * C[1] + B2[1], 4))
    return tuple(fmt(c) for c in (A2[0], A2[1], C[0], C[1], B2[0], B2[1], an[0], an[1]))


def group_print(Alo, Shi, k, v):
    """All members of an antiparallel k=2 group a->b, b->a (ranks 0, 1)."""
    F = (Shi[0] - Alo[0], Shi[1] - Alo[1])
    return par_print(Alo, Shi, F, k, 0, v) + par_print(Shi, Alo, F, k, 1, v)


def search_anchors(seed=20261118, want=2, cap=3_000_000):
    g = Lcg(seed)
    found = {"V4": [], "V7": [], "V5": [], "V6": [], "V8": [], "V9": []}
    trials = 0
    while trials < cap and any(len(v) < want for v in found.values()):
        trials += 1
        xa = g.rng(-300000, 700000)
        ya = g.rng(-300000, 600000)
        kind = trials % 3
        if kind == 0:       # straight (V4)
            if len(found["V4"]) >= want:
                continue
            dx = g.rng(-600000, 600000)
            dy = g.rng(-600000, 600000)
            A, B = scr(xa, ya), scr(xa + dx, ya + dy)
            L = isqrt((B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2)
            if L < 25 * S + 1000:
                continue
            A2, B2 = trim_v(A, B, 12 * S), trim_v(B, A, 12 * S)
            if any(floor_div(a + b, 2) != div_round(a + b, 2) and fmt(floor_div(a + b, 2)) != fmt(div_round(a + b, 2))
                   for a, b in ((A2[0], B2[0]), (A2[1], B2[1]))):
                found["V4"].append(((xa, ya), (xa + dx, ya + dy)))
        elif kind == 1:     # degenerate (V7)
            if len(found["V7"]) >= want:
                continue
            dx = g.rng(-16000, 16000)
            dy = g.rng(-16000, 16000)
            A, B = scr(xa, ya), scr(xa + dx, ya + dy)
            L = isqrt((B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2)
            if L > 24 * S:
                continue
            if any(fmt(floor_div(a + b, 2)) != fmt(div_round(a + b, 2)) for a, b in ((A[0], B[0]), (A[1], B[1]))):
                found["V7"].append(((xa, ya), (xa + dx, ya + dy)))
        else:               # parallel k=2 (V5, V6, V8, V9)
            if all(len(found[x]) >= want for x in ("V5", "V6", "V8", "V9")):
                continue
            dx = g.rng(-600000, 600000)
            dy = g.rng(-600000, 600000)
            A, B = scr(xa, ya), scr(xa + dx, ya + dy)
            L = isqrt((B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2)
            if L < 40 * S:
                continue
            base = group_print(A, B, 2, None)
            for v, key in ((5, "V5"), (6, "V6"), (8, "V8"), (9, "V9")):
                if len(found[key]) < want and group_print(A, B, 2, v) != base:
                    found[key].append(((xa, ya), (xa + dx, ya + dy)))
    return found, trials
