"""Rows U, D, K."""
import json
import math
from fractions import Fraction

import core
from core import cj, cjb, IgrError, M, len16
import dl as D
import view as V
import sim as SIM
import scenes
import base
from base import reg, Out, conv, model_of, state_of, fs, fs_json, jtxt
from rows_a import (O1, O4, EMPTY, SINGLE, MIXED, UNICODE, KEYBOUND, SV, OWN, SZ, A2VP, SVG_STATE, inp)
from ktable import KROWS

ASYNC = {"initialize", "loadScene", "render", "export", "dispose"}


def jdump(o):
    return (json.dumps(o, sort_keys=True, indent=1, ensure_ascii=False) + "\n").encode("utf-8")


def run_script(rid, sc, calls, subject_options=None, env=None, host="headless"):
    env = env or {"host": "headless", "size": {"width": 900, "height": 600}, "reducedMotion": False}
    sim = SIM.Sim(subject_options, host)
    files = {}
    out_calls = []
    pending = []
    default_model = model_of(*sc)

    def fill():
        for oc, h in list(pending):
            if h["done"]:
                oc["expect"] = h["err"] or "ok"
                pending.remove((oc, h))

    def mdl_arg(arg):
        if arg and "model" in arg:
            return model_of(arg["model"]["scene"], arg["model"]["layout"])
        return default_model

    for idx, c in enumerate(calls):
        oc = dict(c)
        op = c["op"]
        aw = c.get("await", True)
        tag = "%s.c%d" % (rid, idx)
        try:
            if op == "create":
                sim = SIM.Sim(c.get("arg"), host)
                oc["expect"] = "ok"
            elif op in ASYNC:
                if op == "initialize":
                    e = dict(env)
                    if c.get("arg"):
                        e.update(c["arg"])
                    h = sim.submit("initialize", e)
                elif op == "loadScene":
                    arg = c.get("arg")
                    initial = fs_json(arg["initial"]) if arg and "initial" in arg else None
                    h = sim.submit("loadScene", mdl_arg(arg), initial)
                elif op == "render":
                    h = sim.submit("render")
                elif op == "export":
                    h = sim.submit("export", c.get("arg"))
                else:
                    h = sim.submit("dispose")
                if aw:
                    sim.settle()
                    oc["expect"] = h["err"] or "ok"
                    if op == "export" and not h["err"]:
                        mt, by = h["ok"]
                        oc["expect_media_type"] = mt
                        oc["expect_bytes_sha256"] = core.sha256(by)
                else:
                    pending.append((oc, h))
            else:
                if op == "dispatch":
                    sim.dispatch(c["arg"])
                    p = "states/%s.state.json" % tag
                    files[p] = cjb(sim.get_state())
                    oc["expect_state"] = p
                elif op == "getState":
                    p = "states/%s.state.json" % tag
                    files[p] = cjb(sim.get_state())
                    oc["expect_state"] = p
                elif op == "displayList":
                    p = "dl/%s.dl" % tag
                    files[p] = sim.display_list_bytes()
                    oc["expect_dl"] = p
                elif op == "canvasCalls":
                    p = "calls/%s.calls" % tag
                    files[p] = sim.canvas_calls()
                    oc["expect_calls"] = p
                elif op in ("pick", "hitTest"):
                    pt = {"x": conv(c["arg"]["x"]), "y": conv(c["arg"]["y"])}
                    r = sim.pick(pt) if op == "pick" else sim.hit_test(pt)
                    oc["expect_hit"] = r
                elif op == "probe":
                    oc["expect_fidelity"] = sim.probe_fidelity()
                elif op == "setReducedMotion":
                    sim.set_reduced(c["arg"])
                else:
                    raise AssertionError(op)
                oc["expect"] = "ok"
        except IgrError as e:
            oc["expect"] = e.tag()
        if aw:
            fill()
        out_calls.append(oc)
    sim.settle()
    fill()
    script = {"calls": out_calls, "env": env, "listener": "record",
              "model": {"scene": sc[0], "layout": sc[1]}}
    if subject_options:
        script["subject_options"] = subject_options
    spath = "scripts/%s.script.json" % rid
    files[spath] = jdump(script)
    return files


