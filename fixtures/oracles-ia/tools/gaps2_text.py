"""Text side of tools/gaps2.py --write: appends the rev 4 section to AMBIGUITIES.md (no earlier byte changes) and updates README.md (an index file).

Not a generator of expected bytes. Standard library only.
"""
import os
import re

SECTION_HEAD = "## Rev 4 round (R-H, 2026-11-20): rows B111-B174, E74-E102, X178-X275, K201-K311 against design 32 rev 4"


def rng(ids):
    """compress a sorted list of ids of one family into ranges: B111-B113, B125"""
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


def ids_for(rows, rule, group=None):
    return rng([r["id"] for r in rows if r["rule"] == rule and (group is None or r["group"] == group)])


def ambiguities_text(rows, kill, kids, counts):
    R = lambda rule, g=None: ids_for(rows, rule, g)
    byname = {k[0]: kid for k, kid in zip(kill, kids)}
    k158 = byname["Q_last"]
    k158_killers = ",".join(next(k for k in kill if k[0] == "Q_last")[2])
    L = []
    A = L.append
    A("")
    A(SECTION_HEAD)
    A("")
    A("This round was written against **rev 4** of design 32 (owner-adopted rules R32-01 to R32-13 and R32-16, change log `Rev 3 -> rev 4`) by an oracle author who read only the documents of the independence statement of `README.md`. "
      "It **adds** %d rows (B %d, E %d, X %d) and %d mutants (K201 to %s) by `tools/gaps2.py` and changes **no earlier file, row or line**: this section is appended to `AMBIGUITIES.md`, the new `EXPECT.tsv` and `MUTANTS.tsv` lines are appended after the old ones, "
      "and `README.md` and `SHA256SUMS` are index files rewritten around them. `APPENDIX-A.tsv` is untouched (the Appendix A bytes of the design did not change; the generator re-checks A.8 and A.9 before it writes anything). "
      "Every new expected byte comes from the reference logic of `tools/gaps2.py`; before writing, that reference was also run over **%d earlier B, E (machine bytes) and X rows** (every earlier row it can evaluate without a render model) and **agrees with all of them**: "
      "no earlier row is contradicted by the rev 4 reading (rows `X09`, `X10`, `X14`, `X15`, `X26` need `buildRenderModel`, `parseState` or `renderSvg`; `X24` is the generated oversize vector)."
      % (counts["rows"], counts["B"], counts["E"], counts["X"], counts["K"], kids[-1], counts["regress"]))
    A("")
    A("The rows of this round are judged by the rev 4 text only where the text decides. A point the text leaves open is an entry below (A-85 to A-94) and has **no row**.")
    A("")
    A("### RESOLVED-IN-REV4 (entries of the gap round that rev 4 resolves)")
    A("")
    A("The entries above are not edited; their status is recorded here.")
    A("")
    A("* **A-75** (reason of a manifest that is not valid JSON): **resolved** by R32-01 (11.4 (1)): `INVALID_EXPORT/SCHEMA`, `NON_CANONICAL` only for a document that parsed and passed every earlier check. The reading used for `X31` to `X48` is confirmed; no row changes.")
    A("* **A-76** (domains of `pan` and `zoom`): **resolved** by R32-02 (6.4): `dx`, `dy` within +-2^31, `factor` 1 to 1,000,000, outside `INVALID_VALUE`. The \"no row\" decision of A-76 is lifted: %s." % (R("R32-02")))
    A("* **A-77** (value sets of `dir`, `end`, `delta`): **resolved** by R32-03 (6.4): any other value of the right JSON type is `INVALID_VALUE`: %s." % R("R32-03"))
    A("* **A-78** (faults of `mode`, `key`, `action` of the wrong JSON type): **resolved** by R32-04 (6.4): non-string `mode` `INVALID_VALUE`, non-string `key` `UNKNOWN_KEY`, an `action` that is not an object, has no string `type` or an unknown one `UNKNOWN_ACTION`: %s." % R("R32-04"))
    A("* **A-79** (PNG container rules): **resolved, with a remainder**, by R32-05 (11.5): chunk types of four ASCII letters, `IEND` of length 0, the 45-byte minimum and the 2^31 cap are now text; a second `IHDR` and an `IEND` before the last chunk stay \"not specified\" (no row, as before). "
      "Rows: %s. The minimum and the cap cannot be told apart from the exact-fill rule (A-93)." % R("R32-05"))
    A("* **A-80** (order of the embed checks; the binding object): **resolved** by R32-06 (11.5): hashes, container, already bound; the binding object is closed, a missing or an extra key is `SCHEMA` (the earlier oracle reading is confirmed, the implementation's tolerance of an extra key is a defect). "
      "Rows: %s. A remainder is A-85 and A-86." % R("R32-06"))
    A("* **A-81** (manifest bytes): **resolved, with a remainder**, by R32-07 (11.3): BOM, invalid UTF-8 and syntax faults `SCHEMA`, a duplicate key and a non-canonical number spelling `NON_CANONICAL`, a lone-surrogate escape judged by the value checks, `-0` `INVALID_EXPORT/SCHEMA`. "
      "Rows: %s. The remainder (other spellings of a negative zero or of a number that is an integer only as a double) is A-89." % R("R32-07"))
    A("* **A-82** (type check and name check): **resolved** by R32-08 (11.4 (1)): whole-manifest passes; the earlier oracle's entry-by-entry reading is withdrawn. The row dropped in the gap round (a wrongly typed `bytes` **and** an unknown name) is now `X216` (and `X222`). "
      "`X75` and `X76` stay and agree. The four-pass list of R32-08 omits the required-entries check (A-88). Rows: %s." % R("R32-08"))
    A("* **A-83** (`expectedPngSize` without a `png`, invalid sizes, the 1,048,576-byte boundary): **resolved, with a remainder**, by R32-09 (11.2): ignored unless a `png` is supplied; a non-matching size (zero, negative, non-integer, above 2^32) is always `PNG_SIZE_MISMATCH`: %s. "
      "The remainder is A-87 (a size that is not an object of two numbers). The boundary of a manifest of exactly `maxManifestBytes` still has no row (a second generated vector needs a harness change: not written, as instructed)." % R("R32-09"))
    A("* **A-84**: unchanged (an oracle tool note). A **second** tool note: `tools/machine.py` (`parse_machine`) still holds the rev 3 reading \"pointer fields not range-checked again\"; it is not edited (append-only) and `gen.py` does not write the rows E74-E102. "
      "The reference for them is `tools/gaps2.py`; run order after a regeneration: `gen.py`, `gaps.py`, `gaps2.py`.")
    A("")
    A("### R32 rule -> carrying rows (decided from the earlier rows first)")
    A("")
    A("\"Earlier\" means a row that fails on its violation, is single-fault, and is consistent with the rev 4 reading (checked by the regression above). \"Gap\" means no earlier row carries the rule's observable behaviour: new rows were written.")
    A("")
    A("| Rule | Earlier rows | New rows | Remark |")
    A("|---|---|---|---|")
    A("| R32-01 invalid JSON is `SCHEMA` | `X31`-`X44` (fourteen syntax faults: truncation, empty, trailing byte, trailing comma, single quotes, leading zero, `NaN`, unquoted key, comment, cut, two documents, raw LF, bad escape, plus sign), `X45`-`X48` (valid JSON, not an object), `X86` (verify); `NON_CANONICAL` last: `X22`, `X77`-`X85`, `X87` | none | carried |")
    A("| R32-02 pan and zoom domains | none (A-76) | %s | gap closed |" % R("R32-02"))
    A("| R32-03 `dir`, `end`, `delta` value sets | none (A-77; `E52`, `E54` are navigation commands, 7.1, not binding rows) | %s | gap closed |" % R("R32-03"))
    A("| R32-04 wrong JSON type of `mode`, `key`, `action`, `mods` | only the fields **inside** an action (`B60`-`B81`: wrongly typed `dir`, `end`, `delta`, `dx`, `dy`, `factor`, `extend`, all `INVALID_VALUE`) and string values (`B28`, `B29`, `B42`-`B59`) | %s | gap closed |" % R("R32-04"))
    A("| R32-05 PNG container rules | signature `X89`, `X92`, `X130`, `X171`; first chunk and `IHDR` length `X93`-`X95`, `X132`, `X134`, `X170`; last chunk `X96`-`X98`, `X131`, `X168`; exact fill `X99`-`X103`, `X133`, `X169`; the 45-byte boundary `X114` (accepted) | %s | chunk type and `IEND` length were gaps; minimum 45 and cap 2^31 unobservable (A-93) |" % R("R32-05"))
    A("| R32-06 embed order; closed binding object | single faults only: hashes `X104`-`X110`, container `X89`-`X103`, already bound `X121`-`X124` | %s | order and closed object were gaps; A-85, A-86 |" % R("R32-06"))
    A("| R32-07 manifest bytes | trailing comma `X34`, leading zero `X36`, `NaN` `X37`, a leading LF `X84` | %s | BOM, UTF-8, duplicate key, number spelling, lone surrogate, `-0` were gaps; A-89 |" % R("R32-07"))
    A("| R32-08 whole-manifest passes | `X75` (name before order), `X76` (required entries before canonical, A-88), `X87`, `X88`, `X12`, `X13` | %s (and `X195`, `X196`) | the type pass before the name pass, and every pass before the canonical pass, were gaps |" % R("R32-08"))
    A("| R32-09 `expectedPngSize` | `X17`, `X175`, `X176` (mismatch with a png), `X174`, `X177` (match) | %s | without a png, zero, negative, non-integer and 2^32 + 1 sizes were gaps; A-87 |" % R("R32-09"))
    A("| R32-10 pointer-field ranges of `parseMachine` | `E60`-`E63` (shape and invariants only, no range) | %s | gap closed (limit accepted, one beyond refused, per field; second pointer) |" % R("R32-10"))
    A("| R32-11 a `tick` reads the state only with a recorded target | none (`I18`, `I20` use valid states) | none | text only (owner's list); observable only with an invalid state, which no earlier script row carries |")
    A("| R32-12 \"frozen intents\" wording; machine arrays not frozen | none | none | text only; not a byte or error behaviour |")
    A("| R32-13 17.4 (c) wording of the demo smoke step | none | none | text only (the demo is not in the corpus) |")
    A("| R32-14, R32-15 | open, undecided | none | not written, as instructed |")
    A("| R32-16 `export-core` depends on `interaction-core` | none | none | text only (package graph) |")
    A("")
    A("### Correction of K158 (appended; the line `K158` of `MUTANTS.tsv` is not edited)")
    A("")
    A("`K158` (\"last chunk not required to be IEND\") names `X97` among its killers. `X97` is a 33-byte file that holds only the signature and `IHDR`; rev 4 refuses it by the 45-byte minimum **before** it reaches the IEND rule, "
      "so an implementation that has the minimum and lacks the IEND rule still refuses `X97` and survives it. (The earlier `K158` line is true of the oracle's own reference, which had no minimum; it is not true of an implementation that has one.) "
      "The four other rows that `K158` names, `X96` (56 bytes: signature, `IHDR`, `IDAT`), `X98` (83 bytes: a valid file and a trailing `tEXt`), `X131` and `X168` (a bound PNG without `IEND`, 286 bytes), are all at least 45 bytes and do kill it "
      "(checked by the reference with the 45-byte minimum switched on: `X96`, `X98`, `X131`, `X168` change, `X97` does not). New rows that satisfy the owner's description (at least 45 bytes, valid signature, `IHDR` first with length 13, last chunk not `IEND`, otherwise acceptable): "
      "`X251` (exactly 45 bytes: `IHDR` and an empty `IDAT`, no `IEND`) and `X252` (81 bytes: `IHDR`, `IDAT`, a `tEXt` Comment as the last chunk), plus the read row `X256`. "
      "Mechanism: a **new** mutant line `%s` (same mutation, the corrected killer list `%s`, the description says \"K158 restated (correction)\") is appended to `MUTANTS.tsv` with its own empty `EXPECT.tsv` row; `K158` and its row stay as they are. "
      "Readers of `MUTANTS.tsv` should use `%s` for the K158 mutation and ignore `X97` as its killer." % (k158, k158_killers, k158))
    A("")
    A("### New ambiguities against rev 4 (A-85 to A-94)")
    A("")
    A("**A-85 (11.5) The closed binding object against the container check.** R32-06 lists the order \"the hashes, the container, the already-bound state\" and, in the next sentence, says the binding object has exactly the keys scene, layout, state and that a missing or an extra key is `SCHEMA`. "
      "A missing key is a missing hash, so it is the hash check. An **extra** key is not a hash fault; whether it is judged before the container (an argument-shape check) or with the hashes is not said, and the difference shows only for a binding with an extra key **and** a bad container (or an already bound one). "
      "Read: the shape check is the first one (same code `SCHEMA` as the hashes). **No row** combines an extra key with a second fault; `X233`-`X235` are single-fault.")
    A("")
    A("**A-86 (11.5) A `binding` argument that is not an object.** `null`, an array, a string or a number as the binding: the text speaks of \"the binding object\" and its keys, not of a value that is not an object. Read: `SCHEMA` by the same reading as A-85. **No row.**")
    A("")
    A("**A-87 (11.2) The shape of `expectedPngSize`.** \"validate options\" is the first step and \"unknown key `INVALID_CONFIG/SCHEMA`\" its only stated refusal; `expectedPngSize` is typed `{ width: number; height: number }` but a missing member, an extra key, a string or `null` as a member, or a value that is not an object is not given a reason. "
      "R32-09 says only: ignored unless a `png` is supplied; a size that does not match is always `PNG_SIZE_MISMATCH`. Rows `X264`-`X275` use well-formed objects of two **numbers** (zero, negative, 1.5, 1.0000001, 2^32 + 1 are numbers that do not match). "
      "Rows `X260`-`X263` (no png) give numbers that are legal for no PNG (0, -3, 1.5): read as written they are ignored; an implementation that validated the option before ignoring it would refuse `X262` and `X263`. A non-number member has **no row**. "
      "Also without a row: the order of an `embedPngBinding` error against a size mismatch for the same png (the text says the embed comes first; the `export` row format of this corpus supplies only the fixture png).")
    A("")
    A("**A-88 (11.4 (1)) The required-entries check is not in the four-pass list of R32-08.** R32-08 names four whole-manifest passes: (1) closed key set and value types, (2) every artifact `name`, (3) order and uniqueness, (4) canonical bytes. "
      "The longer list earlier in 11.4 (1) also has \"the required `scene`, `layout`, `state` entries (`SCHEMA`)\" between the sort order and the canonical bytes. The earlier rows `X67`-`X70` (a missing entry in a canonical manifest, `SCHEMA` under every placement) and `X76` "
      "(a missing `state` entry in a **pretty-printed** manifest: `SCHEMA` only if the required-entries check comes before the canonical-bytes pass) follow the longer list and are **kept**. "
      "If the check were a fifth pass after (4), `X76` would be `NON_CANONICAL`; if it were part of (1), a manifest with a missing entry **and** an unknown name would be `SCHEMA`, otherwise `UNKNOWN_ARTIFACT`. "
      "No new row asks which; the new R32-08 rows (`X216`-`X222`) never lack a required entry. Read: between (3) and (4), as in the longer list.")
    A("")
    A("**A-89 (11.3) Number spellings whose integer-ness depends on the number model.** The new rows use only spellings that have the same value under an exact decimal reading and under IEEE doubles: `398.0`, `3.98e2`, `398E0`, `0.398e3`, `398e+0`, `1e2`, `1E2`, `1e+2`, `100.0`, `10e1`, `0.0`, `9007199254740991.0` (`NON_CANONICAL`) and `-0` (`SCHEMA`, the owner's ruling). "
      "Not decided, no row: `-0.0`, `-0e0` (a negative zero spelled with a fraction or an exponent: `SCHEMA` like `-0`, or a non-canonical spelling of 0?), `1.0000000000000001` (not an integer exactly, the integer 1 as a double), `1e-400` (0 as a double, not exactly), `1e400` (infinity as a double). "
      "The reference raises an \"unspecified\" error if a row ever reaches one of them.")
    A("")
    A("**A-90 (6.4) A binding-row number spelled `1.0`, `1e0` or `-0`.** `mods`, `dx`, `dy`, `factor`, `delta` are \"integers\"; in JavaScript `1.0` and `-0` parse to integers (`-0` is `-0`), in a Python reader `1.0` is a float. The text for **bindings** has no `-0` ruling (the owner's `-0` ruling is for the manifest). "
      "No row: every new binding file spells integers as plain integers and non-integers as `1.5`.")
    A("")
    A("**A-91 (5.1) Relations among machine fields that the text does not state.** `t0` greater than `last_t` (a pointer pressed after the machine's last event), `x` different from `x0` for a press that is not `moved`, `pinch.d` against the distance of the two pointers, `pinch.mx`, `pinch.my` against their midpoint: "
      "only ranges and the listed invariants are stated. The accepted rows `E74`-`E78` keep `t0 <= last_t` and `x = x0` for a press; the refusing rows `E87` and `E101` have `t0` = 2^52 + 1 above `last_t` = 2^52 and are refused by the range (an implementation with an extra relation also refuses them, for another reason). "
      "The pinch rows give `d`, `mx`, `my` values unrelated to the pointers (the range is the only stated rule).")
    A("")
    A("**A-92 (15.8) \"`E74`+ ... stay unused\".** 15.8 reserves `E74` and above, `X27` and above and others as \"unused ids that stay unused\"; the gap round already took `B14`-`B110` and `X27`-`X177`, and R32-10 asks for machine rows that belong to family `E`. "
      "Read: the sentence of 15.8 is stale; the new machine rows take `E74`-`E102`.")
    A("")
    A("**A-93 (11.5) Two rev 4 container rules that no row can test.** (a) \"at least 45 bytes\": a byte string that starts with the signature, whose chunks exactly fill the rest, whose first chunk is `IHDR` (length 13, 25 bytes) and whose last is `IEND` (a different chunk, 12 bytes) has at least 8 + 25 + 12 = 45 bytes. "
      "(b) \"each chunk length is below 2^31\": a length of 2^31 or more cannot be satisfied by an input that fits the corpus and is refused by the exact-fill rule (`X101`, `X102`). So an implementation without either rule gives the same result on every possible row. "
      "The reference was run with each rule switched off: no row of this round changes; no mutant is recorded for them (they would be unkillable). `X114` (45 bytes, accepted) is the boundary row of (a). The minimum matters only for which rule refuses a short file first (the `K158` correction above).")
    A("")
    A("**A-94 (11.5) `readPngBinding` and the verifier use the same container rules.** \"`readPngBinding(png)`: parse as above (`PNG_MALFORMED` on error)\" is read as the rev 4 container rules of `embedPngBinding` (chunk types, `IEND` length, minimum): rows `X253`-`X259`. "
      "If the reader is meant to be laxer than the embedder, those rows change (the 11.4 (6) clause \"structure valid\" is read the same way).")
    A("")
    return "\n".join(L)


