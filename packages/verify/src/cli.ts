#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import {
  isLegacyEvidencePackage,
  migrateLegacyEvidence,
} from "@fileonchain/protocol";
import { verifyEvidenceJson } from "./index";
import type { CheckResult } from "./report";

/**
 * fileonchain — the reference CLI.
 *
 *   fileonchain verify <evidence.json> [--artifact <file>] [--online] [--json]
 *   fileonchain migrate <legacy.json> [--output <file>]
 *
 * `verify` is deterministic and local; `--online` talks only to public
 * endpoints of the receipt systems. Neither command ever calls a
 * FileOnChain service. (The `fileonchain-verify` bin is an alias that
 * defaults to `verify`.)
 */

const usage = (): never => {
  console.error(
    [
      "usage:",
      "  fileonchain verify <evidence.json> [--artifact <file>] [--online] [--json]",
      "  fileonchain migrate <legacy.json> [--output <file>]",
    ].join("\n"),
  );
  process.exit(2);
};

const ICONS: Record<CheckResult["status"], string> = {
  pass: "✓",
  fail: "✗",
  warning: "!",
  skipped: "-",
  unknown: "?",
};

const runVerify = async (args: string[]): Promise<void> => {
  let evidencePath: string | undefined;
  let artifactPath: string | undefined;
  let online = false;
  let json = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--artifact") {
      artifactPath = args[++i];
      if (!artifactPath) usage();
    } else if (args[i] === "--online") {
      online = true;
    } else if (args[i] === "--json") {
      json = true;
    } else if (!evidencePath) {
      evidencePath = args[i];
    } else {
      usage();
    }
  }
  if (!evidencePath) usage();

  const raw = readFileSync(evidencePath as string, "utf8");
  const subjectBytes = artifactPath ? new Uint8Array(readFileSync(artifactPath)) : undefined;
  const report = await verifyEvidenceJson(raw, {
    subjectBytes,
    checkReceiptsOnline: online,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    let lastGroup = "";
    for (const check of report.checks) {
      if (check.group !== lastGroup) {
        console.log(`\n[${check.group}]`);
        lastGroup = check.group;
      }
      console.log(
        `  ${ICONS[check.status]} ${check.name.padEnd(34)} ${check.status.padEnd(8)} ${check.detail}`,
      );
    }
    console.log(`\nresult: ${report.status.toUpperCase()}`);
  }
  if (report.status === "invalid") process.exit(1);
};

const runMigrate = (args: string[]): void => {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--output" || args[i] === "-o") {
      outputPath = args[++i];
      if (!outputPath) usage();
    } else if (!inputPath) {
      inputPath = args[i];
    } else {
      usage();
    }
  }
  if (!inputPath) usage();

  const parsed = JSON.parse(readFileSync(inputPath as string, "utf8")) as unknown;
  if (!isLegacyEvidencePackage(parsed)) {
    console.error("input is not a legacy-evidence-v1 package");
    process.exit(1);
  }
  const envelope = migrateLegacyEvidence(parsed, {
    migratedAt: new Date().toISOString(),
  });
  const serialized = JSON.stringify(envelope, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, serialized);
    console.log(`migrated envelope written to ${outputPath}`);
    console.log(
      "note: original signatures are preserved as legacy records only — they signed the old payload shape and are not valid protocol artifact signatures.",
    );
  } else {
    console.log(serialized);
  }
};

const main = async (): Promise<void> => {
  const [first, ...rest] = process.argv.slice(2);
  if (!first || first === "--help" || first === "-h") usage();
  if (first === "verify") return runVerify(rest);
  if (first === "migrate") {
    runMigrate(rest);
    return;
  }
  // Bare invocation (fileonchain-verify compatibility): treat argv as verify args.
  return runVerify([first, ...rest]);
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
