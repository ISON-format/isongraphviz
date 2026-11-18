// src/manifest.ts - the composed capability manifest (design 13.1): describes the WIDGET (renderer + binder + companion + export functions) with seven closed
// `x-ia.*` capability ids. The frozen renderers keep declaring `a11y.companion-dom`, `export.svg` and `export.png` unsupported; that stays true of the renderer.
import { verifyManifest, type CapabilityManifest, type CapabilityStatus } from "isongraph-visualize-renderer-core";
import { IaError } from "isongraph-visualize-interaction-core";
import { plainEntries } from "./util.js";

export interface ManifestFlags { input?: boolean; "keyboard-nav"?: boolean; lasso?: boolean; companion?: boolean; "export-svg"?: boolean; "export-png"?: boolean; headless?: boolean }
const FLAGS = ["input", "keyboard-nav", "lasso", "companion", "export-svg", "export-png", "headless"] as const;

/**
 * A copy of the verified `base` with each of the seven `x-ia.*` ids added: `supported` when its flag is true, else `unsupported/NOT_IMPLEMENTED`; with `companion`
 * true, `a11y.companion-dom` is also `supported`. Order: the base is verified first (errors propagate), then each flag (INVALID_CONFIG/SCHEMA), then the rule
 * that a headless host has no DOM to host a companion (INVALID_CONFIG/INVALID_VALUE). The result passes verifyManifest.
 */
export function composeManifest(base: CapabilityManifest, flags: ManifestFlags): CapabilityManifest {
  const b = verifyManifest(base);
  const f = plainEntries(flags);
  if (f === undefined) throw new IaError("INVALID_CONFIG", "SCHEMA", "flags", "a plain object expected");
  for (const [k, v] of f) {
    if (!(FLAGS as readonly string[]).includes(k)) throw new IaError("INVALID_CONFIG", "SCHEMA", `flags.${k}`, "unknown flag");
    if (typeof v !== "boolean") throw new IaError("INVALID_CONFIG", "SCHEMA", `flags.${k}`, "boolean expected");
  }
  const on = (k: string): boolean => f.get(k) === true;
  if (on("companion") && b.renderer.host === "headless") throw new IaError("INVALID_CONFIG", "INVALID_VALUE", "flags.companion", "a headless host has no DOM to host a companion");
  const caps: Record<string, CapabilityStatus> = {};
  for (const k of Object.keys(b.capabilities)) caps[k] = b.capabilities[k as keyof typeof b.capabilities];
  for (const flag of FLAGS) caps[`x-ia.${flag}`] = on(flag) ? { status: "supported" } : { status: "unsupported", reason: "NOT_IMPLEMENTED" };
  if (on("companion")) caps["a11y.companion-dom"] = { status: "supported" };
  return verifyManifest({ capabilities: caps, capacity: { ...b.capacity }, igr: b.igr, renderer: { ...b.renderer } });
}
