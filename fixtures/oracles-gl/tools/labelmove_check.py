"""Proof that the label placement LP/1 (ruling R-H, 2026-11-22) changed nothing but label positions in the oracles-gl corpus.

    python -B -I tools/labelmove_check.py [--old-ref REF] [--root DIR] [--old-dir DIR]

OLD is `git show REF:fixtures/oracles-gl/<path>` (default REF = HEAD, run from the repository) or, with --old-dir, a directory holding the old corpus;
NEW is the working tree (--root, default the directory above tools/).  For every path of either side outside tools/:

  * byte-identical                                   -> counted as unchanged
  * a `.glplan` file that differs                    -> the file is parsed with its own header (line 1: `nd`, `ed`, `nt`; then nd `n` lines, ed `e` lines,
                                                        nt `T` lines, then the binary buffers) and BOTH sides are masked: the x and y (fields 3 and 4) of
                                                        every `T` line are replaced by a constant.  The masked files must be byte-identical (this covers the
                                                        header with its buffer sizes, the element table, the pid, kind and text of every label and the three
                                                        instance buffers).  Allowed derived change: the file length (a moved coordinate has another number
                                                        of digits); no expected file of this corpus quotes a plan size.  The labels whose (x, y) differ are
                                                        counted, and each moved label must move by a whole number of pixels on both axes (|dx| and |dy| are
                                                        multiples of 1000 milli-pixels: LP/1 adds whole-pixel offsets to the same default position).
  * a `.calls` file that differs                    -> the x and y operands of every `fillText` call masked, as above (none changes in this corpus; kept so
                                                        that the check is the same as the one of oracles-dl)
  * EXPECT.tsv, MUTANTS.tsv                          -> append-only: every old line unchanged and in place, new lines only at the end, and every new line is
                                                        a mutant row K173-K177
  * AMBIGUITIES.md                                   -> append-only: the old text is an exact prefix
  * APPENDIX-A.tsv                                   -> exactly one line may differ, the A.3 reproduction line, and only by the quoted/computed SHA-256 prefix
                                                        of the display list of G11/loops2 (3f9f43587a97bdb7 -> 6ff8514097243394) which is the Appendix A.3
                                                        figure of design 31 rev 7
  * README.md                                        -> report file: the number of differing lines is listed, and every differing line is shown (judged by
                                                        reading)
  * SHA256SUMS                                       -> must list every file with its true digest, and exactly the lines of the files that changed differ
  * a file only in NEW, a file only in OLD, anything else that differs -> FAIL

Exit status 0 iff there is no FAIL.  Standard library only.
"""
import difflib
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REL = "fixtures/oracles-gl"

APPEND_ONLY_LINES = ("EXPECT.tsv", "MUTANTS.tsv")
APPEND_ONLY_TEXT = ("AMBIGUITIES.md",)
NEW_MUTANT_IDS = ("K173", "K174", "K175", "K176", "K177")
A3_OLD, A3_NEW = "3f9f43587a97bdb7", "6ff8514097243394"


def split_plan(data):
    """-> (head lines list, tail bytes, nd, ed, nt) where head lines are the header, n, e and T lines WITHOUT their LF and tail is the binary after them."""
    pos = 0
    lines = []

    def next_line():
        nonlocal pos
        i = data.index(b"\n", pos)
        ln = data[pos:i]
        pos = i + 1
        return ln

    header = next_line()
    hd = json.loads(header.decode("utf-8"))
    nd, ed, nt = hd["nd"], hd["ed"], hd["nt"]
    lines.append(header)
    for _ in range(nd + ed + nt):
        lines.append(next_line())
    return lines, data[pos:], nd, ed, nt


