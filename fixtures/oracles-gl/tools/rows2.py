"""gl: rows U (renderer scripts, controller scenarios), P (probe), D and K (empty cells)."""
import json

import cvs
import dlist
import exe
import ju
import mut
import plan as P
import rend
import rows
import scn
from rows import Row, model, mk, O1, O4, MIXED, KEYB, SINGLE, size_in
from scn import Err


# ---------------------------------------------------------------- scripts (renderer rows U01-U08)

def run_script(rid, sl, calls, env=None, options=None, files=None, model_overrides=None):
    """simulate a lifecycle script on the reference renderer; fills `expect*` keys and writes expected files.
    calls: list of dicts {op, arg?, await?}; returns (script dict, files)"""
    files = files if files is not None else {}
    env = env or {"host": "headless", "reducedMotion": False, "size": {"height": 600, "width": 900}}
    rnd = rend.Renderer(options)
    cur_model = model(sl)
    out_calls = []
    pending_slots = []  # indexes of un-awaited calls whose outcome is filled when they settle

    for i, c in enumerate(calls):
        c = dict(c)
        op = c["op"]
        arg = c.get("arg")
        wait = c.get("await", True)
        out = {k: v for k, v in c.items() if k != "await"}
        if c.get("await") is False:
            out["await"] = False
        idx = len(out_calls)
        tag = "c%d" % (idx + 1)
        try:
            if op == "create":
                rnd = rend.Renderer(arg)
                res = "ok"
            elif op == "initialize":
                e2 = dict(env)
                if arg:
                    e2.update(arg)
                if wait:
                    o = rnd.submit(rnd.initialize(e2), True)
                    res = "ok" if o[0] == "ok" else o[1]
                else:
                    rnd.submit(rnd.initialize(e2), False, idx)
                    pending_slots.append(idx)
                    res = None
            elif op == "loadScene":
                msl = sl
                initial = None
                if arg and "model" in arg:
                    msl = (arg["model"]["scene"], arg["model"]["layout"])
                if arg and "initial" in arg:
                    initial = scn.read_state(model(msl), arg["initial"])
                fn = rnd.load(model(msl), initial)
                if wait:
                    o = rnd.submit(fn, True)
                    res = "ok" if o[0] == "ok" else o[1]
                else:
                    rnd.submit(fn, False, idx)
                    pending_slots.append(idx)
                    res = None
            elif op == "render":
                o = rnd.submit(lambda: None, True)
                # settle the un-awaited calls first (their outcomes were recorded by drain)
                res = "ok"
            elif op == "dispatch":
                st = rnd.dispatch(arg)
                p = "states/%s.%s.state.json" % (rid, tag)
                files[p] = scn.state_bytes(st)
                out["expect_state"] = p
                res = "ok"
            elif op == "getState":
                st = rnd.get_state()
                p = "states/%s.%s.state.json" % (rid, tag)
                files[p] = scn.state_bytes(st)
                out["expect_state"] = p
                res = "ok"
            elif op == "plan":
                rnd.plan()
                res = "ok"
            elif op == "planBytes":
                pl, b = rnd.plan()
                p = "plan/%s.%s.glplan" % (rid, tag)
                files[p] = b
                out["expect_plan"] = p
                res = "ok"
            elif op == "probe":
                f = rnd.probe_fidelity()
                out["expect_fidelity"] = f
                res = "ok"
            elif op == "export":
                b, mt = rnd.export(arg)
                out["expect_media_type"] = mt
                out["expect_bytes_sha256"] = ju.sha256_hex(b)
                res = "ok"
            elif op == "setReducedMotion":
                rnd.set_reduced(arg)
                res = "ok"
            elif op == "dispose":
                o = rnd.submit(rnd.dispose(), wait)
                res = "ok"
            else:
                raise AssertionError(op)
        except Err as e:
            res = e.cr()
        if res is not None:
            out["expect"] = res
        out_calls.append(out)
        for j in list(pending_slots):
            if j in rnd.done:
                out_calls[j]["expect"] = rnd.done[j]
                pending_slots.remove(j)
    script = {"calls": out_calls, "env": env, "listener": "record", "model": {"layout": sl[1], "scene": sl[0]}}
    if options is not None:
        script["subject_options"] = options
    return script, files


