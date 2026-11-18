// An independent exact reference for the edge step of 5.2 (the body of row D05): the polyline of 5.1 by its own formulas, the distance as an exact rational.
import { hitTest, quantizePx, type ElementAddress, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import type { DisplayList } from "../src/index.js";

/** An independent exact reference for the edge step of 5.2: the polyline of 5.1 by its own formulas, the distance as an exact rational. */
export function reference(model: RenderModel, state: SemanticState, list: DisplayList, p: { x: number; y: number }): ElementAddress | undefined {
  const Pm = { x: BigInt(quantizePx(p.x * 1000)), y: BigInt(quantizePx(p.y * 1000)) };
  if (Pm.x < 0n || Pm.y < 0n || Pm.x > BigInt(list.width * 1000) || Pm.y > BigInt(list.height * 1000)) return undefined;
  const h = hitTest(model, state, p);
  if (h !== undefined && "node" in h) return h;
  const nd = list.nodes.length;
  let best: { j: number; n: bigint; d: bigint } | undefined;
  for (const r of list.records) {
    if (r[0] !== "E") continue;
    const c = (r.slice(4) as number[]).map(BigInt);
    const pts: [bigint, bigint][] = [];
    const rd = (a: bigint, b: bigint): bigint => { const n = 2n * a + b; let q = n / (2n * b); if (n % (2n * b) !== 0n && n < 0n) q -= 1n; return q; };
    if (r[3] === 0) pts.push([c[0]!, c[1]!], [c[2]!, c[3]!]);
    else for (let k = 0n; k <= 16n; k++) {
      const u = 16n - k;
      if (r[3] === 1) pts.push([rd(u * u * c[0]! + 2n * k * u * c[2]! + k * k * c[4]!, 256n), rd(u * u * c[1]! + 2n * k * u * c[3]! + k * k * c[5]!, 256n)]);
      else pts.push([rd(u ** 3n * c[0]! + 3n * u * u * k * c[2]! + 3n * u * k * k * c[4]! + k ** 3n * c[6]!, 4096n), rd(u ** 3n * c[1]! + 3n * u * u * k * c[3]! + 3n * u * k * k * c[5]! + k ** 3n * c[7]!, 4096n)]);
    }
    let dn = -1n, dd = 1n;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, wx = Pm.x - ax, wy = Pm.y - ay;
      let n: bigint, d: bigint;
      if (l2 === 0n) { n = wx * wx + wy * wy; d = 1n; }
      else {
        const tn = wx * dx + wy * dy;
        if (tn <= 0n) { n = wx * wx + wy * wy; d = 1n; }
        else if (tn >= l2) { const vx = Pm.x - bx, vy = Pm.y - by; n = vx * vx + vy * vy; d = 1n; }
        else { const cr = wx * dy - wy * dx; n = cr * cr; d = l2; }
      }
      if (dn < 0n || n * dd < dn * d) { dn = n; dd = d; }
    }
    if (dn > 6000n * 6000n * dd) continue;
    if (best === undefined || dn * best.d < best.n * dd) best = { j: r[1] - nd - 1, n: dn, d: dd };
  }
  if (best === undefined) return undefined;
  const e = list.edges[best.j]!;
  return { edge: e };
}
