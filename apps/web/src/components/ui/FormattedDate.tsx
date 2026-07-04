"use client";

import * as React from "react";
import { formatAgo } from "@/lib/format";
import { formatPreferredDate } from "@/lib/preferences";
import { hydratePreferences, usePreferencesStates } from "@/states/preferences";

export interface FormattedDateProps {
  date: Date | string | number;
  /** Append HH:mm when rendering an absolute date. */
  withTime?: boolean;
  className?: string;
}

const RELATIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * FormattedDate — recent timestamps stay relative ("3h ago"); older ones
 * render absolutely in the user's preferred date format. The full timestamp
 * is always available on hover. Renders the relative form until the
 * preferences store hydrates so SSR markup stays deterministic.
 */
export const FormattedDate = ({
  date,
  withTime = false,
  className,
}: FormattedDateProps) => {
  const dateFormat = usePreferencesStates((s) => s.dateFormat);
  const hydrated = usePreferencesStates((s) => s.hydrated);

  React.useEffect(() => {
    if (!hydrated) hydratePreferences();
  }, [hydrated]);

  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return <span className={className}>—</span>;

  const isRecent = Date.now() - value.getTime() < RELATIVE_WINDOW_MS;
  const text =
    isRecent || !hydrated
      ? formatAgo(value)
      : formatPreferredDate(value, dateFormat, { withTime });

  return (
    <time
      dateTime={value.toISOString()}
      title={value.toLocaleString()}
      className={className}
    >
      {text}
    </time>
  );
};

export default FormattedDate;
