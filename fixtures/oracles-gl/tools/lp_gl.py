"""Mutants, documents and SHA256SUMS appended to oracles-gl for the label placement LP/1 (design 37 rev 3, ruling R-H of 2026-11-22).

Run (after gl.py and the gap and rev 6 tools; tools/regen_all.py runs the whole chain):

    python -B -I tools/lp_gl.py [CORPUS_DIR]

No row is added: every expected file of the corpus that holds a label position (the label runs of 16 plan files) was already rewritten by tools/gl.py with the
list builder of tools/dlist.py, which applies LP/1 by calling the reference place_labels of fixtures/oracles-lp/tools/lp.py (digest pinned in dlist.py).
This step runs the five mutants K173-K177 (switches in tools/plan.py, label_runs) over the 279 base rows, appends them to EXPECT.tsv and MUTANTS.tsv,
appends to AMBIGUITIES.md (A-53 to A-58), edits README.md (counts, a revision note, one appended section) and regenerates SHA256SUMS.

Written from design 37 rev 3 and design 31 4.4(g), 7.2; no TypeScript was read.
"""
import hashlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(HERE)

import gl  # noqa: E402
import scenes  # noqa: E402


def rd(p):
    with open(os.path.join(ROOT, p), 'rb') as f:
        return f.read().decode('utf-8')


def wr(p, s):
    assert '\r' not in s
    with open(os.path.join(ROOT, p), 'wb') as f:
        f.write(s.encode('utf-8'))


def append(p, text):
    old = rd(p)
    assert old.endswith('\n') and '\r' not in text
    wr(p, old + text)


def edit(text, pairs):
    for old, new in pairs:
        assert text.count(old) == 1, old
        text = text.replace(old, new)
    return text


# id, description, named killer rows.  The named rows are the plans whose regenerated expected file makes the mutant observable by construction:
# K173/K175 act on a node label whose y moved (B01, B02, B04, B16, B20 and the readout-of-plan row X04 contain one), K176 on a node label whose x moved
# (only B02), K174 on any label (G01, G05), K177 on any label with a fractional pixel coordinate (G01, B01).
MUTANTS = [
    ("K173", "the plan builder uses the unplaced default position of a node label (centre, 24 px below) instead of the `T` record", ["B01", "B02", "B04", "B16", "B20"]),
    ("K174", "the label runs take their position from the wrong record kind: the node's `N` record (node labels) or the first point of the `E` record (edge labels)", ["G01", "G05"]),
    ("K175", "the placement offset is applied to x only (the node label's y stays at the default)", ["B01", "B02", "B04", "B16", "B20"]),
    ("K176", "the placement offset is applied to y only (the node label's x stays at the default)", ["B02"]),
    ("K177", "the plan rounds the label positions to whole pixels itself instead of reading the `T` record as given", ["G01", "B01"]),
]

TAB = chr(9)
scenes.build_all()
BASE = gl.compute()
BASE_SIG = gl.sigs(BASE)
RES = {}
mut_lines = []
for kid, desc, named in MUTANTS:
    got = gl.sigs(gl.compute(kid))
    changed = [r for r in BASE_SIG if BASE_SIG[r] != got.get(r)]
    kill = [r for r in named if r in changed]
    miss = [r for r in named if r not in changed]
    other = [r for r in changed if r not in named]
    assert kill and not miss, (kid, kill, miss)
    mut_lines.append(TAB.join([kid, desc, ",".join(named), ",".join(kill), ",".join(miss), ",".join(other), "KILLED"]))
    RES[kid] = (named, kill, other)
    print(kid, "killed by", kill, "other changed rows", other)

have = rd("EXPECT.tsv")
for kid, _d, _n in MUTANTS:
    assert ("\n" + kid + TAB) not in have, kid
append("EXPECT.tsv", "".join("%s\tK\t\t\t\t\t\t\n" % kid for kid, _d, _n in MUTANTS))
append("MUTANTS.tsv", "\n".join(mut_lines) + "\n")

