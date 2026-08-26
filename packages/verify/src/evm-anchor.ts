import { createPublicClient, decodeFunctionData, http, type Hex } from "viem";
import { parseAnchorPayload } from "@fileonchain/utils";

/**
 * Online confirmation of an EVM anchor settlement receipt that actually
 * binds the transaction to the evidence. A transaction receipt alone
 * proves only that *some* transaction succeeded — any confirmed hash
 * would do. So this fetches the full transaction, decodes the
 * FileRegistry anchor calldata (`anchorChunk(bytes32,bytes32,string)`,
 * the entrypoint every deployed registry generation supports — the SDK
 * routes file-level anchors through it too — plus `anchorCID`, same
 * shape), parses the embedded fileonchain anchor payload from the `uri`
 * argument, and requires it to reference the evidence: the subject's
 * cid or sha256, or an inclusion receipt's root. Only then `pass`.
 * Decoding failures and content mismatches are `fail`; endpoint errors
 * are `unknown` — never `pass`.
 */

const FILE_REGISTRY_ANCHOR_ABI = [
  {
    type: "function",
    name: "anchorChunk",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cidHash", type: "bytes32" },
      { name: "contentHash", type: "bytes32" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "anchorCID",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cidHash", type: "bytes32" },
      { name: "contentHash", type: "bytes32" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
  },
] as const;

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** One value the on-chain anchor payload may bind, with a label for reporting. */
export interface AnchorBindingTarget {
  label: string;
  value: string;
}

export interface EvmAnchorConfirmation {
  status: "pass" | "fail" | "unknown";
  detail: string;
  /** cid / sha256 values the transaction's anchor payload proved on-chain. */
  boundValues: string[];
}

export interface ConfirmEvmAnchorParams {
  rpcUrl: string;
  txHash: string;
  /** When the receipt claims a block number, it must match the chain. */
  expectedBlockNumber?: number;
  /** Evidence values the on-chain payload must reference to pass. */
  targets: AnchorBindingTarget[];
}

export const confirmEvmAnchorOnline = async ({
  rpcUrl,
  txHash,
  expectedBlockNumber,
  targets,
}: ConfirmEvmAnchorParams): Promise<EvmAnchorConfirmation> => {
  if (!TX_HASH_RE.test(txHash)) {
    return {
      status: "fail",
      detail: "settlement txHash is not a 32-byte hex transaction hash",
      boundValues: [],
    };
  }
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const hash = txHash as Hex;
    const [txReceipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash }),
      client.getTransaction({ hash }),
    ]);
    if (txReceipt.status !== "success") {
      return { status: "fail", detail: "transaction reverted", boundValues: [] };
    }
    if (
      expectedBlockNumber !== undefined &&
      Number(txReceipt.blockNumber) !== expectedBlockNumber
    ) {
      return {
        status: "fail",
        detail: `block mismatch: receipt says ${expectedBlockNumber}, chain says ${txReceipt.blockNumber}`,
        boundValues: [],
      };
    }

    let uri: string;
    try {
      const decoded = decodeFunctionData({ abi: FILE_REGISTRY_ANCHOR_ABI, data: tx.input });
      uri = decoded.args[2];
    } catch {
      return {
        status: "fail",
        detail:
          "transaction calldata is not a FileRegistry anchor (anchorChunk/anchorCID) — the receipt cannot be bound to this evidence",
        boundValues: [],
      };
    }
    const payload = parseAnchorPayload(uri);
    if (!payload) {
      return {
        status: "fail",
        detail:
          "on-chain calldata carries no fileonchain anchor payload — the receipt cannot be bound to this evidence",
        boundValues: [],
      };
    }
    const boundValues =
      payload.op === "anchor"
        ? [payload.cid, ...(payload.sha256 ? [payload.sha256] : [])]
        : [payload.cid, payload.fileCid];

    if (targets.length === 0) {
      return {
        status: "unknown",
        detail: `anchor payload decoded on-chain (${boundValues.join(", ")}) but the evidence offers no cid, sha256, or inclusion root to bind against`,
        boundValues,
      };
    }
    const matched = targets.find((target) => boundValues.includes(target.value));
    if (!matched) {
      return {
        status: "fail",
        detail: `on-chain anchor payload (${boundValues.join(", ")}) does not reference ${targets
          .map((target) => target.label)
          .join(" / ")} — the transaction anchors something else`,
        boundValues,
      };
    }
    // Finality note: a passing check confirms inclusion, not finality —
    // relying parties should apply the chain's own finality depth.
    return {
      status: "pass",
      detail: `confirmed in block ${txReceipt.blockNumber}: on-chain anchor payload binds ${matched.label} ${matched.value} (inclusion, not finality)`,
      boundValues,
    };
  } catch (error) {
    return {
      status: "unknown",
      detail: `online confirmation unavailable: ${error instanceof Error ? error.message : String(error)}`,
      boundValues: [],
    };
  }
};
