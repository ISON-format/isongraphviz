"""Parity check of this corpus's own igr-svg/1 and igr-dl/1 writers against the tracked expected files of the
V5 and V6 corpora.  Read-only: only expected files (svg/*.svg, dl/*.dl) and the EXPECT.tsv of those corpora are read,
plus the frozen scenes and layouts that their rows name (fixtures/oracles, fixtures/oracles-igl).  Nothing is copied
and no tool of those corpora is imported or run.
"""
import json
import os

from base import *  # noqa
import export as EX


def _rows(path):
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    h = lines[0].split("\t")
    return [dict(zip(h, l.split("\t"))) for l in lines[1:] if l]


def run(ROOT, AUX, SC):
    fix = os.path.dirname(ROOT)
    out = []
    for corpus, kind, fn in (("oracles-svg", "svg", lambda m, st: EX.render_svg(m, st)),
                             ("oracles-dl", "dl", lambda m, st: EX.render_dl(m, st))):
        rows = _rows(os.path.join(fix, corpus, "EXPECT.tsv"))
        for r in rows:
            if not (r["group"] == "G" and r["id"] in ["G%02d" % i for i in range(1, 11)]):
                continue
            if not (r["scene"].startswith(("../oracles/", "../oracles-igl/")) and r["layout"].startswith(("../oracles/", "../oracles-igl/"))):
                continue
            inp = json.loads(r["input"])
            if inp.get("state") != "initial":
                continue
            with open(os.path.normpath(os.path.join(fix, corpus, r["scene"])), "rb") as f:
                sb = f.read()
            with open(os.path.normpath(os.path.join(fix, corpus, r["layout"])), "rb") as f:
                lb = f.read()
            m = build_model(sb, lb)
            st = mk_state(m, inp["size"]["width"], inp["size"]["height"])
            mine = fn(m, st)
            with open(os.path.join(fix, corpus, r["expected"]), "rb") as f:
                theirs = f.read()
            mine_file = "(computed)"
            if kind == "svg" and r["id"] == "G01":
                mine_file = "data/O1.svg"
            if kind == "dl" and r["id"] == "G01":
                mine_file = "data/O1.dl"
            out.append(("%s:%s" % (kind, r["id"]), mine_file, sha(mine), "%s/%s" % (corpus, r["expected"]), sha(theirs),
                        "MATCH" if mine == theirs else "MISMATCH"))
    # svg:O05 (the declaration variant of O1) is the A.9 parity entry
    rows = _rows(os.path.join(fix, "oracles-svg", "EXPECT.tsv"))
    for r in rows:
        if r["id"] == "O05":
            with open(os.path.join(fix, "oracles-svg", r["expected"]), "rb") as f:
                theirs = f.read()
            mine = AUX["data/O1.decl.svg"]
            out.append(("svg:O05", "data/O1.decl.svg", sha(mine), "oracles-svg/" + r["expected"], sha(theirs),
                        "MATCH" if mine == theirs else "MISMATCH"))
    return out
