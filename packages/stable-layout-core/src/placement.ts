// 28-STABLE-LAYOUT-DESIGN.md section 5 (igl-stable-place/1): waves, anchors, the ring search and the occupancy grid. Exact integers only.
import { StableLayoutError } from "./errors.js";
import { divRound, divRoundN, floorDivN, isqrt } from "./intmath.js";
import { COORD_LIMIT, Meter, guard } from "./limits.js";
import type { PlacementConfig } from "./types.js";

export const PLACEMENT_ALGORITHM = "igl-stable-place/1" as const;
export const RECOMMENDED_PLACEMENT: Readonly<PlacementConfig> = Object.freeze({ radius: 60000, min_separation: 40000, max_rings: 32 });

/** The 16 frozen directions, scaled by 1000. Not unit vectors (section 5.3). */
export const DIRECTIONS: readonly (readonly [number, number])[] = Object.freeze([
  [1000, 0], [924, 383], [707, 707], [383, 924], [0, 1000], [-383, 924], [-707, 707], [-924, 383],
  [-1000, 0], [-924, -383], [-707, -707], [-383, -924], [0, -1000], [383, -924], [707, -707], [924, -383],
].map((d) => Object.freeze(d as [number, number])));

const KEYS = ["max_rings", "min_separation", "radius"] as const;
const RANGE: Record<(typeof KEYS)[number], number> = { radius: 2 ** 26, min_separation: 2 ** 26, max_rings: 1024 };
const invalid = (detail: string, path = "options.placement"): StableLayoutError => new StableLayoutError("INVALID_REQUEST", "INVALID_PLACEMENT", path, detail);

/** Section 5.1: a closed object, every key required, integers within range. Returns an owned copy; each property is read once. */
export function validatePlacement(v: unknown): PlacementConfig {
  if (guard(() => typeof v !== "object" || v === null || Array.isArray(v))) throw invalid("INVALID_VALUE");
  const got = new Map<string, unknown>();
  try {
    for (const k of Object.keys(v as object)) got.set(k, (v as Record<string, unknown>)[k]);
  } catch (e) { throw new StableLayoutError("INVALID_REQUEST", "UNREADABLE", "options.placement", e instanceof Error ? e.message : String(e)); }
  for (const k of got.keys()) if (!(KEYS as readonly string[]).includes(k)) throw invalid("UNKNOWN_KEY", `options.placement.${k}`);
  for (const k of KEYS) if (!got.has(k)) throw invalid("MISSING_KEY", `options.placement.${k}`);
  const out = {} as PlacementConfig;
  for (const k of KEYS) {
    const x = got.get(k);
    if (typeof x !== "number" || !Number.isInteger(x) || x < 1 || x > RANGE[k]) throw invalid("INVALID_VALUE", `options.placement.${k}`);
    out[k] = x + 0;
  }
  return { radius: out.radius, min_separation: out.min_separation, max_rings: out.max_rings };
}

export interface PlacedRecord {
  anchor_kind: "neighbours" | "seed"; anchor_x: number; anchor_y: number; direction: number; offset: number; ring: number; wave: number; x: number; y: number;
}
export interface PlaceInput {
  /** Per node of the new scene, in NodeRef/2 order: the kept position, or null for an added node. */
  pos: ([number, number] | null)[];
  /** Per node: the nodes joined to it by an edge in either direction (duplicates and self entries are ignored). */
  adj: number[][];
  cfg: PlacementConfig;
  meter: Meter;
  /** The wire reference of node i as compact canonical JSON, for NO_FREE_SLOT. */
  refOf: (i: number) => string;
}

