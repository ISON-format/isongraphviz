"""Text side of tools/gaps3.py --write: appends the R32-14 / R32-15 section to AMBIGUITIES.md (no earlier byte changes) and updates README.md (an index file).

Not a generator of expected bytes. Standard library only.
"""
import os
import re

SECTION_HEAD = "## R32-14 / R32-15 round (R-I, 2026-11-21): rows G45-G%d, K312-K%d against design 32 rev 4 with the two rulings folded"


def rng(ids):
    def num(i):
        return int(i[1:])
    out, start, prev = [], None, None
    for i in ids:
        if start is None:
            start = prev = i
        elif num(i) == num(prev) + 1:
            prev = i
        else:
            out.append((start, prev))
            start = prev = i
    if start is not None:
        out.append((start, prev))
    return ", ".join(a if a == b else "%s-%s" % (a, b) for a, b in out)


def groups(rows, out):
    r14 = [r["id"] for r in rows if r["rule"] == "R32-14"]
    r15e = [r["id"] for r in rows if r["rule"] == "R32-15" and out[r["id"]][0] == "err"]
    svg = [r["id"] for r in rows if r["desc"].startswith("svg-native")]
    ctl = [r["id"] for r in rows if r["rule"] == "R32-15-control"]
    prec = [r["id"] for r in rows if r["rule"] == "R32-15" and r["desc"].startswith("ill-typed: ") and (" and " in r["desc"].split("is")[0] or "(" in r["desc"] or "two faults" in r["desc"]) and "while the input" not in r["desc"]]
    return r14, r15e, svg, ctl, prec


def byfrag(rows, frag):
    return [r["id"] for r in rows if frag in r["desc"]]


