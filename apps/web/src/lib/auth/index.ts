import NextAuth from "next-auth";
import { NextResponse } from "next/server";
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
 * Unwrap `requireUser` failures inside route handlers: thrown `NextResponse`
 * objects become the response; anything else is a real error.
 */
export const asRouteError = (error: unknown): NextResponse => {
  if (error instanceof NextResponse) return error;
  console.error(error);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
};
