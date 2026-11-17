// packages/scene-core/test/qualify.proto.test.ts
// Rule A10 (docs/conformance/README.md): a block that declares a prototype-sensitive column name (__proto__) is refused before any
// scene is built. These are regression tests for the refusal; every other name stays ordinary data.
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

describe("a __proto__ column is refused (A10)", () => {
  it("in a nodes block, alone or beside a real id column", () => {
    reject("nodes.p\n__proto__ name\nx a\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
    reject("nodes.p\nid __proto__\n1 x\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
  });

  it("in an edges block", () => {
    reject("nodes.p\nid\n1\n2\n\nedges.r\n__proto__ w\nx 3\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
  });

  it("in a meta block, including meta.graph", () => {
    reject("meta.graph\n__proto__\nx\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
    reject("meta.info\n__proto__\nx\n\nnodes.p\nid\n1\n", "MALFORMED_SOURCE", "PROTOTYPE_FIELD");
  });

  it("reports the offending block in the error path", () => {
    expect(igsError(() => qualify("nodes.p\n__proto__\nx\n")).path).toBe("nodes.p");
  });

  it("on every public entry, so no scene is produced", async () => {
    const text = "nodes.p\n__proto__ name\nx a\n";
    expect((await igsErrorAsync(() => compileSceneFromText(text, "ison-v1"))).reason).toBe("PROTOTYPE_FIELD");
    expect(igsError(() => loadModel(enc(text))).reason).toBe("PROTOTYPE_FIELD");
  });
});

describe("required columns are read from own properties only", () => {
  it("ownValue returns an own value and ignores an inherited one", () => {
    expect(ownValue({ id: "5" }, "id")).toBe("5");
    expect(ownValue(Object.create({ id: "77" }) as Record<string, unknown>, "id")).toBeUndefined();
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
