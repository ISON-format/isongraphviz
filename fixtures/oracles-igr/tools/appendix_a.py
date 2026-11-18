#!/usr/bin/env python3
"""Reproduces Appendix A of 27-IGR1-DESIGN.md.  The expected strings are extracted from the design text itself
(code blocks and inline code of Appendix A); the numbers of A.2-A.5 are the constants quoted in the text.
Exit status 0 iff every item reproduces exactly.  Run this before generating anything (design 13.4)."""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import igr

ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
DOC = os.path.join(ROOT, "docs", "isongraph-visualize-blueprint", "27-IGR1-DESIGN.md")
FIX = os.path.join(ROOT, "fixtures")

results = []


def check(name, got, want):
    ok = got == want
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name)
    if not ok:
        print("   got : %r" % (got,))
        print("   want: %r" % (want,))


def main():
    text = open(DOC, encoding="utf-8").read()
    app = text[text.index("## Appendix A"):]
    o1 = open(os.path.join(FIX, "oracles", "o1-basic.scene.json"), "rb").read()
    f01 = open(os.path.join(FIX, "oracles-igl", "layouts", "F01.layout.json"), "rb").read()
    m = igr.build_model(o1, f01)
    check("input: scene_sha256 e8a4357a...07a1dc", m.scene_sha256, "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc")
    check("input: layout_sha256 2f37ccf2...", m.layout_sha256, "2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db")
    # A.1
    blocks = re.findall(r"```text\n(.*?)\n```", app, re.S)
    a1 = [b for b in blocks if b.startswith('{"artifact_sha256"')][0]
    a2 = [b for b in blocks if b.startswith('{"hidden"')][0]
    check("A.1 modelBytes (M01), byte for byte", igr.model_bytes(m).decode("utf-8"), a1)
    # A.2
    st = igr.initial_state(m, 900, 600)
    check("A.2 initialState 900x600 (S01), byte for byte", igr.serialize_state(m, st).decode("utf-8"), a2)
    vp = st["viewport"]
    check("A.2 zoom 1994", vp["zoom"], 1994)
    check("A.2 center_x 383554", vp["center_x"], 383554)
    check("A.2 center_y 134563", vp["center_y"], 134563)
    check("A.2 floorDiv(836e6,419186)=1994 and floorDiv(536e6,106720)=5022",
          (igr.floor_div(836 * 10 ** 6, 419186), igr.floor_div(536 * 10 ** 6, 106720)), (1994, 5022))
    # A.3
    def run(state, intent):
        return igr.reduce(m, state, intent)
    s1, _ = run(st, {"type": "pan", "dx": 10, "dy": 0})
    check("A.3 pan dx=10 -> center_x 378539", s1["viewport"]["center_x"], 378539)
    check("A.3 divRound(10e6,1994)=5015", igr.div_round(10 * 10 ** 6, 1994), 5015)
    s2, _ = run(st, {"type": "pan", "dx": -7, "dy": 0})
    check("A.3 divRound(-7e6,1994)=-3511", igr.div_round(-7 * 10 ** 6, 1994), -3511)
    check("A.3 pan dx=-7 -> center_x 387065", s2["viewport"]["center_x"], 387065)
    s3, _ = run(st, {"type": "zoom", "factor_milli": 2000})
    check("A.3 zoom 2000 -> zoom 3988, centre unchanged", (s3["viewport"]["zoom"], s3["viewport"]["center_x"], s3["viewport"]["center_y"]), (3988, 383554, 134563))
    s4, _ = run(st, {"type": "zoom", "factor_milli": 2000, "anchor": {"x": 0, "y": 300}})
    check("A.3 zoom 2000 anchor (0,300) -> center_x 270716", s4["viewport"]["center_x"], 270716)
    check("A.3 ... center_y unchanged", s4["viewport"]["center_y"], 134563)
    s5, _ = run(s1, {"type": "fit", "padding": 32})
    check("A.3 fit {padding:32} returns the A.2 viewport", s5["viewport"], vp)
    # A.4
    X, Y = igr.layout_to_screen_micro(m, vp)
    check("A.4 i:1 screen micro-pixels (32,071,558; 193,600,160)", (X[0], Y[0]), (32071558, 193600160))
    check("A.4 s:ann screen micro-pixels (867,928,442; 406,399,840)", (X[1], Y[1]), (867928442, 406399840))
    check("A.4 point (32.0,193.5): q*1000", (igr.q(32.0) * 1000, igr.q(193.5) * 1000), (32000000, 193500000))
    d2 = (X[0] - 32000000) ** 2 + (Y[0] - 193500000) ** 2
    check("A.4 squared distance (-71,558)^2+(-100,160)^2", d2, 71558 ** 2 + 100160 ** 2)
    check("A.4 hit (32.0,193.5) = node i:1", igr.hit_test(m, st, (32.0, 193.5)), {"node": {"id": "i:1", "type": "person"}})
    P = (igr.q(500) * 1000, igr.q(308) * 1000)
    Dx, Dy = X[1] - X[0], Y[1] - Y[0]
    L2 = Dx * Dx + Dy * Dy
    tn = (P[0] - X[0]) * Dx + (P[1] - Y[0]) * Dy
    cross = (P[0] - X[0]) * Dy - (P[1] - Y[0]) * Dx
    check("A.4 D = (835,856,884; 212,799,680)", (Dx, Dy), (835856884, 212799680))
    check("A.4 L2 = 743,940,434,338,291,856", L2, 743940434338291856)
    check("A.4 tn = 415,465,458,809,145,928", tn, 415465458809145928)
    check("A.4 0 < tn < L2", 0 < tn < L2, True)
    check("A.4 |cross| = 3,953,128,928,000,000", abs(cross), 3953128928000000)
    check("A.4 cross^2 <= (6e6)^2 * L2", cross * cross <= (6 * 10 ** 6) ** 2 * L2, True)
    check("A.4 point (500,308) hits the KNOWS edge", igr.hit_test(m, st, (500, 308)),
          {"edge": {"ord": "0", "rel": "KNOWS", "src": {"id": "i:1", "type": "person"}, "tgt": {"id": "s:ann", "type": "person"}}})
    check("A.4 point (500,300) is no hit", igr.hit_test(m, st, (500, 300)), None)
    P2 = (igr.q(500) * 1000, igr.q(300) * 1000)
    cr2 = (P2[0] - X[0]) * Dy - (P2[1] - Y[0]) * Dx
    dist_px = abs(cr2) / (L2 ** 0.5) / 1e6
    check("A.4 point (500,300) is about 12.3 px from the line", round(dist_px, 1), 12.3)
    check("A.4 distance of (500,308) about 4.58 px", round(abs(cross) / (L2 ** 0.5) / 1e6, 2), 4.58)
    # H03/H04 quantization examples (section 3 and A.4)
    check("3 q(0.0625)=63, q(-0.0625)=-62, q(12)=12000, q(12+2^-10)=12001, q(12+2^-11)=12000",
          (igr.q(0.0625), igr.q(-0.0625), igr.q(12), igr.q(12 + 2 ** -10), igr.q(12 + 2 ** -11)), (63, -62, 12000, 12001, 12000))
    check("3 divRound(7,2)=4, divRound(-7,2)=-3, divRound(-5,2)=-2", (igr.div_round(7, 2), igr.div_round(-7, 2), igr.div_round(-5, 2)), (4, -3, -2))
    # A.5
    check("A.5 name of i:1 / s:ann", (igr.node_name(m, 0), igr.node_name(m, 1)), ("person 1", "person ann"))
    check("A.5 edge name KNOWS, description '1 KNOWS ann'", (igr.edge_name(m, 0), igr.edge_description(m, 0)), ("KNOWS", "1 KNOWS ann"))
    check("A.5 summary", igr.summary_text(igr.graph_summary(m)), "Directed graph with 2 nodes and 1 edge. Node categories: person (2).")
    sel_edge, _ = run(st, {"type": "select", "mode": "replace", "targets": [{"edge": igr.elem_address(m, ("e", 0))}]})
    foc, _ = run(sel_edge, {"type": "focus", "target": {"node": {"id": "i:1", "type": "person"}}})
    check("A.5 status", igr.status_text(m, foc), "1 selected, 0 hidden. Focus: person 1.")
    ten = igr.graph_summary(m)
    ten = {"categories": [{"category": c, "count": 1} for c in "abcdefghij"], "directed": True, "edges": 0, "nodes": 10}
    check("A.5 ten categories (A06 text)", igr.summary_text(ten),
          "Directed graph with 10 nodes and 0 edges. Node categories: a (1), b (1), c (1), d (1), e (1), f (1), g (1), h (1), and 2 more.")
    # A.6
    inl = re.findall(r"`(\[\{.*?\}\])`", app)
    ev_sel = [s for s in inl if s.startswith('[{"selection"')][0]
    ev_foc = [s for s in inl if s.startswith('[{"focus"')][0]
    ev_end = [s for s in inl if s.startswith('[{"end"')][0]
    sA, e1 = run(st, {"type": "select", "mode": "replace", "targets": [{"node": {"id": "i:1", "type": "person"}}]})
    check("A.6 select event bytes", igr.serialize_events(e1).decode("utf-8"), ev_sel)
    check("A.6 new selection", sA["selection"], {"edges": [], "nodes": [{"id": "i:1", "type": "person"}]})
    sB, e2 = run(sA, {"type": "focus-step", "delta": 1})
    check("A.6 focus-step event bytes", igr.serialize_events(e2).decode("utf-8"), ev_foc)
    check("A.6 focus first in state bytes", igr.serialize_state(m, sB).decode("utf-8").startswith('{"focus":{"node":{"id":"i:1","type":"person"}},"hidden"'), True)
    sC, _ = run(sB, {"type": "focus-step", "delta": 1})
    check("A.6 third step -> s:ann", sC["focus"], {"node": {"id": "s:ann", "type": "person"}})
    sD, _ = run(sC, {"type": "focus-step", "delta": 1})
    check("A.6 fourth step -> the edge", list(sD["focus"]), ["edge"])
    sE, e5 = run(sD, {"type": "focus-step", "delta": 1})
    check("A.6 fifth step: state unchanged", sE, sD)
    check("A.6 fifth step: boundary event bytes", igr.serialize_events(e5).decode("utf-8"), ev_end)
    print("%d/%d items reproduced" % (sum(results), len(results)))
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
