// test/keylength.test.ts - the hard FORCE lookup-key length limit (docs/specs/IGL-1.md §7.3).
// Core keys its Maps by `${type} ${id}`; an independent audit measured n=50 / 16,381-char ids at 0.26 s and the SAME scene with 16,382-char ids at 6 s,
// both at 0.32% of the work budget. `W` has no identifier term, so the producer refuses long keys outright, before any conversion or Core call.
import { verifyScene } from "isongraph-visualize-scene-core";
import { canonicalBytes, compareNodeRef, compareUtf8, nodeRefFromWire } from "isongraph-visualize-scene-core/primitives";
import type { CJValue } from "isongraph-visualize-scene-core/primitives";
import { ISONGraph } from "ison-graph-ts";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ison-graph-ts/viz", async (importOriginal) => {
  const real = await importOriginal<typeof import("ison-graph-ts/viz")>();
  return { ...real, computeLayout: vi.fn(real.computeLayout) };
});
import { computeLayout as coreSpy } from "ison-graph-ts/viz";
import { bindLayout } from "../src/bind.js";
import { computeLayout, verifyReproducible } from "../src/compute.js";
import { computeFixedLayout } from "../src/fixed.js";
import { MAX_CORE_KEY_UNITS, computeForceLayout } from "../src/force.js";
import { layoutToBytes } from "../src/serialize.js";
import { verifyLayout } from "../src/verify.js";
import { CORE_CFG, layoutError } from "./helpers.js";

type Edge = [string, string, string, string, string];
/** A canonical IGS/1 scene: nodes in NodeRef/2 order, edges ordered by (src, rel, tgt), canonical bytes. */
const handScene = (nodes: Array<[string, string]>, edges: Edge[] = []) => {
  const ref = (type: string, id: string) => nodeRefFromWire({ type, id });
  const ns = nodes.map(([type, id]) => ({ category: type, label: id.slice(2), ref: { id, type } })).sort((a, b) => compareNodeRef(ref(a.ref.type, a.ref.id), ref(b.ref.type, b.ref.id)));
  const es = edges.map(([rel, st, si, tt, ti]) => ({ label: rel, ref: { ord: "0", rel, src: { id: si, type: st }, tgt: { id: ti, type: tt } } }))
    .sort((a, b) => compareNodeRef(ref(a.ref.src.type, a.ref.src.id), ref(b.ref.src.type, b.ref.src.id)) || compareUtf8(a.ref.rel, b.ref.rel) || compareNodeRef(ref(a.ref.tgt.type, a.ref.tgt.id), ref(b.ref.tgt.type, b.ref.tgt.id)));
  return canonicalBytes({
    address_scheme: "igs-addr/1", edges: es, graph: { directed: true, profile: "simple" }, igs: "IGS/1", nodes: ns,
    source: { artifact_sha256: "0".repeat(64), serialization_profile: "ison-v1" },
  } as unknown as CJValue);
};
const FAST = { ...CORE_CFG, iterations: 3 };
const LIMIT = "RESOURCE_LIMIT/CORE_KEY_LENGTH";
const SHORT: [string, string] = ["t", "s:b"];

afterEach(() => { vi.mocked(coreSpy).mockClear(); vi.restoreAllMocks(); });

/** A refusal must never have reached Core: no graph node was added and Core's computeLayout was not called. */
async function refused(scene: Uint8Array, cfg = FAST, options?: Parameters<typeof computeForceLayout>[2]): Promise<string> {
  vi.mocked(coreSpy).mockClear(); // earlier accepted calls in the same test legitimately reached Core
  const add = vi.spyOn(ISONGraph.prototype, "addNode");
  add.mockClear();
  const v = await layoutError(() => computeForceLayout(scene, cfg, options));
  expect(add, "no Core graph was built").not.toHaveBeenCalled();
  expect(vi.mocked(coreSpy), "Core was not called").not.toHaveBeenCalled();
  return v;
}

