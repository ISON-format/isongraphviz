// Types of demo/playground-lib.mjs (the pure helpers of the playground page; NON-NORMATIVE demo code).
export type ElementKind = "node" | "edge";
export interface LibNode { index: number; ref: { id: string; type: string }; category: string; label: string; x: number; y: number; degree: number }
export interface LibEdge { index: number; ref: { ord: string; rel: string; src: { id: string; type: string }; tgt: { id: string; type: string } }; label: string; src: number; tgt: number }
export interface LibModel { nodes: readonly LibNode[]; edges: readonly LibEdge[]; bounds?: { min_x: number; min_y: number; max_x: number; max_y: number } }
export interface Visible { nodes: readonly boolean[]; edges: readonly boolean[] }
export interface Viewport { center_x: number; center_y: number; width: number; height: number; zoom: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Described { kind: ElementKind; index: number; title: string; subtitle: string }
export interface SearchResult { terms: string[]; total: number; hidden: number; items: Described[]; all: { kind: ElementKind; index: number }[] }
export interface HighlightSet { nodes: Set<number>; edges: Set<number>; incident: Set<number> }
export interface HiddenSets { nodes: number[]; edges: number[] }

export const ZOOM_MIN: number;
export const ZOOM_MAX: number;
export const MAX_RESULTS: number;
export function queryTerms(query: string): string[];
export function searchFields(model: LibModel, kind: ElementKind, index: number): string[];
export function searchElements(model: LibModel, query: string, options?: { limit?: number; vis?: Visible }): SearchResult;
export function describeElement(model: LibModel, kind: ElementKind, index: number): Described;
export function tooltipRows(model: LibModel, kind: ElementKind, index: number): { heading: string; rows: [string, string][] };
export function neighbourhood(model: LibModel, target: { kind: ElementKind; index: number }, vis?: Visible): HighlightSet;
export function matchSet(items: { kind: ElementKind; index: number }[], vis?: Visible): HighlightSet;
export function countHidden(vis: Visible): { nodes: number; edges: number; totalNodes: number; totalEdges: number };
export function desiredHidden(model: LibModel, hiddenTypes: ReadonlySet<string>, hiddenRels: ReadonlySet<string>): HiddenSets;
export function diffHidden(current: HiddenSets, desired: HiddenSets): { show: HiddenSets; hide: HiddenSets };
export function relationCounts(model: LibModel): { name: string; count: number }[];
export function viewportRect(vp: Viewport): Rect;
export function minimapWorld(bounds: LibModel["bounds"], vp: Viewport): Rect;
export function minimapTransform(world: Rect, w: number, h: number, pad?: number): { scale: number; toMini(x: number, y: number): { x: number; y: number }; fromMini(px: number, py: number): { x: number; y: number } };
export function centreOn(vp: Viewport, x: number, y: number): { center_x: number; center_y: number; zoom: number };
export function boxOf(points: { x: number; y: number }[]): Rect | undefined;
export function selectionPoints(model: LibModel, nodeIndices: Iterable<number>, edgeIndices: Iterable<number>): { x: number; y: number }[];
export function viewportForBox(box: Rect, size: { width: number; height: number }, padding?: number, maxZoom?: number): { center_x: number; center_y: number; zoom: number };
export function pixelsToMilli(dxPx: number, dyPx: number, zoom: number): { dx: number; dy: number };
export function dragPosition(start: { x: number; y: number }, dxPx: number, dyPx: number, zoom: number): { x: number; y: number };
export function fixedPositions(model: LibModel, moves: ReadonlyMap<number, { x: number; y: number }>): { ref: { id: string; type: string }; x: number; y: number }[];
export function nudgeDelta(dir: "left" | "right" | "up" | "down", zoom: number, px?: number): { dx: number; dy: number };
export const shortHash: (h: string) => string;
export const zoomPercent: (zoom: number) => string;
