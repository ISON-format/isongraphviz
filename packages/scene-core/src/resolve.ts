// packages/scene-core/src/resolve.ts
import { assembleScene } from "./assemble.js";
import { IgsError } from "./errors.js";
import { sha256Hex } from "./hash.js";
import { edgeFromWire, edgeKey, nodeKey, nodeRefFromWire } from "./identity.js";
import { loadModel } from "./model.js";
import { snapshotBytes } from "./snapshot.js";
import type { ObjectRef, ResolvedIdentity, Scene, SceneEdge, SceneNode, WireEdgeAddress, WireNodeRef } from "./types.js";

const isEdgeAddress = (a: WireNodeRef | WireEdgeAddress): a is WireEdgeAddress => "src" in a;
const isEdgeObject = (o: SceneNode | SceneEdge): o is SceneEdge => "src" in o.ref;

/** The stored SceneNode or SceneEdge with this typed address (`18` section 9), or UNRESOLVED_ADDRESS. */
export function resolveInScene(scene: Scene, address: WireNodeRef | WireEdgeAddress): SceneNode | SceneEdge {
  try {
    if (isEdgeAddress(address)) {
      const key = edgeKey(edgeFromWire(address));
      const hit = scene.edges.find((e) => edgeKey(edgeFromWire(e.ref)) === key);
      if (hit) return hit;
    } else {
      const key = nodeKey(nodeRefFromWire(address));
      const hit = scene.nodes.find((n) => nodeKey(nodeRefFromWire(n.ref)) === key);
      if (hit) return hit;
    }
  } catch {
    /* a malformed address cannot name an object */
  }
  throw new IgsError("UNRESOLVED_ADDRESS", undefined, undefined, describeAddress(address));
}

/** Error text for an address that named nothing. It must not throw: the address is untrusted (circular, BigInt, hostile toJSON). */
function describeAddress(address: unknown): string {
  try {
    return JSON.stringify(address, (_key, v: unknown) => (typeof v === "bigint" ? `${v}n` : v)) ?? String(address);
  } catch {
    return "<address cannot be described>";
  }
}

const malformedRef = (path: string, detail: string): IgsError => new IgsError("UNRESOLVED_ADDRESS", "MALFORMED_REFERENCE", path, detail);
const isPlainObject = (v: unknown): v is Record<string, unknown> => Object.prototype.toString.call(v) === "[object Object]";

/** Exactly these own keys, no more and no fewer; the values are read once. */
function exactObject(v: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!isPlainObject(v)) throw malformedRef(path, "object expected");
  const own = Object.keys(v);
  for (const k of own) if (!keys.includes(k)) throw malformedRef(`${path}.${k}`, "unexpected field");
  for (const k of keys) if (!own.includes(k)) throw malformedRef(`${path}.${k}`, "missing field");
  return v;
}

function ownString(v: unknown, path: string): string {
  if (typeof v !== "string") throw malformedRef(path, "string expected");
  return v;
}

function ownNode(v: unknown, path: string): WireNodeRef {
  const o = exactObject(v, ["id", "type"], path);
  return { id: ownString(o["id"], `${path}.id`), type: ownString(o["type"], `${path}.type`) };
}

/**
 * A synchronous, validated, owned copy of the requested identity. The shape is strict (additional fields are an error, not
 * ignored), and the copy shares nothing with the caller's object, so mutating `ref` while a call is pending changes nothing.
 * Whether the ids inside are well formed is decided later, as UNRESOLVED_ADDRESS, exactly as for an absent object.
 */
function snapshotObjectRef(ref: ObjectRef): ObjectRef {
  const top = exactObject(ref, ["artifact_sha256", "address"], "ref");
  const artifact_sha256 = ownString(top["artifact_sha256"], "ref.artifact_sha256");
  const a = top["address"];
  if (!isPlainObject(a)) throw malformedRef("ref.address", "object expected");
  if ("src" in a || "tgt" in a || "rel" in a || "ord" in a) {
    const e = exactObject(a, ["ord", "rel", "src", "tgt"], "ref.address");
    return {
      artifact_sha256,
      address: { ord: ownString(e["ord"], "ref.address.ord"), rel: ownString(e["rel"], "ref.address.rel"), src: ownNode(e["src"], "ref.address.src"), tgt: ownNode(e["tgt"], "ref.address.tgt") },
    };
  }
  return { artifact_sha256, address: ownNode(a, "ref.address") };
}

/**
 * Guarantees exact artifact identity and typed-object identity. It does NOT return
 * original property values: the qualified parser may round numeric properties.
 * The returned address is the scene's stored canonical reference, never the caller's object.
 *
 * Both inputs are snapshotted synchronously, before the first await: the source bytes and the requested identity
 * belong to one invocation, so the caller changing either while the digest is pending cannot change the answer.
 */
export async function resolveInSource(bytes: Uint8Array, ref: ObjectRef): Promise<ResolvedIdentity> {
  const input = snapshotBytes(bytes); // first action: hash, load and resolve all see the same bytes
  const wanted = snapshotObjectRef(ref); // second action, still synchronous: the requested identity is fixed too
  if ((await sha256Hex(input)) !== wanted.artifact_sha256) throw new IgsError("SOURCE_MISMATCH");
  const scene = assembleScene(wanted.artifact_sha256, loadModel(input));
  const found = resolveInScene(scene, wanted.address);
  return { kind: isEdgeObject(found) ? "edge" : "node", address: found.ref, artifact_sha256: scene.source.artifact_sha256 };
}
