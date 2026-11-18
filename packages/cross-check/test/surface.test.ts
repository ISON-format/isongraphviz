// Surface of the cross-check package (design 2, 9.6, 14 (5)): a leaf, test-only, private, with no exports; the one package that imports all three renderers;
// nothing depends on it. The three-way check here pulls forward ONLY the fixture-free presence/marks/centres/labels check (9.6); the PlanMap's V13 item
// "cross-renderer semantic conformance" (groups, LOD, timeline, downstream fixtures) is NOT done by it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PKG_DIR, REPO_DIR } from "./helpers.js";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === "node_modules" ? [] : walk(p)) : [p]; });
const read = (f: string): string => readFileSync(f, "utf8");
const pkg = JSON.parse(read(join(PKG_DIR, "package.json"))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("package.json (2)", () => {
  it("private, version 0.0.0, ESM, Node >=22, no exports, no main, and the exact dependencies of design 2", () => {
    expect(pkg["name"]).toBe("isongraph-visualize-cross-check");
    expect(pkg["private"]).toBe(true);
    expect(pkg["version"]).toBe("0.0.0");
    expect(pkg["type"]).toBe("module");
    expect(pkg["engines"]).toEqual({ node: ">=22" });
    expect(pkg["exports"]).toBeUndefined();
    expect(pkg["main"]).toBeUndefined();
    expect(pkg["dependencies"]).toEqual({
      "isongraph-visualize-display-list": "file:../display-list", "isongraph-visualize-renderer-canvas": "file:../renderer-canvas", "isongraph-visualize-renderer-core": "file:../renderer-core",
      "isongraph-visualize-renderer-svg": "file:../renderer-svg", "isongraph-visualize-renderer-webgl": "file:../renderer-webgl",
    });
    expect(pkg["devDependencies"]["isongraph-visualize-scene-core"]).toBe("file:../scene-core");
    expect(pkg["devDependencies"]["isongraph-visualize-layout-core"]).toBe("file:../layout-core");
  });
  it("is a leaf: no other package depends on it", () => {
    for (const p of ["display-list", "layout-core", "lod-core", "renderer-canvas", "renderer-core", "renderer-svg", "renderer-webgl", "scene-core", "stable-layout-core"]) {
      const text = read(join(REPO_DIR, "packages", p, "package.json"));
      expect(text, p).not.toContain("cross-check");
    }
  });
  it("has no src: it publishes nothing (tests and scripts only)", () => { expect(readdirSync(PKG_DIR)).not.toContain("src"); });
});

describe("naming and files", () => {
  it("no product or personal names in any file of the package", () => {
    const banned = new RegExp(["bett" + "erify", "skill" + "den", "brain" + "landing", "mah" + "es", "gold" + "mine"].join("|"), "i");
    for (const f of [...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), join(PKG_DIR, "package.json"), join(PKG_DIR, "README.md")]) { let t: string; try { t = read(f); } catch { continue; } expect(t, f).not.toMatch(banned); }
  });
  it("LF only: no CR in any test, script or config file", () => {
    for (const f of [...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), join(PKG_DIR, "package.json"), join(PKG_DIR, "README.md"), join(PKG_DIR, "vitest.config.ts"), join(PKG_DIR, "vitest.slow.config.ts"), join(PKG_DIR, "tsconfig.json")]) {
      if (!/\.(ts|mjs|json|md)$/.test(f)) continue;
      let t: string; try { t = read(f); } catch { continue; }
      expect(t.includes("\r"), f).toBe(false);
    }
  });
  it("node_modules, dist, .mutants and demo/out are git-ignored", () => {
    const ig = read(join(PKG_DIR, ".gitignore")).split("\n");
    for (const k of ["node_modules/", "dist/", ".mutants/", "demo/out/"]) expect(ig).toContain(k);
  });
  it("tests read the V5 and V6 corpora as data only: no import of a fixtures tools directory and no read of an oracle generator", () => {
    for (const f of walk(join(PKG_DIR, "test"))) if (f.endsWith(".ts") && !f.endsWith("surface.test.ts")) expect(read(f), f).not.toMatch(/\/tools\/|\.py["'`]/);
  });
});
