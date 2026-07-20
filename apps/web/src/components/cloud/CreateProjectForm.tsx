"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export const CreateProjectForm = ({ orgId }: { orgId: string }) => {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        setError(null);
        try {
          const res = await fetch(`/api/organizations/${orgId}/projects`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(body.error ?? `Failed (${res.status})`);
          } else {
            setName("");
            router.refresh();
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="min-w-[12rem] flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
        required
        maxLength={64}
      />
      <button
        type="submit"
        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        disabled={busy}
      >
        {busy ? "Creating…" : "Create project"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
};