def ambiguities_text(rows, out, kill, kids):
    r14, r15e, svg, ctl, prec = groups(rows, out)
    first, last = rows[0]["id"], rows[-1]["id"]
    I = lambda frag: rng(byfrag(rows, frag))
    k_first, k_last = kids[0], kids[-1]
    L = []
    A = L.append
    A("")
    A(SECTION_HEAD % (int(last[1:]), int(k_last[1:])))
    A("")
    A("The two owner rulings of 2026-11-21 were folded into design 32 (section 10, the `G1-REACH` row and the paragraph \"Shape versus finding\"; change-log rows R32-14 and R32-15): **R32-14** `ITEM_DUPLICATE` once per position value that occurs two or more times in `tree.items`, in the order of that value's second occurrence, a third or later occurrence adds nothing; **R32-15** a companion `tree` whose fields do not have the JSON types stated in 9.2 and section 10 is `INVALID_TREE/SCHEMA` before any check runs, `MODE_INVALID` and the `LIVE_*` findings apply only to a well-typed tree. "
      "This round was written from the design text alone (the oracle reference `tools/companion.py` was brought in line with the two rulings; no TypeScript, nothing under `packages/` was read to decide an expectation). "
      "It **adds** %d rows (`%s`-`%s`: 15 for R32-14, %d error rows `INVALID_TREE/SCHEMA`, %d report rows of controls and of the svg-native composition) and %d mutants (`%s`-`%s`) by `tools/gaps3.py` and changes **no earlier file, row or line**: this section is appended to `AMBIGUITIES.md`, the old `EXPECT.tsv` and `MUTANTS.tsv` are exact prefixes of the new ones, `README.md` and `SHA256SUMS` are index files rewritten around them. `APPENDIX-A.tsv` and `PARITY.tsv` are untouched."
      % (len(rows), first, last, len(r15e), len(rows) - len(r14) - len(r15e), len(kids), k_first, k_last))
    A("")
    A("**What changed in the reference, and the proof that no earlier byte changed.** `tools/companion.py` had the old reading of both rules (the design change log says so: `ITEM_DUPLICATE` once per extra occurrence, findings instead of the schema error for ill-typed fields). The edit is confined to the duplicate count of `G1-REACH` and to the shape check run before any gate check; the K45-K128 switches are untouched. Before the edit the whole generator (`gen.py --out DIR`) was run to a scratch directory, after the edit again: `diff -r` of the two trees is empty (every generated file, `EXPECT.tsv`, `MUTANTS.tsv`, `README.md`, `SHA256SUMS`, byte for byte), and the stored `gen.py` output equals every file of this corpus that it produces. `gaps3.py` also re-evaluates **every one of the 36 earlier `G` rows** of `EXPECT.tsv` with the new reference and compares the bytes with the stored `gates/*.gate.json`: 36 agree.")
    A("")
    A("The earlier line of the table `R32 rule -> carrying rows` that reads \"R32-14, R32-15 | open, undecided | none | not written, as instructed\" is **superseded** by the table below (earlier lines are not edited).")
    A("")
    A("### R32-14 and R32-15 -> carrying rows")
    A("")
    A("| Rule | Rows | What they pin |")
    A("|---|---|---|")
    A("| R32-14 | %s | `ITEM_DUPLICATE` once per repeated value: a position 2, 3, 4, 5 times (G45-G48); two or three values repeated, the order of the **second occurrence** against first occurrence, numeric order and last occurrence (G49, G50, G51); with `ITEM_MISSING` (ascending first, then duplicates) (G52); a repeated value outside `1..n` (G53 position 25, G54 position 0, G55 positions 30 and 2) and the empty graph (G58); with focus and tab stop (G56); a differing copy (G57); adjacent in place (G59) |"
      % rng(r14))
    A("| R32-15 error rows | %s | `INVALID_TREE/SCHEMA` for one wrong JSON type per field of 9.2 and section 10: top-level strings, `mode`, `container`, `list` (`role`, `multiselectable`, `set_size`, `window.first`, `window.count`), `items` and an item that is not an object, every item field (strings, booleans, integers, `address` shape, items 1, 2 and 3), `live` and its four members; precedence rows (the type error against findings the tree would otherwise give); a `tree` that is an array or a string |" % rng(r15e))
    A("| R32-15 controls | %s | a well-typed tree with a wrong value keeps its finding: `mode` `bogus` / empty (`MODE_INVALID` only, also with an input mode), `marquee` against `normal` (`MODE_MISMATCH`), `politeness` `assertive`, `atomic` false, the three `LIVE_*` together, `live` absent with a bad mode, `text` of exactly 400 units, an `id_prefix` that does not match the ids, an empty `items` array |" % rng(ctl))
    A("| R32-15 svg-native | %s | `tree` is \"ignored for `svg-native`\" (section 10): an ill-typed tree supplied with the svg-native composition gives the report of `G32` (the stored bytes equal `gates/G32.gate.json`) |" % rng(svg))
    A("")
    A("Mutants: K312-K320 fault the duplicate rule (per extra occurrence, first value only, three orders, listing before `ITEM_MISSING`, out-of-range values excluded, identical copies only, third occurrence only); K321-K346 fault the type rule (a field or group of fields not type-checked, a wrong value over-eagerly refused as `SCHEMA`, a boolean or number accepted for an integer or boolean, the error raised after the checks, the tree checked under svg-native). Each is killed by at least one new row (`MUTANTS.tsv`); K332, K335, K341 and K344 also have rows on which the faulty reference crashes (a Python `TypeError` on an ill-typed value): a crash is never counted as a kill and each of them is killed by other rows. K331 changes the outcome of every error row whose faulty reference run produces a failing report instead of the error.")
    A("")
    A("Tree files of this round: `trees/G45.tree.json` to `trees/G%s.tree.json`, bytes laid out as IGR-CJ/1 (sorted keys, no spaces) but **not all canonical IGR-CJ/1**: the ill-typed trees carry `null` and non-integer numbers (`1.5`, `2.5`, `3.5`) on purpose. The `gen.py` self-check \"every tree file re-serializes to itself\" runs over the files of the rows it builds, not over this round's files; the other files of this round (`gates/G*.gate.json`) are IGR-CJ/1 reports as before." % last[1:])
    A("")
    A("### New ambiguities against the rulings (A-95 to A-105)")
    A("")
    A("**A-95 (15.8) `G45`+ listed as unused.** 15.8 still says \"ids that are unused ... and stay unused: ... `G25`, `G45`+ ...\" (rev 3 baseline wording kept in rev 4). The task of this round, from the owner, says `G45` and above are free. Read: the sentence is stale in the same way as `E74`+ and `X27`+ (A-92); the new rows take `%s`-`%s`; `G25` stays unused. **Rows exist.**" % (first, last))
    A("")
    A("**A-96 (9.2, 10) A missing or an extra key of the tree.** 9.2 says the tree \"has exactly these keys\"; the gate paragraph says a tree \"must have the shape of 9.2 with the JSON types stated there\" and lists types only; R32-15 speaks of fields that \"do not have the JSON types stated\". Whether an **absent** required key (no `mode`, no `companion`, `live: {}`, an item without `tabindex`) counts as a type violation (`INVALID_TREE/SCHEMA`) or is read as a finding (`MODE_INVALID`, `LIVE_*`), and whether an **extra unknown key** violates the \"exact shape\" for the gate (as it does for `verifyCompanionTree`), is not decided for the gate. The reference raises `SCHEMA` for an absent required key (it is not a string, boolean, integer or object) and ignores an unknown key; **no row** claims either (the one absent member with a stated behaviour is `live`: `LIVE_MISSING`, rows `G21` and the control "+rng(byfrag(rows, "live is absent and mode is bogus"))+"). A TypeScript tranche that differs on these two classes is not contradicted by this corpus.")
    A("")
    A("**A-97 (9.2, 10) The type of an item's `description`.** 9.2 gives `description?: string`; the section 10 list of typed item fields (\"string `id`, `kind`, `name`, `roledescription`, an `address`, boolean ..., integer ...\") does not name it. A `description` that is not a string (a number, `null`) is `INVALID_TREE/SCHEMA` by the 9.2 grammar or a `DESCRIPTION_MISMATCH` / `DESCRIPTION_UNEXPECTED` finding by G2; the text does not say. The reference compares it as it is (a finding). **No row.**")
    A("")
    A("**A-98 (10) Wrong values of fields that no check reads.** \"A value of the right type that is wrong is a finding\", but the closed code lists of the checks have no code for a wrong `companion`, `layout_sha256`, `scene_sha256`, `container.role`, `list.role`, `list.multiselectable` or `live.role` (the report of 10 carries the model's digests, not the tree's, and G6, G7 read `container.name`, `container.description`, `mode`, `live.politeness`, `live.atomic`, `live.text` only). Read: such a value yields no finding; this is a consequence of the closed lists and is not claimed by a row (a future check for them would add a code). **No row**; the ill-typed forms of the same fields are rows of R32-15.")
    A("")
    A("**A-99 (10) Integer spellings.** \"Integer\" is a JSON type; in JavaScript `1.0` and `1e0` parse to the integer 1 and in a Python reader `1.0` is a float, so those spellings cannot be told apart by a TypeScript reader. The new rows use only non-integer values (`1.5`, `2.5`, `3.5`), never `1.0`, `1e0`, `-0` or a value beyond 2^53. **Rows exist** for the non-integer values (%s)." % rng(byfrag(rows, "1.5") + byfrag(rows, "2.5") + byfrag(rows, "3.5")))
    A("")
    A("**A-100 (10, G1-REACH) \"No position value occurs more than once\" is read literally.** The sentence speaks of a position **value**, not of a position in `1..n` and not of a position that G2 accepts. Read: a value outside `1..n` (25 with `n = 18`, `0`, 30; position 1 in an empty graph) repeated in the items is reported once as `ITEM_DUPLICATE` (and each such item also gets `POSITION_INVALID` from G2), and the check does not depend on the window. **Rows exist:** %s (killing `K318`)." % rng(["G53", "G54", "G55", "G58"]))
    A("")
    A("**A-101 (10) A `tree` that is not an object.** An array or a string as the tree is read as `INVALID_TREE/SCHEMA` (a tree \"must have the shape of 9.2\"; the value is present). `null` as the tree is not decided: \"required for `companion`\" (`INVALID_INPUT/SCHEMA`, the absent-tree case) or a tree of the wrong type (`INVALID_TREE/SCHEMA`). **Rows** for the array and the string (%s); **none** for `null`." % rng(byfrag(rows, "the tree is")))
    A("")
    A("**A-102 (9.2, 10) The payload of `address`.** \"an `address` of the ElementAddress shape\": the rows use only wrong outer shapes (a string, an array, the empty object, an object with both `node` and `edge`), which are not an ElementAddress under any reading. An address whose payload has a wrong type (`{\"node\": 5}`, `{\"node\": {\"id\": 5, \"type\": \"p\"}}`) is `INVALID_TREE/SCHEMA` or an `ADDRESS_WRONG` finding; the text does not say (the types of the wire address are those of 30 section 7.3). The reference checks the outer shape only. **No row** for a payload.")
    A("")
    A("**A-103 (10) Order against the other input checks.** \"raised before any check runs\" does not say whether it precedes the validation of the other gate inputs: `svg` supplied with `composition: companion` (`INVALID_INPUT/SCHEMA`), an unknown `composition`, a bad `window` option, an absent tree. The reference validates composition and the presence of `tree` and `svg` first, then the tree shape, then the checks. **No row** combines an ill-typed tree with another invalid input.")
    A("")
    A("**A-104 (10) How the depth bound is counted.** \"nesting depth at most 8\" is stated, but whether the tree object is level 0 or 1 and whether a scalar leaf is a level is not. The reference counts the tree object as level 1 and each scalar leaf as one more level (the deepest leaf of a gate tree is at level 6). No row of this round or of the earlier rounds tests the boundary (the TypeScript behaviour `ext:B07` and `ext:B25` are mutants of the tranche, not rows). **No row.**")
    A("")
    A("**A-105 (9.2, 10) `live: null`.** \"`live` optional object\": a JSON `null` is neither an object nor an absent member. Read: it is not an object, so `INVALID_TREE/SCHEMA` (not `LIVE_MISSING`). **Row exists:** %s (killing `K327`); an absent `live` stays `LIVE_MISSING` (`G21`, and the control %s, killing `K328`)." % (rng(byfrag(rows, "live is null")), rng(byfrag(rows, "live is absent and mode is bogus"))))
    return "\n".join(L) + "\n"


