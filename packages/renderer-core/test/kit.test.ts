// The conformance kit on the self-generated mini corpus: K01 (the reference passes), tamper tests K37/K38, report fields, levels, honesty (rev 4, 13.2).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runConformance, checksFor, REQUIRED_IDS, type ConformanceSubject } from "../src/conformance/run.js";
import { KIT_DIGEST, normalizePath, parseExpect, parseSums, verifyCorpus, type Corpus } from "../src/conformance/corpus.js";
import { errOfAsync, enc } from "./helpers.js";
import { miniCorpus, referenceSubject } from "./kitHelpers.js";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const SEEDS = [11, 2026, 77777];

describe("rev 4 attribution is exactly the lists of 13.1", () => {
  it("each vector counts for the checks that list it, and for no other", () => {
    expect(checksFor("R04")).toEqual(["CHK-STATE", "CHK-ID", "CHK-SEL"]); // not CHK-INTENT (K60 is named CHK-SEL)
    expect(checksFor("R49")).toEqual(["CHK-STATE", "CHK-ID", "CHK-FOCUS", "CHK-INTENT"].filter((c) => c !== "CHK-INTENT"));
    expect(checksFor("R42").sort()).toEqual(["CHK-ID", "CHK-INTENT", "CHK-STATE"]);
    expect(checksFor("R51")).toContain("CHK-SEL");
    for (const id of ["R39", "R51", "R52"]) expect(checksFor(id), id).toContain("CHK-INTENT"); // rev 5: K76 is caught through R51
    expect(checksFor("S47").sort()).toEqual(["CHK-STATE", "CHK-VIEW"]);
    // rev 5: every S row of tier both counts under CHK-STATE, rejected rows included; the byte-level rows and S50 (core) count for nothing at the subject tier
    for (const id of ["S01", "S11", "S17", "S22", "S32", "S33", "S51", "S52", "S53", "S54", "S55", "S49"]) expect(checksFor(id), id).toContain("CHK-STATE");
    for (const id of ["S12", "S13", "S14", "S28", "S37", "S38", "S41", "S50"]) expect(checksFor(id), id).toEqual([]);
    expect(checksFor("H13").sort()).toEqual(["CHK-HIT", "CHK-VIS"]);
    expect(checksFor("H27")).toEqual(["CHK-HIT"]);
    expect(checksFor("A16").sort()).toEqual(["CHK-CAP", "CHK-LABEL"]);
    expect(checksFor("A20")).toEqual(["CHK-LABEL"]);
    expect(checksFor("L01").sort()).toEqual(["CHK-CAP", "CHK-LIFE"]);
    expect(checksFor("L12").sort()).toEqual(["CHK-DELTA", "CHK-LIFE"]);
    expect(checksFor("L25")).toEqual(["CHK-LIFE"]);
    expect(checksFor("C03")).toEqual([]); // core only
    expect(checksFor("D03")).toEqual(["CHK-DIFF"]);
  });
  it("the required list has the 354 ids of 13.3 (rev 5)", () => {
    expect(REQUIRED_IDS).toHaveLength(354);
    expect(new Set(REQUIRED_IDS).size).toBe(354);
    for (const id of ["M30", "S51", "S55", "A21", "P27", "L27", "K79", "K82"]) expect(REQUIRED_IDS, id).toContain(id);
    expect(REQUIRED_IDS).toContain("M23b"); expect(REQUIRED_IDS).toContain("R31b"); expect(REQUIRED_IDS).toContain("L24d"); expect(REQUIRED_IDS).toContain("K78"); expect(REQUIRED_IDS).toContain("C21");
  });
});


