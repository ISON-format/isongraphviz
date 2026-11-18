"""README.md and AMBIGUITIES.md of the corpus (generated; covered by SHA256SUMS, so no digest of the corpus is written in them)."""
from collections import Counter

LF = chr(10)
BT = chr(96)

FAMILY_TEXT = [
    ("G", "golden plans", "plan/Gnn.glplan (binary, 7.2)"),
    ("B", "buffer encoding, guard rule, plan sections", "plan/Bnn.glplan; B08 renderer-level (also list); B10 error"),
    ("H", "the shader set", "json/H0n.*.json, shaders/*.glsl"),
    ("W", "the plan reader (bad plans)", "bad/Wnn.glplan (error INVALID_INPUT/SCHEMA), bad/FAULTS.tsv"),
    ("X", "readouts", "xr/Xnn.xr.json (X07 error)"),
    ("E", "executor call logs against a fake context", "gllog/Enn.log (E10, E11: log and error)"),
    ("U", "the WebGL renderer (headless), the context controller", "scripts/, plan/, states/, json/, calls/, gllog/"),
    ("P", "the capability probe", "json/Pnn.probe.json + gllog/Pnn.log"),
    ("D", "differential (runtime)", "no files (self-checks of the generator, README)"),
    ("K", "mutants", "no files (MUTANTS.tsv)"),
]


