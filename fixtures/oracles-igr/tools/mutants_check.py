#!/usr/bin/env python3
"""Sensitivity check of the corpus (an oracle-author courtesy, NOT the kit's K rows): for a few of the rules that
design 13.1 lists in its rule-to-mutant table, apply the mutation to the Python reference and report which corpus
rows change.  A rule is 'covered' here iff at least one expected value differs.  Prints a table; exit 0 always."""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import igr
from igr import S

OUT = os.path.dirname(HERE)


def rd(rel):
    return open(os.path.normpath(os.path.join(OUT, rel)), "rb").read()


ROWS = []
for l in rd("EXPECT.tsv").decode("utf-8").split("\n")[1:]:
    if l:
        ROWS.append(dict(zip("id group tier scene layout input expected error".split(), l.split("\t"))))
MODELS = {}


def model(r):
    k = (r["scene"], r["layout"])
    if k not in MODELS:
        MODELS[k] = igr.build_model(rd(r["scene"]), rd(r["layout"]))
    return MODELS[k]


def fix(o):
    if isinstance(o, dict):
        return {a: fix(b) for a, b in o.items()}
    if isinstance(o, list):
        return [fix(x) for x in o]
    if isinstance(o, str):
        return {"NaN": float("nan"), "Infinity": float("inf"), "-Infinity": float("-inf")}.get(o, o)
    return o


def failing_rows(hit_fn=None):
    bad = set()
    for r in ROWS:
        if r["group"] == "R":
            m = model(r)
            sc = json.loads(rd(r["input"]))
            w, h = sc["size"]["width"], sc["size"]["height"]
            state = igr.parse_state(m, rd(sc["initial"])) if "initial" in sc else igr.initial_state(m, w, h)
            for st in sc["steps"]:
                try:
                    s2, ev = igr.reduce(m, state, fix(st["intent"]), sc.get("limits"))
                except igr.IgrError as e:
                    if st.get("error") != e.tag():
                        bad.add(r["id"])
                    continue
                except Exception:
                    bad.add(r["id"])
                    continue
                try:
                    differs = "error" in st or igr.serialize_state(m, s2) != rd(st["expected_state"]) or igr.serialize_events(ev) != rd(st["expected_events"])
                except Exception:
                    differs = True
                if differs:
                    bad.add(r["id"])
                state = s2
        if r["group"] == "S" and r["input"].startswith('{"initial"'):
            m = model(r)
            ini = json.loads(r["input"])["initial"]
            try:
                if igr.serialize_state(m, igr.initial_state(m, ini["width"], ini["height"])) != rd(r["expected"]):
                    bad.add(r["id"])
            except Exception:
                bad.add(r["id"])
        if r["group"] == "H" and hit_fn is not None:
            m = model(r)
            sc = json.loads(rd(r["input"]))
            w, h = sc["size"]["width"], sc["size"]["height"]
            for p in sc["points"]:
                rel = p.get("state", sc["state"])
                st = igr.initial_state(m, w, h) if rel == "initial" else igr.parse_state(m, rd(rel))
                try:
                    got = hit_fn(m, st, (fix(p["x"]), fix(p["y"])))
                except igr.IgrError as e:
                    if p.get("error") != e.tag():
                        bad.add(r["id"])
                    continue
                if got != p.get("hit"):
                    bad.add(r["id"])
    return sorted(bad)


