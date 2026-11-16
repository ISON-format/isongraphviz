// packages/scene-core/test/verify.test.ts
import { describe, expect, it } from "vitest";
import { assembleScene, sceneToBytes } from "../src/assemble.js";
import { canonicalBytes, type CJValue } from "../src/canonical.js";
import { sha256Hex } from "../src/hash.js";
import { edgeFromWire, nodeRefFromWire } from "../src/identity.js";
import { compareEdgeAddress, compareNodeRef } from "../src/order.js";
import type { NodeRef, SceneModel } from "../src/types.js";
import { verifyScene } from "../src/verify.js";
import { bytesOf, igsErrorAsync, textOf } from "./helpers.js";

type Obj = Record<string, any>;
const load = (name: string): Obj => JSON.parse(textOf(name));
/** Sorts arrays exactly as the spec requires, so a negative test isolates ONE defect. Only for scenes whose addresses are valid. */
function bytes(o: Obj): Uint8Array {
  const c = structuredClone(o);
  c.nodes.sort((a: Obj, b: Obj) => compareNodeRef(nodeRefFromWire(a.ref), nodeRefFromWire(b.ref)));
  c.edges.sort((a: Obj, b: Obj) => compareEdgeAddress(edgeFromWire(a.ref), edgeFromWire(b.ref)));
  return canonicalBytes(c as unknown as CJValue);
}
/**
 * Serializes WITHOUT decoding any address. For a deliberately malformed address, mutate an already sorted valid scene
 * and use this, so the failure comes from the verifier under test and not from the fixture builder.
 */
const raw = (o: Obj): Uint8Array => canonicalBytes(structuredClone(o) as unknown as CJValue);
const expectInvalid = async (b: Uint8Array, code: string, reason?: string) => {
  const e = await igsErrorAsync(() => verifyScene(b));
  expect(e.code).toBe(code);
  if (reason !== undefined) expect(e.reason).toBe(reason);
};

describe("valid scenes", () => {
  it("accepts the four frozen oracle scenes and returns the frozen digests", async () => {
    const expected: Record<string, string> = {
      "o1-basic.scene.json": "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc",
      "o2-ids-ordering.scene.json": "8507fcba55d7d8e1d569357d5bcabadad99d8dddad875c80c077b6560bf1ff20",
      "o4-undirected.scene.json": "13b1ede37d266246ef80082426eb3a08a9c24e164ac2e8bc44cb3ff2b2fa9b09",
      "o5-string-stress.scene.json": "86044435c3c241e04a985a62b9e473ebbfbf22a7a17518c9f963487586edc836",
    };
    for (const [f, h] of Object.entries(expected)) expect((await verifyScene(bytesOf(f))).sceneSha256, f).toBe(h);
  });

  it("accepts a directed edge whose src sorts after its tgt (control)", async () => {
    const o = load("o1-basic.scene.json");
    const e = o.edges[0].ref;
    [e.src, e.tgt] = [e.tgt, e.src];
    await verifyScene(bytes(o));
  });
});

describe("the input snapshot (a public async identity boundary)", () => {
  it("verifies and hashes the bytes it was given, even if the caller mutates the array while the call is pending", async () => {
    const b = bytesOf("o1-basic.scene.json").slice();
    const pending = verifyScene(b);
    b[0] = 0x5b; // the call has returned its promise but has not finished
    const r = await pending;
    expect(r.sceneSha256).toBe("e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc");
    expect(r.scene.igs).toBe("IGS/1");
  });

  it("rejects shared-memory input with a TypeError", async () => {
    await expect(verifyScene(new Uint8Array(new SharedArrayBuffer(8)))).rejects.toBeInstanceOf(TypeError);
  });
});

describe("producer and consumer agree", () => {
  const i = (type: string, v: bigint): NodeRef => ({ type, id: { kind: "int", value: v } });
  const s = (type: string, v: string): NodeRef => ({ type, id: { kind: "str", value: v } });

  it("verifyScene accepts everything assembleScene produces, including awkward strings", async () => {
    const awkward = ["", " ", "é", "é", "～", "\u{1F600}", "a\u0000b", "\n\t\u007f ", "has space", 'q"uote', "back\\slash", "007", "1.0"];
    const models: SceneModel[] = [
      { directed: true, nodes: [], edges: [] },
      { directed: true, nodes: [...awkward.map((v) => s("t", v)), i("t", -9223372036854775808n), i("t", 0n), i("t", 9223372036854775807n)], edges: [{ src: s("t", "007"), rel: "R", tgt: i("t", 0n) }] },
      { directed: false, nodes: [i("p", 2n), i("p", 1n), s("q", "x")], edges: [{ src: i("p", 2n), rel: "R", tgt: i("p", 1n) }, { src: i("p", 2n), rel: "R", tgt: i("p", 2n) }, { src: s("q", "x"), rel: "S", tgt: i("p", 1n) }] },
    ];
    const sha = "0".repeat(64);
    for (const m of models) {
      const b = sceneToBytes(assembleScene(sha, m));
      const v = await verifyScene(b);
      expect(v.sceneSha256).toBe(await sha256Hex(b));
    }
  });
});

