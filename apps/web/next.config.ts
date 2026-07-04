import path from "node:path";
import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
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