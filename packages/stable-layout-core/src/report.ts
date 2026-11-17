// 28-STABLE-LAYOUT-DESIGN.md sections 8 and 9: displacement records, aggregates, extent, transform hint, and the IGLS/1 writer.
import { canonicalBytesSigned, sha256Hex, type CJValue } from "isongraph-visualize-scene-core/primitives";
import type { DiffCore } from "./diff.js";
import type { DrawingIdx } from "./admit.js";
import { StableLayoutError } from "./errors.js";
import { divRound, floorDiv, isqrt } from "./intmath.js";
import { PLACEMENT_ALGORITHM, type PlacedRecord } from "./placement.js";
import type { DisplacementReport, Extent, NodeRecord, PlacementConfig, Present, ReportMode, WireEdgeAddress, WireNodeRef } from "./types.js";

const wire = (r: WireNodeRef): WireNodeRef => ({ id: r.id, type: r.type });
export const wireEdge = (e: WireEdgeAddress): WireEdgeAddress => ({ ord: e.ord, rel: e.rel, src: wire(e.src), tgt: wire(e.tgt) });

/** dist = isqrt(dx*dx + dy*dy) in integer thousandths (section 4.2). */
export function distOf(dx: number, dy: number): number {
  const a = BigInt(dx), b = BigInt(dy);
  return Number(isqrt(a * a + b * b));
}

/** Section 8.1, computed from the node records alone (so the standalone verifier and the producer share one definition). */
export function aggregateOf(nodes: readonly NodeRecord[], mode: ReportMode): DisplacementReport["aggregate"] {
  let common = 0, added = 0, removed = 0, moved = 0, maxDist = 0, maxOffset = 0;
  let sum = 0n, sumSq = 0n;
  for (const r of nodes) {
    if (r.status === "kept") {
      common++;
      if (r.dist > 0) moved++;
      if (r.dist > maxDist) maxDist = r.dist;
      sum += BigInt(r.dist);
      sumSq += BigInt(r.dx) * BigInt(r.dx) + BigInt(r.dy) * BigInt(r.dy);
    } else if (r.status === "added") {
      added++;
      if (mode === "incremental" && "offset" in r && r.offset > maxOffset) maxOffset = r.offset;
    } else removed++;
  }
  const c = BigInt(common);
  return {
    added, common, max_dist: maxDist, max_offset: mode === "incremental" ? maxOffset : 0,
    mean_dist: common === 0 ? 0 : Number(floorDiv(sum, c)),
    moved, moved_ppm: common === 0 ? 0 : Number(floorDiv(1_000_000n * BigInt(moved), c)),
    removed, rms_dist: common === 0 ? 0 : Number(isqrt(floorDiv(sumSq, c))),
    sum_dist: sum.toString(), sum_dist_sq: sumSq.toString(),
  };
}

function extentOver(points: readonly (readonly [number, number])[]): Present<Extent> {
  if (points.length === 0) return { present: false };
  let minX = points[0]![0], maxX = minX, minY = points[0]![1], maxY = minY;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { present: true, min_x: minX, min_y: minY, max_x: maxX, max_y: maxY };
}

/** Extent of the new layout (kept and added records) and of the previous layout (kept and removed records). */
export function extentsOf(nodes: readonly NodeRecord[]): DisplacementReport["extent"] {
  const next: [number, number][] = [], previous: [number, number][] = [];
  for (const r of nodes) {
    if (r.status !== "removed") next.push([r.x, r.y]);
    if (r.status !== "added") previous.push([r.x_prev, r.y_prev]);
  }
  return { next: extentOver(next), previous: extentOver(previous) };
}

/** Section 8.3: always the general formula, in every mode; absent when there is no common node. */
export function transformOf(nodes: readonly NodeRecord[]): DisplacementReport["transform_hint"] {
  let c = 0n, sx = 0n, sy = 0n;
  for (const r of nodes) if (r.status === "kept") { c++; sx += BigInt(r.x) - BigInt(r.x_prev); sy += BigInt(r.y) - BigInt(r.y_prev); }
  if (c === 0n) return { present: false };
  return { present: true, dx: Number(divRound(sx, c)), dy: Number(divRound(sy, c)) };
}

