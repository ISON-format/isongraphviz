"""Rows C, P, Q, G, X, M, H, D, K."""
import copy

from base import *  # noqa
import base
from machine import *  # noqa
from companion import *  # noqa
import export as EX
from export import *  # noqa
from corpus import *  # noqa
import corpus as C
from rows_a import jin, errs, S_, nd_o1, script_row


def errs_any(fn):
    try:
        fn()
        return ""
    except IaErr as e:
        return str(e)
    except Exception as e:  # unstructured failure
        return "UNSTRUCTURED/" + type(e).__name__


# ---------------------------------------------------------------- event helpers (semantic events)
def sel_ev(m, els):
    return {"selection": [object_ref(m, e) for e in els], "type": "selection-changed"}


def foc_ev(m, el):
    return {"focus": object_ref(m, el), "type": "focus-changed"}


# ================================================================= C rows
def c_row(id_, scname, state=None, options=None, events=None):
    s = SC[scname]
    m = s.model
    st = state[1] if state is not None else mk_state(m)
    inp = {"size": {"height": 600, "width": 900}, "state": state[0] if state is not None else "initial"}
    if options:
        inp["options"] = options
    if events is not None:
        inp["events"] = events
    out = "trees/%s.tree.json" % id_

    def ev():
        o = dict(options or {})
        o["events"] = copy.deepcopy(events or [])
        return {out: tree_bytes(build_tree(m, st, o))}, ""
    add_row(Row(id_, scene=s.scene_path, layout=s.layout_path, input_=jin(inp), expected=out, ev=ev))
    return out


def tree_of(scname, st, options=None, events=None):
    m = SC[scname].model
    o = dict(options or {})
    o["events"] = events or []
    return build_tree(m, st, o)


def build_C():
    g = SC["G9"].model
    o1 = SC["O1"].model
    n = lambda c: nd(g, c)
    c_row("C01", "O1")
    st = S_("O1", "c02", selection=[nd_o1(o1, "i:1"), ("e", 0)], focus=("e", 0))
    c_row("C02", "O1", st)
    c03 = S_("G9", "c03", selection=[n("a")], focus=n("e"))
    ev03 = [sel_ev(g, [n("a")]), foc_ev(g, n("e"))]
    c_row("C03", "G9", c03, events=ev03)
    c_row("C04", "G9", S_("G9", "c04", hidden=[n("e")]))
    w = SC["W520"].model
    c_row("C05", "W520", S_("W520", "w300", focus=("n", 299)))
    c_row("C06", "W520")
    c_row("C07", "W520", S_("W520", "w510", focus=("n", 509)))
    c_row("C08", "W520", S_("W520", "w300", focus=("n", 299)), options={"window": {"count": 5, "first": 10}})
    c_row("C09", "G9", c03, events=[sel_ev(g, [n("a")]), sel_ev(g, [n("a")])])
    h1 = SC["H1"].model
    c_row("C10", "H1", S_("H1", "h1f", focus=("n", 0)), events=[foc_ev(h1, ("n", 0))])
    h2 = SC["H2"].model
    c_row("C11", "H2", S_("H2", "h2f", focus=("n", 0)), events=[foc_ev(h2, ("n", 0))])
    c_row("C12", "EMPTY")
    c_row("C13", "HOST")
    c_row("C14", "O1", options={"idPrefix": "my-c"})
    c_row("C15", "W520", options={"window": "all"})
    c_row("C16", "PROTO")
    s17 = S_("O1", "o1_sel_i1", selection=[nd_o1(o1, "i:1")])
    c_row("C17", "O1", s17, events=[sel_ev(o1, [nd_o1(o1, "i:1")]), {"type": "viewport-changed", "viewport": s17[1]["viewport"]},
                                   sel_ev(o1, [nd_o1(o1, "i:1")])])
    c_row("C18", "O1", options={"mode": "marquee"})
    c_row("C19", "G9", c03, options={"omitFocusAnnouncement": True}, events=[foc_ev(g, n("e")), sel_ev(g, [n("a")])])
    c_row("C20", "G9", c03, events=[{"type": "marquee-started"}, {"reason": "NOT_A_NODE", "type": "nav-none"},
                                   {"count": 8, "type": "lasso-too-large"}, {"dir": "right", "nav": "spatial", "type": "nav-boundary"}])


