# IGL/1 oracle corpus

Status: **FROZEN 2026-11-16 (IGL/1 rev 1; 92 rows).** Frozen after two independent audits by reviewers who did not write the code or the corpus: (1) a full audit of the original 76 rows (every positive layout rebuilt from the contract text with independent code, every negative row judged against the contract before the implementation was run, regeneration and checksums verified); (2) a focused second audit of the 16 rows added by the closure remediation (F13, X04, X05 rebuilt byte for byte from the contract text; S14-S20, V42-V46 and B08 judged for the right reason), of the changed execution safeguards, and of the published tree. Neither audit left an unresolved Critical or Important finding. The audit receipts are not part of this repository. The 76 original files are byte-identical to the audited ones. It is the qualification corpus for `packages/layout-core` and for the IGL/1 contract ([`docs/specs/IGL-1.md`](../../docs/specs/IGL-1.md)); see also [`docs/conformance/README.md`](../../docs/conformance/README.md). **Not established by this corpus:** behaviour on graphs above 2,000 nodes, on engines other than V8, on hosts other than Windows 11, and wall-clock time (the FORCE budget limits estimated work, not seconds).

## What it is

92 manifest rows in `EXPECT.tsv` (`id group scene input expected_layout error`):

| Group | Rows | Content |
|---|---|---|
| `force` | F01–F13 | `igl-force/1` layouts of 13 scenes (O1, O4, Core's 5-node parity graph, a 20-node mixed-id graph with three option sets, empty, single node, a Unicode-order scene, bind scenes; **F13**: one node key exactly AT the 1,024-unit limit in each class (1,022 ASCII characters, 511 astral characters, 1,022 three-byte characters, a 1,022-character type, an INT64 label under a 1,006-character type) plus a 1,024-character relation; the other nodes and the second relation are short) |
| `fixed` | X01–X05 | `igl-fixed/1` layouts from explicit layout-unit positions (mixed, exact ties and `-0`, empty; **X04**: 4503599627370.497, where the frozen quantizer and the incorrect shortcut `floor(s + 0.5)` differ; **X05**: a valid scene with a 5,000-character id, which FORCE refuses and FIXED supports) |
| `verify` | V01–V46 | one byte string per verification rule; 42 are rejected with the stated `CODE/REASON`, four (V21, V24, and the coordinate-range boundaries V45 = 2^53-1 and V46 = -(2^53-1)) must verify; V42 `UNKNOWN_ALGORITHM`, V43 `policy.config` not an object, V44 a duplicate JSON key |
| `scene` | S01–S20 | hand-written IGS/1 scenes: nine that `igl-force/1` must refuse with an `UNSUPPORTED_SCENE` reason, four controls that must lay out, and **S14–S20**: the lookup-key limit (S14 key 1,025 · S15 short id with a long type · S16 512 astral characters = 1,024 units, key 1,026 · S17 a 1,025-character relation · S18 a 5,000-digit numeric-looking string id; all `RESOURCE_LIMIT/CORE_KEY_LENGTH`) and S19 `|`, S20 tab in an id (`CORE_UNREPRESENTABLE_ID`) |
| `bind` | B01–B08 | scene/layout pairs: B01 is the forged-hash case (same nodes, different edges), plus missing/extra/wrong-type nodes, an `i:7`/`s:7` mix-up, non-canonical scene bytes, and B08 (a long valid identifier binds: the key limit is a FORCE execution control, not a validity rule) |

`SHA256SUMS` lists every file except `tools/` and itself. Directory layout: `sources/` (ISON text), `scenes/` (IGS/1 scene bytes), `layouts/` (expected IGL/1 bytes and `.layout.sha256`), `fixed/` (position inputs), `verify/` (V files), `bind/` (B layouts).

## Generation rules (frozen with the corpus)

1. Expected layout bytes are produced by **Python only**: Core Python `ison_graph.viz.compute_layout` (read-only import of the sibling checkout), a Python implementation of the §4 quantizer of the specification, a Python IGL-CJ/1 writer (keys in UTF-16 order, nodes in NodeRef/2 order) and `hashlib`. No TypeScript produces an expected byte.
2. **The UTF-16 transcoding is a compatibility shim, not evidence that unmodified Core Python behaves identically.** Core TypeScript orders node ids by UTF-16 code units and Core Python by code points; for ids mixing characters at or above U+10000 with U+E000–U+FFFF they disagree (reported upstream: ISON-format/isongraph#6). The generator feeds Core Python each id transcoded to one character per UTF-16 code unit, which makes Python's code-point order equal TypeScript's UTF-16 order without changing any Core code. Rows F09 and S13 depend on it.
3. Scene bytes for the compiled sources come from the IGS/1 reference compiler (its own oracles are independently frozen); the hand-written scenes (S01–S20, keybound, B06 and B07) are written by the Python generator and must be accepted by `verifyScene` (asserted by `packages/layout-core/test/oracles.test.ts`).
4. Re-running the tools reproduces every file byte for byte (checked: regenerating into a copy and `diff -r` is empty).
5. A TypeScript/Python mismatch is a finding to explain. **An expected file is never regenerated to make TypeScript pass.**
6. The set is frozen; later additions get new ids and the existing files never change.

## Regenerate

```text
python tools/make_sources.py
(cd ../../packages/scene-core && npm run build && node ../../fixtures/oracles-igl/tools/compile_scenes.mjs)
python tools/make_oracles.py        # ISON_GRAPH_PY_SRC=<isongraph>/ison-graph/src if the sibling is elsewhere
python tools/make_sums.py           # rewrites SHA256SUMS over every file except tools/ and SHA256SUMS itself
```

## What the checks establish (and do not)

Established: the TypeScript producer reproduces all 13 + 4 FORCE and 5 FIXED positive layouts byte for byte; the Python-written V files equal the TypeScript mutation table byte for byte (two independent mutation implementations); every verdict in the manifest is produced by `verifyLayout`, `bindLayout` and `computeForceLayout`; every positive artifact verifies, binds and is reproducible. Not established: behaviour on graphs above 2,000 nodes, on engines other than V8, or on hosts other than Windows 11; independence of the *algorithm* (Core's algorithm is what is reused, in both languages); an independent human review of the corpus.
