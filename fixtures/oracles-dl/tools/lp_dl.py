"""Rows and mutants appended to oracles-dl for the label placement LP/1 (design 37 rev 3, ruling R-H of 2026-11-22).

Run (after gen.py and the gap, rev 6 and rev 7 tools; tools/regen_all.py runs the whole chain):

    python -B -I tools/lp_dl.py [CORPUS_DIR]

It adds four rows (G12-G15, each with an authored scene, layout and state) and eleven mutants (K246-K256) for the integration of `placeLabels` into the
display list builder, appends them to EXPECT.tsv and MUTANTS.tsv, appends to AMBIGUITIES.md (A-61 to A-67), edits README.md (counts, a revision note, one
appended section) and regenerates SHA256SUMS over the whole corpus.  The rest of the corpus (every list and call stream that holds a label) was already
rewritten by tools/gen.py with the reference builder of tools/dl.py, which applies LP/1 by importing the reference of fixtures/oracles-lp/tools/lp.py.

Written from design 37 rev 3 and design 31 4.4(g); no TypeScript was read.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(HERE)

import gen  # noqa: E402
import core  # noqa: E402
import base  # noqa: E402
import scenes  # noqa: E402
import rows_a  # noqa: E402
import dl as D  # noqa: E402
from core import cjb  # noqa: E402


def rd(p):
    with open(os.path.join(ROOT, p), 'rb') as f:
        return f.read().decode('utf-8')


def wr(p, data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    assert b'\r' not in data
    fp = os.path.join(ROOT, p)
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    with open(fp, 'wb') as f:
        f.write(data)


def wr_new(p, data):
    assert not os.path.exists(os.path.join(ROOT, p)), 'refusing to overwrite ' + p
    wr(p, data)


def edit(text, pairs):
    for old, new in pairs:
        assert text.count(old) == 1, old
        text = text.replace(old, new)
    return text


# ------------------------------------------------------------------------------------------------------------- the four rows
# All four put two (or three) nodes on one horizontal line so that the default label boxes of design 37 section 4 collide; positions in layout
# thousandths, screen milli-pixels = layout thousandths for the identity viewport (centre (450000, 300000), zoom 1000, 900 x 600).
P = scenes.P
IDENT_VP = {"center_x": 450000, "center_y": 300000, "height": 600, "width": 900, "zoom": 1000}
FRAC_VP = {"center_x": 450000, "center_y": 300000, "height": 600, "width": 900, "zoom": 1001}
ROWS = []          # (id, scene name, state name, description)


def build_rows():
    # G12: two nodes 9990 layout units apart at zoom 1001: 9,999,990 micro-pixels, 9.999990 px.  Two one-unit labels collide iff the distance is below
    # 9u + 1 = 10 px (rev 3 width model, 9 px per unit), so they collide on the micro-pixel positions, while the milli-pixel positions are 10 px apart exactly (A-63): the placement must read
    # the micro-pixel defaults (the rounded ones would see no collision), and the offset is added before the rounding.
    sb, lb = scenes.add_scene("lpfrac", False, [P("s:a"), P("s:b")], [], {"s:a": (450300, 300000), "s:b": (460290, 300000)})
    m = core.build_model(sb, lb)
    rows_a.put_state("G12", rows_a.mkstate(m, FRAC_VP))
    ROWS.append(("G12", "lpfrac", "two colliding node labels 9.99999 px apart (zoom 1001): the collision exists only in micro-pixels"))
    # G13: as G12 on the identity viewport (6 px apart) plus a third node `h` 30 px above `b`, HIDDEN in the state: a hidden node is not an obstacle.
    sb, lb = scenes.add_scene("lphid", False, [P("s:a"), P("s:b"), P("s:h")], [], {"s:a": (440000, 300000), "s:b": (446000, 300000), "s:h": (446000, 270000)})
    m = core.build_model(sb, lb)
    rows_a.put_state("G13", rows_a.mkstate(m, IDENT_VP, hidN=["s:h"]))
    ROWS.append(("G13", "lphid", "a hidden node sits where the second candidate of the colliding label would be: it takes no part"))
    # G14: the same with the third node VISIBLE and without a label (id `s:`, an empty label is not drawn): a drawn node is an obstacle, label or not.
    sb, lb = scenes.add_scene("lpunl", False, [P("s:a"), P("s:b"), P("s:")], [], {"s:a": (440000, 300000), "s:b": (446000, 300000), "s:": (446000, 270000)})
    m = core.build_model(sb, lb)
    rows_a.put_state("G14", rows_a.mkstate(m, IDENT_VP))
    ROWS.append(("G14", "lpunl", "a drawn node without a label is an obstacle"))
    # G15: a label of two astral scalars (four UTF-16 units) 17 px from a one-unit label: the boxes collide with units counted in UTF-16 (half widths
    # 18 + 4.5 + 1 = 23.5 px under rev 3) and not with code points (9 + 4.5 + 1 = 14.5 px).
    astral = "s:\U0001F600\U0001F600"
    sb, lb = scenes.add_scene("lpastral", False, [P(astral), P("s:b")], [], {astral: (440000, 300000), "s:b": (457000, 300000)})
    m = core.build_model(sb, lb)
    rows_a.put_state("G15", rows_a.mkstate(m, IDENT_VP))
    ROWS.append(("G15", "lpastral", "units are UTF-16 units: an astral label is wider than its scalar count says"))
    for rid, name, _ in ROWS:
        rows_a.reg_dl(rid, "both", rows_a.OWN(name), rows_a.inp(state="states/%s.state.json" % rid))


# -------------------------------------------------------------------------------------------------------------- the mutants
MUTANTS = [
    ("K246", "label placement skipped (every label stays at its default position)", ["G08", "G12"]),
    ("K247", "the placement offset is applied to x only (dy dropped)", ["G08", "G12", "G13"]),
    ("K248", "the placement offset is applied to y only (dx dropped)", ["G08", "G11"]),
    ("K249", "labels are handed to the placement in the order edge labels, then node labels (the records stay node labels first)", ["G08", "N17"]),
    ("K250", "the placement runs on the milli-pixel rounded defaults (the rounding is done before the placement, not after the offset)", ["G12"]),
    ("K251", "node labels and edge labels are placed by two separate calls (the edge call does not see the node labels)", ["G08", "N17"]),
    ("K252", "hidden nodes are obstacles of the placement", ["G13"]),
    ("K253", "the units of a label are counted before the elision (the length of the label, not of the drawn text)", ["G07", "F04"]),
    ("K254", "node obstacles ignored (labels avoid labels only)", ["G08", "G14"]),
    ("K255", "only nodes that have a drawn label are obstacles", ["G14"]),
    ("K256", "units counted in Unicode scalars instead of UTF-16 units", ["G15"]),
]


def mask_t(data):
    """the list with the x and y of every T record replaced by 0 (labelmove_check.py uses the same mask)"""
    out = []
    for line in data.split(chr(10).encode()):
        if line.startswith(b'["T",'):
            r = json.loads(line.decode("utf-8"))
            r[3], r[4] = 0, 0
            line = json.dumps(r, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        out.append(line)
    return chr(10).encode().join(out)


def regen_earlier_builder_outputs():
    """Y20 and Y20b are expected outputs of the builder (row Y20, `also`), but tools/gap_dl.py wrote them from its own list model on the pre-LP/1 lists
    (A-62): rebuild them with the reference builder and check that only the x and y of the T records differ."""
    exp = {l.split(chr(9))[0]: l.split(chr(9)) for l in rd("EXPECT.tsv").split(chr(10))[1:] if l}
    row = exp["Y20"]
    inp = json.loads(row[5])
    mdl = base.model_of(row[3], row[4])
    n = 0
    for state, path in ((inp["state"], row[6]), (inp["also"][0]["state"], inp["also"][0]["expected"])):
        st = json.loads(rd(state))
        new = D.serialize_dl(D.build_dl(mdl, st))
        old = open(os.path.join(ROOT, path), "rb").read()
        assert mask_t(new) == mask_t(old), path
        assert new != old, path
        wr(path, new)
        n += 1
    return n


def key(rid):
    return (rid[0], int(''.join(c for c in rid[1:] if c.isdigit())), rid)


def main():
    assert regen_earlier_builder_outputs() == 2
    gen.setup()
    build_rows()
    outs = gen.baseline()
    new_ids = [r[0] for r in ROWS]
    # the files of the new rows
    for rid, name, _ in ROWS:
        for p in ("scenes/%s.scene.json" % name, "layouts/%s.layout.json" % name, "states/%s.state.json" % rid):
            wr_new(p, scenes.CORPUS[p])
        o = outs[rid]
        assert not o.error, (rid, o.error)
        for p, b in o.files.items():
            wr_new(p, b)
    # EXPECT.tsv rows (the same serializer as the generator)
    exp_lines = {l.split("\t")[0]: l for l in gen.build_expect(outs).decode("utf-8").split("\n") if l}
    have = rd("EXPECT.tsv")
    for rid in new_ids:
        assert ("\n" + rid + "\t") not in have, rid
    # the mutant matrix over every non-K row of the generator and the four new rows
    base_keys = {rid: o.key() for rid, o in outs.items()}
    rows = [r for r in base.ROWS if r.group != "K"]
    mut_lines, res = [], {}
    for kid, desc, named in MUTANTS:
        core.MUT.clear()
        core.MUT.add(kid)
        changed = []
        try:
            for r in rows:
                if base.run_row(r).key() != base_keys[r.id]:
                    changed.append(r.id)
        finally:
            core.MUT.clear()
        changed.sort(key=key)
        named = sorted(set(named), key=key)
        kill = [n for n in named if n in changed]
        miss = [n for n in named if n not in changed]
        other = [c for c in changed if c not in named]
        verdict = "killed" if kill and not miss else "NOT KILLED"
        mut_lines.append("\t".join([kid, desc, ",".join(named), ",".join(kill), ",".join(miss), ",".join(other), verdict]))
        res[kid] = (kill, miss, other, verdict)
        print(kid, verdict, "named", named, "other", other)
        assert verdict == "killed", (kid, res[kid])
    k_rows = ["\t".join((k, "K", "", "", "", "", "", "")) for k, _, _ in MUTANTS]
    for k in (m[0] for m in MUTANTS):
        assert ("\n" + k + "\t") not in have, k
    with open(os.path.join(ROOT, "EXPECT.tsv"), "ab") as f:
        f.write(("\n".join([exp_lines[r] for r in new_ids] + k_rows) + "\n").encode("utf-8"))
    with open(os.path.join(ROOT, "MUTANTS.tsv"), "ab") as f:
        f.write(("\n".join(mut_lines) + "\n").encode("utf-8"))
    # documents
    amb = rd("AMBIGUITIES.md")
    assert "A-61" not in amb and amb.endswith("\n") and not amb.endswith("\n\n")
    wr("AMBIGUITIES.md", amb + AMB)
    rm = edit(rd("README.md"), README_EDITS)
    assert "Additions for the label placement LP/1" not in rm and rm.endswith("\n") and not rm.endswith("\n\n")
    wr("README.md", rm + README_ADD)
    out_sums, n = sums()
    wr("SHA256SUMS", out_sums)
    print("new files", n, "SHA256SUMS digest", hashlib.sha256(out_sums.encode()).hexdigest())


def sums():
    fs = []
    for d, ds, ns in os.walk(ROOT):
        for n in ns:
            p = os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, '/')
            if p.startswith('tools/') or p == 'SHA256SUMS' or '__pycache__' in p:
                continue
            fs.append(p)
    fs.sort(key=lambda p: p.encode('utf-8'))
    out = ''.join('%s *%s\n' % (hashlib.sha256(open(os.path.join(ROOT, p), 'rb').read()).hexdigest(), p) for p in fs)
    return out, len(fs)


AMB = """
## A-61  Ruling R-H: label positions change, nothing else (design 37 rev 3; design 31 4.1 and 4.4(g) rev 7)

