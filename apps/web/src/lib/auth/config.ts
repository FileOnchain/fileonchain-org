import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import {
  db,
  users,
  accounts,
  sessions,
  verificationTokens,
  wallets,
} from "@/lib/db";
import { env } from "@/lib/env";
import { isWalletFamily } from "@/lib/auth/wallet-message";
import { verifyWalletSignature } from "@/lib/auth/verify-wallet";

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
 * Wallet sign-in: the client obtains a nonce, has the wallet sign the
 * challenge, and submits the proof here. A verified signature signs in the
 * wallet's owner, or creates a fresh user for a never-seen wallet.
 * (Attaching additional wallets to an existing account goes through
 * POST /api/wallets/link instead — see that route.)
 */
providers.push(
  Credentials({
    id: "wallet",
    name: "Wallet",
    credentials: {
      family: {},
      address: {},
      signature: {},
      nonce: {},
      publicKey: {},
      fullMessage: {},
    },
    authorize: async (credentials) => {
      const { family, address, signature, nonce, publicKey, fullMessage } =
        (credentials ?? {}) as Record<string, unknown>;
      if (
        !isWalletFamily(family) ||
        typeof address !== "string" ||
        typeof signature !== "string" ||
        typeof nonce !== "string"
      ) {
        return null;
      }

      const result = await verifyWalletSignature({
        family,
        address,
        signature,
        nonce,
        publicKey: typeof publicKey === "string" ? publicKey : undefined,
        fullMessage: typeof fullMessage === "string" ? fullMessage : undefined,
      });
      if (!result.ok) return null;

      const existing = await db
        .select({
          userId: wallets.userId,
          name: users.name,
          email: users.email,
          image: users.image,
        })
        .from(wallets)
        .innerJoin(users, eq(users.id, wallets.userId))
        .where(
          and(eq(wallets.family, family), eq(wallets.address, result.address)),
        )
        .limit(1);
      if (existing[0]) {
        const user = existing[0];
        return {
          id: user.userId,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      }

      // First sign-in from this wallet — create the user and the verified link.
      const shortAddress = `${result.address.slice(0, 6)}…${result.address.slice(-4)}`;
      const created = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ name: shortAddress })
          .returning();
        await tx.insert(wallets).values({
          userId: user.id,
          family,
          address: result.address,
          publicKey: typeof publicKey === "string" ? publicKey : null,
          signature,
          message: result.message,
        });
        return user;
      });
      return {
        id: created.id,
        name: created.name,
        email: created.email,
        image: created.image,
      };
    },
  }),
);

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
