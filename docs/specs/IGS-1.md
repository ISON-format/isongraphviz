# IGS/1 — Scene contract

Status: **frozen** (IGS/1, revision 2, with the clarifications F1, F2 and F3 incorporated below). Changing a frozen section later is a new spec version (`IGS/2`), never an edit, except where §11 allows a qualified extension. This is the public edition of the frozen contract. Section numbers are stable: the reference implementation (`packages/scene-core`) cites them.

The byte-exact examples are **normative files** under [`fixtures/oracles/`](../../fixtures/oracles/) (§12); the text quoted here is a reading aid, and the files win if they ever differ. [`docs/conformance/README.md`](../conformance/README.md) explains how to verify them. The companion layout contract is [IGL/1](IGL-1.md).

**Terms.** *Core* means the ISON parsing and graph libraries `ison-ts` and `ison-graph-ts` (§13.1 names the versions this contract was checked against). A *core producer* or *core consumer* implements IGS/1 as specified here and no extension (§3.4). IGPV and IGDM are the provenance and display-metadata data models of the companion ISONGraph-Ext project; they matter here only as the origin of the reserved names (§3.3, §3.4) and of the address vectors in §13.3.

Clarifications incorporated in the text (each is a validation clarification of rules already stated; none adds a field or changes a canonical byte):

- **F1 (§5.8):** exchanged scenes must have unique node references, unique edge references, edge endpoints that resolve to exactly one node of the scene, and canonical endpoint order in undirected graphs; violations are `INVALID_SCENE`. The re-canonicalization step includes the §5.5 array ordering.
- **F2 (§2.1):** compilation is asynchronous and uses standard WebCrypto SHA-256.
- **F3 (§5.8):** a consumed scene must agree with its own references: every address is well-formed (§1.2); `category` equals `ref.type`; a node `label` equals the text of its decoded id and an edge `label` equals `ref.rel` (§3.2); and in a `simple` graph every edge ordinal is `"0"`. Violations are `INVALID_SCENE` with the reasons listed in §5.8. A future `display_label` is a separate presentation field and never redefines `label`.

Scope boundary. This document is the **portable** contract. Which inputs one Core port can supply is a property of an adapter, not of this contract: a narrower adapter never changes anything below.

## 0. Laws

1. The Scene is renderer-neutral and is **not graph truth**; it retains references into a source artifact.
2. A scene is a pure function of the source artifact bytes (and, when a qualified extension is used, the bytes of each accepted enrichment payload). Which adapter built it, and how thoroughly an enrichment was verified, is irrelevant to the scene and never recorded in it.
3. Compilation fails closed. There is no partial scene, no rounding, no coercion, no silent drop.
4. The semantic scene contains no runtime or computed state: no positions, viewport, focus, selection, hover, animation, timestamps or transient overlays.
5. Identity here is **snapshot identity**. Nothing in IGS/1 claims continuity of an object across graph revisions.
6. The scene carries roles and categories, never colours, fonts or pixel sizes. Appearance belongs to a theme.
7. The semantic scene describes what is **presented**. Evidence about what was **verified** (schema validation, admission by Ext) lives in a separate receipt (§3.4) and never changes `scene_sha256`.

## 1. Three identities

| Identity | Definition | Answers |
|---|---|---|
| Source artifact identity | `artifact_sha256` = SHA-256 of the exact bytes of the graph artifact | Which bytes were compiled? |
| Scene object identity | `(artifact_sha256, typed address)` | Which object inside those bytes? |
| Semantic Scene identity | `scene_sha256 = SHA-256(CanonicalBytes(SemanticScene))` | Which compiled semantic representation, including accepted presentation intent? |

None of them proves anything about a different artifact. Two artifacts with equal graphs but different bytes have different identities by design.

### 1.1 Source artifact identity

`artifact_sha256` is lowercase hex of SHA-256 over the bytes **exactly as supplied**: no newline normalization, no re-serialization, no BOM stripping, never computed from a reserialized graph.

### 1.2 Typed addresses

The typed addressing (`NodeRef/2`, `EdgeAddress/2`) used across the ISONGraph ecosystem, restated here so that this contract depends on no other specification. The scheme is tagged `igs-addr/1`. Its parent (Semantic/2) is still a draft, so a later change is a new scheme tag, never a silent change to this one.

```text
NodeRef     = { type: STRING, id: NodeId }
NodeId      = INT64 | STRING                 (never BOOL, FLOAT, null)
EdgeAddress = { src: NodeRef, rel: STRING, tgt: NodeRef, ord: STRING }
```

