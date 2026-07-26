import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChainId } from "@fileonchain/sdk";
import {
  AnchorChainUnavailableError,
  AnchorSignerUnavailableError,
  runAnchorWorker,
} from "@/lib/server/anchor-worker";

const VALID_CID = "bafybeigdyrzt5sfp7udm7hu76ys7tep27uxxi5y5q3kxymtsv2t7xspbio";

const SIGNER_ENV_NAMES = [
  "ANCHOR_EVM_PRIVATE_KEY",
  "ANCHOR_SUBSTRATE_SEED",
  "ANCHOR_SOLANA_SECRET_KEY",
  "ANCHOR_APTOS_PRIVATE_KEY",
  "ANCHOR_COSMOS_MNEMONIC",
  "ANCHOR_SUI_PRIVATE_KEY",
  "ANCHOR_STARKNET_ACCOUNT",
  "ANCHOR_STARKNET_PRIVATE_KEY",
  "ANCHOR_NEAR_ACCOUNT_ID",
  "ANCHOR_NEAR_PRIVATE_KEY",
  "ANCHOR_TRON_PRIVATE_KEY",
  "ANCHOR_CARDANO_SIGNING_KEY",
  "ANCHOR_CARDANO_BLOCKFROST_KEY",
  "ANCHOR_TON_MNEMONIC",
  "ANCHOR_TON_API_KEY",
  "ANCHOR_HEDERA_OPERATOR_ID",
  "ANCHOR_HEDERA_PRIVATE_KEY",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

const clearSignerEnv = (): void => {
  for (const name of SIGNER_ENV_NAMES) vi.stubEnv(name, "");
};

const expectSignerUnavailable = async (
  chainId: ChainId,
  requiredEnv: readonly string[],
): Promise<void> => {
  clearSignerEnv();
  const result = runAnchorWorker(VALID_CID, [chainId], {}, "1");
  await expect(result).rejects.toBeInstanceOf(AnchorSignerUnavailableError);
  await expect(result).rejects.toMatchObject({
    name: "AnchorSignerUnavailableError",
    chainId,
    requiredEnv,
    message: expect.stringContaining(
      `Anchor signer not configured for ${chainId}`,
    ),
  });
};

describe("hosted anchor worker fail-closed contract", () => {
  it.each([
    ["substrate:autonomys-mainnet", ["ANCHOR_SUBSTRATE_SEED"]],
    ["substrate:autonomys-taurus", ["ANCHOR_SUBSTRATE_SEED"]],
    ["solana:mainnet", ["ANCHOR_SOLANA_SECRET_KEY"]],
    ["solana:devnet", ["ANCHOR_SOLANA_SECRET_KEY"]],
    ["cosmos:theta-testnet-001", ["ANCHOR_COSMOS_MNEMONIC"]],
    ["tron:nile", ["ANCHOR_TRON_PRIVATE_KEY"]],
    [
      "cardano:preprod",
      ["ANCHOR_CARDANO_SIGNING_KEY", "ANCHOR_CARDANO_BLOCKFROST_KEY"],
    ],
    ["ton:testnet", ["ANCHOR_TON_MNEMONIC"]],
  ] as const)("rejects %s without its server signer", async (chainId, requiredEnv) => {
    await expectSignerUnavailable(chainId, requiredEnv);
  });

  it("reports only the missing member of a multi-variable signer", async () => {
    clearSignerEnv();
    vi.stubEnv("ANCHOR_CARDANO_SIGNING_KEY", "configured-test-key");
    const result = runAnchorWorker(VALID_CID, ["cardano:preprod"], {}, "1");
    await expect(result).rejects.toMatchObject({
      requiredEnv: ["ANCHOR_CARDANO_BLOCKFROST_KEY"],
    });
  });

  it("does not fabricate a receipt for an unprovisioned chain", async () => {
    const result = runAnchorWorker(VALID_CID, ["evm:1"], {}, "1");
    await expect(result).rejects.toBeInstanceOf(AnchorChainUnavailableError);
    await expect(result).rejects.toMatchObject({
      name: "AnchorChainUnavailableError",
      chainId: "evm:1",
      message: expect.stringContaining(
        "is not provisioned for hosted anchoring",
      ),
    });
  });
});
