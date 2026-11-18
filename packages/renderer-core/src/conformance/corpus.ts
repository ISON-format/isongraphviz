// src/conformance/corpus.ts - the in-memory corpus, the EXPECT.tsv reader and corpus verification (design 13.3a and 13.4). Pure: no node:* import.
import { sha256Hex } from "isongraph-visualize-scene-core/primitives";
import { IgrError } from "../errors.js";

export interface ExpectRow { id: string; group: string; tier: string; scene: string; layout: string; input: string; expected: string; error: string }
/** Files are keyed by their path relative to the corpus directory, normalized (`..` segments allowed for the frozen IGS/IGL fixtures). */
export interface Corpus { files: ReadonlyMap<string, Uint8Array>; expect: readonly ExpectRow[]; sums: Uint8Array }

/**
 * The anchor outside the corpus (design 13.4): SHA-256 of SHA256SUMS of fixtures/oracles-igr/, recorded at freeze in the kit source and in
 * docs/conformance/README.md. `undefined` until the corpus is frozen (owner decision 1): the kit then reports `corpus_digest_pinned: false`.
 */
export const PINNED_CORPUS_DIGEST: string | undefined = undefined;
/** Identifies the released kit build. Conformance claims must cite a RELEASED kit (the pinned digest protects the corpus, not the kit). */
export const KIT_DIGEST = "UNRELEASED";

const COLUMNS = ["id", "group", "tier", "scene", "layout", "input", "expected", "error"] as const;
const dec = (b: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(b);

/** Resolves `.` and `..` of a corpus-relative path; a leading `..` is kept (frozen fixtures live beside the corpus). */
export function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop(); else out.push(seg);
  }
  return out.join("/");
}

/** Reads EXPECT.tsv: UTF-8, tab separated, one header row, an empty cell is the empty string. */
export function parseExpect(text: string): ExpectRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const header = (lines[0] ?? "").split("\t");
  if (COLUMNS.some((c, i) => header[i] !== c)) throw new IgrError("INVALID_CORPUS", "SCHEMA", "EXPECT.tsv", `header must be ${COLUMNS.join("\\t")}`);
  return lines.slice(1).filter((l) => l !== "").map((line, n) => {
    const cells = line.split("\t");
    if (cells.length > COLUMNS.length) throw new IgrError("INVALID_CORPUS", "SCHEMA", `EXPECT.tsv:${n + 2}`, "too many columns");
    while (cells.length < COLUMNS.length) cells.push("");
    const [id, group, tier, scene, layout, input, expected, error] = cells as [string, string, string, string, string, string, string, string];
    return { id, group, tier, scene, layout, input, expected, error };
  });
}

/** SHA256SUMS lines: `<64 hex> <space or *><path>`. */
export function parseSums(sums: Uint8Array): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of dec(sums).split("\n")) {
    if (line.trim() === "") continue;
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.replace(/\r$/, ""));
    if (!m) throw new IgrError("INVALID_CORPUS", "SCHEMA", "SHA256SUMS", line);
    out.set(normalizePath(m[2]!), m[1]!);
  }
  return out;
}

/** The kit refuses a corpus before running: every listed file present and matching, and the digest of SHA256SUMS equal to the pinned one. */
export async function verifyCorpus(corpus: Corpus, pinned: string | undefined = PINNED_CORPUS_DIGEST): Promise<{ corpus_sha256: string; pinned: boolean }> {
  const listed = parseSums(corpus.sums);
  for (const [path, want] of listed) {
    const bytes = corpus.files.get(path);
    if (!bytes) throw new IgrError("INVALID_CORPUS", "MISSING_FILE", path);
    if ((await sha256Hex(bytes)) !== want) throw new IgrError("INVALID_CORPUS", "CHECKSUM_MISMATCH", path);
  }
  const digest = await sha256Hex(corpus.sums);
  if (pinned !== undefined && digest !== pinned) throw new IgrError("INVALID_CORPUS", "DIGEST_MISMATCH", "SHA256SUMS");
  return { corpus_sha256: digest, pinned: pinned !== undefined };
}