- `type` and `rel` are Core identifiers: non-empty, no whitespace, none of `:` `|` `"` `\`.
- **Tagged id wire form** (a string):
  - `i:` + canonical decimal of an INT64: `0` or `-?[1-9][0-9]*`, within −2^63 … 2^63−1. `-0`, `+5`, leading zeros and out-of-range values are invalid.
  - `s:` + the string, verbatim.
  `i:1` and `s:1` are different identities. A string id that looks numeric stays a string.
- INT64 values are held as `bigint` in memory and never as a JavaScript `number`. A value that cannot be shown to be exact is rejected before it becomes an address.
- `ord` is the canonical decimal string `0|[1-9][0-9]*`. IGS/1 core supports simple graphs only, so `ord` is always `"0"`; the field exists so multigraph support later needs no schema change.
- **Directed** graphs keep `src`/`tgt` as written. **Undirected** graphs use one logical edge per mirror pair, with endpoints in canonical order (`src` ≤ `tgt` under §5.5). A self-loop is one logical edge.
- Reference text (`:p:1`) is not identity. It is resolved against the typed node table first.

### 1.3 Semantic scene identity

`scene_sha256` is defined by §5.7. `SemanticScene` **includes** the source block, graph header, node and edge references, categories, semantic labels, and every accepted presentation-intent field (§3.3). It **excludes** everything named in Law 4. Adding an accepted enrichment changes the hash; omitting all enrichment yields exactly the bytes of the core scene.

## 2. Input contract (bytes-first)

- The **normative input** is `Uint8Array` source bytes plus an **explicit** serialization profile. The compiler never sniffs the profile.
- The only supported profile is `ison-v1`. ISONL (`isonl-v1`) and anything else are rejected with `UNSUPPORTED_SERIALIZATION_PROFILE`.
- Bytes must be strict UTF-8 without a byte-order mark; otherwise `MALFORMED_SOURCE` / `INVALID_ENCODING`.
- A **separately named text convenience** may exist. It is defined as: reject a string containing a lone surrogate (`INVALID_ENCODING`), encode it as UTF-8, then run the byte path on the **encoded bytes**; `artifact_sha256` is the hash of those encoded bytes. A leading U+FEFF is rejected exactly as a BOM is. A text input can never prove what bytes a file originally held, so reports that need that must use the byte path.
- Exact function names and signatures are those of the reference implementation (`packages/scene-core`); the above is the contract any implementation must satisfy.

### 2.1 Hash and API shape (decided at freeze, F2)

- SHA-256 is computed with standard WebCrypto, `crypto.subtle.digest("SHA-256", bytes)`. No hashing library is bundled and none is added as a dependency.
- Anything that hashes is therefore **asynchronous**: compilation, scene-hash computation, scene verification and `resolveInSource`. Canonicalization (§5) is synchronous and pure; only the digest call is awaited.
- Illustrative shape (the exported names and the result type are those of the reference implementation):

```ts
async function compileScene(
  source: Uint8Array,
  profile: "ison-v1"
): Promise<SceneCompilation>
```

- The digest implementation is `globalThis.crypto.subtle` where it exists, otherwise Node's `node:crypto` `webcrypto.subtle`. There is no other fallback. If neither exists the operation fails with an environment error (not a scene error) and produces no scene.
- Browser and Node compatibility is demonstrated by the reference implementation's test matrix (Node 22 and 24; Chromium over a secure context).

## 3. Scene schema (IGS/1)

All objects are closed: an unknown field is `INVALID_SCENE`, except fields whose key matches `x-[a-z0-9][a-z0-9._-]*`, which are preserved, ordered and hashed like any other field. `scene_sha256` is a reserved key and must not appear in a scene.

**Required versus optional.** Every field marked *required* is **always serialized**, whatever its value: in particular `SceneNode.ref`, `SceneNode.category`, `SceneNode.label`, `SceneEdge.ref` and `SceneEdge.label`, and the required top-level fields below, even when a label equals its id. The default-omission rule applies **only to optional fields**: an optional field equal to its stated default is omitted from canonical bytes (absent means default). A serialized optional field that equals its default is non-canonical (`INVALID_SCENE` / `NON_CANONICAL`).

**Reserved names** (§3.4) are neither required nor optional in IGS/1: a core producer never emits them and a core consumer rejects them.

### 3.1 Top level

| Field | Type | Required | Notes |
|---|---|---|---|
| `igs` | `"IGS/1"` | yes | consumers reject unknown major versions |
| `address_scheme` | `"igs-addr/1"` | yes | |
| `source` | `{ artifact_sha256: hex64, serialization_profile: "ison-v1" }` | yes | |
| `graph` | `{ directed: bool, profile: "simple" }` | yes | `"multigraph"` is reserved and never produced by a core producer |
| `nodes` | SceneNode[] | yes | sorted per §5.5 |
| `edges` | SceneEdge[] | yes | sorted per §5.5 |
| `extensions` | string[] | no | default empty (omitted). Sorted, unique identifiers of qualified extensions that the scene uses, each of the form `[a-z][a-z0-9._-]*/[0-9]+` (for example `igs-igdm/1`). Hash-bearing. §3.4 |
| `groups` | reserved | no | **reserved, not qualified** (§3.4) |
| `enrichments` | reserved | no | **reserved, not qualified** (§3.4) |
| `layout_intent` | reserved | no | **reserved, not qualified** (§3.4) |

### 3.2 Objects produced by a core producer

```text
SceneNode { ref: NodeRef,     category: STRING, label: STRING }
SceneEdge { ref: EdgeAddress, label: STRING }
```

- `category` is the node type, verbatim. Appearance derived from degree or category is a renderer/theme concern computed from scene topology, not a scene field.
- `label` for a node is the **source node id**: the decimal digits for an INT64, the string for a STRING. For an edge it is `rel`. This is the only label policy in IGS/1; a `name`-property policy is not part of the contract.
- Interaction and accessibility defaults are implied (§6), not serialized.

### 3.3 Presentation intent versus runtime state

Two different things share the word "decoration". They are separated by whether they are **stable intent about the source** or **transient state of one viewing session**.

| | Hash-bearing semantic presentation intent | Runtime state |
|---|---|---|
| Examples | node `badge`, `ring`, `emphasis`, `role`; declared `visibility` and `lod_min`; label overrides; interaction/accessibility overrides; group hull/collapse intent; layout intent | selection halo, hover highlight, focus indicator, drag, pan/zoom, the *current* expanded/collapsed state, animation, transitions |
| In the scene | **yes**, only through a qualified extension that activates the reserved name (§3.4); never in a core scene | **never** |
| In `scene_sha256` | yes | no |
| Named objects | `SceneLabel`, `SceneBadge`, `SceneRing`, `SceneGroup`, `LayoutIntent` and the fields above | `SceneOverlay`, `SceneTransition` |

- `SceneOverlay` is reserved **exclusively** for transient presentation (selection halo, hover highlight, a drawn focus ring). It is never part of the semantic scene. A semantic IGDM ring is a `SceneRing`; a runtime focus ring is an overlay. The two are never the same object.
- `SceneTransition` is reserved for a future runtime (rendering) contract. Neither runtime name has a schema in IGS/1.
- IGDM's *declared* `visibility: collapsed` is intent and hash-bearing; whether the user has expanded it now is runtime state.
- Layout **intent** (`family`, `direction`, `stability`, per-node `rank` and `anchor`) is hash-bearing and is carried to the layout contract (IGL/1). Layout **coordinates** are never in the scene.

### 3.4 Reserved containers, their qualification boundary, and the enrichment receipt

**What is frozen now.** The complete core scene subset (§3.1 required fields, §3.2). For extensions, only three things are frozen: the reserved *names*, their hash-bearing status, and the *activation mechanism* below. Their field-level schemas are **not** specified, **not** qualified, and not valid for production or consumption in IGS/1 as specified here.

**Reserved names.**

| Where | Names |
|---|---|
| Top level | `groups`, `enrichments`, `layout_intent` |
| On `SceneNode` and `SceneEdge` | `display_label`, `role`, `emphasis`, `badge`, `ring`, `visibility`, `lod_min`, `interaction`, `a11y_text`, `a11y_role` |

`label` keeps its IGS/1 core meaning (the source id, or `rel` for an edge) and is never overridden. A presentation label supplied by an enrichment goes in the reserved `display_label`, so the core field and the default accessible name remain stable.

**Rules.**

1. A core producer never emits a reserved name and never emits a non-empty `extensions`.
2. A core consumer rejects a scene that contains a reserved name (`INVALID_SCENE` / `RESERVED_FIELD`) and rejects a scene whose `extensions` lists an extension it does not support (`UNSUPPORTED_EXTENSION`).
3. **Activation.** A reserved name is legal only in a scene whose `extensions` lists a qualified extension that defines it. An extension is a separately versioned, separately qualified specification (the first planned is `igs-igdm/1`). It fixes the field-level schemas, defaults, ordering and canonicalization additions for the reserved names it activates, and ships its own oracles.
4. **Containment.** An extension may define content only for reserved names. It may not change the meaning, default, ordering or serialization of any core field. Consequently a scene that declares no extension has the same bytes before and after any extension is qualified, and the core oracles never change.
5. **Not a version bump.** Qualifying an extension, or issuing a new version of one, does not create `IGS/2` (§11).
6. `extensions` is hash-bearing, sorted and unique. A consumer that supports an extension validates reserved fields against that extension's schema only.

**Enrichment identity versus enrichment receipt.** What an enrichment contributes to the semantic scene is the *presented content* and the identity of what supplied it (an extension-defined record carrying at least `kind` and `payload_sha256`). It carries **no verification or admission status**. Two consumers given the same source bytes and the same enrichment bytes produce the same `scene_sha256` whether one merely schema-validated the payload and the other consumed it after verified admission by Ext.

That status lives in a separate, non-hashed **enrichment receipt** produced beside the scene, for example `{ scene_sha256, extension, payload_sha256, schema_validated, admitted, evidence? }`. Its exact fields are specified with the first extension. The scene describes what is presented; the receipt describes what has been verified.

## 4. Graph profile qualification (portable rules)

- IGS/1 defines `simple` and reserves `multigraph`. A compiler declares which profiles and id domains it supports and **rejects** everything else before any lossy conversion, with `UNSUPPORTED_GRAPH_PROFILE`.
- Unknown, malformed or contradictory profile metadata is rejected, never reinterpreted.
- Detection works on the structured document produced by the Core parsing library. It never searches raw text for markers and never reimplements the parser.
- The scene does not record which compiler produced it (Law 2).

## 5. IGS-CJ/1 canonical serialization

### 5.1 Foundation

`CanonicalBytes` is **RFC 8785 (JSON Canonicalization Scheme) output** for an I-JSON value, with the stricter constraints below. Where RFC 8785 is silent or permissive, the stricter IGS rule applies.

### 5.2 Value domain

Allowed: objects, arrays, strings, booleans, and **non-negative integers up to 2^53−1** (only for small counters and levels such as `lod_min`). Forbidden, each making a value invalid: `null` (use absence), floating-point numbers, exponents, negative numbers, `-0`, integers above 2^53−1, duplicate object keys, strings containing a lone surrogate. Identity integers are never JSON numbers; they are tagged strings (§1.2).

### 5.3 Object keys

JCS orders keys by UTF-16 code units. Every IGS-defined key is ASCII and every extension key must match `x-[a-z0-9][a-z0-9._-]*`, so UTF-16, UTF-8 and code-point orders coincide for all keys. No scene key is ever derived from user data.

### 5.4 Strings

As RFC 8785 §3.2.2.2, spelled out:

- escape `"` as `\"` and `\` as `\\`;
- escape U+0008 `\b`, U+0009 `\t`, U+000A `\n`, U+000C `\f`, U+000D `\r`;
- escape every other U+0000–U+001F as `\u00xx` with **lowercase** hex;
- write **everything else literally** in UTF-8: including U+007F, U+2028, U+2029, U+00E9 and non-BMP scalars. No `\/`, no `\u` escape for any printable scalar.
- **No Unicode normalization** of any kind.

