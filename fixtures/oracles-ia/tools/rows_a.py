"""Rows E, I, V, L, B."""
import copy

from base import *  # noqa
import base
from machine import *  # noqa
import machine as MC
from corpus import *  # noqa
import corpus as C


def jin(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def errs(fn):
    try:
        fn()
        return ""
    except IaErr as e:
        return str(e)


# ================================================================= E rows
E01 = {"button": 0, "id": 1, "mods": 0, "ptype": "mouse", "t": 5, "type": "pointerdown", "x": 100000, "y": 200000}


def _ev(**kw):
    d = dict(E01)
    for k, v in kw.items():
        if v is DEL:
            d.pop(k, None)
        else:
            d[k] = v
    return d


DEL = object()


def event_row(id_, ev, last_t=None):
    inp = {"event": ev}
    if last_t is not None:
        inp["last_t"] = last_t
    lt = -1 if last_t is None else last_t
    err = errs(lambda: validate_event(copy.deepcopy(ev), lt))
    add_row(Row(id_, input_=jin(inp), error=err, ev=lambda: ({}, errs(lambda: validate_event(copy.deepcopy(ev), lt)))))


def build_E():
    m = SC["G9"].model
    A = {"node": wire(m, nd(m, "a"))}
    event_row("E01", E01)
    event_row("E02", {})
    event_row("E03", _ev(type=5))
    event_row("E04", _ev(type="pointerzoom"))
    event_row("E05", _ev(z=1))
    event_row("E06", _ev(x=DEL))
    event_row("E07", _ev(x=1.5))
    event_row("E08", _ev(x="5"))
    event_row("E09", _ev(x=True))
    event_row("E10", _ev(x=2 ** 39 + 1))
    event_row("E11", _ev(t=-1))
    event_row("E12", _ev(mods=16))
    event_row("E13", _ev(button=3))
    event_row("E14", _ev(ptype="stylus"))
    event_row("E15", _ev(id=-1))
    event_row("E16", {"key": "Tab2", "mods": 0, "t": 5, "type": "key"})
    event_row("E17", {"key": 5, "mods": 0, "t": 5, "type": "key"})
    event_row("E18", {"dy": 1000, "mods": 0, "t": 5, "type": "wheel", "unit": 3, "x": 0, "y": 0})
    event_row("E19", _ev(target={}))
    event_row("E20", _ev(target={"node": 5}))
    event_row("E21", {"t": 9, "type": "tick"}, last_t=10)
    event_row("E22", [])
    event_row("E23", _ev(x="NaN"))
    event_row("E24", {"t": 10, "type": "tick"}, last_t=10)
    event_row("E25", {"id": 1, "mods": 0, "t": 5, "type": "pointermove", "x": 1000, "y": 2000})
    event_row("E26", {"id": 1, "mods": 0, "t": 5, "type": "pointerup", "x": 1000, "y": 2000})
    event_row("E27", {"id": 1, "t": 5, "type": "pointercancel"})
    event_row("E28", {"dy": -100000, "mods": 0, "t": 5, "type": "wheel", "unit": 0, "x": 450000, "y": 300000})
    event_row("E29", {"key": "ArrowRight", "mods": 0, "t": 5, "type": "key"})
    event_row("E30", {"t": 5, "type": "tick"})
    event_row("E31", {"mods": 0, "t": 5, "target": A, "type": "contextmenu", "x": 182000, "y": 32000})
    event_row("E32", {"mods": 0, "t": 5, "type": "dblclick", "x": 182000, "y": 32000})
    event_row("E33", {"id": 1, "t": 5, "type": "pointercancel", "x": 0})
    event_row("E34", {"t": 5, "type": "dblclick", "x": 1, "y": 2})
    event_row("E35", _ev(button=1.5))
    event_row("E36", {"dy": 1000, "mods": 0, "t": 5, "type": "wheel", "unit": "NaN", "x": 0, "y": 0})
    event_row("E37", _ev(t=2 ** 52 + 1))
    event_row("E38", {"mods": 0, "t": 5, "type": "pointermove", "x": 1, "y": 2})
    event_row("E39", {"mods": 0, "t": 5, "target": {"node": {}, "edge": {}}, "type": "contextmenu", "x": 1, "y": 2})
    for id_, cfg in (("E40", {"zz": 1}), ("E41", {"wrap": "yes"}), ("E42", {"maxTargets": 1.5}), ("E43", {"maxTargets": -1}),
                     ("E44", {"maxTargets": 3, "reveal": False, "wrap": True})):
        add_row(Row(id_, input_=jin({"config": cfg}), error=errs(lambda c=cfg: validate_config(copy.deepcopy(c))),
                    ev=(lambda c=cfg: ({}, errs(lambda: validate_config(copy.deepcopy(c)))))))
    cmds = {"E50": {}, "E51": {"type": "nav-jump"}, "E52": {"dir": "north", "type": "nav-spatial"},
            "E53": {"delta": 1, "type": "nav-step", "z": 1}, "E54": {"delta": 2, "type": "nav-step"},
            "E55": {"dir": "left", "extend": 1, "type": "nav-spatial"}, "E56": {"delta": 1, "type": "nav-step"}}
    for id_, c in cmds.items():
        add_row(Row(id_, input_=jin({"command": c}), error=errs(lambda c=c: validate_command(copy.deepcopy(c))),
                    ev=(lambda c=c: ({}, errs(lambda: validate_command(copy.deepcopy(c)))))))
    # machine bytes
    ptr = {"button": 0, "id": 1, "lasso": False, "long": False, "mods0": 0, "moved": False, "ptype": "mouse", "t0": 0,
           "x": 0, "x0": 0, "y": 0, "y0": 0}
    ptr2 = dict(ptr)
    ptr2["id"] = 2
    mach = create_machine()
    machs = {"E60": serialize_machine(mach)}
    bad = dict(mach)
    bad["pointers"] = [ptr, ptr2]
    machs["E61"] = cjb(bad)
    machs["E62"] = serialize_machine(mach) + b"\n"
    bad = dict(mach)
    bad["gesture"] = "pan"
    pm = dict(ptr)
    pm["moved"] = True
    bad["pointers"] = [pm]
    bad["pinch"] = {"d": 1, "mx": 0, "my": 0}
    machs["E63"] = cjb(bad)
    for id_, b in machs.items():
        p = aux("inputs/%s.machine.json" % id_, b)
        add_row(Row(id_, input_=jin({"machine": p}), error=errs(lambda b=b: parse_machine(b)),
                    ev=(lambda b=b: ({}, errs(lambda: parse_machine(b))))))
    rects = {"E70": {"x0": 1.5, "x1": 10, "y0": 0, "y1": 10}, "E71": {"x0": 0, "x1": 10, "y0": 0},
             "E72": {"x0": 2 ** 39 + 1, "x1": 10, "y0": 0, "y1": 10}, "E73": {"x0": 0, "x1": 2 ** 39, "y0": 0, "y1": 10}}
    s = SC["G9"]
    for id_, r in rects.items():
        add_row(Row(id_, scene=s.scene_path, layout=s.layout_path, input_=jin({"rect": r}),
                    error=errs(lambda r=r: validate_rect(copy.deepcopy(r))),
                    ev=(lambda r=r: ({}, errs(lambda: validate_rect(copy.deepcopy(r)))))))


# ================================================================= transcript rows
def sname(path):
    return path


def run_script(m, size, base_state, config, steps):
    mach = create_machine()
    res = []
    for ev, st in steps:
        st = st if st is not None else base_state
        mach, handled, outs, wake = step(mach, copy.deepcopy(ev), m, st, config)
        res.append(serialize_step(handled, outs, wake))
    return {"final_state": mach, "steps": res}


def script_row(id_, scname, steps, state=None, size=(900, 600), config=None, extra_files=None):
    """steps: list of event dicts or (event, (path, st)) tuples; state: None for initial or (path, st)."""
    s = SC[scname]
    m = s.model
    base_st = state[1] if state is not None else mk_state(m, size[0], size[1])
    norm = []
    for x in steps:
        if isinstance(x, tuple):
            norm.append((x[0], x[1][1], x[1][0]))
        else:
            norm.append((x, None, None))
    script = {"size": {"height": size[1], "width": size[0]}, "state": state[0] if state is not None else "initial",
              "steps": []}
    if config:
        script["config"] = config
    for ev, st, p in norm:
        d = {"event": ev}
        if p is not None:
            d["state"] = p
        script["steps"].append(d)
    sp = aux("scripts/%s.script.json" % id_, json.dumps(script, sort_keys=True, ensure_ascii=False, indent=1) + "\n")
    out = "transcripts/%s.result.json" % id_
    ev_steps = [(ev, st) for ev, st, p in norm]

    def ev():
        return {out: cjb(run_script(m, size, base_st, config, ev_steps))}, ""
    files, _ = ev()
    r = add_row(Row(id_, scene=s.scene_path, layout=s.layout_path, input_=sp, expected=out, ev=ev))
    r.extra = {}
    return r


def S_(scname, name, **kw):
    """author a state file; returns (path, state)"""
    return C.state_file(scname, name, **kw)


def build_IVL():
    s = SC["G9"]
    m = s.model
    n = lambda c: nd(m, c)
    A = {"node": wire(m, n("a"))}
    # --- states
    g_h = S_("G9", "g_h", hidden=[n("h")])
    g_ahid = S_("G9", "g_ahid", hidden=[n("a")])
    g_dhid = S_("G9", "g_dhid", hidden=[n("d")])
    g_e = S_("G9", "g_e", focus=n("e"))
    g_a = S_("G9", "g_a", focus=n("a"))
    g_c = S_("G9", "g_c", focus=n("c"))
    g_eh = S_("G9", "g_eh", focus=n("e"), hidden=[n("h")])
    g_edge = {k: S_("G9", "g_edge%d" % k, focus=("e", k)) for k in range(9)}
    g_b = S_("G9", "g_b", focus=n("b"), vp=vpz(0, 0))
    g_d0 = S_("G9", "g_d0", focus=n("d"), vp=vpz(0, 0))
    g_b200 = S_("G9", "g_b200", focus=n("b"), vp=vpz(200000, 0))
    g_d200 = S_("G9", "g_d200", focus=n("d"), vp=vpz(0, 200000))
    g_c10448 = S_("G9", "g_c10448", focus=n("c"), vp=vpz(-10448, 0))
    g_b40 = S_("G9", "g_b40", focus=n("b"), vp=vpz(0, 0, 40, 40, 10), w=40, h=40)
    # --- I rows
    pa = (182000, 32000)

    def click(t0, target=None, mods=0, x=pa[0], y=pa[1], rmods=None, id_=0, ptype="mouse"):
        return [pdown(t0, x, y, id_, target, mods, ptype), pup(t0 + 80, x, y, id_, mods if rmods is None else rmods)]
    script_row("I01", "G9", click(0, A))
    script_row("I02", "G9", click(0, None, x=600000, y=100000))
    script_row("I03", "G9", click(0, A, 1))
    script_row("I03b", "G9", click(0, A, 3))
    script_row("I04", "G9", click(0, A, 2))
    script_row("I04b", "G9", click(0, A, 8))
    script_row("I05", "G9", click(0, None, 1, x=600000, y=100000))
    script_row("I06", "G9", [pdown(0, 0, 0), pmove(10, 3000, 0), pmove(20, 5000, 0), pmove(30, 5600, 400), pmove(40, 6000, 1000),
                             pup(50, 6000, 1000)])
    script_row("I06b", "G9", [pdown(0, 0, 0), pmove(10, 5000, 0), pmove(20, 5400, 0), pmove(30, 5800, 0), pmove(40, 6200, 0),
                              pup(50, 6200, 0)])
    script_row("I07", "G9", [pdown(0, 0, 0), pmove(10, 4000, 0), pup(20, 4000, 0)])
    script_row("I07b", "G9", [pdown(0, 0, 0), pmove(10, 3000, 3000), pup(20, 3000, 3000)])
    script_row("I08", "G9", [wheel(0, -100000, 450500, 300000)])
    script_row("I09", "G9", [wheel(i * 10, -30000) for i in range(4)])
    script_row("I10", "G9", [wheel(0, -60000), wheel(10, 60000), wheel(20, 60000)])
    script_row("I11", "G9", [wheel(0, -7000, unit=1)])
    script_row("I12", "G9", [wheel(0, -2 ** 40)])
    script_row("I13", "G9", [wheel(0, -1000, unit=2)])
    t = "touch"
    script_row("I14", "G9", [pdown(0, 300000, 300000, 1, ptype=t), pdown(10, 500000, 300000, 2, ptype=t),
                             pmove(20, 600000, 300000, 2), pmove(30, 600150, 300000, 2)])
    script_row("I14b", "G9", [pdown(0, 300000, 300000, 1, ptype=t), pdown(10, 500000, 300000, 2, ptype=t),
                              pmove(20, 500050, 300000, 2), pmove(30, 500100, 300000, 2)])
    script_row("I15", "G9", [pdown(0, 300000, 300000, 1, ptype=t), pdown(10, 500000, 300000, 2, ptype=t),
                             pup(20, 300000, 300000, 1), pmove(30, 520000, 300000, 2), pup(40, 520000, 300000, 2)])
    script_row("I16", "G9", [pdown(0, 300000, 300000, 1, ptype=t), pdown(10, 500000, 300000, 2, ptype=t),
                             pdown(20, 700000, 300000, 3, ptype=t)])
    script_row("I17", "G9", click(0, A, id_=1, ptype=t))
    script_row("I18", "G9", [pdown(0, pa[0], pa[1], 1, A, 0, t), tick(499), tick(500), pup(600, pa[0], pa[1], 1)])
    script_row("I20", "G9", [pdown(0, 100000, 100000, 1, None, 0, t), pmove(100, 105000, 100000, 1), tick(600)])
    script_row("I21", "G9", [ctxmenu(0, pa[0], pa[1], A)])
    script_row("I22", "G9", [pdown(0, 100000, 100000, 0, None, 0, "mouse", 2)])
    alt_drag = lambda mods=4, end=(500000, 350000), start=(150000, 0): [pdown(0, start[0], start[1], 0, None, mods),
                                                                       pmove(10, end[0], end[1], 0, mods),
                                                                       pup(20, end[0], end[1], 0, mods)]
    script_row("I23", "G9", alt_drag())
    script_row("I23b", "G9", alt_drag(6))
    script_row("I24", "G9", alt_drag(4, (150000, 0), (500000, 350000)))
    script_row("I24b", "G9", alt_drag(4, (450000, 350000)))
    script_row("I25", "G9", [pdown(0, pa[0], pa[1], 0, A), pcancel(10)])
    script_row("I26", "G9", [pup(0, 100000, 100000, 7)])
    script_row("I27", "G9", [pdown(0, pa[0], pa[1], 0, A), (pup(80, pa[0], pa[1]), g_ahid)])
    script_row("I28", "G9", [pdown(0, pa[0], pa[1], 0, A, 1), pup(80, pa[0], pa[1], 0, 0)])
    script_row("I29", "G9", alt_drag(), state=g_dhid)
    script_row("I30", "G9", [pdown(0, 100000, 100000, 1, None, 0, t), tick(500), tick(1000)])
    script_row("I40", "G9", [key(0, "+", 1), key(1, "=", 0), key(2, "-", 1)])
    script_row("I41", "G9", [dbl(0, 600000, 100000)])
    script_row("I42", "G9", [dbl(0, pa[0], pa[1], A)])
    script_row("I43", "G9", [wheel(0, -60000), wheel(10, 0), wheel(20, -60000)])
    # I50: Appendix A.4 on O1
    o1 = SC["O1"].model
    oi = {"node": wire(o1, nd_o1(o1, "i:1"))}
    evs = [pdown(0, 32072, 193600, 1, oi), pup(80, 32072, 193600, 1), pdown(100, 500000, 300000, 1),
           pmove(110, 520500, 300400, 1), pup(120, 520500, 300400, 1), wheel(200, -100000, 450000, 300000)]
    script_row("I50", "O1", evs)
    aux("inputs/I50.events.json", cjb(evs))
    pr = SC["PROTO"].model
    pc = {"node": wire(pr, nd(pr, "constructor"))}
    script_row("I51", "PROTO", [pdown(0, 100000, 100000, 0, pc), pup(80, 100000, 100000)])
    script_row("I52", "G9", alt_drag(), config={"maxTargets": 8})
    script_row("I53", "G9", alt_drag(), config={"maxTargets": 7})
    script_row("I54", "G9", [pdown(0, 150000, 0, 0, None, 4), pmove(10, 500000, 350000, 0, 4), pcancel(20)])
    script_row("I55", "G9", [pdown(0, 150000, 0, 1, None, 4, t), pmove(10, 500000, 350000, 1, 4), pdown(20, 600000, 300000, 2, None, 0, t)])
    script_row("I56", "G9", [pdown(0, pa[0], pa[1], 1, A, 0, t), tick(500), pmove(600, 202000, 32000, 1), pup(700, 202000, 32000, 1)])
    script_row("I57", "G9", [pdown(0, 100000, 100000, 1, None, 0, t), pmove(100, 105000, 100000, 1), tick(500)])
    # --- V rows
    def keyrow(id_, scname, st, keys, config=None):
        script_row(id_, scname, [key(i, k, md) for i, (k, md) in enumerate(keys)], state=st, config=config)
    for id_, k in (("V01", "ArrowRight"), ("V02", "ArrowLeft"), ("V03", "ArrowUp"), ("V04", "ArrowDown")):
        keyrow(id_, "G9", g_e, [(k, 0)])
    keyrow("V05", "G9", g_c, [("ArrowRight", 0)])
    keyrow("V06", "G9", g_e, [("ArrowRight", 1)])
    t4 = SC["T4"].model
    keyrow("V07", "T4", S_("T4", "t4_o", focus=nd(t4, "o")), [("ArrowRight", 0)])
    t5 = SC["T5"].model
    keyrow("V08", "T5", S_("T5", "t5_a", focus=nd(t5, "a")), [("ArrowRight", 0)])
    keyrow("V09", "G9", g_edge[0], [("ArrowLeft", 0)])
    keyrow("V10", "G9", None, [("ArrowLeft", 0), ("ArrowRight", 0)])
    keyrow("V11", "G9", g_e, [("e", 0), ("e", 1)])
    keyrow("V12", "G9", g_eh, [("e", 1)])
    keyrow("V13", "G9", g_edge[5], [("e", 0)])
    keyrow("V14", "G9", g_edge[6], [("e", 0)])
    keyrow("V14w", "G9", g_edge[6], [("e", 0)], {"wrap": True})
    keyrow("V15", "G9", g_edge[3], [("s", 0), ("t", 0)])
    keyrow("V15b", "G9", g_e, [("s", 0)])
    keyrow("V16", "G9", g_edge[8], [("PageDown", 0)], {"wrap": True})
    keyrow("V16n", "G9", g_edge[8], [("PageDown", 0)])
    keyrow("V17", "G9", g_e, [("Home", 0), ("End", 0), ("PageDown", 0), ("PageUp", 0)])
    keyrow("V18", "G9", g_e, [("Space", 0), ("Enter", 0), ("Escape", 0), ("ContextMenu", 0), ("F10", 1), ("+", 0), ("-", 0), ("0", 0), ("ArrowRight", 2)])
    keyrow("V18b", "G9", None, [("Space", 0), ("Enter", 0), ("ContextMenu", 0)])
    keyrow("V19", "G9", g_e, [("Tab", 0), ("Tab", 1)])
    keyrow("V20", "G9", g_h, [("a", 2)])
    keyrow("V21", "G9", None, [("ArrowLeft", 0), ("ArrowUp", 0), ("PageUp", 0)])
    keyrow("V22", "O1", S_("O1", "o1_i1", focus=nd_o1(o1, "i:1")), [("ArrowRight", 0)])
    keyrow("V23", "PROTO", S_("PROTO", "proto_p", focus=nd(pr, "__proto__")), [("ArrowRight", 0)])
    for id_, nm in (("V24", "S1"), ("V25", "S2"), ("V26", "S3")):
        sm = SC[nm].model
        keyrow(id_, nm, S_(nm, nm.lower() + "_a", focus=nd(sm, "a")), [("ArrowRight", 0)])
    keyrow("V30", "G9", g_b, [("ArrowRight", 0)])
    keyrow("V31", "G9", g_d0, [("ArrowDown", 0)])
    keyrow("V32", "G9", g_b, [("ArrowRight", 0)], {"reveal": False})
    keyrow("V33", "G9", g_b, [("PageDown", 0)])
    keyrow("V35", "G9", None, [("a", 2)], {"maxTargets": 3})
    keyrow("V36", "G9", None, [("a", 2)], {"maxTargets": 18})
    keyrow("V37", "G9", g_b200, [("ArrowLeft", 0)])
    keyrow("V38", "G9", g_d200, [("ArrowUp", 0)])
    keyrow("V39", "G9", g_c10448, [("e", 0)])
    script_row("V40", "G9", [key(0, "ArrowRight")], state=g_b40, size=(40, 40))
    # --- L rows
    def lrow(id_, steps, config=None):
        script_row(id_, "G9", [(key(i, k), st) for i, (k, st) in enumerate(steps)], config=config)
    lrow("L01", [("m", g_a), ("Enter", g_e)])
    lrow("L02", [("m", g_a), ("Escape", g_a), ("Escape", g_a)])
    lrow("L03", [("m", g_a), ("Enter", g_edge[3])])
    lrow("L04", [("m", g_edge[3])])
    lrow("L04b", [("m", S_("G9", "g0"))])
    lrow("L05", [("m", g_a), ("Enter", g_ahid)])
    lrow("L06", [("m", g_a), ("ArrowRight", g_a)])
    lrow("L07", [("m", g_a), ("Enter", g_e)], {"maxTargets": 3})


def nd_o1(m, idtext):
    for n in m.nodes:
        if n["ref"]["id"] == idtext:
            return ("n", n["index"])
    raise KeyError(idtext)


# ================================================================= B rows
def table_row(id_, table, raw=None):
    b = raw if raw is not None else cjb(table)
    p = aux("inputs/%s.bindings.json" % id_, b)
    t = json.loads(b.decode("utf-8"))

    def ev():
        return {}, errs(lambda: verify_bindings(copy.deepcopy(t)))
    add_row(Row(id_, input_=p, error=ev()[1], ev=ev))


def build_B():
    keys = ["ArrowLeft", "Esc", "Left", " ", "Spacebar", "Apps", "E", "e", "7", "+", "[", "Tab", "F10", "F1", "é", "ab", "", "Shift", "#"]
    p = aux("inputs/B01.keys.json", cjb(keys))
    out = "json/B01.tokens.json"

    def ev():
        res = []
        for k in keys:
            t = key_token(k)
            res.append([k, t] if t is not None else [k])
        return {out: cjb(res)}, ""
    add_row(Row("B01", input_=p, expected=out, ev=ev))
    d = default_bindings()
    table_row("B02", d)
    table_row("B03", d + [{"action": {"type": "fit"}, "key": "Tab", "mode": "normal", "mods": 0}])
    table_row("B04", d + [{"action": {"type": "fit"}, "key": "Home", "mode": "normal", "mods": 0}])
    table_row("B05", d + [{"action": {"type": "fit"}, "key": "+", "mode": "normal", "mods": 1}])
    table_row("B06", d + [{"action": {"type": "explode"}, "key": "g", "mode": "normal", "mods": 0}])
    table_row("B07", d + [{"action": {"type": "fit"}, "key": "g", "mode": "x-mode", "mods": 0}])
    table_row("B08", d + [{"action": {"type": "fit"}, "key": "F1", "mode": "normal", "mods": 0}])
    table_row("B09", d + [{"action": {"type": "fit"}, "key": "g", "mode": "normal", "mods": 16}])
    table_row("B10", d + [{"key": "g", "mode": "normal", "mods": 0}])
    raw = json.dumps(d + [{"action": {"dx": 1.5, "dy": 0, "type": "pan"}, "key": "g", "mode": "normal", "mods": 0}], sort_keys=True, separators=(",", ":")).encode()
    table_row("B11", None, raw)
    outp = "json/B12.bindings.json"
    add_row(Row("B12", expected=outp, ev=lambda: ({outp: cjb(default_bindings())}, "")))
    table_row("B13", d + [{"action": {"type": "fit"}, "key": "Tab", "mode": "marquee", "mods": 0}])
