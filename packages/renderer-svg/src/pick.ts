// src/pick.ts - pickElement: the pointer-to-element rule of design 9.3 (target id first, nodes win over an edge target, hitTest as the fallback).
import { IgrError, effectiveVisibility, hitTest, isRenderModel, lookupElement, serializeState } from "isongraph-visualize-renderer-core";
import type { ElementAddress, ModelEdge, ModelNode, RenderModel, SemanticState } from "isongraph-visualize-renderer-core";
import { checkPrefix, decodeElementId } from "./ids.js";

const bad = (reason: string, path: string, detail?: string): IgrError => new IgrError("INVALID_INPUT", reason, path, detail);
const COORD_MAX = 2 ** 31;

function readPoint(p: unknown): { x: number; y: number } {
  if (typeof p !== "object" || p === null || Array.isArray(p)) throw bad("SCHEMA", "input.point", "object expected");
  const own = Object.keys(p);
  if (own.length !== 2 || !own.includes("x") || !own.includes("y")) throw bad("SCHEMA", "input.point", "exactly the members x and y");
  const out = { x: 0, y: 0 };
  for (const k of ["x", "y"] as const) {
    const v: unknown = (p as Record<string, unknown>)[k];
    if (typeof v !== "number") throw bad("SCHEMA", `input.point.${k}`, "number expected");
    if (!Number.isFinite(v)) throw bad("NOT_FINITE", `input.point.${k}`);
    if (Math.abs(v) > COORD_MAX) throw bad("OUT_OF_RANGE", `input.point.${k}`);
    out[k] = v;
  }
  return out;
}

/** 9.3. Validation order: model, state, prefix, input shape, targetId type, point (checked even when the id alone would decide). */
export function pickElement(model: RenderModel, state: SemanticState, idPrefix: string, input: { targetId?: string; point?: { x: number; y: number } }): ElementAddress | undefined {
  if (!isRenderModel(model)) throw bad("NOT_A_RENDER_MODEL", "model");
  serializeState(model, state);
  checkPrefix(idPrefix);
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw bad("SCHEMA", "input", "object expected");
  const proto: unknown = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) throw bad("SCHEMA", "input", "plain object expected");
  let targetId: unknown, rawPoint: unknown;
  for (const k of Object.keys(input)) {
    const v: unknown = (input as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (k === "targetId") targetId = v;
    else if (k === "point") rawPoint = v;
    else throw bad("SCHEMA", `input.${k}`, "unknown member");
  }
  if (targetId !== undefined && typeof targetId !== "string") throw bad("SCHEMA", "input.targetId", "string expected");
  const point = rawPoint === undefined ? undefined : readPoint(rawPoint);

  if (targetId !== undefined) {
    const a = decodeElementId(idPrefix, targetId);
    if (a !== undefined) {
      const isNode = "node" in a;
      const el = lookupElement(model, isNode ? a.node : a.edge);
      if (el !== undefined) {
        const vis = effectiveVisibility(model, state);
        const visible = isNode ? vis.nodes[(el as ModelNode).index] : vis.edges[(el as ModelEdge).index];
        if (visible) {
          if (isNode) return a;
          if (point !== undefined) {
            const h = hitTest(model, state, point);
            if (h !== undefined && "node" in h) return h;
          }
          return a;
        }
      }
    }
  }
  return point === undefined ? undefined : hitTest(model, state, point);
}
