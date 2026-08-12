// ESLint flat config for the webapp. Next.js 16 dropped `next lint`, so
// `apps/web/package.json` invokes `eslint .` directly. `eslint-config-next`
// v16 ships flat configs at its subpath exports — no FlatCompat needed.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

export default [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts"],
  },
];
