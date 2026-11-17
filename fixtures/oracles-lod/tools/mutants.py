#!/usr/bin/env python3
"""Self-check of the corpus: seeded mutants of the oracle's own rules must each be killed by at least one stored vector.
Replays every stored vector (deriveView, verifyLODState, ops, suggestGroups, deriveAggregateId) with one mutant switched on in lodlib.MUT."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lodlib as L
from lodlib import *
import gen_infra as gi

OUT = gi.OUT


def rd(p):
    return open(os.path.join(OUT, p), "rb").read()


def load_rows():
    rows = []
    for ln in rd("EXPECT.tsv").decode().split("\n")[1:]:
        if ln:
            rows.append(ln.split("\t"))
    return rows


def replay(row):
    id, grp, sc, lay, st, inp, exp, err = row
    if sc.startswith("generated/") or st.startswith("generated/"):
        return None
    api = None
    call = None
    if inp != "-":
        call = json.loads(rd(inp).decode())
        api = call["api"]
    try:
        if api in (None, "deriveView") and sc != "-" and lay != "-" and st != "-":
            bud = (call or {}).get("options", {}).get("budget")
            return ("ok", derive_view(rd(sc), rd(lay), rd(st), bud)[1])
        if api is None and st != "-":
            return ("ok", verify_state(rd(st))[1])
        if api == "ops":
            from gen_infra import apply_ops
            r = apply_ops(rd(st), call["args"]["ops"])
            return ("ok", r if isinstance(r, bytes) else cjb(r, True))
        if api == "suggestGroups":
            return ("ok", cjb(suggest_groups(rd(sc), call["args"]["rules"], (call.get("options") or {}).get("budget")), True))
        if api == "deriveAggregateId":
            return ("ok", cjb(derive_aggregate_id(rd(sc), call["args"]["members"]), True))
    except LODErr as e:
        return ("err", e.tag())
    except Exception as e:           # a mutant that crashes is also killed
        return ("exc", type(e).__name__)
    return None


def main():
    rows = load_rows()
    mutants = ["trunc", "dirkey", "relutf16", "loop2", "noforest", "idnopins", "dupafter", "utf16order"]
    base_bad = [r[0] for r in rows if replay(r) is not None and replay(r) != (("err", r[7]) if r[7] else ("ok", rd(r[6])))]
    print("baseline disagreements:", base_bad)
    for m in mutants:
        L.MUT.clear()
        L.MUT[m] = True
        killed = []
        for r in rows:
            out = replay(r)
            if out is None:
                continue
            want = ("err", r[7]) if r[7] else ("ok", rd(r[6]))
            if out != want:
                killed.append(r[0])
        L.MUT.clear()
        print("%-10s killed by %3d vectors: %s" % (m, len(killed), " ".join(killed[:12])))


if __name__ == "__main__":
    main()