# ================================================================= P and Q rows
def tree_file(path, tree):
    aux(path, tree_bytes(tree))
    return path


def p_row(id_, scname, prev_path, prev, next_path, nxt, maxp=None, error_expected=None):
    s = SC[scname]
    inp = {"next": next_path, "prev": prev_path}
    if maxp is not None:
        inp["maxPlanBytes"] = maxp
    out = "plans/%s.plan.txt" % id_

    def ev():
        try:
            ops = plan_update(copy.deepcopy(prev), copy.deepcopy(nxt), maxp if maxp is not None else 16777216)
        except IaErr as e:
            return {}, str(e)
        return {out: serialize_plan(ops)}, ""
    files, err = ev()
    add_row(Row(id_, scene=s.scene_path, layout=s.layout_path, input_=jin(inp), expected="" if err else out, error=err, ev=ev))
    return ops_of(prev, nxt) if not err else None


def ops_of(prev, nxt):
    return plan_update(copy.deepcopy(prev), copy.deepcopy(nxt))


def build_PQ():
    g = SC["G9"].model
    o1 = SC["O1"].model
    n = lambda c: nd(g, c)
    T = lambda id_: json.loads(ROWS[id_].evaluate()[0]["trees/%s.tree.json" % id_].decode())
    c01 = T("C01")
    c04 = T("C04")
    c05 = T("C05")
    p01 = p_row("P01", "O1", None, None, "trees/C01.tree.json", c01)
    s2 = S_("O1", "o1_sel_i1_foc", selection=[nd_o1(o1, "i:1")], focus=nd_o1(o1, "i:1"))
    t2 = tree_of("O1", s2[1])
    tree_file("trees/P02.next.tree.json", t2)
    p_row("P02", "O1", "trees/C01.tree.json", c01, "trees/P02.next.tree.json", t2)
    p_row("P03", "O1", "trees/C01.tree.json", c01, "trees/C01.tree.json", c01)
    w = SC["W520"].model
    t310 = tree_of("W520", S_("W520", "w310", focus=("n", 309))[1])
    tree_file("trees/P04.next.tree.json", t310)
    p_row("P04", "W520", "trees/C05.tree.json", c05, "trees/P04.next.tree.json", t310)
    t5 = copy.deepcopy(c01)
    t5["scene_sha256"] = "1" * 64
    tree_file("trees/P05.next.tree.json", t5)
    p_row("P05", "O1", "trees/C01.tree.json", c01, "trees/P05.next.tree.json", t5)
    t6 = tree_of("O1", mk_state(o1), events=[{"end": "end", "type": "traversal-boundary"}])
    tree_file("trees/P06.next.tree.json", t6)
    p_row("P06", "O1", "trees/C01.tree.json", c01, "trees/P06.next.tree.json", t6)
    g0t = tree_of("G9", mk_state(g))
    tree_file("trees/P07.prev.tree.json", g0t)
    p_row("P07", "G9", "trees/P07.prev.tree.json", g0t, "trees/C04.tree.json", c04)
    p_row("P08", "G9", "trees/C04.tree.json", c04, "trees/P07.prev.tree.json", g0t)
    t9 = tree_of("O1", s17_state(o1), events=[sel_ev(o1, [nd_o1(o1, "i:1")])])
    tree_file("trees/P09.tree.json", t9)
    p_row("P09", "O1", "trees/P09.tree.json", t9, "trees/P09.tree.json", t9)
    p_row("P10", "O1", None, None, "trees/C01.tree.json", c01, maxp=1000)
    # P11: invariant I-C1
    pairs = [("trees/C01.tree.json", c01, "trees/P02.next.tree.json", t2), ("trees/C05.tree.json", c05, "trees/P04.next.tree.json", t310),
             ("trees/P07.prev.tree.json", g0t, "trees/C04.tree.json", c04), ("trees/C04.tree.json", c04, "trees/P07.prev.tree.json", g0t)]
    names = ["P02", "P04", "P07", "P08"]
    out = "json/P11.invariant.json"

    def ev11():
        res = []
        for nm, (pp, pt, np_, nt) in zip(names, pairs):
            d1, _ = sim_build(pt)
            es1 = None
            d1 = SimDom()
            es = ExecState(d1)
            execute_plan(d1, full_build(pt), es)
            execute_plan(d1, plan_update(copy.deepcopy(pt), copy.deepcopy(nt)), es)
            d2, _ = sim_build(nt)
            res.append({"equal": dom_dump(d1.host) == dom_dump(d2.host), "pair": nm})
        return {out: cjb(res)}, ""
    inp11 = jin({"pairs": [{"next": b, "pair": nm, "prev": a} for nm, (a, _, b, _) in zip(names, pairs)]})
    add_row(Row("P11", scene=SC["G9"].scene_path, layout=SC["G9"].layout_path, input_=inp11, expected=out, ev=ev11))
    # Q rows
    def q_row(id_, scname, plan_paths):
        s = SC[scname]
        plans = [AUX[p] if p in AUX else None for p in plan_paths]
        out = "logs/%s.log.txt" % id_
        return out, s, plans

    def mk_q(id_, scname, plan_paths, plan_bytes):
        s = SC[scname]
        out = "logs/%s.log.txt" % id_

        def ev():
            d = SimDom()
            es = ExecState(d)
            for i, pb in enumerate(plan_bytes):
                if i == len(plan_bytes) - 1:
                    d.log = []
                execute_plan(d, parse_lines(pb), es)
            return {out: log_bytes(d.log)}, ""
        add_row(Row(id_, scene=s.scene_path, layout=s.layout_path, input_=jin({"plans": plan_paths}), expected=out, ev=ev))
    pb = lambda prev, nxt: serialize_plan(plan_update(copy.deepcopy(prev), copy.deepcopy(nxt)))
    p01b = serialize_plan(full_build(c01))
    p02b = pb(c01, t2)
    p05b = pb(c01, t5)
    pre = serialize_plan(full_build(g0t))
    aux("plans/Q04.pre.plan.txt", pre)
    p07b = pb(g0t, c04)
    mk_q("Q01", "O1", ["plans/P01.plan.txt"], [p01b])
    mk_q("Q02", "O1", ["plans/P01.plan.txt", "plans/P02.plan.txt"], [p01b, p02b])
    mk_q("Q03", "O1", ["plans/P01.plan.txt", "plans/P05.plan.txt"], [p01b, p05b])
    mk_q("Q04", "G9", ["plans/Q04.pre.plan.txt", "plans/P07.plan.txt"], [pre, p07b])


