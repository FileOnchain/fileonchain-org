import { NextResponse } from "next/server";

/**
 * Typed HTTP error vocabulary for API route handlers. Throw an `HttpError`
 * (or a subclass — e.g. `OrgError` in `lib/server/organizations.ts`) from a
 * service or handler and let the route's `catch` map it with `asRouteError`
 * (`@/lib/auth`). Every error response carries a machine-readable `code`
 * alongside the human `error` message so API consumers can branch without
 * string-matching.
 */

export type HttpErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "not_implemented"
  | "org_scoped_key_required"
  | "project_quota_exceeded"
  | "internal_error";

const CODE_BY_STATUS: Record<number, HttpErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "payload_too_large",
  429: "rate_limited",
  500: "internal_error",
};

/** Codes mapped by `code` rather than `status` so callers can disambiguate
 *  HTTP-shared statuses (e.g. 403 between generic `forbidden` and the more
 *  specific `org_scoped_key_required`). */
/** Throw a typed HTTP error from a service or route handler. Route handlers
 *  map these via `asRouteError` (`@/lib/auth`).
 *
 *  Prefer `HttpError` for status + generic code; use this constructor when
 *  the code carries semantics that a generic `forbidden` does not. */
export const httpError = (
  status: number,
  code: HttpErrorCode,
  message: string,
): HttpError => new HttpError(status, message, code);

/** Convenience for the Cloud evidence surface: the route short-circuits
 *  to 503 when the feature flag is off. */
export const notImplemented = (surface: string): HttpError =>
  httpError(503, "not_implemented", `${surface} is not enabled`);

/** Convenience for org-scoped API keys: the caller's key has no orgId. */
export const orgScopedKeyRequired = (): HttpError =>
  httpError(
    403,
    "org_scoped_key_required",
    "This endpoint requires an org-scoped API key (orgId != null).",
  );

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: HttpErrorCode = CODE_BY_STATUS[status] ??
      "internal_error",
  ) {
    super(message);
    this.name = new.target.name;
  }

  toResponse(): NextResponse {
    return NextResponse.json(
      { error: this.message, code: this.code },
      { status: this.status },
    );
  }
}
