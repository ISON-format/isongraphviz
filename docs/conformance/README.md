# Conformance material

Two frozen corpora let you check an implementation of the scene contract ([IGS/1](../specs/IGS-1.md)) and the layout contract ([IGL/1](../specs/IGL-1.md)) without trusting the reference implementation in this repository. The expected bytes were produced by code that is independent of that implementation (details below).

| Corpus | Path | Contents | Checksums | `SHA256SUMS` digest |
|---|---|---|---|---|
| IGS/1 oracles | [`fixtures/oracles/`](../../fixtures/oracles/) | 4 golden scenes with their ISON sources (O1, O2, O4, O5) and 23 acceptance fixtures (`fixtures/oracles/fixtures/`, expectations in `EXPECT.tsv`) | 32 files | `e21e295dabe68707fcb18aecd07be68e5dae9f8cc350b884210489500ba01842` |
| IGL/1 corpus | [`fixtures/oracles-igl/`](../../fixtures/oracles-igl/) | 92 manifest rows (`EXPECT.tsv`): 13 FORCE layouts, 5 FIXED layouts, 46 verification vectors, 20 scene vectors, 8 binding pairs | 144 files | `819eb4c7dd4f3ee3c75fc97026d0ca98dab30b1bd61100ab0e593587b73565e1` |

Both are **frozen**: existing files never change; later additions get new ids.

## Verify the files

From each corpus directory:

```bash
cd fixtures/oracles     && sha256sum -c SHA256SUMS      # 32 files: OK
cd fixtures/oracles-igl && sha256sum -c SHA256SUMS      # 144 files: OK
```

`SHA256SUMS` of the IGL corpus lists every file except `tools/` and itself. The digests in the table above are the SHA-256 of the two `SHA256SUMS` files.

## Check an implementation of IGS/1

1. **Golden scenes.** For `o1-basic`, `o2-ids-ordering`, `o4-undirected`: compile `*.source.ison` with the `ison-v1` profile and compare your canonical bytes to `*.scene.json` byte for byte; the SHA-256 of the scene bytes is the `scene_sha256` in [IGS-1 §12](../specs/IGS-1.md). `o2-ids-ordering` needs the full INT64 range: an adapter limited to 53-bit integers must reject it with `INEXACT_NODE_ID` (that is the expected behaviour of the reference adapter). `o5-string-stress` is schema-level: it exercises the serializer only, from the code-point list `o5-string-stress.codepoints.json`.
2. **Acceptance fixtures.** `fixtures/oracles/fixtures/EXPECT.tsv` has the columns `file`, `verdict` (`accept` or `reject`), `code` and `reason`. Run each `*.source.ison` and compare. The expectations were checked against `ison-ts` 1.2.0 and `ison-graph-ts` 1.4.1 before they were frozen.
3. **Scene verification.** The negative cases of [IGS-1 §5.8](../specs/IGS-1.md) are unit-tested in `packages/scene-core/test/verify.test.ts`.

## Check an implementation of IGL/1

`fixtures/oracles-igl/EXPECT.tsv` has the columns `id group scene input expected_layout error`. Paths are relative to the corpus directory (`../oracles/…` points into the IGS corpus).

| Group | Rows | What to do | Expected |
|---|---|---|---|
| `force` | F01–F13 | lay out `scene` with the policy in `input` (a JSON config) | `layouts/<id>.layout.json`, byte for byte; its SHA-256 is in `layouts/<id>.layout.sha256` |
| `fixed` | X01–X05 | lay out `scene` with the positions file in `input` (layout units, not thousandths) | `layouts/<id>.layout.json` |
| `verify` | V01–V46 | run `verifyLayout` on `verify/<id>.layout.json` | the `error` column (`CODE/REASON`), or success when it is empty (V21, V24, V45, V46) |
| `scene` | S01–S20 | lay out the hand-written `scene` with FORCE | the `error` column (`CODE/REASON`), or `layouts/<id>.layout.json` for the controls |
| `bind` | B01–B08 | `bindLayout(scene, layout)` | the `error` column; `IGS:CODE/REASON` means the scene library's error; empty means success |

Rules for using the corpus honestly: an expected file is **never regenerated to make an implementation pass**; a mismatch is a finding to explain. FORCE vectors depend on the exact reuse of Core's layout (`ison-graph-ts` 1.4.1, pinned; see [IGL-1 §7.1](../specs/IGL-1.md)), including its UTF-16 processing order.

## How the expected bytes were produced, and how independent they are

