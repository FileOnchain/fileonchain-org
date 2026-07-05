import { randomUUID } from "node:crypto";
import path from "node:path";
import type { NextConfig } from "next";
import webpack from "webpack";

// One id per build, inlined into BOTH bundles at build time: the client
// keeps the id it was built with while `/api/version` serves the id of the
// currently deployed build — a mismatch is what triggers the "new version
// available" refresh toast (components/VersionWatcher.tsx). Prefer the
// commit SHA so redeploys of identical code don't prompt a refresh.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? randomUUID();

const nextConfig: NextConfig = {
  generateBuildId: () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  // The SDK packages are consumed straight from their TypeScript sources in
  // the workspace, so every package the @fileonchain/sdk umbrella re-exports
  // must be listed here too.
  transpilePackages: [
    "@fileonchain/sdk",
    "@fileonchain/utils",
    "@fileonchain/api",
    "@fileonchain/sdk-evm",
    "@fileonchain/sdk-substrate",
    "@fileonchain/sdk-solana",
    "@fileonchain/sdk-aptos",
    "@fileonchain/sdk-cosmos",
    "@fileonchain/sdk-sui",
    "@fileonchain/sdk-starknet",
    "@fileonchain/sdk-near",
    "@fileonchain/sdk-tron",
    "@fileonchain/sdk-cardano",
    "@fileonchain/sdk-ton",
    "@fileonchain/sdk-hedera",
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // The client bundle is fed by packages that reach for Node built-ins
      // (e.g. @autonomys/auto-dag-data -> @peculiar/webcrypto -> node:crypto).
      // Stub them so the browser bundle doesn't choke.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        crypto: false,
        stream: false,
        process: false,
      };

      // auto-dag-data's barrel re-exports an "encryption" subpath that imports
      // @peculiar/webcrypto, which in turn pulls in `node:crypto`. The uploader
      // never exercises encryption, so we strip the subpath from the client
      // bundle instead of trying to polyfill Node built-ins. Just ignoring
      // `@peculiar/webcrypto` is not enough — encryption/index.js itself calls
      // `new Crypto()` at module top level, so we replace the whole module
      // with an empty stub.
      config.plugins = [
        ...(config.plugins ?? []),
        new webpack.NormalModuleReplacementPlugin(
          /@autonomys[\\/]auto-dag-data[\\/]dist[\\/]encryption[\\/]index\.js$/,
          path.resolve(__dirname, "src/utils/empty-module.ts")
        ),
        // Defense in depth: if a transitive import slips past the
        // replacement above, keep `@peculiar/webcrypto` itself out of the
        // client bundle as well.
        new webpack.IgnorePlugin({ resourceRegExp: /@peculiar\/webcrypto/ }),
      ];
    }
    return config;
  },
};

export default nextConfig;