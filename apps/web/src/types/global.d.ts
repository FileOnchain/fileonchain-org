// Ambient declarations for side-effect imports that TypeScript would
// otherwise reject (CSS, asset URLs, etc.). The webapp relies on these
// being available globally so Next.js / TS 6 don't error on the side-effect
// import in app/layout.tsx.

declare module "*.css";