// The conformance kit on the self-generated mini corpus: K01 (the reference passes), tamper tests K37/K38, report fields, levels, honesty (rev 4, 13.2).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runConformance, checksFor, REQUIRED_IDS, type ConformanceSubject } from "../../src/conformance/run.js";
import { KIT_DIGEST, normalizePath, parseExpect, parseSums, verifyCorpus, type Corpus } from "../../src/conformance/corpus.js";
import { errOfAsync, enc } from "../helpers.js";
import { kit, miniCorpus, referenceSubject } from "../kitHelpers.js";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const SEEDS = [11]; // one seed: each conformance pass runs the differential tier on two models per seed

describe("K01 the reference renderer passes every applicable vector", () => {
  it("no failure; a self-made corpus is partial, level 0, unpinned, not claimable; honest report fields", async () => {
    const corpus = await miniCorpus();
    const rep = await kit(referenceSubject(), corpus, { seeds: SEEDS });
    const failures = rep.results.filter((r) => r.verdict === "fail");
    expect(failures, JSON.stringify(failures.slice(0, 5))).toEqual([]);
    // an INTERNAL run against the corpus's own id list is always partial (N-1): the fixed 341 ids did not all run
    expect(rep.partial).toBe(true);
    expect(rep.verdict).toBe("incomplete");
    expect(rep.level).toBe(0);
    expect(rep.rows_required).toBe(354);
    expect(rep.rows_run).toBeLessThan(354);
    expect(rep.claimable).toBe(false); // the digest is not pinned and the kit is UNRELEASED
    expect(rep.igr).toBe("IGR/1");
    expect(rep.seeds).toEqual(SEEDS);
    expect(rep.seeds_supplied).toBe(true);
    expect(rep.kit_digest).toBe(KIT_DIGEST);
    expect(rep.corpus_digest_pinned).toBe(false);
    expect(rep.claimable).toBe(false);
    expect(rep.corpus_sha256).toBe(sha(corpus.sums));
    expect(rep.subject).toEqual({ name: "isongraph-reference-headless", version: "0.0.0" });
    for (const u of ["host", "indicators.non-color", "direction-cue drawn", "labels drawn", "gesture-to-intent mapping", "backend drawing"]) expect(rep.unchecked).toContain(u);
    expect(rep.unchecked.some((u) => /^optional capability declarations/.test(u))).toBe(true);
    expect(rep.unchecked.some((u) => /^special-casing of the public corpus scenes/.test(u))).toBe(true);
    for (const c of ["CHK-CORE", "CHK-ID", "CHK-STATE", "CHK-SEL", "CHK-FOCUS", "CHK-LABEL", "CHK-VIS", "CHK-VIEW", "CHK-HIT", "CHK-INTENT", "CHK-CAP", "CHK-LIFE", "CHK-DELTA", "CHK-DIFF", "CHK-KIT"]) expect(rep.checked, c).toContain(c);
    expect(rep.checked).not.toContain("CHK-W");
  });
  it("without caller seeds the kit generates fresh ones and says so", async () => {
    const rep = await kit(referenceSubject(), await miniCorpus(), { only: ["D01"] });
    expect(rep.seeds_supplied).toBe(false);
    expect(rep.seeds).toHaveLength(3);
  });
  it("L14 is not-applicable when the subject supports every export format", async () => {
    const full = referenceSubject();
    const caps = { ...full.manifest.capabilities, "export.svg": { status: "supported" as const }, "export.png": { status: "supported" as const } };
    const rep = await kit({ ...full, manifest: { ...full.manifest, capabilities: caps } }, await miniCorpus(), { only: ["L14"], seeds: SEEDS });
    expect(rep.results.find((r) => r.id === "L14")!.verdict).toBe("not-applicable");
  });
  it("level 2 needs a passing witness; a lying witness is a CHK-W fail", async () => {
    const good: ConformanceSubject = { ...referenceSubject(), witness: async (r) => ({ backend: "none", elements: r.probe().drawn, texts: r.probe().accessible.items.map((i) => ({ address: i.address, text: i.name })) }) };
    const rep = await kit(good, await miniCorpus(), { seeds: SEEDS });
    expect(rep.results.find((r) => r.check === "CHK-W")!.verdict).toBe("pass"); // the witness runs; level 2 itself needs a complete run (never true for a self-made corpus)
    expect(rep.level).toBe(0);
    expect(rep.checked).toContain("CHK-W");
    const lying: ConformanceSubject = { ...referenceSubject(), witness: async () => ({ backend: "none", elements: { nodes: [], edges: [] }, texts: [] }) };
    const bad = await kit(lying, await miniCorpus(), { seeds: SEEDS });
    expect(bad.verdict).toBe("fail");
    expect(bad.results.find((r) => r.check === "CHK-W")!.verdict).toBe("fail");
  });
});

