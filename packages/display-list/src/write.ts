// src/write.ts - serializeDisplayList (design 4.2): the canonical bytes of a list, a line per record, bounded by maxBytes.
import { IgrError } from "isongraph-visualize-renderer-core";
import { DEFAULT_DL_LIMITS, DL_FORMAT } from "./constants.js";
import { canonicalJson, utf8Length } from "./canon.js";
import { utf8Encode } from "./utf8.js";
import type { DisplayList } from "./types.js";

/** The write limit is validated like the read limits (a non-negative safe integer); a value that is not a number must never turn the limit off (audit M-2). */
function resolveWriteLimit(limits: unknown): number {
  if (limits === undefined) return DEFAULT_DL_LIMITS.maxDlBytes;
  if (typeof limits !== "object" || limits === null || Array.isArray(limits)) throw new IgrError("INVALID_INPUT", "SCHEMA", "limits", "object expected");
  const v: unknown = (limits as Record<string, unknown>)["maxBytes"];
  if (v === undefined) return DEFAULT_DL_LIMITS.maxDlBytes;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new IgrError("INVALID_INPUT", "INVALID_VALUE", "limits.maxBytes");
  return v;
}

/** The lines of a list, each without its LF: the header, the element table, then the records in file order (4.1). */
export function* listLines(list: DisplayList): Generator<string> {
  yield canonicalJson(["H", DL_FORMAT, list.width, list.height, list.directed ? 1 : 0, list.artifactSha256, list.sceneSha256, list.layoutSha256, list.nodes.length, list.edges.length]);
  for (const n of list.nodes) yield canonicalJson(["n", n]);
  for (const e of list.edges) yield canonicalJson(["e", e]);
  for (const r of list.records) yield canonicalJson(r);
}

/**
 * The UTF-8 bytes of a list: the canonical text of each record followed by one LF. `RESOURCE_LIMIT/BYTES_LIMIT` (path "dl") at the first line
 * whose exact length would make the running total exceed `maxBytes` (inclusive: a document of exactly maxBytes is accepted); nothing of a
 * refused document is returned.
 */
export function serializeDisplayList(list: DisplayList, limits?: { maxBytes?: number }): Uint8Array {
  const max = resolveWriteLimit(limits);
  const lines: string[] = [];
  let total = 0;
  for (const line of listLines(list)) {
    total += utf8Length(line) + 1;
    if (total > max) throw new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", "dl", "the document would exceed maxBytes");
    lines.push(line);
  }
  return utf8Encode(lines.join("\n") + "\n");
}
