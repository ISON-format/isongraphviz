"""Appendix A reproduction gate (design 31, 13.1 rules X1 and X2).

Blocks are extracted mechanically from the design file (LF only):
  X1  a fenced block whose heading quotes (N bytes, SHA-256 h) is the block text plus one final LF
  X2  a composite is a printed prefix block followed by printed hex lines, unhexed and appended
A figure quoted without a gated block is checked against this oracle's own output.
"""
import os
import re

import cvs
import dlist
import exe
import ju
import plan as P
import rend
import scn
import shaders

import glob as _glob

DESIGN = sorted(_glob.glob(os.path.join(scn.FIXTURES, "..", "docs", "*", "31-CANVAS-WEBGL-DESIGN.md")))[0]
DESIGN_SHA = "eaf76017c4e62f6a445e9b550ace6301d75ea22143f27e9c66d9e97a631e6968"


def design_text():
    with open(DESIGN, "rb") as f:
        b = f.read()
    assert b.count(b"\r") == 0, "design file contains CR"
    return b.decode("utf-8")


def blocks_after(t, marker, n=1):
    """the n fenced blocks that follow `marker` (first occurrence)"""
    i = t.index(marker)
    out = []
    pos = i
    for _ in range(n):
        a = t.index("```", pos)
        a_end = t.index("\n", a) + 1
        b = t.index("\n```", a_end)
        out.append(t[a_end:b])
        pos = b + 4
    return out


def x1(block):
    return (block + "\n").encode("utf-8")


def _row(item, ok, detail=""):
    return (item, "REPRODUCED" if ok else "DISAGREES", detail)


