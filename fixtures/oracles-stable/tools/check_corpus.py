#!/usr/bin/env python3
"""Replays every row of EXPECT.tsv from the files on disk with stablelib.py and compares with the expected
outputs, error strings and work values. This checks the corpus against the Python oracle only (it is not an
implementation test)."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from stablelib import *


def rd(rel): return open(os.path.join(OUT, rel), "rb").read() if rel else None


def errstr(e):
    if e.reason in ("REPORT_MISMATCH", "NOT_REPRODUCED") or e.code in ("INVALID_REQUEST", "PLACEMENT_FAILED"):
        return e.full()
    return e.tag


def main():
    rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(OUT, "EXPECT.tsv"), encoding="utf-8")][1:]
    bad = 0
    for vid, grp, ps, pl, sc, inp, el, er, ed, err, work in rows:
        inp = json.loads(inp) if inp else {}
        fn = inp.get("fn")
        prev = (rd(ps), rd(pl)) if pl else None
        got_err, got = "", {}
        try:
            if fn == "diffScenes":
                d, w = diff_scenes(rd(ps), rd(sc)); got = {"diff": d, "work": w}
            elif fn == "computeStableLayout":
                r = compute_stable(prev, rd(sc), inp.get("options")); got = {"layout": r["layout_raw"], "report": r["report_raw"], "work": r["work"], "diff": r["diff"]}
            elif fn == "measureDisplacement":
                raw, rep, w = measure(prev, (rd(sc), rd(inp["next_layout"])), inp.get("budget")); got = {"report": raw, "work": w}
            elif fn == "verifyDisplacementReport":
                _, _, m = verify_report(rd(inp["report"]), inp.get("budget")); got = {"work": m.W}
            elif fn == "verifyStable":
                out = verify_stable(prev, rd(sc), rd(inp["layout"]), rd(inp["report"]), inp.get("budget")); got = {"work": out[4].W}
            elif fn == "verifyStableReproducible":
                _, w = verify_stable_reproducible(prev, rd(sc), rd(inp["layout"]), rd(inp["report"]), inp.get("budget")); got = {"work": w}
            else:
                raise AssertionError("unknown fn " + str(fn))
        except SErr as e:
            got_err = errstr(e)
        problems = []
        if got_err != err: problems.append(f"error {got_err!r} != {err!r}")
        if not err:
            if el and got.get("layout") != rd(el): problems.append("layout bytes")
            if er and got.get("report") != rd(er): problems.append("report bytes")
            if ed and got.get("diff") != rd(ed): problems.append("diff bytes")
            if work and str(got.get("work")) != work: problems.append(f"work {got.get('work')} != {work}")
        if problems:
            bad += 1; print("MISMATCH", vid, problems)
    print(len(rows), "rows replayed;", bad, "mismatches")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
