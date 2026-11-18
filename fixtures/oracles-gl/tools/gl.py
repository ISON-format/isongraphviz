"""Driver of the oracles-gl generator (standard library only, Python 3.12).

  python tools/gl.py                  regenerate the whole corpus in place (about a minute; includes the mutant matrix)
  python tools/gl.py --out DIR        the same into DIR (byte-identity proof: two runs, diff -r)
  python tools/gl.py --no-matrix      skip the mutant matrix (MUTANTS.tsv is then not written)
  python tools/gl.py --mutant K12     run one mutant over every row and list the rows that change
  python tools/gl.py --check-appendix print the Appendix A reproduction table only
"""
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import appx  # noqa: E402
import doc  # noqa: E402
import exe  # noqa: E402
import ju  # noqa: E402
import mut  # noqa: E402
import rows  # noqa: E402
import rows2  # noqa: E402
import scenes  # noqa: E402
import scn  # noqa: E402
import selfcheck  # noqa: E402

FAMILY_ORDER = "GBHWXEUPDK"
NK = 129
TAB = chr(9)
LF = chr(10)


def kid(i):
    return "K%02d" % i if i < 100 else "K%d" % i


def _guard(name, fn, baseline_ids, store):
    try:
        return fn()
    except Exception as e:  # a mutant that makes the reference raise: every row of the family counts as changed
        store.append((name, repr(e)[:120]))
        return [rows.Row(i, error="EXCEPTION") for i in baseline_ids.get(name, [])]


def compute(mutant=None, info=None, baseline_ids=None, exc=None):
    """all rows of the corpus under the reference (or under one mutant); returns list of Row"""
    mut.set_active({mutant} if mutant else set())
    baseline_ids = baseline_ids or {}
    exc = exc if exc is not None else []
    allrows = []
    try:
        R = {}
        R["G"] = _guard("G", rows.rows_G, baseline_ids, exc)
        Gb = {r.id: r.files.get("plan/%s.glplan" % r.id, b"") for r in R["G"]}
        R["B"] = _guard("B", rows.rows_B, baseline_ids, exc)
        R["H"] = _guard("H", rows.rows_H, baseline_ids, exc)
        wr = _guard("W", rows.rows_W, baseline_ids, exc)
        if isinstance(wr, tuple):
            R["W"], bads, base = wr
            if info is not None:
                info["bads"], info["wbase"] = bads, base
        else:
            R["W"] = wr
        R["X"] = _guard("X", lambda: rows.rows_X(Gb), baseline_ids, exc)
        R["E"] = _guard("E", rows.rows_E, baseline_ids, exc)
        R["U"] = _guard("U", lambda: rows2.rows_U_renderer() + rows2.rows_U_outcomes(Gb) + rows2.rows_U_ctl(Gb), baseline_ids, exc)
        R["P"] = _guard("P", rows2.rows_P, baseline_ids, exc)
        R["D"] = rows2.rows_D()
        R["K"] = [rows.Row(kid(i)) for i in range(1, NK + 1)]
        for f in FAMILY_ORDER:
            rs = sorted(R[f], key=lambda r: int(r.id[1:]))
            allrows.extend(rs)
    finally:
        mut.set_active(set())
    return allrows


def design_mutants():
    """the GL mutant table of 13.5, parsed from the design: id -> (mutation text, [named killer rows])"""
    t = appx.design_text()
    a = t.index("**`oracles-gl`.**")
    b = t.index("### 13.6")
    out = {}
    for ln in t[a:b].split(LF):
        if ln.startswith("| K"):
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            out[cells[0]] = (cells[1], [x.strip() for x in cells[2].split(",")])
    return out


def sigs(rs):
    return {r.id: r.sig() for r in rs}


def matrix(base_rows, only=None):
    """run every mutant over every row; returns list of dict records"""
    table = design_mutants()
    base = sigs(base_rows)
    ids = {}
    for r in base_rows:
        ids.setdefault(r.id[0], []).append(r.id)
    out = []
    for i in range(1, NK + 1):
        k = kid(i)
        if only and k not in only:
            continue
        exc = []
        got = sigs(compute(k, baseline_ids=ids, exc=exc))
        changed = [r for r in base if base[r] != got.get(r)]
        named = table[k][1]
        killing = [r for r in named if r in changed]
        notkill = [r for r in named if r not in changed]
        other = [r for r in changed if r not in named]
        if killing:
            verdict = "KILLED" if not notkill else "KILLED (row-does-not-kill: %s)" % ",".join(notkill)
        elif changed:
            verdict = "NAMED-ROWS-DO-NOT-KILL (changed only: %s)" % ",".join(changed[:12])
        else:
            verdict = "UNKILLABLE (no row changes)"
        out.append({"mutant": k, "description": table[k][0], "named": named, "killing": killing, "notkilling": notkill, "other": other,
                    "verdict": verdict, "exceptions": exc})
    return out


