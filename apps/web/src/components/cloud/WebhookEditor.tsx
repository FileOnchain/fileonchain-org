"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ALL_EVENTS = [
  "evidence.sealed",
  "evidence.verified",
  "evidence.expired",
  "agent_run.sealed",
  "anchor.job.settled",
  "signer.rotated",
  "signer.revoked",
  "compliance_report.generated",
];

interface Endpoint {
  id: string;
  url: string;
  description: string;
  secretPreview: string;
  disabledAt: string | null;
  createdAt: string;
  events: string[];
}

export const WebhookEditor = ({
  endpoints,
}: {
  orgId: string;
  endpoints: Endpoint[];
}) => {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <div className="mt-3 space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!url.trim() || events.length === 0) return;
          setBusy(true);
          setError(null);
          setSecret(null);
          try {
            const res = await fetch(`/api/v1/webhooks`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ url, description: desc, events }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(body.error ?? `Failed (${res.status})`);
            } else {
              setSecret(body.secret ?? null);
              setUrl("");
              setDesc("");
              setEvents([]);
              router.refresh();
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-app.example.com/hook"
          className="rounded border border-border bg-background px-3 py-1.5 text-sm sm:col-span-2"
          required
        />
        <input
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description (optional)"
          className="rounded border border-border bg-background px-3 py-1.5 text-sm sm:col-span-2"
          maxLength={200}
        />
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          {ALL_EVENTS.map((eventType) => {
            const on = events.includes(eventType);
            return (
              <button
                key={eventType}
                type="button"
                onClick={() =>
                  setEvents((prev) =>
                    on
                      ? prev.filter((e) => e !== eventType)
                      : [...prev, eventType],
                  )
                }
                className={`rounded border px-2 py-1 text-xs ${
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted"
                }`}
              >
                {eventType}
              </button>
            );
          })}
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Creating…" : "Create endpoint"}
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
          {secret && (
            <span className="text-xs">
              Signing secret (shown once):{" "}
              <code className="font-mono">{secret}</code>
            </span>
          )}
        </div>
      </form>

      <ul className="divide-y divide-border rounded-md border border-border">
        {endpoints.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <p className="font-mono text-xs">{e.url}</p>
              <p className="text-xs text-muted">
                {e.description || "(no description)"}
                {" · "}events: {e.events.join(", ") || "—"}
                {e.disabledAt && (
                  <span className="ml-2 rounded bg-danger/10 px-2 py-0.5 text-danger">
                    disabled
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs"
                onClick={async () => {
                  const res = await fetch(
                    `/api/v1/webhooks/${e.id}/rotate_secret`,
                    { method: "POST" },
                  );
                  const body = await res.json();
                  if (res.ok) {
                    alert(`New signing secret: ${body.secret}`);
                  } else {
                    alert(`Failed: ${body.error ?? res.status}`);
                  }
                }}
              >
                Rotate secret
              </button>
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs"
                onClick={async () => {
                  if (!confirm("Disable this endpoint?")) return;
                  const res = await fetch(`/api/v1/webhooks/${e.id}`, {
                    method: "DELETE",
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    alert(`Failed: ${body.error ?? res.status}`);
                  } else {
                    router.refresh();
                  }
                }}
              >
                Disable
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
