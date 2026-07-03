import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import {
  db,
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/lib/db";
import { env } from "@/lib/env";

export interface OAuthProviderInfo {
  id: "google" | "github";
  name: string;
}

/**
 * OAuth providers are registered only when their credentials are configured,
 * so wallet sign-in works in environments without Google/GitHub apps and the
 * /login page can hide unavailable buttons.
 */
const providers: Provider[] = [];
export const availableOAuthProviders: OAuthProviderInfo[] = [];

if (env.authGoogleId && env.authGoogleSecret) {
  providers.push(
    Google({ clientId: env.authGoogleId, clientSecret: env.authGoogleSecret }),
  );
  availableOAuthProviders.push({ id: "google", name: "Google" });
}

if (env.authGithubId && env.authGithubSecret) {
  providers.push(
    GitHub({ clientId: env.authGithubId, clientSecret: env.authGithubSecret }),
  );
  availableOAuthProviders.push({ id: "github", name: "GitHub" });
}

/**
 * JWT sessions uniformly: the wallet Credentials provider cannot create
 * database sessions, and mixing strategies per provider is incoherent. The
 * Drizzle adapter still persists users/accounts for OAuth sign-ins.
 */
export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      // On sign-in, pin the DB user id to the token so sessions carry it.
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
