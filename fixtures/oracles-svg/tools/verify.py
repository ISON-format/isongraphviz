"""Lite verification of the generated inputs (NOT a substitute for the third-party run of the frozen
verifiers that design 15.2 requires) and of the frozen files the rows read.
"""
import re, os, json, hashlib
import svg
from svg import cjb, sha256_hex

JS_WS = set([0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF] + list(range(0x2000, 0x200B)))


def _ident_ok(s):
    return s != "" and not any(ord(c) in JS_WS or c in ':|"\\' for c in s)


def _id_ok(i):
    if i.startswith("i:"):
        t = i[2:]
        if not re.fullmatch(r"0|-?[1-9][0-9]*", t):
            return False
        return -2**63 <= int(t) <= 2**63 - 1
    return i.startswith("s:")


def _nkey(t, i):
    if i.startswith("i:"):
        return (t.encode("utf-8"), 0, int(i[2:]), b"")
    return (t.encode("utf-8"), 1, 0, i[2:].encode("utf-8"))


def verify_scene_lite(b):
    sc = json.loads(b.decode("utf-8"))
    assert cjb(sc) == b, "scene is not canonical"
    assert sc["igs"] == "IGS/1" and sc["address_scheme"] == "igs-addr/1" and sc["graph"]["profile"] == "simple"
    keys = []
    for n in sc["nodes"]:
        r = n["ref"]
        assert _ident_ok(r["type"]) and _id_ok(r["id"]), r
        assert n["category"] == r["type"] and n["label"] == r["id"][2:], r
        keys.append(_nkey(r["type"], r["id"]))
    assert keys == sorted(keys) and len(set(keys)) == len(keys), "node order / duplicates"
    ekeys = []
    for e in sc["edges"]:
        r = e["ref"]
        assert r["ord"] == "0" and _ident_ok(r["rel"]) and e["label"] == r["rel"]
        s, t = _nkey(r["src"]["type"], r["src"]["id"]), _nkey(r["tgt"]["type"], r["tgt"]["id"])
        assert s in keys and t in keys, "dangling endpoint"
        if not sc["graph"]["directed"]:
            assert s <= t, "undirected endpoints not canonical"
        ekeys.append((s, r["rel"].encode("utf-8"), t, b"0"))
    assert ekeys == sorted(ekeys) and len(set(ekeys)) == len(ekeys), "edge order / duplicates"
    return sc


def verify_layout_lite(lb, sb):
    ly = json.loads(lb.decode("utf-8"))
    assert cjb(ly) == lb, "layout is not canonical"
    sc = json.loads(sb.decode("utf-8"))
    assert ly["igl"] == "IGL/1" and ly["scale"] == 1000 and ly["scene_sha256"] == sha256_hex(sb)
    assert [n["ref"] for n in ly["nodes"]] == [n["ref"] for n in sc["nodes"]], "node set / order"
    for n in ly["nodes"]:
        for k in ("x", "y"):
            v = n[k]
            assert isinstance(v, int) and abs(v) <= 2**53 - 1
    return ly


def verify_frozen(root):
    """Every frozen file a row reads must equal the checksum recorded in its own corpus."""
    sums = {}
    for corpus in ("oracles", "oracles-igl"):
        path = os.path.join(root, "..", corpus, "SHA256SUMS")
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                m = re.match(r"^([0-9a-f]{64}) [ *](.+?)\s*$", line)
                if m:
                    sums[corpus + "/" + m.group(2)] = m.group(1)
    return sums


def check_frozen_use(root, paths, sums):
    bad, n = [], 0
    for p in sorted(set(paths)):
        if not p.startswith("../oracles"):
            continue
        rel = p[3:]
        full = os.path.normpath(os.path.join(root, p))
        with open(full, "rb") as fh:
            d = hashlib.sha256(fh.read()).hexdigest()
        n += 1
        if sums.get(rel) != d:
            bad.append((rel, sums.get(rel), d))
    return n, bad