### 5.5 Arrays and ordering

Node and edge arrays are ordered by **semantic order**, which compares strings by **UTF-8 bytes** (Semantic/2), not by UTF-16 code units:

- Nodes: `type` bytes; then `id`, with every INT64 before every STRING, INT64s by signed numeric value (compared as `bigint`), STRINGs by UTF-8 bytes.
- Edges: `src`, then `rel` bytes, then `tgt`, then `ord` bytes (lexicographic, so `"10" < "2"` on purpose).
- Undirected canonical endpoints: `src = min(a, b)`, `tgt = max(a, b)` under the node order.

**Hazard:** JavaScript's default string comparison is UTF-16 order, which disagrees with UTF-8 order for BMP scalars at or above U+E000 versus supplementary scalars. Oracle O2 contains `s:～` (U+FF5E) and `s:😀` (U+1F600) for exactly this reason.

### 5.6 Encoding

UTF-8, no byte-order mark, no trailing newline, no insignificant whitespace.

### 5.7 Hash

```text
H_scene = SHA-256( CanonicalBytes( SemanticScene ) )
```

The scene never contains its own hash, and `scene_sha256` is a reserved key (`INVALID_SCENE` if present). The digest travels beside the scene. `source.artifact_sha256` is a separate input hash and is part of the hashed bytes.

