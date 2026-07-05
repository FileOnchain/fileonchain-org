"use client";

import * as React from "react";
import { FiUserPlus, FiX } from "react-icons/fi";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useCacheStates } from "@/states/cache";
import { useFormDraft } from "@/hooks/useFormDraft";
import { truncateFileName } from "@/utils/truncateFileName";

interface CacheAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: `0x${string}` | null;
}

const ADDRESS_MAX = 14;

/**
 * CacheAccessModal — grant / revoke access on a cache entry. Mock state
 * mutation only; real impl calls CachePayments.grantAccess / revokeAccess.
 */
export const CacheAccessModal = ({ open, onOpenChange, entryId }: CacheAccessModalProps) => {
  const entries = useCacheStates((s) => s.entries);
  const grantAccess = useCacheStates((s) => s.grantAccess);
  const revokeAccess = useCacheStates((s) => s.revokeAccess);

  const [address, setAddress] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Keeps a half-typed grantee address across a page refresh.
  useFormDraft(
    "cache-access-grant",
    { address },
    { enabled: open, restore: (draft) => setAddress(draft.address) },
  );

  const entry = entries.find((e) => e.id === entryId) ?? null;

  const handleGrant = () => {
    setError(null);
    if (!entry) return;
    const trimmed = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setError("Enter a valid 0x-prefixed 40-char address.");
      return;
    }
    grantAccess(entry.id, trimmed as `0x${string}`);
    setAddress("");
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Manage access"
      description={
        entry
          ? `${entry.filename} — ${entry.allowList.length} grantee${entry.allowList.length === 1 ? "" : "s"}`
          : undefined
      }
      size="md"
    >
      {entry ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
              error={error ?? undefined}
              fullWidth
            />
            <Button onClick={handleGrant} leftIcon={<FiUserPlus size={14} />}>
              Grant
            </Button>
          </div>

          <ul className="space-y-2">
            {entry.allowList.length === 0 && (
              <li className="text-sm text-muted">No grantees yet.</li>
            )}
            {entry.allowList.map((addr) => (
              <li
                key={addr}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
              >
                <Badge variant="outline" size="sm">
                  {truncateFileName(addr, ADDRESS_MAX)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<FiX size={14} />}
                  onClick={() => revokeAccess(entry.id, addr)}
                  aria-label={`Revoke access for ${addr}`}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">Entry not found.</p>
      )}
    </Modal>
  );
};

export default CacheAccessModal;