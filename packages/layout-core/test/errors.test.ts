import { describe, expect, it } from "vitest";
import { HashUnavailableError, IgsError, LayoutError } from "../src/errors.js";

describe("LayoutError", () => {
  it("carries code, reason and path and joins the defined parts in the message", () => {
    const e = new LayoutError("INVALID_LAYOUT", "SCHEMA", "$.nodes", "array expected");
    expect([e.code, e.reason, e.path, e.name]).toEqual(["INVALID_LAYOUT", "SCHEMA", "$.nodes", "LayoutError"]);
    expect(e.message).toBe("INVALID_LAYOUT | SCHEMA | $.nodes | array expected");
    expect(new LayoutError("SCENE_MISMATCH").message).toBe("SCENE_MISMATCH");
  });
  it("is an Error and re-exports the scene-core error classes", () => {
    expect(new LayoutError("RESOURCE_LIMIT")).toBeInstanceOf(Error);
    expect(new IgsError("INVALID_SCENE")).toBeInstanceOf(Error);
    expect(new HashUnavailableError()).toBeInstanceOf(Error);
  });
});
