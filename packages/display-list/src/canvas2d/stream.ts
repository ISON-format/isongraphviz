// src/canvas2d/stream.ts - the strict reader of a recorded stream (design 6.6, 9.3): canonical lines, the names of 6.1, markers non-decreasing in
// layer and pids strictly ascending within a layer; the lines up to the next marker are that marker's section.
import { DEFAULT_CV_READ_LIMITS } from "../constants.js";
import { canonicalJson } from "../canon.js";
import { readLines, resolveReadLimits, schemaError } from "../lines.js";
import type { DisplayList } from "../types.js";
import { CV_METHODS, CV_PROPERTIES } from "./record.js";

export interface StreamCall { method: string; args: unknown[] }
export interface StreamSection { pid: number; layer: number; calls: StreamCall[]; line: number }

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const PAINT: Record<number, readonly string[]> = { 1: ["stroke"], 2: ["stroke"], 3: ["stroke"], 4: ["fill"], 5: ["stroke"], 6: ["stroke"], 7: ["fill", "stroke"], 8: ["fillText"] };

/** Reads the stream strictly; `list` supplies the table (the pids that exist and which of them are nodes). */
export function readStream(stream: Uint8Array, list: DisplayList, limits?: { maxBytes?: number; maxLineUnits?: number }): StreamSection[] {
  const lines = readLines(stream, resolveReadLimits(limits, DEFAULT_CV_READ_LIMITS), "cv.read");
  const nd = list.nodes.length, total = nd + list.edges.length;
  const sections: StreamSection[] = [];
  let lastLayer = 0, lastPid = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, no = i + 1;
    let rec: unknown;
    try { rec = JSON.parse(line); } catch { throw schemaError(no, "a JSON syntax error"); }
    if (!Array.isArray(rec) || typeof rec[0] !== "string") throw schemaError(no, "a record is an array whose first member is its kind");
    let canonical: string;
    try { canonical = canonicalJson(rec); } catch { throw schemaError(no, "the record has no canonical text"); }
    if (canonical !== line) throw schemaError(no, "the line is not canonical");
    if (rec[0] === "#") {
      if (rec.length !== 3 || !isInt(rec[1]) || !isInt(rec[2])) throw schemaError(no, 'a marker is ["#",pid,layer]');
      const pid = rec[1], layer = rec[2];
      if (pid < 1 || pid > total) throw schemaError(no, "the marker pid is in the table");
      if (layer < 1 || layer > 8) throw schemaError(no, "the marker layer is 1..8");
      if ((layer <= 4 && pid <= nd) || (layer >= 5 && layer <= 7 && pid > nd)) throw schemaError(no, "the marker pid is of the wrong kind for its layer");
      if (layer < lastLayer) throw schemaError(no, "marker layers are non-decreasing");
      if (layer === lastLayer && pid <= lastPid) throw schemaError(no, "marker pids ascend strictly within a layer");
      lastLayer = layer; lastPid = pid;
      sections.push({ pid, layer, calls: [], line: no });
    } else if (rec[0] === "m") {
      if (typeof rec[1] !== "string" || !(CV_METHODS as readonly string[]).includes(rec[1])) throw schemaError(no, "an unknown method");
      sections[sections.length - 1]?.calls.push({ method: rec[1], args: rec.slice(2) });
    } else if (rec[0] === "s") {
      if (rec.length !== 3 || typeof rec[1] !== "string" || !(CV_PROPERTIES as readonly string[]).includes(rec[1])) throw schemaError(no, "an unknown property");
    } else throw schemaError(no, "an unknown record kind");
  }
  return sections;
}

/** Was the element painted in this section's layer (6.6)? Layers 1, 2, 3, 5, 6 need a stroke, 4 a fill, 7 a fill and a stroke, 8 a fillText. */
export function painted(s: StreamSection): boolean {
  return PAINT[s.layer]!.every((m) => s.calls.some((c) => c.method === m));
}
