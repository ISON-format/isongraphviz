"""Generator of the oracles-lp corpus (LP/1, design 37 rev 3).

    python tools/gen.py                 # regenerate every generated file in place (deterministic, any PYTHONHASHSEED)
    python tools/gen.py --out DIR       # the same into DIR (byte-identity proof)
    python tools/gen.py --no-mutants    # skip the mutant matrix (development only: MUTANTS.tsv is then not written)
    python tools/gen.py --mutant K012   # print the rows that kill one mutant

Standard library only. Seeded random.Random(int) only; no clock; integer maths only.
Run from anywhere. AMBIGUITIES.md is hand-written, kept, and covered by SHA256SUMS.
"""
import hashlib
import json
import os
import random
import shutil
import sys
import time
import multiprocessing

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import lp
import lp1
import lp2
import search
import lpgrid
import mut
import mutants as MU
import rows as RW
import docs
from lp import PX

STRESS_CAP = 20     # (documentation only) stress rows are evaluated against mutants only when no other row kills


def canon(obj):
    return (json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")


def check_exp(r, out):
    """Hand-derived hints: k (candidate k, free), ('ne', k) (not candidate k), ('fb',) / ('fb', k) (fallback, optionally
    candidate k), ('xy', dx, dy). A hint list may be a prefix of the labels (the rest comes from the reference)."""
    if r.exp is None:
        return
    assert len(r.exp) <= len(out), (r.id, "length")
    for i, (e, o) in enumerate(zip(r.exp, out)):
        if isinstance(e, int):
            ok = o[0] == e
        elif e[0] == "ne":
            ok = abs(o[0]) != e[1]
        elif e[0] == "fb":
            ok = o[0] < 0 and (len(e) == 1 or o[0] == -e[1])
        else:
            ok = (o[1], o[2]) == (e[1], e[2])
        assert ok, ("hint mismatch", r.id, i, e, o)


def verify_fallbacks(rows, ref_idx):
    """Independent recomputation of the fallback of every label of every core row of at most 60 labels: no candidate is
    free, the chosen candidate has the least cost (distinct colliding boxes, recomputed with a dict of edge tuples) and
    no earlier candidate has the same cost."""
    n = 0
    for r in rows:
        if r.tier != "core" or len(r.labels) > 60:
            continue
        for li, (idx, dx, dy) in enumerate(ref_idx[r.id]):
            kind, u, x, y = r.labels[li]
            obst = [lp.node_box(cx, cy) for cx, cy in r.nodes]
            for (k2, u2, x2, y2), (_i, dx2, dy2) in list(zip(r.labels, ref_idx[r.id]))[:li]:
                obst.append(lp.label_box(x2 + dx2 * PX, y2 + dy2 * PX, u2))
            cands = lp.node_candidates(u) if kind == "node" else lp.edge_candidates(u)
            cost = []
            for (cdx, cdy) in cands:
                b = lp.label_box(x + cdx * PX, y + cdy * PX, u)
                seen = {}
                for o in obst:
                    if lp.collide(b, o):
                        seen[o] = 1
                cost.append(len(seen))
            if idx > 0:
                assert cost[idx - 1] == 0 and all(c > 0 for c in cost[:idx - 1]), ("free candidate", r.id, li)
            else:
                k = -idx - 1
                assert all(c > 0 for c in cost), ("fallback with a free candidate", r.id, li)
                assert cost[k] == min(cost) and cost.index(min(cost)) == k, ("fallback not first-min", r.id, li)
                assert (cands[k][0], cands[k][1]) == (dx, dy)
                n += 1
    return n


def random_cross_check(n=2000):
    """lp (all pairs), lpgrid (section 7) and the baseline of mut agree on n random inputs."""
    rnd = random.Random(20261122)
    CELL = 64
    for t in range(n):
        mode = rnd.randrange(4)
        span = rnd.choice((80, 150, 300, 700))
        org = rnd.choice((0, 0, -64, -200, 64 * 7, -64 * 9 - 11, 1 << 40, -(1 << 40)))

        def co():
            k = rnd.randrange(0, span)
            v = (org + k) * PX
            if mode == 1:                      # on or next to 64 px boundaries
                v = ((org // CELL + rnd.randrange(-3, 5)) * CELL + rnd.choice((-14, -13, -1, 0, 1, 6, 13, 14, 20, 63))) * PX
            f = rnd.choice((0, 0, 1, 499999, 500000, 999999, rnd.randrange(PX)))
            return v + f
        nn = rnd.randrange(0, 12)
        nlab = rnd.randrange(0, 14)
        if t % 4 == 3:                        # very crowded: a tiny window, many nodes and labels, duplicates
            span = rnd.choice((12, 30, 60))
            nn = rnd.randrange(10, 60)
            nlab = rnd.randrange(20, 70)
        nodes = [(co(), co()) for _ in range(nn)]
        if t % 4 == 3 and nodes:
            nodes += [nodes[rnd.randrange(len(nodes))] for _ in range(rnd.randrange(0, 8))]       # identical node boxes
        labels = []
        for _ in range(nlab):
            u = rnd.choice((1, 1, 2, 3, 4, 6, 9, 13, 25, 40, 90))
            kd = rnd.choice(("node", "edge"))
            if kd == "node" and nodes and rnd.random() < 0.5:
                cx, cy = nodes[rnd.randrange(len(nodes))]
                labels.append(("node", u, cx, cy + 24 * PX))
            elif t % 4 == 3 and labels and rnd.random() < 0.4:
                labels.append(labels[rnd.randrange(len(labels))])          # identical label (identical placed boxes)
            else:
                labels.append((kd, u, co(), co()))
        a = lp.place_labels_idx(nodes, labels)
        b = lpgrid.place_labels_idx(nodes, labels)
        assert a == b, ("grid vs all pairs", t, nodes, labels)
        assert a == mut.place_idx(nodes, labels), ("mut baseline", t)
        # grid faults that must be output-equivalent (A-19): truncation, exclusive end, other cell sizes
        for fl in ({"trunc": True}, {"excl_right": True}, {"trunc": True, "excl_right": True},
                   {"cell": 63 * PX}, {"cell": 65 * PX}, {"cell": 1000 * PX}, {"dedupe": True}, {"dedupe": True, "cost_id": True}):
            assert lpgrid.place_labels_idx(nodes, labels, fl) == a, ("equivalent grid fault differs", fl, t)
    return n


_W = {}


def _init(rows_, expected_):
    _W["core"] = [r for r in rows_ if r.tier == "core"]
    _W["stress"] = [r for r in rows_ if r.tier != "core"]
    _W["exp"] = expected_


def _eval_one(m):
    mid, desc, kind, spec = m
    core, stress, expected = _W["core"], _W["stress"], _W["exp"]

    def run(r):
        if kind == "cfg":
            return mut.place(r.nodes, r.labels, spec)
        return lpgrid.place_labels(r.nodes, r.labels, spec)
    changed = [r.id for r in core if run(r) != expected[r.id]]
    stress_changed = []
    need_stress = (kind == "grid") or not changed
    if need_stress:
        for r in stress:
            if run(r) != expected[r.id]:
                stress_changed.append(r.id)
    return {"id": mid, "desc": desc, "kind": kind, "changed": changed, "stress": stress_changed, "ran_stress": need_stress}


def evaluate_mutants(rows, expected):
    """expected: id -> list of (dx, dy). Returns one dict per mutant (in table order; processes run in parallel,
    the result does not depend on the scheduling)."""
    core = [r for r in rows if r.tier == "core"]
    for r in core:                       # the all-pairs engine must reproduce the baseline on every core row
        assert mut.place(r.nodes, r.labels) == expected[r.id], ("mut baseline", r.id)
    table = MU.build()
    with multiprocessing.Pool(min(24, os.cpu_count() or 1), initializer=_init, initargs=(rows, expected)) as pool:
        return pool.map(_eval_one, table, chunksize=1)


def jbox(x, y, u):
    """Judge box (OVERLAP.tsv only): 8 px per unit (half width 4u), height 14 (top Y-11, bottom Y+3)."""
    return (x - 4 * u * PX, y - 11 * PX, x + 4 * u * PX, y + 3 * PX)


def jcollide(a, b):
    """Judge collision: gap 0 (touching boxes do not collide)."""
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def lpcollide(a, b):
    return lp.collide(a, b)


def pair_counts(boxes, nb, coll, grow):
    """(label-label pairs, label-node pairs) among boxes; grid for large inputs, all pairs for small ones."""
    n = len(boxes)
    ll = ln = 0
    if n * (len(nb) + n) < 400000:
        for i in range(n):
            for j in range(i):
                if coll(boxes[i], boxes[j]):
                    ll += 1
            for b in nb:
                if coll(boxes[i], b):
                    ln += 1
        return ll, ln
    cell = 64 * PX
    grid = {}
    for j, b in enumerate(nb):
        for cx in range((b[0] - grow) // cell, (b[2] + grow) // cell + 1):
            for cy in range((b[1] - grow) // cell, (b[3] + grow) // cell + 1):
                grid.setdefault((cx, cy), []).append(("n", j, b))
    for i, bx in enumerate(boxes):
        seen = set()
        for cx in range((bx[0] - grow) // cell, (bx[2] + grow) // cell + 1):
            for cy in range((bx[1] - grow) // cell, (bx[3] + grow) // cell + 1):
                for item in grid.get((cx, cy), ()):
                    key = (item[0], item[1])
                    if key in seen:
                        continue
                    seen.add(key)
                    if item[0] == "n":
                        if coll(bx, item[2]):
                            ln += 1
                    elif item[1] < i and coll(bx, item[2]):
                        ll += 1
        for cx in range((bx[0] - grow) // cell, (bx[2] + grow) // cell + 1):
            for cy in range((bx[1] - grow) // cell, (bx[3] + grow) // cell + 1):
                grid.setdefault((cx, cy), []).append(("l", i, bx))
    return ll, ln


REVS = ("default", "rev1", "rev2", "rev3")
OVERLAP_HEAD = (["id", "nodes", "labels"] + ["lp_%s_%s" % (k, r) for r in REVS for k in ("ll", "ln")]
                + ["judge_%s_%s" % (k, r) for r in REVS for k in ("ll", "ln")]
                + ["rev1_fallback", "rev2_fallback", "rev3_fallback", "rev3_moved"])


def overlap_stats(rows, ref_idx):
    """Collisions with every label at its default (`default`, rev 3 boxes), after the rev 1 rule (width 7, 11 candidates,
    fallback (0,0); tools/lp1.py), after the rev 2 rule (width 7, 29 candidates, min-cost fallback; tools/lp2.py) and
    after the rev 3 rule (width 9; this corpus). `lp_*` counts the placed boxes of each revision under that revision's own
    box model and the 1 px gap; `judge_*` counts the same placements under a judge of 8 px per unit, height 14, gap 0.
    ll = label-label pairs, ln = label-node pairs."""
    out = []
    for r in rows:
        if not (r.id.startswith("D0") or r.id.startswith("R2-") or r.id == "S01" or (r.id.startswith("R") and r.group == "R")):
            continue
        nb = [lp.node_box(cx, cy) for cx, cy in r.nodes]
        offs0 = [(0, 0)] * len(r.labels)
        res1 = lp1.place_labels_idx(r.nodes, r.labels)
        res2 = lp2.place_labels_idx(r.nodes, r.labels)
        res3 = ref_idx[r.id]
        offs = [offs0] + [[(dx, dy) for (_i, dx, dy) in res] for res in (res1, res2, res3)]

        def counts(o, mk, coll, grow):
            boxes = [mk(x + dx * PX, y + dy * PX, u) for (k, u, x, y), (dx, dy) in zip(r.labels, o)]
            return pair_counts(boxes, nb, coll, grow)
        mks = [lp.label_box, lp1.label_box, lp2.label_box, lp.label_box]
        lpc = [counts(o, mk, lpcollide, PX) for o, mk in zip(offs, mks)]
        jc = [counts(o, jbox, jcollide, 0) for o in offs]
        f1 = sum(1 for (i, _dx, _dy) in res1 if i == 0)
        f2 = sum(1 for (i, _dx, _dy) in res2 if i < 0)
        f3 = sum(1 for (i, _dx, _dy) in res3 if i < 0)
        moved = sum(1 for (i, _dx, _dy) in res3 if abs(i) > 1)
        out.append([r.id, len(r.nodes), len(r.labels)] + [v for c in lpc for v in c] + [v for c in jc for v in c] + [f1, f2, f3, moved])
    return out


def reach_check():
    """Every candidate 1..29 can be the first free one, for both kinds and u = 1, 2, 3, 5, 8, 12, 40 (no dominated candidate)."""
    n = 0
    for kind, X, Y in (("node", RW.P(200), RW.P(224)), ("edge", RW.P(300), RW.P(296))):
        for u in (1, 2, 3, 5, 8, 12, 40):
            for k in range(1, 30):
                nodes = RW.forced(kind, u, k, X, Y)
                got = lp.place_labels_idx(nodes, [(kind, u, X, Y)])[0][0]
                assert got == k, ("reach", kind, u, k, got)
                n += 1
    return n


def only_fallback_collisions(rows, ref_idx):
    """After placement every colliding pair (label-label, label-node) involves a fallback label (idx 0)."""
    for r in rows:
        if r.tier != "core" or len(r.labels) > 80:
            continue
        nb = [lp.node_box(cx, cy) for cx, cy in r.nodes]
        boxes = [lp.label_box(x + dx * PX, y + dy * PX, u) for (k, u, x, y), (_i, dx, dy) in zip(r.labels, ref_idx[r.id])]
        for i in range(len(boxes)):
            for j in range(i):
                if lp.collide(boxes[i], boxes[j]):
                    assert ref_idx[r.id][i][0] < 0, ("pair without fallback", r.id, i, j)
            for b in nb:
                if lp.collide(boxes[i], b):
                    assert ref_idx[r.id][i][0] < 0, ("node pair without fallback", r.id, i)


def write(path, data):
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with open(path, "wb") as f:
        f.write(data)


def tsv(rows_):
    return ("\n".join("\t".join(str(c) for c in r) for r in rows_) + "\n").encode("ascii")


def sums(out):
    lines = []
    for root, dirs, files in os.walk(out):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__")
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, out).replace(os.sep, "/")
            if rel == "SHA256SUMS" or "__pycache__" in rel or rel.endswith(".pyc"):
                continue
            lines.append((rel, hashlib.sha256(open(full, "rb").read()).hexdigest()))
    lines.sort(key=lambda t: t[0].encode("utf-8"))
    return ("".join("%s *%s\n" % (h, rel) for rel, h in lines)).encode("ascii")


def main(argv):
    out = os.path.normpath(os.path.join(HERE, ".."))
    do_mut = True
    only = None
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--out":
            out = os.path.abspath(argv[i + 1])
            i += 1
        elif a == "--no-mutants":
            do_mut = False
        elif a == "--mutant":
            only = argv[i + 1]
            i += 1
        else:
            raise SystemExit("unknown argument " + a)
        i += 1
    t0 = time.time()
    rows = RW.build()
    ids = [r.id for r in rows]
    assert len(ids) == len(set(ids)), "ids unique"
    # expected through the all-pairs reference, checked against the hand-derived hints
    ref_idx = {}
    expected = {}
    for r in rows:
        res = lp.place_labels_idx(r.nodes, r.labels)
        ref_idx[r.id] = res
        expected[r.id] = [(dx, dy) for (_i, dx, dy) in res]
        check_exp(r, res)
    t1 = time.time()
    # the grid reading of section 7 agrees on every row
    for r in rows:
        assert lpgrid.place_labels_idx(r.nodes, r.labels) == ref_idx[r.id], ("grid vs all pairs", r.id)
    ref_out = {rid: [{"dx": dx, "dy": dy} for dx, dy in v] for rid, v in expected.items()}
    ref_out_cmp = {rid: v for rid, v in ref_out.items()}
    # properties
    self_checks_wrap(rows, ref_out_cmp, expected)
    nrand = random_cross_check()
    nreach = reach_check()
    nfb = verify_fallbacks(rows, ref_idx)
    only_fallback_collisions(rows, ref_idx)
    t2 = time.time()
    if only:
        res = evaluate_only(rows, expected, only)
        print(res)
        return
    # files
    if os.path.abspath(out) == os.path.normpath(os.path.join(HERE, "..")):
        for d in ("inputs", "expected"):
            shutil.rmtree(os.path.join(out, d), ignore_errors=True)
    for r in rows:
        write(os.path.join(out, "inputs", r.id + ".json"), canon(lp.to_input(r.nodes, r.labels)))
        write(os.path.join(out, "expected", r.id + ".json"), canon(ref_out[r.id]))
    head = ["id", "group", "tier", "input", "expected", "error", "note"]
    table = [head] + [[r.id, r.group, r.tier, "inputs/%s.json" % r.id, "expected/%s.json" % r.id, "", r.note.replace("\t", " ")] for r in rows]
    write(os.path.join(out, "EXPECT.tsv"), tsv(table))
    # overlap and candidate statistics
    ov = overlap_stats(rows, ref_idx)
    write(os.path.join(out, "OVERLAP.tsv"), tsv([OVERLAP_HEAD] + [list(x) for x in ov]))
    cs = {}
    for r in rows:
        for (k, u, x, y), (idx, dx, dy) in zip(r.labels, ref_idx[r.id]):
            cs.setdefault((k, r.tier), [0] * 58)[(idx - 1) if idx > 0 else (29 - idx - 1)] += 1
    cstab = [["kind", "tier"] + ["free%d" % i for i in range(1, 30)] + ["fallback%d" % i for i in range(1, 30)]] + [list(k) + v for k, v in sorted(cs.items())]
    write(os.path.join(out, "CANDSTATS.tsv"), tsv(cstab))
    mut_summary = None
    if do_mut:
        res = evaluate_mutants(rows, expected)
        mt = [["mutant", "kind", "verdict", "n_killing_rows", "killing_rows", "stress_rows_changed", "description"]]
        unk = []
        for m in res:
            killed = bool(m["changed"] or m["stress"])
            if not killed:
                unk.append(m)
            kr = m["changed"]
            mt.append([m["id"], m["kind"], "KILLED" if killed else "UNKILLED",
                       len(kr) + len(m["stress"]), ",".join(kr[:25]) + (",..." if len(kr) > 25 else ""),
                       ",".join(m["stress"]) if m["ran_stress"] else "not-run", m["desc"]])
        write(os.path.join(out, "MUTANTS.tsv"), tsv(mt))
        mut_summary = (len(res), len(res) - len(unk), unk)
    src_amb = os.path.join(HERE, "..", "AMBIGUITIES.md")
    if not os.path.exists(src_amb):
        raise SystemExit("AMBIGUITIES.md missing (hand-written, kept in the corpus root)")
    if os.path.abspath(out) != os.path.normpath(os.path.join(HERE, "..")):
        shutil.copyfile(src_amb, os.path.join(out, "AMBIGUITIES.md"))
        shutil.rmtree(os.path.join(out, "sources"), ignore_errors=True)
        shutil.copytree(os.path.join(HERE, "..", "sources"), os.path.join(out, "sources"))
        os.makedirs(os.path.join(out, "tools"), exist_ok=True)
        for f in sorted(os.listdir(HERE)):
            if f.endswith(".py"):
                shutil.copyfile(os.path.join(HERE, f), os.path.join(out, "tools", f))
    docs.write_docs(out, rows, ov, cstab, mut_summary, nrand)
    write(os.path.join(out, "SHA256SUMS"), sums(out))
    print("reach %d, fallbacks independently verified %d" % (nreach, nfb))
    print("rows %d, mutants %s, random %d, expected %.1fs total %.1fs" % (len(rows), None if not mut_summary else mut_summary[:2], nrand, t1 - t0, time.time() - t0))
    if mut_summary:
        for m in mut_summary[2]:
            print("UNKILLED", m["id"], m["desc"])
    print("SHA256SUMS digest", hashlib.sha256(open(os.path.join(out, "SHA256SUMS"), "rb").read()).hexdigest())


def self_checks_wrap(rows, ref_out, expected):
    rnd = random.Random(31337)
    by = {r.id: r for r in rows}
    for r in rows:
        if r.tier != "core":
            continue
        ns = list(r.nodes)
        rnd.shuffle(ns)
        assert lp.place_labels(ns, r.labels) == expected[r.id], ("node order", r.id)
    for tid, bid in RW.TRANS.items():
        assert expected[tid] == expected[bid], ("translation", tid)
    assert expected["O01"] != list(reversed(expected["O02"])), "swapping A and B must change the result"
    assert expected["O06"] != list(reversed(expected["O07"])), "node-before-edge vs edge-before-node must differ"
    r = by["B01"]
    assert lp.place_labels_idx(r.nodes, [r.labels[1]])[0][0] == 1


def evaluate_only(rows, expected, mid):
    for m in MU.build():
        if m[0] == mid:
            _id, desc, kind, spec = m
            ch = []
            for r in rows:
                out = mut.place(r.nodes, r.labels, spec) if kind == "cfg" else lpgrid.place_labels(r.nodes, r.labels, spec)
                if out != expected[r.id]:
                    ch.append(r.id)
            return desc, ch
    raise SystemExit("no such mutant")


if __name__ == "__main__":
    main(sys.argv)
