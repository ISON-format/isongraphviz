"""Appendix A of design 31: extract the expected blocks from the design file by the rules X1/X2 and
compare them with this generator's output.  Never bends the output: disagreements are reported."""
import hashlib
import json
import os
import re

import core
import dl as D
import view as V
import base


def sha(b):
    return hashlib.sha256(b).hexdigest()


def read_design(path):
    b = open(path, "rb").read()
    if b"\r" in b:
        raise SystemExit("design file contains CR")
    return b.decode("utf-8").split("\n")


def block_after(lines, marker_prefix, skip=0):
    """X1: the fenced block after the line starting with marker_prefix, plus one final LF."""
    for i, l in enumerate(lines):
        if l.startswith(marker_prefix):
            j = i + 1
            n = 0
            while j < len(lines):
                if lines[j].startswith("```text"):
                    if n == skip:
                        k = j + 1
                        body = []
                        while not lines[k].startswith("```"):
                            body.append(lines[k])
                            k += 1
                        return ("\n".join(body) + "\n").encode("utf-8"), lines[i]
                    n += 1
                j += 1
    raise SystemExit("marker not found: " + marker_prefix)


def quoted(line, label=None):
    m = re.search(r"(\d+) bytes, SHA-256 `([0-9a-f]{64})`", line)
    return (int(m.group(1)), m.group(2)) if m else None


