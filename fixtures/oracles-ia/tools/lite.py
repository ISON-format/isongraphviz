"""Light checker for the authored scenes, layouts and states (the third-party verifyScene / verifyLayout / bindLayout /
parseState run of design 15.1 is still required; this only catches the generator's own slips)."""
import json
import re

from base import *  # noqa

HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _nk(n):
    t, i = n["type"], n["id"]
    return (t.encode("utf-8"), (0, int(i[2:]), b"") if i.startswith("i:") else (1, 0, i[2:].encode("utf-8")))


def check_scene(b):
    errs = []
    s = json.loads(b.decode("utf-8"))
    if cjb(s) != b:
        errs.append("not canonical")
    if s["igs"] != "IGS/1" or s["address_scheme"] != "igs-addr/1" or s["graph"]["profile"] != "simple":
        errs.append("header")
    if not HEX64.match(s["source"]["artifact_sha256"]) or s["source"]["serialization_profile"] != "ison-v1":
        errs.append("source")
    nk = [_nk(n["ref"]) for n in s["nodes"]]
    if nk != sorted(nk) or len(set(nk)) != len(nk):
        errs.append("node order or duplicate")
    refs = set((n["ref"]["type"], n["ref"]["id"]) for n in s["nodes"])
    for n in s["nodes"]:
        r = n["ref"]
        if n["category"] != r["type"] or n["label"] != r["id"][2:] or not re.match(r"^(i:(0|-?[1-9][0-9]*)|s:.*)$", r["id"], re.S):
            errs.append("node agreement " + r["id"])
        if not r["type"] or any(c in r["type"] for c in ' \t\n:|"\\'):
            errs.append("identifier")
    ek = []
    for e in s["edges"]:
        r = e["ref"]
        if r["ord"] != "0" or e["label"] != r["rel"]:
            errs.append("edge agreement")
        for end in ("src", "tgt"):
            if (r[end]["type"], r[end]["id"]) not in refs:
                errs.append("dangling")
        ek.append((_nk(r["src"]), r["rel"].encode("utf-8"), _nk(r["tgt"]), r["ord"].encode()))
    if ek != sorted(ek) or len(set(ek)) != len(ek):
        errs.append("edge order or duplicate")
    if not s["graph"]["directed"]:
        for e in s["edges"]:
            if _nk(e["ref"]["src"]) > _nk(e["ref"]["tgt"]):
                errs.append("undirected endpoint order")
    return errs


def check_layout(lb, sb):
    errs = []
    l = json.loads(lb.decode("utf-8"))
    s = json.loads(sb.decode("utf-8"))
    if cjb(l) != lb:
        errs.append("layout not canonical")
    if l["scene_sha256"] != sha(sb):
        errs.append("scene hash")
    if [n["ref"] for n in l["nodes"]] != [n["ref"] for n in s["nodes"]]:
        errs.append("node set or order")
    for n in l["nodes"]:
        for k in ("x", "y"):
            if not isinstance(n[k], int) or isinstance(n[k], bool) or abs(n[k]) > 2 ** 53 - 1:
                errs.append("coordinate")
    if l["scale"] != 1000 or l["igl"] != "IGL/1" or l["policy"].get("config") != {} and l["policy"]["family"] == "FIXED":
        errs.append("header or policy")
    return errs


def check_state(m, b):
    errs = []
    st = json.loads(b.decode("utf-8"))
    if cjb(st) != b:
        errs.append("state not canonical")
    if st["scene_sha256"] != m.scene_sha or st["layout_sha256"] != m.layout_sha or st["igr"] != "IGR/1":
        errs.append("binding")
    hn, he, sel, foc, vn, ve = st_sets(m, st)
    for key, kind in (("nodes", "n"), ("edges", "e")):
        for arr in (st["hidden"][key], st["selection"][key]):
            idx = [lookup_wire(m, kind, r)[1] for r in arr]
            if idx != sorted(set(idx)):
                errs.append("order or duplicate")
    for el in sel:
        if not (el[1] in vn if el[0] == "n" else el[1] in ve):
            errs.append("selected hidden")
    if foc is not None and not (foc[1] in vn if foc[0] == "n" else foc[1] in ve):
        errs.append("focus hidden")
    v = st["viewport"]
    if not (10 <= v["zoom"] <= 100000 and 1 <= v["width"] <= 16384 and 1 <= v["height"] <= 16384):
        errs.append("viewport")
    return errs