def s17_state(o1):
    return S_("O1", "o1_sel_i1", selection=[nd_o1(o1, "i:1")])[1]


# ================================================================= G rows
def build_G():
    o1 = SC["O1"].model
    g = SC["G9"].model
    n = lambda c: nd(g, c)
    default = default_bindings()
    c01 = json.loads(ROWS["C01"].evaluate()[0]["trees/C01.tree.json"].decode())
    ge = S_("G9", "g_e", focus=n("e"))
    g02t = tree_of("G9", ge[1])
    tree_file("trees/G02.tree.json", g02t)
    tr = traversal(g, ge[1])
    svg_items = [{"name": el_name(g, el), "tabindex": 0 if i == 4 else -1} for i, el in enumerate(tr)]
    svg_base = {"items": svg_items, "root": {"desc": status_text(g, ge[1]), "title": summary_text(g)}}
    rd = {"focus": {"node": wire(g, n("e"))}}

    def g_row(id_, scname, state, tree_path=None, tree=None, composition=None, bindings=None, window=None, fidelity="none",
              reduced=True, readout=None, canvas_label=None, svg=None, tab_stops=None, mode=None):
        s = SC[scname]
        m = s.model
        st = state[1] if state is not None else mk_state(m)
        inp = {"state": state[0] if state is not None else "initial"}
        if composition:
            inp["composition"] = composition
        if tree_path:
            inp["tree"] = tree_path
        bpath = None
        if bindings is not None:
            bpath = aux("inputs/%s.bindings.json" % id_, cjb(bindings))
            inp["bindings"] = bpath
        if window is not None:
            inp["window"] = window
        if fidelity is not None:
            inp["fidelity"] = fidelity
            inp["reducedMotion"] = reduced
        if readout is not None:
            inp["readout"] = readout
        if canvas_label is not None:
            inp["canvasLabel"] = canvas_label
        if svg is not None:
            inp["svg"] = svg
        if tab_stops is not None:
            inp["tabStops"] = tab_stops
        if mode is not None:
            inp["mode"] = mode
        out = "gates/%s.gate.json" % id_

        def ev():
            r = run_gate(m, st, tree=copy.deepcopy(tree), composition=composition or "companion", bindings=copy.deepcopy(bindings),
                         window=window, fidelity=fidelity, reduced=reduced if fidelity is not None else None, readout=readout,
                         canvas_label=canvas_label, svg=copy.deepcopy(svg), mode=mode, tab_stops=tab_stops)
            return {out: cjb(r)}, ""
        add_row(Row(id_, scene=s.scene_path, layout=s.layout_path, input_=jin(inp), expected=out, ev=ev))

    def pt(tree, id_):
        t = copy.deepcopy(tree)
        p = tree_file("trees/%s.tree.json" % id_, t)
        return p, t

    # bases
    g_row("G01", "O1", None, "trees/C01.tree.json", c01)
    g_row("G02", "G9", ge, "trees/G02.tree.json", g02t, readout=rd, tab_stops=1)
    g_row("G32", "G9", ge, None, None, composition="svg-native", svg=svg_base, readout=rd, tab_stops=1)

    def edit(base, fn, id_):
        t = copy.deepcopy(base)
        fn(t)
        return pt(t, id_)
    # base G01
    def G1(id_, fn, **kw):
        p, t = edit(c01, fn, id_)
        g_row(id_, "O1", None, p, t, **kw)

    def setk(path_keys, v):
        def f(t):
            o = t
            for k in path_keys[:-1]:
                o = o[k]
            o[path_keys[-1]] = v
        return f
    G1("G10", setk(["items", 0, "name"], ""))
    G1("G12", setk(["items", 1, "tabindex"], 0))
    g_row("G13", "O1", None, "trees/C01.tree.json", c01, bindings=default + [{"action": {"type": "fit"}, "key": "Tab", "mode": "normal", "mods": 0}])
    g_row("G14", "O1", None, "trees/C01.tree.json", c01, bindings=[b for b in default if b["key"] != "PageDown"])
    g_row("G15", "O1", None, "trees/C01.tree.json", c01, bindings=default + [{"action": {"type": "fit"}, "key": "g", "mode": "x-mode", "mods": 0}])
    g_row("G18", "O1", None, "trees/C01.tree.json", c01, fidelity="full", reduced=True)
    G1("G19", setk(["container", "name"], ""))
    G1("G20", setk(["container", "description"], "0 selected, 1 hidden."))
    G1("G21", lambda t: t.pop("live"))
    G1("G22", setk(["live", "text"], "x" * 401))
    G1("G23", setk(["live", "politeness"], "assertive"))
    G1("G24", setk(["items", 0, "roledescription"], ""))
    g_row("G27", "O1", None, "trees/C01.tree.json", c01, fidelity=None)
    G1("G28", setk(["list", "set_size"], 4))
    G1("G29", lambda t: t["items"][2].pop("description"))
    def f31(t):
        t["items"][0]["tabindex"] = -1
        t["items"][1]["tabindex"] = 0
    G1("G31", f31)
    G1("G33", setk(["items", 0, "selected"], True))
    def f34(t):
        t["items"][0]["address"], t["items"][1]["address"] = t["items"][1]["address"], t["items"][0]["address"]
    G1("G34", f34)
    t35 = tree_of("O1", mk_state(o1), options={"window": {"count": 1, "first": 1}})
    p35 = tree_file("trees/G35.tree.json", t35)
    g_row("G35", "O1", None, p35, t35)
    G1("G36", setk(["items", 2, "tabindex"], 5))
    def f37(t):
        t["items"][1]["id"] += "0"
    G1("G37", f37)
    d41 = copy.deepcopy(default)
    for b in d41:
        if b["key"] == "PageDown":
            b["mods"] = 1
    g_row("G41", "O1", None, "trees/C01.tree.json", c01, bindings=d41)
    g_row("G44", "O1", None, "trees/C01.tree.json", c01, mode="marquee")
    # base G02
    def G2(id_, fn, st=ge, **kw):
        p, t = edit(g02t, fn, id_)
        g_row(id_, "G9", st, p, t, **dict(dict(readout=rd, tab_stops=1), **kw))
    G2("G11", lambda t: t["items"].pop(1))
    G2("G16", setk(["items", 4, "focused"], False))
    g_row("G17", "G9", ge, "trees/G02.tree.json", g02t, readout={"focus": {"node": wire(g, n("f"))}}, tab_stops=1)
    for id_, vp in (("G30", vpz(-300000, 100000)), ("G42", vpz(400000, 100000)), ("G43", vpz(100000, 400000))):
        stv = S_("G9", id_.lower() + "_s", focus=n("e"), vp=vp)
        g_row(id_, "G9", stv, "trees/G02.tree.json", g02t, readout=rd, tab_stops=1)
    g_row("G40", "G9", ge, "trees/G02.tree.json", g02t, readout=rd, tab_stops=2)
    # base G32
    def G3(id_, fn):
        s = copy.deepcopy(svg_base)
        fn(s)
        g_row(id_, "G9", ge, None, None, composition="svg-native", svg=s, readout=rd, tab_stops=1)
    G3("G26", lambda s: s["items"][1].__setitem__("name", s["items"][1]["name"] + "!"))
    def f38(s):
        s["items"][4]["tabindex"] = -1
        s["items"][3]["tabindex"] = 0
    G3("G38", f38)
    G3("G39", lambda s: s["root"].__setitem__("title", "Directed graph"))