def check(design_path, outs, BASE):
    if not design_path or not os.path.exists(design_path):
        return [("Appendix A", "SKIPPED", "design file not found")]
    L = read_design(design_path)
    rows = []

    def add(item, ok, detail=""):
        rows.append((item, "REPRODUCED" if ok is True else ("DISAGREES" if ok is False else str(ok)), detail))

    def fig(item, got, want_size, want_sha):
        ok = (len(got) == want_size and sha(got) == want_sha)
        add(item, ok, "%d / %s" % (len(got), sha(got)) if ok else
            "design: %d / %s ; oracle: %d / %s" % (want_size, want_sha, len(got), sha(got)))

    # A.1
    blk, head = block_after(L, "**A.1 ")
    q = quoted(head)
    g01 = BASE["dl/G01.dl"]
    add("A.1 G01 bytes equal the A.1 block (X1)", blk == g01, "%d bytes" % len(blk) if blk == g01 else
        "block %d bytes, oracle %d bytes" % (len(blk), len(g01)))
    add("A.1 size %d and SHA-256 of the block" % q[0], len(blk) == q[0] and sha(blk) == q[1],
        "%d / %s" % (len(blk), sha(blk)) + ("" if (len(blk) == q[0] and sha(blk) == q[1]) else " ; design " + str(q)))
    # A.2
    head2 = [l for l in L if l.startswith("**A.2 Hooks**")][0]
    m = re.search(r"list is (\d+) bytes, SHA-256 `([0-9a-f]{64})`", head2)
    y03 = BASE["dl/Y03.dl"]
    fig("A.2 (row Y03) figure without a gated block", y03, int(m.group(1)), m.group(2))
    diff_blk, _ = block_after(L, "**A.2 Hooks**")
    g_lines = g01.decode().split("\n")
    y_lines = y03.decode().split("\n")
    changed = [y_lines[i] for i in range(len(g_lines)) if g_lines[i] != y_lines[i]]
    add("A.2 difference block (three lines) equals the lines of Y03 that differ from G01",
        ("\n".join(changed) + "\n").encode() == diff_blk and len(changed) == 3)
    # A.3
    blk3, head3 = block_after(L, "**A.3 ")
    q3 = quoted(head3)
    g11 = BASE["dl/G11.dl"]
    add("A.3 G11 bytes equal the A.3 block (X1)", blk3 == g11, "%d bytes" % len(g11))
    add("A.3 size %d and SHA-256" % q3[0], len(blk3) == q3[0] and sha(blk3) == q3[1])
    # A.4
    blk4, head4 = block_after(L, "**A.4 ")
    q4 = quoted(head4)
    c01 = BASE["calls/C01.calls"]
    add("A.4 C01 stream equals the A.4 block (X1)", blk4 == c01, "%d bytes" % len(c01) if blk4 == c01 else
        "block %d, oracle %d" % (len(blk4), len(c01)))
    add("A.4 size %d and SHA-256 of C01" % q4[0], len(c01) == q4[0] and sha(c01) == q4[1])
    m = re.search(r"row `C02`, is (\d+) bytes, SHA-256 `([0-9a-f]{64})`", head4)
    fig("A.4 C02 stream (figure without a gated block)", BASE["calls/C02.calls"], int(m.group(1)), m.group(2))
    # A.6
    blk6, head6 = block_after(L, "**A.6 ")
    q6 = quoted(head6)
    p01 = BASE["pick/P01.pick"]
    add("A.6 P01 pick buffer equals the block (X1)", blk6 == p01, "%d bytes" % len(p01))
    add("A.6 P01 size %d and SHA-256" % q6[0], len(p01) == q6[0] and sha(p01) == q6[1])
    # bounds block: the second text block after the A.6 heading
    blkb, _ = block_after(L, "**A.6 ", skip=1)
    headb = [l for l in L if l.startswith("`serializeBounds` of `G01`")][0]
    qb = quoted(headb)
    b01 = BASE["bounds/B01.bounds"]
    add("A.6 bounds block equals B01 (X1)", blkb == b01, "%d bytes" % len(b01))
    add("A.6 bounds size %d and SHA-256" % qb[0], len(b01) == qb[0] and sha(b01) == qb[1])
    # loop polyline of the first loop of G11 (17 points) and the picks of A.6
    loop_line = [l for l in L if l.startswith("The first loop of `G11`")][0]
    m = re.search(r"17-point polyline `\[([0-9,\-]+)\]`", loop_line)
    want_poly = [int(x) for x in m.group(1).split(",")]
    p03 = BASE["pick/P03.pick"].decode().split("\n")
    got_poly = json.loads(p03[1 + 2 + 0 + 0 + 0 + 0 + 0 + 0]) if False else None
    for ln in p03:
        if ln.startswith('["pe",3,'):
            got_poly = json.loads(ln)[2:]
    add("A.6 first loop of G11: the 17-point polyline equals P03's line of pid 3", got_poly == want_poly)
    # the pick numbers
    mdl = base.model_of("../oracles/o1-basic.scene.json", "../oracles-igl/layouts/F01.layout.json")
    st = core.initial_state(mdl, 900, 600)
    ph = V.pick_drawn(mdl, st, {"x": 500.0, "y": 308.0})
    pn = V.pick_drawn(mdl, st, {"x": 500.0, "y": 300.0})
    add("A.6 pick (500,308) -> the KNOWS edge; (500,300) -> none",
        ph == {"edge": mdl["edges"][0]["ref"]} and pn is None, "")
    d1 = V.pick_drawn(mdl, st, {"x": -2 ** -11, "y": 300.0})
    d2 = V.pick_drawn(mdl, st, {"x": -2 ** -10, "y": 300.0})
    add("A.6 quantizePx(-2^-11 * 1000) = 0 (inside) and quantizePx(-2^-10 * 1000) = -1 (outside)",
        core.quantize_px(-2 ** -11 * 1000) == 0 and core.quantize_px(-2 ** -10 * 1000) == -1)
    ml = base.model_of("../oracles-svg/scenes/loops2.scene.json", "../oracles-svg/layouts/loops2.layout.json")
    sl = core.initial_state(ml, 900, 600)
    a1 = V.pick_drawn(ml, sl, {"x": 32.1, "y": 275.0})
    a2 = V.pick_drawn(ml, sl, {"x": 32.1, "y": 266.0})
    a3 = V.pick_drawn(ml, sl, {"x": 32.1, "y": 280.0})
    h5 = core.hit_test(ml, sl, {"x": 32.1, "y": 275.0})
    e = lambda i: {"edge": ml["edges"][i]["ref"]}
    add("A.6 loops: (32.1,275.0) -> loop pid 3 with hitTest none; (32.1,266.0) -> pid 4; (32.1,280.0) -> pid 3",
        a1 == e(0) and a2 == e(1) and a3 == e(0) and h5 is None)
    # A.7
    blk7, head7 = block_after(L, "**A.7 ")
    q7 = quoted(head7)
    r01 = BASE["xr/R01.xr.json"]
    add("A.7 R01 readout equals the block (X1)", blk7 == r01, "%d bytes" % len(r01) if blk7 == r01 else
        "block %d, oracle %d" % (len(blk7), len(r01)))
    add("A.7 size %d and SHA-256" % q7[0], len(r01) == q7[0] and sha(r01) == q7[1])
    add("A.7 the same bytes from the SVG scrape (R12) and from the stream (R16)",
        BASE["xr/R12.xr.json"] == r01 and BASE["xr/R16.xr.json"] == r01)
    # A.5 relation (gl item): the table and T lines equal the list's lines
    blk5, head5 = block_after(L, "**A.5 ")
    pl = blk5.decode().split("\n")[1:-1]
    gl = g01.decode().split("\n")
    want = [l for l in gl if l.startswith('["n"') or l.startswith('["e"') or l.startswith('["T"')]
    add("A.5 (gl: item) the element-table and text lines of the printed plan prefix equal the n, e, T lines of G01",
        pl == want, "plan assembly itself is an oracles-gl matter")
    add("A.8 (gl: item)", "not applicable", "shader digests: oracles-gl")
    add("A.10 (gl: item)", "not applicable", "plan guard rule: oracles-gl")
    add("A.5.1-A.5.3 (gl: items)", "not applicable", "executor logs: oracles-gl")
    # A.9
    def size(rid):
        return len(BASE["dl/%s.dl" % rid])
    a9 = {"O01": 548, "O02": 605, "O03": 637, "O04": 605, "X09": 605, "O05": 548, "Y07": 319}
    ok9 = all(size(k) == v for k, v in a9.items())
    add("A.9 option sizes labels:false 548, edgeLabels:false 605, 9 -> 637, 8 -> 605, 4 -> 605, 0 -> 548, Y07 319",
        ok9, ", ".join("%s=%d" % (k, size(k)) for k in a9))
    add("A.9 F01 (maxBytes 637) accepted and equals G01; F02 (636) RESOURCE_LIMIT/BYTES_LIMIT",
        BASE.get("dl/F01.dl") == g01 and outs["F02"].error == "RESOURCE_LIMIT/BYTES_LIMIT")
    # A.11
    z = {k: json.loads(BASE["json/%s.json" % k].decode()) for k in ("Z01", "Z02", "Z03", "Z04")}
    okz = (z["Z01"] == {"bh": 800, "bw": 1200, "e": 1333} and z["Z02"] == {"bh": 100, "bw": 16384, "e": 1000} and
           z["Z03"] == {"bh": 8192, "bw": 8192, "e": 500} and z["Z04"] == {"bh": 4096, "bw": 4096, "e": 250})
    add("A.11 device sizes Z01-Z04", okz)
    return rows


def outs_ok(x):
    return True
