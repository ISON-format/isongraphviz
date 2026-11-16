// packages/scene-core/test/deps.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

describe("dependency boundary", () => {
  it("pins the two Core packages exactly", () => {
    expect(pkg.dependencies).toEqual({ "ison-graph-ts": "1.4.1", "ison-ts": "1.2.0" });
    expect(pkg.engines.node).toBe(">=22");
  });

  it("keeps browser tooling out of the runtime surface and pins every dev dependency exactly", () => {
    for (const tool of ["esbuild", "playwright-core", "vitest", "typescript"]) {
      expect(Object.keys(pkg.dependencies), tool).not.toContain(tool);
      expect(pkg.devDependencies[tool], tool).toMatch(/^\d+\.\d+\.\d+$/);
    }
    for (const [name, range] of Object.entries(pkg.devDependencies as Record<string, string>)) {
      expect(range, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("locks the published artifacts by integrity", () => {
    const g = lock.packages["node_modules/ison-graph-ts"];
    const p = lock.packages["node_modules/ison-ts"];
    expect(g.version).toBe("1.4.1");
    expect(g.integrity).toBe("sha512-fgud0iClGwmCouOH6Lajpk6Ad+YSjUEXyAUVfN7S1onk16wYI7l3fkas5vRj7lafzUyntm4JbPtpy9GCsl//sg==");
    expect(p.version).toBe("1.2.0");
    expect(p.integrity).toBe("sha512-+AQBWsvCmxwYQwkQaXf+irC3/F/XfkDG0RdsQLZoREJTL21nsUIqdUII6GNzvrSv0EFT7u4niD+XJuwRl35m0g==");
  });

  it("resolves exactly one copy of ison-ts", () => {
    const copies = Object.keys(lock.packages).filter((k) => k.endsWith("node_modules/ison-ts"));
    expect(copies).toEqual(["node_modules/ison-ts"]);
  });

  it("imports only allowed modules and no forbidden product package", () => {
    const allowed = new Set(["ison-graph-ts", "ison-ts"]);
    const forbidden = /(betterify|skillden|brainlanding|cognovel|isongraph-ext|ison-graph-ext)/i;
    const re = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
    for (const f of readdirSync(join(root, "src"))) {
      const text = readFileSync(join(root, "src", f), "utf8");
      for (const m of text.matchAll(re)) {
        const spec = m[1] as string;
        expect(spec, `${f} imports ${spec}`).not.toMatch(forbidden);
        if (spec.startsWith(".") || spec.startsWith("node:")) continue;
        expect(allowed.has(spec), `${f} imports disallowed module ${spec}`).toBe(true);
      }
    }
  });

  it("can import the Core packages by name under Node ESM", async () => {
    const graph = await import("ison-graph-ts");
    const parser = await import("ison-ts");
    expect(typeof graph.ISONGraph.fromIson).toBe("function");
    expect(typeof graph.NodeNotFoundError).toBe("function");
    expect(typeof parser.parse).toBe("function");
    expect(typeof parser.Reference).toBe("function");
  });
});
