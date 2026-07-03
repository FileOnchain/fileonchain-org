"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/Toast";
import { trackEvent } from "@/lib/analytics";

/**
 * Client widgets for the server-rendered API keys page: create (shows the
 * plaintext secret exactly once) and revoke.
 */

export const CreateApiKeyButton = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [secret, setSecret] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setSecret(null);
      setError(null);
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
        body: JSON.stringify({ name }),
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
            : "Name the key after the app or script that will use it."
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
