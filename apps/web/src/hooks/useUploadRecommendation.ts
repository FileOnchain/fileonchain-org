"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useChain } from "@/hooks/useChain";
import { useWalletStates } from "@/states/wallet";
import { hydratePreferences, usePreferencesStates } from "@/states/preferences";
import { computeUploadRecommendation } from "@/lib/recommendations/engine";
import type {
  RecommendationInput,
  RecommendationSource,
  UploadIntent,
  UploadRecommendation,
  UploadRecommendationRequest,
} from "@/lib/recommendations/types";

/**
 * useUploadRecommendation — client state for the Upload Advisor.
 *
 * Fetches POST /api/recommendations/upload (debounced 300ms on input
 * changes) and falls back to running the same deterministic engine locally
 * when the API is unreachable, so a recommendation is always available.
 * The accepted/dismissed view is scoped to the current file session and
 * resets when a different file is picked.
 */

const DEBOUNCE_MS = 300;
/** Client-side cap on the API round-trip (LLM copy adds up to ~3s). */
const FETCH_TIMEOUT_MS = 4_000;

/** Feature flag — "0" hides the advisor entirely (no API calls). */
export const isUploadAdvisorFlagEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_UPLOAD_ADVISOR_ENABLED !== "0";

export type AdvisorView = "suggestion" | "accepted" | "dismissed";

export type AdvisorStatus = "idle" | "loading" | "ready";

interface UseUploadRecommendationParams {
  file: File | null;
  chunkCount: number;
}

export const useUploadRecommendation = ({
  file,
  chunkCount,
}: UseUploadRecommendationParams) => {
  const { activeChainId } = useChain();
  const { status: sessionStatus } = useSession();
  const authenticated = sessionStatus === "authenticated";
  const walletFamily = useWalletStates((s) => s.chainFamily);

  const advisorPreference = usePreferencesStates((s) => s.uploadAdvisorEnabled);
  const hydrated = usePreferencesStates((s) => s.hydrated);
  React.useEffect(() => {
    if (!hydrated) hydratePreferences();
  }, [hydrated]);

  const enabled =
    isUploadAdvisorFlagEnabled() && advisorPreference && file !== null;

  const [status, setStatus] = React.useState<AdvisorStatus>("idle");
  const [recommendation, setRecommendation] =
    React.useState<UploadRecommendation | null>(null);
  const [source, setSource] = React.useState<RecommendationSource>("api");
  const [intent, setIntent] = React.useState<UploadIntent>("balanced");
  const [view, setView] = React.useState<AdvisorView>("suggestion");

  // One advisor session per file: a new file resets override state.
  const fileKey = file
    ? `${file.name}:${file.size}:${file.lastModified}`
    : null;
  const lastFileKey = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (fileKey !== lastFileKey.current) {
      lastFileKey.current = fileKey;
      setView("suggestion");
      setIntent("balanced");
      setRecommendation(null);
    }
  }, [fileKey]);

  React.useEffect(() => {
    if (!enabled || !file || sessionStatus === "loading") {
      if (!enabled) setStatus("idle");
      return;
    }

    const request: UploadRecommendationRequest = {
      file: {
        name: file.name,
        sizeBytes: Math.max(1, file.size),
        mimeType: file.type,
        chunkCount: Math.max(1, chunkCount),
      },
      activeChainId,
      wallet: { connected: walletFamily !== null, family: walletFamily },
      intent,
    };
    // Local fallback context: authenticated is known client-side, balance
    // and BYOK keys are server-only — the engine treats them as unknown.
    const fallbackInput: RecommendationInput = {
      ...request,
      intent,
      session: {
        authenticated,
        creditBalanceMicroUsdc: null,
        byokKeys: [],
      },
    };

    let cancelled = false;
    setStatus("loading");
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT_MS,
      );
      void (async () => {
        try {
          const res = await fetch("/api/recommendations/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as UploadRecommendation;
          if (cancelled) return;
          setRecommendation(data);
          setSource("api");
          setStatus("ready");
        } catch {
          if (cancelled) return;
          try {
            setRecommendation(computeUploadRecommendation(fallbackInput));
            setSource("fallback");
            setStatus("ready");
          } catch {
            setStatus("idle");
          }
        } finally {
          window.clearTimeout(timeout);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    enabled,
    file,
    chunkCount,
    activeChainId,
    walletFamily,
    authenticated,
    sessionStatus,
    intent,
  ]);

  return {
    /** False when the env flag or user preference turns the advisor off. */
    enabled,
    status,
    recommendation,
    source,
    intent,
    setIntent,
    view,
    setView,
  };
};

export default useUploadRecommendation;