AMB = """
## LP/1 (ruling R-H, 2026-11-22): appended after design 31 rev 7

**58 entries (A-01 to A-58)** (A-53 to A-58 were added for the label placement LP/1 of design 37 rev 3; no entry above is edited; the entry count in the header of this file is the rev 5 figure). Design 31 rev 7 changed one thing: the `T` records of the display list carry `default + placeLabels(...)` (4.4(g)); the plan (7.2) copies them into its label runs, so only the label runs of the plans that hold a moved label change.

## A-53 Where this oracle gets the LP/1 label positions

* **Rev 7:** NEW (a change of the independence rule of this corpus, ruling R-H; no row is added).
* **Sections:** 4.4(g), 7.2 (label runs), design 37 sections 2-6, README (Independence statement).
* **Reading used:** the display list builder of this corpus (`tools/dlist.py`) is its own re-implementation, so it computes the default micro-pixel positions itself (`x`, `y + 24 px` for a node label; the anchor, `y - 4 px` for an edge label), the visible nodes' centres and the drawn labels' units (`len16` of the drawn text), and hands them to `place_labels` of `fixtures/oracles-lp/tools/lp.py` (the all-pairs reference of the LP/1 oracle, read BY PATH and gated by its SHA-256 `1c62862fe9137fb1e95403a47cb58f98cda8e7d3834de6c1789716b973629b95`: it is a pure function of integers, written from design 37 by another author, and no TypeScript). The whole-pixel offsets `(dx, dy)` are added to the micro-pixel defaults and the sum is rounded to milli-pixels ONCE, as for every other coordinate (3.2): `m(x + dx * 10^6)`. The plan builder (`tools/plan.py`) is unchanged: it reads the `T` records as given.
* **Obstacles and order:** the node boxes of every VISIBLE node (a hidden node is not an obstacle), the labels in label-pass order (node labels in scene order, then edge labels), the placed labels as further obstacles; this is design 37 section 3 as read by `tools/dlist.py` and is cross-checked by the parity check below, not assumed.
* **Independent confirmation:** `tools/parity_svg.py` (the former `C-V5 parity` check of the generator, now a separate tool run last because `oracles-svg` is regenerated by another author) compares this list's `T` integers with the `<text>` positions of the expected SVG documents of `fixtures/oracles-svg` (rows G, N, X, Y, regenerated for LP/1 by their own author with their own placement code). Against the LP/1 rev 2 documents it passed for 54 documents and, with the placement switched off (`ORACLE_GL_LP=0`), failed at `svg:G05`, so it is a real check of the integration; its result against the rev 3 documents is given in the hand-over. A second agreement: the bytes of the display list of Appendix A.3 of design 31 (written by the oracles-dl author) equal this oracle's list under rev 3.
* **Why:** the placement algorithm is one pure function, specified once; re-implementing it a third time in this corpus would test nothing the LP/1 oracle (`fixtures/oracles-lp`, rev 3 digest `564db749...b657`) and the parity check do not already test; what this corpus must prove is the INTEGRATION (inputs, order, rounding, reading by the plan).

## A-54 The oracles-svg gate is a data gate now

* **Rev 7:** NEW (a change of the gate, same reason as `oracles-dl` A-64).
* **Sections:** 13.1.
* **Reading used:** the gate asserted the whole `SHA256SUMS` digest of `oracles-svg` (`63a19833...cccbd`), which R-H changes (`33dcfc25...b906` after LP/1 rev 2: the expected SVG documents hold labels, and it changes again at rev 3). It now asserts the 100 lines of that file that cover the data this generator reads and that R-H does not touch, `scenes/`, `layouts/` and `states/` (byte-identical to the ones of the pre-LP/1 corpus), pinned in `tools/svg_data_pins.txt` (digest `1eaf761a4e6c031c17abdd202a849a44db4c4d921a30ccdff84a99af6e33aa91`, asserted by `tools/selfcheck.py`). The expected `svg/` documents are NOT pinned: the generator reads only `svg/G01.svg` (row X05: texts only, no position), and every file read is verified against the corpus's own `SHA256SUMS` when it is read (`tools/scn.py`).
* **Why:** a whole-digest gate would stop the generator whenever the other corpus appends a row; the data it reads is what must not change.

## A-55 What the regeneration changed

* **Rev 7:** NEW.
* **Sections:** 7.2, 9.3, 13.4.
* **Result:** 16 of the 308 expected files changed, all of them `plan/*.glplan`: `B01 B02 B03 B04 B05 B05b B06 B16 B20 G05 G07 G08 G10 G11 X04 X09`, 73 label runs (16 node labels, 57 edge labels), in 73 of the 73 only the `x` and `y` of a `T` line (proved by `tools/labelmove_check.py`; eight of the plans are longer, `B02` by 18 bytes, `B04` by 2, `B05`, `B05b`, `B06`, `G05`, `G08` and `G10` by 1, because a moved coordinate has more digits: the plan length is a derived quantity and no expected file quotes it). No other expected file changes: the readouts (`xr/`) carry label addresses and texts, not positions; the executor logs, controller logs, probe logs and manifests carry no label position; the Canvas stream `calls/X05.calls` and `calls/U13.calls` are the streams of `G01` and of the text layer of a plan whose labels do not collide (`fillText` positions unchanged); the bad plans are derived from `bad/BASE.glplan`, whose labels do not move; `plan/B22*`, `plan/B23*` (derived from `B14`, `B13`) and `plan/W47.*` hold unmoved labels. The shader files, `inputs/`, scenes, layouts and states are untouched.
* **Appendix A:** one item changes, the SHA-256 of A.3 (the display list of row `G11` of `oracles-dl`, scene `loops2`): the bytes of the design's block already hold the LP/1 positions (they equal this oracle's list, a second independent agreement) and the quoted SHA-256 is `6ff85140...8ef0`; the reproduction row `A.3` is REPRODUCED again with the new quoted value. A.1, A.2, A.4 to A.11 are unchanged.

## A-56 Plans are not the place of a placement

* **Rev 7:** NEW (no row, a reading recorded).
* **Sections:** 7.2, 4.4(g).
* **Reading used:** `planGl` neither moves nor re-rounds a label: the label run is the `T` record, byte for byte (the same `["T", pid, kind, x, y, text]` line as the list's). A plan builder that placed labels itself, or recomputed a default from the `N` or `E` records, or rounded the position, would disagree with the list; K173 to K177 are such builders.

## A-57 Mutants K173-K177 and what they do not cover

* **Rev 7:** NEW.
* **Reading used:** the five mutants are switches in `tools/plan.py` (`label_runs`) over the plan builder: K173 the unplaced default of a node label (its `N` centre, 24 px below); K174 the wrong record kind (the node's `N` record, the first point of the label's `E` record); K175 the offset applied to x only (the node label's y at the default); K176 to y only (x at the default); K177 the plan's own rounding to whole pixels. All five are killed by the regenerated plans (MUTANTS.tsv): K173 by B01, B02, B04, B16, B20 and X04 (the node labels that moved), K174 by 40 rows, K175 by the same six as K173, K176 by B02 only (the one plan in which a node label moves in x), K177 by 33 rows (every plan whose label has a fractional pixel coordinate). They are wired into the TypeScript harness as the same text patches of `plan.ts` (`packages/renderer-webgl/scripts/mutants-table.mjs`).
* **Not covered:** (a) an edge label has no default in the plan (its anchor is a geometry the plan does not carry), so K173, K175 and K176 act on node labels only; the edge labels are covered by K174 and K177 and by the plans G05, G07, G08, G10, B03 to B06 whose moved labels are edge labels; (b) mutants of the LIST builder (the placement from milli-rounded defaults, the obstacle set, the label order, `len16` versus the raw text, the units) belong to `oracles-dl` (K246-K256, rows G12-G15), which owns the list; this corpus builds the list from its own code and does not add rows whose only difference would be a list property; (c) K176 has a single killer: no other plan has a node label that moves sideways.
"""