def script_row(rid, sl, calls, options=None, env=None, extra_files=None):
    script, files = run_script(rid, sl, calls, env=env, options=options)
    sp = "scripts/%s.script.json" % rid
    files[sp] = ju.ojson(script)
    if extra_files:
        files.update(extra_files)
    return Row(rid, "subject", sl[0], sl[1], sp, "", "", files)


def rows_U_renderer():
    out = []
    # U01 plan after each step
    sel = {"mode": "replace", "targets": [{"node": {"id": "i:1", "type": "person"}}], "type": "select"}
    ann = [{"node": {"id": "s:ann", "type": "person"}}]
    calls = [{"op": "initialize"}, {"op": "loadScene"}, {"op": "planBytes"},
             {"op": "dispatch", "arg": sel}, {"op": "planBytes"},
             {"op": "dispatch", "arg": {"delta": 1, "type": "focus-step"}}, {"op": "planBytes"},
             {"op": "dispatch", "arg": {"hidden": True, "targets": ann, "type": "set-hidden"}}, {"op": "planBytes"},
             {"op": "dispatch", "arg": {"hidden": False, "targets": ann, "type": "set-hidden"}}, {"op": "planBytes"},
             {"op": "dispatch", "arg": {"type": "clear-selection"}}, {"op": "planBytes"}]
    out.append(script_row("U01", O1, calls))
    # U02 resize and set-viewport
    calls = [{"op": "initialize"}, {"op": "loadScene"},
             {"op": "dispatch", "arg": {"height": 300, "type": "resize", "width": 400}}, {"op": "planBytes"},
             {"op": "dispatch", "arg": {"center_x": 400000, "center_y": 150000, "type": "set-viewport", "zoom": 2500}}, {"op": "planBytes"}]
    out.append(script_row("U02", O1, calls))
    # U03 phases
    calls = [{"op": "plan"}, {"op": "initialize"}, {"op": "plan"}, {"op": "loadScene", "await": False}, {"op": "plan"}, {"op": "render"}, {"op": "planBytes"}, {"op": "dispose"}, {"op": "plan"}]
    out.append(script_row("U03", O1, calls))
    # U04 fidelity
    kb = {"scene": KEYB[0], "layout": KEYB[1]}
    calls = [{"op": "initialize"}, {"op": "loadScene"}, {"op": "probe"},
             {"op": "loadScene", "arg": {"model": kb}}, {"op": "probe"},
             {"op": "create", "arg": {"dl": {"labels": False}}}, {"op": "initialize"}, {"op": "loadScene"}, {"op": "probe"},
             {"op": "create", "arg": None}, {"op": "initialize"}, {"op": "loadScene"}, {"op": "setReducedMotion", "arg": True}, {"op": "probe"},
             {"op": "setReducedMotion", "arg": False}, {"op": "probe"}]
    row = script_row("U04", O1, calls)
    # the second environment: reducedMotion true at initialize (the row also records it)
    out.append(row)
    # U05 export
    calls = [{"op": "initialize"}, {"op": "loadScene"}, {"op": "export", "arg": "scene"}, {"op": "export", "arg": "svg"}, {"op": "export", "arg": "png"},
             {"op": "export", "arg": "SVG"}, {"op": "export", "arg": ""}]
    out.append(script_row("U05", O1, calls))
    # U06 manifests
    files = {}
    eq = {}
    for host in ("headless", "dom"):
        r = rend.Renderer(None, host)
        m_r = r.manifest
        m_a = rend.gl_manifest(host)
        rend.verify_manifest(m_r)
        files["json/U06.%s.manifest.json" % host] = ju.cjb(m_r)
        eq[host] = {"equal_to_glManifest": ju.cjb(m_r) == ju.cjb(m_a), "verifyManifest": "ok"}
    files["json/U06.equal.json"] = ju.ojson(eq)
    out.append(Row("U06", "subject", "", "", {"also": [{"expected": "json/U06.dom.manifest.json", "host": "dom"}], "equal": "json/U06.equal.json", "host": "headless"},
                   "json/U06.headless.manifest.json", "", files))
    # U07 option validation at create
    cases = [
        ({"dl": {"x": 1}}, None), ({"x": 1}, None), ({"dl": {"labels": "yes"}}, None), ({"dl": {"maxDrawnLabelUnits": 1.5}}, None),
        ({"dl": {"maxDrawnLabelUnits": "NaN"}}, None), ({"dl": {"maxDrawnLabelUnits": -1}}, None), ([], None),
        ({"dprMilli": 249}, None), ({"dprMilli": 1000.5}, None), ({"dprMilli": "NaN"}, None), ({"dprMilli": "1000"}, None), ({"dprMilli": 8001}, None),
        ({"ink": [256, 0, 0]}, None), ({"ink": "red"}, None), ({"ink": [1, 2]}, None), ({"ink": [1.5, 0, 0]}, None), ({"ink": ["a", 0, 0]}, None),
        ({"contextAttributes": {"failIfMajorPerformanceCaveat": "no"}}, None),
        ({"capacity": {"maxDrawnLabelUnits": 5}, "dl": {"maxDrawnLabelUnits": 6}}, None),
        ({"capacity": {"maxDrawnLabelUnits": 6}, "dl": {"maxDrawnLabelUnits": 6}}, None),
        ({"contextAttributes": {"failIfMajorPerformanceCaveat": False}}, None),
    ]
    calls = []
    for opt, _ in cases:
        calls.append({"op": "create", "arg": opt})
    script, files = run_script("U07", O1, calls)
    files["scripts/U07.script.json"] = ju.ojson(script)
    out.append(Row("U07", "subject", O1[0], O1[1], "scripts/U07.script.json", "", "", files))
    # U08 capacity
    calls = [{"op": "create", "arg": {"capacity": {"maxNodes": 1}}}, {"op": "initialize"},
             {"op": "loadScene", "arg": {"model": {"scene": SINGLE[0], "layout": SINGLE[1]}}}, {"op": "planBytes"},
             {"op": "loadScene"}, {"op": "planBytes"}]
    out.append(script_row("U08", O1, calls))
    return out


