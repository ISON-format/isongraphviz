// packages/scene-core/test/qualify.profile-ids.test.ts
import { describe, expect, it } from "vitest";
import { decodeSource, qualify, qualifyBytes } from "../src/qualify.js";
import { bytesOf, igsError } from "./helpers.js";

const fx = (n: string) => bytesOf(`fixtures/${n}.source.ison`);
const expectReject = (name: string, code: string, reason?: string) => {
  const e = igsError(() => qualifyBytes(fx(name)));
  expect(e.code, name).toBe(code);
  expect(e.reason, name).toBe(reason);
};

describe("encoding (A2)", () => {
  it("rejects a byte-order mark and invalid UTF-8", () => {
    expectReject("n12-bom", "MALFORMED_SOURCE", "INVALID_ENCODING");
    expectReject("n13-invalid-utf8", "MALFORMED_SOURCE", "INVALID_ENCODING");
  });
  it("decodes valid UTF-8", () => {
    expect(decodeSource(new TextEncoder().encode("aé"))).toBe("aé");
  });
  it("rejects a syntax error as PARSE_ERROR (A3)", () => {
    expect(igsError(() => qualify("this is not ison")).reason).toBe("PARSE_ERROR");
  });
});

describe("graph profile (A4), decided on the structured meta.graph block", () => {
  it("rejects MultiGraph and every malformed or contradictory declaration", () => {
    expectReject("n01-multigraph", "UNSUPPORTED_GRAPH_PROFILE", "MULTIGRAPH");
    expectReject("n02-meta-quoted-bool", "UNSUPPORTED_GRAPH_PROFILE", "MALFORMED_META");
    expectReject("n03-meta-unknown-format", "UNSUPPORTED_GRAPH_PROFILE", "UNKNOWN_FORMAT");
    expectReject("n04-meta-extra-field", "UNSUPPORTED_GRAPH_PROFILE", "MALFORMED_META");
    expectReject("n05-meta-duplicate-block", "UNSUPPORTED_GRAPH_PROFILE", "CONTRADICTORY_META");
  });

  it("accepts a graph whose property merely contains the multigraph marker text", () => {
    expect(qualifyBytes(fx("p01-marker-as-property")).directed).toBe(true);
  });

  it("reads directedness: absent means directed, boolean false means undirected", () => {
    expect(qualify("nodes.p\nid\n1\n").directed).toBe(true);
    expect(qualify("meta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n").directed).toBe(false);
  });

  it("rejects a meta.graph block with several rows", () => {
    expect(igsError(() => qualify("meta.graph\ndirected\ntrue\nfalse\n")).reason).toBe("MALFORMED_META");
  });
});

describe("node ids (A5)", () => {
  it("rejects unsafe integers, floats, booleans and null before any lossy conversion", () => {
    expectReject("n06-id-unsafe-neighbours", "INEXACT_NODE_ID", "OUT_OF_SAFE_RANGE");
    expectReject("n08-id-float", "INVALID_NODE_ID", "NOT_INT64_OR_STRING");
    for (const t of ["true", "null"]) expect(igsError(() => qualify(`nodes.p\nid\n${t}\n`)).code, t).toBe("INVALID_NODE_ID");
    expect(igsError(() => qualify("nodes.p\nname\nAnn\n")).code).toBe("INVALID_NODE_ID");
  });

  it("accepts the safe-integer boundaries and numeric-looking strings", () => {
    qualifyBytes(fx("p04-safe-boundaries"));
    qualifyBytes(fx("p05-numeric-looking-strings"));
    qualifyBytes(fx("p06-int-vs-string-distinct-types"));
  });

  it("detects the first unsafe integer exactly, in both signs", () => {
    expect(igsError(() => qualify("nodes.p\nid\n9007199254740992\n")).code).toBe("INEXACT_NODE_ID");
    expect(igsError(() => qualify("nodes.p\nid\n-9007199254740992\n")).code).toBe("INEXACT_NODE_ID");
    expect(() => qualify("nodes.p\nid\n9007199254740991\n")).not.toThrow();
  });

  it("rejects float-spelled ids instead of reading them as the integers they round to", () => {
    // ison-ts parses 1.0 to the number 1 but marks the token as a float (public isFloatField). Typed ids stay typed.
    for (const tok of ["1.0", "-0.0", "9007199254740993.0", "1.5"]) {
      const e = igsError(() => qualify(`nodes.p\nid\n${tok}\n`));
      expect([e.code, e.reason, e.path], tok).toEqual(["INVALID_NODE_ID", "NOT_INT64_OR_STRING", "nodes.p[0].id"]);
    }
    expect(igsError(() => qualify("nodes.p\nid\n1\n2.0\n")).path).toBe("nodes.p[1].id");
  });

  it("reads quoted look-alikes and non-numeric tokens as strings, and integer tokens as integers", () => {
    for (const t of ['"1.0"', '"9007199254740993.0"', "1e5", "+1", "0x10"]) expect(() => qualify(`nodes.p\nid\n${t}\n`), t).not.toThrow(); // strings
    for (const t of ["-0", "007", "01"]) expect(() => qualify(`nodes.p\nid\n${t}\n`), t).not.toThrow(); // integer tokens: ids 0, 7 and 1
  });

  it("treats differently spelled integer tokens of one value as duplicates", () => {
    expect(igsError(() => qualify("nodes.p\nid\n0\n-0\n")).code).toBe("DUPLICATE_NODE");
    expect(igsError(() => qualify("nodes.p\nid\n7\n007\n")).code).toBe("DUPLICATE_NODE");
  });
});

describe("edge references (A6)", () => {
  it("rejects an integer-looking reference outside the safe range", () => {
    expectReject("n07-ref-unsafe", "INEXACT_NODE_ID", "OUT_OF_SAFE_RANGE");
  });

  it("refers to a string id that looks numeric: accepted, not an unsafe integer", () => {
    const text = 'nodes.p\nid\n"9007199254740993"\n1\n\nedges.R\nsource target\n:p:9007199254740993 :p:1\n';
    expect(() => qualify(text)).not.toThrow();
  });

  it("rejects an endpoint that is not a typed reference", () => {
    expect(igsError(() => qualify("edges.R\nsource target\nfoo :p:1\n")).code).toBe("INVALID_EDGE_ENDPOINT");
    expect(igsError(() => qualify("edges.R\nsource target\n:5 :p:1\n")).code).toBe("INVALID_EDGE_ENDPOINT");
  });
});
