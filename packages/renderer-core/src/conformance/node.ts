// src/conformance/node.ts - loadCorpus(dir): the ONLY file of the package that may import node:*.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { IgrError } from "../errors.js";
import { PINNED_CORPUS_DIGEST, normalizePath, parseExpect, parseSums, verifyCorpus, type Corpus } from "./corpus.js";

const readOrMissing = async (path: string, rel: string): Promise<Uint8Array> => {
  try { return new Uint8Array(await readFile(path)); } catch { throw new IgrError("INVALID_CORPUS", "MISSING_FILE", rel); }
};

/**
 * Reads EXPECT.tsv, SHA256SUMS, every listed file, and every frozen scene, layout and state file that rows or scripts point at (they may live in
 * ../oracles or ../oracles-igl). The corpus is verified (sums, and the pinned digest when one is set) before it is returned.
 */
export async function loadCorpus(dir: string): Promise<Corpus> {
  const root = resolve(dir);
  const sums = await readOrMissing(join(root, "SHA256SUMS"), "SHA256SUMS");
  const expect = parseExpect(new TextDecoder().decode(await readOrMissing(join(root, "EXPECT.tsv"), "EXPECT.tsv")));
  const files = new Map<string, Uint8Array>();
  const load = async (rel: string, required: boolean): Promise<void> => {
    const key = normalizePath(rel);
    if (key === "" || files.has(key)) return;
    try { files.set(key, new Uint8Array(await readFile(join(root, key)))); } catch { if (required) throw new IgrError("INVALID_CORPUS", "MISSING_FILE", key); }
  };
  for (const path of parseSums(sums).keys()) await load(path, true);
  for (const row of expect) for (const cell of [row.scene, row.layout, row.expected, /^[{[]/.test(row.input) ? "" : row.input]) if (cell) await load(cell, false);
  // paths named inside JSON files (scene, layout, state, expected files) that are not yet loaded
  const pathLike = /\.(json|ison)$/;
  const scan = async (value: unknown): Promise<void> => {
    if (typeof value === "string") { if (pathLike.test(value) && !/\s/.test(value)) await load(value, false); }
    else if (Array.isArray(value)) for (const v of value) await scan(v);
    else if (typeof value === "object" && value !== null) for (const v of Object.values(value)) await scan(v);
  };
  for (const [path, bytes] of [...files]) {
    if (!path.endsWith(".json") || path.startsWith("..")) continue;
    try { await scan(JSON.parse(new TextDecoder().decode(bytes))); } catch { /* byte-level vectors are not JSON */ }
  }
  // frozen files of the sibling corpora (../oracles, ../oracles-igl): hashed against THEIR SHA256SUMS when it lists them
  const foreignSums = new Map<string, Map<string, string> | undefined>();
  for (const [key, bytes] of files) {
    const parts = key.split("/");
    if (parts[0] !== ".." || parts.length < 3) continue;
    const dirName = parts[1]!;
    if (!foreignSums.has(dirName)) {
      try { foreignSums.set(dirName, parseSums(new Uint8Array(await readFile(join(root, "..", dirName, "SHA256SUMS"))))); } catch { foreignSums.set(dirName, undefined); }
    }
    const want = foreignSums.get(dirName)?.get(parts.slice(2).join("/"));
    if (want !== undefined && createHash("sha256").update(bytes).digest("hex") !== want) throw new IgrError("INVALID_CORPUS", "CHECKSUM_MISMATCH", key);
  }
  const corpus: Corpus = { files, expect, sums };
  await verifyCorpus(corpus, PINNED_CORPUS_DIGEST);
  return corpus;
}
