// The corpus reader for fixtures/oracles-gl (design 13.2): EXPECT.tsv, SHA256SUMS, expected files, models and states. Test code: it never imports src/.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { IgrError, buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import type { RenderModel, SemanticState } from "isongraph-visualize-renderer-core";

export interface Row { id: string; group: string; tier: string; scene: string; layout: string; input: string; expected: string; error: string }
export interface Oracle {
  dir: string; rows: Row[]; byId: Map<string, Row>;
  bytes(rel: string): Uint8Array; text(rel: string): string; json(rel: string): unknown;
  model(scene: string, layout: string): Promise<RenderModel>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

export const sha256 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex");

export function verifySums(dir: string): string[] {
  const failures: string[] = [];
  const sums = readFileSync(join(dir, "SHA256SUMS"), "utf8").split("\n").filter((l) => l !== "");
  for (const line of sums) {
    const m = /^([0-9a-f]{64}) \*(.+)$/.exec(line);
    if (!m) { failures.push(`malformed line: ${line}`); continue; }
    let got: string;
    try { got = sha256(readFileSync(join(dir, m[2]!))); } catch { failures.push(`missing: ${m[2]}`); continue; }
    if (got !== m[1]) failures.push(`digest mismatch: ${m[2]}`);
  }
  return failures;
}
export const sumsDigest = (dir: string): string => sha256(readFileSync(join(dir, "SHA256SUMS")));

export function loadOracle(dir: string): Oracle {
  const root = resolve(dir);
  const tsv = readFileSync(join(root, "EXPECT.tsv"), "utf8").split("\n").filter((l) => l !== "");
  const rows: Row[] = tsv.slice(1).map((l) => {
    const c = l.split("\t");
    return { id: c[0] ?? "", group: c[1] ?? "", tier: c[2] ?? "", scene: c[3] ?? "", layout: c[4] ?? "", input: c[5] ?? "", expected: c[6] ?? "", error: c[7] ?? "" };
  });
  const models = new Map<string, Promise<RenderModel>>();
  const o: Oracle = {
    dir: root, rows, byId: new Map(rows.map((r) => [r.id, r])),
    bytes: (rel) => new Uint8Array(readFileSync(join(root, normalize(rel)))),
    text: (rel) => readFileSync(join(root, normalize(rel)), "utf8"),
    json: (rel) => JSON.parse(readFileSync(join(root, normalize(rel)), "utf8")) as unknown,
    model: (scene, layout) => {
      const k = scene + "\u0000" + layout;
      let m = models.get(k);
      if (!m) { m = buildRenderModel(o.bytes(scene), o.bytes(layout)); models.set(k, m); }
      return m;
    },
  };
  return o;
}

export class Mismatch extends Error {}
export const fail = (m: string): never => { throw new Mismatch(m); };
export const code = (e: unknown): string => (e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${e instanceof Error ? e.message : String(e)}`);

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (typeof v === "object" && v !== null) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}
const canon = (v: unknown): string => JSON.stringify(sortKeys(v === undefined ? null : v));
export function eq(what: string, got: unknown, want: unknown): void {
  const a = canon(got), b = canon(want);
  if (a !== b) fail(`${what}: got ${a.slice(0, 300)} want ${b.slice(0, 300)}`);
}
export function eqBytes(what: string, got: Uint8Array, want: Uint8Array): void {
  if (got.length === want.length && got.every((x, i) => x === want[i])) return;
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  const t = new TextDecoder("utf-8");
  fail(`${what}: first difference at byte ${i} (got ${got.length} bytes, want ${want.length}): got ...${JSON.stringify(t.decode(got.slice(Math.max(0, i - 40), i + 60)))} want ...${JSON.stringify(t.decode(want.slice(Math.max(0, i - 40), i + 60)))}`);
}
export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
export const parseInput = (row: Row): Json => (/^[{[]/.test(row.input) ? (JSON.parse(row.input) as Json) : {});

/** The model of a row and its state: "initial" (at the row's size) or a state file path relative to the corpus. */
export async function modelAndState(c: Oracle, row: Row, input: Json, stateOverride?: string): Promise<{ model: RenderModel; state: SemanticState }> {
  const model = await c.model(row.scene, row.layout);
  const s = (stateOverride ?? input["state"]) as string | undefined;
  const state = s === "initial" || s === undefined ? initialState(model, (input["size"] as { width: number; height: number } | undefined) ?? { width: 900, height: 600 }) : (c.json(s) as SemanticState);
  return { model, state };
}

/** The corpus-reader tokens of 27 13.3a stand for these doubles. */
export function token(v: unknown): unknown { return v === "NaN" ? NaN : v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : v; }
export function tokens(options: unknown): unknown {
  if (Array.isArray(options)) return options.map(tokens);
  if (typeof options !== "object" || options === null) return token(options);
  const out: Record<string, unknown> = { ...(options as Record<string, unknown>) };
  for (const k of Object.keys(out)) out[k] = tokens(out[k]);
  return out;
}