def readme(rows, ap, res, checks):
    cnt = Counter(r.group for r in rows)
    L = []
    a = L.append
    a("# IGR-GL/1 oracle corpus (" + BT + "oracles-gl" + BT + ")")
    a("")
    a("Status: **DRAFT** (not frozen; no digest of " + BT + "SHA256SUMS" + BT + " is pinned anywhere). Produced against design 31 (" + BT + "31-CANVAS-WEBGL-DESIGN.md" + BT + ", **rev 5**, 1,821 lines; first written against rev 2, regenerated against rev 3 and again against rev 5) by an")
    a("independent oracle author who was given that design, design 30 rev 4 and design 27 rev 5, " + BT + "docs/specs/IGS-1.md" + BT + ", " + BT + "IGL-1.md" + BT + ", " + BT + "docs/conformance/README.md" + BT + ", the frozen fixtures")
    a("(" + BT + "fixtures/oracles" + BT + ", " + BT + "fixtures/oracles-igl" + BT + ") and, as read-only data, the scenes, layouts, states and expected SVG documents of the draft corpus " + BT + "fixtures/oracles-svg" + BT)
    a("(its " + BT + "SHA256SUMS" + BT + " digest " + BT + "63a198339b40417d1a039058e9e61b5f21fa1a5c887be29decd5c3bef97cccbd" + BT + " is asserted before anything is generated), plus the formats")
    a("(README, EXPECT.tsv, SHA256SUMS, generated/GENERATED.tsv) of the other draft corpora. Read " + BT + "AMBIGUITIES.md" + BT + " before judging any mismatch: it lists every place where the design was")
    a("ambiguous, contradictory or could not be built, the literal reading used, and why; design defects are flagged.")
    a("")
    a("## Independence statement")
    a("")
    a("* Every expected byte comes from the Python code in " + BT + "tools/" + BT + " (standard library only: " + BT + "hashlib" + BT + ", " + BT + "json" + BT + ", " + BT + "struct" + BT + ", " + BT + "math" + BT + ", " + BT + "fractions" + BT + ", " + BT + "re" + BT + ").")
    a("  The author re-implemented from the written rules: model derivation and effective visibility, " + BT + "initialState" + BT + " and the reducer subset the rows use, the display-list builder")
    a("  (design 31 section 4 with the geometry of design 30 sections 3, 6, 7), the Canvas replay and its recorded stream (needed for the three-way readout row and the Appendix A.4 gate), the plan with its guard rule")
    a("  and exact integer clipping, the strict plan reader with the rules G1-G16, the readouts, the executor call log, the context controller, the capability probe, the renderer manifest and a lifecycle simulation, and the 129 switchable mutants.")
    a("* The author did **not** read, import, copy or run any TypeScript, " + BT + "packages/*/src" + BT + ", any " + BT + "display-list" + BT + ", " + BT + "renderer-canvas" + BT + ", " + BT + "renderer-webgl" + BT + " or " + BT + "cross-check" + BT + " directory, any review or author-notes file, the")
    a("  tool code of any other corpus (in particular nothing under " + BT + "fixtures/oracles-svg/tools/" + BT + "), or anything under " + BT + "fixtures/oracles-dl/" + BT + " (the display-list/Canvas corpus written at the same time by another author).")
    a("  Consequently the scenes, layouts and states that design 31 13.4 says are reused from " + BT + "oracles-dl" + BT + " by relative path are **authored here** (" + BT + "scenes/" + BT + ", " + BT + "layouts/" + BT + ", " + BT + "states/" + BT + "), and the expected display lists")
    a("  are re-derived, not re-read (AMBIGUITIES A-03).")
    a("* Shared assumption: oracle and code implement the same written rules. The corpus proves that code matches the text as read in " + BT + "AMBIGUITIES.md" + BT + ". Third-party verification (" + BT + "verifyScene" + BT + ", " + BT + "verifyLayout" + BT + ", " + BT + "bindLayout" + BT + " over every file of")
    a("  " + BT + "scenes/" + BT + " and " + BT + "layouts/" + BT + ", " + BT + "parseState" + BT + " over every file of " + BT + "states/" + BT + " that is a state of an authored scene) is still required (design 13.1); the generator applied only a **lite** checker (canonical re-serialization, ordering, binding hash).")
    a("")
    a("## What is here")
    a("")
    a(BT + "EXPECT.tsv" + BT + ": header " + BT + "id group tier scene layout input expected error" + BT + " (13.2), **%d rows**, one per id of design 13.6." % len(rows))
    a("")
    a("| Family | Rows | Content | Expected files |")
    a("|---|---|---|---|")
    for f, name, files in FAMILY_TEXT:
        a("| %s | %d | %s | %s |" % (f, cnt[f], name, files))
    a("| **total** | **%d** | | |" % len(rows))
    a("")
    a("Rows with empty cells by design: D (5) and K (129); U10 is a kit run with neither file nor expected cell; W01 and the B-row \"also\" cases are described below. Rows with an " + BT + "error" + BT + " cell: B10, W02-W38, X07 (and the two rows E10, E11 that carry both a log and an error, AMBIGUITIES A-06).")
    a("")
    a("| Directory | Content |")
    a("|---|---|")
    a("| " + BT + "plan/" + BT + " | expected plans (binary " + BT + "igr-gl/1" + BT + ": header line, element table, label runs, three instance buffers) of rows G, B, X and the plans after each step of U scripts |")
    a("| " + BT + "bad/" + BT + " | the 37 bad plans W02-W38, " + BT + "X07.glplan" + BT + ", " + BT + "FAULTS.tsv" + BT + " (the rule each bad plan breaks), " + BT + "BASE.glplan" + BT + " (the plan they are made from) |")
    a("| " + BT + "gllog/" + BT + " | executor call logs (E), controller logs (U20-U39), probe call logs (P): one canonical JSON line per effect, LF-terminated |")
    a("| " + BT + "calls/" + BT + " | recorded Canvas streams: " + BT + "X05.calls" + BT + " (the Canvas stream of O1, all layers), " + BT + "U13.calls" + BT + " (the WebGL text layer, layer 8) |")
    a("| " + BT + "xr/" + BT + " | readouts " + BT + "igr-xr/1" + BT + ": canonical JSON plus one LF |")
    a("| " + BT + "json/" + BT + " | shader set bytes and digests (H), probe results (P), manifests, witnesses and outcome files (U), B08 outcome files |")
    a("| " + BT + "shaders/" + BT + " | the six shader sources (" + BT + "arrow|disc|edge" + BT + "." + BT + "vs|fs" + BT + ".glsl, exact bytes) and " + BT + "SHADER_SET_SHA256" + BT + " |")
    a("| " + BT + "scenes/ layouts/ states/" + BT + " | authored IGS/1 scenes, " + BT + "igl-fixed/1" + BT + " layouts and IGR/1 states (canonical bytes, no trailing LF) |")
    a("| " + BT + "scripts/" + BT + " | lifecycle scripts of the U01-U08 rows with their expectations filled in (generator outputs; ordinary JSON, sorted keys, indent 1) |")
    a("| " + BT + "inputs/" + BT + " | the numbers of the four searches (B01, B11, B12, B21) |")
    a("| " + BT + "generated/GENERATED.tsv" + BT + " | header only: no gl: row needs an oversize input (nothing is generated and not stored) |")
    a("| " + BT + "MUTANTS.tsv" + BT + ", " + BT + "APPENDIX-A.tsv" + BT + " | the mutant matrix and the Appendix A reproduction table (generated, covered by " + BT + "SHA256SUMS" + BT + ") |")
    a("| " + BT + "tools/" + BT + " | the generator (not in " + BT + "SHA256SUMS" + BT + ") |")
    a("")
    a(BT + "SHA256SUMS" + BT + ": one line " + BT + "<sha256> *<path>" + BT + " per file, sorted by byte order of the path, covering every file except " + BT + "tools/" + BT + " and itself.")
    a("")
    a("## Regenerate")
    a("")
    a("```text")
    a("python tools/gl.py                  # rewrites every generated file in place (the whole mutant matrix is included: about half a minute)")
    a("python tools/gl.py --out DIR        # the same into DIR (used for the byte-identity proof: two runs, different PYTHONHASHSEED, diff -r)")
    a("python tools/gl.py --no-matrix      # skip the mutant matrix (MUTANTS.tsv is then not written)")
    a("python tools/gl.py --mutant K12     # run one mutant over every row and list the rows that change")
    a("python tools/gl.py --check-appendix # print the Appendix A reproduction table only")
    a("```")
    a("")
    a("Python 3.12, standard library only, no network, no clock, no environment input. The only randomness is the 32-bit LCG of IGL/1 7.1 with fixed seeds (runtime tier D self-checks). The generator reads the design file")
    a("(" + BT + "31-CANVAS-WEBGL-DESIGN.md" + BT + " under " + BT + "docs/" + BT + ") to extract the Appendix A blocks (rules X1, X2) and the mutant table, and fails loudly if the file is missing, contains a CR, or a block disagrees.")
    a("")
    a("## Tiers")
    a("")
    a(BT + "core" + BT + ": a function on bytes (planner, reader, readout, executor log against a fake, probe against a fake). " + BT + "both" + BT + ": the function and the subject renderer (" + BT + "planBytes()" + BT + " equals the file). " + BT + "subject" + BT + ": lifecycle, renderer and controller rows. D rows are " + BT + "subject" + BT + "; K rows have an empty tier.")
    a("")
    a("## Row inputs (the grammar of 13.2 and what this author had to add)")
    a("")
    a("* **G, B** (plan rows) " + BT + "{\"size\":{\"height\":H,\"width\":W},\"state\":\"initial\"|\"<path>\"}" + BT + "; B09 and B10 add " + BT + "\"limits\":{\"maxBytes\":n}" + BT + "; B01, B11, B12, B21 add " + BT + "\"search\":\"inputs/....json\"" + BT + "; **B05** and **B08** list a second case under " + BT + "\"also\"" + BT + " (A-02, A-25); the third case of B08 is at list/plan level, key " + BT + "{\"list\":{\"maxDrawnLabelUnits\":0}}" + BT + " (A-41).")
    a("* **W** a path under " + BT + "bad/" + BT + " (expected empty, " + BT + "error" + BT + " " + BT + "INVALID_INPUT/SCHEMA" + BT + "); **W01** inline " + BT + "{\"files\":[\"plan/G01.glplan\",...]}" + BT + ": the reader accepts each and re-serializes it to itself.")
    a("* **X** " + BT + "{\"from\":\"gl\",\"plan\":\"<path>\"}" + BT + " (the readout of the plan alone); X05 " + BT + "{\"from\":\"three-way\",\"svg\":...,\"calls\":...,\"plan\":...}" + BT + "; X07 " + BT + "{\"from\":\"gl\",\"lenient\":true,\"plan\":\"bad/X07.glplan\"}" + BT + " (A-13).")
    a("* **E** " + BT + "{\"size\",\"state\",\"frame\":{\"widthPx\",\"heightPx\",\"ink\"},\"scenario\":\"create|frame|dispose|fail-compile:<program>.<stage>|fail-link:<program>\"}" + BT + "; E10 and E11 also carry " + BT + "info_log" + BT + " and " + BT + "expect_detail" + BT + " (the closed token, a colon and at most 120 characters of the log, 11.3).")
    a("* **U controller rows** " + BT + "{\"events\":[{\"op\":\"init|L|R|C|F|D\",\"fail\":\"compile|link|lost\"?,\"plan\":\"<path>\"?}],\"expect_status\":[...],\"expect_log\":\"gllog/Unn.log\"}" + BT + "; U37 lists four cases with a probe fake each.")
    a("* **P** " + BT + "{\"fake\":FAKE,\"need\":{...}?,\"options\":{...}?,\"expect_log\":\"gllog/Pnn.log\"}" + BT + "; " + BT + "expected" + BT + " is the canonical probe result (A-07).")
    a("* **U01-U08** a script path (the schema of 27 13.3a with the ops of 13.2 plus " + BT + "create" + BT + ", " + BT + "plan" + BT + ", " + BT + "planBytes" + BT + ", " + BT + "probe" + BT + "); " + BT + "expect" + BT + " is " + BT + "ok" + BT + " or " + BT + "CODE/REASON" + BT + ", " + BT + "expect_plan" + BT + " a plan file, " + BT + "expect_state" + BT + " a state file.")
    a("")
    a("* **File endings (13.2, rev 3).** Logs, streams and readouts: canonical text plus one LF. " + BT + "json/H01.set.json" + BT + " (4490 bytes), " + BT + "json/U06.*.manifest.json" + BT + " and " + BT + "json/U09.*.witness.json" + BT + ": IGR-CJ/1, no final LF. Every other " + BT + "json/" + BT + " file (probe results, H02-H06, outcome files), the scripts and " + BT + "inputs/*.json" + BT + ": ordinary JSON, indent 1, sorted keys, plus one LF (A-34). States, scenes, layouts: no final LF.")
    a("")
    a("## Shared geometry convention of the authored scenes")
    a("")
    a("Every authored layout is read under the viewport " + BT + "{center_x 450000, center_y 300000, zoom 1000, 900 x 600}" + BT + ": then a layout value in thousandths **is** the screen coordinate in milli-pixels, so a row can say \"a node at m-px (1178000, 300000)\" and the layout holds exactly those numbers. The state files of the authored scenes carry that viewport.")
    a("")
    a("## Appendix A reproduction (design 31)")
    a("")
    a("| Item | Result | Detail |")
    a("|---|---|---|")
    for item, status, detail in ap:
        a("| %s | **%s** | %s |" % (item.replace("|", "/"), status, detail.replace("|", "/")[:150]))
    a("")
    a("**" + BT + "SHADER_SET_SHA256" + BT + "**: the generator computes the SHA-256 of the canonical JSON of the six sources (4490 bytes, no trailing LF) and compares it with the design's " + BT + "eaf76017c4e62f6a445e9b550ace6301d75ea22143f27e9c66d9e97a631e6968" + BT + ": see the rows above; the six sources and the digest are recorded in " + BT + "shaders/" + BT + " and " + BT + "json/H0*" + BT + ".")
    a("")
    if res is not None:
        a("## Mutants")
        a("")
        k = sum(1 for r in res if r["verdict"].startswith("KILLED"))
        rdn = [r for r in res if r["verdict"].startswith("KILLED (")]
        unk = [r for r in res if r["verdict"].startswith("UNKILLABLE")]
        nm = [r for r in res if r["verdict"].startswith("NAMED")]
        a("The 129 GL mutants of design 13.5 are switchable variants inside the Python reference (" + BT + "--mutant Knn" + BT + "; " + BT + "tools/mut.py" + BT + " and the " + BT + "mut.on(...)" + BT + " calls). For each, every row is computed again and compared with the baseline; the named killer rows must change.")
        a("**%d of 129 killed by at least one named row; %d unkillable; %d changed only rows other than the named ones; %d killed but with at least one named row that does not kill (design defects):**" % (k, len(unk), len(nm), len(rdn)))
        a("")
        for r in rdn:
            a("* " + BT + r["mutant"] + BT + " (" + r["description"] + "): killed by " + ",".join(r["killing"]) + "; named but not killing: " + ",".join(r["notkilling"]) + ".")
        for r in unk:
            a("* " + BT + r["mutant"] + BT + ": UNKILLABLE.")
        for r in nm:
            a("* " + BT + r["mutant"] + BT + ": " + r["verdict"])
        a("")
        a("The full matrix is " + BT + "MUTANTS.tsv" + BT + " (columns mutant, description, named killers, killing rows, named rows that do not kill, other changed rows, verdict).")
        a("")
    a("## Self-checks the generator makes (all must pass before a file is written)")
    a("")
    for name, ok, detail in checks:
        if name.startswith("strict reader accepts") or " is accepted when only rule" in name or " is rejected by " in name or name.startswith("canonical re-serialization") or name.startswith("nodes of") or name.endswith("every plan number is below 2^24") or name.startswith("D0") and "cases" not in name and False:
            continue
        a("* %s %s" % ("ok:" if ok else "FAILED:", name))
    a("* ok: the single-fault property of every bad plan W02-W38 (rejected by the named rule only; accepted when only that rule is disabled), the strict reader's round trip of every plan file, every plan number below 2^24 (per file)")
    a("")
    a("## What is not claimed")
    a("")
    a("The shader sources were compiled once, by the author, in headless Chromium (see the hand-over) and not elsewhere; nothing here claims pixels, GPU behaviour, real context loss, other drivers or browsers. The runtime D rows have no frozen bytes. The controller, probe and lifecycle rows run on fakes and on a simulation whose every choice is recorded in " + BT + "AMBIGUITIES.md" + BT + ".")
    a("")
    return LF.join(L) + LF


