// src/aggregate.ts — aggregate identity (design 29 section 2): igagg1: + SHA-256 over (scene_sha256, all leaf members).
import { canonicalBytes, compareNodeRef, nodeRefFromWire, sha256Hex, type CJValue } from "isongraph-visualize-scene-core/primitives";
import { LODError } from "./errors.js";
import { checkHash, checkRef } from "./state.js";
import type { WireNodeRef } from "./types.js";

export const AGG_DOMAIN = "IGLOD-AGG/1";
export const AGG_PREFIX = "igagg1:";
const AGG_ID = /^igagg1:[0-9a-f]{64}$/;

/** Exact match of `^igagg1:[0-9a-f]{64}$`: nothing before or after (no trailing newline). */
export const isAggregateId = (s: unknown): boolean => typeof s === "string" && AGG_ID.test(s) && s.length === 71;

/** IGS-CJ/1 bytes of the preimage. The members must already be well formed wire references in NodeRef/2 order (the scene's own order). */
export function aggregatePreimage(sceneSha256: string, sortedMembers: readonly WireNodeRef[]): Uint8Array {
  return canonicalBytes({ agg: AGG_DOMAIN, members: sortedMembers.map((m) => ({ id: m.id, type: m.type })), scene_sha256: sceneSha256 } as CJValue);
}

export const idFromHex = (hex: string): string => AGG_PREFIX + hex;

/**
 * The id of the group whose leaf set is `members` in the scene with hash `sceneSha256`. Sorts the members itself (NodeRef/2),
 * rejects duplicates; takes only the hash, so it cannot check that the members exist in a scene.
 */
export async function deriveAggregateId(sceneSha256: string, members: readonly WireNodeRef[]): Promise<string> {
  const h = checkHash(sceneSha256, "sceneSha256");
  if (!Array.isArray(members)) throw new LODError("INVALID_LOD", "SCHEMA", "members", "array expected");
  const owned = members.map((m, i) => checkRef(m, `members[${i}]`)); // an owned copy: every caller property is read here, before the first await
  const sorted = owned.map((ref) => ({ ref, dec: nodeRefFromWire(ref) })).sort((a, b) => compareNodeRef(a.dec, b.dec));
  for (let i = 1; i < sorted.length; i++) if (compareNodeRef(sorted[i - 1]!.dec, sorted[i]!.dec) === 0) throw new LODError("INVALID_GROUP", "DUPLICATE_MEMBER", `members[${i}]`);
  return idFromHex(await sha256Hex(aggregatePreimage(h, sorted.map((x) => x.ref))));
}
