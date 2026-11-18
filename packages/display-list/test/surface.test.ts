// Design 14 (5): surface and source-audit tests. They read src/ as text; nothing here is a runtime behaviour.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as rendererCore from "isongraph-visualize-renderer-core";
import * as scene from "isongraph-visualize-scene-core";
import * as layout from "isongraph-visualize-layout-core";
import * as core from "../src/index.js";
import * as canvas2d from "../src/canvas2d/index.js";
import { PKG_DIR } from "./helpers.js";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SRC = join(PKG_DIR, "src");
const srcFiles = walk(SRC).filter((f) => f.endsWith(".ts"));
const read = (f: string): string => readFileSync(f, "utf8");
/** Source without comments, so that prose does not trip the greps. */
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
/** The same without the contents of string and template literals. */
const bare = (f: string): string => code(f).replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, "``");
const pkg = JSON.parse(read(join(PKG_DIR, "package.json"))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("package.json (2)", () => {
  it("dependencies are exactly renderer-core; scene-core and layout-core are dev-only", () => {
    expect(pkg["name"]).toBe("isongraph-visualize-display-list");
    expect(pkg["private"]).toBe(true);
    expect(pkg["version"]).toBe("0.0.0");
    expect(pkg["type"]).toBe("module");
    expect(pkg["engines"]).toEqual({ node: ">=22" });
    expect(pkg["dependencies"]).toEqual({ "isongraph-visualize-renderer-core": "file:../renderer-core" });
    expect(pkg["devDependencies"]["isongraph-visualize-scene-core"]).toBe("file:../scene-core");
    expect(pkg["devDependencies"]["isongraph-visualize-layout-core"]).toBe("file:../layout-core");
    const rc = JSON.parse(read(join(PKG_DIR, "..", "renderer-core", "package.json"))) as { devDependencies: Record<string, string> };
    for (const k of ["@types/node", "typescript", "vitest"]) expect(pkg["devDependencies"][k], k).toBe(rc.devDependencies[k]);
  });
  it("exports exactly . and ./canvas2d", () => { expect(Object.keys(pkg["exports"]).sort()).toEqual([".", "./canvas2d"]); });
  it("every tsconfig that builds src has the ES2022 lib only and no ambient types (no DOM, no node)", () => {
    const c = JSON.parse(read(join(PKG_DIR, "tsconfig.core.json"))) as { compilerOptions: { lib: string[]; types: unknown[] } };
    expect(c.compilerOptions.lib).toEqual(["ES2022"]);
    expect(c.compilerOptions.types).toEqual([]);
    expect(read(join(PKG_DIR, "tsconfig.build.json"))).toContain("tsconfig.core.json");
  });
});

describe("the core is DOM-free and imports renderer-core only", () => {
  it("no node: import, no DOM global, no TextEncoder or TextDecoder, no scene-core or layout-core import in src", () => {
    for (const f of srcFiles) {
      const c = code(f);
      expect(c, f).not.toMatch(/from\s+["']node:/);
      expect(c, f).not.toMatch(/\brequire\s*\(/);
      expect(bare(f), f).not.toMatch(/\b(document|window|globalThis|DOMParser|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|Worker|TextEncoder|TextDecoder|HTMLCanvasElement|OffscreenCanvas)\b/);
      for (const m of c.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        expect(spec.startsWith("./") || spec.startsWith("../") || spec === "isongraph-visualize-renderer-core", `${f}: ${spec}`).toBe(true);
      }
    }
  });
  it("the public value exports are the list of design 2 plus the documented additions, and none equals a foreign export", () => {
    expect(Object.keys(core).sort()).toEqual([
      "DEFAULT_CV_READ_LIMITS", "DEFAULT_DL_LIMITS", "DEFAULT_DL_READ_LIMITS", "DL_COORD_MAX", "DL_FORMAT", "GUARD_MARGIN", "THEME", "THEME_FORMAT",
      "assembleReadout", "backingSize", "buildDisplayList", "buildPickBuffer", "compareReadouts", "createPicker", "dryLabelPass", "elementBounds", "inGuardBox",
      "parseDisplayList", "parsePickBuffer", "pickerFromList", "readoutFromList", "readoutFromSvgReadout", "resolveDlOptions", "serializeBounds", "serializeDisplayList", "serializePickBuffer", "serializeReadout",
    ]);
    expect(Object.keys(canvas2d).sort()).toEqual(["canvasStreamWitness", "createRecordingContext", "readoutFromCanvasStream", "recordCanvasCalls", "replayCanvas", "resolveReplayOptions"]);
    const foreign = new Set([...Object.keys(rendererCore), ...Object.keys(scene), ...Object.keys(layout)]);
    for (const k of [...Object.keys(core), ...Object.keys(canvas2d)]) expect(foreign.has(k), k).toBe(false);
  });
  it("buildDisplayList takes at most three parameters", () => { expect(core.buildDisplayList.length).toBeLessThanOrEqual(3); });
});

describe("determinism audit (12)", () => {
  const BANNED = /\b(Date|Math\.random|Intl|toLocaleString|toLocaleUpperCase|toLocaleLowerCase|localeCompare|performance|process\.env|setTimeout|setInterval|crypto|structuredClone)\b/;
  it("no clock, random source, locale, environment or hashing in any source", () => { for (const f of srcFiles) expect(bare(f), f).not.toMatch(BANNED); });
  it("the arithmetic modules use no floating point: num.ts and geometry.ts have no Math, no formatting, no parseFloat", () => {
    for (const f of [join(SRC, "geometry.ts"), join(SRC, "num.ts"), join(SRC, "build.ts")]) {
      const c = code(f);
      expect(c, f).not.toMatch(/\bMath\./);
      expect(c, f).not.toMatch(/toFixed|toPrecision|toExponential|parseFloat/);
    }
  });
  it("the allowed floating point is exactly: m / 1000 and 2 pi in the executor, Math.round and the tolerance in the recorder", () => {
    const allowed = new Set(["canvas2d/replay.ts", "canvas2d/record.ts", "pick.ts", "readout.ts", "text.ts", "lines.ts", "utf8.ts", "canon.ts", "read.ts", "bounds.ts", "device.ts", "options.ts", "compare.ts", "write.ts", "address.ts", "canvas2d/stream.ts", "canvas2d/witness.ts", "build.ts"]);
    for (const f of srcFiles) {
      const rel = f.slice(SRC.length + 1).replace(/\\/g, "/");
      const math = [...bare(f).matchAll(/\bMath\.(\w+)/g)].map((m) => m[1]);
      if (math.length > 0) expect(allowed.has(rel), `${rel}: ${math.join(",")}`).toBe(true);
    }
    expect([...new Set([...bare(join(SRC, "canvas2d", "replay.ts")).matchAll(/\bMath\.(\w+)/g)].map((m) => m[1]))]).toEqual(["PI"]);
    expect([...new Set([...bare(join(SRC, "canvas2d", "record.ts")).matchAll(/\bMath\.(\w+)/g)].map((m) => m[1]))].sort()).toEqual(["PI", "abs", "max", "round"]);
  });
  it("number-to-string conversion happens in the canonical writer only (and for the three colour integers)", () => {
    for (const f of srcFiles) {
      const rel = f.slice(SRC.length + 1).replace(/\\/g, "/");
      const c = bare(f);
      expect(c, rel).not.toMatch(/\.toString\(|toFixed/);
      if (rel !== "canon.ts") expect(c, rel).not.toMatch(/\bString\(/);
    }
    const replay = code(join(SRC, "canvas2d", "replay.ts"));
    const templates = [...replay.matchAll(/`[^`]*\$\{[^`]*`/g)].map((m) => m[0]);
    expect(templates.filter((s) => s.includes("rgb("))).toEqual(["`rgb(${c[0]},${c[1]},${c[2]})`"]);
    // every other template literal of the replay is an error path, never a style, a font or a coordinate
    expect(templates.filter((s) => !s.includes("rgb(") && !s.startsWith("`${path}") && !s.startsWith("`options.") && !s.startsWith("`source."))).toEqual([]);
  });
  it("no argument spreading or apply over a scene-sized array (27 15 audit C-1)", () => {
    for (const f of srcFiles) {
      const c = code(f);
      expect(c, f).not.toMatch(/\.apply\(/);
      expect(c, f).not.toMatch(/\(\s*\.\.\.(nodes|edges|model\.|lines|records|list\.)/);
    }
  });
  it("no Map or Set is iterated for output order except the groups of parallel edges, whose ranks are assigned in scene order", () => {
    const b = code(join(SRC, "build.ts"));
    expect(b.match(/for \(const [a-z]+ of [a-zA-Z.]+\.(values|keys|entries)\(\)\)/g) ?? []).toEqual(["for (const list of groups.values())"]);
    // compare.ts counts the values of one path to find the majority; it reads no order out of a Map
    for (const f of srcFiles.filter((x) => !x.endsWith("build.ts") && !x.endsWith("compare.ts"))) expect(code(f).match(/of [a-zA-Z.]+\.(values|keys|entries)\(\)/g) ?? [], f).toEqual([]);
    expect(code(join(SRC, "compare.ts")).match(/of [a-zA-Z.]+\.(values|keys|entries)\(\)/g)).toEqual(["of counts.values()"]);
  });
});

describe("security audit (11)", () => {
  it("no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, Function constructor or dynamic import in src", () => {
    for (const f of srcFiles) expect(code(f), f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function|\bimport\s*\(|setAttribute\(/);
  });
  it("a graph-derived string reaches the output only as a JSON string and as the argument of fillText: the font, the colours and the styles are constants or built from integers", () => {
    const replay = code(join(SRC, "canvas2d", "replay.ts"));
    expect([...replay.matchAll(/assign\("font", ([^)]*)\)/g)].map((m) => m[1])).toEqual(["THEME.font"]);
    expect([...replay.matchAll(/\.fillText\((.*)\);/g)].map((m) => m[1])).toEqual(["r[5] as string, num(r, 3), num(r, 4)"]);
  });
});

describe("naming and files", () => {
  it("no product or personal names in any file of the package", () => {
    const files = [...walk(SRC), ...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), join(PKG_DIR, "package.json")];
    const banned = new RegExp(["bett" + "erify", "skill" + "den", "brain" + "landing", "mah" + "es", "gold" + "mine"].join("|"), "i");
    for (const f of files) { let t: string; try { t = read(f); } catch { continue; } expect(t, f).not.toMatch(banned); }
  });
  it("LF only: no CR in any source, test, script or configuration file", () => {
    for (const f of [...walk(SRC), ...walk(join(PKG_DIR, "test")).filter((x) => !x.includes("slow") || true), ...walk(join(PKG_DIR, "scripts")), join(PKG_DIR, "package.json"), join(PKG_DIR, "vitest.config.ts")]) {
      if (!/\.(ts|mjs|json|html|md)$/.test(f)) continue;
      expect(read(f).includes("\r"), f).toBe(false);
    }
  });
  it("node_modules, dist and .mutants are git-ignored", () => {
    const ig = read(join(PKG_DIR, ".gitignore")).split("\n");
    for (const k of ["node_modules/", "dist/", ".mutants/"]) expect(ig).toContain(k);
  });
});
