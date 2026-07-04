"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { trackEvent } from "@/lib/analytics";
import {
  DATE_FORMAT_OPTIONS,
  formatPreferredDate,
  type UserPreferencesData,
} from "@/lib/preferences";
import { hydratePreferences, usePreferencesStates } from "@/states/preferences";

interface PreferencesFormProps {
  initialPreferences: UserPreferencesData;
}

/** Fixed sample so the date-format preview is SSR-deterministic. */
const SAMPLE_DATE = new Date("2026-01-31T14:05:00");

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow = ({
  label,
  description,
  checked,
  disabled,
  onChange,
}: ToggleRowProps) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{description}</p>
    </div>
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      aria-label={label}
    />
  </div>
);

/**
 * PreferencesForm — account preferences editor. Toggles and selects save
 * immediately (optimistic, reverted on failure); the username has an
 * explicit Save because it can fail validation/uniqueness. Display-affecting
 * fields are mirrored into the client preferences store so the chain
 * switcher, date rendering, and GA gate react without a reload.
 */
export const PreferencesForm = ({ initialPreferences }: PreferencesFormProps) => {
  const { toast } = useToast();
  const [prefs, setPrefs] = React.useState(initialPreferences);
  const [username, setUsername] = React.useState(initialPreferences.username ?? "");
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [savingUsername, setSavingUsername] = React.useState(false);
  const setLocalPreferences = usePreferencesStates((s) => s.setLocalPreferences);

  // The server row is authoritative for a signed-in user — push its
  // display-affecting fields into the local store on mount.
  React.useEffect(() => {
    hydratePreferences();
    setLocalPreferences({
      showTestnets: initialPreferences.showTestnets,
      dateFormat: initialPreferences.dateFormat,
      analyticsEnabled: initialPreferences.analyticsEnabled,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = React.useCallback(
    async (patch: Partial<UserPreferencesData>): Promise<boolean> => {
      const previous = prefs;
      const next = { ...prefs, ...patch };
      setPrefs(next);
      setLocalPreferences({
        showTestnets: next.showTestnets,
        dateFormat: next.dateFormat,
        analyticsEnabled: next.analyticsEnabled,
      });
      try {
        const res = await fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = (await res.json()) as {
          preferences?: UserPreferencesData;
          error?: string;
        };
        if (!res.ok || !data.preferences) {
          throw new Error(data.error ?? "Failed to save");
        }
        setPrefs(data.preferences);
        for (const field of Object.keys(patch)) {
          trackEvent("preference_change", { field });
        }
        return true;
      } catch (error) {
        setPrefs(previous);
        setLocalPreferences({
          showTestnets: previous.showTestnets,
          dateFormat: previous.dateFormat,
          analyticsEnabled: previous.analyticsEnabled,
        });
        toast({
          title: "Could not save preference",
          description: (error as Error).message,
          variant: "danger",
        });
        return false;
      }
    },
    [prefs, setLocalPreferences, toast],
  );

  const saveUsername = async () => {
    setUsernameError(null);
    setSavingUsername(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() || null }),
      });
      const data = (await res.json()) as {
        preferences?: UserPreferencesData;
        error?: string;
      };
      if (!res.ok || !data.preferences) {
        setUsernameError(data.error ?? "Failed to save username");
        return;
      }
      setPrefs(data.preferences);
      setUsername(data.preferences.username ?? "");
      trackEvent("preference_change", { field: "username" });
      toast({ title: "Username saved", variant: "success" });
    } catch {
      setUsernameError("Network error — try again");
    } finally {
      setSavingUsername(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            A public handle shown instead of your wallet address where
            possible.
          </CardDescription>
        </CardHeader>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <div className="w-full max-w-xs">
            <Input
              label="Username"
              placeholder="e.g. satoshi"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={usernameError ?? undefined}
              hint="3–32 chars · lowercase letters, digits, - or _. Leave empty to clear."
            />
          </div>
          <Button
            className="mt-7"
            onClick={saveUsername}
            isLoading={savingUsername}
            disabled={(prefs.username ?? "") === username.trim().toLowerCase()}
          >
            Save
          </Button>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Networks</CardTitle>
          <CardDescription>
            Control which chains appear in pickers across the app.
          </CardDescription>
        </CardHeader>
        <div className="mt-2 divide-y divide-border">
          <ToggleRow
            label="Show testnets"
            description="List test networks (Sepolia, Taurus, Solana Devnet, …) in the chain switcher, upload, deposit, and donation flows."
            checked={prefs.showTestnets}
            onChange={(checked) => save({ showTestnets: checked })}
          />
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Localization</CardTitle>
          <CardDescription>How dates are rendered across the app.</CardDescription>
        </CardHeader>
        <div className="mt-4 max-w-xs">
          <Select
            label="Date format"
            value={prefs.dateFormat}
            onChange={(e) =>
              save({
                dateFormat: e.target.value as UserPreferencesData["dateFormat"],
              })
            }
            hint={`Preview: ${formatPreferredDate(SAMPLE_DATE, prefs.dateFormat, { withTime: true })}`}
          >
            {DATE_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>
            We only ever collect anonymous usage analytics — never file
            contents or names.
          </CardDescription>
        </CardHeader>
        <div className="mt-2 divide-y divide-border">
          <ToggleRow
            label="Analytics cookies"
            description="Allow Google Analytics to measure feature usage. Turning this off stops all analytics immediately."
            checked={prefs.analyticsEnabled}
            onChange={(checked) => save({ analyticsEnabled: checked })}
          />
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Email notifications for account events. Delivery is being rolled
            out — your choices apply as soon as it ships.
          </CardDescription>
        </CardHeader>
        <div className="mt-2 divide-y divide-border">
          <ToggleRow
            label="Upload completion"
            description="When a server-side anchoring job finishes or fails."
            checked={prefs.notifyUploadComplete}
            onChange={(checked) => save({ notifyUploadComplete: checked })}
          />
          <ToggleRow
            label="Low credit balance"
            description="When your credit balance drops too low to anchor."
            checked={prefs.notifyLowCredit}
            onChange={(checked) => save({ notifyLowCredit: checked })}
          />
          <ToggleRow
            label="Promotions"
            description="Occasional discounts and feature announcements."
            checked={prefs.notifyPromotions}
            onChange={(checked) => save({ notifyPromotions: checked })}
          />
          <ToggleRow
            label="Newsletter"
            description="The FileOnChain newsletter — product and ecosystem updates."
            checked={prefs.notifyNewsletter}
            onChange={(checked) => save({ notifyNewsletter: checked })}
          />
        </div>
      </Card>
    </div>
  );
};

export default PreferencesForm;