def matrix_tsv(res):
    lines = [TAB.join(["mutant", "description", "named_killers", "killing_rows", "named_not_killing", "other_changed_rows", "verdict"])]
    for r in res:
        lines.append(TAB.join([r["mutant"], r["description"], ",".join(r["named"]), ",".join(r["killing"]), ",".join(r["notkilling"]), ",".join(r["other"]), r["verdict"]]))
    return (LF.join(lines) + LF).encode("utf-8")


def appendix_tsv(res):
    lines = [TAB.join(["item", "status", "detail"])]
    for item, status, detail in res:
        lines.append(TAB.join([item, status, detail]))
    return (LF.join(lines) + LF).encode("utf-8")


def collect_files(rs, extra):
    """path -> bytes for the whole corpus (rows, authored inputs, shaders, extra generated documents)"""
    files = {}

    def put(path, b):
        if path in files and files[path] != b:
            raise AssertionError("two different contents for " + path)
        files[path] = b

    for p, b in scn.AUTH.items():
        put(p, b)
    for r in rs:
        for p, b in r.files.items():
            put(p, b)
    for p, b in extra.items():
        put(p, b)
    return files


def expect_tsv(rs):
    lines = [TAB.join(["id", "group", "tier", "scene", "layout", "input", "expected", "error"])]
    for r in rs:
        cells = [r.id, r.group, r.tier, r.scene, r.layout, r.input_text(), r.expected, r.error]
        for c in cells:
            assert TAB not in c and LF not in c, (r.id, c)
        lines.append(TAB.join(cells))
    return (LF.join(lines) + LF).encode("utf-8")


def sha256sums(files):
    out = []
    for p in sorted(files, key=lambda x: x.encode("utf-8")):
        out.append("%s *%s" % (ju.sha256_hex(files[p]), p))
    return (LF.join(out) + LF).encode("utf-8")


def write_tree(out_dir, files):
    os.makedirs(out_dir, exist_ok=True)
    for name in os.listdir(out_dir):
        if name == "tools":
            continue
        p = os.path.join(out_dir, name)
        if os.path.isdir(p):
            shutil.rmtree(p)
        else:
            os.remove(p)
    for p, b in files.items():
        full = os.path.join(out_dir, *p.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(b)


def shader_files():
    import shaders
    out = {}
    for k, s in sorted(shaders.SOURCES.items()):
        out["shaders/%s.glsl" % k] = s.encode("utf-8")
    out["shaders/SHADER_SET_SHA256"] = (ju.sha256_hex(exe.shader_set_bytes()) + LF).encode("utf-8")
    return out


def main(argv):
    scenes.build_all()
    if "--check-appendix" in argv:
        res = appx.check(rows.mk, None)
        for r in res:
            print(r[1], "|", r[0], "|", r[2])
        return 0 if all(r[1] == "REPRODUCED" for r in res) else 1
    if "--mutant" in argv:
        k = argv[argv.index("--mutant") + 1]
        base = sigs(compute())
        got = sigs(compute(k))
        print(k, "changes:", [i for i in base if base[i] != got.get(i)])
        return 0
    out_dir = os.path.join(scn.CORPUS)
    if "--out" in argv:
        out_dir = os.path.abspath(argv[argv.index("--out") + 1])
    info = {}
    base_rows = compute(info=info)
    ap = appx.check(rows.mk, None)
    bad = [r for r in ap if r[1] != "REPRODUCED"]
    if bad:
        print("APPENDIX A DISAGREES:", bad)
    checks = selfcheck.run(base_rows, info)
    res = None
    if "--no-matrix" not in argv:
        res = matrix(base_rows)
    extra = {}
    extra.update(shader_files())
    extra["APPENDIX-A.tsv"] = appendix_tsv(ap)
    if res is not None:
        extra["MUTANTS.tsv"] = matrix_tsv(res)
    extra["generated/GENERATED.tsv"] = (TAB.join(["id", "role", "path", "bytes", "sha256"]) + LF).encode("utf-8")
    extra["EXPECT.tsv"] = expect_tsv(base_rows)
    extra["README.md"] = doc.readme(base_rows, ap, res, checks).encode("utf-8")
    extra["AMBIGUITIES.md"] = doc.ambiguities(base_rows, res, checks).encode("utf-8")
    files = collect_files(base_rows, extra)
    files["SHA256SUMS"] = sha256sums(files)
    write_tree(out_dir, files)
    print("wrote", len(files), "files to", out_dir)
    print("rows:", len(base_rows))
    print("SHA256SUMS sha256:", ju.sha256_hex(files["SHA256SUMS"]))
    return 0 if not bad else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
