import "server-only";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

/**
 * Drizzle over Neon's WebSocket driver (NOT neon-http) — the credits debit
 * path needs interactive transactions with row locking, which the stateless
 * HTTP driver cannot provide.
 *
 * The Pool never connects at construction, so importing this module during
 * `next build` works without DATABASE_URL; the placeholder hostname makes a
 * missing env obvious at the first real query (ENOTFOUND database-url-not-set).
 */

type Database = NeonDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __fileonchainDb: Database | undefined;
}

const createDb = (): Database => {
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://database-url-not-set.invalid/fileonchain",
  });
  return drizzle(pool, { schema });
};

// Reuse across dev hot reloads so we don't leak pools.
export const db: Database = (globalThis.__fileonchainDb ??= createDb());

export * from "./schema";
