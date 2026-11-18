// src/canvas2d/record.ts - the recording context and the recorded stream (design 6.3): the oracle form of a replay.
import { IgrError } from "isongraph-visualize-renderer-core";
import { canonicalJson } from "../canon.js";
import { utf8Encode } from "../utf8.js";
import { replayCanvas, resolveReplayOptions } from "./replay.js";
import type { Canvas2DLike, ReplayOptions, ReplaySource } from "./types.js";

/** The methods and the assigned properties of 6.1; the stream reader accepts exactly these names. */
export const CV_METHODS = ["beginPath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "arc", "closePath", "fill", "stroke", "fillText", "clearRect", "setTransform", "setLineDash"] as const;
export const CV_PROPERTIES = ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font", "textAlign", "textBaseline", "direction"] as const;
const NUMERIC_PROPS: readonly string[] = ["lineWidth", "globalAlpha"];

const bad = (detail: string): IgrError => new IgrError("INVALID_INPUT", "SCHEMA", "cv.record", detail);

/** A number `a` is written `round(a x 1000)`; the recorder throws if `a x 1000` is not within 2^-30 max(1, |round|) of an integer. */
function numberToken(a: number): number {
  const scaled = a * 1000;
  const t = Math.round(scaled);
  if (!Number.isFinite(scaled) || Math.abs(scaled - t) > 2 ** -30 * Math.max(1, Math.abs(t))) throw bad("a number is not a whole number of milli-units");
  return t === 0 ? 0 : t;
}
function token(a: unknown): unknown {
  if (typeof a === "number") return numberToken(a);
  if (typeof a === "string") return a;
  if (Array.isArray(a)) return a.map((x: unknown) => numberToken(x as number));
  throw bad("an argument of an unrecorded type");
}
/** The arc angles are the two exact values 0 (token 0) and 2 pi (token "TAU"); anything else throws. */
function angleToken(a: unknown): number | string {
  if (a === 0) return 0;
  if (a === 2 * Math.PI) return "TAU";
  throw bad("an arc angle other than 0 and 2 pi");
}

export interface RecordingContext { ctx: Canvas2DLike; onElement: (pid: number, layer: number) => void; bytes(): Uint8Array; reset(): void }

/** A Canvas2DLike that records every call and assignment, and an `onElement` hook; `bytes()` is the stream, `reset()` empties it. */
export function createRecordingContext(): RecordingContext {
  let lines: string[] = [];
  const put = (rec: unknown[]): void => { lines.push(canonicalJson(rec)); };
  const ctx: Record<string, unknown> = {};
  for (const name of CV_METHODS) {
    ctx[name] = (...args: unknown[]): void => {
      if (name === "arc") put(["m", name, token(args[0]), token(args[1]), token(args[2]), angleToken(args[3]), angleToken(args[4])]);
      else put(["m", name, ...args.map(token)]);
    };
  }
  for (const prop of CV_PROPERTIES) {
    let value: unknown;
    Object.defineProperty(ctx, prop, {
      get: () => value,
      set: (v: unknown) => { value = v; put(["s", prop, NUMERIC_PROPS.includes(prop) ? token(v) : v]); },
      enumerable: true,
    });
  }
  return {
    ctx: ctx as unknown as Canvas2DLike,
    onElement: (pid: number, layer: number): void => { put(["#", pid, layer]); },
    bytes: () => utf8Encode(lines.length === 0 ? "" : lines.join("\n") + "\n"),
    reset: () => { lines = []; },
  };
}

/** `replayCanvas` into a fresh recording context with the marker hook installed: the stream of 6.3, a pure function of (list, dprMilli, ink, layers). */
export function recordCanvasCalls(source: ReplaySource, options?: ReplayOptions): Uint8Array {
  const o = resolveReplayOptions(options);
  const rec = createRecordingContext();
  replayCanvas(source, rec.ctx, { dprMilli: o.dprMilli, ink: o.ink, layers: o.layers, onElement: rec.onElement });
  return rec.bytes();
}
