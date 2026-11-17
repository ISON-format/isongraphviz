#!/usr/bin/env python3
"""Independent IGL/1 oracle generator (plan Task 9). Python only: no TypeScript produces an expected byte."""
import copy, hashlib, json, math, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)                                         # .../oracles-igl
V1A = os.path.join(OUT, "..", "oracles")                            # frozen V1a oracles (read-only)
PY_SRC = os.environ.get("ISON_GRAPH_PY_SRC", os.path.normpath(os.path.join(OUT, "..", "..", "..", "..", "isongraph", "ison-graph", "src")))
sys.path.insert(0, PY_SRC)
from ison_graph import ISONGraph            # read-only import of Core Python
from ison_graph.viz import compute_layout

CORE = dict(height=600, iterations=170, margin=60, seed=42, width=900)

def u16(s):
    """One character per UTF-16 code unit: Python's code-point order of the result equals JavaScript's UTF-16 order of s."""
    b = s.encode("utf-16-le", "surrogatepass")
    return "".join(chr(u) for u in struct.unpack("<%dH" % (len(b) // 2), b))

def cj(v):
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, int): return str(v)
    if isinstance(v, str): return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list): return "[" + ",".join(cj(x) for x in v) + "]"
    if isinstance(v, dict): return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + cj(v[k]) for k in sorted(v, key=lambda s: s.encode("utf-16-be"))) + "}"
    raise TypeError(type(v))

def sha(b): return hashlib.sha256(b).hexdigest()

def quantize(v):
    if not math.isfinite(v): raise ValueError("not finite")
    s = v * 1000.0; f = math.floor(s)
    q = f + (1 if s - f >= 0.5 else 0)
    if abs(q) > 2 ** 53 - 1: raise ValueError("range")
    return 0 if q == 0 else q

def ref_key(ref):   # NodeRef/2: type by UTF-8, INT64 ids numerically before STRING ids by UTF-8
    i = ref["id"]
    return (ref["type"].encode("utf-8"), 0, int(i[2:]), b"") if i.startswith("i:") else (ref["type"].encode("utf-8"), 1, 0, i[2:].encode("utf-8"))

def put(rel, data):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f: f.write(data if isinstance(data, bytes) else data.encode("utf-8"))
def get(path): return open(path, "rb").read()

def scene_of(path):
    raw = get(path); return raw, json.loads(raw.decode("utf-8")), sha(raw)

def layout_obj(scene_sha, nodes, policy):
    return {"address_scheme": "igs-addr/1", "igl": "IGL/1", "nodes": sorted(nodes, key=lambda n: ref_key(n["ref"])), "policy": policy, "scale": 1000, "scene_sha256": scene_sha}

FORCE = lambda cfg: {"family": "FORCE", "algorithm": "igl-force/1", "config": cfg}
FIXED = {"family": "FIXED", "algorithm": "igl-fixed/1", "config": {}}

def force_nodes(scene, cfg):
    g = ISONGraph("g", directed=scene["graph"]["directed"]); back = {}
    pid = lambda wid: int(wid[2:]) if wid.startswith("i:") else u16(wid[2:])
    for n in scene["nodes"]:
        t, i = u16(n["ref"]["type"]), pid(n["ref"]["id"]); g.add_node(t, i); back[(t, i)] = n["ref"]
    for e in scene["edges"]:
        r = e["ref"]; g.add_edge(r["rel"], (u16(r["src"]["type"]), pid(r["src"]["id"])), (u16(r["tgt"]["type"]), pid(r["tgt"]["id"])))
    lay = compute_layout(g, width=cfg["width"], height=cfg["height"], iterations=cfg["iterations"], seed=cfg["seed"], margin=cfg["margin"])
    return [{"ref": back[k], "x": quantize(v[0]), "y": quantize(v[1])} for k, v in lay.items()]

ROWS = []   # (id, group, scene, input, expected, error)
def row(*r): ROWS.append(r)

def emit_layout(rel, obj):
    text = cj(obj).encode("utf-8"); put(rel, text); put(rel.replace(".layout.json", ".layout.sha256"), sha(text) + "\n"); return text

