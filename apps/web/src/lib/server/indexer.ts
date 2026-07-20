// Re-export of the indexer scan service for the cron route + CLI wrapper.
// The real implementation lives in `apps/web/src/lib/indexer/scan.ts` so
// the lib/indexer/* folder stays the single home for the on-chain indexer
// (queries, scan, future extractors). This file exists so the cron route
// and CLI can import from a `@/lib/server/*` path matching the convention
// of every other server-side service (credits, retention, exports, …).
export { runIndexerScan } from "@/lib/indexer/scan";