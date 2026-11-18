// src/canvas2d/replay.ts - replayCanvas (design 6.2): the Canvas 2D executor of a display list. It replays; it decides nothing.
import { IgrError } from "isongraph-visualize-renderer-core";
import { THEME, PALETTE } from "../theme.js";
import type { DlRecord } from "../types.js";
import type { Canvas2DLike, ReplayOptions, ReplaySource } from "./types.js";

export interface ResolvedReplay { dprMilli: number; ink: readonly [number, number, number]; layers: readonly number[]; onElement: ((pid: number, layer: number) => void) | undefined }

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);

/** An own-property snapshot: each property is read once; an accessor or a `__proto__` key is refused (27 14). */
export function ownSnapshot(o: unknown, path: string): Record<string, unknown> {
  if (typeof o !== "object" || o === null || Array.isArray(o)) throw bad("SCHEMA", path, "plain object expected");
  const proto: unknown = Object.getPrototypeOf(o);
  if (proto !== Object.prototype && proto !== null) throw bad("SCHEMA", path, "plain object expected");
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k === "__proto__") throw bad("SCHEMA", `${path}.${k}`, "a __proto__ key");
    const d = Object.getOwnPropertyDescriptor(o, k)!;
    if (d.get !== undefined || d.set !== undefined) throw bad("SCHEMA", `${path}.${k}`, "an accessor");
    out[k] = d.value as unknown;
  }
  return out;
}

const REPLAY_KEYS = ["dprMilli", "ink", "layers", "onElement"] as const;

/** Validates the replay options in alphabetical order (dprMilli, ink, layers, onElement); an unknown key is SCHEMA. */
export function resolveReplayOptions(options: unknown): ResolvedReplay {
  const out: ResolvedReplay = { dprMilli: 1000, ink: THEME.ink, layers: [1, 2, 3, 4, 5, 6, 7, 8], onElement: undefined };
  if (options === undefined) return out;
  const raw = ownSnapshot(options, "options");
  for (const k of Object.keys(raw)) if (raw[k] !== undefined && !(REPLAY_KEYS as readonly string[]).includes(k)) throw bad("SCHEMA", `options.${k}`, "unknown option");
  const dpr = raw["dprMilli"];
  if (dpr !== undefined) {
    if (typeof dpr !== "number") throw bad("SCHEMA", "options.dprMilli", "number expected");
    if (!Number.isFinite(dpr)) throw bad("NOT_FINITE", "options.dprMilli");
    if (!Number.isInteger(dpr)) throw bad("INVALID_VALUE", "options.dprMilli");
    if (dpr < 250 || dpr > 8000) throw bad("OUT_OF_RANGE", "options.dprMilli");
    out.dprMilli = dpr;
  }
  const ink = raw["ink"];
  if (ink !== undefined) {
    if (!Array.isArray(ink) || ink.length !== 3) throw bad("SCHEMA", "options.ink", "an array of three integers expected");
    const rgb: number[] = [];
    for (let i = 0; i < 3; i++) {
      const v: unknown = ink[i];
      if (typeof v !== "number" || !Number.isInteger(v)) throw bad("INVALID_VALUE", `options.ink[${i}]`, "integer expected");
      if (v < 0 || v > 255) throw bad("OUT_OF_RANGE", `options.ink[${i}]`);
      rgb.push(v);
    }
    out.ink = [rgb[0]!, rgb[1]!, rgb[2]!];
  }
  const layers = raw["layers"];
  if (layers !== undefined) {
    if (!Array.isArray(layers)) throw bad("SCHEMA", "options.layers", "array expected");
    const ls: number[] = [];
    for (let i = 0; i < layers.length; i++) {
      const v: unknown = layers[i];
      if (typeof v !== "number" || !Number.isInteger(v)) throw bad("INVALID_VALUE", `options.layers[${i}]`, "integer expected");
      if (v < 1 || v > 8) throw bad("OUT_OF_RANGE", `options.layers[${i}]`);
      if (i > 0 && v <= ls[i - 1]!) throw bad("INVALID_VALUE", `options.layers[${i}]`, "strictly ascending expected");
      ls.push(v);
    }
    out.layers = ls;
  }
  const hook = raw["onElement"];
  if (hook !== undefined) {
    if (typeof hook !== "function") throw bad("SCHEMA", "options.onElement", "function expected");
    out.onElement = hook as (pid: number, layer: number) => void;
  }
  return out;
}

const num = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
/** A hand-built source is checked once, so that a malformed record is an IgrError and never a TypeError (audit N-4). A parsed or built list always passes. */
function checkSource(source: unknown): void {
  const s = source as { width?: unknown; height?: unknown; records?: unknown } | null;
  if (typeof s !== "object" || s === null || !num(s.width) || !num(s.height) || !Array.isArray(s.records)) throw bad("SCHEMA", "source", "a source with width, height and records expected");
  s.records.forEach((r: unknown, i: number) => {
    const rec = r as unknown[];
    const path = `source.records[${i}]`;
    if (!Array.isArray(rec) || rec.length < 2) throw bad("SCHEMA", path, "a record is an array");
    const form = rec[3] as number;
    const ok = rec[0] === "E" ? (form === 0 || form === 1 || form === 2) && rec.length === 8 + 2 * form && rec.slice(1).every(num)
      : rec[0] === "A" ? rec.length === 8 && rec.slice(1).every(num)
      : rec[0] === "N" ? rec.length === 6 && rec.slice(1).every(num) && Number.isInteger(rec[2]) && (rec[2] as number) >= 0 && (rec[2] as number) <= 8
      : rec[0] === "T" ? rec.length === 6 && rec.slice(1, 5).every(num) && typeof rec[5] === "string"
      : false;
    if (!ok) throw bad("SCHEMA", path, "not a record of 4.1");
  });
}

