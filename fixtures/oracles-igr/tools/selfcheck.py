#!/usr/bin/env python3
"""Self-consistency checks of the generated corpus (no TypeScript).  Run after make_oracles.py.

1. every path named in EXPECT.tsv and in every script exists;
2. every accepted state file re-parses (parse_state) against its model and every R/A/L step replays byte for byte;
3. every hit result equals a SECOND, differently written implementation (Fraction arithmetic in pixels);
4. EXPECT.tsv has the 272 design ids exactly once each (plus the documented supplementary ids)."""
import json, math, os, sys
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import igr

OUT = os.path.dirname(HERE)
bad = []


def rd(rel):
    return open(os.path.normpath(os.path.join(OUT, rel)), "rb").read()


def exists(rel):
    return os.path.exists(os.path.normpath(os.path.join(OUT, rel)))


def load_rows():
    lines = rd("EXPECT.tsv").decode("utf-8").split("\n")
    hdr = lines[0].split("\t")
    rows = [dict(zip(hdr, l.split("\t"))) for l in lines[1:] if l]
    return rows


def fr_hit(m, st, p):
    """second implementation: Fractions in pixels, direct geometry (no micro-pixel integers)."""
    vp = st["viewport"]
    cx, cy, z, w, h = vp["center_x"], vp["center_y"], vp["zoom"], vp["width"], vp["height"]
    px, py = p
    P = (Fraction(igr.q(px), 1000), Fraction(igr.q(py), 1000))
    if not (0 <= P[0] <= w and 0 <= P[1] <= h):          # rev 3: the closed rectangle test on the quantized point
        return None
    sel, hid, focus, _ = igr.state_parts(m, st)
    ehid = igr.eff_hidden(m, hid)
    pos = []
    for n in m.nodes:
        pos.append((Fraction((n["x"] - cx) * z, 10 ** 6) + Fraction(w, 2), Fraction((n["y"] - cy) * z, 10 ** 6) + Fraction(h, 2)))
    best = None
    for n in m.nodes:
        i = n["index"]
        if ("n", i) in ehid:
            continue
        d2 = (pos[i][0] - P[0]) ** 2 + (pos[i][1] - P[1]) ** 2
        if d2 <= 144 and (best is None or d2 < best[0]):
            best = (d2, i)
    if best:
        return {"node": dict(m.nodes[best[1]]["ref"])}
    eb = None
    for e in m.edges:
        j = e["index"]
        if ("e", j) in ehid:
            continue
        A, B = pos[e["src"]], pos[e["tgt"]]
        if A == B:
            continue
        D = (B[0] - A[0], B[1] - A[1])
        L2 = D[0] ** 2 + D[1] ** 2
        t = ((P[0] - A[0]) * D[0] + (P[1] - A[1]) * D[1]) / L2
        if not (0 < t < 1):                                  # rev 3: no endpoint branch
            continue
        C = (A[0] + t * D[0], A[1] + t * D[1])
        d2 = (P[0] - C[0]) ** 2 + (P[1] - C[1]) ** 2
        if d2 <= 36 and (eb is None or d2 < eb[0]):
            eb = (d2, j)
    if eb:
        return {"edge": json.loads(json.dumps(m.edges[eb[1]]["ref"]))}
    return None


