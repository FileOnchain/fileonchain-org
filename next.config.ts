import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
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
      // bundle instead of trying to polyfill Node built-ins.
      config.plugins = [
        ...(config.plugins ?? []),
        new webpack.IgnorePlugin({ resourceRegExp: /@peculiar\/webcrypto/ }),
      ];
    }
    return config;
  },
};

export default nextConfig;
