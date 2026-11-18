// src/png.ts - the PNG container and the binding chunk (design 11.5): ONE `tEXt` chunk right after IHDR carrying the three hashes of an export. A strict
// container reader (signature, chunk framing that exactly fills the bytes, IHDR first with length 13, IEND last, size bounds) and a CRC-32 writer. The
// binding is advisory: a reader trusts it only after recomputing the three hashes (11.4). No pixel is read, no decoder exists (design 19).
import { IaError } from "isongraph-visualize-interaction-core";
import { HEX64, bytesArg, exportError, plainEntries } from "./limits.js";

export interface PngBinding { scene: string; layout: string; state: string }
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KEYWORD = "igr-export";
const TEMPLATE = /^igr-export\/1 ([0-9a-f]{64}) ([0-9a-f]{64}) ([0-9a-f]{64})$/;

/** CRC-32 of the zlib/PNG polynomial 0xEDB88320, initial value and final xor 0xFFFFFFFF, over `bytes`. */
const CRC_TABLE: Uint32Array = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Chunk { type: string; start: number; length: number } // start: offset of the length field; the data begins at start + 8
const malformed = (detail: string): IaError => exportError("PNG_MALFORMED", "png", detail);
const u32 = (b: Uint8Array, o: number): number => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

/** Parses the container: the signature and a sequence of chunks that exactly fills the bytes, IHDR (length 13) first and IEND last. CRCs are not verified. */
export function parsePng(png: Uint8Array): Chunk[] {
  if (png.length < 8 + 12 + 13 + 12) throw malformed("too short");
  for (let i = 0; i < 8; i++) if (png[i] !== SIGNATURE[i]) throw malformed("bad signature");
  const chunks: Chunk[] = [];
  let at = 8;
  while (at < png.length) {
    if (at + 12 > png.length) throw malformed("truncated chunk header");
    const length = u32(png, at);
    if (length > 0x7fffffff || at + 12 + length > png.length) throw malformed("chunk length exceeds the file");
    let type = "";
    for (let i = 4; i < 8; i++) { const c = png[at + i]!; if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) throw malformed("chunk type is not four ASCII letters"); type += String.fromCharCode(c); }
    chunks.push({ type, start: at, length });
    at += 12 + length;
  }
  if (chunks[0]!.type !== "IHDR" || chunks[0]!.length !== 13) throw malformed("IHDR must come first with length 13");
  const last = chunks[chunks.length - 1]!;
  if (last.type !== "IEND" || last.length !== 0) throw malformed("IEND must come last");
  return chunks;
}

/** The binding chunks: tEXt chunks whose data begins with the keyword and a NUL. */
function bindingChunks(png: Uint8Array, chunks: Chunk[]): Chunk[] {
  return chunks.filter((c) => {
    if (c.type !== "tEXt" || c.length < KEYWORD.length + 1) return false;
    for (let i = 0; i < KEYWORD.length; i++) if (png[c.start + 8 + i] !== KEYWORD.charCodeAt(i)) return false;
    return png[c.start + 8 + KEYWORD.length] === 0;
  });
}

/** The IHDR width and height of a container already parsed. */
export function pngSize(png: Uint8Array): { width: number; height: number } { return { width: u32(png, 16), height: u32(png, 20) }; }

/** Inserts the single binding chunk immediately after IHDR (offset 33); nothing else is touched. The input is copied once. */
export function embedPngBinding(png: Uint8Array, binding: PngBinding): Uint8Array {
  const src = bytesArg(png, "png");
  const bm = plainEntries(binding); // each property read once; an accessor is refused
  if (bm === undefined || bm.size !== 3) throw exportError("SCHEMA", "binding", "exactly {scene, layout, state} expected");
  const own: PngBinding = { scene: "", layout: "", state: "" };
  for (const k of ["scene", "layout", "state"] as const) {
    const v = bm.get(k);
    if (typeof v !== "string" || !HEX64.test(v)) throw exportError("SCHEMA", `binding.${k}`, "64 lowercase hex characters expected");
    own[k] = v;
  }
  const chunks = parsePng(src);
  if (bindingChunks(src, chunks).length > 0) throw exportError("PNG_ALREADY_BOUND", "png");
  const text = `${KEYWORD}\u0000igr-export/1 ${own.scene} ${own.layout} ${own.state}`;
  const data = Uint8Array.from(Array.from(text, (c) => c.charCodeAt(0)));
  const body = new Uint8Array(4 + data.length);
  body.set([0x74, 0x45, 0x58, 0x74], 0); // "tEXt"
  body.set(data, 4);
  const chunk = new Uint8Array(12 + data.length);
  chunk[0] = (data.length >>> 24) & 255; chunk[1] = (data.length >>> 16) & 255; chunk[2] = (data.length >>> 8) & 255; chunk[3] = data.length & 255;
  chunk.set(body, 4);
  const crc = crc32(body);
  chunk[8 + data.length] = (crc >>> 24) & 255; chunk[9 + data.length] = (crc >>> 16) & 255; chunk[10 + data.length] = (crc >>> 8) & 255; chunk[11 + data.length] = crc & 255;
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(src.subarray(33), 33 + chunk.length);
  return out;
}

/** The binding of a PNG, or undefined when it has none; more than one binding chunk, or a text off the template, is PNG_MALFORMED. */
export function readPngBinding(png: Uint8Array): PngBinding | undefined {
  const src = bytesArg(png, "png");
  const chunks = parsePng(src);
  const found = bindingChunks(src, chunks);
  if (found.length === 0) return undefined;
  if (found.length > 1) throw malformed("more than one binding chunk");
  const c = found[0]!;
  if (c.length !== KEYWORD.length + 1 + 207) throw malformed("binding text off the template"); // refused before any string is built
  let text = "";
  for (let i = KEYWORD.length + 1; i < c.length; i++) text += String.fromCharCode(src[c.start + 8 + i]!);
  const m = TEMPLATE.exec(text);
  if (m === null) throw malformed("binding text off the template");
  return { scene: m[1]!, layout: m[2]!, state: m[3]! };
}