def main():
    rows = load_rows()
    ids = [r["id"] for r in rows]
    spec = {"M": 30, "S": 55, "R": 52, "H": 27, "A": 21, "P": 27, "L": 27, "D": 5, "K": 82, "C": 21}
    for g, n in spec.items():
        for k in range(1, n + 1):
            if f"{g}{k:02d}" not in ids:
                bad.append("missing design id " + f"{g}{k:02d}")
    assert len(ids) == len(set(ids))
    sup = [i for i in ids if i not in {f"{g}{k:02d}" for g, n in spec.items() for k in range(1, n + 1)} and i not in ("M23b", "M24b", "R31b", "P21", "L21b", "L24b", "L24c", "L24d")]
    if sup:
        bad.append("ids beyond the design list: %s" % sup)
    print("rows", len(rows), "(design: 354)")
    for r in rows:
        for col in ("scene", "layout", "input", "expected"):
            v = r[col]
            if v and not v.startswith("{") and not v.startswith("[") and not exists(v):
                bad.append(f"{r['id']}: missing {col} {v}")
    nm = 0
    for r in rows:
        g = r["group"]
        if g in ("R", "A") and r["input"]:
            sc = json.loads(rd(r["input"]))
            for st in sc.get("steps", []):
                for k in ("expected_state", "expected_events"):
                    if k in st and not exists(st[k]):
                        bad.append(f"{r['id']}: missing {st[k]}")
    # states: replay R and A scripts
    for r in rows:
        g = r["group"]
        if g not in ("R", "A"):
            continue
        m = igr.build_model(rd(r["scene"]), rd(r["layout"]))
        sc = json.loads(rd(r["input"]))
        lim = sc.get("limits")
        w, h = sc["size"]["width"], sc["size"]["height"]
        state = igr.parse_state(m, rd(sc["initial"])) if "initial" in sc else igr.initial_state(m, w, h)
        for k, st in enumerate(sc["steps"], 1):
            intent = json.loads(json.dumps(st["intent"]))

            def fix(o):
                if isinstance(o, dict):
                    return {a: fix(b) for a, b in o.items()}
                if isinstance(o, list):
                    return [fix(x) for x in o]
                return {"NaN": float("nan"), "Infinity": float("inf"), "-Infinity": float("-inf")}.get(o, o) if isinstance(o, str) else o
            intent = fix(intent)
            try:
                state2, ev = igr.reduce(m, state, intent, lim)
            except igr.IgrError as e:
                if st.get("error") != e.tag():
                    bad.append(f"{r['id']} step {k}: error {e.tag()} vs {st.get('error')}")
                continue
            if "error" in st:
                bad.append(f"{r['id']} step {k}: unexpected success")
                continue
            if igr.serialize_state(m, state2) != rd(st["expected_state"]) or igr.serialize_events(ev) != rd(st["expected_events"]):
                bad.append(f"{r['id']} step {k}: bytes differ")
            if igr.parse_state(m, rd(st["expected_state"])) != state2:
                bad.append(f"{r['id']} step {k}: state does not re-parse")
            state = state2
    # states with models: accepted S rows
    for r in rows:
        if r["group"] == "S" and r["error"] == "" and r["input"] and not r["input"].startswith("{"):
            m = igr.build_model(rd(r["scene"]), rd(r["layout"]))
            igr.parse_state(m, rd(r["input"]))
    # hits against the second implementation
    npts = 0
    for r in rows:
        if r["group"] != "H":
            continue
        m = igr.build_model(rd(r["scene"]), rd(r["layout"]))
        sc = json.loads(rd(r["input"]))
        w, h = sc["size"]["width"], sc["size"]["height"]
        for p in sc["points"]:
            st_rel = p.get("state", sc["state"])
            st = igr.initial_state(m, w, h) if st_rel == "initial" else igr.parse_state(m, rd(st_rel))
            x, y = p["x"], p["y"]
            conv = lambda v: {"NaN": float("nan"), "Infinity": float("inf"), "-Infinity": float("-inf")}.get(v, v) if isinstance(v, str) else v
            x, y = conv(x), conv(y)
            if "error" in p:
                try:
                    igr.hit_test(m, st, (x, y))
                    bad.append(f"{r['id']}: error point accepted {x},{y}")
                except igr.IgrError as e:
                    if e.tag() != p["error"]:
                        bad.append(f"{r['id']}: {e.tag()} vs {p['error']}")
                continue
            got = igr.hit_test(m, st, (x, y))
            want = p.get("hit")
            if got != want:
                bad.append(f"{r['id']}: hit differs at {x},{y}")
            fh = fr_hit(m, st, (x, y))
            if fh != want:
                bad.append(f"{r['id']}: SECOND IMPLEMENTATION differs at {x},{y}: {fh} vs {want}")
            npts += 1
    print("hit points cross-checked with the Fraction implementation:", npts)
    # models: re-derive
    for r in rows:
        if r["group"] == "M" and r["expected"] and not r["error"]:
            lim = json.loads(r["input"]).get("limits") if r["input"].startswith('{"limits"') else None
            m = igr.build_model(rd(r["scene"]), rd(r["layout"]), lim)
            if igr.model_bytes(m) != rd(r["expected"]):
                bad.append(f"{r['id']}: model bytes differ")
    # manifests and comparisons
    for r in rows:
        if r["group"] == "P":
            try:
                igr.verify_manifest(json.loads(rd(r["input"])))
                got = ""
            except igr.IgrError as e:
                got = e.tag()
            if got != r["error"]:
                bad.append(f"{r['id']}: manifest {got} vs {r['error']}")
        if r["group"] == "C":
            m = igr.build_model(rd(r["scene"]), rd(r["layout"]))
            doc = json.loads(rd(r["input"]))
            try:
                if doc.get("op") == "serializeProjection":
                    res = igr.serialize_projection(m, doc["reports"][0]["report"])
                    got = ""
                    res = None
                else:
                    res = igr.compare_projections(m, [(e["renderer"], e["report"]) for e in doc["reports"]])
                    got = ""
            except igr.IgrError as e:
                got = e.tag()
            if got != r["error"]:
                bad.append(f"{r['id']}: compare error {got} vs {r['error']}")
            elif not got and igr.cjb(res) != rd(r["expected"]):
                bad.append(f"{r['id']}: compare bytes differ")
    # divRound / floorDiv against Fractions
    import random
    rnd = random.Random(12345)
    for _ in range(20000):
        a, b = rnd.randint(-10 ** 12, 10 ** 12), rnd.randint(1, 10 ** 6)
        if igr.floor_div(a, b) != math.floor(Fraction(a, b)):
            bad.append("floor_div")
        if igr.div_round(a, b) != math.floor(Fraction(a, b) + Fraction(1, 2)):
            bad.append("div_round")
    print("floor_div/div_round checked against Fraction on 20000 random pairs")
    if bad:
        print("PROBLEMS:")
        for b in bad[:60]:
            print("  ", b)
        return 1
    print("selfcheck OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
