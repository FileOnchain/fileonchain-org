/**
 * Back-compat re-export — the implementation moved to the real
 * `lib/indexer/queries.ts` module when we productionized the explorer
 * data layer. Every consumer that imported from `@/lib/mock/cid-indexer`
 * keeps working without a wide rename; the mock seam that lived here
 * (`MOCK_FILES`, the deterministic `getMockCIDRecord`, etc.) was the
 * last bit of fake data in the explorer feed.
 *
 * The on-chain reads for the EVM registry contract still live at
 * `lib/registry/reads.ts`; that file is unchanged and remains the
 * source of truth for the file-level `getCIDRecord` view (the
 * contract-storage record that `FileRegistry.anchorCID` writes when
 * a CID is first anchored). The indexer layer feeds the explorer
 * feed and the leaderboard; the registry layer powers the
 * `/api/cid/[cid]` resolution route.
 *
 * Notable shape change vs. the old mock: `RegisteredFile` is gone.
 * The protocol doesn't carry off-chain file metadata (name, MIME,
 * description, chunkCount), so the explorer now renders the CID +
 * its anchor hits instead. See the consumer components for the
 * updated UI.
 */

export {
  searchCID,
  lookupFile,
  getRecentAnchors,
  getExplorerStats,
  getUploaderAggregates,
  getFilesByUploader,
  getChunksForFile,
} from "@/lib/indexer/queries";

export type {
  AnchorStatus,
  FileCategory,
  SearchHit,
  RecentAnchorRow,
  ExplorerStats,
  UploaderAggregate,
} from "@/lib/indexer/queries";