// Design 14 (5): surface and source-audit tests. They read src/ as text; nothing here is a runtime behaviour.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as rendererCore from "isongraph-visualize-renderer-core";
import * as displayList from "isongraph-visualize-display-list";
import * as core from "../src/index.js";
import * as dom from "../src/dom/index.js";
import { PKG_DIR } from "./helpers.js";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SRC = join(PKG_DIR, "src");
const coreFiles = walk(SRC).filter((f) => f.endsWith(".ts") && !f.includes(`${join(SRC, "dom")}`));
const domFiles = walk(join(SRC, "dom")).filter((f) => f.endsWith(".ts"));
const read = (f: string): string => readFileSync(f, "utf8");
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const bare = (f: string): string => code(f).replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, "``");
const pkg = JSON.parse(read(join(PKG_DIR, "package.json"))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("package.json (2)", () => {
  it("dependencies are exactly renderer-core and display-list (the declared departure CCR-2); scene-core and layout-core are dev-only", () => {
    expect(pkg["name"]).toBe("isongraph-visualize-renderer-webgl");
    expect(pkg["private"]).toBe(true);
    expect(pkg["version"]).toBe("0.0.0");
    expect(pkg["type"]).toBe("module");
    expect(pkg["engines"]).toEqual({ node: ">=22" });
    expect(pkg["dependencies"]).toEqual({ "isongraph-visualize-display-list": "file:../display-list", "isongraph-visualize-renderer-core": "file:../renderer-core" });
    expect(pkg["devDependencies"]["isongraph-visualize-scene-core"]).toBe("file:../scene-core");
    expect(pkg["devDependencies"]["isongraph-visualize-layout-core"]).toBe("file:../layout-core");
    const rc = JSON.parse(read(join(PKG_DIR, "..", "renderer-core", "package.json"))) as { devDependencies: Record<string, string> };
    for (const k of ["@types/node", "esbuild", "playwright-core", "typescript", "vitest"]) expect(pkg["devDependencies"][k], k).toBe(rc.devDependencies[k]);
  });
  it("exports exactly . and ./dom", () => { expect(Object.keys(pkg["exports"]).sort()).toEqual([".", "./dom"]); });
  it("the core tsconfig has the ES2022 lib only and no ambient types (no DOM, no node); the dom one has the DOM lib; the core build uses the core config", () => {
    const c = JSON.parse(read(join(PKG_DIR, "tsconfig.core.json"))) as { compilerOptions: { lib: string[]; types: unknown[] }; exclude: string[] };
    expect(c.compilerOptions.lib).toEqual(["ES2022"]);
    expect(c.compilerOptions.types).toEqual([]);
    expect(c.exclude).toEqual(["src/dom"]);
    expect(read(join(PKG_DIR, "tsconfig.dom.json"))).toContain('"DOM"');
    expect(read(join(PKG_DIR, "tsconfig.build.json"))).toContain("tsconfig.core.json");
  });
});

describe("the core is DOM-free; no renderer imports another renderer", () => {
  it("no node: import, no DOM global, no scene-core, layout-core or other renderer import in src outside dom", () => {
    for (const f of coreFiles) {
      const c = code(f);
      expect(c, f).not.toMatch(/from\s+["']node:/);
      expect(bare(f), f).not.toMatch(/\b(document|window|globalThis|DOMParser|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|Worker|HTMLCanvasElement|OffscreenCanvas|WebGL2RenderingContext|TextEncoder|TextDecoder)\b/);
      for (const m of c.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        expect(spec.startsWith("./") || ["isongraph-visualize-renderer-core", "isongraph-visualize-renderer-core/headless", "isongraph-visualize-display-list", "isongraph-visualize-display-list/canvas2d"].includes(spec), `${f}: ${spec}`).toBe(true);
      }
    }
  });
  it("the adapter imports only core files, renderer-core and display-list", () => {
    for (const f of domFiles) for (const m of code(f).matchAll(/from\s+["']([^"']+)["']/g)) expect(m[1]!.startsWith("../") || ["isongraph-visualize-renderer-core", "isongraph-visualize-display-list", "isongraph-visualize-display-list/canvas2d"].includes(m[1]!), `${f}: ${m[1]}`).toBe(true);
  });
  it("the public value exports are the list of design 2, and none equals a renderer-core or display-list export", () => {
    expect(Object.keys(core).sort()).toEqual([
      "DEFAULT_GL_LIMITS", "GL_FORMAT", "GL_SEG", "SHADER_SET_SHA256", "SHADER_SOURCES", "contextAttributes", "createGlController", "createGlResources", "createWebglRenderer", "createWebglSubject",
      "deleteGlResources", "executePlan", "glManifest", "glWitness", "parseGlPlan", "planGl", "probeWebgl", "readGlPlan", "readoutFromGl", "releaseGlContext", "serializePlan", "shaderSetBytes",
    ]);
    expect(Object.keys(dom).sort()).toEqual(["createDomWebglRenderer"]);
    const foreign = new Set([...Object.keys(rendererCore), ...Object.keys(displayList)]);
    for (const k of [...Object.keys(core), ...Object.keys(dom)]) expect(foreign.has(k), k).toBe(false);
  });
});

describe("determinism audit (12)", () => {
  const BANNED = /\b(Date|Math\.random|Intl|toLocaleString|localeCompare|performance|process\.env|setTimeout|setInterval|crypto|structuredClone)\b/;
  it("no clock, random source, locale, environment, timer or hashing in the core or the adapter", () => { for (const f of [...coreFiles, ...domFiles]) expect(bare(f), f).not.toMatch(BANNED); });
  it("no argument spreading or apply over a scene-sized array", () => { for (const f of [...coreFiles, ...domFiles]) expect(code(f), f).not.toMatch(/\.apply\(|\(\s*\.\.\.(nodes|edges|model\.|lines|records|insts)/); });
  it("multi-byte values are read and written through DataView with the explicit little-endian flag, never through a typed array of native order (12)", () => {
    for (const f of coreFiles) {
      for (const line of bare(f).split("\n")) if (/\.(set|get)(Float32|Uint16|Uint32)\(/.test(line)) expect(line, `${f}: ${line}`).toMatch(/,\s*true\)/);
      expect(bare(f), f).not.toMatch(/new\s+(Float32Array|Float64Array|Uint32Array|Uint16Array|Int32Array)/);
    }
  });
  it("no number-to-string conversion of a geometry value outside the canonical writer: no toFixed, toString of a number or template of a coordinate in plan, clip, read, readout", () => {
    for (const f of ["plan.ts", "clip.ts", "readout.ts"].map((x) => join(SRC, x))) expect(bare(f), f).not.toMatch(/\.toFixed\(|\.toPrecision\(|\.toExponential\(/);
  });
});

describe("security audit (11.1, 11.2, 11.3)", () => {
  it("no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, Function constructor, dynamic import or setAttribute of a style (adapter included)", () => {
    for (const f of [...coreFiles, ...domFiles]) expect(code(f), f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function|\bimport\s*\(|createContextualFragment|srcdoc|setAttribute\(\s*["'](style|on)/);
  });
  it("the adapter sets only the attributes of 8.2 and the canvas sizes: setAttribute is role, aria-hidden, aria-live and aria-label; the CSSOM gets String(int) + px and constant layout strings", () => {
    const d = code(join(SRC, "dom", "index.ts"));
    expect([...d.matchAll(/setAttribute\(\s*"([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(["aria-hidden", "aria-label", "aria-live", "role", "role"]);
    expect([...d.matchAll(/\.style\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(["display", "height", "left", "pointerEvents", "position", "position", "top", "width"]);
    expect(d).toContain('String(width) + "px"');
    expect(d).toContain("textContent");
    expect(d).not.toMatch(/tabindex|tabIndex|keydown|keyup|wheel|pointermove|pointerup|focus\(|mouseover|hover/i);
    expect([...d.matchAll(/addEventListener\(\s*"(\w+)"/g)].map((m) => m[1])).toEqual(["pointerdown"]);
  });
  it("no network, storage, clipboard or timer in the adapter, no getError and no readPixels anywhere (7.9)", () => {
    for (const f of domFiles) expect(bare(f), f).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|clipboard|requestAnimationFrame|matchMedia|ResizeObserver)\b/);
    for (const f of [...coreFiles, ...domFiles]) expect(bare(f), f).not.toMatch(/\b(getError|readPixels|getSupportedExtensions|WEBGL_debug_renderer_info|UNMASKED_VENDOR_WEBGL|UNMASKED_RENDERER_WEBGL)\b/);
  });
  it("every shaderSource argument is the constant of SHADER_SOURCES, and the only getExtension is WEBGL_lose_context (11.3, 11.6)", () => {
    const calls = coreFiles.flatMap((f) => [...code(f).matchAll(/\.shaderSource\(([^;]*)\);/g)].map((m) => m[1]!));
    expect(calls).toEqual(["s.handle, SHADER_SOURCES[p][stage]"]);
    const ext = coreFiles.flatMap((f) => [...code(f).matchAll(/getExtension\(\s*"([^"]+)"/g)].map((m) => m[1]!));
    expect(ext).toEqual(["WEBGL_lose_context"]);
  });
  it("no graph-derived string reaches a shader, a font or a style: shaders.ts imports nothing but the writer, and a font string is a constant of display-list", () => {
    const t = code(join(SRC, "shaders.ts"));
    expect([...t.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])).toEqual(["./bytes.js"]);
    expect(t).not.toMatch(/\$\{|`/);
    for (const f of [...coreFiles, ...domFiles]) expect(bare(f), f).not.toMatch(/\.font\s*=|fillStyle|strokeStyle/);
  });
});

describe("naming and files", () => {
  it("no product or personal names in any file of the package", () => {
    const files = [...walk(SRC), ...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), ...walk(join(PKG_DIR, "demo")).filter((f) => !f.includes("out") && !f.includes("dist")), join(PKG_DIR, "package.json"), join(PKG_DIR, "README.md")];
    const banned = new RegExp(["bett" + "erify", "skill" + "den", "brain" + "landing", "mah" + "es", "gold" + "mine"].join("|"), "i");
    for (const f of files) { let t: string; try { t = read(f); } catch { continue; } expect(t, f).not.toMatch(banned); }
  });
  it("LF only: no CR in any source, test, script or demo file", () => {
    for (const f of [...walk(SRC), ...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), ...walk(join(PKG_DIR, "demo")).filter((x) => !x.includes("dist") && !x.includes("out")), join(PKG_DIR, "package.json")]) {
      if (!/\.(ts|mjs|json|html|md)$/.test(f)) continue;
      expect(read(f).includes("\r"), f).toBe(false);
    }
  });
  it("node_modules, dist, .mutants and demo/out are git-ignored", () => {
    const ig = read(join(PKG_DIR, ".gitignore")).split("\n");
    for (const k of ["node_modules/", "dist/", ".mutants/", "demo/out/"]) expect(ig).toContain(k);
  });
});