### 5.8 Verification of an exchanged scene

An exchanged scene artifact is its canonical bytes. A consumer checks, in this order, and rejects with `INVALID_SCENE` and the stated reason at the first failure:

1. **Schema** (§3): closed objects, all required fields present, no reserved name (`RESERVED_FIELD`) and no `scene_sha256` key. Every address is well-formed (§1.2, F3): `id` is a tagged id with a canonical in-range INT64 or a string (`INVALID_ID`), `type` and `rel` are Core identifiers (`INVALID_IDENTIFIER`), and `ord` is a canonical decimal (`INVALID_ORDINAL`).
2. **Canonical form**: re-canonicalize the parsed scene and compare bytes. Re-canonicalization **includes the §5.5 ordering** of `nodes` and `edges` and the omission of optional fields equal to their default. Any byte difference is `NON_CANONICAL`.
3. **Graph integrity (F1).** A canonical, schema-valid document can still be an invalid scene, so a scene is valid only if:
   - every `SceneNode.ref` is unique: `DUPLICATE_NODE_REF`;
   - every `SceneEdge.ref` is unique: `DUPLICATE_EDGE_REF`;
   - both endpoints (`src` and `tgt`) of every edge resolve to exactly one node of the same scene, by `NodeRef`: `DANGLING_EDGE_ENDPOINT`;
   - when `graph.directed` is `false`, every edge has `src` ≤ `tgt` under §5.5: `NON_CANONICAL_ENDPOINTS`. A directed graph keeps `src` and `tgt` as written, so the same ordering is valid there.
   - **F3, agreement with its own references:** every node's `category` equals its `ref.type` (`CATEGORY_MISMATCH`); every node's `label` equals the text of its decoded id (`LABEL_MISMATCH`); every edge's `label` equals its `ref.rel` (`LABEL_MISMATCH`); and because `graph.profile` is `"simple"`, every edge's `ord` is `"0"` (`UNEXPECTED_ORDINAL`). Two edges that differ only in ordinal are therefore invalid in a simple graph.

