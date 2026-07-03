"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client wrapper around next-auth's SessionProvider so the root layout can
 * stay a Server Component — same pattern as ThemeProvider.
 */
const AuthSessionProvider = ({ children }: { children: React.ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);

export default AuthSessionProvider;
