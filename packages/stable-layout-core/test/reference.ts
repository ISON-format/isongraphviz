// A deliberately naive, independently written transcription of 28-STABLE-LAYOUT-DESIGN.md section 5 (BigInt everywhere, no grid,
// no shared code with src/). It exists only to cross-check the package on generated inputs; the meter charge is counted by brute force.
export interface RefCfg { radius: number; min_separation: number; max_rings: number }
export interface RefRec { kind: "neighbours" | "seed"; ax: bigint; ay: bigint; dir: number; ring: number; offset: bigint; wave: number; x: bigint; y: bigint }
export type RefOut = { ok: true; recs: Map<number, RefRec>; waves: number; charge: number } | { ok: false; node: number; charge: number };

const DIRS: [bigint, bigint][] = [[1000n, 0n], [924n, 383n], [707n, 707n], [383n, 924n], [0n, 1000n], [-383n, 924n], [-707n, 707n], [-924n, 383n],
  [-1000n, 0n], [-924n, -383n], [-707n, -707n], [-383n, -924n], [0n, -1000n], [383n, -924n], [707n, -707n], [924n, -383n]];
const fdiv = (a: bigint, b: bigint): bigint => { let q = a / b; if (a % b !== 0n && (a < 0n) !== (b < 0n)) q -= 1n; return q; };
const rnd = (a: bigint, b: bigint): bigint => fdiv(2n * a + b, 2n * b);
const sq = (n: bigint): bigint => { let r = 0n; for (let bit = 1n << 62n; bit > 0n; bit >>= 1n) { const t = r + bit; if (t * t <= n) r = t; } return r; };
const abs = (a: bigint): bigint => (a < 0n ? -a : a);
const LIM = 2n ** 50n;

export function refPlace(pos: ([number, number] | null)[], adj: number[][], cfg: RefCfg): RefOut {
  const R = BigInt(cfg.radius), S = BigInt(cfg.min_separation);
  const n = pos.length;
  const placed = new Map<number, [bigint, bigint]>();
  const keptIdx: number[] = [];
  pos.forEach((p, i) => { if (p) { placed.set(i, [BigInt(p[0]), BigInt(p[1])]); keptIdx.push(i); } });
  const k = BigInt(keptIdx.length);
  const maxX = keptIdx.reduce((m, i) => { const x = placed.get(i)![0]; return x > m ? x : m; }, -(2n ** 70n));
  const Sy = keptIdx.reduce((s, i) => s + placed.get(i)![1], 0n);
  const unplaced = new Set<number>(); pos.forEach((p, i) => { if (!p) unplaced.add(i); });
  const recs = new Map<number, RefRec>();
  let charge = 0, waveNo = 0;
  const nb = (u: number): number[] => [...new Set(adj[u]!.filter((v) => v !== u))];
  let frontier = [...unplaced].filter((u) => nb(u).some((v) => pos[v] !== null)).sort((a, b) => a - b);
  for (;;) {
    let seed = -1;
    if (frontier.length === 0) {
      if (unplaced.size === 0) break;
      seed = Math.min(...unplaced);
      frontier = [seed];
    }
    const start = new Map(placed);
    for (const u of frontier) {
      let m = 0, ax: bigint, ay: bigint;
      if (u === seed) { ax = maxX + R; ay = rnd(Sy, k); }
      else {
        const N = nb(u).filter((v) => start.has(v));
        m = N.length;
        ax = rnd(N.reduce((s, v) => s + start.get(v)![0], 0n), BigInt(m));
        ay = rnd(N.reduce((s, v) => s + start.get(v)![1], 0n), BigInt(m));
      }
      charge += 2 + m;
      let done = false;
      for (let j = 0; j < cfg.max_rings && !done; j++) {
        const rad = R * BigInt(j + 1);
        for (let d = 0; d < 16 && !done; d++) {
          const cx = ax + rnd(rad * DIRS[d]![0], 1000n), cy = ay + rnd(rad * DIRS[d]![1], 1000n);
          if (abs(cx) > LIM || abs(cy) > LIM) { charge += 1; continue; }
          const ccx = fdiv(cx, S), ccy = fdiv(cy, S);
          let nine = 0, free = true;
          for (const [px, py] of placed.values()) {
            if (abs(fdiv(px, S) - ccx) <= 1n && abs(fdiv(py, S) - ccy) <= 1n) nine++;
            if ((cx - px) ** 2n + (cy - py) ** 2n < S * S) free = false; // against EVERY occupant: the grid must be sufficient
          }
          charge += 1 + nine;
          if (free) {
            placed.set(u, [cx, cy]);
            recs.set(u, { kind: u === seed ? "seed" : "neighbours", ax, ay, dir: d, ring: j, offset: sq((cx - ax) ** 2n + (cy - ay) ** 2n), wave: waveNo, x: cx, y: cy });
            unplaced.delete(u);
            done = true;
          }
        }
      }
      if (!done) return { ok: false, node: u, charge };
    }
    waveNo++;
    const next = new Set<number>();
    for (const u of frontier) for (const v of nb(u)) if (unplaced.has(v)) next.add(v);
    frontier = [...next].sort((a, b) => a - b);
  }
  void n;
  return { ok: true, recs, waves: waveNo, charge };
}
