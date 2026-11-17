// test/edge-limit.test.ts - V2 closure audit m-5 (owner ruling 2026-11-16): CORE_EDGE_LIMIT end to end, with REAL scene bytes through
// computeForceLayout. The scenes are generated here (no multi-megabyte artifact is checked in). preflight.test.ts covers the same cap
// on fabricated Scene objects; this proves the boundary holds through verifyScene, the budget and the producer.
import { describe, expect, it } from "vitest";
import { canonicalBytes } from "isongraph-visualize-scene-core/primitives";
import type { CJValue } from "isongraph-visualize-scene-core/primitives";
import { computeForceLayout } from "../src/force.js";
import { CORE_CFG, layoutError } from "./helpers.js";

const NODES = 300; // ids n000..n299: sorted order is the numeric order, so generated edges are already in canonical (src, rel, tgt) order
const id = (i: number): string => "s:n" + String(i).padStart(3, "0");

function bigScene(directed: boolean, edgeCount: number, rel = "R"): Uint8Array {
  const edges: unknown[] = [];
  outer: for (let i = 0; i < NODES; i++) {
    for (let j = directed ? 0 : i + 1; j < NODES; j++) {
      if (i === j) continue;
      if (edges.length === edgeCount) break outer;
      edges.push({ label: rel, ref: { ord: "0", rel, src: { id: id(i), type: "t" }, tgt: { id: id(j), type: "t" } } });
    }
  }
  if (edges.length !== edgeCount) throw new Error("test setup: not enough distinct pairs");
  return canonicalBytes({
    address_scheme: "igs-addr/1", edges, graph: { directed, profile: "simple" }, igs: "IGS/1",
    nodes: Array.from({ length: NODES }, (_, i) => ({ category: "t", label: id(i).slice(2), ref: { id: id(i), type: "t" } })),
    source: { artifact_sha256: "0".repeat(64), serialization_profile: "ison-v1" },
  } as unknown as CJValue);
}
const ZERO = { ...CORE_CFG, iterations: 0 }; // the cap is about construction, not iteration

describe("CORE_EDGE_LIMIT through the whole producer (physical edges per relation: E directed, 2E undirected; cap 50,000)", () => {
  it("directed: exactly 50,000 edges lay out; 50,001 are UNSUPPORTED_SCENE/CORE_EDGE_LIMIT", async () => {
    await expect(computeForceLayout(bigScene(true, 50_000), ZERO)).resolves.toMatchObject({ layout: { nodes: expect.any(Array) } });
    expect(await layoutError(() => computeForceLayout(bigScene(true, 50_001), ZERO))).toBe("UNSUPPORTED_SCENE/CORE_EDGE_LIMIT");
  }, 120_000);

  it("undirected: 25,000 logical edges (50,000 physical) lay out; 25,001 are refused", async () => {
    await expect(computeForceLayout(bigScene(false, 25_000), ZERO)).resolves.toBeDefined();
    expect(await layoutError(() => computeForceLayout(bigScene(false, 25_001), ZERO))).toBe("UNSUPPORTED_SCENE/CORE_EDGE_LIMIT");
  }, 120_000);

  it("the cap is per relation: two relations of 30,000 directed edges each are not refused by it", async () => {
    // 60,000 edges overall, 30,000 in each relation, emitted in canonical (src, rel, tgt) order.
    const edges: unknown[] = [];
    const per: Record<string, number> = { R: 0, S: 0 };
    for (let i = 0; i < NODES; i++) {
      for (const rel of ["R", "S"]) {
        for (let j = 0; j < NODES; j++) {
          if (i === j || per[rel]! >= 30_000) continue;
          per[rel]!++;
          edges.push({ label: rel, ref: { ord: "0", rel, src: { id: id(i), type: "t" }, tgt: { id: id(j), type: "t" } } });
        }
      }
    }
    expect(edges.length).toBe(60_000);
    const scene = canonicalBytes({
      address_scheme: "igs-addr/1", edges, graph: { directed: true, profile: "simple" }, igs: "IGS/1",
      nodes: Array.from({ length: NODES }, (_, i) => ({ category: "t", label: id(i).slice(2), ref: { id: id(i), type: "t" } })),
      source: { artifact_sha256: "0".repeat(64), serialization_profile: "ison-v1" },
    } as unknown as CJValue);
    await expect(computeForceLayout(scene, ZERO)).resolves.toBeDefined();
  }, 120_000);
});
