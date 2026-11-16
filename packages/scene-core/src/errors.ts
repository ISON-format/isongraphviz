// packages/scene-core/src/errors.ts
export type ErrorCode =
  | "MALFORMED_SOURCE"
  | "UNSUPPORTED_SERIALIZATION_PROFILE"
  | "UNSUPPORTED_GRAPH_PROFILE"
  | "INVALID_NODE_ID"
  | "INEXACT_NODE_ID"
  | "DUPLICATE_NODE"
  | "DUPLICATE_EDGE"
  | "ID_TWIN"
  | "INVALID_EDGE_ENDPOINT"
  | "UNDIRECTED_EDGE_CONFLICT"
  | "INVALID_SCENE"
  | "UNSUPPORTED_EXTENSION"
  | "UNRESOLVED_ADDRESS"
  | "SOURCE_MISMATCH";

export class IgsError extends Error {
  readonly code: ErrorCode;
  readonly reason: string | undefined;
  readonly path: string | undefined;
  constructor(code: ErrorCode, reason?: string, path?: string, detail?: string) {
    super([code, reason, path, detail].filter((x): x is string => x !== undefined).join(" | "));
    this.name = "IgsError";
    this.code = code;
    this.reason = reason;
    this.path = path;
  }
}

/** An environment failure, not a scene error: no WebCrypto SHA-256 is available (for example an insecure browser context). */
export class HashUnavailableError extends Error {
  constructor() {
    super("No WebCrypto SHA-256 is available in this environment (browsers require a secure context)");
    this.name = "HashUnavailableError";
  }
}
