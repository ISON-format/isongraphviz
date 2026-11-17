import { describe, expect, it } from "vitest";
import { layoutToBytes } from "../src/serialize.js";
import { verifyLayout } from "../src/verify.js";
import { ACCEPT, REJECT, T, nest, nodes, obj } from "./verify-cases.js";
import { baseLayout, enc, layoutError } from "./helpers.js";


describe("verifyLayout rejects (one test per rule; the same rows are frozen as oracles-igl/verify/V*.layout.json)", () => {
  for (const [name, input, expected] of REJECT) {
    it(name, async () => {
      const bytes = typeof input === "string" ? enc(input) : input;
      expect(await layoutError(() => verifyLayout(bytes))).toBe(expected);
    });
  }
});

describe("review finding I-1: policy VALUES are domain- and depth-checked before any recursion", () => {
  const deep = (d: number) => "[".repeat(d) + "]".repeat(d);
  const withFamily = (d: number) => enc(T.replace('"family":"FORCE"', '"family":' + deep(d)));
  it("a policy value nested 65 levels or more is INVALID_LAYOUT/TOO_DEEP at EVERY depth - never a host-dependent raw RangeError", async () => {
    for (const d of [65, 100, 1800, 2000, 20_000]) {
      expect(await layoutError(() => verifyLayout(withFamily(d))), `depth ${d}`).toBe("INVALID_LAYOUT/TOO_DEEP");
    }
  });
  it("the bound is 64 levels counted from the policy object: 63 arrays inside family pass the depth check (then an unknown family), 64 do not", async () => {
    expect(await layoutError(() => verifyLayout(withFamily(63)))).toBe("INVALID_LAYOUT/UNKNOWN_FAMILY");
    expect(await layoutError(() => verifyLayout(withFamily(64)))).toBe("INVALID_LAYOUT/TOO_DEEP");
  });
  it("the same holds for values inside policy.config", async () => {
    const t = T.replace('"seed":42', '"seed":' + deep(2000));
    expect(await layoutError(() => verifyLayout(enc(t)))).toBe("INVALID_LAYOUT/TOO_DEEP");
  });
  it("and it propagates unchanged through bindLayout and verifyReproducible", async () => {
    const { bindLayout } = await import("../src/bind.js");
    const { verifyReproducible } = await import("../src/compute.js");
    const { o1Scene } = await import("./helpers.js");
    const o1 = await o1Scene();
    expect(await layoutError(() => bindLayout(o1.sceneBytes, withFamily(2000)))).toBe("INVALID_LAYOUT/TOO_DEEP");
    expect(await layoutError(() => verifyReproducible(o1.sceneBytes, withFamily(2000)))).toBe("INVALID_LAYOUT/TOO_DEEP");
  });
});

describe("verifyLayout accepts", () => {
  it("the base layout, returning the parsed layout and the digest of the exact bytes", async () => {
    const r = await verifyLayout(enc(T));
    expect(r.layout.nodes).toHaveLength(2);
    expect(r.layoutSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("V21 x- nesting of exactly 64 levels, and V24 a negative x- integer", async () => {
    await expect(verifyLayout(enc(obj((o) => { nodes(o)[0]!["x-d"] = nest(63); })))).resolves.toBeDefined();
    await expect(verifyLayout(enc(obj((o) => { nodes(o)[0]!["x-n"] = -5; })))).resolves.toBeDefined();
  });
  it("an empty layout (zero nodes)", async () => {
    const l = baseLayout(); l.nodes = [];
    await expect(verifyLayout(layoutToBytes(l))).resolves.toBeDefined(); // layoutToBytes: JSON.stringify would not give canonical key order
  });
  it("snapshots its bytes before the first await (regression guard: nothing yields before the digest, which snapshots again)", async () => {
    const bytes = enc(T);
    const p = verifyLayout(bytes);
    bytes.fill(0);
    await expect(p).resolves.toBeDefined();
  });
  it("rejects a non-Uint8Array with TypeError", async () => {
    await expect(verifyLayout("x" as never)).rejects.toBeInstanceOf(TypeError);
  });
});
