"use client";

import * as React from "react";
import type { CheckResult, VerificationReport } from "@fileonchain/verify";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  CHECK_TAG,
  RECEIPT_SECTIONS,
  STAMP_LABEL,
  buildVerifyCommand,
  checksForReceiptLine,
  digestBars,
  footerLines,
  receiptCheckPhase,
  receiptFileName,
} from "@/lib/verify/receipt";
import { settlementSystemName } from "@/lib/verify/summary";

/**
 * ReceiptView — the verification report rendered as a receipt: monospace,
 * a stamped overall status, dashed rules, and one line per check, with
 * receipts listed as line items (system, tx, block, time). The same
 * component serves `/verify`, the hosted `/cloud/verify/[id]` page, and
 * the uploader's post-anchor state, so the artifact people screenshot
 * looks the same everywhere.
 *
 * It is a pure rendering of the `VerificationReport`: every value comes
 * from `report.checks` or `report.summary` (which the verifier copies from
 * the document). Artifact signatures and envelope signatures are separate
 * sections and stay separate; an unregistered adapter or profile prints
 * as UNKNOWN, never as a failure; the stamp is the verifier's exact
 * status. Nothing here says "verified", "authentic", or "true".
 *
 * Toolbar (outside the captured node): download as PNG (client-side,
 * `html-to-image`), print (a `@media print` rule in globals.css isolates
 * the receipt), and a light/dark override so a screenshot can be taken in
 * either look independent of the site theme.
 */

export interface ReceiptViewProps {
  report: VerificationReport;
  /** File name of the envelope, for the reproducing CLI command. */
  envelopeFileName?: string | null;
  /** File name of the subject bytes, when they were supplied. */
  subjectFileName?: string | null;
  /** Show the download / print / theme toolbar. */
  actions?: boolean;
  className?: string;
}

type ReceiptTheme = "auto" | "light" | "dark";

const Rule = () => <hr className="evidence-receipt-rule my-3" />;

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--receipt-muted)" }}>
    {children}
  </p>
);

/** `label ........ TAG` — one check on the receipt. */
const CheckRow = ({ label, check }: { label: string; check: CheckResult }) => (
  <div className="flex items-baseline gap-2 text-[11px] leading-5">
    <span className="min-w-0 break-all">{label}</span>
    <span aria-hidden className="evidence-receipt-leader" />
    <span className="evidence-receipt-tag" data-status={check.status}>
      {CHECK_TAG[check.status]}
    </span>
  </div>
);

/** `label   value` — a fact copied from the document. */
const FactRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-2 text-[11px] leading-5">
    <span style={{ color: "var(--receipt-muted)" }}>{label}</span>
    <span className="min-w-0 break-all">{value}</span>
  </div>
);

