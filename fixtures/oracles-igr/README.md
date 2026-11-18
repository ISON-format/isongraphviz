# IGR/1 oracle corpus

Status: **DRAFT** (not frozen; no digest of `SHA256SUMS` is pinned anywhere). Produced against `docs/isongraph-visualize-blueprint/27-IGR1-DESIGN.md` **rev 5** (first built from rev 2, then updated and regenerated whole from rev 3, rev 4 and rev 5) by an oracle author who was given only that design, `docs/specs/IGS-1.md`, `docs/specs/IGL-1.md`, `docs/conformance/README.md` and the frozen fixtures (`fixtures/oracles/`, `fixtures/oracles-igl/`). Read `AMBIGUITIES.md` before judging any mismatch: the rev 2 findings A-01 to A-36 and the rev 3 findings B-01 to B-11 with their status in rev 3 and rev 4, the findings C-01 to C-10 on rev 4 and D-01 to D-05 on rev 5, and the vector ids that carry no oracle bytes.

## Independence statement

* Every expected byte comes from the Python code in `tools/` (standard library only: `hashlib`, `json`, `math`, `fractions`, `re`). `tools/igr.py` implements the design's rules (IGR-CJ/1 serializer, `floorDiv`/`divRound`, the quantizer, model, state parsing in the stated check order, reducer, viewport arithmetic, exact integer hit geometry, accessibility text, manifest verification, projection comparison); `tools/lifecycle.py` is a small reference simulation of section 9 used to compute the `expect` of every lifecycle call.
* The author did **not** read, run or consult anything under `packages/` (no TypeScript source, no TypeScript test), no other design document of `docs/isongraph-visualize-blueprint/`, and no review. Nothing in this directory was regenerated or adjusted to make any TypeScript pass; the TypeScript was never run.
* Frozen inputs are reused by relative path (`../oracles/…`, `../oracles-igl/…`). Where no frozen scene serves, the author wrote new scenes and FIXED layouts (`scenes/`, `layouts/`: `hitgeo`, `hostile`, `M28`, `A05`, `ten`, `nfc`, `twins`, and the layouts `M26`, `M29`). Those inputs were only checked with a Python "lite" verifier (`igr.verify_scene`, `igr.verify_layout`). **Per design 13.4 a third party must run the frozen `verifyScene`, `verifyLayout` and `bindLayout` over every file in `scenes/` and `layouts/` and return failures as findings.** The same third party should run `parseState` over every accepted file in `states/`.
* Shared assumption: oracle and code implement the same written rules. The corpus proves that code matches the text as read in `AMBIGUITIES.md`, not that the text is wise.

## What is here

`EXPECT.tsv`: header `id group tier scene layout input expected error` (section 13.3a), **354 rows**, one per design id of rev 5: M01-M30 plus `M23b`, `M24b` (32), S01-S55, R01-R52 plus `R31b` (53), H01-H27, A01-A21, P01-P27, L01-L27 plus `L21b`, `L24b`, `L24c`, `L24d` (31), C01-C21, D01-D05, K01-K82. 267 rows carry files or inline inputs; the 87 `D` and `K` rows have empty cells by design. `group` is the leading letter of the id; `tier` is `core`, `subject` or `both` as fixed in 13.3a (`P` and `C` core, `S50` core, `K` empty). One row names one scene, one layout and one input. The rows added in rev 5 are `M30`, `S51`-`S55`, `A21`, `P27`, `L27`; earlier rev 4 rows are in 13.3b. Regenerating from each newer revision left every earlier file byte-identical (only `EXPECT.tsv` changed).

| Directory | Content |
|---|---|
| `models/` | `Mnn.model.json` = `modelBytes` (exact IGR-CJ/1 bytes, no trailing newline) |
| `states/` | `Snn.state.json` (accepted and rejected inputs), `Rnn.sK.state.json` / `Lnn.cK.state.json` (state after step or call K), `hitgeo*.state.json`, `H*.state.json` |
| `events/` | `Rnn.sK.events.json` = `serializeEvents` of that step; `Lnn.*.events.json`; `A18.events.json` |
| `scripts/` | R and A scripts (`{"size","limits"?,"initial"?,"steps":[…]}`) |
| `hits/` | H files |
| `a11y/` | `Ann.a11y.json` = IGR-CJ/1 of `{"accessible","announcements","summary"}` |
| `manifests/` | P files |
| `lifecycle/` | L scripts |
| `compare/` | C reports and expected comparisons |
| `scenes/`, `layouts/` | author-written inputs (see above) |
| `tools/` | the generators (not in `SHA256SUMS`) |

