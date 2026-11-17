import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LayoutError } from "../src/errors.js";
import { layoutSha256, layoutToBytes } from "../src/serialize.js";
import type { Layout } from "../src/types.js";

const SCENE = "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc";
const o1 = (): Layout => ({
  address_scheme: "igs-addr/1", igl: "IGL/1", scale: 1000, scene_sha256: SCENE,
  policy: { family: "FORCE", algorithm: "igl-force/1", config: { width: 900, height: 600, iterations: 170, margin: 60, seed: 42 } },
  nodes: [{ ref: { id: "s:ann", type: "person" }, x: 593147, y: 187923 }, { ref: { id: "i:1", type: "person" }, x: 173961, y: 81203 }], // deliberately unsorted
});
const EXAMPLE = '{"address_scheme":"igs-addr/1","igl":"IGL/1","nodes":[{"ref":{"id":"i:1","type":"person"},"x":173961,"y":81203},{"ref":{"id":"s:ann","type":"person"},"x":593147,"y":187923}],"policy":{"algorithm":"igl-force/1","config":{"height":600,"iterations":170,"margin":60,"seed":42,"width":900},"family":"FORCE"},"scale":1000,"scene_sha256":"' + SCENE + '"}';
const text = (l: Layout) => new TextDecoder().decode(layoutToBytes(l));
const code = (f: () => unknown) => { try { f(); } catch (e) { if (e instanceof LayoutError) return `${e.code}/${e.reason}`; throw e; } return "no error"; };

describe("layoutToBytes", () => {
  it("reproduces the 398-byte example of docs/specs/IGL-1.md §2, sorting nodes", async () => {
    const bytes = layoutToBytes(o1());
    expect(new TextDecoder().decode(bytes)).toBe(EXAMPLE);
    expect(bytes.length).toBe(398);
    expect(await layoutSha256(bytes)).toBe(createHash("sha256").update(EXAMPLE).digest("hex"));
    expect(await layoutSha256(bytes)).toBe("2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db");
  });
  it("sorts nodes in NodeRef/2 order: type by UTF-8, INT64 before STRING, numeric ints, string ids by UTF-8 bytes", () => {
    const l = o1();
    l.nodes = ["s:a", "i:10", "s:B", "i:9", "i:2", "i:1", "i:-3"].map((id) => ({ ref: { id, type: "p" }, x: 0, y: 0 }));
    l.nodes.push({ ref: { id: "i:0", type: "a" }, x: 0, y: 0 });
    expect(JSON.parse(text(l)).nodes.map((n: { ref: { type: string; id: string } }) => `${n.ref.type}:${n.ref.id}`)).toEqual(["a:i:0", "p:i:-3", "p:i:1", "p:i:2", "p:i:9", "p:i:10", "p:s:B", "p:s:a"]);
  });
  it("sorts by UTF-8 bytes, not UTF-16: U+FF5E sorts before U+1F600", () => {
    const l = o1();
    l.nodes = ["s:\u{1F600}", "s:\uFF5E"].map((id) => ({ ref: { id, type: "p" }, x: 0, y: 0 }));
    expect(JSON.parse(text(l)).nodes.map((n: { ref: { id: string } }) => n.ref.id)).toEqual(["s:\uFF5E", "s:\u{1F600}"]);
  });
  it("serializes negative coordinates as plain decimals and zero as 0", () => {
    const l = o1(); l.nodes = [{ ref: { id: "i:1", type: "p" }, x: -5, y: 0 }];
    expect(text(l)).toContain('"x":-5,"y":0');
  });
  it("rejects a float coordinate and -0 (INVALID_COORDINATE)", () => {
    const l = o1(); l.nodes[0]!.x = 1.5;
    expect(code(() => layoutToBytes(l))).toBe("INVALID_COORDINATE/NOT_INTEGER");
    const z = o1(); z.nodes[0]!.y = -0;
    expect(code(() => layoutToBytes(z))).toBe("INVALID_COORDINATE/NEGATIVE_ZERO");
  });
  it("rejects a layout that already holds layout_sha256, and a lone surrogate in an id", () => {
    const l = { ...o1(), layout_sha256: "x" } as unknown as Layout;
    expect(code(() => layoutToBytes(l))).toBe("INVALID_LAYOUT/RESERVED_FIELD");
    const s = o1(); s.nodes[0]!.ref.id = "s:\ud800";
    expect(code(() => layoutToBytes(s))).toBe("INVALID_LAYOUT/INVALID_STRING");
  });
  it("the bytes do not depend on the input array order or on key insertion order", () => {
    const a = o1(); const b = o1(); b.nodes.reverse();
    const c = { nodes: a.nodes, scene_sha256: a.scene_sha256, scale: a.scale, policy: a.policy, igl: a.igl, address_scheme: a.address_scheme } as Layout;
    expect(text(a)).toBe(text(b)); expect(text(a)).toBe(text(c));
  });
  it("does not mutate its input (node order stays as given)", () => {
    const l = o1(); layoutToBytes(l);
    expect(l.nodes[0]!.ref.id).toBe("s:ann");
  });
});

describe("layoutSha256", () => {
  it("digests the bytes it was given, snapshotted before the first await (mutation-during-call)", async () => {
    const bytes = layoutToBytes(o1());
    const expected = createHash("sha256").update(bytes).digest("hex");
    const p = layoutSha256(bytes);
    bytes.fill(0); // the caller mutates while the digest is pending
    expect(await p).toBe(expected);
  });
  it("rejects non-Uint8Array input", async () => {
    await expect(layoutSha256("text" as never)).rejects.toBeInstanceOf(TypeError);
  });
});
