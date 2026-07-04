import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "evm/index": "src/evm/index.ts",
    "substrate/index": "src/substrate/index.ts",
    "solana/index": "src/solana/index.ts",
    "aptos/index": "src/aptos/index.ts",
    "cosmos/index": "src/cosmos/index.ts",
    "sui/index": "src/sui/index.ts",
    "starknet/index": "src/starknet/index.ts",
    "near/index": "src/near/index.ts",
    "tron/index": "src/tron/index.ts",
    "cardano/index": "src/cardano/index.ts",
    "ton/index": "src/ton/index.ts",
    "hedera/index": "src/hedera/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
