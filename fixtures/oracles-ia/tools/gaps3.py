#!/usr/bin/env python3
"""Rows G45.. and mutants K312.. of the oracles-ia corpus for the two owner rulings R32-14 and R32-15 (R-I oracle author, 2026-11-21), written from design 32 rev 4
section 10 ("Shape versus finding", the G1-REACH row, G7-LIVE) and 9.2 alone. It reads no TypeScript and nothing under packages/.

Additive generator, like gaps.py and gaps2.py: it ADDS rows and mutants to a corpus whose earlier files stay byte-identical; the old EXPECT.tsv, MUTANTS.tsv and
AMBIGUITIES.md are exact prefixes of the new ones. The reference is tools/companion.py (the gate and its tree-shape check, brought in line with the two rulings; it
carries the K312..K346 faults as switches). Standard library only.

    python tools/gaps3.py              dry run: builds every row, self-checks, regression over the earlier G rows, mutant matrix; writes nothing
    python tools/gaps3.py --write      writes the new files, appends EXPECT.tsv, MUTANTS.tsv, AMBIGUITIES.md, updates README.md, regenerates SHA256SUMS
    python tools/gaps3.py --root DIR   use another corpus directory (the default is the parent of tools/)
    python tools/gaps3.py --sums-only  regenerates SHA256SUMS alone

Run it once, after gen.py, gaps.py and gaps2.py, on a corpus that does not hold the new files. The dry run may be repeated on a written corpus: it then checks that
every file it would write is already there and equal.
"""
import copy
import hashlib
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
if "--root" in sys.argv:
    ROOT = os.path.abspath(sys.argv[sys.argv.index("--root") + 1])
WRITE = "--write" in sys.argv

import base  # noqa: E402
from base import IaErr, cjb, mk_state, _esc  # noqa: E402
import corpus as C  # noqa: E402
import companion  # noqa: E402


def rd(p):
    with open(os.path.join(ROOT, p), "rb") as f:
        return f.read()


def sha(b):
    return hashlib.sha256(b).hexdigest()


def regen_sums():
    files = []
    for d, ds, fs in os.walk(ROOT):
        rel = os.path.relpath(d, ROOT).replace(os.sep, "/")
        if rel == "tools" or rel.startswith("tools/") or "__pycache__" in rel:
            continue
        for f in fs:
            p = f if rel == "." else rel + "/" + f
            if p == "SHA256SUMS":
                continue
            files.append(p)
    files.sort(key=lambda p: p.encode("utf-8"))
    out = "".join("%s *%s\n" % (sha(rd(p)), p) for p in files)
    with open(os.path.join(ROOT, "SHA256SUMS"), "wb") as f:
        f.write(out.encode("utf-8"))
    return len(files)


if "--sums-only" in sys.argv:
    print(regen_sums())
    sys.exit(0)


