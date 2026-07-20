"use client";
import { useState } from "react";

interface QuotaInputs {
  envelopesPerMonth: number | null;
  anchorsPerMonth: number | null;
  bytesAnchoredPerMonth: number | null;
  retentionDays: number | null;
}

const toInput = (v: number | null): string => (v == null ? "" : String(v));

export const QuotaEditor = ({
  projectId,
  initial,
  canManage,
}: {
  projectId: string;
  initial: QuotaInputs;
  canManage: boolean;
}) => {
  const [envelopes, setEnvelopes] = useState(toInput(initial.envelopesPerMonth));
  const [anchors, setAnchors] = useState(toInput(initial.anchorsPerMonth));
  const [bytes, setBytes] = useState(toInput(initial.bytesAnchoredPerMonth));
  const [retention, setRetention] = useState(toInput(initial.retentionDays));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setSaved(null);
        setError(null);
        try {
          const res = await fetch(`/api/projects/${projectId}/quotas`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              envelopesPerMonth: envelopes === "" ? null : Number(envelopes),
              anchorsPerMonth: anchors === "" ? null : Number(anchors),
              bytesAnchoredPerMonth: bytes === "" ? null : Number(bytes),
              retentionDays: retention === "" ? null : Number(retention),
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(body.error ?? `Failed (${res.status})`);
          } else {
            setSaved("Saved.");
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Envelopes / month" value={envelopes} setValue={setEnvelopes} disabled={!canManage || busy} />
      <Field label="Anchors / month" value={anchors} setValue={setAnchors} disabled={!canManage || busy} />
      <Field label="Bytes anchored / month" value={bytes} setValue={setBytes} disabled={!canManage || busy} />
      <Field label="Retention days (null = inherit org)" value={retention} setValue={setRetention} disabled={!canManage || busy} />
      {canManage && (
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save quotas"}
          </button>
          {saved && <span className="text-xs text-success">{saved}</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </form>
  );
};

const Field = ({
  label,
  value,
  setValue,
  disabled,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  disabled?: boolean;
}) => (
  <label className="flex flex-col text-xs text-muted">
    <span>{label}</span>
    <input
      type="number"
      min={1}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      disabled={disabled}
      className="mt-1 rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground"
      placeholder="unlimited"
    />
  </label>
);
