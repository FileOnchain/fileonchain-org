"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Member {
  userId: string;
  role: string;
  joinedAt: string;
}

export const ProjectMembersEditor = ({
  projectId,
  members,
  canManage,
}: {
  projectId: string;
  members: Member[];
  canManage: boolean;
}) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <ul className="divide-y divide-border rounded-md border border-border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="font-mono text-xs">{m.userId.slice(0, 12)}…</span>
            <span className="text-muted">role: {m.role}</span>
            {canManage && (
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs"
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Remove this member from the project?")) return;
                  setBusy(true);
                  try {
                    const res = await fetch(
                      `/api/projects/${projectId}/members/${m.userId}`,
                      { method: "DELETE" },
                    );
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
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!email.trim()) return;
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(`/api/projects/${projectId}/members`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(body.error ?? `Failed (${res.status})`);
              } else {
                setEmail("");
                router.refresh();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            className="min-w-[14rem] flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={busy}
          >
            Add member
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </form>
      )}
    </div>
  );
};