* **Design text.** Design 37 section 1 and 9, the owner decision of 2026-11-22 recorded as ruling R-H (execution plan, last lines): label overlaps are fixed in the real renderer code, the new placement LP/1 is the default, the expected bytes of the DRAFT corpora are regenerated for it, as an explicit exception to the ledger rule R-C that covers only the expected label-position bytes. 31 4.4(g) now says the `T` position is the default position plus the whole-pixel offset of `placeLabels`.
* **Reading used.** Every `T` record and every `fillText` call of a builder output is written at `default + placeLabels(...)`. The placement function is the Python reference of `fixtures/oracles-lp/tools/lp.py`, imported by path (`tools/dl.py` loads that file alone with `importlib`, after checking its SHA-256 `1c62862f...29b95` (rev 3 of design 37; see A-67); this corpus never reads TypeScript). No other byte of any expected file changes: `tools/labelmove_check.py` replaces the x and y of every `T` record and of every `fillText` call by a constant in the old (`git show HEAD:...`) and the new file and requires byte identity, and requires every other file to be byte-identical (append-only files, index files and the four new rows excepted).
* **Why / status.** Ruled by the owner; not an ambiguity of the text. Recorded so that a reader of a future diff of this corpus finds the one authorised exception.

## A-62  Which files are builder outputs (regenerated) and which are hand-built inputs (not regenerated)

