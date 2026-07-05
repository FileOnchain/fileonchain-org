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