AMBS = []


def _a(sev, secs, title, reading, why):
    AMBS.append((sev, secs, title, reading, why))


_a("DEFECT", "7.2 G1, G3; 13.4 W04; 13.5 K22, K24",
   "W04 (" + BT + "stride.edge 36" + BT + ") cannot isolate G3",
   "The header's " + BT + "stride" + BT + " is a constant checked by G1 (\"stride as stated\"); G3 (\"each size is a multiple of its stride\") is applied with the constant strides 28/16/40. W04 therefore breaks G1 and is accepted when only G1 is disabled.",
   "K24 (reader skips G3) names W07 and W04; W07 kills it, W04 does not (the row is still rejected by G1). Had G3 used the header's stride, W04 would break both G1 and G3: also not single-fault. Either way the design's claim that W04 isolates G3 is false. Recorded in " + BT + "bad/FAULTS.tsv" + BT + ".")
_a("DEFECT", "13.4 B05",
   "B05 asks for layers 1, 2, 3 and 5, 6, 7 in one plan, which one state cannot give",
   "Layer 2 needs a focused edge, layer 6 a focused node, and the focus is a single element (27 4.1). B05 is built as two cases: the primary (" + BT + "plan/B05.glplan" + BT + ": edge focus, layers 1, 2, 3, 4, 5, 7) and a second listed under " + BT + "\"also\"" + BT + " (" + BT + "plan/B05b.glplan" + BT + ": node focus, layers 1, 3, 4, 5, 6, 7).",
   "13.2 allows a second case through " + BT + "\"also\"" + BT + ".")
