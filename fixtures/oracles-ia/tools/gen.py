"""Driver: build every row, write the corpus, self-checks, Appendix A gate, mutant matrix, SHA256SUMS.

usage: python tools/gen.py            regenerate everything under fixtures/oracles-ia (except tools/, README.md, AMBIGUITIES.md)
       python tools/gen.py --mutant K05   print which killer rows change under one mutant
"""
import copy
import os
import re
import shutil
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import base
from base import *  # noqa
import corpus as C
from corpus import ROOT, AUX, ROWS
OUT = ROOT
import rows_a
import rows_b
import appendix_a
import machine
import companion
import export as EX

FAMILIES = "EIVLBCPQGXMHDK"
GEN_DIRS = ["scenes", "layouts", "states", "scripts", "transcripts", "inputs", "trees", "plans", "logs", "gates", "json",
            "manifests", "png", "data", "headless", "generated"]
GEN_FILES = ["EXPECT.tsv", "SHA256SUMS", "MUTANTS.tsv", "APPENDIX-A.tsv", "PARITY.tsv"]


def idkey(i):
    m = re.match(r"^([A-Z])(\d+)([a-z]*)$", i)
    return (FAMILIES.index(m.group(1)), int(m.group(2)), m.group(3))


def build_all():
    base.MUT.clear()
    C.AUX.clear()
    C.ROWS.clear()
    rows_b.GEN.clear()
    C.init_scenes()
    rows_a.build_E()
    rows_a.build_IVL()
    rows_a.build_B()
    rows_b.build_C()
    rows_b.build_PQ()
    rows_b.build_G()
    rows_b.build_X()
    rows_b.build_M()
    rows_b.build_H()
    rows_b.build_DK()


def baseline():
    """evaluate every row once with no mutant; returns id -> (files, err)"""
    base.MUT.clear()
    res = {}
    for rid in sorted(ROWS, key=idkey):
        res[rid] = ROWS[rid].evaluate()
    return res


def evaluate_safe(row):
    try:
        return row.evaluate()
    except IaErr as e:
        return ({}, str(e))
    except Exception as e:
        return ("CRASH", type(e).__name__)


def tsv_cell(s):
    assert "\t" not in s and "\n" not in s, s
    return s


