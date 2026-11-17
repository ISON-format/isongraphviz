// packages/scene-core/test/qualify.proto.test.ts
// Rule A10: ison-ts stores a row as a plain object and assigns row[column] = value. A column named __proto__ with a
// reference value therefore makes the row INHERIT from that Reference, so `row.id` reads the reference's id and a node with no id
// column appears to have one. The adapter must fail closed before Core sees such a document.
import { Reference } from "ison-ts";
import { describe, expect, it } from "vitest";
import { compileSceneFromText } from "../src/compile.js";
import { loadModel } from "../src/model.js";
import { ownValue, qualify } from "../src/qualify.js";
import { igsError, igsErrorAsync } from "./helpers.js";

const enc = (s: string) => new TextEncoder().encode(s);
const reject = (text: string, code: string, reason: string) => {
  const e = igsError(() => qualify(text));
  expect([e.code, e.reason], JSON.stringify(text)).toEqual([code, reason]);
};

describe("a __proto__ column cannot fabricate graph content (A10)", () => {
  it("rejects a node row whose id would be inherited from a __proto__ reference", () => {
    reject("nodes.p\n__proto__ name\n:q:77 a\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
  });

  it("rejects the column even when the row also has a real id (the prototype is still replaced)", () => {
    reject("nodes.p\nid __proto__\n1 :q:77\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
  });

  it("rejects a __proto__ column on an edge block, with or without real endpoints", () => {
    reject("nodes.p\nid\n1\n2\n\nedges.r\n__proto__ w\n:p:1 3\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
    reject("nodes.p\nid\n1\n2\n\nedges.r\nsource target __proto__\n:p:1 :p:2 :p:9\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
  });

  it("rejects a __proto__ column in meta.graph, so the graph profile cannot be influenced", () => {
    reject("meta.graph\n__proto__\n:a:b\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
    reject("meta.graph\ndirected __proto__\nfalse :a:b\n\nnodes.p\nid\n1\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
  });

  it("rejects the column in a non-graph meta block too (the whole row set is read by the same parser)", () => {
    reject("meta.info\n__proto__\n:a:b\n\nnodes.p\nid\n1\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
  });

  it("reports the offending block in the error path", () => {
    expect(igsError(() => qualify("nodes.p\n__proto__\n:q:77\n")).path).toBe("nodes.p");
  });

  it("fails closed on every public entry, never producing a scene for the fabricated node", async () => {
    const text = "nodes.p\n__proto__ name\n:q:77 a\n";
    expect((await igsErrorAsync(() => compileSceneFromText(text, "ison-v1"))).reason).toBe("PROTOTYPE_FIELD");
    expect(igsError(() => loadModel(enc(text))).reason).toBe("PROTOTYPE_FIELD");
  });
});

describe("required columns are read from own properties only", () => {
  it("ownValue returns an own value and ignores an inherited one", () => {
    expect(ownValue({ id: "5" }, "id")).toBe("5");
    expect(ownValue(Object.create({ id: "77" }) as Record<string, unknown>, "id")).toBeUndefined();
    expect(ownValue(Object.create(new Reference("77", "q")) as Record<string, unknown>, "id")).toBeUndefined();
  });

  it("ownValue does not treat Object.prototype members as column values", () => {
    expect(ownValue({}, "constructor")).toBeUndefined();
    expect(ownValue({}, "toString")).toBeUndefined();
  });
});

describe("other prototype-named columns and names stay ordinary data", () => {
  it("accepts constructor, toString and hasOwnProperty as property columns and as string ids", async () => {
    const text = "nodes.p\nid constructor toString hasOwnProperty\nconstructor a b c\n__x d e f\n";
    expect(() => qualify(text)).not.toThrow();
    const { scene } = await compileSceneFromText(text, "ison-v1");
    expect(scene.nodes.map((n) => n.label)).toEqual(["__x", "constructor"]);
  });

  it("accepts Object.prototype member names as a node type and as a relation name", async () => {
    const text = "nodes.constructor\nid\na\nb\n\nedges.toString\nsource target\n:constructor:a :constructor:b\n";
    const { scene } = await compileSceneFromText(text, "ison-v1");
    expect(scene.nodes.map((n) => n.category)).toEqual(["constructor", "constructor"]);
    expect(scene.edges.map((e) => e.label)).toEqual(["toString"]);
  });

  it("accepts the strings __proto__ and prototype as ids (a value is not a column)", async () => {
    const { scene } = await compileSceneFromText("nodes.p\nid\n__proto__\nprototype\n", "ison-v1");
    expect(scene.nodes.map((n) => n.label)).toEqual(["__proto__", "prototype"]);
  });
});
