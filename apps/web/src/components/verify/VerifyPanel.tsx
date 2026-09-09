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
import { ShareEvidence } from "@/components/verify/ShareEvidence";
import {
  SAMPLE_SUBJECT_CONTENT,
  SAMPLE_SUBJECT_NAME,
  VERIFY_SAMPLES,
  decodeEnvelopeParam,
  parseRemoteEnvelopeUrl,
  sampleUrl,
  type VerifySample,
} from "@/lib/verify/samples";

/**
 * VerifyPanel — the interactive half of /verify. Collects an envelope
 * (pasted JSON, a .json file, a bundled sample, or a link), optional
 * subject bytes, and an online toggle, then dynamic-imports
 * `@fileonchain/verify` (it pulls in viem — keep it out of the initial
 * bundle) and renders the grouped report.
 *
 * Three ways in besides paste/drop, all of them the same code path as a
 * pasted envelope (no special-cased happy path):
 *  - "Try a sample" loads a protocol conformance fixture from
 *    `public/samples/` together with its original subject bytes.
 *  - `/verify?url=<https://…>` fetches a remote envelope on arrival —
 *    browser → that origin only; nothing goes to FileOnChain.
 *  - `/verify?envelope=<base64url>` carries a small envelope inline.
 *
 * The overall chip wording + the six grouped sections live in
 * `./reportView.tsx` so the hosted `/cloud/verify/[envelopeId]` page can
 * share them — `/verify` and the hosted page must produce the same shape.
 * The share controls under the chip (report link, status badge, badge
 * Markdown) live in `./ShareEvidence.tsx`.
 */

/** Where the current envelope came from — shown above the textarea. */
type EnvelopeSource =
  | { kind: "sample"; sample: VerifySample }
  | { kind: "url"; url: string }
  | { kind: "link" };

