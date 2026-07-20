"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Client editor for the server-rendered `/cloud/retention` page. Submits the
 * per-org window to `PATCH /api/organizations/[id]/retention` (session-authed,
 * owner/admin). Kept minimal — a number input plus save — so the honest
 * "what you set is what runs" contract is obvious.
 */
export const RetentionEditor = ({
  orgId,
  initialWindowDays,
  canManage,
}: {
  orgId: string;
  initialWindowDays: number;
  canManage: boolean;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const [windowDays, setWindowDays] = React.useState(String(initialWindowDays));
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    const parsed = Math.trunc(Number(windowDays));
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast({ title: "Enter a positive number of days", variant: "danger" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/retention`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowDays: parsed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not update retention");
      }
      toast({ title: `Retention set to ${parsed} days`, variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Update failed",
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <label
        htmlFor="retention-window"
        className="text-sm font-medium text-foreground"
      >
        Window (days)
      </label>
      <div className="flex items-end gap-3">
        <input
          id="retention-window"
          type="number"
          min={1}
          value={windowDays}
          disabled={!canManage || busy}
          onChange={(e) => setWindowDays(e.target.value)}
          className="block w-32 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-50"
        />
        {canManage && (
          <Button disabled={busy} onClick={save}>
            Save
          </Button>
        )}
      </div>
      {!canManage && (
        <p className="text-xs text-muted">
          Only owners and admins can change the retention window.
        </p>
      )}
    </div>
  );
};

export default RetentionEditor;
