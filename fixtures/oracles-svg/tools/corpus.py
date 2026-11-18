"""Corpus driver: builds every file of fixtures/oracles-svg, self-checks, mutant matrix, Appendix A gate.

    python tools/svg.py                    # regenerate the whole corpus in place
    python tools/svg.py --out DIR          # regenerate into DIR (for the byte-identity proof)
    python tools/svg.py --mutant K08       # run one mutant; report which rows change
    python tools/svg.py --check-appendix   # print the Appendix A reproduction table only
"""
import sys, os, re, json, hashlib, shutil, time, math
import xml.etree.ElementTree as ET
import svg
import rows as R
import verify as V
from svg import IgrError, sha256_hex, cjb

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
def _find_design():
    base = os.path.normpath(os.path.join(ROOT, "..", "..", "docs"))
    for dp, dn, fn in os.walk(base):
        if "30-SVG-RENDERER-DESIGN.md" in fn:
            return os.path.join(dp, "30-SVG-RENDERER-DESIGN.md")
    return os.path.join(base, "30-SVG-RENDERER-DESIGN.md")


DESIGN = _find_design()

FAMILY_ORDER = "GNXYOFTUDK"
TAB = chr(9)
LF = chr(10)
GENERATED_DIRS = ["svg", "states", "scenes", "layouts", "inputs", "json", "bad", "scripts", "generated"]
GENERATED_FILES = ["EXPECT.tsv", "SHA256SUMS", "MUTANTS.tsv", "APPENDIX-A.tsv", "README.md", "AMBIGUITIES.md"]

KILLERS = {}
for line in """K01 N01,N02,N03
K02 G01
K03 N02
K04 N01,N02
K05 N01
K06 G09,G10
K07 G01,Y13
K08 G01
K09 N03
K10 N03
K11 N03
K12 N15
K13 N15
K14 N15
K15 N04
K16 N06
K17 N04,N14
K18 N07
K19 G02
K20 G01
K21 N08
K22 G02
K23 N09,G05
K24 G05,N09
K25 N10
K26 N09
K27 N09
K28 N08
K29 X02,X12
K30 X12
K31 X02
K32 X10
K33 X10
K34 X10
K35 X10
K36 X10
K37 X11
K38 X11
K39 X03
K40 X03
K41 G07,X08
K42 X07
K43 X01,T01
K44 X01
K45 X06,X15
K46 X01
K47 X01
K48 O11,O12,O14,O21
K49 O04
K50 G01
K51 Y07,Y08
K52 Y07
K53 Y04,Y05,Y10
K54 Y01,Y02,Y04
K55 Y02,Y06,Y16
K56 Y06,Y16
K57 Y07
K58 G03,G04
K59 X13
K60 Y17
K61 X08
K62 Y09,G04
K63 G01
K64 O06
K65 O09
K66 G01
K67 O01
K68 F01
K69 F05
K70 O10
K71 O19
K72 Y14,Y15
K73 O05
K74 G01
K75 G01
K76 G08,G09
K77 Y13
K78 G01
K79 T03
K80 T03
K81 T28
K82 T04
K83 T05,T06
K84 T07,T08
K85 T29
K86 T19
K87 T20
K88 T21
K89 T22
K90 T23
K91 T11
K92 T12
K93 T24
K94 T25
K95 T26
K96 T30
K97 T27
K98 T02
K99 T18
K100 T02,T15,T16
K101 U11
K102 U04
K103 U03
K104 U01
K105 U05
K106 U06,U12
K107 U13
K108 U07
K109 N15
K110 N15
K111 N15
K112 T31,T02,T15,T16
K113 T32
K114 F02""".split("\n"):
    k, v = line.split()
    KILLERS[k] = v.split(",")
assert len(KILLERS) == 114

