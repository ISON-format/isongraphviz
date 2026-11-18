// src/lines.ts - the lexer shared by every reader of a byte form (design 4.6, 4.7 D1): LF-only line splitting, the line-boundary bytes and the bounds.
import { IgrError } from "isongraph-visualize-renderer-core";
import { utf8Decode } from "./utf8.js";

export interface ReadLimits { maxBytes: number; maxLineUnits: number }

export const schemaError = (line: number, detail: string): IgrError => new IgrError("INVALID_INPUT", "SCHEMA", `line ${line}`, detail);
export const limitError = (path: string, detail: string): IgrError => new IgrError("RESOURCE_LIMIT", "BYTES_LIMIT", path, detail);

/** Defaults overlaid with the caller's (partial) limits; a limit must be a non-negative safe integer. */
export function resolveReadLimits(limits: unknown, defaults: Readonly<ReadLimits>): ReadLimits {
  const out: ReadLimits = { maxBytes: defaults.maxBytes, maxLineUnits: defaults.maxLineUnits };
  if (limits === undefined) return out;
  if (typeof limits !== "object" || limits === null || Array.isArray(limits)) throw new IgrError("INVALID_INPUT", "SCHEMA", "limits", "object expected");
  const raw = limits as Record<string, unknown>;
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (v === undefined) continue;
    if (k !== "maxBytes" && k !== "maxLineUnits") throw new IgrError("INVALID_INPUT", "SCHEMA", `limits.${k}`, "unknown limit");
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new IgrError("INVALID_INPUT", "INVALID_VALUE", `limits.${k}`);
    out[k] = v;
  }
  return out;
}

/** The nesting depth of a line is at most 3, measured by a scan that skips string content (a quote opens a string, a backslash escapes the next character). */
export function nestingOk(line: string, max = 3): boolean {
  let depth = 0, inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++;
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) inString = true;
    else if (c === 0x5b || c === 0x7b) { if (++depth > max) return false; }
    else if (c === 0x5d || c === 0x7d) depth--;
  }
  return true;
}

/**
 * D1, the lexer. Valid UTF-8 without a BOM; every line ends with LF including the last; no CR before the LF, no blank line, no indentation;
 * `maxBytes` (the whole input) and `maxLineUnits` (the raw line) are bounds; the nesting depth of a line is at most 3. Split on LF only: U+2028,
 * U+2029 and U+0085 may occur literally inside strings. Returns the lines without their LF.
 */
export function readLines(bytes: Uint8Array, limits: ReadLimits, path: string): string[] {
  if (!(bytes instanceof Uint8Array)) throw new IgrError("INVALID_INPUT", "SCHEMA", path, "bytes expected");
  if (bytes.length > limits.maxBytes) throw limitError(path, "the input exceeds maxBytes");
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw schemaError(1, "a byte order mark");
  const text = utf8Decode(bytes);
  if (text === undefined) throw schemaError(1, "not valid UTF-8");
  if (text.length > 0 && !text.endsWith("\n")) throw schemaError(text.split("\n").length, "the final LF is missing");
  const parts = text.split("\n");
  parts.pop(); // the piece after the final LF
  // maxLineUnits, on the raw line, is checked first and for every line, before any other D1 rule (4.7; audit M-1)
  for (let i = 0; i < parts.length; i++) if (parts[i]!.length > limits.maxLineUnits) throw limitError(path, `line ${i + 1} exceeds maxLineUnits`);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]!;
    const no = i + 1;
    if (raw.endsWith("\r")) throw schemaError(no, "a CR before the LF");
    if (raw.length === 0) throw schemaError(no, "a blank line");
    if (raw.charAt(0) === " " || raw.charAt(0) === "\t") throw schemaError(no, "an indented line");
    if (!nestingOk(raw)) throw schemaError(no, "nesting deeper than 3");
    out.push(raw);
  }
  return out;
}
