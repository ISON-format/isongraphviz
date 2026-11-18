// src/types.ts - the types of the display list (design 2, 4.1). Structural copies of the exact IGS/1 wire shapes (no import of scene-core).
export type WireNode = { id: string; type: string };
export type WireEdge = { ord: string; rel: string; src: WireNode; tgt: WireNode };
export type ElementAddress = { readonly node: WireNode } | { readonly edge: WireEdge };

/** `["E"|"A"|"N"|"T", pid, ...numbers (and the text of a T as its last member)]` (4.1). */
export type DlRecord = readonly ["E" | "A" | "N" | "T", number, ...(number | string)[]];

export interface DisplayList {
  readonly format: "igr-dl/1";
  readonly width: number;
  readonly height: number;
  readonly directed: boolean;
  readonly artifactSha256: string;
  readonly sceneSha256: string;
  readonly layoutSha256: string;
  /** The element table, pid = index + 1 (nodes then edges). */
  readonly nodes: readonly WireNode[];
  readonly edges: readonly WireEdge[];
  /** E A N T in file order; the header and the table are the fields above. */
  readonly records: readonly DlRecord[];
}

export interface DlFidelity { labels: "full" | "elided" | "none"; edge_labels: boolean; label_units: number }
