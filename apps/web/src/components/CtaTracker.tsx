"use client";

import * as React from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * CtaTracker, one delegated click listener for marketing calls to action.
 * Any element (or ancestor of the click target) carrying `data-cta` fires a
 * `cta_click` event with that name and its `data-cta-location`. Delegation
 * keeps server components (Footer, TrustStrip, page bodies) server-only:
 * they just add the two attributes. Capture phase, so a handler that stops
 * propagation cannot hide the click.
 *
 * It also restores `cid_search`: a form carrying `data-cid-search` (the
 * explorer's server-action search form) fires the event on a non-empty
 * submit, with the attribute value as `source`. The CID is not sent.
 * Renders nothing.
 */
export const CtaTracker = () => {
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const el = e.target.closest<HTMLElement>("[data-cta]");
      if (!el) return;
      trackEvent("cta_click", {
        cta: el.dataset.cta ?? "",
        location: el.dataset.ctaLocation ?? "",
      });
    };
    const onSubmit = (e: SubmitEvent) => {
      if (!(e.target instanceof HTMLFormElement)) return;
      const source = e.target.dataset.cidSearch;
      if (!source) return;
      const cid = new FormData(e.target).get("cid");
      if (typeof cid !== "string" || !cid.trim()) return;
      trackEvent("cid_search", { source });
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return null;
};

export default CtaTracker;
