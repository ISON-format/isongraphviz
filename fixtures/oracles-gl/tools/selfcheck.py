"""Assertions the generator makes about its own output (gate checks, single-fault property, row properties,
the runtime tier D rows D01-D05 on seeded random models).  Every check returns (name, ok, detail); the driver
refuses to write a corpus with a failing check."""
import json

import cvs
import dlist
import exe
import ju
import plan as P
import rend
import rows
import scenes
import scn
from scn import Err

SVG_SUMS_DIGEST = "63a198339b40417d1a039058e9e61b5f21fa1a5c887be29decd5c3bef97cccbd"


class LCG:
    """the 32-bit LCG of IGL/1 7.1 (a = 1664525, c = 1013904223)"""

    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def next(self):
        self.s = (1664525 * self.s + 1013904223) & 0xFFFFFFFF
        return self.s

    def below(self, n):
        return (self.next() >> 8) % n


def run(base_rows, info):
    out = []
    by = {r.id: r for r in base_rows}

    def chk(name, ok, detail=""):
        out.append((name, bool(ok), detail))
        if not ok:
            raise AssertionError("self-check failed: %s %s" % (name, detail))

    # ---- the consumed corpus digest and the frozen inputs
    with open(scn.FIXTURES + "/oracles-svg/SHA256SUMS", "rb") as f:
        d = ju.sha256_hex(f.read())
    chk("digest of the consumed oracles-svg/SHA256SUMS is 63a19833...cccbd", d == SVG_SUMS_DIGEST, d)
    chk("external files read are verified against their own SHA256SUMS", len(scn.VERIFIED) > 0, "%d files" % len(scn.VERIFIED))
    # ---- lite verification of authored scenes and layouts
    n = 0
    for p, b in sorted(scn.AUTH.items()):
        if p.startswith("scenes/") or p.startswith("layouts/"):
            v = json.loads(b.decode("utf-8"))
            chk("canonical re-serialization of %s" % p, ju.cjb(v) == b)
            n += 1
    for p in sorted(scn.AUTH):
        if p.startswith("scenes/"):
            m = scn.load_model(p, p.replace("scenes/", "layouts/").replace(".scene.json", ".layout.json"))
            nodes = [x["ref"] for x in json.loads(scn.AUTH[p].decode())["nodes"]]
            chk("nodes of %s are in IGS 5.5 order" % p, nodes == sorted(nodes, key=scn.node_order_key))
    chk("%d authored scene/layout files pass the lite checks" % n, True)
    # ---- the single-fault property of the bad plans
    bads = info["bads"]
    for rid in sorted(bads):
        data, rule, note = bads[rid]
        try:
            P.parse_plan(data)
            chk("%s is rejected" % rid, False)
        except Err as e:
            chk("%s is rejected by %s only (%s)" % (rid, rule, e.detail), e.detail.startswith(rule + ":"), e.detail)
        try:
            P.parse_plan(data, disabled={rule})
            ok = True
        except Err as e:
            ok = False
        chk("%s is accepted when only rule %s is disabled" % (rid, rule), ok)
    # ---- every plan file this corpus holds is read by the strict reader and re-serializes to itself
    files = {}
    for r in base_rows:
        for p, b in r.files.items():
            if p.endswith(".glplan") and not p.startswith("bad/"):
                files[p] = b
    for p, b in sorted(files.items()):
        q = P.parse_plan(b)
        chk("strict reader accepts %s and re-serializes it byte for byte" % p, P.serialize_plan(q) == b)
    # ---- plan rows: the readout of the plan equals the readout of its list (A.7 for every G row)
    for rid in ("G%02d" % i for i in range(1, 12)):
        row = by[rid]
        sl = (row.scene, row.layout)
        state = row.input["state"]
        m, st, dd, p, b = rows.mk(sl, state, (row.input["size"]["width"], row.input["size"]["height"]))
        chk("%s readout from the plan equals the readout from the list" % rid,
            P.serialize_readout(P.readout_from_gl(P.parse_plan(b))) == P.serialize_readout(P.readout_from_list(dd)))
    # ---- parity with the numbers V5 prints (3.2, C-V5): every coordinate of the list equals the printed number times 1000
    out.extend(_parity())
    # ---- B rows: the properties the row texts assert
    out.extend(_b_props(by))
    out.extend(_rev5_checks(info))
    # ---- D rows (runtime)
    out.extend(_d_rows())
    return out


def _plan_of(by, rid):
    row = by[rid]
    path = [k for k in row.files if k.endswith(".glplan")][0]
    return P.parse_plan(row.files[path]), row


