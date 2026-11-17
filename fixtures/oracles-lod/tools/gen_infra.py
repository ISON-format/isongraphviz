"""Infrastructure of the IGLOD/1 oracle generator: file writers, scene/layout/state helpers, vector recorders.
Every expected byte is produced by lodlib.py (this author's own implementation of the design); the recorders re-read the stored
files before running the implementation, so the stored inputs are exactly what was judged."""
import os, copy
from lodlib import *

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

ROWS = []
GENERATED = []      # (id, file, size, sha256, expected)
LP = {"full_degree": 5, "full_zoom_milli": 2000, "short_degree": 3, "short_zoom_milli": 1000}
IDS = set()


def put(rel, data):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if isinstance(data, str):
        data = data.encode("utf-8")
    with open(p, "wb") as f:
        f.write(data)
    return rel


def rd(rel):
    with open(os.path.join(OUT, rel), "rb") as f:
        return f.read()


def N(x):
    return ("t", x) if isinstance(x, str) else x


def R(x):
    t, i = N(x)
    return {"id": i, "type": t}


def put_sha(rel, data):
    put(rel, sha(data) + "\n")


def mkscene(name, nodes, edges, directed=True, artifact="0" * 64, raw=None, store=True):
    b = raw if raw is not None else build_scene([N(x) for x in nodes], [(r,) + N(s) + N(t) for r, s, t in edges], directed, artifact)
    rel = "scenes/%s.scene.json" % name
    if store:
        put(rel, b)
    return rel, b


def default_pos(i):
    return ((i * 7919 + 13) % 4001 - 2000, (i * 104729 + 7) % 3001 - 1500)


def mklayout(name, scene_b, pos=None, store=True, rawsha=None):
    """pos: dict nodespec-string -> (x, y); missing nodes get default_pos(rank)."""
    sc = verify_scene(scene_b)
    pos = pos or {}
    items = []
    for i, r in enumerate(sc["nodes"]):
        xy = pos.get(r["id"]) or pos.get((r["type"], r["id"])) or default_pos(i)
        items.append((r, xy[0], xy[1]))
    b = build_layout(rawsha or sc["sha"], items)
    rel = "layouts/%s.layout.json" % name
    if store:
        put(rel, b)
        put_sha("layouts/%s.layout.sha256" % name, b)
    return rel, b


def mkstate_bytes(scene_b, layout_b, groups=(), pinned=(), zoom=500, lp=None, ep=None, xs=None, scene_sha=None, layout_sha=None):
    """groups: list of members-lists or (members, label)."""
    cols = []
    for g in groups:
        if isinstance(g, tuple):
            cols.append({"label": g[1], "members": [R(x) for x in g[0]]})
        else:
            cols.append({"members": [R(x) for x in g]})
    st = {"collapsed": cols, "label_policy": lp or LP, "layout_sha256": layout_sha or sha(layout_b), "lod": "IGLOD/1",
          "pinned": [R(x) for x in pinned], "scene_sha256": scene_sha or sha(scene_b), "zoom_milli": zoom}
    if ep:
        st["edge_policy"] = ep
    if xs:
        st.update(xs)
    return cjb(canonical_state_obj(st))


def mkstate(name, *a, **k):
    b = mkstate_bytes(*a, **k)
    rel = "states/%s.state.json" % name
    put(rel, b)
    return rel, b


def addrow(id, group, scene="-", layout="-", state="-", inp="-", expected="-", error=""):
    assert id not in IDS, id
    IDS.add(id)
    ROWS.append((id, group, scene, layout, state, inp, expected, error))


def call(id, api, args, options=None):
    o = {"api": api, "args": args}
    if options:
        o["options"] = options
    return put("calls/%s.call.json" % id, cjb(o, True))


def expect_file(id, kind, data):
    rel = "expected/%s.%s.json" % (id, kind)
    put(rel, data)
    put_sha("expected/%s.%s.sha256" % (id, kind), data)
    return rel


def finish(id, group, kind, fn, scene="-", layout="-", state="-", inp="-"):
    """run fn() -> (result obj or bytes, signed?) ; record expected or error."""
    try:
        res = fn()
    except LODErr as e:
        addrow(id, group, scene, layout, state, inp, "-", e.tag())
        return ("err", e.tag())
    data = res if isinstance(res, bytes) else cjb(res, True)
    addrow(id, group, scene, layout, state, inp, expect_file(id, kind, data), "")
    return ("ok", data)


