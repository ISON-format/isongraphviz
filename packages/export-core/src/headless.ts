// src/headless.ts - `renderHeadless` (design 12): scene and layout bytes (+ optional state and intents) to the bytes of the named output functions of V4-V6 and
// the companion tree. No DOM, no filesystem, no clock. Each file is EXACTLY the bytes of its function; nothing is claimed about pixels.
import { VIEWPORT_MAX_PX, buildRenderModel, initialState, parseState, reduce, serializeState, type Intent, type RenderLimits, type RenderModel, type SemanticEvent, type SemanticState } from "isongraph-visualize-renderer-core";
import { renderSvg, type SvgOptions } from "isongraph-visualize-renderer-svg";
import { buildDisplayList, readoutFromList, serializeDisplayList, serializeReadout, type DlOptions } from "isongraph-visualize-display-list";
import { recordCanvasCalls } from "isongraph-visualize-display-list/canvas2d";
import { buildCompanionTree, serializeCompanionTree, type CompanionOptions } from "isongraph-visualize-a11y-companion";
import { IaError } from "isongraph-visualize-interaction-core";
import { NOT_PLAIN, bytesArg, copyData, plainEntries, utf8Encode } from "./limits.js";

export type HeadlessOutput = "state" | "svg" | "display-list" | "canvas-stream" | "readout" | "tree";
export interface HeadlessInput {
  sceneBytes: Uint8Array; layoutBytes: Uint8Array; size?: { width: number; height: number }; state?: SemanticState | Uint8Array; intents?: readonly Intent[];
  outputs?: readonly HeadlessOutput[]; limits?: Partial<RenderLimits>; svg?: SvgOptions; dl?: DlOptions; dprMilli?: number; ink?: readonly [number, number, number]; tree?: CompanionOptions;
}
export interface HeadlessResult { model: RenderModel; state: SemanticState; events: readonly SemanticEvent[]; files: Map<string, Uint8Array> }
const OUTPUTS: readonly string[] = ["state", "svg", "display-list", "canvas-stream", "readout", "tree"];
const input = (reason: string, path: string, detail?: string): IaError => new IaError("INVALID_INPUT", reason, path, detail);

function readSize(v: unknown): { width: number; height: number } {
  const m = plainEntries(v);
  if (m === undefined || m.size !== 2) throw input("SCHEMA", "size");
  const out = { width: 0, height: 0 };
  for (const k of ["width", "height"] as const) {
    const x = m.get(k);
    if (typeof x !== "number") throw input("SCHEMA", `size.${k}`);
    if (!Number.isInteger(x)) throw input("NOT_INTEGER", `size.${k}`);
    if (x < 1 || x > VIEWPORT_MAX_PX) throw input("OUT_OF_RANGE", `size.${k}`);
    out[k] = x;
  }
  return out;
}

export async function renderHeadless(i: HeadlessInput): Promise<HeadlessResult> {
  const m = plainEntries(i);
  if (m === undefined) throw input("SCHEMA", "input");
  for (const k of m.keys()) if (!["sceneBytes", "layoutBytes", "size", "state", "intents", "outputs", "limits", "svg", "dl", "dprMilli", "ink", "tree"].includes(k)) throw input("SCHEMA", k);
  // every caller-owned argument is snapshotted here, before the first await (bytes by a real copy, objects as own plain data, each property read once)
  if (!(m.get("sceneBytes") instanceof Uint8Array) || !(m.get("layoutBytes") instanceof Uint8Array)) throw input("SCHEMA", "sceneBytes/layoutBytes");
  const sceneBytes = bytesArg(m.get("sceneBytes"), "sceneBytes"), layoutBytes = bytesArg(m.get("layoutBytes"), "layoutBytes");
  const snap = (k: string): unknown => { const v = m.get(k); if (v === undefined) return undefined; const c = copyData(v, 12); if (c === NOT_PLAIN) throw input("SCHEMA", k, "plain data expected"); return c; };
  const stateRaw = m.get("state");
  const stateBytesIn = stateRaw instanceof Uint8Array ? bytesArg(stateRaw, "state") : undefined;
  const stateIn = stateRaw === undefined || stateRaw instanceof Uint8Array ? undefined : snap("state");
  const outputsRaw = m.get("outputs");
  const outputs = outputsRaw === undefined ? ["state", "svg"] : (Array.isArray(outputsRaw) ? [...(snap("outputs") as unknown[])] : undefined);
  if (outputs === undefined) throw input("SCHEMA", "outputs");
  const seen = new Set<unknown>();
  for (const o of outputs) { if (typeof o !== "string" || !OUTPUTS.includes(o) || seen.has(o)) throw input("SCHEMA", "outputs"); seen.add(o); }
  const size = m.get("size") === undefined ? undefined : readSize(m.get("size"));
  const intentsRaw = m.get("intents");
  const intents = intentsRaw === undefined ? [] : (Array.isArray(intentsRaw) ? [...(snap("intents") as unknown[])] : undefined);
  if (intents === undefined) throw input("SCHEMA", "intents");
  const limits = snap("limits") as Partial<RenderLimits> | undefined;
  const svgOpts = snap("svg") as SvgOptions | undefined, dlOpts = snap("dl") as DlOptions | undefined, treeOpts = snap("tree") as CompanionOptions | undefined;
  const ink = snap("ink") as readonly [number, number, number] | undefined;
  const dprMilli = m.get("dprMilli") as number | undefined;
  const model = await buildRenderModel(sceneBytes, layoutBytes, limits === undefined ? undefined : { limits });
  let state: SemanticState;
  if (stateBytesIn !== undefined) state = parseState(model, stateBytesIn, limits);
  else if (stateIn !== undefined) { serializeState(model, stateIn as SemanticState); state = stateIn as SemanticState; } // validated like loadScene's initial; an owned copy
  else state = initialState(model, size ?? { width: 900, height: 600 });
  if (size !== undefined && stateRaw !== undefined && (size.width !== state.viewport.width || size.height !== state.viewport.height)) throw input("INVALID_VALUE", "size", "differs from the state's viewport");
  const events: SemanticEvent[] = [];
  for (const intent of intents) { const r = reduce(model, state, intent, limits); state = r.state; for (const e of r.events) events.push(e); } // an IgrError aborts: no partial result
  const files = new Map<string, Uint8Array>();
  let list: ReturnType<typeof buildDisplayList> | undefined;
  const dl = (): ReturnType<typeof buildDisplayList> => { if (list === undefined) list = buildDisplayList(model, state, dlOpts); return list; };
  for (const name of outputs as HeadlessOutput[]) {
    switch (name) {
      case "state": files.set(name, serializeState(model, state)); break;
      case "svg": files.set(name, utf8Encode(renderSvg(model, state, svgOpts))); break;
      case "display-list": files.set(name, serializeDisplayList(dl())); break;
      case "canvas-stream": {
        const o: { dprMilli?: number; ink?: readonly [number, number, number] } = {};
        if (dprMilli !== undefined) o.dprMilli = dprMilli;
        if (ink !== undefined) o.ink = ink;
        files.set(name, recordCanvasCalls(dl() as never, o)); break;
      }
      case "readout": files.set(name, serializeReadout(readoutFromList(dl()))); break;
      case "tree": files.set(name, serializeCompanionTree(buildCompanionTree(model, state, { events, ...treeOpts }))); break;
    }
  }
  return { model, state, events, files };
}
