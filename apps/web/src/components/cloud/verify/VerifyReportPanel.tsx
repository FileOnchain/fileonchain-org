"use client";

import * as React from "react";
import type {
  CheckGroup,
  CheckResult,
  EvidenceEnvelope,
  VerificationReport,
} from "@fileonchain/verify";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { OVERALL, SECTIONS, STATUS_ICON } from "@/components/verify/reportView";

/**
 * VerifyReportPanel — the hosted verification page's client half. Receives
 * the canonical `EvidenceEnvelope` JSON from the server component parent
 * (no DB lookup, no API call from the browser), dynamic-imports
 * `@fileonchain/verify`, and renders the report using the same shared
 * constants as `/verify` so the chip wording and grouped sections match
 * verbatim.
 *
 * The hosted page is a *convenience* rendering — the disclosure card under
 * the chip explicitly says so, and points at the local verifier as the
 * ground truth. The verifier is the same code that the open-source CLI
 * uses; there is no separate hosted verifier implementation.
 *
 * The user CAN supply subject bytes here to recompute the subject digest
 * locally — when they do, the digest is computed in the browser, the
 * envelope's claim is checked against it, and the report's `subject`
 * group flips accordingly. Online receipt checks are not exposed on the
 * hosted page (they require RPC endpoints; the in-browser panel at
 * `/verify` allows them but defaults to offline).
 */

export interface VerifyReportPanelProps {
  envelope: EvidenceEnvelope;
  envelopeDigest: string;
  subjectSha256: string | null;
  createdAt: string;
}

export const VerifyReportPanel = ({
  envelope,
  envelopeDigest,
  subjectSha256,
  createdAt,
}: VerifyReportPanelProps) => {
  const [subjectBytes, setSubjectBytes] = React.useState<Uint8Array | null>(null);
  const [subjectFileName, setSubjectFileName] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState<VerificationReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const runVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      // Dynamic import — the verifier pulls in viem for EIP-191 checks.
      const { verifyEnvelope } = await import("@fileonchain/verify");
      const result = await verifyEnvelope(envelope, {
        ...(subjectBytes ? { subjectBytes } : {}),
      });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed unexpectedly.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-run once on mount so the user lands on a real report, not an
  // empty state — the envelope is already on hand, no extra input is
  // required to produce the offline report.
  React.useEffect(() => {
    void runVerify();
    // runVerify is stable within this component — the deps are intentionally
    // empty so the effect runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    await runVerify();
  };

  const checksFor = (groups: CheckGroup[]): CheckResult[] =>
    report ? report.checks.filter((c) => groups.includes(c.group)) : [];

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Envelope</h3>
            <dl className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-[auto_1fr] sm:gap-x-3">
              <dt className="font-mono">digest (sha256)</dt>
              <dd className="break-all font-mono text-foreground">{envelopeDigest}</dd>
              {subjectSha256 && (
                <>
                  <dt className="font-mono">subject (sha256)</dt>
                  <dd className="break-all font-mono text-foreground">{subjectSha256}</dd>
                </>
              )}
              <dt className="font-mono">sealed</dt>
              <dd className="font-mono text-foreground">{createdAt}</dd>
              {envelope.profile && (
                <>
                  <dt className="font-mono">profile</dt>
                  <dd className="font-mono text-foreground">{envelope.profile}</dd>
                </>
              )}
            </dl>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cloud-verify-subject-file" className="text-sm font-medium text-foreground">
              Subject bytes (optional)
            </label>
            <input
              id="cloud-verify-subject-file"
              type="file"
              onChange={onSubjectFile}
              className="mt-2 block w-full text-xs text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-elevated file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:border-primary/40"
            />
            <p className="mt-1 text-[11px] text-muted">
              {subjectFileName ?? "The original artifact, to recompute its digest locally."}
            </p>
          </div>
          <div className="flex items-end">
            <Button onClick={runVerify} isLoading={busy} disabled={busy}>
              Re-verify
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      <Card className="border-info/30 bg-info/5 p-4 text-sm text-muted">
        <strong className="text-foreground">Hosted verification</strong> — for
        a ground-truth check, run{" "}
        <code className="font-mono text-xs">fileonchain verify evidence.json</code>{" "}
        locally or paste the envelope into{" "}
        <a href="/verify" className="text-primary underline underline-offset-2">
          the in-browser verifier
        </a>
        . The open verifier and this page produce the same report.
      </Card>

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
                    <li
                      key={`${check.name}-${i}`}
                      className="flex items-start gap-2 text-sm"
                    >
                      <span
                        className={cn("mt-0.5 shrink-0", className)}
                        title={label}
                        aria-label={label}
                      >
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="font-mono text-xs text-foreground">
                          {check.name}
                        </span>{" "}
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
  );
};

export default VerifyReportPanel;
