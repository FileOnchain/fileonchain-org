export interface Account {
  address: string;
  meta: {
    genesisHash: string;
    name: string;
    source: string;
  };
  type: string;
}