These checks use the scene alone and need no source artifact. A hash is always the hash of the canonical bytes of a valid scene; a matching hash is not by itself a validity claim.

**Conformance expectations** (the reference implementation tests each; none changes an existing oracle):

| Case | Expected |
|---|---|
| O1, O2, O4, O5 exactly as frozen | valid |
| two nodes with the same `ref` | `INVALID_SCENE` / `DUPLICATE_NODE_REF` |
| two edges with the same `ref` | `INVALID_SCENE` / `DUPLICATE_EDGE_REF` |
| edge whose `src` names no node; edge whose `tgt` names no node | `INVALID_SCENE` / `DANGLING_EDGE_ENDPOINT` |
| undirected scene with an edge whose `src` > `tgt` | `INVALID_SCENE` / `NON_CANONICAL_ENDPOINTS` |
| directed scene with an edge whose `src` > `tgt` (control) | valid |
| `nodes` or `edges` out of §5.5 order | `INVALID_SCENE` / `NON_CANONICAL` |
| an optional field serialized at its default (for example `extensions: []`) | `INVALID_SCENE` / `NON_CANONICAL` |
| a reserved name without a declaring extension | `INVALID_SCENE` / `RESERVED_FIELD` |
| a non-empty `extensions` the consumer does not support | `UNSUPPORTED_EXTENSION` |
| a `scene_sha256` key inside a scene | `INVALID_SCENE` (schema) |
| node id `i:007`, `i:-0`, `i:9223372036854775808` or an untagged id | `INVALID_SCENE` / `INVALID_ID` |
| node `type` or edge `rel` that is empty or contains whitespace, `:` `|` `"` or `\` | `INVALID_SCENE` / `INVALID_IDENTIFIER` |
| node `category` differs from `ref.type` | `INVALID_SCENE` / `CATEGORY_MISMATCH` |
| node `label` differs from the text of its id; edge `label` differs from `ref.rel` | `INVALID_SCENE` / `LABEL_MISMATCH` |
| an edge `ord` other than `"0"` in a `simple` graph (also two otherwise identical edges with `"0"` and `"1"`) | `INVALID_SCENE` / `UNEXPECTED_ORDINAL` |
| an edge `ord` that is not a canonical decimal (for example `"01"`) | `INVALID_SCENE` / `INVALID_ORDINAL` |

## 6. Generic defaults and accessibility (Core-only)

| Concern | Default (implied, not serialized) |
|---|---|
| Node category | node type |
| Node label | source node id text |
| Edge label | relation type |
| Node accessible name | `{category} {label}` (type and id together), e.g. `person 1` |
| Edge accessible description | `{src label} {rel} {tgt label}` in stored endpoint order; directedness is `graph.directed` and richer textual summaries are outside IGS/1 |
| Interaction | selectable and focusable; not expandable; no drilldown |
| Role / emphasis / badge / ring / visibility / LOD | absent (neutral, none, visible, level 0) |
| Appearance, size, position | not in the scene |

Accessible names are pure functions of the scene so that every renderer produces the same text.

## 7. Undirected edges

- A mirror pair compiles to one logical edge (§1.2). A self-loop is one logical edge. The canonical endpoint-ordering rule (§5.5) is unchanged.
- Detection works on the **Document rows** of each edge block (the block name is the relation), using each row's ordered pair of endpoint **reference texts**. Reference text is injective within a node type under Core's id-twin invariant, so no typed resolution is needed.
- **Duplicates first.** Before any comparison:
  - two rows with the **same orientation** (same source text and same target text) are `DUPLICATE_EDGE`, even when their properties agree;
  - a **repeated self-loop** (a second row with the same text for source and target) is `DUPLICATE_EDGE`.
  Core's loader swallows both silently in undirected graphs (fixtures n15, n16), so this is the only place they are caught.
- **A mirror pair is exactly two rows with reversed endpoints** (`A→B` and `B→A`, `A ≠ B`). Each orientation may appear once, so a third row for the same logical edge necessarily repeats an orientation and is a `DUPLICATE_EDGE`; there is no separate "too many records" case.
- A logical edge with a single row is one edge; its properties are never compared. A mirror pair's two rows are compared, after normalization, as follows.
- **Normalization** follows Semantic/2 §1: null members elided; `1` equals `1.0` and `0` equals `-0.0`; floats compared as exact binary64; strings exact; booleans distinct from numbers; references compared by (type, id text).
- **Conflict.** Differing normalized bags: `UNDIRECTED_EDGE_CONFLICT` / `PROPERTY_MISMATCH`.
- **Unverifiable values.** If either row holds an integer-valued number outside ±(2^53−1), the parser cannot show whether the source token was exact, so equality after parsing proves nothing. The pair is rejected: `UNDIRECTED_EDGE_CONFLICT` / `UNVERIFIABLE_PROPERTY_VALUE`. This applies when the two values look equal **and** when they look different, and only to mirrored pairs; property values anywhere else are never read.
- This is a comparison rule on already-parsed rows. It is not a parser and not a reason to reimplement one.

## 8. Structured errors

Errors are values, never partial scenes: `{ code, reason?, path?, detail? }`. `path` locates the offending block/row/field; `detail` is human text outside any contract.

| Code | Reasons | Meaning |
|---|---|---|
| `MALFORMED_SOURCE` | `PARSE_ERROR`, `INVALID_ENCODING` | not a loadable artifact |
| `UNSUPPORTED_SERIALIZATION_PROFILE` | | not `ison-v1` |
| `UNSUPPORTED_GRAPH_PROFILE` | `MULTIGRAPH`, `UNKNOWN_FORMAT`, `MALFORMED_META`, `CONTRADICTORY_META` | profile not supported or not trustworthy |
| `INVALID_NODE_ID` | `NOT_INT64_OR_STRING`, `INT64_RANGE` | id kind outside the identity domain |
| `INEXACT_NODE_ID` | `OUT_OF_SAFE_RANGE` | the compiler cannot show the id is exact; never rounded or coerced |
| `DUPLICATE_NODE`, `DUPLICATE_EDGE`, `ID_TWIN` | | mapped from Core; `DUPLICATE_EDGE` is also raised by the §7 rule for undirected same-orientation and repeated self-loop rows, which Core swallows |
| `INVALID_EDGE_ENDPOINT` | | an edge references a node that does not exist |
| `UNDIRECTED_EDGE_CONFLICT` | `PROPERTY_MISMATCH`, `UNVERIFIABLE_PROPERTY_VALUE` | a valid mirror pair whose rows disagree or cannot be compared reliably |
| `INVALID_SCENE` | `NON_CANONICAL`, `RESERVED_FIELD`, `DUPLICATE_NODE_REF`, `DUPLICATE_EDGE_REF`, `DANGLING_EDGE_ENDPOINT`, `NON_CANONICAL_ENDPOINTS`, `INVALID_ID`, `INVALID_IDENTIFIER`, `INVALID_ORDINAL`, `CATEGORY_MISMATCH`, `LABEL_MISMATCH`, `UNEXPECTED_ORDINAL`, others | schema or graph-integrity violation in a scene being consumed (§5.8); `RESERVED_FIELD` is a reserved name present in a scene whose extensions do not activate it |
| `UNSUPPORTED_EXTENSION` | | the scene's `extensions` lists an extension this consumer does not support |
| `UNRESOLVED_ADDRESS` | | address not present in the scene or source |
| `SOURCE_MISMATCH` | | scene's `artifact_sha256` differs from the supplied bytes |

`INVALID_NODE_ID` is the portable verdict (a value outside INT64 or not an id kind). `INEXACT_NODE_ID` is a compiler's inability to establish exactness for a value that may be a valid INT64. A compiler whose id domain is the full INT64 range never raises the latter.

## 9. Source-object resolution

- `resolveInScene(scene, address)` returns the `SceneNode` or `SceneEdge` with that address, or `UNRESOLVED_ADDRESS`.
- `resolveInSource(bytes, objectRef)` requires `sha256(bytes) == objectRef.artifact_sha256` (`SOURCE_MISMATCH` otherwise), then locates the object by typed address through the same qualified loader, or `UNRESOLVED_ADDRESS`.
- **Selection reference** = `{ artifact_sha256, address }` serialized with the §5 rules. A select event carries exactly this and nothing derived from hit-testing, so a consumer can resolve it against its own copy of the artifact.
- **Round-trip property** (a test, not an aspiration): for every node and edge `o` of a compiled scene, `resolveInSource(bytes, {artifact_sha256, o.ref})` returns the source object whose typed address is `o.ref`.
- **What resolution guarantees, and what it does not.** It guarantees *exact artifact identity* (the bytes hash to `artifact_sha256`) and *typed-object identity* (the object exists at that typed address). It does **not** guarantee that the returned object carries the original source property values. The Core TypeScript parser (`ison-ts` 1.2.0) rounds integer property values outside the safe range, so a Core-loaded object, if returned, is "as loaded by the reference adapter" and is never evidence of the original property values. A resolution result must therefore be an identity result (the address and whether it exists); any property data attached to it is advisory and must be labelled as such.

## 10. Layout binding

- A layout is a separate artifact (IGL/1, see [IGL-1.md](IGL-1.md)). It carries `scene_sha256` and a map from canonical address keys to positions plus its policy, seed and version.
- A renderer receives `(scene, layout)` and **rejects** a layout whose `scene_sha256` differs from the scene's. The scene is never mutated by layout.
- An IGS/1 implementation's only obligation to layout: expose `scene_sha256` and the canonical address ordering, so a layout key is a stable function of the address.

## 11. Versioning

Consumers reject an unknown `igs` major version.

Within IGS/1 exactly three things may change a scene without creating `IGS/2`:

1. additive `x-` fields (§3);
2. a **qualified extension** activating the reserved names of §3.4, under the containment rule that it never changes a core field's meaning, default, ordering or serialization;
3. a new version of such an extension (`igs-igdm/2`).

`IGS/2` is required for: a new non-`x-`, non-reserved field; any change to a core field, default, ordering or canonicalization rule; any change to the address scheme (that is a new `address_scheme` tag as well); activating a name that §3.4 does not reserve.

## 12. Oracles: frozen canonical bytes and digests

Byte-exact files under [`fixtures/oracles/`](../../fixtures/oracles/) are the normative golden values. `fixtures/oracles/SHA256SUMS` lists them (verify with `sha256sum -c SHA256SUMS` from that directory). The scene files are exactly `CanonicalBytes` output; each source file's SHA-256 is the `artifact_sha256` inside its scene.

| Oracle | Source (`artifact_sha256`) | Scene (`scene_sha256`) | Exercises |
|---|---|---|---|
| O1 `o1-basic` | `1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a` | `e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc` | int id vs string id, key order, edge address, labels |
| O2 `o2-ids-ordering` | `21e1e82da0c2a156af3fd9d7777c8809ec2ca2659c3a650efbcb5746dc364ba6` | `8507fcba55d7d8e1d569357d5bcabadad99d8dddad875c80c077b6560bf1ff20` | INT64 min/max, numeric (not lexicographic) order, numeric-looking string `"007"`, UTF-8 vs UTF-16 string order (`é`, `～`, `😀`), edge order |
| O4 `o4-undirected` | `cb7ed11865d3106714b303b973086178a1562ed9deed3fae2b75ab583bb575d3` | `13b1ede37d266246ef80082426eb3a08a9c24e164ac2e8bc44cb3ff2b2fa9b09` | mirror pair collapse, canonical endpoint order, self-loop |
| O5 `o5-string-stress` | (uses O1's source hash, schema-level only) | `86044435c3c241e04a985a62b9e473ebbfbf22a7a17518c9f963487586edc836` | every string rule of §5.4 in an `x-test` field |

O2 is a **portable-schema** oracle: the Core TS 1.4.1 adapter must reject its source (`INEXACT_NODE_ID`) while an INT64-complete compiler accepts it. O5 is **schema-level**: it is not producible by compilation and tests the serializer only.

O1 canonical bytes (504 bytes):

```text
{"address_scheme":"igs-addr/1","edges":[{"label":"KNOWS","ref":{"ord":"0","rel":"KNOWS","src":{"id":"i:1","type":"person"},"tgt":{"id":"s:ann","type":"person"}}}],"graph":{"directed":true,"profile":"simple"},"igs":"IGS/1","nodes":[{"category":"person","label":"1","ref":{"id":"i:1","type":"person"}},{"category":"person","label":"ann","ref":{"id":"s:ann","type":"person"}}],"source":{"artifact_sha256":"1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a","serialization_profile":"ison-v1"}}
```

O5 is defined by the code-point list in `fixtures/oracles/o5-string-stress.codepoints.json` (the value of `x-test`) and its canonical bytes are the file; its hexadecimal form is the byte-level reference for the escape rules (`22 5c 22` is `\"`, `5c 5c` is `\\`, `5c 75 30 30 30 37` is `\u0007`, `7f` is a raw DEL, `e2 80 a8` is a raw U+2028, `f0 9f 98 80` is a raw U+1F600, `5c 75 30 30 30 30` is `\u0000`).