MUT_TEXT = {
    "K01": "coordinates via double toFixed(3)", "K02": "trailing zeros kept", "K03": "-0 printed for tiny negatives",
    "K04": "fmt truncates toward zero", "K05": "fmt tie rounds half down", "K06": "X uses w/2 with integer division",
    "K07": "centre sign wrong in X", "K08": "trim 11 px", "K09": "trim nearest-integer root (V1)",
    "K10": "trim floorDiv (V2)", "K11": "trim in doubles (V3)", "K12": "straight anchor floorDiv (V4)",
    "K13": "parallel anchor floorDiv (V5)", "K14": "control point floorDiv (V6)", "K15": "degenerate test <",
    "K16": "degenerate by float length", "K17": "degenerate trimmed anyway", "K18": "coincident nodes NaN",
    "K19": "marker on undirected", "K20": "no marker on directed", "K21": "loop rank global",
    "K22": "loop marker on undirected", "K23": "parallel offset sign by edge direction", "K24": "grouping by ordered pair",
    "K25": "group counts hidden members", "K26": "PAR_STEP 15", "K27": "curve trimmed along chord",
    "K28": "wrong loop label anchor", "K29": "unescaped < and & in TEXT", "K30": "> not escaped in TEXT",
    "K31": "quote not escaped in aria-label", "K32": "TAB/LF/CR raw in attribute", "K33": "LF raw in TEXT",
    "K34": "CR raw in TEXT", "K35": "drawn text keeps TAB/LF", "K36": "TAB written &#9; in TEXT",
    "K37": "XML-illegal scalar kept", "K38": "XML-illegal scalar deleted", "K39": "truncation splits a pair",
    "K40": "truncation at 25", "K41": "names trimmed", "K42": "name NFC-normalized", "K43": "id from array index",
    "K44": "id JSON with spaces", "K45": "id hex of UTF-16", "K46": "id hex uppercase", "K47": "id tag dropped",
    "K48": "idPrefix not validated", "K49": "prefix not applied to url()/aria refs", "K50": "edges before nodes",
    "K51": "hidden element emitted", "K52": "hide does not cascade", "K53": "two tabindex 0",
    "K54": "ring/halo missing", "K55": "ring/halo order wrong", "K56": "class order wrong", "K57": "status hidden count explicit only",
    "K58": "summary always plural", "K59": "category class mod 8", "K60": "category class over visible nodes only",
    "K61": "empty text emitted", "K62": "defs dropped without visible edges", "K63": "pick path carries marker",
    "K64": "label budget boundary exclusive", "K65": "label budget not monotone", "K66": "edgeLabels default false",
    "K67": "style:false ignored", "K68": "maxSvgBytes boundary exclusive (output of exactly the limit refused)", "K69": "writer streams then checks",
    "K70": "unknown option ignored", "K71": "options array accepted", "K72": "state not validated",
    "K73": "declaration without LF", "K74": "final LF missing", "K75": "root attribute order changed",
    "K76": "viewBox from layout bounds", "K77": "off-screen elements dropped", "K78": "artifact attr carries scene hash",
    "K79": "decode accepts non-canonical", "K80": "decode accepts kind a", "K81": "decode has no bound",
    "K82": "reader accepts script", "K83": "reader accepts event attr/href", "K84": "reader accepts CRLF/indent",
    "K85": "reader accepts multi-line element", "K86": "reader skips W1 dup", "K87": "reader skips W1 decode",
    "K88": "reader skips W2", "K89": "reader skips W3", "K90": "reader skips W4", "K91": "reader skips W5",
    "K92": "reader skips W6", "K93": "reader skips W7", "K94": "reader skips W8", "K95": "reader skips W9",
    "K96": "reader skips W10", "K97": "reader has no bound", "K98": "click chain through array index",
    "K99": "pick returns hidden/stale", "K100": "pick prefers hitTest", "K101": "witness reads probe",
    "K102": "probe fidelity full while truncating", "K103": "svg() no BUSY", "K104": "svg() previous state",
    "K105": "export svg returns bytes", "K106": "manifest differs / labels.edge", "K107": "render() builds document",
    "K108": "capacity/svg label units may differ", "K109": "degenerate anchor floorDiv (V7)",
    "K110": "parallel midpoint floorDiv (V8)", "K111": "parallel Lf nearest root (V9)",
    "K112": "pick keeps edge over node", "K113": "reader skips style compare", "K114": "maxSvgBytes boundary accepts one byte more"}


def sig(files, err):
    h = hashlib.sha256()
    for p in sorted(files):
        h.update(p.encode() + b"\0" + sha256_hex(files[p]).encode() + b"\0")
    h.update(b"E:" + err.encode())
    return h.hexdigest()