* **IGL/1:** Python only. Core Python's `ison_graph.viz.compute_layout`, a Python implementation of the §4 quantizer, a Python IGL-CJ/1 writer and `hashlib`. No TypeScript produces an expected byte. Core TypeScript and Core Python process node ids in different orders for ids that mix characters at or above U+10000 with U+E000–U+FFFF (reported upstream as `ISON-format/isongraph#6`); the generator therefore feeds Python each id transcoded to one character per UTF-16 code unit. **That transcoding is a compatibility shim, not evidence that unmodified Core Python behaves identically.** Rows F09 and S13 depend on it.
* **IGS/1:** the golden scenes were produced by one Python serializer and re-derived by separate Node code; each file's SHA-256 was computed with three tools that agree; a reviewer reconstructed the four scenes from their sources with a separate canonical serializer ([IGS-1 §12.1](../specs/IGS-1.md)). No RFC 8785 reference library was run by the authors.
* **Audits:** the IGL/1 corpus and implementation were audited twice by reviewers who did not write them (oracle reconstruction with independent code; every negative row judged against the contract before the implementation was run; regeneration; fuzzing). Regenerating the corpus from scratch reproduces every generated file byte for byte (`fixtures/oracles-igl/README.md` has the commands).
* **Shared assumption:** both corpora rest on Core's algorithm (for FORCE) and on the §4/§5 rules, which two independent implementations (TypeScript and Python) agree on.

## Run the reference implementation's tests

```bash
cd packages/scene-core  && npm ci && npm run build && npm test     # 283 tests
cd ../layout-core       && npm ci && npm run build && npm test     # 282 tests
```

Node 22 or newer. Both suites passed on Node 22.23.5 and 24.18.0; the browser smoke script passed on Chromium 159 in a secure context (`npm run smoke:browser` in each package).

## Adapter rules of the reference implementation (informative)

The reference implementation compiles ISON text through the published parser and graph library. Its source comments refer to these adapter rules; they are checks made *before* a scene is built, and none changes the contract of [IGS/1](../specs/IGS-1.md).

| Rule | Check | Error |
|---|---|---|
| A1 | the caller names the serialization profile explicitly; only `ison-v1` | `UNSUPPORTED_SERIALIZATION_PROFILE` |
| A2 | strict UTF-8, no byte-order mark | `MALFORMED_SOURCE` / `INVALID_ENCODING` |
| A3 | the text parses | `MALFORMED_SOURCE` / `PARSE_ERROR` |
| A4 | graph profile read from the structured `meta.graph` block: none (directed simple graph) or exactly one block with exactly one boolean `directed` field; a multigraph marker and any other metadata are refused | `UNSUPPORTED_GRAPH_PROFILE` |
| A5 | node ids are strings or provably exact (safe) integers; floats, booleans and float-spelled tokens (`1.0`) are not ids | `INVALID_NODE_ID`, `INEXACT_NODE_ID` |
| A6 | edge reference ids are checked as text; an integer-looking reference outside the safe range is refused unless it names an existing string id of that type | `INEXACT_NODE_ID` |
| A7 | undirected graphs: same-orientation duplicates and repeated self-loops first, then mirror pairs, as in [IGS-1 §7](../specs/IGS-1.md) | `DUPLICATE_EDGE`, `UNDIRECTED_EDGE_CONFLICT` |
| A8 | errors raised by the graph library (duplicate node or edge, id twin, missing endpoint) are mapped to structured errors; no partial scene | see [IGS-1 §8](../specs/IGS-1.md) |
| A9 | no silent drop: only `nodes`, `edges` and `meta` blocks; no summary rows; block names are identifiers; look-alike `meta` blocks are refused | `MALFORMED_SOURCE` / `UNSUPPORTED_BLOCK`, `SUMMARY_ROWS` |
| A10 | a block that declares a column named `__proto__` is refused (prototype-sensitive column names) | `MALFORMED_SOURCE` / `PROTOTYPE_FIELD` |
| A11 | a block that repeats a column name is refused, so no cell is silently dropped | `MALFORMED_SOURCE` / `DUPLICATE_FIELD` |

## Implementation notes (informative)

* The reference adapters are pinned to `ison-ts` 1.2.0 and `ison-graph-ts` 1.4.1 with lockfile integrity. Known Core behaviours an adapter has to defend against: a multigraph is loaded silently as a simple graph; a quoted `"false"` in `meta.graph.directed` silently becomes directed (both reported upstream as `ISON-format/isongraph#4` and `#5`); duplicate rows of an undirected edge are swallowed; unsafe integer ids surface only as a misleading duplicate-node error; integers beyond ±(2^53−1) are lossy.
* Measurements behind the FORCE execution budget, and their limits, are in [IGL-1 §7.3](../specs/IGL-1.md). They were taken on one machine class (Windows 11 x64, V8); FORCE wall time is not bounded and no latency promise is made.
