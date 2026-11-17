import { describe, expect, it } from "vitest";
import { JNum, parseJson } from "../src/json.js";

describe("token preserving JSON parser", () => {
  it("keeps number token text", () => {
    const v = parseJson("[0,-0,1.5,1e3,2.0,12]") as JNum[];
    expect(v.map((x) => x.token)).toEqual(["0", "-0", "1.5", "1e3", "2.0", "12"]);
    expect(v[0]).toBeInstanceOf(JNum);
  });
  it("reads duplicate keys last-wins and keeps __proto__ as data", () => {
    const o = parseJson('{"a":1,"a":2,"__proto__":3}') as Record<string, JNum>;
    expect(o["a"]!.token).toBe("2");
    expect(Object.keys(o).sort()).toEqual(["__proto__", "a"]);
    expect(Object.getPrototypeOf(o)).toBeNull();
  });
  it("parses strings with escapes, surrogate pairs and lone surrogates", () => {
    expect(parseJson('"a\\u0041\\n\\ud83d\\ude00"')).toBe("aA\n\u{1F600}");
    expect(parseJson('"\\ud800"')).toBe("\ud800");
  });
  it("accepts literals and nesting", () => {
    expect(parseJson(" [ true , false , null , { } , [ ] ] ")).toEqual([true, false, null, Object.create(null), []]);
  });
  it.each(["", "00", "+1", "01", "1.", ".5", "[1,]", '{"a":1,}', "[1 2]", '{"a" 1}', '{1:2}', "'a'", "tru", "nul", '"\u0001"', '"\\x"', '"\\u12"', "[", "{", "[1]x", "-", "1e", "NaN"])("rejects %j", (t) => {
    expect(() => parseJson(t)).toThrow();
  });
  it("is not recursive: 200000 nested arrays parse without a stack overflow", () => {
    const d = 200000;
    const v = parseJson("[".repeat(d) + "]".repeat(d));
    expect(Array.isArray(v)).toBe(true);
  });
});
