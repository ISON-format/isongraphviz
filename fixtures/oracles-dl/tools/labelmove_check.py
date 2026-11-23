"""Proof that the label placement LP/1 (ruling R-H, 2026-11-22) changed nothing but label positions in the oracles-dl corpus.

    python -B -I tools/labelmove_check.py [--old-ref REF] [--root DIR] [--old-dir DIR]

OLD is `git show REF:fixtures/oracles-dl/<path>` (default REF = HEAD, run from the repository) or, with --old-dir, a directory holding the old corpus;
NEW is the working tree (--root, default the directory above tools/).  For every path of either side outside tools/:

  * byte-identical                                   -> counted as unchanged
  * a `.dl` file or a `.calls` file that differs     -> BOTH sides are masked (the x and y of every `T` record, the x and y operands of every `fillText` call
                                                        are replaced by a constant) and the masked texts must be byte-identical; the labels whose (x, y) differ
                                                        are counted
  * the append-only files EXPECT.tsv, MUTANTS.tsv, AMBIGUITIES.md -> the old content must be an exact prefix (EXPECT.tsv and MUTANTS.tsv: every old line
                                                        unchanged and in place, new lines only at the end)
  * README.md, SHA256SUMS, APPENDIX-A.tsv             -> index and report files: listed with the number of changed lines; SHA256SUMS must list every file with its
                                                        true digest, README.md is judged by reading
  * a file only in NEW                                -> allowed only if it is in NEW_ALLOWED (the files of the rows added for LP/1)
  * anything else that differs, a file only in OLD    -> FAIL

Exit status 0 iff there is no FAIL.  Standard library only.
"""
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REL = "fixtures/oracles-dl"

APPEND_ONLY_LINES = ("EXPECT.tsv", "MUTANTS.tsv")
APPEND_ONLY_TEXT = ("AMBIGUITIES.md",)
INDEX_FILES = ("README.md", "SHA256SUMS", "APPENDIX-A.tsv")
# files added for LP/1: the scene, layout, state and expected list of each of the rows G12-G15
NEW_ALLOWED_PREFIXES = tuple("%s/%s." % (d, n) for d, names in (("scenes", ("lpfrac", "lphid", "lpunl", "lpastral")), ("layouts", ("lpfrac", "lphid", "lpunl", "lpastral")),
                                                                  ("states", ("G12", "G13", "G14", "G15")), ("dl", ("G12", "G13", "G14", "G15"))) for n in names)


def mask_dl(data):
    out = []
    moved = 0
    for line in data.split(b"\n"):
        if line.startswith(b'["T",'):
            rec = json.loads(line.decode("utf-8"))
            rec[3], rec[4] = 0, 0
            out.append(json.dumps(rec, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
        else:
            out.append(line)
    return b"\n".join(out)


def t_records(data):
    return [json.loads(l.decode("utf-8")) for l in data.split(b"\n") if l.startswith(b'["T",')]


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


def moved_count(kind, old, new):
    a = t_records(old) if kind == "dl" else fill_records(old)
    b = t_records(new) if kind == "dl" else fill_records(new)
    assert len(a) == len(b)
    if kind == "dl":
        return len(b), sum(1 for x, y in zip(a, b) if x[3:5] != y[3:5])
    return len(b), sum(1 for x, y in zip(a, b) if x[3:5] != y[3:5])


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
    moved_files, fails, labels_total, labels_moved = [], [], 0, 0
    per_kind = {"dl": [0, 0, 0], "calls": [0, 0, 0]}   # files changed, labels, labels moved
    index_report, new_files = [], []
    for p in sorted(old_set | new_set):
        if p not in new_set:
            fails.append("%s: removed" % p)
            continue
        nb = open(os.path.join(root, p), "rb").read()
        if p not in old_set:
            if p.startswith(NEW_ALLOWED_PREFIXES):
                new_files.append(p)
            else:
                fails.append("%s: new file not allowed" % p)
            continue
        ob = old_bytes(p)
        if ob == nb:
            unchanged += 1
            continue
        if p.startswith("dl/") and p.endswith(".dl"):
            kind, mk = "dl", mask_dl
        elif p.startswith("calls/") and p.endswith(".calls"):
            kind, mk = "calls", mask_calls
        else:
            kind = None
        if kind:
            if mk(ob) != mk(nb):
                fails.append("%s: differs outside the x and y of the label records" % p)
                continue
            n, mv = moved_count(kind, ob, nb)
            if mv == 0:
                fails.append("%s: differs, but no label moved" % p)
                continue
            per_kind[kind][0] += 1
            per_kind[kind][1] += n
            per_kind[kind][2] += mv
            moved_files.append((p, n, mv))
            continue
        if p in APPEND_ONLY_LINES:
            ol, nl = ob.split(b"\n"), nb.split(b"\n")
            if ol[-1] == b"":
                ol = ol[:-1]
            if nl[:len(ol)] != ol:
                fails.append("%s: an old line changed" % p)
            else:
                index_report.append("%s: append-only, %d lines appended" % (p, len(nl) - 1 - len(ol)))
            continue
        if p in APPEND_ONLY_TEXT:
            if not nb.startswith(ob):
                fails.append("%s: the old text is not an exact prefix" % p)
            else:
                index_report.append("%s: append-only, %d bytes appended" % (p, len(nb) - len(ob)))
            continue
        if p in INDEX_FILES:
            ol, nl = ob.split(b"\n"), nb.split(b"\n")
            ch = sum(1 for a, b in zip(ol, nl) if a != b) + abs(len(ol) - len(nl))
            index_report.append("%s: index/report file, %d lines differ (old %d, new %d lines)" % (p, ch, len(ol), len(nl)))
            continue
        fails.append("%s: differs and is neither a list, a call stream nor an index file" % p)
    # SHA256SUMS must list every file with its true digest
    sums = open(os.path.join(root, "SHA256SUMS"), "rb").read().decode("utf-8")
    listed = {}
    for l in sums.split("\n"):
        if l:
            h, f = l.split(" *", 1)
            listed[f] = h
    for p in new_paths:
        if p == "SHA256SUMS":
            continue
        if listed.get(p) != hashlib.sha256(open(os.path.join(root, p), "rb").read()).hexdigest():
            fails.append("SHA256SUMS: wrong or missing digest for %s" % p)
    extra = sorted(set(listed) - set(new_paths))
    for p in extra:
        fails.append("SHA256SUMS lists a file that does not exist: %s" % p)

    print("files in OLD %d, in NEW %d" % (len(old_paths), len(new_paths)))
    print("byte-identical: %d" % unchanged)
    print("changed builder outputs (identical after masking the label x and y): %d files" % len(moved_files))
    for kind in ("dl", "calls"):
        f, n, mv = per_kind[kind]
        print("  %-5s files %3d, label records in them %5d, labels moved %5d" % (kind, f, n, mv))
    print("labels moved in total: %d" % sum(v[2] for v in per_kind.values()))
    for p, n, mv in moved_files:
        print("    %-18s %4d labels, %4d moved" % (p, n, mv))
    print("new files (rows added for LP/1): %s" % (", ".join(new_files) or "none"))
    for l in index_report:
        print("index: " + l)
    if fails:
        print("FAIL (%d):" % len(fails))
        for f in fails:
            print("  " + f)
        return 1
    print("OK: no file differs from the old corpus except in the x and y of label records (and the appended and index files)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
