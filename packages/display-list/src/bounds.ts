// src/bounds.ts - element bounds (design 5.4): data for V11's companion, never a hit area. Labels are not covered.
import { canonicalJson } from "./canon.js";
import { utf8Encode } from "./utf8.js";
import { EDGE_BOUND, NODE_BOUND } from "./constants.js";
import { flattenRoute } from "./geometry.js";
import type { DisplayList } from "./types.js";

export interface ElementBox { pid: number; x0: number; y0: number; x1: number; y1: number }

/**
 * Per drawn element in pid order, `{pid, x0, y0, x1, y1}` in milli-pixels: a node (x - 19000, y - 19000, x + 19000, y + 19000); an edge the bounding
 * box of its pick polyline expanded by 6000 on every side.
 */
export function elementBounds(list: DisplayList): ElementBox[] {
  const nodes: ElementBox[] = [], edges: ElementBox[] = [];
  for (const r of list.records) {
    if (r[0] === "N") {
      const x = r[4] as number, y = r[5] as number;
      nodes.push({ pid: r[1], x0: x - NODE_BOUND, y0: y - NODE_BOUND, x1: x + NODE_BOUND, y1: y + NODE_BOUND });
    } else if (r[0] === "E") {
      const pts = flattenRoute(r[3] as number, r.slice(4) as number[]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!);
        y0 = Math.min(y0, pts[i + 1]!); y1 = Math.max(y1, pts[i + 1]!);
      }
      edges.push({ pid: r[1], x0: x0 - EDGE_BOUND, y0: y0 - EDGE_BOUND, x1: x1 + EDGE_BOUND, y1: y1 + EDGE_BOUND });
    }
  }
  return [...nodes, ...edges];
}

/** `["b",pid,x0,y0,x1,y1]` per line (4.2); an empty list gives empty bytes. */
export function serializeBounds(boxes: readonly ElementBox[]): Uint8Array {
  let text = "";
  for (const b of boxes) text += canonicalJson(["b", b.pid, b.x0, b.y0, b.x1, b.y1]) + "\n";
  return utf8Encode(text);
}
