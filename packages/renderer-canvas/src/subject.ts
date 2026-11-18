// src/subject.ts - the conformance subject (design 6.6, 10): `create` returns an uninitialized renderer; `witness` reads the stream the renderer
// actually produces, never probe().
import { IgrError } from "isongraph-visualize-renderer-core";
import type { ConformanceSubject, Renderer, WitnessReport } from "isongraph-visualize-renderer-core";
import { canvasStreamWitness } from "isongraph-visualize-display-list/canvas2d";
import { canvasManifest } from "./manifest.js";
import type { CanvasRendererOptions } from "./options.js";
import { createCanvasRenderer } from "./renderer.js";

export function createCanvasSubject(options?: CanvasRendererOptions): ConformanceSubject {
  const manifest = canvasManifest("headless", options);
  return {
    manifest,
    create: async () => createCanvasRenderer(options),
    witness: async (r: Renderer): Promise<WitnessReport> => {
      const calls = (r as { canvasCalls?: unknown }).canvasCalls, list = (r as { displayList?: unknown }).displayList;
      if (typeof calls !== "function" || typeof list !== "function") throw new IgrError("INVALID_INPUT", "SCHEMA", "renderer", "a renderer with canvasCalls() and displayList() expected");
      return canvasStreamWitness((calls as () => Uint8Array).call(r), (list as () => Parameters<typeof canvasStreamWitness>[1]).call(r)) as WitnessReport;
    },
  };
}
