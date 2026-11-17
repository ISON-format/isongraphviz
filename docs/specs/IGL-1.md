# IGL/1 — Layout contract

Status: **frozen** (IGL/1, revision 1; the execution-control rules of §7.1 and §7.3 are part of this revision). This is the public edition of the frozen contract. Section numbers are stable: the reference implementation (`packages/layout-core`) cites them. Nothing here changes IGS/1 ([IGS-1.md](IGS-1.md)) or any byte of an IGS/1 scene. The conformance corpus is [`fixtures/oracles-igl/`](../../fixtures/oracles-igl/); [`docs/conformance/README.md`](../conformance/README.md) explains how to verify it.

**Purpose and scope.** Source → IGS/1 scene → **IGL/1 layout** → rendering → selection mapped back to the source. IGL/1 defines the layout boundary only: it reuses Core's `computeLayout` for the FORCE family rather than specifying another force algorithm; binds a layout to a *verified* scene identity; keys positions by IGS/1 typed addresses; records seed, algorithm version, family and configuration; serializes coordinates deterministically with a numeric rule separate from IGS-CJ/1; defines validity and error behaviour; and distinguishes **specified** families from those with a **qualified implementation**. Out of scope: rendering, incremental or stable layout, scene groups, remote actions.

**Terms.** *Core* means the ISON graph library `ison-graph-ts` (and its Python counterpart `ison_graph`, used only for reference vectors). *Qualified* means a registered algorithm with a closed configuration schema, an implementation, and frozen conformance vectors (§7).

## 0. Laws

1. A layout is a **separate artifact**. It never mutates a scene and never changes `scene_sha256` (IGS/1 §10).
2. **Determinism is stated per family, over declared inputs only.** For a family whose algorithm is a function of the scene and policy (FORCE): `Layout = f(scene bytes, policy)`. For FIXED: `Layout = f(scene bytes, policy, positions)`, where `positions` is an explicit input (§7.2). In every case the same declared inputs give byte-identical IGL/1 bytes. The producer, its language, its machine, the time and the execution budget are not inputs and are never recorded in the artifact.
3. Layout fails closed. No partial layout, no `NaN`/`Infinity`, no rounding of an invalid input into a valid one, no silent fallback from one family to another.
4. The artifact holds **positions and the policy that produced them, nothing else**: no viewport, zoom, selection, focus, animation or timestamps.
5. Binding is by hash **derived from verified scene bytes**, and by typed address. Never by a caller-supplied hash, array index, label, or Core's `layoutKey`.
6. A family name is a promise. A producer either implements that family's qualified algorithm or fails with `UNSUPPORTED_FAMILY`.
7. A verifier never accepts a policy it cannot validate. A family whose policy schema is not qualified is unverifiable, hence rejected.
8. **Execution limits are controls, not content.** A budget (§7.3) can prevent a layout from being produced; it can never change one, and it is not part of the policy or the artifact.
9. Verification proves well-formedness and binding. It does **not** prove that coordinates came from the declared algorithm (§6.3).

## 1. Identities

| Identity | Definition | Answers |
|---|---|---|
| Scene identity | `scene_sha256`, derived by `verifyScene` from the scene's canonical bytes (IGS/1 §5.7) | Which semantic scene is this laid out for? |
| Policy | the `policy` object, inside the hashed bytes | Which family, algorithm version and configuration (including seed)? |
| Positions input (FIXED only) | the supplied `{ref, x, y}` set, reflected exactly in `nodes[]` | Which positions did the caller choose? |
| Layout identity | `layout_sha256 = SHA-256(CanonicalBytes(Layout))`; travels beside the artifact, never inside it | Which exact positions, for which scene, produced how? |

Two policies that happen to give equal positions have different layout identities by design.

## 2. Schema (IGL/1)

All keys below are required unless stated. Required fields are always serialized (no defaults, no omission): an artifact must not change meaning if a default changes.

```json
{
  "address_scheme": "igs-addr/1",
  "igl": "IGL/1",
  "nodes": [ { "ref": {"id": "i:1", "type": "person"}, "x": 173961, "y": 81203 } ],
  "policy": { "algorithm": "igl-force/1", "config": { "height": 600, "iterations": 170, "margin": 60, "seed": 42, "width": 900 }, "family": "FORCE" },
  "scale": 1000,
  "scene_sha256": "<64 lowercase hex>"
}
```

