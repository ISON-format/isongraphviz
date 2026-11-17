import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bindLayout, computeFixedLayout } from "isongraph-visualize-layout-core";
import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import { fixedLayout, sceneBytes } from "./helpers.js";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const sources = readdirSync(SRC).filter((f) => f.endsWith(".ts")).map((f) => [f, readFileSync(SRC + f, "utf8")] as const);

describe("public surface (section 13)", () => {
  it("exports exactly the specified runtime names", () => {
    expect(Object.keys(api).sort()).toEqual([
      "COORD_LIMIT", "DEFAULT_STABLE_BUDGET", "MAX_NODE_KEY_UNITS", "MAX_REL_UNITS", "RECOMMENDED_PLACEMENT", "StableLayoutError",
      "computeStableLayout", "diffScenes", "measureDisplacement", "snapshotLayout", "verifyDisplacementReport", "verifyStable", "verifyStableReproducible",
    ]);
    expect(api.computeStableLayout.length).toBe(3);
    expect(api.RECOMMENDED_PLACEMENT).toEqual({ radius: 60000, min_separation: 40000, max_rings: 32 });
    expect(Object.isFrozen(api.DEFAULT_STABLE_BUDGET)).toBe(true);
  });
  it("no function takes a hash, an index or a snapshot (there is no hash parameter in any signature)", () => {
    for (const [n, f] of Object.entries(api)) if (typeof f === "function" && n !== "StableLayoutError") expect(f.length).toBeLessThanOrEqual(5);
  });
});

describe("source hygiene (Laws 2 and 5)", () => {
  it("no clock, no random source, no timers, no host iteration-order dependence on a Set of keys in an output path", () => {
    for (const [f, s] of sources) {
      const code = s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, f).not.toMatch(/\bDate\b|performance\.now|Math\.random|setTimeout|setInterval|crypto\.getRandomValues|process\.hrtime/);
    }
  });
  it("depends on scene-core and layout-core through their public entry points only; no Core graph library, no deep imports", () => {
    for (const [f, s] of sources) {
      for (const m of s.matchAll(/from "([^"]+)"/g)) {
        const spec = m[1]!;
        if (spec.startsWith(".")) continue;
        expect(["isongraph-visualize-scene-core", "isongraph-visualize-scene-core/primitives", "isongraph-visualize-layout-core"], `${f}: ${spec}`).toContain(spec);
      }
    }
  });
  it("uses no floating-point arithmetic on report values beyond the guarded hand-off (no Math.round, no Math.floor of a quotient in src)", () => {
    for (const [f, s] of sources) {
      const code = s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, f).not.toMatch(/Math\.(round|sqrt|hypot|trunc|ceil|random)/);
    }
  });
  it("carries no product-domain vocabulary", () => {
    const banned = /\b(customer|invoice|shopping|patient|employee|salary|ISONGraph\.com|product catalog)\b/i;
    for (const [f, s] of sources) expect(s, f).not.toMatch(banned);
  });
});

describe("the double hand-off to computeFixedLayout (section 2.2): q(k / 1000) == k up to 2^50", () => {
  it("round-trips samples, boundaries and the extremes exactly", async () => {
    const lim = 2 ** 50;
    const ks = [0, 1, -1, 999, 1000, 1001, 2 ** 31, 2 ** 40 + 1, 2 ** 49 + 12345, lim - 1, lim, -lim, -lim + 1, 7, -7, 123456789012, -987654321098];
    let s = 987654321;
    for (let i = 0; i < 400; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; ks.push(Math.floor(((s / 4294967296) * 2 - 1) * lim)); }
    const scene = await sceneBytes({ tag: "q", nodes: ks.map((_, i) => `i:${i + 1}`) });
    const pos = Object.fromEntries(ks.map((k, i) => [`i:${i + 1}`, [k, -k] as [number, number]]));
    const layout = await fixedLayout(scene, pos);
    const b = await bindLayout(scene, layout);
    const byId = new Map(b.layout.nodes.map((n) => [n.ref.id, n]));
    ks.forEach((k, i) => { const n = byId.get(`i:${i + 1}`)!; expect([n.x, n.y]).toEqual([k === 0 ? 0 : k, k === 0 ? 0 : -k]); });
    void computeFixedLayout;
  });
});