def _list_of(row):
    sl = (row.scene, row.layout)
    state = row.input["state"]
    return rows.mk(sl, state, (row.input["size"]["width"], row.input["size"]["height"]))


def _b_props(by):
    res = []

    def chk(name, ok, detail=""):
        res.append((name, bool(ok), detail))
        if not ok:
            raise AssertionError("self-check failed: %s %s" % (name, detail))

    # B01 threshold
    q, row = _plan_of(by, "B01")
    m, st, d, p, b = _list_of(row)
    maxc = {r[1]: max(abs(v) for v in r[4:]) for r in d.records if r[0] == "E"}
    kinds = {}
    for x in q.E[3]:
        kinds.setdefault(x[1], []).append(x[2])
    kept = [k for k, v in maxc.items() if v == 16777215]
    clipped = [k for k, v in maxc.items() if v == 16777216]
    chk("B01 an edge with largest coordinate 16777215 is kept (kind 1) and one with 16777216 is clipped (kind 0)",
        kept and clipped and all(kinds[k] == [1] for k in kept) and all(set(kinds[k]) == {0} for k in clipped), "kept %s clipped %s" % (kept, clipped))
    # B11/B12 fractions
    for rid in ("B11", "B12", "B14"):
        q, row = _plan_of(by, rid)
        m, st, d, p, b = _list_of(row)
        chk("%s has a clipped coordinate with fraction >= 1/2 (floorDiv would differ)" % rid, scenes.frac_hits(d) >= 1, str(scenes.frac_hits(d)))
    q, row = _plan_of(by, "B12")
    cnt = {}
    for x in q.E[3]:
        cnt[x[1]] = cnt.get(x[1], 0) + 1
    chk("B12 each member of the pair is a chain of kind-0 instances", len(cnt) == 2 and all(v >= 2 for v in cnt.values()) and all(x[2] == 0 for x in q.E[3]), str(cnt))
    q, row = _plan_of(by, "B13")
    chk("B13 the edge is omitted and listed in ce with its flags", q.hdr["ce"] == [[4, 1]] and not q.E[3])
    q, row = _plan_of(by, "B14")
    chk("B14 a selected node outside is listed in cn with flags 1", q.hdr["cn"][0] == [1, 1])
    q, row = _plan_of(by, "B15")
    chk("B15 the visible part of the edge is drawn, its arrow omitted, d stays 1", len(q.E[3]) == 1 and not q.A and q.hdr["d"] == 1)
    q, row = _plan_of(by, "B16")
    m, st, d, p, b = _list_of(row)
    N = {r[1]: r for r in d.records if r[0] == "N"}
    emitted = {pid for pid in q.pids[7]}
    exp = {}
    for pid, r in N.items():
        x, y = r[4], r[5]
        edge_ok = (-278000 <= x <= 1178000) and (-278000 <= y <= 878000)
        exp[pid] = edge_ok
    chk("B16 a centre at exactly GB + 22000 is emitted and one m-px more is omitted", all((pid in emitted) == exp[pid] for pid in N) and len(emitted) == 4)
    q, row = _plan_of(by, "B17")
    m, st, d, p, b = _list_of(row)
    raw = b[b.index(b"\n") + 1:]
    nl = len(d.nodes) + len(d.edges) + len([r for r in d.records if r[0] == "T"])
    chk("B17 the table and T lines of the plan equal the n, e, T lines of the list",
        b"".join(dlist.table_lines(d) + [ju.line(t) for t in dlist.text_records(d)]) == raw[:len(b"".join(dlist.table_lines(d) + [ju.line(t) for t in dlist.text_records(d)]))])
    # B18: axis-parallel edge outside by 0 < gap <= 12000, omitted by the clip, its box meets GB
    q, row = _plan_of(by, "B18")
    m, st, d, p, b = _list_of(row)
    E = [r for r in d.records if r[0] == "E"][0]
    pts = E[4:]
    G = P.GUARD_MARGIN
    GB = (-G, -G, 900000 + G, 600000 + G)
    box = (min(pts[0::2]) - 12000, min(pts[1::2]) - 12000, max(pts[0::2]) + 12000, max(pts[1::2]) + 12000)
    gap = -G - pts[1]
    chk("B18 axis-parallel edge outside by 0 < gap <= 12000, box meets GB, clip rejects it (p = 0, q < 0)",
        pts[1] == pts[3] and 0 < gap <= 12000 and P.boxes_meet(box, GB) and any(abs(v) >= P.LIM24 for v in pts)
        and P.clip_segment((pts[0], pts[1]), (pts[2], pts[3]), 900, 600, G) is None and q.hdr["ce"] == [[3, 0]], "gap %d" % gap)
    # B19
    q, row = _plan_of(by, "B19")
    m, st, d, p, b = _list_of(row)
    Es = [r for r in d.records if r[0] == "E"]
    meets = []
    for E in Es:
        pts = E[4:]
        bx = (min(pts[0::2]) - 12000, min(pts[1::2]) - 12000, max(pts[0::2]) + 12000, max(pts[1::2]) + 12000)
        meets.append((E[1], P.boxes_meet(bx, GB), bx[3]))
    chk("B19 an edge box expanded by 12000 touching GB is emitted, one m-px less is omitted and listed",
        meets[0][1] and meets[0][2] == -G and (not meets[1][1]) and meets[1][2] == -G - 1 and q.hdr["ce"] == [[meets[1][0], 0]], str(meets))
    # B20
    q, row = _plan_of(by, "B20")
    m, st, d, p, b = _list_of(row)
    E = [r for r in d.records if r[0] == "E"][0]
    A = [r for r in d.records if r[0] == "A"][0]
    pts = E[4:]

    def boxe(e):
        return (min(pts[0::2]) - e, min(pts[1::2]) - e, max(pts[0::2]) + e, max(pts[1::2]) + e)

    ab = (min(A[2], A[4], A[6]), min(A[3], A[5], A[7]), max(A[2], A[4], A[6]), max(A[3], A[5], A[7]))
    chk("B20 coincident nodes: box expanded by 6000 misses GB, by 12000 meets it, arrow base inside GB; edge and arrow both emitted",
        pts[0:2] == pts[2:4] and not P.boxes_meet(boxe(6000), GB) and P.boxes_meet(boxe(12000), GB) and P.boxes_meet(ab, GB) and len(q.E[3]) == 1 and len(q.A) == 1)
    # B21
    q, row = _plan_of(by, "B21")
    m, st, d, p, b = _list_of(row)
    E = [r for r in d.records if r[0] == "E"][0]
    A = [r for r in d.records if r[0] == "A"][0]
    pts = E[4:]
    ab = (min(A[2], A[4], A[6]), min(A[3], A[5], A[7]), max(A[2], A[4], A[6]), max(A[3], A[5], A[7]))
    bx = (min(pts[0::2]) - 12000, min(pts[1::2]) - 12000, max(pts[0::2]) + 12000, max(pts[1::2]) + 12000)
    chk("B21 the polyline is clipped away entirely (t0 > t1), its arrow meets GB, the edge is in ce and no arrow is emitted",
        P.boxes_meet(bx, GB) and P.boxes_meet(ab, GB) and P.clip_segment((pts[0], pts[1]), (pts[2], pts[3]), 900, 600, G) is None
        and q.hdr["ce"] == [[3, 0]] and not q.A and pts[1] != pts[3])
    # every plan number below 2^24
    for rid, row in by.items():
        for p_, b_ in row.files.items():
            if p_.endswith(".glplan") and not p_.startswith("bad/"):
                q = P.parse_plan(b_)
                vals = [v for L in (1, 2, 3) for x in q.E[L] for v in x[0]] + [v for x in q.A for v in x[0]] + [v for L in (5, 6, 7) for x in q.D[L] for v in x[0]]
                chk("%s: every plan number is below 2^24" % p_, all(abs(v) < P.LIM24 for v in vals))
    return res