def main():
    sc = lambda name: os.path.join(OUT, "scenes", name + ".scene.json")
    o1, o4 = os.path.join(V1A, "o1-basic.scene.json"), os.path.join(V1A, "o4-undirected.scene.json")

    def hand_scene(nodes, edges=()):
        ns = sorted(({"category": t, "label": i[2:], "ref": {"id": i, "type": t}} for t, i in nodes), key=lambda n: ref_key(n["ref"]))
        # edge order is the contract's: src by NodeRef/2, then rel by UTF-8, then tgt by NodeRef/2, then ord (no pre-existing scene has an edge)
        es = sorted(({"label": r, "ref": {"ord": "0", "rel": r, "src": {"id": si, "type": st}, "tgt": {"id": ti, "type": tt}}} for r, st, si, tt, ti in edges),
                    key=lambda e: (ref_key(e["ref"]["src"]), e["ref"]["rel"].encode("utf-8"), ref_key(e["ref"]["tgt"]), e["ref"]["ord"]))
        return cj({"address_scheme": "igs-addr/1", "edges": es, "graph": {"directed": True, "profile": "simple"}, "igs": "IGS/1", "nodes": ns, "source": {"artifact_sha256": "0" * 64, "serialization_profile": "ison-v1"}}).encode("utf-8")
    ASTRAL = "\U0001F600"
    # V2 closure additions (owner ruling 2026-11-16): FORCE lookup keys exactly AT the 1,024-unit limit are accepted (F13). Key = `type label`, UTF-16 units.
    put("scenes/keybound.scene.json", hand_scene(
        [("t", "s:" + "a" * 1022), ("t", "s:" + ASTRAL * 511), ("t", "s:c"), ("u" * 1022, "s:x"), ("t", "s:" + "\u20ac" * 1022), ("w" * 1006, "i:-9007199254740991")],
        [("r" * 1024, "t", "s:c", "t", "s:" + "a" * 1022), ("r", "t", "s:c", "u" * 1022, "s:x")]))
    S18_NODES = [("t", "s:" + "9" * 5000), ("t", "s:b")]
    put("scenes/S18.scene.json", hand_scene(S18_NODES))      # numeric-looking 5,000-digit string id: valid IGS/1, refused by FORCE (S18), laid out by FIXED (X05)

    # ---- L-FORCE (positive) ----
    force_cases = [("F01", o1, CORE), ("F02", o4, CORE), ("F03", sc("parity5"), CORE), ("F04", sc("mixed20"), CORE),
                   ("F05", sc("mixed20"), {**CORE, "seed": 7}), ("F06", sc("mixed20"), dict(width=400, height=300, iterations=60, margin=20, seed=42)),
                   ("F07", sc("empty"), CORE), ("F08", sc("single"), CORE), ("F09", sc("unicode"), CORE),
                   ("F10", sc("mixed20"), {**CORE, "iterations": 0}), ("F11", sc("bind-a"), CORE), ("F12", sc("bind-b"), CORE),
                   ("F13", sc("keybound"), CORE)]
    texts = {}
    for fid, path, cfg in force_cases:
        raw, scene, ssha = scene_of(path)
        texts[fid] = emit_layout(f"layouts/{fid}.layout.json", layout_obj(ssha, force_nodes(scene, cfg), FORCE(cfg)))
        row(fid, "force", os.path.relpath(path, OUT).replace(os.sep, "/"), json.dumps(cfg, sort_keys=True), f"layouts/{fid}.layout.json", "")

    # ---- L-FIXED (positive) ----
    fixed = {"X01": (o1, [[-12.3456, 0.0005], [1000000.0, 0.25]]), "X02": (o1, [[0.0005, 0.0015], [-0.0005, -0.0]]), "X03": (sc("empty"), []),
             # X04: the quantizer against the shortcut floor(s + 0.5): s = 4503599627370497 is an exact integer; the shortcut gives ...498 (and ...496 for the negative)
             "X04": (o1, [[4503599627370.497, 0.0005], [-4503599627370.497, -0.0005]]),
             # X05: a valid IGS/1 scene whose id is 5,000 characters: FIXED supports it although FORCE refuses it (S18)
             "X05": (sc("S18"), [[1.5, -2.25], [0.0005, 0.001]])}
    for fid, (path, pos) in fixed.items():
        raw, scene, ssha = scene_of(path)
        refs = [n["ref"] for n in sorted(scene["nodes"], key=lambda n: ref_key(n["ref"]))]
        put(f"fixed/{fid}.positions.json", json.dumps([{"ref": r, "x": p[0], "y": p[1]} for r, p in zip(refs, pos)], indent=1))
        emit_layout(f"layouts/{fid}.layout.json", layout_obj(ssha, [{"ref": r, "x": quantize(p[0]), "y": quantize(p[1])} for r, p in zip(refs, pos)], FIXED))
        row(fid, "fixed", os.path.relpath(path, OUT).replace(os.sep, "/"), f"fixed/{fid}.positions.json", f"layouts/{fid}.layout.json", "")

    # ---- L-VERIFY: mutations of F01 ---- (rows mirror packages/layout-core/test/verify.test.ts REJECT; the test asserts the files agree)
    T = texts["F01"].decode("utf-8")
    def must(s, a, b):
        assert a in s, a; return s.replace(a, b, 1)       # first occurrence only (the base has two "person" nodes)
    def obj(mut):                                           # canonical KEY order (ASCII keys here); arrays keep the order the mutation gave them
        o = json.loads(T); mut(o); return json.dumps(o, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
    nest = lambda k: [] if k <= 0 else [nest(k - 1)]
    pol = lambda o: o["policy"]; cfgo = lambda o: o["policy"]["config"]
    V = [
        ("V01", must(T, '"x":173961,', '"x":173961.5,'), "INVALID_COORDINATE/NOT_INTEGER"),
        ("V02", must(T, '"x":173961,', '"x":-0,'), "INVALID_COORDINATE/NEGATIVE_ZERO"),
        ("V03", must(T, '"x":173961,', '"x":9007199254740992,'), "INVALID_COORDINATE/OUT_OF_RANGE"),
        ("V04", must(T, '"x":173961,', '"x":1e999,'), "INVALID_COORDINATE/NOT_FINITE"),
        ("V05", must(T, '"x":173961,', '"x":"173961",'), "INVALID_LAYOUT/SCHEMA"),
        ("V06", obj(lambda o: o["nodes"].reverse()), "INVALID_LAYOUT/NON_CANONICAL"),
        ("V07", obj(lambda o: o["nodes"].append(copy.deepcopy(o["nodes"][1]))), "INVALID_LAYOUT/DUPLICATE_NODE_REF"),
        ("V08", obj(lambda o: o.update(foo=1)), "INVALID_LAYOUT/UNKNOWN_FIELD"),
        ("V09", obj(lambda o: o.update(edges=[])), "INVALID_LAYOUT/RESERVED_FIELD"),
        ("V10", obj(lambda o: o.update(layout_sha256="0" * 64)), "INVALID_LAYOUT/RESERVED_FIELD"),
        ("V11", obj(lambda o: o.pop("scale")), "INVALID_LAYOUT/MISSING_FIELD"),
        ("V12", obj(lambda o: o.update(igl="IGL/2")), "INVALID_LAYOUT/UNSUPPORTED_VERSION"),
        ("V13", obj(lambda o: o.update(address_scheme="igs-addr/2")), "INVALID_LAYOUT/UNSUPPORTED_ADDRESS_SCHEME"),
        ("V14", obj(lambda o: o.update(scale=1)), "INVALID_LAYOUT/INVALID_SCALE"),
        ("V15", obj(lambda o: o.update(scene_sha256="E8".ljust(64, "A"))), "INVALID_LAYOUT/INVALID_HASH"),
        ("V16", json.dumps(json.loads(T), indent=1, ensure_ascii=False), "INVALID_LAYOUT/NON_CANONICAL"),
        ("V17", b"\xef\xbb\xbf" + T.encode(), "INVALID_LAYOUT/INVALID_ENCODING"),
        ("V18", T.encode()[:20] + b"\xff" + T.encode()[20:], "INVALID_LAYOUT/INVALID_ENCODING"),
        ("V19", must(T, '"id":"i:1"', '"id":"s:\\ud800"'), "INVALID_LAYOUT/INVALID_STRING"),
        ("V20", obj(lambda o: o["nodes"][0].update({"x-d": nest(64)})), "INVALID_LAYOUT/TOO_DEEP"),
        ("V21", obj(lambda o: o["nodes"][0].update({"x-d": nest(63)})), "ok"),
        ("V22", obj(lambda o: o.update({"x-Bad": 1})), "INVALID_LAYOUT/UNKNOWN_FIELD"),
        ("V23", obj(lambda o: o["nodes"][0].update({"x-f": 1.5})), "INVALID_LAYOUT/INVALID_NUMBER"),
        ("V24", obj(lambda o: o["nodes"][0].update({"x-n": -5})), "ok"),
        ("V25", obj(lambda o: o["nodes"][0].pop("y")), "INVALID_LAYOUT/MISSING_FIELD"),
        ("V26", must(T, '"id":"i:1"', '"id":"bogus"'), "INVALID_LAYOUT/INVALID_ID"),
        ("V27", must(T, '"type":"person"', '"type":"per son"'), "INVALID_LAYOUT/INVALID_IDENTIFIER"),
        ("V28", "{", "INVALID_LAYOUT/SCHEMA"),
        ("V29", obj(lambda o: pol(o).pop("family")), "INVALID_LAYOUT/MISSING_FIELD"),
        ("V30", obj(lambda o: pol(o).update(family="force")), "INVALID_LAYOUT/UNKNOWN_FAMILY"),
        ("V31", obj(lambda o: pol(o).update(family="HIERARCHICAL", algorithm="igl-hier/1", config={})), "UNSUPPORTED_FAMILY/"),
        ("V32", obj(lambda o: pol(o).update(algorithm="igl-fixed/1")), "INVALID_POLICY/ALGORITHM_FAMILY_MISMATCH"),
        ("V33", obj(lambda o: cfgo(o).update(radii=1)), "INVALID_POLICY/UNKNOWN_KEY"),
        ("V34", obj(lambda o: cfgo(o).pop("seed")), "INVALID_POLICY/MISSING_KEY"),
        ("V35", obj(lambda o: cfgo(o).update(seed=2 ** 32)), "INVALID_POLICY/INVALID_VALUE"),
        ("V36", obj(lambda o: cfgo(o).update(width=100)), "INVALID_POLICY/MARGIN_TOO_LARGE"),
        ("V37", obj(lambda o: cfgo(o).update(seed=None)), "INVALID_LAYOUT/INVALID_VALUE"),
        ("V38", obj(lambda o: cfgo(o).update({"x-n": 1})), "INVALID_POLICY/UNKNOWN_KEY"),
        ("V39", json.dumps(json.loads(obj(lambda o: cfgo(o).update(seed=2 ** 32))), indent=1), "INVALID_LAYOUT/NON_CANONICAL"),
        ("V40", obj(lambda o: pol(o).update({"x-n": 1})), "INVALID_LAYOUT/UNKNOWN_FIELD"),
        ("V41", must(T, '"family":"FORCE"', '"family":' + "[" * 2000 + "]" * 2000), "INVALID_LAYOUT/TOO_DEEP"),   # review finding I-1: no host-dependent RangeError
        # V2 closure additions (owner ruling 2026-11-16, audit m-5); expectations derived from sections 6.1 and 9, not from the implementation
        ("V42", obj(lambda o: pol(o).update(algorithm="igl-force/2")), "INVALID_POLICY/UNKNOWN_ALGORITHM"),
        ("V43", obj(lambda o: pol(o).update(config=[])), "INVALID_POLICY/SCHEMA"),
        ("V44", must(T, '"scale":1000,', '"scale":1000,"scale":1000,'), "INVALID_LAYOUT/NON_CANONICAL"),
        ("V45", must(T, '"x":173961,', '"x":9007199254740991,'), "ok"),
        ("V46", must(T, '"x":173961,', '"x":-9007199254740991,'), "ok"),
    ]
    for vid, content, err in V:
        put(f"verify/{vid}.layout.json", content if isinstance(content, bytes) else content.encode("utf-8"))
        row(vid, "verify", "", f"verify/{vid}.layout.json", "", "" if err == "ok" else err)

    # ---- L-SCENE: hand-written scenes (written here, independently of any TypeScript) ----
    S = [("S01", [("p", "i:7"), ("p", "s:7")], "UNSUPPORTED_SCENE/AMBIGUOUS_ORDER_KEY"), ("S02", [("p", "i:7"), ("p", "s:007")], "UNSUPPORTED_SCENE/CORE_ID_TWIN"),
         ("S03", [("p", "i:0"), ("p", "s:-0")], "UNSUPPORTED_SCENE/CORE_ID_TWIN"), ("S04", [("p", "i:-7"), ("p", "s:-007")], "UNSUPPORTED_SCENE/CORE_ID_TWIN"),
         ("S05", [("p", "i:9007199254740993")], "UNSUPPORTED_SCENE/UNSAFE_NODE_ID"), ("S06", [("p", "i:-9223372036854775808")], "UNSUPPORTED_SCENE/UNSAFE_NODE_ID"),
         ("S07", [("p", "s:a b")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"), ("S08", [("p", "s:a:b")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"),
         ("S09", [("p", "s:")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"),
         ("S10", [("p", "s:7"), ("q", "s:7")], "ok"), ("S11", [("p", "s:007"), ("p", "s:7")], "ok"), ("S12", [("p", "s:-0"), ("p", "s:0")], "ok"),
         ("S13", [("p", "s:\uFF5E"), ("p", "s:\U0001F600")], "ok"),
         # V2 closure additions: the FORCE lookup-key limit (type + space + label, UTF-16 units, inclusive 1,024) and two uncovered representation refusals
         ("S14", [("t", "s:" + "a" * 1023), ("t", "s:b")], "RESOURCE_LIMIT/CORE_KEY_LENGTH"),          # key 1 + 1 + 1023 = 1025
         ("S15", [("t" * 1023, "s:a"), ("t", "s:b")], "RESOURCE_LIMIT/CORE_KEY_LENGTH"),                # short id, long type: key 1023 + 1 + 1 = 1025
         ("S16", [("t", "s:" + ASTRAL * 512), ("t", "s:b")], "RESOURCE_LIMIT/CORE_KEY_LENGTH"),         # 512 code points but 1,024 units: key 1,026
         ("S17", [("t", "s:a"), ("t", "s:b")], "RESOURCE_LIMIT/CORE_KEY_LENGTH", [("r" * 1025, "t", "s:a", "t", "s:b")]),   # a 1,025-unit relation identifier
         ("S18", S18_NODES, "RESOURCE_LIMIT/CORE_KEY_LENGTH"),                                          # 5,000-digit numeric-looking string id
         ("S19", [("p", "s:a|b")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID"),
         ("S20", [("p", "s:a\tb")], "UNSUPPORTED_SCENE/CORE_UNREPRESENTABLE_ID")]
    for sid, nodes, err, *rest in S:
        raw = hand_scene(nodes, rest[0] if rest else ()); put(f"scenes/{sid}.scene.json", raw); scene = json.loads(raw.decode("utf-8"))
        if err == "ok":
            emit_layout(f"layouts/{sid}.layout.json", layout_obj(sha(raw), force_nodes(scene, CORE), FORCE(CORE)))
            row(sid, "scene", f"scenes/{sid}.scene.json", json.dumps(CORE, sort_keys=True), f"layouts/{sid}.layout.json", "")
        else:
            row(sid, "scene", f"scenes/{sid}.scene.json", json.dumps(CORE, sort_keys=True), "", err)

    # ---- L-BIND ----
    a_raw, a_scene, a_sha = scene_of(sc("bind-a"))
    put("bind/B01.layout.json", get(os.path.join(OUT, "layouts/F12.layout.json")))                       # layout of scene B ...
    row("B01", "bind", "scenes/bind-a.scene.json", "", "bind/B01.layout.json", "SCENE_MISMATCH/")          # ... against scene A: same nodes, different edges
    put("bind/B02.layout.json", get(os.path.join(OUT, "layouts/F11.layout.json"))); row("B02", "bind", "scenes/bind-a.scene.json", "", "bind/B02.layout.json", "")
    f11 = json.loads(get(os.path.join(OUT, "layouts/F11.layout.json")).decode("utf-8"))
    miss = copy.deepcopy(f11); miss["nodes"].pop(); emit_layout("bind/B03.layout.json", miss); row("B03", "bind", "scenes/bind-a.scene.json", "", "bind/B03.layout.json", "INCOMPLETE_LAYOUT/MISSING_NODE")
    extra = copy.deepcopy(f11); extra["nodes"].append({"ref": {"id": "s:d", "type": "n"}, "x": 9, "y": 9}); emit_layout("bind/B04.layout.json", extra); row("B04", "bind", "scenes/bind-a.scene.json", "", "bind/B04.layout.json", "INCOMPLETE_LAYOUT/UNKNOWN_NODE")
    wrong = copy.deepcopy(f11)
    for n in wrong["nodes"]: n["ref"]["type"] = "m"
    emit_layout("bind/B05.layout.json", wrong); row("B05", "bind", "scenes/bind-a.scene.json", "", "bind/B05.layout.json", "INCOMPLETE_LAYOUT/MISSING_NODE")
    one = hand_scene([("p", "i:7")]); put("scenes/B06.scene.json", one)
    emit_layout("bind/B06.layout.json", layout_obj(sha(one), [{"ref": {"id": "s:7", "type": "p"}, "x": 0, "y": 0}], FIXED)); row("B06", "bind", "scenes/B06.scene.json", "", "bind/B06.layout.json", "INCOMPLETE_LAYOUT/MISSING_NODE")
    put("scenes/B07.scene.json", json.dumps(a_scene, indent=1)); row("B07", "bind", "scenes/B07.scene.json", "", "layouts/F11.layout.json", "IGS:INVALID_SCENE/NON_CANONICAL")
    row("B08", "bind", "scenes/S18.scene.json", "", "layouts/X05.layout.json", "")                     # a long valid identifier binds (the key limit is FORCE-only)

    # ---- manifest ----
    header = "id\tgroup\tscene\tinput\texpected_layout\terror\n"
    put("EXPECT.tsv", header + "".join("\t".join(r) + "\n" for r in ROWS))
    print(f"{len(ROWS)} rows")

if __name__ == "__main__":
    main()
