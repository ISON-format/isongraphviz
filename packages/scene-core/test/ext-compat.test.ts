// packages/scene-core/test/ext-compat.test.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "ison-ts";
import { describe, expect, it } from "vitest";
import { compileScene } from "../src/compile.js";
import { resolveInScene } from "../src/resolve.js";
import type { Scene, WireEdgeAddress, WireNodeRef } from "../src/types.js";

const vendor = fileURLToPath(new URL("./fixtures/ext/v0.4.1/", import.meta.url));
const base = join(vendor, "vectors");
type Row = Record<string, unknown>;
const doc = (path: string) => parse(readFileSync(path, "utf8"));
const rows = (d: ReturnType<typeof parse>, kind: string, name: string): Row[] => (d.blocks.find((b) => b.kind === kind && b.name === name)?.rows ?? []) as Row[];

const idOf = (v: unknown): string => (typeof v === "number" ? `i:${BigInt(v)}` : `s:${String(v)}`);
const node = (type: unknown, id: unknown): WireNodeRef => ({ id: idOf(id), type: String(type) });
const edge = (r: Row, st: string, si: string, tt: string, ti: string): WireEdgeAddress =>
  ({ ord: String(r["ordinal"]), rel: String(r["relation"]), src: node(r[st], r[si]), tgt: node(r[tt], r[ti]) });

type Family = "igpv1" | "igdm1";
interface Check { family: Family; graph: string; vector: string; hash: string; nodes: WireNodeRef[]; edges: WireEdgeAddress[] }

/** A vector is selected when the manifest expects verify_ok and names a target graph. */
function selected(family: Family): Row[] {
  return rows(doc(join(base, family, "manifest.ison")), "table", "vectors")
    .filter((v) => String(v["expect"]).startsWith("verify_ok") && v["target"] !== "none" && v["target"] !== null);
}

function igpvChecks(): Check[] {
  return selected("igpv1").map((v) => {
    const p = doc(join(base, "igpv1", "payloads", String(v["payload"])));
    const meta = rows(p, "meta", "igpv")[0] as Row;
    const objs = rows(p, "table", "objects").filter((o) => o["graph"] === null);
    return { family: "igpv1", graph: String(v["target"]), vector: `igpv1:${String(v["id"])}`, hash: String(meta["target_artifact_sha256"]),
      nodes: objs.filter((o) => o["kind"] === "node").map((o) => node(o["node_type"], o["node_id"])),
      edges: objs.filter((o) => o["kind"] === "edge").map((o) => edge(o, "source_type", "source_id", "target_type", "target_id")) };
  });
}

function igdmChecks(): Check[] {
  return selected("igdm1").map((v) => {
    const p = doc(join(base, "igdm1", "payloads", String(v["payload"])));
    const meta = rows(p, "meta", "igdm")[0] as Row;
    return { family: "igdm1", graph: String(v["target"]), vector: `igdm1:${String(v["id"])}`, hash: String(meta["target_artifact_sha256"]),
      nodes: [...rows(p, "table", "nodes").map((o) => node(o["node_type"], o["node_id"])), ...rows(p, "table", "members").map((o) => node(o["node_type"], o["node_id"]))],
      edges: rows(p, "table", "edges").map((o) => edge(o, "source_type", "source_id", "target_type", "target_id")) };
  });
}

const all = [...igpvChecks(), ...igdmChecks()];

/**
 * The coverage the pinned v0.4.1 manifests give: 35 selected vectors (21 IGPV, 14 IGDM) over seven target graphs.
 * It is stated explicitly, so a change to the vendored copy (or a selection bug) fails here instead of silently
 * shrinking the check. The numbers describe the pinned Ext revision, not a Visualize requirement.
 */
const PINNED_COVERAGE: Record<string, { vectors: number; nodeChecks: number; edgeChecks: number }> = {
  "igpv1:synthetic/directed.ison": { vectors: 18, nodeChecks: 14, edgeChecks: 2 },
  "igpv1:synthetic/multi.ison": { vectors: 1, nodeChecks: 0, edgeChecks: 3 },
  "igpv1:synthetic/string-one.ison": { vectors: 1, nodeChecks: 1, edgeChecks: 0 },
  "igpv1:synthetic/undirected.ison": { vectors: 1, nodeChecks: 0, edgeChecks: 1 },
  "igdm1:synthetic/directed.ison": { vectors: 12, nodeChecks: 45, edgeChecks: 10 },
  "igdm1:synthetic/multi.ison": { vectors: 1, nodeChecks: 0, edgeChecks: 2 },
  "igdm1:synthetic/undirected.ison": { vectors: 1, nodeChecks: 0, edgeChecks: 1 },
};

describe("the vendored copy is exactly the pinned Ext revision", () => {
  it("matches VENDOR.sha256 file by file and carries the licence and provenance", () => {
    const lines = readFileSync(join(vendor, "VENDOR.sha256"), "utf8").trim().split("\n");
    expect(lines.length).toBe(259); // 258 vector files + LICENSE
    for (const line of lines) {
      const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
      expect(m, line).not.toBeNull();
      const actual = createHash("sha256").update(readFileSync(join(vendor, m![2] as string))).digest("hex");
      expect(actual, m![2]).toBe(m![1]);
    }
    expect(readFileSync(join(vendor, "LICENSE"), "utf8")).toMatch(/^MIT License/);
    expect(readFileSync(join(vendor, "PROVENANCE.md"), "utf8")).toContain("97dd9dfb7042c0918bdf825e03e31f309444026e");
  });
});

describe("Ext IGPV/IGDM vectors (offline address-compatibility fixtures)", () => {
  it("covers exactly the vectors and checks the pinned manifests select", () => {
    const got: Record<string, { vectors: number; nodeChecks: number; edgeChecks: number }> = {};
    for (const c of all) {
      const k = `${c.family}:${c.graph}`;
      const g = (got[k] ??= { vectors: 0, nodeChecks: 0, edgeChecks: 0 });
      g.vectors += 1; g.nodeChecks += c.nodes.length; g.edgeChecks += c.edges.length;
    }
    expect(got).toEqual(PINNED_COVERAGE);
    expect(all.length).toBe(35);
  });

  const cache = new Map<string, Promise<{ ok: true; scene: Scene } | { ok: false; code: string; reason: string | undefined }>>();
  const compiled = (target: string) => {
    if (!cache.has(target)) {
      cache.set(target, compileScene(new Uint8Array(readFileSync(target)), "ison-v1").then(
        (r) => ({ ok: true as const, scene: r.scene }),
        (e: { code: string; reason?: string }) => ({ ok: false as const, code: e.code, reason: e.reason })));
    }
    return cache.get(target)!;
  };

  for (const check of all) {
    it(check.vector, async () => {
      const res = await compiled(join(base, check.family, "graphs", check.graph));
      if (check.graph.endsWith("multi.ison")) {
        expect(res.ok).toBe(false);
        if (!res.ok) { expect(res.code).toBe("UNSUPPORTED_GRAPH_PROFILE"); expect(res.reason).toBe("MULTIGRAPH"); }
        return;
      }
      if (!res.ok) throw new Error(`unexpected rejection of ${check.graph}: ${res.code}/${res.reason}`);
      expect(res.scene.source.artifact_sha256, "source identity").toBe(check.hash);
      for (const n of check.nodes) expect(() => resolveInScene(res.scene, n), JSON.stringify(n)).not.toThrow();
      for (const e of check.edges) expect(() => resolveInScene(res.scene, e), JSON.stringify(e)).not.toThrow();
    });
  }
});
