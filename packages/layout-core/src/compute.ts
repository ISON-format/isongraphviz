import { snapshotBytes } from "isongraph-visualize-scene-core/primitives";
import { bindLayout } from "./bind.js";
import { LayoutError } from "./errors.js";
import { produceForce, resolveBudget } from "./force.js";
import { validatePolicy } from "./policy.js";
import type { ForceOptions, LayoutResult, Policy } from "./types.js";

const budgetOf = (o: ForceOptions | undefined) => resolveBudget(o === undefined || o === null ? undefined : o.budget);

/** Generic entry for families that are a function of (scene, policy): FORCE. FIXED needs positions (computeFixedLayout). */
export async function computeLayout(sceneBytes: Uint8Array, policy: Policy, options?: ForceOptions): Promise<LayoutResult> {
  const input = snapshotBytes(sceneBytes);
  const p = validatePolicy(policy); // owned copy, unqualified families -> UNSUPPORTED_FAMILY
  const budget = budgetOf(options);
  if (p.family === "FIXED") throw new LayoutError("INVALID_POLICY", "INPUT_REQUIRED", "policy.family", "FIXED needs explicit positions: use computeFixedLayout");
  return produceForce(input, p, budget);
}

/** Explicit recomputation (docs/specs/IGL-1.md §6.3): binds, recomputes with the artifact's own policy, compares bytes. */
export async function verifyReproducible(sceneBytes: Uint8Array, layoutBytes: Uint8Array, options?: ForceOptions): Promise<"reproduced" | "not-recomputable"> {
  const s = snapshotBytes(sceneBytes);
  const l = snapshotBytes(layoutBytes);
  const budget = budgetOf(options);
  const bound = await bindLayout(s, l);
  if (bound.layout.policy.family !== "FORCE") return "not-recomputable";
  const again = await produceForce(s, validatePolicy(bound.layout.policy), budget);
  if (again.layoutBytes.length !== l.length || again.layoutBytes.some((b, i) => b !== l[i])) throw new LayoutError("INVALID_LAYOUT", "NOT_REPRODUCED");
  return "reproduced";
}