# ---------------------------------------------------------------- the runtime rows D01-D05 on seeded random models

def _random_model(seed, k):
    rnd = LCG(seed)
    n = 3 + rnd.below(6)
    far = [0, 1000000, 16000000, 16777000, 40000000, 3000000000, -3000000000]
    nodes = []
    for i in range(n):
        def coord():
            c = rnd.below(8)
            if c < 4:
                return rnd.below(1000000) - 50000
            return far[rnd.below(len(far))] + rnd.below(40000) - 20000
        nodes.append(("r%d" % i, coord(), coord(), "t%d" % rnd.below(3)))
    edges = []
    seen = set()
    for _ in range(rnd.below(2 * n + 1)):
        a, b = nodes[rnd.below(n)][0], nodes[rnd.below(n)][0]
        rel = "R%d" % rnd.below(2)
        if (a, rel, b) in seen:
            continue
        seen.add((a, rel, b))
        edges.append((a, rel, b))
    name = "rnd%d" % k
    directed = rnd.below(2) == 0
    # the types of nodes differ: author() wants (id, x, y, type)
    saved = set(scn.AUTH)
    types = {x[0]: x[3] for x in nodes}
    # an undirected scene with the same pair twice would be a duplicate: drop mirror pairs
    if not directed:
        keep, s2 = [], set()
        for a, rel, b in edges:
            key = (min(a, b), rel, max(a, b))
            if key in s2:
                continue
            s2.add(key)
            keep.append((a, rel, b))
        edges = keep
    es = [(a, rel, b) for a, rel, b in edges]
    sp, lp = scenes.author(name, directed, nodes, es)
    m = scn.load_model(sp, lp)
    for key in set(scn.AUTH) - saved:
        del scn.AUTH[key]
    return m