describe("F1 graph integrity", () => {
  it("rejects duplicate node refs", async () => {
    const o = load("o1-basic.scene.json");
    o.nodes.push(structuredClone(o.nodes[0]));
    await expectInvalid(bytes(o), "INVALID_SCENE", "DUPLICATE_NODE_REF");
  });

  it("rejects duplicate edge refs", async () => {
    const o = load("o1-basic.scene.json");
    o.edges.push(structuredClone(o.edges[0]));
    await expectInvalid(bytes(o), "INVALID_SCENE", "DUPLICATE_EDGE_REF");
  });

  it("rejects an edge whose source or target names no node", async () => {
    const a = load("o1-basic.scene.json");
    a.edges[0].ref.src.id = "i:99";
    await expectInvalid(bytes(a), "INVALID_SCENE", "DANGLING_EDGE_ENDPOINT");
    const b = load("o1-basic.scene.json");
    b.edges[0].ref.tgt.id = "s:nobody";
    await expectInvalid(bytes(b), "INVALID_SCENE", "DANGLING_EDGE_ENDPOINT");
  });

  it("rejects an undirected edge whose src sorts after its tgt", async () => {
    const o = load("o4-undirected.scene.json");
    const e = o.edges[0].ref; // i:1 -> i:2
    [e.src, e.tgt] = [e.tgt, e.src];
    await expectInvalid(bytes(o), "INVALID_SCENE", "NON_CANONICAL_ENDPOINTS");
  });
});

describe("F3 agreement with the scene's own references", () => {
  it("rejects a category that is not the node type", async () => {
    const o = load("o1-basic.scene.json"); o.nodes[0].category = "robot";
    await expectInvalid(bytes(o), "INVALID_SCENE", "CATEGORY_MISMATCH");
  });

  it("rejects a node label that is not the text of its id", async () => {
    const a = load("o1-basic.scene.json"); a.nodes[0].label = "2"; // node 0 is the INT64 1
    await expectInvalid(bytes(a), "INVALID_SCENE", "LABEL_MISMATCH");
    const b = load("o1-basic.scene.json"); b.nodes[1].label = "Ann"; // node 1 is the string id "ann"
    await expectInvalid(bytes(b), "INVALID_SCENE", "LABEL_MISMATCH");
  });

  it("rejects an edge label that is not the relation", async () => {
    const o = load("o1-basic.scene.json"); o.edges[0].label = "FRIENDS";
    await expectInvalid(bytes(o), "INVALID_SCENE", "LABEL_MISMATCH");
  });

  it("rejects an ordinal other than 0 in a simple graph", async () => {
    const o = load("o1-basic.scene.json"); o.edges[0].ref.ord = "1";
    await expectInvalid(bytes(o), "INVALID_SCENE", "UNEXPECTED_ORDINAL");
  });

  it("rejects two otherwise identical edges that differ only in ordinal", async () => {
    const o = load("o1-basic.scene.json");
    const twin = structuredClone(o.edges[0]); twin.ref.ord = "1";
    o.edges.push(twin);
    await expectInvalid(bytes(o), "INVALID_SCENE", "UNEXPECTED_ORDINAL");
  });

  it("does not let a presentation label change the V1a label: display_label stays a reserved name", async () => {
    const o = load("o1-basic.scene.json"); o.nodes[0].display_label = "Alice";
    await expectInvalid(bytes(o), "INVALID_SCENE", "RESERVED_FIELD");
  });
});

describe("well-formed addresses (schema step)", () => {
  // Every case mutates an already sorted valid scene and serializes with raw(), so the VERIFIER rejects it,
  // not the fixture builder (bytes() decodes addresses and would throw before verifyScene is called).
  it("rejects malformed tagged ids", async () => {
    for (const id of ["i:007", "i:-0", "i:+5", "i:", "i:1.5", "i:9223372036854775808", "i:-9223372036854775809", "x:1", "1", ""]) {
      const o = load("o1-basic.scene.json"); o.nodes[0].ref.id = id;
      await expectInvalid(raw(o), "INVALID_SCENE", "INVALID_ID");
    }
  });

  it("rejects malformed identifiers for a node type and for a relation", async () => {
    for (const bad of ["", "a b", "a:b", "a|b", 'a"b', "a\\b", "a\tb"]) {
      const n = load("o1-basic.scene.json"); n.nodes[0].ref.type = bad;
      await expectInvalid(raw(n), "INVALID_SCENE", "INVALID_IDENTIFIER");
      const e = load("o1-basic.scene.json"); e.edges[0].ref.rel = bad;
      await expectInvalid(raw(e), "INVALID_SCENE", "INVALID_IDENTIFIER");
    }
  });

  it("rejects a non-canonical ordinal and a malformed artifact hash", async () => {
    for (const ord of ["01", "-1", "", "x", "1.0"]) {
      const o = load("o1-basic.scene.json"); o.edges[0].ref.ord = ord;
      await expectInvalid(raw(o), "INVALID_SCENE", "INVALID_ORDINAL");
    }
    for (const h of ["ABC", "0".repeat(63), "G".repeat(64), "A".repeat(64)]) {
      const o = load("o1-basic.scene.json"); o.source.artifact_sha256 = h;
      await expectInvalid(raw(o), "INVALID_SCENE", "INVALID_HASH");
    }
  });
});