def reg_script(rid, sc, calls, **kw):
    spath = "scripts/%s.script.json" % rid
    reg(rid, "subject", sc[0], sc[1], spath, "", lambda: Out(files=run_script(rid, sc, calls, **kw)))


def N(i):
    return {"node": {"id": i, "type": "person"}}


E_KNOWS = {"edge": {"ord": "0", "rel": "KNOWS", "src": {"id": "i:1", "type": "person"},
                    "tgt": {"id": "s:ann", "type": "person"}}}


def register_u():
    init = {"op": "initialize"}
    load = {"op": "loadScene"}
    dlq = {"op": "displayList"}
    reg_script("U01", O1, [
        init, load, dlq,
        {"op": "dispatch", "arg": {"type": "select", "mode": "replace", "targets": [N("i:1")]}}, dlq,
        {"op": "dispatch", "arg": {"type": "focus-step", "delta": 1}}, dlq,
        {"op": "dispatch", "arg": {"type": "set-hidden", "targets": [N("s:ann")], "hidden": True}}, dlq,
        {"op": "dispatch", "arg": {"type": "set-hidden", "targets": [N("s:ann")], "hidden": False}}, dlq,
        {"op": "dispatch", "arg": {"type": "clear-selection"}}, dlq])
    reg_script("U02", O1, [
        init, load,
        {"op": "dispatch", "arg": {"type": "resize", "width": 400, "height": 300}}, dlq,
        {"op": "dispatch", "arg": {"type": "set-viewport", "center_x": 383554, "center_y": 134563, "zoom": 1000}}, dlq,
        {"op": "canvasCalls"}])
    reg_script("U03", O1, [
        dlq, init, dlq,
        {"op": "loadScene", "await": False}, dlq,
        {"op": "render"}, dlq,
        {"op": "dispose"}, dlq])
    kb = {"model": {"scene": KEYBOUND[0], "layout": KEYBOUND[1]}}
    reg_script("U04", O1, [
        init, load, {"op": "probe"},
        {"op": "loadScene", "arg": kb}, {"op": "probe"},
        {"op": "create", "arg": {"dl": {"labels": False}}}, init, load, {"op": "probe"},
        {"op": "create", "arg": {"dl": {"edgeLabels": False}}}, init, load, {"op": "probe"},
        {"op": "create"}, {"op": "initialize", "arg": {"reducedMotion": True}}, load, {"op": "probe"},
        {"op": "setReducedMotion", "arg": False}, {"op": "probe"}])
    reg_script("U05", O1, [
        init, load,
        {"op": "export", "arg": "scene"}, {"op": "export", "arg": "svg"}, {"op": "export", "arg": "png"},
        {"op": "export", "arg": "SVG"}, {"op": "export", "arg": ""}])
    # U06 manifests -------------------------------------------------
    def u06():
        files = {}
        for host in ("headless", "dom"):
            m = SIM.canvas_manifest(host)
            SIM.verify_manifest(m)
            files["json/U06.%s.manifest.json" % host] = cjb(m)
        return Out(files=files)
    reg("U06", "subject", "", "", {"hosts": ["headless", "dom"]}, "json/U06.headless.manifest.json", u06)
    # U07 option validation at create ------------------------------------
    cases7 = [{"dl": {"bogus": True}}, {"dl": {"labels": "yes"}}, {"dl": {"maxDrawnLabelUnits": 1.5}},
              {"dl": {"maxDrawnLabelUnits": "NaN"}}, {"dl": {"maxDrawnLabelUnits": -1}}, {"dl": []},
              {"dprMilli": 249}, {"dprMilli": 1000.5}, {"ink": [256, 0, 0]}, {"ink": "red"},
              {"capacity": {"maxDrawnLabelUnits": 5}, "dl": {"maxDrawnLabelUnits": 6}},
              {"capacity": {"maxDrawnLabelUnits": 6}, "dl": {"maxDrawnLabelUnits": 6}}, {"capacity": {"maxDrawnLabelUnits": 7}},
              {"name": "x-canvas"}]

    def u07():
        res = []
        for c in cases7:
            try:
                SIM.renderer_options(conv(c), "headless")
                res.append({"options": c, "result": "ok"})
            except IgrError as e:
                res.append({"options": c, "result": e.tag()})
        return Out(files={"json/U07.options.json": jdump(res)})
    reg("U07", "subject", "", "", {"cases": cases7}, "json/U07.options.json", u07)
    sg = {"model": {"scene": SINGLE[0], "layout": SINGLE[1]}}
    reg_script("U08", O1, [
        {"op": "create", "arg": {"capacity": {"maxNodes": 1}}}, init, {"op": "loadScene", "arg": sg}, dlq,
        load, dlq], )
    # U09 witnesses -------------------------------------------------
    def u09():
        files = {}
        for nm, sc, st in (("C01", O1, "initial"), ("C03", MIXED, "states/C03.state.json")):
            mdl = model_of(*sc)
            s_ = state_of(mdl, st, SZ)
            d = D.build_dl(mdl, s_)
            stream = fs("calls/%s.calls" % nm)
            files["json/U09.%s.witness.json" % nm] = cjb(V.canvas_witness(stream, d))
        return Out(files=files)
    reg("U09", "subject", "", "", {"calls": "calls/C01.calls", "also": [{"calls": "calls/C03.calls"}]},
        "json/U09.C01.witness.json", u09)

    def u10():
        res = []
        for sc in (O1, MIXED, SV("loops2")):
            mdl = model_of(*sc)
            s = SIM.Sim()
            s.submit("initialize", {"size": {"width": 900, "height": 600}})
            s.submit("loadScene", mdl, None)
            s.settle()
            res.append(SIM.witness_check(s.witness(), mdl, s.state))
        return Out(extra=res)
    reg("U10", "subject", "", "", "", "", u10)

    # U11 witness honesty (outcome file) ----------------------------------
    def witness_of(stream, d, mdl, st):
        if M("K120"):
            hn, he = core.eff_hidden(mdl, st)
            return {"backend": "igr-cv/1", "texts": [],
                    "elements": {"nodes": [n["ref"] for n in mdl["nodes"] if n["index"] not in hn],
                                 "edges": [e["ref"] for e in mdl["edges"] if e["index"] not in he]}}
        return V.canvas_witness(stream, d)

    def u11():
        mdl = model_of(*O1)
        st = state_of(mdl, "initial", SZ)
        d = D.build_dl(mdl, st)
        stream = V.record_calls(d)
        lines = [l for l in stream.split(b"\n") if l]
        # double 1: the marker of layer 7 for pid 1 stays, its painting calls are dropped
        out1, skip = [], False
        for l in lines:
            if l.startswith(b'["#",'):
                skip = (l == b'["#",1,7]')
                out1.append(l)
                continue
            if skip and (l.startswith(b'["m","fill"') or l.startswith(b'["m","stroke"')):
                continue
            out1.append(l)
        # double 2: pid 2 is omitted entirely (marker and calls)
        out2, skip = [], False
        for l in lines:
            if l.startswith(b'["#",'):
                skip = (l == b'["#",2,7]')
            if skip:
                continue
            out2.append(l)
        res = {"honest": SIM.witness_check(witness_of(stream, d, mdl, st), mdl, st)}
        for nm, ls in (("drops_painting_calls", out1), ("omits_element", out2)):
            b = b"".join(l + b"\n" for l in ls)
            res[nm + "_W01_passes"] = SIM.witness_check(witness_of(b, d, mdl, st), mdl, st)
        res["probe_stays_correct"] = True
        return Out(files={"json/U11.witness-honesty.json": jdump(res)})
    reg("U11", "subject", O1[0], O1[1], {"doubles": ["drops_painting_calls", "omits_element"]},
        "json/U11.witness-honesty.json", u11)

    def u12():
        opts = {"name": "x-canvas", "dl": {"edgeLabels": False}, "capacity": {"maxNodes": 5}, "ink": [10, 20, 30]}
        man = SIM.canvas_manifest("headless", opts)
        SIM.verify_manifest(man)
        s = SIM.Sim(opts)
        s.submit("initialize", {"size": {"width": 900, "height": 600}})
        s.submit("loadScene", model_of(*O1), None)
        s.settle()
        fid = s.probe_fidelity()
        le = man["capabilities"]["labels.edge"]
        consistent = (le["status"] == "supported") == fid["edge_labels"]
        res = {"manifest_bytes_equal": cjb(SIM.canvas_manifest("headless", opts)) == cjb(man),
               "manifest_valid": True, "fidelity_agrees_with_manifest": consistent,
               "capacity": man["capacity"], "labels_edge": le}
        return Out(files={"json/U12.cap.json": jdump(res)})
    reg("U12", "subject", O1[0], O1[1], {"subject_options": {"name": "x-canvas", "dl": {"edgeLabels": False},
                                                              "capacity": {"maxNodes": 5}, "ink": [10, 20, 30]}},
        "json/U12.cap.json", u12)

    def u13():
        s = SIM.Sim({"maxDlBytes": 100})
        s.submit("initialize", {"size": {"width": 900, "height": 600}})
        s.submit("loadScene", model_of(*O1), None)
        s.settle()
        res = {}
        h = s.submit("render")
        s.settle()
        res["render"] = h["err"] or "ok"
        for nm, f in (("displayListBytes", s.display_list_bytes), ("displayList", s.display_list)):
            try:
                f()
                res[nm] = "ok"
            except IgrError as e:
                res[nm] = e.tag()
        return Out(files={"json/U13.render.json": jdump(res)})
    reg("U13", "subject", O1[0], O1[1], {"subject_options": {"maxDlBytes": 100}}, "json/U13.render.json", u13)

    # U14: pick versus hitTest on the loop of O4 ---------------------------
    def u14_calls():
        mdl = model_of(*O4)
        st = state_of(mdl, "initial", SZ)
        d = D.build_dl(mdl, st)
        loops = [r for r in V.list_edges(d) if r[2] == 2]
        ap = V.flatten(2, loops[0][3])[8]
        return [init, load, {"op": "pick", "arg": {"x": ap[0] / 1000, "y": ap[1] / 1000}},
                {"op": "hitTest", "arg": {"x": ap[0] / 1000, "y": ap[1] / 1000}},
                {"op": "pick", "arg": {"x": 10, "y": 10}}, {"op": "hitTest", "arg": {"x": 10, "y": 10}}]
    reg("U14", "subject", O4[0], O4[1], "scripts/U14.script.json", "",
        lambda: Out(files=run_script("U14", O4, u14_calls())))