def write_corpus(res):
    # wipe
    for d in GEN_DIRS:
        shutil.rmtree(os.path.join(OUT, d), ignore_errors=True)
    for f in GEN_FILES:
        p = os.path.join(OUT, f)
        if os.path.exists(p):
            os.remove(p)
    files = {}

    def put(path, data):
        assert not path.startswith("/") and ".." not in path.split("/"), path
        if path in files and files[path] != data:
            raise AssertionError("conflicting file " + path)
        files[path] = data
    for p, b in AUX.items():
        put(p, b)
    for rid, (fl, err) in res.items():
        row = ROWS[rid]
        for p, b in fl.items():
            put(p, b)
        if row.expected:
            assert row.expected in fl, (rid, row.expected)
        assert (row.error or "") == err, (rid, row.error, err)
    # generated vectors file
    lines = ["id\trole\tpath\tbytes\tsha256"] + ["%s\t%s\t%s\t%d\t%s" % g for g in rows_b.GEN]
    put("generated/GENERATED.tsv", ("\n".join(lines) + "\n").encode())
    put("generated/README.txt", ("X24: the manifest input is generated, not stored: 1048577 bytes, each byte 0x41 ('A'), one more than the\n"
                                 "1,048,576-byte manifest limit; the row asserts RESOURCE_LIMIT/BYTES_LIMIT.\n").encode())
    for p, b in files.items():
        full = os.path.join(OUT, *p.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(b)
    # EXPECT.tsv
    out = ["id\tgroup\ttier\tscene\tlayout\tinput\texpected\terror"]
    for rid in sorted(ROWS, key=idkey):
        r = ROWS[rid]
        out.append("\t".join(tsv_cell(x) for x in (r.id, r.group, r.tier, r.scene, r.layout, r.input, r.expected, r.error)))
    with open(os.path.join(OUT, "EXPECT.tsv"), "wb") as f:
        f.write(("\n".join(out) + "\n").encode("utf-8"))
    return files


# ---------------------------------------------------------------- self checks (15.9)
def self_checks(res, files):
    problems = []
    # every tree file re-serializes to itself and its items equal buildAccessibleModel items
    for p, b in files.items():
        if p.startswith("trees/"):
            t = json.loads(b.decode())
            if cjb(t) != b:
                problems.append("tree not canonical: " + p)
    # state files canonical
    for p, b in files.items():
        if p.startswith("states/"):
            if cjb(json.loads(b.decode())) != b:
                problems.append("state not canonical: " + p)
    # no path leaves the corpus
    for rid, row in ROWS.items():
        for c in (row.scene, row.layout, row.input, row.expected):
            if c and not c.startswith(("{", "[")) and (c.startswith("/") or ".." in c.split("/")):
                problems.append("path leaves corpus: %s %s" % (rid, c))
    # exist
    for rid, row in ROWS.items():
        for c in (row.scene, row.layout, row.expected):
            if c and c not in files and not os.path.exists(os.path.join(OUT, c)):
                problems.append("missing file " + c)
        if row.input and not row.input.startswith(("{", "[")) and row.input not in files:
            if row.id != "X24":
                problems.append("missing input " + row.input)
    # light checker over the authored scenes, layouts and states
    import lite
    by_scene = {}
    for nm, sc in C.SC.items():
        problems += ["scene %s: %s" % (nm, e) for e in lite.check_scene(sc.scene)]
        problems += ["layout %s: %s" % (nm, e) for e in lite.check_layout(sc.layout, sc.scene)]
        by_scene[(sc.model.scene_sha, sc.model.layout_sha)] = sc.model
    problems += ["layout O1.alt: %s" % e for e in lite.check_layout(AUX["layouts/O1.alt.layout.json"], C.SC["O1"].scene)]
    for p, b in files.items():
        if p.startswith("states/"):
            sj = json.loads(b.decode())
            problems += ["state %s: %s" % (p, e) for e in lite.check_state(by_scene[(sj["scene_sha256"], sj["layout_sha256"])], b)]
    # invariant I-C1 and executor guards for every P row that has a plan
    for rid, row in ROWS.items():
        if row.group == "P" and row.expected and rid != "P11":
            inp = json.loads(row.input)
            nxt = json.loads(files[inp["next"]].decode())
            prev = json.loads(files[inp["prev"]].decode()) if inp["prev"] else None
            d = companion.SimDom()
            es = companion.ExecState(d)
            if prev is not None:
                companion.execute_plan(d, companion.full_build(prev), es)
            companion.execute_plan(d, companion.parse_lines(files[row.expected]), es)
            d2, _ = companion.sim_build(nxt)
            if companion.dom_dump(d.host) != companion.dom_dump(d2.host):
                problems.append("I-C1 violated by " + rid)
    for bad in ([["a", "@host", "id", "x"]], [["c", "k", "div"], ["c", "k", "div"]], [["a", "zz", "id", "x"]],
                [["c", "k", "div"], ["a", "k", "style", "x"]], [["r", "@host"]]):
        d = companion.SimDom()
        try:
            companion.execute_plan(d, bad, companion.ExecState(d))
            problems.append("executor guard missing for %r" % (bad,))
        except IaErr:
            pass
    # I-C1 for P rows through P11 already holds? read P11 result
    inv = json.loads(res["P11"][0]["json/P11.invariant.json"].decode())
    if not all(x["equal"] for x in inv):
        problems.append("I-C1 violated")
    return problems


def tree_items_check(res, files):
    """items of every companion tree equal an independent buildAccessibleModel (name, description, order) for the C rows"""
    problems = []
    for rid, row in ROWS.items():
        if row.group != "C":
            continue
        inp = json.loads(row.input)
        scname = [k for k, s in C.SC.items() if s.scene_path == row.scene][0]
        m = C.SC[scname].model
        st = json.loads(files[inp["state"]].decode()) if inp["state"] != "initial" else mk_state(m)
        tr = traversal(m, st)
        t = json.loads(files[row.expected].decode())
        for it in t["items"]:
            el = tr[it["position"] - 1]
            if it["name"] != el_name(m, el):
                problems.append("%s item name" % rid)
            if el[0] == "e" and it.get("description") != edge_desc(m, el[1]):
                problems.append("%s item desc" % rid)
    return problems


# ---------------------------------------------------------------- appendix gate
def appendix_report(res, files):
    text = appendix_a.load_design()
    blocks = appendix_a.extract_blocks(text)
    figs = appendix_a.figures(text)
    rows = []

    def get(rid, path):
        return res[rid][0][path]
    mapping = [
        ("A.1 C01", lambda: get("C01", "trees/C01.tree.json")),
        ("A.3 B12", lambda: get("B12", "json/B12.bindings.json")),
        ("A.4 I50 events", lambda: AUX["inputs/I50.events.json"]),
        ("A.4 I50 result", lambda: get("I50", "transcripts/I50.result.json")),
        ("A.5 V22", lambda: get("V22", "transcripts/V22.result.json")),
        ("A.6 G01", lambda: get("G01", "gates/G01.gate.json")),
        ("A.7 P02", lambda: get("P02", "plans/P02.plan.txt")),
        ("A.8 fixture", lambda: AUX["png/fixture.png"]),
        ("A.8 X04", lambda: get("X04", "png/X04.png")),
        ("A.9 X03", lambda: get("X03", "json/X03.manifest.json")),
        ("A.11 B01", lambda: get("B01", "json/B01.tokens.json")),
        ("A.14 V30", lambda: get("V30", "transcripts/V30.result.json")),
    ]
    assert len(blocks) == len(mapping), (len(blocks), len(mapping))
    for blk, (label, fn) in zip(blocks, mapping):
        mine = fn()
        ok_sha = sha(mine) == blk["sha"] and len(mine) == blk["size"]
        ok_bytes = mine == blk["data"]
        st = "REPRODUCED" if (ok_sha and ok_bytes) else "DISAGREES"
        rows.append((label, blk["kind"], "block", blk["size"], blk["sha"], len(mine), sha(mine), st))

    def fig(label, name, mine, lines=None):
        f = figs[name]
        ok = len(mine) == f["bytes"] and ("sha" not in f or sha(mine) == f["sha"])
        if lines is not None and "lines" in f:
            ok = ok and mine.count(b"\n") == f["lines"]
        rows.append((label, "figure", "no block", f["bytes"], f.get("sha", ""), len(mine), sha(mine), "REPRODUCED" if ok else "DISAGREES"))
    fig("A.2 C02", "A.2 C02", get("C02", "trees/C02.tree.json"))
    fig("A.7 P01", "A.7 P01", get("P01", "plans/P01.plan.txt"), 1)
    for r in ("P04", "P07", "P08", "P09"):
        fig("A.7 " + r, "A.7 " + r, get(r, "plans/%s.plan.txt" % r), 1)
    for r in ("Q01", "Q02", "Q03", "Q04"):
        fig("A.7 " + r, "A.7 " + r, get(r, "logs/%s.log.txt" % r), 1)
    # crc
    import zlib
    bound = get("X04", "png/X04.png")
    crc = "%08x" % (zlib.crc32(b"tEXt" + bound[41:41 + 218]) & 0xFFFFFFFF)
    rows.append(("A.8 crc", "figure", "no block", 0, figs["A.8 crc"]["crc"], 0, crc, "REPRODUCED" if crc == figs["A.8 crc"]["crc"] else "DISAGREES"))
    fig("A.9 state", "A.9 state", AUX["states/O1.initial.state.json"])
    fig("A.9 svg", "A.9 svg", AUX["data/O1.decl.svg"])
    fig("A.9 X02", "A.9 X02", get("X02", "json/X02.manifest.json"))
    fig("A.9 X01", "A.9 X01", get("X01", "json/X01.manifest.json"))
    fig("A.10 state", "A.10 state", get("H01", "headless/H01.bin"))
    fig("A.10 svg", "A.10 svg", get("H02", "headless/H02.bin"))
    h04 = get("H04", "headless/H04.bin")
    rows.append(("A.10 tree = A.1", "figure", "no block", len(blocks[0]["data"]), blocks[0]["sha"], len(h04), sha(h04),
                 "REPRODUCED" if h04 == blocks[0]["data"] else "DISAGREES"))
    for r, nm in (("C05", "A.13 C05"), ("C07", "A.13 C07")):
        b = get(r, "trees/%s.tree.json" % r)
        rows.append((nm, "figure", "sizes only", figs[nm]["bytes"], "", len(b), sha(b), "REPRODUCED" if len(b) == figs[nm]["bytes"] else "DISAGREES"))
    return rows


# ---------------------------------------------------------------- mutants
def parse_ktable(text):
    tab = {}
    i = text.index("| Id | Mutation | Killed by |")
    for ln in text[i:].split("\n")[2:]:
        if not ln.startswith("| K"):
            break
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        killers = re.findall(r"`([A-Z]\d+[a-z]?)`", cells[2])
        tab[cells[0]] = (cells[1], killers)
    return tab


def mutant_matrix(res, files):
    text = appendix_a.load_design()
    tab = parse_ktable(text)
    out = []
    for k in sorted(tab, key=lambda s: int(s[1:])):
        desc, killers = tab[k]
        if k == "K84":
            out.append((k, "not-applicable", ",".join(killers), "", desc))
            continue
        base.MUT.clear()
        base.MUT.add(k)
        killed_by = []
        crashed = []
        for rid in killers:
            r = evaluate_safe(ROWS[rid])
            if r[0] == "CRASH":
                crashed.append(rid)
                continue
            if r != res[rid]:
                killed_by.append(rid)
        verdict = "KILLED" if killed_by else None
        extra = ""
        if verdict is None:
            # does any row in the corpus kill it?
            others = []
            for rid in sorted(ROWS, key=idkey):
                if ROWS[rid].group in "DK" or rid in killers:
                    continue
                r = evaluate_safe(ROWS[rid])
                if r[0] != "CRASH" and r != res[rid]:
                    others.append(rid)
                    if len(others) >= 4:
                        break
            if others:
                verdict = "row-does-not-kill"
                extra = "killed by " + ",".join(others)
            else:
                verdict = "unkillable"
        out.append((k, verdict, ",".join(killers), ",".join(killed_by) + (("; crash on " + ",".join(crashed)) if crashed else "") + (extra and ("; " + extra)), desc))
    base.MUT.clear()
    return out


def write_tsv(name, header, rows):
    lines = ["\t".join(header)] + ["\t".join(tsv_cell(str(c)) for c in r) for r in rows]
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(("\n".join(lines) + "\n").encode("utf-8"))


def write_sums():
    ents = []
    for dp, dn, fn in os.walk(OUT):
        rel_dir = os.path.relpath(dp, OUT).replace(os.sep, "/")
        if rel_dir == "tools" or rel_dir.startswith("tools/"):
            continue
        for f in fn:
            rel = f if rel_dir == "." else rel_dir + "/" + f
            if rel == "SHA256SUMS":
                continue
            with open(os.path.join(dp, f), "rb") as fh:
                ents.append((rel, sha(fh.read())))
    ents.sort(key=lambda e: e[0].encode("utf-8"))
    with open(os.path.join(OUT, "SHA256SUMS"), "wb") as f:
        f.write("".join("%s *%s\n" % (h, p) for p, h in ents).encode("utf-8"))
    return len(ents)


def main(argv):
    global OUT
    if "--out" in argv:
        OUT = os.path.abspath(argv[argv.index("--out") + 1])
        os.makedirs(OUT, exist_ok=True)
        if OUT != ROOT:
            shutil.copyfile(os.path.join(ROOT, "AMBIGUITIES.md"), os.path.join(OUT, "AMBIGUITIES.md"))
    build_all()
    res = baseline()
    if len(argv) >= 3 and argv[1] == "--mutant":
        k = argv[2]
        tab = parse_ktable(appendix_a.load_design())
        base.MUT.add(k)
        for rid in tab[k][1]:
            r = evaluate_safe(ROWS[rid])
            print(rid, "DIFFERS" if r != res[rid] else "same")
        return 0
    files = write_corpus(res)
    probs = self_checks(res, files) + tree_items_check(res, files)
    if probs:
        print("SELF-CHECK PROBLEMS:", probs)
        return 1
    rep = appendix_report(res, files)
    write_tsv("APPENDIX-A.tsv", ["item", "kind", "source", "quoted_bytes", "quoted_sha256", "mine_bytes", "mine_sha256", "status"], rep)
    bad = [r for r in rep if r[-1] != "REPRODUCED"]
    mm = mutant_matrix(res, files)
    write_tsv("MUTANTS.tsv", ["id", "verdict", "named_killers", "killed_by", "mutation"], mm)
    # parity (read-only comparison with oracles-svg / oracles-dl)
    prow = []
    try:
        import parity
        prow = parity.run(ROOT, AUX, C.SC)
        write_tsv("PARITY.tsv", ["row", "this_corpus_file", "this_sha256", "other_corpus_file", "other_sha256", "status"], prow)
    except ImportError:
        pass
    import readme
    with open(os.path.join(OUT, "README.md"), "wb") as f:
        f.write(readme.render(ROWS, rep, mm, prow).encode("utf-8"))
    if not os.path.exists(os.path.join(OUT, "AMBIGUITIES.md")):
        print("AMBIGUITIES.md missing")
        return 1
    n = write_sums()
    print("rows:", len(ROWS), "files:", n)
    from collections import Counter
    print("by family:", dict(Counter(r.group for r in ROWS.values())))
    print("appendix:", Counter(r[-1] for r in rep))
    print("mutants:", Counter(r[1] for r in mm))
    for r in bad:
        print("APPENDIX DISAGREES:", r)
    for r in mm:
        if r[1] not in ("KILLED",):
            print("MUTANT", r)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
