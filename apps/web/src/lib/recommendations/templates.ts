import { formatCostUsd } from "@/lib/mock/costs";
import type { UploadPaymentMethod } from "@/hooks/useFileUploader";

/**
 * Deterministic headline/rationale copy for the Upload Advisor. This is the
 * always-available baseline — the optional LLM layer only rephrases these
 * facts, it never changes the suggested settings. Keep every string derived
 * exclusively from engine output so the client fallback reads the same as
 * the server response.
 */

export interface CopyContext {
  chainName: string;
  chainShortName: string;
  testnet: boolean;
  provisioned: boolean;
  paymentMethod: UploadPaymentMethod;
  byokProviderName?: string;
  costUsd: number;
  chunkCount: number;
  walletConnected: boolean;
  /** Wallet family matches the suggested chain's family. */
  walletMatches: boolean;
  insufficientCredits: boolean;
}

const HEADLINE_MAX = 120;

/** Trim a headline to the 120-char budget, swapping in the short name first. */
const fitHeadline = (long: string, short: string): string => {
  if (long.length <= HEADLINE_MAX) return long;
  if (short.length <= HEADLINE_MAX) return short;
  return `${short.slice(0, HEADLINE_MAX - 1)}…`;
};

export const buildHeadline = (ctx: CopyContext): string => {
  const cost = formatCostUsd(ctx.costUsd);
  switch (ctx.paymentMethod) {
    case "credits": {
      if (ctx.insufficientCredits) {
        return fitHeadline(
          `Top up credits to anchor on ${ctx.chainName} (~${cost}).`,
          `Top up credits to anchor on ${ctx.chainShortName} (~${cost}).`,
        );
      }
      const sigs =
        ctx.chunkCount > 1
          ? ` — skip ${ctx.chunkCount.toLocaleString()} wallet signatures`
          : " — no wallet signature needed";
      return fitHeadline(
        `Use credits on ${ctx.chainName} (~${cost})${sigs}.`,
        `Use credits on ${ctx.chainShortName} (~${cost})${sigs}.`,
      );
    }
    case "byok":
      return fitHeadline(
        `Anchor on ${ctx.chainName} with your ${ctx.byokProviderName ?? "provider"} key (~${cost}).`,
        `Anchor on ${ctx.chainShortName} via your provider key (~${cost}).`,
      );
    case "payg": {
      const verb = ctx.testnet ? "Try" : "Anchor on";
      return fitHeadline(
        `${verb} ${ctx.chainName} with your wallet (~${cost}).`,
        `${verb} ${ctx.chainShortName} with your wallet (~${cost}).`,
      );
    }
  }
};

export const buildRationale = (ctx: CopyContext): string => {
  const parts: string[] = [];
  switch (ctx.paymentMethod) {
    case "credits":
      parts.push(
        ctx.insufficientCredits
          ? "Your credit balance doesn't cover this upload yet."
          : "Your balance covers this upload. Server-side anchoring avoids signing every chunk.",
      );
      break;
    case "byok":
      parts.push(
        "Your provider key covers this chain, so the upload spends your existing provider credit instead of FileOnChain credits.",
      );
      break;
    case "payg":
      if (ctx.testnet) {
        parts.push(
          "Testnets are ideal for first uploads — minimal cost while you learn the flow.",
        );
      } else if (ctx.walletMatches) {
        parts.push(
          `${ctx.chainName} is the cheapest fit for this file with your connected wallet.`,
        );
      } else {
        parts.push(
          `${ctx.chainName} is the cheapest fit for this file among the eligible chains.`,
        );
      }
      break;
  }
  if (!ctx.provisioned) {
    parts.push("Anchoring is simulated until the registry is deployed there.");
  }
  return parts.join(" ");
};