# ------------------------------------------------------------------- D rows
def _lcg(seed):
    return scenes.LCG(seed)


def d01():
    ok = True
    n_checked = 0
    for si, sc in enumerate((O1, MIXED, SV("loops2"))):
        mdl = model_of(*sc)
        rng = _lcg(1000 + si)
        st = core.initial_state(mdl, 900, 600)
        for _ in range(40):
            k = rng.next24() % 9
            nodes = [n["ref"] for n in mdl["nodes"]]
            edges = [e["ref"] for e in mdl["edges"]]
            pick = (lambda L: L[rng.next24() % len(L)]) if nodes else None
            try:
                if k == 0 and nodes:
                    it = {"type": "select", "mode": "toggle", "targets": [{"node": pick(nodes)}]}
                elif k == 1:
                    it = {"type": "focus-step", "delta": 1 if rng.next24() % 2 else -1}
                elif k == 2 and nodes:
                    it = {"type": "set-hidden", "targets": [{"node": pick(nodes)}], "hidden": bool(rng.next24() % 2)}
                elif k == 3:
                    it = {"type": "pan", "dx": rng.next24() % 200 - 100, "dy": rng.next24() % 200 - 100}
                elif k == 4:
                    it = {"type": "zoom", "factor_milli": 500 + rng.next24() % 1500}
                elif k == 5:
                    it = {"type": "fit"}
                elif k == 6:
                    it = {"type": "clear-selection"}
                elif k == 7 and edges:
                    it = {"type": "select", "mode": "add", "targets": [{"edge": edges[rng.next24() % len(edges)]}]}
                else:
                    it = {"type": "resize", "width": 200 + rng.next24() % 800, "height": 200 + rng.next24() % 500}
                st = core.reduce_intent(mdl, st, it)
            except IgrError:
                continue
            try:
                d = D.build_dl(mdl, st)
            except IgrError:
                continue
            b = D.serialize_dl(d)
            if D.parse_tag(b) != "ok":
                ok = False
            r1 = V.serialize_readout(V.readout_from_list(d, mdl))
            r2 = V.serialize_readout(V.readout_from_stream(V.record_calls(d), d, mdl))
            if r1 != r2:
                ok = False
            hn, he = core.eff_hidden(mdl, st)
            if [a for a in d["nodes"]] != [n["ref"] for n in mdl["nodes"] if n["index"] not in hn]:
                ok = False
            n_checked += 1
    return Out(extra={"ok": ok, "checked": n_checked})