# ---- recorders
def V_derive(id, group, sc, lay, stp, budget=None):
    inp = call(id, "deriveView", {}, {"budget": budget}) if budget else "-"
    sb = rd(sc) if sc != "-" else b""
    lb = rd(lay) if lay != "-" else b""
    tb = rd(stp) if stp != "-" else b""
    return finish(id, group, "view", lambda: derive_view(sb, lb, tb, budget)[1], sc, lay, stp, inp)


def V_verify(id, group, stp):
    tb = rd(stp)
    return finish(id, group, "state", lambda: verify_state(tb)[1], "-", "-", stp, "-")


def V_suggest(id, group, sc, rules, budget=None):
    inp = call(id, "suggestGroups", {"rules": rules}, {"budget": budget} if budget else None)
    return finish(id, group, "catalog", lambda: suggest_groups(rd(sc), rules, budget), sc, "-", "-", inp)


def V_aggid(id, group, sc, members):
    inp = call(id, "deriveAggregateId", {"members": members})
    return finish(id, group, "id", lambda: derive_aggregate_id(rd(sc), members), sc, "-", "-", inp)


def V_isagg(id, group, value):
    inp = call(id, "isAggregateId", {"value": value})
    return finish(id, group, "result", lambda: {"result": is_agg_id(value)}, "-", "-", "-", inp)


def apply_ops(stbytes, ops):
    # rev 4: only expandGroup verifies its input state first; every other builder verifies its result. The input is read leniently
    # (parsed, numbers by value) so that a builder that replaces the invalid part (replaceGroups, setPinned) may succeed.
    st = plain(parse_json(stbytes.decode("utf-8")))
    last = None
    for op in ops:
        a, g = op["api"], op["args"]
        last = None
        if a == "collapseGroup":
            st = collapse_group(st, g["group"])
        elif a == "expandGroup":
            st, rem = expand_group(st, g["target"])
            last = rem
        elif a == "replaceGroups":
            st = replace_groups(st, g["groups"])
        elif a == "setPinned":
            st = set_pinned(st, g["refs"])
        elif a == "withZoom":
            st = with_zoom(st, g["zoom_milli"])
        elif a == "withLayout":
            st = with_layout(st, g["layout_sha256"])
        else:
            raise AssertionError(a)
    if last is not None:
        return {"removed": last, "state": st}
    return cjb(st)


def V_ops(id, group, stp, ops, sc="-", expect_equals=None):
    inp = call(id, "ops", {"ops": ops})
    r = finish(id, group, "state", lambda: apply_ops(rd(stp), ops), sc, "-", stp, inp)
    return r


def V_project(id, group, sc, lay, stp, refs, view=None):
    args = {"refs": refs}
    if view is not None:
        args["view"] = view
    inp = call(id, "projectToView", args)
    def run():
        v = view if view is not None else derive_view(rd(sc), rd(lay), rd(stp))[0]
        return {"refs": project_to_view(v, refs)}
    return finish(id, group, "refs", run, sc, lay, stp, inp)


def V_resolve(id, group, sc, lay, stp, refs, view=None):
    args = {"refs": refs}
    if view is not None:
        args["view"] = view
    inp = call(id, "resolveFromView", args)
    def run():
        v = view if view is not None else derive_view(rd(sc), rd(lay), rd(stp))[0]
        return {"refs": resolve_from_view(v, refs)}
    return finish(id, group, "refs", run, sc, lay, stp, inp)


def V_edge(id, group, sc, lay, stp, src, tgt, budget=None):
    inp = call(id, "resolveAggregateEdge", {"src": src, "tgt": tgt}, {"budget": budget} if budget else None)
    def run():
        v = derive_view(rd(sc), rd(lay), rd(stp))[0]
        return resolve_aggregate_edge(rd(sc), v, {"src": src, "tgt": tgt}, budget)
    return finish(id, group, "edges", run, sc, lay, stp, inp)


def write_manifest():
    hdr = "id\tgroup\tscene\tlayout\tstate\tinput\texpected\terror\n"
    put("EXPECT.tsv", hdr + "".join("\t".join(r) + "\n" for r in ROWS))


# deterministic pseudo random (own LCG; never the language PRNG)
class Rnd:
    def __init__(self, seed):
        self.x = (seed * 2654435761 + 12345) % (1 << 64)

    def next(self):
        self.x = (self.x * 6364136223846793005 + 1442695040888963407) % (1 << 64)
        return self.x >> 33

    def below(self, n):
        return self.next() % n
