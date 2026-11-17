import { describe, expect, it } from "vitest";
import { Meter } from "../src/limits.js";
import { DIRECTIONS, RECOMMENDED_PLACEMENT, placeAdded, validatePlacement } from "../src/placement.js";
import type { PlacementConfig } from "../src/types.js";
import { refPlace } from "./reference.js";
import { cr } from "./helpers.js";

type Pos = ([number, number] | null)[];
const CFG: PlacementConfig = { radius: 1000, min_separation: 800, max_rings: 4 };
const BIG = 1_000_000_000;

/** Runs the placement on index-addressed nodes: pos[i] is a kept node's position, null an added one; edges are index pairs. */
function run(pos: Pos, edges: [number, number][], cfg: PlacementConfig = CFG, maxWork = BIG) {
  const adj: number[][] = pos.map(() => []);
  for (const [a, b] of edges) { adj[a]!.push(b); adj[b]!.push(a); }
  const meter = new Meter(maxWork);
  const r = placeAdded({ pos, adj, cfg, meter, refOf: (i) => `{"id":"i:${i}","type":"n"}` });
  return { ...r, work: meter.work };
}
const at = (r: ReturnType<typeof run>, i: number) => r.records[i]!;

describe("validatePlacement (section 5.1)", () => {
  const code = (v: unknown): Promise<string> => cr(async () => validatePlacement(v));
  const detail = (v: unknown): string => { try { validatePlacement(v); } catch (e) { return String((e as { detail: unknown }).detail); } return "none"; };
  it("accepts the closed config and RECOMMENDED_PLACEMENT", () => {
    expect(validatePlacement({ radius: 1, min_separation: 1, max_rings: 1 })).toEqual({ radius: 1, min_separation: 1, max_rings: 1 });
    expect(validatePlacement({ radius: 2 ** 26, min_separation: 2 ** 26, max_rings: 1024 })).toEqual({ radius: 2 ** 26, min_separation: 2 ** 26, max_rings: 1024 });
    expect(RECOMMENDED_PLACEMENT).toEqual({ radius: 60000, min_separation: 40000, max_rings: 32 });
    expect(validatePlacement(RECOMMENDED_PLACEMENT)).toEqual(RECOMMENDED_PLACEMENT);
  });
  it("a missing key, an extra key or a bad value is INVALID_PLACEMENT with the detail MISSING_KEY, UNKNOWN_KEY or INVALID_VALUE", async () => {
    expect(await code({ radius: 1, min_separation: 1 })).toBe("INVALID_REQUEST/INVALID_PLACEMENT");
    expect(detail({ radius: 1, min_separation: 1 })).toBe("MISSING_KEY");
    expect(detail({ radius: 1, min_separation: 1, max_rings: 1, x: 1 })).toBe("UNKNOWN_KEY");
    for (const bad of [{ radius: 0 }, { radius: 2 ** 26 + 1 }, { radius: 1.5 }, { radius: "1" }, { radius: NaN }, { radius: -1 }]) {
      const v = { min_separation: 1, max_rings: 1, ...{ radius: 1 }, ...bad };
      expect(await code(v)).toBe("INVALID_REQUEST/INVALID_PLACEMENT");
      expect(detail(v)).toBe("INVALID_VALUE");
    }
    expect(detail({ radius: 1, min_separation: 2 ** 26 + 1, max_rings: 1 })).toBe("INVALID_VALUE");
    expect(detail({ radius: 1, min_separation: 1, max_rings: 1025 })).toBe("INVALID_VALUE");
    expect(detail({ radius: 1, min_separation: 1, max_rings: 0 })).toBe("INVALID_VALUE");
    for (const notObject of [null, undefined, 5, "x", [], [1, 2, 3]]) expect(await code(notObject)).toBe("INVALID_REQUEST/INVALID_PLACEMENT");
  });
  it("returns an owned copy and reads each property once", () => {
    let reads = 0;
    const o = { get radius(): number { reads++; return 5; }, min_separation: 2, max_rings: 3 };
    const v = validatePlacement(o);
    expect(reads).toBe(1);
    expect(v).toEqual({ radius: 5, min_separation: 2, max_rings: 3 });
    expect(v).not.toBe(o);
  });
});

