// packages/scene-core/test/snapshot.test.ts
import { describe, expect, it } from "vitest";
import { snapshotBytes } from "../src/snapshot.js";

describe("snapshotBytes", () => {
  it("returns an owned copy that later mutation of the input cannot change", () => {
    const src = new Uint8Array([1, 2, 3]);
    const snap = snapshotBytes(src);
    src.fill(9);
    expect(Array.from(snap)).toEqual([1, 2, 3]);
    expect(snap.buffer).not.toBe(src.buffer);
  });

  it("copies only the viewed range of a subarray", () => {
    const whole = new Uint8Array([0, 1, 2, 3, 4]);
    const snap = snapshotBytes(whole.subarray(1, 4));
    whole.fill(9);
    expect(Array.from(snap)).toEqual([1, 2, 3]);
    expect(snap.byteOffset).toBe(0);
    expect(snap.buffer.byteLength).toBe(3);
  });

  it("copies a Node Buffer instead of aliasing it", () => {
    const buf = Buffer.from([5, 6, 7]);
    const snap = snapshotBytes(buf);
    buf.fill(0);
    expect(Array.from(snap)).toEqual([5, 6, 7]);
  });

  it("rejects shared-memory-backed views, whose bytes can change under the copy", () => {
    expect(() => snapshotBytes(new Uint8Array(new SharedArrayBuffer(4)))).toThrowError(TypeError);
  });

  it("rejects anything that is not a Uint8Array", () => {
    for (const bad of ["abc", [1, 2], new ArrayBuffer(2), new Uint16Array(2), null, undefined]) {
      expect(() => snapshotBytes(bad as unknown as Uint8Array), String(bad)).toThrowError(TypeError);
    }
  });
});
