// src/types.ts
import type { Scene, WireNodeRef } from "isongraph-visualize-scene-core";

export type FamilyName = "FORCE" | "FIXED" | "HIERARCHICAL" | "RADIAL" | "COMPOUND" | "STABLE";
export interface ForceConfig { width: number; height: number; margin: number; iterations: number; seed: number }
export interface Policy { family: FamilyName; algorithm: string; config: Record<string, number> }
export interface LayoutNode { ref: WireNodeRef; x: number; y: number; [xKey: `x-${string}`]: unknown }
export interface Layout {
  address_scheme: "igs-addr/1";
  igl: "IGL/1";
  nodes: LayoutNode[];
  policy: Policy;
  scale: 1000;
  scene_sha256: string;
  [xKey: `x-${string}`]: unknown;
}
export interface FixedPosition { ref: WireNodeRef; x: number; y: number }
export interface ForceBudget { maxNodes: number; maxWork: number }
export interface ForceOptions { budget?: Partial<ForceBudget> }
export interface LayoutResult { layout: Layout; layoutBytes: Uint8Array; layoutSha256: string; sceneSha256: string }
export interface BoundLayout { scene: Scene; sceneSha256: string; layout: Layout; layoutSha256: string }