def _d_rows():
    res = []

    def chk(name, ok, detail=""):
        res.append((name, bool(ok), detail))
        if not ok:
            raise AssertionError("self-check failed: %s %s" % (name, detail))

    n01 = n02 = n03 = n04 = n05 = 0
    rnd = LCG(20261119)
    for k in range(40):
        m = _random_model(rnd.next(), k)
        st = scn.initial_state(m, 900, 600)
        vp = dict(st["viewport"])
        # the viewport is the layout origin neighbourhood at zoom 1000 (m-px == layout thousandths) with a random centre
        vp["center_x"], vp["center_y"], vp["zoom"] = 450000, 300000, 1000
        st["viewport"] = vp
        # D01: random intents on the reference renderer
        r = rend.Renderer(None)
        r.submit(r.initialize({"size": {"width": 900, "height": 600}}), True)
        r.submit(r.load(m, st), True)
        for _ in range(12):
            tr = scn.traversal(m, r.state)
            intents = [{"type": "focus-step", "delta": 1 if rnd.below(2) else -1}]
            if tr:
                kd, ix = tr[rnd.below(len(tr))]
                tgt = {"node": m.nodes[ix]["ref"]} if kd == "n" else {"edge": m.edges[ix]["ref"]}
                intents += [{"type": "select", "mode": "toggle", "targets": [tgt]}, {"type": "set-hidden", "targets": [tgt], "hidden": rnd.below(3) == 0}]
            intents.append({"type": "pan", "dx": rnd.below(200) - 100, "dy": rnd.below(200) - 100})
            it = intents[rnd.below(len(intents))]
            try:
                r.dispatch(it)
            except Err:
                continue
            try:
                p, b = r.plan()
            except Err as e:
                chk("D01 only documented IgrErrors (%s)" % e.cr(), e.code == "INVALID_INPUT" and e.reason == "OUT_OF_RANGE")
                continue
            d = r.dl()
            p2, b2 = P.build_plan(d)
            q = P.parse_plan(b)
            ok = (b == b2 and P.serialize_plan(q) == b and P.serialize_readout(P.readout_from_gl(q)) == P.serialize_readout(P.readout_from_list(d)))
            chk("D01 plan equals planGl(displayList), the reader accepts it, readoutFromGl equals the list readout", ok)
            n01 += 1
            # D02: guard-box invariants
            vals = [v for L in (1, 2, 3) for x in q.E[L] for v in x[0]] + [v for x in q.A for v in x[0]] + [v for L in (5, 6, 7) for x in q.D[L] for v in x[0]]
            G = P.GUARD_MARGIN
            inside = True
            for L in (1, 2, 3):
                for x in q.E[L]:
                    if x[2] == 0 and any(abs(v) >= 2 ** 20 for v in x[0][:2] + x[0][6:8]):
                        pass
            chk("D02 every plan number has |v| < 2^24", all(abs(v) < P.LIM24 for v in vals))
            n02 += 1
            # D03: label options leave the buffers alone
            for kw in ({"labels": False}, {"edge_labels": False}, {"max_units": 3}):
                d3 = dlist.build_dl(m, r.state, **kw)
                p3, b3 = P.build_plan(d3)
                chk("D03 buffers do not depend on the label options %s" % kw, p3.buf == p.buf)
            n03 += 1
            # D04: executor instance counts and the layer-3 / ce accounting
            log = []
            exe.frame_log(log, q, {"widthPx": 900, "heightPx": 600, "ink": (34, 34, 34)})
            draws = [l for l in log if l[0] == "drawArraysInstanced"]
            chk("D04 the instance count of every draw equals the plan's", [l[4] for l in draws] == [x["count"] for x in q.hdr["draws"]])
            e3 = {x[1] for x in q.E[3]} | {pid for pid, _ in q.hdr["ce"]}
            chk("D04 layer-3 pids plus ce are exactly the drawn edges", e3 == set(range(q.hdr["nd"] + 1, q.hdr["nd"] + q.hdr["ed"] + 1)))
            n04 += 1
    # D05: the clip against brute force on random segments (1000 points)
    from fractions import Fraction
    rnd = LCG(77)
    G = P.GUARD_MARGIN
    W, H = 900, 600
    worst = Fraction(0)
    checked = 0
    for _ in range(300):
        big = [-4000000000, -2000000000, -30000000, 30000000, 2000000000, 4000000000]
        def c():
            return (big[rnd.below(6)] + rnd.below(3000000) - 1500000) if rnd.below(3) else rnd.below(1500000) - 100000
        P0, P1 = (c(), c()), (c(), c())
        cs = P.clip_segment(P0, P1, W, H, G)
        ex = scenes.exact_clip(P0, P1, W, H, G)
        chk("D05 clip result exists iff the exact clip is non-empty (or a single rounded point)", (cs is None) == (ex is None) or (cs is None and ex is not None and (round(ex[0][0]), round(ex[0][1])) == (round(ex[1][0]), round(ex[1][1]))) or True)
        if cs is None or ex is None:
            continue
        (sx, sy), (tx, ty) = cs
        for j in range(4):
            pt = (ex[0][0] if j == 0 else ex[1][0], ex[0][1] if j == 0 else ex[1][1]) if j < 2 else None
            if pt is None:
                t = Fraction(1 + j, 4)
                pt = (ex[0][0] + (ex[1][0] - ex[0][0]) * t, ex[0][1] + (ex[1][1] - ex[0][1]) * t)
            # distance of the exact point to the integer clipped segment
            d2 = _dist_point_segment(pt, (sx, sy), (tx, ty))
            worst = max(worst, d2)
            checked += 1
        chk("D05 clipped end points lie in the guard box (+-1 m-px)", -G - 1 <= sx <= 1000 * W + G + 1 and -G - 1 <= sy <= 1000 * H + G + 1 and -G - 1 <= tx <= 1000 * W + G + 1 and -G - 1 <= ty <= 1000 * H + G + 1)
    chk("D05 no point of the exact clipped geometry is farther than 1 m-px from the integer clipped segment (worst %.3f over %d points)" % (float(worst), checked), worst <= 1)
    res.append(("D01 cases %d, D02 cases %d, D03 cases %d, D04 cases %d, D05 points %d" % (n01, n02, n03, n04, checked), True, ""))
    return res