def ser(v):
    """tree file bytes: IGR-CJ/1 where the value has one (base.cj), the same layout extended by `null` and non-integer numbers where a row needs them (ill-typed trees)"""
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, float):
        assert v != int(v), v
        return repr(v)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return _esc(v)
    if isinstance(v, list):
        return "[" + ",".join(ser(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(_esc(k) + ":" + ser(v[k]) for k in sorted(v, key=lambda k: k.encode("utf-16-be"))) + "}"
    raise AssertionError(type(v))


def jin(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


# ------------------------------------------------------------------ scenes, states, base trees
C.init_scenes()
SC = C.SC
O1, G9, EMP = SC["O1"].model, SC["G9"].model, SC["EMPTY"].model
ST_O1 = mk_state(O1)
ST_G0 = mk_state(G9)
ST_GE = mk_state(G9, focus=C.nd(G9, "e"))
assert cjb(ST_GE) == rd("states/g_e.state.json")
assert cjb(ST_G0) == rd("states/g0.state.json")


def tree_of(m, st, **opts):
    o = dict(opts)
    o["events"] = []
    return companion.build_tree(m, st, o)


C01 = tree_of(O1, ST_O1)
assert cjb(C01) == rd("trees/C01.tree.json")
TG0 = tree_of(G9, ST_G0)                      # 18 items, no focus, the tab stop is position 1
TGE = tree_of(G9, ST_GE)
assert cjb(TGE) == rd("trees/G02.tree.json")
TEMP = tree_of(EMP, mk_state(EMP))
assert len(TG0["items"]) == 18 and TEMP["items"] == []

RD_E = {"focus": {"node": base.wire(G9, C.nd(G9, "e"))}}
STATES = {"O1": ("initial", ST_O1), "G9": ("initial", ST_G0), "G9e": ("states/g_e.state.json", ST_GE), "EMPTY": ("initial", mk_state(EMP))}
SCENE_OF = {"O1": "O1", "G9": "G9", "G9e": "G9", "EMPTY": "EMPTY"}

ROWS = []
FILES = {}
RULE = [""]
COUNTER = [44]


def nid():
    COUNTER[0] += 1
    n = COUNTER[0]
    return "G%d" % n if n >= 100 else "G%02d" % n


def row(desc, tree, where="O1", mode=None, composition=None, svg=None, extra=None, tabstops=None, readout=None):
    """one gate row: the tree is written as trees/<id>.tree.json; the expected bytes or the error come from the reference run"""
    rid = nid()
    sc = SC[SCENE_OF[where]]
    spath, st = STATES[where]
    tp = "trees/%s.tree.json" % rid
    FILES[tp] = ser(tree).encode("utf-8")
    inp = {"fidelity": "none", "reducedMotion": True, "state": spath, "tree": tp}
    if composition:
        inp["composition"] = composition
    if svg is not None:
        inp["svg"] = svg
    if mode is not None:
        inp["mode"] = mode
    if tabstops is not None:
        inp["tabStops"] = tabstops
    if readout is not None:
        inp["readout"] = readout
    if extra:
        inp.update(extra)
    ROWS.append(dict(id=rid, group="G", scene=sc.scene_path, layout=sc.layout_path, inp=inp, input=jin(inp), tree=tree, model=sc.model, state=st, desc=desc, rule=RULE[0]))
    return rid


def kwargs(r):
    inp = r["inp"]
    return dict(composition=inp.get("composition", "companion"), window=inp.get("window"), fidelity=inp.get("fidelity"),
                reduced=inp.get("reducedMotion") if inp.get("fidelity") is not None else None, readout=inp.get("readout"),
                canvas_label=inp.get("canvasLabel"), svg=copy.deepcopy(inp.get("svg")), mode=inp.get("mode"), tab_stops=inp.get("tabStops"))


def evaluate(r):
    """('ok', bytes) | ('err', 'CODE/REASON') | ('crash', type)"""
    try:
        rep = companion.run_gate(r["model"], r["state"], tree=copy.deepcopy(r["tree"]), **kwargs(r))
        return ("ok", cjb(rep))
    except IaErr as e:
        return ("err", str(e))
    except Exception as e:  # a reference fault that crashes is flagged, never counted as a kill
        return ("crash", type(e).__name__)


def deep_set(t, path, value):
    o = t
    for k in path[:-1]:
        o = o[k]
    o[path[-1]] = value
    return t


def deep_del(t, path):
    o = t
    for k in path[:-1]:
        o = o[k]
    del o[path[-1]]
    return t


def edit(base_tree, *edits):
    t = copy.deepcopy(base_tree)
    for e in edits:
        if e[0] == "del":
            deep_del(t, e[1])
        else:
            deep_set(t, e[0], e[1])
    return t


def it_of(tree, pos):
    return copy.deepcopy(tree["items"][pos - 1])


def with_items(tree, items):
    t = copy.deepcopy(tree)
    t["items"] = [copy.deepcopy(i) for i in items]
    return t


def at(item, **kw):
    i = copy.deepcopy(item)
    i.update(kw)
    return i


# ====================================================================== R32-14: ITEM_DUPLICATE once per repeated position value, at its second occurrence
RULE[0] = "R32-14"
ALL = TG0["items"]
IT = lambda p: it_of(TG0, p)                       # noqa: E731
row("position 3 twice (the control: one finding under either reading)", with_items(TG0, ALL + [IT(3)]), "G9")
row("position 3 three times: one finding, the third occurrence adds none", with_items(TG0, ALL + [IT(3), IT(3)]), "G9")
row("position 3 four times: one finding", with_items(TG0, ALL + [IT(3)] * 3), "G9")
row("position 3 five times: one finding", with_items(TG0, ALL + [IT(3)] * 4), "G9")
row("positions 5 and 3 each twice: the order of the second occurrence (5, 3), not first occurrence (3, 5) and not numeric", with_items(TG0, ALL + [IT(5), IT(3)]), "G9")
scr = [IT(7), IT(3), IT(5)] + [IT(p) for p in range(1, 19) if p not in (3, 5, 7)] + [IT(5), IT(7), IT(3)]
row("three positions repeated in a scrambled array: first occurrences 7,3,5; second occurrences 5,7,3; numeric 3,5,7; findings 5,7,3", with_items(TG0, scr), "G9")
row("positions 6 and 4 three times each, interleaved: second occurrences 6,4; last occurrences 4,6; first occurrences and numeric 4,6", with_items(TG0, ALL + [IT(6), IT(4), IT(4), IT(6)]), "G9")
miss = [IT(p) for p in range(1, 19) if p not in (4, 12)] + [IT(17), IT(2)]
row("items 4 and 12 missing and positions 17, 2 repeated: ITEM_MISSING ascending first, then ITEM_DUPLICATE in second-occurrence order (17, 2)", with_items(TG0, miss), "G9")
row("position 25 (n = 18) twice: out of range, still one ITEM_DUPLICATE (and POSITION_INVALID for each item)", with_items(TG0, ALL + [at(IT(3), position=25)] * 2), "G9")
row("position 0 three times: one ITEM_DUPLICATE, three POSITION_INVALID", with_items(TG0, ALL + [at(IT(3), position=0)] * 3), "G9")
row("positions 30 (twice) and 2 (three times): findings 30, 2 (second occurrences)", with_items(TG0, ALL + [at(IT(3), position=30), at(IT(3), position=30), IT(2), IT(2)]), "G9")
row("the focused and tab-stop item repeated: ITEM_DUPLICATE with TABSTOP_COUNT and FOCUS_COUNT", with_items(TGE, TGE["items"] + [it_of(TGE, 5)]), "G9e", tabstops=1, readout=RD_E)
row("a repeated position whose second copy differs (name): ITEM_DUPLICATE and NAME_MISMATCH", with_items(TG0, ALL + [at(IT(3), name="zz")]), "G9")
row("empty graph, position 1 twice: ITEM_DUPLICATE and POSITION_INVALID for each", with_items(TEMP, [at(it_of(C01, 1), tabindex=-1)] * 2), "EMPTY")
row("position 8 three times adjacent inside the array", with_items(TG0, ALL[:8] + [IT(8), IT(8)] + ALL[8:]), "G9")

# ====================================================================== R32-15: an ill-typed tree field is INVALID_TREE/SCHEMA before any check
RULE[0] = "R32-15"
SCHEMA = "INVALID_TREE/SCHEMA"


def bad(desc, *edits, where="O1", **kw):
    row("ill-typed: " + desc, edit(C01 if where == "O1" else TG0, *edits), where, **kw)


bad("companion is a number", (["companion"], 5))
bad("id_prefix is null", (["id_prefix"], None))
bad("layout_sha256 is an array", (["layout_sha256"], []))
bad("scene_sha256 is a boolean", (["scene_sha256"], True))
bad("mode is a number (not a string such as `bogus`)", (["mode"], 5))
bad("mode is null", (["mode"], None))
bad("mode is a boolean", (["mode"], True))
bad("mode is an array holding the valid string", (["mode"], ["normal"]))
bad("mode is an object", (["mode"], {"normal": 1}))
bad("mode is a number while the input states mode normal", (["mode"], 5), mode="normal")
bad("container is a string", (["container"], "x"))
bad("container is null", (["container"], None))
bad("container.description is a number", (["container", "description"], 5))
bad("container.name is null", (["container", "name"], None))
bad("container.role is a number (no check reads it)", (["container", "role"], 5))
bad("list is an array", (["list"], []))
bad("list.role is a number", (["list", "role"], 5))
bad("list.multiselectable is the string true", (["list", "multiselectable"], "true"))
bad("list.multiselectable is the number 1", (["list", "multiselectable"], 1))
bad("list.set_size is the string 3", (["list", "set_size"], "3"))
bad("list.set_size is 3.5", (["list", "set_size"], 3.5))
bad("list.set_size is null", (["list", "set_size"], None))
bad("list.window is null", (["list", "window"], None))
bad("list.window.first is the string 1", (["list", "window", "first"], "1"))
bad("list.window.count is a boolean", (["list", "window", "count"], True))
bad("items is null", (["items"], None))
bad("items is an object", (["items"], {}))
bad("the first item is null", (["items", 0], None))
bad("the second item is a string", (["items", 1], "x"))
bad("item 1 id is a number", (["items", 0, "id"], 5))
bad("item 2 kind is null", (["items", 1, "kind"], None))
bad("item 3 name is a number", (["items", 2, "name"], 5))
bad("item 2 roledescription is a boolean", (["items", 1, "roledescription"], True))
bad("item 1 address is a string", (["items", 0, "address"], "x"))
bad("item 3 address is an array", (["items", 2, "address"], []))
bad("item 1 address is the empty object", (["items", 0, "address"], {}))
bad("item 2 address has both node and edge", (["items", 1, "address"], {"edge": {"x": 1}, "node": {"id": "s:ann", "type": "person"}}))
bad("item 1 focused is the string false", (["items", 0, "focused"], "false"))
bad("item 2 focused is the number 0", (["items", 1, "focused"], 0))
bad("item 3 selected is null", (["items", 2, "selected"], None))
bad("item 1 selected is the string true", (["items", 0, "selected"], "true"))
bad("item 1 position is the string 1", (["items", 0, "position"], "1"))
bad("item 2 position is 1.5", (["items", 1, "position"], 1.5))
bad("item 3 position is null", (["items", 2, "position"], None))
bad("item 1 position is a boolean", (["items", 0, "position"], True))
bad("item 1 set_size is the string 3", (["items", 0, "set_size"], "3"))
bad("item 3 set_size is 2.5", (["items", 2, "set_size"], 2.5))
bad("item 1 tabindex is the string 0", (["items", 0, "tabindex"], "0"))
bad("item 2 tabindex is a boolean", (["items", 1, "tabindex"], True))
bad("live is null", (["live"], None))
bad("live is a string", (["live"], "polite"))
bad("live.atomic is the string true", (["live", "atomic"], "true"))
bad("live.atomic is the number 1", (["live", "atomic"], 1))
bad("live.atomic is null", (["live", "atomic"], None))
bad("live.politeness is a number", (["live", "politeness"], 5))
bad("live.politeness is null", (["live", "politeness"], None))
bad("live.role is a number", (["live", "role"], 5))
bad("live.text is a number", (["live", "text"], 5))
bad("live.text is null", (["live", "text"], None))
bad("live.text is an array of strings", (["live", "text"], ["x"]))
bad("a G9 tree: item 14 (an edge) tabindex is a string", (["items", 13, "tabindex"], "-1"), where="G9")

# precedence: the type error comes before any check, so a tree that also has findings is still the error
bad("container.role is a number and list.set_size is a wrong integer (SETSIZE_WRONG would be a finding)", (["container", "role"], 5), (["list", "set_size"], 4))
bad("item 3 tabindex is a string, mode is the string bogus and live is absent", (["items", 2, "tabindex"], "0"), (["mode"], "bogus"), ("del", ["live"]))
bad("live.atomic is the string true and item 1 name is empty (NAME_EMPTY would be a finding)", (["live", "atomic"], "true"), (["items", 0, "name"], ""))
bad("mode is a number and live.politeness is assertive (LIVE_NOT_POLITE would be a finding)", (["mode"], 5), (["live", "politeness"], "assertive"))
bad("item 1 position is a string and live.text is a number (two faults)", (["items", 0, "position"], "1"), (["live", "text"], 5))
row("the tree is an empty array", [], "O1")
row("the tree is a string", "x", "O1")
SVG_G32 = json.loads(next(l for l in rd("EXPECT.tsv").decode().split("\n") if l.startswith("G32\t")).split("\t")[5])
row("svg-native: an ill-typed tree (mode a number) is ignored, the report is that of G32", edit(TGE, (["mode"], 5)), "G9e",
    composition="svg-native", svg=SVG_G32["svg"], tabstops=1, readout=RD_E)
row("svg-native: a tree that is an array is ignored, the report is that of G32", [], "G9e", composition="svg-native", svg=SVG_G32["svg"], tabstops=1, readout=RD_E)

# controls: a field of the right type with a wrong value stays a finding (MODE_INVALID and the LIVE_* findings apply only to a well-typed tree)
RULE[0] = "R32-15-control"


def bad(desc, *edits, where="O1", **kw):          # noqa: F811  (the controls: well-typed trees)
    row("well-typed: " + desc, edit(C01 if where == "O1" else TG0, *edits), where, **kw)


bad("mode is the string bogus: MODE_INVALID, the one finding for that tree", (["mode"], "bogus"))
bad("mode is the string bogus and the input states mode normal: MODE_INVALID, not MODE_MISMATCH", (["mode"], "bogus"), mode="normal")
bad("mode is the empty string: MODE_INVALID", (["mode"], ""))
bad("mode is marquee and the input states normal: MODE_MISMATCH", (["mode"], "marquee"), mode="normal")
bad("live.politeness is assertive: LIVE_NOT_POLITE", (["live", "politeness"], "assertive"))
bad("live.atomic is false: LIVE_NOT_ATOMIC", (["live", "atomic"], False))
bad("live.atomic false, politeness off, text 401 units: the three LIVE findings in table order", (["live", "atomic"], False), (["live", "politeness"], "off"), (["live", "text"], "x" * 401))
bad("live is absent and mode is bogus: MODE_INVALID then LIVE_MISSING", ("del", ["live"]), (["mode"], "bogus"))
bad("live.text is exactly 400 units: no finding", (["live", "text"], "x" * 400))
bad("id_prefix is a string that does not match the item ids: ID_WRONG for every item", (["id_prefix"], "zz"))
bad("items is the empty array: ITEM_MISSING for 1, 2, 3 and TABSTOP_COUNT", (["items"], []))


# ====================================================================== evaluation, self-checks, mutant matrix
def outcomes(rows):
    return {r["id"]: evaluate(r) for r in rows}


MUTANTS = [
    ("K312", "ITEM_DUPLICATE counted once per extra occurrence (the old reading: a position four times gives three findings)"),
    ("K313", "only the first repeated position is reported"),
    ("K314", "repeated positions ordered by their first occurrence"),
    ("K315", "repeated positions ordered by position number"),
    ("K316", "repeated positions ordered by their last occurrence"),
    ("K317", "ITEM_DUPLICATE findings listed before the ITEM_MISSING findings"),
    ("K318", "a repeated position outside 1..n is not reported as ITEM_DUPLICATE"),
    ("K319", "a position counts as repeated only when the later item equals the earlier one entirely"),
    ("K320", "ITEM_DUPLICATE reported only for a position that occurs three or more times (at the third occurrence)"),
    ("K321", "mode not type-checked: a mode that is not a string is reported as MODE_INVALID"),
    ("K322", "mode type-checked only when the input states a mode"),
    ("K323", "a string mode outside normal and marquee refused as INVALID_TREE/SCHEMA instead of the MODE_INVALID finding"),
    ("K324", "live fields not type-checked: ill-typed politeness, atomic or text reported as LIVE_* findings"),
    ("K325", "live.text not type-checked: a text that is not a string reported as LIVE_TOO_LONG"),
    ("K326", "live.atomic: the string true accepted (truthiness) and then reported as LIVE_NOT_ATOMIC"),
    ("K327", "live null treated as an absent live (LIVE_MISSING) instead of INVALID_TREE/SCHEMA"),
    ("K328", "an absent live refused as INVALID_TREE/SCHEMA instead of LIVE_MISSING"),
    ("K329", "a string politeness other than polite refused as INVALID_TREE/SCHEMA instead of LIVE_NOT_POLITE"),
    ("K330", "live.atomic false refused as INVALID_TREE/SCHEMA instead of LIVE_NOT_ATOMIC"),
    ("K331", "the type error is raised after the checks and only when no check failed (precedence swapped)"),
    ("K332", "only the first item is type-checked"),
    ("K333", "a boolean accepted where an integer is required"),
    ("K334", "the integers 0 and 1 accepted where a boolean is required"),
    ("K335", "a non-integer number accepted where an integer is required"),
    ("K336", "list.role and list.multiselectable not type-checked"),
    ("K337", "container.description, name and role not type-checked"),
    ("K338", "companion, layout_sha256 and scene_sha256 not type-checked"),
    ("K339", "list.set_size not type-checked"),
    ("K340", "list.window.first and list.window.count not type-checked"),
    ("K341", "item id, kind, name and roledescription not type-checked"),
    ("K342", "item focused and selected not type-checked"),
    ("K343", "item set_size and tabindex not type-checked"),
    ("K344", "item position not type-checked: a position that is not an integer reported as POSITION_INVALID"),
    ("K345", "item address shape not checked"),
    ("K346", "an ill-typed tree checked (INVALID_TREE/SCHEMA) in the svg-native composition, where the tree is ignored"),
]
assert [k for k, _ in MUTANTS] == ["K%d" % (312 + i) for i in range(len(MUTANTS))]


def main():
    base.MUT.clear()
    out = outcomes(ROWS)
    probs = []
    for r in ROWS:
        o = out[r["id"]]
        if o[0] == "crash":
            probs.append(("crash", r["id"], o))
    # expected outcomes stated by hand (design text): every R32-15 row whose description starts "ill-typed" is the schema error, the controls and R32-14 rows are reports
    for r in ROWS:
        o = out[r["id"]]
        if r["rule"] == "R32-15" and (r["desc"].startswith("ill-typed") or r["desc"].startswith("the tree is")):
            if o != ("err", SCHEMA):
                probs.append(("expected the schema error", r["id"], o))
        elif r["desc"].startswith("svg-native"):
            if o != ("ok", rd("gates/G32.gate.json")):
                probs.append(("svg-native report is not G32's", r["id"], o))
        else:
            if o[0] != "ok":
                probs.append(("expected a report", r["id"], o))
    # findings stated by hand (the design text, not the reference): the rows of R32-14 and the controls
    def finds(rid):
        rep = json.loads(out[rid][1])
        return [(c["id"], f["code"], f.get("position")) for c in rep["checks"] for f in c["findings"] if f["code"] != "EDGE_TARGET_BELOW_24"]
    byd = {r["desc"]: r["id"] for r in ROWS}
    HAND = [
        ("position 3 twice", [("G1-REACH", "ITEM_DUPLICATE", 3)]),
        ("position 3 three times", [("G1-REACH", "ITEM_DUPLICATE", 3)]),
        ("position 3 four times", [("G1-REACH", "ITEM_DUPLICATE", 3)]),
        ("position 3 five times", [("G1-REACH", "ITEM_DUPLICATE", 3)]),
        ("positions 5 and 3", [("G1-REACH", "ITEM_DUPLICATE", 5), ("G1-REACH", "ITEM_DUPLICATE", 3)]),
        ("three positions repeated", [("G1-REACH", "ITEM_DUPLICATE", 5), ("G1-REACH", "ITEM_DUPLICATE", 7), ("G1-REACH", "ITEM_DUPLICATE", 3)]),
        ("positions 6 and 4", [("G1-REACH", "ITEM_DUPLICATE", 6), ("G1-REACH", "ITEM_DUPLICATE", 4)]),
        ("items 4 and 12 missing", [("G1-REACH", "ITEM_MISSING", 4), ("G1-REACH", "ITEM_MISSING", 12), ("G1-REACH", "ITEM_DUPLICATE", 17), ("G1-REACH", "ITEM_DUPLICATE", 2)]),
        ("position 25", [("G1-REACH", "ITEM_DUPLICATE", 25), ("G2-NAME", "POSITION_INVALID", 25), ("G2-NAME", "POSITION_INVALID", 25)]),
        ("position 0 three times", [("G1-REACH", "ITEM_DUPLICATE", 0)] + [("G2-NAME", "POSITION_INVALID", 0)] * 3),
        ("positions 30", [("G1-REACH", "ITEM_DUPLICATE", 30), ("G1-REACH", "ITEM_DUPLICATE", 2), ("G2-NAME", "POSITION_INVALID", 30), ("G2-NAME", "POSITION_INVALID", 30)]),
        ("the focused and tab-stop item repeated", [("G1-REACH", "ITEM_DUPLICATE", 5), ("G3-TRAP", "TABSTOP_COUNT", None), ("G4-FOCUS", "FOCUS_COUNT", None)]),
        ("a repeated position whose second copy differs", [("G1-REACH", "ITEM_DUPLICATE", 3), ("G2-NAME", "NAME_MISMATCH", 3)]),
        ("empty graph", [("G1-REACH", "ITEM_DUPLICATE", 1), ("G2-NAME", "POSITION_INVALID", 1), ("G2-NAME", "POSITION_INVALID", 1)]),
        ("position 8 three times adjacent", [("G1-REACH", "ITEM_DUPLICATE", 8)]),
    ]
    for key, want in HAND:
        rid = next(i for d, i in byd.items() if d.startswith(key))
        if finds(rid) != want:
            probs.append(("hand-stated findings differ", rid, finds(rid), want))
    CONTROLS = [
        ("mode is the string bogus: MODE_INVALID", [("G7-LIVE", "MODE_INVALID", None)]),
        ("mode is the string bogus and the input states mode normal", [("G7-LIVE", "MODE_INVALID", None)]),
        ("mode is the empty string", [("G7-LIVE", "MODE_INVALID", None)]),
        ("mode is marquee and the input states normal", [("G7-LIVE", "MODE_MISMATCH", None)]),
        ("live.politeness is assertive", [("G7-LIVE", "LIVE_NOT_POLITE", None)]),
        ("live.atomic is false", [("G7-LIVE", "LIVE_NOT_ATOMIC", None)]),
        ("live.atomic false, politeness off", [("G7-LIVE", "LIVE_NOT_POLITE", None), ("G7-LIVE", "LIVE_NOT_ATOMIC", None), ("G7-LIVE", "LIVE_TOO_LONG", None)]),
        ("live is absent and mode is bogus", [("G7-LIVE", "MODE_INVALID", None), ("G7-LIVE", "LIVE_MISSING", None)]),
        ("live.text is exactly 400", []),
        ("id_prefix is a string that does not match", [("G2-NAME", "ID_WRONG", 1), ("G2-NAME", "ID_WRONG", 2), ("G2-NAME", "ID_WRONG", 3)]),
        ("items is the empty array", [("G1-REACH", "ITEM_MISSING", 1), ("G1-REACH", "ITEM_MISSING", 2), ("G1-REACH", "ITEM_MISSING", 3), ("G3-TRAP", "TABSTOP_COUNT", None), ]),
    ]
    for key, want in CONTROLS:
        rid = next(i for d, i in byd.items() if d.startswith("well-typed: " + key))
        got = finds(rid)
        if key.startswith("items is the empty"):
            got = [g for g in got if g[0] != "G4-FOCUS"]
        if got != want:
            probs.append(("control findings differ", rid, got, want))
    ids = [r["id"] for r in ROWS]
    assert len(set(ids)) == len(ids)
    if probs:
        for p in probs:
            print("SELF-CHECK FAIL", p, file=sys.stderr)
        sys.exit(1)
    # the earlier G rows (every row of group G of EXPECT.tsv) read with the new reference
    n_old, bad_old = 0, []
    for ln in rd("EXPECT.tsv").decode("utf-8").split("\n")[1:]:
        c = ln.split("\t")
        if len(c) < 8 or c[1] != "G" or c[0] in ids:
            continue
        inp = json.loads(c[5])
        name = [k for k, s in SC.items() if s.scene_path == c[3]][0]
        m = SC[name].model
        st = json.loads(rd(inp["state"]).decode()) if inp["state"] != "initial" else mk_state(m)
        kw = dict(composition=inp.get("composition", "companion"), window=inp.get("window"), fidelity=inp.get("fidelity"),
                  reduced=inp.get("reducedMotion") if inp.get("fidelity") is not None else None, readout=inp.get("readout"), canvas_label=inp.get("canvasLabel"),
                  svg=inp.get("svg"), mode=inp.get("mode"), tab_stops=inp.get("tabStops"))
        tree = json.loads(rd(inp["tree"]).decode()) if "tree" in inp else None
        b = json.loads(rd(inp["bindings"]).decode()) if "bindings" in inp else None
        got = cjb(companion.run_gate(m, st, tree=tree, bindings=b, **kw))
        n_old += 1
        if got != rd(c[6]):
            bad_old.append(c[0])
    # mutant matrix
    kill = []
    for name, desc in MUTANTS:
        base.MUT.clear()
        base.MUT.add(name)
        o = outcomes(ROWS)
        base.MUT.clear()
        changed = [i for i in ids if o[i] != out[i] and o[i][0] != "crash"]
        crashed = [i for i in ids if o[i][0] == "crash"]
        kill.append((name, desc, changed, crashed))
    return out, kill, n_old, bad_old


def tsv_row(r, expected, error):
    return "\t".join([r["id"], "G", "core", r["scene"], r["layout"], r["input"], expected, error])


def write_all(out, kill):
    old_expect = rd("EXPECT.tsv")
    old_mut = rd("MUTANTS.tsv")
    assert old_expect.endswith(b"\n") and old_mut.endswith(b"\n") and b"\r" not in old_expect + old_mut
    have = {l.split(b"\t")[0].decode() for l in old_expect.split(b"\n") if l}
    kids = [k for k, _ in MUTANTS]
    for i in [r["id"] for r in ROWS] + kids:
        assert i not in have, i
    lines = []
    new_files = dict(FILES)
    for r in ROWS:
        o = out[r["id"]]
        if o[0] == "ok":
            gp = "gates/%s.gate.json" % r["id"]
            new_files[gp] = o[1]
            lines.append(tsv_row(r, gp, ""))
        else:
            lines.append(tsv_row(r, "", o[1]))
    lines += ["\t".join([k, "K", "", "", "", "", "", ""]) for k in kids]
    mlines = []
    for k, (name, desc, changed, crashed) in zip(kids, kill):
        ch = ",".join(changed)
        mlines.append("\t".join([k, "KILLED", ch, ch, desc]))
    for p, d in new_files.items():
        full = os.path.join(ROOT, p)
        assert not os.path.exists(full), p
        assert not p.startswith("/") and ".." not in p.split("/")
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(d)
    with open(os.path.join(ROOT, "EXPECT.tsv"), "wb") as f:
        f.write(old_expect + ("\n".join(lines) + "\n").encode("utf-8"))
    with open(os.path.join(ROOT, "MUTANTS.tsv"), "wb") as f:
        f.write(old_mut + ("\n".join(mlines) + "\n").encode("utf-8"))
    return new_files


def check_existing_equal(out):
    n = 0
    for p, d in FILES.items():
        if os.path.exists(os.path.join(ROOT, p)):
            assert rd(p) == d, "differs: " + p
            n += 1
    for r in ROWS:
        o = out[r["id"]]
        gp = "gates/%s.gate.json" % r["id"]
        if o[0] == "ok" and os.path.exists(os.path.join(ROOT, gp)):
            assert rd(gp) == o[1], "differs: " + gp
            n += 1
    return n


if __name__ == "__main__":
    out, kill, n_old, bad_old = main()
    survivors = [k for k in kill if not k[2]]
    crashers = [k for k in kill if k[3]]
    nerr = sum(1 for r in ROWS if out[r["id"]][0] == "err")
    print("rows: %d (R32-14 %d, R32-15 error rows %d, report rows (R32-14, controls, svg-native) %d); new tree files %d; mutants %d; survivors %d; mutants with a crashing row %d" % (
        len(ROWS), sum(1 for r in ROWS if r["rule"] == "R32-14"), nerr, len(ROWS) - nerr, len(FILES), len(MUTANTS), len(survivors), len(crashers)))
    for k in survivors:
        print("SURVIVOR", k[0], k[1])
    for k in crashers:
        print("CRASH (excluded from kills)", k[0], k[3])
    print("earlier G rows evaluated with the new reference: %d, differing: %s" % (n_old, bad_old))
    if bad_old or survivors:
        sys.exit(3)
    if WRITE:
        new_files = write_all(out, kill)
        sys.path.insert(0, HERE)
        import gaps3_text
        gaps3_text.apply(ROOT, ROWS, out, kill, [k for k, _ in MUTANTS], n_old)
        print("sums", regen_sums())
        print("written")
    else:
        print("existing equal:", check_existing_equal(out))
        for k in kill:
            print(k[0], ",".join(k[2]))
