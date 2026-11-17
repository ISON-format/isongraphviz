// packages/scene-core/test/qualify.blocks.test.ts
// Content that ison-ts and Core read but ignore must not become a valid scene with a hash.
import { describe, expect, it } from "vitest";
import { compileSceneFromText } from "../src/compile.js";
import { qualify } from "../src/qualify.js";
import { igsError, igsErrorAsync } from "./helpers.js";

const reject = (text: string, code: string, reason: string) => {
  const e = igsError(() => qualify(text));
  expect([e.code, e.reason], JSON.stringify(text)).toEqual([code, reason]);
};

describe("nothing the parser read may be dropped silently (18 Law 3)", () => {
  it("rejects a data line that the parser took for a block header (an id shaped like main.py)", () => {
    reject("nodes.p\nid\na.b\nc\n", "MALFORMED_SOURCE", "UNSUPPORTED_BLOCK");
    reject("nodes.p\nid\nmain.py\nutil.py\n", "MALFORMED_SOURCE", "UNSUPPORTED_BLOCK");
  });

  it("rejects summary rows, which would hide every later row of a graph block", () => {
    reject("nodes.p\nid\n1\n---\n2\n3\n", "MALFORMED_SOURCE", "SUMMARY_ROWS");
    reject("nodes.p\nid\n1\n2\n\nedges.R\nsource target\n---\n:p:1 :p:2\n", "MALFORMED_SOURCE", "SUMMARY_ROWS");
  });

  it("rejects a mistyped or foreign block kind instead of reading it as an empty graph", () => {
    for (const t of ["edge.R\nsource target\n:p:1 :p:2\n", "node.p\nid\n1\n", "Nodes.p\nid\n1\n", "table.users\nid name\n1 x\n", "object.cfg\na\n1\n"]) {
      reject(t, "MALFORMED_SOURCE", "UNSUPPORTED_BLOCK");
    }
  });

  it("rejects a graph block whose name is not a Core identifier (a CR-only file becomes one such block)", () => {
    reject("nodes.p\rid\r1\r", "MALFORMED_SOURCE", "INVALID_BLOCK_NAME");
  });

  it("rejects a case variant of meta.graph, which Core ignores and which could carry the multigraph marker", () => {
    reject("meta.Graph\ndirected format\nfalse ison-graph-multigraph-v1\n\nnodes.p\nid\n1\n", "UNSUPPORTED_GRAPH_PROFILE", "MALFORMED_META");
  });

  it("still accepts the empty graph, comments, other meta blocks and a plain graph", () => {
    for (const t of ["", " \n\n", "# nothing\n", "meta.info\nname\nx\n\nnodes.p\nid\n1\n", "nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n"]) {
      expect(() => qualify(t), JSON.stringify(t)).not.toThrow();
    }
  });

  it("reaches the caller of compileSceneFromText as a structured error, not a hashed scene", async () => {
    const e = await igsErrorAsync(() => compileSceneFromText("nodes.p\nid\nexample.com\nb\n", "ison-v1"));
    expect([e.code, e.reason]).toEqual(["MALFORMED_SOURCE", "UNSUPPORTED_BLOCK"]);
  });
});
