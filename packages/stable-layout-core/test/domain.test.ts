import { describe, expect, it } from "vitest";
import { computeStableLayout, measureDisplacement, snapshotLayout } from "../src/index.js";
import { Meter } from "../src/limits.js";
import { placeAdded } from "../src/placement.js";
import { PLACE_56, cr, drawing, fixedLayout, sceneBytes } from "./helpers.js";

const LIM = 2 ** 50;
const sides: [string, [number, number]][] = [
  ["+x", [LIM + 1, 0]], ["-x", [-LIM - 1, 0]], ["+y", [0, LIM + 1]], ["-y", [0, -LIM - 1]],
];
const edge: [string, [number, number]][] = [["+x", [LIM, 0]], ["-x", [-LIM, 0]], ["+y", [0, LIM]], ["-y", [0, -LIM]], ["corner", [-LIM, LIM]]];

describe("coordinate domain, every side of every layout read (section 2.2)", () => {
  it("+-2^50 on either axis is accepted; +-(2^50 + 1) on either axis is refused, for the previous and the next layout", async () => {
    const s = await sceneBytes({ tag: "dom1", nodes: ["i:1"] });
    const ok = async (p: [number, number]) => ({ sceneBytes: s, layoutBytes: await fixedLayout(s, { "i:1": p }) });
    const zero = await ok([0, 0]);
    for (const [name, p] of edge) {
      const d = await ok(p);
      expect(await cr(() => measureDisplacement(d, d)), `edge ${name}`).toBe("no error");
      expect(await cr(() => snapshotLayout(d)), `snapshot edge ${name}`).toBe("no error");
    }
    for (const [name, p] of sides) {
      const bad = await ok(p);
      expect(await cr(() => measureDisplacement(bad, zero)), `previous ${name}`).toBe("INVALID_PREVIOUS/COORDINATE_DOMAIN");
      expect(await cr(() => measureDisplacement(zero, bad)), `next ${name}`).toBe("INVALID_NEXT/COORDINATE_DOMAIN");
      expect(await cr(() => snapshotLayout(bad)), `snapshot ${name}`).toBe("INVALID_PREVIOUS/COORDINATE_DOMAIN");
    }
  });
  it("a previous coordinate beyond the domain is refused on every side also when its node is removed by the new scene", async () => {
    const next = await sceneBytes({ tag: "dom2n", nodes: ["i:1", "i:2"] });
    for (const [name, p] of sides) {
      const prev = await drawing({ tag: `dom2p${name}`, nodes: ["i:1", "i:2", "i:3"] }, { "i:1": [0, 0], "i:2": [5, 5], "i:3": p });
      expect(await cr(() => computeStableLayout(prev, next, { placement: PLACE_56 })), name).toBe("INVALID_PREVIOUS/COORDINATE_DOMAIN");
    }
  });
});

describe("placement candidates outside the domain are skipped on every side (section 5.3 (a))", () => {
  const cfg = { radius: 1000, min_separation: 800, max_rings: 4 };
  const ring0 = [[1000, 0], [924, 383], [707, 707], [383, 924], [0, 1000]] as const;
  const run = (pos: ([number, number] | null)[], edges: [number, number][]) => {
    const adj: number[][] = pos.map(() => []);
    for (const [a, b] of edges) { adj[a]!.push(b); adj[b]!.push(a); }
    return placeAdded({ pos, adj, cfg, meter: new Meter(1e9), refOf: String }).records;
  };
  it("anchor at (2^50, 2^50): directions 0-7 leave the domain by x or by y, direction 8 is the first candidate inside", () => {
    const r = run([[LIM, LIM], null], [[0, 1]]);
    expect(r[1]).toMatchObject({ direction: 8, ring: 0, x: LIM - 1000, y: LIM });
  });
  it("anchor at (-2^50, 0) with ring-0 directions 0-4 occupied: directions 5-11 leave the domain by negative x, direction 12 is the first inside", () => {
    const r = run([[-LIM, 0], ...ring0.map(([dx, dy]): [number, number] => [-LIM + dx, dy]), null], [[0, 6]]);
    expect(r[6]).toMatchObject({ direction: 12, ring: 0, x: -LIM, y: -1000 });
  });
  it("anchor at (0, -2^50) with directions 0-8 occupied: directions 9-15 leave the domain by negative y, the next ring is searched from direction 0 where y is in range", () => {
    // ring 0 directions with uy >= 0 (0..8) are blocked by occupants; 9..15 have uy < 0 and fall below -2^50
    const blockers: [number, number][] = [[1000, 0], [924, 383], [707, 707], [383, 924], [0, 1000], [-383, 924], [-707, 707], [-924, 383], [-1000, 0]].map(([dx, dy]) => [dx!, -LIM + dy!]);
    const r = run([[0, -LIM], ...blockers, null], [[0, 10]]);
    expect(r[10]).toMatchObject({ ring: 1, direction: 0, x: 2000, y: -LIM });
  });
});
