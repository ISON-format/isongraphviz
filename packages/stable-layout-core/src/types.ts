import type { ForceBudget, ForceConfig, LayoutResult } from "isongraph-visualize-layout-core";
import type { WireEdgeAddress, WireNodeRef } from "isongraph-visualize-scene-core";
import type { StableBudget } from "./limits.js";

export type { StableBudget, WireEdgeAddress, WireNodeRef };

/** The persisted form of a drawing: the frozen pair of artifacts. */
export interface PreviousDrawing { sceneBytes: Uint8Array; layoutBytes: Uint8Array }

export interface PlacementConfig { radius: number; min_separation: number; max_rings: number }

/** An inspection value, never accepted as an argument (section 2.1). */
export interface LayoutSnapshot {
  readonly sceneSha256: string; readonly layoutSha256: string; readonly directed: boolean;
  readonly nodes: readonly { readonly ref: WireNodeRef; readonly x: number; readonly y: number }[];
  readonly edges: readonly WireEdgeAddress[];
}

/** Section 3.1: closed, IGL-CJ/1. */
export interface SceneDiff {
  directed: { next: boolean; previous: boolean };
  edges: { added: WireEdgeAddress[]; common: number; removed: WireEdgeAddress[] };
  identical: boolean;
  igls_diff: "IGLS-DIFF/1";
  nodes: { added: WireNodeRef[]; kept: WireNodeRef[]; removed: WireNodeRef[] };
}

export type ReportMode = "incremental" | "cold" | "measured";
export type Present<T> = { present: false } | ({ present: true } & T);
export interface Extent { min_x: number; min_y: number; max_x: number; max_y: number }

export interface KeptRecord { dist: number; dx: number; dy: number; ref: WireNodeRef; status: "kept"; x: number; x_prev: number; y: number; y_prev: number }
export interface AddedPlacedRecord {
  anchor_kind: "neighbours" | "seed"; anchor_x: number; anchor_y: number; direction: number; offset: number; ref: WireNodeRef; ring: number;
  status: "added"; wave: number; x: number; y: number;
}
export interface AddedBareRecord { ref: WireNodeRef; status: "added"; x: number; y: number }
export interface RemovedRecord { ref: WireNodeRef; status: "removed"; x_prev: number; y_prev: number }
export type NodeRecord = KeptRecord | AddedPlacedRecord | AddedBareRecord | RemovedRecord;

export interface DisplacementReport {
  address_scheme: "igs-addr/1";
  aggregate: {
    added: number; common: number; max_dist: number; max_offset: number; mean_dist: number; moved: number; moved_ppm: number;
    removed: number; rms_dist: number; sum_dist: string; sum_dist_sq: string;
  };
  edges: { added: WireEdgeAddress[]; common: number; removed: WireEdgeAddress[] };
  extent: { next: Present<Extent>; previous: Present<Extent> };
  igls: "IGLS/1";
  mode: ReportMode;
  next: { directed: boolean; layout_sha256: string; scene_sha256: string };
  nodes: NodeRecord[];
  placement: Present<{ algorithm: "igl-stable-place/1"; max_rings: number; min_separation: number; radius: number }>;
  previous: Present<{ directed: boolean; layout_sha256: string; scene_sha256: string }>;
  scale: 1000;
  transform_hint: Present<{ dx: number; dy: number }>;
}

export interface StableOptions {
  placement?: PlacementConfig; coldStart?: ForceConfig; budget?: Partial<StableBudget>; forceBudget?: Partial<ForceBudget>;
  relax?: never; groups?: never; viewport?: never;
}
export interface StableResult {
  mode: "incremental" | "cold"; layout: LayoutResult; report: DisplacementReport; reportBytes: Uint8Array; reportSha256: string;
  drawing: PreviousDrawing; diff: SceneDiff; stats: { work: number; waves: number; placed: number };
}
export interface MeasureResult { report: DisplacementReport; reportBytes: Uint8Array; reportSha256: string; stats: { work: number } }
