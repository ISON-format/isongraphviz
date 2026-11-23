// Surface and boundary tests (design 16.8): exports, dependencies, no DOM lib, no node:* outside node.ts, no banned nondeterminism, Law 5.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as scene from "isongraph-visualize-scene-core";
import * as layout from "isongraph-visualize-layout-core";
import * as api from "../src/index.js";
import * as headless from "../src/headless/index.js";
import * as kit from "../src/conformance/index.js";
import * as nodeKit from "../src/conformance/node.js";
import { buildRenderModel } from "../src/model.js";
import { reduce } from "../src/reduce.js";
import { buildReport } from "../src/report.js";
import { initialState } from "../src/state.js";
import { igl, o1Scene } from "./helpers.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SRC = join(ROOT, "src");
const walk = (dir: string, out: string[] = []): string[] => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
const sources = walk(SRC).filter((p) => p.endsWith(".ts"));
const text = (p: string) => readFileSync(p, "utf8");

describe("public surface", () => {
  it("exports exactly the documented runtime names of design section 14", () => {
    expect(Object.keys(api).sort()).toEqual(["DEFAULT_RENDER_LIMITS", "EDGE_HIT_TOLERANCE_PX", "FIT_PADDING_PX", "IgrError", "MANDATORY_CAPABILITIES", "NODE_HIT_RADIUS_PX", "VIEWPORT_MAX_PX", "ZOOM_DEFAULT_MILLI", "ZOOM_MAX_MILLI", "ZOOM_MIN_MILLI",
      "accessibleDescription", "accessibleName", "announcementFor", "buildAccessibleModel", "buildRenderModel", "compareProjections", "effectiveVisibility", "elementKey", "fitViewport", "graphSummary", "hitTest", "initialState", "isRenderModel", "layoutToScreen", "lookupElement", "modelBytes", "modelSceneBytes",
      "normalizeState", "parseState", "placeLabels", "quantizePx", "quantizeSize", "reduce", "resolveSelection", "runConformance", "selectionReference", "semanticProjection", "serializeEvents", "serializeProjection", "serializeState", "stateSha256", "statusText", "summaryText", "traversalOrder", "verifyManifest"]);
    expect(Object.keys(headless)).toEqual(["createHeadlessRenderer"]);
    expect(Object.keys(nodeKit)).toEqual(["loadCorpus"]);
    expect(typeof kit.runConformance).toBe("function");
  });
  it("re-exports no scene-core or layout-core value", () => {
    const theirs = new Set([...Object.keys(scene), ...Object.keys(layout)]);
    for (const name of [...Object.keys(api), ...Object.keys(kit), ...Object.keys(headless)]) expect(theirs.has(name), name).toBe(false);
    for (const name of Object.keys(api)) expect(Object.values(scene).includes((api as Record<string, unknown>)[name] as never), name).toBe(false);
  });
  it("buildRenderModel takes at most three parameters and none is named or typed as a hash; no source function takes a scene_sha256 parameter", () => {
    expect(api.buildRenderModel.length).toBeLessThanOrEqual(3);
    const decl = readFileSync(join(SRC, "model.ts"), "utf8").match(/export async function buildRenderModel\(([^)]*)\)/)![1]!;
    expect(decl).not.toMatch(/sha|hash/i);
    for (const p of sources) expect(text(p), relative(ROOT, p)).not.toMatch(/\(\s*(?:[a-z]+: [^,)]+,\s*)*scene_?[sS]ha256\s*:/);
  });
});