### 12.1 How independent the oracles are, honestly

- The scene bytes were produced by one Python serializer (`json.dumps` with sorted keys and compact separators) and **re-derived by separate Node code** (separate ordering and serialization logic, `Buffer.compare` for byte order). All four match byte for byte.
- Each file's SHA-256 was computed with `sha256sum`, `openssl dgst` and Python `hashlib`; all three agree for every file.
- The source files were loaded with the Core **Python** implementation (1.4.1): O1, O2, O4 load with the expected typed ids (`int` vs `str`; INT64 extremes as `int`), and O4 is undirected.
- An early run of the string-stress oracle **disagreed** between the two serializers; the cause was a backslash collapsed by shell quoting, not a rule ambiguity. The value is now defined by an explicit code-point list in both programs. This is the reason the spec freezes files and not just text.
- Independent review: a reviewer reconstructed O1, O2 and O4 from their source fixtures and O5 from its code-point list using a separate canonical serializer, without these tools. All four scene byte sequences and all 29 checksums then in `SHA256SUMS` matched. This satisfies the oracle-independence requirement for these four golden examples; a further external reviewer is welcome. This does not prove every implementation of RFC 8785 is correct. (Fixtures n15–n17 were added after that review, and `SHA256SUMS` now lists 32 entries.)
- Remaining limit: no RFC 8785 reference library was run by the authors.
- The tools that produced and checked them are in `fixtures/oracles/tools/`.