describe("the frozen direction table (section 5.3)", () => {
  it("is exactly the 16 specified vectors, scaled by 1000", () => {
    expect(DIRECTIONS).toEqual([[1000, 0], [924, 383], [707, 707], [383, 924], [0, 1000], [-383, 924], [-707, 707], [-924, 383],
      [-1000, 0], [-924, -383], [-707, -707], [-383, -924], [0, -1000], [383, -924], [707, -707], [924, -383]]);
  });
});

describe("placement vectors", () => {
  it("TP01 one leaf on one kept node: ring 0, direction 0, offset 1000, meter 2+1 + 1+1", () => {
    const r = run([[0, 0], null], [[0, 1]]);
    expect(at(r, 1)).toEqual({ anchor_kind: "neighbours", anchor_x: 0, anchor_y: 0, direction: 0, offset: 1000, ring: 0, wave: 0, x: 1000, y: 0 });
    expect([r.waves, r.placed, r.work]).toEqual([1, 1, 5]);
    expect(r.records[0]).toBeUndefined();
  });
  it("TP02 anchor of two kept neighbours at x = 0 and 1 is divRound(1, 2) = 1 (plain floor gives 0)", () => {
    const r = run([[0, 0], [1, 0], null], [[0, 2], [1, 2]]);
    expect([at(r, 2).anchor_x, at(r, 2).anchor_y, at(r, 2).x]).toEqual([1, 0, 1001]);
  });
  it("TP03 a chain of three: waves 0, 1, 2, each anchored on its parent", () => {
    const r = run([[0, 0], null, null, null], [[0, 1], [1, 2], [2, 3]]);
    expect([1, 2, 3].map((i) => [at(r, i).wave, at(r, i).x, at(r, i).y, at(r, i).anchor_x])).toEqual([[0, 1000, 0, 0], [1, 2000, 0, 1000], [2, 3000, 0, 2000]]);
    expect(r.waves).toBe(3);
  });
  it("TP04 an isolated added node is a seed, wave 0 (an empty wave is not numbered): anchor (maxX + R, divRound(Sy, k))", () => {
    const r = run([[-1000, 500], [2000, 100], null], []);
    expect(at(r, 2)).toEqual({ anchor_kind: "seed", anchor_x: 3000, anchor_y: 300, direction: 0, offset: 1000, ring: 0, wave: 0, x: 4000, y: 300 });
    expect([r.waves, r.placed, r.work]).toEqual([1, 1, 2 + 1]); // C2 = 2 + 0, one candidate in an empty neighbourhood = 1
  });
  it("TP05 an added component with no kept neighbour: the first node seeds (wave 0), its neighbour is wave 1", () => {
    const r = run([[0, 0], null, null], [[1, 2]]);
    expect(at(r, 1)).toMatchObject({ anchor_kind: "seed", wave: 0, anchor_x: 1000, anchor_y: 0, x: 2000, y: 0 });
    expect(at(r, 2)).toMatchObject({ anchor_kind: "neighbours", wave: 1, anchor_x: 2000, anchor_y: 0, x: 3000, y: 0 });
    expect(r.waves).toBe(2);
  });
  it("TP06 two siblings on one anchor: R 60000, S 20000 lets the second take direction 1 (the candidates are 23,428 apart)", () => {
    const cfg = { radius: 60000, min_separation: 20000, max_rings: 32 };
    const r = run([[0, 0], null, null], [[0, 1], [0, 2]], cfg);
    expect([at(r, 1).direction, at(r, 1).x, at(r, 1).y]).toEqual([0, 60000, 0]);
    expect([at(r, 2).direction, at(r, 2).x, at(r, 2).y]).toEqual([1, 55440, 22980]);
    expect(Math.round(Math.hypot(60000 - 55440, 22980))).toBe(23428);
  });
  it("TP06r the same under RECOMMENDED_PLACEMENT: direction 1 is blocked and the second takes direction 2, (42420, 42420)", () => {
    const r = run([[0, 0], null, null], [[0, 1], [0, 2]], RECOMMENDED_PLACEMENT);
    expect([at(r, 2).direction, at(r, 2).x, at(r, 2).y]).toEqual([2, 42420, 42420]);
  });
  it("TP07 direction 0 blocked by a kept node: direction 1 is taken", () => {
    const r = run([[0, 0], [1000, -700], null], [[0, 2]]);
    expect([at(r, 2).ring, at(r, 2).direction, at(r, 2).x, at(r, 2).y]).toEqual([0, 1, 924, 383]);
  });
  const ring0 = DIRECTIONS.map(([x, y]): [number, number] => [x, y]);
  it("TP08 all 16 ring-0 candidates blocked: ring 1, direction 0 (ring-major order)", () => {
    const r = run([[0, 0], ...ring0, null], [[0, 17]]);
    expect([at(r, 17).ring, at(r, 17).direction, at(r, 17).x, at(r, 17).y, at(r, 17).offset]).toEqual([1, 0, 2000, 0, 2000]);
  });
  it("TP13 NO_FREE_SLOT with max_rings 1 and 16 blocked: the detail is the node's wire reference; no partial result", async () => {
    let thrown: unknown;
    try { run([[0, 0], ...ring0, null], [[0, 17]], { ...CFG, max_rings: 1 }); } catch (e) { thrown = e; }
    expect(thrown).toMatchObject({ code: "PLACEMENT_FAILED", reason: "NO_FREE_SLOT", detail: '{"id":"i:17","type":"n"}' });
  });
  it("TP11a three kept neighbours at x = -1, -1, 0: the anchor is divRound(-2, 3) = -1 (truncating division gives 0)", () => {
    const r = run([[-1, 0], [-1, 0], [0, 0], null], [[0, 3], [1, 3], [2, 3]]);
    expect([at(r, 3).anchor_x, at(r, 3).anchor_y, at(r, 3).x]).toEqual([-1, 0, 999]);
  });
  it("TP11b two kept neighbours at x = -1 and 0: the anchor is divRound(-1, 2) = 0 (half away from zero and plain floor give -1)", () => {
    const r = run([[-1, 0], [0, 0], null], [[0, 2], [1, 2]]);
    expect([at(r, 2).anchor_x, at(r, 2).x]).toEqual([0, 1000]);
  });
  it("TP11c negative y: divRound(-3, 2) = -1", () => {
    const r = run([[0, -1], [0, -2], null], [[0, 2], [1, 2]]);
    expect(at(r, 2).anchor_y).toBe(-1);
  });
  it("TP12 clearance: exactly S is admissible, S - 1 blocks", () => {
    expect(at(run([[0, 0], [1000, 800], null], [[0, 2]]), 2)).toMatchObject({ direction: 0, x: 1000, y: 0 });
    expect(at(run([[0, 0], [1000, 799], null], [[0, 2]]), 2)).toMatchObject({ direction: 4, x: 0, y: 1000 });
  });
  it("TP12b equality inside the square: a blocker 3-4-5 away (both differences below S) at exactly S is admissible, at S - 1 it is not", () => {
    const cfg = { radius: 1000, min_separation: 5, max_rings: 4 };
    expect(at(run([[0, 0], [1003, 4], null], [[0, 2]], cfg), 2)).toMatchObject({ direction: 0, ring: 0, x: 1000, y: 0 });
    expect(at(run([[0, 0], [1003, 3], null], [[0, 2]], cfg), 2)).toMatchObject({ direction: 1, x: 924, y: 383 }); // d2 = 18 < 25
  });
  it("TP18 a node whose only edge is a self-loop is an orphan seed", () => {
    // the self-loop is ignored by the neighbour definition (callers pass adjacency without self-loops; a self entry must not count either)
    const r = run([[0, 0], null], [[1, 1]]);
    expect(at(r, 1)).toMatchObject({ anchor_kind: "seed", wave: 0 });
  });
  it("TP21 waves: a kept-attached chain of two (0, 1), then an orphan seed (wave 2, anchored on the kept statistics only)", () => {
    const r = run([[0, 0], null, null, null], [[0, 1], [1, 2]]);
    expect([1, 2, 3].map((i) => at(r, i).wave)).toEqual([0, 1, 2]);
    expect(at(r, 3)).toMatchObject({ anchor_kind: "seed", anchor_x: 1000, anchor_y: 0, direction: 3, x: 1383, y: 924 });
    expect(r.waves).toBe(3);
  });
  it("TP24 two added nodes adjacent to each other and to a kept node: one wave; each m(u) and anchor ignore the sibling, the collision test sees it", () => {
    const r = run([[0, 0], null, null], [[0, 1], [0, 2], [1, 2]]);
    expect(at(r, 1)).toMatchObject({ wave: 0, anchor_x: 0, anchor_y: 0, x: 1000, y: 0 });
    expect(at(r, 2)).toMatchObject({ wave: 0, anchor_x: 0, anchor_y: 0, direction: 3, x: 383, y: 924 });
    expect(r.waves).toBe(1);
    // node 1: C2 3 + candidate 2; node 2: C2 3 + candidates dir 0..3 at 3 each (the nine cells hold the kept node and node 1)
    expect(r.work).toBe(3 + 2 + 3 + 4 * 3);
  });
  it("kept nodes may coincide; coincident occupants are each counted", () => {
    const r = run([[0, 0], [0, 0], [0, 0], null], [[0, 3]]);
    expect(at(r, 3)).toMatchObject({ x: 1000, y: 0 });
    expect(r.work).toBe((2 + 1) + (1 + 3));
  });
  it("nothing is placed when no node is added, and no wave runs", () => {
    const r = run([[0, 0], [5, 5]], [[0, 1]]);
    expect([r.waves, r.placed, r.work]).toEqual([0, 0, 0]);
  });
  it("an out-of-domain candidate is charged 1 and does not query the grid (TL16)", () => {
    // kept at x = 2^50 - 1000, seed anchor (2^50, 0): directions 0..3 have x > 2^50 and cost 1 each; direction 4 is in domain
    const r = run([[2 ** 50 - 1000, 0], null], [], CFG);
    expect(at(r, 1)).toMatchObject({ anchor_kind: "seed", anchor_x: 2 ** 50, direction: 4, x: 2 ** 50, y: 1000 });
    const ref = refPlace([[2 ** 50 - 1000, 0], null], [[], []], CFG);
    expect(ref.ok && ref.charge).toBe(r.work);
    // C2 = 2, four out-of-domain candidates = 4, then the in-domain candidate = 1 + occupants of its nine cells
    expect(r.work).toBeGreaterThanOrEqual(2 + 4 + 1);
    expect(r.work).toBeLessThanOrEqual(2 + 4 + 2);
  });
  it("the coordinate domain refuses a candidate outside +-2^50 (a seed whose every candidate is out of domain fails)", () => {
    expect(() => run([[2 ** 50 - 1000, 0], null], [], { radius: 1000, min_separation: 800, max_rings: 1 })).not.toThrow(); // direction 4 is in domain
    expect(() => run([[2 ** 50, 2 ** 50], null], [], { radius: 1000, min_separation: 800, max_rings: 1 })).toThrow(/NO_FREE_SLOT/);
  });
  it("the WORK_LIMIT is raised before the refused charge and leaves W unchanged", () => {
    const pos: Pos = [[0, 0], null];
    const adj = [[1], [0]];
    const meter = new Meter(4);
    expect(() => placeAdded({ pos, adj, cfg: CFG, meter, refOf: () => "x" })).toThrow(/WORK_LIMIT/);
    expect(meter.work).toBe(3); // C2 = 3 charged; C3 = 2 would make 5 > 4
  });
});