def apply(root, rows, kill, kids, new_files, regress_n):
    counts = {"rows": len(rows), "B": sum(1 for r in rows if r["group"] == "B"), "E": sum(1 for r in rows if r["group"] == "E"),
              "X": sum(1 for r in rows if r["group"] == "X"), "K": len(kids), "regress": regress_n}
    path = os.path.join(root, "AMBIGUITIES.md")
    with open(path, "rb") as f:
        old = f.read()
    assert old.endswith(b"\n") and b"\r" not in old
    text = ambiguities_text(rows, kill, kids, counts)
    with open(path, "wb") as f:
        f.write(old + text.encode("utf-8"))
    update_readme(root, kids)


def numkey(i):
    return (i[0], int(re.sub(r"\D", "", i[1:]) or 0), i)


def update_readme(root, kids):
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
    nA = len(set(re.findall(r"^\*\*A-(\d+)", open(os.path.join(root, "AMBIGUITIES.md"), encoding="utf-8").read(), re.M)))
    p = os.path.join(root, "README.md")
    with open(p, "rb") as f:
        s = f.read().decode("utf-8")
    assert "\r" not in s

    def rep(old, new, count=1):
        nonlocal s
        assert s.count(old) == count, (old, s.count(old))
        s = s.replace(old, new)

    rep("refreshed against **rev 3**: rev 3 changes no expected file, `EXPECT.tsv` row or input file)",
        "refreshed against **rev 3**: rev 3 changes no expected file, `EXPECT.tsv` row or input file; extended against **rev 4** by the rev 4 round below: rows only, appended)")
    rep("it lists 70 places where the design was ambiguous, contradictory or could not be built, with the reading used.",
        "it lists %d places where the design was ambiguous, contradictory or could not be built, with the reading used (A-01 to A-70 the first round, A-71 to A-74 the rev 3 refresh, A-75 to A-84 the gap round, A-85 to A-94 the rev 4 round; its sections `RESOLVED-IN-REV4` and `Correction of K158` say what rev 4 settled)." % nA)
    rep("python tools/gen.py --mutant K05   # prints, for the named mutant, which of its killer rows change\n```",
        "python tools/gen.py --mutant K05   # prints, for the named mutant, which of its killer rows change\npython tools/gaps.py --write       # after gen.py: appends the gap-round rows B14-B110, X27-X177, K129-K200 (refuses to run twice)\n"
        "python tools/gaps2.py --write      # after gaps.py: appends the rev 4 rows B111-B174, E74-E102, X178-X275, K201-K311, the AMBIGUITIES.md section, rewrites this README and SHA256SUMS (refuses to run twice)\n```")
    rep("one row per id (**410 rows**)", "one row per id (**%d rows**)" % total)
    fam = {"E": "event, config, command, machine-bytes and rectangle validation (error codes)", "B": "key tokens and bindings", "X": "export bundle, PNG binding chunk, manifest and bundle verification",
           "K": "mutants (test code; empty cells)"}
    for g, t in fam.items():
        pat = re.compile(r"^\| %s \| \d+ \| \d+ \| %s \|$" % (g, re.escape(t)), re.M)
        assert len(pat.findall(s)) == 1, g
        s = pat.sub("| %s | %d | %d | %s |" % (g, cnt[g], withc.get(g, 0), t), s)
    rep("| **total** | **410** | **276** | |", "| **total** | **%d** | **%d** | |" % (total, totalw))
    # rows with an error and no expected file
    errs = sorted((r[0] for r in exp if r[1] not in "DK" and r[7] and not r[6]), key=numkey)
    m = re.search(r"^Rows with an `error` and no expected file: .*\.$", s, re.M)
    assert m
    s = s[:m.start()] + "Rows with an `error` and no expected file: " + ", ".join(errs) + "." + s[m.end():]
    acc = sorted((r[0] for r in exp if r[1] not in "DK" and not r[6] and not r[7]), key=numkey)
    m = re.search(r"^\*\*Accepted rows\*\* \(`expected` and `error` both empty\) claim only that the function returns without error and claim \*\*no bytes\*\*: .*\(\d+ rows\)\.$", s, re.M)
    assert m
    s = s[:m.start()] + "**Accepted rows** (`expected` and `error` both empty) claim only that the function returns without error and claim **no bytes**: " + ", ".join(acc) + " (%d rows)." % len(acc) + s[m.end():]
    # mutants added after the design table
    extra = [r for r in mut if int(r[0][1:]) > 128]
    kc = {}
    for r in extra:
        kc[r[1]] = kc.get(r[1], 0) + 1
    block = ["### Mutants beyond the design table (K129 to K%d)\n" % int(mut[-1][0][1:]),
             "`K129`-`K200` (the gap round, `tools/gaps.py`) and `K201`-`K%d` (the rev 4 round, `tools/gaps2.py`) are mutants of the Python references of those two scripts, not of the design's table; each names the new rows that kill it, "
             "re-evaluated on the stored inputs with the mutant active: %s.\n" % (int(mut[-1][0][1:]), ", ".join("%s %d" % (k, v) for k, v in sorted(kc.items()))),
             "| Mutant | Verdict | Named killer rows | Mutation |", "|---|---|---|---|"]
    for r in extra:
        block.append("| %s | %s | %s | %s |" % (r[0], r[1], r[2] if len(r[2]) < 120 else r[2][:117] + "...", r[4]))
    block.append("")
    block.append("`K%s` restates `K158` (the correction, see `AMBIGUITIES.md`): `K158` names `X97`, a 33-byte file that the 45-byte minimum refuses before the IEND rule, so it does not kill that mutation.\n" % kids[-1][1:])
    rep("\n## Rows that claim no bytes", "\n" + "\n".join(block) + "\n## Rows that claim no bytes")
    # the revision 4 section, before the Notes
    sec = """## Revision 4 round (rows only, appended)

Design 32 rev 4 folded the owner-adopted rules R32-01 to R32-13 and R32-16 (text only; no Appendix A byte changed). `tools/gaps2.py` (self-contained Python reference of 6.4, 11.2-11.5 and 5.1 as rev 4 reads them) adds rows and mutants only; **no earlier file, row or line changed**: the old `EXPECT.tsv`, `MUTANTS.tsv` and `AMBIGUITIES.md` are exact prefixes of the new ones and every other earlier file is byte-identical (the owner's append-only check).

| Family | Added | Ids | Content |
|---|---|---|---|
| B | 64 | B111-B174 | pan and zoom domains (R32-02), value sets of `dir`, `end`, `delta` (R32-03), wrong JSON type of `mode`, `mods`, `key`, `action` and the order of those checks (R32-04) |
| E | 29 | E74-E102 | `parseMachine` pointer-field ranges (R32-10): the limit accepted and one beyond refused for `last_t`, `x`, `x0`, `y`, `y0`, `t0`, `id`, pinch `d`, `mx`, `my`, and for the second pointer |
| X | 98 | X178-X275 | manifest bytes: BOM, invalid UTF-8, duplicate keys, number spellings, lone surrogates, `-0` (R32-07); whole-manifest passes (R32-08); embed check order and the closed binding object (R32-06); chunk types, `IEND` length, rows of at least 45 bytes without `IEND` (R32-05, the `K158` correction); `expectedPngSize` (R32-09) |
| K | %d | K201-K%s | mutants of those rows (every one killed by at least one row, by a new row except `K272`, the lower limit of `last_t`, whose killer is the earlier row `E60`; `K%s` is the correction of `K158`) |

Rules that need no row (R32-01 carried by `X31`-`X48`, R32-11, R32-12, R32-13, R32-16 text only; R32-14, R32-15 open) and the new ambiguities are in `AMBIGUITIES.md` (sections `R32 rule -> carrying rows`, `A-85` to `A-94`). "Earlier rows" of R32-01 and all single-fault rows still hold under the rev 4 text (the new reference agrees with every earlier row it can evaluate: see `AMBIGUITIES.md`).
The digest of `SHA256SUMS` is reported with the round and is **not** stored here (this README is covered by it). `APPENDIX-A.tsv` and `PARITY.tsv` are unchanged.

""" % (len(kids), kids[-1][1:], kids[-1][1:])
    rep("## Notes\n", sec + "## Notes\n")
    with open(p, "wb") as f:
        f.write(s.encode("utf-8"))
