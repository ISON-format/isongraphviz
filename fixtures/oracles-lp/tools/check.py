"""Self-check of the oracles-lp corpus FROM DISK (independent of gen.py's in-memory rows).

    python tools/check.py [CORPUS_DIR]

Checks: EXPECT.tsv header and unique ids; no path escapes the corpus; every JSON file is canonical
(sorted keys, no whitespace, one trailing LF) and LF only; every expected file re-derives from its
input through BOTH implementations (lp.py all pairs, lpgrid.py section 7); SHA256SUMS lists every
file except itself and every digest matches; no absolute path or CR in any file.
"""
import hashlib
import json
import os
import re
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lp
import lpgrid


def canon(obj):
    return (json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")


def main():
    root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.normpath(os.path.join(HERE, ".."))
    errs = []
    lines = open(os.path.join(root, "EXPECT.tsv"), "rb").read().decode("ascii").split("\n")
    assert lines[-1] == "", "EXPECT.tsv must end with LF"
    head = lines[0].split("\t")
    assert head == ["id", "group", "tier", "input", "expected", "error", "note"], head
    ids = set()
    n = 0
    for ln in lines[1:-1]:
        c = ln.split("\t")
        assert len(c) == 7, ln
        rid, group, tier, inp, exp, err, note = c
        assert rid not in ids, "duplicate id " + rid
        ids.add(rid)
        assert err == "", rid
        for p in (inp, exp):
            assert not os.path.isabs(p) and ".." not in p.split("/") and "\\" not in p, ("path", p)
            assert os.path.realpath(os.path.join(root, p)).startswith(os.path.realpath(root)), ("escape", p)
        ib = open(os.path.join(root, inp), "rb").read()
        eb = open(os.path.join(root, exp), "rb").read()
        io, eo = json.loads(ib), json.loads(eb)
        if canon(io) != ib:
            errs.append("input not canonical " + rid)
        if canon(eo) != eb:
            errs.append("expected not canonical " + rid)
        nodes, labels = lp.parse_input(io)
        assert len(eo) == len(labels), rid
        a = [{"dx": dx, "dy": dy} for dx, dy in lp.place_labels(nodes, labels)]
        b = [{"dx": dx, "dy": dy} for dx, dy in lpgrid.place_labels(nodes, labels)]
        if a != eo:
            errs.append("all-pairs differs from expected " + rid)
        if b != eo:
            errs.append("grid differs from expected " + rid)
        n += 1
    listed = {}
    for ln in open(os.path.join(root, "SHA256SUMS"), "rb").read().decode("ascii").split("\n")[:-1]:
        h, rest = ln.split(" *", 1)
        listed[rest] = h
    present = []
    for r_, dirs, files in os.walk(root):
        for f in files:
            full = os.path.join(r_, f)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            if rel == "SHA256SUMS":
                continue
            present.append(rel)
            data = open(full, "rb").read()
            if b"\r" in data:
                errs.append("CR in " + rel)
            if re.search(rb"[A-Za-z]:[\/]|/Users/|/home/|/mnt/", data) and not rel.startswith("tools/check.py"):
                errs.append("absolute path in " + rel)
            if listed.get(rel) != hashlib.sha256(data).hexdigest():
                errs.append("SHA256SUMS mismatch " + rel)
    if sorted(present) != sorted(listed):
        errs.append("file set differs from SHA256SUMS: %s" % sorted(set(present) ^ set(listed)))
    if any("__pycache__" in p for p in present):
        errs.append("__pycache__ present")
    print("rows checked: %d, files: %d" % (n, len(present)))
    if errs:
        for e in errs[:40]:
            print("FAIL", e)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
