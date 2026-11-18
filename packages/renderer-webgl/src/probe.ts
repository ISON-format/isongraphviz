// src/probe.ts - capability detection (design 7.7): `probeWebgl` is pure over an injected factory, so Node can test it. It asks for fresh canvases (one per
// context type), checks the context in a fixed order and stops at the first failure, releases every GL context it obtained on every path, and never reads
// an unmasked vendor or renderer or any extension but WEBGL_lose_context (11.6).
import { releaseGlContext } from "./execute.js";
import type { Gl2Like, GlCanvasLike } from "./gl.js";

export type ProbeReason = "NO_FACTORY" | "PROBE_ERROR" | "NO_CONTEXT" | "PERFORMANCE_CAVEAT" | "NO_HIGHP" | "TOO_FEW_ATTRIBS" | "TOO_SMALL" | "NO_2D_LAYER";
export type WebglProbe =
  | { available: true; limits: { maxViewportDims: [number, number] } }
  | { available: false; reason: ProbeReason };

/** The context attributes of every WebGL context this package creates (7.7): constants, except the one closed boolean option. */
export function contextAttributes(failIfMajorPerformanceCaveat: boolean): Record<string, boolean | string> {
  return {
    alpha: true, antialias: true, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "default",
    failIfMajorPerformanceCaveat,
  };
}

const no = (reason: ProbeReason): WebglProbe => ({ available: false, reason });

/**
 * probeWebgl(factory, need?, options?) (7.7). `factory()` returns a fresh canvas-like each call or `undefined`; `need` is the backing size the adapter plans
 * (default 1 x 1); `options.failIfMajorPerformanceCaveat` (default true) is the closed option the adapter also passes to its own `getContext`. Steps, first
 * match wins, the whole probe inside a `try` (any throw is `PROBE_ERROR`).
 */
export function probeWebgl(factory: (() => GlCanvasLike | undefined) | unknown, need?: { widthPx?: number; heightPx?: number }, options?: { failIfMajorPerformanceCaveat?: boolean }): WebglProbe {
  const contexts: Gl2Like[] = [];
  try {
    if (typeof factory !== "function") return no("NO_FACTORY");
    const make = factory as () => GlCanvasLike | undefined;
    // the arguments are checked before any call is made: `need` is a pair of positive integers, the option a boolean (7.7: closed); a bad one is PROBE_ERROR (audit M-16)
    for (const k of ["widthPx", "heightPx"] as const) {
      const v = need?.[k];
      if (v !== undefined && !(typeof v === "number" && Number.isInteger(v) && v >= 1)) throw new TypeError(`need.${k}`);
    }
    const opt = options?.failIfMajorPerformanceCaveat;
    if (opt !== undefined && typeof opt !== "boolean") throw new TypeError("failIfMajorPerformanceCaveat");
    const caveat = opt ?? true;
    const a = make();
    if (a === undefined) return no("NO_FACTORY");
    let gl = a.getContext("webgl2", contextAttributes(caveat)) as Gl2Like | null | undefined;
    if (gl === null || gl === undefined) {
      if (!caveat) return no("NO_CONTEXT");
      const b = make();
      if (b === undefined) return no("NO_FACTORY");
      const relaxed = b.getContext("webgl2", contextAttributes(false)) as Gl2Like | null | undefined;
      if (relaxed === null || relaxed === undefined) return no("NO_CONTEXT");
      contexts.push(relaxed);
      return no("PERFORMANCE_CAVEAT");
    }
    contexts.push(gl);
    if (gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT)!.precision < 23) return no("NO_HIGHP");
    if (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)!.precision < 23) return no("NO_HIGHP");
    if ((gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number) < 4) return no("TOO_FEW_ATTRIBS");
    const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as ArrayLike<number>;
    const mx = Number(dims[0]), my = Number(dims[1]);
    if (mx < (need?.widthPx ?? 1) || my < (need?.heightPx ?? 1)) return no("TOO_SMALL");
    releaseAll(contexts);
    const c = make();
    if (c === undefined) return no("NO_FACTORY");
    if (c.getContext("2d") === null) return no("NO_2D_LAYER");
    return { available: true, limits: { maxViewportDims: [mx, my] } };
  } catch {
    return no("PROBE_ERROR");
  } finally {
    releaseAll(contexts);
  }
}

/** Releases every context the probe obtained, once (a context already released is not released again); a failing release never changes the verdict. */
function releaseAll(contexts: Gl2Like[]): void {
  while (contexts.length > 0) {
    const gl = contexts.pop()!;
    try { releaseGlContext(gl); } catch { /* the verdict stands */ }
  }
}
