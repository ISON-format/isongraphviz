// src/read.ts - parseDisplayList: the strict, linear, line-oriented reader of exactly the language of 4.1-4.2 (design 4.7).
// Two stages: the lexer (lines.ts, D1: the line-boundary bytes and the bounds) and the record rules D2-D12. It never needs a model; it re-serializes
// each parsed record and compares that canonical text with the line (D12).
import { DEFAULT_DL_READ_LIMITS, DL_COORD_MAX, DL_FORMAT, VIEWPORT_MAX_PX } from "./constants.js";
import { canonicalJson } from "./canon.js";
import { isWireEdge, isWireNode } from "./address.js";
import { arrowhead } from "./geometry.js";
import { readLines, resolveReadLimits, schemaError } from "./lines.js";
import type { DisplayList, DlRecord, WireEdge, WireNode } from "./types.js";

const HEX64 = /^[0-9a-f]{64}$/;
// a Map: a record kind such as "constructor" or "__proto__" must not be found on Object.prototype (audit I-1)
const RANK = new Map<string, number>([["H", 0], ["n", 1], ["e", 2], ["E", 3], ["A", 3], ["N", 4], ["T", 5]]);
const TEXT_MAX_UNITS = 24;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => isInt(v) && v >= lo && v <= hi;
const inBound = (v: unknown): v is number => isInt(v) && v >= -DL_COORD_MAX && v <= DL_COORD_MAX;

/** D9: the text of a T record has no TAB, LF, CR, no scalar replaced by xs and no lone surrogate. */
function textLegal(t: string): boolean {
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 0x9 || c === 0xa || c === 0xd) return false;
    if (c <= 0x8 || c === 0xb || c === 0xc || (c >= 0xe && c <= 0x1f) || c === 0xfffe || c === 0xffff) return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < t.length ? t.charCodeAt(i + 1) : 0;
      if (d < 0xdc00 || d > 0xdfff) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