def run_rows(ids, mut=frozenset()):
    """Phase 2 for the given row ids under a mutant set; returns {id: sig}."""
    old = set(svg.MUT)
    svg.MUT.clear()
    svg.MUT.update(mut)
    R.OUTS.clear()
    out = {}
    try:
        for i in ids:
            try:
                files, err = R.ensure(i)
                out[i] = sig(files, err)
            except Exception as e:      # a mutated reference may crash: that is a changed output
                out[i] = "EXC:" + type(e).__name__
    finally:
        svg.MUT.clear()
        svg.MUT.update(old)
        R.OUTS.clear()
    return out


def row_sort_key(r):
    m = re.match(r"([A-Z])(\d+)(.*)", r.id)
    return (FAMILY_ORDER.index(m.group(1)), int(m.group(2)), m.group(3))


def write_corpus(out_dir, notes_extra=None):
    svg.MUT.clear()
    R.OUTS.clear()
    files = dict(R.BASE)
    rows_out = []
    for r in sorted(R.ROWS, key=row_sort_key):
        fs, err = R.ensure(r.id) if r.run else ({}, "")
        for p, b in fs.items():
            assert p not in files or files[p] == b, f"path collision {p}"
            files[p] = b
        expected = r.hint if (fs and r.hint and not err) else ""
        if expected:
            assert expected in files, (r.id, expected)
        rows_out.append((r.id, r.id[0], r.tier, r.scene, r.layout, r.inp, expected, err))
    return files, rows_out


def self_checks(files, rows_out):
    """Section 15.9: expat parse, element counts, ids decode, aria-label == title, NUM, final LF, no empty line."""
    num = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$")
    n_docs = 0
    for p in sorted(files):
        if not (p.startswith("svg/") and p.endswith(".svg")):
            continue
        txt = files[p].decode("utf-8")
        assert txt.endswith("\n") and not txt.endswith("\n\n"), p
        assert "\r" not in txt and "\n\n" not in txt, p
        root = ET.fromstring(txt.encode("utf-8"))
        assert root.tag == "{http://www.w3.org/2000/svg}svg", p
        ro = svg.read_svg(txt)
        groups = [e for e in root.iter("{http://www.w3.org/2000/svg}g") if "igr-node" in (e.get("class") or "").split()]
        assert len(groups) == len(ro["nodes"]), p
        for g in root.iter("{http://www.w3.org/2000/svg}g"):
            lab = g.get("aria-label")
            if lab is not None:
                t = g.find("{http://www.w3.org/2000/svg}title")
                assert (t.text or "") == lab, (p, lab, t.text)
                a = svg.decode_element_id(ro["idPrefix"], g.get("id"))
                assert a is not None, (p, g.get("id"))
        for el in root.iter():
            for k in ("cx", "cy", "x", "y"):
                v = el.get(k)
                if v is not None:
                    assert num.match(v) and v != "-0", (p, k, v)
            if el.tag.endswith("path") and el.get("class") != "igr-arrow":
                for tok in re.findall(r"[-0-9.]+", el.get("d")):
                    assert num.match(tok) and tok != "-0", (p, tok)
        n_docs += 1
    return n_docs


def sums_text(files):
    lines = []
    for p in sorted(files, key=lambda s: s.encode("utf-8")):
        lines.append(f"{sha256_hex(files[p])} *{p}")
    return ("\n".join(lines) + "\n").encode("utf-8")


