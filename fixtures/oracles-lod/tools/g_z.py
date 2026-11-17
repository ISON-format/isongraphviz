"""Group Z (rev 4 rows with exact expected values stated in the design) and the rev 4 additions to other groups.
Where the design states an expected value, the row is computed by this implementation first and compared afterwards; a difference is
printed as a FINDING (never copied)."""
import json
from gen_infra import *
from g_wam import X
import g_b

FINDINGS = []


def same(label, got, want):
    if got != want:
        FINDINGS.append((label, got, want))
        print("FINDING", label, got, want)


def run_z():
    w = X["w"]
    sc, sb, lay, lb = w["sc"], w["sb"], w["lay"], w["lb"]
    A = "states/W01.state.json"
    base = json.loads(rd(A).decode())
    N9 = [{"rule": "pendant-fold/1", "min_leaves": 2}] * 9

    def junk_case(id, size, rules, want):
        inp = call(id, "suggestGroups", {"rules": rules})
        r = g_b.addgen(id, "Z", {"scene": lambda: b"x" * size}, inp, "catalog", lambda d: g_b._suggest(d["scene"], rules, None))
        same(id, r, ("err", want))
    junk_case("Z01", MAX_INPUT_BYTES + 1, N9, "RESOURCE_LIMIT/INPUT_BYTES")
    junk_case("Z02", MAX_INPUT_BYTES, N9, "RESOURCE_LIMIT/RULE_LIMIT")
    junk_case("Z03", MAX_INPUT_BYTES + 1, [{"rule": "kcore/1"}], "RESOURCE_LIMIT/INPUT_BYTES")

    def xstate(id, tok, want):
        raw = cjb({**base, "x-a": 0}).decode().replace('"x-a":0', '"x-a":' + tok).encode()
        put("states/%s.state.json" % id, raw)
        r = V_verify(id, "Z", "states/%s.state.json" % id)
        same(id, r, ("err", want))
    xstate("Z04", '{"10":1.5,"2":null}', "INVALID_LOD/INVALID_NUMBER")
    xstate("Z05", '{"10":null,"2":1.5}', "INVALID_LOD/INVALID_VALUE")
    xstate("Z06", "1.0", "INVALID_LOD/NON_CANONICAL")
    xstate("Z07", "-0", "INVALID_LOD/INVALID_NUMBER")
    # extra x- token vectors (value-based judgement inside x- values)
    xstate("Z06b", "1e3", "INVALID_LOD/NON_CANONICAL")
    xstate("Z06c", "1e999", "INVALID_LOD/INVALID_NUMBER")
    xstate("Z06d", "-0.0", "INVALID_LOD/INVALID_NUMBER")
    xstate("Z06e", "9007199254740991.0", "INVALID_LOD/NON_CANONICAL")
    xstate("Z06f", "9007199254740992.0", "INVALID_LOD/INVALID_NUMBER")
    xstate("Z06g", "0.0", "INVALID_LOD/NON_CANONICAL")
    xstate("Z06h", "1.5e1", "INVALID_LOD/NON_CANONICAL")
    xstate("Z06i", "0.5", "INVALID_LOD/INVALID_NUMBER")
    # key order in the document
    rest = cj(base)[1:]
    for id, head, want in (("Z08", '{"groups":[],"zzz":1,', "INVALID_LOD/RESERVED_FIELD"), ("Z09", '{"zzz":1,"groups":[],', "INVALID_LOD/RESERVED_FIELD")):
        put("states/%s.state.json" % id, (head + rest).encode())
        same(id, V_verify(id, "Z", "states/%s.state.json" % id), ("err", want))
    put("states/Z10.state.json", cjb({**base, "aaa": 1, "viewport": 1}))
    same("Z10", V_verify("Z10", "Z", "states/Z10.state.json"), ("err", "INVALID_LOD/UNKNOWN_FIELD"))
    # own __proto__ keys
    r = V_suggest("Z11", "Z", sc, [{"rule": "components/1", "min_size": 2, "__proto__": {"x": 1}}])
    same("Z11", r, ("err", "INVALID_POLICY/INVALID_RULE_PARAM"))
    r = V_suggest("Z12", "Z", sc, [{"__proto__": {"rule": "components/1"}, "min_size": 2}])
    same("Z12", r, ("err", "INVALID_POLICY/INVALID_RULE_PARAM"))
    o = dict(base)
    o["__proto__"] = {}
    put("states/Z12b.state.json", cjb(o))
    same("Z12b", V_verify("Z12b", "Z", "states/Z12b.state.json"), ("err", "INVALID_LOD/UNKNOWN_FIELD"))
    o = dict(base)
    o["x-p"] = {"__proto__": 1}
    put("states/Z12c.state.json", cjb(o))
    same("Z12c", V_verify("Z12c", "Z", "states/Z12c.state.json")[0], "ok")
    # Z13 expandGroup verifies its input state first
    o = json.loads(json.dumps(base))
    o["collapsed"] = [{"members": [R("s:a"), R("s:b")]}, {"members": [R("s:b"), R("s:c")]}]
    put("states/Z13.state.json", cjb(o))
    same("Z13", V_ops("Z13", "Z", "states/Z13.state.json", [{"api": "expandGroup", "args": {"target": {"members": [R("s:a"), R("s:b")]}}}]),
         ("err", "INVALID_GROUP/OVERLAPPING_GROUPS"))
    o["collapsed"] = [{"members": [R("s:a"), R("s:b")]}]
    o["pinned"] = [R("s:a"), R("s:a")]
    put("states/Z13b.state.json", cjb(o))
    V_ops("Z13b", "Z", "states/Z13b.state.json", [{"api": "expandGroup", "args": {"target": {"members": [R("s:a"), R("s:b")]}}}])     # invalid input (duplicate pin) is not repaired
    V_ops("Z13c", "Z", "states/Z13b.state.json", [{"api": "setPinned", "args": {"refs": [R("s:a")]}}])                                 # setPinned replaces the bad part: a verified result
    # views given as arguments
    view = json.loads(rd("expected/W01.view.json"))
    v14 = json.loads(json.dumps(view))
    v14["nodes"].reverse()
    same("Z14", V_project("Z14", "Z", sc, lay, A, [R("s:c"), R("i:1")], view=v14), ("ok", cjb({"refs": [R("i:1"), R("s:c")]}, True)))
    v15 = json.loads(json.dumps(view))
    v15["aggregates"][0]["hidden"][0] = {"id": "zzz", "type": "t"}
    aid = view["aggregates"][0]["id"]
    same("Z15", V_resolve("Z15", "Z", sc, lay, A, [{"agg": aid}], view=v15), ("err", "INVALID_LOD/SCHEMA"))
    r = V_aggid("Z16", "Z", sc, [])
    same("Z16", r, ("ok", cjb({"id": "igagg1:b1e79a39f4c99cc4dfe4e68b8361efb3028c59d15ae40cfd09251baf5ea045e5"})))
    r = V_aggid("Z17", "Z", sc, [R("s:a")])
    same("Z17", r, ("ok", cjb({"id": "igagg1:006f09658f08dddcbbef1c32072449dc764182b05dc643bc1620adb73ca72568"})))
    pre0 = cjb({"agg": "IGLOD-AGG/1", "members": [], "scene_sha256": sha(sb)})
    pre1 = cjb({"agg": "IGLOD-AGG/1", "members": [R("s:a")], "scene_sha256": sha(sb)})
    same("Z16 preimage bytes", len(pre0), 116)
    same("Z17 preimage bytes", len(pre1), 139)
    v18 = json.loads(json.dumps(view))
    v18["nodes"][0]["label_level"] = "bold"
    same("Z18", V_project("Z18", "Z", sc, lay, A, [R("i:1")], view=v18), ("ok", cjb({"refs": [R("i:1")]}, True)))
    # further rev 4 behaviours
    V_resolve("Z19", "Z", sc, lay, A, [{"agg": "igagg1:xyz"}])                                            # malformed {agg} argument: INVALID_ID
    V_resolve("Z19b", "Z", sc, lay, A, [{"agg": aid.upper()}])
    V_aggid("Z20", "Z", sc, [R("s:a"), R("s:a")])                                                         # duplicates rejected
    V_aggid("Z20b", "Z", sc, [{"id": "bogus", "type": "t"}])                                              # malformed ref
    V_aggid("Z20c", "Z", sc, [{"id": "s:a", "type": "a b"}])
    V_aggid("Z20d", "Z", sc, [{"agg": aid}])
    V_ops("Z21a", "Z", A, [{"api": "withZoom", "args": {"zoom_milli": -1}}])                              # builders judge numbers by token rules
    V_ops("Z21b", "Z", A, [{"api": "withZoom", "args": {"zoom_milli": 2147483647}}])
    V_ops("Z21c", "Z", A, [{"api": "withZoom", "args": {"zoom_milli": 2147483648}}])
    bad_edge = {"agg": aid}
    # resolveAggregateEdge: the edge argument is shape-checked with the view
    inp = call("Z22", "resolveAggregateEdge", {"src": {"id": "s:c"}, "tgt": R("i:1")})
    r = finish("Z22", "Z", "edges", lambda: resolve_aggregate_edge(sb, view, {"src": {"id": "s:c"}, "tgt": R("i:1")}), sc, lay, A, inp)
    same("Z22", r, ("err", "INVALID_LOD/SCHEMA"))
    # the inclusive limits (B02d, B03e) are generated rows in g_b


def run_extras():
    w = X["w"]
    base = json.loads(rd("states/W01.state.json").decode())
    o = dict(base)
    o["__proto__"] = 1
    put("states/M10g.state.json", cjb(o))
    V_verify("M10g", "M", "states/M10g.state.json")