def hit_variant(radius=12, tol=6, node_open=False, edge_open=False, border_open=False, pointer="q", prune_by_endpoints=False, border_raw=False):
    def f(m, st, point):
        px, py = point
        vp = st["viewport"]
        w, h = vp["width"], vp["height"]
        for v in (px, py):
            if not math.isfinite(v):
                raise igr.IgrError("INVALID_INPUT", "NOT_FINITE")
            if abs(v) > 2 ** 31:
                raise igr.IgrError("INVALID_INPUT", "OUT_OF_RANGE")
        if pointer == "q":
            P = (igr.q(px) * 1000, igr.q(py) * 1000)
        elif pointer == "double-q":
            P = (igr.quantize_px(px * 1000.0 * 1000.0) * 1000, igr.quantize_px(py * 1000.0 * 1000.0) * 1000)   # q(p*1000)*1000 with q already scaling
        else:
            P = (igr.quantize_px(px) * S, igr.quantize_px(py) * S)                                              # whole pixels
        if border_raw:                                   # K62: border tested on the raw point
            inside = (0 < px < w and 0 < py < h) if border_open else (0 <= px <= w and 0 <= py <= h)
        else:
            inside = (0 < P[0] < w * S and 0 < P[1] < h * S) if border_open else (0 <= P[0] <= w * S and 0 <= P[1] <= h * S)
        if not inside:
            return None
        sel, hid, focus, _ = igr.state_parts(m, st)
        ehid = igr.eff_hidden(m, hid)
        X, Y = igr.layout_to_screen_micro(m, vp)
        best = None
        for n in m.nodes:
            i = n["index"]
            if ("n", i) in ehid:
                continue
            d2 = (X[i] - P[0]) ** 2 + (Y[i] - P[1]) ** 2
            lim = (radius * S) ** 2
            if (d2 < lim if node_open else d2 <= lim) and (best is None or d2 < best[0]):
                best = (d2, i)
        if best:
            return {"node": dict(m.nodes[best[1]]["ref"])}
        eb = None
        for e in m.edges:
            j = e["index"]
            if ("e", j) in ehid:
                continue
            ax, ay, bx, by = X[e["src"]], Y[e["src"]], X[e["tgt"]], Y[e["tgt"]]
            if (ax, ay) == (bx, by):
                continue
            if prune_by_endpoints:
                # the forbidden shortcut: skip an edge when BOTH endpoints are far from the pointer
                if min(math.hypot(ax - P[0], ay - P[1]), math.hypot(bx - P[0], by - P[1])) > 13 * S:
                    continue
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy
            tn = (P[0] - ax) * dx + (P[1] - ay) * dy
            if not (0 < tn < L2):
                continue
            cr = (P[0] - ax) * dy - (P[1] - ay) * dx
            num, den = cr * cr, L2
            lim = (tol * S) ** 2 * den
            if (num < lim if edge_open else num <= lim) and (eb is None or num * eb[2] < eb[1] * den):
                eb = (j, num, den)
        if eb:
            return {"edge": json.loads(json.dumps(m.edges[eb[0]]["ref"]))}
        return None
    return f