* **Design text.** The ruling covers the expected label-position bytes; 13.2 says which cell of a row is an input and which an expected file.
* **Reading used, row class by row class.** Regenerated (builder outputs, expected cells; the files and the number of moved labels are listed by `labelmove_check.py`): the `.dl` files of the G, N, X, Y, O, F rows that hold a colliding label (29 files: `dl/F04`, `G05`, `G07`, `G08`, `G09`, `G11`, `N01`-`N03`, `N05`-`N08`, `N06b`, `N06c`, `N16`, `N17`, `X02`-`X05`, `X10`, `X11`, `Y08`, `Y11`, `Y12`, `Y17`, `Y20`, `Y20b`; `Y20` and `Y20b` were written by `tools/gap_dl.py` from its own list model on the old lists, so `lp_dl.py` rebuilds them with the reference builder and checks that only the x and y of the `T` records differ) and the Canvas call streams of the C rows (`calls/C03`, `C07`, `C19`, `C20`: the `fillText` operands). Byte-identical to the old corpus, because they hold no label position or no label of theirs moves: every other `dl/` and `calls/` file, the readouts and compare results (`xr/`: a readout has the label text and the unit total, never a position), the pick buffers and bounds (labels are not hit-tested and have no extent in 5.1/5.4), the device sizes, the manifests, witnesses and outcome files (`json/`), the lifecycle scripts, the lists and states recorded by the U rows (`*.cK.dl`, `*.cK.state.json`), the states, scenes and layouts, and `inputs/*.json`. Hand-built inputs, NOT regenerated, although the generator derives them from expected files by editing: the bad lists `bad/S02`-`bad/S57` and `bad/S64`, the accepted controls `dl/S58`, `dl/S59`, `dl/S61`-`dl/S63`, and the call streams `calls/R45`-`calls/R63`; the lists and streams are built from the pre-LP/1 lists (`D.LP_ON` is switched off while `tools/rows_a.py` builds the bad lists, and `tools/regen_all.py` hands the gap, rev 6 and rev 7 tools the pre-LP/1 lists), so their `T` positions are the old ones. The reader and the stream reader check only coordinate ranges of `T` (D9) and no S or R row compares a position with the builder; `labelmove_check.py` shows every one of these files byte-identical to the old corpus.
* **Why / status.** Reading of the owner instruction ("hand-built bad/ input files are inputs ... they are NOT regenerated; if a row is an expected output of the builder it is"). The reader accepts both position sets, so no verdict depends on the choice.

