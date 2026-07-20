"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/Toast";
import { useFormDraft } from "@/hooks/useFormDraft";
import { trackEvent } from "@/lib/analytics";

/**
 * Client widgets for the server-rendered API keys page: create (shows the
 * plaintext secret exactly once) and revoke.
 */

interface OrgOption {
  id: string;
  name: string;
}

export const CreateApiKeyButton = ({
  orgs = [],
}: {
  orgs?: OrgOption[];
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  /** Empty string means "personal". The select's first option is
   *  always Personal so the default state produces a personal key. */
  const [orgId, setOrgId] = React.useState<string>("");
  const [secret, setSecret] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Draft the key name only — the plaintext secret must never hit storage.
  const { clearDraft } = useFormDraft(
    "api-key-name",
    { name },
    { enabled: open && !secret, restore: (draft) => setName(draft.name) },
  );

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setOrgId("");
      setSecret(null);
      setError(null);
      clearDraft();
      // The list behind the modal refreshes once the secret is dismissed.
      router.refresh();
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, orgId: orgId || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not create the key");
      }
      const data = await res.json();
      setSecret(data.secret);
      trackEvent("api_key", { action: "create" });
      toast({ title: "API key created", variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Key creation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button leftIcon={<FiPlus aria-hidden />} onClick={() => setOpen(true)}>
        New API key
      </Button>
      <Modal
        open={open}
        onOpenChange={close}
        title={secret ? "Copy your API key" : "New API key"}
        description={
          secret
            ? "This is the only time the full key is shown — store it somewhere safe."
            : "Name the key after the app or script that will use it. Pick an organization to mint an org-scoped key (required for the Cloud evidence surface)."
        }
      >
        {secret ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
              <code className="break-all font-mono text-sm text-foreground">
                {secret}
              </code>
              <CopyButton value={secret} ariaLabel="Copy API key" />
            </div>
            <Button fullWidth onClick={() => close(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              placeholder="e.g. deploy-script"
              value={name}
              maxLength={64}
              onChange={(event) => setName(event.target.value)}
              aria-label="Key name"
            />
            {orgs.length > 0 && (
              <div className="space-y-1">
                <label
                  htmlFor="api-key-org"
                  className="text-sm font-medium text-foreground"
                >
                  Scope
                </label>
                <select
                  id="api-key-org"
                  value={orgId}
                  onChange={(event) => setOrgId(event.target.value)}
                  className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="">Personal — for /api/v1/anchor and /api/v1/credits</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      Org · {org.name} — also enables /api/v1/evidence, /verify, /retention
                    </option>
                  ))}
                </select>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button
              fullWidth
              isLoading={busy}
              disabled={!name.trim()}
              onClick={() => void handleCreate()}
            >
              Create key
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
};

export const RevokeApiKeyButton = ({ keyId }: { keyId: string }) => {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  const handleRevoke = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not revoke the key");
      }
      trackEvent("api_key", { action: "revoke" });
      toast({ title: "API key revoked", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Revoke failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      isLoading={busy}
      leftIcon={<FiTrash2 aria-hidden />}
      onClick={() => void handleRevoke()}
      aria-label="Revoke API key"
    >
      Revoke
    </Button>
  );
};