def check(mk, A):
    """mk(sl, state, size) -> (m, st, d, p, b); returns a list of (item, status, detail)"""
    t = design_text()
    res = []
    O1 = ("../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json")

    def cmp(item, mine, want_bytes=None, want_len=None, want_sha=None, extra=""):
        ok = True
        det = []
        if want_bytes is not None:
            ok &= mine == want_bytes
            det.append("bytes %s" % ("equal" if mine == want_bytes else "DIFFER (mine %d, design %d)" % (len(mine), len(want_bytes))))
        if want_len is not None:
            ok &= len(mine) == want_len
            det.append("size mine %d / design %d" % (len(mine), want_len))
        if want_sha is not None:
            ok &= ju.sha256_hex(mine).startswith(want_sha)
            det.append("sha mine %s / design %s" % (ju.sha256_hex(mine)[:16] + "...", want_sha[:16] + "..."))
        res.append(_row(item, ok, "; ".join(det) + extra))

    # ---- A.1
    m, st, d, p, b = mk(O1, "initial", (900, 600))
    blk = blocks_after(t, "**A.1 `buildDisplayList(O1/F01, initial)` = row `G01`**")[0]
    dlb = dlist.serialize_dl(d)
    cmp("A.1 display list of G01 (X1 block)", dlb, x1(blk), 637, "62e9d45ed682602b4b4dae6503a92029566fb0cabf6e73f8a9a50893fcff4ebd")
    # ---- A.2 (difference block, figure sizes)
    st3 = scn.read_state(m, "../oracles-svg/states/Y03.state.json")
    d3 = dlist.build_dl(m, st3)
    b3 = dlist.serialize_dl(d3)
    diff = blocks_after(t, "differs from A.1 in exactly three lines")[0].split("\n")
    lines3 = b3.decode("utf-8").split("\n")
    ok = all(l in lines3 for l in diff) and len([1 for a, c in zip(dlb.decode().split("\n"), lines3) if a != c]) == 3
    res.append(_row("A.2 display list differs from A.1 in exactly the three printed lines", ok))
    cmp("A.2 display list size and SHA-256 (figure)", b3, None, 637, "48c82389e35751c8db74db13e12c1345222d3dd01df16791fb9bd2bec931194e")
    # ---- A.3
    LOOPS = ("../oracles-svg/scenes/loops2.scene.json", "../oracles-svg/layouts/loops2.layout.json")
    m2, st2, d2, p2, b2 = mk(LOOPS, "initial", (900, 600))
    blk = blocks_after(t, "**A.3 Directed self-loops")[0]
    cmp("A.3 display list of G11/loops2 (X1 block)", dlist.serialize_dl(d2), x1(blk), 1553, "6ff8514097243394205a11f23e3250c607ddca3b4c39f603916e436dbd3a8ef0")
    # ---- A.4
    blk = blocks_after(t, "**A.4 The Canvas stream (`igr-cv/1`) of `G01`**")[0]
    s1 = cvs.record_stream(d)
    cmp("A.4 Canvas stream of G01 (X1 block)", s1, x1(blk), 1042, "7ec2e46cf221854f5c67dee39eef53dcc0c013bbdfbe352f59141133af055d22")
    s2 = cvs.record_stream(d3)
    cmp("A.4 Canvas stream of the A.2 state (figure, row C02)", s2, None, 1455, "6cbb962e795d29790254341af0cd2fce66f3afafe6ae8ee14dad2bb2083abfd6")
    # ---- A.5 composite (X2)
    pre, hexb = blocks_after(t, "**A.5 The plan (`igr-gl/1`) of `G01`.**", 2)
    hexlines = [l for l in hexb.split("\n") if l]
    assert len(hexlines) == 3
    comp = x1(pre) + b"".join(bytes.fromhex(l) for l in hexlines)
    cmp("A.5 prefix block (X1: 836 bytes)", x1(pre), x1(pre), 836, "c5d81633112a6003a29be7f107222aca04b3958c7ec8d2e375a787366c1600c3")
    cmp("A.5 composite: prefix + unhexed hex lines equals the plan of G01 (X2)", b, comp, 936, "b637d7b00e638ae36923b4c1b13b2890bfd7fd93f23f9a0926fbda2823b90b64")
    # plan of the A.2 state (figure)
    pl3, pb3 = P.build_plan(d3)
    cmp("A.5 plan of the A.2 state (figure, row G06)", pb3, None, 1155, "6cde050d2fa3c02182c308fd042f9b5369cb15307d66a63564e09557fea0ccea")
    res.append(_row("A.5 header line of the A.2 plan is 718 bytes with its LF; sizes edge 80, disc 64, arrow 28", len(ju.cjb(pl3.hdr)) + 1 == 718 and pl3.hdr["sizes"] == {"arrow": 28, "disc": 64, "edge": 80}))
    # ---- A.5.1
    blk = blocks_after(t, "**A.5.1 The executor's logged sequence (7.5): complete resource creation**")[0]
    log = []
    exe.create_resources(log)
    cmp("A.5.1 resource creation log (E01, X1 block)", exe.log_bytes(log), x1(blk), 2327, "2126facde38e4a1ca6b3a4be63b4f9599075ada8648f3a30f51a93cee6c4a1a4")
    res.append(_row("A.5.1 the creation log has 64 lines", len(log) == 64))
    blk = blocks_after(t, "Frame for `G01` (row `gl:E02`")[0]
    log = []
    exe.frame_log(log, p, {"widthPx": 900, "heightPx": 600, "ink": (34, 34, 34)})
    cmp("A.5.1 frame of G01 (E02, X1 block)", exe.log_bytes(log), x1(blk), 2080, "bf76df948456e1c02b9d8c1a1de056f9ee18a9eddb8779b673778f536b55ce14")
    # ---- A.5.2 float32 figures (informational)
    import struct
    got = {v: struct.pack("<f", float(v)).hex() for v in (16777215, 16777216, 16777217, 16777219, 0)}
    want = {16777215: "ffff7f4b", 16777216: "0000804b", 16777217: "0000804b", 16777219: "0200804b", 0: "00000000"}
    res.append(_row("A.5.2 float32 bytes of 16777215, 16777216, 16777217, 16777219 and 0 (informational)", got == want and struct.pack("<f", -0.0).hex() == "00000080"))
    # ---- A.5.3
    blk = blocks_after(t, "`dispose` in `ready` (row `gl:E09`")[0]
    log = []
    exe.delete_resources(log)
    exe.release_context(log)
    cmp("A.5.3 dispose log (E09, X1 block)", exe.log_bytes(log), x1(blk), 291, "103f5c0bb2c0bef91c52692f1e585abe233e49ddd588f3ca97744ff5ab9b66e8")
    blk = blocks_after(t, "A compile failure of `disc.fs` at initialize (row `gl:E10`")[0]
    log = []
    exe.create_resources(log, ("compile", "disc.fs"))
    cmp("A.5.3 compile failure of disc.fs (E10, X1 block)", exe.log_bytes(log), x1(blk), 1229, "bd32157387d57ac744be9edc81193b6f1b60826876271321442a85da6bd7a6b7")
    # ---- A.6
    blk = blocks_after(t, "**A.6 Pick buffer, bounds and picks.**")[0]
    pb = pick_buffer(d)
    cmp("A.6 pick buffer of G01 (X1 block)", pb, x1(blk), 104, "abf25857a74454be0e22782b66285c47d427070d9651682807d23f371aff2e03")
    blk = blocks_after(t, "`serializeBounds` of `G01`")[0]
    cmp("A.6 element bounds of G01 (X1 block)", bounds(d), x1(blk), 105, "ca1fd785221a3733180ebf4b216b346da30399134fde346ea0f0db94df424180")
    E3 = [r for r in d2.records if r[0] == "E" and r[1] == 3][0]
    poly = P.flatten(E3[4:])
    flat = [v for q in poly for v in q]
    want = [25100, 293000, 24027, 288781, 23733, 285125, 24107, 282031, 25038, 279500, 26413, 277531, 28123, 276125, 30056, 275281, 32100, 275000, 34144, 275281, 36077, 276125, 37787, 277531, 39163, 279500, 40093, 282031, 40467, 285125, 40173, 288781, 39100, 293000]
    res.append(_row("A.6 the 17-point polyline of the first loop of G11 (5.1 flatten)", flat == want))
    # ---- A.7
    blk = blocks_after(t, "**A.7 The readout of `G01`**")[0]
    ro = P.serialize_readout(P.readout_from_gl(P.parse_plan(b)))
    cmp("A.7 readout of G01 from the plan alone (X1 block)", ro, x1(blk), 975, "127ffa680c360cc4698c417129ca6f5c9df1aec086004a5fcb7f3cb791a5214c")
    res.append(_row("A.7 the readout from the list, from the Canvas stream and from the plan are the same bytes", ro == P.serialize_readout(P.readout_from_list(d)) == P.serialize_readout(cvs.readout_from_calls(s1, d))))
    # ---- A.8
    setb = exe.shader_set_bytes()
    res.append(_row("A.8 shaderSetBytes() is 4490 bytes", len(setb) == 4490, "mine %d" % len(setb)))
    res.append(_row("A.8 SHADER_SET_SHA256 = eaf76017c4e6...", ju.sha256_hex(setb) == DESIGN_SHA, "mine %s / design %s" % (ju.sha256_hex(setb), DESIGN_SHA)))
    sh = {"arrow.fs": (129, "894c4e9db734c2fcc5f42940184807d119f028d2d24bc53d979c038f0450e914"), "arrow.vs": (310, "975cffe180978aaacd4b7e716fd067877e6c9bfd9de03530037fae630f459006"),
          "disc.fs": (1172, "5a783e38303592b018513b272fdcda6ecd4feda10a7a65fa594d65f3be603bf6"), "disc.vs": (476, "d9a3be158baca0282919240a9d729989ad671c8828a531a95fe04f8bf5909d30"),
          "edge.fs": (536, "b537d827b12c32a8c98e0f3b7412bbd71cbe77b1efa0bd7efa0127fb7b69c245"), "edge.vs": (1662, "9dc240db5ea5b60fc26fadc1425da04b4a84b123812fd7a00786beec25f1c62f")}
    ok = all((len(s.encode()), ju.sha256_hex(s.encode())) == sh[k] for k, s in shaders.SOURCES.items())
    res.append(_row("A.8 the six sources (sizes and SHA-256) equal the quoted ones", ok))
    # the shader constants equal the Appendix B blocks extracted from the design now (X1)
    sec = t[t.index("## Appendix B."):]
    blks = re.findall(r"\*\*B\.\d (\w+) (vertex|fragment) shader\*\* \((\d+) bytes\):\n\n```glsl\n(.*?)\n```", sec, re.S)
    ok = len(blks) == 6 and all(shaders.SOURCES[prog + "." + ("vs" if st_ == "vertex" else "fs")] == body + "\n" and len((body + "\n").encode()) == int(n) for prog, st_, n, body in blks)
    res.append(_row("Appendix B: the six sources equal the blocks extracted from the design (X1) and their quoted byte counts", ok))
    # ---- A.9 sizes
    sizes = {}
    for name, kw in (("labels: false", dict(labels=False)), ("edgeLabels: false", dict(edge_labels=False)), ("maxDrawnLabelUnits: 9", dict(max_units=9)),
                     ("maxDrawnLabelUnits: 8", dict(max_units=8)), ("maxDrawnLabelUnits: 4", dict(max_units=4)), ("maxDrawnLabelUnits: 0", dict(max_units=0))):
        dd = dlist.build_dl(m, scn.initial_state(m, 900, 600), **kw)
        sizes[name] = len(dlist.serialize_dl(dd))
    want = {"labels: false": 548, "edgeLabels: false": 605, "maxDrawnLabelUnits: 9": 637, "maxDrawnLabelUnits: 8": 605, "maxDrawnLabelUnits: 4": 605, "maxDrawnLabelUnits: 0": 548}
    res.append(_row("A.9 list sizes under the label options (548, 605, 637, 605, 605, 548)", sizes == want, str(sizes)))
    st7 = scn.read_state(m, "../oracles-svg/states/Y07.state.json")
    res.append(_row("A.9 state Y07 list is 319 bytes (ND 1, ED 0, D 1)", len(dlist.serialize_dl(dlist.build_dl(m, st7))) == 319))
    # ---- A.10
    res.extend(a10())
    # ---- A.11
    ok = (cvs.backing_size(900, 600, 1333) == {"bh": 800, "bw": 1200, "e": 1333} and cvs.backing_size(16384, 100, 2000) == {"bh": 100, "bw": 16384, "e": 1000}
          and cvs.backing_size(16384, 16384, 2000) == {"bh": 8192, "bw": 8192, "e": 500} and cvs.backing_size(16384, 16384, 250) == {"bh": 4096, "bw": 4096, "e": 250})
    res.append(_row("A.11 device sizes (1333 -> 1200x800; per-side cap; area cap 500; 250)", ok))
    return res


