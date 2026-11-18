// src/control.ts - the context controller (design 7.6): a reducer over the closed table phase x event -> phase', GL calls and callbacks, driven through the
// structural canvas and context types. A loss is never a semantic event; nothing here touches a model, a state or a report. The controller sets no timer: a
// context that is lost and never restored stays `lost` and the host learns it through `onStatus`/`status()` (R-18).
import { IgrError } from "isongraph-visualize-renderer-core";
import { createGlResources, deleteGlResources, executePlan, releaseGlContext, type GlResources } from "./execute.js";
import type { Gl2Like, GlCanvasLike, GlEventLike } from "./gl.js";
import type { GlPlan } from "./plan.js";
import { ownData } from "./own.js";
import { contextAttributes, probeWebgl } from "./probe.js";

export interface GlStatus {
  phase: "created" | "ready" | "lost" | "failed" | "disposed";
  contextLost: boolean;
  failure?: string;
  attributes: { failIfMajorPerformanceCaveat: boolean };
}
/** The label layer the controller clears on a loss and redraws after a frame (7.6 (2)): the adapter's 2D canvas, or a double in tests. */
export interface GlLabelLayer { clear(): void; draw(plan: GlPlan): void }
export interface GlControllerOptions {
  onStatus?: (status: GlStatus) => void;
  onError?: (error: IgrError) => void;
  /** The one closed attribute option (7.7, 11.2): a boolean, default true; recorded in `status().attributes`. */
  contextAttributes?: { failIfMajorPerformanceCaveat?: boolean };
  labels?: GlLabelLayer;
  /** Probe on detached scratch canvases before the live context is requested (7.7); a refusal rejects `initialize` with the reason token. */
  probe?: { factory: () => GlCanvasLike | undefined; need?: { widthPx?: number; heightPx?: number } };
  /** A check of the live context before anything is built (the adapter's drawing-buffer size test, 7.9): a closed failure token refuses the initialize. */
  verify?: (gl: Gl2Like) => string | undefined;
  /** The drawing-buffer size of a frame (default: the plan header's `w`, `h`, the backing size at `dprMilli` 1000) and the executor's `ink`. */
  frameSize?: (plan: GlPlan) => { widthPx: number; heightPx: number };
  ink?: readonly [number, number, number];
}
export interface GlController {
  /** `init` (7.6): probe (if configured), request the context, add the listeners once, create the resources, draw the retained plan; rejects by throwing an IgrError. */
  initialize(): void;
  /** `C`: a new plan; it is retained in every phase but `disposed` and drawn only when `ready`. */
  commit(plan: GlPlan): void;
  /** `F`: render the retained plan; resolves (returns) in every phase and never throws for a lost or failed context. */
  render(): void;
  /** `D`: release everything per phase and remove the listeners. */
  dispose(): void;
  status(): GlStatus;
}

const token = (e: unknown): string => (e instanceof IgrError && e.detail !== undefined ? e.detail.split(":")[0]! : "REPLAY_ERROR");
const asIgr = (e: unknown): IgrError => (e instanceof IgrError ? e : new IgrError("INVALID_INPUT", "INVALID_VALUE", "gl", "REPLAY_ERROR"));

function resolveCaveat(o: GlControllerOptions["contextAttributes"]): boolean {
  if (o === undefined) return true;
  const ca = ownData(o, "options.contextAttributes");
  for (const k of Object.keys(ca)) if (ca[k] !== undefined && k !== "failIfMajorPerformanceCaveat") throw new IgrError("INVALID_INPUT", "SCHEMA", `options.contextAttributes.${k}`, "unknown attribute");
  const v = ca["failIfMajorPerformanceCaveat"];
  if (v === undefined) return true;
  if (typeof v !== "boolean") throw new IgrError("INVALID_INPUT", "SCHEMA", "options.contextAttributes.failIfMajorPerformanceCaveat", "boolean expected");
  return v;
}

