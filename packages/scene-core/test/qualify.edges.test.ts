// packages/scene-core/test/qualify.edges.test.ts
import { describe, expect, it } from "vitest";
import { pairKey, qualify, qualifyBytes } from "../src/qualify.js";
import { bytesOf, igsError } from "./helpers.js";

const fx = (n: string) => bytesOf(`fixtures/${n}.source.ison`);
const reject = (name: string, code: string, reason?: string) => {
  const e = igsError(() => qualifyBytes(fx(name)));
  expect(e.code, name).toBe(code);
  expect(e.reason, name).toBe(reason);
};
const und = (rows: string, extra = "") => `edges.R\nsource target${extra}\n${rows}\n\nmeta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n2\n`;

describe("duplicates and twins", () => {
  it("rejects an int/string id twin and exact duplicate nodes", () => {
    reject("n14-id-twin", "ID_TWIN");
    expect(igsError(() => qualify("nodes.p\nid\n1\n1\n")).code).toBe("DUPLICATE_NODE");
  });

  it("rejects same-orientation duplicates, a repeated self-loop and a directed duplicate", () => {
    reject("n15-undirected-same-direction-duplicate", "DUPLICATE_EDGE");
    reject("n16-undirected-self-loop-duplicate", "DUPLICATE_EDGE");
    reject("n17-directed-duplicate", "DUPLICATE_EDGE");
  });

  it("treats a third row for one logical edge as a duplicate orientation", () => {
    expect(igsError(() => qualify(und(":p:1 :p:2\n:p:2 :p:1\n:p:1 :p:2"))).code).toBe("DUPLICATE_EDGE");
  });
});

describe("a relation spread over several edge blocks (the whole relation is checked, not one block)", () => {
  // ison-ts parses repeated `edges.R` blocks and Core silently swallows the undirected repeats, so the adapter must see across blocks.
  const split = (b1: string, b2: string, extra = "", directed = false) =>
    `${directed ? "" : "meta.graph\ndirected\nfalse\n\n"}nodes.p\nid\n1\n2\n\nedges.R\nsource target${extra}\n${b1}\n\nedges.R\nsource target${extra}\n${b2}\n`;

  it("rejects a same-orientation duplicate split across two blocks, directed or not", () => {
    expect(igsError(() => qualify(split(":p:1 :p:2", ":p:1 :p:2"))).code).toBe("DUPLICATE_EDGE");
    expect(igsError(() => qualify(split(":p:1 :p:2", ":p:1 :p:2", "", true))).code).toBe("DUPLICATE_EDGE");
  });

  it("rejects a repeated self-loop split across two blocks", () => {
    expect(igsError(() => qualify(split(":p:1 :p:1", ":p:1 :p:1"))).code).toBe("DUPLICATE_EDGE");
  });

  it("rejects a conflicting mirror pair split across two blocks", () => {
    const e = igsError(() => qualify(split(":p:1 :p:2 5", ":p:2 :p:1 6", " w")));
    expect([e.code, e.reason]).toEqual(["UNDIRECTED_EDGE_CONFLICT", "PROPERTY_MISMATCH"]);
  });

  it("rejects an unverifiable mirror pair split across two blocks", () => {
    const e = igsError(() => qualify(split(":p:1 :p:2 9007199254740992", ":p:2 :p:1 9007199254740993", " w")));
    expect([e.code, e.reason]).toEqual(["UNDIRECTED_EDGE_CONFLICT", "UNVERIFIABLE_PROPERTY_VALUE"]);
  });

  it("accepts an equal mirror pair split across two blocks, in either order", () => {
    expect(() => qualify(split(":p:1 :p:2 5", ":p:2 :p:1 5", " w"))).not.toThrow();
    expect(() => qualify(split(":p:2 :p:1 5", ":p:1 :p:2 5", " w"))).not.toThrow();
  });

  it("keeps different relations apart", () => {
    const src = "meta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n\nedges.S\nsource target\n:p:1 :p:2\n";
    expect(() => qualify(src)).not.toThrow();
  });

  it("treats :p:1 and :p:01 as the same endpoint, the way Core's resolver does", () => {
    expect(igsError(() => qualify(und(":p:1 :p:2\n:p:01 :p:2"))).code).toBe("DUPLICATE_EDGE");
    expect(igsError(() => qualify(und(":p:1 :p:2 5\n:p:02 :p:01 6", " w"))).reason).toBe("PROPERTY_MISMATCH");
  });

  it("builds pair keys that cannot collide whatever characters the endpoints contain", () => {
    expect(pairKey("a\u0000b", "c")).not.toBe(pairKey("a", "b\u0000c"));
    expect(pairKey('a","b', "c")).not.toBe(pairKey("a", 'b","c'));
  });
});

describe("mirror pairs (A7)", () => {
  it("rejects differing properties", () => reject("n11-mirror-props-differ", "UNDIRECTED_EDGE_CONFLICT", "PROPERTY_MISMATCH"));

  it("rejects unverifiable values whether they look equal or different", () => {
    reject("n09-mirror-unsafe-distinct", "UNDIRECTED_EDGE_CONFLICT", "UNVERIFIABLE_PROPERTY_VALUE");
    reject("n10-mirror-unsafe-identical", "UNDIRECTED_EDGE_CONFLICT", "UNVERIFIABLE_PROPERTY_VALUE");
  });

  it("accepts equal safe properties and a lone unsafe property with no mirror row", () => {
    qualifyBytes(fx("p02-mirror-equal-props"));
    qualifyBytes(fx("p03-unsafe-prop-no-mirror"));
  });

  it("accepts a mirror pair in either file order", () => {
    expect(() => qualify(und(":p:1 :p:2 5\n:p:2 :p:1 5", " w"))).not.toThrow();
    expect(() => qualify(und(":p:2 :p:1 5\n:p:1 :p:2 5", " w"))).not.toThrow();
  });

  it("compares a missing column as null and ignores null members (1 equals 1.0, 0 equals -0)", () => {
    expect(() => qualify(und(":p:1 :p:2 1\n:p:2 :p:1 1.0", " w"))).not.toThrow();
    expect(() => qualify(und(":p:1 :p:2 0\n:p:2 :p:1 -0", " w"))).not.toThrow();
    expect(() => qualify(und(":p:1 :p:2 null\n:p:2 :p:1 null", " w"))).not.toThrow();
  });

  it("keeps booleans distinct from numbers and strings exact", () => {
    expect(igsError(() => qualify(und(":p:1 :p:2 true\n:p:2 :p:1 1", " w"))).reason).toBe("PROPERTY_MISMATCH");
    expect(igsError(() => qualify(und(':p:1 :p:2 a\n:p:2 :p:1 "a "', " w"))).reason).toBe("PROPERTY_MISMATCH");
  });

  it("does not compare properties of a directed graph's opposite edges", () => {
    expect(() => qualify("edges.R\nsource target w\n:p:1 :p:2 1\n:p:2 :p:1 2\n\nnodes.p\nid\n1\n2\n")).not.toThrow();
  });
});
