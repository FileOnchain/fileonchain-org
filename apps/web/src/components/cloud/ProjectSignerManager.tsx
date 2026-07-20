"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface SignerInfo {
  publicKey: string;
  keyPreview: string;
  createdAt: string;
  revokedAt: string | null;
}

export const ProjectSignerManager = ({
  projectId,
  signer,
  canManage,
}: {
  projectId: string;
  signer: SignerInfo | null;
  canManage: boolean;
}) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (action: "generate" | "rotate" | "revoke") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/signer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 text-sm">
      <div>
        Status:{" "}
        <code className="font-mono text-xs">
          {signer ? `${signer.keyPreview}… (${signer.revokedAt ? "revoked" : "active"})` : "no signer yet"}
        </code>
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => call("generate")}
          >
            {signer ? "Rotate" : "Generate"}
          </button>
          {signer && !signer.revokedAt && (
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              disabled={busy}
              onClick={() => call("revoke")}
            >
              Revoke
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
};