def _outcome_renderer(sl, options=None):
    r = rend.Renderer(options)
    r.submit(r.initialize({"size": {"width": 900, "height": 600}}), True)
    r.submit(r.load(model(sl)), True)
    return r


def rows_U_outcomes(G):
    out = []
    # U09 witness JSON of the G01 and G05 plans
    files = {}
    for k in ("G01", "G05"):
        try:
            p = P.parse_plan(G[k])
            files["json/U09.%s.witness.json" % k] = ju.cjb(rend.gl_witness(p, _drawn_of(k)))
        except Err as e:
            files["json/U09.%s.witness.json" % k] = e.cr().encode()
    out.append(Row("U09", "subject", O1[0], O1[1], {"also": [{"expected": "json/U09.G05.witness.json", "plan": "plan/G05.glplan", "scene": MIXED[0], "layout": MIXED[1]}], "plan": "plan/G01.glplan"},
                   "json/U09.G01.witness.json", "", files))
    # U10 closure test: no file
    out.append(Row("U10", "subject", "", "", "", "", "", {}))
    # U11 witness honesty
    m, st, d, p, b = mk(O1)
    pb = rows.PB(b)
    pb.D[7] = pb.D[7][1:]  # the plan lacks one disc instance and the node is not listed in cn
    dbl = pb.bytes()
    q = P.parse_plan_lenient(dbl)
    drawn = {"edges": list(d.edges), "nodes": list(d.nodes)}
    w = rend.gl_witness(q, drawn)
    ok_nodes = sorted(ju.cj(x) for x in w["elements"]["nodes"]) == sorted(ju.cj(x) for x in drawn["nodes"])
    ok_edges = sorted(ju.cj(x) for x in w["elements"]["edges"]) == sorted(ju.cj(x) for x in drawn["edges"])
    q2 = P.parse_plan_lenient(b)
    w2 = rend.gl_witness(q2, drawn)
    good = sorted(ju.cj(x) for x in w2["elements"]["nodes"]) == sorted(ju.cj(x) for x in drawn["nodes"]) and sorted(ju.cj(x) for x in w2["elements"]["edges"]) == sorted(ju.cj(x) for x in drawn["edges"])
    res = {"honest_plan_W01": "pass" if good else "fail", "plan_lacking_a_disc_W01": "pass" if (ok_nodes and ok_edges) else "fail",
           "probe_drawn_nodes": len(drawn["nodes"]), "witness_nodes_of_the_double": len(w["elements"]["nodes"])}
    out.append(Row("U11", "subject", O1[0], O1[1], {"outcome": "json/U11.witness-honesty.json"}, "json/U11.witness-honesty.json", "", {"json/U11.witness-honesty.json": ju.ojson(res)}))
    # U12 non-default options through L01
    opt = {"name": "x-gl", "dl": {"edgeLabels": False}, "capacity": {"maxNodes": 5}, "ink": [1, 2, 3]}
    r = rend.Renderer(opt)
    sub = rend.gl_manifest("headless", opt)
    try:
        rend.verify_manifest(r.manifest)
        v = "ok"
    except Err as e:
        v = e.cr()
    res = {"CHK-CAP": "pass" if (v == "ok" and ju.cjb(r.manifest) == ju.cjb(sub)) else "fail", "capacity": r.manifest["capacity"], "labels.edge": r.manifest["capabilities"]["labels.edge"],
           "name": r.manifest["renderer"]["name"], "verifyManifest": v}
    out.append(Row("U12", "subject", O1[0], O1[1], {"only": ["L01"], "options": opt}, "json/U12.cap.json", "", {"json/U12.cap.json": ju.ojson(res)}))
    # U13 textCalls equals the Canvas layer-8 stream
    m, st, d, p, b = mk(O1)
    q = P.parse_plan_lenient(b)
    tc = cvs.record_stream(cvs.TextSource(q), 1000, (34, 34, 34), (8,))
    cs = cvs.record_stream(d, 1000, (34, 34, 34), (8,))
    out.append(Row("U13", "subject", O1[0], O1[1], {"equal_to_canvas_layer_8_stream": tc == cs, "layers": [8], "plan": "plan/G01.glplan"}, "calls/U13.calls", "", {"calls/U13.calls": tc}))
    return out