README_NOTE_OLD = "Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere). "
README_NOTE_NEW = (README_NOTE_OLD + "**Revision note, design 31 rev 7 (2026-11-22, ruling R-H):** the label placement LP/1 (design 37 rev 3) moves labels in the display list, so the "
                   "label runs of 16 expected plans (`B01`-`B06`, `B05b`, `B16`, `B20`, `G05`, `G07`, `G08`, `G10`, `G11`, `X04`, `X09`) were regenerated (73 label runs, only the `x` and `y` of `T` lines, proved by "
                   "`tools/labelmove_check.py`); five mutants K173-K177 were appended; no other expected byte, row, id or input changed (last section, AMBIGUITIES A-53 to A-57). ")

EDITS = [
    ("**366 rows** (the 279 rows, one per id of design 13.6, the 57 gap rows after rev 5 and the 30 rows after rev 6, see the last two sections)",
     "**371 rows** (the 279 rows, one per id of design 13.6, the 57 gap rows after rev 5, the 30 rows after rev 6 and the 5 mutants after rev 7, see the last three sections)"),
    ("| K | 172 | mutants | no files (MUTANTS.tsv) |", "| K | 177 | mutants | no files (MUTANTS.tsv) |"),
    ("| **total** | **366** | | |", "| **total** | **371** | | |"),
    ("Rows with empty cells by design: D (5) and K (172);", "Rows with empty cells by design: D (5) and K (177);"),
    (README_NOTE_OLD, README_NOTE_NEW),
]

