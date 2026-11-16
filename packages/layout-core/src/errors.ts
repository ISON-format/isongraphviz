// src/errors.ts
export type LayoutErrorCode =
  | "INVALID_LAYOUT" | "INVALID_COORDINATE" | "INVALID_POLICY" | "UNSUPPORTED_FAMILY"
  | "UNSUPPORTED_SCENE" | "RESOURCE_LIMIT" | "SCENE_MISMATCH" | "INCOMPLETE_LAYOUT";

export class LayoutError extends Error {
  readonly code: LayoutErrorCode;
  readonly reason: string | undefined;
  readonly path: string | undefined;
  constructor(code: LayoutErrorCode, reason?: string, path?: string, detail?: string) {
    super([code, reason, path, detail].filter((x): x is string => x !== undefined).join(" | "));
    this.name = "LayoutError";
    this.code = code;
    this.reason = reason;
    this.path = path;
  }
}
export { HashUnavailableError, IgsError } from "isongraph-visualize-scene-core";
