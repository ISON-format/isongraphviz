// Design 15.7 (5): surface and source-audit tests. They read src/ as text; nothing here is a runtime behaviour.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as rendererCore from "isongraph-visualize-renderer-core";
import * as scene from "isongraph-visualize-scene-core";
import * as layout from "isongraph-visualize-layout-core";
import * as core from "../src/index.js";
import { PKG_DIR } from "./helpers.js";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SRC = join(PKG_DIR, "src");
const coreFiles = walk(SRC).filter((f) => f.endsWith(".ts") && !f.includes(`${join(SRC, "dom")}`));
const domFiles = walk(join(SRC, "dom")).filter((f) => f.endsWith(".ts"));
const read = (f: string): string => readFileSync(f, "utf8");
/** Source without comments and string/template literal contents, so that prose and messages do not trip the greps. */
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
/** The same without the contents of string and template literals, so that messages and prose do not trip word greps. */
const bare = (f: string): string => code(f).replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, "``");
const pkg = JSON.parse(read(join(PKG_DIR, "package.json"))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("package.json (2)", () => {
  it("dependencies are exactly renderer-core; scene-core and layout-core are dev-only", () => {
    expect(pkg["name"]).toBe("isongraph-visualize-renderer-svg");
    expect(pkg["private"]).toBe(true);
    expect(pkg["version"]).toBe("0.0.0");
    expect(pkg["type"]).toBe("module");
    expect(pkg["engines"]).toEqual({ node: ">=22" });
    expect(pkg["dependencies"]).toEqual({ "isongraph-visualize-renderer-core": "file:../renderer-core" });
    expect(pkg["devDependencies"]["isongraph-visualize-scene-core"]).toBe("file:../scene-core");
    expect(pkg["devDependencies"]["isongraph-visualize-layout-core"]).toBe("file:../layout-core");
    const rc = JSON.parse(read(join(PKG_DIR, "..", "renderer-core", "package.json"))) as { devDependencies: Record<string, string> };
    for (const k of ["@types/node", "esbuild", "playwright-core", "typescript", "vitest"]) expect(pkg["devDependencies"][k], k).toBe(rc.devDependencies[k]);
  });
  it("exports exactly . and ./dom", () => { expect(Object.keys(pkg["exports"]).sort()).toEqual([".", "./dom"]); });
  it("the core tsconfig has the ES2022 lib only and no ambient types (no DOM, no node); the dom one has the DOM lib; the core build uses the core config", () => {
    const c = JSON.parse(read(join(PKG_DIR, "tsconfig.core.json"))) as { extends: string; compilerOptions: { lib: string[]; types: unknown[] }; exclude: string[] };
    expect(c.compilerOptions.lib).toEqual(["ES2022"]);
    expect(c.compilerOptions.types).toEqual([]);
    expect(c.exclude).toEqual(["src/dom"]);
    expect(read(join(PKG_DIR, "tsconfig.dom.json"))).toContain('"DOM"');
    expect(read(join(PKG_DIR, "tsconfig.build.json"))).toContain("tsconfig.core.json");
    expect(read(join(PKG_DIR, "tsconfig.build.json"))).toContain('"src/dom"');
  });
});

describe("the core is DOM-free and imports renderer-core only (2, law 7)", () => {
  it("no node: import, no DOM global, no scene-core or layout-core import in src/ outside dom", () => {
    for (const f of coreFiles) {
      const c = code(f);
      expect(c, f).not.toMatch(/from\s+["']node:/);
      expect(c, f).not.toMatch(/\brequire\s*\(/);
      expect(bare(f), f).not.toMatch(/\b(document|window|globalThis\.document|DOMParser|XMLSerializer|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|Worker)\b/);
      for (const m of c.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        expect(spec.startsWith("./") || spec === "isongraph-visualize-renderer-core" || spec === "isongraph-visualize-renderer-core/headless", `${f}: ${spec}`).toBe(true);
      }
    }
  });
  it("the adapter imports only core files and renderer-core", () => {
    for (const f of domFiles) for (const m of code(f).matchAll(/from\s+["']([^"']+)["']/g)) expect(m[1]!.startsWith("../") || m[1] === "isongraph-visualize-renderer-core", `${f}: ${m[1]}`).toBe(true);
  });
  it("the public value exports are exactly the list of 2, and none equals a renderer-core, scene-core or layout-core export", () => {
    expect(Object.keys(core).sort()).toEqual(["DEFAULT_READ_LIMITS", "DEFAULT_SVG_LIMITS", "SVG_FORMAT", "createSvgRenderer", "createSvgSubject", "decodeElementId", "elementDomId", "pickElement", "readSvg", "renderSvg", "renderSvgDetailed", "svgManifest", "svgWitness", "writeSvg"]);
    const foreign = new Set([...Object.keys(rendererCore), ...Object.keys(scene), ...Object.keys(layout)]);
    for (const k of Object.keys(core)) expect(foreign.has(k), k).toBe(false);
  });
  it("renderSvg, renderSvgDetailed, pickElement take at most three or four parameters as specified", () => {
    expect(core.renderSvg.length).toBeLessThanOrEqual(3);
    expect(core.renderSvgDetailed.length).toBeLessThanOrEqual(3);
    expect(core.writeSvg.length).toBe(4);
    expect(core.pickElement.length).toBe(4);
  });
});

describe("determinism audit (14.1)", () => {
  const BANNED = /\b(Date|Math\.random|Intl|toLocaleString|toLocaleUpperCase|toLocaleLowerCase|localeCompare|performance|process\.env|setTimeout|setInterval|crypto|structuredClone)\b/;
  it("no clock, random source, locale, environment or hashing in the core", () => { for (const f of coreFiles) expect(bare(f), f).not.toMatch(BANNED); });
  it("no floating-point arithmetic or number formatting decides geometry: geometry.ts and num.ts use bigint only and no Math", () => {
    for (const f of [join(SRC, "geometry.ts"), join(SRC, "num.ts")]) {
      const c = code(f);
      expect(c, f).not.toMatch(/\bMath\./);
      expect(c, f).not.toMatch(/toFixed|toPrecision|toExponential|parseFloat|Number\(/);
    }
  });
  it("number-to-string conversion of a geometry value happens in fmt only", () => {
    const g = code(join(SRC, "geometry.ts"));
    expect(g).not.toMatch(/\.toString\(|String\(/);
    const n = code(join(SRC, "num.ts"));
    expect([...n.matchAll(/\.toString\(/g)].length).toBe(2); // both inside fmt
    const fmtBody = n.slice(n.indexOf("export function fmt"), n.indexOf("export interface Viewport"));
    expect([...fmtBody.matchAll(/\.toString\(/g)].length).toBe(2);
    const w = code(join(SRC, "write.ts"));
    expect(w).not.toMatch(/\.toString\(|toFixed|String\(/);
  });
  it("no argument spreading or apply over a scene-sized array (27 15 audit C-1)", () => {
    for (const f of coreFiles) {
      const c = code(f);
      expect(c, f).not.toMatch(/\.apply\(/);
      expect(c, f).not.toMatch(/\(\s*\.\.\.(nodes|edges|model\.|lines)/);
    }
  });
  it("Map and Set are never iterated for output order (only get/set/has/add/delete; groups are visited through arrays)", () => {
    const w = code(join(SRC, "write.ts"));
    // the one `for ... of groups.values()` only assigns ranks within each group; the output order is the scene order
    expect(w.match(/for \(const [a-z]+ of [a-zA-Z.]+\.(values|keys|entries)\(\)\)/g) ?? []).toEqual(["for (const list of groups.values())"]);
  });
});

describe("security audit (11)", () => {
  it("no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, Function constructor or dynamic import in src (adapter included)", () => {
    for (const f of [...coreFiles, ...domFiles]) {
      const c = code(f);
      expect(c, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function|\bimport\s*\(|createContextualFragment|srcdoc|setAttribute\(\s*["']on/);
    }
  });
  it("the writer emits only the allowlisted elements and no URL other than url(#P-arrow)", () => {
    const w = read(join(SRC, "write.ts")) + read(join(SRC, "constants.ts"));
    for (const bad of ["<script", "<foreignObject", "<image", "<use", "<a ", "<animate", "<set ", "<iframe", "<link", "href=", "xlink", "javascript:", "data:", "@import", "<!DOCTYPE", "<![CDATA[", "<!--"]) expect(w.includes(bad), bad).toBe(false);
    expect([...w.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1])).toEqual(["#${P}-arrow"]);
  });
  it("the adapter writes the status line with textContent and replaces the document with importNode", () => {
    const d = code(join(SRC, "dom", "index.ts"));
    expect(d).toContain("textContent");
    expect(d).toContain("importNode");
    expect(d).toContain("DOMParser");
    expect(d).not.toMatch(/\.style\.(?!cursor)/);
  });
});

describe("naming and files", () => {
  it("no product or project names in any file of the package (no network, no personal names)", () => {
    const files = [...walk(SRC), ...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), ...walk(join(PKG_DIR, "demo")).filter((f) => !f.includes("out") && !f.includes("dist")), join(PKG_DIR, "package.json"), join(PKG_DIR, "README.md")];
    const banned = new RegExp(["bett" + "erify", "skill" + "den", "brain" + "landing", "mah" + "es", "gold" + "mine"].join("|"), "i");
    for (const f of files) { let t: string; try { t = read(f); } catch { continue; } expect(t, f).not.toMatch(banned); }
  });
  it("LF only: no CR in any source, test, script or demo file", () => {
    for (const f of [...walk(SRC), ...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), ...walk(join(PKG_DIR, "demo")).filter((f) => !f.includes("dist") && !f.includes("out")), join(PKG_DIR, "package.json")]) {
      if (!/\.(ts|mjs|json|html|md)$/.test(f)) continue;
      expect(read(f).includes("\r"), f).toBe(false);
    }
  });
});