_a("DEFECT", "13.4 header; 13.1; 13.3 \"authored scenes\"",
   "oracles-gl reuses oracles-dl scenes by path, but the author may not read oracles-dl",
   "Every scene, layout and state that design 13.4 would take from " + BT + "oracles-dl" + BT + " (" + BT + "far" + BT + " and the G/Y states) is authored in this corpus (" + BT + "scenes/far-*" + BT + ", " + BT + "states/G08, G10, B03, B05, B05b" + BT + "); frozen and oracles-svg data are used by path. The expected display lists are not re-read: the builder is re-implemented and reproduces Appendix A.1-A.3 and A.9 byte for byte.",
   "Independence (13.1) forbids reading the other corpus. A later check that " + BT + "oracles-dl" + BT + " and " + BT + "oracles-gl" + BT + " agree on a scene is a cross-corpus test, not part of this corpus.")
_a("DEFECT", "7.6 table, row 2 and rows 6, 7",
   "Row \"created, ready, lost, failed | init\" contradicts the rows that define init in created",
   "init is a no-op in ready, lost, failed (the renderer answers ALREADY_INITIALIZED, the controller does nothing); in created it is the real initialize (rows 1, 2). Change-log M-8 says \"init outside created\".",
   "The change log of rev 2 states the intent; the table row lists " + BT + "created" + BT + " by mistake.")
_a("", "7.6 table, 7.6 vocabulary, 7.9",
   "When are the context-event listeners added, and do they survive a failed initialize?",
   "At every initialize that gets as far as the creation, before the creation calls, once (a second add is not logged); a failed initialize leaves them (the table lists no removal) and " + BT + "dispose" + BT + " removes them if present (" + BT + "removeEventListener" + BT + " x2). So U27 and U39 show the two " + BT + "addEventListener" + BT + " lines before the failed creation.",
   "The vocabulary says \"at a successful initialize, before creation\", which cannot be known before the creation runs; the table says nothing about a removal after a failure; \"listeners removed if any\" in the dispose row implies they can exist after a failed initialize.")
_a("", "7.5, 7.6, 13.2 E10, E11, U27",
   "A failed creation has a log, an error and a detail",
   "E10 and E11 (and U25, U27, U31, U34, U36, U39) carry both an " + BT + "expected" + BT + " log and an " + BT + "error" + BT + " cell (" + BT + "INVALID_INPUT/INVALID_VALUE" + BT + "); the " + BT + "detail" + BT + " (token + colon + at most 120 characters of the fake's info log) is recorded in the inline input as " + BT + "expect_detail" + BT + ", with the fake's " + BT + "info_log" + BT + " (more than 120 characters, so K104 can show). The controller log records the failure as " + BT + "onError" + BT + " then " + BT + "reject" + BT + " (initialize) or " + BT + "onError" + BT + " then " + BT + "onStatus" + BT + " (restore).",
   "13.2 says an error row normally has no expected file; the rows need both. No place in the design says where the detail is checked.")
_a("", "13.2 probe rows",
   "Where does the probe call log live?",
   "In the inline input as " + BT + "\"expect_log\":\"gllog/Pnn.log\"" + BT + "; " + BT + "expected" + BT + " is the canonical probe result (" + BT + "json/Pnn.probe.json" + BT + ").",
   "13.2 names both files but the row has one " + BT + "expected" + BT + " cell.")
_a("", "7.7, 7.9, 13.4 U37",
   "U37 is a composite scenario",
   "U37 holds four cases (default attributes; option false; software-only fake with the option false; software-only fake with the default), each a section of " + BT + "gllog/U37.log" + BT + " introduced by " + BT + "[\"case\",name]" + BT + " and closed by " + BT + "[\"status\",{...}]" + BT + " (two tokens outside the 7.6 vocabulary). Per case: the probe's log, the adapter's own " + BT + "getContext webgl2" + BT + " with the option, the controller's initialize log. A probe rejection is logged as " + BT + "reject" + BT + " only (no " + BT + "onError" + BT + ": the controller has not started).",
   "The design describes the behaviour (probe and getContext share the option; probe contexts released) but no file form.")
_a("", "7.5, 7.6",
   "Controller details left open",
   "The frame after init, restore, commit or render uses " + BT + "{widthPx: w, heightPx: h}" + BT + " of the plan header (dprMilli 1000: the backing size equals the CSS size) and ink (34,34,34); a commit in " + BT + "ready" + BT + " logs the frame and then " + BT + "[\"labels.draw\"]" + BT + "; init or restore with no retained plan draws nothing and logs no " + BT + "labels.draw" + BT + " (explicit for restore, applied to init); a loss during creation (" + BT + "\"fail\":\"lost\"" + BT + ") makes the context lost right after the " + BT + "getShaderParameter" + BT + " of " + BT + "arrow.vs" + BT + " (the log stops there); a fake compile failure is " + BT + "disc.fs" + BT + ", a link failure " + BT + "edge" + BT + " (rows E10, E11); " + BT + "status().contextLost" + BT + " is the fake's flag (true between a loss and a restore; not set by " + BT + "loseContext()" + BT + " at dispose); " + BT + "failure" + BT + " holds the closed token in " + BT + "failed" + BT + " and after a failed initialize and is cleared on the next success, on a loss out of " + BT + "failed" + BT + " and at dispose.",
   "Each point is needed to produce a byte of a controller log; the design is silent or ambiguous.")
_a("", "7.7",
   "Probe: lazy checks, release timing, which canvas answers the relaxed request",
   "Checks run in the order vertex precision, fragment precision, MAX_VERTEX_ATTRIBS, MAX_VIEWPORT_DIMS and stop at the first failure (so P05 logs one precision call, P15 none of the later calls); the GL context is released (" + BT + "getExtension WEBGL_lose_context" + BT + ", then " + BT + "loseContext" + BT + " if the extension exists) right after the checks and before the 2D canvas; a request with " + BT + "failIfMajorPerformanceCaveat:false" + BT + " is answered by " + BT + "webgl2_relaxed" + BT + " of any canvas (absent: " + BT + "webgl2" + BT + "); the 2D canvas is the next " + BT + "factory()" + BT + " call (the second one on the success path; there is no 2D check on a failure return).",
   "7.7's call-order sentence lists the success path only; \"first match wins\" is read as lazy evaluation.")
