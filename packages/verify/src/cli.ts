#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { verifyEvidenceJson, type CheckResult } from "./index";

/**
 * fileonchain-verify — deterministic local verification of an evidence
 * package. Never calls a FileOnChain service; `--online` talks only to
 * public RPC endpoints of the settlement chains.
 *
 *   fileonchain-verify evidence.json [--artifact <file>] [--online]
 */

const usage = (): never => {
  console.error("usage: fileonchain-verify <evidence.json> [--artifact <file>] [--online]");
  process.exit(2);
};

const ICONS: Record<CheckResult["status"], string> = {
  pass: "✓",
  fail: "✗",
  skipped: "-",
  unknown: "?",
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) usage();

  let evidencePath: string | undefined;
  let artifactPath: string | undefined;
  let online = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--artifact") {
      artifactPath = args[++i];
      if (!artifactPath) usage();
    } else if (args[i] === "--online") {
      online = true;
    } else if (!evidencePath) {
      evidencePath = args[i];
    } else {
      usage();
    }
  }
  if (!evidencePath) usage();

  const raw = readFileSync(evidencePath as string, "utf8");
  const artifactBytes = artifactPath ? new Uint8Array(readFileSync(artifactPath)) : undefined;

  const report = await verifyEvidenceJson(raw, {
    artifactBytes,
    checkSettlements: online,
  });

  for (const check of report.checks) {
    console.log(`${ICONS[check.status]} ${check.name.padEnd(28)} ${check.status.padEnd(8)} ${check.detail}`);
  }
  console.log(report.ok ? "\nOK — no check failed." : "\nFAILED — at least one check failed.");
  if (!report.ok) process.exit(1);
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
