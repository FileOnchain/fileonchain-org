import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  // The CLI entry uses top-level await; Node >= 20 is the package floor.
  target: "node20",
  // Inline the workspace packages: their workspace exports point at .ts
  // sources, so a non-bundled dist would be unrunnable straight from the
  // repo (`node packages/mcp/dist/index.js`).
  noExternal: ["@fileonchain/utils", "@fileonchain/api"],
  dts: false,
  sourcemap: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