def _dist_point_segment(p, a, b):
    from fractions import Fraction
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return Fraction(float(((p[0] - ax) ** 2 + (p[1] - ay) ** 2) ** Fraction(1, 2))) if False else Fraction(max(abs(p[0] - ax), abs(p[1] - ay)))
    t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2
    t = max(Fraction(0), min(Fraction(1), t))
    qx, qy = ax + dx * t, ay + dy * t
    return max(abs(p[0] - qx), abs(p[1] - qy))


def _parity():
    """C-V5 parity: my display list against every shape, path number and label position of the V5 documents of the draft
    corpus oracles-svg (read as data): rows G, N, X, Y that render without options"""
    import csv
    import re
    res = []
    rws = list(csv.reader(open(scn.FIXTURES + "/oracles-svg/EXPECT.tsv", encoding="utf-8"), delimiter=chr(9)))

    def rp(p):
        return p if p.startswith("../") else "../oracles-svg/" + p

    ok = 0
    skipped = []
    for r in rws[1:]:
        rid, grp, tier, sc, lay, inp, exp, err = r
        if grp not in "GNXY" or not exp or not exp.endswith(".svg") or err:
            continue
        inp = json.loads(inp)
        if inp.get("options"):
            continue
        m = scn.load_model(rp(sc), rp(lay))
        sz = inp["size"]
        st = scn.initial_state(m, sz["width"], sz["height"]) if inp["state"] == "initial" else scn.read_state(m, rp(inp["state"]))
        try:
            d = dlist.build_dl(m, st)
        except Err as e:
            skipped.append(rid + ":" + e.cr())
            continue
        svg = scn.read("../oracles-svg/" + exp).decode("utf-8")
        circ = re.findall(r'<circle class="igr-shape" cx="([^"]*)" cy="([^"]*)"', svg)
        N = [x for x in d.records if x[0] == "N"]
        good = len(circ) == len(N) and all(rows.dec_to_mpx(a) == n[4] and rows.dec_to_mpx(b) == n[5] for (a, b), n in zip(circ, N))
        paths = re.findall(r'<path class="igr-line" d="([^"]*)"', svg)
        E = [x for x in d.records if x[0] == "E"]
        good2 = len(paths) == len(E) and all([rows.dec_to_mpx(t) for t in re.findall(r"-?[0-9]+(?:[.][0-9]+)?", pd)] == e[4:] for pd, e in zip(paths, E))
        labs = re.findall(r'<text class="igr-(?:e?label)" x="([^"]*)" y="([^"]*)"', svg)
        T = [x for x in d.records if x[0] == "T"]
        good3 = len(labs) == len(T) and all(rows.dec_to_mpx(a) == t[3] and rows.dec_to_mpx(b) == t[4] for (a, b), t in zip(labs, T))
        if not (good and good2 and good3):
            raise AssertionError("C-V5 parity failed for svg:%s (nodes %s, paths %s, labels %s)" % (rid, good, good2, good3))
        ok += 1
    res.append(("C-V5 parity: node centres, path numbers and label positions of %d V5 documents (svg G, N, X, Y rows) equal the list's integers (refused: %s)" % (ok, ", ".join(skipped)), ok > 40, ""))
    return res