def pick_buffer(d):
    out = [ju.line(["P", "igr-pick/1", d.nd, d.ed])]
    for r in d.records:
        if r[0] == "N":
            out.append(ju.line(["pn", r[1], r[4], r[5]]))
    for r in d.records:
        if r[0] == "E":
            out.append(ju.line(["pe", r[1]] + [v for q in P.flatten(r[4:]) for v in q]))
    return b"".join(out)


def bounds(d):
    out = []
    for r in d.records:
        if r[0] == "N":
            out.append(ju.line(["b", r[1], r[4] - 19000, r[5] - 19000, r[4] + 19000, r[5] + 19000]))
    for r in d.records:
        if r[0] == "E":
            pl = P.flatten(r[4:])
            xs, ys = [q[0] for q in pl], [q[1] for q in pl]
            out.append(ju.line(["b", r[1], min(xs) - 6000, min(ys) - 6000, max(xs) + 6000, max(ys) + 6000]))
    return b"".join(out)


def a10_list():
    d = dlist.DL()
    d.width, d.height, d.directed = 900, 600, True
    d.artifact, d.layout, d.scene = "1" * 64, "3" * 64, "2" * 64
    d.nodes = [{"id": "s:a", "type": "p"}, {"id": "s:b", "type": "p"}]
    d.edges = [{"ord": "0", "rel": "R", "src": {"id": "s:a", "type": "p"}, "tgt": {"id": "s:b", "type": "p"}}]
    d.nd, d.ed = 2, 1
    E = ["E", 3, 0, 0, -2000000000, 300000, 1000000001, 700003]
    d.records = [E, dlist.arrow_record(3, E[4:]), ["N", 1, 0, 1, -2000000000, 300000], ["N", 2, 0, 0, 1000000001, 700003]]
    return d