README_ADD = """
## Additions after design 31 rev 7 (label placement LP/1, ruling R-H of 2026-11-22; mutants K173-K177)

The owner decided that label overlaps are fixed in the real renderer code with a new default placement (design `37-LABEL-PLACEMENT-DESIGN.md`, LP/1 rev 3) and that the expected label-position bytes of the DRAFT corpora are regenerated (an explicit exception to the ledger rule R-C that covers only label positions). The display list builder of this corpus (`tools/dlist.py`) now applies LP/1 by calling the reference `place_labels` of `fixtures/oracles-lp/tools/lp.py` (read by path, digest pinned: A-53); the plan copies the `T` records into its label runs unchanged.

| What | Result |
|---|---|
| Expected files that changed | 16 plans, `plan/B01 B02 B03 B04 B05 B05b B06 B16 B20 G05 G07 G08 G10 G11 X04 X09.glplan`; 73 label runs (the label lines of the plans), only the `x` and `y` of `T` lines |
| Expected files that did not change | 286 of the 308 files are byte-identical (the 16 plans and 5 index files differ, and `SHA256SUMS`): every `bad/`, `calls/`, `gllog/`, `json/`, `shaders/`, `xr/`, `scripts/`, `inputs/`, `scenes/`, `layouts/`, `states/` file; the readouts, logs and manifests carry no label position |
| Appendix A | A.3 only: the quoted SHA-256 of the display list of `G11`/`loops2` is `6ff8514097243394205a11f23e3250c607ddca3b4c39f603916e436dbd3a8ef0` (bytes of the design's block equal this oracle's list) |
| Rows, ids, inputs, file paths | unchanged; 5 mutant rows K173-K177 appended (EXPECT.tsv 371 rows) |
| Mutants K173-K177 | 5 of 5 killed by the regenerated plans (MUTANTS.tsv); each is also a text patch of `packages/renderer-webgl/src/plan.ts` in the harness |
| Gate | the oracles-svg gate is the 100 pinned scenes, layouts and states lines (`tools/svg_data_pins.txt`), A-54 |
| Independent confirmation | `tools/parity_svg.py` compares the list's `T` integers with the `<text>` positions of the LP/1 SVG documents of `oracles-svg` (run last, against whatever state that corpus is in); the bytes of design 31 A.3 equal this oracle's list |

**Proof that nothing else changed.** `python -B -I tools/labelmove_check.py` (run from the repository: the old side is `git show HEAD:fixtures/oracles-gl/<path>`; `--old-dir DIR` reads a copy of the old corpus instead) masks the `x` and `y` of every `T` line of a `.glplan` file on both sides, requires the masked files to be byte-identical (this also covers the header, which carries the buffer sizes), requires every other file to be byte-identical or an append-only / index file, and lists the labels moved. Regenerate the whole corpus with `python -B -I tools/regen_all.py OUTDIR`.
"""

amb = rd("AMBIGUITIES.md")
assert "A-53 " not in amb and amb.endswith("\n")
wr("AMBIGUITIES.md", amb + AMB)
rm = edit(rd("README.md"), EDITS)
assert "Additions after design 31 rev 7" not in rm and rm.endswith("\n")
wr("README.md", rm + README_ADD)


def sums():
    fs = []
    for d, ds, ns in os.walk(ROOT):
        for n in ns:
            p = os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, "/")
            if p.startswith("tools/") or p == "SHA256SUMS":
                continue
            fs.append(p)
    fs.sort(key=lambda p: p.encode("utf-8"))
    out = "".join("%s *%s\n" % (hashlib.sha256(open(os.path.join(ROOT, p), "rb").read()).hexdigest(), p) for p in fs)
    return out, len(fs)


s, n = sums()
wr("SHA256SUMS", s)
print("SHA256SUMS files", n, "digest", hashlib.sha256(s.encode()).hexdigest())