## A-63  The offset is added to the micro-pixel default before the rounding to milli-pixels

* **Design text.** 37 section 2: "the renderer adds `dx`, `dy` (times 10^6) to `x`, `y`"; section 1: the placement works on micro-pixels before the final rounding; 31 4.4(b): rounding happens once, from the micro-pixel value.
* **Reading used.** `T.x = m(x + dx * 10^6)`, `T.y = m(y + dy * 10^6)` with the default `(x, y)` in micro-pixels exactly as before (`(X, Y + 24 * 10^6)` and `(ax, ay - 4 * 10^6)`). Because a whole pixel is a multiple of 1000 micro-pixels the offset commutes with `m`; what matters is that the placement itself runs on the micro-pixel defaults: two labels 9.99999 px apart collide, the same labels rounded to milli-pixels are exactly 10 px apart and do not (row G12; mutant K250).
* **Why / status.** Reading from the text; the micro-pixel defaults are the input of `placeLabels` (37 section 2).

## A-64  The gate on `oracles-svg` covers its data, not its expected documents

* **Design text.** 13.1 (self-containment): this corpus reads the scenes, layouts and states of `oracles-svg` by path; before this ruling the generator stopped when the digest of the whole `SHA256SUMS` of `oracles-svg` changed.
* **Reading used.** `oracles-svg` is regenerated for LP/1 under the same ruling (its `svg/` documents carry the same label positions), so the gate of `tools/gen.py` now requires the 88 lines of its `scenes/`, `layouts/` and `states/` that the pre-LP/1 corpus consumed (kept in `tools/svg_data_pins.txt`, digest `7b0912c9...a617`) to be present unchanged in its `SHA256SUMS`: the data this generator actually uses. Files that `oracles-svg` adds later (it appends rows for LP/1) do not matter. The documents `svg/*.svg` and `EXPECT.tsv` of `oracles-svg` are read only for the readout scrape of the R12-R15 rows and for the informational checks of `inputs/self-checks.json`; the scrape never looks at a label position. The self-check `c_v5_parity_vs_oracles_svg_documents` compares the list positions of every pair with the printed SVG numbers: with the regenerated `oracles-svg` it is `true` for every pair (the two independent oracles agree on every label position), with the pre-LP/1 documents it reports `DIFF` on the moved labels.
* **Why / status.** Editorial; no expected byte depends on it. The README statement about the digest of `SHA256SUMS` is left as it was written for the pre-LP/1 generation.

