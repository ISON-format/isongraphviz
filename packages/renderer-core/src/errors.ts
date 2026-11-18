// src/errors.ts - IGR/1 structured errors (design section 12). Parallel to IgsError and LayoutError.
export type IgrErrorCode =
  | "INVALID_INPUT" | "INVALID_STATE" | "INVALID_INTENT" | "INVALID_MANIFEST" | "UNSUPPORTED_CAPABILITY"
  | "INVALID_LIFECYCLE" | "RESOURCE_LIMIT" | "INVALID_REPORT" | "INVALID_CORPUS";

export class IgrError extends Error {
  readonly code: IgrErrorCode;
  readonly reason: string | undefined;
  readonly path: string | undefined;
  /** Human text outside any contract. */
  readonly detail: string | undefined;
  constructor(code: IgrErrorCode, reason?: string, path?: string, detail?: string) {
    super([code, reason, path, detail].filter((x): x is string => x !== undefined).join(" | "));
    this.name = "IgrError";
    this.code = code;
    this.reason = reason;
    this.path = path;
    this.detail = detail;
  }
}

/** "CODE/REASON" as written in the corpus (`CODE/` when there is no reason). */
export const errorKey = (e: IgrError): string => `${e.code}/${e.reason ?? ""}`;
