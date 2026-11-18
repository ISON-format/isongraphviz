// src/errors.ts - IaError, the structured error of the V11 packages (design 14.2), parallel to IgrError: {code, reason?, path?, detail?}.
// Errors of the committed packages (IgrError, IgsError, LayoutError, HashUnavailableError) propagate unchanged and are never re-wrapped.
export type IaErrorCode =
  | "INVALID_EVENT" | "INVALID_CONFIG" | "INVALID_BINDINGS" | "INVALID_COMMAND" | "INVALID_MACHINE"
  | "INVALID_TREE" | "INVALID_PLAN" | "INVALID_EXPORT" | "INVALID_INPUT" | "RESOURCE_LIMIT";

export class IaError extends Error {
  readonly code: IaErrorCode;
  readonly reason: string | undefined;
  readonly path: string | undefined;
  /** Human text outside any contract. */
  readonly detail: string | undefined;
  constructor(code: IaErrorCode, reason?: string, path?: string, detail?: string) {
    super([code, reason, path, detail].filter((x): x is string => x !== undefined).join(" | "));
    this.name = "IaError";
    this.code = code;
    this.reason = reason;
    this.path = path;
    this.detail = detail;
  }
}