describe("corpus verification (K37, K38) and parsing", () => {
  it("K38 a corpus file edited: CHECKSUM_MISMATCH", async () => {
    const c = await miniCorpus();
    const files = new Map(c.files);
    files.set([...files.keys()].find((k) => k.startsWith("scripts/"))!, enc("{}"));
    expect(await errOfAsync(() => runConformance(referenceSubject(), { ...c, files }, { seeds: SEEDS }))).toBe("INVALID_CORPUS/CHECKSUM_MISMATCH");
  });
  it("K37 a file AND SHA256SUMS edited together: only the pinned digest catches it (DIGEST_MISMATCH)", async () => {
    const c = await miniCorpus();
    const key = [...c.files.keys()].find((k) => k.startsWith("scripts/"))!;
    const files = new Map(c.files);
    const edited = enc("{}");
    files.set(key, edited);
    const sums = enc(new TextDecoder().decode(c.sums).split("\n").map((l) => (l.endsWith("  " + key) ? `${sha(edited)}  ${key}` : l)).join("\n"));
    const tampered = { ...c, files, sums };
    await expect(verifyCorpus(tampered)).resolves.toMatchObject({ pinned: false });
    expect(await errOfAsync(() => verifyCorpus(tampered, sha(c.sums)))).toBe("INVALID_CORPUS/DIGEST_MISMATCH");
    await expect(verifyCorpus(c, sha(c.sums))).resolves.toMatchObject({ pinned: true, corpus_sha256: sha(c.sums) });
  });
  it("MISSING_FILE: a listed file absent from the corpus", async () => {
    const c = await miniCorpus();
    const files = new Map(c.files);
    files.delete([...files.keys()].find((k) => k.startsWith("states/"))!);
    expect(await errOfAsync(() => verifyCorpus({ ...c, files }))).toBe("INVALID_CORPUS/MISSING_FILE");
  });
  it("parseExpect reads the eight columns, keeps empty cells and rejects a bad header", () => {
    const rows = parseExpect("id\tgroup\ttier\tscene\tlayout\tinput\texpected\terror\nM01\tM\tcore\ta.json\tb.json\t\tm.json\t\nD01\tD\tsubject\t\t\t\t\t\n");
    expect(rows).toEqual([{ id: "M01", group: "M", tier: "core", scene: "a.json", layout: "b.json", input: "", expected: "m.json", error: "" }, { id: "D01", group: "D", tier: "subject", scene: "", layout: "", input: "", expected: "", error: "" }]);
    expect(parseExpect("id\tgroup\ttier\tscene\tlayout\tinput\texpected\terror\nK01\tK\t\t\t\t\t\t").length).toBe(1);
    expect(() => parseExpect("a\tb\n")).toThrow();
  });
  it("normalizePath keeps a leading .. and collapses the rest; parseSums reads sha256sum lines", () => {
    expect(normalizePath("../oracles/./o1.scene.json")).toBe("../oracles/o1.scene.json");
    expect(normalizePath("a/b/../c.json")).toBe("a/c.json");
    const h = "a".repeat(64);
    expect([...parseSums(enc(`${h}  x/y.json\n${h} *z.json\n`))]).toEqual([["x/y.json", h], ["z.json", h]]);
    expect(() => parseSums(enc("garbage\n"))).toThrow();
  });
});

describe("N-1: the required id list and the pinned digest come only from compiled-in constants", () => {
  it("smuggled requiredIds / pinnedDigest options change nothing: a corpus without the 341 ids is INVALID_CORPUS/SCHEMA", async () => {
    const c = await miniCorpus();
    const smuggled = { requiredIds: c.expect.map((r) => r.id), pinnedDigest: sha(c.sums), seeds: SEEDS } as never;
    expect(await errOfAsync(() => runConformance(referenceSubject(), c, smuggled))).toBe("INVALID_CORPUS/SCHEMA");
  });
  it("a self-made two-row corpus cannot be run, with or without its own digest", async () => {
    const full = await miniCorpus();
    const keep = full.expect.filter((r) => r.id === "M01" || r.id === "P01");
    const files = new Map([...full.files].filter(([p]) => keep.some((r) => [r.scene, r.layout, r.input, r.expected].includes(p))));
    const thin = { files, expect: keep, sums: enc([...files].map(([p, b]) => sha(b) + "  " + p).join(String.fromCharCode(10)) + String.fromCharCode(10)) };
    expect(await errOfAsync(() => runConformance(referenceSubject(), thin, { seeds: SEEDS }))).toBe("INVALID_CORPUS/SCHEMA");
    expect(await errOfAsync(() => runConformance(referenceSubject(), thin, { seeds: SEEDS, requiredIds: ["M01", "P01"], pinnedDigest: sha(thin.sums) } as never))).toBe("INVALID_CORPUS/SCHEMA");
  });
  it("loadCorpus has no pinnedDigest option either (an unknown option is ignored; only the constant pins)", async () => {
    const { loadCorpus } = await import("../src/conformance/node.js");
    expect(loadCorpus.length).toBeLessThanOrEqual(1);
  });
});