Test-input files (`*.script.json`, `*.hits.json`, manifests, lifecycle and report files) are ordinary JSON, ASCII-escaped, `indent=1`. The strings `"NaN"`, `"Infinity"`, `"-Infinity"` stand for those doubles wherever a number is expected (also in intents, see A-09). Byte files (`*.model.json`, `*.state.json` except the deliberately malformed `S12`-`S40` inputs, `*.events.json`, `*.a11y.json`, `*.compare.json`) are exactly the canonical bytes.

The lifecycle schema, the per-point `state` of `H19`, `reducedMotion` in `A16` and `manifest` in `C07` are now part of 13.3a (rev 3); `states/R32.init.state.json` is the corpus file that `R32`/`R33` name as `initial`. Choices that rev 3 still leaves open are B-01 to B-11 in AMBIGUITIES.md.

## Reproduce Appendix A, then regenerate

```text
python tools/appendix_a.py      # 46/46 items: A.1 model bytes, A.2 state bytes, A.3 arithmetic, A.4 hit numbers, A.5 text, A.6 events; exit 0 iff exact
python tools/make_oracles.py    # writes every file and EXPECT.tsv (deterministic: no clock, no randomness, no environment reads)
python tools/selfcheck.py       # paths exist, every R/A step replays byte for byte, 2,102 hit points agree with a second implementation (Fractions, rev 3/4 rules), manifests and comparisons re-derived, floorDiv/divRound vs Fraction
python tools/mutants_check.py   # optional: which corpus rows flip under 31 mutations (hit, viewport, fit, `parseState` order, limits, manifest, categories)
python tools/make_sums.py       # rewrites SHA256SUMS over every file except tools/ and SHA256SUMS itself ('<sha256> *<path>', byte order of the path)
sha256sum -c SHA256SUMS         # every file except tools/ and SHA256SUMS
```

`appendix_a.py` reads the expected strings from the design text itself (the code blocks and inline code of Appendix A), so it fails loudly if the text and the code ever differ. Regenerating twice gives identical `SHA256SUMS` (checked). Requires Python 3.12; no third-party package.

## What this corpus does not establish

It does not establish that the design is implementable in every detail (see AMBIGUITIES for the impossible and unrepresentable rows), nothing about drawing, nothing about wall-clock time, and nothing about the `D` (differential) and `K` (mutant) rows, which have no oracle bytes by design. The mutants `K01`-`K61` are code in the kit; the oracle author did not write them. As a courtesy, `python tools/mutants_check.py` applies, to the Python reference, the mutations of these rules from the rule-to-mutant table of 13.1 and reports which corpus rows change: `K21` (pan sign), `K22` (zoom without clamp), `K23` (fit ignores padding), `K25` (radius 11), `K41` (truncating division), `K42` (tie toward -infinity), `K43` (anchor ignored, and a single-rounded anchor), `K44` (pointer unit), `K45` (pointer in whole pixels), `K46`, `K47`, `K50` (open node, edge and viewport boundaries; the viewport border on the quantized point) and `K62` (border tested on the raw point: only `H26` flips), `K48`, `K49` (5 and 7 px tolerance), `K57` (pruning by endpoint offsets) `K61` (fit counts hidden nodes), `K72` (fit centre truncated: only `S47`) `K78` (quantizer tie rounded down: only `H27`), `K58` (`S16 S17 S51`), `K58b` (consistency before ordering: `S52`), `K59` (`S22 S54`), `K73` (`S48`), `K75` (`S49`), `K76` (`R51`), `K77` (`S50`), `K79` (`P27`), `K80` (`S55`), `K81` (`L27`) and `K82` (`M30 A21`) each flip at least one expected value. The text rules (`K15`-`K18`, `K51`-`K54`) and the state-machine rules were not mutation-checked.
