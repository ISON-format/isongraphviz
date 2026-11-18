"""Driver of the oracles-dl generator.

    python tools/gen.py                 # regenerate every generated file in place (about minutes: includes the matrix)
    python tools/gen.py --out DIR       # the same into DIR (byte-identity proof)
    python tools/gen.py --no-matrix     # skip the mutant matrix
    python tools/gen.py --mutant K08    # run one mutant over every row and list the rows that change
    python tools/gen.py --check-appendix
Standard library only; no clock, no randomness (seeded LCG searches); deterministic output.
"""
import hashlib
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import core
import dl as D
import view as V
import sim as SIM
import scenes
import base
from base import Out, run_row, model_of, fs, fs_json
import rows_a
import rows_b
import rows_c
import appendix_a
from ktable import KROWS

ALLK = KROWS

FAMILIES = "GNXYOFSPBCZRUDK"
import glob
_cand = glob.glob(os.path.join(base.CORPUS_DIR, "..", "..", "docs", "*", "31-CANVAS-WEBGL-DESIGN.md"))
DESIGN = os.path.normpath(_cand[0]) if _cand else ""
SVG_SUMS_DIGEST = "63a198339b40417d1a039058e9e61b5f21fa1a5c887be29decd5c3bef97cccbd"


def setup():
    core.MUT.clear()
    base.ROWS.clear()
    base.ROW_BY_ID.clear()
    base.BASE.clear()
    scenes.CORPUS.clear()
    scenes.INFO.clear()
    base._MODELS.clear()
    rows_a.SF_RULES.clear()
    # gate: the consumed oracles-svg corpus digest
    sums = os.path.join(base.CORPUS_DIR, "..", "oracles-svg", "SHA256SUMS")
    d = hashlib.sha256(open(sums, "rb").read()).hexdigest()
    scenes.INFO["oracles_svg_sums_digest"] = d
    if d != SVG_SUMS_DIGEST:
        raise SystemExit("GATE FAILED: oracles-svg/SHA256SUMS digest %s != %s" % (d, SVG_SUMS_DIGEST))
    scenes.build_all()
    rows_a.make_states()
    rows_a.register_dl_rows()
    rows_b.register_pb()
    rows_b.register_c()
    rows_b.register_z()
    rows_a.register_s_rows()
    rows_b.register_r()
    rows_b.register_r44()
    rows_c.register_u()
    rows_c.register_d()
    rows_c.register_k()


def baseline():
    outs = {}
    for r in base.ROWS:
        if r.group == "K":
            continue
        o = run_row(r)
        outs[r.id] = o
        for p, b in o.files.items():
            base.BASE[p] = b
    return outs


def sort_key(r):
    return (FAMILIES.index(r.group), int("".join(c for c in r.id[1:] if c.isdigit())), r.id)


def tsv_cell(s):
    return s.replace("\t", " ").replace("\n", " ")


def build_expect(outs):
    lines = ["id\tgroup\ttier\tscene\tlayout\tinput\texpected\terror"]
    for r in sorted(base.ROWS, key=sort_key):
        o = outs.get(r.id)
        inp = r.inp
        if o is not None and o.inp is not None:
            inp = o.inp
        if not isinstance(inp, str):
            inp = base.jtxt(inp)
        err = o.error if o else ""
        exp = r.expected if (o is not None and not o.error and r.expected in o.files) else ""
        lines.append("\t".join(tsv_cell(x) for x in (r.id, r.group, r.tier, r.scene, r.layout, inp, exp, err)))
    return ("\n".join(lines) + "\n").encode("utf-8")


