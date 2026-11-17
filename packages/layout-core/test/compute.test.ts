import { describe, expect, it } from "vitest";
import { computeFixedLayout } from "../src/fixed.js";
import { computeLayout, verifyReproducible } from "../src/compute.js";
import { layoutToBytes } from "../src/serialize.js";
import { verifyLayout } from "../src/verify.js";
import { CORE_CFG, enc, layoutError, o1Scene } from "./helpers.js";

const forcePolicy = { family: "FORCE", algorithm: "igl-force/1", config: { ...CORE_CFG } } as never;
describe("computeLayout (generic entry)", () => {
  it("produces the same bytes as computeForceLayout for a FORCE policy", async () => {
    const o1 = await o1Scene();
    expect((await computeLayout(o1.sceneBytes, forcePolicy)).layoutSha256).toBe("2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db");
  });
  it("FIXED through the generic API is INPUT_REQUIRED, not a guess", async () => {
    const o1 = await o1Scene();
    expect(await layoutError(() => computeLayout(o1.sceneBytes, { family: "FIXED", algorithm: "igl-fixed/1", config: {} } as never))).toBe("INVALID_POLICY/INPUT_REQUIRED");
  });
  it("every unqualified family is UNSUPPORTED_FAMILY, never a FORCE fallback", async () => {
    const o1 = await o1Scene();
    for (const family of ["HIERARCHICAL", "RADIAL", "COMPOUND", "STABLE"]) {
      expect(await layoutError(() => computeLayout(o1.sceneBytes, { family, algorithm: "x/1", config: {} } as never)), family).toBe("UNSUPPORTED_FAMILY/");
    }
  });
  it("an invalid policy is INVALID_POLICY", async () => {
    const o1 = await o1Scene();
    expect((await layoutError(() => computeLayout(o1.sceneBytes, { ...(forcePolicy as object), config: { ...CORE_CFG, seed: -1 } } as never))).startsWith("INVALID_POLICY/")).toBe(true);
  });
  it("OWNERSHIP (discriminating): mutating the policy after the call starts changes nothing", async () => {
    const o1 = await o1Scene();
    const p = { family: "FORCE", algorithm: "igl-force/1", config: { ...CORE_CFG } };
    const pending = computeLayout(o1.sceneBytes, p as never); p.config.seed = 1;
    expect((await pending).layoutSha256).toBe("2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db");
  });
});

describe("verifyReproducible (docs/specs/IGL-1.md §6.3): conformance of the coordinates is NOT implied by a valid artifact", () => {
  it("a genuine FORCE layout is reproduced", async () => {
    const o1 = await o1Scene(); const r = await computeLayout(o1.sceneBytes, forcePolicy);
    await expect(verifyReproducible(o1.sceneBytes, r.layoutBytes)).resolves.toBe("reproduced");
  });
  it("a well-formed, bound layout that CLAIMS igl-force/1 but holds chosen numbers verifies and binds, and is NOT reproduced", async () => {
    const o1 = await o1Scene(); const r = await computeLayout(o1.sceneBytes, forcePolicy);
    const forged = { ...r.layout, nodes: r.layout.nodes.map((n) => ({ ...n, x: n.x + 1 })) };
    const bytes = layoutToBytes(forged);
    await expect(verifyLayout(bytes)).resolves.toBeDefined();
    expect(await layoutError(() => verifyReproducible(o1.sceneBytes, bytes))).toBe("INVALID_LAYOUT/NOT_REPRODUCED");
  });
  it("an artifact with an x- key is a valid exchanged layout but is not reproduced", async () => {
    const o1 = await o1Scene(); const r = await computeLayout(o1.sceneBytes, forcePolicy);
    const bytes = layoutToBytes({ ...r.layout, "x-note": "hand-edited" });
    await expect(verifyLayout(bytes)).resolves.toBeDefined();
    expect(await layoutError(() => verifyReproducible(o1.sceneBytes, bytes))).toBe("INVALID_LAYOUT/NOT_REPRODUCED");
  });
  it("FIXED is reported as not-recomputable", async () => {
    const o1 = await o1Scene();
    const f = await computeFixedLayout(o1.sceneBytes, [{ ref: { id: "i:1", type: "person" }, x: 1, y: 2 }, { ref: { id: "s:ann", type: "person" }, x: 3, y: 4 }]);
    await expect(verifyReproducible(o1.sceneBytes, f.layoutBytes)).resolves.toBe("not-recomputable");
  });
  it("OWNERSHIP (discriminating): layout bytes mutated after the call starts do not change the verdict", async () => {
    const o1 = await o1Scene(); const r = await computeLayout(o1.sceneBytes, forcePolicy);
    const copy = new Uint8Array(r.layoutBytes);
    const pending = verifyReproducible(o1.sceneBytes, copy); copy.fill(0);
    await expect(pending).resolves.toBe("reproduced");
  });
  it("the budget option is read once, synchronously", async () => {
    const o1 = await o1Scene(); const r = await computeLayout(o1.sceneBytes, forcePolicy);
    let reads = 0;
    const options = { get budget() { reads++; return { maxNodes: 100 }; } };
    await verifyReproducible(o1.sceneBytes, r.layoutBytes, options as never);
    expect(reads).toBe(1);
  });
  it("applies the budget, and an unbound pair fails as bindLayout would", async () => {
    const o1 = await o1Scene(); const r = await computeLayout(o1.sceneBytes, forcePolicy);
    expect(await layoutError(() => verifyReproducible(o1.sceneBytes, r.layoutBytes, { budget: { maxNodes: 1 } }))).toBe("RESOURCE_LIMIT/NODE_LIMIT");
    expect(await layoutError(() => verifyReproducible(o1.sceneBytes, enc("{")))).toBe("INVALID_LAYOUT/SCHEMA");
  });
});
