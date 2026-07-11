import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    evm: "src/evm.ts",
    substrate: "src/substrate.ts",
    solana: "src/solana.ts",
    aptos: "src/aptos.ts",
    cosmos: "src/cosmos.ts",
    sui: "src/sui.ts",
    starknet: "src/starknet.ts",
    near: "src/near.ts",
    tron: "src/tron.ts",
    cardano: "src/cardano.ts",
    ton: "src/ton.ts",
    hedera: "src/hedera.ts",
    api: "src/api.ts",
    protocol: "src/protocol.ts",
    "agent-profile": "src/agent-profile.ts",
    evidence: "src/evidence.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