def _drawn_of(k):
    sl = {"G01": O1, "G05": MIXED}[k]
    m, st, d, p, b = mk(sl)
    return {"edges": list(d.edges), "nodes": list(d.nodes)}


# ---------------------------------------------------------------- controller rows U20-U39

def _plans(G):
    return {"plan/G01.glplan": P.parse_plan_lenient(G["G01"]), "plan/G05.glplan": P.parse_plan_lenient(G["G05"])}


def ctl_row(rid, events, G, scene=("", "")):
    plans = _plans(G)
    c = exe.Ctl()
    sts = c.run(events, plans)
    lp = "gllog/%s.log" % rid
    inp = {"events": events, "expect_log": lp, "expect_status": sts}
    return Row(rid, "subject", scene[0], scene[1], inp, lp, "", {lp: exe.log_bytes(c.log)})


def rows_U_ctl(G):
    out = []
    C1 = {"op": "C", "plan": "plan/G01.glplan"}
    C5 = {"op": "C", "plan": "plan/G05.glplan"}
    I = {"op": "init"}
    L, R, D, F = {"op": "L"}, {"op": "R"}, {"op": "D"}, {"op": "F"}
    scenarios = [
        ("U20", [I, C1, L]),
        ("U21", [I, C1, L, F]),
        ("U22", [I, C1, L, R]),
        ("U23", [I, C1, L, C5, R]),
        ("U24", [I, C1, L, R, L, R, L, R]),
        ("U25", [I, C1, L, {"op": "R", "fail": "compile"}]),
        ("U26", [I, C1, D]),
        ("U27", [{"op": "init", "fail": "compile"}]),
        ("U28", [I, C1, L, {"op": "R", "fail": "lost"}, R]),
        ("U29", [I, C1, L, L]),
        ("U30", [I, C1, R]),
        ("U31", [I, C1, L, {"op": "R", "fail": "compile"}, R]),
        ("U32", [C1, D]),
        ("U33", [I, C1, L, D]),
        ("U34", [I, C1, L, {"op": "R", "fail": "link"}, D]),
        ("U35", [I, C1, L, C5, C1, R]),
        ("U36", [I, C1, L, {"op": "R", "fail": "compile"}, L, R, D]),
        ("U38", [I, C1, I]),
        ("U39", [{"op": "init", "fail": "compile"}, D]),
    ]
    for rid, ev in scenarios:
        out.append(ctl_row(rid, ev, G))
    out.append(row_U37())
    out.sort(key=lambda r: r.id)
    return out


