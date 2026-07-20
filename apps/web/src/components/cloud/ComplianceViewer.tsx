"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Report {
  id: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  envelopeDigest: string;
}

export const ComplianceViewer = ({
  orgId,
  reports,
}: {
  orgId: string | null;
  reports: Report[];
}) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3 space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!orgId) return;
          setBusy(true);
          setError(null);
          try {
            const now = new Date();
            const periodEnd = new Date(
              Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
            );
            const periodStart = new Date(
              Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
            );
            const res = await fetch(`/api/v1/compliance-reports`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                orgId,
                periodStart: periodStart.toISOString(),
                periodEnd: periodEnd.toISOString(),
              }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(body.error ?? `Failed (${res.status})`);
            } else {
              router.refresh();
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <button
          type="submit"
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:col-span-3"
          disabled={busy || !orgId}
        >
          {busy ? "Generating…" : "Generate last month's report now"}
        </button>
        {error && <span className="text-xs text-danger sm:col-span-3">{error}</span>}
      </form>

      {reports.length === 0 ? (
        <p className="text-sm text-muted">No reports yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-mono text-xs">
                  {r.periodStart.slice(0, 10)} → {r.periodEnd.slice(0, 10)}
                </p>
                <p className="text-xs text-muted">
                  digest <code className="font-mono">{r.envelopeDigest.slice(0, 16)}…</code>{" "}
                  · generated {r.generatedAt}
                </p>
              </div>
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs"
                onClick={async () => {
                  if (!orgId) return;
                  const url = `/api/v1/compliance-reports/${r.id}?orgId=${orgId}`;
                  const res = await fetch(url);
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    alert(`Failed: ${body.error ?? res.status}`);
                    return;
                  }
                  const data = (body.report ?? {}) as {
                    envelope?: unknown;
                    envelopeDigest?: string;
                  };
                  const blob = new Blob(
                    [JSON.stringify(data.envelope, null, 2)],
                    { type: "application/json" },
                  );
                  const objUrl = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = objUrl;
                  a.download = `compliance-report-${r.id}.evidence.json`;
                  a.click();
                  URL.revokeObjectURL(objUrl);
                }}
              >
                Download .evidence.json
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
