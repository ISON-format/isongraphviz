// packages/scene-core/test/qualify.duplicates.test.ts
// Rule A11 (same class as A9 / docs/specs/IGS-1.md Law 3): ison-ts builds a row with row[column] = value, so when a header
// repeats a column name the last cell wins and the earlier cell vanishes. Core sees the same row. The document would compile to a
// graph that differs from what the text says, with a valid hash.
import { describe, expect, it } from "vitest";
import { compileSceneFromText } from "../src/compile.js";
import { qualify } from "../src/qualify.js";
import { igsError, igsErrorAsync } from "./helpers.js";

const reject = (text: string, path: string) => {
  const e = igsError(() => qualify(text));
  expect([e.code, e.reason, e.path], JSON.stringify(text)).toEqual(["MALFORMED_SOURCE", "DUPLICATE_FIELD", path]);
};

describe("a repeated column name is rejected, not resolved by 'last cell wins' (R1)", () => {
  it("rejects a repeated id column, which would silently replace the node's id", () => {
    reject("nodes.p\nid id\n1 2\n", "nodes.p");
  });

  it("rejects a repeated source or target column, which would silently re-wire the edge", () => {
    reject("nodes.p\nid\na\nb\nc\n\nedges.r\nsource target target\n:p:a :p:b :p:c\n", "edges.r");
    reject("nodes.p\nid\na\nb\nc\n\nedges.r\nsource source target\n:p:a :p:b :p:c\n", "edges.r");
  });

  it("rejects a repeated property column and a repeated meta column", () => {
    reject("nodes.p\nid name name\n1 a b\n", "nodes.p");
    reject("meta.graph\ndirected directed\nfalse true\n\nnodes.p\nid\n1\n", "meta.graph");
  });

  it("rejects a repeat that is not adjacent", () => {
    reject("nodes.p\nid name id\n1 a 2\n", "nodes.p");
  });

  it("fails closed through the public compile entry", async () => {
    const e = await igsErrorAsync(() => compileSceneFromText("nodes.p\nid id\n1 2\n", "ison-v1"));
    expect(e.reason).toBe("DUPLICATE_FIELD");
  });

  it("still accepts distinct columns that only look alike", () => {
    for (const t of ["nodes.p\nid Id ID\n1 2 3\n", "nodes.p\nid name label\n1 a b\n"]) expect(() => qualify(t), JSON.stringify(t)).not.toThrow();
  });
});