_a("DEFECT", "7.2 G13, G16; 13.4 W21, W29, W30, W38",
   "G13 and G16 overlap; G13 has no lower bound for node pids",
   "G13 is read literally: node-layer pids are " + BT + "<= nd" + BT + " (no lower bound), edge-layer pids " + BT + "nd+1..nd+ed" + BT + "; G16 is read as coverage only (every pid of the table is accounted for by an instance or by cn/ce; extras are G13's business). With this reading W29 and W30 break G13 only, W38 G16 only, and W21 (a pid 0 in layer 7) G9 only.",
   "With \"exactly\" in G16 an out-of-range pid breaks G13 and G16 at once, and a pid 0 in an edge layer breaks G9 and G13; the rows cannot then be single-fault.")
_a("", "7.2 G2, G3, G5; 13.4 W05-W07, W09-W11",
   "How the reader finds the buffers and what each rule is measured on",
   "Sections are found by the line prefixes " + BT + "[\"n\"," + BT + ", " + BT + "[\"e\"," + BT + ", " + BT + "[\"T\"," + BT + " (no valid buffer can begin with them: G6 forbids such a float), so G13/G14 count lines and G2 compares the remainder with the sum of the sizes; with G2 disabled each buffer is the slice of its header size (possibly shorter), G3 is measured on that slice and every instance count is " + BT + "len // stride" + BT + "; G5 takes a draw's program from its layer (the " + BT + "program" + BT + " string is G4's). W05 is built on a plan with an empty arrow buffer so that the disc buffer is the last one; W07 appends one byte to the edge buffer and raises its size; W09 renames the program of the layer-5 draw; W11 inserts an uncovered dummy instance between layers 1 and 3.",
   "The text gives the rules but not the order or the measurement, and a single-fault property needs every rule to be orthogonal.")
_a("", "9.3, 13.4 X07",
   "X07 is not reachable through the strict reader",
   "X07 reads the bad plan " + BT + "bad/X07.glplan" + BT + " with the reader's every rule disabled and then calls " + BT + "readoutFromGl" + BT + ", which answers " + BT + "INVALID_INPUT/SCHEMA" + BT + " for the pid outside the table. K119 (accepts it) removes the check and the unknown pid is skipped.",
   "A plan produced by " + BT + "parseGlPlan" + BT + " cannot hold such a pid (G13), so the check in " + BT + "readoutFromGl" + BT + " is defence in depth; the row needs an input that bypasses the reader.")
_a("", "7.8, 13.4 U11",
   "The witness double of U11 is rejected by the strict reader",
   "The double's plan lacks a disc instance without a " + BT + "cn" + BT + " entry (a G16 violation); the witness reads the plan through the reader with every rule disabled, finds one node fewer than " + BT + "probe()" + BT + " drew, and W01 fails. K68 (the witness reads " + BT + "probe()" + BT + ") makes it pass. Outcome: " + BT + "json/U11.witness-honesty.json" + BT + ".",
   "7.8 says the witness reads \"the parsed plan\"; a strict parse of the double would throw, which is also a failure but not an informative one.")
_a("", "6.5, 7.8, 11.2, 13.4 U07",
   "Renderer option validation: order and codes",
   "Top-level keys are validated in alphabetical order (the design states the order for " + BT + "DlOptions" + BT + " only): " + BT + "capacity" + BT + ", " + BT + "contextAttributes" + BT + ", " + BT + "dl" + BT + ", " + BT + "dprMilli" + BT + ", " + BT + "ink" + BT + ", " + BT + "maxDlBytes" + BT + ", " + BT + "maxGlBytes" + BT + ", " + BT + "name" + BT + ", " + BT + "version" + BT + "; an unknown key or a non-object is SCHEMA; numeric classes as 27 15 (SCHEMA, NOT_FINITE, INVALID_VALUE, OUT_OF_RANGE); " + BT + "dprMilli" + BT + " 250..8000; " + BT + "ink" + BT + " three integers 0..255; capacity members positive safe integers; " + BT + "name" + BT + " and " + BT + "version" + BT + " by the manifest patterns with INVALID_VALUE; " + BT + "maxDlBytes" + BT + " and " + BT + "maxGlBytes" + BT + " integers 0..2^31 (unspecified); " + BT + "contextAttributes.failIfMajorPerformanceCaveat" + BT + " a boolean (SCHEMA, 11.2).",
   "The text lists the options and codes by reference to other rows that this author could not read (" + BT + "dl:O07-O12" + BT + "), so the grammar is rebuilt from 4.5, 6.2 and 11.2.")
_a("", "13.4 U01-U08, 13.3 U rows",
   "\"U01-U08 as dl:U01-U08 with plan\" cannot be followed literally",
   "The scripts were built from the text of 13.3 (U01 select, focus-step, set-hidden then unhide, clear-selection with the plan after each step; U02 resize and set-viewport; U03 the phases NOT_INITIALIZED, NOT_LOADED, ok, BUSY during a pending load, DISPOSED; U04 fidelity of O1 (full), keybound (elided), labels false (none) and motion none with reducedMotion; U05 export; U06 manifests; U07 option errors; U08 capacity 1). Ops added to 27's list: " + BT + "create" + BT + ", " + BT + "plan" + BT + " (outcome only), " + BT + "planBytes" + BT + " (outcome and file); " + BT + "export" + BT + " checks the media type and the SHA-256 of the bytes; U04's reduced-motion case is the " + BT + "setReducedMotion" + BT + " op.",
   "The dl corpus may not be read.")
_a("", "8.1, 7.8, 13.4 U06",
   "The manifest and its comparison",
   "Capabilities as 6.5/7.8 list them (mandatory supported, " + BT + "labels" + BT + " degraded LABELS_ELIDED, " + BT + "labels.edge" + BT + " by the options, export.svg/png, motion.animated, a11y.native-dom, a11y.companion-dom NOT_IMPLEMENTED, " + BT + "scene.apply-delta" + BT + " RESERVED, the " + BT + "x-" + BT + " extras); default name " + BT + "webgl-renderer" + BT + ", version " + BT + "0.0.0" + BT + ". U06 writes the manifest of the renderer object (via " + BT + "createWebglRenderer" + BT + ") for both hosts and an outcome file " + BT + "json/U06.equal.json" + BT + " recording that it equals " + BT + "glManifest" + BT + " and passes " + BT + "verifyManifest" + BT + ".",
   "The text lists the ids; the row needs bytes.")
