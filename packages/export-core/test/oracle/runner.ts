// The row runner of fixtures/oracles-ia for the families of export-core (design 15.3, 15.5): X (export bundle, PNG binding chunk, manifest and bundle
// verification) and H (headless outputs and argument errors). Rows of the other families belong to interaction-core and a11y-companion. The runner is
// parameterized by the implementation (`Impl`), so the same logic runs against src/ (the conformance test) and against the scratch copies of the mutation
// harness (scripts/mutate.mjs). It imports nothing from vitest and nothing from src/.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRenderModel, type RenderModel, type SemanticState } from "isongraph-visualize-renderer-core";
import { canonicalBytesSigned } from "isongraph-visualize-scene-core/primitives";

export interface Impl {
  exportBundle(model: RenderModel, state: SemanticState, layoutBytes: Uint8Array, options?: unknown): Promise<{ files: Map<string, Uint8Array>; manifest: unknown; manifestBytes: Uint8Array }>;
  parseExportManifest(bytes: Uint8Array): unknown;
  verifyExportBundle(files: ReadonlyMap<string, Uint8Array>, manifestBytes: Uint8Array, options?: unknown): Promise<unknown>;
  embedPngBinding(png: Uint8Array, binding: unknown): Uint8Array;
  readPngBinding(png: Uint8Array): { scene: string; layout: string; state: string } | undefined;
  renderHeadless(input: unknown): Promise<{ files: Map<string, Uint8Array> }>;
}
export interface Row { id: string; group: string; tier: string; scene: string; layout: string; input: string; expected: string; error: string }
export interface Corpus { dir: string; rows: Row[]; byId: Map<string, Row>; read(rel: string): Uint8Array; text(rel: string): string }
export interface RowResult { id: string; ok: boolean; detail?: string }

export const GROUPS = new Set(["X", "H"]);

export function loadCorpus(dir: string): Corpus {
  const read = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(dir, rel)));
  const text = (rel: string): string => readFileSync(join(dir, rel), "utf8");
  const lines = text("EXPECT.tsv").split("\n");
  const head = lines[0]!.split("\t");
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    if (line === "") continue;
    const c = line.split("\t");
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h] = c[i] ?? ""; });
    rows.push(o as unknown as Row);
  }
  return { dir, rows, byId: new Map(rows.map((r) => [r.id, r])), read, text };
}
export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

export function errKey(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e) return `${String((e as { code: unknown }).code)}/${String((e as { reason?: unknown }).reason ?? "")}`;
  return `other:${e instanceof Error ? e.message : String(e)}`;
}
export function same(a: Uint8Array, b: Uint8Array, what: string): void {
  if (a.length === b.length && a.every((x, i) => x === b[i])) return;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  throw new Error(`${what}: bytes differ at offset ${i} (actual ${a.length} bytes, expected ${b.length})`);
}
async function expectOutcome<T>(row: Row, f: () => T | Promise<T>): Promise<void> {
  let thrown: unknown;
  let did = false;
  try { await f(); } catch (e) { thrown = e; did = true; }
  if (row.error === "") { if (did && thrown instanceof Error && /bytes differ/.test(thrown.message)) throw thrown; if (did) throw new Error(`${row.id}: unexpected error ${errKey(thrown)}${thrown instanceof Error ? ` (${thrown.message.slice(0, 300)})` : ""}`); return; }
  if (!did) throw new Error(`${row.id}: expected ${row.error}, got no error`);
  if (errKey(thrown) !== row.error) throw new Error(`${row.id}: expected ${row.error}, got ${errKey(thrown)}`);
}