(Real output for the frozen O1 oracle with Core's defaults written explicitly and seed 42, canonical order. The scene digest is `e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc`; the 398-byte layout digests to `2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db` under the rules below.)

| Field | Rule |
|---|---|
| `igl` | exactly `"IGL/1"`; any other major is rejected (`UNSUPPORTED_VERSION`) |
| `address_scheme` | exactly `"igs-addr/1"`; positions are keyed by the **same** typed addresses as the scene (IGS/1 §1.2) |
| `scene_sha256` | 64 lowercase hex; the binding (§6) |
| `scale` | exactly `1000`: coordinates are integer thousandths of a layout unit (§4). A different scale is `IGL/2` |
| `nodes[]` | one record per scene node, no more, no fewer (§6); `ref` is the scene node's wire reference `{id, type}`; `x`, `y` are integers (§4); sorted by NodeRef/2 order (§5) |
| `policy.family` | one of the registered family names (§7) |
| `policy.algorithm` | the registered algorithm identifier **and version** for that family, e.g. `igl-force/1` (§7) |
| `policy.config` | a closed object defined by the algorithm (§7). Everything that influences positions is in it, **including the seed**; an algorithm without randomness has no `seed` |
| `x-…` | additive keys matching `x-[a-z0-9][a-z0-9._-]*` are allowed at the top level and on each `nodes[]` record, with values inside the IGL-CJ/1 domain (§5) **and at most 64 levels of array/object nesting** (`TOO_DEEP`, the IGS/1 bound). They are hash-bearing exchange content. `policy`, `policy.config` and `ref` are closed |

**`x-` metadata and determinism.** A producer in this contract (§7) never emits an `x-` key. A layout carrying one is a valid *exchanged* artifact (it verifies and binds) but is by definition not a strict output of `igl-force/1` or `igl-fixed/1`, and `verifyReproducible` (§6.3) reports it as not reproduced.

**Reserved names (unqualified, rejected as `RESERVED_FIELD` in IGL/1):** top level `edges` (edge routes and bends for HIERARCHICAL and COMPOUND), `groups` (COMPOUND), `stability` (STABLE inputs), `extensions`, `bounds`, `viewport`, and `layout_sha256`. Reserving them now lets a later qualified extension activate them without an `IGL/2`, under the containment rule of IGS/1 §3.4: it never changes the meaning, default, ordering or serialization of an IGL/1 field.

**Edges have no geometry in IGL/1.** FORCE draws straight segments between positioned endpoints, so a renderer needs nothing more.

## 3. Coordinate system

Origin top-left of the canvas, x grows right, y grows down (the SVG convention, and Core's). The unit is an abstract **layout unit**; renderers map it to pixels and that mapping is not part of the artifact.

## 4. Numbers: fixed-point integer thousandths

IGS-CJ/1 forbids floats and negatives (IGS/1 §5.2). Layout coordinates are computed `double`s (Core: `293.3277424315421`). IGL/1 serializes **integers in thousandths of a layout unit**, `scale: 1000`, signed safe integers. Raw doubles (RFC 8785 number text) were rejected because the hash would then depend on every last bit of every `double`; hex-float or decimal strings add an encoding with no benefit.

**Rules (frozen with the contract).**

1. *Finite.* A computed or supplied coordinate must be a finite `double`. `NaN` and `±Infinity` are `INVALID_COORDINATE / NOT_FINITE`. (Core does not check: `width: NaN` returns `null` coordinates, measured.)
2. *Quantization.* `q(v) = floor(s) + (s − floor(s) ≥ 0.5 ? 1 : 0)` where `s = v × 1000` in IEEE-754 binary64. Only a correctly rounded multiplication, `floor`, and a subtraction of nearby values are used, so the result is identical in every conforming language. Library `round` functions are not used (languages differ on ties, and `floor(s + 0.5)` is wrong at `0.49999999999999994`).
3. *Range.* `|q(v)| ≤ 2^53 − 1`, else `OUT_OF_RANGE`. `-0` is normalized to `0` and is invalid on the wire (`NEGATIVE_ZERO`).
4. *Wire.* `x` and `y` are JSON integers: canonical decimal text, `-` only for negatives, no exponent, no fraction.
5. *Consumption.* A renderer divides by `scale`. No consumer re-quantizes.

**Boundary note.** The safe-integer boundary is a binary64 fact. The decimal `9007199254740.991` is not representable: its nearest double is `9007199254740.990234375`, and `q` of it is `9007199254740990`. The next double up, `9007199254740.9921875`, has a product of exactly 2^53 and is `OUT_OF_RANGE`. Likewise the shortcut `floor(s + 0.5)` is not the same rule above 2^52 thousandths: for `v = 4503599627370.497`, `s = 4503599627370497` exactly, `q(v) = 4503599627370497`, and the shortcut gives `4503599627370498`.

**What quantization does and does not give.** It absorbs differences far below 0.0005 layout units. It does **not** make determinism universal: a coordinate within an ulp of a tie can quantize differently under an implementation whose arithmetic differs, and rule 2 is defined on binary64 arithmetic, not on exact decimal value (the two differ on constructed ties, measured below). The determinism claim of this contract is therefore tied to **qualified implementations and conformance vectors**, not to a statement about all possible implementations. Measured (200,015 doubles, Node 22 and 24, Python 3.12): TypeScript and an independent Python implementation of rule 2 disagree on **0** values; against exact-decimal half-up the double rule differs on **0 of 83,349** ordinary coordinates and on 10,220 of 100,000 constructed ties within ±2 ulp, which is why the rule is defined on the double arithmetic.

## 5. Canonical form (IGL-CJ/1) and ordering

IGL-CJ/1 is IGS-CJ/1 (IGS/1 §5) with **one** change: integers may be negative (never `-0`), within ±(2^53 − 1). There are no floats. It is exposed in code as an explicitly named function (`canonicalizeSigned`), never as a mode a caller could reach by accident while serializing a scene; `canonicalize` keeps its exact IGS-CJ/1 semantics.

* `nodes` are sorted by **NodeRef/2** exactly as the scene's nodes (IGS/1 §5.5: type by UTF-8 bytes, then INT64 ids before STRING ids, then UTF-8 bytes), so a complete layout's `nodes[i].ref` equals the scene's `nodes[i].ref`. The stored order is independent of the order in which an algorithm processes nodes.
* `layout_sha256 = SHA-256(CanonicalBytes(Layout))`, asynchronous WebCrypto as IGS/1 §2.1/F2. The layout never contains its own hash.

## 6. Verification, binding, and what they prove

### 6.1 `verifyLayout(bytes)`

Standalone, in this order, first failure wins: **schema** (UTF-8 without BOM, JSON, closed objects, reserved and unknown fields, version, address scheme, `scale`, hash shape, every `ref` well formed, every coordinate a finite safe integer, `x-` domain and depth) → **canonical form** (re-canonicalize with the §5 ordering applied; bytes must be equal) → **integrity** (unique node refs) → **policy** (family registered and qualified; algorithm belongs to the family; config valid for it, §7). It snapshots its input synchronously before the first `await`. The values of `policy` are checked against the canonical domain and the 64-level depth bound before any recursion (depth is counted from the `policy` object: 63 nested arrays inside `family` pass the check, 64 do not), so a hostile nesting is `INVALID_LAYOUT / TOO_DEEP` on every host.

### 6.2 `bindLayout(sceneBytes, layoutBytes)` — one qualified boundary

```ts
bindLayout(sceneBytes: Uint8Array, layoutBytes: Uint8Array): Promise<{ scene; sceneSha256; layout; layoutSha256 }>
```

It snapshots both arrays, runs IGS/1's `verifyScene(sceneBytes)` (which checks the scene and **derives** `sceneSha256` from its canonical bytes), runs `verifyLayout(layoutBytes)`, then checks `layout.scene_sha256 === sceneSha256` (`SCENE_MISMATCH`) and that the set of `nodes[].ref` equals the set of scene node refs exactly (`INCOMPLETE_LAYOUT`: `MISSING_NODE` / `UNKNOWN_NODE`). **There is no hash parameter**, so a caller cannot pair a scene with someone else's hash. A scene that fails verification raises the scene library's `IgsError` unchanged. A caller holding a `SceneCompilation` passes its `sceneBytes`; the extra verification is the price of not introducing a trust token.

*The case this closes.* Scene A and Scene B have the same nodes and different edges, hence different `scene_sha256`. A layout produced for B, presented with A's bytes, passes a node-set check; it fails here with `SCENE_MISMATCH` because the hash is derived from A's bytes. A renderer receives `(sceneBytes, layoutBytes)` and rejects an unbound pair (IGS/1 §10).

### 6.3 What a valid, bound artifact proves — and does not

**Proves:** the bytes are canonical IGL/1; every address is well formed; every coordinate is a finite quantized integer in range; the policy is a registered, valid one; the layout belongs to *this* verified scene; it covers exactly this scene's nodes. `layout_sha256` proves the integrity of those bytes.

**Does not prove:** that the coordinates were *generated by* the declared algorithm. Anyone can write a well-formed, bound artifact that says `igl-force/1` and contains chosen numbers. Conformance of the algorithm is established by the independent reference vectors and producer qualification (§10), or, when a reader needs it for a particular artifact, by explicit recomputation:

```ts
verifyReproducible(sceneBytes, layoutBytes, options?): Promise<"reproduced" | "not-recomputable">   // throws INVALID_LAYOUT / NOT_REPRODUCED
```

For FORCE it binds, recomputes with the artifact's own policy under the same execution budget, and compares bytes. For FIXED (positions are inputs) it returns `"not-recomputable"`.

## 7. Families: specified versus qualified

"Specified" means the name and its place in the contract exist. "Qualified" means a registered algorithm with a closed config schema, an implementation, and frozen conformance vectors. Only qualified algorithms can be produced or verified. **FORCE and FIXED are the only initially qualified families.**

| Family | Algorithm id | Status | Producer API | Deterministic over |
|---|---|---|---|---|
| **FORCE** | `igl-force/1` | specified and qualified (`packages/layout-core`) | `computeLayout(sceneBytes, policy, options?)`, `computeForceLayout(sceneBytes, config, options?)` | scene bytes, policy |
| **FIXED** | `igl-fixed/1` | specified and qualified (validation only) | `computeFixedLayout(sceneBytes, positions)` | scene bytes, policy, **positions** |
| HIERARCHICAL / DAG, RADIAL, COMPOUND, STABLE | — | named and reserved; no policy schema | none: `UNSUPPORTED_FAMILY` | — |

STABLE is reserved as a *modifier* of another family (future work), not a standalone algorithm. A name outside the table is `INVALID_LAYOUT / UNKNOWN_FAMILY`. The generic `computeLayout(sceneBytes, policy)` serves only families that are a function of scene and policy; given a FIXED policy it fails with `INVALID_POLICY / INPUT_REQUIRED`, because `config: {}` does not contain the positions.

### 7.1 `igl-force/1` — definition and qualification

*Definition by reference, and the reference is pinned.* Positions equal Core's `computeLayout` for the same graph and options (Fruchterman–Reingold, portable 32-bit LCG `state × 1664525 + 1013904223 mod 2^32`, all-pairs repulsion, springs along edges, linear cooling, clamped to the margin), then §4 quantization. The pinned implementation is **`ison-graph-ts` 1.4.1, subpath `ison-graph-ts/viz`** (package pinned exactly; **every file of its `dist`** (nine files, manifest digest `ae49862f…fb05`; the layout algorithm sits in `chunk-DKY73OIR.mjs` behind the one-line `viz.mjs`) digest-pinned by a test; npm integrity `sha512-fgud0iCl…sA==` in the lockfile). The Python `ison_graph.viz.compute_layout` is the independent reference for the vectors, with the ordering shim below.

*Requalification rule.* Any change to the pinned build (floating-point accumulation order, graph traversal, collision behaviour, defaults, anything) requires re-running every frozen vector. If any expected byte changes, the change is a **new algorithm id** (`igl-force/2`); it never silently remains `igl-force/1`. The digest test exists to make such a change loud.

`config` (closed; all required, no defaults):

| Key | Rule | Core default (not an IGL/1 default) |
|---|---|---|
| `width`, `height` | integers, `1 … 2^31 − 1` | 900, 600 |
| `margin` | integer, `0 … 2^31 − 1`, and `width > 2 × margin`, `height > 2 × margin` | 60 |
| `iterations` | integer, `0 … 2^31 − 1` | 170 |
| `seed` | integer, `0 … 2^32 − 1` | 42 |

These are **validity** bounds (what a well-formed policy may say). What a producer may *run* is limited separately (§7.3). The `width > 2 × margin` rule exists because Core, given a collapsed inner area, silently places nodes outside the margin (measured: two nodes at `(40, 40)` for `width: 100, margin: 60`). Core's `radii`/`spacing` collision pass is **not part of `igl-force/1`**: `igl-force/1` means Core's plain layout only, and a collision-aware layout is a new algorithm id.

*What the algorithm reads from the scene.* The node set, and the edges as **unordered, de-duplicated endpoint pairs**, ignoring direction, ordinal, relation name and self-loops (as Core does). It reads no label other than for ordering, and no presentation field.

*Processing order is part of the algorithm, and it is UTF-16.* Core assigns the LCG's outputs to nodes in sorted order of `(type, String(id))` using JavaScript string comparison, i.e. **UTF-16 code-unit order**, and accumulates forces in that order. `igl-force/1` therefore orders nodes by `(ref.type, node.label)` in UTF-16 code-unit order (`label` is the decoded id text, IGS/1 §3.2). This is not the NodeRef/2 storage order: integer ids `1, 2, 9, 10` are processed as `1, 10, 2, 9`. The node order in which a scene lists its nodes is irrelevant (measured: identical layout). **Measured consequence for the reference:** Core Python compares by code points, so Core TS and unmodified Core Python process ids that mix characters ≥ U+10000 with U+E000–U+FFFF in a different order (2 of 5 test cases diverged). The independent reference therefore feeds Python ids transcoded to one character per UTF-16 code unit, which makes Python's code-point order equal JavaScript's UTF-16 order without changing any Core code; with that transcoding 0 of 5 cases diverge. This is a Core cross-language divergence outside the ASCII/BMP-low range; it is recorded here, not changed, and reported upstream as `ISON-format/isongraph#6`.

*Preflight of every Core representation limit.* Before any Core graph exists, the producer qualifies the **whole** node set. The scene is a portable IGS/1 scene; Core is narrower. A scene that fails any check is refused with `UNSUPPORTED_SCENE`, never conflated, never allowed to surface a Core exception:

| # | Check | Reason |
|---|---|---|
| 1 | an integer id with `|value| > 2^53 − 1` | `UNSAFE_NODE_ID` |
| 2 | a string id that is empty or contains whitespace, `:` or `|` (Core's `_checkIdentifier`) | `CORE_UNREPRESENTABLE_ID` |
| 3 | two nodes with the same Core layout key `type + " " + label` (`i:7`/`s:7`; also catches any other equal-key pair) | `AMBIGUOUS_ORDER_KEY` |
| 4 | within one type, an integer id and a digit-string id (`/^-?[0-9]+$/`) of the same integer value, **in either order** (`i:7`/`s:007`, `i:0`/`s:-0`, `i:-7`/`s:-007`) | `CORE_ID_TWIN` |
| 5 | more than 50,000 physical edges in one relation (`E` directed, `2E` undirected): Core's `graph.edges()` overflows the stack at about 125,000 (see *Edge cap* below) | `CORE_EDGE_LIMIT` |

Order of checks: 1–4 per node as above (check 4 after the loop), then check 5 over the edges. Two digit strings (`s:007`, `s:7`), or equal strings in different types, are *not* refused: Core handles them. **Soundness was measured, not assumed** (on the pinned build): over a 20-node pool of integer and tricky string ids, all 190 pairs and 1,140 triples, in several insertion orders, with an edge between the first two nodes checked for correct resolution, **0 sets** passed the preflight and then failed in Core, and 0 sets were refused that Core would have handled (the rule is not conservative on that pool). Core's twin check is order-dependent (`7` then `"007"` throws; `"007"` then `7` is accepted), which is why check 4 does not depend on order. The preflight is a necessary condition; the producer additionally treats any Core exception as `UNSUPPORTED_SCENE / CORE_REJECTED` and verifies that Core returned exactly one position per scene node (`CORE_RESULT_MISMATCH`). IGS/1 is not changed to accommodate Core.

*Edge cap (check 5).* Core 1.4.1 builds `graph.edges()` with `push(...edges)`, which overflows the call stack at about 125,000 physical edges in one relation (124,860 on Node 24, 125,191 on Node 22, default stack), and the threshold depends on the host's stack size. The cap is 40% of the measured threshold so that the verdict is the same on every host. It is a Core representation limit, never an artifact field. A host with a much smaller stack could still fail below the cap; `CORE_REJECTED` remains the defensive catch.

*Reuse path.* After the preflight: build a Core `ISONGraph` from the scene's nodes and edges (integer ids as `number`, string ids as `string`), call `computeLayout` with the validated config, map `"type label"` keys back to scene addresses, quantize, assemble, serialize, hash, and verify the result.

After building the Core graph the producer verifies **logical-edge equivalence** (directed: `(rel, src, tgt)`; undirected: endpoints in NodeRef/2 order), not a raw edge count: with the constructor `new ISONGraph(name, directed)`, Core 1.4.1 stores an undirected edge as **two** physical entries (one per orientation; a self-loop one) and refuses an explicitly added mirror (`DuplicateEdgeError`), whereas IGS/1 stores one canonical logical edge. The check compares each logical edge's expected physical multiplicity (1 directed; 2 undirected, 1 for a self-loop).

### 7.2 `igl-fixed/1`

`config` is `{}`. The producer takes an **explicit position set** and nothing is guessed:

```ts
type FixedPosition = { ref: WireNodeRef; x: number; y: number };   // x, y: finite doubles in LAYOUT UNITS
computeFixedLayout(sceneBytes: Uint8Array, positions: readonly FixedPosition[]): Promise<LayoutResult>
```

Positions are always interpreted as layout units (not thousandths); each is quantized once by §4 and the integer is serialized. The set must cover exactly the scene's nodes (`INCOMPLETE_LAYOUT`), with no duplicates (`DUPLICATE_NODE_REF`), and each coordinate must be finite (`INVALID_COORDINATE`). The caller's array and its elements are snapshotted (each property read once) before the first `await`.

### 7.3 FORCE execution budget

Policy validity (§7.1) allows `iterations` up to 2^31 − 1; that is a serialization range, not an operational limit. Core's `computeLayout` is **synchronous** and cannot be cancelled once running, so the producer limits the work *before* calling it.

*Cost model, measured* (Node 22 and 24, Windows 11 x64): work `W = iterations × (n(n−1)/2 + 3E + 8n + 4) + 200 × (n + E)` in pair-interaction units, where `n` is the node count and `E` the physical edge count Core builds (`E` for a directed scene; `2E` for an undirected one, because Core stores both orientations). The per-iteration term is charged only for n ≥ 2, because Core returns at once for n ≤ 1. The `3E + 8n + 4` part reflects Core's per-edge and per-node cost in every iteration: on 12 measured points (n = 2…200, Node 22 and 24) the simpler form (pairs + E) undercounted at 8 of them and this form covers all 12; without it, n = 2 with 99,999,600 iterations would pass the default budget and block for 13.6 s. The construction term reflects that, with zero iterations, Core still builds and sets up the graph: about 1.7 µs to build plus 1.2 µs to set up per node or edge, about 3 µs, about 180 units at the 17 ns median, rounded up to 200; an edge-heavy zero-iteration input is therefore refused above about 500,000 edges. Time per unit of `W` over runs with `W ≥ 5×10^6`: 12.7–25.0 ns, median ≈ 17 ns (measured on an earlier form of the formula; it agrees with the final form at the sizes that matter, n ≥ 50). Linear in iterations (n=100: 170 → 1,700 iterations took 13 → 131 ms); quadratic in n. Largest measured: n = 2,000, 170 iterations, `W` = 340 million, 6.1–6.4 s; n = 1,000, 170 iterations, `W` = 85 million, 1.45 s. Nothing larger was measured.

*Initial budget (conservative, from the measurements; not a performance target):*

```ts
DEFAULT_FORCE_BUDGET = { maxNodes: 2000, maxWork: 100_000_000 }
```

`maxNodes` is the largest node count measured. `maxWork` is 1.17× the measured n=1,000 / 170-iteration workload. With Core's default iterations and 2n edges it admits about 1,070 nodes (Core's default workload passes at 1,000 nodes, 87.9M, and fails at 1,100, 106.0M). The budget is stated in work units because seconds depend on the machine, and **it is not a wall-clock bound**. Observed wall time for workloads admitted at 98.5–100% of `maxWork` (Windows 11 x64, V8):

* *First call of a fresh process* (shapes n = 2, 300, 1,000, 2,000 with identifiers of 8, 64, 256 and 1,022 characters that differ in their first characters, three processes per cell): 0.50–2.3 s on Node 24 (median 1.7 s) and 0.48–5.0 s on Node 22 (median 1.6 s; the 5.0 s was one run of n = 2,000 with 1,022-character ids, its two siblings took 2.4 and 3.5 s).
* *Long-lived process* (the same cells, three rounds in one process): 0.46–3.3 s on Node 24 and 0.49–2.4 s on Node 22; medians 1.8 s and 1.6 s.
* *Independent audit measurements*, in long-lived processes: up to **5.2 s on Node 24 and 5.7 s on Node 22** for workloads within the budget, and Core's own default 1,000-node workload at 4.3–4.8 s as a later call in a process against 1.3 s fresh. Fresh-process figures alone understate long-lived behaviour.
* **Identifier length and shape matter inside the limit, and identifiers that differ at their start understate it.** The measurements above varied the identifiers in their first characters (1.2–1.7× slower at 1,022 characters than at 8). Identifiers that share a long prefix and differ only at the END (IRIs, padded keys, hashes), and dense graphs, are the ordinary hard case: workloads admitted at 98.5–100% of `maxWork`, three fresh processes per cell. n = 50 complete graph (2,450 edges): 0.7–0.9 s with 8-character ids, 0.9–1.0 s at 64, 1.3–1.5 s at 256, **4.0–5.0 s at 1,022 ASCII characters and 7.0–8.1 s at 1,022 CJK characters** (a 15.5 MB scene). n = 300, 600 edges: 1.2–1.3 s → 3.9–4.3 s ASCII, 6.4–7.7 s CJK. n = 2,000, 4,000 edges: 1.8–1.9 s → **7.0–7.5 s ASCII (12.8 MB) and 11.6–12.4 s CJK (37 MB)**. Both Node versions agree within about 10% inside one session, but **long-identifier times varied by about 2× between sessions on the same host** (short-identifier times did not; the cause was not established, and the host was busy with unrelated processes at the time): a later session measured the same cells at 6.0–8.4 s (n = 50 complete, ASCII), 12.3–16.2 s (n = 50 complete, CJK), 6.3–7.5 s and 11.7–13.4 s (n = 300), 11.8–13.5 s (n = 2,000, ASCII) and **23.0–25.5 s (n = 2,000, CJK, a 37 MB scene)**, and 26.5 s for the n = 50 complete CJK scene (7.6 MB). An independent audit measured 7.2–7.9 s (ASCII) and 11.2–15.0 s (CJK) for n = 50 complete graphs and **18.5 s for an n = 200 complete graph with 1,022-character CJK ids (a 119 MB scene, Node 24)**. So at the limit the identifier effect on this machine is about 4–10× in the first measurements and 7–21× in the later session; the limit removes a 6 s–311 s cliff, it does not make long identifiers cheap. Lowering the limit would shrink the effect (an independent audit measured about 1.3–1.5× at 102 units and 4–6× at 512), and an identifier term in `W` would model it; neither is part of IGL/1 rev 1.

The largest observed time anywhere in this evidence is 26.5 s (n = 50 complete graph with 1,022-character CJK ids, 7.6 MB); 18.5 s was observed for an n = 200 complete CJK scene (119 MB), and the first measurements reached 12.4 s. **That is an observation, not an upper bound**: the resource model bounds estimated computational work, and wall time varies with the host, the engine, the process's history and garbage-collection timing. **IGL/1 makes no latency promise for arbitrary identifiers.** Core is synchronous and cannot be cancelled, so an interactive host must run `igl-force/1` off its main thread. A host that accepts untrusted graphs should additionally lower `options.budget`, bound scene size and identifier length, and enforce a time limit (for example by running FORCE in a worker that it can terminate).

*Lookup-key length limit.* `W` has no identifier term, so cost that depends on identifier length is bounded by refusing long identifiers rather than by modelling them. `MAX_CORE_KEY_UNITS = 1024`, inclusive, in UTF-16 code units (how JavaScript holds the key; not code points, not UTF-8 bytes), applied to (a) every node's complete Core layout key `type + " " + label` (so a one-character id under a 1,023-character type counts) and (b) every relation identifier. These are the strings Core builds its Maps from: `${type} ${id}` for positions and displacements, `${ka}|${kb}` for the spring pairs (at most 2,049 units when each node key is at most 1,024), graph storage by type, id and relation, and edge keys (under about 3,100 units). Core's cliff was measured between 16,381 and 16,382 characters (the same 50-node scene: 0.26 s then 6.06 s at identical `W`); the limit sits 16× below it, so every derived key stays below it too. The cliff is attributed to V8 not hashing very long strings by content; that mechanism was not established here, and the limit does not depend on it. Excess raises `RESOURCE_LIMIT / CORE_KEY_LENGTH`. Order of checks: scene verified → numeric budget (`NODE_LIMIT`, `WORK_LIMIT`) → key length → Core representation preflight (§7.1, which converts digit-string ids to `BigInt`) → Core. The length is computed from the wire strings, so no decoding or conversion precedes it. The limit is a hard safety limit of this producer: it is **not** a budget field, `options.budget` cannot raise it (an unknown budget key is `INVALID_BUDGET`), and raising `maxNodes` or `maxWork` does not bypass it. It applies only to `igl-force/1` production and `verifyReproducible`. An identifier longer than 1,024 units remains valid in IGS/1, is laid out by `igl-fixed/1`, and passes `verifyLayout` and `bindLayout`.

*Behaviour.* `computeLayout`/`computeForceLayout`/`verifyReproducible` accept `options.budget` (`{ maxNodes?, maxWork? }`, positive safe integers, else `INVALID_POLICY / INVALID_BUDGET`). The check runs after the config is validated and the scene verified, before the key-length check and the preflight build anything: `nodeCount > maxNodes` → `RESOURCE_LIMIT / NODE_LIMIT`; `W > maxWork` (computed in `BigInt`) → `RESOURCE_LIMIT / WORK_LIMIT`. No partial layout. The budget is an execution control (Law 8): it is not in the artifact, `verifyLayout` never applies it, and raising it cannot change any output. A caller who needs more than the default must raise it knowingly; a future decision may cap that, with measurement.

### 7.4 Resource note

Verification and binding are linear in the artifact for ordinary identifiers. An `i:` token longer than 20 characters is refused by length before any `BigInt` conversion (a 16 MB `i:` token verifies in 16–20 ms). **Not linear for very long string identifiers:** for identifiers of 16,384 UTF-16 units or more, `verifyScene`, `computeFixedLayout` and `bindLayout` were measured quadratic in the node count (8.4 s to bind a 2,000-node, 63 MB scene). This is outside FORCE and is not changed in rev 1; hosts that accept untrusted scenes should bound scene size before verifying. The scene compiler converts a valid numeric-looking string id with `BigInt` (4,000,000 digits: 1.5 s on Node 24, 5.7–5.8 s on Node 22; a reference of that length is a second instance); also unchanged. Only FORCE production and `verifyReproducible` are budgeted.

## 8. Reference API

```ts
verifyLayout(bytes: Uint8Array): Promise<{ layout: Layout; layoutSha256: string }>;
bindLayout(sceneBytes: Uint8Array, layoutBytes: Uint8Array): Promise<BoundLayout>;
computeLayout(sceneBytes: Uint8Array, policy: Policy, options?: { budget?: Partial<ForceBudget> }): Promise<LayoutResult>;        // FORCE
computeForceLayout(sceneBytes: Uint8Array, config: ForceConfig, options?: { budget?: Partial<ForceBudget> }): Promise<LayoutResult>;
computeFixedLayout(sceneBytes: Uint8Array, positions: readonly FixedPosition[]): Promise<LayoutResult>;
verifyReproducible(sceneBytes: Uint8Array, layoutBytes: Uint8Array, options?: { budget?: Partial<ForceBudget> }): Promise<"reproduced" | "not-recomputable">;
```

`LayoutResult = { layout, layoutBytes, layoutSha256, sceneSha256 }`. Every function that accepts caller-owned bytes or objects snapshots them, and reads each caller-owned property once, before its first `await` (the same rule as the scene library). The package is `packages/layout-core`; its `computeLayout` is a different function from Core's of the same name and the package does not re-export Core's. It depends on `isongraph-visualize-scene-core` through its public API and an additive `primitives` subpath for canonicalization, ordering, hashing and snapshotting; it duplicates none of them. It depends on `ison-graph-ts` only for `igl-force/1`. No Ext import.

## 9. Structured errors (`LayoutError`, parallel to `IgsError`)

| Code | Reasons | When |
|---|---|---|
| `INVALID_LAYOUT` | `SCHEMA`, `NON_CANONICAL`, `UNKNOWN_FIELD`, `MISSING_FIELD`, `RESERVED_FIELD`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_ADDRESS_SCHEME`, `INVALID_HASH`, `INVALID_SCALE`, `INVALID_IDENTIFIER`, `INVALID_ID`, `DUPLICATE_NODE_REF`, `UNKNOWN_FAMILY`, `INVALID_ENCODING`, `INVALID_STRING`, `INVALID_NUMBER`, `INVALID_VALUE`, `TOO_DEEP`, `NOT_REPRODUCED` | structure of an artifact; a recomputation mismatch |
| `INVALID_COORDINATE` | `NOT_FINITE`, `NOT_INTEGER`, `OUT_OF_RANGE`, `NEGATIVE_ZERO` | an artifact coordinate, or a computed/supplied one at production (a supplied position that is not a number is also `NOT_FINITE`) |
| `INVALID_POLICY` | `ALGORITHM_FAMILY_MISMATCH`, `UNKNOWN_ALGORITHM`, `MISSING_KEY`, `UNKNOWN_KEY`, `INVALID_VALUE`, `MARGIN_TOO_LARGE`, `INPUT_REQUIRED`, `INVALID_BUDGET`, `UNREADABLE`, `SCHEMA` | policy of an artifact or request; the budget option |
| `UNSUPPORTED_FAMILY` | (no reason; the family name is in the detail) | named family without a qualified algorithm (verify or produce) |
| `UNSUPPORTED_SCENE` | `UNSAFE_NODE_ID`, `CORE_UNREPRESENTABLE_ID`, `AMBIGUOUS_ORDER_KEY`, `CORE_ID_TWIN`, `CORE_EDGE_LIMIT`, `CORE_REJECTED`, `CORE_RESULT_MISMATCH` | a valid IGS/1 scene that `igl-force/1` cannot lay out. `CORE_REJECTED` and `CORE_RESULT_MISMATCH` are defensive: no input the preflight accepts is known to reach them (they are exercised with mocks) |
| `RESOURCE_LIMIT` | `NODE_LIMIT`, `WORK_LIMIT`, `CORE_KEY_LENGTH` | FORCE budget or lookup-key length limit (§7.3) exceeded; no partial layout |
| `SCENE_MISMATCH` | — | `layout.scene_sha256` ≠ the hash derived from the scene bytes |
| `INCOMPLETE_LAYOUT` | `MISSING_NODE`, `UNKNOWN_NODE` | positions do not cover exactly the scene's nodes |
| `IgsError` / `HashUnavailableError` | (from scene-core) | invalid scene bytes; no WebCrypto SHA-256 |

### 9.1 Readings settled by the conformance corpus

Where the text above admits two readings, the frozen corpus fixes one, so a conforming implementation agrees on it: (a) `UNKNOWN_ALGORITHM` is an algorithm string registered for no family (vector V42); (b) a `policy.config` that is not an object is `INVALID_POLICY / SCHEMA`, because the policy stage of §6.1 validates `config` (V43), while a missing or extra key of `policy` itself is `INVALID_LAYOUT` (V29, V40); (c) a duplicate JSON key is read last-wins and the bytes then differ from the canonical re-serialization, so `NON_CANONICAL` (V44); (d) a string coordinate is `INVALID_LAYOUT / SCHEMA` (V05), and `1e999` is `NOT_FINITE` under binary64 parsing (V04); (e) when a layout both omits a scene node and names an unknown one, `MISSING_NODE` is reported first (B05, B06).

## 10. Conformance, evidence, vectors, and oracle independence

### 10.1 Evidence collected (Node 22.23.5 and 24.18.0 produce identical results; Python 3.12.7; the measurement scripts and raw outputs are not part of this repository)

| Measurement | Finding |
|---|---|
| Reuse of Core's layout | Core's own Python-parity fixture re-run on the published `ison-graph-ts` 1.4.1: bit-identical. Layouts are deterministic across repeated runs and independent of node insertion order. Degenerate inputs (NaN width gives `null` coordinates; collapsed inner area leaves nodes off the margin) |
| Core TS vs Core Python | 8 generated graphs (3–200 nodes, mixed string/integer ids, non-default options): bit-identical in all 8 |
| Node order and id collisions | Part 1: TS and unmodified Python **disagree** on node order for ids mixing ≥ U+10000 with U+E000–U+FFFF (2 of 5); with UTF-16 transcoding, 0 of 5. Part 2: preflight sound on 1,330 node sets (0 unsound, 0 conservative); Core's id-twin check is order-dependent |
| Quantization cross-check | §4: 0 disagreements TS vs Python on 200,015 doubles |
| Budget cost model | §7.3 cost model and the largest measured workload; per-iteration cost at small n (the simpler formula undercounts at 8 of 12 points, the final one covers all 12) |
| Core edge-list limit | Core's `graph.edges()` overflows the stack at 124,860 (Node 24) / 125,191 (Node 22) physical edges in one relation |
| Wall time of budget-sized workloads | fresh and long-lived processes; identifiers of 8–1,022 characters differing at the start or at the end; ASCII and CJK; sparse and dense graphs (§7.3) |
| Independent audits | two independent audits of the implementation and corpus: oracle reconstruction with separate code, every negative row judged against this contract before the implementation was run, regeneration, a decoder differential over 3,000,096 tokens, and fuzzing of the verifier with 90,000 mutants; all findings were fixed or are recorded in §7.3, §7.4 and §12 |

Not measured: graphs above 2,000 nodes; non-V8 engines; non-Windows hosts; the `radii` pass; memory beyond one process snapshot (heap 21–25 MB after the largest run).

### 10.2 Vectors

File-based vectors live in [`fixtures/oracles-igl/`](../../fixtures/oracles-igl/) with expectations in `EXPECT.tsv` (**92 rows**) and checksums in `SHA256SUMS`; inline cases are unit tests of `packages/layout-core`. Expected layout bytes come from the Python generator only (§10.3).

| Group | File rows | Inline tests | Content |
|---|---|---|---|
| L-FORCE | 13 (`F01`–`F13`), positive | `core-parity` | `F01` O1 defaults · `F02` O4 undirected · `F03` Core's 5-node parity graph · `F04` 20-node mixed-id graph · `F05` same, seed 7 · `F06` non-default width/height/iterations/margin · `F07` empty scene · `F08` single node (centred) · `F09` **Unicode order** scene (U+FF5E, U+1F600, U+E000, U+10000 in one type) · `F10` `iterations: 0` · `F11`/`F12` the two bind scenes · `F13` one node key exactly at the 1,024-unit limit in each class (1,022 ASCII characters, 511 astral characters, 1,022 three-byte characters, a 1,022-character type, an INT64 label under a 1,006-character type) plus a 1,024-character relation; the remaining nodes and the second relation are short |
| L-FIXED | 5 (`X01`–`X05`), positive | 12 | `X01` mixed positions incl. negative and fractional · `X02` exact `.0005` ties and `-0` · `X03` empty scene · `X04` 4503599627370.497 (frozen quantizer vs the shortcut `floor(s + 0.5)`) · `X05` a valid scene with a 5,000-character id (FIXED supports it, FORCE refuses it); inline: NaN, Infinity, 9,007,199,254,740.992 (`OUT_OF_RANGE`), missing/unknown/duplicate refs, malformed containers, read-once getter, mutation during the call |
| L-VERIFY | 46 (`V01`–`V46`): 42 rejected, 4 accepted | 48 | one file per rule of §6.1, mutated from `F01`: float / `-0` / out-of-range / non-finite / string coordinate; unsorted; duplicate refs; unknown, reserved and `layout_sha256` keys; missing field; wrong `igl`, `address_scheme`, `scale`; bad hash shape; whitespace; BOM; invalid UTF-8; lone surrogate; `x-` nesting 65 (rejected) and 64 (**accepted**); `x-` bad name; float `x-` (rejected) and negative `x-` integer (**accepted**); bad id; bad type; not JSON; policy defects (missing family, unknown family, unqualified family, algorithm/family mismatch, extra/missing config key, seed 2^32, `width ≤ 2·margin`, `x-` key in config or policy); `null` seed (outside the canonical domain, so `INVALID_LAYOUT/INVALID_VALUE` before any policy check); verification order (non-canonical **and** bad policy → `NON_CANONICAL`); `V41` a policy value nested 2,000 levels (`TOO_DEEP` on every host) · `V42` unknown algorithm `igl-force/2` (`UNKNOWN_ALGORITHM`) · `V43` `policy.config` not an object (`INVALID_POLICY/SCHEMA`) · `V44` a duplicate JSON key (`NON_CANONICAL`) · `V45`/`V46` the coordinate range boundaries ±(2^53−1) (**accepted**) |
| L-BIND | 8 (`B01`–`B08`) | 8 | **`B01` same node set, different edges: the layout of scene B against scene A's bytes → `SCENE_MISMATCH`** (the forged-hash scenario; no hash parameter exists, asserted by `bindLayout.length === 2`) · `B02` good pair · `B03` missing node · `B04` extra node · `B05` right id under a different type · `B06` `i:7` scene with an `s:7` layout · `B07` non-canonical scene bytes (the scene library's `IgsError` propagates) · `B08` a long valid identifier binds (the key limit is a FORCE execution control, not a validity rule) |
| L-SCENE | 20 (`S01`–`S20`) | 26 (preflight, incl. the edge cap) + 25 (force) + 12 (key length) + 3 (edge cap end to end, generated) | refusals, each also proven not to reach Core: `i:7`+`s:7` · `i:7`+`s:007` · `i:0`+`s:-0` · `i:-7`+`s:-007` · `i:9007199254740993` · INT64 min · `s:"a b"` · `s:"a:b"` · `s:""`; controls that **must lay out**: `s:7`(type p)+`s:7`(type q) · `s:007`+`s:7` · `s:-0`+`s:0` · the Unicode pair; `S14`–`S18` the key limit (`RESOURCE_LIMIT/CORE_KEY_LENGTH`: key 1,025, long type, 512 astral characters = 1,026 units, a 1,025-character relation, a 5,000-digit numeric-looking string id); `S19`/`S20` `|` and a tab in an id (`CORE_UNREPRESENTABLE_ID`). Scenes are written by the independent generator and every one must be accepted by `verifyScene` |
| L-POLICY | — | 54 | `NaN`/`Infinity`/negative/fraction/string/null/undefined/boolean in each of five keys; margin rule; seed bounds; missing/extra key incl. `x-`; each unqualified family; algorithm mismatch; wrong-case family; throwing getter, revoked Proxy, `toJSON`/`Number` impostors, read-once getter |
| L-BUDGET | — | 14 (budget) + the budget cases in force and compute | node limit; work limit without invoking Core (spy); exactly-at-limit accepted and one-below refused; invalid budget values; the default admits 1,000 nodes at Core's default iterations and refuses 1,100; no overflow at 2^31 iterations; the budget never changes the output |

### 10.3 Oracle independence — stated honestly

Layout expectations are produced by **Python only**: Core Python `compute_layout` (with UTF-16 transcoding of ids), a Python implementation of §4 quantization, a Python canonical writer, and `hashlib`. No TypeScript produces an expected byte. Scene bytes for the compiled sources come from the IGS/1 reference compiler (whose own oracles are independently frozen); hand-written scenes are written by the Python generator and accepted by `verifyScene`. The shared assumption is Core's algorithm itself, which is what is being reused, and the §4/§5 rules, which two implementations (TS, Python) agree on. A TS/Python mismatch is a finding to explain; expected files are never regenerated to make the TypeScript pass.

## 11. Versioning

Consumers reject an unknown `igl` major. Without creating `IGL/2`, exactly three things may change an artifact: additive `x-` keys; a qualified extension activating the reserved names of §2 under the containment rule; a new algorithm id or version (`igl-force/2`) registered for a family. `IGL/2` is required for: a change of `scale`; any change to the meaning, default, ordering or serialization of an IGL/1 field; a new non-reserved, non-`x-` top-level field; a change of address scheme.

## 12. Status and known limitations

IGL/1 rev 1 is frozen, and its 92-row oracle corpus is frozen ([`fixtures/oracles-igl/`](../../fixtures/oracles-igl/)). Open items, none a contradiction of this contract:

1. The budget and the 50,000-edge cap were measured on one machine class (Windows 11 x64, Node 22 and 24, Chromium for the browser build). Nothing above 2,000 nodes was measured. **FORCE wall time is not bounded** (§7.3), and no latency promise is made for arbitrary identifiers.
2. The Core TypeScript / Python node-order divergence for ids mixing ≥ U+10000 with U+E000–U+FFFF is reported upstream as `ISON-format/isongraph#6` and is handled in the reference vectors by the UTF-16 transcoding of §7.1. A second, narrower difference (spring order when one type name is a prefix of another followed by a control character) is not covered by that transcoding and affects no vector.
3. FORCE is synchronous and can block the calling thread for seconds at the budget limit and longer for long identifiers (§7.3): an interactive renderer should run it off the main thread.
4. A caller-supplied `options` or `positions` object whose getter throws can still surface the caller's own error, instead of a `LayoutError`.

## 13. Relationship to other contracts

Renderers receive `(sceneBytes, layoutBytes)`, call `bindLayout`, and read positions as `x / scale`, `y / scale`. A future stable or incremental layout (STABLE) adds the reserved `stability` input and a modifier algorithm; it must not change an IGL/1 byte. Scene groups (an IGS/1 extension) are what COMPOUND will need; nothing here depends on them.