def main():
    base = failing_rows(igr.hit_test)
    print("baseline (must be empty):", base)
    tests = []
    # K41: truncating division in pan
    def trunc_div(a, b):
        q = abs(a) // b
        return q if a >= 0 else -q
    orig_fd, orig_dr = igr.floor_div, igr.div_round
    igr.div_round = lambda a, b: trunc_div(2 * a + b, 2 * b)
    tests.append(("K41 truncating division in divRound/pan", failing_rows(igr.hit_test)))
    igr.div_round = orig_dr
    # K42: divRound ties toward -infinity
    igr.div_round = lambda a, b: -orig_fd(-(2 * a + b) + 2 * b - 1, 2 * b) if False else orig_fd(2 * a + b - 1, 2 * b)
    tests.append(("K42 divRound ties toward -inf", failing_rows(igr.hit_test)))
    igr.div_round = orig_dr
    for name, kw in [("K44 pointer q(p*1000)*1000 (wrong unit)", dict(pointer="double-q")), ("K45 pointer whole pixels", dict(pointer="px")),
                     ("K46 node boundary open", dict(node_open=True)), ("K47 edge boundary open", dict(edge_open=True)),
                     ("K48 edge tolerance 5 px", dict(tol=5)), ("K49 edge tolerance 7 px", dict(tol=7)), ("K25 radius 11", dict(radius=11)),
                     ("K50 viewport border open (quantized point)", dict(border_open=True)), ("K62 border tested on the raw point", dict(border_raw=True)), ("K57 edges pruned by endpoint offsets", dict(prune_by_endpoints=True))]:
        tests.append((name, failing_rows(hit_variant(**kw))))
    # K21 pan sign flipped
    orig_reduce = igr.reduce

    def reduce_pan_flip(m, st, intent, limits=None):
        if isinstance(intent, dict) and intent.get("type") == "pan":
            intent = dict(intent, dx=-intent["dx"], dy=-intent["dy"])
        return orig_reduce(m, st, intent, limits)
    igr.reduce = reduce_pan_flip
    tests.append(("K21 pan sign flipped", failing_rows()))
    igr.reduce = orig_reduce
    # K43 zoom anchor ignored
    def reduce_noanchor(m, st, intent, limits=None):
        if isinstance(intent, dict) and intent.get("type") == "zoom" and "anchor" in intent:
            intent = {k: v for k, v in intent.items() if k != "anchor"}
        return orig_reduce(m, st, intent, limits)
    igr.reduce = reduce_noanchor
    tests.append(("K43 zoom anchor ignored", failing_rows()))
    igr.reduce = orig_reduce
    # K43b anchor single rounded: cx + divRound(u*S*(1/(2z) - 1/(2z')))  (drift)
    def reduce_single(m, st, intent, limits=None):
        if isinstance(intent, dict) and intent.get("type") == "zoom" and "anchor" in intent:
            ns, ev = orig_reduce(m, st, {k: v for k, v in intent.items() if k != "anchor"}, limits)
            z, z2 = st["viewport"]["zoom"], ns["viewport"]["zoom"]
            a = intent["anchor"]
            u, v = 2 * a["x"] - st["viewport"]["width"], 2 * a["y"] - st["viewport"]["height"]
            ns["viewport"]["center_x"] = st["viewport"]["center_x"] + igr.div_round(u * S * (z2 - z), 2 * z * z2)
            ns["viewport"]["center_y"] = st["viewport"]["center_y"] + igr.div_round(v * S * (z2 - z), 2 * z * z2)
            return ns, ev
        return orig_reduce(m, st, intent, limits)
    igr.reduce = reduce_single
    tests.append(("K43b zoom anchor single-rounded (drift)", failing_rows()))
    igr.reduce = orig_reduce
    # K22 zoom without clamp
    zmin, zmax = igr.ZOOM_MIN_MILLI, igr.ZOOM_MAX_MILLI
    orig_clamp = igr.clamp
    igr.clamp = lambda v, lo, hi: v if (lo, hi) == (zmin, zmax) and False else orig_clamp(v, lo, hi)
    def reduce_noclamp(m, st, intent, limits=None):
        if isinstance(intent, dict) and intent.get("type") == "zoom":
            z = st["viewport"]["zoom"]
            f = intent["factor_milli"]
            ns, ev = orig_reduce(m, st, intent, limits)
            ns["viewport"]["zoom"] = igr.div_round(z * f, 1000)       # unclamped
            return ns, ev
        return orig_reduce(m, st, intent, limits)
    igr.reduce = reduce_noclamp
    try:
        tests.append(("K22 zoom without clamp", failing_rows()))
    finally:
        igr.reduce = orig_reduce
        igr.clamp = orig_clamp
    # K78 quantizer tie rounds down (frac > 0.5 instead of >= 0.5)
    orig_q = igr.q
    igr.q = lambda v: (lambda s_: math.floor(s_) + (1 if s_ - math.floor(s_) > 0.5 else 0))(float(v) * 1000.0)
    tests.append(("K78 quantizer tie rounded down", failing_rows(hit_variant())))
    igr.q = orig_q
    # K72 fit centre by truncating halving ((min+max)/2 rounded down instead of divRound)
    orig_fit0 = igr.fit_vp
    def fit72(m, hn, w, h, p, cur):
        vp = orig_fit0(m, hn, w, h, p, cur)
        vis = [n for n in m.nodes if n["index"] not in hn]
        if vis:
            vp["center_x"] = (min(n["x"] for n in vis) + max(n["x"] for n in vis)) // 2
            vp["center_y"] = (min(n["y"] for n in vis) + max(n["y"] for n in vis)) // 2
        return vp
    igr.fit_vp = fit72
    tests.append(("K72 fit centre truncated", failing_rows()))
    igr.fit_vp = orig_fit0
    # K23 fit ignores padding
    orig_fit = igr.fit_vp
    igr.fit_vp = lambda m, hn, w, h, p, cur: orig_fit(m, hn, w, h, 0, cur)
    tests.append(("K23 fit ignores padding", failing_rows()))
    igr.fit_vp = orig_fit
    # K61 fit counts hidden nodes
    igr.fit_vp = lambda m, hn, w, h, p, cur: orig_fit(m, set(), w, h, p, cur)
    tests.append(("K61 fit counts hidden nodes", failing_rows()))
    igr.fit_vp = orig_fit
    for name, rows in tests:
        print(("COVERED   " if rows else "NOT COVERED"), name, rows[:12])
    for name, rows in run_rev5():
        print(("COVERED   " if rows else "NOT COVERED"), name, rows[:12])
    return 0