# -------------------------------------------------------------- self checks
def self_checks(outs):
    notes = {}
    # 1. the single-fault property of the S rows
    sf = {}
    for sid, rules in sorted(rows_a.SF_RULES.items()):
        data = base.BASE["bad/%s.dl" % sid]
        full = D.parse_tag(data)
        one = D.parse_tag(data, off=frozenset(rules))
        sf[sid] = {"rejected": full, "accepted_with_only_named_rules_off": one, "rules": sorted(rules)}
        if sid in ("S32", "S40"):
            sf[sid]["judged_by"] = "rejected (declared exception, 4.7)"
    notes["single_fault"] = sf
    # 2. the XR parity rows
    par = {}
    pairs = [("R12", "R01"), ("R13", "R05"), ("R14", "R30")]
    for a, b in pairs:
        par["%s==%s" % (a, b)] = base.BASE["xr/%s.xr.json" % a] == base.BASE["xr/%s.xr.json" % b]
    # R15 against the list readout of X01
    mdl = model_of(*rows_a.SV("trunc"))
    d = D.build_dl(mdl, core.initial_state(mdl, 900, 600))
    par["R15==readout(X01)"] = base.BASE["xr/R15.xr.json"] == V.serialize_readout(V.readout_from_list(d, mdl))
    par["R16==R01"] = base.BASE["xr/R16.xr.json"] == base.BASE["xr/R01.xr.json"]
    par["R39==R30"] = base.BASE["xr/R39.xr.json"] == base.BASE["xr/R30.xr.json"]
    for k, fam in (("R40", "C03"), ("R41", "C19")):
        pass
    notes["xr_parity"] = par
    # 3. labels fidelity against the oracles-svg EXPECT.tsv (informational cross-check)
    svg_expect = {}
    p = os.path.join(base.CORPUS_DIR, "..", "oracles-svg", "EXPECT.tsv")
    for l in open(p, encoding="utf-8").read().split("\n")[1:]:
        c = l.split("\t")
        if len(c) >= 6 and c[5].startswith("{") and "expect_fidelity" in c[5]:
            try:
                svg_expect[c[0]] = json.loads(c[5])["expect_fidelity"]
            except Exception:
                pass
    fid = {}
    for dl_id, svg_id in (("G01", "G01"), ("G02", "G02"), ("G03", "G03"), ("G04", "G04"), ("G05", "G05"),
                          ("G06", "G06"), ("G07", "G07"), ("G08", "G08"), ("G09", "G09"), ("G10", "G10"),
                          ("G11", "N08"), ("X01", "X03"), ("X02", "X12"), ("X03", "X10"), ("X04", "X11"),
                          ("X05", "X08"), ("X06", "X07"), ("X07", "X14"), ("X08", "X06"), ("X10", "X13"),
                          ("X13", "X15"), ("N01", "N01"), ("N02", "N02"), ("N05", "N07"), ("N09", "N09"),
                          ("N10", "N10"), ("N17", "N15"), ("N16", "N03"), ("Y01", "Y01"), ("Y07", "Y07"),
                          ("Y08", "Y08"), ("Y17", "Y17"), ("Y12", "Y12"), ("Y13", "Y13")):
        r = base.ROW_BY_ID[dl_id]
        if r.fn is None or svg_id not in svg_expect:
            continue
        try:
            inp = r.inp
            mdl = model_of(r.scene, r.layout)
            st = rows_a.state_of(mdl, inp["state"], inp["size"])
            f = D.dry_label_pass(mdl, st, base.conv(inp.get("options")) if "options" in inp else None)
            exp = svg_expect[svg_id]
            fid[dl_id + "~svg:" + svg_id] = (f["labels"] == exp["labels"] and f["label_units"] == exp["label_units"]
                                             and f["edge_labels"] == exp["edge_labels"])
        except Exception as e:
            fid[dl_id + "~svg:" + svg_id] = "ERR " + str(e)
    notes["fidelity_vs_svg_corpus"] = fid
    # 4. my states against the oracles-svg states of the same description
    notes["states_equal_oracles_svg"] = rows_a.cmp_with_svg_states()
    # 5. D rows
    notes["d_rows"] = {k: outs[k].extra for k in ("D01", "D02", "D03", "D04", "D05", "D06", "U10")}
    notes["c_v5_parity_vs_oracles_svg_documents"] = rows_b.parity_svg(outs)
    # 6. every expected list is accepted by the reader and re-serializes to itself
    acc = {}
    for rid, o in sorted(outs.items()):
        for pth, b in o.files.items():
            if pth.startswith("dl/") and "." not in pth[3:-3].replace(rid, "") and pth.endswith(".dl"):
                acc[pth] = D.parse_tag(b) == "ok"
    notes["lists_accepted_by_reader"] = acc
    return notes


# ---------------------------------------------------------------- the matrix
def run_matrix(outs, only=None):
    base_keys = {rid: o.key() for rid, o in outs.items()}
    rows = [r for r in base.ROWS if r.group != "K"]
    res = {}
    for kid, desc, kill in ALLK:
        if only and kid not in only:
            continue
        core.MUT.clear()
        core.MUT.add(kid)
        changed = []
        try:
            for r in rows:
                o = run_row(r)
                if o.key() != base_keys[r.id]:
                    changed.append(r.id)
        finally:
            core.MUT.clear()
        named_changed = [k for k in kill if k in changed]
        res[kid] = {"desc": desc, "named": kill, "changed": changed, "named_changed": named_changed,
                    "named_not_changed": [k for k in kill if k not in changed]}
    return res


