"""Groups W (worked examples), A (aggregate identity), M (state verification)."""
import json
from gen_infra import *

X = {}   # shared artifacts


SRC = ("nodes.t\nid\n1\n2\na\nb\nc\nd\ne\n\nedges.r\nsource target\n:t:1 :t:2\n:t:1 :t:a\n:t:1 :t:b\n:t:a :t:b\n:t:b :t:a\n:t:c :t:c\n"
       ":t:c :t:2\n:t:d :t:c\n:t:e :t:c\n\nedges.q\nsource target\n:t:1 :t:b\n")
W_NODES = ["i:1", "i:2"] + ["s:" + c for c in "abcde"]
W_EDGES = [("q", "i:1", "s:b"), ("r", "i:1", "i:2"), ("r", "i:1", "s:a"), ("r", "i:1", "s:b"), ("r", "s:a", "s:b"), ("r", "s:b", "s:a"),
           ("r", "s:c", "i:2"), ("r", "s:c", "s:c"), ("r", "s:d", "s:c"), ("r", "s:e", "s:c")]
W_POS = {"i:1": (0, 0), "i:2": (1000, -500), "s:a": (-1500, 2000), "s:b": (2500, 3000), "s:c": (500, -1000), "s:d": (-3, 7), "s:e": (0, 8)}
OUTER = ["s:" + c for c in "abcde"]


def setup_w():
    put("sources/w.source.ison", SRC)
    art = sha(SRC.encode())
    sc, sb = mkscene("w", W_NODES, W_EDGES, True, art)
    lay, lb = mklayout("w", sb, W_POS)
    X["w"] = dict(sc=sc, sb=sb, lay=lay, lb=lb)
    return X["w"]


def run_w():
    w = setup_w()
    # the printed values of section 14 (hashes only; the bytes were compared in the first session)
    assert sha(w["sb"]) == "fbf8c619017a67764fc01509aa3168418ec5fd71dafec440c0211930cc90a355"
    assert sha(w["lb"]) == "d7a8924d1ec873aa782e5945efc474ee9310b3c283f32a0433e879e31fb08969"
    stA = mkstate("W01", w["sb"], w["lb"], [["s:d", "s:e"]])
    stB = mkstate("W02", w["sb"], w["lb"], [(OUTER, "outer"), ["s:d", "s:e"]])
    stC = mkstate("W03", w["sb"], w["lb"], [(OUTER, "outer"), ["s:d", "s:e"]], pinned=["s:b"], ep={"keep_forest": True, "max_view_edges": 2})
    assert sha(stA[1]) == "b52bd0bd6c57a21a5faf296ad5efa2011fd76ab97f8cffe684b0e95fe3436bcc"
    assert sha(stB[1]) == "1d137de1ddfb9326303e5d5a3051a4ba0af2dae2ef5a22516fed717bf269a3ab"
    assert sha(stC[1]) == "927c32b97f2f89ba73117f408b6b9000f5eec6ce3f05d0280218444968acae25"
    exp = {"W01": "f379e1897ac3b557e2fabdd762391617fdff9481b210975ea26cd81570a7d4bb", "W02": "9421525f3b65a23eab92b77e91ea8a7e3486be0b4abd973497e0532824e13d2d",
           "W03": "054d951869caafcf5b0a73203dce8e226921ad87c17e222ef0277d4fc2c65a03"}
    for vid, st in (("W01", stA), ("W02", stB), ("W03", stC)):
        r = V_derive(vid, "W", w["sc"], w["lay"], st[0])
        assert r[0] == "ok" and sha(r[1]) == exp[vid], vid
    X["stA"] = stA


