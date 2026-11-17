import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const sha = (rel: string) => createHash("sha256").update(readFileSync(join(root, "node_modules/ison-graph-ts/dist", rel))).digest("hex");

describe("dependency boundary", () => {
  it("pins Core exactly and links scene-core by path", () => {
    expect(pkg.dependencies).toEqual({ "isongraph-visualize-scene-core": "file:../scene-core", "ison-graph-ts": "1.4.1" });
    expect(pkg.engines.node).toBe(">=22");
  });
  it("pins every dev dependency exactly and keeps tooling out of the runtime surface", () => {
    for (const [n, r] of Object.entries(pkg.devDependencies as Record<string, string>)) expect(r, n).toMatch(/^\d+\.\d+\.\d+$/);
    for (const t of ["esbuild", "playwright-core", "vitest", "typescript"]) expect(Object.keys(pkg.dependencies), t).not.toContain(t);
  });
  it("locks the published Core artifact by integrity", () => {
    const g = lock.packages["node_modules/ison-graph-ts"];
    expect(g.version).toBe("1.4.1");
    expect(g.integrity).toBe("sha512-fgud0iClGwmCouOH6Lajpk6Ad+YSjUEXyAUVfN7S1onk16wYI7l3fkas5vRj7lafzUyntm4JbPtpy9GCsl//sg==");
  });
  it("pins EVERY file of Core's dist (review finding M-3): a change here is a REQUALIFICATION event for igl-force/1, not an update", () => {
    // The ESM entry we load (viz.mjs) is a stub that imports chunk-DKY73OIR.mjs, where the layout algorithm lives; ISONGraph is in index.mjs.
    const PINNED: Record<string, string> = {
      "chunk-DKY73OIR.mjs": "87c47c469758dfdd421f35e5399f3281e386fd1954fcc38dfd30fee2ff85abb2",
      "index.d.mts": "eb7df1874bf9f72ef2d0250652caa263d52128770f1f44f8e16cad19bb4bc225",
      "index.d.ts": "7891233f5dcfb12dcb73a6e037f191cef1f87feacd147e179d96f772dbb1ec94",
      "index.js": "bd1d4f01de8413bbaf7c6a4a289a720f80ccc6359f4c33d753c4e61fd7ada470",
      "index.mjs": "33fbb211cce188ff0e92ed25546cd76ff5c9d7d20659d52e6c02195fed05a681",
      "viz.d.mts": "a59d74f1d9fa6b7bc74235ec55ce4d694c7231948a1ef43b154a7da16bd1631f",
      "viz.d.ts": "a59d74f1d9fa6b7bc74235ec55ce4d694c7231948a1ef43b154a7da16bd1631f",
      "viz.js": "102a9e2797964de652eb655f5e8b8928dee989e9065c9eb81b271a680dfa9a0c",
      "viz.mjs": "1554dedac4486ff55213353a2a7c7b1f192a1c6983d46b44baa06b5e3d0d9a5c",
    };
    const present = readdirSync(join(root, "node_modules/ison-graph-ts/dist")).sort();
    expect(present, "a file was added to or removed from Core's dist").toEqual(Object.keys(PINNED).sort());
    for (const [file, digest] of Object.entries(PINNED)) expect(sha(file), file).toBe(digest);
    const manifest = present.map((f) => `${f} ${sha(f)}`).join("\n");
    expect(createHash("sha256").update(manifest).digest("hex")).toBe("ae49862fb95d4074d5bfb42b6d71bb72b0b7ac211812f6c66768e6ca2b46fb05");
  });
  it("imports only allowed modules and no forbidden product package", () => {
    const allowed = new Set(["ison-graph-ts", "ison-graph-ts/viz", "isongraph-visualize-scene-core", "isongraph-visualize-scene-core/primitives"]);
    const forbidden = /(betterify|skillden|brainlanding|cognovel|isongraph-ext|ison-graph-ext)/i;
    const re = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
    for (const f of readdirSync(join(root, "src"))) {
      for (const m of readFileSync(join(root, "src", f), "utf8").matchAll(re)) {
        const spec = m[1] as string;
        expect(spec, `${f} imports ${spec}`).not.toMatch(forbidden);
        if (spec.startsWith(".") || spec.startsWith("node:")) continue;
        expect(allowed.has(spec), `${f} imports disallowed module ${spec}`).toBe(true);
      }
    }
  });
  it("can import the shared primitives and Core's layout by name under Node ESM", async () => {
    const p = await import("isongraph-visualize-scene-core/primitives");
    const v = await import("ison-graph-ts/viz");
    expect(typeof p.canonicalizeSigned).toBe("function");
    expect(typeof v.computeLayout).toBe("function");
  });
});
