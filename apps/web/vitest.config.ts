import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for the webapp. The project intentionally has no unit
 * test runner today (CLAUDE.md pins `pnpm build` as the gate) and
 * ships with `next build` as the only TypeScript-aware entry point;
 * this config is the minimum needed to bring tests up alongside that
 * gate without disturbing the production build.
 *
 * Conventions:
 *  - Server-side tests (lib/server/*, lib/indexer/*) run under
 *    `node` — no DOM needed.
 *  - The `@/` path alias mirrors `tsconfig.json` so test imports can
 *    match the rest of the codebase.
 *  - Test files live under `test/` (the protocol package's
 *    convention) rather than co-located `*.test.ts`.
 *  - `server-only` is aliased to an empty stub so unit tests can
 *    import from server modules without next-only boundary checks.
 *    The production bundle still resolves the real `server-only`
 *    package (it's only this config that overrides).
 */

const emptyModule = path.resolve(__dirname, "test/server-only-stub.ts");

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": emptyModule,
    },
  },
});