def run_a():
    w = X["w"]
    members = [R("s:a"), R("s:b"), R("s:c")]
    r1 = V_aggid("A01", "A", w["sc"], members)
    r2 = V_aggid("A02", "A", w["sc"], [R("s:c"), R("s:a"), R("s:b")])
    assert r1 == r2
    sc3, sb3 = mkscene("w-other-source", W_NODES, W_EDGES, True, "1" * 64)
    r3 = V_aggid("A03", "A", sc3, members)
    assert r3[0] == "ok" and r3[1] != r1[1]
    sct, sbt = mkscene("twins", ["i:7", "s:7", "s:8"], [], True)
    a4 = V_aggid("A04", "A", sct, [R("i:7"), R("s:7")])
    a4b = V_aggid("A04b", "A", sct, [R("i:7"), R("s:8")])
    assert a4[1] != a4b[1]
    # A05/A06: an aggregate id spelled as a node id / as a type
    aid = json.loads(r1[1])["id"]
    def hostile(name, nodes_raw):
        nodes = [{"category": t, "label": i[2:], "ref": {"id": i, "type": t}} for t, i in nodes_raw]
        b = cjb({"address_scheme": "igs-addr/1", "edges": [], "graph": {"directed": True, "profile": "simple"}, "igs": "IGS/1",
                 "nodes": nodes, "source": {"artifact_sha256": "0" * 64, "serialization_profile": "ison-v1"}})
        sc, _ = mkscene(name, [], [], raw=b)
        # a layout and a state for the (invalid) scene: the verdict must be the scene error
        lb = build_layout(sha(b), [({"id": i, "type": t}, 0, 0) for t, i in nodes_raw])
        lay = put("layouts/%s.layout.json" % name, lb)
        stb = mkstate_bytes(b, lb, [])
        st = put("states/%s.state.json" % name, stb)
        return sc, lay, st
    sc5, lay5, st5 = hostile("A05", [("t", aid), ("t", "s:a")])
    V_derive("A05", "A", sc5, lay5, st5)
    sc6, lay6, st6 = hostile("A06", [(aid, "s:a"), ("t", "s:b")])
    V_derive("A06", "A", sc6, lay6, st6)
    # A07: members spelled as aggregate references
    base = json.loads(X["stA"][1].decode())
    def state_file(name, obj):
        return put("states/%s.state.json" % name, cjb(obj))
    def withmember(m, where):
        o = json.loads(json.dumps(base))
        if where == "member":
            o["collapsed"][0]["members"][0] = m
        else:
            o["pinned"] = [m]
        return o
    for nm, m, wh in (("A07a", {"agg": aid}, "member"), ("A07b", {"agg": aid}, "pin"),
                      ("A07c", {"agg": aid, "id": "s:d", "type": "t"}, "member"), ("A07d", {"agg": aid, "id": "s:d", "type": "t"}, "pin")):
        V_verify(nm, "A", state_file(nm, withmember(m, wh)))
    # A08 (resolveInScene of an aggregate) is an IGS API without a call format in 15.1: not produced
    # A09: a scene node whose id text begins igagg1: is valid and distinct
    nid = "s:" + aid
    sc9, sb9 = mkscene("A09", [nid, "s:a", "s:b"], [("r", nid, "s:a"), ("r", "s:a", "s:b")])
    lay9, lb9 = mklayout("A09", sb9)
    st9 = mkstate("A09", sb9, lb9, [[nid, "s:a"]])
    r9 = V_derive("A09", "A", sc9, lay9, st9[0])
    assert r9[0] == "ok"
    # A10: id independent of layout, pins, zoom
    lay10, lb10 = mklayout("A10", X["w"]["sb"], {k: (v[0] + 17, v[1] - 5) for k, v in W_POS.items()})
    st10 = mkstate("A10", X["w"]["sb"], lb10, [["s:d", "s:e"]], pinned=["s:e"], zoom=3000)
    r10 = V_derive("A10", "A", X["w"]["sc"], lay10, st10[0])
    assert aid != "" and json.loads(r10[1])["aggregates"][0]["id"] == json.loads(rd("expected/W01.view.json"))["aggregates"][0]["id"]
    # A11: isAggregateId
    good = "igagg1:" + "0123456789abcdef" * 4
    for nm, v in (("A11a", good), ("A11b", good + "\n"), ("A11c", " " + good), ("A11d", good.upper().replace("IGAGG1", "igagg1")),
                  ("A11e", good[:-1]), ("A11f", good + "0"), ("A11g", "i:" + "0" * 64), ("A11h", good.replace("igagg1:", "igagg2:")),
                  ("A11i", "s:" + good), ("A11j", ""), ("A11k", good + " ")):
        V_isagg(nm, "A", v)
    # A12: UTF-8 order differs from UTF-16 order
    sc12, sb12 = mkscene("A12", ["s:a", "s:\uff5e", "s:\U0001F600"], [("r", "s:\uff5e", "s:\U0001F600")])
    ra = V_aggid("A12", "A", sc12, [R("s:\U0001F600"), R("s:\uff5e")])
    rb = V_aggid("A12b", "A", sc12, [R("s:\uff5e"), R("s:\U0001F600")])
    assert ra == rb
    # the id equals the hash of the preimage with U+FF5E before U+1F600 (UTF-8 byte order)
    pre = ('{"agg":"IGLOD-AGG/1","members":[{"id":"s:\uff5e","type":"t"},{"id":"s:\U0001F600","type":"t"}],"scene_sha256":"%s"}' % sha(sb12)).encode("utf-8")
    assert json.loads(ra[1])["id"] == "igagg1:" + sha(pre)