describe("the Core lookup-key length limit (type + one space + label, UTF-16 code units, inclusive)", () => {
  it("is 1,024 units", () => expect(MAX_CORE_KEY_UNITS).toBe(1024));

  it("a node key of exactly 1,024 units is accepted; 1,025 is RESOURCE_LIMIT/CORE_KEY_LENGTH", async () => {
    await expect(computeForceLayout(handScene([["t", "s:" + "a".repeat(1022)], SHORT]), FAST)).resolves.toBeDefined(); // 1 + 1 + 1022
    expect(await refused(handScene([["t", "s:" + "a".repeat(1023)], SHORT]))).toBe(LIMIT);
  });

  it("the key is the COMPLETE reconstructed key: a long type with a one-character id counts", async () => {
    await expect(computeForceLayout(handScene([["t".repeat(1022), "s:a"], SHORT]), FAST)).resolves.toBeDefined(); // 1022 + 1 + 1
    expect(await refused(handScene([["t".repeat(1023), "s:a"], SHORT]))).toBe(LIMIT); // short id, key 1025
  });

  it("an INT64 id counts by its decimal label", async () => {
    // label "-9007199254740991" is 17 units: 1006 + 1 + 17 = 1024 accepted, 1007 + 1 + 17 = 1025 refused
    await expect(computeForceLayout(handScene([["t".repeat(1006), "i:-9007199254740991"], SHORT]), FAST)).resolves.toBeDefined();
    expect(await refused(handScene([["t".repeat(1007), "i:-9007199254740991"], SHORT]))).toBe(LIMIT);
  });

  it("is measured in UTF-16 code units: not code points, not UTF-8 bytes", async () => {
    const astral = "\u{1F600}"; // 1 code point, 2 code units, 4 UTF-8 bytes
    await expect(computeForceLayout(handScene([["t", "s:" + astral.repeat(511)], SHORT]), FAST)).resolves.toBeDefined(); // 1 + 1 + 1022 = 1024 units
    expect(await refused(handScene([["t", "s:" + astral.repeat(512)], SHORT]))).toBe(LIMIT); // 512 code points but 1026 units
    expect(await refused(handScene([["t", "s:" + astral.repeat(600)], SHORT]))).toBe(LIMIT); // 600 code points < 1,024, 1,200 units
    const euro = "€"; // 1 unit, 3 UTF-8 bytes
    await expect(computeForceLayout(handScene([["t", "s:" + euro.repeat(1022)], SHORT]), FAST)).resolves.toBeDefined(); // 3,066 bytes, 1,024 units
    expect(await refused(handScene([["t", "s:" + euro.repeat(1023)], SHORT]))).toBe(LIMIT);
  });

  it("a relation identifier is limited the same way (1,024 accepted, 1,025 refused before Core is built)", async () => {
    const edge = (rel: string): Edge => [rel, "t", "s:a", "t", "s:b"];
    await expect(computeForceLayout(handScene([["t", "s:a"], SHORT], [edge("r".repeat(1024))]), FAST)).resolves.toBeDefined();
    expect(await refused(handScene([["t", "s:a"], SHORT], [edge("r".repeat(1025))]))).toBe(LIMIT);
  });

  it("a relation identifier is measured in UTF-16 code units too (512 astral characters are 1,024 units, 513 are 1,026)", async () => {
    const edge = (rel: string): Edge => [rel, "t", "s:a", "t", "s:b"];
    const astral = "\u{1F600}";
    await expect(computeForceLayout(handScene([["t", "s:a"], SHORT], [edge(astral.repeat(512))]), FAST)).resolves.toBeDefined();
    expect(await refused(handScene([["t", "s:a"], SHORT], [edge(astral.repeat(513))]))).toBe(LIMIT); // 513 code points, 1,026 units
  });

  it("an extremely long numeric-looking string id is refused BEFORE any expensive BigInt conversion", async () => {
    const realBigInt = globalThis.BigInt;
    let longConversions = 0;
    globalThis.BigInt = new Proxy(realBigInt, {
      apply(target, thisArg, args: unknown[]) {
        if (typeof args[0] === "string" && args[0].length > 100) longConversions++;
        return Reflect.apply(target, thisArg, args);
      },
    });
    try {
      expect(await refused(handScene([["t", "s:" + "7".repeat(2_000_000)], SHORT]))).toBe(LIMIT);
    } finally { globalThis.BigInt = realBigInt; }
    expect(longConversions).toBe(0);
  });

  it("the 50-node long-identifier workload (50 nodes, 49 edges, 16,382-char ids) is refused, and Core is never reached", async () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ["t", "s:" + String(i).padStart(2, "0") + "x".repeat(16_380)] as [string, string]);
    const edges = nodes.slice(1).map((n, i): Edge => ["r", "t", nodes[i]![1], "t", n[1]]);
    // an independent audit measured 6,061 ms of Core time for this scene; `refused` proves no graph was built and Core was not called (no wall-clock assertion: it would be host-dependent)
    expect(await refused(handScene(nodes, edges), { ...CORE_CFG, iterations: 170 })).toBe(LIMIT);
  });

  it("a raised budget cannot bypass the limit, and the limit is not a budget field", async () => {
    const long = handScene([["t", "s:" + "a".repeat(1023)], SHORT]);
    expect(await refused(long, FAST, { budget: { maxNodes: 1_000_000, maxWork: Number.MAX_SAFE_INTEGER } })).toBe(LIMIT);
    for (const key of ["maxCoreKeyUnits", "maxKeyUnits", "maxIdLength"]) {
      expect(await layoutError(() => computeForceLayout(long, FAST, { budget: { [key]: 1_000_000 } } as never)), key).toBe("INVALID_POLICY/INVALID_BUDGET");
    }
  });

  it("precedence is pinned: the numeric budget is checked first, then the key limit, then the Core representation checks", async () => {
    const longWithSpace = handScene([["t", "s:" + "a".repeat(1100) + " b"], SHORT]); // also CORE_UNREPRESENTABLE_ID (a space) if it got that far
    expect(await refused(longWithSpace)).toBe(LIMIT);
    expect(await refused(longWithSpace, FAST, { budget: { maxNodes: 1 } })).toBe("RESOURCE_LIMIT/NODE_LIMIT");
  });

  it("applies to FORCE reproducibility checks and to the generic computeLayout as well", async () => {
    const scene = handScene([["t", "s:" + "a".repeat(1023)], SHORT]);
    const { sceneSha256 } = await verifyScene(scene);
    const force = layoutToBytes({
      address_scheme: "igs-addr/1", igl: "IGL/1", scale: 1000, scene_sha256: sceneSha256,
      policy: { family: "FORCE", algorithm: "igl-force/1", config: { ...FAST } },
      nodes: [{ ref: { id: "s:" + "a".repeat(1023), type: "t" }, x: 0, y: 0 }, { ref: { id: "s:b", type: "t" }, x: 0, y: 0 }],
    });
    await expect(bindLayout(scene, force)).resolves.toBeDefined(); // valid and bound: the limit is an execution control, not a validity rule
    expect(await layoutError(() => verifyReproducible(scene, force))).toBe(LIMIT);
    expect(await layoutError(() => computeLayout(scene, { family: "FORCE", algorithm: "igl-force/1", config: FAST }))).toBe(LIMIT);
    expect(vi.mocked(coreSpy)).not.toHaveBeenCalled();
  });

  it("FIXED, binding and standalone verification still support the same long identifiers (IGS/1 identity is unchanged)", async () => {
    const longId = "s:" + "9".repeat(5000); // a valid IGS/1 string id, numeric-looking, far above the FORCE limit
    const scene = handScene([["t".repeat(2000), longId], SHORT]);
    const refs = [{ id: "s:b", type: "t" }, { id: longId, type: "t".repeat(2000) }]; // NodeRef/2 order: type "t" before the long type
    const out = await computeFixedLayout(scene, refs.map((ref, i) => ({ ref, x: i, y: -i })));
    await expect(verifyLayout(out.layoutBytes)).resolves.toBeDefined();
    await expect(bindLayout(scene, out.layoutBytes)).resolves.toBeDefined();
    await expect(verifyReproducible(scene, out.layoutBytes)).resolves.toBe("not-recomputable");
    expect(out.layout.nodes.map((n) => n.ref.id)).toEqual(["s:b", longId]);
  });
});