export const ReceiptView = ({
  report,
  envelopeFileName,
  subjectFileName,
  actions = true,
  className,
}: ReceiptViewProps) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [theme, setTheme] = React.useState<ReceiptTheme>("auto");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const summary = report.summary;
  const command = buildVerifyCommand(
    summary?.inputs ?? { subjectBytes: false, online: false },
    envelopeFileName ?? "evidence.json",
    subjectFileName ?? undefined,
  );
  const bars = digestBars(summary?.envelopeDigest ?? summary?.subject.sha256);

  const download = async () => {
    const node = ref.current;
    if (!node) return;
    setBusy(true);
    setError(null);
    try {
      // Dynamic import: the rasterizer is only needed on click.
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = receiptFileName(report);
      link.click();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not render the PNG (${err.message}). Use Print, or take a screenshot.`
          : "Could not render the PNG. Use Print, or take a screenshot.",
      );
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    const node = ref.current;
    if (!node) return;
    document.body.setAttribute("data-print-receipt", "");
    node.setAttribute("data-print-target", "");
    const cleanup = () => {
      document.body.removeAttribute("data-print-receipt");
      node.removeAttribute("data-print-target");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // Browsers that never fire afterprint (or a cancelled dialog) still
    // need the page restored.
    window.setTimeout(cleanup, 1000);
  };

  const checksFor = (groups: CheckResult["group"][]) =>
    report.checks.filter((c) => groups.includes(c.group));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={ref}
        data-receipt-theme={theme === "auto" ? undefined : theme}
        className="evidence-receipt relative w-full rounded-md border px-5 py-5 shadow-elev-1"
        style={{ borderColor: "var(--receipt-rule)" }}
        role="status"
        aria-label={`Verification receipt: ${STAMP_LABEL[report.status]}`}
      >
        {/* Header + stamp ------------------------------------------------ */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.32em]">FILEONCHAIN</p>
            <p className="mt-1 text-sm font-semibold tracking-[0.12em]">EVIDENCE RECEIPT</p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--receipt-muted)" }}>
              {summary
                ? summary.format === "envelope"
                  ? `evidence envelope · ${report.checks.length} checks`
                  : `legacy-evidence-v1 package · ${report.checks.length} checks`
                : `${report.checks.length} ${report.checks.length === 1 ? "check" : "checks"}`}
            </p>
          </div>
          <span className="evidence-receipt-stamp mt-1 text-xs" data-status={report.status}>
            {STAMP_LABEL[report.status]}
          </span>
        </div>

        {/* Subject -------------------------------------------------------- */}
        {summary && (
          <>
            <Rule />
            <SectionTitle>Subject</SectionTitle>
            <div className="mt-1.5 space-y-0.5">
              {summary.subject.name && <FactRow label="name" value={summary.subject.name} />}
              <FactRow label="type" value={summary.subject.type} />
              {summary.subject.sha256 && <FactRow label="sha256" value={summary.subject.sha256} />}
              {summary.subject.cid && <FactRow label="cid" value={summary.subject.cid} />}
              {summary.subject.uri && <FactRow label="uri" value={summary.subject.uri} />}
              {summary.subject.size !== undefined && (
                <FactRow label="size" value={`${summary.subject.size} bytes`} />
              )}
              {summary.subject.mediaType && (
                <FactRow label="media type" value={summary.subject.mediaType} />
              )}
              {summary.createdAt && (
                <FactRow label="created" value={`${summary.createdAt} (claimed)`} />
              )}
            </div>
          </>
        )}

        {/* Checks, section by section ------------------------------------ */}
        {RECEIPT_SECTIONS.map((section) => {
          const checks = checksFor(section.groups);
          const lines = section.receipts ? summary?.receipts ?? [] : [];
          if (checks.length === 0 && lines.length === 0) return null;
          return (
            <React.Fragment key={section.title}>
              <Rule />
              <SectionTitle>{section.title}</SectionTitle>
              {section.receipts && lines.length > 0 ? (
                <div className="mt-1.5 space-y-3">
                  {lines.map((line) => {
                    const lineChecks = checksForReceiptLine(report, line);
                    return (
                      <div key={line.name}>
                        <div className="flex items-baseline justify-between gap-2 text-[11px] leading-5">
                          <span className="font-semibold uppercase tracking-[0.12em]">
                            {line.type}
                          </span>
                          <span className="min-w-0 break-all text-right">
                            {line.adapter}
                            {!line.adapterKnown && (
                              <>
                                {" "}
                                <span className="evidence-receipt-tag" data-status="unknown">
                                  UNKNOWN
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="mt-0.5 space-y-0.5">
                          {line.system && (
                            <FactRow
                              label="system"
                              value={
                                settlementSystemName(line.system) === line.system
                                  ? line.system
                                  : `${line.system} · ${settlementSystemName(line.system)}`
                              }
                            />
                          )}
                          {line.txHash && <FactRow label="tx" value={line.txHash} />}
                          {line.blockNumber !== undefined && (
                            <FactRow label="block" value={String(line.blockNumber)} />
                          )}
                          {line.timestamp && <FactRow label="time" value={line.timestamp} />}
                          {line.uri && <FactRow label="uri" value={line.uri} />}
                          {line.root && <FactRow label="root" value={line.root} />}
                          {lineChecks.map((check) => (
                            <CheckRow
                              key={check.name}
                              label={receiptCheckPhase(line, check)}
                              check={check}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-1.5 space-y-0.5">
                  {checks.map((check, i) => (
                    <CheckRow key={`${check.name}-${i}`} label={check.name} check={check} />
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Footer --------------------------------------------------------- */}
        <Rule />
        {summary && (
          <div className="space-y-0.5">
            {footerLines(summary).map((line) => (
              <FactRow key={line.label} label={line.label} value={line.value} />
            ))}
          </div>
        )}
        {bars.length > 0 && (
          <div aria-hidden className="mt-3 flex h-7 items-stretch gap-[2px]">
            {bars.map((width, i) => (
              <span key={i} className="evidence-receipt-bar" style={{ width: `${width}px` }} />
            ))}
          </div>
        )}
        <p
          className="mt-3 break-all rounded-sm border border-dashed px-2 py-1.5 text-[11px]"
          style={{ borderColor: "var(--receipt-rule)" }}
        >
          <span style={{ color: "var(--receipt-muted)" }}>$ </span>
          {command}
        </p>
        <p className="mt-2 text-[10px] leading-4" style={{ color: "var(--receipt-muted)" }}>
          Locally verified evidence: existence, integrity, signing keys, timing. Signed claims
          are the signer&apos;s assertions.
        </p>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void download()} isLoading={busy}>
            Download PNG
          </Button>
          <Button size="sm" variant="secondary" onClick={print}>
            Print
          </Button>
          <div
            role="group"
            aria-label="Receipt theme"
            className="ml-auto flex overflow-hidden rounded-md border border-border text-[11px]"
          >
            {(["auto", "light", "dark"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={theme === option}
                onClick={() => setTheme(option)}
                className={cn(
                  "px-2.5 py-1 capitalize transition-colors duration-base",
                  theme === option
                    ? "bg-surface-elevated text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {error && <p className="basis-full text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default ReceiptView;
