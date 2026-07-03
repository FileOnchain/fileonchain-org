"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FiPlus, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { BYOK_PROVIDERS } from "@/lib/byok/providers";

/** Client widgets for the server-rendered BYOK page. */

export const AddByokKeyButton = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [provider, setProvider] = React.useState(BYOK_PROVIDERS[0].id);
  const [label, setLabel] = React.useState("");
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const providerInfo = BYOK_PROVIDERS.find((p) => p.id === provider);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setLabel("");
      setKey("");
      setError(null);
    }
  };

  const handleAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, label, key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not store the key");
      }
      const data = await res.json();
      toast({
        title: "Provider key added",
        description:
          data.key.status === "valid"
            ? "The key validated successfully."
            : "The key failed validation — double-check it.",
        variant: data.key.status === "valid" ? "success" : "warning",
      });
      close(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adding the key failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button leftIcon={<FiPlus aria-hidden />} onClick={() => setOpen(true)}>
        Add provider key
      </Button>
      <Modal
        open={open}
        onOpenChange={close}
        title="Add a provider key"
        description="Your key is encrypted at rest and only used to route your uploads through the provider."
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="byok-provider"
              className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted"
            >
              Provider
            </label>
            <select
              id="byok-provider"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as typeof provider)
              }
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {BYOK_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {providerInfo && (
              <p className="mt-1 text-xs text-muted">
                {providerInfo.keyFormatHint} ·{" "}
                <a
                  href={providerInfo.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  docs
                </a>
              </p>
            )}
          </div>
          <Input
            placeholder="Label (e.g. personal)"
            value={label}
            maxLength={64}
            onChange={(event) => setLabel(event.target.value)}
            aria-label="Key label"
          />
          <Input
            placeholder="Provider API key"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            aria-label="Provider API key"
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            fullWidth
            isLoading={busy}
            disabled={!label.trim() || key.trim().length < 8}
            onClick={() => void handleAdd()}
          >
            Validate &amp; save
          </Button>
        </div>
      </Modal>
    </>
  );
};

export const ByokRowActions = ({ keyId }: { keyId: string }) => {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<"validate" | "remove" | null>(null);

  const run = async (action: "validate" | "remove") => {
    setBusy(action);
    try {
      const res = await fetch(
        action === "validate" ? `/api/byok/${keyId}/validate` : `/api/byok/${keyId}`,
        { method: action === "validate" ? "POST" : "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Request failed");
      }
      toast({
        title: action === "validate" ? "Validation finished" : "Provider key removed",
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "danger",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        isLoading={busy === "validate"}
        leftIcon={<FiRefreshCw aria-hidden />}
        onClick={() => void run("validate")}
      >
        Revalidate
      </Button>
      <Button
        variant="ghost"
        size="sm"
        isLoading={busy === "remove"}
        leftIcon={<FiTrash2 aria-hidden />}
        onClick={() => void run("remove")}
      >
        Remove
      </Button>
    </div>
  );
};