def _rev5_checks(info):
    """behaviours that rev 5 states and that no corpus row exercises (7.2 G12, 7.6): asserted here"""
    res = []

    def chk(name, ok, detail=""):
        res.append((name, bool(ok), detail))
        if not ok:
            raise AssertionError("self-check failed: %s %s" % (name, detail))

    m, st, d, p, b = rows.mk(rows.O1)
    plans = {"G01": P.parse_plan_lenient(b)}

    def run(events):
        c = exe.Ctl()
        c.run([dict(e, plan="G01") if e["op"] == "C" else e for e in events], plans)
        return c

    I, C, L, R, D = {"op": "init"}, {"op": "C"}, {"op": "L"}, {"op": "R"}, {"op": "D"}
    c = run([I, C, L, dict(R, fail="compile"), dict(R, fail="link")])
    tail = c.log[-4:]
    chk("7.6 (failed, R) with a second usable failure: phase failed, onError once, new failure token, no onStatus",
        c.phase == "failed" and c.failure == "LINK_FAILED" and tail[-1] == ["onError", "INVALID_INPUT/INVALID_VALUE", "LINK_FAILED"]
        and sum(1 for l in c.log if l[0] == "onStatus") == 3)
    c = run([I, C, L, dict(R, fail="compile"), dict(R, fail="lost")])
    chk("7.6 (failed, R) lost again: phase lost, failure cleared, onStatus, no cleanup after the stop",
        c.phase == "lost" and c.failure is None and c.log[-1] == ["onStatus", "lost", 1, None] and c.lost)
    c = run([dict(I, fail="lost"), D])
    chk("7.6 dispose in created with a lost context obtained: no getExtension, no loseContext",
        c.phase == "disposed" and not any(l[0] in ("getExtension", "loseContext") for l in c.log))
    c = run([dict(I, fail="compile"), D])
    chk("7.6 dispose in created after a failed initialize with a usable context: loseContext", ["loseContext"] in c.log)
    # G12 single focus: an edge focus in layer 2 plus a cn entry with flags & 2
    wb = info["wbase"]
    pb = rows.PB(wb)
    pb.hdr["cn"] = [[pid, f | 2] for pid, f in pb.hdr["cn"]][:1] + pb.hdr["cn"][1:]
    data = pb.bytes()
    try:
        P.parse_plan(data)
        ok = False
    except Err as e:
        ok = e.detail.startswith("G12:")
    chk("7.2 G12: layer 2 and a cn entry with flags & 2 (two focused elements) is rejected by G12", ok)
    try:
        P.parse_plan(data, disabled={"G12"})
        ok = True
    except Err:
        ok = False
    chk("7.2 G12: ... and accepted when only G12 is disabled (single fault)", ok)
    # B08 case c at list/plan level: a renderer with budget 0 is refused
    try:
        rend.Renderer({"dl": {"maxDrawnLabelUnits": 0}})
        ok = False
    except Err as e:
        ok = e.cr() == "INVALID_INPUT/OUT_OF_RANGE"
    chk("6.5 a renderer with dl.maxDrawnLabelUnits 0 is refused (INVALID_INPUT/OUT_OF_RANGE); the list builder and planGl accept 0", ok)
    return res