describe("package boundary", () => {
  const pkg = JSON.parse(text(join(ROOT, "package.json"))) as Record<string, any>;
  const layoutPkg = JSON.parse(readFileSync(join(ROOT, "../layout-core/package.json"), "utf8")) as Record<string, any>;
  it("depends on exactly the two sibling cores by file: path; dev dependencies pinned as in layout-core", () => {
    expect(pkg["dependencies"]).toEqual({ "isongraph-visualize-scene-core": "file:../scene-core", "isongraph-visualize-layout-core": "file:../layout-core" });
    expect(pkg["devDependencies"]).toEqual(layoutPkg["devDependencies"]);
    expect(pkg["name"]).toBe("isongraph-visualize-renderer-core");
    expect(pkg["private"]).toBe(true);
    expect(Object.keys(pkg["exports"])).toEqual([".", "./headless", "./conformance", "./conformance/node"]);
    for (const s of ["typecheck", "build", "test", "check", "smoke"]) expect(pkg["scripts"][s], s).toBeTypeOf("string");
  });
  it("has no DOM lib and is strict NodeNext", () => {
    const ts = JSON.parse(text(join(ROOT, "tsconfig.json"))) as { compilerOptions: Record<string, unknown> };
    expect(ts.compilerOptions["lib"]).toEqual(["ES2022"]);
    expect(ts.compilerOptions["strict"]).toBe(true);
    expect(ts.compilerOptions["module"]).toBe("NodeNext");
  });
  it("no node:* import outside conformance/node.ts, no import of ison-graph-ts or Ext", () => {
    for (const p of sources) {
      const rel = relative(SRC, p).replace(/\\/g, "/");
      const imports = [...text(p).matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
      for (const i of imports) {
        if (i.startsWith("node:")) expect(rel, `${rel} imports ${i}`).toBe("conformance/node.ts");
        expect(/ison-graph-ts|ison-ts/.test(i), `${rel} imports ${i}`).toBe(false);
      }
    }
  });
  it("determinism: the core (everything outside conformance/) uses no wall clock, randomness, locale API or environment read", () => {
    const banned = /\bDate\b|Math\.random|\bIntl\b|toLocale|localeCompare|process\.env|performance\.now|crypto\.getRandomValues|setTimeout|setInterval/;
    for (const p of sources.filter((x) => !relative(SRC, x).startsWith("conformance"))) expect(text(p).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""), relative(ROOT, p)).not.toMatch(banned);
    // the kit takes seeds from its caller; its only entropy is the fallback for omitted seeds
    const run = text(join(SRC, "conformance/run.ts")).replace(/\/\/.*$/gm, "");
    expect(run).not.toMatch(/Math\.random|\bDate\b|performance\.now/);
  });
});

describe("Law 5: no index or internal handle in an error, event, report or state", () => {
  it("events, states and reports carry addresses and hashes only", async () => {
    const m = await buildRenderModel(o1Scene(), igl("layouts/F01.layout.json"));
    let s = initialState(m, { width: 900, height: 600 });
    const events: unknown[] = [];
    for (const i of [{ type: "select", mode: "replace", targets: [{ node: { id: "i:1", type: "person" } }] }, { type: "focus-step", delta: 1 }, { type: "set-hidden", targets: [{ node: { id: "s:ann", type: "person" } }], hidden: true }, { type: "pan", dx: 3, dy: 3 }, { type: "focus-step", delta: 1 }, { type: "focus-step", delta: 1 }]) {
      const r = reduce(m, s, i); s = r.state; events.push(...r.events);
    }
    const all = JSON.stringify([events, s, buildReport(m, s, { labels: "none", edge_labels: false, motion: "none", degradations: [] })]);
    expect(all).not.toMatch(/"index"|"src":\d|"tgt":\d|"idx"|"handle"/);
    for (const e of events) expect(Object.keys(e as object).sort().join()).toMatch(/^(end,type|focus,type|hidden,type|selection,type|type,viewport)$/);
  });
  it("an IgrError carries strings only (code, reason, path, detail)", () => {
    try { reduce({} as never, {} as never, {}); } catch (e) {
      const x = e as Record<string, unknown>;
      for (const k of ["code", "reason", "path", "detail"]) expect(["string", "undefined"]).toContain(typeof x[k]);
      expect(JSON.stringify(Object.fromEntries(Object.entries(x)))).not.toMatch(/\d{3,}/);
    }
  });
});
