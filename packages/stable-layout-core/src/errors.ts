// 28-STABLE-LAYOUT-DESIGN.md section 14. A different class from LayoutError: callers distinguish by instanceof, never by the strings.
export type StableErrorCode =
  | "INVALID_REQUEST" | "INVALID_PREVIOUS" | "INVALID_NEXT" | "RESOURCE_LIMIT" | "PLACEMENT_FAILED" | "INVALID_REPORT" | "INTERNAL";

export class StableLayoutError extends Error {
  readonly code: StableErrorCode;
  readonly reason: string | undefined;
  readonly path: string | undefined;
  readonly detail: string | undefined;
  constructor(code: StableErrorCode, reason?: string, path?: string, detail?: string) {
    super([code, reason, path, detail].filter((x): x is string => x !== undefined).join(" | "));
    this.name = "StableLayoutError";
    this.code = code;
    this.reason = reason;
    this.path = path;
    this.detail = detail;
  }
}