## A-65  New rows G12-G15 and mutants K246-K256

* **Design text.** The owner instruction asks for mutants of the integration (placement skipped, x only, y only, edge labels first, placement after the milli rounding, per-kind calls, hidden nodes as obstacles, units before the elision, node obstacles ignored) and for a row with fractional micro-pixel defaults.
* **Reading used.** G12 (fractional defaults, zoom 1001, K250), G13 (a hidden node on the second candidate, K252), G14 (a drawn node without a label, K255), G15 (an astral label, K256) are appended with authored scenes `lpfrac`, `lphid`, `lpunl`, `lpastral`, layouts and states. K246-K256 are switches of `tools/dl.py` (`lp_offsets`) run over every non-K row of the generator and the new rows; the table is in `MUTANTS.tsv`. The mutants that the existing G, N, X, Y, O, F, C rows already kill (K246-K249, K251, K253, K254) are named with their killers; K250, K252, K255, K256 are killed only by the new rows.
* **Why / status.** Editorial; append-only (ids G12-G15, K246-K256, A-61-A-67).

## A-66  Sizes pinned by existing rows do not move

* **Design text.** F01/F02 pin the byte limit 637 on G01, F04 pins the size of the hub list; A.9 quotes option sizes.
* **Reading used.** The changed files keep their line structure; some change size by 1 to 18 bytes (a coordinate gains or loses a digit: `N02` +18 is the largest, `G05`, `Y08`, `Y11`, `Y12`, `Y20`, `C03`, `C07` +1). No size pinned by a row moves: G01 stays 637 bytes (F01 and F02 pin 637 and 636), the size of the hub list pinned by F04 is unchanged (labels move but each coordinate keeps its digit count), G11 stays 1553 bytes, the option sizes of A.9 are those of G01 and Y07 (no label of either moves). The Appendix A figures: only A.3 (G11) changes, its SHA-256 (`3f9f4358...` to `273c0a57...`); `APPENDIX-A.tsv` is byte-identical to the old file.
* **Why / status.** Reading; checked by `labelmove_check.py` (a file that is not listed is byte-identical) and by the Appendix A reproduction table.