def d02():
    ok = True
    for nm in ("ids12", "markup", "bidi", "illegal", "ctl", "nfc", "emptylabels", "astral", "trunc", "ids4", "longid1024"):
        sc = SV(nm)
        mdl = model_of(*sc)
        st = core.initial_state(mdl, 900, 600)
        d = D.build_dl(mdl, st)
        b = D.serialize_dl(d)
        if D.parse_tag(b) != "ok":
            ok = False
        nd = len(d["nodes"])
        texts = {r[1]: r[5] for r in d["records"] if r[0] == "T"}
        for k, n in enumerate(mdl["nodes"]):
            want = D.dl_text(n["label"])
            if want != "" and texts.get(k + 1) != want:
                ok = False
    return Out(extra={"ok": ok})


def d03():
    ok = True
    mdl = model_of(*O1)
    rng = _lcg(77)
    cases = 0
    for _ in range(60):
        cx = [0, core.SAFE - 1000, -core.SAFE + 1000, rng.next24() * 1000 - 8000000][rng.next24() % 4]
        z = [10, 100000, 1000, 1 + rng.next24() % 100000][rng.next24() % 4]
        z = max(10, min(100000, z))
        w = [1, 16384, 900][rng.next24() % 3]
        h = [1, 16384, 600][rng.next24() % 3]
        st = core.empty_state(mdl, {"center_x": cx, "center_y": 0, "height": h, "width": w, "zoom": z})
        core.MUT.add("K65")
        try:
            d = D.build_dl(mdl, st)
        finally:
            core.MUT.discard("K65")
        big = False
        for r in d["records"]:
            vals = {"E": r[4:], "A": r[2:], "N": r[4:6], "T": r[3:5]}[r[0]]
            if any(abs(v) > D.DL_COORD_MAX for v in vals):
                big = True
        try:
            D.build_dl(mdl, st)
            refused = False
        except IgrError as e:
            refused = e.tag() == "INVALID_INPUT/OUT_OF_RANGE"
        if refused != big:
            ok = False
        cases += 1
    return Out(extra={"ok": ok, "cases": cases})