# ----------------------------------------------------------------------------------------
# Appendix A gate
# ----------------------------------------------------------------------------------------
def appendix_a(files):
    res = []
    try:
        doc = open(DESIGN, encoding="utf-8").read()
    except OSError:
        return [("(design document not found)", "SKIPPED", DESIGN)]
    blocks = re.findall(r"```text\n(.*?)```", doc, re.S)
    a1 = next(b for b in blocks if b.startswith("<svg xmlns="))
    g01 = files["svg/G01.svg"].decode("utf-8")
    ok = a1 == g01
    want = re.search(r"A\.1[^\n]*\*\*[^\n]*\((\d+) bytes, SHA-256 `([0-9a-f]{64})`", doc)
    res.append(("A.1 G01 bytes equal the A.1 block (extracted from the design)", "REPRODUCED" if ok else "DISAGREES", f"{len(g01.encode())} bytes"))
    res.append(("A.1 size %s and SHA-256 %s... of the block" % (want.group(1), want.group(2)[:12]),
                "REPRODUCED" if (len(g01.encode()) == int(want.group(1)) and sha256_hex(g01.encode()) == want.group(2)) else "DISAGREES",
                f"{len(g01.encode())} / {sha256_hex(g01.encode())}"))
    for item, rid in (("A.2", "Y03"), ("A.3", "Y07")):
        m = re.search(item + r"[^\n]*Whole document: (\d+) bytes, SHA-256 `([0-9a-f]{64})`", doc)
        b = files[f"svg/{rid}.svg"]
        res.append((f"{item} (row {rid}) size {m.group(1)} and SHA-256 {m.group(2)[:12]}...",
                    "REPRODUCED" if (len(b) == int(m.group(1)) and sha256_hex(b) == m.group(2)) else "DISAGREES",
                    f"{len(b)} / {sha256_hex(b)}"))
    # A.2 / A.3 tail blocks
    tails = [x for x in blocks if x.startswith('<g class="igr-nodes">')]
    t2 = files["svg/Y03.svg"].decode("utf-8")
    t3 = files["svg/Y07.svg"].decode("utf-8")
    res.append(("A.2 block from <g class=\"igr-nodes\"> on", "REPRODUCED" if t2[t2.index('<g class="igr-nodes">'):] == tails[0] else "DISAGREES", ""))
    res.append(("A.3 block from <g class=\"igr-nodes\"> on", "REPRODUCED" if t3[t3.index('<g class="igr-nodes">'):] == tails[1] else "DISAGREES", ""))
    # A.4
    n14 = files["svg/N14.svg"].decode("utf-8")
    a4 = [x for x in blocks if x.startswith('<path class="igr-line" d="M 447.904')][0]
    res.append(("A.4 degenerate edge (row N14) three lines", "REPRODUCED" if a4.strip("\n") in n14 else "DISAGREES", ""))
    # A.5
    exp5 = {"i:7": "igr-n-7b226964223a22693a37222c2274797065223a2270227d", "s:7": "igr-n-7b226964223a22733a37222c2274797065223a2270227d",
            "s:007": "igr-n-7b226964223a22733a303037222c2274797065223a2270227d", "s:-0": "igr-n-7b226964223a22733a2d30222c2274797065223a2270227d"}
    ok5 = all(svg.element_dom_id("igr", {"node": {"id": k, "type": "p"}}) == v for k, v in exp5.items()) and len(set(exp5.values())) == 4
    x01 = files["svg/X01.svg"].decode("utf-8")
    ok5 = ok5 and all(v in x01 for v in exp5.values())
    res.append(("A.5 four distinct ids (i:7, s:7, s:007, s:-0) also present in row X01", "REPRODUCED" if ok5 else "DISAGREES", ""))
    # A.6 labels
    a = "a"
    cases = [(a * 24, a * 24), (a * 25, a * 23 + "…"), (a * 22 + "\U0001F600", a * 22 + "\U0001F600"),
             (a * 23 + "\U0001F600", a * 23 + "…"), (a * 22 + "\U0001F600" + "b", a * 22 + "…")]
    ok6 = all(svg.dl(i) == o for i, o in cases)
    ok6 = ok6 and svg.TEXT('a<b&"c\'>d') == 'a&lt;b&amp;"c\'&gt;d' and svg.ATTR('a<b&"c\'>d') == 'a&lt;b&amp;&quot;c\'&gt;d'
    ok6 = ok6 and svg.ATTR("a\nb\tc\r") == "a&#10;b&#9;c&#13;" and svg.TEXT("a\nb\tc\r") == "a&#10;b\tc&#13;" and svg.dl("a\nb\tc\r") == "a b c "
    ok6 = ok6 and svg.TEXT("x\x00y￾z") == "x�y�z"
    m = R.mdl(R.O1S, R.F01)
    st = svg.initial_state(m, 900, 600)
    for lim, expect in ((9, ("full", 9, True)), (8, ("elided", None, False)), (0, ("elided", 0, False))):
        o = svg.render_svg_detailed(m, st, {"maxDrawnLabelUnits": lim})
        txts = len(re.findall(r"<text ", o["svg"]))
        if lim == 9:
            ok6 = ok6 and o["fidelity"]["labels"] == "full" and o["label_units"] == 9 and txts == 3
        elif lim == 8:
            ok6 = ok6 and o["fidelity"]["labels"] == "elided" and txts == 2 and 'class="igr-elabel"' not in o["svg"]
        else:
            ok6 = ok6 and o["fidelity"]["labels"] == "elided" and txts == 0
    res.append(("A.6 labels (dl cases, escapes, D-XML, budget 9/8/0)", "REPRODUCED" if ok6 else "DISAGREES", ""))
    # A.7
    ok7 = True
    srcb = R.rd(R.O1SRC)
    ok7 = ok7 and svg.pick_element(m, st, "igr", {"point": {"x": 32.0, "y": 193.5}}) == {"node": m.nodes[0]["ref"]}
    i1id = svg.element_dom_id("igr", {"node": m.nodes[0]["ref"]})
    ok7 = ok7 and svg.pick_element(m, st, "igr", {"targetId": i1id}) == {"node": m.nodes[0]["ref"]}
    ok7 = ok7 and svg.pick_element(m, st, "igr", {"point": {"x": 500.0, "y": 308.0}}) == {"edge": m.edges[0]["ref"]}
    ok7 = ok7 and svg.pick_element(m, st, "igr", {"point": {"x": 500.0, "y": 300.0}}) is None
    ok7 = ok7 and svg.pick_element(m, st, "igr", {"point": {"x": 867.9, "y": 406.4}}) == {"node": m.nodes[1]["ref"]}
    ok7 = ok7 and sha256_hex(srcb) == m.artifact
    res.append(("A.7 click chain numbers (points -> i:1, edge, none, s:ann; id path; source hash)", "REPRODUCED" if ok7 else "DISAGREES", ""))
    # A.8
    g02 = files["svg/G02.svg"].decode("utf-8")
    ok8 = ('d="M 860.928 399.4 C 852.928 375.4 882.928 375.4 874.928 399.4"' in g02 and
           '<text class="igr-elabel" x="867.928" y="377.4" text-anchor="middle">R</text>' in g02 and
           'd="M 43.701 196.561 L 856.299 403.439"' in g02 and "marker-end" not in g02 and "<defs>" not in g02)
    g05 = files["svg/G05.svg"].decode("utf-8")
    for dpath in ("M 48.069 172.326 Q 189.356 201.653 321.708 259.139", "M 320.965 261.481 Q 179.679 232.155 47.326 174.668",
                  "M 634.051 343.641 Q 742.786 313.185 855.692 311.353", "M 856.135 314.395 Q 747.399 344.851 634.494 346.683"):
        ok8 = ok8 and f'd="{dpath}"' in g05
    mm = R.mdl(R.MIXS, R.F04)
    ok8 = ok8 and svg.initial_state(mm, 900, 600)["viewport"] == svg.vp(450000, 300000, 1071, 900, 600)
    n11 = files["svg/N11.svg"].decode("utf-8")
    ok8 = ok8 and ('cx="45035996720.739" cy="299.466"' in n11 and 'cx="-45035995820.739" cy="300.534"' in n11 and
                   "M 45035996708.739 299.466 L -45035995808.739 300.534" in n11)
    ok8 = ok8 and svg.initial_state(R.mdl(R.O1S, R.V45), 900, 600)["viewport"] == svg.vp(4503599627667069, 134563, 10, 900, 600)
    res.append(("A.8 other forms (self-loop, mixed20 edges 7/26/1/28, extreme coordinates)", "REPRODUCED" if ok8 else "DISAGREES", ""))
    # A.9
    sizes9 = {"O05": 3232, "O01": 2207, "O02": 2965, "O03": 3118, "O04": 3193}
    ok9 = all(len(files[f"svg/{k}.svg"]) == v for k, v in sizes9.items())
    res.append(("A.9 option sizes (xmlDeclaration 3232, style:false 2207, labels:false 2965, edgeLabels:false 3118, idPrefix 3193)",
                "REPRODUCED" if ok9 else "DISAGREES", ", ".join("%s=%d" % (k, len(files[f"svg/{k}.svg"])) for k in sizes9)))
    # A.10
    hits = json.loads(files["json/T17.hits.json"].decode("ascii"))["points"]
    byl = {h["label"]: h for h in hits}
    mid = byl["chord midpoint of the pair of edges 7 and 26"]
    ok10 = (fmtpx(mid["x"]), fmtpx(mid["y"])) == ("184.517", "216.904") and mid["hit"] == {"edge": mm.edges[7]["ref"]}
    a7 = byl["apex of edge 7"]; a26 = byl["apex of edge 26"]; al = byl["apex of the self-loop of i:2"]
    ok10 = ok10 and (a7["x"], a7["y"]) == (187.122, 208.693) and (a26["x"], a26["y"]) == (181.912, 225.115)
    ok10 = ok10 and a7["hit"] is None and a26["hit"] is None and (al["x"], al["y"]) == (867.928, 381.4) and al["hit"] is None
    chain = json.loads(files["json/T15.chain.json"].decode("ascii"))
    e26 = next(e for e in chain["elements"] if e["element"] == {"edge": mm.edges[26]["ref"]})
    pos26 = chain["drawn_order"].index({"edge": mm.edges[26]["ref"]})
    cm = [c for c in e26["conflicts"] if c[2] == "m" and abs(c[0] - 184.517) < 1e-3 and abs(c[1] - 216.904) < 1e-3]
    ok10 = ok10 and len(cm) == 1 and cm[0][3] == pos26
    t31 = json.loads(files["json/T31.pick.json"].decode("ascii"))
    ok10 = ok10 and t31[0]["pick"] == {"node": m.nodes[0]["ref"]} and t31[1]["pick"] == {"node": m.nodes[1]["ref"]}
    res.append(("A.10 hit numbers (midpoint 184.517/216.904 -> edge 7; apexes; loop apex; edge 26 by id at the midpoint; T31 node wins)",
                "REPRODUCED" if ok10 else "DISAGREES",
                f"mid=({mid['x']},{mid['y']}) apex7=({a7['x']},{a7['y']}) apex26=({a26['x']},{a26['y']}) loop=({al['x']},{al['y']})"))
    return res


