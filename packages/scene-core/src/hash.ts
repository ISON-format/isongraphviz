// packages/scene-core/src/hash.ts
import { HashUnavailableError } from "./errors.js";
import { snapshotBytes } from "./snapshot.js";

export interface Digester { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> }
type CryptoHost = { crypto?: { subtle?: Digester } };
type NodeCryptoModule = { webcrypto?: { subtle?: Digester } };

/** Host WebCrypto first, then node:crypto's webcrypto, and nothing else. */
export async function resolveSubtle(host: CryptoHost, loadNodeCrypto: () => Promise<NodeCryptoModule>): Promise<Digester> {
  const direct = host.crypto?.subtle;
  if (direct) return direct;
  try {
    const m = await loadNodeCrypto();
    if (m.webcrypto?.subtle) return m.webcrypto.subtle;
  } catch {
    /* not a Node environment */
  }
  throw new HashUnavailableError();
}

// A non-literal specifier keeps bundlers from trying to resolve a Node builtin for the browser.
const NODE_CRYPTO: string = "node:crypto";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = snapshotBytes(bytes); // first action: the digest below must describe the bytes as they were when called
  const subtle = await resolveSubtle(globalThis as unknown as CryptoHost, () => import(/* @vite-ignore */ NODE_CRYPTO) as Promise<NodeCryptoModule>);
  const digest = new Uint8Array(await subtle.digest("SHA-256", input));
  let out = "";
  for (const b of digest) out += b.toString(16).padStart(2, "0");
  return out;
}