def d04():
    ok = True
    mdl = model_of(*SV("trunc"))
    st = core.initial_state(mdl, 900, 600)
    d0 = D.build_dl(mdl, st)
    full = len(D.serialize_dl(d0))
    rng = _lcg(5)
    for _ in range(30):
        lim = full - 5 + rng.next24() % 10
        try:
            D.serialize_dl(d0, lim)
            refused = False
        except IgrError:
            refused = True
        if refused != (full > lim):
            ok = False
        budget = rng.next24() % 120
        fid = D.dry_label_pass(mdl, st, {"maxDrawnLabelUnits": budget})
        d = D.build_dl(mdl, st, {"maxDrawnLabelUnits": budget})
        if fid["label_units"] != sum(len16(r[5]) for r in d["records"] if r[0] == "T"):
            ok = False
        if fid["label_units"] > budget:
            ok = False
    return Out(extra={"ok": ok})


def d05():
    ok = True
    for sc, st in ((SV("loops2"), "initial"), (MIXED, "initial")):
        mdl = model_of(*sc)
        s = state_of(mdl, st, SZ)
        d = D.build_dl(mdl, s)
        edges = V.list_edges(d)
        polys = [(pid, V.flatten(form, pts)) for pid, fl, form, pts in edges]
        rng = _lcg(9)
        for i in range(120):
            if i % 3 == 0 and polys:
                pid, poly = polys[rng.next24() % len(polys)]
                q = poly[rng.next24() % len(poly)]
                px = (q[0] + rng.next24() % 12001 - 6000) / 1000
                py = (q[1] + rng.next24() % 12001 - 6000) / 1000
            else:
                px = (rng.next24() % 920000 - 10000) / 1000
                py = (rng.next24() % 620000 - 10000) / 1000
            pt = {"x": px, "y": py}
            got = V.pick_drawn(mdl, s, pt)
            # brute force with Fractions
            Pm = (core.q_milli(px), core.q_milli(py))
            vp = s["viewport"]
            if not (0 <= Pm[0] <= vp["width"] * 1000 and 0 <= Pm[1] <= vp["height"] * 1000):
                want = None
            else:
                h = core.hit_test(mdl, s, pt)
                if h is not None and h[0] == "node":
                    want = core.element_address(mdl, h)
                else:
                    want = None
                    bd = None
                    nd_ = len(d["nodes"])
                    for pid, poly in polys:
                        dist = None
                        for a, b in zip(poly, poly[1:]):
                            Dx, Dy = b[0] - a[0], b[1] - a[1]
                            L2 = Dx * Dx + Dy * Dy
                            t = Fraction((Pm[0] - a[0]) * Dx + (Pm[1] - a[1]) * Dy, L2) if L2 else Fraction(0)
                            t = max(Fraction(0), min(Fraction(1), t))
                            cx_, cy_ = a[0] + t * Dx, a[1] + t * Dy
                            dd = (Pm[0] - cx_) ** 2 + (Pm[1] - cy_) ** 2
                            dist = dd if dist is None or dd < dist else dist
                        if dist is not None and dist <= 6000 * 6000 and (bd is None or dist < bd[0]):
                            bd = (dist, pid)
                    if bd:
                        want = {"edge": d["edges"][bd[1] - nd_ - 1]}
            if got != want:
                ok = False
    return Out(extra={"ok": ok})


