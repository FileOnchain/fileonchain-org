import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["esm", "cjs"],
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  // The workspace resolves @fileonchain/utils to its .ts sources; bundle it
  // so the published dist (and the CLI bin) runs standalone.
  noExternal: ["@fileonchain/utils"],
});
