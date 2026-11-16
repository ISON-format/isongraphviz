// packages/scene-core/src/types.ts
export type NodeId = { kind: "int"; value: bigint } | { kind: "str"; value: string };
export interface NodeRef { type: string; id: NodeId }
export interface EdgeAddress { src: NodeRef; rel: string; tgt: NodeRef; ord: string }

export interface WireNodeRef { id: string; type: string }
export interface WireEdgeAddress { ord: string; rel: string; src: WireNodeRef; tgt: WireNodeRef }

export interface SceneNode { category: string; label: string; ref: WireNodeRef }
export interface SceneEdge { label: string; ref: WireEdgeAddress }
export interface Scene {
  address_scheme: "igs-addr/1";
  edges: SceneEdge[];
  graph: { directed: boolean; profile: "simple" };
  igs: "IGS/1";
  nodes: SceneNode[];
  source: { artifact_sha256: string; serialization_profile: "ison-v1" };
}

export interface LogicalEdge { src: NodeRef; rel: string; tgt: NodeRef }
export interface SceneModel { directed: boolean; nodes: NodeRef[]; edges: LogicalEdge[] }

export interface SceneCompilation {
  scene: Scene;
  sceneBytes: Uint8Array;
  sceneSha256: string;
  artifactSha256: string;
}

export interface ObjectRef { artifact_sha256: string; address: WireNodeRef | WireEdgeAddress }
export interface ResolvedIdentity { kind: "node" | "edge"; address: WireNodeRef | WireEdgeAddress; artifact_sha256: string }