def fmtpx(v):
    s = "%.3f" % v
    return s.rstrip("0").rstrip(".")


# ----------------------------------------------------------------------------------------
def mutant_matrix(full=False, log=print):
    svg.MUT.clear()
    base = run_rows([r.id for r in R.ROWS if r.run])
    table = []
    for k in sorted(KILLERS, key=lambda s: int(s[1:])):
        named = KILLERS[k]
        rows_to_run = [r.id for r in R.ROWS if r.run] if full else named
        got = run_rows(rows_to_run, {k})
        changed = [i for i in rows_to_run if got[i] != base[i]]
        killed_by = [i + ("[exception]" if got[i].startswith("EXC:") else "") for i in named if i in changed]
        if killed_by:
            verdict = "KILLED"
        elif full and changed:
            verdict = "KILLED-BY-OTHER-ROWS-ONLY"
        elif full:
            verdict = "UNKILLED-BY-ANY-ROW"
        else:
            verdict = "NAMED-ROWS-DO-NOT-KILL"
        table.append((k, MUT_TEXT[k], ",".join(named), ",".join(killed_by), ",".join(i for i in named if i not in changed),
                      ",".join(i for i in changed if i not in named), verdict))
        log(k, verdict, killed_by, [i for i in changed if i not in named][:6])
    return table


