"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectSummary } from "@/lib/server/projects";

export const ProjectList = ({ projects }: { projects: ProjectSummary[] }) => {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <ul className="mt-4 divide-y divide-border rounded-md border border-border">
      {projects.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link
              href={`/cloud/projects/${p.id}`}
              className="font-mono text-sm text-primary underline"
            >
              {p.name}
            </Link>
            <p className="text-xs text-muted">
              <code className="font-mono">{p.slug}</code>
              {" · "}
              {p.memberCount} member{p.memberCount === 1 ? "" : "s"}
              {" · role "}
              {p.role ?? "—"}
            </p>
          </div>
          <div className="flex gap-2">
            {p.role === "lead" && (
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs"
                disabled={busy === p.id}
                onClick={async () => {
                  if (!confirm(`Delete project ${p.name}?`)) return;
                  setBusy(p.id);
                  try {
                    const res = await fetch(`/api/projects/${p.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      alert(`Delete failed: ${body.error ?? res.status}`);
                    } else {
                      router.refresh();
                    }
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === p.id ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};
