#!/usr/bin/env python3
"""Proof of no collateral change for the LP/1 regeneration of `oracles-ia` (ruling R-H of 2026-11-22; design 37 rev 3).

old = the file at git HEAD (`git show HEAD:path`), new = the working tree. For every file of the corpus (everything but `tools/`):

  * every file must be byte-identical to HEAD except the allowed set {PARITY.tsv, README.md, AMBIGUITIES.md, SHA256SUMS}; no file is added or removed.
    That covers every expected file, `EXPECT.tsv`, `MUTANTS.tsv`, `APPENDIX-A.tsv`, every manifest, json, header, bundle member and the svg/dl
    documents of the export rows (`data/O1.svg`, `data/O1.decl.svg`, `data/X15.svg`, `data/O1.dl`, `headless/H02.bin`).
  * DERIVED ARTIFACTS are re-derived: the generator (`gen.py`'s `build_all` / `baseline`, the corpus's own writers) is run in this process twice,
    with the pre-LP/1 writers (`export.LP_ON = False`, the same switch as `ORACLE_IA_LP=0`) and with LP/1, and every generated file (rows and
    auxiliary files: documents, manifests, hash lists, sizes, bundles, headless output) must be byte-equal across the two runs AND equal to the
    working tree AND equal to HEAD. The files that `gaps.py`, `gaps2.py`, `gaps3.py` write (they derive their manifests from the stored
    `data/O1.decl.svg`) are re-evaluated the same way: equal to the working tree.
  * the whole generator chain (gen.py, gaps.py, gaps2.py, gaps3.py, into a scratch directory) is run with the pre-LP/1 writers and with LP/1:
    the first must reproduce HEAD and the second the working tree for every file but the index files (README.md, AMBIGUITIES.md, SHA256SUMS, PARITY.tsv).
  * every svg/dl document that any row embeds (the documents above and the svg members of the bundles of the X and H rows) is rendered with
    LP/1 and the offsets are checked: every label offset is (0, 0) (no label of those documents collides at its default position).
  * `PARITY.tsv` (the one expected file that changes): same header, same rows, same files; only the `this_sha256`, `other_sha256` and `status`
    cells of the rows whose document the other corpus regenerated may differ; for each such row the other corpus's old document (HEAD) and
    new document (working tree) differ only in label x/y (svg: `x`/`y` of `igr-label`/`igr-elabel` text elements; dl: fields 3 and 4 of the `T`
    records), the old cell is the SHA-256 of the HEAD document and of the pre-LP/1 writer's output, the new cell is the SHA-256 of the working tree
    document and of the LP/1 writer's output, and the new status is MATCH. A row whose other document did not change must not change.
  * `SHA256SUMS`: the same paths, a line differs only for the allowed files, and every line equals the SHA-256 of the file now.
  * `AMBIGUITIES.md`: the old bytes are an exact prefix (append only). `README.md`: documentation, only reported (changed line count).

Exit status 0 iff every check holds. Usage: python tools/labelmove_check.py   (from anywhere; needs git and the repository)
"""
import hashlib
import json
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)                                   # fixtures/oracles-ia
REPO = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=ROOT).decode().strip()
REL = os.path.relpath(ROOT, REPO).replace(os.sep, "/")        # fixtures/oracles-ia
FIX = os.path.dirname(ROOT)

ALLOWED = {"PARITY.tsv", "README.md", "AMBIGUITIES.md", "SHA256SUMS"}
LABEL_XY = re.compile(r'(<text class="igr-(?:label|elabel)") x="([^"]*)" y="([^"]*)"')
TEXT_EL = re.compile(r'<text class="(igr-label|igr-elabel)" x="([^"]*)" y="([^"]*)"')
errors = []


def sha(b):
    return hashlib.sha256(b).hexdigest()


def git_show(path):
    r = subprocess.run(["git", "show", "HEAD:" + path], cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return r.stdout if r.returncode == 0 else None


def old_files(rel):
    out = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", "HEAD", "--", rel], cwd=REPO).decode("utf-8").split("\n")
    return sorted(p[len(rel) + 1:] for p in out if p and not p[len(rel) + 1:].startswith("tools/"))


def new_files(root):
    res = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in ("tools", "__pycache__")]
        for f in fn:
            res.append(os.path.relpath(os.path.join(dp, f), root).replace(os.sep, "/"))
    return sorted(res)