/** Section 5.2: the exact wave procedure. Charges C2 per placed node and C3 per candidate (section 12.3). */
export function placeAdded(a: PlaceInput): { records: (PlacedRecord | undefined)[]; waves: number; placed: number } {
  const { pos, cfg, meter } = a;
  const n = pos.length;
  const R = cfg.radius, S = cfg.min_separation, S2 = S * S;
  const nbr: number[][] = a.adj.map((l, u) => [...new Set(l)].filter((v) => v !== u).sort((p, q) => p - q));
  const x = new Array<number>(n).fill(0), y = new Array<number>(n).fill(0);
  const waveOf = new Array<number>(n).fill(-2); // -2 unplaced, -1 kept, >= 0 the wave in which it was placed
  const grid = new Map<string, number[]>();
  const cellKey = (px: number, py: number): string => `${floorDivN(px, S)},${floorDivN(py, S)}`;
  const insert = (i: number): void => {
    const k = cellKey(x[i]!, y[i]!);
    const c = grid.get(k);
    if (c) c.push(i); else grid.set(k, [i]);
  };
  let k = 0n, maxX = 0n, sy = 0n;
  for (let i = 0; i < n; i++) {
    const p = pos[i];
    if (!p) continue;
    x[i] = p[0]; y[i] = p[1]; waveOf[i] = -1; insert(i);
    const bx = BigInt(p[0]);
    if (k === 0n || bx > maxX) maxX = bx;
    sy += BigInt(p[1]); k++;
  }
  let unplaced = 0;
  for (let i = 0; i < n; i++) if (waveOf[i] === -2) unplaced++;
  const records: (PlacedRecord | undefined)[] = new Array<PlacedRecord | undefined>(n).fill(undefined);

  let frontier: number[] = [];
  for (let u = 0; u < n; u++) if (waveOf[u] === -2 && nbr[u]!.some((v) => waveOf[v] === -1)) frontier.push(u);
  let waveNo = 0, placed = 0, seed = -1, seedScan = 0;
  while (unplaced > 0) {
    seed = -1;
    if (frontier.length === 0) {
      while (waveOf[seedScan] !== -2) seedScan++; // the smallest unplaced node only ever increases: a moving pointer, not a rescan
      seed = seedScan;
      frontier = [seed];
    }
    for (const u of frontier) {
      let m = 0, ax: number, ay: number;
      if (u === seed) {
        ax = Number(maxX + BigInt(R)); ay = Number(divRound(sy, k));
      } else {
        let sx = 0n, sY = 0n;
        for (const v of nbr[u]!) if (waveOf[v] !== -2 && waveOf[v]! < waveNo) { sx += BigInt(x[v]!); sY += BigInt(y[v]!); m++; } // placed at wave start
        ax = Number(divRound(sx, BigInt(m))); ay = Number(divRound(sY, BigInt(m)));
      }
      meter.charge(2 + m);
      let found = false;
      for (let ring = 0; ring < cfg.max_rings && !found; ring++) {
        const rad = R * (ring + 1);
        for (let d = 0; d < 16 && !found; d++) {
          const cx = ax + divRoundN(rad * DIRECTIONS[d]![0]!, 1000), cy = ay + divRoundN(rad * DIRECTIONS[d]![1]!, 1000);
          if (Math.abs(cx) > COORD_LIMIT || Math.abs(cy) > COORD_LIMIT) { meter.charge(1); continue; }
          const gx = floorDivN(cx, S), gy = floorDivN(cy, S);
          const cells: number[][] = [];
          let count = 0;
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const c = grid.get(`${gx + ox},${gy + oy}`);
            if (c) { cells.push(c); count += c.length; }
          }
          meter.charge(1 + count);
          let free = true;
          for (const c of cells) {
            for (const o of c) {
              const dx = Math.abs(cx - x[o]!), dy = Math.abs(cy - y[o]!);
              if (dx >= S || dy >= S) continue;
              if (dx * dx + dy * dy < S2) { free = false; break; }
            }
            if (!free) break;
          }
          if (!free) continue;
          x[u] = cx; y[u] = cy; waveOf[u] = waveNo; insert(u); unplaced--; placed++;
          const ddx = BigInt(cx - ax), ddy = BigInt(cy - ay);
          records[u] = { anchor_kind: u === seed ? "seed" : "neighbours", anchor_x: ax, anchor_y: ay, direction: d, offset: Number(isqrt(ddx * ddx + ddy * ddy)), ring, wave: waveNo, x: cx, y: cy };
          found = true;
        }
      }
      if (!found) throw new StableLayoutError("PLACEMENT_FAILED", "NO_FREE_SLOT", undefined, a.refOf(u));
    }
    const next = new Set<number>();
    for (const u of frontier) for (const v of nbr[u]!) if (waveOf[v] === -2) next.add(v);
    frontier = [...next].sort((p, q) => p - q);
    waveNo++;
  }
  return { records, waves: waveNo, placed };
}
