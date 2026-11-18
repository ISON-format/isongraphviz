// Rows of this implementation that come from the independent audit of step 1 (reviews/31-code-audit-step1.md): behaviour no corpus row separates.
// They are NOT oracle rows and no oracle file is edited. Each row is a function of the display-list implementation; test/audit.test.ts runs them against src/
// and packages/renderer-canvas/test/oracle/runner.ts (`runExtra`) runs them in the mutation harness against scratch mutants, so one body serves both.
import { verifyScene } from "isongraph-visualize-scene-core";
import { canonicalBytes } from "isongraph-visualize-scene-core/primitives";
import { computeFixedLayout } from "isongraph-visualize-layout-core";
import { IgrError, buildRenderModel, initialState } from "isongraph-visualize-renderer-core";
import type { RenderModel } from "isongraph-visualize-renderer-core";
import type * as Dl from "../src/index.js";
import type * as Cv from "../src/canvas2d/index.js";
const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s);
/** Where a row reads oracle text from: the harness passes the corpus it runs against, the test passes the tracked fixtures (no path of this file is used). */
export interface AuditIo { text(rel: string): string }

export type AuditImpl = typeof Dl & typeof Cv;
export interface AuditRow { id: string; run(fn: AuditImpl, io: AuditIo): Promise<void> | void }

