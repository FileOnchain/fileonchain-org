/**
 * Shared account-preferences vocabulary — safe to import from both server
 * code (DB schema, API validation) and client code (Zustand store, forms).
 * Keep it dependency-free so it never drags server modules into the bundle.
 */

export type DateFormatPreference = "locale" | "iso" | "us" | "eu";

export const DATE_FORMAT_OPTIONS: ReadonlyArray<{
  value: DateFormatPreference;
  label: string;
}> = [
  { value: "locale", label: "Browser default" },
  { value: "iso", label: "ISO 8601 (2026-07-04)" },
  { value: "us", label: "US (07/04/2026)" },
  { value: "eu", label: "EU (04/07/2026)" },
];

export interface UserPreferencesData {
  username: string | null;
  showTestnets: boolean;
  dateFormat: DateFormatPreference;
  analyticsEnabled: boolean;
  /** AI-assisted chain & payment recommendation on the upload screen. */
  uploadAdvisorEnabled: boolean;
  notifyUploadComplete: boolean;
  notifyLowCredit: boolean;
  notifyPromotions: boolean;
  notifyNewsletter: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferencesData = {
  username: null,
  showTestnets: false,
  dateFormat: "locale",
  analyticsEnabled: true,
  uploadAdvisorEnabled: true,
  notifyUploadComplete: true,
  notifyLowCredit: true,
  notifyPromotions: false,
  notifyNewsletter: false,
};

/** Lowercase handle: starts alphanumeric, then `a-z 0-9 - _`, 3–32 chars. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export const isDateFormatPreference = (
  value: unknown,
): value is DateFormatPreference =>
  DATE_FORMAT_OPTIONS.some((o) => o.value === value);

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Render a date in the user's preferred format. `withTime` appends a 24h
 * `HH:mm` clock (locale format uses the browser's own time rendering).
 */
export const formatPreferredDate = (
  input: Date | string | number,
  format: DateFormatPreference,
  { withTime = false }: { withTime?: boolean } = {},
): string => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";

  if (format === "locale") {
    return withTime ? date.toLocaleString() : date.toLocaleDateString();
  }

  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const day =
    format === "iso" ? `${y}-${m}-${d}` : format === "us" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
};
