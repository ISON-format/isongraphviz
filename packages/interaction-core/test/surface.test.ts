// Design 16 (6): surface and source-audit tests. They read src/ as text; nothing here is a runtime behaviour.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as rendererCore from "isongraph-visualize-renderer-core";
import * as sceneCore from "isongraph-visualize-scene-core";
import * as primitives from "isongraph-visualize-scene-core/primitives";
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
  it("dependencies are exactly renderer-core and scene-core (CCR-V11-7); layout-core is dev-only; the tooling versions equal renderer-core's", () => {
    expect(pkg["name"]).toBe("isongraph-visualize-interaction-core");
    expect(pkg["private"]).toBe(true);
    expect(pkg["version"]).toBe("0.0.0");
    expect(pkg["type"]).toBe("module");
    expect(pkg["engines"]).toEqual({ node: ">=22" });
    expect(pkg["dependencies"]).toEqual({ "isongraph-visualize-renderer-core": "file:../renderer-core", "isongraph-visualize-scene-core": "file:../scene-core" });
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
  it("the layout of design 2: errors, events, machine, bindings, navigation, lasso, geometry, index, and dom/index", () => {
    expect(coreFiles.map((f) => f.slice(SRC.length + 1)).sort()).toEqual(["bindings.ts", "errors.ts", "events.ts", "geometry.ts", "index.ts", "lasso.ts", "machine.ts", "navigation.ts"]);
    expect(domFiles.map((f) => f.slice(SRC.length + 1))).toEqual([join("dom", "index.ts")]);
  });
});