## 13. Acceptance vectors

### 13.1 Fixtures (`fixtures/oracles/fixtures/`, expectations in `fixtures/oracles/fixtures/EXPECT.tsv`)

Each fixture has an expected verdict. Before they were frozen, each was run through `ison-ts` 1.2.0 and the published `ison-graph-ts` 1.4.1 to confirm what the parser and Core actually do, so the expectations are not guesses.

| Group | Fixtures | Expected |
|---|---|---|
| Graph profile | `n01` multigraph, `n02` quoted-boolean `directed`, `n03` unknown format, `n04` extra meta field, `n05` duplicate `meta.graph` blocks | `UNSUPPORTED_GRAPH_PROFILE` (`MULTIGRAPH`, `MALFORMED_META`, `UNKNOWN_FORMAT`, `MALFORMED_META`, `CONTRADICTORY_META`). Core accepts every one silently. |
| Marker as data | `p01` property value containing `ison-graph-multigraph-v1` | accepted |
| Ids | `n06` unsafe neighbours, `n07` unsafe reference, `n08` float id, `n14` int/string twin, `p04` safe boundaries, `p05` numeric-looking strings, `p06` int vs string in different types | `INEXACT_NODE_ID`, `INEXACT_NODE_ID`, `INVALID_NODE_ID`, `ID_TWIN`; the rest accepted |
| Mirrored edges | `n09` two distinct unsafe integer values that round to the same number, `n10` identical unsafe values, `n11` differing safe values; `p02` equal safe values, `p03` unsafe value with no mirror row | `UNVERIFIABLE_PROPERTY_VALUE`, `UNVERIFIABLE_PROPERTY_VALUE`, `PROPERTY_MISMATCH`; `p02` and `p03` accepted |
| Duplicate edges | `n15` undirected, two rows with the **same orientation** and identical properties; `n16` undirected, the same self-loop twice; `n17` directed duplicate (control) | `DUPLICATE_EDGE` for all three. Core swallows n15 and n16 silently (they load as if valid) and rejects n17 itself. |
| Encoding | `n12` byte-order mark, `n13` invalid UTF-8 | `MALFORMED_SOURCE` / `INVALID_ENCODING` |

