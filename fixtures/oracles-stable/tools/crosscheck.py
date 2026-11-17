#!/usr/bin/env python3
"""A second, deliberately naive placement implementation (no occupancy grid, no shared code with stablelib.place)
replayed over every incremental computeStableLayout row. It must agree on positions, wave numbers, ring/direction and
the meter value. It guards the oracle against its own grid or wave bookkeeping bugs (it does not guard against a
misreading of the design, which both implementations share)."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from stablelib import verify_scene, verify_layout, ref_key, DIRS, COORD_LIMIT, tref

rd = lambda rel: open(os.path.join(OUT, rel), "rb").read()


def rnd(a, b):                                   # divRound written with an explicit loop-free floor
    n, d = 2 * a + b, 2 * b
    q = n // d
    assert q * d <= n < (q + 1) * d
    return q


def naive(psc, play, nsc, cfg):
    R, S, MR = cfg["radius"], cfg["min_separation"], cfg["max_rings"]
    nodes = list(nsc.nodes)
    kept = [n for n in nodes if n in psc.nodeset]
    added = [n for n in nodes if n not in psc.nodeset]
    pos = {n: play.pos[n] for n in kept}
    nb = {n: set() for n in nodes}
    for rel, s, t, o in nsc.edges:
        if s != t: nb[s].add(t); nb[t].add(s)
    W = len(psc.nodes) + len(nodes) + 2 * (len(psc.edges) + len(nsc.edges)) + len(kept)
    kx = max(p[0] for p in pos.values()); ky = sum(p[1] for p in pos.values()); k = len(pos)
    out, wave = {}, 0
    prev_wave = None
    while len(out) < len(added):
        todo = [n for n in added if n not in out]
        if prev_wave is None:
            fr = [n for n in todo if nb[n] & set(kept)]
        else:
            fr = [n for n in todo if nb[n] & set(prev_wave)]
        seed = False
        if not fr:
            fr = [min(todo, key=ref_key)]; seed = True
        fr.sort(key=ref_key)
        snapshot = dict(pos)
        this = []
        for u in fr:
            if seed:
                m = 0; ax, ay = kx + R, rnd(ky, k)
            else:
                N = [v for v in nb[u] if v in snapshot]; m = len(N)
                ax = rnd(sum(snapshot[v][0] for v in N), m); ay = rnd(sum(snapshot[v][1] for v in N), m)
            W += 2 + m
            found = None
            for j in range(MR):
                for d in range(16):
                    cx = ax + rnd(R * (j + 1) * DIRS[d][0], 1000); cy = ay + rnd(R * (j + 1) * DIRS[d][1], 1000)
                    if abs(cx) > COORD_LIMIT or abs(cy) > COORD_LIMIT:
                        W += 1; continue
                    cell = lambda x, y: (x // S, y // S)
                    near = [p for p in pos.values() if abs(cell(*p)[0] - cell(cx, cy)[0]) <= 1 and abs(cell(*p)[1] - cell(cx, cy)[1]) <= 1]
                    W += 1 + len(near)
                    if all((cx - p[0]) ** 2 + (cy - p[1]) ** 2 >= S * S for p in pos.values()):       # ALL occupants, no grid
                        found = (j, d, cx, cy); break
                if found: break
            if not found: return None
            pos[u] = found[2:]; out[u] = (wave,) + found; this.append(u)
        prev_wave = this; wave += 1
    W += 3 * (len(psc.nodes) + len(nodes))
    return pos, out, W


def main():
    rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(OUT, "EXPECT.tsv"), encoding="utf-8")][1:]
    n = bad = 0
    for vid, grp, ps, pl, sc, inp, el, er, ed, err, work in rows:
        inp = json.loads(inp) if inp else {}
        if inp.get("fn") != "computeStableLayout" or err or not pl or not er: continue
        rep = json.loads(rd(er))
        if rep["mode"] != "incremental" or not rep["placement"]["present"]: continue
        cfg = inp["options"]["placement"]
        psc, play, nsc = verify_scene(rd(ps)), verify_layout(rd(pl)), verify_scene(rd(sc))
        res = naive(psc, play, nsc, cfg)
        lay = json.loads(rd(el))
        exp_pos = {tref(x["ref"]): (x["x"], x["y"]) for x in lay["nodes"]}
        n += 1
        ok = res is not None and res[0] == exp_pos and res[2] == int(work)
        if ok:
            for r in rep["nodes"]:
                if r["status"] == "added":
                    w, j, d, cx, cy = res[1][tref(r["ref"])]
                    ok &= (r["wave"], r["ring"], r["direction"]) == (w, j, d)
        if not ok: bad += 1; print("MISMATCH", vid)
    print(n, "incremental placement rows cross-checked;", bad, "mismatches")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