const code = (f: () => unknown): string => { try { f(); return "none"; } catch (e) { return e instanceof IgrError ? `${e.code}/${e.reason ?? ""}` : `other:${e instanceof Error ? e.name : String(e)}`; } };
const must = (what: string, got: unknown, want: unknown): void => { if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

/** A directed scene of two nodes a, b at (100, 300) and (500, 300) px joined by `k` edges r00.. (one parallel group), read under the identity viewport. */
export async function parallelModel(k: number): Promise<RenderModel> {
  const node = (id: string) => ({ category: "p", label: id.slice(2), ref: { id, type: "p" } });
  const a = node("s:a"), b = node("s:b");
  const edges = Array.from({ length: k }, (_, i) => { const rel = "r" + String(i).padStart(2, "0"); return { label: rel, ref: { ord: "0", rel, src: { ...a.ref }, tgt: { ...b.ref } } }; });
  const scene = canonicalBytes({
    address_scheme: "igs-addr/1", edges, graph: { directed: true, profile: "simple" }, igs: "IGS/1", nodes: [a, b],
    source: { artifact_sha256: "0".repeat(64), serialization_profile: "ison-v1" },
  } as never);
  await verifyScene(scene);
  const lay = await computeFixedLayout(scene, [{ ref: a.ref, x: 100, y: 300 }, { ref: b.ref, x: 500, y: 300 }]);
  return buildRenderModel(scene, lay.layoutBytes);
}


export const AUDIT_ROWS: AuditRow[] = [
  { // I-1: a record kind that is an inherited Object.prototype name is an unknown kind (D2)
    id: "ext:I1",
    run(fn, io) {
      const lines = io.text("dl/G01.dl").split("\n");
      for (const kind of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
        const text = [lines[0], `["${kind}"]`, ...lines.slice(1)].join("\n");
        must(`kind ${kind}`, code(() => fn.parseDisplayList(bytesOf(text))), "INVALID_INPUT/SCHEMA");
      }
      // and it must not switch the order check off for the next record: N records after the T records stay out of order
      const n = lines.filter((l) => l.startsWith('["N"')), t = lines.filter((l) => l.startsWith('["T"'));
      const head = lines.filter((l) => l.startsWith('["H"') || l.startsWith('["n"') || l.startsWith('["e"') || l.startsWith('["E"') || l.startsWith('["A"'));
      must("order", code(() => fn.parseDisplayList(bytesOf([...head, ...t, '["constructor"]', ...n, ""].join("\n")))), "INVALID_INPUT/SCHEMA");
    },
  },
  { // M-1: maxLineUnits is checked before every other D1 rule, for every line
    id: "ext:M1",
    run(fn, io) {
      const long = "[" + "9,".repeat(80) + "9]\n";
      must("blank then long", code(() => fn.parseDisplayList(bytesOf("\n" + long), { maxLineUnits: 10 })), "RESOURCE_LIMIT/BYTES_LIMIT");
      must("indented then long", code(() => fn.parseDisplayList(bytesOf(" x\n" + long), { maxLineUnits: 10 })), "RESOURCE_LIMIT/BYTES_LIMIT");
      must("nested then long", code(() => fn.parsePickBuffer(bytesOf("[[[[1]]]]\n" + long), { maxLineUnits: 10 })), "RESOURCE_LIMIT/BYTES_LIMIT");
    },
  },
  { // M-2: the write limit is validated like the read limits; it never fails open
    id: "ext:M2",
    run(fn, io) {
      const list = fn.parseDisplayList(bytesOf(io.text("dl/G01.dl")));
      for (const bad of [NaN, "x", Infinity, -5, 1.5, null]) must(`maxBytes ${String(bad)}`, code(() => fn.serializeDisplayList(list, { maxBytes: bad as never })).startsWith("INVALID_INPUT/"), true);
      must("limits not an object", code(() => fn.serializeDisplayList(list, 5 as never)), "INVALID_INPUT/SCHEMA");
      must("exact", fn.serializeDisplayList(list, { maxBytes: 637 }).length, 637);
      must("one short", code(() => fn.serializeDisplayList(list, { maxBytes: 636 })), "RESOURCE_LIMIT/BYTES_LIMIT");
      must("undefined limit", fn.serializeDisplayList(list, { maxBytes: undefined }).length, 637);
    },
  },
  { // M-8 A04: an A must follow the E of the SAME pid
    id: "ext:A04",
    run(fn, io) {
      const lines = io.text("dl/G05.dl").split("\n");
      const a = lines.map((l, i) => (l.startsWith('["A"') ? i : -1)).filter((i) => i >= 0);
      // the second A is replaced by a copy of the first: the A count still equals the E count and the copy is the right triangle for the E it names,
      // so only 'an A follows the E of the SAME pid' separates it (a swap of two A lines would also fail 'an A names an E')
      const swapped = [...lines];
      swapped[a[1]!] = lines[a[0]!]!;
      must("accepted unswapped", code(() => fn.parseDisplayList(bytesOf(lines.join("\n")))), "none");
      must("swapped A lines", code(() => fn.parseDisplayList(bytesOf(swapped.join("\n")))), "INVALID_INPUT/SCHEMA");
    },
  },
  { // M-8 A07: a pick polyline has 2 or 17 points, nothing else
    id: "ext:A07",
    run(fn, io) {
      const pe = (pts: number): string => `["P","igr-pick/1",0,1]\n["pe",1,${Array.from({ length: 2 * pts }, (_, i) => i).join(",")}]\n`;
      for (const n of [1, 3, 16, 18]) must(`${n} points`, code(() => fn.parsePickBuffer(bytesOf(pe(n)))), "INVALID_INPUT/SCHEMA");
      for (const n of [2, 17]) must(`${n} points`, code(() => fn.parsePickBuffer(bytesOf(pe(n)))), "none");
    },
  },
  { // M-8 A12: the differences of compareReadouts are sorted by UTF-8 bytes (U+FFFF before U+10000; UTF-16 order says the opposite)
    id: "ext:A12",
    run(fn, io) {
      const r = fn.readoutFromList(fn.parseDisplayList(bytesOf(io.text("dl/G01.dl"))));
      const c = JSON.parse(JSON.stringify(r)) as typeof r;
      c.labels.nodes[0]!.text = "X";
      const res = fn.compareReadouts([{ renderer: "a", readout: r }, { renderer: "b", readout: JSON.parse(JSON.stringify(r)) as typeof r }, { renderer: "\u{10000}", readout: c }, { renderer: "￿", readout: JSON.parse(JSON.stringify(c)) as typeof r }]);
      must("sorted", res, { agree: false, differences: [{ path: "labels.nodes[0].text", renderers: ["￿", "\u{10000}"] }] });
    },
  },
  { // M-8 A20: `|` is not allowed in a type or a relation (IDENTIFIER of IGS/1), nor are whitespace, `"` and `\`
    id: "ext:A20",
    run(fn, io) {
      for (const bad of ["per|son", "per son", "per\\\\son", "per\\\"son"]) must(`type ${bad}`, code(() => fn.parseDisplayList(bytesOf(io.text("dl/G01.dl").split('"person"').join(`"${bad}"`)))), "INVALID_INPUT/SCHEMA");
      for (const bad of ["KN|OWS", "KN OWS"]) must(`rel ${bad}`, code(() => fn.parseDisplayList(bytesOf(io.text("dl/G01.dl").split('"KNOWS"').join(`"${bad}"`)))), "INVALID_INPUT/SCHEMA");
    },
  },
  { // M-8 A23, A25: the control point of member p of a group of k lies (2p - (k - 1)) x 16 px from the chord; groups of 9 and of 70 (past index 60)
    id: "ext:A23",
    async run(fn, io) {
      for (const k of [3, 7, 9, 70]) {
        const model = await parallelModel(k);
        const base = initialState(model, { width: 900, height: 600 });
        const state = { ...base, viewport: { ...base.viewport, center_x: 450000, center_y: 300000, zoom: 1000 } };
        const list = fn.buildDisplayList(model, state);
        const es = list.records.filter((r) => r[0] === "E");
        must(`group of ${k}`, es.length, k);
        es.forEach((r, p) => must(`k ${k} member ${p}`, [r[3], r[6], r[7]], [1, 300000, 300000 + (2 * p - (k - 1)) * 16000]));
      }
    },
  },
  { // M-5: the nested addresses of an SVG readout are snapshotted once; an accessor is refused
    id: "ext:M5",
    run(fn, io) {
      let reads = 0;
      const address = { get id(): unknown { reads++; return reads === 1 ? "s:a" : 12345; }, type: "t" };
      const svg = { scene_sha256: "1".repeat(64), layout_sha256: "2".repeat(64), width: 900, height: 600, directed: false, nodes: [{ address, cx: "1", cy: "1", selected: false, focused: false }], edges: [] };
      must("accessor", code(() => fn.readoutFromSvgReadout(svg as never)), "INVALID_INPUT/SCHEMA");
      const edgeSvg = { ...svg, nodes: [], edges: [{ address: { ord: "0", rel: "r", src: { id: "s:a", type: "t" }, get tgt(): unknown { return { id: "s:b", type: "t" }; } }, selected: false, focused: false, marker: false }] };
      must("accessor in an edge address", code(() => fn.readoutFromSvgReadout(edgeSvg as never)), "INVALID_INPUT/SCHEMA");
    },
  },
  { // N-4: an executor or a readout handed a hand-built bad source throws IgrError, never a TypeError
    id: "ext:H1",
    run(fn, io) {
      const table = { format: "igr-dl/1", directed: false, artifactSha256: "0".repeat(64), sceneSha256: "1".repeat(64), layoutSha256: "2".repeat(64), nodes: [{ id: "i:1", type: "t" }], edges: [] };
      const mk = (records: unknown[]) => ({ ...table, width: 100, height: 100, records }) as never;
      const rec = fn.createRecordingContext();
      for (const records of [[["N", 1, 9, 0, 1, 1]], [["Q", 1]], [["N", 1, 0, 0, 1]], [["T", 1, 0, 1, 1, 5]], [["E", 2, 0, 3, 1, 2, 3, 4]], [["A", 2, 1]], ["x"], [null]]) {
        must(`replay ${JSON.stringify(records)}`, code(() => fn.replayCanvas(mk(records), rec.ctx)), "INVALID_INPUT/SCHEMA");
      }
      must("records not an array", code(() => fn.replayCanvas({ width: 1, height: 1, records: 5 } as never, rec.ctx)), "INVALID_INPUT/SCHEMA");
      for (const records of [[["N", 5, 0, 0, 1, 1]], [["T", 9, 0, 1, 1, "x"]], [["E", 1, 0, 0, 1, 2, 3, 4]]]) {
        must(`readout ${JSON.stringify(records)}`, code(() => fn.readoutFromList(mk(records))), "INVALID_INPUT/SCHEMA");
      }
    },
  },
];