# ---------------------------------------------------------------------------------------- M
def run_m():
    w = X["w"]
    base = json.loads(X["stA"][1].decode())

    def S(name, obj=None, raw=None, group="M"):
        b = raw if raw is not None else cjb(obj)
        return put("states/%s.state.json" % name, b)

    def mut(f):
        o = json.loads(json.dumps(base))
        f(o)
        return o

    def verify(name, obj=None, raw=None):
        V_verify(name, "M", S(name, obj, raw))

    verify("M01", base)
    verify("M02", mut(lambda o: o.update(lod="IGLOD/2")))
    # M03/M04: binding
    V_derive("M03", "M", w["sc"], w["lay"], S("M03", mut(lambda o: o.update(scene_sha256="0" * 64))))
    V_derive("M04", "M", w["sc"], w["lay"], S("M04", mut(lambda o: o.update(layout_sha256="0" * 64))))
    for k, nm in zip(sorted(RESERVED), "abcdefghi"):
        verify("M05" + nm, mut(lambda o, k=k: o.update({k: 1})))
    xs = mut(lambda o: o.update({"x-note": "hello", "x-n": {"a": [1, 2, {"b": True}]}, "x-zero": 0}))
    verify("M06", xs)
    V_derive("M06b", "M", w["sc"], w["lay"], S("M06b", xs))

    def nest(k):
        return "[" * k + "]" * k
    cb = cj(base)

    def spliced(extra):      # canonical text with one more top-level x- key (key 'x-d' sorts after 'scene_sha256', before 'zoom_milli')
        return cj(base)[:-1] + "," + extra + "}"
    # canonical order matters: build via object then cjb of parsed JSON text
    def with_x(depth):
        o = mut(lambda o: None)
        txt = cjb({**o, "x-d": 0}).decode().replace('"x-d":0', '"x-d":' + nest(depth))
        return txt.encode()
    verify("M07a", raw=with_x(64))
    verify("M07b", raw=with_x(65))
    for nm, tokens in (("M08a", "1.5"), ("M08b", "-1"), ("M08c", '"500"'), ("M08d", "2147483648"), ("M08e", "2147483647"), ("M08f", "-0"),
                       ("M08g", "1e3"), ("M08h", "2.0"), ("M08i", "true"), ("M08j", "null"), ("M08k", "00"), ("M08l", "0"), ("M08m", "+1"), ("M08n", "1e999"), ("M08o", "01"), ("M08p", "1,")):
        verify(nm, raw=cj(base).replace('"zoom_milli":500', '"zoom_milli":' + tokens).encode())
    # M09 missing keys
    verify("M09a", mut(lambda o: o["label_policy"].pop("short_degree")))
    verify("M09b", mut(lambda o: o.pop("pinned")))
    verify("M09c", mut(lambda o: o.pop("label_policy")))
    verify("M09d", mut(lambda o: o["collapsed"][0].pop("members")))
    verify("M09e", mut(lambda o: o["collapsed"][0]["members"][0].pop("type")))
    # M10 unknown keys
    verify("M10a", mut(lambda o: o["label_policy"].update(extra=1)))
    verify("M10b", mut(lambda o: o.update(extra=1)))
    verify("M10c", mut(lambda o: o["collapsed"][0].update(extra=1)))
    verify("M10d", mut(lambda o: o["collapsed"][0]["members"][0].update({"x-a": 1})))
    verify("M10e", mut(lambda o: o["label_policy"].update({"x-a": 1})))
    verify("M10f", mut(lambda o: o.update({"x-Bad": 1})))
    # M11 encodings
    verify("M11a", raw=b"\xef\xbb\xbf" + cjb(base))
    verify("M11b", raw=cjb(base)[:10] + b"\xff" + cjb(base)[10:])
    verify("M11c", raw=cj(base).replace('"collapsed":[{', '"collapsed":[{"label":"\\ud800",').encode())
    verify("M11d", raw=b"{")
    verify("M11e", raw=b"")
    verify("M11f", raw=b"[]")
    verify("M11g", raw=cj(base).replace('"collapsed":[{', '"collapsed":[{"label":"\\ud83d\\ude00",').encode())     # a valid surrogate pair, escaped: parses, then non-canonical
    # M12 non-canonical
    verify("M12a", raw=json.dumps(base, indent=1).encode())
    verify("M12b", raw=cj(base).replace('"zoom_milli":500', '"zoom_milli":500,"zoom_milli":500').encode())
    verify("M12c", raw=cj(base).replace('"zoom_milli":500', '"zoom_milli":501,"zoom_milli":500').encode())
    verify("M11h", raw=(cj(base)[:-1] + ",}").encode())                                                  # trailing comma: JSON syntax error
    verify("M12e", raw=cj(base).replace('"lod":"IGLOD/1"', '"lod":"IGLOD\\u002f1"').encode())     # a non-canonical string escape
    verify("M12f", raw=('{"zoom_milli":500,' + cj({k: v for k, v in base.items() if k != "zoom_milli"})[1:]).encode())   # key order
    verify("M12d", raw=cj(base).replace('"lod":"IGLOD/1",', '"lod":"IGLOD/1" ,').encode())
    # M22 whitespace is the JavaScript \s class (rev 3): U+00A0, U+FEFF, U+2028 refused in a type; U+0085, U+001C, U+180E accepted
    def pin_type(nm, t, i="s:a"):
        o = json.loads(json.dumps(base))
        o["pinned"] = [{"id": i, "type": t}]
        verify(nm, o)
    pin_type("M22a", "a b")
    pin_type("M22b", "ab")
    pin_type("M22c", "a﻿b")
    pin_type("M22d", "ab")
    pin_type("M22e", "a b")
    pin_type("M22f", "a᠎b")
    pin_type("M22g", "t", "s:")
    pin_type("M22h", "t", "s:a b")
    pin_type("M22i", "a　b")
    pin_type("M22j", "a b")
    pin_type("M22k", "a​b")
    # M13 edge_policy
    verify("M13a", mut(lambda o: o.update(edge_policy={"keep_forest": True, "max_view_edges": 7})))
    verify("M13b", mut(lambda o: o.update(edge_policy={"keep_forest": True})))
    verify("M13c", mut(lambda o: o.update(edge_policy={"keep_forest": "true", "max_view_edges": 7})))
    verify("M13d", mut(lambda o: o.update(edge_policy={"keep_forest": True, "max_view_edges": 2147483648})))
    verify("M13e", mut(lambda o: o.update(edge_policy={"keep_forest": True, "max_view_edges": 7, "zzz": 1})))
    verify("M13f", mut(lambda o: o.update(edge_policy={"keep_forest": False, "max_view_edges": 0})))
    # M14 stage order
    verify("M14a", mut(lambda o: o.update(pinned=[{"id": "s:b", "type": "t"}, {"id": "s:a", "type": "t"}],
                                         label_policy={"full_degree": 5, "full_zoom_milli": 1000, "short_degree": 3, "short_zoom_milli": 2000})))
    verify("M14c", mut(lambda o: o.update(label_policy={"full_degree": 5, "full_zoom_milli": 1000, "short_degree": 3, "short_zoom_milli": 2000})))
    verify("M14d", mut(lambda o: o.update(label_policy={"full_degree": 2, "full_zoom_milli": 2000, "short_degree": 3, "short_zoom_milli": 1000})))
    verify("M14e", mut(lambda o: o.update(collapsed=[{"members": [{"id": "s:e", "type": "t"}, {"id": "s:d", "type": "t"}]}],
                                          pinned=[{"id": "s:a", "type": "t"}, {"id": "s:a", "type": "t"}])))
    # M15 layout not bound to scene (V2's SCENE_MISMATCH unchanged)
    sc15, sb15 = mkscene("M15-other", W_NODES, W_EDGES[:-1], True, "2" * 64)
    lay15, lb15 = mklayout("M15-other", sb15, W_POS)
    V_derive("M15", "M", w["sc"], lay15, S("M15", json.loads(mkstate_bytes(w["sb"], lb15, [["s:d", "s:e"]]).decode())))
    # M16 key order in the input does not change the verdict (two defects: lod is examined before zoom_milli)
    o16 = mut(lambda o: o.update(lod="IGLOD/9", zoom_milli="x"))
    verify("M16a", o16)
    rev = "{" + ",".join(jstr(k) + ":" + cj(o16[k]) for k in sorted(o16, key=u16, reverse=True)) + "}"
    verify("M16b", raw=rev.encode())
    # M17 unknown and missing key in one object: UNKNOWN_FIELD first
    verify("M17a", mut(lambda o: (o["label_policy"].pop("short_degree"), o["label_policy"].update(bogus=1))))
    verify("M17b", mut(lambda o: (o.pop("pinned"), o.update(zzz=1))))
    # M18 wrong JSON types
    verify("M18a", mut(lambda o: o.update(edge_policy={"keep_forest": "true", "max_view_edges": 3})))
    verify("M18b", mut(lambda o: o["collapsed"][0]["members"][0].update(id=5)))
    verify("M18c", mut(lambda o: o["collapsed"][0].update(label=5)))
    verify("M18d", mut(lambda o: o.update(collapsed={})))
    verify("M18e", mut(lambda o: o.update(edge_policy=None)))
    verify("M18f", mut(lambda o: o.update(pinned="s:a")))
    verify("M18g", mut(lambda o: o["label_policy"].update(full_degree=True)))
    verify("M18h", mut(lambda o: o["collapsed"].__setitem__(0, 7)))
    verify("M18i", mut(lambda o: o.update(lod=1)))
    verify("M18j", mut(lambda o: o.update(layout_sha256=5)))
    # M19 x- values
    verify("M19a", raw=cjb({**base, "x-a": 0}).decode().replace('"x-a":0', '"x-a":null').encode())
    verify("M19b", raw=cjb({**base, "x-a": 0}).decode().replace('"x-a":0', '"x-a":1.5').encode())
    verify("M19c", raw=cjb({**base, "x-a": 0}).decode().replace('"x-a":0', '"x-a":-5').encode())
    verify("M19d", raw=cjb({**base, "x-a": 0}).decode().replace('"x-a":0', '"x-a":"\\ud800"').encode())
    verify("M19e", raw=cjb({**base, "x-a": 0}).decode().replace('"x-a":0', '"x-a":[{"k":[null]}]').encode())
    verify("M19f", raw=cjb({**base, "x-a": 0}).decode().replace('"x-a":0', '"x-a":9007199254740992').encode())
    verify("M19g", raw=cjb({**base, "x-a": 0}).decode().replace('"x-a":0', '"x-a":9007199254740991').encode())
    # M20 order of reports
    verify("M20a", mut(lambda o: (o["collapsed"][0]["members"][0].update(id="bogus"), o.update(pinned=[{"id": "s:a", "type": "a b"}]))))
    verify("M20b", mut(lambda o: o["collapsed"][0]["members"][0].update({"agg": aid_of(), "zzz": 1})))
    verify("M20c", mut(lambda o: o.update(pinned=[{"id": "s:a", "type": "a b"}, {"id": "bogus", "type": "t"}])))
    # M21 pipeline precedence
    badscene = json.dumps(json.loads(w["sb"].decode()), indent=1).encode()
    put("scenes/M21-noncanonical.scene.json", badscene)
    V_derive("M21a", "M", "scenes/M21-noncanonical.scene.json", w["lay"], S("M21a", mut(lambda o: o.update(lod="IGLOD/2"))))
    V_derive("M21b", "M", "scenes/M21-noncanonical.scene.json", lay15, S("M21b", base))
    V_derive("M21c", "M", w["sc"], w["lay"], S("M21c", mut(lambda o: o.update(scene_sha256="0" * 64, layout_sha256="1" * 64))))
    v = json.loads(json.dumps(base))
    v["collapsed"][0]["members"][1] = {"id": "s:zz", "type": "t"}
    v["pinned"] = [{"id": "s:zy", "type": "t"}]
    V_derive("M21d", "M", w["sc"], w["lay"], S("M21d", v))
    v2 = json.loads(json.dumps(base))
    v2["pinned"] = [{"id": "s:zy", "type": "t"}]
    V_derive("M21e", "M", w["sc"], w["lay"], S("M21e", v2))


def aid_of():
    return "igagg1:" + "0" * 64
