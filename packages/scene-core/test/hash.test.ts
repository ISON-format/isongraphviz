// packages/scene-core/test/hash.test.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HashUnavailableError } from "../src/errors.js";
import { resolveSubtle, sha256Hex } from "../src/hash.js";
import { bytesOf, ORACLES } from "./helpers.js";

describe("sha256Hex", () => {
  it("matches the empty-input digest", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches every file in oracles/SHA256SUMS", async () => {
    const lines = readFileSync(join(ORACLES, "SHA256SUMS"), "utf8").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(32);
    for (const line of lines) {
      const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
      expect(m, line).not.toBeNull();
      expect(await sha256Hex(bytesOf(m![2] as string)), m![2]).toBe(m![1]);
    }
  });

  it("hashes the bytes as they were when called, even if the caller mutates the array while the call is pending", async () => {
    const original = [1, 2, 3, 4];
    const expected = createHash("sha256").update(Uint8Array.from(original)).digest("hex"); // independent reference
    const bytes = Uint8Array.from(original);
    const pending = sha256Hex(bytes);
    bytes.fill(9); // the digest has not been taken yet
    expect(await pending).toBe(expected);
  });
});

describe("resolveSubtle", () => {
  const fake = { digest: async () => new ArrayBuffer(0) };

  it("prefers the host WebCrypto", async () => {
    const s = await resolveSubtle({ crypto: { subtle: fake } }, async () => { throw new Error("must not load"); });
    expect(s).toBe(fake);
  });

  it("falls back to node:crypto webcrypto when the host has none", async () => {
    const s = await resolveSubtle({}, async () => ({ webcrypto: { subtle: fake } }));
    expect(s).toBe(fake);
  });

  it("reports HashUnavailableError when neither exists (insecure browser context)", async () => {
    await expect(resolveSubtle({ crypto: {} }, async () => { throw new Error("no node"); })).rejects.toBeInstanceOf(HashUnavailableError);
    await expect(resolveSubtle({}, async () => ({}))).rejects.toBeInstanceOf(HashUnavailableError);
  });
});