// ---- property test against the naive reference --------------------------------------------------------------------------------
function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

describe("placement equals the naive reference (positions, records, waves and the meter) on generated inputs", () => {
  it("1,500 generated cases, including crowded layouts, orphans, coincident nodes, negatives and failures", { timeout: 60_000 }, () => {
    const rnd = lcg(12345);
    const pick = (n: number): number => Math.floor(rnd() * n);
    let fails = 0, seeds = 0, multiWave = 0;
    for (let t = 0; t < 1500; t++) {
      const n = 2 + pick(11);
      const spread = [200, 900, 3000][pick(3)]!;
      const pos: Pos = [];
      let anyKept = false;
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.4) pos.push(null);
        else { pos.push([pick(2 * spread + 1) - spread, pick(2 * spread + 1) - spread]); anyKept = true; }
      }
      if (!anyKept) pos[0] = [0, 0];
      const adj: number[][] = pos.map(() => []);
      const m = pick(2 * n);
      for (let e = 0; e < m; e++) { const a = pick(n), b = pick(n); if (a !== b || rnd() < 0.2) { adj[a]!.push(b); if (a !== b) adj[b]!.push(a); } }
      const cfg: PlacementConfig = { radius: [300, 1000, 1700][pick(3)]!, min_separation: [100, 800, 1500][pick(3)]!, max_rings: 1 + pick(4) };
      const want = refPlace(pos, adj, cfg);
      const meter = new Meter(BIG);
      let got: ReturnType<typeof placeAdded> | undefined, failedNode = -1;
      try { got = placeAdded({ pos, adj, cfg, meter, refOf: (i) => String(i) }); }
      catch (e) { const d = (e as { detail?: string }).detail; if ((e as { reason?: string }).reason !== "NO_FREE_SLOT") throw e; failedNode = Number(d); }
      if (!want.ok) {
        fails++;
        expect(failedNode, `case ${t}`).toBe(want.node);
        expect(meter.work, `case ${t} work`).toBe(want.charge);
        continue;
      }
      expect(got, `case ${t} must succeed`).toBeDefined();
      expect(meter.work, `case ${t} work`).toBe(want.charge);
      expect(got!.waves, `case ${t} waves`).toBe(want.waves);
      expect(got!.placed).toBe(want.recs.size);
      if (want.waves > 1) multiWave++;
      for (const [i, r] of want.recs) {
        const g = got!.records[i]!;
        expect(g, `case ${t} node ${i}`).toEqual({ anchor_kind: r.kind, anchor_x: Number(r.ax), anchor_y: Number(r.ay), direction: r.dir, offset: Number(r.offset), ring: r.ring, wave: r.wave, x: Number(r.x), y: Number(r.y) });
        if (r.kind === "seed") seeds++;
      }
    }
    expect(fails).toBeGreaterThan(5); // the generator does reach NO_FREE_SLOT
    expect(seeds).toBeGreaterThan(100);
    expect(multiWave).toBeGreaterThan(100);
  });
  it("every added node is at least S from every node placed before it, and the offset bound of section 5.4 holds", { timeout: 60_000 }, () => {
    const rnd = lcg(777);
    const pick = (n: number): number => Math.floor(rnd() * n);
    for (let t = 0; t < 400; t++) {
      const n = 3 + pick(9);
      const pos: Pos = Array.from({ length: n }, (_, i) => (i === 0 || rnd() < 0.5 ? [pick(2001) - 1000, pick(2001) - 1000] : null));
      const adj: number[][] = pos.map(() => []);
      for (let e = 0; e < n; e++) { const a = pick(n), b = pick(n); if (a !== b) { adj[a]!.push(b); adj[b]!.push(a); } }
      const cfg: PlacementConfig = { radius: 700, min_separation: 600, max_rings: 6 };
      let got: ReturnType<typeof placeAdded>;
      try { got = placeAdded({ pos, adj, cfg, meter: new Meter(BIG), refOf: String }); } catch { continue; }
      const order = [...got.records.keys()].filter((i) => got.records[i] !== undefined).sort((a, b) => got.records[a]!.wave - got.records[b]!.wave || a - b);
      const bound = Math.floor((cfg.radius * cfg.max_rings * 1000233) / 1000000) + 1;
      for (const i of order) {
        const r = got.records[i]!;
        expect(r.offset).toBeLessThanOrEqual(bound);
        for (let j = 0; j < n; j++) {
          const before = pos[j] !== null || (got.records[j] !== undefined && (got.records[j]!.wave < r.wave || (got.records[j]!.wave === r.wave && j < i)));
          if (!before) continue;
          const px = pos[j] ? pos[j]![0] : got.records[j]!.x, py = pos[j] ? pos[j]![1] : got.records[j]!.y;
          expect((r.x - px) ** 2 + (r.y - py) ** 2).toBeGreaterThanOrEqual(cfg.min_separation ** 2);
        }
      }
    }
  });
});
