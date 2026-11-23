"""Regenerate the whole oracles-gl corpus into OUTDIR, in the order the corpus was built (design 31 rev 7, ruling R-H).

    python -B -I tools/regen_all.py OUTDIR [--no-matrix]

  1. gl.py --out OUTDIR      the 279 base rows (with the label placement LP/1 in the list builder, tools/dlist.py) and the mutant matrix K01-K129
  2. gap_gl.py, gap_finish_gl.py     the rows and mutants added after the rev 5 gap review (K130-K156)
  3. rev6_gen.py, rev6_finish.py     the rows and mutants added after design 31 rev 6 (K157-K172)
  4. lp_gl.py                the mutants K173-K177, documents, SHA256SUMS

No file is swapped for a pre-LP/1 one (unlike tools/regen_all.py of oracles-dl): the gap and rev 6 tools read the plans B12, B13, B14, G01, G05 and bad/BASE.glplan, and
what they derive from them (bad plans, accepted plans, readouts, controller logs) carries no label position, so it comes out byte-identical to the pre-LP/1 corpus
(proved by labelmove_check.py: the only changed expected files are the 16 plans of gl.py, and only in the x and y of label runs).
ORACLE_GL_LP=0 in the environment regenerates the pre-LP/1 corpus (used to prove that the chain still reproduces the old bytes).
Environment: PYTHONHASHSEED and PYTHONIOENCODING are passed on; the result does not depend on the seed.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run(script, *args):
    e = dict(os.environ)
    e.setdefault("PYTHONIOENCODING", "utf-8")
    r = subprocess.run([sys.executable, "-B", "-I", os.path.join(HERE, script)] + list(args), env=e)
    if r.returncode != 0:
        raise SystemExit("step %s failed (%d)" % (script, r.returncode))


def main(argv):
    out = os.path.abspath(argv[0])
    flags = argv[1:]
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    run("gl.py", "--out", out, *flags)
    for step in ("gap_gl.py", "gap_finish_gl.py", "rev6_gen.py", "rev6_finish.py"):
        run(step, out)
    if os.environ.get("ORACLE_GL_LP", "1") != "0":
        run("lp_gl.py", out)
    print("REGEN_DONE", out)


if __name__ == "__main__":
    main(sys.argv[1:])
