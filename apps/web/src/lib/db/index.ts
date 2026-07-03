import "server-only";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Drizzle over Neon's WebSocket driver (NOT neon-http) — the credits debit
 * path needs interactive transactions with row locking, which the stateless
 * HTTP driver cannot provide.
 *
 * The client is created lazily and exposed through a Proxy so importing this
 * module (e.g. while `next build` collects page data) never requires
 * DATABASE_URL — it is only read on the first actual query.
 */

type Database = NeonDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __fileonchainDb: Database | undefined;
}

const getDb = (): Database => {
  if (!globalThis.__fileonchainDb) {
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: env.databaseUrl });
    globalThis.__fileonchainDb = drizzle(pool, { schema });
  }
  return globalThis.__fileonchainDb;
};

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const value = getDb()[prop as keyof Database];
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
});

export * from "./schema";
