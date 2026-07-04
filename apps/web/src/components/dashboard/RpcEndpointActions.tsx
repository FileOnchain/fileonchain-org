"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import { CHAINS, getChain, type ChainId } from "@fileonchain/sdk";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  allowedProtocolFor,
  isRpcConfigurableFamily,
  validateRpcUrl,
  type CustomRpcMap,
} from "@/lib/rpc-endpoints";
import { useRpcEndpointsStates } from "@/states/rpc-endpoints";
import { trackEvent } from "@/lib/analytics";

/** Client widgets for the server-rendered RPC Endpoints page. */

const CONFIGURABLE_CHAINS = CHAINS.filter((chain) =>
  isRpcConfigurableFamily(chain.family),
);

const saveEndpoints = async (
  patch: Partial<Record<ChainId, string | null>>,
): Promise<CustomRpcMap> => {
  const res = await fetch("/api/rpc-endpoints", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoints: patch }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Could not save the RPC endpoint");
  }
  return data.endpoints as CustomRpcMap;
};

/** Shared add/edit modal — `fixedChainId` locks the picker in edit mode. */
const RpcEndpointModal = ({
  open,
  onOpenChange,
  fixedChainId,
  initialUrl = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixedChainId?: ChainId;
  initialUrl?: string;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const setLocalEndpoints = useRpcEndpointsStates((s) => s.setLocalEndpoints);
  const [chainId, setChainId] = React.useState<ChainId>(
    fixedChainId ?? CONFIGURABLE_CHAINS[0].id,
  );
  const [url, setUrl] = React.useState(initialUrl);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setChainId(fixedChainId ?? CONFIGURABLE_CHAINS[0].id);
      setUrl(initialUrl);
      setError(null);
    }
  }, [open, fixedChainId, initialUrl]);

  const chain = getChain(chainId) ?? CONFIGURABLE_CHAINS[0];
  const protocol = allowedProtocolFor(chain.family);

  const handleSave = async () => {
    const invalid = validateRpcUrl(chain.family, url);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const endpoints = await saveEndpoints({ [chain.id]: url.trim() });
      setLocalEndpoints(endpoints);
      trackEvent("rpc_endpoint", { chain_id: chain.id, action: "set" });
      toast({ title: `Custom RPC saved for ${chain.name}`, variant: "success" });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={fixedChainId ? `Edit RPC for ${chain.name}` : "Add a custom RPC"}
      description="Your endpoint replaces the public default wherever FileOnChain dials the chain directly. Wallet extensions keep using their own node."
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="rpc-chain"
            className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted"
          >
            Chain
          </label>
          <select
            id="rpc-chain"
            value={chainId}
            disabled={Boolean(fixedChainId)}
            onChange={(event) => setChainId(event.target.value as ChainId)}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            {CONFIGURABLE_CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.testnet ? " (testnet)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            {protocol === "wss:" ? "WebSocket (wss://)" : "HTTPS"} endpoint ·
            default: <code className="font-mono">{chain.rpcUrl}</code>
          </p>
        </div>
        <Input
          placeholder={chain.rpcUrl}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label="RPC endpoint URL"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          fullWidth
          isLoading={busy}
          disabled={!url.trim()}
          onClick={() => void handleSave()}
        >
          Save endpoint
        </Button>
      </div>
    </Modal>
  );
};

/**
 * Push the server-fetched map into the client mirror on mount — a fresh
 * device has empty localStorage until the user edits something, so visiting
 * the page is what syncs account overrides down (same idea as the
 * preferences page hydrating usePreferencesStates).
 */
export const RpcEndpointsSync = ({ endpoints }: { endpoints: CustomRpcMap }) => {
  const setLocalEndpoints = useRpcEndpointsStates((s) => s.setLocalEndpoints);
  const serialized = JSON.stringify(endpoints);
  React.useEffect(() => {
    setLocalEndpoints(JSON.parse(serialized) as CustomRpcMap);
  }, [serialized, setLocalEndpoints]);
  return null;
};

export const AddRpcEndpointButton = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button leftIcon={<FiPlus aria-hidden />} onClick={() => setOpen(true)}>
        Add custom RPC
      </Button>
      <RpcEndpointModal open={open} onOpenChange={setOpen} />
    </>
  );
};

export const RpcEndpointRowActions = ({
  chainId,
  url,
}: {
  chainId: ChainId;
  url: string;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const setLocalEndpoints = useRpcEndpointsStates((s) => s.setLocalEndpoints);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const handleRemove = async () => {
    setBusy(true);
    try {
      const endpoints = await saveEndpoints({ [chainId]: null });
      setLocalEndpoints(endpoints);
      trackEvent("rpc_endpoint", { chain_id: chainId, action: "remove" });
      toast({ title: "Custom RPC removed", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Removing failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<FiEdit2 aria-hidden />}
        onClick={() => setEditing(true)}
      >
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        isLoading={busy}
        leftIcon={<FiTrash2 aria-hidden />}
        onClick={() => void handleRemove()}
      >
        Remove
      </Button>
      <RpcEndpointModal
        open={editing}
        onOpenChange={setEditing}
        fixedChainId={chainId}
        initialUrl={url}
      />
    </div>
  );
};
