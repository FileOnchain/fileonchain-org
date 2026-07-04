"use client";

import * as React from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { hydratePreferences, usePreferencesStates } from "@/states/preferences";

/**
 * AnalyticsGate — mounts GA4 only after the preferences store hydrates and
 * confirms analytics cookies are allowed. Opting out mid-session also flips
 * Google's `ga-disable-<id>` kill switch (see states/preferences.ts), so an
 * already-loaded gtag stops sending immediately.
 */
export const AnalyticsGate = ({ gaId }: { gaId: string }) => {
  const analyticsEnabled = usePreferencesStates((s) => s.analyticsEnabled);
  const hydrated = usePreferencesStates((s) => s.hydrated);

  React.useEffect(() => {
    if (!hydrated) hydratePreferences();
  }, [hydrated]);

  if (!hydrated || !analyticsEnabled) return null;
  return <GoogleAnalytics gaId={gaId} />;
};

export default AnalyticsGate;
