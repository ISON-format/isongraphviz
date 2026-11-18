// Section 7.3: element ids (Appendix A.5), the strict decoder, the bounds.
import { describe, expect, it } from "vitest";
import { IgrError } from "isongraph-visualize-renderer-core";
import { decodeElementId, elementDomId } from "../src/ids.js";

const hex = (s: string) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
const node = (id: string, type = "p") => ({ node: { id, type } });
const err = (f: () => unknown): string => { try { f(); return "none"; } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason}` : "other"; } };

describe("elementDomId (A.5)", () => {
  it("four distinct ids for i:7, s:7, s:007, s:-0", () => {
    expect(elementDomId("igr", node("i:7"))).toBe("igr-n-7b226964223a22693a37222c2274797065223a2270227d");
    expect(elementDomId("igr", node("s:7"))).toBe("igr-n-7b226964223a22733a37222c2274797065223a2270227d");
    expect(elementDomId("igr", node("s:007"))).toBe("igr-n-7b226964223a22733a303037222c2274797065223a2270227d");
    expect(elementDomId("igr", node("s:-0"))).toBe("igr-n-7b226964223a22733a2d30222c2274797065223a2270227d");
  });
  it("edge: hex of the sorted-key canonical JSON", () => {
    const e = { edge: { ord: "0", rel: "KNOWS", src: { id: "i:1", type: "person" }, tgt: { id: "s:ann", type: "person" } } };
    expect(elementDomId("igr", e)).toBe("igr-e-" + hex('{"ord":"0","rel":"KNOWS","src":{"id":"i:1","type":"person"},"tgt":{"id":"s:ann","type":"person"}}'));
  });
  it("IGS 5.4 string escapes, lowercase hex, literal UTF-8 for everything else", () => {
    const id = "a\"\\\b\t\n\f\r\u0001\u007f\u2028😀\ufffe";
    const json = "{\"id\":\"a\\\"\\\\\\b\\t\\n\\f\\r\\u0001\u007f\u2028😀\ufffe\",\"type\":\"p\"}";
    expect(elementDomId("x", node(id))).toBe("x-n-" + hex(json));
  });
  it("uses only [a-z0-9-]", () => { expect(elementDomId("g-1", node("s:<&\"'"))).toMatch(/^g-1-n-[0-9a-f]+$/); });
  it("validates the prefix: INVALID_VALUE", () => {
    for (const p of ["", "1a", "A", "a_b", "a".repeat(33), "-a"]) expect(err(() => elementDomId(p, node("i:1")))).toBe("INVALID_INPUT/INVALID_VALUE");
    expect(() => elementDomId("a" + "b".repeat(31), node("i:1"))).not.toThrow();
  });
  it("refuses malformed addresses: SCHEMA", () => {
    const bad: unknown[] = [null, 1, {}, { node: {} }, { node: { id: 1, type: "p" } }, { node: { id: "a", type: "p", extra: 1 } }, { edge: { ord: "0", rel: "r", src: { id: "a", type: "p" } } },
      { node: { id: "a", type: "p" }, edge: {} }, { node: { id: "a\ud800", type: "p" } }, { node: { id: "a", type: "\udc00" } }];
    for (const a of bad) expect(err(() => elementDomId("igr", a as never)), JSON.stringify(a)).toBe("INVALID_INPUT/SCHEMA");
  });
});

describe("decodeElementId", () => {
  it("round trips nodes and edges, including controls and astral scalars", () => {
    const as = [node("i:7"), node("s:\u0001\u2028😀\ufffe\"\\"), { edge: { ord: "3", rel: "R<&", src: { id: "s:a", type: "p" }, tgt: { id: "i:2", type: "q" } } }];
    for (const a of as) expect(decodeElementId("igr", elementDomId("igr", a))).toEqual(a);
    expect(decodeElementId("g-1", elementDomId("g-1", as[0]!))).toEqual(as[0]);
  });
  it("wrong prefix, other kind letters, non-canonical forms: undefined", () => {
    const good = elementDomId("igr", node("i:1", "person"));
    expect(decodeElementId("igr", good)).toBeDefined();
    expect(decodeElementId("xyz", good)).toBeUndefined();
    expect(decodeElementId("igr", good.replace("-n-", "-a-"))).toBeUndefined();
    expect(decodeElementId("igr", good.replace("-n-", "-z-"))).toBeUndefined();
    expect(decodeElementId("igr", good.replace("-n-", "-e-"))).toBeUndefined(); // node JSON under the edge kind
    expect(decodeElementId("igr", "igr-n-" + hex('{"id": "i:1","type":"p"}'))).toBeUndefined(); // space
    expect(decodeElementId("igr", "igr-n-" + hex('{"type":"p","id":"i:1"}'))).toBeUndefined(); // keys reordered
    expect(decodeElementId("igr", "igr-n-" + hex('{"id":"i:1","id":"i:2","type":"p"}'))).toBeUndefined(); // duplicate key
    expect(decodeElementId("igr", "igr-n-" + hex('{"id":"i:1","type":"p","x":"y"}'))).toBeUndefined(); // extra key
    expect(decodeElementId("igr", "igr-n-" + hex('{"id":"i:1"}'))).toBeUndefined(); // missing key
    expect(decodeElementId("igr", "igr-n-" + hex('{"id":7,"type":"p"}'))).toBeUndefined(); // number as id
    expect(decodeElementId("igr", "igr-n-" + good.slice(6).toUpperCase())).toBeUndefined(); // uppercase hex
    expect(decodeElementId("igr", good + "0")).toBeUndefined(); // odd
    expect(decodeElementId("igr", "igr-n-")).toBeUndefined(); // empty rest
    expect(decodeElementId("igr", "igr-n-c328")).toBeUndefined(); // invalid UTF-8
    expect(decodeElementId("igr", "igr-n-" + hex('{"id":"\\u0041","type":"p"}'))).toBeUndefined(); // non-canonical escape
  });
  it("a well-formed id naming no scene element still decodes (syntactic)", () => {
    expect(decodeElementId("igr", elementDomId("igr", node("i:99")))).toEqual(node("i:99"));
  });
  it("bounds: nesting of four levels is undefined", () => {
    expect(decodeElementId("igr", "igr-n-" + "61".repeat(10))).toBeUndefined();
    expect(decodeElementId("igr", "igr-n-" + hex('{"a":{"b":{"c":{"d":"x"}}}}'))).toBeUndefined();
  });
  it("a non-string argument is INVALID_INPUT/SCHEMA; never throws on a string", () => {
    expect(err(() => decodeElementId("igr", 5 as never))).toBe("INVALID_INPUT/SCHEMA");
    for (const s of ["", "igr", "igr-", "igr-n", "igr-n-zz", "\ud800", "igr-n-\ud800", "igr-n-" + "f".repeat(8)]) expect(() => decodeElementId("igr", s)).not.toThrow();
  });
});