def write_matrix_tsv(res):
    lines = ["mutant\tdescription\tnamed_killers\tkilling_named_rows\tnamed_not_killing\tother_changed_rows\tverdict"]
    for kid, desc, kill in ALLK:
        r = res[kid]
        other = [x for x in r["changed"] if x not in kill]
        if r["named_changed"]:
            verdict = "killed" if not r["named_not_changed"] else "killed (some named rows do not kill)"
        elif r["changed"]:
            verdict = "row-does-not-kill (other rows kill)"
        else:
            verdict = "unkillable"
        lines.append("\t".join([kid, desc, ",".join(kill), ",".join(r["named_changed"]), ",".join(r["named_not_changed"]),
                                ",".join(other), verdict]))
    return ("\n".join(lines) + "\n").encode("utf-8")


# ------------------------------------------------------------------- writing
def write_files(out_dir, files):
    for p, b in files.items():
        full = os.path.join(out_dir, p)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(b)


def sums_file(out_dir):
    entries = []
    for root, dirs, fns in os.walk(out_dir):
        rel_root = os.path.relpath(root, out_dir).replace("\\", "/")
        if rel_root == "tools" or rel_root.startswith("tools/") or rel_root == "__pycache__":
            continue
        for fn in fns:
            rel = fn if rel_root == "." else rel_root + "/" + fn
            if rel == "SHA256SUMS" or rel.startswith("tools/"):
                continue
            entries.append(rel)
    entries.sort(key=lambda s: s.encode("utf-8"))
    lines = []
    for rel in entries:
        h = hashlib.sha256(open(os.path.join(out_dir, rel), "rb").read()).hexdigest()
        lines.append("%s *%s" % (h, rel))
    return ("\n".join(lines) + "\n").encode("utf-8")


def collect_files(outs, expect, extra):
    files = {}
    files.update(scenes.CORPUS)
    for p, b in base.BASE.items():
        files[p] = b
    files["EXPECT.tsv"] = expect
    files.update(extra)
    return files


def main(argv):
    out_dir = base.CORPUS_DIR
    matrix = True
    only = None
    check_appendix = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--out":
            out_dir = os.path.abspath(argv[i + 1])
            i += 1
        elif a == "--no-matrix":
            matrix = False
        elif a == "--mutant":
            only = [argv[i + 1]]
            i += 1
        elif a == "--check-appendix":
            check_appendix = True
        i += 1
    t0 = time.time()
    setup()
    outs = baseline()
    if check_appendix:
        for line in appendix_a.check(DESIGN, outs, base.BASE):
            print(line)
        return 0
    if only:
        res = run_matrix(outs, only)
        for k, v in res.items():
            print(k, v["desc"])
            print("  named:", v["named"], "named changed:", v["named_changed"])
            print("  all changed:", v["changed"])
        return 0
    expect = build_expect(outs)
    notes = self_checks(outs)
    app_rows = appendix_a.check(DESIGN, outs, base.BASE)
    extra = {}
    extra["APPENDIX-A.tsv"] = ("item\tresult\tdetail\n" + "\n".join("\t".join(r) for r in app_rows) + "\n").encode("utf-8")
    extra["inputs/N03.search.json"] = (json.dumps(scenes.INFO["N03"], sort_keys=True, indent=1) + "\n").encode("utf-8")
    extra["inputs/searches.json"] = (json.dumps({"P08": scenes.INFO.get("P08"), "P13": scenes.INFO.get("P13"),
                                                 "N07": scenes.INFO.get("N07")}, sort_keys=True, indent=1) + "\n").encode("utf-8")
    extra["inputs/self-checks.json"] = (json.dumps(notes, sort_keys=True, indent=1) + "\n").encode("utf-8")
    res = None
    if matrix:
        res = run_matrix(outs)
        extra["MUTANTS.tsv"] = write_matrix_tsv(res)
    import docs
    files = collect_files(outs, expect, extra)
    files["README.md"], files["AMBIGUITIES.md"] = docs.make(outs, notes, app_rows, res, scenes.INFO)
    if os.path.abspath(out_dir) == base.CORPUS_DIR:
        # regenerate from empty: remove previously generated files (everything but tools/)
        for name in os.listdir(out_dir):
            if name == "tools":
                continue
            p = os.path.join(out_dir, name)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    else:
        os.makedirs(out_dir, exist_ok=True)
    write_files(out_dir, files)
    with open(os.path.join(out_dir, "SHA256SUMS"), "wb") as f:
        f.write(sums_file(out_dir))
    print("done in %.1fs: %d files, %d rows" % (time.time() - t0, len(files), len(base.ROWS)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
