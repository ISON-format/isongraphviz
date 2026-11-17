import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import { DEFAULT_LOD_BUDGET, LOD_HARD_LIMITS } from "../src/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const sources = (): Array<[string, string]> => readdirSync(src).filter((f) => f.endsWith(".ts")).map((f) => [f, readFileSync(join(src, f), "utf8")]);

describe("public surface (section 12)", () => {
  it("exports exactly the documented values", () => {
    expect(Object.keys(api).sort()).toEqual([
      "DEFAULT_LOD_BUDGET", "HashUnavailableError", "IgsError", "LODError", "LOD_HARD_LIMITS", "LayoutError", "checkViewConservation", "collapseGroup", "deriveAggregateId", "deriveView",
      "emptyState", "expandGroup", "hashLODState", "isAggregateId", "projectToView", "replaceGroups", "resolveAggregateEdge", "resolveFromView", "serializeLODState", "serializeView",
      "setPinned", "suggestGroups", "verifyLODState", "withLayout", "withZoom",
    ]);
  });
  it("PROVISIONAL limits and default budget are the proposed values of section 11", () => {
    expect(DEFAULT_LOD_BUDGET).toEqual({ maxNodes: 20_000, maxEdges: 100_000, maxWork: 100_000_000 });
    expect(Object.isFrozen(DEFAULT_LOD_BUDGET)).toBe(true);
    expect(LOD_HARD_LIMITS).toMatchObject({
      MAX_INPUT_BYTES: 268_435_456, MAX_STATE_BYTES: 33_554_432, MAX_NODES: 100_000, MAX_EDGES: 500_000, MAX_GROUPS: 20_000, MAX_MEMBER_ENTRIES: 500_000,
      MAX_AGG_DEPTH: 16, MAX_LABEL_UNITS: 256, MAX_RULES: 8, MAX_WORK_HARD: 1_000_000_000, MAX_CALLER_VISITS: 4_194_304,
    });
    expect(Object.isFrozen(LOD_HARD_LIMITS)).toBe(true);
  });
  it("LODError carries code, reason, path and detail", () => {
    const e = new api.LODError("INVALID_LOD", "SCHEMA", "$.x", "d");
    expect([e.code, e.reason, e.path, e.detail, e.name]).toEqual(["INVALID_LOD", "SCHEMA", "$.x", "d", "LODError"]);
    expect(e).toBeInstanceOf(Error);
  });
  it("D04 the package source imports no Core, no Ext and no renderer (a source-level check; Core is loaded transitively through scene-core and layout-core)", () => {
    for (const [f, text] of sources()) {
      const specs = [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
      for (const s of specs) {
        expect(s, `${f}: ${s}`).not.toMatch(/ison-graph-ts|ison-ts|renderer|ext/i);
        expect(s.startsWith(".") || s.startsWith("isongraph-visualize-scene-core") || s.startsWith("isongraph-visualize-layout-core") || s.startsWith("node:"), `${f}: ${s}`).toBe(true);
      }
    }
  });
  it("D03 domain-name lint: no downstream product or domain noun as a whole word in identifiers or string literals (Law 6)", () => {
    const DENY = [
      "patient", "customer", "invoice", "employee", "student", "hospital", "shipment", "salary", "diagnosis", "genome", "protein", "ledger", "passenger", "orderline",
      "isonantic", "isonql", "isongraphdb", "visualize", "vscode", "ticket", "supplier", "warehouse", "mortgage", "inventory",
    ];
    for (const [f, text] of sources()) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/(?:from|import)\s*\(?\s*["'][^"']+["']/g, "");
      for (const w of DENY) expect(new RegExp(`\\b${w}\\b`, "i").test(code), `${f}: ${w}`).toBe(false);
    }
  });
  it("the lint can fail: a planted domain noun is found by the same scanner", () => {
    const planted = 'const customer = "x";';
    const code = planted.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(/\bcustomer\b/i.test(code)).toBe(true);
  });
  it("no wall-clock or randomness dependence in the source (Law 2)", () => {
    for (const [f, text] of sources()) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
      expect(/Date\.now|new Date\(|performance\.now|Math\.random|process\.hrtime|setTimeout|setInterval/.test(code), f).toBe(false);
    }
  });
});
