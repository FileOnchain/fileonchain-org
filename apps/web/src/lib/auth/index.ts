import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/server/http-error";
import { authConfig } from "./config";

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/**
 * Session guard for API route handlers. Returns the authenticated user id or
 * throws a 401 `NextResponse` — route handlers rethrow non-Response errors.
 *
 * Usage:
 *   const userId = await requireUser();
 */
export const requireUser = async (): Promise<string> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  return userId;
};

/**
 * Unwrap thrown errors inside route handlers: thrown `NextResponse` objects
 * become the response, `HttpError`s (and subclasses like `OrgError`) map to
 * their status + code; anything else is a real error and logs as a 500.
 */
export const asRouteError = (error: unknown): NextResponse => {
  if (error instanceof NextResponse) return error;
  if (error instanceof HttpError) return error.toResponse();
  console.error(error);
  return NextResponse.json(
    { error: "Internal error", code: "internal_error" },
    { status: 500 },
  );
};
