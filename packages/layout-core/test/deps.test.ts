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
  it("pins the Core layout build by file digest: a change here is a REQUALIFICATION event for igl-force/1, not an update", () => {
    expect(sha("viz.js")).toBe("102a9e2797964de652eb655f5e8b8928dee989e9065c9eb81b271a680dfa9a0c");
    expect(sha("viz.mjs")).toBe("1554dedac4486ff55213353a2a7c7b1f192a1c6983d46b44baa06b5e3d0d9a5c");
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
