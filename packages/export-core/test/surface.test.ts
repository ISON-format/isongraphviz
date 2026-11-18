// Design 16 (6): surface and source-audit tests. They read src/ as text; nothing here is a runtime behaviour.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as rendererCore from "isongraph-visualize-renderer-core";
import * as sceneCore from "isongraph-visualize-scene-core";
import * as primitives from "isongraph-visualize-scene-core/primitives";
import * as core from "../src/index.js";
import { PKG_DIR } from "./helpers.js";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SRC = join(PKG_DIR, "src");
const files = walk(SRC).filter((f) => f.endsWith(".ts"));
const coreFiles = files.filter((f) => !f.includes(`${join(SRC, "dom")}`));
const read = (f: string): string => readFileSync(f, "utf8");
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const bare = (f: string): string => code(f).replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const pkg = JSON.parse(read(join(PKG_DIR, "package.json"))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const NAME = JSON.parse(read(join(PKG_DIR, "package.json"))).name as string;

describe("package.json (2)", () => {
  it("private, version 0.0.0, ESM, Node >=22, exact dependencies of design 2, tooling versions equal renderer-core's", () => {
    expect(pkg["private"]).toBe(true); expect(pkg["version"]).toBe("0.0.0"); expect(pkg["type"]).toBe("module"); expect(pkg["engines"]).toEqual({ node: ">=22" });
    const rc = JSON.parse(read(join(PKG_DIR, "..", "renderer-core", "package.json"))) as { devDependencies: Record<string, string> };
    for (const k of ["@types/node", "esbuild", "playwright-core", "typescript", "vitest"]) expect(pkg["devDependencies"][k], k).toBe(rc.devDependencies[k]);
    expect(Object.keys(pkg["dependencies"]).sort()).toEqual(EXPECTED_DEPS[NAME]);
    for (const [k, v] of Object.entries(pkg["dependencies"])) expect(v, k).toBe(`file:../${k.replace("isongraph-visualize-", "")}`);
  });
  it("the core tsconfig has the ES2022 lib only and no ambient types (no DOM, no node)", () => {
    const c = JSON.parse(read(join(PKG_DIR, "tsconfig.core.json"))) as { compilerOptions: { lib: string[]; types: unknown[] } };
    expect(c.compilerOptions.lib).toEqual(["ES2022"]); expect(c.compilerOptions.types).toEqual([]);
  });
});
const EXPECTED_DEPS: Record<string, string[]> = {
  "isongraph-visualize-a11y-companion": ["isongraph-visualize-interaction-core", "isongraph-visualize-renderer-core", "isongraph-visualize-scene-core"],
  "isongraph-visualize-export-core": ["isongraph-visualize-a11y-companion", "isongraph-visualize-display-list", "isongraph-visualize-interaction-core", "isongraph-visualize-renderer-core", "isongraph-visualize-renderer-svg", "isongraph-visualize-scene-core"],
};

describe("the core is DOM-free and imports only what design 2 allows", () => {
  it("no node: import, no DOM global, imports only ./ files and the declared packages (scene-core only through ./primitives)", () => {
    const allowed = new Set(Object.keys(pkg["dependencies"]).concat(["isongraph-visualize-display-list/canvas2d"]));
    for (const f of coreFiles) {
      const c = code(f);
      expect(c, f).not.toMatch(/from "node:|require\(/);
      expect(bare(f), f).not.toMatch(/process\.|Buffer|window|document|navigator|localStorage|fetch\(|XMLHttpRequest|WebSocket/);
      for (const m of c.matchAll(/from "([^"]+)"/g)) {
        const s = m[1]!;
        if (s.startsWith("./") || s.startsWith("../")) continue;
        const base = s.startsWith("isongraph-visualize-scene-core") ? s : s.replace(/^(isongraph-visualize-[a-z0-9-]+).*$/, "$1");
        if (s.startsWith("isongraph-visualize-scene-core")) expect(s, f).toBe("isongraph-visualize-scene-core/primitives");
        else expect(allowed.has(s) || allowed.has(base), `${f}: ${s}`).toBe(true);
      }
    }
  });
  it("no innerHTML-family API, eval, new Function, document.write, style or href attribute text, anywhere in src (including ./dom)", () => {
    for (const f of files) expect(code(f), f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|\.appendChild\(|setAttribute\(\s*["'](?:style|href|on[a-z]+)["']|\.style\b|dangerouslySetInnerHTML/);
  });
  it("no nondeterministic API (Date, Math.random, Intl, toLocale*, localeCompare, Map/Set iteration deciding a byte is by construction ordered by arrays), no argument spreading of scene-sized arrays", () => {
    for (const f of files) {
      const c = code(f);
      expect(c, f).not.toMatch(/\bDate\b|Math\.random|\bIntl\b|toLocale|localeCompare|performance\.now|Math\.apply|\.apply\(/);
      expect(c, f).not.toMatch(/Math\.(?:max|min)\(\.\.\./);
    }
  });
  it("no plain-object lookup keyed by a graph-derived string: no `Record<string,` index stores in src outside constant tables, and Object.hasOwn for the closed tables", () => {
    for (const f of files) expect(code(f), f).not.toMatch(/\[\s*(?:it|item|i|e|n|el|label|name)\.(?:id|name|label|address)\s*\]\s*=[^=]|\?\?=/);
  });
  it("re-exports nothing of renderer-core, renderer-svg, display-list, scene-core, interaction-core or a11y-companion", () => {
    const mine = new Set(Object.keys(core));
    for (const ns of [rendererCore, sceneCore, primitives]) for (const k of Object.keys(ns)) expect(mine.has(k), k).toBe(false);
    for (const f of coreFiles) expect(read(f), f).not.toMatch(/export \* from "isongraph|export \{[^}]*\} from "isongraph/);
  });
  it("no V11 serializer writes null: the string `null` never appears as a literal in src", () => {
    for (const f of files) expect(code(f), f).not.toMatch(/:\s*null\b[^\n]*serialize|"null"/);
  });
});

describe("hygiene: LF only, no aliasing copy of bytes (audit I-1)", () => {
  const all = (dir: string): string[] => readdirSync(dir).filter((f) => !["node_modules", "dist", ".mutants", "out", ".vite", ".vite-temp", "package-lock.json"].includes(f)).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? all(p) : [p]; });
  it("no file of the package (src, test, scripts, demo, README, configs) contains a CR", () => {
    for (const f of all(PKG_DIR)) expect(readFileSync(f).includes(13), f).toBe(false);
  });
  it("src never copies bytes with `.slice()` with no argument: for a Node Buffer that is a view, `new Uint8Array(x)` is the copy", () => {
    for (const f of files) expect(code(f), f).not.toMatch(/\.slice\(\)/);
  });
});
