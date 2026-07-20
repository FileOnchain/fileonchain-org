"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Job {
  id: string;
  status: string;
  envelopeCount: number;
  byteSize: number;
  expiresAt: string | null;
  error: string | null;
  createdAt: string;
}

export const ExportsList = ({ jobs }: { jobs: Job[] }) => {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <ul className="mt-4 divide-y divide-border rounded-md border border-border">
      {jobs.map((j) => (
        <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="font-mono text-xs">{j.id.slice(0, 12)}…</p>
            <p className="text-xs text-muted">
              status {j.status} · {j.envelopeCount} envelope
              {j.envelopeCount === 1 ? "" : "s"} · {j.byteSize} bytes
              {j.expiresAt && ` · expires ${j.expiresAt}`}
              {j.error && ` · ${j.error.slice(0, 60)}`}
            </p>
          </div>
          <div className="flex gap-2">
            {j.status === "ready" && (
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs"
                disabled={busy === j.id}
                onClick={async () => {
                  setBusy(j.id);
                  try {
                    // Resolving the download URL needs the token from
                    // the create response; for the UI we poll the
                    // job's status endpoint and require operators to
                    // grab the token from their create response.
                    alert(
                      "Use GET /api/v1/exports/[id] to retrieve the download token, then fetch /api/v1/exports/[id]/download?token=…",
                    );
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Download
              </button>
            )}
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs"
              disabled={busy === j.id}
              onClick={async () => {
                if (!confirm("Delete this export?")) return;
                setBusy(j.id);
                try {
                  const res = await fetch(`/api/v1/exports/${j.id}`, {
                    method: "DELETE",
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    alert(`Failed: ${body.error ?? res.status}`);
                  } else {
                    router.refresh();
                  }
                } finally {
                  setBusy(null);
                }
              }}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
};