## A-67  Design 37 rev 3: the width model is 9 px per UTF-16 unit (the placement function changed, the integration did not)

* **Design text.** Design 37 rev 3 (2026-11-22): half width `4.5u` px (`4,500,000 * u` micro-pixels), `h = floor((9u + 1) / 2) + 14` for node labels and `+ 10` for edge labels; everything else as rev 2. `fixtures/oracles-lp` was regenerated (digest `564db749...b657`) and `tools/lp.py` changed.
* **Reading used.** The reference `lp.py` pin of `tools/dl.py` is now `1c62862f...29b95`; this corpus (A-61 to A-66, rows G12-G15, mutants K246-K256) was regenerated from it with no change of integration. The positions of every label are those of rev 3 (the 29 files of A-62 hold moved labels: `G07` is now among them, 33 files with the call streams); the x and y of `G11`'s label `R2` of pid 5 is 51100, the A.3 SHA-256 of design 31 is `6ff85140...8ef0`. Rows whose geometry depended on the width were re-picked: G12 now has its nodes 9990 layout units apart at zoom 1001 (9.99999 px, collision below `9u + 1 = 10` px, milli-pixel positions exactly 10 px apart); G13 and G14 (6 px apart) and G15 (17 px apart, UTF-16 reach `18 + 4.5 + 1 = 23.5` px against `9 + 4.5 + 1 = 14.5` px for scalars) keep their scenes. Every named killer of K246-K256 still kills (checked by the matrix of `tools/lp_dl.py`).
* **Why / status.** Editorial; ids unchanged (the meaning of no row or mutant changed, only a coordinate of G12's scene).

## Resolved for LP/1 (disposition; the entries above are unchanged)

Source: design 37 rev 3 and ruling R-H (2026-11-22); design 31 rev 7 (4.1, 4.4(g)). Append-only: no existing expected byte except the x and y of label records, no existing row, mutant or ambiguity line changes.

| Entry | Rule | Disposition | Rows and mutants |
|---|---|---|---|
| (new) | LP/1 label placement, R-H | the label positions of every builder output are regenerated from the reference `oracles-lp/tools/lp.py`; proof: `tools/labelmove_check.py` | all G, N, X, Y, O, F, C rows that hold a moved label; G12-G15 new; K246-K256 |
"""

README_EDITS = [
    ("37 rows and mutants were appended for it. A further 45 ids (rows S44-S64, mutants K222-K245) were appended for rule D13 of design 31 4.7 (the single-focus rule of the list reader, R31-05, ruled 2026-11-22); see the last section. Produced against",
     "37 rows and mutants were appended for it. A further 45 ids (rows S44-S64, mutants K222-K245) were appended for rule D13 of design 31 4.7 (the single-focus rule of the list reader, R31-05, ruled 2026-11-22). Design 31 is now rev 7 (2026-11-22): the label placement LP/1 (design 37 rev 3, ruling R-H): the `T` positions of every expected list and the `fillText` positions of every expected call stream are regenerated, and 15 ids (rows G12-G15, mutants K246-K256) were appended; see the last section. Produced against"),
    ("**540 rows** (432 of the rev 5 generation, the 26 gap rows, the 37 rows of the rev 6 section and the 45 rows of the D13 section)",
     "**555 rows** (432 of the rev 5 generation, the 26 gap rows, the 37 rows of the rev 6 section, the 45 rows of the D13 section and the 15 rows of the LP/1 section)"),
    ("| G | 11 | 0 | golden display lists |", "| G | 15 | 0 | golden display lists (G12-G15: label placement) |"),
    ("| K | 251 | 0 | mutants (empty cells) |", "| K | 262 | 0 | mutants (empty cells) |"),
    ("| **total** | **540** | **117** | D and K rows (257) have empty cells by design;",
     "| **total** | **555** | **117** | D and K rows (268) have empty cells by design;"),
    ("A-57 to A-60 and a D13 disposition section after rule D13)",
     "A-57 to A-60 and a D13 disposition section after rule D13, A-61 to A-67 and an LP/1 disposition section after ruling R-H)"),
    ("(56 entries,", "(67 entries,"),
]

README_ADD = """
## Additions for the label placement LP/1 (design 37 rev 3, design 31 rev 7, ruling R-H; rows G12-G15, mutants K246-K256)

Ruling R-H (owner decision of 2026-11-22): label overlaps are fixed in the real renderer code, the new placement is the default and the expected bytes of the DRAFT corpora are regenerated, an explicit exception to the ledger rule R-C that covers only the label-position content. The reference builder `tools/dl.py` calls the reference placement of `fixtures/oracles-lp/tools/lp.py` once per list with the drawn nodes (model node order, micro-pixel positions) and the drawn labels (node labels in node order, then edge labels in edge order; units = UTF-16 length of the drawn text; default position `(X, Y + 24 px)` or `(ax, ay - 4 px)` in micro-pixels), and writes every `T` at `m(default + offset)` and every `fillText` at the same position.

**What changed, proved.** `python -B -I tools/labelmove_check.py` compares this corpus with `git show HEAD:fixtures/oracles-dl/...` (the pre-LP/1 corpus): every file is byte-identical, except the `.dl` lists and `.calls` streams that hold a moved label, which become identical when the x and y of every `T` record and of every `fillText` call are replaced by a constant (the script prints the number of files changed and labels moved), the append-only files (`EXPECT.tsv`, `MUTANTS.tsv`, `AMBIGUITIES.md`: the old content is an exact prefix) and the index files (`README.md`, `SHA256SUMS`, `APPENDIX-A.tsv`). Which rows are regenerated and which hand-built inputs are not: A-62.

| Row | Scene | What |
|---|---|---|
| G12 | `lpfrac` (2 nodes, zoom 1001) | two one-unit node labels 9.99999 px apart: they collide in micro-pixels, but the milli-pixel positions are exactly 10 px apart (A-63); the second label moves up 41 px |
| G13 | `lphid` (3 nodes, `h` hidden) | a hidden node on the second candidate position of the colliding label: it takes no part |
| G14 | `lpunl` (3 nodes, `s:` has no label) | the same with the third node drawn and unlabelled: it is an obstacle |
| G15 | `lpastral` (astral label, 4 UTF-16 units) | units are UTF-16 units: the label collides with its neighbour 17 px away |

**Mutants K246-K256** (switches of `lp_offsets` in `tools/dl.py`, run over every non-K row of the generator and the new rows, in `MUTANTS.tsv`): K246 placement skipped, K247 offset on x only, K248 on y only, K249 labels handed over edge labels first, K250 placement on the milli-rounded defaults, K251 node and edge labels placed by two calls, K252 hidden nodes are obstacles, K253 units counted before the elision, K254 node obstacles ignored, K255 only labelled nodes are obstacles, K256 units counted in scalars. All eleven are killed by their named rows.

**Regeneration.** `python -B -I tools/regen_all.py OUTDIR` runs the whole chain (`gen.py`, the gap, rev 6, rev 7 tools on the pre-LP/1 lists, `lp_dl.py`) into OUTDIR; the result is byte-identical for every `PYTHONHASHSEED`. The gate of the generator on `oracles-svg` covers its scenes, layouts and states (A-64).

**Independence.** Written from design 37 rev 3 and design 31 4.4(g); no TypeScript and no `packages/*` file was read. The placement function is not reimplemented here: it is the reference of `fixtures/oracles-lp` (digest-checked), so the corpus proves that the display list builder integrates the placement (inputs, order, rounding) as the text says; the placement itself is pinned by `fixtures/oracles-lp`.
"""


if __name__ == "__main__":
    main()