GLOK = {"vertexPrecision": 23, "fragmentPrecision": 23, "maxVertexAttribs": 16, "maxViewportDims": [16384, 16384], "extensions": ["WEBGL_lose_context"]}


def adapter_initialize(case, G):
    """the adapter's initialize (7.7, 7.9) against a fake: probe on scratch canvases, then its own getContext, then the controller"""
    log = []
    opt = case.get("options") or {}
    caveat = opt.get("failIfMajorPerformanceCaveat", True)
    ctl = exe.Ctl(caveat if not mut.on("K108") else True)
    spec = case["fake"]
    need = {"widthPx": 900, "heightPx": 600}
    res, plog = exe.probe(spec, need, {"failIfMajorPerformanceCaveat": ctl.attrs["failIfMajorPerformanceCaveat"]}, for_adapter=True)
    log.extend(plog)
    if res == "THROWS" or not res["available"]:
        reason = res["reason"] if res != "THROWS" else "PROBE_ERROR"
        ctl.failure = reason
        log.append(["reject", "INVALID_INPUT/INVALID_VALUE", reason])
        return log, ctl.status()
    attrs = dict(exe.ATTR_CONST)
    attrs["failIfMajorPerformanceCaveat"] = True if mut.on("K124") else ctl.attrs["failIfMajorPerformanceCaveat"]
    log.append(["getContext", "webgl2", attrs])
    own = spec.get("adapter", {"webgl2": GLOK})
    if attrs["failIfMajorPerformanceCaveat"] is False and "webgl2_relaxed" in own:
        g = own["webgl2_relaxed"]
    else:
        g = own.get("webgl2")
    if g is None:
        reason = "PERFORMANCE_CAVEAT" if mut.on("K124") else "NO_CONTEXT"
        ctl.failure = reason
        log.append(["reject", "INVALID_INPUT/INVALID_VALUE", reason])
        return log, ctl.status()
    ctl.log = []
    ctl.init()
    log.extend(ctl.log)
    return log, ctl.status()