/** parseDisplayList(bytes, limits?): strict. `INVALID_INPUT/SCHEMA` (the line number in the path), or `RESOURCE_LIMIT/BYTES_LIMIT` (path "dl.read"). */
export function parseDisplayList(bytes: Uint8Array, limits?: { maxBytes?: number; maxLineUnits?: number }): DisplayList {
  const lim = resolveReadLimits(limits, DEFAULT_DL_READ_LIMITS);
  const lines = readLines(bytes, lim, "dl.read");

  let header: { w: number; h: number; d: number; artifact: string; scene: string; layout: string; nd: number; ed: number } | undefined;
  const nodes: WireNode[] = [], edges: WireEdge[] = [];
  const nodeKeys = new Set<string>(), edgeKeys = new Set<string>();
  const records: DlRecord[] = [];
  const eRecords = new Map<number, number[]>(); // pid -> the numbers of its E record
  let lastRank = -1, eCount = 0, aCount = 0, nCount = 0;
  let prevKind = "", prevPid = -1;
  let lastTextRole = -1, lastTextPid = 0;
  const textPids = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, no = i + 1;
    let rec: unknown;
    try { rec = JSON.parse(line); } catch { throw schemaError(no, "a JSON syntax error"); }
    if (!Array.isArray(rec) || typeof rec[0] !== "string") throw schemaError(no, "a record is an array whose first member is its kind");
    const kind: string = rec[0];
    const rank = RANK.get(kind);
    if (rank === undefined) throw schemaError(no, "an unknown record kind");

    // D2: kinds and order: H once, first; then n*, e*, then E and A in any mix, then N*, then T*
    if (no === 1 ? kind !== "H" : kind === "H") throw schemaError(no, "the header is exactly the first record");
    if (rank < lastRank) throw schemaError(no, "the record kinds are out of order");
    lastRank = rank;

    let canonicalTable = false;
    switch (kind) {
      case "H": {
        // D3: format, W and H, D, the three hashes, ND and ED
        if (rec.length !== 10) throw schemaError(no, "the header has ten members");
        if (rec[1] !== DL_FORMAT) throw schemaError(no, "an unknown format");
        if (!inRange(rec[2], 1, VIEWPORT_MAX_PX) || !inRange(rec[3], 1, VIEWPORT_MAX_PX)) throw schemaError(no, "W and H are integers 1..16384");
        if (rec[4] !== 0 && rec[4] !== 1) throw schemaError(no, "D is 0 or 1");
        for (const h of [rec[5], rec[6], rec[7]]) if (typeof h !== "string" || !HEX64.test(h)) throw schemaError(no, "a hash is 64 lower-case hex digits");
        if (!inRange(rec[8], 0, Number.MAX_SAFE_INTEGER) || !inRange(rec[9], 0, Number.MAX_SAFE_INTEGER)) throw schemaError(no, "ND and ED are non-negative integers");
        header = { w: rec[2], h: rec[3], d: rec[4], artifact: rec[5] as string, scene: rec[6] as string, layout: rec[7] as string, nd: rec[8], ed: rec[9] };
        break;
      }
      case "n": {
        // D4: a well-formed node wire address, no repeat
        if (rec.length !== 2 || !isWireNode(rec[1])) throw schemaError(no, "an n record holds one well-formed node address");
        if (nodeKeys.has(line)) throw schemaError(no, "a repeated address");
        nodeKeys.add(line);
        nodes.push(rec[1]);
        canonicalTable = true;
        break;
      }
      case "e": {
        if (rec.length !== 2 || !isWireEdge(rec[1])) throw schemaError(no, "an e record holds one well-formed edge address");
        if (edgeKeys.has(line)) throw schemaError(no, "a repeated address");
        edgeKeys.add(line);
        edges.push(rec[1]);
        canonicalTable = true;
        break;
      }
      case "E": {
        // D5 (pids) and D6 (flags, form, count, bound)
        if (rec.length < 4 || !isInt(rec[1])) throw schemaError(no, "an E record is [E,pid,flags,form,numbers]");
        if (rec[1] !== nodes.length + 1 + eCount || eCount >= edges.length) throw schemaError(no, "the E pids are n_t+1 .. n_t+e_t ascending, each once");
        if (!inRange(rec[2], 0, 3)) throw schemaError(no, "flags are 0..3");
        if (!inRange(rec[3], 0, 2) || rec.length - 4 !== 4 + 2 * rec[3]) throw schemaError(no, "form is 0..2 with 4, 6 or 8 numbers");
        for (let k = 4; k < rec.length; k++) if (!inBound(rec[k])) throw schemaError(no, "a coordinate is an integer within 2^40");
        eRecords.set(rec[1], rec.slice(4) as number[]);
        eCount++;
        break;
      }
      case "A": {
        // D5 (presence, adjacency from the A side) and D7 (the triangle of 4.4(e) for the E of the same pid)
        if (rec.length !== 8 || !rec.slice(1).every(isInt)) throw schemaError(no, "an A record is seven integers");
        if (header!.d !== 1) throw schemaError(no, "an A exists iff D = 1");
        if (prevKind !== "E" || prevPid !== rec[1]) throw schemaError(no, "an A follows the E of the same pid");
        const e = eRecords.get(rec[1] as number);
        if (e === undefined) throw schemaError(no, "an A names an E");
        const n = e.length;
        const [px, py] = n === 4 ? [e[0]!, e[1]!] : [e[n - 4]!, e[n - 3]!];
        const tri = arrowhead(BigInt(e[n - 2]!), BigInt(e[n - 1]!), BigInt(px), BigInt(py));
        if (tri.some((v, k) => v !== BigInt(rec[2 + k] as number))) throw schemaError(no, "the triangle is not the one 4.4(e) gives");
        aCount++;
        break;
      }
      case "N": {
        // D5 (pids) and D8
        if (rec.length !== 6 || !rec.slice(1).every(isInt)) throw schemaError(no, "an N record is [N,pid,kcls,flags,x,y]");
        if (rec[1] !== nCount + 1 || nCount >= nodes.length) throw schemaError(no, "the N pids are 1 .. n_t ascending, each once");
        if (!inRange(rec[2], 0, 8)) throw schemaError(no, "kcls is 0..8");
        if (!inRange(rec[3], 0, 3)) throw schemaError(no, "flags are 0..3");
        if (!inBound(rec[4]) || !inBound(rec[5])) throw schemaError(no, "a coordinate is an integer within 2^40");
        nCount++;
        break;
      }
      case "T": {
        // D9
        if (rec.length !== 6 || !isInt(rec[1]) || !isInt(rec[2]) || !isInt(rec[3]) || !isInt(rec[4]) || typeof rec[5] !== "string") throw schemaError(no, "a T record is [T,pid,role,x,y,TEXT]");
        const pid = rec[1], role = rec[2];
        if (pid < 1 || pid > nodes.length + edges.length) throw schemaError(no, "the pid is in the table");
        if (role !== (pid <= nodes.length ? 0 : 1)) throw schemaError(no, "role is 0 iff the pid is a node");
        if (!inBound(rec[3]) || !inBound(rec[4])) throw schemaError(no, "a coordinate is an integer within 2^40");
        const text = rec[5];
        if (text.length === 0 || text.length > TEXT_MAX_UNITS || !textLegal(text)) throw schemaError(no, "TEXT is 1..24 units without TAB, LF, CR, an xs scalar or a lone surrogate");
        if (textPids.has(pid)) throw schemaError(no, "at most one T per pid");
        if (role < lastTextRole || (role === lastTextRole && pid < lastTextPid)) throw schemaError(no, "T records: role 0 by ascending pid, then role 1");
        textPids.add(pid);
        lastTextRole = role;
        lastTextPid = pid;
        break;
      }
    }

    // D12 (and D10: the spelling of a number is whatever D12 forces): the line equals the canonical text of its parsed record
    let canonical: string;
    try { canonical = canonicalJson(rec); } catch { throw schemaError(no, "the record has no canonical text"); }
    if (canonical !== line) throw schemaError(no, canonicalTable ? "the table line is not canonical" : "the line is not the canonical text of its record");

    prevKind = kind;
    prevPid = isInt(rec[1]) ? rec[1] : -1;
    if (kind === "E" || kind === "A" || kind === "N" || kind === "T") records.push(rec as unknown as DlRecord);
  }

  if (header === undefined) throw schemaError(0, "the header is missing");
  if (header.nd !== nodes.length || header.ed !== edges.length) throw schemaError(1, "ND and ED equal the numbers of n and e records");
  if (eCount !== edges.length || nCount !== nodes.length) throw schemaError(lines.length, "every pid has its E and its N");
  if (header.d === 1 && aCount !== eCount) throw schemaError(lines.length, "an A exists for every E iff D = 1");
  return {
    format: DL_FORMAT, width: header.w, height: header.h, directed: header.d === 1,
    artifactSha256: header.artifact, sceneSha256: header.scene, layoutSha256: header.layout, nodes, edges, records,
  };
}