export function createGlController(canvas: GlCanvasLike, options: GlControllerOptions = {}): GlController {
  const caveat = resolveCaveat(options.contextAttributes);
  const ink = options.ink ?? ([34, 34, 34] as const);
  let phase: GlStatus["phase"] = "created";
  let failure: string | undefined;
  let gl: Gl2Like | undefined;
  let resources: GlResources | undefined;
  let plan: GlPlan | undefined;
  let listening = false;

  const status = (): GlStatus => ({ phase, contextLost: gl !== undefined && gl.isContextLost(), ...(failure === undefined ? {} : { failure }), attributes: { failIfMajorPerformanceCaveat: caveat } });
  const notify = (): void => { options.onStatus?.(status()); };
  /** One frame of the retained plan, then the text layer (7.6: "the frame, then labels.draw"); no plan, no frame and no label drawing. */
  const draw = (): void => {
    if (plan === undefined || gl === undefined || resources === undefined) return;
    try {
      const size = options.frameSize?.(plan) ?? { widthPx: plan.header.w, heightPx: plan.header.h };
      executePlan(gl, plan, resources, { widthPx: size.widthPx, heightPx: size.heightPx, ink });
      options.labels?.draw(plan);
    } catch (e) { throw asIgr(e); } // a failing frame or label layer is an IgrError with the closed token REPLAY_ERROR (audit M-5)
  };
  /** The first frame of a creation failed: the objects just created are deleted (the context is usable) so that a second attempt never leaks them. */
  const discard = (): void => {
    if (gl !== undefined && resources !== undefined && !gl.isContextLost()) { try { deleteGlResources(gl, resources); } catch { /* nothing more to delete */ } }
    resources = undefined;
  };
  /** Creation (7.5): "ok", "lost" (the context was lost during the rebuild: nothing is valid) or the error of a failed compile or link. */
  const create = (): { result: "ok" } | { result: "lost" } | { result: "failed"; error: IgrError } => {
    try { resources = createGlResources(gl!); return { result: "ok" }; }
    catch (e) {
      resources = undefined;
      if (e instanceof IgrError && e.detail?.startsWith("CONTEXT_LOST") === true) return { result: "lost" };
      return { result: "failed", error: asIgr(e) };
    }
  };
  const lost = (): boolean => gl !== undefined && gl.isContextLost();

  const onLost = (event: GlEventLike): void => {
    if (phase === "created" || phase === "disposed") return;
    event.preventDefault();
    if (phase === "lost") return; // a double loss: no status change
    const was = phase;
    resources = undefined; // the handles are invalid: nothing is deleted
    if (was === "ready") options.labels?.clear();
    failure = undefined;
    phase = "lost";
    notify();
  };

  const onRestored = (): void => {
    if (phase !== "lost" && phase !== "failed") return; // a restore without a loss is ignored
    const was = phase;
    try {
      const c = create();
      if (c.result === "ok") {
        try { draw(); }
        catch (e) {
          const err = asIgr(e);
          discard();
          failure = token(err);
          options.onError?.(err);
          phase = "failed";
          if (was !== "failed") notify();
          return;
        }
        failure = undefined;
        phase = "ready";
        notify();
      } else if (c.result === "failed") {
        failure = token(c.error);
        options.onError?.(c.error);
        phase = "failed";
        if (was !== "failed") notify();
      } else if (was === "failed") {
        failure = undefined;
        phase = "lost";
        notify();
      }
    } catch (e) {
      options.onError?.(asIgr(e));
    }
  };

  return {
    initialize(): void {
      if (phase !== "created") return; // the renderer's lifecycle answers ALREADY_INITIALIZED; the controller does nothing
      if (options.probe !== undefined) {
        const p = probeWebgl(options.probe.factory, options.probe.need, { failIfMajorPerformanceCaveat: caveat });
        if (!p.available) {
          failure = p.reason;
          throw new IgrError("INVALID_INPUT", "INVALID_VALUE", "gl", p.reason);
        }
      }
      const ctx = canvas.getContext("webgl2", contextAttributes(caveat)) as Gl2Like | null | undefined;
      if (ctx === null || ctx === undefined) {
        failure = "NO_CONTEXT";
        const err = new IgrError("INVALID_INPUT", "INVALID_VALUE", "gl", "NO_CONTEXT");
        options.onError?.(err);
        throw err;
      }
      gl = ctx;
      const refused = options.verify?.(ctx);
      if (refused !== undefined) {
        failure = refused;
        throw new IgrError("INVALID_INPUT", "INVALID_VALUE", "gl", refused);
      }
      if (!listening) {
        canvas.addEventListener("webglcontextlost", onLost);
        canvas.addEventListener("webglcontextrestored", onRestored);
        listening = true;
      }
      const c = create();
      if (c.result !== "ok") {
        const err = c.result === "failed" ? c.error : new IgrError("INVALID_INPUT", "INVALID_VALUE", "gl", "CONTEXT_LOST");
        failure = token(err);
        options.onError?.(err);
        throw err;
      }
      try { draw(); }
      catch (e) {
        const err = asIgr(e);
        discard();
        failure = token(err);
        options.onError?.(err);
        throw err;
      }
      failure = undefined;
      phase = "ready";
      notify();
    },
    commit(next: GlPlan): void {
      if (phase === "disposed") return;
      plan = next;
      if (phase === "ready") draw();
    },
    render(): void {
      if (phase === "ready") draw();
    },
    dispose(): void {
      if (phase === "disposed") return;
      if (phase === "ready") {
        deleteGlResources(gl!, resources!);
        releaseGlContext(gl!);
      } else if ((phase === "failed" || phase === "created") && gl !== undefined && !lost()) releaseGlContext(gl);
      if (listening) {
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        listening = false;
      }
      resources = undefined; plan = undefined; failure = undefined;
      phase = "disposed";
      notify();
    },
    status,
  };
}
