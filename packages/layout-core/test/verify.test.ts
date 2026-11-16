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