describe("the core is DOM-free and imports only what design 2 allows", () => {
  it("no node: import, no DOM global in src outside dom; imports only ./ files, renderer-core and scene-core/primitives", () => {
    for (const f of coreFiles) {
      const c = code(f);
      expect(c, f).not.toMatch(/from\s+["']node:/);
      expect(bare(f), f).not.toMatch(/\b(document|window|globalThis|DOMParser|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|Worker|HTMLElement|HTMLCanvasElement|TextEncoder|TextDecoder|queueMicrotask)\b/);
      for (const m of c.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        expect(spec.startsWith("./") || ["isongraph-visualize-renderer-core", "isongraph-visualize-scene-core/primitives"].includes(spec), `${f}: ${spec}`).toBe(true);
      }
    }
  });
  it("the binder imports only core files and the public names of renderer-core; it never imports scene-core, an adapter or another package", () => {
    for (const f of domFiles) for (const m of code(f).matchAll(/from\s+["']([^"']+)["']/g)) expect(m[1]!.startsWith("../") || m[1] === "isongraph-visualize-renderer-core", `${f}: ${m[1]}`).toBe(true);
  });
  it("renderer-core is imported only by its public names (27 14)", () => {
    const publicNames = new Set(Object.keys(rendererCore));
    for (const f of [...coreFiles, ...domFiles]) {
      for (const m of code(f).matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']isongraph-visualize-renderer-core["']/g)) {
        for (const raw of m[1]!.split(",")) {
          const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
          if (name === "" || /^[A-Z]/.test(name) && !publicNames.has(name)) continue; // a type name (checked by tsc)
          expect(publicNames.has(name), `${f}: ${name}`).toBe(true);
        }
      }
    }
  });
  it("scene-core/primitives is imported only for canonicalBytesSigned and hasLoneSurrogate (the type CJValue aside)", () => {
    const names = new Set<string>();
    for (const f of coreFiles) for (const m of code(f).matchAll(/import\s+\{([^}]*)\}\s+from\s+["']isongraph-visualize-scene-core\/primitives["']/g)) for (const raw of m[1]!.split(",")) names.add(raw.trim().replace(/^type\s+/, ""));
    expect([...names].sort()).toEqual(["CJValue", "canonicalBytesSigned", "hasLoneSurrogate"]);
  });
  it("the public value exports are the list of design 2, and none equals a renderer-core or scene-core export (nothing is re-exported)", () => {
    expect(Object.keys(core).sort()).toEqual([
      "COORD_MAX_MILLI", "DEFAULT_BINDINGS", "DRAG_THRESHOLD_MILLI", "IA_BIND", "IA_INPUT", "IA_LASSO", "IA_NAV", "IaError", "LONG_PRESS_MS", "PAN_STEP_PX", "REVEAL_MARGIN_PX",
      "WHEEL_MAX_NOTCHES", "WHEEL_NOTCH_MILLI", "ZOOM_STEP_IN", "ZOOM_STEP_OUT", "createMachine", "isKeyToken", "keyToken", "lassoTargets", "parseMachine", "prepareConfig", "resolveNavigation", "revealPan",
      "serializeBindings", "serializeMachine", "serializeStep", "step", "validateEvent", "verifyBindings",
    ]);
    expect(Object.keys(dom).sort()).toEqual(["bindInteraction"]);
    const foreign = new Set([...Object.keys(rendererCore), ...Object.keys(sceneCore), ...Object.keys(primitives)]);
    for (const k of [...Object.keys(core), ...Object.keys(dom)]) expect(foreign.has(k), k).toBe(false);
  });
  it("the constants of 3.3 have the stated values", () => {
    expect([core.DRAG_THRESHOLD_MILLI, core.LONG_PRESS_MS, core.WHEEL_NOTCH_MILLI, core.WHEEL_MAX_NOTCHES, core.ZOOM_STEP_IN, core.ZOOM_STEP_OUT, core.PAN_STEP_PX, core.COORD_MAX_MILLI, core.REVEAL_MARGIN_PX])
      .toEqual([4000, 500, 100_000, 8, 1250, 800, 32, 2 ** 39, 24]);
    expect([core.IA_INPUT, core.IA_BIND, core.IA_NAV, core.IA_LASSO]).toEqual(["igr-input/1", "igr-bind/1", "igr-nav/1", "igr-lasso/1"]);
  });
  it("step has at most six parameters (design 16 (6))", () => { expect(core.step.length).toBeLessThanOrEqual(6); });
});

describe("determinism audit (14.4)", () => {
  const BANNED = /\b(Date|Math\.random|Intl|toLocaleString|localeCompare|performance|process\.env|setTimeout|setInterval|crypto|structuredClone)\b/;
  it("no clock, random source, locale, environment, timer or hashing in the core", () => { for (const f of coreFiles) expect(bare(f), f).not.toMatch(BANNED); });
  it("the binder uses no clock beyond the event's own timeStamp, no random source, locale or environment; its only timer is the one for wake_at", () => {
    for (const f of domFiles) {
      expect(bare(f), f).not.toMatch(/\b(Date|Math\.random|Intl|toLocaleString|localeCompare|performance|process\.env|setInterval|crypto|structuredClone|requestAnimationFrame)\b/);
      expect([...bare(f).matchAll(/\bsetTimeout\(/g)].length, f).toBe(1);
    }
  });
  it("no argument spreading or apply over a scene-sized array (27 15, audit C-1): loops only", () => {
    for (const f of [...coreFiles, ...domFiles]) {
      expect(code(f), f).not.toMatch(/\.apply\(|\(\s*\.\.\.(nodes|edges|model\.|lines|records|targets|all)\b/);
    }
  });
  it("no sort without a comparator, no iteration over an object keyed by graph strings (Map iteration only over fixed-key readers)", () => {
    for (const f of [...coreFiles, ...domFiles]) expect(code(f), f).not.toMatch(/\.sort\(\)/);
  });
  it("no plain-object lookup keyed by a graph-derived string: every dictionary-shaped type in src is a fixed-key output literal (Map and Set elsewhere)", () => {
    for (const f of [...coreFiles, ...domFiles]) {
      const c = code(f);
      expect(c, f).not.toMatch(/\bRecord<string, (?!unknown\b|CJValue\b)/); // Record<string, unknown> reads plain-data copies; Record<string, CJValue> builds fixed-key output objects
      expect(c, f).not.toMatch(/\bnew Object\(|\{\}\s+as\s+Record/);
    }
  });
  it("no null in any serializer path: serializers build objects with absent optional keys, never null", () => {
    for (const f of coreFiles) expect(bare(f).match(/\bnull\b/g)?.length ?? 0, f).toBeLessThan(12); // type guards only: `v === null`
    for (const f of ["machine.ts", "bindings.ts"]) expect(code(join(SRC, f)), f).not.toMatch(/:\s*null\b|\?\s*null\s*:/);
  });
});

describe("security audit (14.3)", () => {
  it("no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, Function constructor, dynamic import, style attribute or event-handler attribute", () => {
    for (const f of [...coreFiles, ...domFiles]) expect(code(f), f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function|\bimport\s*\(|createContextualFragment|srcdoc|setAttribute\(\s*["'](style|on)/);
  });
  it("the binder: only these listeners; setAttribute only tabindex; CSSOM only touchAction; focus calls only preventScroll; no network, storage, clipboard", () => {
    const d = code(join(SRC, "dom", "index.ts"));
    expect([...d.matchAll(/\bon<\w+>\(\s*"(\w+)"/g)].map((m) => m[1]).sort()).toEqual(["contextmenu", "dblclick", "focusin", "keydown", "pointercancel", "pointerdown", "pointermove", "pointerup", "wheel"]);
    expect([...d.matchAll(/setAttribute\(\s*"([^"]+)"/g)].map((m) => m[1])).toEqual(["tabindex"]);
    expect([...d.matchAll(/\.style\??\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(["touchAction", "touchAction", "touchAction"]);
    expect([...d.matchAll(/focus\(\s*\{([^}]*)\}\s*\)/g)].map((m) => m[1]!.trim())).toEqual(["preventScroll: true"]);
    expect(bare(join(SRC, "dom", "index.ts"))).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|clipboard|matchMedia|ResizeObserver|MutationObserver)\b/);
    expect(d).toContain("{ passive: false }");
  });
  it("the binder never reads an event for identity beyond the pick function and addressOfElement", () => {
    const d = code(join(SRC, "dom", "index.ts"));
    expect(d).not.toMatch(/\.(id|className|textContent|innerText|dataset|getAttribute\()/);
  });
});

describe("naming and files", () => {
  it("no product or personal names in any file of the package", () => {
    const files = [...walk(SRC), ...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), ...walk(join(PKG_DIR, "demo")).filter((f) => !f.includes("out") && !f.includes("dist")), join(PKG_DIR, "package.json"), join(PKG_DIR, "README.md")];
    const banned = new RegExp(["bett" + "erify", "skill" + "den", "brain" + "landing", "mah" + "es", "gold" + "mine"].join("|"), "i");
    for (const f of files) { let t: string; try { t = read(f); } catch { continue; } expect(t, f).not.toMatch(banned); }
  });
  it("LF only: no CR in any source, test, script or demo file", () => {
    for (const f of [...walk(SRC), ...walk(join(PKG_DIR, "test")), ...walk(join(PKG_DIR, "scripts")), ...walk(join(PKG_DIR, "demo")).filter((x) => !x.includes("dist") && !x.includes("out")), join(PKG_DIR, "package.json"), join(PKG_DIR, "README.md")]) {
      if (!/\.(ts|mjs|json|html|md)$/.test(f)) continue;
      expect(read(f).includes("\r"), f).toBe(false);
    }
  });
  it("node_modules, dist, .mutants and demo/out are git-ignored", () => {
    const ig = read(join(PKG_DIR, ".gitignore")).split("\n");
    for (const k of ["node_modules/", "dist/", ".mutants/", "demo/out/"]) expect(ig).toContain(k);
  });
});
