// src/manifest.ts - glManifest (design 6.5, 7.8). The manifest depends on `dl.labels` and `dl.edgeLabels` only (and on the host and the capacity).
import { IgrError, verifyManifest } from "isongraph-visualize-renderer-core";
import type { CapabilityManifest, CapabilityStatus } from "isongraph-visualize-renderer-core";
import { resolveRendererOptions, type Host, type ResolvedWebglOptions, type WebglRendererOptions } from "./options.js";

const SUPPORTED: CapabilityStatus = { status: "supported" };
const NOT_IMPL: CapabilityStatus = { status: "unsupported", reason: "NOT_IMPLEMENTED" };
const HOST_LACKS: CapabilityStatus = { status: "unsupported", reason: "HOST_LACKS" };

export function buildManifest(host: Host, r: ResolvedWebglOptions): CapabilityManifest {
  const edgeOff = r.dl.labels === false || r.dl.edgeLabels === false;
  const labelsEdge: CapabilityStatus = edgeOff ? { status: "degraded", degradations: ["EDGE_LABELS_OMITTED"] } : SUPPORTED;
  // a headless renderer produces and checks the plan; no GPU is exercised, so the manifest says so (7.8)
  const gpu: CapabilityStatus = host === "dom" ? SUPPORTED : HOST_LACKS;
  return verifyManifest({
    igr: "IGR/1", renderer: { name: r.name, version: r.version, host },
    capabilities: {
      "scene.load": SUPPORTED, viewport: SUPPORTED, "hit-test": SUPPORTED, selection: SUPPORTED, focus: SUPPORTED, visibility: SUPPORTED,
      labels: { status: "degraded", degradations: ["LABELS_ELIDED"] }, "direction-cue": SUPPORTED, "indicators.non-color": SUPPORTED,
      "a11y.model": SUPPORTED, "state.report": SUPPORTED, lifecycle: SUPPORTED,
      "export.scene": SUPPORTED, "export.svg": NOT_IMPL, "export.png": NOT_IMPL,
      // a canvas has no per-element DOM and no companion DOM yet (8.4, CCR-3): the manifest says what is true
      "a11y.native-dom": NOT_IMPL, "a11y.companion-dom": NOT_IMPL,
      "labels.edge": labelsEdge, "motion.animated": NOT_IMPL, "scene.apply-delta": { status: "unsupported", reason: "RESERVED" },
      // honest extras (27 8.1: optional)
      "x-dl.display-list": SUPPORTED, "x-dl.pick-drawn": SUPPORTED, "x-render.per-element-dom": NOT_IMPL, "x-render.host-text": SUPPORTED,
      "x-gl.context-recovery": gpu, "x-gl.executes": gpu,
    },
    capacity: r.capacity,
  });
}

/** The capability manifest for a host and options (7.8): `createWebglRenderer(o).manifest` equals `glManifest("headless", o)` byte for byte. */
export function glManifest(host: Host, options?: WebglRendererOptions): CapabilityManifest {
  if (host !== "headless" && host !== "dom") throw new IgrError("INVALID_INPUT", "SCHEMA", "host", "headless or dom expected");
  return buildManifest(host, resolveRendererOptions(host, options));
}