def row_U37():
    cases = [
        {"name": "default", "fake": {"canvases": [{"webgl2": GLOK, "2d": True}, {"2d": True}], "adapter": {"webgl2": GLOK}}},
        {"name": "option-false", "options": {"failIfMajorPerformanceCaveat": False}, "fake": {"canvases": [{"webgl2": GLOK, "2d": True}, {"2d": True}], "adapter": {"webgl2": GLOK}}},
        {"name": "software-only-option-false", "options": {"failIfMajorPerformanceCaveat": False},
         "fake": {"canvases": [{"webgl2": None, "webgl2_relaxed": GLOK}, {"2d": True}], "adapter": {"webgl2": None, "webgl2_relaxed": GLOK}}},
        {"name": "software-only-default",
         "fake": {"canvases": [{"webgl2": None}, {"webgl2": None, "webgl2_relaxed": GLOK}], "adapter": {"webgl2": None, "webgl2_relaxed": GLOK}}},
    ]
    log = []
    stats = {}
    for c in cases:
        log.append(["case", c["name"]])
        l, st = adapter_initialize(c, None)
        log.extend(l)
        log.append(["status", st])
        stats[c["name"]] = st
    inp = {"cases": cases, "expect_log": "gllog/U37.log", "expect_status": stats}
    return Row("U37", "subject", "", "", inp, "gllog/U37.log", "", {"gllog/U37.log": exe.log_bytes(log)})


# ---------------------------------------------------------------- P

def _cv(gl=GLOK, **kw):
    d = {"webgl2": gl, "2d": True}
    d.update(kw)
    return d


def gl_with(**kw):
    g = dict(GLOK)
    g.update(kw)
    return g


def rows_P():
    out = []
    specs = [
        ("P01", {"factory": "not-a-function", "canvases": []}, None, None),
        ("P02", {"canvases": []}, None, None),
        ("P03", {"canvases": [{"webgl2": None}, {"webgl2": None}]}, None, None),
        ("P04", {"canvases": [{"webgl2": None}, {"webgl2": None, "webgl2_relaxed": GLOK}]}, None, None),
        ("P05", {"canvases": [_cv(gl_with(vertexPrecision=15)), _cv()]}, None, None),
        ("P06", {"canvases": [_cv(gl_with(fragmentPrecision=15)), _cv()]}, None, None),
        ("P07", {"canvases": [_cv(gl_with(maxVertexAttribs=3)), _cv()]}, None, None),
        ("P08", {"canvases": [_cv(gl_with(maxViewportDims=[4096, 4096])), _cv()]}, {"widthPx": 8192, "heightPx": 8192}, None),
        ("P09", {"canvases": [_cv(), _cv()]}, None, None),
        ("P10", {"canvases": [_cv(), {"2d": None}]}, None, None),
        ("P11", {"canvases": [_cv(one_context_type=True), {"2d": True}]}, None, None),
        ("P12", {"canvases": [_cv(throws="getParameter"), _cv()]}, None, None),
        ("P13", {"canvases": [_cv(), _cv()]}, None, None),
        ("P14", {"canvases": [_cv(), _cv()]}, None, None),
        ("P15", {"canvases": [_cv(gl_with(vertexPrecision=15, maxViewportDims=[4096, 4096])), _cv()]}, {"widthPx": 8192, "heightPx": 8192}, None),
        ("P16", {"canvases": [{"webgl2": None, "webgl2_relaxed": GLOK}, {"2d": True}]}, None, {"failIfMajorPerformanceCaveat": False}),
    ]
    for rid, spec, need, options in specs:
        res, log = exe.probe(spec, need, options)
        if res == "THROWS":
            res = {"threw": True}
        inp = {"fake": spec}
        if need:
            inp["need"] = need
        if options:
            inp["options"] = options
        rp, lp = "json/%s.probe.json" % rid, "gllog/%s.log" % rid
        inp["expect_log"] = lp
        out.append(Row(rid, "core", "", "", inp, rp, "", {rp: ju.ojson(res), lp: exe.log_bytes(log)}))
    return out


def rows_D():
    return [Row("D%02d" % i, "subject") for i in range(1, 6)]
