import { LayoutError } from "./errors.js";
import { layoutToBytes } from "./serialize.js";
import type { Layout, LayoutNode, LayoutResult, Policy } from "./types.js";
import { verifyLayout } from "./verify.js";

/** Assembles, serializes, and RE-VERIFIES the producer's own output (it must satisfy the verifier it will meet). */
export async function finalize(sceneSha256: string, policy: Policy, nodes: LayoutNode[]): Promise<LayoutResult> {
  const layout: Layout = { address_scheme: "igs-addr/1", igl: "IGL/1", nodes, policy, scale: 1000, scene_sha256: sceneSha256 };
  const layoutBytes = layoutToBytes(layout);
  const { layoutSha256 } = await verifyLayout(layoutBytes);
  const reparsed = JSON.parse(new TextDecoder().decode(layoutBytes)) as Layout;
  if (!reparsed) throw new LayoutError("INVALID_LAYOUT", "SCHEMA");
  return { layout: reparsed, layoutBytes, layoutSha256, sceneSha256 };
}