def d06():
    """The XR harness must catch a double that derives its readout from probe()."""
    mdl = model_of(*KEYBOUND)
    st = core.initial_state(mdl, 900, 600)
    d = D.build_dl(mdl, st)
    artifact = V.readout_from_list(d, mdl)
    # the double's probe() carries the full (untruncated) names: its probe-derived readout has full labels
    import copy
    probe_derived = copy.deepcopy(artifact)
    for e in probe_derived["labels"]["nodes"]:
        n = [n for n in mdl["nodes"] if n["ref"] == e["address"]][0]
        e["text"] = n["label"]
    probe_derived["label_units"] = sum(len16(e["text"]) for e in probe_derived["labels"]["nodes"]) + \
        sum(len16(e["text"]) for e in probe_derived["labels"]["edges"])
    harness_view = artifact
    res = V.compare_readouts([{"renderer": "list", "readout": artifact},
                              {"renderer": "double", "readout": probe_derived}])
    # a harness that takes the double's readout from probe() sees the double agreeing with itself
    res_h = V.compare_readouts([{"renderer": "list", "readout": harness_view},
                                {"renderer": "double", "readout": probe_derived}])
    return Out(extra={"caught": res_h["agree"] is False, "reference_catches": res["agree"] is False})


def register_d():
    for rid, f in (("D01", d01), ("D02", d02), ("D03", d03), ("D04", d04), ("D05", d05), ("D06", d06)):
        reg(rid, "subject", "", "", "", "", f)


def register_k():
    for kid, desc, kill in KROWS:
        reg(kid, "", "", "", "", "", lambda: Out())
