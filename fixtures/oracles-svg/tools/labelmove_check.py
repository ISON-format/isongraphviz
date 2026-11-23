#!/usr/bin/env python3
"""Proof of no collateral change for the LP/1 regeneration of `oracles-svg` (ruling R-H; design 30 rev 5).

old = the file at git HEAD (`git show HEAD:path`), new = the working tree. For every file of the corpus (everything but `tools/`):

  * `svg/*.svg` that changed: removing the `x` and `y` attributes of every `<text class="igr-label"` / `<text class="igr-elabel"` element from
    both documents must give byte-identical documents (so only label positions moved); the moved labels are counted.
  * `json/T14.readouts.json`: only the `readout_sha256` of entries whose document is a changed document may differ (the readout hashes the edge label
    positions); every other member and entry is identical.
  * `SHA256SUMS`: the set of paths is the old set plus the new files, and a line differs only for a file that changed (or an index file).
  * `AMBIGUITIES.md`, `MUTANTS.tsv`: the old bytes / old rows are an exact prefix (append only); `README.md` is documentation and is only reported.
  * `EXPECT.tsv`: the old bytes are an exact prefix; the appended lines are rows of family `L` only (R-C, new ids). New files may exist only for those rows
    (`scenes/lp-*`, `layouts/lp-*`, `states/Lnn.*`, `svg/Lnn.svg`); they are reported as new files and nothing old may depend on them.
  * every other file (APPENDIX-A.tsv, states, scenes, layouts, inputs, bad, scripts, generated, other json) must be byte-identical.

Exit status 0 iff every check holds. Usage: python tools/labelmove_check.py   (run from anywhere; needs git and the repository)
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                                   # fixtures/oracles-svg
REPO = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=ROOT).decode().strip()
REL = os.path.relpath(ROOT, REPO).replace(os.sep, "/")        # fixtures/oracles-svg

LABEL_XY = re.compile(r'(<text class="igr-(?:label|elabel)") x="([^"]*)" y="([^"]*)"')
TEXT_EL = re.compile(r'<text class="(igr-label|igr-elabel)" x="([^"]*)" y="([^"]*)"')
INDEX_FILES = {"SHA256SUMS", "README.md", "AMBIGUITIES.md", "MUTANTS.tsv"}


def git_show(path):
    r = subprocess.run(["git", "show", "HEAD:" + path], cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return r.stdout if r.returncode == 0 else None


def old_files():
    out = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", "HEAD", "--", REL], cwd=REPO).decode("utf-8").split("\n")
    return sorted(p[len(REL) + 1:] for p in out if p and not p[len(REL) + 1:].startswith("tools/"))


def new_files():
    res = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d != "tools"]
        for f in fn:
            res.append(os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, "/"))
    return sorted(res)


def main():
    errors = []
    old_set, new_set = set(old_files()), set(new_files())
    for p in sorted(old_set - new_set):
        errors.append(f"file removed: {p}")
    added = sorted(new_set - old_set)
    changed_svg, changed_other, identical = [], [], 0
    moved_total = 0
    per_file = {}
    old_bytes = {}
    new_bytes = {}
    for p in sorted(old_set & new_set):
        o = git_show(f"{REL}/{p}")
        n = open(os.path.join(ROOT, p), "rb").read()
        old_bytes[p], new_bytes[p] = o, n
        if o == n:
            identical += 1
            continue
        if p.startswith("svg/") and p.endswith(".svg"):
            changed_svg.append(p)
            ot, nt = o.decode("utf-8"), n.decode("utf-8")
            if LABEL_XY.sub(r"\1", ot) != LABEL_XY.sub(r"\1", nt):
                errors.append(f"{p}: differs beyond label x/y")
                continue
            oe, ne = TEXT_EL.findall(ot), TEXT_EL.findall(nt)
            if len(oe) != len(ne):
                errors.append(f"{p}: number of labels differs {len(oe)} vs {len(ne)}")
                continue
            moved = sum(1 for a, b in zip(oe, ne) if a != b)
            if moved == 0:
                errors.append(f"{p}: changed but no label moved")
            per_file[p] = (moved, len(oe))
            moved_total += moved
        else:
            changed_other.append(p)
    # ---- the files that changed and are not documents
    changed_docs = {p[len("svg/"):-len(".svg")] for p in changed_svg}
    for p in changed_other:
        o, n = old_bytes[p], new_bytes[p]
        if p == "json/T14.readouts.json":
            a, b = json.loads(o.decode("utf-8")), json.loads(n.decode("utf-8"))
            if [x["row"] for x in a] != [x["row"] for x in b]:
                errors.append(f"{p}: the rows differ")
                continue
            for x, y in zip(a, b):
                if x == y:
                    continue
                if {k: v for k, v in x.items() if k != "readout_sha256"} != {k: v for k, v in y.items() if k != "readout_sha256"}:
                    errors.append(f"{p}: entry {x['row']} differs beyond readout_sha256")
                if x["row"] not in changed_docs:
                    errors.append(f"{p}: entry {x['row']} changed but its document did not")
            nchg = sum(1 for x, y in zip(a, b) if x != y)
            print(f"json/T14.readouts.json: {nchg} entries differ, only in readout_sha256, all of changed documents")
        elif p == "SHA256SUMS":
            def parse(t):
                return {l.split(" *", 1)[1]: l.split(" *", 1)[0] for l in t.decode("utf-8").split("\n") if l}
            so, sn = parse(o), parse(n)
            allowed = set(changed_svg) | set(changed_other) | set(added) | {"json/T14.readouts.json"}
            if set(so) - set(sn):
                errors.append("SHA256SUMS: lines removed " + ",".join(sorted(set(so) - set(sn))))
            if set(sn) - set(so) - set(added):
                errors.append("SHA256SUMS: lines for unknown new files")
            bad = [k for k in so if k in sn and so[k] != sn[k] and k not in allowed]
            if bad:
                errors.append("SHA256SUMS: a line changed for an unchanged file: " + ",".join(bad))
            same = [k for k in so if k in sn and so[k] == sn[k] and k in set(changed_svg) | {"json/T14.readouts.json"}]
            if same:
                errors.append("SHA256SUMS: a changed file has an unchanged line: " + ",".join(same))
            diff_paths = sorted(k for k in so if k in sn and so[k] != sn[k])
            print(f"SHA256SUMS: {len(diff_paths)} lines differ (changed documents/json {len(changed_svg) + 1}, index files {sorted(set(diff_paths) & INDEX_FILES)}), {len(sn) - len(so)} lines added")
        elif p == "EXPECT.tsv":
            if not n.startswith(o):
                errors.append("EXPECT.tsv: the old rows are not an exact prefix")
            else:
                extra = [l for l in n[len(o):].decode("utf-8").split(chr(10)) if l]
                bad_rows = [l.split(chr(9))[0] for l in extra if not re.match(r"L\d\d" + chr(9), l)]
                if bad_rows:
                    errors.append("EXPECT.tsv: appended rows outside family L: " + ",".join(bad_rows))
                print(f"EXPECT.tsv: old rows an exact prefix, {len(extra)} rows appended ({','.join(l.split(chr(9))[0] for l in extra)})")
        elif p == "AMBIGUITIES.md":
            if not n.startswith(o):
                errors.append("AMBIGUITIES.md: the old text is not an exact prefix")
            else:
                print(f"AMBIGUITIES.md: old text is an exact prefix, {len(n) - len(o)} bytes appended")
        elif p == "MUTANTS.tsv":
            ol, nl = o.decode("utf-8").split("\n"), n.decode("utf-8").split("\n")
            oldrows = [l for l in ol if l]
            newrows = [l for l in nl if l]
            diffs = []
            for i, l in enumerate(oldrows):
                if newrows[i] != l:
                    a, b = l.split("\t"), newrows[i].split("\t")
                    cols = [j for j in range(len(a)) if a[j] != b[j]]
                    diffs.append((a[0], cols))
            only_derived = all(c == [5] for _k, c in diffs)
            print(f"MUTANTS.tsv: {len(oldrows)} old lines, {len(newrows) - len(oldrows)} appended; old lines that differ: {len(diffs)}"
                  + (" (only in column 6 other_changed_rows, a derived list of rows a mutant changes)" if diffs and only_derived else ""))
            if diffs and not only_derived:
                errors.append("MUTANTS.tsv: old rows differ beyond other_changed_rows: " + ",".join(k for k, c in diffs if c != [5]))
            if diffs:
                print("   old mutants with a changed other_changed_rows: " + ",".join(k for k, _ in diffs))
        elif p == "README.md":
            print("README.md: changed (documentation, reported only)")
        else:
            errors.append(f"{p}: changed but must be byte-identical")
    stray = [a for a in added if not re.match(r"(scenes/lp-[a-z-]+\.scene\.json|layouts/lp-[a-z-]+\.layout\.json|states/L\d\d\.state\.json|svg/L\d\d\.svg)$", a)]
    if stray:
        errors.append("new files that do not belong to a row of family L: " + ",".join(stray))
    print(f"corpus files at HEAD: {len(old_set)}; byte-identical: {identical}; changed documents: {len(changed_svg)}; other changed: {sorted(changed_other)}; new files: {added}")
    print(f"labels moved: {moved_total} (of {sum(t for _m, t in per_file.values())} labels in the changed documents)")
    for p in changed_svg:
        if p in per_file:
            print(f"   {p}: {per_file[p][0]} of {per_file[p][1]} labels moved")
    if errors:
        print("FAIL:")
        for e in errors:
            print("  -", e)
        return 1
    print("OK: every changed document differs only in the x and y of label <text> elements; every other file is byte-identical or an allowed index/derived file")
    return 0


if __name__ == "__main__":
    sys.exit(main())