const rgbText = (c: readonly [number, number, number]): string => `rgb(${c[0]},${c[1]},${c[2]})`;
type StyleProp = "fillStyle" | "strokeStyle" | "lineWidth" | "globalAlpha" | "font" | "textAlign" | "textBaseline" | "direction";

/**
 * Replays `source` into `ctx` (6.2). The prologue (setTransform, clearRect) is always issued; then each layer of `options.layers` in the given order,
 * its elements in record order, each preceded by `onElement(pid, layer)` and its style assignments (only those whose cached value differs; the cache
 * is empty at the start of every replay). A coordinate argument is `m / 1000`.
 */
export function replayCanvas(source: ReplaySource, ctx: Canvas2DLike, options?: ReplayOptions): void {
  const o = resolveReplayOptions(options);
  checkSource(source);
  const ink = rgbText(o.ink);
  const cache = new Map<string, unknown>();
  const assign = (prop: StyleProp, value: string | number): void => {
    if (cache.has(prop) && cache.get(prop) === value) return;
    (ctx as unknown as Record<string, string | number>)[prop] = value;
    cache.set(prop, value);
  };
  const dash = (segments: readonly number[]): void => {
    const key = segments.join(",");
    if (cache.has("lineDash") && cache.get("lineDash") === key) return;
    ctx.setLineDash([...segments]);
    cache.set("lineDash", key);
  };

  const E: DlRecord[] = [], A: DlRecord[] = [], N: DlRecord[] = [], T: DlRecord[] = [];
  for (const r of source.records) {
    if (r[0] === "E") E.push(r); else if (r[0] === "A") A.push(r); else if (r[0] === "N") N.push(r); else T.push(r);
  }
  const num = (r: DlRecord, i: number): number => (r[i] as number) / 1000;
  const route = (r: DlRecord): void => {
    ctx.beginPath();
    ctx.moveTo(num(r, 4), num(r, 5));
    if (r[3] === 0) ctx.lineTo(num(r, 6), num(r, 7));
    else if (r[3] === 1) ctx.quadraticCurveTo(num(r, 6), num(r, 7), num(r, 8), num(r, 9));
    else ctx.bezierCurveTo(num(r, 6), num(r, 7), num(r, 8), num(r, 9), num(r, 10), num(r, 11));
  };
  const hook = (pid: number, layer: number): void => { if (o.onElement !== undefined) o.onElement(pid, layer); };
  const edgeLayer = (layer: number, mask: number, width: number, alpha: number, dashes: readonly number[]): void => {
    for (const r of E) {
      if (mask !== 0 && ((r[2] as number) & mask) === 0) continue;
      hook(r[1], layer);
      assign("strokeStyle", ink); assign("lineWidth", width); assign("globalAlpha", alpha); dash(dashes);
      route(r);
      ctx.stroke();
    }
  };
  const ringLayer = (layer: number, mask: number, slot: "ring-sel" | "ring-foc"): void => {
    const s = THEME.slots[slot];
    for (const r of N) {
      if (((r[3] as number) & mask) === 0) continue;
      hook(r[1], layer);
      assign("strokeStyle", ink); assign("lineWidth", s.width!); assign("globalAlpha", s.alpha); dash(s.dash!);
      ctx.beginPath();
      ctx.arc(num(r, 4), num(r, 5), s.radius!, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };

  // prologue (always)
  ctx.setTransform(o.dprMilli / 1000, 0, 0, o.dprMilli / 1000, 0, 0);
  ctx.clearRect(0, 0, source.width, source.height);

  for (const layer of o.layers) {
    switch (layer) {
      case 1: { const s = THEME.slots["halo-sel"]; edgeLayer(1, 1, s.width!, s.alpha, s.dash!); break; }
      case 2: { const s = THEME.slots["halo-foc"]; edgeLayer(2, 2, s.width!, s.alpha, s.dash!); break; }
      case 3: { const s = THEME.slots["line"]; edgeLayer(3, 0, s.width!, s.alpha, s.dash!); break; }
      case 4:
        for (const r of A) {
          hook(r[1], 4);
          assign("fillStyle", ink); assign("globalAlpha", THEME.slots["arrow"].alpha);
          ctx.beginPath();
          ctx.moveTo(num(r, 2), num(r, 3));
          ctx.lineTo(num(r, 4), num(r, 5));
          ctx.lineTo(num(r, 6), num(r, 7));
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 5: ringLayer(5, 1, "ring-sel"); break;
      case 6: ringLayer(6, 2, "ring-foc"); break;
      case 7: {
        const s = THEME.slots["disc"];
        for (const r of N) {
          hook(r[1], 7);
          assign("fillStyle", rgbText(PALETTE[r[2] as number]!)); assign("globalAlpha", s.alpha);
          ctx.beginPath();
          ctx.arc(num(r, 4), num(r, 5), s.radius!, 0, 2 * Math.PI);
          ctx.fill();
          assign("strokeStyle", rgbText(THEME.white)); assign("lineWidth", s.width!); assign("globalAlpha", s.alpha); dash(s.dash!);
          ctx.stroke();
        }
        break;
      }
      case 8: {
        if (T.length === 0) break;
        assign("fillStyle", ink); assign("globalAlpha", THEME.slots["label"].alpha);
        assign("font", THEME.font); assign("textAlign", THEME.textAlign); assign("textBaseline", THEME.textBaseline); assign("direction", THEME.direction);
        for (const r of T) {
          hook(r[1], 8);
          ctx.fillText(r[5] as string, num(r, 3), num(r, 4));
        }
        break;
      }
    }
  }
}