# ================================================================= X rows
def build_X():
    s = SC["O1"]
    m = s.model
    st = mk_state(m)
    st_bytes = state_bytes(st)
    aux("states/O1.initial.state.json", st_bytes)
    svg_plain = render_svg(m, st)
    svg_decl = render_svg(m, st, xml_decl=True)
    aux("data/O1.svg", svg_plain)
    aux("data/O1.decl.svg", svg_decl)
    aux("data/O1.dl", render_dl(m, st))
    png = make_png_fixture()
    aux("png/fixture.png", png)
    bind = {"scene": m.scene_sha, "layout": m.layout_sha, "state": sha(st_bytes)}
    bound = embed_binding(png, bind)

    def x_row(id_, inp, ev, expected="", error="", extra=None):
        add_row(Row(id_, scene=s.scene_path, layout=s.layout_path, input_=jin(inp), expected=expected, error=error, ev=ev))

    def run(fn, out=None):
        def ev():
            try:
                v = fn()
            except IaErr as e:
                return {}, str(e)
            except Exception as e:
                return {}, "UNSTRUCTURED/" + type(e).__name__
            return ({out: v} if out is not None else {}), ""
        files, err = ev()
        return ev, (out if (out and not err) else ""), err
    LB = s.layout
    # export rows
    for id_, kw in (("X01", {"svg": False}), ("X02", {"svg": True}), ("X03", {"svg": True, "png": True})):
        inp = {"op": "export", "artifacts": [a for a, k in (("svg", kw.get("svg")), ("png", kw.get("png"))) if k]}
        out = "json/%s.manifest.json" % id_
        ev, ex, er = run(lambda kw=kw: export_bundle(m, st, LB, svg=kw["svg"], png=png if kw.get("png") else None)[2], out)
        x_row(id_, inp, ev, ex, er)
    x_row("X04", {"binding": bind, "op": "embed", "png": "png/fixture.png"}, *(lambda r: (r[0], r[1], r[2]))(run(lambda: embed_binding(png, bind), "png/X04.png")))
    aux_expected_png = bound
    ev, ex, er = run(lambda: cjb(read_binding(bound)), "json/X05.binding.json")
    x_row("X05", {"op": "read", "png": "png/X04.png"}, ev, ex, er)
    bad = bytes([png[0] ^ 1]) + png[1:]
    aux("png/X06.in.png", bad)
    ev, ex, er = run(lambda: embed_binding(bad, bind))
    x_row("X06", {"binding": bind, "op": "embed", "png": "png/X06.in.png"}, ev, ex, er)
    ev, ex, er = run(lambda: embed_binding(bound, bind))
    x_row("X07", {"binding": bind, "op": "embed", "png": "png/X04.png"}, ev, ex, er)
    # manifests and file sets
    files_full = {"layout": LB, "png": bound, "scene": m.scene_bytes, "state": st_bytes, "svg": svg_decl}
    paths_full = {"layout": s.layout_path, "png": "png/X04.png", "scene": s.scene_path, "state": "states/O1.initial.state.json",
                  "svg": "data/O1.decl.svg"}
    _, man2, mb2 = export_bundle(m, st, LB, svg=True)
    _, man1, mb1 = export_bundle(m, st, LB, svg=False)
    _, man3, mb3 = export_bundle(m, st, LB, svg=True, png=png)

    def arts_for(files, man):
        a = []
        for nm in ["layout", "png", "scene", "state", "svg"]:
            if nm in files:
                a.append({"bytes": len(files[nm]), "media_type": MEDIA[nm], "name": nm, "sha256": sha(files[nm])})
        mm = copy.deepcopy(man)
        mm["artifacts"] = a
        return mm

    def vrow(id_, man, files, paths, manifest_bytes=None, man_path=None):
        mb = manifest_bytes if manifest_bytes is not None else cjb(man)
        mp = man_path or aux("manifests/%s.manifest.json" % id_, mb)
        if man_path is None and id_ in ("X10",):
            pass
        ev, ex, er = run(lambda: verify_bundle(copy.deepcopy(files), mb) and None)   # an accepted bundle has an empty expected
        x_row(id_, {"files": paths, "manifest": mp, "op": "verify"}, ev, "", er)
    # X09: O1alt layout with its entry updated
    alt = AUX["layouts/O1.alt.layout.json"]
    f9 = dict(files_full)
    f9.pop("png")
    f9.pop("svg")
    f9 = {"layout": alt, "scene": m.scene_bytes, "state": st_bytes, "svg": svg_decl}
    p9 = dict(paths_full)
    p9.pop("png")
    p9["layout"] = "layouts/O1.alt.layout.json"
    vrow("X09", arts_for(f9, man2), f9, p9)
    f10 = {k: v for k, v in files_full.items() if k != "png"}
    p10 = {k: v for k, v in paths_full.items() if k != "png"}
    vrow("X10", man2, f10, p10)
    # parse rows
    def prow(id_, mbytes):
        mp = aux("manifests/%s.manifest.json" % id_, mbytes)
        ev, ex, er = run(lambda: parse_manifest(mbytes) and None)
        x_row(id_, {"manifest": mp, "op": "parse"}, ev, "", er)
    m11 = copy.deepcopy(man1)
    m11["producer"] = "x"
    prow("X11", cjb(m11))
    m12 = copy.deepcopy(man1)
    m12["artifacts"].append({"bytes": 1, "media_type": "image/png", "name": "thumb", "sha256": "0" * 64})
    prow("X12", cjb(m12))
    m13 = copy.deepcopy(man1)
    m13["artifacts"] = [m13["artifacts"][0], m13["artifacts"][2], m13["artifacts"][1]]
    prow("X13", cjb(m13))
    # X14: another valid state
    st14 = copy.deepcopy(st)
    st14["viewport"]["zoom"] = 1995
    b14 = state_bytes(st14)
    aux("states/X14.state.json", b14)
    f14 = {k: v for k, v in files_full.items() if k not in ("png", "svg")}
    f14["state"] = b14
    p14 = {k: v for k, v in paths_full.items() if k not in ("png", "svg")}
    p14["state"] = "states/X14.state.json"
    m14 = arts_for(f14, man1)
    vrow("X14", m14, f14, p14)
    # X15: svg with one byte changed
    sv = bytearray(svg_decl)
    i = sv.index(b'class="igr-svg"') + 13
    sv[i] = ord("h")
    sv = bytes(sv)
    aux("data/X15.svg", sv)
    f15 = {k: v for k, v in files_full.items() if k != "png"}
    f15["svg"] = sv
    p15 = {k: v for k, v in paths_full.items() if k != "png"}
    p15["svg"] = "data/X15.svg"
    vrow("X15", arts_for(f15, man2), f15, p15)
    # X16: png without a binding chunk
    f16 = {k: v for k, v in files_full.items()}
    f16["png"] = png
    p16 = dict(paths_full)
    p16["png"] = "png/fixture.png"
    vrow("X16", arts_for(f16, man3), f16, p16)
    # X17: export with expected size 2x2
    ev, ex, er = run(lambda: export_bundle(m, st, LB, svg=False, png=png, expected_png_size={"height": 2, "width": 2})[2])
    x_row("X17", {"artifacts": ["png"], "expectedPngSize": {"height": 2, "width": 2}, "op": "export"}, ev, ex, er)
    # X18: state byte changed, entry unchanged
    b18 = bytearray(st_bytes)
    j = b18.index(b'"zoom":1994') + 8
    b18[j] = ord("5")  # 1994 -> 1594? keep length
    b18 = bytes(b18)
    aux("states/X18.state.json", b18)
    f18 = {k: v for k, v in files_full.items() if k not in ("png", "svg")}
    f18["state"] = b18
    p18 = {k: v for k, v in paths_full.items() if k not in ("png", "svg")}
    p18["state"] = "states/X18.state.json"
    vrow("X18", man1, f18, p18)
    # X19: bytes one too large
    m19 = copy.deepcopy(man1)
    for a in m19["artifacts"]:
        if a["name"] == "state":
            a["bytes"] += 1
    f19 = {k: v for k, v in files_full.items() if k not in ("png", "svg")}
    p19 = {k: v for k, v in paths_full.items() if k not in ("png", "svg")}
    vrow("X19", m19, f19, p19)
    # X20: manifest lists png, no png file
    f20 = {k: v for k, v in files_full.items() if k not in ("png",)}
    p20 = {k: v for k, v in paths_full.items() if k not in ("png",)}
    vrow("X20", man3, f20, p20)
    # X21: unlisted extra file svg
    f21 = {k: v for k, v in files_full.items() if k not in ("png",)}
    p21 = {k: v for k, v in paths_full.items() if k not in ("png",)}
    vrow("X21", man1, f21, p21)
    # X22: trailing LF
    prow("X22", mb1 + b"\n")
    # X23: first chunk IHDX
    ihdx = bytearray(bound)
    ihdx[12:16] = b"IHDX"
    ihdx = bytes(ihdx)
    aux("png/X23.png", ihdx)
    f23 = {k: v for k, v in files_full.items()}
    f23["png"] = ihdx
    p23 = dict(paths_full)
    p23["png"] = "png/X23.png"
    vrow("X23", arts_for(f23, man3), f23, p23)
    # X24: oversize manifest (generated vector), X25: deep nest
    big = b"A" * 1048577
    mp24 = "generated/X24.manifest.bin"
    ev, ex, er = run(lambda: verify_bundle({}, big) and None)
    x_row("X24", {"files": {}, "manifest": mp24, "op": "verify"}, ev, "", er)
    nest = b"[" * 100000 + b"]" * 100000
    mp25 = aux("manifests/X25.manifest.json", nest)
    ev, ex, er = run(lambda: verify_bundle({}, nest) and None)
    x_row("X25", {"files": {}, "manifest": mp25, "op": "verify"}, ev, "", er)
    # X26: svg_format igr-svg/2
    m26 = copy.deepcopy(man2)
    m26["svg_format"] = "igr-svg/2"
    f26 = {k: v for k, v in files_full.items() if k != "png"}
    p26 = {k: v for k, v in paths_full.items() if k != "png"}
    vrow("X26", m26, f26, p26)
    GEN.append(("X24", "manifest", mp24, len(big), sha(big)))


