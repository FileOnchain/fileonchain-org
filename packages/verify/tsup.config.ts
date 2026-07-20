import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["esm", "cjs"],
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  // The workspace resolves internal packages to their .ts sources; bundle
  // them so the published dist (and the CLI bins) run standalone.
  noExternal: ["@fileonchain/utils", "@fileonchain/protocol", "@fileonchain/agent-profile"],
});
