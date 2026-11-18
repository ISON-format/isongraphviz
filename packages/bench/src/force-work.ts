// src/force-work.ts - the FORCE work estimate of the layout-core source (docs/specs/IGL-1.md 7.3), re-implemented here because layout-core does not export it.
// Per iteration (n >= 2): n(n-1)/2 pair interactions + 3 per physical edge + 8 per node + 4; plus 200 per node and physical edge for construction.
// A test checks this copy against the producer's own refusal boundary.
export function forceWork(nodes: number, physicalEdges: number, iterations: number): bigint {
  const n = BigInt(nodes), e = BigInt(physicalEdges);
  const per = n < 2n ? 0n : (n * (n - 1n)) / 2n + 3n * e + 8n * n + 4n;
  return BigInt(iterations) * per + 200n * (n + e);
}