_a("DEFECT", "13.4 K10, G07",
   "K10 (kind and style swapped) is not killed by G07",
   "G07 (loops2, initial) holds only kind-2, style-2 instances in layer 3, so swapping the two bytes changes nothing; K10 is killed by G05 and many other rows.",
   "Measured in " + BT + "MUTANTS.tsv" + BT + ".")
_a("DEFECT", "13.5 K94, K112",
   "K94 and K112 overlap",
   "Rev 2 generation: K94 was implemented as the arrow of any omitted edge (box test or clipped away) kept without the guard test, K112 as the subset clipped away; rev 3 makes K94 the box-test case (killer B13) and K112 the clipped-away case (B21).",
   "If K94 meant only the box test, B21 could not kill it (B21's edge passes the box test).")
_a("", "13.5 K72, K17, K13, K06, K69",
   "Wording of some mutants",
   "K72: the readout guard-box test uses the open interval. K17: with no text records the node discs are dropped (the buffers depend on the label options). K13: a dummy arrow instance on an undirected plan. K06: the pid written is the 0-based index of the instance in its buffer. K69: the renderer's own manifest uses the " + BT + "dom" + BT + " label budget on a headless host (so that default and non-default rows both see it).",
   "The mutation column gives a phrase; the matrix needs a definition.")
_a("", "7.4, 13.4 H01-H06",
   "Shader rows",
   "H01 is " + BT + "shaderSetBytes()" + BT + ": 4490 bytes, canonical JSON, **no** trailing LF (so rule X1's \"+ LF\" does not apply to it; A.8 quotes no block). H02/H03/H05/H06 expected files are canonical JSON of the computed values (digest, per-source size and SHA-256, before/after digests around two hostile plans, the identifier sets extracted from the text by a small line parser and their equality with 7.4); H04 reports H-1 and H-2 per source. The six sources and the digest are recorded in " + BT + "shaders/" + BT + ".",
   "Needed to give each row a byte form. " + BT + "gl_VertexID" + BT + " is not an attribute for H06 (7.4 says so).")
_a("", "7.3, 13.4 A.10, B11",
   "A.10 cannot be reproduced through a scene",
   "A.10 is reproduced at list level (an in-memory display list with the placeholder hashes) and matches. Rows B11, B14, B15 use scenes, whose straight edges are trimmed by 12 px, so their clipped numbers differ from A.10's; B11/B12 are tuned by search (" + BT + "inputs/B11.search.json" + BT + ", " + BT + "inputs/B12.search.json" + BT + ") so that a clipped coordinate has a fraction of at least 1/2 (asserted with exact fractions).",
   "A.10's list has an untrimmed edge that no layout can produce.")
_a("", "13.4 B01",
   "B01 needs a curved edge with a far end: a parallel pair",
   "Scene " + BT + "far-thr" + BT + ": a node in view and two far nodes, each in an antiparallel pair; the largest coordinate of the first pair is exactly 16777215 (kept, kind 1), of the second 16777216 (clipped). Found by scanning the far node's x (" + BT + "inputs/B01.search.json" + BT + ").",
   "A self-loop cannot straddle the guard box; only a parallel pair has form 1 and a far end.")
_a("", "7.3, 13.4 B12, B18, B21",
   "Which rows can reach which clip case",
   "An edge whose coordinates are all below 2^24 is never clipped, so the " + BT + "p = 0, q < 0" + BT + " case of B18 needs one end beyond 2^24 (the row has one at -20,000,000 m-px); B12 needs a node just inside the left of the guard box so that a chain of at least two instances results (" + BT + "far-pair" + BT + "); B21 is a slightly tilted edge that ends 5000 m-px above the top side (searched, " + BT + "inputs/B21.search.json" + BT + ") whose clip is rejected through t0 > t1 while its arrow meets the box.",
   "The text describes the cases as if the clip were reached by any edge.")
_a("", "13.4 B08, B05",
   "Rows with several outputs",
   "B08 lists its three variants (" + BT + "labels:false" + BT + ", " + BT + "edgeLabels:false" + BT + ", " + BT + "maxDrawnLabelUnits:0" + BT + ") in the row: the first is the " + BT + "expected" + BT + " plan, the others under " + BT + "\"also\"" + BT + "; " + BT + "json/B08.*.json" + BT + " record that the buffers equal G01's and the " + BT + "nt" + BT + " of each.",
   "One row = one expected cell.")
_a("", "13.4 X05, 9.3",
   "X05 (three-way) and the scrape of the SVG document",
   "The oracle scrapes the expected V5 document " + BT + "../oracles-svg/svg/G01.svg" + BT + " with regular expressions into a " + BT + "SvgReadoutLike" + BT + " (decimal strings parsed exactly), builds the readouts from the SVG object, from its own Canvas stream (stored as " + BT + "calls/X05.calls" + BT + ") and from the plan, and asserts the four (with the list's) are the same bytes; the row's file is that one readout.",
   "No format of the scrape is given.")
_a("", "13.2, 13.4 W01",
   "Input forms the grammar does not cover",
   "W01 is an inline file list; X rows use " + BT + "from" + BT + "; E, P, U controller rows as in the README. Keys are closed per family as documented.",
   "13.2 lists grammars for G, N, X, Y, O, F, S, P, B, C, Z, R and a generic one for the gl families.")
_a("", "13.4 D01-D05",
   "Runtime rows",
   "No files. The generator runs seeded versions as self-checks: D01 40 random models (LCG seed 20261119) with 12 random intents each; D02 every plan number below 2^24; D03 buffers unchanged under three label options; D04 draw instance counts and the layer-3/ce accounting through the executor fake; D05 the exact clip against brute force on 300 random segments (1200 points), at most 1 m-px off. The counts are in the self-check list of the README.",
   "D rows are runtime by design (13.6).")
_a("", "13.7, 13.1, 13.2",
   "No generated oversize vectors",
   "" + BT + "generated/GENERATED.tsv" + BT + " is header only: no gl: row has an input too large to store (the largest plan is a few thousand bytes).",
   "The design asks for GENERATED.tsv only \"where rows need them\".")
_a("", "3.5, 4.4, 30 6.2",
   "Display-list builder choices",
   "Grouping and ranks count visible edges only; a degenerate pair classifies all its members as degenerate before grouping; parallel rank is the 0-based position in scene order within the group; the arrowhead uses the point before the last as written in the record; label budget walk, " + BT + "fidelity" + BT + " and " + BT + "label_units" + BT + " as 4.4(g); the coordinate check (|v| <= 2^40) is made after the whole list is built. All of Appendix A.1, A.3, A.9 reproduces.",
   "Stated for the record; no conflict found.")
