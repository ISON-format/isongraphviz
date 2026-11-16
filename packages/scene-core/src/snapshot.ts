// packages/scene-core/src/snapshot.ts
const tag = (v: unknown): string => Object.prototype.toString.call(v);

/**
 * A synchronous, owned copy of the caller's bytes. Public async functions call this as their FIRST action,
 * so everything after the first await sees one fixed byte sequence. `new Uint8Array(typedArray)` always
 * allocates a new buffer (unlike Buffer.prototype.slice, which aliases), and the tag test also accepts a
 * Uint8Array from another realm.
 */
export function snapshotBytes(input: Uint8Array): Uint8Array {
  if (tag(input) !== "[object Uint8Array]") throw new TypeError("source bytes must be a Uint8Array");
  if (tag(input.buffer) === "[object SharedArrayBuffer]") {
    throw new TypeError("shared-memory input is not supported: its bytes can change while they are being read");
  }
  return new Uint8Array(input);
}
