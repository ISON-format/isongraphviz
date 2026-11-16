// packages/scene-core/src/compile.ts
import { assembleScene, sceneToBytes } from "./assemble.js";
import { hasLoneSurrogate } from "./canonical.js";
import { IgsError } from "./errors.js";
import { sha256Hex } from "./hash.js";
import { loadModel } from "./model.js";
import { snapshotBytes } from "./snapshot.js";
import type { SceneCompilation } from "./types.js";

/**
 * Normative entry point: exact source bytes plus the explicit profile.
 * The caller's array is copied before anything else happens, so the bytes that are qualified, loaded and
 * hashed are one fixed sequence even if the caller mutates its array while this call is pending.
 */
export async function compileScene(source: Uint8Array, profile: "ison-v1"): Promise<SceneCompilation> {
  const input = snapshotBytes(source);
  if ((profile as string) !== "ison-v1") throw new IgsError("UNSUPPORTED_SERIALIZATION_PROFILE", undefined, undefined, String(profile));
  const model = loadModel(input);
  const artifactSha256 = await sha256Hex(input);
  const scene = assembleScene(artifactSha256, model);
  const sceneBytes = sceneToBytes(scene);
  return { scene, sceneBytes, sceneSha256: await sha256Hex(sceneBytes), artifactSha256 };
}

/** Convenience: encodes the text as UTF-8 and runs the byte path on the encoded bytes. */
export async function compileSceneFromText(text: string, profile: "ison-v1"): Promise<SceneCompilation> {
  if (hasLoneSurrogate(text)) throw new IgsError("MALFORMED_SOURCE", "INVALID_ENCODING", undefined, "lone surrogate");
  if (text.charCodeAt(0) === 0xfeff) throw new IgsError("MALFORMED_SOURCE", "INVALID_ENCODING", undefined, "byte-order mark");
  return compileScene(new TextEncoder().encode(text), profile);
}