def mask_doc(path, data):
    """the document with the label positions removed (svg: x/y of label text elements; dl: x, y of T records)"""
    t = data.decode("utf-8")
    if path.endswith(".svg"):
        return LABEL_XY.sub(r"\1", t), [(a, b, c) for a, b, c in TEXT_EL.findall(t)]
    lines, pos = [], []
    for ln in t.split("\n"):
        if ln.startswith('["T",'):
            r = json.loads(ln)
            pos.append((r[1], r[3], r[4]))
            r[3] = r[4] = None
            ln = json.dumps(r, ensure_ascii=False)
        lines.append(ln)
    return "\n".join(lines), pos


# ------------------------------------------------------------------ 1. every file byte-identical except the allowed ones
def check_files():
    old_set, new_set = set(old_files(REL)), set(new_files(ROOT))
    for p in sorted(old_set - new_set):
        errors.append("file removed: " + p)
    for p in sorted(new_set - old_set):
        errors.append("file added: " + p)
    same, changed = 0, []
    old_b, new_b = {}, {}
    for p in sorted(old_set & new_set):
        o = git_show(REL + "/" + p)
        n = open(os.path.join(ROOT, p), "rb").read()
        old_b[p], new_b[p] = o, n
        if o == n:
            same += 1
        else:
            changed.append(p)
    print("files: %d old, %d now, %d byte-identical, changed: %s" % (len(old_set), len(new_set), same, changed))
    for p in changed:
        if p not in ALLOWED:
            errors.append("changed file outside the allowed set: " + p)
    return old_b, new_b, changed


# ------------------------------------------------------------------ 2. derived artifacts re-derived from old and new writers
def regenerate(EX, gen, lp):
    EX.LP_ON = lp
    gen.build_all()
    res = gen.baseline()
    files = {}
    for p, b in gen.AUX.items():
        files[p] = b
    for rid, (fl, err) in res.items():
        for p, b in fl.items():
            if p in files and files[p] != b:
                errors.append("conflicting generated file " + p)
            files[p] = b
    return files


def check_derived(new_b):
    import export as EX
    import gen
    import corpus as C
    f_old = regenerate(EX, gen, False)
    f_new = regenerate(EX, gen, True)
    if set(f_old) != set(f_new):
        errors.append("generated file sets differ between the pre-LP/1 and the LP/1 run")
    n_eq = n_head = n_wt = 0
    for p in sorted(f_new):
        if f_old.get(p) != f_new[p]:
            errors.append("generated file differs between the pre-LP/1 and the LP/1 run: " + p)
        else:
            n_eq += 1
        h = git_show(REL + "/" + p)
        if h != f_new[p]:
            errors.append("generated file differs from HEAD: " + p)
        else:
            n_head += 1
        if p in new_b and new_b[p] != f_new[p]:
            errors.append("generated file differs from the working tree: " + p)
        else:
            n_wt += 1
    print("generator (gen.py rows and auxiliary files): %d files; pre-LP/1 run == LP/1 run for %d, == HEAD for %d, == working tree for %d" % (len(f_new), n_eq, n_head, n_wt))
    # documents embedded by the rows: every label offset is (0, 0)
    docs = {p: b for p, b in f_new.items() if p.endswith(".svg") or p.endswith(".dl")}
    nlab = 0
    calls = []
    orig = EX.lp_offsets

    def spy(S, vn, items):
        r = orig(S, vn, items)
        calls.append((len(items), r))
        return r
    EX.lp_offsets = spy
    try:
        for nm, sc in C.SC.items():
            pass
        m = C.SC["O1"].model
        st = mk_state_O1(m)
        for fn in (lambda: EX.render_svg(m, st), lambda: EX.render_svg(m, st, xml_decl=True), lambda: EX.render_dl(m, st)):
            fn()
    finally:
        EX.lp_offsets = orig
    for n_items, offs in calls:
        nlab += n_items
        if any(o != (0, 0) for o in offs):
            errors.append("a label of the O1 documents has a non-zero LP/1 offset")
    print("O1 documents (svg, svg with declaration, dl): %d label placements, all offsets (0, 0): %s" % (nlab, all(o == (0, 0) for _n, offs in calls for o in offs)))
    # the svg documents of the generated files (X15.svg is O1.decl.svg with one byte changed): label positions equal those of O1
    ref_pos = [(a_, b_, c_) for a_, b_, c_ in TEXT_EL.findall(f_new["data/O1.decl.svg"].decode("utf-8"))]
    for p, b in sorted(docs.items()):
        if p.endswith(".svg") and TEXT_EL.findall(b.decode("utf-8")) != ref_pos:
            errors.append("label positions of %s differ from those of O1.decl.svg" % p)
    print("svg/dl documents in the generated files:", sorted(docs))
    return f_new


def mk_state_O1(m):
    from base import mk_state
    return mk_state(m)