`n09` is the refinement-C negative vector: Core TS loads it without complaint and both edges carry the same rounded number, which is exactly the false equality the rule forbids.

### 13.2 Further vector groups

`source/hash-exactness` (CRLF, trailing newline and non-canonical column order each change `artifact_sha256` and do not change the compiled node/edge set), `scene/determinism` (repeated and cross-process compiles yield one `scene_sha256`), `scene/ordering` (input row order never changes scene bytes), `scene/layout-independence` (attaching any layout leaves `scene_sha256` unchanged), `resolve/round-trip` (§9 over every object of every accepted fixture), `canon/strings` (O5, plus a lone-surrogate rejection), `text-api` (text input encodes UTF-8 and hashes the encoded bytes; a lone surrogate or leading U+FEFF is rejected).

### 13.3 Ext compatibility fixtures (offline only)

- The reference implementation vendors a **copy** of the published IGPV/1 and IGDM/1 vectors of ISONGraph-Ext v0.4.1 (their `graphs/synthetic/` targets were generated with Core 1.4.1) under `packages/scene-core/test/fixtures/ext/v0.4.1/`; the licence, provenance and a digest of every copied file are recorded there. There is **no** Ext package, import or runtime dependency.
- The only question asked of them is address compatibility. For each target graph inside the adapter's supported subset, compile it and check that every node and edge address referenced by the vectors' payloads exists in the scene with the same typed interpretation. Test code (not product code) reads the payload address columns.
- Target graphs the adapter must reject (for example the multigraph-ordinal vector) are expected to fail with `UNSUPPORTED_GRAPH_PROFILE`; the undirected-logical-edge vector must agree on the logical address.
- IGPV/IGDM semantics (verification, locators, lineage) are Ext's concern and are not tested here.
