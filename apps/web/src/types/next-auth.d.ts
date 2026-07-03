import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** Sessions always carry the DB user id (set in the session callback). */
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