def pipeline(lp, tmp):
    """the whole generator chain (gen.py, gaps.py, gaps2.py, gaps3.py) into a scratch directory; returns the scratch root.
    gaps3's text step (README/AMBIGUITIES rewrite) may stop on the copied final AMBIGUITIES.md: it runs after every data file, EXPECT.tsv and MUTANTS.tsv are written."""
    import shutil
    import tempfile
    out = os.path.join(tmp, "lp1" if lp else "pre")
    env = dict(os.environ, PYTHONIOENCODING="utf-8", ORACLE_IA_LP="1" if lp else "0", PYTHONDONTWRITEBYTECODE="1")
    for cmd in (["gen.py", "--out", out], ["gaps.py", "--root", out, "--write"], ["gaps2.py", "--root", out, "--write"], ["gaps3.py", "--root", out, "--write"]):
        r = subprocess.run([sys.executable, os.path.join(HERE, cmd[0])] + cmd[1:], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if r.returncode != 0 and cmd[0] != "gaps3.py":
            errors.append("%s failed (LP %s): %s" % (cmd[0], lp, r.stderr.decode("utf-8", "replace")[-300:]))
    return out


def check_pipeline(old_b, new_b):
    import tempfile
    skip = ALLOWED | {"README.md"}
    with tempfile.TemporaryDirectory() as tmp:
        for lp, ref, name in ((False, old_b, "HEAD"), (True, new_b, "the working tree")):
            out = pipeline(lp, tmp)
            files = new_files(out)
            n = bad = 0
            for p in files:
                if p in skip:
                    continue
                n += 1
                if p not in ref or open(os.path.join(out, p), "rb").read() != ref[p]:
                    bad += 1
                    errors.append("pipeline (LP/1 %s): %s differs from %s" % ("on" if lp else "off", p, name))
            missing = [p for p in ref if p not in set(files) and p not in skip]
            for p in missing:
                errors.append("pipeline (LP/1 %s): %s not produced" % ("on" if lp else "off", p))
            print("full generator chain gen.py + gaps.py + gaps2.py + gaps3.py, LP/1 %s: %d data/index files compared with %s, %d differ, %d missing" % (
                "on" if lp else "off (ORACLE_IA_LP=0)", n, name, bad, len(missing)))


# ------------------------------------------------------------------ 3. PARITY.tsv
def rows_of(b):
    lines = b.decode("utf-8").split("\n")
    h = lines[0].split("\t")
    return h, [l.split("\t") for l in lines[1:] if l]


def check_parity(old_b, new_b, regen):
    import export as EX
    from base import build_model, mk_state
    ho, ro = rows_of(old_b["PARITY.tsv"])
    hn, rn = rows_of(new_b["PARITY.tsv"])
    if ho != hn:
        errors.append("PARITY.tsv header differs")
    if [r[0] for r in ro] != [r[0] for r in rn]:
        errors.append("PARITY.tsv rows differ")
        return
    changed_rows = []
    for a, b in zip(ro, rn):
        # columns: row, this_corpus_file, this_sha256, other_corpus_file, other_sha256, status
        if a[1] != b[1] or a[3] != b[3]:
            errors.append("PARITY.tsv %s: a file column differs" % a[0])
        other = a[3]                                            # e.g. oracles-svg/svg/G05.svg
        o_doc = git_show("fixtures/" + other)
        n_doc = open(os.path.join(FIX, other), "rb").read()
        other_changed = o_doc != n_doc
        if a == b:
            if other_changed:
                errors.append("PARITY.tsv %s: the other document changed but the row did not" % a[0])
            continue
        changed_rows.append(a[0])
        if not other_changed:
            errors.append("PARITY.tsv %s: the row changed but the other document did not" % a[0])
            continue
        mo, po = mask_doc(other, o_doc)
        mn, pn = mask_doc(other, n_doc)
        if mo != mn:
            errors.append("PARITY.tsv %s: the other document differs beyond label x/y" % a[0])
        if len(po) != len(pn) or po == pn:
            errors.append("PARITY.tsv %s: no label moved or the label count differs" % a[0])
        moved = sum(1 for x, y in zip(po, pn) if x != y)
        if (a[2], a[4]) != (sha(o_doc), sha(o_doc)) or a[5] != "MATCH":
            errors.append("PARITY.tsv %s: the old cells are not the HEAD document's hash with MATCH (the committed corpus)" % a[0])
        if (b[2], b[4]) != (sha(n_doc), sha(n_doc)) or b[5] != "MATCH":
            errors.append("PARITY.tsv %s: the new cells are not the working tree document's hash with MATCH" % a[0])
        # the writer's output, recomputed with LP/1 and without
        kind = a[0].split(":")[0]
        gid = a[0].split(":")[1]
        fixrow = _find_row(other.split("/")[0], gid)
        inp = json.loads(fixrow["input"])
        sb = open(os.path.normpath(os.path.join(FIX, other.split("/")[0], fixrow["scene"])), "rb").read()
        lb = open(os.path.normpath(os.path.join(FIX, other.split("/")[0], fixrow["layout"])), "rb").read()
        m = build_model(sb, lb)
        st = mk_state(m, inp["size"]["width"], inp["size"]["height"])
        fn = EX.render_svg if kind == "svg" else EX.render_dl
        EX.LP_ON = False
        w_old = fn(m, st)
        EX.LP_ON = True
        w_new = fn(m, st)
        if w_old != o_doc:
            errors.append("PARITY.tsv %s: the pre-LP/1 writer does not reproduce the HEAD document" % a[0])
        if w_new != n_doc:
            errors.append("PARITY.tsv %s: the LP/1 writer does not reproduce the working tree document" % a[0])
        print("PARITY %s: %s label x/y only, %d of %d labels moved; pre-LP/1 writer == HEAD document, LP/1 writer == regenerated document" % (a[0], other, moved, len(po)))
    n_match = sum(1 for r in rn if r[5] == "MATCH")
    print("PARITY.tsv: %d rows, changed rows %s, %d MATCH" % (len(rn), changed_rows, n_match))
    if n_match != len(rn):
        errors.append("PARITY.tsv: not every row is MATCH")


_ROWS_CACHE = {}


def _find_row(corpus, gid):
    if corpus not in _ROWS_CACHE:
        t = open(os.path.join(FIX, corpus, "EXPECT.tsv"), encoding="utf-8").read().split("\n")
        h = t[0].split("\t")
        _ROWS_CACHE[corpus] = {l.split("\t")[0]: dict(zip(h, l.split("\t"))) for l in t[1:] if l}
    return _ROWS_CACHE[corpus][gid]


# ------------------------------------------------------------------ 4. index files
def check_sums(old_b, new_b):
    def parse(t):
        return {l.split(" *", 1)[1]: l.split(" *", 1)[0] for l in t.decode("utf-8").split("\n") if l}
    so, sn = parse(old_b["SHA256SUMS"]), parse(new_b["SHA256SUMS"])
    if set(so) != set(sn):
        errors.append("SHA256SUMS: the path set differs")
    diff = sorted(k for k in so if k in sn and so[k] != sn[k])
    for k in diff:
        if k not in ALLOWED:
            errors.append("SHA256SUMS: a line changed for a file outside the allowed set: " + k)
    missing = [k for k in ALLOWED - {"SHA256SUMS"} if k not in diff]
    if missing:
        errors.append("SHA256SUMS: a changed file has an unchanged line: " + ",".join(missing))
    bad = 0
    for p, h in sn.items():
        if sha(open(os.path.join(ROOT, p), "rb").read()) != h:
            bad += 1
            errors.append("SHA256SUMS: line does not match the file: " + p)
    print("SHA256SUMS: %d lines, %d differ (%s), every line equals the file's SHA-256 (%d wrong); digest of SHA256SUMS now %s" % (len(sn), len(diff), diff, bad, sha(new_b["SHA256SUMS"])))


def check_text(old_b, new_b):
    if not new_b["AMBIGUITIES.md"].startswith(old_b["AMBIGUITIES.md"]):
        errors.append("AMBIGUITIES.md: the old text is not an exact prefix")
    else:
        print("AMBIGUITIES.md: old text is an exact prefix, %d bytes appended" % (len(new_b["AMBIGUITIES.md"]) - len(old_b["AMBIGUITIES.md"])))
    ol, nl = old_b["README.md"].decode("utf-8").split("\n"), new_b["README.md"].decode("utf-8").split("\n")
    import difflib
    d = [x for x in difflib.unified_diff(ol, nl, lineterm="", n=0) if x[:1] in "+-" and x[:3] not in ("+++", "---")]
    print("README.md (documentation, reported only): %d lines changed or added" % len(d))
    if b"\r" in new_b["README.md"] or b"\r" in new_b["AMBIGUITIES.md"] or b"\r" in new_b["PARITY.tsv"]:
        errors.append("CR in a text file")


def main():
    old_b, new_b, changed = check_files()
    if not (set(changed) <= ALLOWED):
        pass
    f_new = check_derived(new_b)
    check_pipeline(old_b, new_b)
    if "PARITY.tsv" in changed:
        check_parity(old_b, new_b, f_new)
    check_sums(old_b, new_b)
    check_text(old_b, new_b)
    if errors:
        print("\nFAILED:")
        for e in errors:
            print(" -", e)
        return 1
    print("\nOK: no collateral change")
    return 0


if __name__ == "__main__":
    sys.exit(main())
