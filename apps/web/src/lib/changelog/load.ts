import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseChangelog, type Changelog } from "@/lib/changelog/parse";

/**
 * The repository `CHANGELOG.md`, two directories above the webapp
 * (`process.cwd()` is `apps/web` both locally and on Vercel, whose Root
 * Directory is `apps/web`). Read at build time by the static `/changelog`
 * page and feed; `outputFileTracingIncludes` in `next.config.ts` keeps the
 * file reachable if either route is ever re-rendered on the server.
 */
export const CHANGELOG_PATH = path.resolve(process.cwd(), "..", "..", "CHANGELOG.md");

export const loadChangelog = async (): Promise<Changelog> =>
  parseChangelog(await readFile(CHANGELOG_PATH, "utf8"));