def numkey(i):
    return (i[0], int(re.sub(r"\D", "", i[1:]) or 0), i)


def apply(root, rows, out, kill, kids, n_old):
    path = os.path.join(root, "AMBIGUITIES.md")
    with open(path, "rb") as f:
        old = f.read()
    assert old.endswith(b"\n") and b"\r" not in old
    text = ambiguities_text(rows, out, kill, kids)
    with open(path, "wb") as f:
        f.write(old + text.encode("utf-8"))
    update_readme(root, rows, out, kill, kids)


def update_readme(root, rows, out, kill, kids):
    with open(os.path.join(root, "EXPECT.tsv"), "rb") as f:
        exp = [l.split("\t") for l in f.read().decode("utf-8").split("\n")[1:] if l]
    with open(os.path.join(root, "MUTANTS.tsv"), "rb") as f:
        mut = [l.split("\t") for l in f.read().decode("utf-8").split("\n")[1:] if l]
    cnt, withc = {}, {}
    for r in exp:
        cnt[r[1]] = cnt.get(r[1], 0) + 1
        if r[1] not in "DK":
            withc[r[1]] = withc.get(r[1], 0) + 1
    total, totalw = sum(cnt.values()), sum(withc.values())
    with open(os.path.join(root, "AMBIGUITIES.md"), encoding="utf-8") as f:
        nA = len(set(re.findall(r"^\*\*A-(\d+)", f.read(), re.M)))
    p = os.path.join(root, "README.md")
    with open(p, "rb") as f:
        s = f.read().decode("utf-8")
    assert "\r" not in s

    def rep(old, new, count=1):
        nonlocal s
        assert s.count(old) == count, (old, s.count(old))
        s = s.replace(old, new)
    first, last = rows[0]["id"], rows[-1]["id"]
    k_first, k_last = kids[0], kids[-1]
    r14, r15e, svg, ctl, prec = groups(rows, out)
    rep("extended against **rev 4** by the rev 4 round below: rows only, appended)",
        "extended against **rev 4** by the rev 4 round below: rows only, appended; the rulings R32-14 and R32-15 of 2026-11-21 add rows `%s`-`%s` and mutants `%s`-`%s` in the round below, rows only, appended)" % (first, last, k_first, k_last))
    rep("it lists 94 places where the design was ambiguous", "it lists %d places where the design was ambiguous" % nA)
    rep("A-85 to A-94 the rev 4 round; its sections `RESOLVED-IN-REV4` and `Correction of K158` say what rev 4 settled).",
        "A-85 to A-94 the rev 4 round, A-95 to A-%d the R32-14 / R32-15 round; its sections `RESOLVED-IN-REV4` and `Correction of K158` say what rev 4 settled).".replace("%d", str(nA)))
    rep("(refuses to run twice)\n```", "(refuses to run twice)\npython tools/gaps3.py --write      # after gaps2.py: appends the rows %s-%s and the mutants %s-%s of the R32-14 / R32-15 round, the AMBIGUITIES.md section, rewrites this README and SHA256SUMS (refuses to run twice)\n```" % (first, last, k_first, k_last))
    rep("one row per id (**1032 rows**)", "one row per id (**%d rows**)" % total)
    pat = re.compile(r"^\| G \| \d+ \| \d+ \| accessibility gate reports \(single-fault rows over three base rows\) \|$", re.M)
    assert len(pat.findall(s)) == 1
    s = pat.sub("| G | %d | %d | accessibility gate reports (single-fault rows over three base rows; `%s`-`%s`: the R32-14 and R32-15 rows) |" % (cnt["G"], withc["G"], first, last), s)
    pat = re.compile(r"^\| K \| \d+ \| 0 \| mutants \(test code; empty cells\) \|$", re.M)
    assert len(pat.findall(s)) == 1
    s = pat.sub("| K | %d | 0 | mutants (test code; empty cells) |" % cnt["K"], s)
    pat = re.compile(r"^\| \*\*total\*\* \| \*\*\d+\*\* \| \*\*\d+\*\* \| \|$", re.M)
    assert len(pat.findall(s)) == 1
    s = pat.sub("| **total** | **%d** | **%d** | |" % (total, totalw), s)
    errs = sorted((r[0] for r in exp if r[1] not in "DK" and r[7] and not r[6]), key=numkey)
    m = re.search(r"^Rows with an `error` and no expected file: .*\.$", s, re.M)
    assert m
    s = s[:m.start()] + "Rows with an `error` and no expected file: " + ", ".join(errs) + "." + s[m.end():]
    # the mutant table of the round, before the section on rows that claim no bytes
    extra = [r for r in mut if int(r[0][1:]) >= int(k_first[1:])]
    assert [r[0] for r in extra] == kids
    block = ["### Mutants of the R32-14 / R32-15 round (%s to %s)\n" % (k_first, k_last),
             "`%s`-`%s` (`tools/gaps3.py`) are switchable faults of `tools/companion.py` (the gate and its tree-shape check), not of the design's table; each names the new rows that kill it, re-evaluated on the stored inputs with the mutant active: KILLED %d.\n" % (k_first, k_last, len(extra)),
             "| Mutant | Verdict | Named killer rows | Mutation |", "|---|---|---|---|"]
    for r in extra:
        block.append("| %s | %s | %s | %s |" % (r[0], r[1], r[2] if len(r[2]) < 120 else r[2][:117] + "...", r[4]))
    block.append("")
    rep("\n## Rows that claim no bytes", "\n" + "\n".join(block) + "\n## Rows that claim no bytes")
    sec = """## R32-14 / R32-15 round (rows only, appended)

The owner ruled R32-14 and R32-15 on 2026-11-21 and design 32 rev 4 folded them (section 10; change-log rows R32-14, R32-15). `tools/gaps3.py` adds rows and mutants only; **no earlier file, row or line changed** (the old `EXPECT.tsv`, `MUTANTS.tsv` and `AMBIGUITIES.md` are exact prefixes of the new ones; the generator `gen.py` gives the same bytes before and after the edit of `tools/companion.py`, and the 36 earlier `G` rows are re-evaluated with the new reference and agree).

| Family | Added | Ids | Content |
|---|---|---|---|
| G | %d | %s-%s | `ITEM_DUPLICATE` once per repeated position value in second-occurrence order (%d rows); `INVALID_TREE/SCHEMA` for an ill-typed tree field (%d rows: one wrong JSON type per field of 9.2 and section 10, precedence rows, a tree that is an array or a string); the svg-native composition ignoring the tree (%d rows); controls: a right type with a wrong value keeps its finding (%d rows) |
| K | %d | %s-%s | mutants of those rows (every one killed by at least one new row) |

Every one of these rows is a `companion` composition row (or the svg-native control) whose `input` has the form of the earlier `G` rows (`state`, `tree`, optional `mode`, `fidelity`, `reducedMotion`, `readout`, `tabStops`, `composition`, `svg`); a row with an expected file names `gates/<id>.gate.json`, a row with an error names `INVALID_TREE/SCHEMA` and no file. Points the text does not decide (absent and extra keys, the type of an item's `description`, the payload of an address, `null` as the tree, wrong values of unchecked fields) are `AMBIGUITIES.md` A-95 to A-105 and have no row. The digest of `SHA256SUMS` is reported with the round and is **not** stored here (this README is covered by it). `APPENDIX-A.tsv` and `PARITY.tsv` are unchanged.

""" % (len(rows), first, last, len(r14), len(r15e), len(svg), len(ctl), len(kids), k_first, k_last)
    rep("## Notes\n", sec + "## Notes\n")
    with open(p, "wb") as f:
        f.write(s.encode("utf-8"))
