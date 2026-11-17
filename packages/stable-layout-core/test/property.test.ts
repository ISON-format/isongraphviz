import { bindLayout } from "isongraph-visualize-layout-core";
import { describe, expect, it } from "vitest";
import { computeStableLayout, verifyDisplacementReport, verifyStable, verifyStableReproducible } from "../src/index.js";
import { StableLayoutError } from "../src/errors.js";
import { refPlace } from "./reference.js";
import { drawing, sceneBytes, text, type EdgeSpec } from "./helpers.js";

function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const CORE_CFG = { width: 900, height: 600, iterations: 20, margin: 60, seed: 7 };

describe("generated scene pairs through the whole pipeline (section 17 property tests, fixed-seed LCG, no clock)", () => {
  it("kept coordinates identical; every added node >= S from earlier nodes; offset bound; output binds; report verifies; verifyStable accepts; recomputation reproduces; the meter equals an independently coded counter", async () => {
    const rnd = lcg(20261117);
    const pick = (n: number): number => Math.floor(rnd() * n);
    let incremental = 0, cold = 0, failed = 0, multiWave = 0;
    for (let t = 0; t < 160; t++) {
      const pool = 12;
      const prevIds = [...Array(pool).keys()].map((i) => i + 1).filter(() => rnd() < 0.6);
      const disjoint = rnd() < 0.12; // total replacement: no kept node, so a cold start
      const nextIds = [...Array(pool).keys()].map((i) => i + 1).filter((i) => (prevIds.includes(i) ? !disjoint && rnd() < 0.75 : rnd() < 0.5));
      const dir = rnd() < 0.7;
      const mkEdges = (ids: number[]): EdgeSpec[] => {
        const out: EdgeSpec[] = [];
        if (ids.length === 0) return out;
        const seen = new Set<string>();
        for (let e = 0, m = pick(2 * ids.length + 1); e < m; e++) {
          const a = ids[pick(ids.length)]!, b = ids[pick(ids.length)]!;
          const [x, y] = dir || a <= b ? [a, b] : [b, a];
          const k = `${x}>${y}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push([`i:${x}`, "e", `i:${y}`]);
        }
        return out;
      };
      const prevEdges = mkEdges(prevIds), nextEdges = mkEdges(nextIds);
      const pos: Record<string, [number, number]> = {};
      for (const i of prevIds) pos[`i:${i}`] = [pick(3001) - 1500, pick(3001) - 1500];
      const prev = await drawing({ tag: `p${t}`, directed: dir, nodes: prevIds.map((i) => `i:${i}`), edges: prevEdges }, pos);
      const nextScene = await sceneBytes({ tag: `n${t}`, directed: dir, nodes: nextIds.map((i) => `i:${i}`), edges: nextEdges });
      const placement = { radius: [700, 1000][pick(2)]!, min_separation: [400, 800][pick(2)]!, max_rings: 5 };
      let r;
      try { r = await computeStableLayout(prev, nextScene, { placement, coldStart: CORE_CFG }); }
      catch (e) { if (e instanceof StableLayoutError && e.reason === "NO_FREE_SLOT") { failed++; continue; } throw e; }
      const kept = nextIds.filter((i) => prevIds.includes(i));
      if (r.mode === "cold") {
        cold++;
        expect(kept.length === 0 || nextIds.length === 0).toBe(true);
        expect(r.stats.waves + r.stats.placed).toBe(0);
      } else {
        incremental++;
        expect(kept.length > 0 || nextIds.length === 0).toBe(true);
      }
      const b = await bindLayout(r.drawing.sceneBytes, r.drawing.layoutBytes);
      const out = new Map(b.layout.nodes.map((n) => [n.ref.id, [n.x, n.y] as [number, number]]));
      expect(out.size).toBe(nextIds.length);
      if (r.mode === "incremental") {
        for (const i of kept) expect(out.get(`i:${i}`)).toEqual(pos[`i:${i}`]);
        // the independently coded meter: C1 + (C2 + C3 of the naive placement) + C4
        const keptSet = new Set(kept);
        const nOrder = [...nextIds].sort((a, c) => a - c);
        const index = new Map(nOrder.map((id, k) => [id, k]));
        const adj: number[][] = nOrder.map(() => []);
        for (const [s, , tg] of nextEdges) { const a = index.get(Number((s as string).slice(2)))!, c = index.get(Number((tg as string).slice(2)))!; if (a !== c) { adj[a]!.push(c); adj[c]!.push(a); } }
        const refIn = nOrder.map((id) => (keptSet.has(id) ? pos[`i:${id}`]! : null));
        const naive = refPlace(refIn, adj, placement);
        expect(naive.ok).toBe(true);
        if (naive.ok) {
          const w = prevIds.length + nextIds.length + 2 * (prevEdges.length + nextEdges.length) + kept.length + (r.stats.placed > 0 ? naive.charge : 0) + 3 * (prevIds.length + nextIds.length);
          expect(r.stats.work, `case ${t}`).toBe(w);
          expect(r.stats.waves).toBe(naive.waves);
          expect(r.stats.placed).toBe(naive.recs.size);
          if (naive.waves > 1) multiWave++;
          for (const [i, rec] of naive.recs) expect(out.get(`i:${nOrder[i]}`)).toEqual([Number(rec.x), Number(rec.y)]);
          // clearance: each added node is at least S from every kept node and from every earlier-placed added node
          for (const [i, rec] of naive.recs) {
            for (const [j, pj] of refIn.entries()) {
              const other = pj ?? (naive.recs.get(j) && (naive.recs.get(j)!.wave < rec.wave || (naive.recs.get(j)!.wave === rec.wave && j < i)) ? [Number(naive.recs.get(j)!.x), Number(naive.recs.get(j)!.y)] : null);
              if (!other || j === i) continue;
              expect((Number(rec.x) - other[0]!) ** 2 + (Number(rec.y) - other[1]!) ** 2).toBeGreaterThanOrEqual(placement.min_separation ** 2);
            }
            expect(Number(rec.offset)).toBeLessThanOrEqual(Math.floor((placement.radius * placement.max_rings * 1000233) / 1000000) + 1);
          }
        }
      }
      // the report verifies on its own, against the drawings, and by recomputation
      const v = await verifyDisplacementReport(r.reportBytes);
      expect(v.reportSha256).toBe(r.reportSha256);
      await verifyStable(prev, nextScene, r.layout.layoutBytes, r.reportBytes);
      expect(await verifyStableReproducible(prev, nextScene, r.layout.layoutBytes, r.reportBytes, {})).toBe("reproduced");
      expect(text(r.drawing.layoutBytes)).toBe(text(r.layout.layoutBytes));
    }
    expect(incremental).toBeGreaterThan(80);
    expect(cold).toBeGreaterThan(3);
    expect(multiWave).toBeGreaterThan(10);
    expect(failed).toBeLessThan(40);
  }, 120000);
});