def check_search_properties():
    """15.5: the printed digits of the correct implementation differ from those of every named mutation."""
    spec = {"N03": ["K09", "K10", "K11"], "N15": ["K12", "K13", "K14", "K109", "K110", "K111"]}
    for rid, ms in spec.items():
        base = run_rows([rid])[rid]
        for k in ms:
            assert run_rows([rid], {k})[rid] != base, f"{rid} does not distinguish {k}"
    print("search properties hold: N03 vs K09/K10/K11, N15 vs K12/K13/K14/K109/K110/K111")


def md_escape(s):
    return s.replace("|", "/")


def render_readme(files, rows_out, app, mtable, nfz):
    tpl = open(os.path.join(HERE, "doc", "README.tpl.md"), encoding="utf-8", newline="").read()
    amb = open(os.path.join(HERE, "doc", "AMBIGUITIES.md"), encoding="utf-8", newline="").read()
    st3 = open(os.path.join(HERE, "doc", "status_rev3.md"), encoding="utf-8", newline="").read()
    new3 = open(os.path.join(HERE, "doc", "new_rev3.md"), encoding="utf-8", newline="").read()
    mk = "## Defects (the text contradicts itself"
    assert mk in amb
    amb = amb.replace(mk, st3.lstrip(chr(10)) + mk, 1).rstrip(chr(10)) + chr(10) + new3
    namb = len(re.findall(r"^[*][*]A-[0-9]+[.]", amb, re.M))
    fam = {}
    for r in rows_out:
        f = fam.setdefault(r[1], [0, 0, 0])
        f[0] += 1
        if r[1] not in "DK":
            f[1] += 1
        if r[7]:
            f[2] += 1
    names = {"G": "golden documents", "N": "numbers and geometry", "X": "text, escaping, identities", "Y": "state hooks",
             "O": "options and validation", "F": "size limits", "T": "round trip, pick, reader", "U": "the renderer",
             "D": "differential (runtime)", "K": "mutants (empty cells)"}
    counts = "| Family | Rows | With files or inline input | With `error` |" + LF + "|---|---|---|---|" + LF
    for k in FAMILY_ORDER:
        counts += "| %s %s | %d | %d | %d |" % (k, names[k], fam[k][0], fam[k][1], fam[k][2]) + LF
    counts += "| **total** | **%d** | **%d** | **%d** |" % (len(rows_out), sum(v[1] for v in fam.values()), sum(v[2] for v in fam.values()))
    ties = "; ".join("%s: X=%d Y=%d" % (a, b, d) for a, _, b, _, d in R.NOTES["ties"])
    appx = "| Item | Result | Detail |" + LF + "|---|---|---|" + LF + LF.join("| %s | **%s** | %s |" % (md_escape(a), b, md_escape(c_)) for a, b, c_ in app)
    if mtable:
        cnt = {}
        for r in mtable:
            cnt[r[6]] = cnt.get(r[6], 0) + 1
        killed = cnt.get("KILLED", 0)
        unk = [r[0] for r in mtable if r[6] in ("UNKILLED-BY-ANY-ROW", "NAMED-ROWS-DO-NOT-KILL", "KILLED-BY-OTHER-ROWS-ONLY")]
        nonkill = [(r[0], r[4]) for r in mtable if r[4]]
        summ = ("**Result: %d of %d mutants are killed by at least one of their named killer rows; %d are killed by no row at all (%s).** "
                "%d mutants name a killer row that does not change under the mutant (design defects of the vector list, reported not repaired): %s."
                % (killed, len(mtable), len(unk), ", ".join(unk) if unk else "none", len(nonkill),
                   "; ".join("%s: %s" % (k, v) for k, v in nonkill) if nonkill else "none"))
        tbl = "| Mutant | Mutation | Named killers | Rows that change (named) | Named rows that do NOT change |" + LF + "|---|---|---|---|---|" + LF
        for r in mtable:
            tbl += "| %s | %s | %s | %s | %s |" % (r[0], md_escape(r[1]), r[2], r[3] or "none", r[4] or "") + LF
    else:
        summ, tbl = "The matrix was not run (`--no-matrix`).", ""
    ts, ta = R.NOTES["trim_search"], R.NOTES["anchor_search"]
    rep = {"NAMBIG": str(namb), "NFROZEN": str(nfz), "NSCENES": str(len(R.AUTH.items)), "NROWS": str(len(rows_out)),
           "NDATA": str(sum(v[1] for v in fam.values())), "NEMPTY": str(fam["D"][0] + fam["K"][0]),
           "NERR": str(sum(v[2] for v in fam.values())), "COUNTS": counts, "TIES": ties, "APPENDIX": appx,
           "TRIM_SEED": str(ts["seed"]), "TRIM_TRIALS": str(ts["trials"]), "TRIM_FOUND": "3",
           "ANCH_SEED": str(ta["seed"]), "ANCH_TRIALS": str(ta["trials"]), "ANCH_FOUND": "2 per variant",
           "MUT_SUMMARY": summ, "MUT_TABLE": tbl}
    for k, v in rep.items():
        tpl = tpl.replace("{{" + k + "}}", v)
    assert "{{" not in tpl, re.findall(r"[{][{][A-Z_]+[}][}]", tpl)
    return tpl.encode("utf-8"), amb.encode("utf-8")


