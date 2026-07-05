"use client";

import * as React from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * VersionWatcher — polls `/api/version` (and re-checks when the tab regains
 * focus) and raises a persistent refresh toast once the served build id no
 * longer matches the one this client was built with. Form inputs survive
 * the reload via the `useFormDraft` sessionStorage drafts, so refreshing is
 * always safe to suggest.
 */

const CURRENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;
const POLL_INTERVAL_MS = 4 * 60_000;

export const VersionWatcher = () => {
  const { toast } = useToast();
  const notifiedRef = React.useRef(false);

  React.useEffect(() => {
    // Dev servers rebuild in place and never change id — nothing to watch.
    if (process.env.NODE_ENV !== "production" || !CURRENT_BUILD_ID) return;

    const check = async () => {
      if (notifiedRef.current || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string | null };
        if (!data.buildId || data.buildId === CURRENT_BUILD_ID) return;
        notifiedRef.current = true;
        toast({
          title: "A new version of FileOnChain is available",
          description:
            "Refresh to load the latest update — anything you've typed is kept.",
          variant: "info",
          duration: 0,
          action: {
            label: "Refresh now",
            onClick: () => window.location.reload(),
          },
        });
      } catch {
        // Offline or transient failure — the next tick retries.
      }
    };

    const interval = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [toast]);

  return null;
};

export default VersionWatcher;
