/**
 * Web-only types. Shared chain types (ChainFamily, ChainId,
 * CIDRegistryRecord) live in @fileonchain/sdk.
 */

export interface Account {
  address: string;
  meta: {
    genesisHash: string;
    name: string;
    source: string;
  };
  type: string;
}
