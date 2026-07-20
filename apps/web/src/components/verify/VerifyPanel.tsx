"use client";

import * as React from "react";
import type {
  CheckGroup,
  CheckResult,
  VerificationReport,
} from "@fileonchain/verify";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { OVERALL, STATUS_ICON, SECTIONS } from "@/components/verify/reportView";

/**
 * VerifyPanel — the interactive half of /verify. Collects an envelope
 * (pasted JSON or a .json file), optional subject bytes, and an online
 * toggle, then dynamic-imports `@fileonchain/verify` (it pulls in viem —
 * keep it out of the initial bundle) and renders the grouped report.
 *
 * The overall chip wording + the six grouped sections live in
 * `./reportView.tsx` so the hosted `/cloud/verify/[envelopeId]` page can
 * share them — `/verify` and the hosted page must produce the same shape.
 */

const VerifyPanel = () => {
  const [json, setJson] = React.useState("");
  const [envelopeFileName, setEnvelopeFileName] = React.useState<string | null>(null);
  const [subjectBytes, setSubjectBytes] = React.useState<Uint8Array | null>(null);
  const [subjectFileName, setSubjectFileName] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<VerificationReport | null>(null);

  const onEnvelopeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnvelopeFileName(file.name);
    setJson(await file.text());
    setReport(null);
  };

  const onSubjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSubjectBytes(null);
      setSubjectFileName(null);
      return;
    }
    setSubjectFileName(file.name);
    setSubjectBytes(new Uint8Array(await file.arrayBuffer()));
    setReport(null);
  };

  const runVerify = async () => {
    if (!json.trim()) {
      setError("Paste an evidence envelope or choose a .json file first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Dynamic import — the verifier pulls in viem for EIP-191 checks.
      const { verifyEvidenceJson } = await import("@fileonchain/verify");
      const result = await verifyEvidenceJson(json, {
        ...(subjectBytes ? { subjectBytes } : {}),
        checkReceiptsOnline: online,
      });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed unexpectedly.");
    } finally {
      setBusy(false);
    }
  };

  const checksFor = (groups: CheckGroup[]): CheckResult[] =>
    report ? report.checks.filter((c) => groups.includes(c.group)) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Input column -------------------------------------------------- */}
      <Card className="p-5">
        <label htmlFor="verify-json" className="text-sm font-medium text-foreground">
          Evidence envelope (JSON)
        </label>
        <textarea
          id="verify-json"
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setEnvelopeFileName(null);
            setReport(null);
          }}
          spellCheck={false}
          placeholder='{"protocol": "fileonchain-evidence", …}'
          className="mt-2 h-56 w-full resize-y rounded-md border border-border bg-surface p-3 font-mono text-xs text-foreground placeholder:text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="verify-envelope-file" className="text-sm font-medium text-foreground">
              …or a .json file
            </label>
            <input
              id="verify-envelope-file"
              type="file"
              accept=".json,application/json"
              onChange={onEnvelopeFile}
              className="mt-2 block w-full text-xs text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-elevated file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:border-primary/40"
            />
            {envelopeFileName && (
              <p className="mt-1 font-mono text-[11px] text-muted">{envelopeFileName}</p>
            )}
          </div>
          <div>
            <label htmlFor="verify-subject-file" className="text-sm font-medium text-foreground">
              Subject bytes (optional)
            </label>
            <input
              id="verify-subject-file"
              type="file"
              onChange={onSubjectFile}
              className="mt-2 block w-full text-xs text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-elevated file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:border-primary/40"
            />
            <p className="mt-1 text-[11px] text-muted">
              {subjectFileName ?? "The original artifact, to recompute its digest locally."}
            </p>
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={online}
            onChange={(e) => setOnline(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--color-primary,#5e8bff)]"
          />
          <span>
            Confirm receipts online (public RPCs) — otherwise settlement receipts are checked
            structurally and reported as unconfirmed.
          </span>
        </label>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={runVerify} isLoading={busy} disabled={busy}>
            Verify
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Card>

      {/* Report column ------------------------------------------------- */}
      <div className="flex flex-col gap-4">
        {report && (
          <div
            className={cn(
              "flex items-center justify-between rounded-lg border px-4 py-3",
              OVERALL[report.status].className,
            )}
            role="status"
          >
            <span className="text-base font-semibold">{OVERALL[report.status].label}</span>
            <span className="font-mono text-xs opacity-80">
              {report.checks.length} checks · status: {report.status}
            </span>
          </div>
        )}

        {SECTIONS.map((section) => {
          const checks = checksFor(section.groups);
          return (
            <Card key={section.title} className="p-4">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <p className="mt-0.5 text-xs text-muted">{section.caption}</p>
              {checks.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {checks.map((check, i) => {
                    const { Icon, className, label } = STATUS_ICON[check.status];
                    return (
                      <li key={`${check.name}-${i}`} className="flex items-start gap-2 text-sm">
                        <span
                          className={cn("mt-0.5 shrink-0", className)}
                          title={label}
                          aria-label={label}
                        >
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="font-mono text-xs text-foreground">{check.name}</span>{" "}
                          <span className="text-muted">— {check.detail}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted/70">
                  {report ? "No checks in this group for this envelope." : "Awaiting a package…"}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default VerifyPanel;