def mask_plan(data):
    lines, tail, nd, ed, nt = split_plan(data)
    out = []
    for i, ln in enumerate(lines):
        if i >= 1 + nd + ed:
            rec = json.loads(ln.decode("utf-8"))
            assert rec[0] == "T", ln
            rec[3], rec[4] = 0, 0
            out.append(json.dumps(rec, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
        else:
            out.append(ln)
    return b"\n".join(out) + b"\n" + tail


def t_records(data):
    lines, _tail, nd, ed, _nt = split_plan(data)
    return [json.loads(ln.decode("utf-8")) for ln in lines[1 + nd + ed:]]


def mask_calls(data):
    out = []
    for line in data.split(b"\n"):
        if line.startswith(b'["m","fillText",'):
            rec = json.loads(line.decode("utf-8"))
            rec[3], rec[4] = 0, 0
            out.append(json.dumps(rec, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
        else:
            out.append(line)
    return b"\n".join(out)


def fill_records(data):
    return [json.loads(l.decode("utf-8")) for l in data.split(b"\n") if l.startswith(b'["m","fillText",')]


def main(argv):
    ref, root, old_dir = "HEAD", ROOT, None
    i = 0
    while i < len(argv):
        if argv[i] == "--old-ref":
            ref = argv[i + 1]; i += 1
        elif argv[i] == "--root":
            root = os.path.abspath(argv[i + 1]); i += 1
        elif argv[i] == "--old-dir":
            old_dir = os.path.abspath(argv[i + 1]); i += 1
        i += 1
    if old_dir is None:
        top = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=HERE).decode().strip()
        names = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", ref, REL + "/"], cwd=top).decode().split("\n")
        old_paths = sorted(n[len(REL) + 1:] for n in names if n and not n.startswith(REL + "/tools/"))

        def old_bytes(p):
            return subprocess.check_output(["git", "show", "%s:%s/%s" % (ref, REL, p)], cwd=top)
    else:
        old_paths = []
        for r, ds, fs in os.walk(old_dir):
            ds[:] = [d for d in ds if d not in ("tools", "__pycache__")]
            for f in fs:
                old_paths.append(os.path.relpath(os.path.join(r, f), old_dir).replace("\\", "/"))
        old_paths.sort()

        def old_bytes(p):
            return open(os.path.join(old_dir, p), "rb").read()
    new_paths = []
    for r, ds, fs in os.walk(root):
        ds[:] = [d for d in ds if d not in ("tools", "__pycache__")]
        for f in fs:
            new_paths.append(os.path.relpath(os.path.join(r, f), root).replace("\\", "/"))
    new_paths.sort()
    old_set, new_set = set(old_paths), set(new_paths)

    unchanged = 0
    moved_files, fails = [], []
    labels_total = labels_moved = nodes_moved = edges_moved = 0
    index_report = []
    changed_paths = set()
    size_report = []
    for p in sorted(old_set | new_set):
        if p not in new_set:
            fails.append("%s: removed" % p)
            continue
        nb = open(os.path.join(root, p), "rb").read()
        if p not in old_set:
            fails.append("%s: new file not allowed" % p)
            continue
        ob = old_bytes(p)
        if ob == nb:
            unchanged += 1
            continue
        changed_paths.add(p)
        if p.endswith(".glplan"):
            try:
                same = mask_plan(ob) == mask_plan(nb)
            except Exception as e:  # noqa: BLE001
                fails.append("%s: cannot parse (%r)" % (p, e))
                continue
            if not same:
                fails.append("%s: differs outside the x and y of the label runs" % p)
                continue
            a, b = t_records(ob), t_records(nb)
            mv = [(x, y) for x, y in zip(a, b) if x[3:5] != y[3:5]]
            if not mv:
                fails.append("%s: differs, but no label moved" % p)
                continue
            bad = [(x, y) for x, y in mv if (y[3] - x[3]) % 1000 != 0 or (y[4] - x[4]) % 1000 != 0]
            if bad:
                fails.append("%s: a label moved by a fraction of a pixel: %s" % (p, bad[0]))
                continue
            labels_total += len(b)
            labels_moved += len(mv)
            nodes_moved += sum(1 for x, _y in mv if x[2] == 0)
            edges_moved += sum(1 for x, _y in mv if x[2] == 1)
            moved_files.append((p, len(b), len(mv)))
            size_report.append((p, len(ob), len(nb)))
            continue
        if p.endswith(".calls"):
            if mask_calls(ob) != mask_calls(nb):
                fails.append("%s: differs outside the x and y of fillText" % p)
                continue
            a, b = fill_records(ob), fill_records(nb)
            mv = [1 for x, y in zip(a, b) if x[3:5] != y[3:5]]
            if not mv:
                fails.append("%s: differs, but no label moved" % p)
                continue
            moved_files.append((p, len(b), len(mv)))
            labels_total += len(b)
            labels_moved += len(mv)
            continue
        if p in APPEND_ONLY_LINES:
            ol, nl = ob.split(b"\n"), nb.split(b"\n")
            if ol[-1] == b"":
                ol = ol[:-1]
            if nl[-1] == b"":
                nl = nl[:-1]
            if nl[:len(ol)] != ol:
                fails.append("%s: an old line changed" % p)
                continue
            added = nl[len(ol):]
            ids = [l.split(b"\t")[0].decode() for l in added]
            if tuple(ids) != NEW_MUTANT_IDS:
                fails.append("%s: appended lines are not exactly the mutant rows %s: %s" % (p, NEW_MUTANT_IDS, ids))
                continue
            index_report.append("%s: append-only, %d lines appended (%s)" % (p, len(added), ",".join(ids)))
            continue
        if p in APPEND_ONLY_TEXT:
            if not nb.startswith(ob):
                fails.append("%s: the old text is not an exact prefix" % p)
            else:
                index_report.append("%s: append-only, %d bytes appended" % (p, len(nb) - len(ob)))
            continue
        if p == "APPENDIX-A.tsv":
            ol, nl = ob.decode("utf-8").split("\n"), nb.decode("utf-8").split("\n")
            diff = [(a, b) for a, b in zip(ol, nl) if a != b]
            if len(ol) != len(nl) or len(diff) != 1 or not diff[0][0].startswith("A.3 display list of G11/loops2") or diff[0][0].replace(A3_OLD, A3_NEW) != diff[0][1]:
                fails.append("APPENDIX-A.tsv: differs other than in the A.3 SHA-256 prefix")
            else:
                index_report.append("APPENDIX-A.tsv: one line differs, the A.3 SHA-256 prefix %s -> %s (the figure of design 31 rev 7)" % (A3_OLD, A3_NEW))
            continue
        if p == "README.md":
            ol, nl = ob.decode("utf-8").split("\n"), nb.decode("utf-8").split("\n")
            sm = difflib.SequenceMatcher(None, ol, nl, autojunk=False)
            n_changed = sum(max(i2 - i1, j2 - j1) for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag != "equal")
            index_report.append("README.md: report file, %d lines differ or are added (old %d, new %d lines); judged by reading" % (n_changed, len(ol), len(nl)))
            continue
        if p == "SHA256SUMS":
            continue
        fails.append("%s: differs and is neither a plan, a call stream nor an index file" % p)
    # SHA256SUMS must list every file with its true digest, and exactly the changed files' lines differ
    listed = {}
    for l in open(os.path.join(root, "SHA256SUMS"), "rb").read().decode("utf-8").split("\n"):
        if l:
            h, f = l.split(" *", 1)
            listed[f] = h
    for p in new_paths:
        if p == "SHA256SUMS":
            continue
        if listed.get(p) != hashlib.sha256(open(os.path.join(root, p), "rb").read()).hexdigest():
            fails.append("SHA256SUMS: wrong or missing digest for %s" % p)
    for p in sorted(set(listed) - set(new_paths)):
        fails.append("SHA256SUMS lists a file that does not exist: %s" % p)
    if "SHA256SUMS" in old_set:
        old_listed = {}
        for l in old_bytes("SHA256SUMS").decode("utf-8").split("\n"):
            if l:
                h, f = l.split(" *", 1)
                old_listed[f] = h
        differing = {f for f in set(old_listed) | set(listed) if old_listed.get(f) != listed.get(f)}
        if differing != changed_paths - {"SHA256SUMS"}:
            fails.append("SHA256SUMS: the lines that differ are not exactly the changed files: %s" % sorted(differing ^ (changed_paths - {"SHA256SUMS"})))
        index_report.append("SHA256SUMS: %d of %d lines differ, exactly the changed files (16 plans + the index files)" % (len(differing), len(listed)))

    print("files in OLD %d, in NEW %d" % (len(old_paths), len(new_paths)))
    print("byte-identical: %d" % unchanged)
    print("changed builder outputs (identical after masking the label x and y): %d files" % len(moved_files))
    print("label runs in them %d, moved %d (node labels %d, edge labels %d); every move is a whole number of pixels" % (labels_total, labels_moved, nodes_moved, edges_moved))
    for p, n, mv in moved_files:
        print("    %-22s %4d labels, %4d moved" % (p, n, mv))
    print("derived change allowed: the plan length")
    for p, a, b in size_report:
        if a != b:
            print("    %-22s %6d -> %6d bytes" % (p, a, b))
    for l in index_report:
        print("index: " + l)
    if fails:
        print("FAIL (%d):" % len(fails))
        for f in fails:
            print("  " + f)
        return 1
    print("OK: no file differs from the old corpus except in the x and y of label runs (and the appended and index files)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
