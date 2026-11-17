// src/types.ts — the public types of design 29 sections 3, 4, 6 and 12.
import type { WireEdgeAddress, WireNodeRef } from "isongraph-visualize-scene-core";
export type { WireEdgeAddress, WireNodeRef };

export type Group = { members: WireNodeRef[]; label?: string };
export type LabelPolicy = { full_degree: number; full_zoom_milli: number; short_degree: number; short_zoom_milli: number };
export type EdgePolicy = { keep_forest: boolean; max_view_edges: number };
export interface LODState {
  collapsed: Group[];
  edge_policy?: EdgePolicy;
  label_policy: LabelPolicy;
  layout_sha256: string;
  lod: "IGLOD/1";
  pinned: WireNodeRef[];
  scene_sha256: string;
  zoom_milli: number;
  [xKey: `x-${string}`]: unknown;
}

export type AggRef = { agg: string };
export type ViewRef = WireNodeRef | AggRef;
export type LabelLevel = "hidden" | "short" | "full";
export type RelCount = { count: number; rel: string };
export interface ViewNode { ref: WireNodeRef; x: number; y: number; label_level: LabelLevel; elided_edges?: number }
export interface Aggregate {
  id: string; hidden: WireNodeRef[]; exposed?: WireNodeRef[]; member_count: number; children?: string[]; label?: string;
  anchor: { x: number; y: number }; internal_edges: { count: number; rel_counts: RelCount[] }; label_level: LabelLevel; elided_edges?: number;
}
export interface ViewEdge { ref: WireEdgeAddress }
export interface AggregateEdge { src: ViewRef; tgt: ViewRef; count: number; rel_counts: RelCount[] }
export interface Elided { items: number; scene_edges: number; rel_counts: RelCount[] }
export interface View {
  address_scheme: "igs-addr/1"; igview: "IGLOD-VIEW/1"; scale: 1000; scene_sha256: string; layout_sha256: string; state_sha256: string;
  directed: boolean; nodes: ViewNode[]; aggregates: Aggregate[]; edges: ViewEdge[]; aggregate_edges: AggregateEdge[]; elided?: Elided;
}
export interface ViewResult { view: View; viewBytes: Uint8Array; viewSha256: string; stateSha256: string }

export type RuleSpec = { rule: "pendant-fold/1"; min_leaves: number } | { rule: "components/1"; min_size: number };
export type GroupCatalog = { scene_sha256: string; groups: Group[] };
