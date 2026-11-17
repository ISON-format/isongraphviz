import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const layout = JSON.parse(readFileSync(join(root, "../layout-core/package.json"), "utf8"));

describe("dependency boundary", () => {
  it("links scene-core and layout-core by path and nothing else at run time", () => {
    expect(pkg.dependencies).toEqual({ "isongraph-visualize-scene-core": "file:../scene-core", "isongraph-visualize-layout-core": "file:../layout-core" });
    expect(pkg.engines.node).toBe(">=22");
    expect(pkg.type).toBe("module");
    expect(pkg.exports).toEqual({ ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } });
  });
  it("pins every dev dependency exactly, to the versions layout-core pins", () => {
    for (const [n, r] of Object.entries(pkg.devDependencies as Record<string, string>)) {
      expect(r, n).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r, n).toBe(layout.devDependencies[n]);
    }
    for (const t of ["typescript", "vitest"]) expect(Object.keys(pkg.dependencies), t).not.toContain(t);
  });
  it("has the same scripts as layout-core where it has them", () => {
    for (const s of ["typecheck", "build", "test", "check"]) expect(pkg.scripts[s], s).toBe(layout.scripts[s]);
  });
});