# ----------------------------------------------------------------------------------------------
# rev 5: source-level mutants of the core functions, replayed against the S, M, P, A, L27 rows
# ----------------------------------------------------------------------------------------------
def load_variant(pairs):
    src = open(os.path.join(HERE, "igr.py"), encoding="utf-8").read()
    for a, b in pairs:
        assert src.count(a) == 1, a[:60]
        src = src.replace(a, b)
    ns = {"__name__": "igr_variant"}
    exec(compile(src, "igr_variant", "exec"), ns)

    class Mod:
        pass
    mod = Mod()
    mod.__dict__.update(ns)
    return mod


def replay_core(mod):
    """returns the ids of S, M, P, A, L27 and limit rows whose expected value differs when computed with `mod`."""
    bad = set()

    def mdl(r, limits=None):
        return mod.build_model(rd(r["scene"]), rd(r["layout"]), limits)
    for r in ROWS:
        g = r["id"][0]
        try:
            if g == "S" and r["input"] and not r["input"].startswith('{"initial"'):
                m = mdl(r)
                if r["input"].startswith('{"file"'):
                    spec = json.loads(r["input"])
                    raw, lim = rd(spec["file"]), spec["limits"]
                else:
                    raw, lim = rd(r["input"]), None
                try:
                    mod.parse_state(m, raw, lim)
                    got = ""
                except mod.IgrError as e:
                    got = e.tag()
                if got != r["error"]:
                    bad.add(r["id"])
            if g == "M" and (r["expected"] or r["error"]) and r["input"] != '{"plain_object_model":true}':
                lim = json.loads(r["input"]).get("limits") if r["input"].startswith('{"limits"') else None
                try:
                    got, err = mod.model_bytes(mdl(r, lim)), ""
                except mod.IgrError as e:
                    got, err = None, e.tag()
                if err != r["error"] or (not err and got != rd(r["expected"])):
                    bad.add(r["id"])
            if g == "P":
                try:
                    mod.verify_manifest(json.loads(rd(r["input"])))
                    got = ""
                except mod.IgrError as e:
                    got = e.tag()
                if got != r["error"]:
                    bad.add(r["id"])
            if g == "A":
                m = mdl(r)
                sc = json.loads(rd(r["input"]))
                state = mod.parse_state(m, rd(sc["initial"])) if "initial" in sc else mod.initial_state(m, sc["size"]["width"], sc["size"]["height"])
                evs = []
                for st in sc["steps"]:
                    if "expected_state" in st:
                        state = mod.parse_state(m, rd(st["expected_state"]))
                        evs = json.loads(rd(st["expected_events"]))
                    else:
                        evs = []
                ann = [a for a in (mod.announcement_for(m, e, state) for e in evs) if a is not None]
                doc = {"accessible": mod.build_accessible(m, state), "announcements": ann, "summary": mod.graph_summary(m)}
                if r["expected"].endswith(".a11y.json") and mod.cjb(doc) != rd(r["expected"]):
                    bad.add(r["id"])
            if r["id"] == "L27":
                for c in json.loads(rd(r["input"]))["calls"]:
                    lim = fix(c["arg"])["limits"]
                    try:
                        mod.validate_limits(lim)
                        got = "ok"
                    except mod.IgrError as e:
                        got = e.tag()
                    if got != c["expect"]:
                        bad.add("L27")
            if g == "R" and r["id"] in ("R39", "R40", "R51", "R52"):
                sc = json.loads(rd(r["input"]))
                m = mdl(r, sc.get("limits"))
                state = mod.initial_state(m, sc["size"]["width"], sc["size"]["height"])
                for st in sc["steps"]:
                    try:
                        state, _ = mod.reduce(m, state, fix(st["intent"]), sc.get("limits"))
                        got = ""
                    except mod.IgrError as e:
                        got = e.tag()
                    if got != st.get("error", ""):
                        bad.add(r["id"])
        except Exception:
            bad.add(r["id"])
    return sorted(bad)


