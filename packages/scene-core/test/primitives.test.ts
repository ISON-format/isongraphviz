// packages/scene-core/test/primitives.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/canonical.js";
import { compileScene } from "../src/compile.js";
import * as index from "../src/index.js";
import * as P from "../src/primitives.js";
import { verifyScene } from "../src/verify.js";
import { bytesOf, igsError, igsErrorAsync } from "./helpers.js";

const root = join(import.meta.dirname, "..");
const nest = (k: number): unknown => (k <= 0 ? [] : [nest(k - 1)]); // nest(k) has k + 1 levels: nest(63) = 64 levels, nest(64) = 65

describe("primitives subpath", () => {
  it("exports exactly the shared primitives", () => {
    expect(Object.keys(P).sort()).toEqual([
      "IDENTIFIER", "canonicalBytes", "canonicalBytesSigned", "canonicalize", "canonicalizeSigned", "cjViolation",
      "compareNodeRef", "compareUtf8", "decodeNodeId", "encodeNodeId", "hasLoneSurrogate", "labelOf", "nodeKey",
      "nodeRefFromWire", "nodeRefToWire", "sha256Hex", "snapshotBytes",
    ]);
  });

  it("declares the subpath in package.json and leaves the main export alone", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.exports["./primitives"]).toEqual({ types: "./dist/primitives.d.ts", import: "./dist/primitives.js" });
    expect(pkg.exports["."]).toEqual({ types: "./dist/index.d.ts", import: "./dist/index.js" });
  });

  it("does not change the main entry's runtime exports", () => {
    expect(Object.keys(index).sort()).toEqual(["HashUnavailableError", "IgsError", "compileScene", "compileSceneFromText", "resolveInScene", "resolveInSource", "verifyScene"]);
  });
});

describe("canonicalize keeps IGS-CJ/1 exactly; canonicalizeSigned is the explicit, separate IGL-CJ/1 variant", () => {
  it("canonicalize still rejects negative numbers, -0, floats and unsafe integers", () => {
    for (const v of [-5, -0, 1.5, 2 ** 53, Number.NaN, Infinity]) {
      const e = igsError(() => P.canonicalize(v));
      expect([e.code, e.reason], String(v)).toEqual(["INVALID_SCENE", "INVALID_NUMBER"]);
    }
  });

  it("canonicalizeSigned accepts negative safe integers anywhere in the value", () => {
    expect(P.canonicalizeSigned(-5)).toBe("-5");
    expect(P.canonicalizeSigned({ b: [-1, 2], a: -9007199254740991 })).toBe('{"a":-9007199254740991,"b":[-1,2]}');
  });

  it("canonicalizeSigned still rejects -0, floats, NaN, Infinity and unsafe integers", () => {
    for (const v of [-0, 1.5, -1.5, 2 ** 53, -(2 ** 53), Number.NaN, Infinity, -Infinity]) {
      const e = igsError(() => P.canonicalizeSigned(v));
      expect([e.code, e.reason], String(v)).toEqual(["INVALID_SCENE", "INVALID_NUMBER"]);
    }
  });

  it("both reject a lone surrogate the same way", () => {
    expect(igsError(() => P.canonicalizeSigned("\ud800")).reason).toBe("INVALID_STRING");
    expect(igsError(() => P.canonicalize("\ud800")).reason).toBe("INVALID_STRING");
  });

  it("for non-negative values the signed output equals the IGS output (200 generated values)", () => {
    let s = 7;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 200; i++) {
      const v = { z: Math.floor(rnd() * 1e9), a: [Math.floor(rnd() * 10), "é😀", rnd() < 0.5], m: { k: Math.floor(rnd() * 2 ** 40) } };
      expect(P.canonicalizeSigned(v)).toBe(P.canonicalize(v));
    }
  });

  it("canonicalize reproduces the frozen O1 scene bytes", async () => {
    const r = await compileScene(bytesOf("o1-basic.source.ison"), "ison-v1");
    expect(new TextDecoder().decode(r.sceneBytes)).toBe(canonicalize(r.scene as never));
    expect(r.sceneSha256).toBe("e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc");
  });

  it("the Bytes variants encode the same text as UTF-8", () => {
    expect(new TextDecoder().decode(P.canonicalBytesSigned({ a: -1 }))).toBe('{"a":-1}');
    expect(new TextDecoder().decode(P.canonicalBytes({ a: 1 }))).toBe('{"a":1}');
  });
});

describe("cjViolation is the non-throwing domain check, and agrees with verifyScene's own extension check", () => {
  const limits = { signed: false, maxDepth: 64 };
  it("returns null for in-domain values, including 64 nested levels", () => {
    for (const v of [1, 0, "a", true, [1, [2]], { k: 1 }, nest(63)]) expect(P.cjViolation(v, "$", limits), JSON.stringify(v)).toBeNull();
  });
  it("names the first violation and its path", () => {
    expect(P.cjViolation({ a: [1, 1.5] }, "$", limits)).toEqual({ reason: "INVALID_NUMBER", path: "$.a[1]" });
    expect(P.cjViolation("\ud800", "$", limits)).toEqual({ reason: "INVALID_STRING", path: "$" });
    expect(P.cjViolation(null, "$", limits)).toEqual({ reason: "INVALID_VALUE", path: "$" });
    expect(P.cjViolation(nest(64), "$", limits)?.reason).toBe("TOO_DEEP");
  });
  it("signed mode permits negatives, never -0", () => {
    expect(P.cjViolation(-1, "$", limits)?.reason).toBe("INVALID_NUMBER");
    expect(P.cjViolation(-1, "$", { signed: true, maxDepth: 64 })).toBeNull();
    expect(P.cjViolation(-0, "$", { signed: true, maxDepth: 64 })?.reason).toBe("INVALID_NUMBER");
  });
  it("gives the same verdict as verifyScene for an x- extension value", async () => {
    const { scene } = await compileScene(bytesOf("o1-basic.source.ison"), "ison-v1");
    const withValue = (v: unknown) => new TextEncoder().encode(JSON.stringify({ ...scene, nodes: [{ ...scene.nodes[0], "x-v": v }, ...scene.nodes.slice(1)] }));
    const bad: unknown[] = [1.5, -1, 2 ** 53, "\ud800", null, nest(64)];
    const good: unknown[] = [1, "a", true, [1, [2]], nest(63), { k: 1 }];
    for (const v of bad) {
      const mine = P.cjViolation(v, "$", limits);
      const theirs = await igsErrorAsync(() => verifyScene(withValue(v)));
      expect(mine?.reason, JSON.stringify(v)).toBe(theirs.reason);
    }
    for (const v of good) {
      expect(P.cjViolation(v, "$", limits), JSON.stringify(v)).toBeNull();
      await expect(verifyScene(withValue(v))).resolves.toBeDefined();
    }
  });
});
