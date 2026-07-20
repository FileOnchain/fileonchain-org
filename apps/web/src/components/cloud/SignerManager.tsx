"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FiKey, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import Button from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/Toast";

/**
 * Client controls for the server-rendered `/cloud/signer` page. Generate /
 * rotate / revoke the org's Cloud signing key via
 * `/api/organizations/[id]/signer`. The public key and its status URL are
 * shown for the owner to share with verifiers; secret material never leaves
 * the server, so nothing sensitive is rendered here.
 */

export interface SignerStatus {
  publicKey: string;
  scheme: string;
  keyPreview: string;
  createdAt: string;
}

export const SignerManager = ({
  orgId,
  signer,
  statusUrl,
}: {
  orgId: string;
  signer: SignerStatus | null;
  statusUrl: string;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  const call = async (method: "POST" | "DELETE", successMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/signer`, { method });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Request failed");
      }
      toast({ title: successMsg, variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Request failed",
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {signer ? (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Scheme</dt>
            <dd className="font-mono text-xs text-foreground">{signer.scheme}</dd>
            <dt className="text-muted">Public key</dt>
            <dd className="flex items-center gap-2 break-all font-mono text-xs text-foreground">
              {signer.publicKey}
              <CopyButton value={signer.publicKey} />
            </dd>
            <dt className="text-muted">Key status URL</dt>
            <dd className="flex items-center gap-2 break-all font-mono text-xs text-foreground">
              {statusUrl}
              <CopyButton value={statusUrl} />
            </dd>
            <dt className="text-muted">Created</dt>
            <dd className="font-mono text-xs text-foreground">
              {new Date(signer.createdAt).toISOString().slice(0, 10)}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => call("POST", "Signer rotated")}
            >
              <FiRefreshCw size={14} /> Rotate key
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => call("DELETE", "Signer revoked")}
            >
              <FiTrash2 size={14} /> Revoke
            </Button>
          </div>
          <p className="text-xs text-muted">
            Rotating revokes the current key and issues a new one; envelopes
            already signed keep their signature. Verifiers resolve the key
            status URL above to see whether a key was revoked.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            No Cloud signer yet. Generate one to enable{" "}
            <code className="font-mono text-xs">server_sign</code> — the Cloud
            will add an <strong>envelope</strong> signature (attesting it
            assembled the envelope) to submissions that request it. This is
            never an artifact signature and does not assert authorship of the
            subject.
          </p>
          <Button
            disabled={busy}
            onClick={() => call("POST", "Signer generated")}
          >
            <FiKey size={14} /> Generate Cloud signer
          </Button>
        </>
      )}
    </div>
  );
};

export default SignerManager;