describe("canonical form and schema", () => {
  it("rejects unsorted arrays and non-canonical whitespace", async () => {
    const o = load("o1-basic.scene.json");
    o.nodes.reverse();
    await expectInvalid(canonicalBytes(o as unknown as CJValue), "INVALID_SCENE", "NON_CANONICAL");
    await expectInvalid(new TextEncoder().encode(JSON.stringify(load("o1-basic.scene.json"), null, 2)), "INVALID_SCENE", "NON_CANONICAL");
  });

  it("rejects an optional field serialized at its default", async () => {
    const o = load("o1-basic.scene.json");
    o.extensions = [];
    await expectInvalid(bytes(o), "INVALID_SCENE", "NON_CANONICAL");
  });

  it("rejects an unsupported non-empty extensions", async () => {
    const o = load("o1-basic.scene.json");
    o.extensions = ["igs-igdm/1"];
    await expectInvalid(bytes(o), "UNSUPPORTED_EXTENSION");
  });

  it("rejects reserved names at the top level and on nodes and edges", async () => {
    for (const k of ["groups", "enrichments", "layout_intent"]) {
      const o = load("o1-basic.scene.json");
      o[k] = k === "layout_intent" ? {} : [];
      await expectInvalid(bytes(o), "INVALID_SCENE", "RESERVED_FIELD");
    }
    for (const k of ["display_label", "role", "emphasis", "badge", "ring", "visibility", "lod_min", "interaction", "a11y_text", "a11y_role"]) {
      const n = load("o1-basic.scene.json");
      n.nodes[0][k] = "x";
      await expectInvalid(bytes(n), "INVALID_SCENE", "RESERVED_FIELD");
      const e = load("o1-basic.scene.json");
      e.edges[0][k] = "x";
      await expectInvalid(bytes(e), "INVALID_SCENE", "RESERVED_FIELD");
    }
  });

  it("rejects a scene_sha256 key, unknown fields, a wrong version and missing fields", async () => {
    const a = load("o1-basic.scene.json"); a.scene_sha256 = "0".repeat(64);
    await expectInvalid(bytes(a), "INVALID_SCENE");
    const b = load("o1-basic.scene.json"); b.nodes[0].surprise = true;
    await expectInvalid(bytes(b), "INVALID_SCENE", "UNKNOWN_FIELD");
    const c = load("o1-basic.scene.json"); c.igs = "IGS/2";
    await expectInvalid(bytes(c), "INVALID_SCENE", "UNSUPPORTED_VERSION");
    const d = load("o1-basic.scene.json"); delete d.nodes[0].label;
    await expectInvalid(bytes(d), "INVALID_SCENE", "MISSING_FIELD");
  });

  it("rejects non-JSON, invalid UTF-8 and a byte-order mark", async () => {
    await expectInvalid(new TextEncoder().encode("not json"), "INVALID_SCENE");
    await expectInvalid(new Uint8Array([0x7b, 0xff, 0x7d]), "INVALID_SCENE", "INVALID_ENCODING");
    await expectInvalid(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), "INVALID_SCENE", "INVALID_ENCODING");
  });

  it("rejects a number in the V1a schema and a null in an extension value", async () => {
    const a = load("o1-basic.scene.json"); a.nodes[0].label = 5;
    await expectInvalid(bytes(a), "INVALID_SCENE");
    const b = load("o1-basic.scene.json"); b.nodes[0]["x-test"] = null;
    await expectInvalid(new TextEncoder().encode(JSON.stringify(b)), "INVALID_SCENE");
  });

  it("answers a deeply nested extension value with a structured error, never a stack overflow (final-review I2)", async () => {
    const base = textOf("o1-basic.scene.json").trim();
    const withExt = (value: string) => new TextEncoder().encode(`${base.slice(0, -1)},"x-a":${value}}`);
    const arrays = "[".repeat(2000) + "]".repeat(2000);
    const objects = '{"a":'.repeat(2000) + "1" + "}".repeat(2000);
    for (const v of [arrays, objects]) {
      const e = await igsErrorAsync(() => verifyScene(withExt(v)));
      expect([e.code, e.reason]).toEqual(["INVALID_SCENE", "TOO_DEEP"]);
    }
  });

  it("has no layout field, so layout cannot change the scene hash (scene/layout-independence)", async () => {
    const o = load("o1-basic.scene.json"); o.layout = { x: 1 };
    await expectInvalid(bytes(o), "INVALID_SCENE", "UNKNOWN_FIELD");
  });
});