const VerifyPanel = () => {
  const [json, setJson] = React.useState("");
  const [envelopeFileName, setEnvelopeFileName] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<EnvelopeSource | null>(null);
  const [subjectBytes, setSubjectBytes] = React.useState<Uint8Array | null>(null);
  const [subjectFileName, setSubjectFileName] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [loadingSample, setLoadingSample] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<VerificationReport | null>(null);

  const onEnvelopeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnvelopeFileName(file.name);
    setSource(null);
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

  /**
   * The one verification path. Takes its inputs explicitly (not from
   * state) so a sample or link can load and verify in the same tick.
   */
  const verify = React.useCallback(
    async (input: string, bytes: Uint8Array | null, checkOnline: boolean) => {
      if (!input.trim()) {
        setError("Paste an evidence envelope, choose a .json file, or try a sample first.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        // Dynamic import — the verifier pulls in viem for EIP-191 checks.
        const { verifyEvidenceJson } = await import("@fileonchain/verify");
        const result = await verifyEvidenceJson(input, {
          ...(bytes ? { subjectBytes: bytes } : {}),
          checkReceiptsOnline: checkOnline,
        });
        setReport(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed unexpectedly.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const runVerify = () => verify(json, subjectBytes, online);

  const loadSample = async (sample: VerifySample) => {
    setLoadingSample(sample.id);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(sampleUrl(sample));
      if (!res.ok) throw new Error(`Sample not available (HTTP ${res.status}).`);
      const text = await res.text();
      const bytes = new TextEncoder().encode(SAMPLE_SUBJECT_CONTENT);
      setJson(text);
      setEnvelopeFileName(null);
      setSource({ kind: "sample", sample });
      setSubjectBytes(bytes);
      setSubjectFileName(`${SAMPLE_SUBJECT_NAME} (sample bytes)`);
      await verify(text, bytes, online);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the sample.");
    } finally {
      setLoadingSample(null);
    }
  };

  // `?url=` / `?envelope=` — load once on arrival. Read from
  // `window.location` rather than `useSearchParams` so the static
  // prerender keeps the whole panel in the HTML (useSearchParams would
  // bail the client component out to a Suspense fallback). Guarded by a
  // ref so React strict-mode double effects don't fetch twice.
  const loadedFromParams = React.useRef(false);
  React.useEffect(() => {
    if (loadedFromParams.current) return;
    const params = new URLSearchParams(window.location.search);
    const envelopeParam = params.get("envelope");
    const urlParam = params.get("url");
    if (!envelopeParam && !urlParam) return;
    loadedFromParams.current = true;

    let cancelled = false;
    const run = async () => {
      setError(null);
      setReport(null);
      if (envelopeParam) {
        let text: string;
        try {
          text = decodeEnvelopeParam(envelopeParam);
        } catch {
          setError("The envelope in this link could not be decoded — expected base64url JSON.");
          return;
        }
        if (cancelled) return;
        setJson(text);
        setSource({ kind: "link" });
        await verify(text, null, false);
        return;
      }

      const remote = parseRemoteEnvelopeUrl(urlParam ?? "");
      if (!remote) {
        setError("The url parameter must be an http(s) address of an envelope JSON file.");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(remote.href, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        setJson(text);
        setSource({ kind: "url", url: remote.href });
        await verify(text, null, false);
      } catch (err) {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : String(err);
        setError(
          `Could not fetch ${remote.href} (${reason}). Your browser fetched it directly — the origin must be reachable and allow cross-origin reads (CORS).`,
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [verify]);

  const checksFor = (groups: CheckGroup[]): CheckResult[] =>
    report ? report.checks.filter((c) => groups.includes(c.group)) : [];

  const activeSample = source?.kind === "sample" ? source.sample : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Input column -------------------------------------------------- */}
      <Card className="p-5">
        {/* Samples ----------------------------------------------------- */}
        <div>
          <p className="text-sm font-medium text-foreground">Try a sample</p>
          <p className="mt-0.5 text-xs text-muted">
            Protocol conformance fixtures, verified by the same code as anything you paste.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {VERIFY_SAMPLES.map((sample) => {
              const active = activeSample?.id === sample.id;
              return (
                <Button
                  key={sample.id}
                  size="sm"
                  variant={active ? "outline" : "secondary"}
                  onClick={() => loadSample(sample)}
                  isLoading={loadingSample === sample.id}
                  disabled={busy || loadingSample !== null}
                  aria-pressed={active}
                >
                  {sample.label}
                </Button>
              );
            })}
          </div>
          {activeSample && (
            <p className="mt-2 text-xs text-muted">
              <span className="font-medium text-foreground">Expect: {OVERALL[activeSample.expects].label}.</span>{" "}
              {activeSample.caption}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <label htmlFor="verify-json" className="text-sm font-medium text-foreground">
            Evidence envelope (JSON)
          </label>
          {source?.kind === "url" && (
            <span className="truncate font-mono text-[11px] text-muted" title={source.url}>
              from {source.url}
            </span>
          )}
          {source?.kind === "link" && (
            <span className="font-mono text-[11px] text-muted">from this link</span>
          )}
          {source?.kind === "sample" && (
            <span className="font-mono text-[11px] text-muted">{source.sample.file}</span>
          )}
        </div>
        <textarea
          id="verify-json"
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setEnvelopeFileName(null);
            setSource(null);
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
            className="mt-0.5 h-4 w-4 rounded border-border accent-(--color-primary,#5e8bff)"
          />
          <span>
            Confirm receipts online (public RPCs) — otherwise settlement receipts are checked
            structurally and reported as unconfirmed.
          </span>
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={runVerify} isLoading={busy} disabled={busy || loadingSample !== null}>
            Verify
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Nothing is uploaded to FileOnChain. A link carries the envelope itself
          (<code className="font-mono">?envelope=</code>) or points at a URL your browser fetches
          directly (<code className="font-mono">?url=</code>). Share controls appear under the
          report.
        </p>
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

        {report && (
          <ShareEvidence
            json={json}
            sourceUrl={source?.kind === "url" ? source.url : null}
            status={report.status}
          />
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