GEN = []


# ================================================================= M rows
def build_M():
    bd = author_base("dom")
    bh = author_base("headless")
    verify_manifest(copy.deepcopy(bd))
    verify_manifest(copy.deepcopy(bh))
    aux("manifests/base-dom.manifest.json", cjb(bd))
    aux("manifests/base-headless.manifest.json", cjb(bh))

    def mrow(id_, base_name, base, flags):
        out = "manifests/%s.manifest.json" % id_

        def ev():
            try:
                return {out: cjb(compose_manifest(copy.deepcopy(base), copy.deepcopy(flags)))}, ""
            except IaErr as e:
                return {}, str(e)
        f, er = ev()
        add_row(Row(id_, input_=jin({"base": "manifests/%s.manifest.json" % base_name, "flags": flags}), expected="" if er else out, error=er, ev=ev))
    mrow("M01", "base-dom", bd, {"companion": True, "input": True, "keyboard-nav": True, "lasso": True})
    mrow("M02", "base-dom", bd, {})
    mrow("M03", "base-dom", bd, {"export-png": True, "export-svg": True, "headless": True})
    mrow("M04", "base-dom", bd, {"input": "yes"})
    mrow("M05", "base-headless", bh, {"companion": True})


# ================================================================= H rows
def build_H():
    s = SC["O1"]
    m = s.model
    SB, LB = s.scene, s.layout
    stb = AUX["states/O1.initial.state.json"]

    def h_row(id_, inp, outs, intents=None, size=None, state_bytes_in=None):
        out = "headless/%s.bin" % id_

        def ev():
            try:
                f = render_headless(SB, LB, size=size, state_bytes_in=state_bytes_in, intents=intents, outputs=outs)
            except IaErr as e:
                return {}, str(e)
            return {out: f[outs[0]]}, ""
        f, er = ev()
        add_row(Row(id_, scene=s.scene_path, layout=s.layout_path, input_=jin(inp), expected="" if er else out, error=er, ev=ev))
    h_row("H01", {"outputs": ["state"]}, ["state"])
    h_row("H02", {"outputs": ["svg"]}, ["svg"])
    h_row("H03", {"outputs": ["display-list"]}, ["display-list"])
    h_row("H04", {"outputs": ["tree"]}, ["tree"])
    bad = [{"mode": "replace", "targets": [{"node": {"id": "i:1"}}], "type": "select"}]
    h_row("H05", {"intents": bad, "outputs": ["state"]}, ["state"], intents=bad)
    h_row("H06", {"outputs": ["state", "state"]}, ["state", "state"])
    h_row("H07", {"outputs": ["state"], "size": {"height": 600, "width": 800}, "state": "states/O1.initial.state.json"}, ["state"],
          size={"height": 600, "width": 800}, state_bytes_in=stb)


def build_DK():
    for i in range(1, 7):
        add_row(Row("D%02d" % i))
    for i in range(1, 129):
        add_row(Row("K%02d" % i if i < 100 else "K%d" % i))