ORDER_BLOCK = (chr(32)*4 + "for r in resolved:" + chr(10) + chr(32)*8 + "idxs = [el[1] for el in r]" + chr(10) + chr(32)*8 + "if any(b <= a for a, b in zip(idxs, idxs[1:])):" + chr(10)
               + chr(32)*12 + 'raise _schema("NON_CANONICAL")' + chr(10))
FOCUS_END = (chr(32)*4 + "if focus is not None and focus in ehid:" + chr(10) + chr(32)*8 + 'raise _schema("FOCUS_HIDDEN")' + chr(10) + chr(10) + chr(10) + "def parse_state")


def run_rev5():
    base = replay_core(load_variant([]))
    assert base == [], base
    out = []
    muts = [
        ("K58 parseState: ordering checked before integrity", [(
            "    resolved = []\n    for arr in arrays:",
            "    for arr in arrays:\n        pre = [lookup_element(m, a) for a in arr]\n        idx0 = [el[1] for el in pre if el is not None]\n"
            "        if any(b <= a for a, b in zip(idx0, idx0[1:])):\n            raise _schema(\"NON_CANONICAL\")\n    resolved = []\n    for arr in arrays:")]),
        ("K58b parseState: consistency checked before ordering", [(ORDER_BLOCK, ""), (
            FOCUS_END, FOCUS_END[:-len("def parse_state")].rstrip(chr(10)) + chr(10) + ORDER_BLOCK + chr(10) + chr(10) + "def parse_state")]),
        ("K59 parseState: binding checked last", [(
            "    if bind and st[\"scene_sha256\"] != m.scene_sha256:\n        raise _schema(\"SCENE_MISMATCH\")\n"
            "    if bind and st[\"layout_sha256\"] != m.layout_sha256:\n        raise _schema(\"LAYOUT_MISMATCH\")\n    arrays = []",
            "    arrays = []"), (
            "    if focus is not None and focus in ehid:\n        raise _schema(\"FOCUS_HIDDEN\")\n\n\ndef parse_state",
            "    if focus is not None and focus in ehid:\n        raise _schema(\"FOCUS_HIDDEN\")\n"
            "    if bind and st[\"scene_sha256\"] != m.scene_sha256:\n        raise _schema(\"SCENE_MISMATCH\")\n"
            "    if bind and st[\"layout_sha256\"] != m.layout_sha256:\n        raise _schema(\"LAYOUT_MISMATCH\")\n\n\ndef parse_state")]),
        ("K73 SELECTED_HIDDEN / FOCUS_HIDDEN order swapped", [(
            "    if any(el in ehid for el in sel):\n        raise _schema(\"SELECTED_HIDDEN\")\n    if focus is not None and focus in ehid:\n        raise _schema(\"FOCUS_HIDDEN\")",
            "    if focus is not None and focus in ehid:\n        raise _schema(\"FOCUS_HIDDEN\")\n    if any(el in ehid for el in sel):\n        raise _schema(\"SELECTED_HIDDEN\")")]),
        ("K75 lone surrogate not detected", [("    _strings_ok(obj)\n    st = walk_state(obj)", "    st = walk_state(obj)")]),
        ("K76 text budget boundary exclusive", [("    if total > lim[\"maxSceneBytes\"]:", "    if total >= lim[\"maxSceneBytes\"]:")]),
        ("K77 state size boundary exclusive", [("    if len(raw) > lim[\"maxStateBytes\"]:", "    if len(raw) >= lim[\"maxStateBytes\"]:")]),
        ("K79 duplicate degradations accepted", [("            if degs != sorted(set(degs)) and all(d in DEGRADATIONS for d in degs):", "            if degs != sorted(degs) and all(d in DEGRADATIONS for d in degs):")]),
        ("K80 `ord` leading zero accepted", [("_ORD = re.compile(r\"(0|[1-9][0-9]*)\")", "_ORD = re.compile(r\"[0-9]+\")")]),
        ("K81 fractional host limit accepted", [("            if v != math.floor(v):\n                raise IgrError(\"INVALID_INPUT\", \"INVALID_VALUE\")", "            pass")]),
        ("K82 categories in UTF-16 order", [("m.categories = sorted({n[\"category\"] for n in m.nodes}, key=u8)", "m.categories = sorted({n[\"category\"] for n in m.nodes}, key=u16key)")]),
    ]
    for name, pairs in muts:
        out.append((name, replay_core(load_variant(pairs))))
    return out


if __name__ == "__main__":
    sys.exit(main())