const models = new Map<string, Promise<RenderModel>>();
const modelOf = (c: Corpus, scene: string, layout: string): Promise<RenderModel> => {
  const k = c.dir + "\u0000" + scene + "\u0000" + layout;
  let m = models.get(k);
  if (!m) { m = buildRenderModel(c.read(scene), c.read(layout)); models.set(k, m); }
  return m;
};
/** The recipe of generated/README.txt for X24: 1,048,577 bytes of 0x41, checked against generated/GENERATED.tsv. */
function generated(c: Corpus, rel: string): Uint8Array {
  const row = c.text("generated/GENERATED.tsv").split("\n").slice(1).map((l) => l.split("\t")).find((x) => x.includes(rel));
  if (!row) throw new Error(`${rel}: not recorded in generated/GENERATED.tsv`);
  const b = new Uint8Array(1_048_577).fill(0x41);
  if (!row.includes(String(b.length)) || !row.includes(sha256(b))) throw new Error(`${rel}: the generated vector does not match GENERATED.tsv`);
  return b;
}
const fileBytes = (c: Corpus, rel: string): Uint8Array => (rel.startsWith("generated/") ? generated(c, rel) : c.read(rel));
const deepFreeze = <T>(v: T): T => { if (typeof v === "object" && v !== null && !Object.isFrozen(v)) { for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]); Object.freeze(v); } return v; };

async function runX(impl: Impl, c: Corpus, row: Row): Promise<void> {
  const inp = JSON.parse(row.input) as Record<string, unknown>;
  switch (inp["op"]) {
    case "export": {
      const model = await modelOf(c, row.scene, row.layout);
      const state = JSON.parse(c.text("states/O1.initial.state.json")) as SemanticState;
      const arts = inp["artifacts"] as string[];
      const opts: Record<string, unknown> = {};
      if (!arts.includes("svg")) opts["svg"] = false;
      if (arts.includes("png")) opts["png"] = c.read("png/fixture.png");
      if (inp["expectedPngSize"] !== undefined) opts["expectedPngSize"] = inp["expectedPngSize"];
      const r = await impl.exportBundle(model, deepFreeze(state), c.read(row.layout), opts);
      same(r.manifestBytes, c.read(row.expected), `${row.id} manifest`);
      if (arts.includes("svg")) same(r.files.get("svg")!, c.read("data/O1.decl.svg"), `${row.id} svg`);
      if (arts.includes("png")) same(r.files.get("png")!, c.read("png/X04.png"), `${row.id} png`);
      return;
    }
    case "embed": {
      const out = impl.embedPngBinding(c.read(inp["png"] as string), inp["binding"]);
      same(out, c.read(row.expected), `${row.id} png`);
      return;
    }
    case "read": {
      const b = impl.readPngBinding(c.read(inp["png"] as string));
      same(canonicalBytesSigned(b as never), c.read(row.expected), `${row.id} binding`);
      return;
    }
    case "parse": impl.parseExportManifest(fileBytes(c, inp["manifest"] as string)); return;
    case "verify": {
      const files = new Map<string, Uint8Array>(Object.entries(inp["files"] as Record<string, string>).map(([k, p]) => [k, fileBytes(c, p)]));
      await impl.verifyExportBundle(files, fileBytes(c, inp["manifest"] as string));
      return;
    }
    default: throw new Error(`${row.id}: unknown X op`);
  }
}

async function runH(impl: Impl, c: Corpus, row: Row): Promise<void> {
  const inp = JSON.parse(row.input) as { size?: unknown; state?: string; intents?: unknown[]; outputs: string[] };
  const call: Record<string, unknown> = { sceneBytes: c.read(row.scene), layoutBytes: c.read(row.layout), outputs: inp.outputs };
  if (inp.size !== undefined) call["size"] = inp.size;
  if (inp.state !== undefined) call["state"] = c.read(inp.state);
  if (inp.intents !== undefined) call["intents"] = inp.intents;
  const r = await impl.renderHeadless(call);
  if (row.expected !== "") same(r.files.get(inp.outputs[0]!)!, c.read(row.expected), `${row.id} output`);
}

export async function runRow(impl: Impl, c: Corpus, row: Row): Promise<void> {
  if (!GROUPS.has(row.group)) throw new Error(`${row.id}: not a row of export-core`);
  await expectOutcome(row, () => (row.group === "X" ? runX(impl, c, row) : runH(impl, c, row)));
}

export async function runAll(impl: Impl, c: Corpus): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (const row of c.rows) {
    if (!GROUPS.has(row.group) || row.tier !== "core") continue;
    try { await runRow(impl, c, row); out.push({ id: row.id, ok: true }); } catch (e) { out.push({ id: row.id, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  return out;
}
