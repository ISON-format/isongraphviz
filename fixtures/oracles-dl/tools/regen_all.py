"""Regenerate the whole oracles-dl corpus into OUTDIR, in the order the corpus was built (design 31 rev 7, ruling R-H).

    python -B -I tools/regen_all.py OUTDIR [--no-matrix]

  1. gen.py --out OUTDIR            the 432 rows of the base generation, with the label placement LP/1 (every `T` and `fillText` position)
  2. gen.py --no-matrix, LP off     the same rows with the pre-LP/1 positions (environment ORACLE_DL_LP=0), into a temporary directory
  3. the files of OUTDIR whose bytes differ from step 2 (lists and call streams that hold a moved label) are swapped for the pre-LP/1 bytes, so that
     the gap, rev 6 and rev 7 tools, which derive hand-built inputs (bad lists, accepted controls, edited call streams) from them, build exactly the
     inputs they always built (A-62); then gap_dl.py, gap_finish_dl.py, rev6_dl.py, rev6_finish_dl.py, rev7_dl.py, rev7_finish_dl.py run
  4. the LP/1 bytes of the swapped files are put back
  5. lp_dl.py                       rows G12-G15, mutants K246-K256, documents, SHA256SUMS

Environment: PYTHONHASHSEED and PYTHONIOENCODING are passed on; the result does not depend on the seed.
"""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def run(script, *args, env=None):
    e = dict(os.environ)
    e.update(env or {})
    e.setdefault("PYTHONIOENCODING", "utf-8")
    r = subprocess.run([sys.executable, "-B", "-I", os.path.join(HERE, script)] + list(args), env=e)
    if r.returncode != 0:
        raise SystemExit("step %s failed (%d)" % (script, r.returncode))


def walk(root):
    out = {}
    for r, ds, fs in os.walk(root):
        ds[:] = [d for d in ds if d not in ("tools", "__pycache__")]
        for f in fs:
            p = os.path.relpath(os.path.join(r, f), root).replace("\\", "/")
            out[p] = os.path.join(r, f)
    return out


def main(argv):
    out = os.path.abspath(argv[0])
    flags = argv[1:]
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    run("gen.py", "--out", out, *flags)
    with tempfile.TemporaryDirectory() as leg:
        run("gen.py", "--no-matrix", "--out", leg, env={"ORACLE_DL_LP": "0"})
        a, b = walk(out), walk(leg)
        swapped = {}
        for p, fp in sorted(a.items()):
            if (p.startswith("dl/") or p.startswith("calls/")) and p in b:
                new = open(fp, "rb").read()
                old = open(b[p], "rb").read()
                if new != old:
                    swapped[p] = new
                    with open(fp, "wb") as f:
                        f.write(old)
        print("swapped %d files to the pre-LP/1 bytes for the derived inputs" % len(swapped))
    for step in ("gap_dl.py", "gap_finish_dl.py", "rev6_dl.py", "rev6_finish_dl.py", "rev7_dl.py", "rev7_finish_dl.py"):
        run(step, out)
    for p, new in swapped.items():
        with open(os.path.join(out, p), "wb") as f:
            f.write(new)
    run("lp_dl.py", out)
    print("REGEN_DONE", out)


if __name__ == "__main__":
    main(sys.argv[1:])