def a10():
    t = design_text()
    out = []
    d = a10_list()
    pl, b = P.build_plan(d)
    want_hdr = re.search(r"The plan header of this list: `(\{.*?\})`\.", t).group(1)
    got_hdr = ju.cj(pl.hdr)
    out.append(_row("A.10 plan header of the far-edge list (quoted header text equals this oracle's header)", got_hdr == want_hdr, "" if got_hdr == want_hdr else "mine %s / design %s" % (got_hdr, want_hdr)))
    q = P.parse_plan(b)
    inst = q.E[3]
    ok = len(inst) == 1 and inst[0][0][:2] == [-256000, 566635] and inst[0][0][6:8] == [1156000, 566823] and inst[0][2] == 0
    out.append(_row("A.10 the single kind-0 instance (-256000, 566635) -> (1156000, 566823)", ok, "mine %s" % (inst,)))
    ok = pl.hdr["cn"] == [[1, 1], [2, 0]]
    out.append(_row("A.10 cn = [[1,1],[2,0]]; the arrow triangle is outside the guard box and omitted; d stays 1", ok and pl.hdr["d"] == 1 and len(q.A) == 0))
    from fractions import Fraction
    P0, P1 = (-2000000000, 300000), (1000000001, 700003)
    dx, dy = P1[0] - P0[0], P1[1] - P0[1]
    t0, t1 = Fraction(1999744000, 3000000001), Fraction(2001156000, 3000000001)
    ye = P0[1] + dy * t0
    yx = P0[1] + dy * t1
    ok = (dx, dy) == (3000000001, 400003) and (float(ye), float(yx)) == (566634.5329884551, 566822.801067059)
    out.append(_row("A.10 d = (3000000001, 400003); t0 = 1999744000/3000000001, t1 = 2001156000/3000000001; entry y 566634.5329884551..., exit y 566822.801067059...", ok, "entry %.10f exit %.9f" % (ye, yx)))
    ok = ju.div_round(dy * 1999744000, 3000000001) + 300000 == 566635 and (dy * 1999744000) // 3000000001 + 300000 == 566634
    out.append(_row("A.10 divRound gives 566635 where a floorDiv gives 566634 (the K85 separation)", ok))
    return out