def main(argv):
    out_dir = ROOT
    mutant = None
    do_matrix = True
    full = True
    only_appendix = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--out":
            out_dir = os.path.abspath(argv[i + 1]); i += 1
        elif a == "--mutant":
            mutant = argv[i + 1]; i += 1
        elif a == "--matrix":
            do_matrix = True
        elif a == "--full":
            full = True
        elif a == "--check-appendix":
            only_appendix = True
        elif a == "--no-matrix":
            do_matrix = False
        i += 1
    t0 = time.time()
    R.build_all()
    if mutant:
        ids = [r.id for r in R.ROWS if r.run]
        svg.MUT.clear()
        base = run_rows(ids)
        got = run_rows(ids, {mutant})
        changed = [i for i in ids if got[i] != base[i]]
        print(f"mutant {mutant}: named killers {KILLERS.get(mutant)}; rows changed: {changed}")
        return 0
    files, rows_out = write_corpus(out_dir)
    n_docs = self_checks(files, rows_out)
    for name, (sb, lb) in sorted(R.AUTH.items.items()):
        V.verify_scene_lite(sb)
        V.verify_layout_lite(lb, sb)
    sums = V.verify_frozen(ROOT)
    used = set()
    for r_ in R.ROWS:
        for p_ in (r_.scene, r_.layout):
            if p_:
                used.add(p_)
    used |= {R.O1SRC, R.MIXSRC, "../oracles/o4-undirected.source.ison"}
    nfz, badfz = V.check_frozen_use(ROOT, used, sums)
    assert not badfz, badfz
    print(f"authored scenes verified (lite): {len(R.AUTH.items)}; frozen files checked against their SHA256SUMS: {nfz}")
    check_search_properties()
    gen_id = R.t28_long_id()
    gen_tsv = ("id"+TAB+"role"+TAB+"path"+TAB+"bytes"+TAB+"sha256"+LF + "T28"+TAB+"id"+TAB+"generated/T28.id.txt"+TAB+str(len(gen_id))+TAB+sha256_hex(gen_id.encode("ascii"))+LF).encode("utf-8")
    files["generated/GENERATED.tsv"] = gen_tsv
    app = appendix_a(files)
    for a in app:
        print("%-12s %s" % (a[1], a[0]))
    if only_appendix:
        return 0
    extra = {}
    mtable = None
    mpath = os.path.join(HERE, "mutants.cache.json")
    if do_matrix:
        mtable = mutant_matrix(full=full, log=lambda *a: print(*a, flush=True))
    extra["matrix"] = mtable
    # --- write
    os.makedirs(out_dir, exist_ok=True)
    for d in GENERATED_DIRS:
        shutil.rmtree(os.path.join(out_dir, d), ignore_errors=True)
    for f in GENERATED_FILES:
        try:
            os.remove(os.path.join(out_dir, f))
        except OSError:
            pass
    for p, b in files.items():
        full_p = os.path.join(out_dir, p)
        os.makedirs(os.path.dirname(full_p), exist_ok=True)
        with open(full_p, "wb") as fh:
            fh.write(b)
    hdr = "id\tgroup\ttier\tscene\tlayout\tinput\texpected\terror\n"
    body = "".join("\t".join(r) + "\n" for r in rows_out)
    expect = (hdr + body).encode("utf-8")
    files["EXPECT.tsv"] = expect
    with open(os.path.join(out_dir, "EXPECT.tsv"), "wb") as fh:
        fh.write(expect)
    with open(os.path.join(out_dir, "APPENDIX-A.tsv"), "wb") as fh:
        t = "item\tstatus\tdetail\n" + "".join("%s\t%s\t%s\n" % a for a in app)
        fh.write(t.encode("utf-8"))
    files["APPENDIX-A.tsv"] = t.encode("utf-8")
    if mtable is not None:
        t = "mutant\tdescription\tnamed_killers\tkilling_rows\tnamed_not_killing\tother_changed_rows\tverdict\n" + "".join("\t".join(r) + "\n" for r in mtable)
        with open(os.path.join(out_dir, "MUTANTS.tsv"), "wb") as fh:
            fh.write(t.encode("utf-8"))
        files["MUTANTS.tsv"] = t.encode("utf-8")
    rd_, am_ = render_readme(files, rows_out, app, mtable, nfz)
    for name, data in (("README.md", rd_), ("AMBIGUITIES.md", am_)):
        with open(os.path.join(out_dir, name), "wb") as fh:
            fh.write(data)
        files[name] = data
    sums = sums_text(files)
    with open(os.path.join(out_dir, "SHA256SUMS"), "wb") as fh:
        fh.write(sums)
    print(f"documents self-checked: {n_docs}; rows: {len(rows_out)}; files: {len(files)}; SHA256SUMS sha256 {sha256_hex(sums)}; {time.time() - t0:.1f}s")
    return 0