_a("", "9.1, 7.3, 13.4 X04",
   "A node emitted but outside the guard box",
   "A node whose centre is between the guard box and the guard box expanded by 22000 is in layer 7 of the plan and in " + BT + "nodes_far" + BT + " of the readout (its centre is outside the guard box); a node on the closed boundary is in " + BT + "nodes_at" + BT + " (X04 shows both).",
   "9.1 defines the domain, 7.3 the emission; the two differ by 22000.")
_a("DEFECT", "design file: change log and sections 5.2, 7.3",
   "Duplicated text",
   "The \"Rev 1 -> rev 2 (re-check findings)\" table and its closing sentence appear twice (lines 65-96 and 98-129); the sentence on " + BT + "p = 0" + BT + " segments in 7.3 and the first paragraph of 5.2 (" + BT + "createPicker" + BT + " and the coordinate check) are each written twice; the header line of 2 still says \"Status: DRAFT rev 0\"; the change-log line \"Findings table of later reviews: to be filled\" remains.",
   "No rule is affected; listed so the next revision cleans them.")
_a("", "13.6",
   "Counts",
   "279 ids: G 11, B 21, H 6, W 38, X 9, E 11, U 33 (U01-U13 and U20-U39), P 16, D 5, K 129; all built. Rows with empty cells: D (5), K (129), U10.",
   "Equal to the design's count; nothing was dropped.")


_a("", "13.2 file endings; 7.7",
   "Ending and form of the probe results and of the other outcome files",
   "Rev 3 lists the endings: logs, readouts and streams are canonical text plus one LF; " + BT + "json/H01.set.json" + BT + " (no LF), " + BT + "json/U06.*.manifest.json" + BT + " and " + BT + "json/U09.*.witness.json" + BT + " (IGR-CJ/1, no LF) are the exceptions; 'outcome files and scripts are ordinary JSON (indent=1, sorted keys) plus LF'; 'other files under json/ are ordinary JSON'. Read together: every other " + BT + "json/" + BT + " file, including the probe results (" + BT + "json/Pnn.probe.json" + BT + ", which 13.2 calls 'the canonical probe result') and H02-H06, is ordinary JSON, indent 1, sorted keys, plus one LF; the search records of " + BT + "inputs/" + BT + " likewise. **This changes the bytes of the outcome, probe, H02-H06 and search files against the rev 2 generation** (they were canonical JSON without LF); it is the only expected-byte change of this regeneration besides one added U07 case.",
   "No sentence says which form a probe result takes; the generic rule for " + BT + "json/" + BT + " and the outcome-file rule were applied. The alternative (canonical text plus LF) would be as defensible; one sentence in 13.2 would settle it.")
_a("", "7.6 vocabulary and Listeners paragraph",
   "Residual contradiction on when the listeners are logged",
   "The Listeners paragraph and the table (listeners added once at the start of every initialize that reaches creation, left after a failure) win over the vocabulary line, which still says 'at a successful initialize, before creation'. The generator follows the paragraph and the table (as the rev 2 reading did).",
   "Rev 3 fixed the table but left the older wording in the vocabulary sentence.")
_a("", "7.7 step (5) and the closing call-order sentence",
   "'Canvas C (a third factory call)' versus the success path",
   "The closing sentences win: the 2D canvas is the next " + BT + "factory()" + BT + " call (the second on the success path; after a relaxed retry the probe has already returned).",
   "Step (5) still says 'a third factory call'; the call order printed at the end of 7.7 shows two factory calls on the success path.")
_a("", "6.5 renderer options, 6.2 replay options",
   "Code for a non-number element of " + BT + "ink" + BT + " in the renderer options",
   "6.2 says a non-number or non-integer element of the replay " + BT + "ink" + BT + " is INVALID_VALUE; 6.5 says the renderer option " + BT + "ink" + BT + " is 'three integers 0..255' with numeric classes as 27 15. The same code (INVALID_VALUE) is applied to a non-number element of the renderer option; a non-array or a wrong length stays SCHEMA. Row U07 gained the case " + BT + "{'ink':['a',0,0]}" + BT + ". (The rev 2 generation used SCHEMA here; no row tested it.)",
   "27 15 gives classes for a number (a string where a number belongs is SCHEMA there); 6.2 says INVALID_VALUE for an element. The replay sentence was followed because the option is handed to the replay.")
_a("", "13.5 K94, K112; rev 3 table",
   "K94 and K112 as redefined",
   "K94 is now 'the arrow of an edge omitted by the box test is emitted without the guard test' (killer B13 only); K112 'an arrow is emitted for an edge whose polyline was clipped away' (killer B21). Implemented exactly so; B13 kills K94, B21 kills K112 and not K94.",
   "The rev 2 generation had K94 also cover clipped-away edges (so B21 killed it); the corrected killer lists were adopted.")



R3 = {
    1: ("FIXED: W04 under G1, G3 uses the constant strides, K24 killed by W07, K22 by W04", "yes"),
    2: ("FIXED: two cases (edge focus; node focus under also)", "yes"),
    3: ("FIXED (ruling): each corpus self-contained", "yes"),
    4: ("FIXED: created removed from the init-ignored row", "yes"),
    5: ("FIXED: listeners added once at every initialize that reaches creation, left after a failure, removed by dispose", "yes (the vocabulary sentence still disagrees: A-35)"),
    6: ("FIXED: file grammar for rows with both a log and an error", "yes"),
    7: ("FIXED: expected = canonical probe result, expect_log inline", "yes (file form of the result: A-34)"),
    8: ("FIXED: composite file with case/status lines", "yes"),
    9: ("FIXED: controller conventions written in 7.6", "yes"),
    10: ("FIXED: check order, stop at first failure, release timing, relaxed request, 2D call", "yes (step (5) wording: A-36)"),
    11: ("FIXED: G13 range only, G16 coverage only", "yes"),
    12: ("FIXED: 'How the reader measures'", "yes"),
    13: ("FIXED: read with every reader rule disabled", "yes"),
    14: ("FIXED: the witness reads the double's plan with every rule disabled", "yes"),
    15: ("FIXED: alphabetical order and codes of the renderer options", "yes, except the code for a non-number element of ink (A-37)"),
    16: ("FIXED: cross-corpus reference removed", "yes"),
    17: ("STANDS", "yes"),
    18: ("FIXED: killer G05 only", "yes"),
    19: ("FIXED: K94 = box test, K112 = clipped away, killers B13 and B21", "partly: the rev 2 K94 also covered clipped-away edges (A-38)"),
    20: ("STANDS (realization is the oracle's)", "yes"),
    21: ("FIXED: H01 has no final LF", "yes"),
    22: ("FIXED: A.10 is a list-level example", "yes"),
    23: ("FIXED: B01 needs a parallel pair", "yes"),
    24: ("FIXED: notes on B12, B18, B21", "yes"),
    25: ("FIXED: also cases", "yes"),
    26: ("STANDS", "yes"),
    27: ("FIXED: W01, X, search grammars", "yes"),
    28: ("STANDS", "yes"),
    29: ("STANDS", "yes"),
    30: ("STANDS", "yes"),
    31: ("FIXED: stated in 9.1", "yes"),
    32: ("FIXED: duplicates removed", "yes"),
    33: ("STANDS", "yes"),
}