describe("rev 4 C-2: a report never claims more than the run covered", () => {
  it("a partial run (only) is level 0, verdict incomplete, claimable false, 'partial run' first in unchecked", async () => {
    const corpus = await miniCorpus();
    for (const only of [[], ["P01"], ["M01", "S01", "R01"]]) {
      const rep = await kit(referenceSubject(), corpus, { only, seeds: SEEDS });
      expect(rep.level, JSON.stringify(only)).toBe(0);
      expect(rep.partial).toBe(true);
      expect(rep.verdict).toBe("incomplete");
      expect(rep.claimable).toBe(false);
      expect(rep.rows_required).toBe(354);
      expect(rep.rows_run).toBeLessThan(rep.rows_required);
      expect(rep.unchecked[0]).toMatch(/^partial run/);
    }
    expect((await kit(referenceSubject(), corpus, { only: ["P01"], seeds: SEEDS })).rows_run).toBe(1);
    const failing = await kit(referenceSubject(), corpus, { only: ["P01"], seeds: SEEDS });
    expect(failing.verdict).not.toBe("pass");
  });
  it("a partial run with a failure is fail, not incomplete", async () => {
    const s = referenceSubject();
    const lying: ConformanceSubject = { ...s, create: async (env) => { const r = await s.create(env); return { ...r, dispatch: () => [] } as typeof r; } };
    const rep = await kit(lying, await miniCorpus(), { only: ["R01"], seeds: SEEDS });
    expect(rep.partial).toBe(true);
    expect(rep.verdict).toBe("fail");
  });
  it("a partial report lists every check that did not run (N-5)", async () => {
    const rep = await kit(referenceSubject(), await miniCorpus(), { only: ["P01"], seeds: SEEDS });
    expect(rep.unchecked[0]).toMatch(/^partial run/);
    for (const c of ["CHK-LIFE", "CHK-HIT", "CHK-DIFF", "CHK-STATE"]) expect(rep.unchecked, c).toContain(c);
    expect(rep.unchecked).not.toContain("CHK-CORE"); // P01 ran at the core tier
  });
});

describe("rev 4 I-5: CHK-CAP is the manifest identity and the fidelity of every probe, recorded against L01", () => {
  it("a renderer whose own manifest differs from the subject's fails CHK-CAP at L01 (in any run that includes L01)", async () => {
    const s = referenceSubject();
    const liar: ConformanceSubject = { manifest: s.manifest, create: async (env) => { const r = await s.create(env); return { ...r, manifest: { ...r.manifest, igr: "IGR/9" } as never } as typeof r; } };
    const rep = await kit(liar, await miniCorpus(), { seeds: SEEDS });
    const l01 = rep.results.filter((r) => r.id === "L01");
    expect(l01.find((r) => r.check === "CHK-CAP")!.verdict).toBe("fail");
    expect(l01.find((r) => r.check === "CHK-LIFE")!.verdict).toBe("pass"); // the lifecycle itself is fine
  });
  it("a report whose fidelity contradicts the manifest fails CHK-CAP, not the vector it was observed in", async () => {
    const s = referenceSubject();
    const elider: ConformanceSubject = { manifest: s.manifest, create: async (env) => { const r = await s.create(env); return { ...r, probe: () => { const p = r.probe(); p.fidelity.labels = "elided"; return p; } } as typeof r; } };
    const rep = await kit(elider, await miniCorpus(), { seeds: SEEDS });
    expect(rep.results.find((r) => r.id === "L01" && r.check === "CHK-CAP")!.verdict).toBe("fail");
    expect(rep.results.filter((r) => r.id === "R01").every((r) => r.verdict === "pass")).toBe(true);
  });
  it("an invalid subject manifest fails CHK-CAP", async () => {
    const s = referenceSubject();
    const m = JSON.parse(JSON.stringify(s.manifest)) as typeof s.manifest;
    (m.capabilities as Record<string, unknown>)["scene.apply-delta"] = { status: "supported" };
    const rep = await kit({ ...s, manifest: m }, await miniCorpus(), { seeds: SEEDS });
    expect(rep.results.find((r) => r.id === "L01" && r.check === "CHK-CAP")!.verdict).toBe("fail");
  });
});

