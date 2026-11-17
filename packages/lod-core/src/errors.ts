// src/errors.ts — the structured error of design 29 section 13.
export type LODErrorCode =
  | "INVALID_LOD" | "INVALID_GROUP" | "INVALID_POLICY" | "UNSUPPORTED_RULE" | "STATE_MISMATCH"
  | "UNRESOLVED_NODE" | "NOT_IN_VIEW" | "RESOURCE_LIMIT" | "INTERNAL";

export class LODError extends Error {
  readonly code: LODErrorCode;
  readonly reason: string | undefined;
  readonly path: string | undefined;
  readonly detail: string | undefined;
  constructor(code: LODErrorCode, reason?: string, path?: string, detail?: string) {
    super([code, reason, path, detail].filter((x): x is string => x !== undefined).join(" | "));
    this.name = "LODError";
    this.code = code;
    this.reason = reason;
    this.path = path;
    this.detail = detail;
  }
}

export { HashUnavailableError, IgsError } from "isongraph-visualize-scene-core";
export { LayoutError } from "isongraph-visualize-layout-core";