export interface BuildArgs {
  mode: ReportMode;
  prev: DrawingIdx | null;
  next: DrawingIdx;
  core: DiffCore;
  /** The placement config, recorded iff mode is incremental and at least one node was added. */
  placement: PlacementConfig | null;
  /** Placement records by node index of the new scene (incremental mode only). */
  placed: readonly (PlacedRecord | undefined)[] | null;
}

export function buildReport(a: BuildArgs): DisplacementReport {
  const { prev, next, core } = a;
  const nodes: NodeRecord[] = core.union.map((u): NodeRecord => {
    if (u.status === "removed") {
      const n = prev!.nodes[u.pi]!;
      return { ref: wire(n.ref), status: "removed", x_prev: prev!.x[u.pi]!, y_prev: prev!.y[u.pi]! };
    }
    const n = next.nodes[u.ni]!;
    const x = next.x[u.ni]!, y = next.y[u.ni]!;
    if (u.status === "kept") {
      const xp = prev!.x[u.pi]!, yp = prev!.y[u.pi]!;
      const dx = x - xp, dy = y - yp;
      return { dist: distOf(dx, dy), dx, dy, ref: wire(n.ref), status: "kept", x, x_prev: xp, y, y_prev: yp };
    }
    if (a.mode === "incremental") {
      const p = a.placed?.[u.ni];
      if (p === undefined) throw new StableLayoutError("INTERNAL", "ROUNDTRIP_MISMATCH", undefined, "added node without a placement record");
      return { anchor_kind: p.anchor_kind, anchor_x: p.anchor_x, anchor_y: p.anchor_y, direction: p.direction, offset: p.offset, ref: wire(n.ref), ring: p.ring, status: "added", wave: p.wave, x, y };
    }
    return { ref: wire(n.ref), status: "added", x, y };
  });
  const placement: DisplacementReport["placement"] = a.placement !== null && a.mode === "incremental" && core.added > 0
    ? { present: true, algorithm: PLACEMENT_ALGORITHM, max_rings: a.placement.max_rings, min_separation: a.placement.min_separation, radius: a.placement.radius }
    : { present: false };
  return {
    address_scheme: "igs-addr/1",
    aggregate: aggregateOf(nodes, a.mode),
    edges: { added: core.edgesAdded.map((e) => wireEdge(e.wire)), common: core.edgesCommon, removed: core.edgesRemoved.map((e) => wireEdge(e.wire)) },
    extent: extentsOf(nodes),
    igls: "IGLS/1",
    mode: a.mode,
    next: { directed: next.directed, layout_sha256: next.layoutSha256, scene_sha256: next.sceneSha256 },
    nodes,
    placement,
    previous: prev === null ? { present: false } : { directed: prev.directed, layout_sha256: prev.layoutSha256, present: true, scene_sha256: prev.sceneSha256 },
    scale: 1000,
    transform_hint: transformOf(nodes),
  };
}

/** IGL-CJ/1 bytes of a report (the producer's own writer failing is INTERNAL / CANONICAL_WRITE) and its SHA-256. */
export async function writeReport(report: DisplacementReport): Promise<{ bytes: Uint8Array; sha256: string }> {
  let bytes: Uint8Array;
  try { bytes = canonicalBytesSigned(report as unknown as CJValue); }
  catch (e) { throw new StableLayoutError("INTERNAL", "CANONICAL_WRITE", undefined, e instanceof Error ? e.message : String(e)); }
  return { bytes, sha256: await sha256Hex(bytes) };
}

/** C4 (section 12.3): 3 * (n_prev + n_next). */
export const reportCharge = (prev: DrawingIdx | null, next: DrawingIdx): number => 3 * ((prev === null ? 0 : prev.nodes.length) + next.nodes.length);