_a("", "7.2 G12 (rev 5), 13.4 W rows, 13.5 K33",
   "The single-focus clause of G12 has no row and no mutant",
   "G12 is implemented as: the number of distinct pids of layers 2 and 6 plus the cn and ce entries whose flags & 2 is set is at most one. Nothing in the corpus exercises it: no W row is single-fault for this clause and no mutant removes it (K33 'reader skips G12' is killed by W24, W25, W28 through the subset clause). The generator asserts the clause separately (a plan with an edge focus in layer 2 and a cn entry with flags & 2 is rejected by G12 and accepted when only G12 is disabled).",
   "Rev 5 adds the clause to the rule but, by its own regeneration list, adds no row; an implementation that omits it passes every row. A W row (a new id) would be the way to cover it; ids are frozen at 279 so none was added. Whether a repeated instance of one clipped focused edge counts once (distinct pids) or per instance is not said; distinct pids was read.")
_a("", "7.6 (rev 5) rows U31, U34, U36, U39, U28",
   "The rev 5 controller outcomes are asserted by the generator, not by rows",
   "The release rule (loseContext only on a context that was obtained and is not lost, in every phase; dispose in created with a lost context obtained makes no release call), the (failed, R) lost-again outcome (phase lost, failure cleared, onStatus, no cleanup calls) and the (failed, R) second-usable-failure outcome (phase stays failed, onError once, new failure token, no onStatus) are implemented in the reference and asserted in the generator's self-checks. No existing row reaches them (U28 is lost to lost, U31 failed to ready, U34 and U39 have a usable context), and the 279 ids are frozen, so no expected byte changed. Mutant K97 (a loss during the restore rebuild ends in failed) is still killed by U28.",
   "Stated for the record: the new rules are covered only by the generator, so a code that gets them wrong still passes the corpus.")
_a("", "6.5 (rev 5), 13.4 B08",
   "B08 case c at list/plan level",
   "Case c is built as planGl(buildDisplayList(model, state, {maxDrawnLabelUnits: 0})) with no renderer; its input key is {'list':{'maxDrawnLabelUnits':0}} (under 'also'; cases a and b keep {'options':{'dl':...}}); the row's tier stays subject. A renderer built with dl.maxDrawnLabelUnits 0 (or capacity 0) is refused INVALID_INPUT/OUT_OF_RANGE by the reference (no row: 6.5 leaves it to unit tests). plan/B08.c.glplan is byte-identical to the rev 3 generation; json/B08.c.json records the list form of the option instead of the options form.",
   "The plan bytes do not depend on whether the zero budget reaches the builder through a renderer. 6.5 gives the code for a capacity of 0 (the same family as the one-value rule) but not for the dl option itself: OUT_OF_RANGE was used for both.")



R5 = {
    9: ("controller conventions refined: the release rule (loseContext only on an obtained, not lost context, in every phase), (failed, R) lost again, (failed, R) second usable failure with no onStatus", "partly: my rev 3 simulation released a lost context in created and sent onStatus on every restore failure; both corrected, no expected byte changed"),
    15: ("budget 0: a renderer with dl.maxDrawnLabelUnits 0 or capacity 0 is refused (6.5)", "partly: the rev 3 generation accepted dl budget 0 at renderer level (B08 case c); now refused, and case c is list-level (A-41)"),
    25: ("B08: case c moves to list/plan level (13.4)", "no, the rev 3 generation built case c with a renderer (A-41)"),
    12: ("the reader rules gain the single-focus clause in G12 (7.2)", "yes for the text; the clause has no row (A-39)"),
}

def ambiguities(rows, res, checks):
    L = []
    a = L.append
    a("# Ambiguities, contradictions and defects found in design 31 (written against rev 2, re-derived against rev 3 and rev 5)")
    a("")
    a("Every place where the design was ambiguous, contradictory, left a byte undetermined or could not be implemented as written, with the section it concerns, the literal reading the generator uses and why.")
    a("Section numbers without a prefix are sections of design 31 (" + BT + "31-CANVAS-WEBGL-DESIGN.md" + BT + "); " + BT + "27 n" + BT + " is the IGR/1 design (rev 5), " + BT + "30 n" + BT + " the SVG design (rev 4). Nothing was \"fixed\": where the design and the")
    a("generator's output disagree, both values are given. Entries marked **DESIGN DEFECT** are things that cannot be right as written; the others are underspecifications or choices.")
    a("")
    nd = sum(1 for x in AMBS if x[0] == "DEFECT")
    a("**%d entries (A-01 to A-%02d), %d of them design defects.** The Appendix A items and the shader digest all reproduce (README); the defects below concern corpus rows and mutants, not the Appendix." % (len(AMBS), len(AMBS), nd))
    a("")
    for i, (sev, secs, title, reading, why) in enumerate(AMBS, 1):
        a("## A-%02d%s %s" % (i, " [DESIGN DEFECT]" if sev == "DEFECT" else "", title))
        a("")
        if i in R5:
            a("* **Rev 5:** RESOLVED-IN-REV5, " + R5[i][0] + ". **Reading matched:** " + R5[i][1] + ".")
        if i in R3:
            a("* **Rev 3:** RESOLVED-IN-REV3, " + R3[i][0] + ". **Reading matched the rev 3 text:** " + R3[i][1] + ".")
        else:
            a("* **Rev 3:** NEW (found while re-deriving the generator from rev 3).")
        a("* **Sections:** " + secs)
        a("* **Reading used:** " + reading)
        a("* **Why:** " + why)
        a("")
    return LF.join(L) + LF
