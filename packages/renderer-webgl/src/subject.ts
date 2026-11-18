// src/subject.ts - the conformance subject (design 7.8, 10): `create` returns an uninitialized renderer; `witness` reads the plan the renderer actually
// produces (glWitness over `plan()`), never probe().
import { IgrError } from "isongraph-visualize-renderer-core";
import type { ConformanceSubject, Renderer, WitnessReport } from "isongraph-visualize-renderer-core";
import { glManifest } from "./manifest.js";
import type { WebglRendererOptions } from "./options.js";
import type { GlPlan } from "./plan.js";
import { glWitness } from "./readout.js";
import { createWebglRenderer } from "./renderer.js";

export function createWebglSubject(options?: WebglRendererOptions): ConformanceSubject {
  const manifest = glManifest("headless", options);
  return {
    manifest,
    create: async () => createWebglRenderer(options),
    witness: async (r: Renderer): Promise<WitnessReport> => {
      const plan = (r as { plan?: unknown }).plan;
      if (typeof plan !== "function") throw new IgrError("INVALID_INPUT", "SCHEMA", "renderer", "a renderer with plan() expected");
      return glWitness((plan as () => GlPlan).call(r)) as WitnessReport;
    },
  };
}
